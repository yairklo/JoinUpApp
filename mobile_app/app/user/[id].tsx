import { View, Text, ActivityIndicator, Image, TouchableOpacity, ScrollView, Alert } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { usersApi, UserProfile } from '../../src/services/api/users';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SPORT_MAPPING, SPORT_EMOJI } from '@/utils/sports';

export default function UserProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user: currentUser } = useUser();
    const { getToken } = useAuth();
    const { t } = useTranslation();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    
    // Relationship state: 'friends', 'pending_incoming', 'pending_outgoing', 'none', 'self'
    const [relationship, setRelationship] = useState<string>('none');
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (!id || !currentUser?.id) return;
        
        if (id === currentUser.id) {
            setRelationship('self');
            // If it's themselves, maybe redirect them to their own profile tab
            router.replace('/(tabs)/profile');
            return;
        }

        loadUserData();
    }, [id, currentUser?.id]);

    const loadUserData = async () => {
        try {
            setLoading(true);
            const token = await getToken();
            if (!token) return;

            // Fetch profile
            const profileData = await usersApi.getProfile(id, token);
            setProfile(profileData);

            // Fetch relationships to determine status
            const [friends, incoming, outgoing] = await Promise.all([
                usersApi.getFriends(currentUser!.id, token),
                usersApi.getIncomingRequests(currentUser!.id, token),
                usersApi.getOutgoingRequests(currentUser!.id, token)
            ]);

            if (friends.some(f => f.id === id)) {
                setRelationship('friends');
            } else if (outgoing.some(req => req.receiverId === id)) {
                setRelationship('pending_outgoing');
            } else if (incoming.some(req => req.senderId === id)) {
                setRelationship('pending_incoming');
            } else {
                setRelationship('none');
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
            Alert.alert(t('error', 'Error'), t('failedToLoadProfile', 'Failed to load user profile.'));
        } finally {
            setLoading(false);
        }
    };

    const handleAddFriend = async () => {
        try {
            setActionLoading(true);
            const token = await getToken();
            if (!token) return;
            await usersApi.sendFriendRequest(id, token);
            setRelationship('pending_outgoing');
        } catch (error) {
            Alert.alert(t('error', 'Error'), t('failedToSendRequest', 'Failed to send friend request.'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleRemoveFriend = async () => {
        try {
            setActionLoading(true);
            const token = await getToken();
            if (!token) return;
            await usersApi.removeFriend(currentUser!.id, id, token);
            setRelationship('none');
        } catch (error) {
            Alert.alert(t('error', 'Error'), t('failedToRemove', 'Failed to remove friend.'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleAcceptRequest = async () => {
        try {
            setActionLoading(true);
            const token = await getToken();
            if (!token) return;
            
            // We need the request ID, so we fetch incoming again
            const incoming = await usersApi.getIncomingRequests(currentUser!.id, token);
            const request = incoming.find(req => req.senderId === id);
            if (request) {
                await usersApi.acceptFriendRequest(request.id, token);
                setRelationship('friends');
            }
        } catch (error) {
            Alert.alert(t('error', 'Error'), t('failedToAccept', 'Failed to accept request.'));
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </SafeAreaView>
        );
    }

    if (!profile) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
                <Text className="text-gray-500">User not found.</Text>
                <TouchableOpacity onPress={() => router.back()} className="mt-4 p-2 bg-gray-200 rounded-lg">
                    <Text>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'left', 'right']}>
            <View className="flex-row items-center p-4 border-b border-gray-200 bg-white">
                <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
                    <FontAwesome name="chevron-left" size={20} color="#374151" />
                </TouchableOpacity>
                <Text className="flex-1 text-center font-bold text-lg mr-10">{profile.name}</Text>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }}>
                <View className="items-center mb-6">
                    <Image
                        source={{ uri: profile.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&size=200` }}
                        className="w-32 h-32 rounded-full mb-4 bg-gray-200"
                    />
                    <Text className="text-2xl font-bold text-gray-900 mb-1">{profile.name}</Text>
                    {profile.city && (
                        <View className="flex-row items-center">
                            <FontAwesome name="map-marker" size={16} color="#6b7280" className="mr-1" />
                            <Text className="text-gray-600 text-base">{profile.city}</Text>
                        </View>
                    )}

                    {/* Sport stats chips */}
                    {profile.sportStats && profile.sportStats.length > 0 && (
                        <View className="flex-row flex-wrap justify-center mt-3">
                            {profile.sportStats.map((s) => (
                                <View key={s.sport} className="bg-blue-50 px-3 py-1.5 rounded-full mx-1 mb-2 border border-blue-100">
                                    <Text className="text-blue-700 text-sm font-semibold">
                                        {(SPORT_EMOJI[s.sport] || '🏅')} {SPORT_MAPPING[s.sport] || s.sport} · {s.count}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Social Actions */}
                <View className="items-center mb-8">
                    <View className="flex-row flex-wrap justify-center gap-3 mb-4">
                        {relationship === 'friends' && (
                            <TouchableOpacity
                                onPress={handleRemoveFriend}
                                disabled={actionLoading}
                                className="bg-red-50 px-6 py-3 rounded-xl border border-red-200 flex-row items-center"
                            >
                                <FontAwesome name="user-times" size={16} color="#ef4444" style={{ marginRight: 8 }} />
                                <Text className="text-red-500 font-bold">{actionLoading ? '...' : t('removeFriend', 'Remove Friend')}</Text>
                            </TouchableOpacity>
                        )}

                        {relationship === 'none' && (
                            <TouchableOpacity
                                onPress={handleAddFriend}
                                disabled={actionLoading}
                                className="bg-blue-600 px-6 py-3 rounded-xl flex-row items-center"
                            >
                                <FontAwesome name="user-plus" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                                <Text className="text-white font-bold">{actionLoading ? '...' : t('addFriend', 'Add Friend')}</Text>
                            </TouchableOpacity>
                        )}

                        {relationship === 'pending_outgoing' && (
                            <TouchableOpacity
                                disabled={true}
                                className="bg-gray-100 px-6 py-3 rounded-xl border border-gray-300 flex-row items-center"
                            >
                                <FontAwesome name="clock-o" size={16} color="#6b7280" style={{ marginRight: 8 }} />
                                <Text className="text-gray-500 font-bold">{t('requestSent', 'Request Sent')}</Text>
                            </TouchableOpacity>
                        )}

                        {relationship === 'pending_incoming' && (
                            <TouchableOpacity
                                onPress={handleAcceptRequest}
                                disabled={actionLoading}
                                className="bg-green-600 px-6 py-3 rounded-xl flex-row items-center"
                            >
                                <FontAwesome name="check" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                                <Text className="text-white font-bold">{actionLoading ? '...' : t('acceptRequest', 'Accept Request')}</Text>
                            </TouchableOpacity>
                        )}

                        {/* Always show Send Message button unless it's yourself */}
                        {relationship !== 'self' && (
                            <TouchableOpacity
                                onPress={async () => {
                                    try {
                                        setActionLoading(true);
                                        const token = await getToken();
                                        if (!token) return;
                                        // Need to import chatsApi and navigate to chat room
                                        const { chatsApi } = require('../../src/services/api/chats');
                                        const res = await chatsApi.createPrivate(id, token);
                                        // navigate to the chat room
                                        router.push(`/chat/${res.chatId || res.id}`);
                                    } catch (err: any) {
                                        console.error('Error starting chat', err);
                                        if (err?.status === 403) {
                                            Alert.alert(t('error', 'Error'), t('privacy.messagesBlocked', 'This user only accepts messages from friends'));
                                        } else {
                                            Alert.alert(t('error', 'Error'), t('failedToStartChat', 'Failed to start chat.'));
                                        }
                                    } finally {
                                        setActionLoading(false);
                                    }
                                }}
                                disabled={actionLoading}
                                className="bg-white px-6 py-3 rounded-xl border border-blue-200 flex-row items-center shadow-sm"
                            >
                                <FontAwesome name="paper-plane" size={16} color="#2563eb" style={{ marginRight: 8 }} />
                                <Text className="text-blue-600 font-bold">{t('sendMessage', 'Send Message')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>


                {/* Additional Info */}
                <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <Text className="font-bold text-gray-900 text-lg mb-4">{t('about', 'About')}</Text>
                    
                    {profile.age ? (
                        <View className="flex-row items-center mb-3">
                            <View className="w-8 items-center"><FontAwesome name="birthday-cake" size={16} color="#9ca3af" /></View>
                            <Text className="text-gray-700">{profile.age} {t('yearsOld', 'years old')}</Text>
                        </View>
                    ) : null}

                    {profile.sports && profile.sports.length > 0 && (
                        <View className="mt-4">
                            <Text className="font-bold text-gray-800 mb-2">{t('favoriteSports', 'Favorite Sports')}</Text>
                            <View className="flex-row flex-wrap">
                                {profile.sports.map((sport, index) => (
                                    <View key={index} className="bg-blue-50 px-3 py-1 rounded-full mr-2 mb-2 border border-blue-100">
                                        <Text className="text-blue-700 text-sm">
                                            {sport.name} {sport.position ? `- ${sport.position}` : ''}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                {/* Friends (privacy-filtered) */}
                {profile.sections?.friends && profile.friends && (
                    <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mt-4">
                        <Text className="font-bold text-gray-900 text-lg mb-4">{t('privacy.friendsSection', 'Friends')}</Text>
                        {profile.friends.length === 0 ? (
                            <Text className="text-gray-400">{t('privacy.noFriends', 'No friends to show')}</Text>
                        ) : (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
                                {profile.friends.map((f) => (
                                    <TouchableOpacity
                                        key={f.id}
                                        onPress={() => router.push(`/user/${f.id}`)}
                                        className="items-center mr-4"
                                        style={{ width: 72 }}
                                    >
                                        <Image
                                            source={{ uri: f.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(f.name || 'U')}&size=100` }}
                                            className="w-14 h-14 rounded-full mb-1 bg-gray-200"
                                        />
                                        <Text className="text-gray-700 text-xs text-center" numberOfLines={1}>{f.name || 'משתמש'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                )}

                {/* Match history (privacy-filtered) */}
                {profile.sections?.matchHistory && profile.matchHistory && (
                    <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mt-4">
                        <Text className="font-bold text-gray-900 text-lg mb-4">{t('privacy.matchHistory', 'Match History')}</Text>
                        {profile.matchHistory.length === 0 ? (
                            <Text className="text-gray-400">{t('privacy.noMatches', 'No past matches')}</Text>
                        ) : (
                            profile.matchHistory.map((m) => {
                                const sportLabel = m.sport ? SPORT_MAPPING[m.sport] || m.sport : '';
                                const emoji = m.sport ? SPORT_EMOJI[m.sport] || '🏅' : '🏅';
                                const meta = [`${emoji} ${sportLabel}`, m.date, m.time].filter(Boolean).join(' · ');
                                return (
                                    <TouchableOpacity
                                        key={m.id}
                                        onPress={() => router.push(`/game/${m.id}`)}
                                        className="flex-row items-center py-3 border-b border-gray-50"
                                    >
                                        <FontAwesome name="soccer-ball-o" size={18} color="#2563eb" style={{ marginRight: 12 }} />
                                        <View className="flex-1">
                                            <Text className="text-gray-800 font-medium">{m.title || sportLabel || 'משחק'}</Text>
                                            <Text className="text-gray-500 text-xs mt-0.5">{meta}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>
                )}

            </ScrollView>
        </SafeAreaView>
    );
}
