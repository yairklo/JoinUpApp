import { View, Text, Switch, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { seriesApi } from '@/services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function SeriesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { getToken } = useAuth();
    const router = useRouter();

    const [series, setSeries] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);

    // Edit State
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
            // Assuming getById exists now
            const data = await seriesApi.getById(id, token);
            setSeries(data);
            setTime(data.defaultTime || "20:00");
            // Check subscription status if available in data
            setIsSubscribed(data.isSubscribed || false);
        } catch (error) {
            console.error("Failed to load series", error);
            Alert.alert("Error", "Failed to load series details");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        setUpdating(true);
        try {
            const token = await getToken();
            if (!token) return;

            await seriesApi.update(id, {
                time,
                updateFutureGames: updateFuture
            }, token);

            Alert.alert("Success", "Series updated successfully");
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to update series");
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = async () => {
        Alert.alert("Delete Series", "Are you sure? This will delete all future games.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    try {
                        const token = await getToken();
                        if (!token) return;
                        await seriesApi.delete(id, token);
                        Alert.alert("Success", "Series deleted");
                        router.replace('/(tabs)');
                    } catch (e) {
                        Alert.alert("Error", "Failed to delete series");
                    }
                }
            }
        ]);
    };

    const toggleSubscribe = async () => {
        try {
            const token = await getToken();
            if (!token) return;
            await seriesApi.toggleSubscribe(id, isSubscribed, token);
            setIsSubscribed(!isSubscribed);
        } catch (e) {
            Alert.alert("Error", "Failed to update subscription");
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    if (!series) {
        return (
            <View className="flex-1 justify-center items-center">
                <Text>Series not found</Text>
            </View>
        );
    }

    return (
        <>
            <Stack.Screen options={{ title: 'Manage Series' }} />
            <ScrollView className="flex-1 bg-gray-50 p-4">

                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <View className="flex-row items-center mb-4">
                        <FontAwesome name="calendar" size={24} color="#2563eb" style={{ marginRight: 10 }} />
                        <View>
                            <Text className="text-xl font-bold text-gray-800">Series Settings</Text>
                            <Text className="text-gray-500">Manage recurring games</Text>
                        </View>
                    </View>

                    <View className="mb-4">
                        <Text className="text-gray-700 mb-1">Default Time</Text>
                        <TextInput
                            value={time}
                            onChangeText={setTime}
                            placeholder="HH:MM"
                            className="bg-gray-100 p-3 rounded-lg text-lg"
                        />
                    </View>

                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-gray-700 w-3/4">Update all future games?</Text>
                        <Switch value={updateFuture} onValueChange={setUpdateFuture} />
                    </View>

                    <TouchableOpacity
                        onPress={handleUpdate}
                        disabled={updating}
                        className="bg-blue-600 p-4 rounded-xl items-center"
                    >
                        <Text className="text-white font-bold text-lg">
                            {updating ? 'Saving...' : 'Save Changes'}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <View className="flex-row justify-between items-center">
                        <Text className="text-lg font-bold text-gray-800">Auto-Join</Text>
                        <Switch value={isSubscribed} onValueChange={toggleSubscribe} />
                    </View>
                    <Text className="text-gray-500 text-sm mt-2">
                        Automatically join all future games in this series.
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={handleDelete}
                    className="bg-red-50 p-4 rounded-xl items-center border border-red-100 mt-4"
                >
                    <Text className="text-red-600 font-bold text-lg">Delete Series</Text>
                </TouchableOpacity>

            </ScrollView>
        </>
    );
}
