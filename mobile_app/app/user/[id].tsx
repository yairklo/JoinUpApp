import { View, Text, Image, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { usersApi } from '@/services/api';
import { useUserActions } from '@/hooks/useUserActions';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function UserProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user: currentUser } = useUser();
    const router = useRouter();

    const [profile, setProfile] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const {
        friendStatus,
        isPending,
        handleAddFriend,
        handleRemoveFriend,
        handleCancelRequest,
        handleAcceptRequest,
        handleSendMessage
    } = useUserActions({
        targetUserId: id,
        targetUserName: profile?.name,
        targetUserImage: profile?.imageUrl
    });

    useEffect(() => {
        fetchProfile();
    }, [id]);

    const fetchProfile = async () => {
        try {
            const data = await usersApi.getProfile(id);
            setProfile(data);
            // Mock stats or fetch if available
            setStats({ gamesPlayed: 0, reliableScore: 100 });
        } catch (err) {
            console.error("Failed to load profile", err);
            Alert.alert("Error", "Failed to load user profile");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    if (!profile) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <Text className="text-gray-500">User not found</Text>
            </View>
        );
    }

    const isMe = currentUser?.id === id;

    const renderActionButton = () => {
        if (isMe) return null;

        if (friendStatus === 'FRIEND') {
            return (
                <View className="flex-row space-x-3 gap-3">
                    <TouchableOpacity
                        onPress={handleSendMessage}
                        className="flex-1 bg-blue-600 p-3 rounded-xl items-center flex-row justify-center"
                    >
                        <FontAwesome name="comment" size={16} color="white" style={{ marginRight: 8 }} />
                        <Text className="text-white font-bold">Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => {
                            Alert.alert("Remove Friend", "Are you sure?", [
                                { text: "Cancel", style: "cancel" },
                                { text: "Remove", style: "destructive", onPress: handleRemoveFriend }
                            ]);
                        }}
                        className="bg-gray-200 p-3 rounded-xl items-center justify-center w-12"
                    >
                        <FontAwesome name="user-times" size={16} color="gray" />
                    </TouchableOpacity>
                </View>
            );
        }

        if (friendStatus === 'REQUEST_SENT') {
            return (
                <View className="bg-gray-200 p-3 rounded-xl items-center">
                    <Text className="text-gray-700 font-bold">Request Sent</Text>
                </View>
            );
        }

        if (friendStatus === 'REQUEST_RECEIVED') {
            return (
                <View className="flex-row space-x-3 gap-3">
                    <TouchableOpacity
                        onPress={handleAcceptRequest}
                        disabled={isPending}
                        className="flex-1 bg-blue-600 p-3 rounded-xl items-center"
                    >
                        <Text className="text-white font-bold">Accept Request</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <TouchableOpacity
                onPress={handleAddFriend}
                disabled={isPending}
                className="bg-blue-600 p-3 rounded-xl items-center flex-row justify-center"
            >
                <FontAwesome name="user-plus" size={16} color="white" style={{ marginRight: 8 }} />
                <Text className="text-white font-bold">Add Friend</Text>
            </TouchableOpacity>
        );
    };

    return (
        <>
            <Stack.Screen options={{ title: profile.name || 'Profile' }} />
            <ScrollView className="flex-1 bg-gray-50">
                <View className="items-center bg-white p-8 mb-4 shadow-sm">
                    <Image
                        source={{ uri: profile.imageUrl || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y" }}
                        className="w-32 h-32 rounded-full mb-4 bg-gray-200"
                    />
                    <Text className="text-2xl font-bold text-gray-800">{profile.name}</Text>
                    <Text className="text-gray-500 mb-6">JoinUp Player</Text>

                    <View className="w-full px-8">
                        {renderActionButton()}
                    </View>
                </View>

                <View className="flex-row justify-around bg-white p-6 shadow-sm mb-4">
                    <View className="items-center">
                        <Text className="text-xl font-bold text-gray-800">{stats?.gamesPlayed || 0}</Text>
                        <Text className="text-gray-500 text-xs uppercase tracking-wide">Games</Text>
                    </View>
                    <View className="items-center">
                        <Text className="text-xl font-bold text-gray-800">{stats?.reliableScore || 100}%</Text>
                        <Text className="text-gray-500 text-xs uppercase tracking-wide">Reliability</Text>
                    </View>
                </View>
            </ScrollView>
        </>
    );
}
