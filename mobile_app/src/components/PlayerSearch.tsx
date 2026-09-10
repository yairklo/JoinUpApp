import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { usersApi } from '@/services/api/users';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';

/**
 * Inline player search + add-friend list, embedded directly in the friends page
 * (previously its own /user/search-players screen, reached via a button that
 * navigated away).  Renders results as a plain list rather than a FlatList since
 * it lives inside the friends page's own ScrollView.
 */
export default function PlayerSearch() {
    const router = useRouter();
    // Clerk's useAuth() returns a new `getToken` function identity on every render
    // (@clerk/clerk-expo wraps it for JWT caching, uncached). Putting it straight into
    // an effect dependency array that also calls setState is a render loop: state
    // update -> re-render -> new getToken -> effect reruns -> state update -> ...
    // (see mobile_app/src/hooks/useAuthTokenRef.ts, already used by useNotificationCounters
    // for the same reason). Use the stable ref instead of destructuring getToken directly.
    const getTokenRef = useAuthTokenRef();
    const { t } = useTranslation();

    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query, 300);
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    useEffect(() => {
        if (!debouncedQuery.trim()) {
            setResults((prev) => (prev.length ? [] : prev));
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const token = await getTokenRef.current();
                if (!token || cancelled) return;
                const data = await usersApi.search(debouncedQuery, token);
                if (!cancelled) setResults(data);
            } catch (error) {
                if (!cancelled) {
                    console.error('Search players failed:', error);
                    Alert.alert(t('error', 'שגיאה'), t('searchFailed', 'החיפוש נכשל, נסה שוב.'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debouncedQuery, getTokenRef, t]);

    const handleAddFriend = async (targetUserId: string) => {
        try {
            setActionLoadingId(targetUserId);
            const token = await getTokenRef.current();
            if (!token) return;
            await usersApi.sendFriendRequest(targetUserId, token);
            setResults((prev) => prev.map((item) => (
                item.id === targetUserId ? { ...item, friendshipStatus: 'pending', isRequestSender: true } : item
            )));
        } catch (error) {
            console.error('Failed to send friend request:', error);
            Alert.alert(t('error', 'שגיאה'), t('failedToSendRequest', 'שליחת הבקשה נכשלה.'));
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <View className="mx-4 mb-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <Text className="text-lg font-black text-gray-900 mb-3 text-right">
                {t('friends.searchPlayers', 'חפש שחקנים')}
            </Text>

            <View className="bg-gray-50 rounded-2xl px-4 py-3 flex-row items-center border border-gray-200 mb-1">
                <FontAwesome name="search" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
                <TextInput
                    placeholder={t('profile.searchPlayersPlaceholder', 'חפש שחקנים לפי שם או אימייל...')}
                    value={query}
                    onChangeText={setQuery}
                    className="flex-1 text-base text-gray-800 text-right"
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            {loading && (
                <View className="items-center py-4">
                    <ActivityIndicator color="#059669" />
                </View>
            )}

            {!loading && query.trim() !== '' && results.length === 0 && (
                <View className="items-center py-6">
                    <FontAwesome name="user-times" size={32} color="#d1d5db" />
                    <Text className="text-gray-500 text-sm mt-3">
                        {t('profile.noPlayersFound', 'לא נמצאו שחקנים תואמים')}
                    </Text>
                </View>
            )}

            {!loading && results.length > 0 && (
                <View className="mt-3">
                    {results.map((item) => {
                        const isPending = item.friendshipStatus === 'pending';
                        const isFriend = item.friendshipStatus === 'friends';
                        const isNone = item.friendshipStatus === 'none';
                        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'User')}`;

                        return (
                            <TouchableOpacity
                                key={item.id}
                                onPress={() => router.push(`/user/${item.id}`)}
                                className="flex-row items-center justify-between bg-gray-50 p-3 mb-2 rounded-2xl border border-gray-100"
                                activeOpacity={0.7}
                            >
                                <View className="flex-row items-center flex-1 mr-3">
                                    <Image
                                        source={{ uri: item.imageUrl || defaultAvatar }}
                                        className="w-11 h-11 rounded-full bg-gray-100"
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
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                handleAddFriend(item.id);
                                            }}
                                            disabled={actionLoadingId === item.id}
                                            className="bg-brand px-3 py-1.5 rounded-lg flex-row items-center"
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
                    })}
                </View>
            )}
        </View>
    );
}
