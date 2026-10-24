import React, { useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getSportTheme } from '@/components/ui/SportCover';
import {
    OUTCOME_CLASSES,
    describeStats,
    formatShortDate,
    sideSwatchColor,
    tabular,
    toLang,
    winnerOf,
} from '@/components/results/resultUtils';
import type { GameResultRecord, GameResultRosterEntry, GameResultSide } from '@/types/results';
import type { Team } from '@/types/game';

export interface GameResultPanelProps {
    sport: string;
    result: GameResultRecord | null;
    roster?: GameResultRosterEntry[];
    teams?: Team[];
    state?: 'loading' | 'error' | 'ready';
    /** Game is finished so a result may be recorded. */
    eligible?: boolean;
    canEdit?: boolean;
    locked?: boolean;
    lockedAt?: string | null;
    viewerCanDispute?: boolean;
    /** Session-local: viewer already sent a dispute. */
    disputed?: boolean;
    onEdit?: () => void;
    onDispute?: () => void;
    onRetry?: () => void;
}

const cardShell =
    'bg-white dark:bg-cyber-card rounded-2xl p-5 border border-gray-100 dark:border-cyber-border mx-4 mt-4 overflow-hidden';
const COLLAPSE_AT = 6;

function EveningBoard({ result, roster }: { result: GameResultRecord; roster: GameResultRosterEntry[] }) {
    const { t } = useTranslation();
    const rounds = result.rounds || [];
    const summary = result.summary;
    const nameOf = (id: string) => roster.find((p) => p.userId === id)?.name || t('results.evening.player');
    return (
        <View testID="evening-board" className="mt-4">
            {rounds.map((round) => {
                const [a, b] = [...round.sides].sort((x, y) => x.order - y.order);
                if (!a || !b) return null;
                return (
                    <View
                        key={round.order}
                        testID={`evening-round-row-${round.order}`}
                        accessible
                        accessibilityLabel={`${a.label} ${a.score}, ${b.label} ${b.score}`}
                        className="flex-row items-center min-h-[44px]"
                    >
                        <Text
                            numberOfLines={1}
                            className={`flex-1 text-[15px] text-gray-900 dark:text-cyber-text ${a.outcome === 'WIN' ? 'font-extrabold' : 'font-semibold'}`}
                        >
                            {a.label}
                        </Text>
                        <Text className="text-xl font-extrabold text-gray-900 dark:text-cyber-text px-2" style={tabular}>
                            {a.score}–{b.score}
                        </Text>
                        <Text
                            numberOfLines={1}
                            className={`flex-1 text-[15px] text-end text-gray-900 dark:text-cyber-text ${b.outcome === 'WIN' ? 'font-extrabold' : 'font-semibold'}`}
                        >
                            {b.label}
                        </Text>
                    </View>
                );
            })}
            {summary && (summary.teams.length > 0 || summary.players.length > 0) ? (
                <View testID="evening-summary" className="mt-3 p-3 rounded-2xl bg-gray-50 dark:bg-cyber-bg">
                    <Text className="font-extrabold text-gray-900 dark:text-cyber-text mb-1">{t('results.evening.summary')}</Text>
                    {summary.teams.map((team) => (
                        <Text key={team.teamId || team.label} className="text-gray-800 dark:text-cyber-text py-0.5">
                            {t('results.evening.teamRecord', {
                                label: team.label,
                                w: team.wins,
                                d: team.draws,
                                l: team.losses,
                                gf: team.goalsFor,
                                ga: team.goalsAgainst,
                            })}
                        </Text>
                    ))}
                    {summary.players.map((player) => (
                        <Text key={player.userId} className="text-gray-500 dark:text-cyber-muted py-0.5">
                            {t('results.evening.playerRecord', {
                                name: nameOf(player.userId),
                                w: player.wins,
                                d: player.draws,
                                l: player.losses,
                            })}
                            {player.goals ? ` · ${t('results.evening.goals', { n: player.goals })}` : ''}
                        </Text>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

function Swatch({ color }: { color: string }) {
    return (
        <View
            className="w-2.5 h-2.5 rounded-full border border-gray-200 dark:border-cyber-muted"
            style={{ backgroundColor: color }}
        />
    );
}

function OutcomeChip({ outcome, testID }: { outcome: 'WIN' | 'DRAW'; testID?: string }) {
    const { t } = useTranslation();
    const c = OUTCOME_CLASSES[outcome];
    return (
        <View testID={testID} className={`flex-row items-center self-center rounded-full px-2.5 py-1 ${c.bg}`}>
            {outcome === 'WIN' ? <Ionicons name="trophy" size={14} color="#059669" style={{ marginEnd: 4 }} /> : null}
            <Text className={`text-[13px] font-bold ${c.text}`}>{outcome === 'WIN' ? t('results.win') : t('results.draw')}</Text>
        </View>
    );
}

function Skeleton() {
    const block = 'bg-gray-100 dark:bg-cyber-border rounded-xl';
    return (
        <View testID="game-result-panel" className={cardShell}>
            <View className={`${block} h-5 w-[120px]`} />
            <View className="flex-row items-center justify-between mt-5">
                <View className={`${block} h-4 w-20`} />
                <View className={`${block} h-10 w-10`} />
                <View className={`${block} h-10 w-10`} />
                <View className={`${block} h-4 w-20`} />
            </View>
            <View className={`${block} h-8 mt-6`} />
            <View className={`${block} h-8 mt-2`} />
        </View>
    );
}

/** Tennis: rows = sides, columns = sets, set 1 nearest the labels. */
function SetGrid({ sides, swatch }: { sides: GameResultSide[]; swatch: (s: GameResultSide) => string }) {
    const { t } = useTranslation();
    const setsA = sides[0].sets ?? [];
    const setCount = setsA.length;
    if (!setCount) return null;
    const isTiebreak = (i: number) => {
        const [a, b] = setsA[i];
        return i === 2 && Math.max(a, b) >= 10;
    };
    return (
        <View testID="game-result-sets" className="mt-4">
            <View className="flex-row items-center">
                <View style={{ flex: 1 }} />
                {setsA.map((_, i) => (
                    <View key={i} style={{ width: 40 }} className="items-center">
                        <Text
                            className="text-xs text-gray-500 dark:text-cyber-muted"
                            accessibilityLabel={isTiebreak(i) ? t('results.matchTiebreak') : undefined}
                        >
                            {isTiebreak(i) ? 'ש״ש' : t('results.set', { n: i + 1 })}
                        </Text>
                    </View>
                ))}
            </View>
            {sides.map((side) => {
                const idx = side.order;
                return (
                    <View key={side.id} className="flex-row items-center mt-2">
                        <View className="flex-row items-center" style={{ flex: 1, maxWidth: '45%' }}>
                            <Swatch color={swatch(side)} />
                            <Text
                                numberOfLines={2}
                                className={`ms-2 text-[14px] text-gray-900 dark:text-cyber-text ${side.outcome === 'WIN' ? 'font-extrabold' : 'font-semibold'}`}
                                style={{ flexShrink: 1 }}
                            >
                                {side.label}
                            </Text>
                        </View>
                        <View style={{ flex: 1 }} />
                        {setsA.map((pair, i) => {
                            const mine = pair[idx];
                            const other = pair[1 - idx];
                            return (
                                <View key={i} style={{ width: 40 }} className="items-center">
                                    <Text
                                        className={`text-[18px] ${mine > other ? 'font-extrabold text-gray-900 dark:text-cyber-text' : 'font-bold text-gray-500 dark:text-cyber-muted'}`}
                                        style={tabular}
                                    >
                                        {mine}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                );
            })}
        </View>
    );
}

export default function GameResultPanel({
    sport,
    result,
    roster = [],
    teams,
    state = 'ready',
    eligible = true,
    canEdit,
    locked,
    lockedAt,
    viewerCanDispute,
    disputed,
    onEdit,
    onDispute,
    onRetry,
}: GameResultPanelProps) {
    const { t, i18n } = useTranslation();
    const lang = toLang(i18n.language);
    const theme = getSportTheme(sport);
    const [showAllGroup, setShowAllGroup] = useState<Record<string, boolean>>({});

    const sides = useMemo(() => (result ? [...result.sides].sort((a, b) => a.order - b.order) : []), [result]);
    const rosterById = useMemo(() => new Map(roster.map((r) => [r.userId, r])), [roster]);

    if (state === 'loading') return <Skeleton />;

    if (state === 'error') {
        return (
            <View testID="game-result-error" className={cardShell}>
                <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text">{t('results.title')}</Text>
                <Text className="text-gray-500 dark:text-cyber-muted mt-2">{t('results.loadFailed')}</Text>
                <TouchableOpacity
                    onPress={onRetry}
                    accessibilityRole="button"
                    className="mt-2 min-h-[44px] justify-center self-start"
                >
                    <Text className="text-brand-dark dark:text-brand-light font-bold">{t('common.retry', 'נסו שוב')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!result) {
        if (!(eligible && canEdit)) return null;
        return (
            <View testID="game-result-cta" className={cardShell}>
                <View className="flex-row items-center">
                    <View className="w-[38px] h-[38px] rounded-full bg-brand-mist dark:bg-cyber-border items-center justify-center">
                        <Ionicons name="trophy-outline" size={20} color={theme.deep} />
                    </View>
                    <Text className="ms-3 flex-1 text-lg font-bold text-gray-900 dark:text-cyber-text">{t('results.ctaTitle')}</Text>
                </View>
                <Text className="text-gray-500 dark:text-cyber-muted mt-2">{t('results.ctaBody')}</Text>
                <TouchableOpacity
                    onPress={onEdit}
                    accessibilityRole="button"
                    testID="game-result-edit"
                    className="mt-4 h-[52px] rounded-2xl bg-brand items-center justify-center"
                >
                    <Text className="text-white font-bold text-[16px]">{t('results.ctaButton')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const [a, b] = sides;
    if (!a || !b) return null;
    const swatch = (s: GameResultSide) => sideSwatchColor(s, teams, sport);
    const winner = winnerOf(sides);
    const isDraw = a.outcome === 'DRAW';
    const a11y = isDraw
        ? `${t('results.draw')} ${a.score}–${b.score}`
        : `${t('results.a11yScore', { a: a.label, aScore: a.score, b: b.label, bScore: b.score })}${winner ? `. ${t('results.wonBy', { side: winner.label })}` : ''}`;

    const numClass = (s: GameResultSide) =>
        isDraw || s.outcome === 'WIN'
            ? 'text-gray-900 dark:text-cyber-text font-extrabold'
            : 'text-gray-500 dark:text-cyber-muted font-bold';

    // Stat groups: A, B, unassigned
    const groups: { key: string; label: string; color: string | null; rows: { userId: string; values: Record<string, number> }[] }[] = [];
    for (const side of sides) {
        groups.push({
            key: side.id,
            label: side.label,
            color: swatch(side),
            rows: result.stats.filter((s) => s.sideId === side.id),
        });
    }
    groups.push({ key: 'none', label: t('results.unassigned'), color: null, rows: result.stats.filter((s) => !s.sideId) });
    const visibleGroups = groups.filter((g) => g.rows.length > 0);

    const sideColumn = (side: GameResultSide, testID: string) => (
        <View style={{ flex: 1 }} className="items-center" testID={testID}>
            <Swatch color={swatch(side)} />
            <Text
                numberOfLines={2}
                className="text-[14px] font-bold text-gray-900 dark:text-cyber-text text-center mt-1"
                accessibilityLabel={side.label}
            >
                {side.label}
            </Text>
        </View>
    );

    return (
        <View testID="game-result-panel" className={cardShell}>
            <View style={{ backgroundColor: theme.base }} className="absolute top-0 start-0 end-0 h-1" />
            <View className="flex-row items-center mt-1">
                <Ionicons name="trophy-outline" size={20} color={theme.deep} />
                <Text className="ms-2 flex-1 text-lg font-bold text-gray-900 dark:text-cyber-text">{t('results.title')}</Text>
                {locked ? (
                    <TouchableOpacity
                        testID="game-result-locked"
                        onPress={() => Alert.alert('', t('results.lockedHint'))}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('results.locked')}. ${t('results.lockedHint')}`}
                        className="flex-row items-center bg-gray-100 dark:bg-cyber-border rounded-full px-3 py-1.5 min-h-[32px] me-2"
                    >
                        <Ionicons name="lock-closed-outline" size={14} color="#6b7280" />
                        <Text className="ms-1 text-xs font-bold text-gray-600 dark:text-cyber-muted">{t('results.locked')}</Text>
                    </TouchableOpacity>
                ) : null}
                {canEdit ? (
                    <TouchableOpacity
                        testID="game-result-edit"
                        onPress={onEdit}
                        accessibilityRole="button"
                        className="flex-row items-center min-h-[44px] px-2"
                    >
                        <Ionicons name="create-outline" size={18} color={theme.deep} />
                        <Text className="ms-1 font-bold text-brand-dark dark:text-brand-light">{t('results.edit')}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            {(result.rounds?.length ?? 0) > 1 ? (
                <EveningBoard result={result} roster={roster} />
            ) : (
            <>
            {/* Scoreboard: three separate flex children so RTL puts side 0 at the start edge (rule 1.1) */}
            <View accessible accessibilityLabel={a11y} className="mt-5">
                <View className="flex-row items-center" importantForAccessibility="no-hide-descendants">
                    {sideColumn(a, 'game-result-side-0')}
                    <View className="flex-row items-center px-2" style={{ gap: 8 }}>
                        <Text testID="game-result-score-0" className={`text-[36px] leading-none ${numClass(a)}`} style={tabular}>
                            {a.score}
                        </Text>
                        <Text className="text-[36px] leading-none text-gray-300 dark:text-cyber-border">:</Text>
                        <Text testID="game-result-score-1" className={`text-[36px] leading-none ${numClass(b)}`} style={tabular}>
                            {b.score}
                        </Text>
                    </View>
                    {sideColumn(b, 'game-result-side-1')}
                </View>
                <View className="mt-2">
                    {isDraw ? (
                        <OutcomeChip outcome="DRAW" testID="game-result-outcome" />
                    ) : winner ? (
                        <View className="flex-row">
                            <View style={{ flex: 1 }} className="items-center">
                                {winner.order === 0 ? <OutcomeChip outcome="WIN" testID="game-result-outcome" /> : null}
                            </View>
                            <View style={{ width: 96 }} />
                            <View style={{ flex: 1 }} className="items-center">
                                {winner.order === 1 ? <OutcomeChip outcome="WIN" testID="game-result-outcome" /> : null}
                            </View>
                        </View>
                    ) : null}
                </View>
            </View>

            {sport === 'TENNIS' ? <SetGrid sides={sides} swatch={swatch} /> : null}

            {visibleGroups.length > 0 ? (
                <View testID="game-result-stats" className="mt-5 pt-4 border-t border-gray-100 dark:border-cyber-border">
                    {visibleGroups.map((g) => {
                        const expanded = showAllGroup[g.key];
                        const rows = expanded ? g.rows : g.rows.slice(0, COLLAPSE_AT);
                        return (
                            <View key={g.key} className="mb-3">
                                <View className="flex-row items-center mb-1">
                                    {g.color ? <Swatch color={g.color} /> : null}
                                    <Text className="ms-2 font-bold text-gray-900 dark:text-cyber-text" numberOfLines={1} style={{ flexShrink: 1 }}>
                                        {g.label} ({g.rows.length})
                                    </Text>
                                </View>
                                {rows.map((row) => {
                                    const player = rosterById.get(row.userId);
                                    const stats = describeStats(sport, row.values, lang);
                                    const name = player?.name ?? '';
                                    return (
                                        <View
                                            key={row.userId}
                                            className="flex-row items-center min-h-[44px]"
                                            accessible
                                            accessibilityLabel={`${name} ${stats.map((s) => s.text).join(', ')}`}
                                        >
                                            {player?.imageUrl ? (
                                                <Image source={{ uri: player.imageUrl }} className="w-8 h-8 rounded-full bg-gray-200" />
                                            ) : (
                                                <View className="w-8 h-8 rounded-full bg-gray-200 dark:bg-cyber-border" />
                                            )}
                                            <Text
                                                numberOfLines={1}
                                                className="ms-2 text-[14px] font-semibold text-gray-900 dark:text-cyber-text"
                                                style={{ flexShrink: 1, minWidth: 0, maxWidth: '50%' }}
                                            >
                                                {name}
                                            </Text>
                                            <Text
                                                className="ms-2 flex-1 text-[13px] text-gray-500 dark:text-cyber-muted"
                                                style={{ textAlign: 'auto' }}
                                            >
                                                {stats.map((s) => s.text).join(' · ')}
                                            </Text>
                                        </View>
                                    );
                                })}
                                {g.rows.length > COLLAPSE_AT && !expanded ? (
                                    <TouchableOpacity
                                        onPress={() => setShowAllGroup((p) => ({ ...p, [g.key]: true }))}
                                        className="min-h-[44px] justify-center"
                                    >
                                        <Text className="text-brand-dark dark:text-brand-light font-semibold">
                                            {t('results.showAllPlayers', { count: g.rows.length })}
                                        </Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        );
                    })}
                </View>
            ) : null}
            </>
            )}

            {result.notes ? (
                <View testID="game-result-notes" className="mt-2 ps-3 border-s-[3px] border-gray-200 dark:border-cyber-border">
                    <Text className="text-gray-800 dark:text-cyber-text">{result.notes}</Text>
                </View>
            ) : null}

            <View className="mt-4">
                <View testID="game-result-recorded-by" className="flex-row items-start">
                    <Ionicons name="information-circle-outline" size={14} color="#9ca3af" style={{ marginTop: 2 }} />
                    <Text className="ms-1 flex-1 text-xs text-gray-500 dark:text-cyber-muted">
                        {[
                            result.recordedBy ? t('results.recordedBy', { name: result.recordedBy.name }) : null,
                            t('results.selfReported'),
                            result.editedAt ? t('results.updatedAt', { date: formatShortDate(result.editedAt, lang) }) : null,
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </Text>
                </View>
                {viewerCanDispute && !canEdit ? (
                    disputed ? (
                        <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-2">{t('results.disputed')}</Text>
                    ) : (
                        <TouchableOpacity
                            testID="game-result-dispute"
                            onPress={onDispute}
                            accessibilityRole="button"
                            className="flex-row items-center min-h-[44px] self-start"
                        >
                            <Ionicons name="flag-outline" size={14} color="#6b7280" />
                            <Text className="ms-1 text-[13px] font-semibold text-gray-500 dark:text-cyber-muted">{t('results.dispute')}</Text>
                        </TouchableOpacity>
                    )
                ) : null}
            </View>
        </View>
    );
}
