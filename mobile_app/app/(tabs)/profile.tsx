import { View, Text, Image, TouchableOpacity } from 'react-native';
import React from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
    const { user } = useUser();
    const { signOut } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        try {
            await signOut();
            router.replace('/sign-in');
        } catch (err) {
            console.error("Sign out failed", err);
        }
    };

    if (!user) {
        return (
            <View className="flex-1 items-center justify-center">
                <Text>Loading profile...</Text>
            </View>
        )
    }

    return (
        <View className="flex-1 bg-gray-50 p-6">
            <View className="items-center bg-white p-6 rounded-2xl shadow-sm mb-6">
                <Image
                    source={{ uri: user.imageUrl }}
                    className="w-24 h-24 rounded-full mb-4"
                />
                <Text className="text-2xl font-bold text-gray-800">{user.fullName}</Text>
                <Text className="text-gray-500">{user.primaryEmailAddress?.emailAddress}</Text>
            </View>

            <TouchableOpacity
                onPress={handleSignOut}
                className="bg-red-50 p-4 rounded-xl items-center border border-red-100"
            >
                <Text className="text-red-600 font-bold text-lg">Sign Out</Text>
            </TouchableOpacity>
        </View>
    );
}
