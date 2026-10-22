import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { MAX_TEAM_SCORE, checkPlayerTotals, getStatLabel, getSummaryKeys, validateTennisSets } from '@joinup/shared/matchStats';
import { getSportTheme } from '@/components/ui/SportCover';
import { toLang, tabular } from '@/components/results/resultUtils';
import { useSaveMatchResult } from '@/hooks/useTournamentMutations';
import { useTournamentSchedule, useTournamentTeams } from '@/hooks/useTournamentViews';
import { tournamentErrorKey, tournamentErrorParams } from '@/utils/tournamentErrors';
import type { ResultStatus, SaveMatchResultInput, TournamentDetail, TournamentMatch } from '@/types/tournament';
import SlotLabel from './SlotLabel';
import ScoreSteppers from './score/ScoreSteppers';
import TennisSetRows from './score/TennisSetRows';
import PlayerStatsPanel, { type StatsRosterGroup } from './score/PlayerStatsPanel';
import { ConflictCard, DownstreamCard } from './score/ScoreNotices';

interface Props {
    open: boolean;
    tournament: TournamentDetail;
    match: TournamentMatch | null;
    onClose: () => void;
    /** Called after a successful save with `changedMatchIds` (this match plus any downstream ones). */
    onSaved?: (changedMatchIds: string[]) => void;
}

const SAVED_HOLD_MS = 900;

const initialStatus = (m: TournamentMatch): ResultStatus => (m.status === 'LIVE' ? 'LIVE' : m.status === 'FORFEIT' ? 'FORFEIT' : 'FINISHED');
const num = (s: string) => (s === '' ? 0 : parseInt(s, 10) || 0);

/**
 * Score entry bottom sheet (spec 12): one-handed 56px steppers, live / finished / forfeit, knockout
 * penalties, tennis sets, optional player stats, VERSION_CONFLICT + DOWNSTREAM_FINISHED handling and
 * undo to scheduled. Container: owns form state and the save hook; the rendering parts live in `score/`.
 */
export default function ScoreEntrySheet({ open, tournament, match, onClose, onSaved }: Props) {
    const { t, i18n } = useTranslation();
    const lang = toLang(i18n.language);
    const insets = useSafeAreaInsets();
    const { height: winH } = useWindowDimensions();
    const sport = tournament.sport;
    const isTennis = sport === 'TENNIS';
    const theme = getSportTheme(sport);

    const schedule = useTournamentSchedule(open ? tournament.id : undefined);
    const teamsQ = useTournamentTeams(open ? tournament.id : undefined);
    const saver = useSaveMatchResult(tournament.id, match?.id);

    const [status, setStatus] = useState<ResultStatus>('FINISHED');
    const [home, setHome] = useState(0);
    const [away, setAway] = useState(0);
    const [homePen, setHomePen] = useState(0);
    const [awayPen, setAwayPen] = useState(0);
    const [sets, setSets] = useState<string[][]>([['', '']]);
    const [forfeitBy, setForfeitBy] = useState<string | null>(null);
    const [stats, setStats] = useState<Record<string, Record<string, number>>>({});
    const [statsOpen, setStatsOpen] = useState(false);
    const [baseVersion, setBaseVersion] = useState(0);
    const [showPens, setShowPens] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);
    const [offline, setOffline] = useState(false);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [staleDismissedFor, setStaleDismissedFor] = useState<number | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const penRef = useRef<View>(null);
    const scrollRef = useRef<ScrollView>(null);

    const stage = useMemo(() => schedule.stages.find((s) => s.id === match?.stageId), [schedule.stages, match?.stageId]);
    const isKnockout = stage?.type === 'KNOCKOUT';
    const bestOf = ((match?.details?.bestOf ?? tournament.rules?.bestOf ?? 3) === 5 ? 5 : 3) as 3 | 5;
    const maxScore = (MAX_TEAM_SCORE as Record<string, number>)[sport] ?? 99;
    const fresh = match ? schedule.matches.find((m) => m.id === match.id) ?? null : null;

    const loadFrom = useCallback((m: TournamentMatch) => {
        setStatus(initialStatus(m));
        setHome(m.homeScore ?? 0);
        setAway(m.awayScore ?? 0);
        setHomePen(m.homePenalties ?? 0);
        setAwayPen(m.awayPenalties ?? 0);
        const s = m.details?.sets;
        setSets(s && s.length ? s.map(([a, b]) => [String(a), String(b)]) : [['', '']]);
        setBaseVersion(m.version);
        setShowPens(m.homePenalties != null);
        const loser =
            m.status === 'FORFEIT' && m.winnerTeamId
                ? m.winnerTeamId === m.home.teamId
                    ? m.away.teamId
                    : m.home.teamId
                : null;
        setForfeitBy(loser);
    }, []);

    // (Re)initialise when the sheet opens for a match.
    useEffect(() => {
        if (!open || !match) return;
        loadFrom(match);
        setStats({});
        setStatsOpen(false);
        setErrorText(null);
        setOffline(false);
        setSavedMsg(null);
        setStaleDismissedFor(null);
        saver.dismiss();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, match?.id]);

    useEffect(() => () => closeTimer.current && clearTimeout(closeTimer.current), []);

    const homeTeam = match?.home.team ?? null;
    const awayTeam = match?.away.team ?? null;
    const homeName = homeTeam?.name ?? '';
    const awayName = awayTeam?.name ?? '';
    const teamsKnown = !!(match?.home.teamId && match?.away.teamId);

    // Sets-derived result for tennis.
    const setsParsed = useMemo(() => sets.filter((r) => r[0] !== '' || r[1] !== '').map(([a, b]) => [num(a), num(b)] as [number, number]), [sets]);
    const tennis = isTennis ? validateTennisSets(setsParsed, { bestOf }) : null;
    const setErrors = useMemo(() => {
        const out: Record<number, string> = {};
        tennis?.errors.forEach((e) => {
            if (e.index == null) return;
            if (e.code === 'INVALID_SET_SCORE' || e.code === 'INVALID_SET') out[e.index] = t('resultEditor.errSetScore') as string;
            else if (e.code === 'SETS_AFTER_MATCH_END') out[e.index] = t('resultEditor.errAfterEnd') as string;
        });
        return out;
    }, [tennis, t]);
    const tennisIncomplete = !!tennis?.errors.some((e) => e.code === 'MATCH_INCOMPLETE' || e.code === 'NO_SETS');
    const effHome = isTennis && tennis ? tennis.setsWon[0] : home;
    const effAway = isTennis && tennis ? tennis.setsWon[1] : away;

    const forfeitScore = tournament.rules?.forfeitScore ?? { winner: 3, loser: 0 };
    const penaltiesVisible = !isTennis && status === 'FINISHED' && (showPens || (isKnockout && home === away));

    // Roster for stats (accepted members of the two teams).
    const groups: StatsRosterGroup[] = useMemo(() => {
        if (!match) return [];
        return [match.home, match.away]
            .filter((s) => s.teamId)
            .map((s) => {
                const team = teamsQ.teams.find((x) => x.id === s.teamId);
                return {
                    teamId: s.teamId as string,
                    teamName: s.team?.name ?? team?.name ?? '',
                    color: s.team?.color,
                    logoUrl: s.team?.logoUrl,
                    players: (team?.members ?? []).filter((m) => m.status === 'ACCEPTED').map((m) => ({ userId: m.userId, name: m.name, imageUrl: m.imageUrl })),
                };
            });
    }, [match, teamsQ.teams]);
    const hasRosters = groups.some((g) => g.players.length > 0);
    const statsSupported = !isTennis && getSummaryKeys(sport).length > 0;

    const statWarnings = useMemo(() => {
        if (!statsOpen || status !== 'FINISHED') return [] as string[];
        const out: string[] = [];
        groups.forEach((g, i) => {
            const score = i === 0 ? home : away;
            const vals = g.players.map((p) => stats[p.userId] ?? {});
            checkPlayerTotals(sport, score, vals).forEach((w) =>
                out.push(t('resultEditor.warnSum', { label: getStatLabel(sport, w.key, lang), side: g.teamName, sum: w.sum, teamScore: w.teamScore }) as string)
            );
        });
        return out;
    }, [statsOpen, status, groups, stats, home, away, sport, lang, t]);

    const saveInput = (): SaveMatchResultInput | null => {
        if (!match) return null;
        const base: SaveMatchResultInput = { expectedVersion: baseVersion, status, homeScore: effHome, awayScore: effAway };
        if (status === 'FORFEIT') {
            if (!forfeitBy) return null;
            const homeLoses = forfeitBy === match.home.teamId;
            base.homeScore = homeLoses ? forfeitScore.loser : forfeitScore.winner;
            base.awayScore = homeLoses ? forfeitScore.winner : forfeitScore.loser;
            base.forfeitBy = forfeitBy;
            return base;
        }
        if (isTennis) {
            if (status === 'FINISHED' && (!tennis || !tennis.valid)) return null;
            if (setsParsed.length) base.details = { sets: setsParsed };
        }
        if (penaltiesVisible) base.penalties = { home: homePen, away: awayPen };
        if (status === 'FINISHED' && statsOpen) {
            const out: Record<string, Record<string, number>> = {};
            for (const [uid, vals] of Object.entries(stats)) {
                const nz = Object.fromEntries(Object.entries(vals).filter(([, v]) => v > 0));
                if (Object.keys(nz).length) out[uid] = nz;
            }
            if (Object.keys(out).length) base.stats = out;
        }
        return base;
    };

    const canSave = useMemo(() => {
        if (!match || !teamsKnown) return false;
        if (status === 'FORFEIT') return !!forfeitBy;
        if (isTennis && status === 'FINISHED') return !!tennis?.valid;
        return true;
    }, [match, teamsKnown, status, forfeitBy, isTennis, tennis]);

    const handleError = (err: any) => {
        const code = err?.code as string | undefined;
        if (!code && !err?.status) {
            setOffline(true);
            setErrorText(null);
            return;
        }
        setOffline(false);
        if (code === 'NEEDS_PENALTIES') {
            setShowPens(true);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        }
        const key = tournamentErrorKey(err);
        setErrorText(key ? (t(key, tournamentErrorParams(err)) as string) : (t('resultEditor.saveFailed') as string));
    };

    const finishSaved = (res: { match: TournamentMatch; changedMatchIds: string[] }) => {
        const downstreamId = res.changedMatchIds.find((id) => id !== res.match.id);
        const down = downstreamId ? schedule.matches.find((m) => m.id === downstreamId) : undefined;
        const winner = res.match.winnerTeamId
            ? [res.match.home.team, res.match.away.team].find((x) => x?.id === res.match.winnerTeamId)
            : undefined;
        const msg =
            down && winner && down.round != null
                ? (t('tournaments.score.savedAdvanced', { team: winner.name, round: t('tournaments.schedule.round', { n: down.round }) }) as string)
                : (t('tournaments.score.saved') as string);
        setSavedMsg(msg);
        schedule.refetch();
        closeTimer.current = setTimeout(() => {
            onSaved?.(res.changedMatchIds);
            onClose();
        }, SAVED_HOLD_MS);
    };

    const runSave = async (input: SaveMatchResultInput | null, resolver?: () => Promise<any>) => {
        if (!input && !resolver) return;
        setErrorText(null);
        setOffline(false);
        try {
            const res = resolver ? await resolver() : await saver.save(input as SaveMatchResultInput);
            if (res) finishSaved(res);
            else schedule.refetch();
        } catch (err) {
            handleError(err);
        }
    };

    const onSave = () => runSave(saveInput());

    const onUndo = () => {
        Alert.alert(t('tournaments.score.undo') as string, t('tournaments.score.undoConfirm') as string, [
            { text: t('common.cancel') as string, style: 'cancel' },
            {
                text: t('common.confirm') as string,
                style: 'destructive',
                onPress: () => runSave({ expectedVersion: baseVersion, status: 'SCHEDULED', homeScore: 0, awayScore: 0 }),
            },
        ]);
    };

    const downNumber = saver.downstreamFinished ? schedule.numberById[saver.downstreamFinished.matchId] ?? null : null;
    const onForce = () =>
        Alert.alert(t('tournaments.score.downstreamForce') as string, t('tournaments.score.downstreamForceConfirm', { n: downNumber ?? '' }) as string, [
            { text: t('common.cancel') as string, style: 'cancel' },
            { text: t('common.confirm') as string, onPress: () => runSave(null, () => saver.forceSave()) },
        ]);

    // Conflict: server said so, or the realtime refetch shows a newer version than the one we started from.
    const staleProactive = !!fresh && fresh.version > baseVersion && staleDismissedFor !== fresh.version && !savedMsg && !saver.pending;
    const showConflict = !!saver.versionConflict || staleProactive;
    const theirs = fresh ?? match;
    const keepTheirs = () => {
        if (fresh) loadFrom(fresh);
        saver.dismiss();
        setStaleDismissedFor(fresh?.version ?? null);
    };
    const keepMine = async () => {
        if (saver.versionConflict) {
            await runSave(null, () => saver.resolveKeepMine());
        } else if (fresh) {
            setBaseVersion(fresh.version);
            setStaleDismissedFor(fresh.version);
        }
    };

    const canUndo = !!match && (match.status === 'LIVE' || match.status === 'FINISHED' || match.status === 'FORFEIT');
    const saveLabel = status === 'LIVE' ? 'saveLive' : status === 'FORFEIT' ? 'saveForfeit' : 'saveFinished';
    const busy = saver.pending || !!savedMsg;
    const sheetH = Math.round(winH * (statsOpen ? 0.95 : 0.7));
    const title = match ? `#${match.number}` : '';
    const blocked: string | null = !match
        ? null
        : tournament.status !== 'IN_PROGRESS'
          ? (t('tournaments.score.notInProgress') as string)
          : !teamsKnown
            ? (t('tournaments.score.teamsUnknown') as string)
            : null;

    return (
        <Modal visible={open && !!match} transparent animationType="slide" onRequestClose={() => !busy && onClose()} statusBarTranslucent>
            <View className="flex-1 justify-end bg-black/40">
                <Pressable className="flex-1" onPress={() => !busy && onClose()} accessibilityLabel={t('common.close') as string} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View
                        testID="score-sheet"
                        className="bg-gray-50 dark:bg-cyber-bg rounded-t-3xl"
                        style={{ height: sheetH, paddingBottom: insets.bottom }}
                    >
                        <View className="items-center pt-2">
                            <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-cyber-border" />
                        </View>
                        <View className="flex-row items-center px-3 pt-1" style={{ minHeight: 44 }}>
                            <Pressable
                                testID="score-sheet-close"
                                disabled={busy}
                                onPress={onClose}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.close') as string}
                                style={{ width: 44, height: 44 }}
                                className="items-center justify-center"
                            >
                                <Ionicons name="close" size={24} color="#6b7280" />
                            </Pressable>
                            <Text className="flex-1 text-center font-extrabold text-gray-900 dark:text-cyber-text" numberOfLines={1}>
                                {title}
                            </Text>
                            <View style={{ width: 44 }} />
                        </View>

                        {blocked ? (
                            <View className="px-6 py-10 items-center" testID="score-blocked">
                                <Text className="text-center text-gray-600 dark:text-cyber-muted">{blocked}</Text>
                            </View>
                        ) : match ? (
                            <>
                                <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
                                    {errorText ? (
                                        <View testID="score-error" accessibilityRole="alert" className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 mb-3">
                                            <Text className="text-red-700 dark:text-red-300">{errorText}</Text>
                                        </View>
                                    ) : null}
                                    {offline ? (
                                        <View testID="score-offline" accessibilityRole="alert" className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-3 mb-3 flex-row items-center">
                                            <Text className="flex-1 text-amber-800 dark:text-amber-200">{t('resultEditor.offline')}</Text>
                                            <Pressable onPress={onSave} accessibilityRole="button" style={{ minHeight: 44 }} className="px-3 justify-center">
                                                <Text className="font-bold text-amber-800 dark:text-amber-200">{t('tournaments.score.retry')}</Text>
                                            </Pressable>
                                        </View>
                                    ) : null}
                                    {showConflict && theirs ? (
                                        <ConflictCard
                                            homeName={homeName}
                                            awayName={awayName}
                                            theirs={{ home: theirs.homeScore, away: theirs.awayScore, sets: theirs.details?.sets }}
                                            mine={{ home: effHome, away: effAway, sets: isTennis ? setsParsed : undefined }}
                                            onKeepTheirs={keepTheirs}
                                            onKeepMine={keepMine}
                                            busy={busy}
                                        />
                                    ) : null}

                                    {status === 'FORFEIT' ? (
                                        <View testID="score-forfeit">
                                            <Text className="font-bold text-gray-900 dark:text-cyber-text mb-2">{t('tournaments.score.forfeitWho')}</Text>
                                            <View className="flex-row" style={{ gap: 8 }}>
                                                {[match.home, match.away].map((slot) => {
                                                    const sel = forfeitBy === slot.teamId;
                                                    return (
                                                        <Pressable
                                                            key={slot.teamId}
                                                            testID={`score-forfeit-by-${slot.teamId}`}
                                                            onPress={() => setForfeitBy(slot.teamId)}
                                                            accessibilityRole="radio"
                                                            accessibilityState={{ selected: sel }}
                                                            style={{ minHeight: 48, ...(sel ? { borderColor: theme.base } : null) }}
                                                            className={`flex-1 rounded-xl border px-2 justify-center ${sel ? 'border-2' : 'border-gray-300 dark:border-cyber-border'}`}
                                                        >
                                                            <SlotLabel slot={slot} lines={2} bold={sel} />
                                                        </Pressable>
                                                    );
                                                })}
                                            </View>
                                            {forfeitBy ? (
                                                <Text className="mt-3 text-center text-gray-700 dark:text-cyber-text">
                                                    {t('tournaments.score.forfeitPreview', {
                                                        score: `${forfeitScore.winner}–${forfeitScore.loser}`,
                                                        winner: forfeitBy === match.home.teamId ? awayName : homeName,
                                                    })}
                                                </Text>
                                            ) : null}
                                        </View>
                                    ) : isTennis ? (
                                        <View>
                                            <View className="flex-row justify-between mb-3">
                                                <View className="flex-1"><SlotLabel slot={match.home} lines={2} bold /></View>
                                                <View className="flex-1 items-end"><SlotLabel slot={match.away} lines={2} bold /></View>
                                            </View>
                                            <TennisSetRows sets={sets} bestOf={bestOf} onChange={setSets} errors={setErrors} />
                                            {tennis?.winner != null ? (
                                                <Text className="mt-2 text-center font-semibold text-gray-700 dark:text-cyber-text" testID="score-sets-winner">
                                                    {t('resultEditor.winnerLine', { side: tennis.winner === 0 ? homeName : awayName, a: tennis.setsWon[0], b: tennis.setsWon[1] })}
                                                </Text>
                                            ) : status === 'FINISHED' && tennisIncomplete && setsParsed.length > 0 ? (
                                                <Text className="mt-2 text-center text-xs text-gray-500 dark:text-cyber-muted">{t('resultEditor.errIncomplete')}</Text>
                                            ) : null}
                                        </View>
                                    ) : (
                                        <ScoreSteppers
                                            sport={sport}
                                            max={maxScore}
                                            quickPoints={sport === 'BASKETBALL'}
                                            disabled={busy}
                                            home={{ name: homeName, color: homeTeam?.color, logoUrl: homeTeam?.logoUrl, value: home, onChange: setHome }}
                                            away={{ name: awayName, color: awayTeam?.color, logoUrl: awayTeam?.logoUrl, value: away, onChange: setAway }}
                                        />
                                    )}

                                    {/* status segmented, 48px */}
                                    <View className="flex-row mt-5 rounded-2xl bg-gray-200/70 dark:bg-cyber-card p-1" accessibilityRole="radiogroup">
                                        {(['LIVE', 'FINISHED', 'FORFEIT'] as const).map((s) => {
                                            const sel = status === s;
                                            return (
                                                <Pressable
                                                    key={s}
                                                    testID={`score-status-${s}`}
                                                    onPress={() => setStatus(s)}
                                                    disabled={busy}
                                                    accessibilityRole="radio"
                                                    accessibilityState={{ selected: sel }}
                                                    style={{ minHeight: 48 }}
                                                    className={`flex-1 items-center justify-center rounded-xl ${sel ? 'bg-white dark:bg-cyber-border' : ''}`}
                                                >
                                                    <Text className={`font-bold ${sel ? 'text-gray-900 dark:text-cyber-text' : 'text-gray-500 dark:text-cyber-muted'}`}>
                                                        {t(`tournaments.score.status.${s}`)}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>

                                    {penaltiesVisible ? (
                                        <View ref={penRef} className="mt-5" testID="score-penalties">
                                            <Text className="font-bold text-gray-900 dark:text-cyber-text">{t('tournaments.score.penaltiesTitle')}</Text>
                                            <Text className="text-sm text-gray-600 dark:text-cyber-muted mb-2">{t('tournaments.score.penaltiesHint')}</Text>
                                            <View className="flex-row justify-between" style={{ gap: 16 }}>
                                                {([['home', homePen, setHomePen, homeName], ['away', awayPen, setAwayPen, awayName]] as const).map(([w, v, set, name]) => (
                                                    <View key={w} className="flex-1 flex-row items-center justify-between" testID={`score-penalties-${w}`}>
                                                        <Pressable onPress={() => set(Math.max(0, v - 1))} accessibilityRole="button" accessibilityLabel={t('tournaments.score.dec', { team: name }) as string} style={{ width: 44, height: 44 }} className="rounded-xl bg-white dark:bg-cyber-card border border-gray-200 dark:border-cyber-border items-center justify-center">
                                                            <Ionicons name="remove" size={22} color="#374151" />
                                                        </Pressable>
                                                        <Text className="text-2xl font-extrabold text-gray-900 dark:text-cyber-text" style={tabular}>{v}</Text>
                                                        <Pressable onPress={() => set(Math.min(30, v + 1))} accessibilityRole="button" accessibilityLabel={t('tournaments.score.inc', { team: name }) as string} style={{ width: 44, height: 44 }} className="rounded-xl bg-white dark:bg-cyber-card border border-gray-200 dark:border-cyber-border items-center justify-center">
                                                            <Ionicons name="add" size={22} color="#374151" />
                                                        </Pressable>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    ) : null}

                                    {statsSupported && status === 'FINISHED' && hasRosters ? (
                                        <View className="mt-5">
                                            <Pressable
                                                testID="score-stats-toggle"
                                                onPress={() => setStatsOpen((o) => !o)}
                                                accessibilityRole="button"
                                                accessibilityState={{ expanded: statsOpen }}
                                                style={{ minHeight: 44 }}
                                                className="flex-row items-center"
                                            >
                                                <Ionicons name={statsOpen ? 'chevron-down' : 'chevron-forward'} size={18} color="#6b7280" />
                                                <Text className="ms-1 font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.score.statsToggle')}</Text>
                                            </Pressable>
                                            {statsOpen ? (
                                                <PlayerStatsPanel
                                                    sport={sport}
                                                    lang={lang}
                                                    groups={groups}
                                                    values={stats}
                                                    onChange={(uid, key, v) => setStats((prev) => ({ ...prev, [uid]: { ...prev[uid], [key]: v } }))}
                                                    warnings={statWarnings}
                                                    disabled={busy}
                                                />
                                            ) : null}
                                        </View>
                                    ) : null}

                                    {saver.downstreamFinished ? (
                                        <View className="mt-5">
                                            <DownstreamCard
                                                number={downNumber}
                                                canForce={saver.downstreamFinished.canForce}
                                                onForce={onForce}
                                                busy={busy}
                                            />
                                        </View>
                                    ) : null}

                                    {canUndo ? (
                                        <Pressable
                                            testID="score-undo"
                                            onPress={onUndo}
                                            disabled={busy}
                                            accessibilityRole="button"
                                            style={{ minHeight: 44 }}
                                            className="mt-4 items-center justify-center"
                                        >
                                            <Text className="font-semibold text-gray-600 dark:text-cyber-muted underline">{t('tournaments.score.undo')}</Text>
                                        </Pressable>
                                    ) : null}
                                </ScrollView>

                                <View className="px-4 pt-2 pb-3 border-t border-gray-200 dark:border-cyber-border bg-gray-50 dark:bg-cyber-bg">
                                    {savedMsg ? (
                                        <Text testID="score-saved" accessibilityLiveRegion="polite" className="text-center font-bold text-brand-dark dark:text-brand-light mb-2">
                                            {savedMsg}
                                        </Text>
                                    ) : null}
                                    <Pressable
                                        testID="score-save"
                                        onPress={onSave}
                                        disabled={busy || !canSave}
                                        accessibilityRole="button"
                                        accessibilityState={{ disabled: busy || !canSave, busy: saver.pending }}
                                        style={{ height: 56, backgroundColor: theme.base, opacity: busy || !canSave ? 0.5 : 1 }}
                                        className="rounded-2xl items-center justify-center flex-row"
                                    >
                                        {saver.pending ? <ActivityIndicator color="#fff" /> : null}
                                        <Text className="text-white font-extrabold text-base ms-2">{t(`tournaments.score.${saveLabel}`)}</Text>
                                    </Pressable>
                                </View>
                            </>
                        ) : null}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}
