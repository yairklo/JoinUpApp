import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import { usersApi, PrivacyLevel } from '../../src/services/api/users';

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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const FIELDS: { key: FieldKey; label: string }[] = [
        { key: 'privacyFriends', label: t('privacy.friends') },
        { key: 'privacyGames', label: t('privacy.games') },
        { key: 'privacyMessages', label: t('privacy.messages') },
    ];

    const OPTIONS: { value: FieldValue; label: string }[] = [
        { value: 'DEFAULT', label: t('privacy.default') },
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
            const token = await getToken();
            if (!token) return;
            await usersApi.updatePrivacySettings(
                {
                    privacyFriends: values.privacyFriends === 'DEFAULT' ? null : values.privacyFriends,
                    privacyGames: values.privacyGames === 'DEFAULT' ? null : values.privacyGames,
                    privacyMessages: values.privacyMessages === 'DEFAULT' ? null : values.privacyMessages,
                },
                token
            );
            Alert.alert('', t('privacy.saved'));
        } catch (e) {
            console.error('Failed to save privacy settings', e);
            Alert.alert(t('error', 'Error'), t('privacy.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'left', 'right']}>
            <View className="flex-row items-center p-4 border-b border-gray-200 bg-white">
                <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
                    <FontAwesome name="chevron-left" size={20} color="#374151" />
                </TouchableOpacity>
                <Text className="flex-1 text-center font-bold text-lg mr-10">{t('privacy.settings')}</Text>
            </View>

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#2563eb" />
                </View>
            ) : (
                <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }}>
                    <Text className="text-gray-500 mb-6">{t('privacy.description')}</Text>

                    {FIELDS.map((f) => (
                        <View key={f.key} className="mb-6">
                            <Text className="font-bold text-gray-800 mb-3">{f.label}</Text>
                            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                {OPTIONS.map((opt, idx) => {
                                    const active = values[f.key] === opt.value;
                                    return (
                                        <TouchableOpacity
                                            key={opt.value}
                                            onPress={() => setValues((prev) => ({ ...prev, [f.key]: opt.value }))}
                                            className={`flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-gray-50' : ''}`}
                                        >
                                            <Text className={`text-base ${active ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>
                                                {opt.label}
                                            </Text>
                                            {active && <FontAwesome name="check" size={16} color="#2563eb" />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    ))}

                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={saving}
                        className="bg-blue-600 rounded-2xl py-4 items-center mt-2"
                    >
                        {saving ? (
                            <ActivityIndicator color="#ffffff" />
                        ) : (
                            <Text className="text-white font-bold text-base">{t('privacy.save')}</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}
