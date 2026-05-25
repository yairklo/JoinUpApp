import { View, Text, TextInput, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import React, { useState, useEffect } from 'react';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { gamesApi, fieldsApi } from '@/services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Game } from '@/types/game';

export default function EditGameScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { getToken } = useAuth();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [game, setGame] = useState<Game | null>(null);

    // Form State
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState(new Date());
    const [maxPlayers, setMaxPlayers] = useState('14');
    const [price, setPrice] = useState('0');
    const [description, setDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    // Pickers visibility
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    useEffect(() => {
        fetchGame();
    }, [id]);

    const fetchGame = async () => {
        try {
            const token = await getToken();
            const data = await gamesApi.getById(id, token || undefined);
            setGame(data);

            // Populate form
            setDate(new Date(data.date));
            // Time is string "HH:mm" in DB, need to construct Date object for Picker
            const [hours, minutes] = data.time.split(':').map(Number);
            const timeObj = new Date();
            timeObj.setHours(hours);
            timeObj.setMinutes(minutes);
            setTime(timeObj);

            setMaxPlayers(data.maxPlayers.toString());
            setPrice(data.price?.toString() || '0');
            setDescription(data.description || '');
            setIsPrivate(data.isFriendsOnly || false); // Assuming isFriendsOnly matches "Private" concept or add separate field

        } catch (error) {
            console.error("Failed to load game", error);
            Alert.alert("Error", "Failed to load game details");
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const token = await getToken();
            if (!token) return;

            // Combine Date and Time
            const gameDate = new Date(date);

            // Format time string HH:mm
            const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

            // Construct payload matching UpdateGameDTO
            const payload = {
                date: gameDate.toISOString(),
                time: timeString,
                maxPlayers: parseInt(maxPlayers),
                price: parseInt(price),
                description,
                isFriendsOnly: isPrivate
            };

            await gamesApi.update(id, payload, token);

            Alert.alert("Success", "Game updated successfully!", [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (error: any) {
            console.error("Update game failed", error);
            Alert.alert("Error", error.response?.data?.error || "Failed to update game");
        } finally {
            setSubmitting(false);
        }
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) setDate(selectedDate);
    };

    const onTimeChange = (event: any, selectedTime?: Date) => {
        setShowTimePicker(false);
        if (selectedTime) setTime(selectedTime);
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <>
            <Stack.Screen options={{ title: 'Edit Game' }} />
            <ScrollView className="flex-1 bg-gray-50 p-4">

                {/* Field Info (Read Only) */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">Location</Text>
                    <Text className="text-gray-600">{game?.field?.name || game?.fieldName}</Text>
                    <Text className="text-gray-500 text-sm">{game?.field?.location || game?.fieldLocation}</Text>
                </View>

                {/* Date & Time */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-4 text-gray-800">When?</Text>
                    <View className="flex-row justify-between">
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            className="flex-1 bg-gray-100 p-3 rounded-lg mr-2 items-center"
                        >
                            <Text className="text-gray-500 text-xs mb-1">Date</Text>
                            <Text className="text-gray-800 font-medium">{date.toLocaleDateString()}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setShowTimePicker(true)}
                            className="flex-1 bg-gray-100 p-3 rounded-lg ml-2 items-center"
                        >
                            <Text className="text-gray-500 text-xs mb-1">Time</Text>
                            <Text className="text-gray-800 font-medium">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                        </TouchableOpacity>
                    </View>

                    {showDatePicker && (
                        <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} minimumDate={new Date()} />
                    )}
                    {showTimePicker && (
                        <DateTimePicker value={time} mode="time" display="default" onChange={onTimeChange} />
                    )}
                </View>

                {/* Config */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-4 text-gray-800">Details</Text>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">Max Players</Text>
                        <TextInput
                            value={maxPlayers}
                            onChangeText={setMaxPlayers}
                            keyboardType="numeric"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">Price (₪)</Text>
                        <TextInput
                            value={price}
                            onChangeText={setPrice}
                            keyboardType="numeric"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between">
                        <Text className="text-gray-700">Private Game</Text>
                        <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: '#2563eb' }} />
                    </View>
                </View>

                {/* Optional Description */}
                <View className="bg-white p-4 rounded-xl mb-6 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">Extra Info</Text>
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Any special instructions?"
                        multiline
                        className="bg-gray-100 p-3 rounded-lg h-24 text-top"
                    />
                </View>

                <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={submitting}
                    className={`p-4 rounded-xl items-center mb-10 ${submitting ? 'bg-blue-400' : 'bg-blue-600'}`}
                >
                    <Text className="text-white font-bold text-lg">
                        {submitting ? 'Updating...' : 'Save Changes'}
                    </Text>
                </TouchableOpacity>

            </ScrollView>
        </>
    );
}
