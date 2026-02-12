import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Image, Modal } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { gamesApi, fieldsApi } from '@/services/api';
import { useAuth } from '@clerk/clerk-expo';
import { Game } from '@/types/game';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function SearchScreen() {
    const { getToken } = useAuth();
    const router = useRouter();

    const [query, setQuery] = useState('');
    const [selectedCity, setSelectedCity] = useState<string | null>(null);
    const [cities, setCities] = useState<string[]>([]);

    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(false);
    const [cityModalVisible, setCityModalVisible] = useState(false);

    useEffect(() => {
        loadCities();
        performSearch();
    }, []);

    useEffect(() => {
        performSearch();
    }, [selectedCity]);

    const loadCities = async () => {
        try {
            const cityList = await fieldsApi.getCities();
            setCities(cityList);
        } catch (error) {
            console.error("Failed to load cities", error);
        }
    };

    const performSearch = async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const params = new URLSearchParams();
            if (query) params.append('q', query); // Assuming backend supports 'q' for general search
            if (selectedCity) params.append('city', selectedCity);

            // If backend search is limited, we might need to use getByCity or getAll and filter client-side
            // Given gamesApi.search signature:
            // search takes params directly.

            const results = await gamesApi.search(params, token || undefined);
            setGames(results);
        } catch (error) {
            console.error("Search failed", error);
        } finally {
            setLoading(false);
        }
    };

    const renderGameItem = ({ item }: { item: Game }) => (
        <TouchableOpacity
            className="flex-row bg-white p-4 mb-3 rounded-2xl mx-4 shadow-sm"
            onPress={() => router.push(`/game/${item.id}`)}
        >
            <View className="w-16 h-16 bg-blue-100 rounded-xl items-center justify-center mr-4">
                <FontAwesome name="soccer-ball-o" size={24} color="#2563eb" />
            </View>
            <View className="flex-1 justify-center">
                <Text className="text-lg font-bold text-gray-800 mb-1">{item.field?.name || item.fieldName || "Game"}</Text>
                <Text className="text-gray-500 text-sm mb-1">
                    {new Date(item.date).toLocaleDateString()} at {item.time}
                </Text>
                <View className="flex-row items-center">
                    <FontAwesome name="map-marker" size={12} color="#6b7280" style={{ marginRight: 4 }} />
                    <Text className="text-gray-500 text-xs">{item.field?.location || item.fieldLocation || "Unknown Location"}</Text>
                </View>
            </View>
            <View className="items-end justify-center">
                <View className={`px-2 py-1 rounded-full ${(item.currentPlayers >= item.maxPlayers) ? 'bg-red-100' : 'bg-green-100'}`}>
                    <Text className={`text-xs font-bold ${(item.currentPlayers >= item.maxPlayers) ? 'text-red-600' : 'text-green-600'}`}>
                        {item.currentPlayers}/{item.maxPlayers}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View className="flex-1 bg-gray-50 pt-4">
            {/* Search Header */}
            <View className="px-4 mb-4">
                <View className="flex-row items-center bg-white p-3 rounded-xl shadow-sm border border-gray-100 mb-3">
                    <FontAwesome name="search" size={16} color="#9ca3af" style={{ marginRight: 10 }} />
                    <TextInput
                        placeholder="Search games, fields..."
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={performSearch}
                        className="flex-1 text-base text-gray-800"
                        returnKeyType="search"
                    />
                </View>

                {/* Filter Chips */}
                <View className="flex-row">
                    <TouchableOpacity
                        onPress={() => setCityModalVisible(true)}
                        className={`mr-2 px-4 py-2 rounded-full border ${selectedCity ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    >
                        <Text className={`font-medium ${selectedCity ? 'text-white' : 'text-gray-600'}`}>
                            {selectedCity || "All Cities"} ▾
                        </Text>
                    </TouchableOpacity>
                    {/* Add more filters here if needed (Date, Price) */}
                </View>
            </View>

            {/* Results */}
            {loading ? (
                <ActivityIndicator size="large" color="#2563eb" className="mt-10" />
            ) : (
                <FlatList
                    data={games}
                    keyExtractor={(item) => item.id}
                    renderItem={renderGameItem}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    ListEmptyComponent={
                        <View className="items-center mt-10">
                            <Text className="text-gray-400">No games found</Text>
                        </View>
                    }
                />
            )}

            {/* City Selection Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={cityModalVisible}
                onRequestClose={() => setCityModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[50%]">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-xl font-bold">Select City</Text>
                            <TouchableOpacity onPress={() => setCityModalVisible(false)}>
                                <Text className="text-blue-600 font-bold">Close</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={['All Cities', ...cities]}
                            keyExtractor={(item) => item}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    className="py-4 border-b border-gray-100"
                                    onPress={() => {
                                        setSelectedCity(item === 'All Cities' ? null : item);
                                        setCityModalVisible(false);
                                    }}
                                >
                                    <Text className={`text-lg ${selectedCity === item ? 'text-blue-600 font-bold' : (item === 'All Cities' && !selectedCity ? 'text-blue-600 font-bold' : 'text-gray-800')}`}>
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}
