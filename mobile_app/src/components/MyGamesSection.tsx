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

export default function MyGamesSection() {
    const { getToken } = useAuth();
    const { user } = useUser();
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

    if (loading) {
        return (
            <View className="py-6 items-center">
                <ActivityIndicator size="small" color="#2563eb" />
            </View>
        );
    }

    if (games.length === 0) return null;

    return (
        <View className="py-4">
            <Text className="px-5 text-lg font-bold text-gray-800 mb-3 text-right">המשחקים שלי</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {games.map(game => (
                    <View key={game.id} className="w-72 mr-4">
                        <GameCard game={game} isJoined={true}>
                            <View className="flex-row-reverse justify-between items-center w-full">
                                <LeaveGameButton gameId={game.id} onLeft={() => {
                                    setGames(prev => prev.filter(g => g.id !== game.id));
                                }} />
                                <TouchableOpacity 
                                    onPress={() => router.push(`/game/${game.id}`)}
                                    className="flex-row-reverse items-center bg-blue-50 px-3 py-2 rounded-xl"
                                >
                                    <Text className="text-blue-600 font-bold ml-1">פרטים</Text>
                                    <Ionicons name="arrow-back" size={16} color="#2563eb" />
                                </TouchableOpacity>
                            </View>
                        </GameCard>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
