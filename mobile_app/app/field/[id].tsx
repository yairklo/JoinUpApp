import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, FlatList } from 'react-native';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fieldsApi, Field, FieldAnalytics, FieldScheduleGame, BusyCell } from '@/services/api';
import { SPORT_MAPPING } from '@/utils/sports';

const CHART_MAX_HEIGHT = 120;

// Green -> red density scale (mirrors the web chart)
function levelColor(avg: number): string {
    if (avg < 2) return '#22c55e';
    if (avg < 3) return '#eab308';
    if (avg < 4) return '#f97316';
    return '#ef4444';
}

function currentJerusalemDay(): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        weekday: 'short'
    }).format(new Date());
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    return idx >= 0 ? idx : 0;
}

function FieldProfileHeader({ title, onBack }: { title: string; onBack: () => void }) {
    return (
        <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
            <TouchableOpacity onPress={onBack} className="p-2 mr-3" accessibilityRole="button" accessibilityLabel="Back">
                <FontAwesome name="arrow-left" size={20} color="#4b5563" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>{title}</Text>
        </View>
    );
}

export default function FieldProfileScreen() {
    const { t } = useTranslation();
    const { getToken, userId } = useAuth();
    const router = useRouter();
    const params = useLocalSearchParams<{ id: string }>();
    const fieldId = params.id;

    const [field, setField] = useState<Field | null>(null);
    const [analytics, setAnalytics] = useState<FieldAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<number>(() => currentJerusalemDay());
    const [reportState, setReportState] = useState<'idle' | 'submitting' | 'done'>('idle');

    useEffect(() => {
        if (!fieldId) return;
        let cancelled = false;
        (async () => {
            try {
                const token = await getToken();
                const [fieldData, analyticsData] = await Promise.all([
                    fieldsApi.getById(fieldId),
                    token ? fieldsApi.getAnalytics(fieldId, token).catch(() => null) : Promise.resolve(null)
                ]);
                if (!cancelled) {
                    setField(fieldData);
                    setAnalytics(analyticsData);
                }
            } catch (e) {
                console.error('Failed to load field profile', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [fieldId]);

    const submitReport = useCallback(async (busyLevel: number) => {
        if (reportState !== 'idle') return;
        setReportState('submitting');
        try {
            const token = await getToken();
            if (!token) { setReportState('idle'); return; }
            await fieldsApi.submitReport(fieldId, busyLevel, token);
            setReportState('done');
        } catch (e) {
            console.error('Failed to submit crowd report', e);
            setReportState('idle');
        }
    }, [reportState, fieldId, getToken]);

    const dayCells: BusyCell[] = useMemo(() => {
        const cells = analytics?.busyProfile?.[selectedDay] || [];
        return Array.from({ length: 24 }, (_, h) => cells[h] || { avg: null, samples: 0 });
    }, [analytics, selectedDay]);

    const hasDayData = dayCells.some(c => c.samples > 0);

    if (loading) {
        return (
            <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-gray-50">
                <FieldProfileHeader title={t('field.profile')} onBack={() => router.back()} />
                <View className="flex-1 justify-center items-center">
                    <ActivityIndicator size="large" color="#2563eb" />
                </View>
            </SafeAreaView>
        );
    }

    if (!field) {
        return (
            <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-gray-50">
                <FieldProfileHeader title={t('field.profile')} onBack={() => router.back()} />
                <View className="flex-1 justify-center items-center">
                    <Text className="text-gray-500">{t('field.notFound')}</Text>
                </View>
            </SafeAreaView>
        );
    }

    const streetPart = [field.street, field.streetNumber].filter(Boolean).join(' ');
    const address = [streetPart, field.neighborhood, field.city].filter(Boolean).join(', ') || field.location || '';
    const sports = field.supportedSports || [];

    const renderScheduleItem = ({ item }: { item: FieldScheduleGame }) => {
        const slotsLeft = Math.max(0, item.maxPlayers - item.confirmedCount);
        const isFull = slotsLeft === 0;
        return (
            <TouchableOpacity
                onPress={() => router.push(`/game/${item.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-3 mr-3 w-44"
            >
                <Text className="font-bold text-gray-800" numberOfLines={1}>
                    {item.title || SPORT_MAPPING[item.sport] || item.sport}
                </Text>
                <Text className="text-gray-500 text-xs mt-1">
                    {item.date ? item.date.split('-').reverse().join('/') : ''} · {item.time || ''}
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                    {item.duration} {item.duration === 1 ? t('field.hour') : t('field.hours')}
                    {item.price ? ` · ₪${item.price}` : ` · ${t('field.freePrice')}`}
                </Text>
                <View className={`self-start mt-2 px-2 py-0.5 rounded-full ${isFull ? 'bg-gray-100' : 'bg-green-100'}`}>
                    <Text className={`text-xs font-bold ${isFull ? 'text-gray-500' : 'text-green-700'}`}>
                        {isFull ? t('field.gameFull') : t('field.slotsLeft', { count: slotsLeft })}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-gray-50">
            <FieldProfileHeader title={field.name} onBack={() => router.back()} />

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 16 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Field Header & Info */}
                <View className="bg-white mb-4 shadow-sm">
                    {field.image ? (
                        <Image source={{ uri: field.image }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
                    ) : null}
                    <View className="p-4">
                        <Text className="text-2xl font-bold text-gray-800">{field.name}</Text>
                        {address ? (
                            <View className="flex-row items-center mt-1">
                                <FontAwesome name="map-marker" size={14} color="#6b7280" style={{ marginRight: 6 }} />
                                <Text className="text-gray-600 flex-1">{address}</Text>
                            </View>
                        ) : null}

                        <View className="flex-row flex-wrap mt-3" style={{ gap: 6 }}>
                            <View className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200">
                                <Text className="text-blue-700 text-xs font-bold">
                                    {field.type === 'closed' ? t('field.closedField') : t('field.openField')}
                                </Text>
                            </View>
                            {sports.map(s => (
                                <View key={s} className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200">
                                    <Text className="text-gray-700 text-xs font-bold">{SPORT_MAPPING[s] || s}</Text>
                                </View>
                            ))}
                        </View>

                        <Text className="text-gray-500 text-sm mt-3">
                            {!field.price || field.price <= 0
                                ? t('field.freePrice')
                                : t('field.pricePerHour', { price: field.price })}
                        </Text>
                    </View>
                </View>

                {analytics && (
                    <>
                        {/* JoinUp Roster Schedule */}
                        <View className="bg-white p-4 mb-4 shadow-sm">
                            <Text className="text-lg font-bold text-gray-800 mb-3">{t('field.upcomingGames')}</Text>
                            {analytics.schedule.length === 0 ? (
                                <Text className="text-gray-500 text-sm">{t('field.noUpcomingGames')}</Text>
                            ) : (
                                <FlatList
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    data={analytics.schedule}
                                    keyExtractor={g => g.id}
                                    renderItem={renderScheduleItem}
                                    nestedScrollEnabled
                                />
                            )}
                        </View>

                        {/* Visual Busy Times Chart */}
                        <View className="bg-white p-4 mb-4 shadow-sm">
                            <Text className="text-lg font-bold text-gray-800">{t('field.busyTimes')}</Text>
                            <Text className="text-gray-400 text-xs mb-3">
                                {t('field.busySubtitle', { count: analytics.totalReports, days: analytics.reportWindowDays })}
                            </Text>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" nestedScrollEnabled>
                                {[0, 1, 2, 3, 4, 5, 6].map(d => (
                                    <TouchableOpacity
                                        key={d}
                                        onPress={() => setSelectedDay(d)}
                                        className={`mr-2 px-3 py-1.5 rounded-full border ${selectedDay === d ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                                    >
                                        <Text className={selectedDay === d ? 'text-white font-bold text-xs' : 'text-gray-700 text-xs'}>
                                            {t(`field.day${d}`)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
                                <View className="flex-row items-end" style={{ height: CHART_MAX_HEIGHT + 24 }}>
                                    {dayCells.map((cell, hour) => {
                                        const hasData = cell.samples > 0 && cell.avg !== null;
                                        const barHeight = hasData ? Math.max(6, (cell.avg! / 5) * CHART_MAX_HEIGHT) : 0;
                                        return (
                                            <View key={hour} className="items-center" style={{ width: 22 }}>
                                                <View
                                                    style={{
                                                        width: 14,
                                                        height: CHART_MAX_HEIGHT,
                                                        backgroundColor: 'rgba(128,128,128,0.08)',
                                                        borderRadius: 3,
                                                        justifyContent: 'flex-end',
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    {hasData && (
                                                        <View
                                                            style={{
                                                                width: '100%',
                                                                height: barHeight,
                                                                backgroundColor: levelColor(cell.avg!),
                                                                borderTopLeftRadius: 3,
                                                                borderTopRightRadius: 3
                                                            }}
                                                        />
                                                    )}
                                                </View>
                                                {hour % 3 === 0 ? (
                                                    <Text className="text-gray-400 mt-1" style={{ fontSize: 9 }}>{hour}</Text>
                                                ) : (
                                                    <Text style={{ fontSize: 9 }}> </Text>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </ScrollView>

                            {!hasDayData && (
                                <Text className="text-gray-500 text-sm text-center mt-2">{t('field.noDayData')}</Text>
                            )}

                            <View className="flex-row justify-center mt-3" style={{ gap: 12 }}>
                                {[
                                    { color: '#22c55e', label: t('field.empty') },
                                    { color: '#eab308', label: t('field.light') },
                                    { color: '#f97316', label: t('field.moderate') },
                                    { color: '#ef4444', label: t('field.crowded') }
                                ].map(item => (
                                    <View key={item.label} className="flex-row items-center">
                                        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: item.color, marginRight: 4 }} />
                                        <Text className="text-gray-500 text-xs">{item.label}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Crowdsource Feedback Widget — flex footer inside SafeAreaView, not absolute */}
            {userId && (
                <View className="bg-white border-t border-gray-200 px-4 pt-4 pb-2 shadow-lg">
                    {reportState === 'done' ? (
                        <Text className="text-center font-bold text-gray-800 py-2">{t('field.thanks')}</Text>
                    ) : (
                        <>
                            <Text className="font-bold text-gray-800 mb-2 text-center">{t('field.busyNow')}</Text>
                            <View className="flex-row justify-center pb-1" style={{ gap: 10 }}>
                                {[
                                    { label: t('field.empty'), level: 1, bg: 'bg-green-100 border-green-300', text: 'text-green-700' },
                                    { label: t('field.moderate'), level: 3, bg: 'bg-orange-100 border-orange-300', text: 'text-orange-700' },
                                    { label: t('field.crowded'), level: 5, bg: 'bg-red-100 border-red-300', text: 'text-red-700' }
                                ].map(opt => (
                                    <TouchableOpacity
                                        key={opt.level}
                                        disabled={reportState === 'submitting'}
                                        onPress={() => submitReport(opt.level)}
                                        className={`px-5 py-2 rounded-full border ${opt.bg} ${reportState === 'submitting' ? 'opacity-50' : ''}`}
                                    >
                                        <Text className={`font-bold ${opt.text}`}>{opt.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    )}
                </View>
            )}
        </SafeAreaView>
    );
}
