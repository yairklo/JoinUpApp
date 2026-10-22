import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTournamentTeam } from '@/hooks/useTournamentTeam';
import type { TeamMember, TournamentMatch, TournamentTeam } from '@/types/tournament';
import TeamBadge from '../TeamBadge';
import MatchCard from '../MatchCard';
import type { Lang } from '../matchFormat';

interface Props {
    tournamentId: string;
    team: TournamentTeam | null;
    matches: TournamentMatch[];
    numberById: Record<string, number>;
    lang: Lang;
    onClose: () => void;
}

const ROLE_ORDER = { CAPTAIN: 0, PLAYER: 1, SUBSTITUTE: 2 } as const;
const avatar = (m: TeamMember) => m.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name || 'User')}`;

/**
 * Team detail bottom sheet (spec 6): large badge, roster (avatar, name, jersey, role chip; no ages or
 * cities) sorted captain, players, subs, and up to 3 of the team's matches. Link to the full team page.
 */
export default function TeamSheet({ tournamentId, team, matches, numberById, lang, onClose }: Props) {
    const { t } = useTranslation();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { team: full, loading } = useTournamentTeam(team ? tournamentId : undefined, team?.id);
    const members = [...(full?.members ?? [])]
        .filter((m) => m.status === 'ACCEPTED')
        .sort((a, b) => (ROLE_ORDER[a.role as keyof typeof ROLE_ORDER] ?? 3) - (ROLE_ORDER[b.role as keyof typeof ROLE_ORDER] ?? 3));
    const mine = matches
        .filter((m) => m.home.teamId === team?.id || m.away.teamId === team?.id)
        .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
    const now = Date.now();
    const upcoming = mine.filter((m) => !m.scheduledAt || new Date(m.scheduledAt).getTime() >= now);
    const shown = (upcoming.length ? upcoming : mine.slice().reverse()).slice(0, 3);

    return (
        <Modal visible={!!team} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel={t('tournaments.teams.close')} accessibilityRole="button" />
            {team ? (
                <View
                    testID="team-sheet"
                    className="bg-white dark:bg-cyber-card rounded-t-3xl"
                    style={{ maxHeight: '80%', paddingBottom: insets.bottom + 8 }}
                >
                    <View className="items-center pt-2">
                        <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-cyber-border" />
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 16 }}>
                        <View className="flex-row items-center">
                            <View className="flex-1">
                                <TeamBadge name={team.name} color={team.color} logoUrl={team.logoUrl} size={40} lines={2} bold />
                            </View>
                            <Text className="text-[13px] text-gray-500 dark:text-cyber-muted">{t('tournaments.team.playersCount', { count: team.memberCount })}</Text>
                        </View>

                        <Text accessibilityRole="header" className="text-[15px] font-extrabold text-gray-900 dark:text-cyber-text mt-5 mb-2">
                            {t('tournaments.team.roster', { count: members.length || team.memberCount })}
                        </Text>
                        {loading && !full ? (
                            <ActivityIndicator color="#059669" />
                        ) : members.length === 0 ? (
                            <Text className="text-[13px] text-gray-500 dark:text-cyber-muted">{t('tournaments.view.noRoster')}</Text>
                        ) : (
                            members.map((m) => (
                                <View key={m.userId} testID={`team-sheet-member-${m.userId}`} className="flex-row items-center py-1.5" style={{ minHeight: 48 }}>
                                    <Image source={{ uri: avatar(m) }} accessibilityIgnoresInvertColors className="w-9 h-9 rounded-full bg-gray-200 me-3" />
                                    <Text numberOfLines={1} className="flex-1 text-[14px] font-semibold text-gray-900 dark:text-cyber-text">
                                        {m.name}
                                    </Text>
                                    {m.role !== 'PLAYER' ? (
                                        <Text className="text-[11px] font-bold text-gray-600 dark:text-cyber-muted bg-gray-100 dark:bg-cyber-border rounded-full px-2 py-0.5 me-2">
                                            {t(`tournaments.team.role.${m.role}`)}
                                        </Text>
                                    ) : null}
                                    {m.jerseyNumber != null ? (
                                        <Text className="text-[13px] font-bold text-gray-700 dark:text-cyber-text" style={{ fontVariant: ['tabular-nums'] }}>
                                            #{m.jerseyNumber}
                                        </Text>
                                    ) : null}
                                </View>
                            ))
                        )}

                        <Text accessibilityRole="header" className="text-[15px] font-extrabold text-gray-900 dark:text-cyber-text mt-5 mb-2">
                            {t('tournaments.teams.recentMatches')}
                        </Text>
                        {shown.length === 0 ? (
                            <Text className="text-[13px] text-gray-500 dark:text-cyber-muted">{t('tournaments.teams.noMatches')}</Text>
                        ) : (
                            shown.map((m) => (
                                <MatchCard
                                    key={m.id}
                                    match={m}
                                    numberById={numberById}
                                    myTeamId={team.id}
                                    lang={lang}
                                    onPress={() => {
                                        onClose();
                                        router.push(`/tournaments/${tournamentId}/matches/${m.id}` as any);
                                    }}
                                />
                            ))
                        )}

                        <Pressable
                            testID="team-sheet-open-page"
                            onPress={() => {
                                onClose();
                                router.push(`/tournaments/${tournamentId}/team/${team.id}` as any);
                            }}
                            accessibilityRole="link"
                            className="mt-4 rounded-xl border border-gray-300 dark:border-cyber-border items-center justify-center"
                            style={{ minHeight: 48 }}
                        >
                            <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.teams.toTeamPage')}</Text>
                        </Pressable>
                    </ScrollView>
                </View>
            ) : null}
        </Modal>
    );
}
