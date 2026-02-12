import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Image } from 'react-native';
import React, { useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
// import { useNotifications } from '@/hooks/useNotifications'; // If we have one for settings?
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function SettingsScreen() {
    const { signOut } = useAuth();
    const { user } = useUser();
    const router = useRouter();

    const [pushEnabled, setPushEnabled] = useState(false); // ToDo: Link to actual permission state
    const [emailEnabled, setEmailEnabled] = useState(true);

    const handleSignOut = async () => {
        try {
            await signOut();
            router.replace('/sign-in'); // Or relying on auth listener
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <>
            <Stack.Screen options={{ title: 'Settings' }} />
            <ScrollView className="flex-1 bg-gray-50">
                {/* Profile Section */}
                <View className="mt-6 mb-6 items-center">
                    <Image
                        source={{ uri: user?.imageUrl }}
                        className="w-24 h-24 rounded-full bg-gray-200 mb-3"
                    />
                    <Text className="text-xl font-bold text-gray-800">{user?.fullName}</Text>
                    <Text className="text-gray-500">{user?.primaryEmailAddress?.emailAddress}</Text>
                </View>

                {/* General Settings */}
                <View className="bg-white mx-4 rounded-xl mb-4 shadow-sm overflow-hidden">
                    <View className="p-4 border-b border-gray-100 flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center mr-3">
                                <FontAwesome name="bell" size={14} color="#2563eb" />
                            </View>
                            <Text className="text-base text-gray-800 font-medium">Push Notifications</Text>
                        </View>
                        <Switch value={pushEnabled} onValueChange={setPushEnabled} />
                    </View>

                    <View className="p-4 flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <View className="w-8 h-8 rounded-full bg-green-100 items-center justify-center mr-3">
                                <FontAwesome name="envelope" size={14} color="#16a34a" />
                            </View>
                            <Text className="text-base text-gray-800 font-medium">Email Updates</Text>
                        </View>
                        <Switch value={emailEnabled} onValueChange={setEmailEnabled} />
                    </View>
                </View>

                {/* App Info, Support */}
                <View className="bg-white mx-4 rounded-xl mb-6 shadow-sm overflow-hidden">
                    <TouchableOpacity className="p-4 border-b border-gray-100 flex-row items-center justify-between">
                        <Text className="text-base text-gray-800">Privacy Policy</Text>
                        <FontAwesome name="angle-right" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    <TouchableOpacity className="p-4 border-b border-gray-100 flex-row items-center justify-between">
                        <Text className="text-base text-gray-800">Terms of Service</Text>
                        <FontAwesome name="angle-right" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    <View className="p-4 flex-row items-center justify-between bg-gray-50">
                        <Text className="text-sm text-gray-500">Version</Text>
                        <Text className="text-sm text-gray-500 font-bold">1.0.0 (Beta)</Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={handleSignOut}
                    className="mx-4 bg-red-50 p-4 rounded-xl items-center border border-red-100 mb-10"
                >
                    <Text className="text-red-600 font-bold text-lg">Sign Out</Text>
                </TouchableOpacity>
            </ScrollView>
        </>
    );
}
