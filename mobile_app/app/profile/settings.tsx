import React, { useEffect, useState } from 'react';
import { getTokenOrThrow } from '@/utils/apiErrors';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Switch, I18nManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import { usersApi, PrivacyLevel, PrivacySettings } from '../../src/services/api/users';
import LoadingMotif from '@/components/loading/LoadingMotif';
import { appAlert } from '@/i18n/appAlert';
import BackButton from '@/components/ui/BackButton';

type FieldKey = 'privacyFriends' | 'privacyGames' | 'privacyMessages';
type FieldValue = PrivacyLevel | 'DEFAULT';

export default function PrivacySettingsScreen() {
    const router = useRouter();
    const { user } = useUser();
    const { getToken } = useAuth();
    const { t } = useTranslation();

    const [values, setValues] = useState<Record<FieldKey, FieldValue>>({
        privacyFriends: 'DEFAULT',
        privacyGames: 'DEFAULT',
        privacyMessages: 'DEFAULT',
    });
    // Age-based default per field; fixed for the user, so the default option label never changes.
    const [hideGroups, setHideGroups] = useState(false);
    const [hideMatchStats, setHideMatchStats] = useState(false);
    const [ageDefaults, setAgeDefaults] = useState<PrivacySettings['ageDefaults'] | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const FIELDS: { key: FieldKey; label: string }[] = [
        { key: 'privacyFriends', label: t('privacy.friends') },
        { key: 'privacyGames', label: t('privacy.games') },
        { key: 'privacyMessages', label: t('privacy.messages') },
    ];

    const levelLabel = (level: PrivacyLevel) => (level === 'EVERYONE' ? t('privacy.everyone') : t('privacy.friendsOnly'));
    const optionsFor = (key: FieldKey): { value: FieldValue; label: string }[] => [
        // "כולם (ברירת מחדל)": without the suffix the default option reads exactly like the explicit one below it.
        { value: 'DEFAULT', label: ageDefaults?.[key] ? `${levelLabel(ageDefaults[key])} (${t('privacy.default')})` : t('privacy.default') },
        { value: 'EVERYONE', label: t('privacy.everyone') },
        { value: 'FRIENDS_ONLY', label: t('privacy.friendsOnly') },
    ];

    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const data = await usersApi.getProfile(user.id, token);
                const ps = data.privacySettings;
                if (ps) {
                    setValues({
                        privacyFriends: ps.privacyFriends ?? 'DEFAULT',
                        privacyGames: ps.privacyGames ?? 'DEFAULT',
                        privacyMessages: ps.privacyMessages ?? 'DEFAULT',
                    });
                    setHideGroups(!!ps.hideGroups);
                    setHideMatchStats(!!ps.hideMatchStats);
                    setAgeDefaults(ps.ageDefaults ?? null);
                }
            } catch (e) {
                console.error('Failed to load privacy settings', e);
            } finally {
                setLoading(false);
            }
        })();
    }, [user?.id]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = await getTokenOrThrow(getToken);
            const saved = await usersApi.updatePrivacySettings(
                {
                    hideGroups,
                    hideMatchStats,
                    privacyFriends: values.privacyFriends === 'DEFAULT' ? null : values.privacyFriends,
                    privacyGames: values.privacyGames === 'DEFAULT' ? null : values.privacyGames,
                    privacyMessages: values.privacyMessages === 'DEFAULT' ? null : values.privacyMessages,
                },
                token
            );
            if (saved.ageDefaults) setAgeDefaults(saved.ageDefaults);
            appAlert('', t('privacy.saved'));
        } catch (e) {
            console.error('Failed to save privacy settings', e);
            appAlert(t('common.error', 'Error'), t('privacy.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-cyber-bg" edges={['top', 'left', 'right']}>
            <View className="flex-row items-center p-4 border-b border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-card">
                <BackButton />
                <Text className="flex-1 text-center font-bold text-lg mr-10 text-gray-900 dark:text-cyber-text">{t('privacy.settings')}</Text>
            </View>

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <LoadingMotif id="brand-pulse" label={t('common.loading', 'טוען…')} />
                </View>
            ) : (
                <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }}>
                    <Text className="text-gray-500 dark:text-cyber-muted mb-6">{t('privacy.description')}</Text>

                    {FIELDS.map((f) => (
                        <View key={f.key} className="mb-6">
                            <Text className="font-bold text-gray-800 dark:text-cyber-text mb-3">{f.label}</Text>
                            <View className="bg-white dark:bg-cyber-card rounded-2xl border border-gray-100 dark:border-cyber-border overflow-hidden">
                                {optionsFor(f.key).map((opt, idx) => {
                                    const active = values[f.key] === opt.value;
                                    return (
                                        <TouchableOpacity
                                            key={opt.value}
                                            onPress={() => setValues((prev) => ({ ...prev, [f.key]: opt.value }))}
                                            className={`flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-gray-50 dark:border-cyber-border' : ''}`}
                                        >
                                            <Text className={`text-base ${active ? 'text-brand dark:text-brand-light font-bold' : 'text-gray-700 dark:text-cyber-text'}`}>
                                                {opt.label}
                                            </Text>
                                            {active && <FontAwesome name="check" size={16} color="#059669" />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    ))}

                    <View className="flex-row items-center justify-between bg-white dark:bg-cyber-card rounded-2xl border border-gray-100 dark:border-cyber-border px-4 py-3 mb-6">
                        <Text className="font-bold text-gray-800 dark:text-cyber-text flex-1">{t('privacy.hideGroups', 'הסתר את הקבוצות שלי בפרופיל')}</Text>
                        <Switch value={hideGroups} onValueChange={setHideGroups} />
                    </View>

                    <View className="flex-row items-center justify-between bg-white dark:bg-cyber-card rounded-2xl border border-gray-100 dark:border-cyber-border px-4 py-3 mb-6">
                        <View className="flex-1 me-3">
                            <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('privacy.hideMatchStats')}</Text>
                            <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-1">{t('privacy.hideMatchStatsHint')}</Text>
                        </View>
                        <Switch
                            testID="settings-hide-match-stats"
                            value={hideMatchStats}
                            onValueChange={setHideMatchStats}
                            accessibilityLabel={t('privacy.hideMatchStats')}
                            accessibilityHint={t('privacy.hideMatchStatsHint')}
                        />
                    </View>

                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={saving}
                        className="bg-brand rounded-2xl py-4 items-center mt-2"
                    >
                        {saving ? (
                            <ActivityIndicator color="#ffffff" />
                        ) : (
                            <Text className="text-white font-bold text-base">{t('privacy.save')}</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => router.push('/settings/feedback' as any)}
                        className="bg-white dark:bg-cyber-card rounded-2xl border border-gray-100 dark:border-cyber-border px-4 py-3 flex-row items-center justify-between mt-6"
                    >
                        <Text className="text-base text-gray-800 dark:text-cyber-text">{t('settings.feedback', 'דיווח על באג / יצירת קשר')}</Text>
                        <FontAwesome name={I18nManager.isRTL ? 'chevron-left' : 'chevron-right'} size={14} color="#9ca3af" />
                    </TouchableOpacity>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}
