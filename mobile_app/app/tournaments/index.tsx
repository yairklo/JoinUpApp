import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SPORT_EMOJI, SPORT_KEYS, SPORT_MAPPING } from '@/utils/sports';
import { useMyInvites, useTournamentCapabilities, useTournaments } from '@/hooks/useTournaments';
import { getSportTheme } from '@/components/ui/SportCover';
import TournamentCard from '@/components/tournaments/TournamentCard';
import { EmptyState, ErrorState, Pill, SkeletonList } from '@/components/tournaments/tabs/TabState';
import { sectionOf, STATUS_FILTERS, toListFilters, type SectionKey, type StatusFilterKey } from '@/components/tournaments/shellUtils';
import type { Lang } from '@/components/tournaments/matchFormat';
import type { Tournament } from '@/types/tournament';

const SECTION_ORDER: SectionKey[] = ['drafts', 'open', 'live', 'done'];
const SECTION_TITLE: Record<SectionKey, string> = {
    drafts: 'tournaments.myDrafts',
    open: 'tournaments.sectionOpen',
    live: 'tournaments.sectionLive',
    done: 'tournaments.sectionDone',
};

/** Tournaments list / discovery (spec 1): sport + status + "mine" filters, sections when unfiltered. */
export default function TournamentsListScreen() {
    const { t, i18n } = useTranslation();
    const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const router = useRouter();
    const { isSignedIn } = useAuth();
    const { canCreate } = useTournamentCapabilities();
    const { count: inviteCount } = useMyInvites();
    const [status, setStatus] = useState<StatusFilterKey>('all');
    const [sport, setSport] = useState<string | null>(null);
    const [mine, setMine] = useState(false);
    const filtered = status !== 'all' || !!sport || mine;
    const { tournaments, loading, error, refetch } = useTournaments(toListFilters(status, sport, mine));
    const [refreshing, setRefreshing] = useState(false);

    const sections = useMemo(() => {
        const by: Record<SectionKey, Tournament[]> = { drafts: [], open: [], live: [], done: [] };
        for (const x of tournaments) by[sectionOf(x)].push(x);
        return SECTION_ORDER.map((k) => ({ key: k, items: by[k] })).filter((s) => s.items.length > 0);
    }, [tournaments]);

    const open = (x: Tournament) => router.push(`/tournaments/${x.id}` as any);
    const clear = () => {
        setStatus('all');
        setSport(null);
        setMine(false);
    };

    return (
        <View className="flex-1 bg-gray-50 dark:bg-cyber-bg" testID="tournaments-list">
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: t('tournaments.title') as string,
                    headerRight: canCreate
                        ? () => (
                              <Pressable
                                  testID="tournaments-create"
                                  onPress={() => router.push('/tournaments/new' as any)}
                                  accessibilityRole="button"
                                  accessibilityLabel={t('tournaments.new')}
                                  hitSlop={8}
                                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                              >
                                  <Ionicons name="add" size={26} color="#059669" />
                              </Pressable>
                          )
                        : undefined,
                }}
            />
            <ScrollView
                contentContainerStyle={{ paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={async () => {
                            setRefreshing(true);
                            await refetch();
                            setRefreshing(false);
                        }}
                    />
                }
            >
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12 }}>
                    {SPORT_KEYS.map((k: string) => {
                        const selected = sport === k;
                        const theme = getSportTheme(k);
                        return (
                            <Pressable
                                key={k}
                                testID={`tournaments-filter-sport-${k}`}
                                onPress={() => setSport(selected ? null : k)}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                className={`px-3.5 rounded-full me-2 flex-row items-center justify-center border ${
                                    selected ? '' : 'bg-white dark:bg-cyber-card border-gray-200 dark:border-cyber-border'
                                }`}
                                style={[{ minHeight: 44 }, selected ? { backgroundColor: theme.base, borderColor: theme.base } : null]}
                            >
                                <Text className="me-1.5">{SPORT_EMOJI[k as keyof typeof SPORT_EMOJI]}</Text>
                                <Text className={`text-[13px] font-bold ${selected ? 'text-white' : 'text-gray-700 dark:text-cyber-text'}`}>
                                    {SPORT_MAPPING[k as keyof typeof SPORT_MAPPING]}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                    {STATUS_FILTERS.map((s) => (
                        <Pill key={s.key} testID={`tournaments-filter-status-${s.key}`} label={t(s.label)} selected={status === s.key} onPress={() => setStatus(s.key)} />
                    ))}
                    {isSignedIn ? <Pill testID="tournaments-filter-mine" label={t('tournaments.mine')} selected={mine} onPress={() => setMine((v) => !v)} /> : null}
                    {isSignedIn && inviteCount > 0 ? (
                        <Pill testID="tournaments-invites" label={t('tournaments.invitesButton', { count: inviteCount })} selected={false} onPress={() => router.push('/tournaments/invites' as any)} />
                    ) : null}
                </ScrollView>

                <View className="px-4 pt-2">
                    {loading && tournaments.length === 0 ? (
                        <SkeletonList count={6} height={210} testID="tournaments-skeleton" />
                    ) : error && tournaments.length === 0 ? (
                        <ErrorState onRetry={refetch} error={error} testID="tournaments-error" />
                    ) : tournaments.length === 0 ? (
                        filtered ? (
                            <EmptyState icon="funnel-outline" text={t('tournaments.emptyFiltered')} actionLabel={t('tournaments.clearFilters')} onAction={clear} testID="tournaments-empty" />
                        ) : (
                            <View testID="tournaments-empty" className="items-center py-12 px-6">
                                <Text style={{ fontSize: 44 }} accessibilityElementsHidden importantForAccessibility="no">🏆</Text>
                                <Text accessibilityRole="header" className="text-[18px] font-extrabold text-gray-900 dark:text-cyber-text mt-2">
                                    {t('tournaments.emptyTitle')}
                                </Text>
                                <Text className="text-[14px] text-gray-600 dark:text-cyber-muted text-center mt-1">{t('tournaments.emptyBody')}</Text>
                                {canCreate ? (
                                    <Pressable
                                        onPress={() => router.push('/tournaments/new' as any)}
                                        accessibilityRole="button"
                                        className="mt-4 px-6 rounded-full bg-brand items-center justify-center"
                                        style={{ minHeight: 48 }}
                                    >
                                        <Text className="text-white font-bold">{t('tournaments.new')}</Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        )
                    ) : filtered ? (
                        tournaments.map((x) => <TournamentCard key={x.id} tournament={x} lang={lang} onPress={open} />)
                    ) : (
                        sections.map((s) => (
                            <View key={s.key} testID={`tournaments-section-${s.key}`}>
                                <Text accessibilityRole="header" className="text-[18px] font-extrabold text-gray-900 dark:text-cyber-text mt-3 mb-2">
                                    {t(SECTION_TITLE[s.key])}
                                </Text>
                                {s.items.map((x) => (
                                    <TournamentCard key={x.id} tournament={x} lang={lang} onPress={open} />
                                ))}
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
