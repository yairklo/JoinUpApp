import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Image,
    Modal,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
    MAX_TEAM_SCORE,
    checkPlayerTotals,
    deriveOutcome,
    getStatDefs,
    getStatLabel,
    getSummaryKeys,
    validateTennisSets,
} from '@joinup/shared/matchStats';
import ResultStepper from '@/components/results/ResultStepper';
import { BINARY_STAT_KEYS, OUTCOME_CLASSES, describeStats, formatShortDate, sideSwatchColor, tabular, toLang } from '@/components/results/resultUtils';
import { getSportTheme } from '@/components/ui/SportCover';
import type { GameResultRecord, GameResultRosterEntry, GameResultWarning, SaveGameResultInput, TennisSets } from '@/types/results';
import EveningRoundsEditor from '@/components/results/EveningRoundsEditor';
import { eveningFormErrors, initEveningForm, toEveningResultBody, type EveningForm } from '@joinup/shared/eveningSummary';
import type { Team } from '@/types/game';

export const RESULT_NOTES_MAX = 500;

export type EditorErrorKind = 'validation' | 'offline' | 'locked' | null;

export interface GameResultEditorProps {
    open: boolean;
    sport: string;
    initial: GameResultRecord | null;
    roster: GameResultRosterEntry[];
    teams?: Team[];
    /** "⚽ title · 12/10" shown under the title. */
    subtitle?: string;
    locked?: boolean;
    lockedAt?: string | null;
    isAdmin?: boolean;
    saving?: boolean;
    rosterLoading?: boolean;
    errorKind?: EditorErrorKind;
    /** Server-side warnings from the last save (live client check is shown too). */
    warnings?: GameResultWarning[];
    onSave: (body: SaveGameResultInput) => void;
    onDelete?: () => void;
    onClose: () => void;
}

interface PlayerState {
    order: 0 | 1 | null;
    values: Record<string, number>;
}

const num = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
};

function initialPlayers(
    roster: GameResultRosterEntry[],
    initial: GameResultRecord | null,
    teams: Team[] | undefined,
    sideTeamIds: (string | null)[],
): Record<string, PlayerState> {
    const out: Record<string, PlayerState> = {};
    for (const p of roster) {
        let order: 0 | 1 | null = null;
        const saved = initial?.stats.find((s) => s.userId === p.userId);
        if (saved?.sideId) {
            const side = initial?.sides.find((s) => s.id === saved.sideId);
            order = side ? side.order : null;
        } else if (!initial) {
            const idx = sideTeamIds.findIndex((tid) => tid && teams?.find((t) => t.id === tid)?.playerIds.includes(p.userId));
            order = idx === 0 || idx === 1 ? idx : null;
        }
        out[p.userId] = { order, values: { ...(saved?.values ?? {}) } };
    }
    return out;
}

export default function GameResultEditor(props: GameResultEditorProps) {
    const { open, onClose } = props;
    return (
        <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            {open ? <EditorBody {...props} /> : null}
        </Modal>
    );
}

function EditorBody({
    sport,
    initial,
    roster,
    teams,
    subtitle,
    locked,
    lockedAt,
    isAdmin,
    saving,
    rosterLoading,
    errorKind,
    warnings: serverWarnings,
    onSave,
    onDelete,
    onClose,
}: GameResultEditorProps) {
    const { t, i18n } = useTranslation();
    const lang = toLang(i18n.language);
    const insets = useSafeAreaInsets();
    const theme = getSportTheme(sport);
    const isTennis = sport === 'TENNIS';
    const maxScore = (MAX_TEAM_SCORE as Record<string, number>)[sport] ?? 99;
    const isBasketball = sport === 'BASKETBALL';
    const readOnly = !!saving;
    const lockedOut = !!locked && !isAdmin;

    // Sides: saved sides, else first two game teams, else ad-hoc.
    const base = useMemo(() => {
        const sorted = initial ? [...initial.sides].sort((a, b) => a.order - b.order) : [];
        return [0, 1].map((i) => {
            const s = sorted[i];
            const team = !s ? teams?.[i] : undefined;
            return { label: s?.label ?? team?.name ?? '', teamId: s?.teamId ?? team?.id ?? null, score: s?.score ?? 0 };
        });
    }, [initial, teams]);

    const [labels, setLabels] = useState<string[]>(base.map((b) => b.label));
    const [scores, setScores] = useState<number[]>(base.map((b) => b.score));
    const [sets, setSets] = useState<string[][]>(() => {
        const s = initial?.sides.find((x) => x.order === 0)?.sets;
        return s && s.length ? s.map(([a, b]) => [String(a), String(b)]) : [['', '']];
    });
    const [players, setPlayers] = useState<Record<string, PlayerState>>(() =>
        initialPlayers(roster, initial, teams, base.map((b) => b.teamId)),
    );
    const [notes, setNotes] = useState(initial?.notes ?? '');
    const [eveningOn, setEveningOn] = useState(!!(initial?.lineupMode || (initial?.rounds?.length ?? 0) > 1));
    const [eveningForm, setEveningForm] = useState<EveningForm>(() => initEveningForm({ result: initial, teams, roster }));
    const [eveningTried, setEveningTried] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const touch = <T,>(fn: (v: T) => void) => (v: T) => {
        setDirty(true);
        fn(v);
    };

    const sideObj = (i: number) => ({ order: i, teamId: base[i].teamId });
    const swatch = (i: number) => sideSwatchColor(sideObj(i), teams, sport);
    const sideName = (i: number) => labels[i]?.trim() || (i === 0 ? t('resultEditor.sideA', 'A') : t('resultEditor.sideB', 'B'));
    const defs = getStatDefs(sport);
    const quickKey = getSummaryKeys(sport)[0];
    const scoringWord = sport === 'SOCCER' ? 'Goal' : 'Point';

    // Tennis derived result
    const setsParsed: TennisSets = sets
        .filter((r) => r[0] !== '' || r[1] !== '')
        .map(([a, b]) => [num(a), num(b)] as [number, number]);
    const tennis = isTennis ? validateTennisSets(setsParsed) : null;
    const setError = (i: number): string | null => {
        if (!tennis) return null;
        const e = tennis.errors.find((x) => x.index === i && (x.code === 'INVALID_SET_SCORE' || x.code === 'INVALID_SET'));
        if (e) return t('resultEditor.errSetScore');
        if (tennis.errors.some((x) => x.code === 'SETS_AFTER_MATCH_END') && i === setsParsed.length - 1) return t('resultEditor.errAfterEnd');
        return null;
    };
    const matchIncomplete = !!tennis?.errors.some((x) => x.code === 'MATCH_INCOMPLETE');

    const effScores = isTennis && tennis ? tennis.setsWon : scores;
    const outcomeA = isTennis ? (tennis?.valid ? (tennis.winner === 0 ? 'WIN' : tennis.winner === 1 ? 'LOSS' : null) : null) : deriveOutcome(scores[0], scores[1]);
    const previewText =
        outcomeA === 'DRAW'
            ? t('results.draw')
            : outcomeA
              ? t('results.wonBy', { side: sideName(outcomeA === 'WIN' ? 0 : 1) })
              : null;

    // Live soft warnings (never block saving)
    const liveWarnings = useMemo(() => {
        const out: { side: number; sum: number; teamScore: number; key: string }[] = [];
        if (isTennis) return out;
        [0, 1].forEach((i) => {
            const stats = Object.values(players).filter((p) => p.order === i).map((p) => p.values);
            checkPlayerTotals(sport, scores[i], stats).forEach((w) => out.push({ side: i, sum: w.sum, teamScore: w.teamScore, key: w.key }));
        });
        return out;
    }, [players, scores, sport, isTennis]);
    const warnTexts = liveWarnings.map((w) =>
        t('resultEditor.warnSum', { label: getStatLabel(sport, w.key, lang), side: sideName(w.side), sum: w.sum, teamScore: w.teamScore }),
    );
    if (!warnTexts.length && serverWarnings?.length) {
        serverWarnings.forEach((w) =>
            warnTexts.push(t('resultEditor.warnSum', { label: getStatLabel(sport, w.key, lang), side: sideName(w.sideOrder), sum: w.sum, teamScore: w.teamScore })),
        );
    }

    const setPlayer = (userId: string, patch: Partial<PlayerState>) => {
        setDirty(true);
        setPlayers((prev) => ({ ...prev, [userId]: { ...prev[userId], ...patch } }));
    };
    const setStat = (userId: string, key: string, v: number) => {
        setDirty(true);
        setPlayers((prev) => {
            const next: Record<string, PlayerState> = { ...prev, [userId]: { ...prev[userId], values: { ...prev[userId].values, [key]: v } } };
            // MVP is one-per-game (spec 3.4): selecting moves it.
            if (key === 'mvp' && v > 0) {
                for (const id of Object.keys(next)) {
                    if (id !== userId && next[id].values.mvp) next[id] = { ...next[id], values: { ...next[id].values, mvp: 0 } };
                }
            }
            return next;
        });
    };

    const eveningErrors = eveningFormErrors(eveningForm);
    const eveningReady = eveningErrors.length === 0;
    const canSave = !readOnly && !lockedOut && !rosterLoading && (eveningOn ? !eveningTried || eveningReady : isTennis ? !!tennis?.valid : true);

    const save = () => {
        if (eveningOn) {
            setEveningTried(true);
            if (readOnly || lockedOut || rosterLoading || !eveningReady) return;
            onSave(toEveningResultBody({ ...eveningForm, notes }));
            return;
        }
        if (!canSave) return;
        const sideInput = (i: number) => ({
            label: sideName(i),
            teamId: base[i].teamId,
            ...(isTennis ? {} : { score: scores[i] }),
        });
        const body: SaveGameResultInput = {
            sides: [
                isTennis ? { ...sideInput(0), sets: setsParsed } : sideInput(0),
                sideInput(1),
            ],
            stats: roster
                .map((p) => {
                    const st = players[p.userId];
                    const values = Object.fromEntries(Object.entries(st?.values ?? {}).filter(([, v]) => v > 0));
                    return { userId: p.userId, sideOrder: st?.order ?? null, values };
                })
                .filter((p) => p.sideOrder !== null || Object.keys(p.values).length > 0),
            notes: notes.trim() || null,
            ...(isTennis ? { bestOf: 3 as const } : {}),
        };
        onSave(body);
    };

    const close = () => {
        if (saving) return;
        if (!dirty) return onClose();
        Alert.alert(t('resultEditor.leaveTitle'), '', [
            { text: t('resultEditor.keepEditing'), style: 'cancel' },
            { text: t('resultEditor.leave'), style: 'destructive', onPress: onClose },
        ]);
    };
    const confirmDelete = () =>
        Alert.alert(t('resultEditor.deleteTitle'), t('resultEditor.deleteBody'), [
            { text: t('userReport.cancel'), style: 'cancel' },
            { text: t('resultEditor.deleteConfirm'), style: 'destructive', onPress: onDelete },
        ]);

    const Swatch = ({ i }: { i: number }) => (
        <View className="w-2.5 h-2.5 rounded-full border border-gray-200 dark:border-cyber-muted" style={{ backgroundColor: swatch(i) }} />
    );
    const alertBox = (tone: 'error' | 'info' | 'warn', text: string, testID?: string) => {
        const cls =
            tone === 'error'
                ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900'
                : tone === 'warn'
                  ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900'
                  : 'bg-gray-50 dark:bg-cyber-bg border-gray-200 dark:border-cyber-border';
        const txt =
            tone === 'error' ? 'text-red-700 dark:text-red-200' : tone === 'warn' ? 'text-amber-800 dark:text-amber-200' : 'text-gray-700 dark:text-cyber-text';
        return (
            <View testID={testID} className={`rounded-2xl border p-3 mb-3 flex-row items-start ${cls}`}>
                {tone === 'warn' ? <Ionicons name="warning-outline" size={16} color="#92400e" style={{ marginEnd: 6, marginTop: 1 }} /> : null}
                <Text className={`flex-1 ${txt}`}>{text}</Text>
            </View>
        );
    };

    const groups = [0, 1, null].map((order) => ({
        order,
        players: roster.filter((p) => (players[p.userId]?.order ?? null) === order),
    }));

    const renderPlayer = (p: GameResultRosterEntry) => {
        const st = players[p.userId] ?? { order: null, values: {} };
        const open = expanded === p.userId;
        const rest = defs.filter((d) => d.key !== quickKey);
        const summary = describeStats(sport, Object.fromEntries(Object.entries(st.values).filter(([k]) => k !== quickKey)), lang)
            .map((s) => s.text)
            .join(' · ');
        const needsSide = !p.sideId || true;
        return (
            <View key={p.userId} testID={`result-editor-player-${p.userId}`} className="border-b border-gray-100 dark:border-cyber-border py-2">
                <View className="flex-row items-center min-h-[56px]">
                    {p.imageUrl ? (
                        <Image source={{ uri: p.imageUrl }} className="w-10 h-10 rounded-full bg-gray-200" />
                    ) : (
                        <View className="w-10 h-10 rounded-full bg-gray-200 dark:bg-cyber-border" />
                    )}
                    <View className="ms-3 flex-1" style={{ minWidth: 0 }}>
                        <Text numberOfLines={2} className="font-semibold text-gray-900 dark:text-cyber-text">{p.name}</Text>
                        {!open && summary ? (
                            <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-cyber-muted">{summary}</Text>
                        ) : null}
                    </View>
                    {quickKey ? (
                        <View style={{ width: 132 }}>
                            <ResultStepper
                                size={44}
                                valueClassName="text-[18px]"
                                value={st.values[quickKey] ?? 0}
                                max={defs.find((d) => d.key === quickKey)?.max ?? 99}
                                onChange={(v) => setStat(p.userId, quickKey, v)}
                                disabled={readOnly}
                                repeat={isBasketball}
                                incLabel={`+ ${getStatLabel(sport, quickKey, lang)}: ${p.name}`}
                                decLabel={`- ${getStatLabel(sport, quickKey, lang)}: ${p.name}`}
                                testIDBase={`result-editor-stat-${p.userId}-${quickKey}`}
                            />
                        </View>
                    ) : null}
                    <TouchableOpacity
                        onPress={() => setExpanded(open ? null : p.userId)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        className="w-11 h-11 items-center justify-center"
                    >
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#6b7280" />
                    </TouchableOpacity>
                </View>
                {needsSide ? (
                    <View className="flex-row mt-1" style={{ gap: 8 }}>
                        {[0, 1].map((i) => {
                            const sel = st.order === i;
                            return (
                                <TouchableOpacity
                                    key={i}
                                    testID={`result-editor-player-side-${p.userId}-${i}`}
                                    onPress={() => setPlayer(p.userId, { order: sel ? null : (i as 0 | 1) })}
                                    disabled={readOnly}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: sel }}
                                    className={`h-10 px-3 rounded-full items-center justify-center bg-gray-100 dark:bg-cyber-border ${sel ? 'border-b-[3px]' : ''}`}
                                    style={[{ maxWidth: 120 }, sel ? { borderBottomColor: swatch(i) } : null]}
                                >
                                    <Text numberOfLines={1} className={`text-[13px] ${sel ? 'font-bold text-gray-900 dark:text-cyber-text' : 'text-gray-600 dark:text-cyber-muted'}`}>
                                        {sideName(i)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : null}
                {open ? (
                    <View className="flex-row flex-wrap mt-3">
                        {rest.map((d) => {
                            const label = getStatLabel(sport, d.key, lang);
                            const v = st.values[d.key] ?? 0;
                            if (BINARY_STAT_KEYS.includes(d.key)) {
                                const on = v > 0;
                                return (
                                    <TouchableOpacity
                                        key={d.key}
                                        testID={`result-editor-stat-${p.userId}-${d.key}`}
                                        onPress={() => setStat(p.userId, d.key, on ? 0 : 1)}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: on }}
                                        className={`h-11 px-4 mb-2 me-2 rounded-full items-center justify-center ${on ? '' : 'bg-gray-100 dark:bg-cyber-border'}`}
                                        style={on ? { backgroundColor: theme.base } : undefined}
                                    >
                                        <Text className={`font-bold ${on ? '' : 'text-gray-700 dark:text-cyber-text'}`} style={on ? { color: theme.ink } : undefined}>
                                            {d.key === 'mvp' ? `⭐ ${label}` : label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }
                            return (
                                <View key={d.key} style={{ width: '50%' }} className="mb-3 pe-2">
                                    <View className="flex-row items-center mb-1">
                                        {d.key === 'yellowCards' || d.key === 'redCards' ? (
                                            <View className="w-2.5 h-3 rounded-sm me-1" style={{ backgroundColor: d.key === 'yellowCards' ? '#eab308' : '#dc2626' }} />
                                        ) : null}
                                        <Text className="text-xs text-gray-500 dark:text-cyber-muted" numberOfLines={1}>{label}</Text>
                                    </View>
                                    <ResultStepper
                                        size={44}
                                        valueClassName="text-[18px]"
                                        value={v}
                                        max={d.max}
                                        onChange={(n) => setStat(p.userId, d.key, n)}
                                        disabled={readOnly}
                                        incLabel={`+ ${label}: ${p.name}`}
                                        decLabel={`- ${label}: ${p.name}`}
                                        testIDBase={`result-editor-stat-${p.userId}-${d.key}`}
                                    />
                                </View>
                            );
                        })}
                    </View>
                ) : null}
            </View>
        );
    };

    const footerDate = lockedAt ? formatShortDate(lockedAt, lang) : null;

    return (
        <View testID="result-editor" className="flex-1 bg-white dark:bg-cyber-bg">
            <View className="flex-row items-center px-3 pt-4 pb-2 border-b border-gray-100 dark:border-cyber-border">
                <TouchableOpacity
                    testID="result-editor-close"
                    onPress={close}
                    accessibilityRole="button"
                    accessibilityLabel={t('userReport.close')}
                    className="w-11 h-11 items-center justify-center"
                >
                    <Ionicons name="close" size={24} color="#374151" />
                </TouchableOpacity>
                <View className="flex-1 ms-1">
                    <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text">{t('resultEditor.title')}</Text>
                    {subtitle ? <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-cyber-muted">{subtitle}</Text> : null}
                </View>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                    {errorKind === 'validation' ? alertBox('error', t('resultEditor.saveFailed')) : null}
                    {errorKind === 'offline' ? alertBox('error', t('resultEditor.offline')) : null}
                    {isAdmin && locked ? alertBox('info', t('resultEditor.adminEdit')) : null}

                    <View className="flex-row mb-4" style={{ gap: 8 }}>
                        <TouchableOpacity
                            onPress={() => setEveningOn(false)}
                            accessibilityRole="button"
                            className={`flex-1 min-h-[44px] rounded-2xl items-center justify-center ${eveningOn ? 'bg-gray-100 dark:bg-cyber-border' : 'bg-brand'}`}
                        >
                            <Text className={`font-bold ${eveningOn ? 'text-gray-800 dark:text-cyber-text' : 'text-white'}`}>{t('results.evening.single')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            testID="result-editor-evening"
                            onPress={() => setEveningOn(true)}
                            accessibilityRole="button"
                            className={`flex-1 min-h-[44px] rounded-2xl items-center justify-center ${eveningOn ? 'bg-brand' : 'bg-gray-100 dark:bg-cyber-border'}`}
                        >
                            <Text className={`font-bold ${eveningOn ? 'text-white' : 'text-gray-800 dark:text-cyber-text'}`}>{t('results.evening.many')}</Text>
                        </TouchableOpacity>
                    </View>

                    {eveningOn ? (
                        <EveningRoundsEditor
                            form={{ ...eveningForm, notes }}
                            teams={teams ?? []}
                            roster={roster}
                            sport={sport}
                            disabled={readOnly}
                            showErrors={eveningTried}
                            onChange={(next) => {
                                setDirty(true);
                                setEveningForm(next);
                                setNotes(next.notes);
                            }}
                        />
                    ) : (
                    <>
                    {/* Section A: score */}
                    {!isTennis ? (
                        <View style={{ gap: 12 }}>
                            {[0, 1].map((i) => (
                                <View key={i} className="bg-gray-50 dark:bg-cyber-card rounded-2xl p-3">
                                    <View className="flex-row items-center mb-2">
                                        <Swatch i={i} />
                                        {base[i].teamId ? (
                                            <Text testID={`result-editor-side-label-${i}`} numberOfLines={2} className="ms-2 flex-1 font-bold text-[15px] text-gray-900 dark:text-cyber-text">
                                                {labels[i]}
                                            </Text>
                                        ) : (
                                            <TextInput
                                                testID={`result-editor-side-label-${i}`}
                                                value={labels[i]}
                                                onChangeText={touch((v: string) => setLabels((l) => l.map((x, j) => (j === i ? v : x))))}
                                                editable={!readOnly}
                                                maxLength={40}
                                                placeholder={t('resultEditor.sideName')}
                                                placeholderTextColor="#9ca3af"
                                                className="ms-2 flex-1 h-10 text-[15px] font-bold text-gray-900 dark:text-cyber-text"
                                            />
                                        )}
                                    </View>
                                    <ResultStepper
                                        size={56}
                                        value={scores[i]}
                                        max={maxScore}
                                        onChange={touch((v: number) => setScores((s) => s.map((x, j) => (j === i ? v : x))))}
                                        disabled={readOnly}
                                        repeat={isBasketball}
                                        incLabel={t(`resultEditor.inc${scoringWord}`, { side: sideName(i) })}
                                        decLabel={t(`resultEditor.dec${scoringWord}`, { side: sideName(i) })}
                                        testIDBase={`result-editor-score-${i}`}
                                    />
                                    {isBasketball ? (
                                        <View className="flex-row justify-center mt-2" style={{ gap: 8 }}>
                                            {[2, 3].map((n) => (
                                                <TouchableOpacity
                                                    key={n}
                                                    onPress={touch(() => setScores((s) => s.map((x, j) => (j === i ? Math.min(maxScore, x + n) : x))))}
                                                    disabled={readOnly}
                                                    accessibilityRole="button"
                                                    className="h-9 px-4 rounded-full bg-white dark:bg-cyber-border border border-gray-200 dark:border-cyber-border items-center justify-center"
                                                >
                                                    <Text className="font-bold text-gray-700 dark:text-cyber-text">+{n}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View>
                            <View className="flex-row items-center mb-2">
                                <View style={{ width: 84 }} />
                                {[0, 1].map((i) =>
                                    base[i].teamId ? (
                                        <View key={i} style={{ width: 72 }} className="flex-row items-center justify-center">
                                            <Swatch i={i} />
                                            <Text numberOfLines={1} className="ms-1 text-xs font-bold text-gray-700 dark:text-cyber-text flex-shrink">{labels[i]}</Text>
                                        </View>
                                    ) : (
                                        <TextInput
                                            key={i}
                                            testID={`result-editor-side-label-${i}`}
                                            value={labels[i]}
                                            onChangeText={touch((v: string) => setLabels((l) => l.map((x, j) => (j === i ? v : x))))}
                                            editable={!readOnly}
                                            maxLength={40}
                                            placeholder={t('resultEditor.sideName')}
                                            placeholderTextColor="#9ca3af"
                                            style={{ width: 72 }}
                                            className="mx-0 h-10 text-xs font-bold text-center text-gray-900 dark:text-cyber-text"
                                        />
                                    ),
                                )}
                            </View>
                            {sets.map((row, i) => {
                                const err = setError(i);
                                const tb = i === 2 && Math.max(num(row[0]), num(row[1])) >= 10;
                                return (
                                    <View key={i} testID={`result-editor-set-row-${i}`} className="mb-2">
                                        <View className="flex-row items-center">
                                            <Text style={{ width: 84 }} className="text-xs text-gray-500 dark:text-cyber-muted" numberOfLines={2}>
                                                {t('resultEditor.setLabel', { defaultValue: t('results.setLong', { n: i + 1 }) })}
                                                {tb ? ` · ${t('results.matchTiebreak')}` : ''}
                                            </Text>
                                            {[0, 1].map((side) => (
                                                <View key={side} style={{ width: 72 }} className="items-center">
                                                    <TextInput
                                                        testID={`result-editor-set-${i}-${side}`}
                                                        value={row[side]}
                                                        onChangeText={touch((v: string) =>
                                                            setSets((s) => s.map((r, j) => (j === i ? r.map((x, k) => (k === side ? v.replace(/\D/g, '').slice(0, 2) : x)) : r))),
                                                        )}
                                                        editable={!readOnly}
                                                        keyboardType="number-pad"
                                                        className={`h-12 w-16 rounded-xl text-center text-[20px] font-bold text-gray-900 dark:text-cyber-text bg-gray-50 dark:bg-cyber-card border ${err ? 'border-red-400' : 'border-gray-200 dark:border-cyber-border'}`}
                                                        style={tabular}
                                                        accessibilityLabel={`${t('results.setLong', { n: i + 1 })} ${sideName(side)}`}
                                                    />
                                                </View>
                                            ))}
                                            {i > 0 ? (
                                                <TouchableOpacity
                                                    testID={`result-editor-set-remove-${i}`}
                                                    onPress={touch(() => setSets((s) => s.filter((_, j) => j !== i)))}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={t('resultEditor.removeSet', { n: i + 1 })}
                                                    className="w-11 h-11 items-center justify-center"
                                                >
                                                    <Ionicons name="close" size={20} color="#6b7280" />
                                                </TouchableOpacity>
                                            ) : (
                                                <View className="w-11" />
                                            )}
                                        </View>
                                        {err ? <Text className="text-xs text-red-600 mt-1">{err}</Text> : null}
                                    </View>
                                );
                            })}
                            {matchIncomplete && sets.length >= 1 && setsParsed.length > 0 ? (
                                <Text className="text-xs text-red-600 mb-2">{t('resultEditor.errIncomplete')}</Text>
                            ) : null}
                            <TouchableOpacity
                                testID="result-editor-set-add"
                                onPress={touch(() => setSets((s) => [...s, ['', '']]))}
                                disabled={readOnly || sets.length >= 3}
                                accessibilityRole="button"
                                className={`self-start h-11 px-4 rounded-full border border-gray-300 dark:border-cyber-border flex-row items-center ${sets.length >= 3 ? 'opacity-40' : ''}`}
                            >
                                <Ionicons name="add-circle-outline" size={18} color="#374151" />
                                <Text className="ms-1 font-semibold text-gray-700 dark:text-cyber-text">{t('resultEditor.addSet')}</Text>
                            </TouchableOpacity>
                            {tennis?.valid && tennis.winner !== null ? (
                                <Text className="mt-3 text-gray-700 dark:text-cyber-text">
                                    {t('resultEditor.winnerLine', { side: sideName(tennis.winner), a: tennis.setsWon[0], b: tennis.setsWon[1] })}
                                </Text>
                            ) : null}
                        </View>
                    )}

                    {!isTennis && previewText ? (
                        <View className="items-center mt-3">
                            <View className={`rounded-full px-3 py-1 ${OUTCOME_CLASSES[outcomeA === 'DRAW' ? 'DRAW' : 'WIN'].bg}`}>
                                <Text className={`text-[13px] font-bold ${OUTCOME_CLASSES[outcomeA === 'DRAW' ? 'DRAW' : 'WIN'].text}`}>{previewText}</Text>
                            </View>
                        </View>
                    ) : null}

                    {/* Section B: players */}
                    <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text mt-6">{t('resultEditor.playersTitle')}</Text>
                    <Text className="text-xs text-gray-500 dark:text-cyber-muted mb-2">{t('resultEditor.playersHint')}</Text>
                    {warnTexts.length ? <View testID="result-editor-warning">{alertBox('warn', warnTexts.join('\n'))}</View> : null}
                    {rosterLoading ? (
                        [0, 1, 2, 3].map((k) => <View key={k} className="h-14 rounded-xl bg-gray-100 dark:bg-cyber-border mb-2" />)
                    ) : roster.length === 0 ? (
                        <Text className="text-gray-500 dark:text-cyber-muted">{t('resultEditor.noPlayers')}</Text>
                    ) : (
                        groups.map((g) =>
                            g.players.length ? (
                                <View key={String(g.order)} className="mb-2">
                                    <View className="flex-row items-center py-2 bg-white dark:bg-cyber-bg">
                                        {g.order !== null ? <Swatch i={g.order} /> : null}
                                        <Text numberOfLines={1} className="ms-2 font-bold text-gray-900 dark:text-cyber-text flex-shrink">
                                            {g.order !== null ? sideName(g.order) : t('results.unassigned')} ({g.players.length})
                                        </Text>
                                    </View>
                                    {g.players.map(renderPlayer)}
                                </View>
                            ) : null,
                        )
                    )}
                    </>
                    )}

                    {/* Section C: notes */}
                    <Text className="font-semibold text-gray-700 dark:text-cyber-text mt-5 mb-1">{t('resultEditor.notes')}</Text>
                    <TextInput
                        testID="result-editor-notes"
                        value={notes}
                        onChangeText={touch((v: string) => setNotes(v))}
                        editable={!readOnly}
                        multiline
                        maxLength={RESULT_NOTES_MAX}
                        placeholder={t('resultEditor.notesPlaceholder')}
                        placeholderTextColor="#9ca3af"
                        textAlignVertical="top"
                        className="min-h-[80px] rounded-xl border border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-card p-3 text-gray-900 dark:text-cyber-text"
                    />
                    <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-1 text-end">{notes.length}/{RESULT_NOTES_MAX}</Text>

                    {initial && onDelete && !lockedOut ? (
                        <TouchableOpacity
                            testID="result-editor-delete"
                            onPress={confirmDelete}
                            disabled={readOnly}
                            accessibilityRole="button"
                            className="mt-6 h-12 flex-row items-center justify-center"
                        >
                            <Ionicons name="trash-outline" size={18} color="#dc2626" />
                            <Text className="ms-2 font-semibold text-red-600">{t('resultEditor.delete')}</Text>
                        </TouchableOpacity>
                    ) : null}
                </ScrollView>

                {/* Sticky footer */}
                <View className="px-4 pt-3 border-t border-gray-100 dark:border-cyber-border bg-white dark:bg-cyber-bg" style={{ paddingBottom: insets.bottom + 12 }}>
                    {lockedOut || errorKind === 'locked' ? (
                        <View testID="result-editor-locked">
                            {alertBox('info', t('resultEditor.lockedNow'))}
                            <TouchableOpacity onPress={onClose} accessibilityRole="button" className="h-[52px] rounded-2xl bg-gray-100 dark:bg-cyber-border items-center justify-center">
                                <Text className="font-bold text-gray-700 dark:text-cyber-text">{t('userReport.close')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {warnTexts.length ? (
                                <Text numberOfLines={1} className="text-xs text-amber-800 dark:text-amber-200 mb-2">{warnTexts[0]}</Text>
                            ) : null}
                            <TouchableOpacity
                                testID="result-editor-save"
                                onPress={save}
                                disabled={!canSave}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !canSave, busy: !!saving }}
                                className={`h-[52px] rounded-2xl bg-brand items-center justify-center flex-row ${canSave ? '' : 'opacity-50'}`}
                            >
                                {saving ? <ActivityIndicator color="#fff" style={{ marginEnd: 8 }} /> : null}
                                <Text className="text-white font-bold text-[16px]">{saving ? t('resultEditor.saving') : t('resultEditor.save')}</Text>
                            </TouchableOpacity>
                            <Text className="text-xs text-gray-500 dark:text-cyber-muted text-center mt-2">
                                {footerDate ? t('resultEditor.editableUntil', { date: footerDate }) : t('resultEditor.editableFor7')}
                            </Text>
                        </>
                    )}
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}
