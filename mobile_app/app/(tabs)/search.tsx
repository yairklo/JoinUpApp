import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Image, Modal, ScrollView } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { gamesApi, fieldsApi } from '@/services/api';
import { useAuth } from '@clerk/clerk-expo';
import { Game } from '@/types/game';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';

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
    const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
    const mapRef = useRef<MapView>(null);

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [selectedSport, setSelectedSport] = useState<string | null>(null);
    const [sportModalVisible, setSportModalVisible] = useState(false);
    const [isMapView, setIsMapView] = useState(false);
    const SPORTS = ['כדורגל', 'כדורסל', 'טניס', 'כדורעף', 'פדל'];

    useEffect(() => {
        loadCities();
        performSearch();
        requestLocation();
    }, []);
    
    const requestLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({});
                setUserLocation(location.coords);
                // If map is already visible and no city selected, center on user
                if (!selectedCity && mapRef.current) {
                    mapRef.current.animateToRegion({
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                        latitudeDelta: 0.1,
                        longitudeDelta: 0.1,
                    });
                }
            }
        } catch (error) {
            console.error("Location permission error", error);
        }
    };

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
            if (query) params.append('q', query);
            if (selectedCity) params.append('city', selectedCity);
            
            let targetDateStr = '';
            if (selectedDate) {
                const year = selectedDate.getFullYear();
                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const day = String(selectedDate.getDate()).padStart(2, '0');
                targetDateStr = `${year}-${month}-${day}`;
                params.append('date', targetDateStr);
            }

            const results = await gamesApi.search(params, token || undefined);
            
            const now = new Date();
            let finalGames = results;
            
            if (!selectedDate) {
                // If no specific date selected, only show upcoming games
                finalGames = finalGames.filter(game => {
                    if (!game.date) return true;
                    const gameDateTime = new Date(`${game.date}T${game.time || '00:00'}`);
                    if (game.duration) {
                        gameDateTime.setMinutes(gameDateTime.getMinutes() + game.duration);
                    } else {
                        gameDateTime.setHours(gameDateTime.getHours() + 2); // Default 2 hours
                    }
                    return gameDateTime > now;
                });
            } else {
                // Keep all games for the selected date, regardless of time
                finalGames = finalGames.filter(g => g.date === targetDateStr);
            }
            
            if (selectedSport) {
                finalGames = finalGames.filter(g => g.sport === selectedSport || g.type === selectedSport || g.title?.includes(selectedSport));
            }

            setGames(finalGames);
        } catch (error) {
            console.error("Search failed", error);
        } finally {
            setLoading(false);
            
            // Camera logic
            if (isMapView && mapRef.current) {
                if (selectedCity) {
                    // Try to geocode city to center map
                    try {
                        const geocode = await Location.geocodeAsync(selectedCity + ', Israel');
                        if (geocode.length > 0) {
                            mapRef.current.animateToRegion({
                                latitude: geocode[0].latitude,
                                longitude: geocode[0].longitude,
                                latitudeDelta: 0.1,
                                longitudeDelta: 0.1,
                            });
                        }
                    } catch (e) {
                        console.log("Geocode failed", e);
                    }
                } else if (userLocation) {
                    mapRef.current.animateToRegion({
                        latitude: userLocation.latitude,
                        longitude: userLocation.longitude,
                        latitudeDelta: 0.1,
                        longitudeDelta: 0.1,
                    });
                }
            }
        }
    };
    
    const getSportIcon = (sport?: string) => {
        const s = sport?.toLowerCase() || '';
        if (s.includes('כדורגל') || s.includes('soccer') || s.includes('football')) return 'soccer';
        if (s.includes('כדורסל') || s.includes('basketball')) return 'basketball';
        if (s.includes('טניס') || s.includes('tennis')) return 'tennis-ball';
        if (s.includes('כדורעף') || s.includes('volleyball')) return 'volleyball';
        if (s.includes('פדל') || s.includes('padel')) return 'racquetball';
        return 'map-marker';
    };
    
    const getSportColor = (sport?: string) => {
        const s = sport?.toLowerCase() || '';
        if (s.includes('כדורגל')) return 'bg-green-600';
        if (s.includes('כדורסל')) return 'bg-orange-500';
        if (s.includes('טניס')) return 'bg-yellow-500';
        if (s.includes('כדורעף')) return 'bg-blue-400';
        if (s.includes('פדל')) return 'bg-purple-500';
        return 'bg-blue-600';
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
                        onPress={() => setIsMapView(!isMapView)}
                        className={`mr-2 px-4 py-2 rounded-full border ${isMapView ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`}
                    >
                        <View className="flex-row items-center">
                            <FontAwesome name={isMapView ? "list" : "map"} size={12} color={isMapView ? "white" : "#4b5563"} style={{ marginRight: 6 }} />
                            <Text className={`font-medium ${isMapView ? 'text-white' : 'text-gray-600'}`}>
                                {isMapView ? t("search.list", "רשימה") : t("search.map", "מפה")}
                            </Text>
                        </View>
                    </TouchableOpacity>

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
            ) : isMapView ? (
                <View className="flex-1 mt-2 mx-2 mb-2 rounded-3xl overflow-hidden shadow-sm border border-gray-200">
                    <MapView
                        ref={mapRef}
                        style={{ flex: 1 }}
                        showsUserLocation={true}
                        showsMyLocationButton={true}
                        initialRegion={{
                            latitude: userLocation?.latitude || 32.0853,
                            longitude: userLocation?.longitude || 34.7818,
                            latitudeDelta: 0.1,
                            longitudeDelta: 0.1,
                        }}
                    >
                        {games.map(game => {
                            const lat = game.customLat || game.fieldLat;
                            const lng = game.customLng || game.fieldLng;
                            if (!lat || !lng) return null;
                            const iconName = getSportIcon(game.sport || game.type);
                            const bgColor = getSportColor(game.sport || game.type);
                            return (
                                <Marker
                                    key={game.id}
                                    coordinate={{ latitude: lat, longitude: lng }}
                                    title={game.title || game.fieldName}
                                    description={new Date(game.date).toLocaleDateString() + ' ' + game.time}
                                    onCalloutPress={() => router.push(`/game/${game.id}`)}
                                >
                                    <View className={`w-10 h-10 rounded-full ${bgColor} items-center justify-center border-2 border-white shadow-lg`}>
                                        <MaterialCommunityIcons name={iconName as any} size={20} color="white" />
                                    </View>
                                    <Callout>
                                        <View className="p-2 w-48">
                                            <Text className="font-bold text-gray-800 text-sm text-right">{game.title || game.fieldName}</Text>
                                            <Text className="text-gray-600 text-xs mt-1 text-right">{new Date(game.date).toLocaleDateString()} בשעה {game.time}</Text>
                                            <Text className="text-blue-600 text-xs mt-1 font-bold text-right">לחץ לפרטים והצטרפות</Text>
                                        </View>
                                    </Callout>
                                </Marker>
                            );
                        })}
                    </MapView>
                </View>
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
