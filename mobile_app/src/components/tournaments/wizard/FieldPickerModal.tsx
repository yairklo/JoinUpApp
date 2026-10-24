import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { fieldsApi } from '@/services/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface Props {
    visible: boolean;
    onClose: () => void;
    onPick: (field: { id: string; name: string }) => void;
}

/** Search-and-pick sheet over the existing fields API (same endpoint as the new-game field list). */
export default function FieldPickerModal({ visible, onClose, onPick }: Props) {
    const { t } = useTranslation();
    const [q, setQ] = useState('');
    const dq = useDebouncedValue(q, 300);
    const [rows, setRows] = useState<{ id: string; name: string; location?: string | null }[]>([]);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        fieldsApi
            .getPage({ take: 30, skip: 0, q: dq.trim() || undefined })
            .then((page: any) => {
                if (!cancelled) setRows(page?.items ?? page?.fields ?? (Array.isArray(page) ? page : []));
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [dq, visible]);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView className="flex-1 bg-white dark:bg-cyber-bg" testID="wizard-field-picker">
                <View className="flex-row items-center px-4 py-2">
                    <TextInput
                        testID="wizard-field-search"
                        value={q}
                        onChangeText={setQ}
                        placeholder={t('tournaments.wizard.searchField')}
                        placeholderTextColor="#9ca3af"
                        accessibilityLabel={t('tournaments.wizard.searchField')}
                        className="flex-1 h-12 rounded-xl bg-gray-50 dark:bg-cyber-card px-3 text-gray-900 dark:text-cyber-text"
                    />
                    <TouchableOpacity
                        testID="wizard-field-close"
                        accessibilityRole="button"
                        onPress={onClose}
                        className="min-h-[44px] px-3 justify-center"
                    >
                        <Text className="text-brand-dark dark:text-brand-light font-bold">{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
                {loading ? <ActivityIndicator className="mt-6" color="#059669" /> : null}
                {failed ? <Text className="text-center text-red-600 mt-6">{t('common.error')}</Text> : null}
                <FlatList
                    data={rows}
                    keyExtractor={(f) => f.id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            testID={`wizard-field-${item.id}`}
                            accessibilityRole="button"
                            onPress={() => {
                                onPick({ id: item.id, name: item.name });
                                onClose();
                            }}
                            className="px-4 min-h-[56px] justify-center border-b border-gray-100 dark:border-cyber-border"
                        >
                            <Text className="font-semibold text-gray-900 dark:text-cyber-text" numberOfLines={1}>
                                {item.name}
                            </Text>
                            {item.location ? (
                                <Text className="text-xs text-gray-500 dark:text-cyber-muted" numberOfLines={1}>
                                    {item.location}
                                </Text>
                            ) : null}
                        </TouchableOpacity>
                    )}
                />
            </SafeAreaView>
        </Modal>
    );
}
