import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { usersApi, UserProfile } from '../../src/services/api/users';

const SPORT_MAPPING: Record<string, string> = {
  BASKETBALL: 'כדורסל',
  SOCCER: 'כדורגל',
  TENNIS: 'טניס',
  VOLLEYBALL: 'כדורעף'
};

function calculateAge(birthDate?: string | null) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  const ageDt = new Date(diff);
  return Math.abs(ageDt.getUTCFullYear() - 1970);
}

export default function ProfileScreen() {
    const { user } = useUser();
    const { signOut, getToken } = useAuth();
    const router = useRouter();
    
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) return;
        const loadProfile = async () => {
            try {
                const token = await getToken();
                if (token) {
                    const data = await usersApi.getProfile(user.id, token);
                    setProfile(data);
                }
            } catch (err) {
                console.error("Failed to load profile", err);
            } finally {
                setLoading(false);
            }
        };
        loadProfile();
    }, [user?.id]);

    const handleSignOut = async () => {
        try {
            await signOut();
            router.replace('/sign-in');
        } catch (err) {
            console.error("Sign out failed", err);
        }
    };

    if (!user || loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50">
                <ActivityIndicator size="large" color="#0000ff" />
            </View>
        )
    }

    const age = calculateAge(profile?.birthDate);

    return (
        <ScrollView className="flex-1 bg-gray-50 p-4">
            {/* Header / Avatar */}
            <View className="items-center bg-white p-6 rounded-2xl shadow-sm mb-4">
                <Image
                    source={{ uri: profile?.imageUrl || user.imageUrl }}
                    className="w-24 h-24 rounded-full mb-4"
                />
                <Text className="text-2xl font-bold text-gray-800">{profile?.name || user.fullName}</Text>
                <Text className="text-gray-500 mb-2">{profile?.city || "Unknown City"}</Text>
            </View>

            {/* Info Section */}
            <View className="bg-white p-6 rounded-2xl shadow-sm mb-4">
                <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Personal Info</Text>
                
                <View className="flex-row justify-between mb-3">
                    <Text className="text-gray-500 font-medium">Email</Text>
                    <Text className="text-gray-800">{profile?.email || user.primaryEmailAddress?.emailAddress || '-'}</Text>
                </View>
                
                <View className="flex-row justify-between mb-3">
                    <Text className="text-gray-500 font-medium">Phone</Text>
                    <Text className="text-gray-800">{profile?.phone || '-'}</Text>
                </View>

                <View className="flex-row justify-between mb-3">
                    <Text className="text-gray-500 font-medium">Age</Text>
                    <Text className="text-gray-800">{age ? String(age) : '-'}</Text>
                </View>
            </View>

            {/* Sports Section */}
            <View className="bg-white p-6 rounded-2xl shadow-sm mb-6">
                <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Sports & Positions</Text>
                
                {profile?.sports && profile.sports.length > 0 ? (
                    <View className="flex-row flex-wrap">
                        {profile.sports.map(s => {
                            const hebrewName = SPORT_MAPPING[s.name] || SPORT_MAPPING[s.id] || s.name;
                            const label = s.position ? `${hebrewName} (${s.position})` : hebrewName;
                            return (
                                <View key={s.id} className="bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 mr-2 mb-2">
                                    <Text className="text-blue-600 font-medium">{label}</Text>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <Text className="text-gray-400 italic">No sports listed</Text>
                )}
            </View>

            <TouchableOpacity
                onPress={handleSignOut}
                className="bg-red-50 p-4 rounded-xl items-center border border-red-100 mb-8 shadow-sm"
            >
                <Text className="text-red-600 font-bold text-lg">Sign Out</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}
