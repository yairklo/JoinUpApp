import { View, Text, TextInput, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, Modal, Image } from 'react-native';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { gamesApi, fieldsApi, usersApi, seriesApi } from '@/services/api';
import LoadingMotif from '@/components/loading/LoadingMotif';
import type { Field } from '@/services/api/fields';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { SPORT_MAPPING } from '@/utils/sports';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppBaseMap, { AppBaseMapHandle, MapMarkerRenderContext } from '@/components/map/AppBaseMap';
import FieldMapMarker from '@/components/map/FieldMapMarker';
import CustomPointMarker from '@/components/map/CustomPointMarker';
import { DEFAULT_MAP_REGION, MapBounds, MapCoordinate, MapMarkerItem, MapRegion, regionToBounds } from '@/components/map/types';
import { getFieldSportTags } from '@/utils/mapSport';
import * as Location from 'expo-location';

function filterFieldsWithCoords(fields: Field[]): Field[] {
    return fields.filter((f) => f.lat != null && f.lng != null);
}

function filterFieldsInBounds(fields: Field[], bounds: MapBounds): Field[] {
    return filterFieldsWithCoords(fields).filter(
        (f) =>
            f.lat! >= bounds.minLat &&
            f.lat! <= bounds.maxLat &&
            f.lng! >= bounds.minLng &&
            f.lng! <= bounds.maxLng
    );
}

function regionFromCoordinate(coordinate: MapCoordinate, delta = 0.1): MapRegion {
    return { ...coordinate, latitudeDelta: delta, longitudeDelta: delta };
}

function getInitialGameTime() {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    d.setMinutes(0, 0, 0);
    return d;
}

export default function NewGameScreen() {
    const { t } = useTranslation();
    const { getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();
    const params = useLocalSearchParams<{ fieldId?: string; seriesId?: string }>();
    const prefilledFieldId = params.fieldId;
    const prefilledSeriesId = params.seriesId;
    const insets = useSafeAreaInsets();

    const [cities, setCities] = useState<string[]>([]);
    const [fields, setFields] = useState<any[]>([]);
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Friends State
    const [friends, setFriends] = useState<any[]>([]);
    const [invitedParticipantIds, setInvitedParticipantIds] = useState<string[]>([]);
    const [searchFriendQuery, setSearchFriendQuery] = useState('');

    // Form State
    const [sport, setSport] = useState('SOCCER');
    const [title, setTitle] = useState('');
    const [duration, setDuration] = useState('1');
    const [teamSize, setTeamSize] = useState('');

    const [selectedCity, setSelectedCity] = useState('');
    const [selectedField, setSelectedField] = useState<any>(null);
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState(getInitialGameTime);
    const [maxPlayers, setMaxPlayers] = useState('14');
    const [price, setPrice] = useState('0');
    const [description, setDescription] = useState('');
    const [welcomeMessage, setWelcomeMessage] = useState('');
    const [whatsappLink, setWhatsappLink] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [requiresApproval, setRequiresApproval] = useState(false);

    // Advanced Options State
    const [makePublicLater, setMakePublicLater] = useState(false);
    const [publicDate, setPublicDate] = useState(new Date());
    const [publicTime, setPublicTime] = useState(new Date());

    const [lotteryEnabled, setLotteryEnabled] = useState(false);
    const [lotteryDate, setLotteryDate] = useState(new Date());
    const [lotteryTime, setLotteryTime] = useState(new Date());
    const [organizerInLottery, setOrganizerInLottery] = useState(false);

    const [futureRegistration, setFutureRegistration] = useState(false);
    const [futureRegDate, setFutureRegDate] = useState(new Date());
    const [futureRegTime, setFutureRegTime] = useState(new Date());

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [activePicker, setActivePicker] = useState<string | null>(null);

    // Pickers visibility
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    // Map State
    const [showMapModal, setShowMapModal] = useState(false);
    const [customPoint, setCustomPoint] = useState<MapCoordinate | null>(null);
    const [customFieldName, setCustomFieldName] = useState('');
    const [mapFields, setMapFields] = useState<Field[]>([]);
    const [mapLoading, setMapLoading] = useState(false);
    const [mapSelectedField, setMapSelectedField] = useState<Field | null>(null);
    const [userLocation, setUserLocation] = useState<MapCoordinate | null>(null);
    const [mapInitialRegion, setMapInitialRegion] = useState<MapRegion>(DEFAULT_MAP_REGION);
    const mapRef = useRef<AppBaseMapHandle>(null);
    const mapFetchSeqRef = useRef(0);
    const mapAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (user?.id) {
            loadFriends();
        }
    }, [user?.id]);

    const loadFriends = async () => {
        try {
            const token = await getToken();
            if (!token || !user?.id) return;
            const list = await usersApi.getFriends(user.id, token);
            setFriends(list || []);
        } catch (error) {
            console.error("Failed to load friends", error);
        }
    };

    const fetchMapFields = useCallback(async (bounds: MapBounds) => {
        const seq = ++mapFetchSeqRef.current;
        mapAbortRef.current?.abort();
        const controller = new AbortController();
        mapAbortRef.current = controller;

        setMapLoading(true);
        try {
            const results = await fieldsApi.searchMap(bounds, controller.signal);
            if (seq !== mapFetchSeqRef.current || controller.signal.aborted) return;
            setMapFields(filterFieldsWithCoords(results));
        } catch (error: any) {
            if (controller.signal.aborted || error?.name === 'AbortError') return;
            console.error('Failed to load map fields', error);
        } finally {
            if (seq === mapFetchSeqRef.current) {
                setMapLoading(false);
            }
        }
    }, []);

    const seedMapFieldsForRegion = useCallback((region: MapRegion, cachedFields: Field[]) => {
        const seeded = filterFieldsInBounds(cachedFields, regionToBounds(region));
        if (seeded.length > 0) {
            setMapFields(seeded);
        }
    }, []);

    const handleMapBoundsChange = useCallback((bounds: MapBounds) => {
        if (!showMapModal) return;
        fetchMapFields(bounds);
    }, [showMapModal, fetchMapFields]);

    const openMapModal = async () => {
        setMapSelectedField(selectedField);

        let region: MapRegion = selectedField?.lat != null && selectedField?.lng != null
            ? regionFromCoordinate({ latitude: selectedField.lat, longitude: selectedField.lng })
            : userLocation
                ? regionFromCoordinate(userLocation)
                : DEFAULT_MAP_REGION;

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({});
                const coords = {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                };
                setUserLocation(coords);
                region = regionFromCoordinate(coords);
            }
        } catch (error) {
            console.error('Location permission error', error);
        }

        setMapInitialRegion(region);
        seedMapFieldsForRegion(region, fields);
        setShowMapModal(true);
    };

    useEffect(() => {
        if (!showMapModal) {
            mapAbortRef.current?.abort();
            mapFetchSeqRef.current += 1;
        }
    }, [showMapModal]);

    const handleSelectMapField = useCallback((field: Field) => {
        setMapSelectedField(field);
        setCustomPoint(null);
        setCustomFieldName('');
        if (field.lat != null && field.lng != null) {
            mapRef.current?.animateToCoordinate({
                latitude: field.lat,
                longitude: field.lng,
            });
        }
    }, []);

    const gameMapMarkers = useMemo<MapMarkerItem<Field>[]>(() => {
        return mapFields
            .filter((field) => field.lat != null && field.lng != null)
            .map((field) => ({
                id: field.id,
                latitude: field.lat!,
                longitude: field.lng!,
                payload: field,
                sportTags: getFieldSportTags(field),
            }));
    }, [mapFields]);

    const renderGameFieldMarker = useCallback((ctx: MapMarkerRenderContext<Field>) => {
        const field = ctx.item.payload;
        const selected = mapSelectedField?.id === field.id;
        return (
            <FieldMapMarker
                key={ctx.item.id}
                field={field}
                selected={selected}
                showCallout={selected}
                onPress={() => handleSelectMapField(field)}
            />
        );
    }, [mapSelectedField?.id, handleSelectMapField]);

    const handleMapPress = useCallback((coordinate: MapCoordinate) => {
        setCustomPoint(coordinate);
        setMapSelectedField(null);
    }, []);

    const confirmMapFieldSelection = useCallback(() => {
        if (!mapSelectedField) return;
        setSelectedField(mapSelectedField);
        setCustomPoint(null);
        setCustomFieldName('');
        if (mapSelectedField.city) setSelectedCity(mapSelectedField.city);
        setShowMapModal(false);
    }, [mapSelectedField]);

    const confirmCustomMapPoint = useCallback(() => {
        setSelectedField(null);
        setMapSelectedField(null);
        setShowMapModal(false);
    }, []);

    const mapBottomSheet = useMemo(() => {
        if (mapSelectedField) {
            return (
                <View className="p-4 bg-white border-t border-gray-200 pb-10">
                    <Text className="font-bold text-lg text-center text-gray-900 mb-1">{mapSelectedField.name}</Text>
                    <Text className="text-gray-500 text-center text-sm mb-4">
                        {mapSelectedField.location || mapSelectedField.city || 'מגרש רשום'}
                    </Text>
                    <TouchableOpacity
                        className="bg-brand p-4 rounded-xl items-center"
                        onPress={confirmMapFieldSelection}
                    >
                        <Text className="text-white font-bold">אשר מגרש</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (customPoint) {
            return (
                <View className="p-4 bg-white border-t border-gray-200 pb-10">
                    <Text className="text-gray-600 text-center text-sm mb-3">מיקום מותאם אישית נבחר</Text>
                    <TouchableOpacity
                        className="bg-brand p-4 rounded-xl items-center"
                        onPress={confirmCustomMapPoint}
                    >
                        <Text className="text-white font-bold">אשר מיקום</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return null;
    }, [mapSelectedField, customPoint, confirmMapFieldSelection, confirmCustomMapPoint]);

    // Prefill field/location/time/duration from a series' defaults, keeping every field editable.
    const loadSeriesDefaults = async (seriesId: string, cityList: string[]) => {
        try {
            const series: any = await seriesApi.getById(seriesId);

            if (series.fieldId) {
                try {
                    const field = await fieldsApi.getById(series.fieldId);
                    setSelectedField(field);
                    if (field?.city) setSelectedCity(field.city);
                    else if (cityList.length > 0) setSelectedCity(cityList[0]);
                } catch {
                    setSelectedField({
                        id: series.fieldId,
                        name: series.fieldName || '',
                        location: series.fieldLocation || null,
                    });
                    if (cityList.length > 0) setSelectedCity(cityList[0]);
                }
            } else if (cityList.length > 0) {
                setSelectedCity(cityList[0]);
            }

            if (series.time) {
                const [hours, minutes] = String(series.time).split(':').map(Number);
                if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
                    setTime((prev) => {
                        const next = new Date(prev);
                        next.setHours(hours, minutes, 0, 0);
                        return next;
                    });
                }
            }
            if (typeof series.duration === 'number') {
                setDuration(String(series.duration));
            }
        } catch (error) {
            console.error('Failed to load series defaults', error);
        }
    };

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const cityList = await fieldsApi.getCities();
            setCities(cityList);

            if (prefilledFieldId) {
                try {
                    const field = await fieldsApi.getById(prefilledFieldId);
                    setSelectedField(field);
                    if (field?.city) setSelectedCity(field.city);
                    else if (cityList.length > 0) setSelectedCity(cityList[0]);
                } catch {
                    if (cityList.length > 0) setSelectedCity(cityList[0]);
                }
            } else if (prefilledSeriesId) {
                await loadSeriesDefaults(prefilledSeriesId, cityList);
            } else if (cityList.length > 0) {
                setSelectedCity(cityList[0]);
            }
        } catch (error) {
            console.error("Failed to load data", error);
            Alert.alert("Error", "Failed to load fields data");
        } finally {
            setLoading(false);
        }
    };

    // Fetch just the selected city's fields (bounded) instead of the entire
    // ~900+ row table, refetching whenever the user switches city chips.
    useEffect(() => {
        if (!selectedCity) {
            setFields([]);
            return;
        }
        let ignore = false;
        (async () => {
            setFieldsLoading(true);
            try {
                const page = await fieldsApi.getPage({ take: 200, skip: 0, city: selectedCity });
                if (!ignore) setFields(page.items);
            } catch (error) {
                console.error('Failed to load fields for city', error);
            } finally {
                if (!ignore) setFieldsLoading(false);
            }
        })();
        return () => { ignore = true; };
    }, [selectedCity]);

    const handleSubmit = async () => {
        if (!selectedField && !customPoint) {
            Alert.alert(t('game.validationError', 'שגיאת ולידציה'), t('newGame.mustSelectFieldOrPoint', 'אנא בחר מגרש או סמן מיקום במפה'));
            return;
        }

        // Combine Date and Time safely using local timezone components
        const gameDate = new Date(date);
        const year = gameDate.getFullYear();
        const month = (gameDate.getMonth() + 1).toString().padStart(2, '0');
        const day = gameDate.getDate().toString().padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Format time string HH:mm
        const hours = time.getHours().toString().padStart(2, '0');
        const minutes = time.getMinutes().toString().padStart(2, '0');
        const timeString = `${hours}:${minutes}`;

        // Client-side validation: must be in the future
        const startDateTime = new Date(`${dateStr}T${timeString}:00`);
        if (startDateTime.getTime() <= Date.now()) {
            Alert.alert(
                t('game.validationError', 'שגיאת ולידציה'),
                t('game.timeMustBeInFuture', 'שעת המשחק חייבת להיות בעתיד')
            );
            return;
        }

        setSubmitting(true);
        try {
            const token = await getToken();
            if (!token) return;

            // Create combined local datetime and cast to strict UTC ISO string
            const start = startDateTime.toISOString();

            let registrationOpensAt = undefined;
            if (futureRegistration) {
                const frGameDate = new Date(futureRegDate);
                const frDate = `${frGameDate.getFullYear()}-${(frGameDate.getMonth() + 1).toString().padStart(2, '0')}-${frGameDate.getDate().toString().padStart(2, '0')}`;
                const frTime = `${futureRegTime.getHours().toString().padStart(2, '0')}:${futureRegTime.getMinutes().toString().padStart(2, '0')}`;
                registrationOpensAt = new Date(`${frDate}T${frTime}:00`).toISOString();
            }

            let friendsOnlyUntil = undefined;
            if (isPrivate && makePublicLater) {
                const pdGameDate = new Date(publicDate);
                const pdDate = `${pdGameDate.getFullYear()}-${(pdGameDate.getMonth() + 1).toString().padStart(2, '0')}-${pdGameDate.getDate().toString().padStart(2, '0')}`;
                const pdTime = `${publicTime.getHours().toString().padStart(2, '0')}:${publicTime.getMinutes().toString().padStart(2, '0')}`;
                friendsOnlyUntil = new Date(`${pdDate}T${pdTime}:00`).toISOString();
            }

            let lotteryAt = undefined;
            if (lotteryEnabled) {
                const ldGameDate = new Date(lotteryDate);
                const ldDate = `${ldGameDate.getFullYear()}-${(ldGameDate.getMonth() + 1).toString().padStart(2, '0')}-${ldGameDate.getDate().toString().padStart(2, '0')}`;
                const ldTime = `${lotteryTime.getHours().toString().padStart(2, '0')}:${lotteryTime.getMinutes().toString().padStart(2, '0')}`;
                lotteryAt = new Date(`${ldDate}T${ldTime}:00`).toISOString();
            }

            // Construct payload matching backend expectation
            const payload = {
                fieldId: selectedField?.id || "",
                ...(customPoint && !selectedField ? {
                    newField: {
                        name: customFieldName || 'מיקום מותאם אישית',
                        location: 'מיקום נבחר מהמפה',
                        type: 'open'
                    }
                } : {}),
                ...(customPoint ? { customLat: customPoint.latitude, customLng: customPoint.longitude } : {}),
                date: dateStr,
                time: timeString,
                start,
                maxPlayers: parseInt(maxPlayers) || 14,
                price: parseInt(price) || 0,
                description,
                welcomeMessage,
                whatsappLink,
                isFriendsOnly: isPrivate,
                joinPolicy: requiresApproval ? 'REQUIRES_APPROVAL' : 'INSTANT',
                sport,
                title: title || undefined,
                duration: parseInt(duration) || 1,
                teamSize: teamSize ? parseInt(teamSize) : undefined,
                registrationOpensAt,
                friendsOnlyUntil,
                lotteryAt,
                organizerInLottery: lotteryEnabled ? organizerInLottery : false,
                invitedParticipantIds
            };

            const result = await gamesApi.create(payload, token);
            router.replace(`/game/${result.id}`);
        } catch (error: any) {
            console.error("Create game failed", error);
            Alert.alert(t('game.error', 'שגיאה'), error.response?.data?.error || t('editGame.updateFailed', 'Failed to create game'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleAdvancedDateChange = (event: any, selectedDate?: Date) => {
        if (!selectedDate) {
            setActivePicker(null);
            return;
        }
        switch (activePicker) {
            case 'publicDate': setPublicDate(selectedDate); break;
            case 'publicTime': setPublicTime(selectedDate); break;
            case 'lotteryDate': setLotteryDate(selectedDate); break;
            case 'lotteryTime': setLotteryTime(selectedDate); break;
            case 'futureRegDate': setFutureRegDate(selectedDate); break;
            case 'futureRegTime': setFutureRegTime(selectedDate); break;
        }
        setActivePicker(null);
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center">
                <LoadingMotif id="pin-drop" label="טוען יצירת משחק…" />
            </View>
        );
    }

    return (
        <>
            <Stack.Screen options={{ title: t('newGame.newGame', 'משחק חדש'), headerShown: true }} />
            <ScrollView
                className="flex-1 bg-gray-50"
                contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 32 }}
            >

                {/* Sport Selection */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">{t('newGame.sport')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" contentContainerStyle={{ paddingHorizontal: 4 }}>
                        {Object.keys(SPORT_MAPPING).map(s => {
                            const isSelected = sport === s;
                            return (
                                <TouchableOpacity
                                    key={s}
                                    onPress={() => setSport(s)}
                                    className={`px-4 py-2 rounded-full mr-2 border ${isSelected ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
                                >
                                    <Text className={`${isSelected ? 'text-white' : 'text-gray-700'} font-medium`}>
                                        {t('sports.' + s.toLowerCase(), SPORT_MAPPING[s])}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Title */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">{t('newGame.title', 'כותרת המשחק (לא חובה)')}</Text>
                    <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder={t('newGame.titlePlaceholder', 'לדוגמה: כדורגל שישי!')}
                        className="bg-gray-100 p-3 rounded-lg text-left"
                    />
                </View>

                {/* Field Selection */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-lg font-bold text-gray-800">{t('newGame.location', 'מיקום')}</Text>
                        <TouchableOpacity onPress={openMapModal} className="flex-row items-center bg-brand-mist px-3 py-1 rounded-full border border-brand-pale">
                            <FontAwesome name="map-marker" size={14} color="#059669" style={{ marginRight: 6 }} />
                            <Text className="text-brand-dark font-bold text-xs">{t('newGame.selectOnMap', 'בחר במפה')}</Text>
                        </TouchableOpacity>
                    </View>

                    {customPoint && !selectedField && (
                        <View className="bg-green-50 p-3 rounded-lg mb-3 border border-green-200">
                            <Text className="text-green-800 font-bold mb-1">✓ {t('newGame.customPoint', 'מיקום נבחר מהמפה')}</Text>
                            <TextInput
                                value={customFieldName}
                                onChangeText={setCustomFieldName}
                                placeholder={t('newGame.customPoint', 'שם המיקום (אופציונלי)')}
                                className="bg-white p-2 rounded border border-green-100 text-sm mt-1"
                            />
                            <TouchableOpacity onPress={() => setCustomPoint(null)} className="mt-2">
                                <Text className="text-red-500 text-xs font-bold">{t('friends.remove', 'הסר בחירה')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* City Selector */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ paddingHorizontal: 4 }}>
                        {cities.map(city => (
                            <TouchableOpacity
                                key={city}
                                onPress={() => { setSelectedCity(city); setSelectedField(null); }}
                                className={`mr-2 px-4 py-2 rounded-full border ${selectedCity === city ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
                            >
                                <Text className={selectedCity === city ? 'text-white' : 'text-gray-700'}>{city}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <View className="flex-row items-center mb-2">
                        <Text className="text-sm text-gray-500">{t('newGame.selectFieldPrompt', 'בחר מגרש:')}</Text>
                        {fieldsLoading && <ActivityIndicator size="small" className="ml-2" />}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4 }}>
                        {fields.map(field => (
                            <TouchableOpacity
                                key={field.id}
                                onPress={() => setSelectedField(field)}
                                className={`mr-3 p-3 rounded-xl border w-40 ${selectedField?.id === field.id ? 'bg-brand-mist border-brand' : 'bg-white border-gray-200'}`}
                            >
                                <Text className={`font-bold ${selectedField?.id === field.id ? 'text-brand-dark' : 'text-gray-800'}`} numberOfLines={1}>{field.name}</Text>
                                <Text className="text-xs text-gray-500" numberOfLines={1}>{field.location}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Date & Time */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-4 text-gray-800">{t('newGame.when', 'מתי?')}</Text>
                    <View className="flex-row justify-between">
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            className="flex-1 bg-gray-100 p-3 rounded-lg mr-2 items-center"
                        >
                            <Text className="text-gray-500 text-xs mb-1">{t('newGame.date', 'תאריך')}</Text>
                            <Text className="text-gray-800 font-medium">{date.toLocaleDateString()}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setShowTimePicker(true)}
                            className="flex-1 bg-gray-100 p-3 rounded-lg ml-2 items-center"
                        >
                            <Text className="text-gray-500 text-xs mb-1">{t('newGame.time', 'שעה')}</Text>
                            <Text className="text-gray-800 font-medium">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                        </TouchableOpacity>
                    </View>

                    {showDatePicker && (
                        <DateTimePicker value={date} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(d); }} minimumDate={new Date()} />
                    )}
                    {showTimePicker && (
                        <DateTimePicker value={time} mode="time" display="default" onChange={(e, d) => { setShowTimePicker(false); if (d) setTime(d); }} />
                    )}
                </View>

                {/* Config */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-4 text-gray-800">{t('game.details')}</Text>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">{t('newGame.durationHours', 'משך זמן (שעות)')}</Text>
                        <TextInput
                            value={duration}
                            onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">{t('newGame.maxPlayers')}</Text>
                        <TextInput
                            value={maxPlayers}
                            onChangeText={(v) => setMaxPlayers(v.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">{t('newGame.teamSize', 'גודל קבוצה (אופציונלי)')}</Text>
                        <TextInput
                            value={teamSize}
                            onChangeText={(v) => setTeamSize(v.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric"
                            placeholder={t('newGame.teamSizePlaceholder', 'לדוגמה: 5')}
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">{t('newGame.price')}</Text>
                        <TextInput
                            value={price}
                            onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700 font-bold">{t('newGame.privateGame', 'משחק פרטי (לחברים בלבד)')}</Text>
                        <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: '#059669' }} />
                    </View>

                    <View className="flex-row items-center justify-between">
                        <Text className="text-gray-700 font-bold">{t('newGame.requiresApproval', 'דורש אישור הצטרפות')}</Text>
                        <Switch value={requiresApproval} onValueChange={setRequiresApproval} trackColor={{ true: '#059669' }} />
                    </View>
                </View>

                {/* Optional Description */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">{t('newGame.additionalInfo', 'מידע נוסף')}</Text>
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder={t('newGame.specialInstructions', 'הוראות מיוחדות?')}
                        multiline
                        className="bg-gray-100 p-3 rounded-lg h-24 text-top"
                    />
                </View>

                {/* Auto Welcome Message */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">{t('newGame.autoWelcomeMessage', 'הודעת פתיחה אוטומטית (נשלח בפרטי למצטרפים)')}</Text>
                    <TextInput
                        value={welcomeMessage}
                        onChangeText={setWelcomeMessage}
                        placeholder={t('newGame.autoWelcomePlaceholder', 'לדוגמה: אהלן! לשלם בביט למספר 054-1234567')}
                        multiline
                        className="bg-gray-100 p-3 rounded-lg h-24 text-top"
                    />
                </View>

                {/* צרף חברים */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">{t('newGame.addFriends', 'צרף חברים למשחק')}</Text>
                    <TextInput
                        value={searchFriendQuery}
                        onChangeText={setSearchFriendQuery}
                        placeholder={t('newGame.searchFriendsPlaceholder', 'חפש חברים...')}
                        className="bg-gray-100 p-2 rounded-lg text-right mb-3 text-sm"
                    />
                    
                    {friends.length === 0 ? (
                        <Text className="text-gray-400 text-xs text-center my-2">{t('friends.noFriends', 'אין חברים ברשימה')}</Text>
                    ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" contentContainerStyle={{ paddingHorizontal: 4 }}>
                            {friends
                                .filter(f => !searchFriendQuery || f.name?.toLowerCase().includes(searchFriendQuery.toLowerCase()))
                                .map(friend => {
                                    const isSelected = invitedParticipantIds.includes(friend.id);
                                    return (
                                        <TouchableOpacity
                                            key={friend.id}
                                            onPress={() => {
                                                if (isSelected) {
                                                    setInvitedParticipantIds(prev => prev.filter(id => id !== friend.id));
                                                } else {
                                                    setInvitedParticipantIds(prev => [...prev, friend.id]);
                                                }
                                            }}
                                            className={`mr-3 p-2 rounded-xl items-center w-20 border ${isSelected ? 'bg-brand-mist border-brand' : 'bg-white border-gray-200'}`}
                                        >
                                            <Image
                                                source={{ uri: friend.imageUrl || "https://ui-avatars.com/api/?name=" + friend.name }}
                                                className="w-10 h-10 rounded-full bg-gray-200 mb-1"
                                            />
                                            <Text className="text-[10px] text-center text-gray-600" numberOfLines={1}>
                                                {friend.name?.split(' ')[0]}
                                            </Text>
                                            {isSelected && (
                                                <View className="absolute top-1 right-1 bg-brand w-4 h-4 rounded-full items-center justify-center">
                                                    <FontAwesome name="check" size={8} color="white" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })
                            }
                        </ScrollView>
                    )}
                </View>

                {/* Advanced Options */}
                <View className="bg-white p-4 rounded-xl mb-6 shadow-sm">
                    <TouchableOpacity onPress={() => setShowAdvanced(!showAdvanced)} className="flex-row justify-between items-center py-2">
                        <Text className="text-lg font-bold text-gray-800">{t('newGame.advancedOptions', 'אפשרויות מתקדמות')}</Text>
                        <FontAwesome name={showAdvanced ? "chevron-up" : "chevron-down"} size={16} color="#4b5563" />
                    </TouchableOpacity>

                    {showAdvanced && (
                        <View className="mt-4">
                            
                            {/* הרשמה עתידית */}
                            <View className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <View className="flex-row items-center justify-between mb-4">
                                    <Text className="text-gray-800 font-bold text-sm">{t('newGame.futureRegistration', 'הרשמה עתידית')}</Text>
                                    <Switch value={futureRegistration} onValueChange={setFutureRegistration} trackColor={{ true: '#059669' }} />
                                </View>
                                {futureRegistration && (
                                    <View className="flex-row justify-between">
                                        <TouchableOpacity onPress={() => setActivePicker('futureRegDate')} className="flex-1 bg-white p-2 rounded-lg mr-2 border border-gray-200">
                                            <Text className="text-center">{futureRegDate.toLocaleDateString()}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setActivePicker('futureRegTime')} className="flex-1 bg-white p-2 rounded-lg border border-gray-200">
                                            <Text className="text-center">{futureRegTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            {/* Lottery */}
                            <View className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-100">
                                <View className="flex-row items-center justify-between mb-4">
                                    <Text className="text-orange-900 font-bold text-sm">{t('newGame.lotterySystem', 'מערכת הגרלה')}</Text>
                                    <Switch value={lotteryEnabled} onValueChange={setLotteryEnabled} trackColor={{ true: '#f97316' }} />
                                </View>
                                {lotteryEnabled && (
                                    <>
                                        <View className="flex-row justify-between mb-4">
                                            <TouchableOpacity onPress={() => setActivePicker('lotteryDate')} className="flex-1 bg-white p-2 rounded-lg mr-2 border border-orange-200">
                                                <Text className="text-center">{lotteryDate.toLocaleDateString()}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => setActivePicker('lotteryTime')} className="flex-1 bg-white p-2 rounded-lg border border-orange-200">
                                                <Text className="text-center">{lotteryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View className="flex-row items-center justify-between">
                                            <Text className="text-orange-900 text-xs">{t('editGame.organizerInLottery', 'כלול מארגן בהגרלה')}</Text>
                                            <Switch value={organizerInLottery} onValueChange={setOrganizerInLottery} trackColor={{ true: '#f97316' }} />
                                        </View>
                                    </>
                                )}
                            </View>

                            {/* פתח לציבור בהמשך (Only if Private) */}
                            {isPrivate && (
                                <View className="mb-2 p-4 bg-green-50 rounded-lg border border-green-100">
                                    <View className="flex-row items-center justify-between mb-4">
                                        <Text className="text-green-900 font-bold text-sm">{t('editGame.makePublicLater', 'פתח לציבור בהמשך')}</Text>
                                        <Switch value={makePublicLater} onValueChange={setMakePublicLater} trackColor={{ true: '#22c55e' }} />
                                    </View>
                                    {makePublicLater && (
                                        <View className="flex-row justify-between">
                                            <TouchableOpacity onPress={() => setActivePicker('publicDate')} className="flex-1 bg-white p-2 rounded-lg mr-2 border border-green-200">
                                                <Text className="text-center">{publicDate.toLocaleDateString()}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => setActivePicker('publicTime')} className="flex-1 bg-white p-2 rounded-lg border border-green-200">
                                                <Text className="text-center">{publicTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            )}

                        </View>
                    )}
                </View>

                {activePicker && (
                    <DateTimePicker
                        value={
                            activePicker.endsWith('Date') ?
                                (activePicker === 'publicDate' ? publicDate : activePicker === 'lotteryDate' ? lotteryDate : futureRegDate) :
                                (activePicker === 'publicTime' ? publicTime : activePicker === 'lotteryTime' ? lotteryTime : futureRegTime)
                        }
                        mode={activePicker.endsWith('Date') ? 'date' : 'time'}
                        display="default"
                        onChange={handleAdvancedDateChange}
                        minimumDate={activePicker.endsWith('Date') ? new Date() : undefined}
                    />
                )}

                <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={submitting}
                    className={`p-4 rounded-xl items-center mb-10 ${submitting ? 'bg-brand-soft' : 'bg-brand'}`}
                >
                    <Text className="text-white font-bold text-lg">
                        {submitting ? t('newGame.creating', 'יוצר...') : t('newGame.createGame', 'צור משחק')}
                    </Text>
                </TouchableOpacity>

            </ScrollView>

            <Modal visible={showMapModal} animationType="slide" onRequestClose={() => setShowMapModal(false)}>
                <View className="flex-1 bg-white">
                    <View className="flex-row justify-between items-center p-4 border-b border-gray-200 pt-10">
                        <Text className="text-lg font-bold">{t('newGame.selectLocationModalTitle', 'בחר מיקום')}</Text>
                        <TouchableOpacity onPress={() => setShowMapModal(false)}>
                            <Text className="text-brand font-bold">{t('newGame.close', 'סגור')}</Text>
                        </TouchableOpacity>
                    </View>

                    <AppBaseMap
                        ref={mapRef}
                        variant="fill"
                        className="flex-1 mx-2 mb-2 rounded-3xl overflow-hidden shadow-sm border border-gray-200 relative"
                        markers={gameMapMarkers}
                        renderMarker={renderGameFieldMarker}
                        selectedMarkerId={mapSelectedField?.id || null}
                        onMapPress={handleMapPress}
                        onBoundsChange={handleMapBoundsChange}
                        boundsDebounceMs={300}
                        loading={mapLoading}
                        initialRegion={mapInitialRegion}
                        overlayChildren={customPoint ? <CustomPointMarker coordinate={customPoint} /> : null}
                        bottomSheet={mapBottomSheet}
                        showSportFilter
                    />
                </View>
            </Modal>
        </>
    );
}
