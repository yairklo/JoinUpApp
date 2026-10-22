import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import TournamentStatusChip from '@/components/tournaments/TournamentStatusChip';
import { UpdatedCue } from '@/components/tournaments/UpdatedCue';
import TeamsQueue from '@/components/tournaments/manage/TeamsQueue';
import ScheduleBuilder from '@/components/tournaments/manage/ScheduleBuilder';
import StatusControls from '@/components/tournaments/manage/StatusControls';
import RolesPanel from '@/components/tournaments/manage/RolesPanel';

type Section = 'teams' | 'schedule' | 'status' | 'roles';
const SECTIONS: Section[] = ['teams', 'schedule', 'status', 'roles'];

/**
 * Manager console (spec 11). Rendered only when `capabilities.canManage`; otherwise the screen shows
 * the same "not found" state as a hidden tournament (never a locked/disabled console).
 */
export default function TournamentManageScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { id, section: initial } = useLocalSearchParams<{ id: string; section?: string }>();
    const { tournament, loading, notFound, error, refetch, updated } = useTournament(id);
    const [section, setSection] = useState<Section>(SECTIONS.includes(initial as Section) ? (initial as Section) : 'teams');

    if (loading && !tournament) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-cyber-bg" testID="manage-loading">
                <Stack.Screen options={{ headerShown: true, title: t('tournaments.manage.sections.teams') }} />
                <ActivityIndicator color="#059669" />
            </View>
        );
    }

    if (!tournament || notFound || !tournament.capabilities?.canManage) {
        return (
            <View className="flex-1 items-center justify-center px-8 bg-gray-50 dark:bg-cyber-bg" testID="manage-unavailable">
                <Stack.Screen options={{ headerShown: true, title: '' }} />
                <Ionicons name="trophy-outline" size={40} color="#9ca3af" />
                <Text className="mt-3 text-center text-gray-600 dark:text-cyber-muted">
                    {error && !notFound ? t('tournaments.manage.loadFailed') : t('tournaments.match.notFound')}
                </Text>
                <Pressable
                    onPress={() => (error && !notFound ? refetch() : router.back())}
                    accessibilityRole="button"
                    style={{ minHeight: 44 }}
                    className="mt-4 px-5 rounded-xl border border-gray-300 dark:border-cyber-border items-center justify-center"
                >
                    <Text className="font-bold text-gray-800 dark:text-cyber-text">{error && !notFound ? t('tournaments.score.retry') : t('common.back')}</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50 dark:bg-cyber-bg" testID="manage-console">
            <Stack.Screen options={{ headerShown: true, title: t('tournaments.manage.header', { title: tournament.title }) as string }} />
            {/* "admin mode" strip */}
            <View className="bg-gray-900 dark:bg-white/10 px-4 py-3 flex-row items-center">
                <Ionicons name="construct-outline" size={18} color="#fcd34d" />
                <View className="ms-2 flex-1" style={{ minWidth: 0 }}>
                    <Text numberOfLines={1} className="font-bold text-white">
                        {tournament.title}
                    </Text>
                </View>
                <TournamentStatusChip status={tournament.status} />
                <Pressable
                    testID="manage-to-page"
                    onPress={() => router.push(`/tournaments/${tournament.id}` as any)}
                    accessibilityRole="link"
                    style={{ minHeight: 44 }}
                    className="ms-3 justify-center"
                >
                    <Text className="text-xs font-bold text-amber-300">{t('tournaments.manage.toPage')}</Text>
                </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }} accessibilityRole="tablist">
                {SECTIONS.map((s) => {
                    const sel = section === s;
                    return (
                        <Pressable
                            key={s}
                            testID={`manage-tab-${s}`}
                            onPress={() => setSection(s)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: sel }}
                            style={{ minHeight: 44 }}
                            className={`px-5 rounded-full items-center justify-center ${sel ? 'bg-brand' : 'bg-gray-100 dark:bg-cyber-card'}`}
                        >
                            <Text className={`font-bold ${sel ? 'text-white' : 'text-gray-700 dark:text-cyber-text'}`}>{t(`tournaments.manage.sections.${s}`)}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
            <UpdatedCue visible={updated} />
            <View className="flex-1">
                {section === 'teams' ? <TeamsQueue tournament={tournament} /> : null}
                {section === 'schedule' ? <ScheduleBuilder tournament={tournament} onScheduleSaved={refetch} /> : null}
                {section === 'status' ? (
                    <StatusControls tournament={tournament} onChanged={refetch} onGoSchedule={() => setSection('schedule')} onGoTeams={() => setSection('teams')} />
                ) : null}
                {section === 'roles' ? <RolesPanel tournament={tournament} /> : null}
            </View>
        </View>
    );
}
