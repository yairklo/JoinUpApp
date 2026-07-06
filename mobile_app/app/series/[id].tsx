import { View, Text, Switch, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator, Image } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { seriesApi } from '@/services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function SeriesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();
    const { t } = useTranslation();

    const [series, setSeries] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Settings State
    const [updating, setUpdating] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [time, setTime] = useState('');
    const [updateFuture, setUpdateFuture] = useState(true);

    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        fetchSeries();
    }, [id]);

    const fetchSeries = async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const data = await seriesApi.getById(id, token);
            setSeries(data);
            setTime(data.time || "20:00");

            const isSub = data.subscribers?.some((s: any) => s.userId === user?.id);
            setIsSubscribed(isSub || false);
        } catch (error) {
            console.error("Failed to load series", error);
            Alert.alert(t('error'), t('series.loadError', 'Failed to load series details'));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        setUpdating(true);
        try {
            const token = await getToken();
            if (!token) return;
            await seriesApi.update(id, { time, updateFutureGames: updateFuture }, token);
            Alert.alert(t('success'), t('series.updateSuccess', 'Series updated successfully'));
            fetchSeries();
        } catch (error) {
            console.error(error);
            Alert.alert(t('error'), t('series.updateError', 'Failed to update series'));
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = async () => {
        Alert.alert(
            t('series.deleteTitle', 'Delete Series'),
            t('series.deleteConfirm', 'Are you sure? This will delete all future games.'),
            [
                { text: t('cancel', 'Cancel'), style: "cancel" },
                {
                    text: t('delete', 'Delete'), style: "destructive", onPress: async () => {
                        try {
                            const token = await getToken();
                            if (!token) return;
                            await seriesApi.delete(id, token);
                            Alert.alert(t('success'), t('series.deleteSuccess', 'Series deleted'));
                            router.replace('/(tabs)');
                        } catch (e) {
                            Alert.alert(t('error'), t('series.deleteError', 'Failed to delete series'));
                        }
                    }
                }
            ]
        );
    };

    const toggleSubscribe = async () => {
        const prev = isSubscribed;
        setIsSubscribed(!prev);
        try {
            const token = await getToken();
            if (!token) return;
            await seriesApi.toggleSubscribe(id, prev, token);
            fetchSeries();
        } catch (e) {
            setIsSubscribed(prev);
            Alert.alert(t('error'), t('series.subscribeError', 'Failed to update subscription'));
        }
    };

    if (loading) {
        return (
            <SafeAreaView edges={['top']} className="flex-1 bg-white">
                <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
                        <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-gray-900">{t('series.details', 'Series Details')}</Text>
                </View>
                <View className="flex-1 justify-center items-center">
                    <ActivityIndicator size="large" color="#2563eb" />
                </View>
            </SafeAreaView>
        );
    }

    if (!series) {
        return (
            <SafeAreaView edges={['top']} className="flex-1 bg-white">
                <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
                        <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-gray-900">{t('series.details', 'Series Details')}</Text>
                </View>
                <View className="flex-1 justify-center items-center">
                    <Text className="text-gray-500">{t('series.notFound', 'Series not found')}</Text>
                </View>
            </SafeAreaView>
        );
    }

    const isOrganizer = user?.id === series.organizer?.id;
    const days = [
        t('days.sunday', 'Sunday'),
        t('days.monday', 'Monday'),
        t('days.tuesday', 'Tuesday'),
        t('days.wednesday', 'Wednesday'),
        t('days.thursday', 'Thursday'),
        t('days.friday', 'Friday'),
        t('days.saturday', 'Saturday')
    ];
    const dayName = series.dayOfWeek !== null && series.dayOfWeek !== undefined
        ? days[series.dayOfWeek]
        : t('series.customDates', 'Custom Dates');

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            {/* Navigation Header — same pattern as game/[id].tsx */}
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900" numberOfLines={1}>
                    {series.title || series.fieldName}
                </Text>
            </View>

            <ScrollView className="flex-1 bg-gray-50">

                {/* Hero Header Card */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    {/* Organizer row */}
                    <View className="flex-row items-center mb-4">
                        {series.organizer?.avatar ? (
                            <Image source={{ uri: series.organizer.avatar }} className="w-12 h-12 rounded-full mr-3 border border-gray-200" />
                        ) : (
                            <View className="w-12 h-12 rounded-full bg-blue-100 items-center justify-center mr-3">
                                <FontAwesome name="user" size={20} color="#2563eb" />
                            </View>
                        )}
                        <View className="flex-1">
                            <Text className="text-2xl font-bold text-gray-800" numberOfLines={1}>
                                {series.title || series.fieldName}
                            </Text>
                            <Text className="text-gray-500 text-sm mt-0.5">
                                {t('series.organizedBy', 'by')} {series.organizer?.name || t('series.organizer', 'Organizer')}
                            </Text>
                        </View>
                    </View>

                    {/* Info rows */}
                    <View className="flex-row items-center mb-2">
                        <FontAwesome name="map-marker" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base flex-1" numberOfLines={1}>
                            {series.fieldLocation || series.fieldName}
                        </Text>
                    </View>
                    <View className="flex-row items-center mb-5">
                        <FontAwesome name="clock-o" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base">{dayName}, {series.time}</Text>
                    </View>

                    {/* Subscribe button */}
                    <TouchableOpacity
                        onPress={toggleSubscribe}
                        className={`py-4 rounded-xl items-center flex-row justify-center ${isSubscribed ? 'bg-blue-50 border border-blue-200' : 'bg-blue-600'}`}
                    >
                        <FontAwesome
                            name={isSubscribed ? "check" : "bell"}
                            size={16}
                            color={isSubscribed ? "#2563eb" : "white"}
                            style={{ marginRight: 8 }}
                        />
                        <Text className={`font-bold text-base ${isSubscribed ? 'text-blue-700' : 'text-white'}`}>
                            {isSubscribed ? t('series.subscribed', 'Subscribed ✓') : t('series.subscribe', 'Subscribe to Series')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Quick Stats Bar — same pattern as game utility actions */}
                <View className="bg-white mb-4 shadow-sm flex-row justify-around border-y border-gray-100 py-4">
                    <View className="items-center">
                        <View className="w-12 h-12 bg-blue-50 rounded-full items-center justify-center mb-1">
                            <FontAwesome name="users" size={20} color="#2563eb" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{series.subscribers?.length || 0}</Text>
                        <Text className="text-xs text-gray-400">{t('series.regulars', 'Regulars')}</Text>
                    </View>
                    <View className="items-center">
                        <View className="w-12 h-12 bg-green-50 rounded-full items-center justify-center mb-1">
                            <FontAwesome name="calendar" size={20} color="#16a34a" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{series.upcomingGames?.length || 0}</Text>
                        <Text className="text-xs text-gray-400">{t('series.upcoming', 'Upcoming')}</Text>
                    </View>
                    <View className="items-center">
                        <View className="w-12 h-12 bg-purple-50 rounded-full items-center justify-center mb-1">
                            <FontAwesome name="repeat" size={20} color="#9333ea" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{dayName}</Text>
                        <Text className="text-xs text-gray-400">{t('series.schedule', 'Schedule')}</Text>
                    </View>
                </View>

                {/* Regulars Section */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    <Text className="text-lg font-bold text-gray-800 mb-4">
                        {t('series.regulars', 'The Regulars')} ({series.subscribers?.length || 0})
                    </Text>
                    {series.subscribers?.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {series.subscribers.map((sub: any) => (
                                <View key={sub.userId} className="items-center mr-4 w-16">
                                    {sub.user?.avatar ? (
                                        <Image source={{ uri: sub.user.avatar }} className="w-14 h-14 rounded-full mb-1 border border-gray-200" />
                                    ) : (
                                        <View className="w-14 h-14 rounded-full bg-gray-100 items-center justify-center mb-1 border border-gray-200">
                                            <FontAwesome name="user" size={20} color="#9ca3af" />
                                        </View>
                                    )}
                                    <Text className="text-xs text-gray-700 text-center font-medium" numberOfLines={1}>
                                        {sub.user?.name || t('user')}
                                    </Text>
                                </View>
                            ))}
                        </ScrollView>
                    ) : (
                        <View className="items-center py-4">
                            <FontAwesome name="users" size={32} color="#d1d5db" />
                            <Text className="text-gray-400 mt-2">{t('series.noRegulars', 'No regulars yet. Be the first!')}</Text>
                        </View>
                    )}
                </View>

                {/* Upcoming Games Section */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    <Text className="text-lg font-bold text-gray-800 mb-4">{t('series.upcomingGames', 'Upcoming Games')}</Text>
                    {series.upcomingGames?.length > 0 ? (
                        <View className="rounded-xl overflow-hidden border border-gray-100">
                            {series.upcomingGames.map((game: any, index: number) => {
                                const gDate = new Date(game.date);
                                return (
                                    <TouchableOpacity
                                        key={game.id}
                                        onPress={() => router.push(`/game/${game.id}`)}
                                        className={`flex-row items-center p-4 bg-white ${index !== series.upcomingGames.length - 1 ? 'border-b border-gray-100' : ''}`}
                                    >
                                        <View className="bg-blue-50 rounded-xl w-12 h-12 items-center justify-center mr-4 border border-blue-100">
                                            <Text className="text-blue-800 font-bold text-lg leading-tight">{gDate.getDate()}</Text>
                                            <Text className="text-blue-600 text-[10px] font-bold uppercase">{gDate.toLocaleDateString('en-US', { month: 'short' })}</Text>
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-gray-800 text-base">{gDate.toLocaleDateString('he-IL', { weekday: 'long' })}</Text>
                                            <Text className="text-gray-500 text-xs mt-0.5">
                                                {game.currentPlayers} / {game.maxPlayers} {t('players', 'Players')} · {game.time}
                                            </Text>
                                        </View>
                                        <FontAwesome name="chevron-left" size={12} color="#d1d5db" />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ) : (
                        <View className="items-center py-6">
                            <FontAwesome name="calendar-o" size={32} color="#d1d5db" />
                            <Text className="text-gray-400 mt-2">{t('series.noGames', 'No upcoming games scheduled.')}</Text>
                        </View>
                    )}
                </View>

                {/* Organizer Settings */}
                {isOrganizer && (
                    <View className="p-6 mb-6">
                        <TouchableOpacity
                            onPress={() => setShowSettings(!showSettings)}
                            className="flex-row items-center justify-between bg-gray-100 p-4 rounded-xl mb-2"
                        >
                            <View className="flex-row items-center">
                                <FontAwesome name="cog" size={18} color="#4b5563" style={{ marginRight: 10 }} />
                                <Text className="font-bold text-gray-700">{t('series.manageSettings', 'Manage Series Settings')}</Text>
                            </View>
                            <FontAwesome name={showSettings ? "chevron-up" : "chevron-down"} size={14} color="#6b7280" />
                        </TouchableOpacity>

                        {showSettings && (
                            <View className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                                <Text className="text-gray-700 font-bold mb-2">{t('series.defaultTime', 'Default Time')}</Text>
                                <TextInput
                                    value={time}
                                    onChangeText={setTime}
                                    placeholder="HH:MM"
                                    className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-base"
                                />

                                <View className="flex-row justify-between items-center mb-6">
                                    <Text className="text-gray-700 font-bold w-3/4">{t('series.updateFuture', 'Update all future games?')}</Text>
                                    <Switch
                                        value={updateFuture}
                                        onValueChange={setUpdateFuture}
                                        trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                                        thumbColor={updateFuture ? '#2563eb' : '#f3f4f6'}
                                    />
                                </View>

                                <TouchableOpacity
                                    onPress={handleUpdate}
                                    disabled={updating}
                                    className={`p-4 rounded-xl items-center mb-3 ${updating ? 'bg-gray-400' : 'bg-blue-600'}`}
                                >
                                    <Text className="text-white font-bold text-base">
                                        {updating ? t('saving', 'Saving...') : t('saveChanges', 'Save Changes')}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleDelete}
                                    className="bg-red-50 p-4 rounded-xl items-center border border-red-100"
                                >
                                    <Text className="text-red-600 font-bold text-base">{t('series.delete', 'Delete Series')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                <View className="h-10" />
            </ScrollView>
        </SafeAreaView>
    );
}
