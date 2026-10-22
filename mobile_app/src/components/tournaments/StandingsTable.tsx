import React, { useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';
import { tabular } from '@/components/results/resultUtils';
import type { StandingsRow, StandingsTable as StandingsTableData } from '@/types/tournament';
import TeamBadge from './TeamBadge';
import { fmtGd } from './matchFormat';
import { TOURNAMENT_ICONS } from './tournamentTokens';

interface Props {
    table: StandingsTableData;
    myTeamId?: string | null;
    /** Rows with `rank <= advanceCount` get the qualification bar and dashed line. */
    advanceCount?: number;
    /** Tournament COMPLETED: a complete table shows a trophy before the winner. */
    tournamentCompleted?: boolean;
    canManage?: boolean;
    onSetManualRank?: () => void;
    /** Force a mode. Default: compact below 600px with a switch, full from 600px. */
    mode?: 'compact' | 'full';
    /** Show the table title (stage / group name). Default true. */
    showTitle?: boolean;
}

const ROW_H = 48;
const TEAM_COL = 140;
const NUM_COL = 44;
const LTR = { writingDirection: 'ltr' as const };

type NumKey = 'played' | 'won' | 'drawn' | 'lost' | 'gf' | 'ga' | 'gd' | 'points';
const FULL_COLS: NumKey[] = ['played', 'won', 'drawn', 'lost', 'gf', 'ga', 'gd', 'points'];

function cell(row: StandingsRow, k: NumKey): string {
    return k === 'gd' ? fmtGd(row.gd) : String(row[k]);
}

/**
 * Group / league table (spec 8). Compact 5-column table on a phone (rank, team, played, goal
 * difference, points; tap a row for W/D/L and goals), full 10-column table behind a switch with a
 * pinned rank+team column and a horizontal scroller for the numbers. Props only.
 */
export default function StandingsTable({ table, myTeamId, advanceCount, tournamentCompleted, canManage, onSetManualRank, mode, showTitle = true }: Props) {
    const { t } = useTranslation();
    const { colorMode } = useColorMode();
    const { width } = useWindowDimensions();
    const wide = width >= 600;
    const [full, setFull] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const isFull = mode ? mode === 'full' : wide || full;
    const dark = colorMode === 'dark';
    const rows = table.rows;
    const noMatches = rows.every((r) => r.played === 0);
    const hasZone = !!advanceCount && advanceCount > 0 && advanceCount < rows.length;
    const lastQualifier = hasZone ? rows.filter((r) => r.rank <= (advanceCount as number)).length : 0;
    const tid = `standings-table-${table.stageId}-${table.groupId ?? 'all'}`;

    const rankCell = (r: StandingsRow) => (
        <View className="flex-row items-center justify-center" style={{ width: 36 }}>
            {r.manualRank != null ? (
                <Ionicons name={TOURNAMENT_ICONS.manualRank} size={12} color={dark ? '#9ca3af' : '#6b7280'} accessibilityLabel={t('tournaments.standings.manual')} />
            ) : null}
            <Text
                accessibilityHint={r.tied ? t('tournaments.standings.tied') : undefined}
                className={`text-[13px] ${r.tied ? 'text-gray-500 dark:text-cyber-muted' : 'text-gray-900 dark:text-cyber-text'} font-semibold`}
                style={tabular}
            >
                {r.tied ? '=' : ''}
                {r.rank}
            </Text>
        </View>
    );

    const teamCell = (r: StandingsRow, w?: number) => {
        const winner = tournamentCompleted && table.complete && r.rank === 1 && !r.tied && table.stageType === 'LEAGUE';
        return (
            <View className="flex-row items-center" style={w ? { width: w } : { flex: 1, minWidth: 0 }}>
                {winner ? <Ionicons name={TOURNAMENT_ICONS.champion} size={14} color="#d97706" style={{ marginEnd: 4 }} /> : null}
                <TeamBadge name={r.team.name} color={r.team.color} logoUrl={r.team.logoUrl} bold={r.team.id === myTeamId} />
            </View>
        );
    };

    const rowShell = (r: StandingsRow, children: React.ReactNode, extra?: { onPress?: () => void; testID?: string }) => {
        const mine = r.team.id === myTeamId;
        const inZone = hasZone && r.rank <= (advanceCount as number);
        const content = (
            <View
                className={`flex-row items-center ${mine ? 'bg-brand-mist dark:bg-brand-ink' : ''}`}
                style={{ height: ROW_H }}
            >
                <View className={`self-stretch w-[3px] ${inZone ? 'bg-brand' : ''}`} />
                {children}
            </View>
        );
        const line =
            hasZone && lastQualifier > 0 && rows[lastQualifier - 1] === r ? (
                <View className="border-b border-dashed border-gray-300 dark:border-cyber-muted" />
            ) : null;
        return (
            <View key={r.team.id}>
                {extra?.onPress ? (
                    <Pressable testID={extra.testID} onPress={extra.onPress} accessibilityRole="button" accessibilityLabel={r.team.name}>
                        {content}
                    </Pressable>
                ) : (
                    <View testID={extra?.testID}>{content}</View>
                )}
                {line}
            </View>
        );
    };

    const headCls = 'text-[11px] font-bold text-gray-500 dark:text-cyber-muted text-center';
    const head = (k: NumKey, w: number) => (
        <Text key={k} accessibilityLabel={t(`tournaments.standings.${k === 'gd' || k === 'gf' || k === 'ga' ? k : k + 'Full'}`)} className={headCls} style={{ width: w }}>
            {t(`tournaments.standings.${k}`)}
        </Text>
    );

    const compactRows = (
        <View>
            <View className="flex-row items-center" style={{ height: 32 }}>
                <View style={{ width: 3 }} />
                <Text className={headCls} style={{ width: 36 }}>{t('tournaments.standings.rank')}</Text>
                <Text className="text-[11px] font-bold text-gray-500 dark:text-cyber-muted flex-1 ms-1">{t('tournaments.standings.team')}</Text>
                {head('played', 32)}
                {head('gd', 40)}
                {head('points', 40)}
            </View>
            {rows.map((r) => {
                const detail = open === r.team.id;
                return (
                    <View key={r.team.id}>
                        {rowShell(
                            r,
                            <>
                                {rankCell(r)}
                                <View className="flex-1 ms-1" style={{ minWidth: 0 }}>{teamCell(r)}</View>
                                <Text className="text-[13px] text-center text-gray-700 dark:text-cyber-text" style={[tabular, { width: 32 }]}>{r.played}</Text>
                                <Text className="text-[13px] text-center text-gray-700 dark:text-cyber-text" style={[tabular, LTR, { width: 40 }]}>{fmtGd(r.gd)}</Text>
                                <Text className="text-[13px] text-center font-extrabold text-gray-900 dark:text-cyber-text" style={[tabular, { width: 40 }]}>{r.points}</Text>
                            </>,
                            { onPress: () => setOpen(detail ? null : r.team.id), testID: `standings-row-${r.team.id}` }
                        )}
                        {detail ? (
                            <Text
                                testID={`standings-row-detail-${r.team.id}`}
                                className="text-xs text-gray-500 dark:text-cyber-muted px-4 pb-2"
                            >
                                {t('tournaments.standings.detailLine', { w: r.won, d: r.drawn, l: r.lost, gf: r.gf, ga: r.ga })}
                            </Text>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );

    const fullRows = (
        <View className="flex-row">
            <View style={{ width: 3 + 36 + TEAM_COL }}>
                <View className="flex-row items-center" style={{ height: 32 }}>
                    <View style={{ width: 3 }} />
                    <Text className={headCls} style={{ width: 36 }}>{t('tournaments.standings.rank')}</Text>
                    <Text className="text-[11px] font-bold text-gray-500 dark:text-cyber-muted ms-1">{t('tournaments.standings.team')}</Text>
                </View>
                {rows.map((r) =>
                    rowShell(
                        r,
                        <>
                            {rankCell(r)}
                            <View className="ms-1" style={{ width: TEAM_COL - 4 }}>{teamCell(r, TEAM_COL - 4)}</View>
                        </>,
                        { testID: `standings-row-${r.team.id}` }
                    )
                )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} testID="standings-scroll">
                <View>
                    <View className="flex-row items-center" style={{ height: 32 }}>
                        {FULL_COLS.map((k) => head(k, NUM_COL))}
                    </View>
                    {rows.map((r) => (
                        <View key={r.team.id}>
                            <View className={`flex-row items-center ${r.team.id === myTeamId ? 'bg-brand-mist dark:bg-brand-ink' : ''}`} style={{ height: ROW_H }}>
                                {FULL_COLS.map((k) => (
                                    <Text
                                        key={k}
                                        className={`text-[13px] text-center ${k === 'points' ? 'font-extrabold text-gray-900' : 'text-gray-700'} dark:text-cyber-text`}
                                        style={[tabular, k === 'gd' ? LTR : null, { width: NUM_COL }]}
                                    >
                                        {cell(r, k)}
                                    </Text>
                                ))}
                            </View>
                            {hasZone && rows[lastQualifier - 1] === r ? <View className="border-b border-dashed border-gray-300 dark:border-cyber-muted" /> : null}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );

    return (
        <View testID={tid} className="mb-4">
            {showTitle ? (
                <Text className="text-base font-extrabold text-gray-900 dark:text-cyber-text mb-1">
                    {table.groupName ?? table.stageName}
                </Text>
            ) : null}
            {!table.complete ? (
                <Text className="text-xs text-gray-500 dark:text-cyber-muted mb-2">
                    {noMatches ? t('tournaments.standings.noMatches') : t('tournaments.standings.notFinal')}
                </Text>
            ) : null}
            {table.needsManualRank ? (
                <View testID="standings-needs-manual-rank" className="rounded-xl p-3 mb-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800">
                    <Text className="text-[13px] text-amber-800 dark:text-amber-200">{t('tournaments.standings.needsManualViewer')}</Text>
                    {canManage && onSetManualRank ? (
                        <Pressable
                            testID="standings-set-order"
                            onPress={onSetManualRank}
                            accessibilityRole="button"
                            className="self-start mt-2 px-3 rounded-full bg-amber-600 items-center justify-center"
                            style={{ minHeight: 44 }}
                        >
                            <Text className="text-white text-[13px] font-bold">{t('tournaments.standings.setOrder')}</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}
            <View className="rounded-2xl overflow-hidden bg-white dark:bg-cyber-card border border-gray-100 dark:border-cyber-border">
                {isFull ? fullRows : compactRows}
            </View>
            <View className="flex-row items-center justify-between mt-2">
                {hasZone ? (
                    <View className="flex-row items-center flex-1">
                        <View className="w-2 h-2 rounded-full bg-brand me-1.5" />
                        <Text className="text-xs text-gray-500 dark:text-cyber-muted">{t('tournaments.standings.advance')}</Text>
                    </View>
                ) : (
                    <View />
                )}
                {!wide && !mode ? (
                    <Pressable
                        testID="standings-mode-toggle"
                        onPress={() => setFull((v) => !v)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: full }}
                        accessibilityLabel={t('tournaments.standings.allColumns')}
                        className="flex-row items-center px-3 rounded-full border border-gray-300 dark:border-cyber-border"
                        style={{ minHeight: 44 }}
                    >
                        <Ionicons name={full ? 'checkbox' : 'square-outline'} size={16} color={dark ? '#9ca3af' : '#4b5563'} />
                        <Text className="text-xs font-semibold text-gray-700 dark:text-cyber-text ms-1.5">{t('tournaments.standings.allColumns')}</Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}
