import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import React, { useEffect, useState, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { usersApi } from '../../src/services/api/users';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function FriendsScreen() {
    const { t } = useTranslation();
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();

    const [friends, setFriends] = useState<any[]>([]);
    const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadSocialData = async () => {
        if (!user?.id) return;
        try {
            const token = await getToken();
            if (token) {
                const [friendsData, incomingData] = await Promise.all([
                    usersApi.getFriends(user.id, token),
                    usersApi.getIncomingRequests(user.id, token)
                ]);
                setFriends(friendsData);
                setIncomingRequests(incomingData);
            }
        } catch (err) {
            console.error("Failed to load social data", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadSocialData();
    }, [user?.id]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadSocialData();
    }, [user?.id]);

    const handleAcceptRequest = async (requestId: string) => {
        try {
            const token = await getToken();
            if (token) {
                await usersApi.acceptFriendRequest(requestId, token);
                loadSocialData();
            }
        } catch (err) {
            Alert.alert(t('error', 'שגיאה'), t('profile.failedToAccept', 'Failed to accept request'));
        }
    };

    const handleDeclineRequest = async (requestId: string) => {
        try {
            const token = await getToken();
            if (token) {
                await usersApi.declineFriendRequest(requestId, token);
                loadSocialData();
            }
        } catch (err) {
            Alert.alert(t('error', 'שגיאה'), t('profile.failedToDecline', 'Failed to decline request'));
        }
    };

    const handleRemoveFriend = async (friendId: string) => {
        Alert.alert(
            t('profile.removeFriendConfirmTitle', 'הסרת חבר'),
            t('profile.removeFriendConfirmDesc', 'האם אתה בטוח שברצונך להסיר חבר זה?'),
            [
                { text: t('common.cancel', 'ביטול'), style: 'cancel' },
                {
                    text: t('profile.removeFriend', 'הסר'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getToken();
                            if (token) {
                                await usersApi.removeFriend(user!.id, friendId, token);
                                loadSocialData();
                            }
                        } catch (err) {
                            Alert.alert(t('error', 'שגיאה'), t('profile.failedToRemove', 'Failed to remove friend'));
                        }
                    }
                }
            ]
        );
    };

    if (loading && !refreshing) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
            <ScrollView
                className="flex-1 mt-2"
                contentContainerStyle={{ paddingBottom: 40 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
                }
            >
                {/* Search Players Call-to-Action */}
                <View className="bg-white p-5 rounded-2xl mx-4 shadow-sm border border-gray-100 mb-4 items-center">
                    <View className="w-12 h-12 bg-blue-50 rounded-full items-center justify-center mb-3">
                        <FontAwesome name="user-plus" size={20} color="#2563eb" />
                    </View>
                    <Text className="text-lg font-black text-gray-900 mb-1 text-center">מצא חברים חדשים</Text>
                    <Text className="text-gray-500 text-sm text-center mb-4 leading-5">
                        חפש שחקנים אחרים באזורך כדי לתאם איתם משחקים ולהתחיל לשחק יחד!
                    </Text>
                    <TouchableOpacity
                        onPress={() => router.push('/user/search-players')}
                        className="bg-blue-600 px-6 py-3 rounded-xl flex-row items-center justify-center w-full shadow-sm"
                    >
                        <FontAwesome name="search" size={14} color="white" style={{ marginRight: 8 }} />
                        <Text className="text-white font-bold text-base">חפש שחקנים</Text>
                    </TouchableOpacity>
                </View>

                {/* Incoming Requests */}
                {incomingRequests.length > 0 && (
                    <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mx-4 mb-4">
                        <Text className="font-extrabold text-gray-900 mb-3 flex-row items-center text-right">
                            <FontAwesome name="bell" size={16} color="#eab308" style={{ marginRight: 6 }} />
                            {' '}{t('profile.incomingRequests', 'בקשות חברות נכנסות')} ({incomingRequests.length})
                        </Text>
                        {incomingRequests.map(req => (
                            <View key={req.id} className="flex-row items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                                <TouchableOpacity onPress={() => router.push(`/user/${req.requester.id}`)} className="flex-row items-center flex-1">
                                    <Image
                                        source={{ uri: req.requester.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.requester.name)}` }}
                                        className="w-10 h-10 rounded-full bg-gray-200 mr-3"
                                    />
                                    <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>{req.requester.name}</Text>
                                </TouchableOpacity>
                                <View className="flex-row items-center ml-2">
                                    <TouchableOpacity
                                        onPress={() => handleAcceptRequest(req.id)}
                                        className="bg-green-100 p-2 rounded-full mr-2"
                                    >
                                        <FontAwesome name="check" size={16} color="#16a34a" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleDeclineRequest(req.id)}
                                        className="bg-red-100 p-2 rounded-full"
                                    >
                                        <FontAwesome name="times" size={16} color="#dc2626" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Friends List */}
                <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mx-4">
                    <Text className="font-extrabold text-gray-900 mb-4 flex-row items-center text-right">
                        <FontAwesome name="users" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
                        {' '}{t('profile.myFriends', 'החברים שלי')} ({friends.length})
                    </Text>
                    {friends.length === 0 ? (
                        <View className="items-center py-6">
                            <FontAwesome name="users" size={36} color="#d1d5db" />
                            <Text className="text-gray-400 mt-2 text-center text-sm leading-5">
                                {t('profile.noFriends', 'עדיין אין לך חברים ברשת.')}
                            </Text>
                        </View>
                    ) : (
                        friends.map(friend => (
                            <View key={friend.id} className="flex-row items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                                <TouchableOpacity onPress={() => router.push(`/user/${friend.id}`)} className="flex-row items-center flex-1">
                                    <Image
                                        source={{ uri: friend.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.name)}` }}
                                        className="w-10 h-10 rounded-full bg-gray-200 mr-3"
                                    />
                                    <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>{friend.name}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleRemoveFriend(friend.id)}
                                    className="bg-red-50 px-3 py-1.5 rounded-lg border border-red-100"
                                >
                                    <Text className="text-xs text-red-600 font-bold">{t('profile.removeFriend', 'הסר')}</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
