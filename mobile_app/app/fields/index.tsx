import { View, Text, TouchableOpacity, TextInput, Image, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fieldsApi, Field } from '@/services/api';
import LoadingMotif from '@/components/loading/LoadingMotif';
import FavoriteButton from '@/components/FavoriteButton';
import FilterPill from '@/components/FilterPill';
import { SPORT_KEYS, SPORT_MAPPING, SPORT_EMOJI } from '@/utils/sports';

const PAGE_SIZE = 24;

type SportFilter = string; // 'ALL' or one of SPORT_KEYS

export default function FieldsDirectoryScreen({ isTab = false }: { isTab?: boolean }) {
    const { t } = useTranslation();
    const router = useRouter();
    const [fields, setFields] = useState<Field[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [sportFilter, setSportFilter] = useState<SportFilter>('ALL');

    const filters = useMemo(() => [
        { label: t('sports.all', 'הכל'), value: 'ALL' as SportFilter },
        ...SPORT_KEYS.map((key) => ({
            label: t('sports.' + key.toLowerCase(), SPORT_MAPPING[key]),
            value: key as SportFilter,
        })),
    ], [t]);

    // Bumped on every fetch-from-scratch so a slow, superseded search request
    // can't clobber state after a newer one already landed.
    const requestSeq = useRef(0);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
        return () => clearTimeout(timer);
    }, [query]);

    const fetchPage = useCallback(async (skip: number, append: boolean) => {
        const seq = ++requestSeq.current;
        if (append) setLoadingMore(true); else setLoading(true);
        try {
            // Paginated + server-searched — avoids fetching and filtering the
            // entire (900+ row) fields table on every screen open/keystroke.
            const page = await fieldsApi.getPage({ take: PAGE_SIZE, skip, q: debouncedQuery, sport: sportFilter });
            if (seq !== requestSeq.current) return;
            setFields((prev) => (append ? [...prev, ...page.items] : page.items));
            setHasMore(page.hasMore);
        } catch (e) {
            console.error('Failed to load fields', e);
        } finally {
            if (seq === requestSeq.current) {
                if (append) setLoadingMore(false); else setLoading(false);
            }
        }
    }, [debouncedQuery, sportFilter]);

    useEffect(() => {
        fetchPage(0, false);
    }, [fetchPage]);

    const loadMore = () => {
        if (loading || loadingMore || !hasMore) return;
        fetchPage(fields.length, true);
    };

    const renderField = ({ item: field }: { item: Field }) => (
        <TouchableOpacity
            onPress={() => router.push(`/field/${field.id}`)}
            className="flex-row items-center px-4 py-3 border-b border-gray-100 bg-white"
            accessibilityRole="button"
        >
            <View style={{ position: 'relative' }}>
                {field.image ? (
                    <Image source={{ uri: field.image }} className="w-14 h-14 rounded-xl mr-3 bg-gray-100" />
                ) : (
                    <View className="w-14 h-14 rounded-xl mr-3 bg-brand-mist items-center justify-center">
                        <FontAwesome name="map-marker" size={20} color="#059669" />
                    </View>
                )}
                <View style={{ position: 'absolute', top: -4, right: -4 }}>
                    <FavoriteButton fieldId={field.id} size={14} />
                </View>
            </View>
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
    );

    const Container = isTab ? View : SafeAreaView;
    const containerProps = isTab ? { className: "flex-1 bg-white" } : { edges: ['top'] as const, className: "flex-1 bg-white" };

    return (
        <Container {...containerProps}>
            {!isTab && (
                <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3" accessibilityRole="button">
                        <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>
                        {t('field.directory', 'מגרשים')}
                    </Text>
                </View>
            )}

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

            <View className="px-4 pb-3 border-b border-gray-100">
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 4 }}
                >
                    {filters.map((f) => {
                        const emoji = f.value !== 'ALL' ? SPORT_EMOJI[f.value] : undefined;
                        return (
                            <FilterPill
                                key={f.value}
                                label={emoji ? `${emoji} ${f.label}` : f.label}
                                selected={sportFilter === f.value}
                                onPress={() => setSportFilter(f.value)}
                                size="sm"
                            />
                        );
                    })}
                </ScrollView>
            </View>

            {loading ? (
                <View className="flex-1 justify-center items-center">
                    <LoadingMotif id="pin-drop" label={t('field.loadingFields', 'טוען מגרשים…')} />
                </View>
            ) : fields.length === 0 ? (
                <View className="flex-1 justify-center items-center px-8">
                    <FontAwesome name="map-marker" size={32} color="#d1d5db" />
                    <Text className="text-gray-500 mt-3 text-center">
                        {t('field.emptyDirectory', 'לא נמצאו מגרשים')}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={fields}
                    keyExtractor={(field) => field.id}
                    renderItem={renderField}
                    keyboardShouldPersistTaps="handled"
                    onEndReachedThreshold={0.4}
                    onEndReached={loadMore}
                    contentContainerStyle={{ paddingBottom: isTab ? 90 : 20 }}
                    ListFooterComponent={loadingMore ? (
                        <View className="py-4 items-center">
                            <ActivityIndicator />
                        </View>
                    ) : null}
                />
            )}
        </Container>
    );
}
