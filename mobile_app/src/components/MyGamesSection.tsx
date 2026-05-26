import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Game } from '@/types/game';
import { apiClient } from '@/services/api/client';
import GameCard from './GameCard';
import LeaveGameButton from './LeaveGameButton';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSyncedGames } from '@/hooks/useSyncedGames';
import { useTranslation } from 'react-i18next';

export default function MyGamesSection() {
    const { getToken } = useAuth();
    const { user, isLoaded } = useUser();
    const { t } = useTranslation();
    const { games, setGames } = useSyncedGames([], (game) => {
        return Boolean(game.participants?.some(p => p.id === user?.id) || game.organizerId === user?.id);
    });
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        if (!user?.id) return;
        let isMounted = true;

        async function fetchMyGames() {
            try {
                const token = await getToken();
                if (token) {
                    const data = await apiClient<Game[]>(`/api/games/my`, { token });
                    if (isMounted) {
                        // Filter for active/upcoming games
                        const active = data.filter(g => new Date(`${g.date}T${g.time}`) >= new Date());
                        setGames(active);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch my games", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        fetchMyGames();

        return () => { isMounted = false; };
    }, [user?.id, getToken]);

    if (loading && games.length === 0) {
        return (
            <View className="py-6 items-center">
                <ActivityIndicator size="small" color="#2563eb" />
            </View>
        );
    }

    if (games.length === 0) return null;

    return (
        <View className="mb-6">
            <View className="px-5 mb-3 flex-row justify-between items-end">
                <Text className="text-xl font-black text-gray-900">{t("home.myGames")}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {games.map(game => (
                    <View key={game.id} className="w-72 mr-4">
                        <GameCard game={game} isJoined={true}>
                            <View className="flex-row justify-between items-center w-full">
                                <LeaveGameButton gameId={game.id} onLeft={() => {
                                    setGames(prev => prev.filter(g => g.id !== game.id));
                                }} />
                                <TouchableOpacity 
                                    onPress={() => router.push(`/game/${game.id}`)}
                                    className="bg-blue-50 py-2 px-3 rounded-xl items-center flex-row justify-center border border-blue-100"
                                >
                                    <Ionicons name="information-circle-outline" size={16} color="#2563eb" />
                                    <Text className="text-blue-600 font-bold ml-1">{t('game.details')}</Text>
                                </TouchableOpacity>
                            </View>
                        </GameCard>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
