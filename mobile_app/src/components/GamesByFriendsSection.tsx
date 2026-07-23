import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useGamesByFriends } from '@/hooks/useGamesByFriends';
import GameCard from './GameCard';
import JoinGameButton from './JoinGameButton';
import LeaveGameButton from './LeaveGameButton';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';

export default function GamesByFriendsSection({ sportFilter }: { sportFilter?: string }) {
    const { games, loading } = useGamesByFriends();
    const { user } = useUser();
    const { t } = useTranslation();
    const router = useRouter();

    const filteredGames = games.filter(g => sportFilter === 'ALL' || !sportFilter || g.sport === sportFilter);

    if (loading && games.length === 0) {
        return (
            <View className="py-6 items-center">
                <ActivityIndicator size="small" color="#059669" />
            </View>
        );
    }

    if (filteredGames.length === 0) return null;

    return (
        <View className="mb-6 mt-2">
            <View className="px-5 mb-3 flex-row items-center">
                <View className="w-1 h-5 rounded-full bg-brand mr-2" />
                <Text className="text-xl font-black text-gray-900 dark:text-cyber-text">
                    משחקים של חברים
                </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {filteredGames.map((game) => {
                    const isJoined =
                        game.viewerParticipationStatus === 'CONFIRMED' ||
                        game.participants?.some(p => p.id === user?.id);

                    return (
                        <View key={game.id} className="w-72 mr-4">
                            <GameCard game={game} isJoined={!!isJoined}>
                                <View className="flex-row justify-between items-center w-full">
                                    <View className="flex-1 mr-2">
                                        {isJoined ? (
                                            <LeaveGameButton gameId={game.id} onLeft={() => {}} />
                                        ) : (
                                            <JoinGameButton
                                                gameId={game.id}
                                                registrationOpensAt={game.registrationOpensAt}
                                                joinPolicy={game.joinPolicy}
                                                viewerParticipationStatus={game.viewerParticipationStatus}
                                                waitlistOfferPending={game.waitlistOfferPending}
                                                isFull={game.currentPlayers >= game.maxPlayers}
                                                onJoined={() => {}}
                                            />
                                        )}
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => router.push(`/game/${game.id}` as any)}
                                        className="bg-brand-mist py-2 px-3 rounded-xl items-center flex-row justify-center border border-brand-pale"
                                    >
                                        <Ionicons name="information-circle-outline" size={16} color="#059669" />
                                    </TouchableOpacity>
                                </View>
                            </GameCard>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}
