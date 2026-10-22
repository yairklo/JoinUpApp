import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { tabular } from '@/components/results/resultUtils';
import type { CreateMatchInput, ScheduleStage, TournamentMatch, TournamentTeam, UpdateMatchInput } from '@/types/tournament';
import { isDateStr, isTimeStr, israelHm, israelDateKey, israelToIso, padTime, type ConflictView } from './manageUtils';
import ConflictsPanel from './ConflictsPanel';

type EditableStatus = 'SCHEDULED' | 'POSTPONED' | 'CANCELLED';

export interface MatchEditPayload {
    create?: CreateMatchInput;
    update?: UpdateMatchInput;
}

interface Props {
    open: boolean;
    /** null = add mode. */
    match: TournamentMatch | null;
    stages: ScheduleStage[];
    teams: Pick<TournamentTeam, 'id' | 'name'>[];
    knownCourts: string[];
    /** Conflicts returned by the last attempt (shown inline before forcing). */
    conflicts: ConflictView[];
    errorText?: string | null;
    busy?: boolean;
    onClose: () => void;
    /** `force` is true when the user chose "Save anyway" after seeing conflicts. */
    onSubmit: (payload: MatchEditPayload, force: boolean) => void;
    onDelete?: () => void;
}

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
    return (
        <Pressable
            testID={testID}
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{ minHeight: 40 }}
            className={`px-3 rounded-full border items-center justify-center ${selected ? 'bg-brand-mist dark:bg-brand-ink border-brand' : 'border-gray-300 dark:border-cyber-border'}`}
        >
            <Text numberOfLines={1} className={`text-sm font-semibold ${selected ? 'text-brand-dark dark:text-brand-light' : 'text-gray-700 dark:text-cyber-text'}`}>
                {label}
            </Text>
        </Pressable>
    );
}

/** Add / edit one match (spec 11.2 phone edit sheet): teams, Israel date+time, court, status, delete. Props + local form state. */
export default function MatchEditSheet({ open, match, stages, teams, knownCourts, conflicts, errorText, busy, onClose, onSubmit, onDelete }: Props) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const adding = !match;
    const [homeId, setHomeId] = useState<string | null>(null);
    const [awayId, setAwayId] = useState<string | null>(null);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [court, setCourt] = useState('');
    const [status, setStatus] = useState<EditableStatus>('SCHEDULED');
    const [stageId, setStageId] = useState<string | null>(null);
    const [round, setRound] = useState('');
    const [picking, setPicking] = useState<'home' | 'away' | null>(null);
    const [showErrors, setShowErrors] = useState(false);

    useEffect(() => {
        if (!open) return;
        setHomeId(match?.home.teamId ?? null);
        setAwayId(match?.away.teamId ?? null);
        setDate(match?.scheduledAt ? israelDateKey(match.scheduledAt) : '');
        setTime(match?.scheduledAt ? israelHm(match.scheduledAt) : '');
        setCourt(match?.courtLabel ?? '');
        setStatus(match && (match.status === 'POSTPONED' || match.status === 'CANCELLED') ? match.status : 'SCHEDULED');
        setStageId(match?.stageId ?? stages[0]?.id ?? null);
        setRound(match?.round != null ? String(match.round) : '');
        setPicking(null);
        setShowErrors(false);
    }, [open, match, stages]);

    const hasWhen = date !== '' || time !== '';
    const whenValid = !hasWhen || (isDateStr(date) && isTimeStr(time));
    const sameTeam = !!homeId && homeId === awayId;
    const valid = whenValid && !sameTeam;
    const nameOf = (id: string | null) => (id ? teams.find((x) => x.id === id)?.name ?? '' : (t('tournaments.manage.sched.openSlot') as string));

    const submit = (force: boolean) => {
        if (!valid) {
            setShowErrors(true);
            return;
        }
        const scheduledAt = hasWhen ? israelToIso(date, padTime(time)) : null;
        if (adding) {
            const create: CreateMatchInput = {};
            if (stageId) create.stageId = stageId;
            if (round.trim() && Number.isFinite(Number(round))) create.round = Number(round);
            if (homeId) create.homeTeamId = homeId;
            if (awayId) create.awayTeamId = awayId;
            if (scheduledAt) create.scheduledAt = scheduledAt;
            if (court.trim()) create.courtLabel = court.trim();
            if (force) create.force = true;
            onSubmit({ create }, force);
        } else {
            const update: UpdateMatchInput = {
                homeTeamId: homeId,
                awayTeamId: awayId,
                scheduledAt,
                courtLabel: court.trim() || null,
                status,
            };
            if (force) update.force = true;
            onSubmit({ update }, force);
        }
    };

    const picker = (which: 'home' | 'away') => {
        const id = which === 'home' ? homeId : awayId;
        const set = which === 'home' ? setHomeId : setAwayId;
        return (
            <View className="mb-3">
                <Text className="text-xs font-semibold text-gray-500 dark:text-cyber-muted mb-1">
                    {t(which === 'home' ? 'tournaments.manage.sched.homeTeam' : 'tournaments.manage.sched.awayTeam')}
                </Text>
                <Pressable
                    testID={`match-edit-${which}`}
                    onPress={() => setPicking(picking === which ? null : which)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: picking === which }}
                    style={{ minHeight: 48 }}
                    className="rounded-xl border border-gray-300 dark:border-cyber-border bg-white dark:bg-cyber-card px-3 justify-center"
                >
                    <Text className={`font-semibold ${id ? 'text-gray-900 dark:text-cyber-text' : 'text-gray-500 italic dark:text-cyber-muted'}`}>{nameOf(id)}</Text>
                </Pressable>
                {picking === which ? (
                    <View className="mt-1 rounded-xl border border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-card">
                        {[{ id: null as string | null, name: t('tournaments.manage.sched.openSlot') as string }, ...teams].map((tm) => (
                            <Pressable
                                key={tm.id ?? 'open'}
                                onPress={() => {
                                    set(tm.id);
                                    setPicking(null);
                                }}
                                accessibilityRole="menuitem"
                                style={{ minHeight: 44 }}
                                className="px-3 justify-center"
                            >
                                <Text className={`${tm.id === id ? 'font-extrabold' : 'font-medium'} text-gray-900 dark:text-cyber-text`}>{tm.name}</Text>
                            </Pressable>
                        ))}
                    </View>
                ) : null}
            </View>
        );
    };

    const input = 'rounded-xl border border-gray-300 dark:border-cyber-border bg-white dark:bg-cyber-card text-center text-gray-900 dark:text-cyber-text';
    return (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => !busy && onClose()} statusBarTranslucent>
            <View className="flex-1 justify-end bg-black/40">
                <Pressable className="flex-1" onPress={() => !busy && onClose()} accessibilityLabel={t('common.close') as string} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View testID="match-edit-sheet" className="bg-gray-50 dark:bg-cyber-bg rounded-t-3xl" style={{ maxHeight: '90%', paddingBottom: insets.bottom }}>
                        <View className="items-center pt-2">
                            <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-cyber-border" />
                        </View>
                        <Text className="text-center font-extrabold text-gray-900 dark:text-cyber-text py-2">
                            {adding ? t('tournaments.manage.sched.addMatch') : t('tournaments.match.number', { n: match?.number })}
                        </Text>
                        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
                            {errorText ? (
                                <View accessibilityRole="alert" className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 mb-3">
                                    <Text className="text-red-700 dark:text-red-300">{errorText}</Text>
                                </View>
                            ) : null}
                            {conflicts.length ? <ConflictsPanel items={conflicts} collapsible={false} /> : null}

                            {adding && stages.length > 1 ? (
                                <View className="mb-3">
                                    <Text className="text-xs font-semibold text-gray-500 dark:text-cyber-muted mb-1">{t('tournaments.manage.sched.stage')}</Text>
                                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                                        {stages.map((s) => (
                                            <Chip key={s.id} label={s.name} selected={stageId === s.id} onPress={() => setStageId(s.id)} />
                                        ))}
                                    </View>
                                </View>
                            ) : null}
                            {adding ? (
                                <View className="mb-3">
                                    <Text className="text-xs font-semibold text-gray-500 dark:text-cyber-muted mb-1">{t('tournaments.schedule.round', { n: '' })}</Text>
                                    <TextInput value={round} onChangeText={(v) => setRound(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" className={input} style={[tabular, { height: 48, width: 96 }]} />
                                </View>
                            ) : null}

                            {picker('home')}
                            {picker('away')}
                            {showErrors && sameTeam ? <Text className="text-xs text-red-600 mb-2">{t('tournaments.manage.sched.sameTeam')}</Text> : null}

                            <Text className="text-xs font-semibold text-gray-500 dark:text-cyber-muted mb-1">
                                {t('tournaments.manage.sched.when')} · {t('tournaments.israelTime')}
                            </Text>
                            <View className="flex-row mb-3" style={{ gap: 8 }}>
                                <TextInput
                                    testID="match-edit-date"
                                    value={date}
                                    onChangeText={(v) => setDate(v.trim())}
                                    placeholder="2026-11-05"
                                    keyboardType="numbers-and-punctuation"
                                    className={`${input} ${showErrors && !whenValid ? 'border-red-500' : ''}`}
                                    style={[tabular, { flex: 2, height: 48 }]}
                                />
                                <TextInput
                                    testID="match-edit-time"
                                    value={time}
                                    onChangeText={(v) => setTime(v.trim())}
                                    placeholder="18:30"
                                    keyboardType="numbers-and-punctuation"
                                    className={`${input} ${showErrors && !whenValid ? 'border-red-500' : ''}`}
                                    style={[tabular, { flex: 1, height: 48 }]}
                                />
                            </View>

                            <Text className="text-xs font-semibold text-gray-500 dark:text-cyber-muted mb-1">{t('tournaments.manage.sched.courtLabel')}</Text>
                            <TextInput
                                testID="match-edit-court"
                                value={court}
                                onChangeText={setCourt}
                                className="rounded-xl border border-gray-300 dark:border-cyber-border bg-white dark:bg-cyber-card px-3 text-gray-900 dark:text-cyber-text"
                                style={{ height: 48 }}
                            />
                            {knownCourts.length ? (
                                <View className="flex-row flex-wrap mt-2 mb-3" style={{ gap: 8 }}>
                                    {knownCourts.map((c) => (
                                        <Chip key={c} label={c} selected={court === c} onPress={() => setCourt(c)} />
                                    ))}
                                </View>
                            ) : (
                                <View className="mb-3" />
                            )}

                            {!adding ? (
                                <View className="mb-2">
                                    <Text className="text-xs font-semibold text-gray-500 dark:text-cyber-muted mb-1">{t('tournaments.manage.sched.matchStatus')}</Text>
                                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                                        {(['SCHEDULED', 'POSTPONED', 'CANCELLED'] as const).map((s) => (
                                            <Chip key={s} testID={`match-edit-status-${s}`} label={t(`tournaments.manage.sched.status.${s}`) as string} selected={status === s} onPress={() => setStatus(s)} />
                                        ))}
                                    </View>
                                </View>
                            ) : null}

                            {!adding && onDelete ? (
                                <Pressable testID="match-delete" onPress={onDelete} disabled={busy} accessibilityRole="button" style={{ minHeight: 44 }} className="mt-2 items-center justify-center">
                                    <Text className="font-bold text-red-600 dark:text-red-400">{t('tournaments.manage.sched.deleteMatch')}</Text>
                                </Pressable>
                            ) : null}
                        </ScrollView>

                        <View className="px-4 pt-2 pb-3 border-t border-gray-200 dark:border-cyber-border flex-row" style={{ gap: 8 }}>
                            <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" style={{ height: 52 }} className="flex-1 rounded-2xl border border-gray-300 dark:border-cyber-border items-center justify-center">
                                <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('common.cancel')}</Text>
                            </Pressable>
                            {conflicts.length ? (
                                <Pressable testID="match-save-force" onPress={() => submit(true)} disabled={busy} accessibilityRole="button" style={{ height: 52 }} className="flex-[2] rounded-2xl bg-amber-600 items-center justify-center flex-row">
                                    {busy ? <ActivityIndicator color="#fff" /> : null}
                                    <Text className="font-extrabold text-white">{t('tournaments.manage.sched.saveAnyway')}</Text>
                                </Pressable>
                            ) : (
                                <Pressable testID="match-save" onPress={() => submit(false)} disabled={busy} accessibilityRole="button" style={{ height: 52, opacity: busy ? 0.6 : 1 }} className="flex-[2] rounded-2xl bg-brand items-center justify-center flex-row">
                                    {busy ? <ActivityIndicator color="#fff" /> : null}
                                    <Text className="font-extrabold text-white">{t('common.save')}</Text>
                                </Pressable>
                            )}
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}
