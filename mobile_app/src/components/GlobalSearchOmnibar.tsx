import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import { searchApi, GlobalSearchResults } from '@/services/api/search';
import { SPORT_MAPPING } from '@/utils/sports';

const EMPTY: GlobalSearchResults = { users: [], fields: [], games: [] };

export default function GlobalSearchOmnibar() {
    const router = useRouter();
    const { getToken } = useAuth();
    const { t } = useTranslation();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<GlobalSearchResults>(EMPTY);
    const [loading, setLoading] = useState(false);
    const [focused, setFocused] = useState(false);

    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const performSearch = useCallback(async (raw: string) => {
        const q = raw.trim();
        if (q.length < 2) {
            setResults(EMPTY);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            const data = await searchApi.global(q, token);
            setResults(data);
        } catch (err) {
            console.error('[Omnibar] search failed:', err);
            setResults(EMPTY);
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    const handleChange = (val: string) => {
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => performSearch(val), 300);
    };

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const go = (path: string) => {
        setQuery('');
        setResults(EMPTY);
        setFocused(false);
        router.push(path as any);
    };

    const trimmed = query.trim();
    const hasResults =
        results.users.length > 0 ||
        results.fields.length > 0 ||
        results.games.length > 0;
    const showDropdown = focused && trimmed.length >= 2;

    return (
        <View className="px-6 mb-4" style={{ zIndex: 50 }}>
            <View className="flex-row items-center bg-white dark:bg-cyber-surface rounded-2xl px-4 py-3 border border-gray-100 dark:border-gray-800 shadow-sm">
                <FontAwesome name="search" size={16} color="#9ca3af" style={{ marginRight: 10 }} />
                <TextInput
                    placeholder={t('omnibar.placeholder')}
                    placeholderTextColor="#9ca3af"
                    value={query}
                    onChangeText={handleChange}
                    onFocus={() => setFocused(true)}
                    className="flex-1 text-base text-gray-800 dark:text-cyber-text"
                    returnKeyType="search"
                />
                {loading && <ActivityIndicator size="small" color="#059669" />}
            </View>

            {showDropdown && (
                <View
                    className="mt-2 bg-white dark:bg-cyber-surface rounded-2xl border border-gray-100 dark:border-gray-800 shadow-lg overflow-hidden"
                    style={{ maxHeight: 340 }}
                >
                    {!hasResults && !loading ? (
                        <View className="py-6 items-center justify-center">
                            <Text className="text-gray-400">{t('omnibar.noResults')}</Text>
                        </View>
                    ) : (
                        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                            {results.users.length > 0 && (
                                <View>
                                    <SectionHeader label={t('omnibar.people')} />
                                    {results.users.map((u) => (
                                        <TouchableOpacity
                                            key={u.id}
                                            onPress={() => go(`/user/${u.id}`)}
                                            className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-gray-800"
                                        >
                                            {u.imageUrl ? (
                                                <Image
                                                    source={{ uri: u.imageUrl }}
                                                    style={{ width: 32, height: 32, borderRadius: 16, marginRight: 12 }}
                                                />
                                            ) : (
                                                <View
                                                    style={{ width: 32, height: 32, borderRadius: 16, marginRight: 12 }}
                                                    className="bg-gray-200 items-center justify-center"
                                                >
                                                    <FontAwesome name="user" size={14} color="#9ca3af" />
                                                </View>
                                            )}
                                            <Text className="text-gray-800 dark:text-cyber-text font-medium">
                                                {u.name || 'משתמש'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {results.fields.length > 0 && (
                                <View>
                                    <SectionHeader label={t('omnibar.fields')} />
                                    {results.fields.map((f) => (
                                        <TouchableOpacity
                                            key={f.id}
                                            onPress={() => go(`/field/${f.id}`)}
                                            className="px-4 py-3 border-b border-gray-50 dark:border-gray-800"
                                        >
                                            <Text className="text-gray-800 dark:text-cyber-text font-medium">{f.name}</Text>
                                            {!!f.city && (
                                                <View className="flex-row items-center mt-0.5">
                                                    <FontAwesome name="map-marker" size={11} color="#9ca3af" style={{ marginRight: 4 }} />
                                                    <Text className="text-gray-500 text-xs">{f.city}</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {results.games.length > 0 && (
                                <View>
                                    <SectionHeader label={t('omnibar.games')} />
                                    {results.games.map((g) => {
                                        const sportLabel = g.sport ? SPORT_MAPPING[g.sport] || g.sport : '';
                                        const title = g.title || sportLabel || 'משחק';
                                        const meta = [sportLabel, g.field?.city, g.time].filter(Boolean).join(' · ');
                                        return (
                                            <TouchableOpacity
                                                key={g.id}
                                                onPress={() => go(`/game/${g.id}`)}
                                                className="flex-row items-center px-4 py-3 border-b border-gray-50 dark:border-gray-800"
                                            >
                                                <FontAwesome name="soccer-ball-o" size={16} color="#059669" style={{ marginRight: 12 }} />
                                                <View className="flex-1">
                                                    <Text className="text-gray-800 dark:text-cyber-text font-medium">{title}</Text>
                                                    {!!meta && <Text className="text-gray-500 text-xs mt-0.5">{meta}</Text>}
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </ScrollView>
                    )}
                </View>
            )}
        </View>
    );
}

function SectionHeader({ label }: { label: string }) {
    return (
        <View className="px-4 pt-3 pb-1 bg-gray-50 dark:bg-gray-900">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</Text>
        </View>
    );
}
