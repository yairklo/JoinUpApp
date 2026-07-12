import { View, Text, TextInput, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, Modal } from 'react-native';
import React, { useState, useEffect } from 'react';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { gamesApi, fieldsApi } from '@/services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Game } from '@/types/game';
import { useTranslation } from 'react-i18next';
import { SPORT_MAPPING } from '@/utils/sports';

import { SafeAreaView } from 'react-native-safe-area-context';

interface ScrollSelectionModalProps<T> {
    visible: boolean;
    onClose: () => void;
    title: string;
    options: { label: string; value: T }[];
    selectedValue: T;
    onSelect: (value: T) => void;
}

function ScrollSelectionModal<T>({ visible, onClose, title, options, selectedValue, onSelect }: ScrollSelectionModalProps<T>) {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'he';
    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View className="flex-1 justify-end bg-black/50">
                <View className="bg-white rounded-t-3xl p-6 h-[40%]">
                    <View className={`flex-row justify-between items-center mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <Text className="text-lg font-bold text-gray-800">{title}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text className="text-blue-600 font-bold">{t('common.confirm', 'אישור')}</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView className="flex-1">
                        {options.map((opt, idx) => {
                            const isSelected = opt.value === selectedValue;
                            return (
                                <TouchableOpacity
                                    key={idx}
                                    onPress={() => onSelect(opt.value)}
                                    className={`py-3 px-4 rounded-xl mb-1 flex-row justify-between items-center ${isSelected ? 'bg-blue-50' : ''} ${isRtl ? 'flex-row-reverse' : ''}`}
                                >
                                    <Text className={`text-base ${isSelected ? 'text-blue-700 font-bold' : 'text-gray-700'}`}>{opt.label}</Text>
                                    {isSelected && <FontAwesome name="check" size={16} color="#2563eb" />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const getDurationOptions = (t: any) => [
    { label: `60 ${t('editGame.min', 'min')} (1 ${t('editGame.hour', 'hour')})`, value: "1" },
    { label: `75 ${t('editGame.min', 'min')} (1.25 ${t('editGame.hours', 'hours')})`, value: "1.25" },
    { label: `90 ${t('editGame.min', 'min')} (1.5 ${t('editGame.hours', 'hours')})`, value: "1.5" },
    { label: `105 ${t('editGame.min', 'min')} (1.75 ${t('editGame.hours', 'hours')})`, value: "1.75" },
    { label: `120 ${t('editGame.min', 'min')} (2 ${t('editGame.hours', 'hours')})`, value: "2" },
    { label: `150 ${t('editGame.min', 'min')} (2.5 ${t('editGame.hours', 'hours')})`, value: "2.5" },
    { label: `180 ${t('editGame.min', 'min')} (3 ${t('editGame.hours', 'hours')})`, value: "3" },
    { label: `240 ${t('editGame.min', 'min')} (4 ${t('editGame.hours', 'hours')})`, value: "4" }
];

const getPriceOptions = (t: any) => [
    { label: t('game.free', 'Free'), value: "0" },
    { label: "10 ₪", value: "10" },
    { label: "15 ₪", value: "15" },
    { label: "20 ₪", value: "20" },
    { label: "25 ₪", value: "25" },
    { label: "30 ₪", value: "30" },
    { label: "40 ₪", value: "40" },
    { label: "50 ₪", value: "50" },
    { label: "60 ₪", value: "60" },
    { label: "75 ₪", value: "75" },
    { label: "100 ₪", value: "100" }
];

const getMaxPlayersOptions = () => Array.from({ length: 39 }, (_, i) => ({ label: String(i + 2), value: String(i + 2) }));
const getTeamSizeOptions = (t: any) => [
    { label: t('editGame.none', 'None'), value: "" },
    ...Array.from({ length: 20 }, (_, i) => {
        const size = i + 1;
        return {
            label: `${size} x ${size} (${size * 2} ${t('editGame.players', 'players')})`,
            value: String(size)
        };
    })
];

export default function EditGameScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { getToken } = useAuth();
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'he';

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [game, setGame] = useState<Game | null>(null);

    // Form State
    const [sport, setSport] = useState('SOCCER');
    const [title, setTitle] = useState('');
    const [duration, setDuration] = useState('1');
    const [teamSize, setTeamSize] = useState('');
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState(new Date());
    const [maxPlayers, setMaxPlayers] = useState('14');
    const [price, setPrice] = useState('0');
    const [description, setDescription] = useState('');
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
    const [showMaxPlayersPicker, setShowMaxPlayersPicker] = useState(false);
    const [showTeamSizePicker, setShowTeamSizePicker] = useState(false);
    const [showDurationPicker, setShowDurationPicker] = useState(false);
    const [showPricePicker, setShowPricePicker] = useState(false);

    useEffect(() => {
        fetchGame();
    }, [id]);

    const fetchGame = async () => {
        try {
            const token = await getToken();
            const data = await gamesApi.getById(id, token || undefined);
            setGame(game); // keep ref

            // Populate form safely using local components
            const [y, m_part, d_part] = data.date.split('-').map(Number);
            const localDate = new Date();
            localDate.setFullYear(y, m_part - 1, d_part);
            setDate(localDate);

            const [hours, minutes] = data.time.split(':').map(Number);
            const timeObj = new Date();
            timeObj.setHours(hours, minutes, 0, 0);
            setTime(timeObj);

            setSport(data.sport || 'SOCCER');
            setTitle(data.title || '');
            setDuration(data.duration?.toString() || '1');
            setTeamSize(data.teamSize?.toString() || '');
            setMaxPlayers(data.maxPlayers.toString());
            setPrice(data.price?.toString() || '0');
            setDescription(data.description || '');
            setIsPrivate(data.isFriendsOnly || false);
            setRequiresApproval(data.joinPolicy === 'REQUIRES_APPROVAL');

            // Advanced Options
            setFutureRegistration(!!data.registrationOpensAt);
            if (data.registrationOpensAt) {
                setFutureRegDate(new Date(data.registrationOpensAt));
                setFutureRegTime(new Date(data.registrationOpensAt));
            }
            setLotteryEnabled(data.lotteryEnabled || false);
            if (data.lotteryAt) {
                setLotteryDate(new Date(data.lotteryAt));
                setLotteryTime(new Date(data.lotteryAt));
            }
            setOrganizerInLottery(data.organizerInLottery || false);
            setMakePublicLater(!!data.friendsOnlyUntil);
            if (data.friendsOnlyUntil) {
                setPublicDate(new Date(data.friendsOnlyUntil));
                setPublicTime(new Date(data.friendsOnlyUntil));
            }

        } catch (error) {
            console.error("Failed to load game", error);
            Alert.alert(t('editGame.error', 'Error'), t('editGame.loadError', 'Failed to load game details'));
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

            // Combine Date and Time safely using local timezone components
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            // Format time string HH:mm
            const hours = time.getHours().toString().padStart(2, '0');
            const minutes = time.getMinutes().toString().padStart(2, '0');
            const timeString = `${hours}:${minutes}`;

            // Create combined local datetime and cast to strict UTC ISO string
            const start = new Date(`${dateStr}T${timeString}:00`).toISOString();

            let registrationOpensAt = null;
            if (futureRegistration) {
                const frGameDate = new Date(futureRegDate);
                const frDate = `${frGameDate.getFullYear()}-${(frGameDate.getMonth() + 1).toString().padStart(2, '0')}-${frGameDate.getDate().toString().padStart(2, '0')}`;
                const frTime = `${futureRegTime.getHours().toString().padStart(2, '0')}:${futureRegTime.getMinutes().toString().padStart(2, '0')}`;
                registrationOpensAt = new Date(`${frDate}T${frTime}:00`).toISOString();
            }

            let friendsOnlyUntil = null;
            if (isPrivate && makePublicLater) {
                const pdGameDate = new Date(publicDate);
                const pdDate = `${pdGameDate.getFullYear()}-${(pdGameDate.getMonth() + 1).toString().padStart(2, '0')}-${pdGameDate.getDate().toString().padStart(2, '0')}`;
                const pdTime = `${publicTime.getHours().toString().padStart(2, '0')}:${publicTime.getMinutes().toString().padStart(2, '0')}`;
                friendsOnlyUntil = new Date(`${pdDate}T${pdTime}:00`).toISOString();
            }

            let lotteryAt = null;
            if (lotteryEnabled) {
                const ldGameDate = new Date(lotteryDate);
                const ldDate = `${ldGameDate.getFullYear()}-${(ldGameDate.getMonth() + 1).toString().padStart(2, '0')}-${ldGameDate.getDate().toString().padStart(2, '0')}`;
                const ldTime = `${lotteryTime.getHours().toString().padStart(2, '0')}:${lotteryTime.getMinutes().toString().padStart(2, '0')}`;
                lotteryAt = new Date(`${ldDate}T${ldTime}:00`).toISOString();
            }

            // Construct payload matching UpdateGameDTO
            const payload = {
                start,
                maxPlayers: parseInt(maxPlayers),
                price: parseInt(price),
                description,
                isFriendsOnly: isPrivate,
                joinPolicy: (requiresApproval ? 'REQUIRES_APPROVAL' : 'INSTANT') as 'REQUIRES_APPROVAL' | 'INSTANT',
                title: title || undefined,
                sport,
                duration: parseFloat(duration) || 1,
                teamSize: teamSize ? parseInt(teamSize) : null,
                registrationOpensAt: futureRegistration ? registrationOpensAt : null,
                friendsOnlyUntil: (isPrivate && makePublicLater) ? friendsOnlyUntil : null,
                lotteryEnabled,
                lotteryAt: lotteryEnabled ? lotteryAt : null,
                organizerInLottery: lotteryEnabled ? organizerInLottery : false
            };

            await gamesApi.update(id, payload, token);

            Alert.alert(t('editGame.success', 'Success'), t('editGame.updateSuccess', 'Game updated successfully!'), [
                { text: t('editGame.ok', 'OK'), onPress: () => router.back() }
            ]);
        } catch (error: any) {
            console.error("Update game failed", error);
            Alert.alert(t('editGame.error', 'Error'), error.response?.data?.error || t('editGame.updateFailed', 'Failed to update game'));
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
            <SafeAreaView className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#2563eb" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-gray-50">
            <Stack.Screen options={{ headerShown: false }} />
            
            <View className={`flex-row items-center px-4 py-3 bg-white border-b border-gray-100 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <TouchableOpacity onPress={() => router.back()} className={`p-2 ${isRtl ? 'ml-3' : 'mr-3'}`}>
                    <FontAwesome name={isRtl ? 'arrow-right' : 'arrow-left'} size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className={`text-xl font-bold text-gray-900 flex-1 ${isRtl ? 'text-right' : 'text-left'}`}>{t('editGame.title', 'Edit Game')}</Text>
            </View>

            <ScrollView className="flex-1 p-4">

                {/* Sport Selection */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className={`text-lg font-bold mb-2 text-gray-800 ${isRtl ? 'text-right' : 'text-left'}`}>{t('newGame.sport')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={`flex-row ${isRtl ? 'flex-row-reverse' : ''}`}>
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
                    <Text className={`text-lg font-bold mb-2 text-gray-800 ${isRtl ? 'text-right' : 'text-left'}`}>{t('newGame.title', 'Game Title (Optional)')}</Text>
                    <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder={t('newGame.title', 'Game Title')}
                        className={`bg-gray-100 p-3 rounded-lg ${isRtl ? 'text-right' : 'text-left'}`}
                    />
                </View>

                {/* Date & Time */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className={`text-lg font-bold mb-4 text-gray-800 ${isRtl ? 'text-right' : 'text-left'}`}>{t('editGame.when', 'When?')}</Text>
                    <View className={`flex-row justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            className="flex-1 bg-gray-100 p-3 rounded-lg mx-1 items-center"
                        >
                            <Text className="text-gray-500 text-xs mb-1">{t('editGame.date', 'Date')}</Text>
                            <Text className="text-gray-800 font-medium">{date.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'he-IL')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setShowTimePicker(true)}
                            className="flex-1 bg-gray-100 p-3 rounded-lg mx-1 items-center"
                        >
                            <Text className="text-gray-500 text-xs mb-1">{t('editGame.time', 'Time')}</Text>
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
                    <Text className={`text-lg font-bold mb-4 text-gray-800 ${isRtl ? 'text-right' : 'text-left'}`}>{t('editGame.details', 'Details')}</Text>

                    {/* Max Players Selector */}
                    <View className={`flex-row items-center justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <Text className="text-gray-700">{t('newGame.maxPlayers', 'Max Players')}</Text>
                        <TouchableOpacity onPress={() => setShowMaxPlayersPicker(true)} className="bg-gray-100 px-4 py-2 rounded-lg w-28 items-center border border-gray-200">
                            <Text className="text-gray-800 font-bold">{maxPlayers}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Team Size Selector */}
                    <View className={`flex-row items-center justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <Text className="text-gray-700">{t('editGame.teamSize', 'Team Size')}</Text>
                        <TouchableOpacity onPress={() => setShowTeamSizePicker(true)} className="bg-gray-100 px-4 py-2 rounded-lg w-32 items-center border border-gray-200">
                            <Text className="text-gray-800 font-bold text-xs" numberOfLines={1}>
                                {teamSize ? `${teamSize} x ${teamSize}` : t('editGame.none', 'None')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Duration Selector */}
                    <View className={`flex-row items-center justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <Text className="text-gray-700">{t('newGame.duration', 'Duration')}</Text>
                        <TouchableOpacity onPress={() => setShowDurationPicker(true)} className="bg-gray-100 px-4 py-2 rounded-lg w-32 items-center border border-gray-200">
                            <Text className="text-gray-800 font-bold text-xs" numberOfLines={1}>
                                {parseFloat(duration) * 60} {t('editGame.min', 'min')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Price Selector */}
                    <View className={`flex-row items-center justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <Text className="text-gray-700">{t('newGame.price', 'Price')}</Text>
                        <TouchableOpacity onPress={() => setShowPricePicker(true)} className="bg-gray-100 px-4 py-2 rounded-lg w-28 items-center border border-gray-200">
                            <Text className="text-gray-800 font-bold">
                                {price === '0' ? t('game.free', 'Free') : `${price} ₪`}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View className={`flex-row items-center justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <Text className="text-gray-700 font-bold">{t('editGame.privateGame', 'Private Game')}</Text>
                        <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: '#2563eb' }} />
                    </View>

                    <View className={`flex-row items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <Text className="text-gray-700 font-bold">{t('editGame.requiresApproval', 'Requires Approval to Join')}</Text>
                        <Switch value={requiresApproval} onValueChange={setRequiresApproval} trackColor={{ true: '#2563eb' }} />
                    </View>
                </View>

                {/* Optional Description */}
                <View className="bg-white p-4 rounded-xl mb-4 shadow-sm">
                    <Text className={`text-lg font-bold mb-2 text-gray-800 ${isRtl ? 'text-right' : 'text-left'}`}>{t('editGame.extraInfo', 'Extra Info')}</Text>
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder={t('editGame.instructionsPlaceholder', 'Any special instructions?')}
                        multiline
                        className={`bg-gray-100 p-3 rounded-lg h-24 text-top ${isRtl ? 'text-right' : 'text-left'}`}
                    />
                </View>

                {/* Advanced Options */}
                <View className="bg-white p-4 rounded-xl mb-6 shadow-sm">
                    <TouchableOpacity onPress={() => setShowAdvanced(!showAdvanced)} className={`flex-row justify-between items-center py-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <Text className="text-lg font-bold text-gray-800">{t('editGame.advancedOptions', 'Advanced Options')}</Text>
                        <FontAwesome name={showAdvanced ? "chevron-up" : "chevron-down"} size={16} color="#4b5563" />
                    </TouchableOpacity>

                    {showAdvanced && (
                        <View className="mt-4">
                            
                            {/* Future Registration */}
                            <View className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <View className={`flex-row items-center justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <Text className="text-gray-800 font-bold text-sm">{t('editGame.futureRegistration', 'Future Registration')}</Text>
                                    <Switch value={futureRegistration} onValueChange={setFutureRegistration} trackColor={{ true: '#2563eb' }} />
                                </View>
                                {futureRegistration && (
                                    <View className={`flex-row justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
                                        <TouchableOpacity onPress={() => setActivePicker('futureRegDate')} className="flex-1 bg-white p-2 rounded-lg mx-1 border border-gray-200">
                                            <Text className="text-center">{futureRegDate.toLocaleDateString()}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setActivePicker('futureRegTime')} className="flex-1 bg-white p-2 rounded-lg mx-1 border border-gray-200">
                                            <Text className="text-center">{futureRegTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            {/* Lottery */}
                            <View className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-100">
                                <View className={`flex-row items-center justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <Text className="text-orange-900 font-bold text-sm">{t('editGame.lotteryEnabled', 'Lottery')}</Text>
                                    <Switch value={lotteryEnabled} onValueChange={setLotteryEnabled} trackColor={{ true: '#f97316' }} />
                                </View>
                                {lotteryEnabled && (
                                    <>
                                        <View className={`flex-row justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                            <TouchableOpacity onPress={() => setActivePicker('lotteryDate')} className="flex-1 bg-white p-2 rounded-lg mx-1 border border-orange-200">
                                                <Text className="text-center">{lotteryDate.toLocaleDateString()}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => setActivePicker('lotteryTime')} className="flex-1 bg-white p-2 rounded-lg mx-1 border border-orange-200">
                                                <Text className="text-center">{lotteryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View className={`flex-row items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
                                            <Text className="text-orange-900 text-xs">{t('editGame.organizerInLottery', 'Include organizer in lottery')}</Text>
                                            <Switch value={organizerInLottery} onValueChange={setOrganizerInLottery} trackColor={{ true: '#f97316' }} />
                                        </View>
                                    </>
                                )}
                            </View>

                            {/* Public Release Later (Private games only) */}
                            {isPrivate && (
                                <View className="mb-2 p-4 bg-green-50 rounded-lg border border-green-100">
                                    <View className={`flex-row items-center justify-between mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                        <Text className="text-green-900 font-bold text-sm">{t('editGame.makePublicLater', 'Publish to public later')}</Text>
                                        <Switch value={makePublicLater} onValueChange={setMakePublicLater} trackColor={{ true: '#22c55e' }} />
                                    </View>
                                    {makePublicLater && (
                                        <View className={`flex-row justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
                                            <TouchableOpacity onPress={() => setActivePicker('publicDate')} className="flex-1 bg-white p-2 rounded-lg mx-1 border border-green-200">
                                                <Text className="text-center">{publicDate.toLocaleDateString()}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => setActivePicker('publicTime')} className="flex-1 bg-white p-2 rounded-lg mx-1 border border-green-200">
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
                        {submitting ? t('editGame.updating', 'Updating...') : t('editGame.saveChanges', 'Save Changes')}
                    </Text>
                </TouchableOpacity>

            </ScrollView>

            {/* Selection Modals */}
            <ScrollSelectionModal
                visible={showMaxPlayersPicker}
                onClose={() => setShowMaxPlayersPicker(false)}
                title={t('newGame.maxPlayers', 'Max Players')}
                options={getMaxPlayersOptions()}
                selectedValue={maxPlayers}
                onSelect={(val) => setMaxPlayers(val)}
            />

            <ScrollSelectionModal
                visible={showTeamSizePicker}
                onClose={() => setShowTeamSizePicker(false)}
                title={t('editGame.teamSize', 'Team Size')}
                options={getTeamSizeOptions(t)}
                selectedValue={teamSize}
                onSelect={(val) => setTeamSize(val)}
            />

            <ScrollSelectionModal
                visible={showDurationPicker}
                onClose={() => setShowDurationPicker(false)}
                title={t('newGame.duration', 'Duration')}
                options={getDurationOptions(t)}
                selectedValue={duration}
                onSelect={(val) => setDuration(val)}
            />

            <ScrollSelectionModal
                visible={showPricePicker}
                onClose={() => setShowPricePicker(false)}
                title={t('newGame.price', 'Price')}
                options={getPriceOptions(t)}
                selectedValue={price}
                onSelect={(val) => setPrice(val)}
            />
        </SafeAreaView>
    );
}
