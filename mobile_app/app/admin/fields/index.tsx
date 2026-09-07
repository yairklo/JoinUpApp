import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, ActivityIndicator, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { fieldsApi, Field } from '@/services/api/fields';
import LoadingMotif from '@/components/loading/LoadingMotif';
import { SPORT_MAPPING } from '@/utils/sports';

/**
 * Mobile counterpart of next_app's admin fields list
 * (next_app/src/app/admin/fields/page.tsx) -- same listForAdmin/update/delete
 * calls, gated by app/admin/_layout.tsx instead of a per-page useIsAdmin() check.
 */
export default function AdminFieldsListScreen() {
    const router = useRouter();
    const { getToken } = useAuth();

    const [fields, setFields] = useState<Field[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) {
                setLoading(false);
                return;
            }
            const list = await fieldsApi.listForAdmin(token);
            setFields(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error('Failed to load admin fields', e);
            setError('טעינת המגרשים נכשלה');
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => {
        load();
    }, [load]);

    const filteredFields = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return fields;
        return fields.filter((f) =>
            [f.name, f.city, f.location, f.neighborhood, f.street].filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [fields, search]);

    const toggleAvailable = async (field: Field) => {
        setBusyId(field.id);
        try {
            const token = await getToken();
            if (!token) return;
            await fieldsApi.update(field.id, { available: !(field.available !== false) }, token);
            await load();
        } catch (e) {
            Alert.alert('שגיאה', 'עדכון המגרש נכשל');
        } finally {
            setBusyId(null);
        }
    };

    const confirmDelete = (field: Field) => {
        Alert.alert(
            'מחיקת מגרש',
            `האם למחוק את המגרש "${field.name}"? פעולה זו אינה הפיכה.`,
            [
                { text: 'ביטול', style: 'cancel' },
                { text: 'מחק', style: 'destructive', onPress: () => handleDelete(field) },
            ]
        );
    };

    const handleDelete = async (field: Field) => {
        setBusyId(field.id);
        try {
            const token = await getToken();
            if (!token) return;
            await fieldsApi.delete(field.id, token);
            await load();
        } catch (e) {
            Alert.alert('שגיאה', 'מחיקת המגרש נכשלה');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3" accessibilityRole="button">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>ניהול מגרשים</Text>
                <TouchableOpacity
                    onPress={() => router.push('/admin/fields/new')}
                    className="w-10 h-10 rounded-full bg-brand items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel="מגרש חדש"
                >
                    <FontAwesome name="plus" size={16} color="#fff" />
                </TouchableOpacity>
            </View>

            <View className="px-4 py-3 border-b border-gray-100">
                <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <FontAwesome name="search" size={14} color="#9ca3af" />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="חיפוש לפי שם, עיר או כתובת…"
                        className="flex-1 ml-2 text-base text-gray-800"
                    />
                </View>
            </View>

            {error && (
                <View className="mx-4 mt-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                    <Text className="text-red-600 text-sm text-center">{error}</Text>
                </View>
            )}

            {loading ? (
                <View className="flex-1 justify-center items-center">
                    <LoadingMotif id="pin-drop" label="טוען מגרשים…" />
                </View>
            ) : filteredFields.length === 0 ? (
                <View className="flex-1 justify-center items-center px-8">
                    <FontAwesome name="map-marker" size={32} color="#d1d5db" />
                    <Text className="text-gray-500 mt-3 text-center">
                        {search ? 'לא נמצאו מגרשים התואמים את החיפוש' : 'אין עדיין מגרשים'}
                    </Text>
                </View>
            ) : (
                <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
                    {filteredFields.map((field) => {
                        const hasLocation = field.lat != null && field.lng != null;
                        const isAvailable = field.available !== false;
                        return (
                            <View key={field.id} className="flex-row items-center px-4 py-3 border-b border-gray-100 bg-white">
                                {field.image ? (
                                    <Image source={{ uri: field.image }} className="w-14 h-14 rounded-xl mr-3 bg-gray-100" />
                                ) : (
                                    <View className="w-14 h-14 rounded-xl mr-3 bg-brand-mist items-center justify-center">
                                        <Text className="text-brand font-bold text-lg">{field.name?.[0]}</Text>
                                    </View>
                                )}
                                <TouchableOpacity
                                    className="flex-1"
                                    onPress={() => router.push(`/admin/fields/${field.id}`)}
                                >
                                    <Text className="text-base font-bold text-gray-900" numberOfLines={1}>{field.name}</Text>
                                    <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                                        {field.city || field.location || ''}
                                    </Text>
                                    <View className="flex-row flex-wrap mt-1 gap-1">
                                        {(field.supportedSports || []).map((s) => (
                                            <View key={s} className="bg-gray-100 px-2 py-0.5 rounded-full">
                                                <Text className="text-xs text-gray-600">{SPORT_MAPPING[s as keyof typeof SPORT_MAPPING] || s}</Text>
                                            </View>
                                        ))}
                                        {!hasLocation && (
                                            <TouchableOpacity
                                                onPress={() => router.push(`/admin/fields/${field.id}`)}
                                                className="flex-row items-center bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                                            >
                                                <FontAwesome name="exclamation-triangle" size={9} color="#d97706" style={{ marginLeft: 4 }} />
                                                <Text className="text-xs text-amber-700 font-bold">ללא מיקום במפה</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </TouchableOpacity>

                                <View className="items-center ml-2">
                                    {busyId === field.id ? (
                                        <ActivityIndicator size="small" color="#059669" />
                                    ) : (
                                        <Switch value={isAvailable} onValueChange={() => toggleAvailable(field)} />
                                    )}
                                    <View className="flex-row mt-2">
                                        <TouchableOpacity onPress={() => router.push(`/admin/fields/${field.id}`)} className="p-2">
                                            <FontAwesome name="pencil" size={16} color="#374151" />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => confirmDelete(field)} className="p-2">
                                            <FontAwesome name="trash" size={16} color="#dc2626" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}
