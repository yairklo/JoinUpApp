import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Image, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { gamesApi, fieldsApi } from '@/services/api';
import { useAuth } from '@clerk/clerk-expo';
import { Game } from '@/types/game';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function SearchScreen() {
    const { t } = useTranslation();
    const { getToken } = useAuth();
    const router = useRouter();

    const [query, setQuery] = useState('');
    const [selectedCity, setSelectedCity] = useState<string | null>(null);
    const [cities, setCities] = useState<string[]>([]);

    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(false);
    const [cityModalVisible, setCityModalVisible] = useState(false);

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [selectedSport, setSelectedSport] = useState<string | null>(null);
    const [sportModalVisible, setSportModalVisible] = useState(false);
    const SPORTS = ['כדורגל', 'כדורסל', 'טניס', 'כדורעף', 'פדל'];

    useEffect(() => {
        loadCities();
        performSearch();
    }, []);

    useEffect(() => {
        performSearch();
    }, [selectedCity, selectedDate, selectedSport]);

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
            
            const now = new Date();
            let upcomingGames = results.filter(game => {
                if (!game.date) return true;
                const gameDateTime = new Date(`${game.date}T${game.time || '00:00'}`);
                if (game.duration) {
                    gameDateTime.setMinutes(gameDateTime.getMinutes() + game.duration);
                } else {
                    gameDateTime.setHours(gameDateTime.getHours() + 2); // Default 2 hours
                }
                return gameDateTime > now;
            });
            
            if (selectedDate) {
                const targetDate = selectedDate.toISOString().split('T')[0];
                upcomingGames = upcomingGames.filter(g => g.date === targetDate);
            }
            if (selectedSport) {
                // If game.sport is missing, assume checking title/type or just filter
                upcomingGames = upcomingGames.filter(g => g.sport === selectedSport || g.type === selectedSport || g.title?.includes(selectedSport));
            }

            setGames(upcomingGames);
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
                <Text className="text-lg font-bold text-gray-800 mb-1">{item.field?.name || item.fieldName || t("search.game")}</Text>
                <Text className="text-gray-500 text-sm mb-1">
                    {new Date(item.date).toLocaleDateString()} at {item.time}
                </Text>
                <View className="flex-row items-center">
                    <FontAwesome name="map-marker" size={12} color="#6b7280" style={{ marginRight: 4 }} />
                    <Text className="text-gray-500 text-xs">{item.field?.location || item.fieldLocation || t("search.unknownLocation")}</Text>
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
                        placeholder={t("search.placeholder")}
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={performSearch}
                        className="flex-1 text-base text-gray-800"
                        returnKeyType="search"
                    />
                </View>

                {/* Filter Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                    <TouchableOpacity
                        onPress={() => setCityModalVisible(true)}
                        className={`mr-2 px-4 py-2 rounded-full border ${selectedCity ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    >
                        <Text className={`font-medium ${selectedCity ? 'text-white' : 'text-gray-600'}`}>
                            {selectedCity || t("search.allCities", "כל הערים")} ▾
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setSportModalVisible(true)}
                        className={`mr-2 px-4 py-2 rounded-full border ${selectedSport ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    >
                        <Text className={`font-medium ${selectedSport ? 'text-white' : 'text-gray-600'}`}>
                            {selectedSport || t("search.sport", "ספורט")} ▾
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => {
                            if (selectedDate) {
                                setSelectedDate(null);
                            } else {
                                setShowDatePicker(true);
                            }
                        }}
                        className={`mr-2 px-4 py-2 rounded-full border flex-row items-center ${selectedDate ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    >
                        <Text className={`font-medium ${selectedDate ? 'text-white' : 'text-gray-600'}`}>
                            {selectedDate ? selectedDate.toLocaleDateString() : t("search.date", "תאריך")}
                        </Text>
                        {selectedDate && <FontAwesome name="times" size={12} color="white" style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>
                </ScrollView>
                
                {showDatePicker && (
                    <DateTimePicker
                        value={selectedDate || new Date()}
                        mode="date"
                        display="default"
                        onChange={(event, date) => {
                            setShowDatePicker(false);
                            if (date && event.type !== 'dismissed') {
                                setSelectedDate(date);
                            }
                        }}
                    />
                )}
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
                            <Text className="text-gray-400">{t('search.noGamesFound')}</Text>
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
                            <Text className="text-xl font-bold">{t('search.selectCity')}</Text>
                            <TouchableOpacity onPress={() => setCityModalVisible(false)}>
                                <Text className="text-blue-600 font-bold">{t('search.close')}</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={[t("search.allCities"), ...cities]}
                            keyExtractor={(item) => item}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    className="py-4 border-b border-gray-100"
                                    onPress={() => {
                                        setSelectedCity(item === t("search.allCities") ? null : item);
                                        setCityModalVisible(false);
                                    }}
                                >
                                    <Text className={`text-lg ${selectedCity === item ? 'text-blue-600 font-bold' : (item === t("search.allCities") && !selectedCity ? 'text-blue-600 font-bold' : 'text-gray-800')}`}>
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
            {/* Sport Selection Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={sportModalVisible}
                onRequestClose={() => setSportModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[40%]">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-xl font-bold">{t('search.selectSport', 'בחר ספורט')}</Text>
                            <TouchableOpacity onPress={() => setSportModalVisible(false)}>
                                <Text className="text-blue-600 font-bold">{t('search.close', 'סגור')}</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={SPORTS}
                            keyExtractor={(item) => item}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    className="py-4 border-b border-gray-100"
                                    onPress={() => {
                                        setSelectedSport(item);
                                        setSportModalVisible(false);
                                    }}
                                >
                                    <Text className={`text-lg ${selectedSport === item ? 'text-blue-600 font-bold' : 'text-gray-800'}`}>
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            ListHeaderComponent={
                                <TouchableOpacity
                                    className="py-4 border-b border-gray-100"
                                    onPress={() => {
                                        setSelectedSport(null);
                                        setSportModalVisible(false);
                                    }}
                                >
                                    <Text className={`text-lg ${!selectedSport ? 'text-blue-600 font-bold' : 'text-gray-800'}`}>
                                        {t("search.allSports", "כל סוגי הספורט")}
                                    </Text>
                                </TouchableOpacity>
                            }
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}
