import React, { useEffect, useState } from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
    visible: boolean;
    initial?: number | null;
    name: string;
    error?: string | null;
    onCancel: () => void;
    /** `null` clears the number. */
    onSave: (n: number | null) => void;
}

/** Numeric jersey dialog 0-99 (spec 4.3); works on both platforms (no Alert.prompt). */
export default function JerseyDialog({ visible, initial, name, error, onCancel, onSave }: Props) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    useEffect(() => {
        if (visible) setDraft(initial != null ? String(initial) : '');
    }, [visible, initial]);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View className="flex-1 items-center justify-center bg-black/50 px-8">
                <View testID="team-jersey-dialog" className="w-full rounded-2xl bg-white dark:bg-cyber-card p-4">
                    <Text className="text-base font-bold text-gray-900 dark:text-cyber-text">{t('tournaments.team.jersey')}</Text>
                    <Text className="text-xs text-gray-500 dark:text-cyber-muted mb-3">{name}</Text>
                    <TextInput
                        testID="team-jersey-input"
                        autoFocus
                        keyboardType="number-pad"
                        maxLength={2}
                        value={draft}
                        onChangeText={(v) => setDraft(v.replace(/[^0-9]/g, ''))}
                        accessibilityLabel={t('tournaments.team.jersey')}
                        className="h-12 rounded-xl px-3 bg-gray-50 dark:bg-cyber-bg text-gray-900 dark:text-cyber-text border border-gray-200 dark:border-cyber-border text-center text-lg"
                    />
                    {error ? (
                        <Text accessibilityRole="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {error}
                        </Text>
                    ) : null}
                    <View className="flex-row justify-end mt-4" style={{ gap: 8 }}>
                        <TouchableOpacity testID="team-jersey-cancel" accessibilityRole="button" onPress={onCancel} className="min-h-[44px] px-4 justify-center">
                            <Text className="text-gray-700 dark:text-cyber-text font-semibold">{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            testID="team-jersey-save"
                            accessibilityRole="button"
                            onPress={() => onSave(draft === '' ? null : Math.min(99, parseInt(draft, 10)))}
                            className="min-h-[44px] px-5 rounded-xl bg-brand items-center justify-center"
                        >
                            <Text className="text-white font-bold">{t('common.save')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
