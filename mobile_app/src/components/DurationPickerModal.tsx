import React, { useMemo, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildDurationOptions, formatDurationHM, splitDuration } from '@/utils/gameFormInput';

interface DurationPickerModalProps {
    visible: boolean;
    /** Current duration in hours (the unit the API stores), e.g. 2.5. */
    valueHours: number;
    onSelect: (hours: number) => void;
    onClose: () => void;
}

/** "2:30" read aloud: "2 hours and 30 minutes" / "שעתיים ו-30 דקות", with zero parts left out. */
function spokenDuration(hours: number, t: TFunction): string {
    const { hours: h, minutes: m } = splitDuration(hours);
    const parts: string[] = [];
    if (h === 1) parts.push(t('newGame.durationA11yHour', 'שעה'));
    else if (h === 2) parts.push(t('newGame.durationA11yTwoHours', 'שעתיים'));
    else if (h > 0) parts.push(t('newGame.durationA11yHours', '{{n}} שעות', { n: h }));
    if (m > 0) parts.push(t('newGame.durationA11yMinutes', '{{n}} דקות', { n: m }));
    return parts.join(t('newGame.durationA11yAnd', ' ו-'));
}

/**
 * Bottom sheet for choosing a game's length as hours:minutes ("2:30") in 15-minute steps.
 * Replaces typing decimal hours on a keypad that may not even have a decimal separator.
 */
export default function DurationPickerModal({ visible, valueHours, onSelect, onClose }: DurationPickerModalProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const options = useMemo(() => buildDurationOptions(valueHours), [valueHours]);
    const selectedMinutes = Math.round(valueHours * 60);
    const scrollRef = useRef<ScrollView>(null);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View className="flex-1 justify-end bg-black/50">
                <Pressable className="flex-1" onPress={onClose} accessibilityLabel={t('common.close', 'סגור')} />
                <View
                    className="bg-white dark:bg-cyber-card rounded-t-3xl p-6 h-[55%]"
                    style={{ paddingBottom: insets.bottom + 24 }}
                >
                    <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-lg font-bold text-gray-800 dark:text-cyber-text">
                            {t('newGame.durationPickerTitle', 'משך המשחק')}
                        </Text>
                        <TouchableOpacity
                            testID="duration-picker-done"
                            onPress={onClose}
                            accessibilityRole="button"
                            className="min-h-[44px] min-w-[44px] items-end justify-center"
                        >
                            <Text className="text-brand dark:text-brand-light font-bold">{t('common.confirm', 'אישור')}</Text>
                        </TouchableOpacity>
                    </View>
                    <Text className="text-xs text-gray-500 dark:text-cyber-muted mb-3">
                        {t('newGame.durationPickerHint', 'שעות:דקות')}
                    </Text>
                    <ScrollView ref={scrollRef} className="flex-1">
                        {options.map((hours) => {
                            const totalMinutes = Math.round(hours * 60);
                            const isSelected = totalMinutes === selectedMinutes;
                            const label = formatDurationHM(hours);
                            return (
                                <TouchableOpacity
                                    key={totalMinutes}
                                    testID={`duration-option-${totalMinutes}`}
                                    onPress={() => {
                                        onSelect(hours);
                                        onClose();
                                    }}
                                    // Open with the current value in view instead of at 0:30.
                                    onLayout={isSelected ? (e) => scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 96), animated: false }) : undefined}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    accessibilityLabel={spokenDuration(hours, t)}
                                    className={`min-h-[44px] py-3 px-4 rounded-xl mb-1 flex-row justify-between items-center ${isSelected ? 'bg-brand-mist dark:bg-brand-ink' : ''}`}
                                >
                                    <Text
                                        className={`text-base ${isSelected ? 'text-brand-dark dark:text-brand-light font-bold' : 'text-gray-700 dark:text-cyber-text'}`}
                                        style={{ fontVariant: ['tabular-nums'] }}
                                    >
                                        {label}
                                    </Text>
                                    {isSelected && <FontAwesome name="check" size={16} color="#059669" />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
