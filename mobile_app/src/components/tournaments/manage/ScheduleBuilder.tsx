import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useScheduleMutations } from '@/hooks/useTournamentMutations';
import { useTournamentSchedule, useTournamentTeams } from '@/hooks/useTournamentViews';
import { scheduleConflicts, tournamentErrorKey, tournamentErrorParams } from '@/utils/tournamentErrors';
import type { ScheduleConflict, SchedulePreviewResponse, TournamentDetail, TournamentMatch, TournamentTeam } from '@/types/tournament';
import { UpdatedCue } from '../UpdatedCue';
import ScoreEntrySheet from '../ScoreEntrySheet';
import ConflictsPanel from './ConflictsPanel';
import MatchEditSheet, { type MatchEditPayload } from './MatchEditSheet';
import ScheduleParamsForm, { paramsValid, type ScheduleParams } from './ScheduleParamsForm';
import SchedulePreviewList, { type ScheduleRow } from './SchedulePreviewList';
import { describeConflict, padTime, type ConflictView } from './manageUtils';

interface Props {
    tournament: TournamentDetail;
    /** Link target for "go build the schedule" etc. is the parent's job; this only reports saved. */
    onScheduleSaved?: () => void;
}

type Step = 'params' | 'preview';

const defaultParams = (t: TournamentDetail): ScheduleParams => ({
    days: [{ date: '', from: '18:00', to: '22:00' }],
    namedCourts: false,
    courtCount: 2,
    courtNames: ['', ''],
    matchMinutes: t.rules?.matchMinutes ?? 40,
    breakMinutes: t.rules?.breakMinutes ?? 10,
    minRestMinutes: t.rules?.minRestMinutes ?? 0,
    stepMinutes: 5,
    seed: Math.floor(Math.random() * 1_000_000),
});

const toGenerateInput = (p: ScheduleParams) => ({
    seed: p.seed,
    schedule: {
        days: p.days.map((d) => ({ date: d.date, from: padTime(d.from), to: padTime(d.to) })),
        courts: p.namedCourts ? p.courtNames.map((n) => n.trim()).filter(Boolean) : p.courtCount,
        matchMinutes: p.matchMinutes,
        breakMinutes: p.breakMinutes,
        minRestMinutes: p.minRestMinutes,
        stepMinutes: p.stepMinutes,
    },
});

/**
 * Schedule builder container (spec 11.2, phone flow): parameters -> PREVIEW (nothing saved) -> confirm,
 * then the committed schedule with tap-to-edit / add / delete of single matches. Presentational parts
 * live next to this file; this one owns the hooks, steps and error mapping.
 */
export default function ScheduleBuilder({ tournament, onScheduleSaved }: Props) {
    const { t } = useTranslation();
    const sched = useTournamentSchedule(tournament.id);
    const teamsQ = useTournamentTeams(tournament.id, 'APPROVED');
    const mut = useScheduleMutations(tournament.id);
    const hasSchedule = sched.matches.length > 0;
    // Commit needs registration closed; a preview only reads approved teams, so it also works while open.
    const canBuild = tournament.status === 'REGISTRATION_CLOSED' || tournament.status === 'IN_PROGRESS';
    const canPreview = canBuild || tournament.status === 'REGISTRATION_OPEN';
    const scoring = tournament.status === 'IN_PROGRESS' && tournament.capabilities.canScore;
    const [scoreMatch, setScoreMatch] = useState<TournamentMatch | null>(null);

    const [rebuilding, setRebuilding] = useState(false);
    const [step, setStep] = useState<Step>('params');
    const [params, setParams] = useState<ScheduleParams>(() => defaultParams(tournament));
    const [showErrors, setShowErrors] = useState(false);
    const [preview, setPreview] = useState<SchedulePreviewResponse | null>(null);
    const [errorText, setErrorText] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [highlight, setHighlight] = useState<number | null>(null);
    const [editing, setEditing] = useState<TournamentMatch | null>(null);
    const [adding, setAdding] = useState(false);
    const [editConflicts, setEditConflicts] = useState<ScheduleConflict[]>([]);
    const [editError, setEditError] = useState<string | null>(null);
    const scrollRef = useRef<ScrollView>(null);
    const listY = useRef(0);
    const rowY = useRef<Record<number, number>>({});

    const teamById = useMemo(() => {
        const m = new Map<string, TournamentTeam>();
        teamsQ.teams.forEach((x) => m.set(x.id, x));
        return m;
    }, [teamsQ.teams]);
    const refOf = (id: string | null) => {
        const tm = id ? teamById.get(id) : undefined;
        return tm ? { id: tm.id, name: tm.name, color: tm.color, logoUrl: tm.logoUrl } : null;
    };
    const groupNames = useMemo(() => {
        const out: Record<string, string> = {};
        sched.stages.forEach((s) => s.groups.forEach((g) => (out[g.id] = g.name)));
        return out;
    }, [sched.stages]);

    const mapError = (err: any): string => {
        if (!err?.code && !err?.status) return t('resultEditor.offline') as string;
        const key = tournamentErrorKey(err);
        return key ? (t(key, tournamentErrorParams(err)) as string) : (t('tournaments.manage.sched.failed') as string);
    };

    const courtLabel = (c: string) => (/^\d+$/.test(c) ? (t('tournaments.manage.sched.court', { n: c }) as string) : c);
    const toViews = (list: ScheduleConflict[], numberOf: (id: string) => number | undefined): ConflictView[] =>
        list.map((c) => describeConflict(c, numberOf, teamsQ.teams, params.minRestMinutes, courtLabel));

    // ---- preview step
    const previewNumber = useMemo(() => {
        const m: Record<string, number> = {};
        preview?.matches.forEach((x) => (m[x.key] = x.number));
        return m;
    }, [preview]);
    const previewViews = useMemo(
        () => (preview ? toViews(preview.conflicts, (id) => previewNumber[id]) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [preview, previewNumber, teamsQ.teams]
    );
    const conflicted = useMemo(() => {
        const s = new Set<string>();
        preview?.conflicts.forEach((c) => (Array.isArray(c.matchIds) ? (c.matchIds as unknown[]).forEach((id) => s.add(String(id))) : null));
        return s;
    }, [preview]);
    const previewRows: ScheduleRow[] = useMemo(
        () =>
            (preview?.matches ?? []).map((m) => ({
                key: m.key,
                number: m.number,
                home: { team: refOf(m.home.teamId), source: m.home.source },
                away: { team: refOf(m.away.teamId), source: m.away.source },
                scheduledAt: m.scheduledAt,
                courtLabel: m.courtLabel,
                hasConflict: conflicted.has(m.key),
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [preview, conflicted, teamById]
    );
    const previewNumberById = useMemo(() => {
        // WINNER_OF / LOSER_OF reference preview keys in a preview payload.
        return previewNumber;
    }, [previewNumber]);

    const runPreview = async () => {
        if (!paramsValid(params)) {
            setShowErrors(true);
            return;
        }
        setErrorText(null);
        try {
            const res = (await mut.preview(toGenerateInput(params))) as SchedulePreviewResponse;
            setPreview(res);
            setStep('preview');
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        } catch (err) {
            setErrorText(mapError(err));
        }
    };

    const commit = async () => {
        if (!preview || !canBuild) return;
        const withConflicts = preview.conflicts.length > 0;
        const go = async () => {
            setErrorText(null);
            try {
                await mut.generate({ ...toGenerateInput(params), allowConflicts: withConflicts });
                setSavedMsg(t('tournaments.manage.sched.saved') as string);
                setRebuilding(false);
                setStep('params');
                setPreview(null);
                void sched.refetch();
                onScheduleSaved?.();
            } catch (err: any) {
                const c = scheduleConflicts(err);
                setErrorText(c.length ? (t('tournaments.manage.sched.conflictsChanged') as string) : mapError(err));
            }
        };
        const replace = hasSchedule ? (t('tournaments.manage.sched.replaceConfirm') as string) : '';
        const msg = withConflicts ? [t('tournaments.manage.sched.commitConflictsConfirm', { count: preview.conflicts.length }), replace].filter(Boolean).join('\n\n') : replace;
        if (!msg) return go();
        Alert.alert(t(withConflicts ? 'tournaments.manage.sched.commitWithConflicts' : 'tournaments.manage.sched.commit') as string, msg, [
            { text: t('common.cancel') as string, style: 'cancel' },
            { text: t('common.confirm') as string, onPress: go },
        ]);
    };

    // ---- committed schedule
    const committedRows: ScheduleRow[] = useMemo(
        () =>
            sched.matches.map((m) => ({
                key: m.id,
                number: m.number,
                home: m.home,
                away: m.away,
                scheduledAt: m.scheduledAt,
                courtLabel: m.courtLabel,
                status: m.status,
            })),
        [sched.matches]
    );
    const knownCourts = useMemo(() => [...new Set(sched.matches.map((m) => m.courtLabel).filter((c): c is string => !!c))], [sched.matches]);
    const closeEdit = () => {
        setEditing(null);
        setAdding(false);
        setEditConflicts([]);
        setEditError(null);
    };
    const submitEdit = async (payload: MatchEditPayload) => {
        setEditError(null);
        try {
            const res = payload.create ? await mut.createMatch(payload.create) : await mut.updateMatch((editing as TournamentMatch).id, payload.update!);
            if (res.conflicts?.length && !(payload.create?.force || payload.update?.force)) {
                // Saved with warnings: surface them instead of closing silently.
                setEditConflicts(res.conflicts);
                void sched.refetch();
                return;
            }
            closeEdit();
            void sched.refetch();
        } catch (err: any) {
            const c = scheduleConflicts(err);
            if (c.length) setEditConflicts(c);
            else setEditError(mapError(err));
        }
    };
    const deleteEdit = () => {
        if (!editing) return;
        Alert.alert(t('tournaments.manage.sched.deleteMatch') as string, `#${editing.number}`, [
            { text: t('common.cancel') as string, style: 'cancel' },
            {
                text: t('common.delete') as string,
                style: 'destructive',
                onPress: async () => {
                    try {
                        await mut.deleteMatch(editing.id);
                        closeEdit();
                        void sched.refetch();
                    } catch (err) {
                        setEditError(mapError(err));
                    }
                },
            },
        ]);
    };

    const scrollToNumber = (n: number) => {
        setHighlight(n);
        const y = rowY.current[n];
        if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, listY.current + y - 80), animated: true });
    };

    if (sched.loading && !sched.stages.length && !hasSchedule) {
        return (
            <View className="py-16 items-center" testID="manage-section-schedule-loading">
                <ActivityIndicator color="#059669" />
            </View>
        );
    }

    const showBuilder = !hasSchedule || rebuilding;
    const busy = mut.pending;

    return (
        <View className="flex-1" testID="manage-section-schedule">
            <UpdatedCue visible={sched.updated} />
            <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                {savedMsg ? (
                    <View accessibilityLiveRegion="polite" className="rounded-xl bg-brand-mist dark:bg-brand-ink p-3 mb-3">
                        <Text className="font-semibold text-brand-dark dark:text-brand-light">{savedMsg}</Text>
                    </View>
                ) : null}
                {errorText ? (
                    <View accessibilityRole="alert" testID="schedule-error" className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 mb-3">
                        <Text className="text-red-700 dark:text-red-300">{errorText}</Text>
                    </View>
                ) : null}

                {!canPreview && !hasSchedule ? (
                    <View className="py-12 items-center px-4" testID="schedule-needs-closed">
                        <Ionicons name="calendar-outline" size={36} color="#9ca3af" />
                        <Text className="mt-3 text-center text-gray-600 dark:text-cyber-muted">{t('tournaments.manage.sched.needClosed')}</Text>
                    </View>
                ) : showBuilder && step === 'params' ? (
                    <>
                        {rebuilding ? (
                            <Pressable onPress={() => setRebuilding(false)} accessibilityRole="button" style={{ minHeight: 44 }} className="mb-2 justify-center">
                                <Text className="font-bold text-brand-dark dark:text-brand-light">{t('common.cancel')}</Text>
                            </Pressable>
                        ) : null}
                        <ScheduleParamsForm value={params} onChange={setParams} onPreview={runPreview} busy={busy} showErrors={showErrors} />
                    </>
                ) : showBuilder && preview ? (
                    <View testID="schedule-preview-step">
                        <View testID="schedule-preview-summary" className="flex-row flex-wrap items-center mb-3" style={{ gap: 8 }}>
                            <Text className="text-gray-800 dark:text-cyber-text font-semibold">
                                {t('tournaments.manage.sched.summary', {
                                    matches: preview.matches.length,
                                    days: params.days.length,
                                    courts: params.namedCourts ? params.courtNames.filter((n) => n.trim()).length : params.courtCount,
                                    conflicts: preview.conflicts.length,
                                })}
                            </Text>
                            {preview.conflicts.length === 0 ? (
                                <View className="px-2.5 py-1 rounded-full bg-brand-mist dark:bg-brand-ink">
                                    <Text className="text-xs font-bold text-brand-dark dark:text-brand-light">✓ {t('tournaments.manage.sched.noConflicts')}</Text>
                                </View>
                            ) : null}
                        </View>
                        {!canBuild ? (
                            <View testID="schedule-preview-only" className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 mb-3">
                                <Text className="text-amber-800 dark:text-amber-200">{t('tournaments.manage.sched.previewOnly')}</Text>
                            </View>
                        ) : null}
                        <ConflictsPanel items={previewViews} onPickNumber={scrollToNumber} />
                        <View onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
                            <SchedulePreviewList
                                rows={previewRows}
                                numberById={previewNumberById}
                                groupNames={groupNames}
                                highlightNumber={highlight}
                                onRowLayout={(n, y) => (rowY.current[n] = y)}
                            />
                        </View>
                    </View>
                ) : (
                    <View>
                        <View className="flex-row mb-3" style={{ gap: 8 }}>
                            <Pressable
                                testID="match-add"
                                onPress={() => setAdding(true)}
                                accessibilityRole="button"
                                style={{ minHeight: 44 }}
                                className="flex-1 flex-row items-center justify-center rounded-xl bg-brand"
                            >
                                <Ionicons name="add" size={20} color="#fff" />
                                <Text className="ms-1 font-bold text-white">{t('tournaments.manage.sched.addMatch')}</Text>
                            </Pressable>
                            {canBuild ? (
                                <Pressable
                                    testID="schedule-rebuild"
                                    onPress={() => {
                                        setRebuilding(true);
                                        setStep('params');
                                        setSavedMsg(null);
                                    }}
                                    accessibilityRole="button"
                                    style={{ minHeight: 44 }}
                                    className="flex-1 flex-row items-center justify-center rounded-xl border border-gray-300 dark:border-cyber-border"
                                >
                                    <Ionicons name="refresh" size={18} color="#6b7280" />
                                    <Text className="ms-1 font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.manage.sched.rebuild')}</Text>
                                </Pressable>
                            ) : null}
                        </View>
                        <SchedulePreviewList
                            rows={committedRows}
                            numberById={sched.numberById}
                            groupNames={groupNames}
                            onPressRow={(r) => setEditing(sched.matches.find((m) => m.id === r.key) ?? null)}
                            onScoreRow={scoring ? (r) => setScoreMatch(sched.matches.find((m) => m.id === r.key) ?? null) : undefined}
                        />
                    </View>
                )}
            </ScrollView>

            {showBuilder && step === 'preview' && preview ? (
                <View className="px-4 pt-2 pb-3 border-t border-gray-200 dark:border-cyber-border bg-gray-50 dark:bg-cyber-bg flex-row" style={{ gap: 8 }}>
                    <Pressable
                        onPress={() => setStep('params')}
                        disabled={busy}
                        accessibilityRole="button"
                        style={{ height: 52 }}
                        className="flex-1 rounded-2xl border border-gray-300 dark:border-cyber-border items-center justify-center"
                    >
                        <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.manage.sched.backToEdit')}</Text>
                    </Pressable>
                    <Pressable
                        testID="schedule-commit"
                        onPress={commit}
                        disabled={busy || !canBuild}
                        accessibilityRole="button"
                        accessibilityState={{ busy }}
                        style={{ height: 52, opacity: busy || !canBuild ? 0.6 : 1 }}
                        className={`flex-[2] rounded-2xl items-center justify-center flex-row ${preview.conflicts.length ? 'bg-amber-600' : 'bg-brand'}`}
                    >
                        {busy ? <ActivityIndicator color="#fff" /> : null}
                        <Text className="font-extrabold text-white">
                            {t(preview.conflicts.length ? 'tournaments.manage.sched.commitWithConflicts' : 'tournaments.manage.sched.commit')}
                        </Text>
                    </Pressable>
                </View>
            ) : null}

            {scoring ? (
                <ScoreEntrySheet
                    open={!!scoreMatch}
                    tournament={tournament}
                    match={scoreMatch}
                    onClose={() => setScoreMatch(null)}
                    onSaved={() => {
                        setScoreMatch(null);
                        void sched.refetch();
                    }}
                />
            ) : null}
            <MatchEditSheet
                open={!!editing || adding}
                match={editing}
                stages={sched.stages}
                teams={teamsQ.teams}
                knownCourts={knownCourts}
                conflicts={toViews(editConflicts, (id) => sched.numberById[id])}
                errorText={editError}
                busy={busy}
                onClose={closeEdit}
                onSubmit={(p) => submitEdit(p)}
                onDelete={deleteEdit}
            />
        </View>
    );
}

