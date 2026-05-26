import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image, Modal } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { gamesApi } from '@/services/api';
import { Game } from '@/types/game';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSeriesLogic } from '@/hooks/useSeriesLogic';
import { useTranslation } from 'react-i18next';

export default function GameDetailsScreen() {
    const { t } = useTranslation();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();

    const [game, setGame] = useState<Game | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Provide default values to hook, will update when game loads
    const series = useSeriesLogic({
        gameId: id,
        seriesId: game?.seriesId || null,
        initialTime: game?.time || "20:00"
    });

    useEffect(() => {
        fetchGame();
    }, [id]);

    const fetchGame = async () => {
        try {
            const token = await getToken();
            // Since getById is now added to gamesApi
            const data = await gamesApi.getById(id, token || undefined);
            setGame(data);
        } catch (err) {
            console.error("Failed to load game", err);
            Alert.alert("Error", "Failed to load game details");
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!game) return;
        setActionLoading(true);
        try {
            const token = await getToken();
            if (!token) {
                Alert.alert("Error", "עליך להיות מחובר כדי להצטרף");
                return;
            }
            await gamesApi.join(game.id, token);
            Alert.alert("Success", "הצטרפת למשחק!");
            fetchGame(); // Refresh
        } catch (err: any) {
            Alert.alert("Error", err.response?.data?.error || "Failed to join game");
        } finally {
            setActionLoading(false);
        }
    };

    const handleעזוב = async () => {
        if (!game) return;
        Alert.alert("עזוב Game", "האם אתה בטוח שברצונך לעזוב?", [
            { text: "Cancel", style: "cancel" },
            {
                text: t('game.leave'),
                style: "destructive",
                onPress: async () => {
                    setActionLoading(true);
                    try {
                        const token = await getToken();
                        if (!token) return;
                        await gamesApi.leave(game.id, token);
                        Alert.alert("Success", "עזבת את המשחק.");
                        fetchGame(); // Refresh
                    } catch (err: any) {
                        Alert.alert("Error", err.response?.data?.error || "Failed to leave game");
                    } finally {
                        setActionLoading(false);
                    }
                }
            }
        ]);
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    if (!game) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <Text className="text-gray-500">המשחק לא נמצא</Text>
            </View>
        );
    }

    const isParticipant = game.participants?.some(p => p.id === user?.id);
    const isFull = (game.currentPlayers || 0) >= game.maxPlayers;
    const isOrganizer = game.organizerId === user?.id;

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900">{t('game.details')}</Text>
            </View>
            <ScrollView className="flex-1 bg-gray-50">
                {/* Header Section */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    <Text className="text-2xl font-bold text-gray-800 mb-2 text-left">{game.field?.name || game.fieldName || t('game.unknownField')}</Text>
                    <View className="flex-row items-center mb-2">
                        <FontAwesome name="calendar" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base">
                            {new Date(game.date).toLocaleDateString()} at {game.time}
                        </Text>
                    </View>
                    <View className="flex-row items-center mb-2">
                        <FontAwesome name="map-marker" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base">
                            {game.field?.location || game.fieldLocation || t('game.unknownLocation')}
                        </Text>
                    </View>
                    <View className="flex-row items-center">
                        <FontAwesome name="money" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base">
                            {game.price ? `₪${game.price}` : t('game.free')}
                        </Text>
                    </View>
                </View>

                {/* Participants Section */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-lg font-bold text-gray-800">{t('game.players')}</Text>
                        <Text className="text-gray-500">
                            {game.currentPlayers} / {game.maxPlayers}
                        </Text>
                    </View>

                    {game.teams && game.teams.length > 0 ? (
                        <View className="flex-col gap-4">
                            {game.teams.map(team => {
                                if (!team.playerIds || team.playerIds.length === 0) return null;
                                return (
                                    <View key={team.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50" style={{ borderRightWidth: 4, borderRightColor: team.color }}>
                                        <Text className="font-bold text-gray-800 mb-2">{team.name} ({team.playerIds.length})</Text>
                                        <View className="flex-row flex-wrap">
                                            {team.playerIds.map(pid => {
                                                const p = game.participants?.find(part => part.id === pid);
                                                if (!p) return null;
                                                return (
                                                    <View key={pid} className="mr-3 mb-2 items-center w-12">
                                                        <Image source={{ uri: p.avatar || "https://ui-avatars.com/api/?name=" + p.name }} className="w-10 h-10 rounded-full bg-gray-200 mb-1" />
                                                        <Text className="text-[10px] text-center text-gray-600" numberOfLines={1}>{p.name?.split(' ')[0]}</Text>
                                                    </View>
                                                )
                                            })}
                                        </View>
                                    </View>
                                )
                            })}
                            
                            {/* Unassigned Players (Bench) */}
                            {(() => {
                                const assignedPlayerIds = new Set(game.teams.flatMap(t => t.playerIds || []));
                                const bench = game.participants?.filter(p => !assignedPlayerIds.has(p.id)) || [];
                                if (bench.length === 0) return null;
                                return (
                                    <View className="border border-gray-100 rounded-xl p-3 bg-white">
                                        <Text className="font-bold text-gray-500 mb-2">לא שובצו ({bench.length})</Text>
                                        <View className="flex-row flex-wrap">
                                            {bench.map(p => (
                                                <View key={p.id} className="mr-3 mb-2 items-center w-12">
                                                    <Image source={{ uri: p.avatar || "https://ui-avatars.com/api/?name=" + p.name }} className="w-10 h-10 rounded-full bg-gray-200 mb-1" />
                                                    <Text className="text-[10px] text-center text-gray-600" numberOfLines={1}>{p.name?.split(' ')[0]}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )
                            })()}
                        </View>
                    ) : (
                        <View className="flex-row flex-wrap">
                            {game.participants?.map((p) => (
                                <View key={p.id} className="ml-4 mb-4 items-center w-16">
                                    <Image
                                        source={{ uri: p.avatar || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y" }}
                                        className="w-12 h-12 rounded-full bg-gray-200 mb-1"
                                    />
                                    <Text
                                        className="text-xs text-center text-gray-600"
                                        numberOfLines={1}
                                    >
                                        {p.name || "User"}
                                    </Text>
                                    {p.id === game.organizerId && (
                                        <Text className="text-[10px] text-blue-600 font-bold">מארגן</Text>
                                    )}
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Actions Section */}
                <View className="p-6">
                    {isParticipant ? (
                        <View>
                            <TouchableOpacity
                                onPress={() => router.push(`/chat/${game.id}`)}
                                className="bg-blue-100 p-4 rounded-xl items-center mb-3 border border-blue-200"
                            >
                                <Text className="text-blue-700 font-bold text-lg">פתח צ'אט</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => router.push(`/game/teams/${game.id}`)}
                                className="bg-gray-100 p-4 rounded-xl items-center mb-3"
                            >
                                <Text className="text-gray-700 font-bold text-lg">נהל קבוצות</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleעזוב}
                                disabled={actionLoading}
                                className="bg-red-50 p-4 rounded-xl items-center border border-red-100"
                            >
                                <Text className="text-red-600 font-bold text-lg">עזוב משחק</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={handleJoin}
                            disabled={actionLoading || (isFull && !isOrganizer)}
                            className={`p-4 rounded-xl items-center ${isFull ? 'bg-gray-300' : 'bg-blue-600'}`}
                        >
                            <Text className="text-white font-bold text-lg">
                                {isFull ? "משחק מלא" : "הצטרף למשחק"}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {isOrganizer && (
                        <>
                            <TouchableOpacity
                                onPress={() => router.push(`/game/edit/${game.id}`)}
                                className="mt-4 p-4 rounded-xl items-center border border-gray-300"
                            >
                                <Text className="text-gray-600 font-bold">ערוך משחק</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => router.push(`/game/teams/${game.id}`)}
                                className="mt-4 p-4 rounded-xl items-center border border-indigo-200 bg-indigo-50"
                            >
                                <View className="flex-row items-center">
                                    <FontAwesome name="users" size={16} color="#4f46e5" style={{ marginLeft: 8 }} />
                                    <Text className="text-indigo-700 font-bold">נהל קבוצות</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Series Management */}
                            {game.seriesId ? (
                                <TouchableOpacity
                                    onPress={() => router.push(`/series/${game.seriesId}`)}
                                    className="mt-3 p-4 rounded-xl items-center border border-blue-200 bg-blue-50"
                                >
                                    <View className="flex-row items-center">
                                        <FontAwesome name="calendar-check-o" size={16} color="#2563eb" style={{ marginLeft: 8 }} />
                                        <Text className="text-blue-700 font-bold">נהל סדרה</Text>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    onPress={() => series.actions.setOpen(true)}
                                    className="mt-3 p-4 rounded-xl items-center border border-purple-200 bg-purple-50"
                                >
                                    <View className="flex-row items-center">
                                        <FontAwesome name="repeat" size={16} color="#9333ea" style={{ marginLeft: 8 }} />
                                        <Text className="text-purple-700 font-bold">הפוך לסדרה</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>

                <View className="h-10" />
            </ScrollView>

            {/* Series Creation Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={series.state.open}
                onRequestClose={() => series.actions.setOpen(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[70%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-gray-800">צור סדרה</Text>
                            <TouchableOpacity onPress={() => series.actions.setOpen(false)}>
                                <Text className="text-blue-600 font-bold">ביטול</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row mb-6 bg-gray-100 p-1 rounded-lg">
                            <TouchableOpacity
                                onPress={() => series.actions.setTabValue(0)}
                                className={`flex-1 p-2 rounded-md items-center ${series.state.tabValue === 0 ? 'bg-white shadow-sm' : ''}`}
                            >
                                <Text className={`font-bold ${series.state.tabValue === 0 ? 'text-blue-600' : 'text-gray-500'}`}>שבועי</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => series.actions.setTabValue(1)}
                                className={`flex-1 p-2 rounded-md items-center ${series.state.tabValue === 1 ? 'bg-white shadow-sm' : ''}`}
                            >
                                <Text className={`font-bold ${series.state.tabValue === 1 ? 'text-blue-600' : 'text-gray-500'}`}>תאריכים מותאמים אישית</Text>
                            </TouchableOpacity>
                        </View>

                        {series.state.tabValue === 0 ? (
                            <View>
                                <Text className="text-gray-600 mb-4 leading-6">
                                    • Creates a game every week at <Text className="font-bold">{game.time}</Text>.{'\n'}
                                    • Generates the next 4 games immediately.{'\n'}
                                    • Players can subscribe to auto-join.
                                </Text>
                            </View>
                        ) : (
                            <View>
                                <Text className="text-gray-600 mb-4">Select specific dates for this series.</Text>
                                {/* Date picker logic simplified for mobile MVP - perhaps just suggest Weekly for now */}
                                <Text className="text-orange-500 italic">Custom dates feature is optimized for web. Please use Weekly for best experience on mobile.</Text>
                            </View>
                        )}

                        <View className="flex-1" />

                        <TouchableOpacity
                            onPress={series.actions.handleMakeRecurring}
                            disabled={series.state.loading}
                            className={`p-4 rounded-xl items-center mb-6 ${series.state.loading ? 'bg-gray-400' : 'bg-blue-600'}`}
                        >
                            {series.state.loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold text-lg">צור סדרה</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
