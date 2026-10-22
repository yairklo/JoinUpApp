import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useTournamentSchedule } from '@/hooks/useTournamentViews';
import { useTournamentAdminMutations } from '@/hooks/useTournamentMutations';
import { tournamentErrorKey, tournamentErrorParams } from '@/utils/tournamentErrors';
import { getSportTheme } from '@/components/ui/SportCover';
import ChampionBanner, { tournamentLink } from '@/components/tournaments/ChampionBanner';
import JoinCodeEntry from '@/components/tournaments/JoinCodeEntry';
import ScoreEntrySheet from '@/components/tournaments/ScoreEntrySheet';
import TournamentHero from '@/components/tournaments/TournamentHero';
import { UpdatedCue } from '@/components/tournaments/UpdatedCue';
import { heroCta } from '@/components/tournaments/heroCta';
import BracketTab from '@/components/tournaments/tabs/BracketTab';
import OverviewTab from '@/components/tournaments/tabs/OverviewTab';
import ScheduleTab from '@/components/tournaments/tabs/ScheduleTab';
import StandingsTab from '@/components/tournaments/tabs/StandingsTab';
import { Pill } from '@/components/tournaments/tabs/TabState';
import TeamsTab from '@/components/tournaments/tabs/TeamsTab';
import TopPlayersTab from '@/components/tournaments/tabs/TopPlayersTab';
import type { Lang } from '@/components/tournaments/matchFormat';
import type { TournamentMatch } from '@/types/tournament';

type TabKey = 'overview' | 'teams' | 'schedule' | 'standings' | 'bracket' | 'leaders';

/**
 * Tournament page shell (spec 2): hero, champion moment, pill tabs (sticky via `stickyHeaderIndices`,
 * no native top-tabs: RTL), tab content mounting the existing tab components, a sticky bottom CTA from
 * the role matrix and the score entry sheet for scorekeeper+ (`onScoreMatch`).
 */
export default function TournamentPageScreen() {
    const { t, i18n } = useTranslation();
    const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { isSignedIn } = useAuth();
    const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
    const { tournament, loading, notFound, error, refetch, updated } = useTournament(id);
    const { stages, matches } = useTournamentSchedule(id);
    const admin = useTournamentAdminMutations(id);
    const [tab, setTab] = useState<TabKey>((tabParam as TabKey) || 'overview');
    const [scoring, setScoring] = useState<TournamentMatch | null>(null);
    const [codeOpen, setCodeOpen] = useState(false);

    const tr = tournament;
    const theme = getSportTheme(tr?.sport);
    const cta = tr ? heroCta(tr, !!isSignedIn) : null;
    const liveCount = matches.filter((m) => m.status === 'LIVE').length;
    const hasKnockout = stages.some((s) => s.type === 'KNOCKOUT') || tr?.format === 'KNOCKOUT' || tr?.format === 'GROUPS_KNOCKOUT';

    const tabs = useMemo(() => {
        const list: TabKey[] = ['overview', 'teams', 'schedule'];
        if (tr?.format === 'LEAGUE' || tr?.format === 'GROUPS_KNOCKOUT') list.push('standings');
        if (hasKnockout) list.push('bracket');
        if ((tr?.counts?.matchesFinished ?? 0) > 0) list.push('leaders');
        return list;
    }, [tr?.format, tr?.counts?.matchesFinished, hasKnockout]);

    // A tab that disappears (e.g. a status change) falls back to the overview.
    useEffect(() => {
        if (tr && !tabs.includes(tab)) setTab('overview');
    }, [tabs, tab, tr]);

    if (loading && !tr) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-cyber-bg" testID="tournament-loading">
                <Stack.Screen options={{ headerShown: true, title: '' }} />
                <ActivityIndicator color="#059669" />
            </View>
        );
    }
    if (!tr) {
        const failed = !!error && !notFound;
        return (
            <View className="flex-1 items-center justify-center px-8 bg-gray-50 dark:bg-cyber-bg" testID="tournament-unavailable">
                <Stack.Screen options={{ headerShown: true, title: '' }} />
                <Ionicons name="trophy-outline" size={40} color="#9ca3af" />
                <Text className="mt-3 text-center text-gray-600 dark:text-cyber-muted">{failed ? t('tournaments.view.loadFailed') : t('tournaments.match.notFound')}</Text>
                <Pressable
                    onPress={() => (failed ? refetch() : router.back())}
                    accessibilityRole="button"
                    style={{ minHeight: 44 }}
                    className="mt-4 px-5 rounded-xl border border-gray-300 dark:border-cyber-border items-center justify-center"
                >
                    <Text className="font-bold text-gray-800 dark:text-cyber-text">{failed ? t('tournaments.view.retry') : t('common.back')}</Text>
                </Pressable>
            </View>
        );
    }

    const canScore = !!tr.capabilities?.canScore;
    const onScoreMatch = (m: TournamentMatch) => setScoring(m);

    const runCta = () => {
        if (!cta) return;
        switch (cta.kind) {
            case 'manage':
                return router.push(`/tournaments/${tr.id}/manage` as any);
            case 'enterScores':
                return setTab('schedule');
            case 'manageTeam':
            case 'myTeam':
                return router.push(`/tournaments/${tr.id}/team/${tr.myTeam?.id}` as any);
            case 'signIn':
                return router.push('/sign-in' as any);
            case 'register':
                return router.push(`/tournaments/${tr.id}/team/new` as any);
        }
    };

    const publish = () =>
        Alert.alert(t('tournaments.wizard.publishConfirmTitle', { defaultValue: t('tournaments.publish') }) as string, t('tournaments.manage.status.publishConfirm') as string, [
            { text: t('tournaments.hero.cancel') as string, style: 'cancel' },
            {
                text: t('tournaments.publish') as string,
                onPress: async () => {
                    try {
                        await admin.setStatus('REGISTRATION_OPEN');
                        await refetch();
                    } catch (e) {
                        const key = tournamentErrorKey(e as any);
                        Alert.alert(key ? (t(key, tournamentErrorParams(e as any)) as string) : (t('tournaments.view.loadFailed') as string));
                    }
                },
            },
        ]);

    const share = () => void Share.share({ message: `${tr.title}\n${tournamentLink(tr.id)}` });

    const content = (() => {
        const props = { tournamentId: tr.id, canScore, onScoreMatch };
        switch (tab) {
            case 'teams':
                return <TeamsTab {...props} />;
            case 'schedule':
                return <ScheduleTab {...props} />;
            case 'standings':
                return <StandingsTab {...props} />;
            case 'bracket':
                return <BracketTab {...props} />;
            case 'leaders':
                return <TopPlayersTab {...props} />;
            default:
                return <OverviewTab {...props} onGoTab={setTab} />;
        }
    })();

    return (
        <View className="flex-1 bg-gray-50 dark:bg-cyber-bg" testID="tournament-page">
            <Stack.Screen options={{ headerShown: true, title: tr.title }} />
            <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: cta ? 96 + insets.bottom : 32 }}>
                <View>
                    <TournamentHero
                        tournament={tr}
                        lang={lang}
                        liveCount={liveCount}
                        hasSchedule={matches.length > 0}
                        onGoLive={() => setTab('schedule')}
                        onPublish={publish}
                        onShare={share}
                        onEdit={() => router.push(`/tournaments/${tr.id}/edit` as any)}
                        onOpenInvite={(teamId) => router.push(`/tournaments/${tr.id}/team/${teamId}` as any)}
                    />
                    {tr.status === 'COMPLETED' ? <ChampionBanner tournament={tr} /> : null}
                </View>
                <View className="bg-gray-50 dark:bg-cyber-bg">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }} testID="tournament-tabs">
                        {tabs.map((k) => (
                            <Pill key={k} testID={`tournament-tab-${k}`} label={t(`tournaments.tabs.${k}`)} selected={tab === k} onPress={() => setTab(k)} />
                        ))}
                    </ScrollView>
                    <View className="px-4">
                        <UpdatedCue visible={updated} testID="tournament-updated-cue" />
                    </View>
                </View>
                <View className="px-4 pt-3">{content}</View>
            </ScrollView>

            {cta ? (
                <View
                    testID="tournament-cta-bar"
                    className="absolute start-0 end-0 bottom-0 px-4 pt-3 bg-white dark:bg-cyber-card border-t border-gray-200 dark:border-cyber-border"
                    style={{ paddingBottom: insets.bottom + 12 }}
                >
                    <Pressable
                        testID="tournament-cta"
                        onPress={runCta}
                        accessibilityRole="button"
                        className="rounded-2xl items-center justify-center"
                        style={{ minHeight: 52, backgroundColor: theme.base }}
                    >
                        <Text className="text-white font-extrabold text-[16px]">{t(cta.labelKey)}</Text>
                    </Pressable>
                    {cta.kind === 'register' ? (
                        <Pressable testID="tournament-cta-code" onPress={() => setCodeOpen(true)} accessibilityRole="button" className="items-center justify-center" style={{ minHeight: 44 }}>
                            <Text className="text-brand font-bold text-[14px]">{t('tournaments.cta.joinCode')}</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}

            <JoinCodeEntry
                open={codeOpen}
                onClose={() => setCodeOpen(false)}
                onSubmit={(code) => {
                    setCodeOpen(false);
                    router.push(`/tournaments/${tr.id}/join/${encodeURIComponent(code)}` as any);
                }}
            />
            {canScore ? (
                <ScoreEntrySheet
                    open={!!scoring}
                    tournament={tr}
                    match={scoring}
                    onClose={() => setScoring(null)}
                    onSaved={() => void refetch()}
                />
            ) : null}
        </View>
    );
}
