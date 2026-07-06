import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Image, Modal, ScrollView } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import MapView from 'react-native-map-clustering';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { gamesApi, fieldsApi } from '@/services/api';
import { useAuth } from '@clerk/clerk-expo';
import { Game } from '@/types/game';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';

export default function SearchScreen() {
    const { t, i18n } = useTranslation();
    const { getToken } = useAuth();
    const router = useRouter();

    const [query, setQuery] = useState('');
    const [selectedCity, setSelectedCity] = useState<string | null>(null);
    const [cities, setCities] = useState<string[]>([]);

    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(false);
    const [cityModalVisible, setCityModalVisible] = useState(false);
    const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
    const mapRef = useRef<any>(null);
    
    const [mapBounds, setMapBounds] = useState<{minLat: number, maxLat: number, minLng: number, maxLng: number} | null>(null);
    const searchTimeoutRef = useRef<any>(null);
    const [selectedFieldGames, setSelectedFieldGames] = useState<Game[] | null>(null);

    const params = useLocalSearchParams();

    const [selectedDate, setSelectedDate] = useState<Date | null>(params.date ? new Date(params.date as string) : null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [selectedSport, setSelectedSport] = useState<string | null>((params.sport as string) || null);
    const [sportModalVisible, setSportModalVisible] = useState(false);
    const [isMapView, setIsMapView] = useState(params.hideMap !== 'true');
    const [networkGames, setNetworkGames] = useState(false);
    const SPORTS = [
        { id: 'SOCCER', label: t('newGame.soccer', 'כדורגל') },
        { id: 'BASKETBALL', label: t('newGame.basketball', 'כדורסל') },
        { id: 'TENNIS', label: t('newGame.tennis', 'טניס') },
        { id: 'VOLLEYBALL', label: t('newGame.volleyball', 'כדורעף') },
        { id: 'PADEL', label: t('newGame.padel', 'פדל') }
    ];

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
        // Debounce search when bounds change
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        searchTimeoutRef.current = setTimeout(() => {
            performSearch();
        }, 500);
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        }
    }, [selectedCity, selectedDate, selectedSport, mapBounds, query, networkGames]);

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
            if (networkGames) params.append('networkGames', 'true');
            if (isMapView && mapBounds) {
                params.append('minLat', mapBounds.minLat.toString());
                params.append('maxLat', mapBounds.maxLat.toString());
                params.append('minLng', mapBounds.minLng.toString());
                params.append('maxLng', mapBounds.maxLng.toString());
            }
            if (selectedSport) {
                params.append('sport', selectedSport);
            }
            
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
                // If no specific date selected, only show upcoming games for the next 7 days
                const nextWeek = new Date(now);
                nextWeek.setDate(nextWeek.getDate() + 7);
                
                finalGames = finalGames.filter(game => {
                    if (!game.date) return true;
                    
                    // Robust local date parsing that works across all JS engines (Hermes/JSC/V8)
                    const [year, month, day] = game.date.split('-').map(Number);
                    const [hours, minutes] = (game.time || '00:00').split(':').map(Number);
                    const gameDateTime = new Date(year, month - 1, day, hours, minutes, 0);
                    
                    if (game.duration) {
                        gameDateTime.setMinutes(gameDateTime.getMinutes() + game.duration);
                    } else {
                        gameDateTime.setHours(gameDateTime.getHours() + 2); // Default 2 hours
                    }
                    return gameDateTime > now && gameDateTime <= nextWeek;
                });
            } else {
                // Keep all games for the selected date, regardless of time
                finalGames = finalGames.filter(g => g.date === targetDateStr);
            }
            
            // Explicit local filter for city, to ensure the map and list never show items from other cities
            // even if the backend search is fuzzy
            if (selectedCity) {
                finalGames = finalGames.filter(g => {
                    const loc = g.field?.location || g.fieldLocation || '';
                    const city = g.field?.city || g.city || '';
                    return city === selectedCity || loc.includes(selectedCity);
                });
            }

            setGames(finalGames);
        } catch (error) {
            console.error("Search failed", error);
        } finally {
            setLoading(false);
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
    
    // Returning explicit Hex colors ensures NativeWind doesn't purge them
    const getSportColorHex = (sport?: string) => {
        const s = sport?.toLowerCase() || '';
        if (s.includes('כדורגל') || s.includes('soccer') || s.includes('football')) return '#16a34a'; // green-600
        if (s.includes('כדורסל') || s.includes('basketball')) return '#f97316'; // orange-500
        if (s.includes('טניס') || s.includes('tennis')) return '#eab308'; // yellow-500
        if (s.includes('כדורעף') || s.includes('volleyball')) return '#60a5fa'; // blue-400
        if (s.includes('פדל') || s.includes('padel')) return '#a855f7'; // purple-500
        return '#2563eb'; // blue-600 (default)
    };

    const translateCity = (city: string) => {
        if (i18n.language !== 'en') return city;
        const map: Record<string, string> = {
            'תל אביב-יפו': 'Tel Aviv-Yafo',
            'תל אביב': 'Tel Aviv',
            'ירושלים': 'Jerusalem',
            'חיפה': 'Haifa',
            'ראשון לציון': 'Rishon LeZion',
            'פתח תקווה': 'Petah Tikva',
            'אשדוד': 'Ashdod',
            'נתניה': 'Netanya',
            'באר שבע': 'Beer Sheva',
            'חולון': 'Holon',
            'רמת גן': 'Ramat Gan',
            'הרצליה': 'Herzliya',
            'רעננה': 'Raanana',
            'כפר סבא': 'Kfar Saba',
            'אילת': 'Eilat',
            'רחובות': 'Rehovot',
            'מודיעין': 'Modiin'
        };
        return map[city] || city;
    };

    const renderGameItem = useCallback(({ item }: { item: Game }) => (
        <TouchableOpacity
            className="flex-row bg-white p-4 mb-3 rounded-2xl mx-4 shadow-sm"
            onPress={() => router.push(`/game/${item.id}`)}
        >
            <View className="w-16 h-16 rounded-xl items-center justify-center mr-4" style={{ backgroundColor: getSportColorHex(item.sport) + '20' }}>
                <MaterialCommunityIcons name={getSportIcon(item.sport) as any} size={28} color={getSportColorHex(item.sport)} />
            </View>
            <View className="flex-1 justify-center">
                <Text className="text-lg font-bold text-gray-800 mb-1">{item.field?.name || item.fieldName || t("search.game")}</Text>
                <Text className="text-gray-500 text-sm mb-1">
                    {new Date(item.date).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'he-IL')} {t('search.atTime', 'בשעה')} {item.time}
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
    ), [i18n.language, t, router]);

    // Pre-calculate map marker groups to avoid heavy recalculation during map pan/zoom
    const groupedMapGames = useMemo(() => {
        return Object.values(games.reduce((acc, game) => {
            const lat = game.customLat || game.fieldLat || game.field?.lat;
            const lng = game.customLng || game.fieldLng || game.field?.lng;
            if (!lat || !lng) return acc;
            const key = `${lat},${lng}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(game);
            return acc;
        }, {} as Record<string, Game[]>));
    }, [games]);

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
                        onPress={() => setNetworkGames(!networkGames)}
                        className={`mr-2 px-4 py-2 rounded-full border ${networkGames ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`}
                    >
                        <View className="flex-row items-center">
                            <FontAwesome name="users" size={12} color={networkGames ? "white" : "#4b5563"} style={{ marginRight: 6 }} />
                            <Text className={`font-medium ${networkGames ? 'text-white' : 'text-gray-600'}`}>
                                {t("search.networkGames", "רשת המכרים")}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setCityModalVisible(true)}
                        className={`mr-2 px-4 py-2 rounded-full border ${selectedCity ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    >
                        <Text className={`font-medium ${selectedCity ? 'text-white' : 'text-gray-600'}`}>
                            {selectedCity ? translateCity(selectedCity) : t("search.allCities", "כל הערים")} ▾
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setSportModalVisible(true)}
                        className={`mr-2 px-4 py-2 rounded-full border ${selectedSport ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    >
                        <Text className={`font-medium ${selectedSport ? 'text-white' : 'text-gray-600'}`}>
                            {selectedSport ? SPORTS.find(s => s.id === selectedSport)?.label || selectedSport : t("search.sport", "ספורט")} ▾
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
                            {selectedDate ? selectedDate.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'he-IL') : t("search.upcomingWeek", "השבוע הקרוב")}
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
            {isMapView ? (
                <View className="flex-1 mt-2 mx-2 mb-2 rounded-3xl overflow-hidden shadow-sm border border-gray-200 relative">
                    {loading && (
                        <View className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white p-2 rounded-full shadow-lg">
                            <ActivityIndicator size="small" color="#2563eb" />
                        </View>
                    )}
                    <MapView
                        ref={mapRef as any}
                        style={{ flex: 1 }}
                        showsUserLocation={true}
                        showsMyLocationButton={true}
                        clusterColor="#2563eb"
                        initialRegion={{
                            latitude: userLocation?.latitude || 32.0853,
                            longitude: userLocation?.longitude || 34.7818,
                            latitudeDelta: 0.1,
                            longitudeDelta: 0.1,
                        }}
                        onRegionChangeComplete={(region) => {
                            if (!region) return;
                            setMapBounds({
                                minLat: region.latitude - (region.latitudeDelta / 2),
                                maxLat: region.latitude + (region.latitudeDelta / 2),
                                minLng: region.longitude - (region.longitudeDelta / 2),
                                maxLng: region.longitude + (region.longitudeDelta / 2),
                            });
                        }}
                    >
                        {groupedMapGames.map(group => {
                            const firstGame = group[0];
                            const lat = firstGame.customLat || firstGame.fieldLat || firstGame.field?.lat;
                            const lng = firstGame.customLng || firstGame.fieldLng || firstGame.field?.lng;
                            
                            // If multiple sports, show generic icon/color, else the specific sport
                            const uniqueSports = [...new Set(group.map(g => g.sport))];
                            const isMixed = uniqueSports.length > 1;
                            const iconName = isMixed ? 'map-marker-multiple' : getSportIcon(firstGame.sport);
                            const hexColor = isMixed ? '#64748b' : getSportColorHex(firstGame.sport); // slate-500 for mixed
                            
                            return (
                                <Marker
                                    key={firstGame.id}
                                    coordinate={{ latitude: lat!, longitude: lng! }}
                                    onPress={() => setSelectedFieldGames(group)}
                                >
                                    <View style={{ backgroundColor: hexColor }} className="w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow-lg">
                                        <MaterialCommunityIcons name={iconName as any} size={20} color="white" />
                                        {group.length > 1 && (
                                            <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-4 h-4 items-center justify-center">
                                                <Text className="text-white text-[10px] font-bold">{group.length}</Text>
                                            </View>
                                        )}
                                    </View>
                                </Marker>
                            );
                        })}
                    </MapView>

                    {/* Games Modal for Map Markers */}
                    <Modal
                        visible={!!selectedFieldGames}
                        transparent={true}
                        animationType="slide"
                        onRequestClose={() => setSelectedFieldGames(null)}
                    >
                        <View className="flex-1 justify-end bg-black/50">
                            <View className="bg-white rounded-t-3xl p-6 max-h-[80%]">
                                <View className="flex-row justify-between items-center mb-4">
                                    <TouchableOpacity onPress={() => setSelectedFieldGames(null)} className="p-2">
                                        <MaterialCommunityIcons name="close" size={24} color="#6b7280" />
                                    </TouchableOpacity>
                                    <Text className="text-xl font-bold text-gray-800 text-right">
                                        {selectedFieldGames?.[0]?.field?.name || selectedFieldGames?.[0]?.fieldName || 'משחקים במגרש'}
                                    </Text>
                                </View>
                                <FlatList
                                    showsVerticalScrollIndicator={false}
                                    data={selectedFieldGames}
                                    keyExtractor={(game) => game.id}
                                    renderItem={({ item: game }) => (
                                        <TouchableOpacity 
                                            className="bg-gray-50 p-4 rounded-2xl mb-3 border border-gray-100 flex-row justify-between items-center"
                                            onPress={() => {
                                                setSelectedFieldGames(null);
                                                router.push(`/game/${game.id}`);
                                            }}
                                        >
                                            <View className="bg-blue-100 p-2 rounded-full">
                                                <MaterialCommunityIcons name="chevron-left" size={24} color="#2563eb" />
                                            </View>
                                            <View className="flex-1 items-end mr-3">
                                                <Text className="text-base font-bold text-gray-800 text-right">{game.title || 'משחק'}</Text>
                                                <Text className="text-sm text-gray-500 text-right mt-1">
                                                    {new Date(game.date).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'he-IL')} {t('search.atTime', 'בשעה')} {game.time}
                                                </Text>
                                                <View className="flex-row items-center justify-end mt-2">
                                                    <Text className="text-xs text-blue-600 font-medium ml-1">
                                                        {SPORTS.find(s => s.id === game.sport)?.label || game.sport}
                                                    </Text>
                                                    <MaterialCommunityIcons name={getSportIcon(game.sport)} size={12} color="#2563eb" />
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        </View>
                    </Modal>
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
                                        {item === t("search.allCities") ? item : translateCity(item)}
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
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    className="py-4 border-b border-gray-100"
                                    onPress={() => {
                                        setSelectedSport(item.id);
                                        setSportModalVisible(false);
                                    }}
                                >
                                    <Text className={`text-lg ${selectedSport === item.id ? 'text-blue-600 font-bold' : 'text-gray-800'}`}>
                                        {item.label}
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
