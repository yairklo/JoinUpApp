import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, FlatList, Image, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { usersApi } from '../../src/services/api/users';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function SearchPlayersScreen() {
    const router = useRouter();
    const { getToken } = useAuth();
    const { t } = useTranslation();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const performSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        console.log(`🔍 [Mobile SearchPlayers] Starting search for query: "${searchQuery}"`);
        try {
            setLoading(true);
            console.log("🔑 [Mobile SearchPlayers] Requesting Clerk token...");
            const token = await getToken();
            console.log("🔑 [Mobile SearchPlayers] Clerk token resolved:", token ? "Exists" : "Null/Empty");

            if (!token) {
                console.warn("⚠️ [Mobile SearchPlayers] Clerk token is null or empty. Aborting request.");
                return;
            }

            console.log(`🌐 [Mobile SearchPlayers] Firing API request to search users...`);
            const data = await usersApi.search(searchQuery, token);
            console.log("✅ [Mobile SearchPlayers] API response received. Results count:", data.length);
            setResults(data);
        } catch (error) {
            console.error('❌ [Mobile SearchPlayers] Search players failed:', error);
            Alert.alert(t('error', 'Error'), t('searchFailed', 'Search failed, please try again.'));
        } finally {
            setLoading(false);
        }
    }, [getToken, t]);

    const handleInputChange = (text: string) => {
        setQuery(text);

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(() => {
            performSearch(text);
        }, 300);
    };

    const handleAddFriend = async (targetUserId: string) => {
        try {
            setActionLoadingId(targetUserId);
            const token = await getToken();
            if (!token) return;

            await usersApi.sendFriendRequest(targetUserId, token);

            // Update status in local results array
            setResults(prev => 
                prev.map(item => 
                    item.id === targetUserId 
                        ? { ...item, friendshipStatus: 'pending', isRequestSender: true } 
                        : item
                )
            );
        } catch (error) {
            console.error('Failed to send friend request:', error);
            Alert.alert(t('error', 'Error'), t('failedToSendRequest', 'Failed to send friend request.'));
        } finally {
            setActionLoadingId(null);
        }
    };

    const renderPlayerRow = ({ item }: { item: any }) => {
        const isPending = item.friendshipStatus === 'pending';
        const isFriend = item.friendshipStatus === 'friends';
        const isNone = item.friendshipStatus === 'none';

        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'User')}`;

        return (
            <TouchableOpacity 
                onPress={() => router.push(`/user/${item.id}`)}
                className="flex-row items-center justify-between bg-white p-4 mb-2 rounded-2xl border border-gray-100 shadow-sm"
                activeOpacity={0.7}
            >
                <View className="flex-row items-center flex-1 mr-3">
                    <Image 
                        source={{ uri: item.imageUrl || defaultAvatar }} 
                        className="w-12 h-12 rounded-full bg-gray-100" 
                    />
                    <View className="ml-3 flex-1 items-start">
                        <Text className="text-base font-bold text-gray-800" numberOfLines={1}>
                            {item.name || 'Unnamed Player'}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                            {item.city || t('profile.unknownCity', 'מיקום לא ידוע')}
                        </Text>
                    </View>
                </View>

                <View>
                    {isFriend && (
                        <View className="bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 flex-row items-center">
                            <FontAwesome name="check" size={10} color="#15803d" style={{ marginRight: 4 }} />
                            <Text className="text-xs text-green-700 font-bold">
                                {t('profile.friends', 'חברים')}
                            </Text>
                        </View>
                    )}

                    {isPending && (
                        <View className="bg-yellow-50 px-3 py-1.5 rounded-lg border border-yellow-100 flex-row items-center">
                            <FontAwesome name="clock-o" size={10} color="#b45309" style={{ marginRight: 4 }} />
                            <Text className="text-xs text-yellow-700 font-bold">
                                {item.isRequestSender ? t('profile.pendingSent', 'נשלחה בקשה') : t('profile.pendingReceived', 'התקבלה בקשה')}
                            </Text>
                        </View>
                    )}

                    {isNone && (
                        <TouchableOpacity
                            onPress={() => handleAddFriend(item.id)}
                            disabled={actionLoadingId === item.id}
                            className="bg-blue-600 px-3 py-1.5 rounded-lg flex-row items-center"
                        >
                            {actionLoadingId === item.id ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <>
                                    <FontAwesome name="user-plus" size={10} color="#ffffff" style={{ marginRight: 4 }} />
                                    <Text className="text-xs text-white font-bold">
                                        {t('profile.addFriend', 'הוסף חבר')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50 px-4 pt-2" edges={['top']}>
            {/* Header row */}
            <View className="flex-row items-center mb-4">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
                    <FontAwesome name="chevron-right" size={20} color="#374151" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 flex-1 text-right">
                    {t('profile.searchPlayersHeader', 'חיפוש שחקנים')}
                </Text>
            </View>

            {/* Input search bar */}
            <View className="bg-white rounded-2xl px-4 py-3 flex-row items-center border border-gray-200 shadow-sm mb-4">
                <FontAwesome name="search" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                <TextInput
                    placeholder={t('profile.searchPlayersPlaceholder', 'חפש שחקנים לפי שם או אימייל...')}
                    value={query}
                    onChangeText={handleInputChange}
                    className="flex-1 text-base text-gray-800 text-right"
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            {loading && (
                <View className="flex-1 justify-center items-center">
                    <ActivityIndicator size="large" color="#2563eb" />
                </View>
            )}

            {!loading && results.length === 0 && query.trim() !== '' && (
                <View className="flex-1 justify-center items-center">
                    <FontAwesome name="user-times" size={48} color="#d1d5db" />
                    <Text className="text-gray-500 text-base mt-4">
                        {t('profile.noPlayersFound', 'לא נמצאו שחקנים תואמים')}
                    </Text>
                </View>
            )}

            {!loading && (
                <FlatList
                    data={results}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPlayerRow}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 24 }}
                />
            )}
        </SafeAreaView>
    );
}
