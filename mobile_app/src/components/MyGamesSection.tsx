import React, { useCallback, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { Game } from '@/types/game';
import { gamesApi } from '@/services/api';
import GameCard from './GameCard';
import LeaveGameButton from './LeaveGameButton';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSyncedGames } from '@/hooks/useSyncedGames';
import { useTranslation } from 'react-i18next';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import { getFriendlyFetchError, isAbortError } from '@/utils/apiErrors';

function isMyGame(game: Game, userId?: string | null) {
    if (!userId) return false;
    if (game.organizerId === userId) return true;
    if (game.participants?.some((p) => p.id === userId)) return true;
    const status = game.viewerParticipationStatus;
    return status === 'CONFIRMED' || status === 'WAITLISTED' || status === 'PENDING';
}

export default function MyGamesSection() {
    const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
    const { user, isLoaded } = useUser();
    const { t } = useTranslation();
    const userId = user?.id;
    const getTokenRef = useAuthTokenRef();
    const { games, setGames } = useSyncedGames([], (game) => isMyGame(game, userId));
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const router = useRouter();
    const abortRef = useRef<AbortController | null>(null);

    const fetchMyGames = useCallback(async () => {
        if (!isLoaded || !isAuthLoaded || !userId) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            setError(null);
            let token: string | null = null;
            if (isSignedIn) {
                token = await getTokenRef.current();
                if (!token) {
                    await new Promise((r) => setTimeout(r, 400));
                    token = await getTokenRef.current();
                }
            }
            if (!token || controller.signal.aborted) return;

            const data = await gamesApi.getMyGames(token, controller.signal);
            if (controller.signal.aborted) return;

            const active = (data || []).filter((g) => {
                try {
                    return new Date(`${g.date}T${g.time}`) >= new Date();
                } catch {
                    return true;
                }
            });
            setGames(active);
        } catch (err) {
            if (isAbortError(err) || controller.signal.aborted) return;
            const message = getFriendlyFetchError(err, 'שגיאה בטעינת המשחקים שלי');
            if (message) setError(message);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [isLoaded, isAuthLoaded, isSignedIn, userId, getTokenRef, setGames]);

    useFocusEffect(
        useCallback(() => {
            fetchMyGames();
            return () => abortRef.current?.abort();
        }, [fetchMyGames])
    );

    if (loading && games.length === 0) {
        return (
            <View className="py-6 items-center">
                <ActivityIndicator size="small" color="#059669" />
            </View>
        );
    }

    if (error && games.length === 0) {
        return (
            <View className="mx-5 mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <Text className="text-amber-900 text-sm text-center">{error}</Text>
            </View>
        );
    }

    if (games.length === 0) return null;

    return (
        <View className="mb-6">
            <View className="px-5 mb-3 flex-row justify-between items-end">
                <Text className="text-xl font-black text-gray-900">{t('home.myGames')}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {games.map((game) => (
                    <View key={game.id} className="w-72 mr-4">
                        <GameCard game={game} isJoined={true}>
                            <View className="flex-row justify-between items-center w-full">
                                <LeaveGameButton
                                    gameId={game.id}
                                    onLeft={() => {
                                        setGames((prev) => prev.filter((g) => g.id !== game.id));
                                    }}
                                />
                                <TouchableOpacity
                                    onPress={() => router.push(`/game/${game.id}`)}
                                    className="bg-brand-mist py-2 px-3 rounded-xl items-center flex-row justify-center border border-brand-pale"
                                >
                                    <Ionicons name="information-circle-outline" size={16} color="#059669" />
                                    <Text className="text-brand font-bold ml-1">{t('game.details')}</Text>
                                </TouchableOpacity>
                            </View>
                        </GameCard>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
