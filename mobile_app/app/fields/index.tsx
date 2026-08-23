import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, Image, ScrollView } from 'react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fieldsApi, Field } from '@/services/api';

export default function FieldsDirectoryScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const [fields, setFields] = useState<Field[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await fieldsApi.getAll();
                if (!cancelled) setFields(Array.isArray(data) ? data : []);
            } catch (e) {
                console.error('Failed to load fields', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return fields;
        return fields.filter((f) => {
            const hay = [f.name, f.location, f.city, f.neighborhood].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [fields, query]);

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3" accessibilityRole="button">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>
                    {t('field.directory', 'מגרשים')}
                </Text>
            </View>

            <View className="px-4 py-3 border-b border-gray-100">
                <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <FontAwesome name="search" size={14} color="#9ca3af" />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('field.searchPlaceholder', 'חפש מגרש או עיר')}
                        className="flex-1 ml-2 text-base text-gray-800"
                    />
                </View>
            </View>

            {loading ? (
                <View className="flex-1 justify-center items-center">
                    <ActivityIndicator size="large" color="#059669" />
                </View>
            ) : filtered.length === 0 ? (
                <View className="flex-1 justify-center items-center px-8">
                    <FontAwesome name="map-marker" size={32} color="#d1d5db" />
                    <Text className="text-gray-500 mt-3 text-center">
                        {t('field.emptyDirectory', 'לא נמצאו מגרשים')}
                    </Text>
                </View>
            ) : (
                <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
                    {filtered.map((field) => (
                        <TouchableOpacity
                            key={field.id}
                            onPress={() => router.push(`/field/${field.id}`)}
                            className="flex-row items-center px-4 py-3 border-b border-gray-100 bg-white"
                            accessibilityRole="button"
                        >
                            {field.image ? (
                                <Image source={{ uri: field.image }} className="w-14 h-14 rounded-xl mr-3 bg-gray-100" />
                            ) : (
                                <View className="w-14 h-14 rounded-xl mr-3 bg-brand-mist items-center justify-center">
                                    <FontAwesome name="map-marker" size={20} color="#059669" />
                                </View>
                            )}
                            <View className="flex-1">
                                <Text className="text-base font-bold text-gray-900" numberOfLines={1}>{field.name}</Text>
                                <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                                    {field.city || field.location || ''}
                                </Text>
                                <Text className="text-xs text-gray-400 mt-0.5">
                                    {field.type === 'closed' ? t('field.closedField') : t('field.openField')}
                                    {typeof field.price === 'number' && field.price > 0
                                        ? ` · ${t('field.pricePerHour', { price: field.price })}`
                                        : ` · ${t('field.freePrice')}`}
                                </Text>
                            </View>
                            <FontAwesome name="chevron-left" size={12} color="#d1d5db" />
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}
