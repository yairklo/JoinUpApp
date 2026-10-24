import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, I18nManager, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';
import type { BracketMatch, BracketStage, TournamentMatch } from '@/types/tournament';
import BracketCell from './BracketCell';
import type { Lang } from './matchFormat';
import { bracketRoundKey } from './tournamentTokens';

interface Props {
    stage: BracketStage;
    numberById?: Record<string, number>;
    groupNames?: Record<string, string>;
    myTeamId?: string | null;
    sport?: string;
    lang?: Lang;
    /** `rounds` (phone default, one round at a time with snap) or `tree` (whole bracket, pan + zoom). */
    mode?: 'rounds' | 'tree';
    /** Rounds mode: only this team's matches across rounds, stacked ("my team's path"). */
    onlyTeamId?: string | null;
    /** Tournament COMPLETED: the final gets a trophy. */
    completed?: boolean;
    changedMatchIds?: string[];
    onOpenMatch?: (match: TournamentMatch) => void;
    testID?: string;
}

const PEEK = 24;
const CELL_W = 216;
const SLOT_H = 112;
const THIRD = -1;

interface Page {
    key: number;
    title: string;
    matches: BracketMatch[];
    /** Round number of the next round (to name the match the pair feeds), null for final/third. */
    nextMatches: BracketMatch[];
}

function usePages(stage: BracketStage): Page[] {
    const { t } = useTranslation();
    return useMemo(() => {
        const rounds = [...stage.rounds].sort((a, b) => a.round - b.round);
        const third = rounds.flatMap((r) => r.matches.filter((m) => m.isThirdPlace));
        const pages: Page[] = rounds.map((r, i) => {
            const rk = bracketRoundKey(r.name);
            return {
                key: r.round,
                title: rk ? (t(rk.key, rk.params as any) as string) : (t('tournaments.schedule.round', { n: r.round }) as string),
                matches: r.matches.filter((m) => !m.isThirdPlace),
                nextMatches: rounds[i + 1]?.matches.filter((m) => !m.isThirdPlace) ?? [],
            };
        });
        const out = pages.filter((p) => p.matches.length > 0);
        if (third.length) out.push({ key: THIRD, title: t('tournaments.bracket.thirdPlace') as string, matches: third, nextMatches: [] });
        return out;
    }, [stage, t]);
}

const isMine = (m: BracketMatch, teamId?: string | null) => !!teamId && (m.home.teamId === teamId || m.away.teamId === teamId);

/** Which round to open on: the first with an unfinished match, else the final. */
function currentIndex(pages: Page[]): number {
    const i = pages.findIndex((p) => p.key !== THIRD && p.matches.some((m) => m.status !== 'FINISHED' && m.status !== 'FORFEIT' && m.status !== 'CANCELLED'));
    if (i >= 0) return i;
    const f = pages.filter((p) => p.key !== THIRD).length - 1;
    return Math.max(0, f);
}

/**
 * Knockout bracket (spec 9). Phone default: round pills plus a snapping horizontal pager (explicit
 * index state drives `scrollToOffset`, never I18nManager auto-mirroring), pairs of cells grouped
 * with an end-edge "]" and a "winners meet in match n" caption. `tree` mode lays all rounds out as
 * columns (round 1 at the start edge) inside a pan/zoom ScrollView. Props only.
 */
export default function BracketView({ stage, numberById, groupNames, myTeamId, sport, lang = 'he', mode = 'rounds', onlyTeamId, completed, changedMatchIds, onOpenMatch, testID = 'bracket-view' }: Props) {
    const { t } = useTranslation();
    const { colorMode } = useColorMode();
    const pages = usePages(stage);
    const [index, setIndex] = useState(() => currentIndex(pages));
    const [width, setWidth] = useState(0);
    const listRef = useRef<FlatList<Page>>(null);
    const pageW = Math.max(1, width - PEEK);
    const finalKey = pages.filter((p) => p.key !== THIRD).slice(-1)[0]?.key;
    const dark = colorMode === 'dark';
    const lineColor = dark ? '#374151' : '#d1d5db';

    useEffect(() => {
        setIndex((i) => Math.min(i, Math.max(0, pages.length - 1)));
    }, [pages.length]);

    const goTo = useCallback(
        (i: number) => {
            setIndex(i);
            listRef.current?.scrollToOffset({ offset: i * pageW, animated: true });
        },
        [pageW]
    );

    const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const x = Math.abs(e.nativeEvent.contentOffset.x);
        setIndex(Math.max(0, Math.min(pages.length - 1, Math.round(x / pageW))));
    };

    const cell = (m: BracketMatch, w?: number) => (
        <BracketCell
            key={m.id}
            match={m}
            numberById={numberById}
            groupNames={groupNames}
            sport={sport}
            lang={lang}
            width={w}
            highlight={isMine(m, myTeamId)}
            champion={!!completed && m.id === pages.find((p) => p.key === finalKey)?.matches[0]?.id}
            changed={!!changedMatchIds?.includes(m.id)}
            onPress={onOpenMatch}
        />
    );

    if (pages.length === 0) return <View testID={testID} />;

    // ---------- tree mode
    if (mode === 'tree') {
        const main = pages.filter((p) => p.key !== THIRD);
        const slots = main[0]?.matches.length ?? 1;
        const H = Math.max(1, slots) * SLOT_H;
        const third = pages.find((p) => p.key === THIRD);
        return (
            <View testID={testID}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 560 }}>
                    <ScrollView horizontal nestedScrollEnabled maximumZoomScale={2} minimumZoomScale={0.5} bouncesZoom showsHorizontalScrollIndicator>
                        <View className="flex-row px-1">
                            {main.map((p, ci) => (
                                <View key={p.key} testID={`bracket-round-${p.key}`} className="me-8" style={{ width: CELL_W }}>
                                    <Text className="text-xs font-bold text-gray-700 dark:text-cyber-text mb-2">{p.title}</Text>
                                    <View style={{ height: H }}>
                                        {ci < main.length - 1
                                            ? chunk(p.matches, 2).map((pair, pi) => (
                                                  <View key={pi} style={{ flex: pair.length, justifyContent: 'space-around', borderEndWidth: 2, borderColor: lineColor, borderTopEndRadius: 6, borderBottomEndRadius: 6 }}>
                                                      {pair.map((m) => (
                                                          <View key={m.id} style={{ justifyContent: 'center', flex: 1 }}>{cell(m, CELL_W - 8)}</View>
                                                      ))}
                                                  </View>
                                              ))
                                            : p.matches.map((m) => (
                                                  <View key={m.id} style={{ justifyContent: 'center', flex: 1 }}>{cell(m, CELL_W - 8)}</View>
                                              ))}
                                    </View>
                                    {p.key === finalKey && third ? (
                                        <View testID="bracket-third-place" className="mt-3">
                                            <Text className="text-xs font-bold text-gray-700 dark:text-cyber-text mb-1">{third.title}</Text>
                                            {third.matches.map((m) => cell(m, CELL_W - 8))}
                                        </View>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    </ScrollView>
                </ScrollView>
            </View>
        );
    }

    // ---------- my path (filtered, stacked)
    if (onlyTeamId) {
        return (
            <View testID={testID}>
                {pages.map((p) => {
                    const mine = p.matches.filter((m) => isMine(m, onlyTeamId));
                    if (!mine.length) return null;
                    return (
                        <View key={p.key} className="mb-3">
                            <Text className="text-xs font-bold text-gray-700 dark:text-cyber-text mb-1">{p.title}</Text>
                            {mine.map((m) => cell(m))}
                        </View>
                    );
                })}
            </View>
        );
    }

    // ---------- round by round
    const arrow = I18nManager.isRTL ? 'arrow-back' : 'arrow-forward';
    const renderPage = ({ item: p }: { item: Page }) => (
        <View testID={`bracket-round-${p.key}`} style={{ width: pageW }} className="pe-2">
            {chunk(p.matches, 2).map((pair, pi) => {
                const next = p.nextMatches.find((n) => pair.some((m) => n.home.source && 'matchId' in n.home.source && n.home.source.matchId === m.id || n.away.source && 'matchId' in n.away.source && n.away.source.matchId === m.id));
                return (
                    <View key={pi} className="mb-3">
                        <View
                            className="rounded-2xl p-2 bg-gray-50 dark:bg-cyber-bg"
                            style={pair.length === 2 && p.key !== finalKey ? { borderEndWidth: 2, borderColor: lineColor } : undefined}
                        >
                            {pair.map((m, i) => (
                                <View key={m.id} className={i === 0 ? '' : 'mt-2'}>{cell(m)}</View>
                            ))}
                        </View>
                        {pair.length === 2 && next ? (
                            <View className="flex-row items-center mt-1 px-1">
                                <Ionicons name={arrow} size={12} color={dark ? '#9ca3af' : '#6b7280'} />
                                <Text className="text-[11px] text-gray-500 dark:text-cyber-muted ms-1">{t('tournaments.bracket.pairNext', { n: next.number })}</Text>
                            </View>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );

    return (
        <View testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                {pages.map((p, i) => (
                    <Pressable
                        key={p.key}
                        testID={`bracket-round-pill-${p.key}`}
                        onPress={() => goTo(i)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: i === index }}
                        className={`px-3 rounded-full me-2 items-center justify-center ${i === index ? 'bg-gray-900 dark:bg-cyber-text' : 'bg-gray-100 dark:bg-cyber-border'}`}
                        style={{ minHeight: 44 }}
                    >
                        <Text className={`text-[13px] font-bold ${i === index ? 'text-white dark:text-cyber-bg' : 'text-gray-700 dark:text-cyber-text'}`}>{p.title}</Text>
                    </Pressable>
                ))}
            </ScrollView>
            {width > 0 ? (
                <FlatList
                    ref={listRef}
                    data={pages}
                    keyExtractor={(p) => String(p.key)}
                    renderItem={renderPage}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={pageW}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    disableIntervalMomentum
                    onMomentumScrollEnd={onEnd}
                    getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
                    initialScrollIndex={index}
                    extraData={`${changedMatchIds?.join(',')}|${myTeamId}|${width}`}
                />
            ) : null}
        </View>
    );
}

function chunk<T>(arr: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}
