import { View, Text, TextInput, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, Platform, Modal } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import React, { useState, useEffect } from 'react';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { gamesApi, fieldsApi } from '@/services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { SPORT_MAPPING } from '@/utils/sports';

export default function NewGameScreen() {
    const { t } = useTranslation();
    const { getToken } = useAuth();
    const router = useRouter();
    const params = useLocalSearchParams<{ fieldId?: string }>();
    const prefilledFieldId = params.fieldId;

    const [cities, setCities] = useState<string[]>([]);
    const [fields, setFields] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [sport, setSport] = useState('SOCCER');
    const [title, setTitle] = useState('');
    const [duration, setDuration] = useState('1');
    const [teamSize, setTeamSize] = useState('');

    const [selectedCity, setSelectedCity] = useState('');
    const [selectedField, setSelectedField] = useState<any>(null);
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState(new Date());
    const [maxPlayers, setMaxPlayers] = useState('14');
    const [price, setPrice] = useState('0');
    const [description, setDescription] = useState('');
    const [whatsappLink, setWhatsappLink] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

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
    const [customPoint, setCustomPoint] = useState<{lat: number, lng: number} | null>(null);
    const [customFieldName, setCustomFieldName] = useState('');

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
            
            if (prefilledFieldId) {
                const found = fieldList.find((f: any) => f.id === prefilledFieldId);
                if (found) {
                    setSelectedField(found);
                    if (found.city) setSelectedCity(found.city);
                }
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

    const filteredFields = fields.filter(f => !selectedCity || f.city === selectedCity || f.location?.includes(selectedCity));

    const handleSubmit = async () => {
        if (!selectedField && !customPoint) {
            Alert.alert("Error", "אנא בחר מגרש או סמן מיקום במפה");
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

            let registrationOpensAt = undefined;
            if (futureRegistration) {
                const frDate = new Date(futureRegDate).toISOString().split('T')[0];
                const frTime = `${futureRegTime.getHours().toString().padStart(2, '0')}:${futureRegTime.getMinutes().toString().padStart(2, '0')}`;
                registrationOpensAt = new Date(`${frDate}T${frTime}:00`).toISOString();
            }

            let friendsOnlyUntil = undefined;
            if (isPrivate && makePublicLater) {
                const pdDate = new Date(publicDate).toISOString().split('T')[0];
                const pdTime = `${publicTime.getHours().toString().padStart(2, '0')}:${publicTime.getMinutes().toString().padStart(2, '0')}`;
                friendsOnlyUntil = new Date(`${pdDate}T${pdTime}:00`).toISOString();
            }

            let lotteryAt = undefined;
            if (lotteryEnabled) {
                const ldDate = new Date(lotteryDate).toISOString().split('T')[0];
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
                ...(customPoint ? { customLat: customPoint.lat, customLng: customPoint.lng } : {}),
                date: dateStr,
                time: timeString,
                maxPlayers: parseInt(maxPlayers) || 14,
                price: parseInt(price) || 0,
                description,
                whatsappLink,
                isPrivate,
                sport,
                title: title || undefined,
                duration: parseInt(duration) || 1,
                teamSize: teamSize ? parseInt(teamSize) : undefined,
                registrationOpensAt,
                friendsOnlyUntil,
                lotteryAt,
                organizerInLottery: lotteryEnabled ? organizerInLottery : false
            };

            const result = await gamesApi.create(payload, token);
            Alert.alert("Success", "Game created successfully!", [
                { text: "OK", onPress: () => router.replace(`/(tabs)`) }
            ]);
        } catch (error: any) {
            console.error("Create game failed", error);
            Alert.alert("Error", error.response?.data?.error || "Failed to create game");
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
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <>
            <Stack.Screen options={{ title: 'New Game', headerShown: true }} />
            <ScrollView className="flex-1 bg-gray-50 p-4">

                {/* Sport Selection */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">{t('newGame.sport')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                        {Object.keys(SPORT_MAPPING).map(s => {
                            const isSelected = sport === s;
                            return (
                                <TouchableOpacity
                                    key={s}
                                    onPress={() => setSport(s)}
                                    className={`px-4 py-2 rounded-full mr-2 border ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                                >
                                    <Text className={`${isSelected ? 'text-white' : 'text-gray-700'} font-medium`}>
                                        {SPORT_MAPPING[s]}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Title */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">כותרת משחק (אופציונלי)</Text>
                    <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="לדוגמה: כדורגל שישי!"
                        className="bg-gray-100 p-3 rounded-lg text-left"
                    />
                </View>

                {/* Field Selection */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-lg font-bold text-gray-800">מיקום</Text>
                        <TouchableOpacity onPress={() => setShowMapModal(true)} className="flex-row items-center bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                            <FontAwesome name="map-marker" size={14} color="#2563eb" style={{ marginRight: 6 }} />
                            <Text className="text-blue-700 font-bold text-xs">בחר במפה</Text>
                        </TouchableOpacity>
                    </View>

                    {customPoint && !selectedField && (
                        <View className="bg-green-50 p-3 rounded-lg mb-3 border border-green-200">
                            <Text className="text-green-800 font-bold mb-1">✓ מיקום נבחר מהמפה</Text>
                            <TextInput
                                value={customFieldName}
                                onChangeText={setCustomFieldName}
                                placeholder="שם המיקום (אופציונלי)"
                                className="bg-white p-2 rounded border border-green-100 text-sm mt-1"
                            />
                            <TouchableOpacity onPress={() => setCustomPoint(null)} className="mt-2">
                                <Text className="text-red-500 text-xs font-bold">הסר בחירה</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* City Selector */}
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

                    <Text className="text-sm text-gray-500 mb-2">בחר מגרש:</Text>
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
                    <Text className="text-lg font-bold mb-4 text-gray-800">מתי?</Text>
                    <View className="flex-row justify-between">
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            className="flex-1 bg-gray-100 p-3 rounded-lg mr-2 items-center"
                        >
                            <Text className="text-gray-500 text-xs mb-1">תאריך</Text>
                            <Text className="text-gray-800 font-medium">{date.toLocaleDateString()}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setShowTimePicker(true)}
                            className="flex-1 bg-gray-100 p-3 rounded-lg ml-2 items-center"
                        >
                            <Text className="text-gray-500 text-xs mb-1">שעה</Text>
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
                        <Text className="text-gray-700">משך זמן (שעות)</Text>
                        <TextInput
                            value={duration}
                            onChangeText={setDuration}
                            keyboardType="numeric"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">{t('newGame.maxPlayers')}</Text>
                        <TextInput
                            value={maxPlayers}
                            onChangeText={setMaxPlayers}
                            keyboardType="numeric"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">גודל קבוצה (אופציונלי)</Text>
                        <TextInput
                            value={teamSize}
                            onChangeText={setTeamSize}
                            keyboardType="numeric"
                            placeholder="e.g. 5"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-gray-700">{t('newGame.price')}</Text>
                        <TextInput
                            value={price}
                            onChangeText={setPrice}
                            keyboardType="numeric"
                            className="bg-gray-100 p-2 rounded-lg w-20 text-center"
                        />
                    </View>

                    <View className="flex-row items-center justify-between">
                        <Text className="text-gray-700 font-bold">משחק פרטי (לחברים בלבד)</Text>
                        <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: '#2563eb' }} />
                    </View>
                </View>

                {/* Optional Description */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className="text-lg font-bold mb-2 text-gray-800">מידע נוסף</Text>
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="הוראות מיוחדות?"
                        multiline
                        className="bg-gray-100 p-3 rounded-lg h-24 text-top"
                    />
                </View>

                {/* Advanced Options */}
                <View className="bg-white p-4 rounded-xl mb-6 shadow-sm">
                    <TouchableOpacity onPress={() => setShowAdvanced(!showAdvanced)} className="flex-row justify-between items-center py-2">
                        <Text className="text-lg font-bold text-gray-800">אפשרויות מתקדמות</Text>
                        <FontAwesome name={showAdvanced ? "chevron-up" : "chevron-down"} size={16} color="#4b5563" />
                    </TouchableOpacity>

                    {showAdvanced && (
                        <View className="mt-4">
                            
                            {/* הרשמה עתידית */}
                            <View className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <View className="flex-row items-center justify-between mb-4">
                                    <Text className="text-gray-800 font-bold text-sm">הרשמה עתידית</Text>
                                    <Switch value={futureRegistration} onValueChange={setFutureRegistration} trackColor={{ true: '#2563eb' }} />
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
                                    <Text className="text-orange-900 font-bold text-sm">מערכת הגרלה</Text>
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
                                            <Text className="text-orange-900 text-xs">כלול מארגן בהגרלה</Text>
                                            <Switch value={organizerInLottery} onValueChange={setOrganizerInLottery} trackColor={{ true: '#f97316' }} />
                                        </View>
                                    </>
                                )}
                            </View>

                            {/* פתח לציבור בהמשך (Only if Private) */}
                            {isPrivate && (
                                <View className="mb-2 p-4 bg-green-50 rounded-lg border border-green-100">
                                    <View className="flex-row items-center justify-between mb-4">
                                        <Text className="text-green-900 font-bold text-sm">פתח לציבור בהמשך</Text>
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
                    className={`p-4 rounded-xl items-center mb-10 ${submitting ? 'bg-blue-400' : 'bg-blue-600'}`}
                >
                    <Text className="text-white font-bold text-lg">
                        {submitting ? 'יוצר...' : 'צור משחק'}
                    </Text>
                </TouchableOpacity>

            </ScrollView>

            <Modal visible={showMapModal} animationType="slide" onRequestClose={() => setShowMapModal(false)}>
                <View className="flex-1 bg-white">
                    <View className="flex-row justify-between items-center p-4 border-b border-gray-200 pt-10">
                        <Text className="text-lg font-bold">בחר מיקום</Text>
                        <TouchableOpacity onPress={() => setShowMapModal(false)}>
                            <Text className="text-blue-600 font-bold">סגור</Text>
                        </TouchableOpacity>
                    </View>
                    <MapView 
                        style={{ flex: 1 }}
                        initialRegion={{
                            latitude: 32.0853,
                            longitude: 34.7818,
                            latitudeDelta: 0.1,
                            longitudeDelta: 0.1,
                        }}
                        onPress={(e) => {
                            setCustomPoint(e.nativeEvent.coordinate);
                            setSelectedField(null);
                        }}
                    >
                        {customPoint && <Marker coordinate={customPoint} title="מיקום נבחר" />}
                    </MapView>
                    {customPoint && (
                        <View className="p-4 bg-white pb-10">
                            <TouchableOpacity 
                                className="bg-blue-600 p-4 rounded-xl items-center"
                                onPress={() => setShowMapModal(false)}
                            >
                                <Text className="text-white font-bold">אשר מיקום</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </Modal>
        </>
    );
}
