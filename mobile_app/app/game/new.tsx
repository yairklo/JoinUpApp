import { View, Text, TextInput, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, Platform } from 'react-native';
import React, { useState, useEffect } from 'react';
import { useRouter, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { gamesApi, fieldsApi } from '@/services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function NewGameScreen() {
    const { getToken } = useAuth();
    const router = useRouter();

    const [cities, setCities] = useState<string[]>([]);
    const [fields, setFields] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [sport, setSport] = useState('SOCCER'); // Default matching SportType enum
    const [selectedCity, setSelectedCity] = useState('');
    const [selectedField, setSelectedField] = useState<any>(null);
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState(new Date());
    const [maxPlayers, setMaxPlayers] = useState('14');
    const [price, setPrice] = useState('0');
    const [description, setDescription] = useState('');
    const [whatsappLink, setWhatsappLink] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    // Pickers visibility
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [cityList, fieldList] = await Promise.all([
                fieldsApi.getCities(),
                fieldsApi.getAll()
            ]);
            setCities(cityList);
            setFields(fieldList);
            if (cityList.length > 0) setSelectedCity(cityList[0]);
        } catch (error) {
            console.error("Failed to load data", error);
            Alert.alert("Error", "Failed to load fields data");
        } finally {
            setLoading(false);
        }
    };

    const filteredFields = fields.filter(f => !selectedCity || f.city === selectedCity || f.location?.includes(selectedCity));

    const handleSubmit = async () => {
        if (!selectedField) {
            Alert.alert("Error", "Please select a field");
            return;
        }

        setSubmitting(true);
        try {
            const token = await getToken();
            if (!token) return;

            // Combine Date and Time
            const gameDate = new Date(date);
            const dateStr = gameDate.toISOString().split('T')[0];

            // Format time string HH:mm
            const hours = time.getHours().toString().padStart(2, '0');
            const minutes = time.getMinutes().toString().padStart(2, '0');
            const timeString = `${hours}:${minutes}`;

            // Construct payload matching backend expectation
            const payload = {
                fieldId: selectedField.id,
                date: dateStr,
                time: timeString,
                maxPlayers: parseInt(maxPlayers) || 14,
                price: parseInt(price) || 0,
                description,
                whatsappLink,
                isPrivate,
                sport
            };

            const result = await gamesApi.create(payload, token);
            Alert.alert("Success", "Game created successfully!", [
                { text: "OK", onPress: () => router.replace(`/(tabs)`) } // Or go to game details result.id
            ]);
        } catch (error: any) {
            console.error("Create game failed", error);
            Alert.alert("Error", error.response?.data?.error || "Failed to create game");
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
            <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <>
            <Stack.Screen options={{ title: 'New Game' }} />
            <ScrollView className="flex-1 bg-gray-50 p-4">

                {/* Field Selection */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">Location</Text>

                    {/* City Selector (Simple Scroll) */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                        {cities.map(city => (
                            <TouchableOpacity
                                key={city}
                                onPress={() => { setSelectedCity(city); setSelectedField(null); }}
                                className={`mr-2 px-4 py-2 rounded-full border ${selectedCity === city ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                            >
                                <Text className={selectedCity === city ? 'text-white' : 'text-gray-700'}>{city}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <Text className="text-sm text-gray-500 mb-2">Select Field:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {filteredFields.map(field => (
                            <TouchableOpacity
                                key={field.id}
                                onPress={() => setSelectedField(field)}
                                className={`mr-3 p-3 rounded-xl border w-40 ${selectedField?.id === field.id ? 'bg-blue-50 border-blue-600' : 'bg-white border-gray-200'}`}
                            >
                                <Text className={`font-bold ${selectedField?.id === field.id ? 'text-blue-700' : 'text-gray-800'}`} numberOfLines={1}>{field.name}</Text>
                                <Text className="text-xs text-gray-500" numberOfLines={1}>{field.location}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
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
                        {submitting ? 'Creating...' : 'Create Game'}
                    </Text>
                </TouchableOpacity>

            </ScrollView>
        </>
    );
}
