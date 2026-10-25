import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Linking, ActivityIndicator, TextInput, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import * as NotificationsPermissions from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CATEGORY_GROUPS,
    SNOOZE_HOURS_OPTIONS,
    minutesToHHMM,
    type NotificationCategoryKey,
    type NotificationMute,
    type NotificationSettings,
    type NotificationSettingsUpdate,
    type NotificationSport,
} from '@joinup/shared/notificationPrefs';
import { normalizeCity } from '@joinup/shared/cityAliases';
import { notificationsApi } from '@/services/api/notifications';
import { SPORT_MAPPING } from '@/utils/sports';
import SafeImage from '@/components/SafeImage';
import { appAlert } from '@/i18n/appAlert';

const SAVE_DEBOUNCE_MS = 400;
const SPORTS = Object.keys(SPORT_MAPPING) as NotificationSport[];

const CATEGORY_ICON: Record<NotificationCategoryKey, React.ComponentProps<typeof FontAwesome>['name']> = {
    friendRequests: 'user-plus',
    messages: 'comment',
    friendGames: 'futbol-o',
    friendJoins: 'sign-in',
    gameReminders: 'clock-o',
    myGames: 'calendar',
    invitations: 'envelope',
    organizer: 'shield',
    groupGames: 'users',
    cityGames: 'map-marker',
};

function deviceTimezone(): string | null {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
        return null;
    }
}

function minutesToDate(minutes: number): Date {
    const d = new Date();
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return d;
}

function Card({ children }: { children: React.ReactNode }) {
    return <View className="bg-white mx-4 rounded-xl mb-4 shadow-sm overflow-hidden">{children}</View>;
}

function Row({ icon, title, subtitle, right, onPress }: {
    icon?: React.ComponentProps<typeof FontAwesome>['name']; title: string; subtitle?: string | null; right?: React.ReactNode; onPress?: () => void;
}) {
    const content = (
        <View className="p-4 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-3">
                {icon && (
                    <View className="w-8 h-8 rounded-full bg-brand-pale items-center justify-center mr-3">
                        <FontAwesome name={icon} size={14} color="#059669" />
                    </View>
                )}
                <View className="flex-1">
                    <Text className="text-base text-gray-800 font-medium">{title}</Text>
                    {!!subtitle && <Text className="text-sm text-gray-500 mt-0.5">{subtitle}</Text>}
                </View>
            </View>
            {right}
        </View>
    );
    return onPress ? <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity> : content;
}

export default function NotificationSettingsScreen() {
    const { t } = useTranslation();
    const { getToken, isLoaded, userId } = useAuth();
    const getTokenRef = useRef(getToken);
    useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

    const [settings, setSettings] = useState<NotificationSettings | null>(null);
    const [osPermission, setOsPermission] = useState<string>('undetermined');
    const [loadError, setLoadError] = useState(false);
    const [cityOpen, setCityOpen] = useState(false);
    const [cityDraft, setCityDraft] = useState('');
    const [picker, setPicker] = useState<'quietHoursStart' | 'quietHoursEnd' | null>(null);
    const [busy, setBusy] = useState(false);

    const confirmedRef = useRef<NotificationSettings | null>(null);
    const pendingRef = useRef<NotificationSettingsUpdate>({});
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            const [data, perm] = await Promise.all([
                notificationsApi.getSettings(token),
                NotificationsPermissions.getPermissionsAsync(),
            ]);
            confirmedRef.current = data;
            setSettings(data);
            setOsPermission(perm.status);
        } catch (error) {
            console.error('[NOTIFICATION_SETTINGS] Failed to load:', error);
            setLoadError(true);
        }
    }, []);

    useEffect(() => {
        if (isLoaded && userId) load();
    }, [isLoaded, userId, load]);

    const flush = useCallback(async () => {
        timerRef.current = null;
        const changes = pendingRef.current;
        pendingRef.current = {};
        if (Object.keys(changes).length === 0) return;
        try {
            const token = await getTokenRef.current();
            if (!token) throw new Error('No auth token');
            const saved = await notificationsApi.updateSettings(changes, token);
            confirmedRef.current = saved;
            setSettings({ ...saved, ...pendingRef.current });
        } catch (error) {
            console.error('[NOTIFICATION_SETTINGS] Failed to save:', error);
            // Roll back only the failed batch; edits made while it was in flight stay pending
            // and are retried on the next debounce.
            if (confirmedRef.current) setSettings({ ...confirmedRef.current, ...pendingRef.current });
            if (Object.keys(pendingRef.current).length && !timerRef.current) {
                timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
            }
            appAlert(t('common.error', 'שגיאה'), t('notificationSettings.saveFailed'));
        }
    }, [t]);

    useEffect(() => () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            flush();
        }
    }, [flush]);

    const apply = useCallback((changes: NotificationSettingsUpdate) => {
        setSettings(prev => (prev ? { ...prev, ...changes } : prev));
        pendingRef.current = { ...pendingRef.current, ...changes };
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    }, [flush]);

    const togglePush = async (next: boolean) => {
        if (next && osPermission !== 'granted') {
            const req = await NotificationsPermissions.requestPermissionsAsync();
            setOsPermission(req.status);
            if (req.status !== 'granted') {
                Alert.alert(
                    t('settings.notificationsPermissionRequired', 'הרשאת התראות נדרשת'),
                    t('settings.notificationsPermissionMessage', 'כדי לקבל התראות יש לאשר זאת בהגדרות המכשיר.'),
                    [
                        { text: t('common.cancel', 'ביטול'), style: 'cancel' },
                        { text: t('settings.openSettings', 'פתח הגדרות'), onPress: () => Linking.openSettings() },
                    ]
                );
                return;
            }
        }
        apply({ pushEnabled: next });
    };

    const runImmediate = async (fn: (token: string) => Promise<Partial<NotificationSettings> | NotificationMute[]>, onDone: (r: any) => void) => {
        setBusy(true);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            onDone(await fn(token));
        } catch (error) {
            console.error('[NOTIFICATION_SETTINGS] Action failed:', error);
            appAlert(t('common.error', 'שגיאה'), t('notificationSettings.actionFailed'));
        } finally {
            setBusy(false);
        }
    };

    const snooze = (hours: number | null) => runImmediate(
        token => notificationsApi.snooze(hours, token),
        (saved: NotificationSettings) => {
            confirmedRef.current = saved;
            setSettings({ ...saved, ...pendingRef.current });
        }
    );

    const openSnoozeMenu = () => {
        Alert.alert(t('notificationSettings.snoozeTitle'), undefined, [
            ...SNOOZE_HOURS_OPTIONS.map(h => ({ text: t('notificationSettings.snoozeFor', { count: h }), onPress: () => snooze(h) })),
            { text: t('common.cancel', 'ביטול'), style: 'cancel' as const },
        ]);
    };

    const unmute = (mute: NotificationMute) => runImmediate(
        token => notificationsApi.unmute(mute.targetType, mute.targetId, token),
        (mutes: NotificationMute[]) => {
            setSettings(prev => (prev ? { ...prev, mutes } : prev));
            if (confirmedRef.current) confirmedRef.current = { ...confirmedRef.current, mutes };
        }
    );

    if (loadError) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50 p-6">
                <Stack.Screen options={{ title: t('notificationSettings.title'), headerShown: true }} />
                <Text className="text-gray-700 mb-4 text-center">{t('notificationSettings.loadFailed')}</Text>
                <TouchableOpacity onPress={load} className="bg-brand px-5 py-2.5 rounded-lg">
                    <Text className="text-white font-bold">{t('notificationSettings.retry')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!settings) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50">
                <Stack.Screen options={{ title: t('notificationSettings.title'), headerShown: true }} />
                <ActivityIndicator />
            </View>
        );
    }

    const pushOn = settings.pushEnabled && osPermission === 'granted';
    const snoozedUntil = settings.snoozeUntil ? new Date(settings.snoozeUntil) : null;
    const timeOf = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const toggleSport = (sport: NotificationSport) => {
        const cur = settings.cityGamesSports;
        const next = cur.includes(sport) ? cur.filter(s => s !== sport) : [...cur, sport];
        apply({ cityGamesSports: next.length === SPORTS.length ? [] : next });
    };

    const addCity = () => {
        const city = normalizeCity(cityDraft);
        setCityDraft('');
        if (!city || settings.cityGamesCities.includes(city) || settings.cityGamesCities.length >= 10) return;
        apply({ cityGamesCities: [...settings.cityGamesCities, city] });
    };

    const muteUntilText = (m: NotificationMute) => (m.until
        ? t('notificationSettings.mutedUntil', { time: new Date(m.until).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) })
        : t('notificationSettings.mutedForever'));

    return (
        <>
            <Stack.Screen options={{ title: t('notificationSettings.title'), headerShown: true }} />
            <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                <Text className="mx-4 mb-3 text-sm text-gray-500">{t('notificationSettings.autoSave')}</Text>

                {/* Master push + snooze */}
                <Card>
                    <Row
                        icon="bell"
                        title={t('notificationSettings.push')}
                        subtitle={osPermission !== 'granted' && settings.pushEnabled
                            ? t('notificationSettings.osPermissionOff')
                            : t('notificationSettings.pushSubtitle')}
                        right={<Switch value={pushOn} onValueChange={togglePush} />}
                    />
                    {pushOn && (
                        <View className="border-t border-gray-100">
                            <Row
                                icon="pause"
                                title={t('notificationSettings.snooze')}
                                subtitle={snoozedUntil ? t('notificationSettings.snoozedUntil', { time: timeOf(snoozedUntil) }) : t('notificationSettings.snoozeSubtitle')}
                                right={busy ? <ActivityIndicator /> : (
                                    <TouchableOpacity onPress={snoozedUntil ? () => snooze(null) : openSnoozeMenu} className="px-3 py-1.5 rounded-lg bg-gray-100">
                                        <Text className="text-brand-dark font-bold">
                                            {snoozedUntil ? t('notificationSettings.resume') : t('notificationSettings.snoozeAction')}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    )}
                </Card>

                {/* Categories */}
                <Text className="mx-4 mb-1 text-base font-bold text-gray-800">{t('notificationSettings.whatTitle')}</Text>
                <Text className="mx-4 mb-3 text-sm text-gray-500">{t('notificationSettings.whatSubtitle')}</Text>
                {NOTIFICATION_CATEGORY_GROUPS.map(group => (
                    <Card key={group}>
                        <View className="px-4 pt-3 pb-1 flex-row justify-between items-center">
                            <Text className="text-sm font-bold text-gray-500">{t(`notificationSettings.groups.${group}`)}</Text>
                            <View className="flex-row">
                                <Text className="w-16 text-center text-xs text-gray-400">{t('notificationSettings.channelPush')}</Text>
                                <Text className="w-16 text-center text-xs text-gray-400">{t('notificationSettings.channelInApp')}</Text>
                            </View>
                        </View>
                        {NOTIFICATION_CATEGORIES.filter(c => c.group === group).map((cat, i) => (
                            <View key={cat.key} className={i > 0 ? 'border-t border-gray-100' : ''}>
                                <View className="px-4 py-3 flex-row items-center">
                                    <View className="w-8 h-8 rounded-full bg-brand-pale items-center justify-center mr-3">
                                        <FontAwesome name={CATEGORY_ICON[cat.key]} size={14} color="#059669" />
                                    </View>
                                    <View className="flex-1 mr-2">
                                        <Text className="text-base text-gray-800 font-medium">{t(`notificationSettings.categories.${cat.key}.title`)}</Text>
                                        <Text className="text-xs text-gray-500 mt-0.5">
                                            {t(`notificationSettings.categories.${cat.key}.subtitle`)}
                                        </Text>
                                        {cat.key === 'cityGames' && (
                                            <TouchableOpacity onPress={() => setCityOpen(o => !o)} className="mt-1">
                                                <Text className="text-brand-dark text-sm font-bold">
                                                    {cityOpen ? t('notificationSettings.closeFilters') : t('notificationSettings.openFilters')}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <View className="w-16 items-center">
                                        <Switch
                                            value={pushOn && !!settings[cat.pushField]}
                                            disabled={!pushOn}
                                            onValueChange={v => apply({ [cat.pushField]: v })}
                                            accessibilityLabel={`${t(`notificationSettings.categories.${cat.key}.title`)} — ${t('notificationSettings.channelPush')}`}
                                        />
                                    </View>
                                    <View className="w-16 items-center">
                                        {cat.inAppField ? (
                                            <Switch
                                                value={!!settings[cat.inAppField]}
                                                onValueChange={v => apply({ [cat.inAppField as string]: v })}
                                                accessibilityLabel={`${t(`notificationSettings.categories.${cat.key}.title`)} — ${t('notificationSettings.channelInApp')}`}
                                            />
                                        ) : null}
                                    </View>
                                </View>

                                {cat.key === 'cityGames' && cityOpen && (
                                    <View className="mx-4 mb-4 p-3 rounded-lg bg-gray-50">
                                        <Text className="text-sm font-bold text-gray-700 mb-2">{t('notificationSettings.sports')}</Text>
                                        <View className="flex-row flex-wrap mb-3">
                                            {[null, ...SPORTS].map(sport => {
                                                const selected = sport === null ? settings.cityGamesSports.length === 0 : settings.cityGamesSports.includes(sport);
                                                return (
                                                    <TouchableOpacity
                                                        key={sport ?? 'all'}
                                                        onPress={() => (sport === null ? apply({ cityGamesSports: [] }) : toggleSport(sport))}
                                                        className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${selected ? 'bg-brand-pale border-brand' : 'bg-white border-gray-200'}`}
                                                    >
                                                        <Text className={`text-xs font-bold ${selected ? 'text-brand-dark' : 'text-gray-600'}`}>
                                                            {sport === null ? t('notificationSettings.allSports') : SPORT_MAPPING[sport as keyof typeof SPORT_MAPPING]}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>

                                        <Text className="text-sm font-bold text-gray-700 mb-1">{t('notificationSettings.cities')}</Text>
                                        <Text className="text-xs text-gray-500 mb-2">{t('notificationSettings.citiesHint')}</Text>
                                        <View className="flex-row flex-wrap mb-2">
                                            {settings.cityGamesCities.map(city => (
                                                <TouchableOpacity
                                                    key={city}
                                                    onPress={() => apply({ cityGamesCities: settings.cityGamesCities.filter(c => c !== city) })}
                                                    className="px-3 py-1.5 rounded-full mr-2 mb-2 bg-brand-pale border border-brand flex-row items-center"
                                                    accessibilityLabel={t('notificationSettings.removeCity', { city })}
                                                >
                                                    <Text className="text-xs font-bold text-brand-dark mr-1">{city}</Text>
                                                    <FontAwesome name="times" size={10} color="#047857" />
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        {settings.cityGamesCities.length < 10 && (
                                            <View className="flex-row items-center mb-3">
                                                <TextInput
                                                    value={cityDraft}
                                                    onChangeText={setCityDraft}
                                                    onSubmitEditing={addCity}
                                                    placeholder={t('notificationSettings.addCityPlaceholder')}
                                                    returnKeyType="done"
                                                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-800"
                                                />
                                                <TouchableOpacity onPress={addCity} className="ml-2 px-3 py-2 rounded-lg bg-brand">
                                                    <Text className="text-white font-bold">{t('notificationSettings.add')}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}

                                        {!settings.cityGamesPush && (
                                            <Text className="text-xs text-gray-500">{t('notificationSettings.filtersApplyInApp')}</Text>
                                        )}
                                    </View>
                                )}
                            </View>
                        ))}
                    </Card>
                ))}

                {/* Quiet hours */}
                <Card>
                    <Row
                        icon="moon-o"
                        title={t('notificationSettings.quietHours')}
                        subtitle={t('notificationSettings.quietHoursSubtitle')}
                        right={
                            <Switch
                                value={settings.quietHoursEnabled}
                                onValueChange={v => {
                                    const tz = deviceTimezone();
                                    apply(v && tz && tz !== settings.timezone ? { quietHoursEnabled: v, timezone: tz } : { quietHoursEnabled: v });
                                }}
                            />
                        }
                    />
                    {settings.quietHoursEnabled && (
                        <View className="px-4 pb-4 flex-row">
                            {(['quietHoursStart', 'quietHoursEnd'] as const).map(key => (
                                <TouchableOpacity key={key} onPress={() => setPicker(key)} className="flex-1 mr-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                                    <Text className="text-xs text-gray-500">{t(`notificationSettings.${key === 'quietHoursStart' ? 'from' : 'to'}`)}</Text>
                                    <Text className="text-lg font-bold text-gray-800">{minutesToHHMM(settings[key])}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    {picker && (
                        <DateTimePicker
                            value={minutesToDate(settings[picker])}
                            mode="time"
                            is24Hour
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(e, d) => {
                                const key = picker;
                                if (Platform.OS !== 'ios' || e.type === 'dismissed') setPicker(null);
                                if (d && e.type !== 'dismissed') apply({ [key]: d.getHours() * 60 + d.getMinutes() });
                            }}
                        />
                    )}
                    {picker && Platform.OS === 'ios' && (
                        <TouchableOpacity onPress={() => setPicker(null)} className="mx-4 mb-4 p-2 rounded-lg bg-brand items-center">
                            <Text className="text-white font-bold">{t('notificationSettings.done')}</Text>
                        </TouchableOpacity>
                    )}
                </Card>

                {/* Mutes */}
                <Text className="mx-4 mb-2 text-base font-bold text-gray-800">{t('notificationSettings.muted')}</Text>
                <Card>
                    {settings.mutes.length === 0 ? (
                        <Text className="p-4 text-sm text-gray-500">{t('notificationSettings.noMutes')}</Text>
                    ) : settings.mutes.map((m, i) => (
                        <View key={`${m.targetType}:${m.targetId}`} className={`p-4 flex-row items-center justify-between ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                            <View className="flex-row items-center flex-1 mr-3">
                                {m.imageUrl ? (
                                    <SafeImage source={{ uri: m.imageUrl }} className="w-9 h-9 rounded-full bg-gray-200 mr-3" />
                                ) : (
                                    <View className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center mr-3">
                                        <FontAwesome name={m.targetType === 'USER' ? 'user' : m.targetType === 'SERIES' ? 'users' : 'futbol-o'} size={14} color="#6b7280" />
                                    </View>
                                )}
                                <View className="flex-1">
                                    <Text className="text-base text-gray-800 font-medium" numberOfLines={1}>
                                        {m.label || t(`notificationSettings.muteType.${m.targetType}`)}
                                    </Text>
                                    <Text className="text-xs text-gray-500">
                                        {t(`notificationSettings.muteType.${m.targetType}`)} · {muteUntilText(m)}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => unmute(m)} disabled={busy}>
                                <Text className="text-brand-dark font-bold">{t('notificationSettings.unmute')}</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </Card>
            </ScrollView>
        </>
    );
}
