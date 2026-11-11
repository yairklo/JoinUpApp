import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, I18nManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import {
    PARKING_NOTE_MAX_LENGTH,
    clearParkingNote,
    clearParkingPin,
    hasParkingPin,
    setParkingNote,
    setParkingPin,
    type ParkingValue,
} from '@joinup/shared/parking';
import AppBaseMap from '@/components/map/AppBaseMap';
import CustomPointMarker from '@/components/map/CustomPointMarker';
import { DEFAULT_MAP_REGION, MapCoordinate, MapMarkerItem, MapRegion } from '@/components/map/types';

const NO_MARKERS: MapMarkerItem<null>[] = [];

interface ParkingPinFieldProps {
    value: ParkingValue;
    onChange: (next: ParkingValue) => void;
    disabled?: boolean;
    /** The field's own pin, when known, so the parking map opens next to it. */
    fieldPosition?: MapCoordinate | null;
    /** Called when the note input gains focus, so the host can scroll it above the keyboard. */
    onNoteFocus?: () => void;
    onNoteBlur?: () => void;
}

/**
 * Optional parking info for a field: a pin placed by tapping the map, and a short note.
 * The two are independent and each is optional -- a note can be given without a pin, and
 * removing the pin leaves the note alone (the note has its own clear button).
 * The pin is only ever set from a map tap -- coordinates are never typed, so there is no
 * numeric keyboard to get wrong and no way to enter a blank or malformed value. All state
 * changes go through @joinup/shared/parking.
 */
export default function ParkingPinField({ value, onChange, disabled = false, fieldPosition, onNoteFocus, onNoteBlur }: ParkingPinFieldProps) {
    const { t } = useTranslation();
    const hasPin = hasParkingPin(value);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [draft, setDraft] = useState<MapCoordinate | null>(null);
    // Text views align to the paragraph start on their own (right for Hebrew in RTL); only TextInput
    // needs an explicit alignment.
    const textAlign = I18nManager.isRTL ? 'right' : 'left';

    const initialRegion = useMemo<MapRegion>(() => {
        if (hasPin) return { latitude: value.lat as number, longitude: value.lng as number, latitudeDelta: 0.005, longitudeDelta: 0.005 };
        if (fieldPosition) return { ...fieldPosition, latitudeDelta: 0.005, longitudeDelta: 0.005 };
        return DEFAULT_MAP_REGION;
    }, [hasPin, value.lat, value.lng, fieldPosition]);

    const openPicker = useCallback(() => {
        setDraft(hasPin ? { latitude: value.lat as number, longitude: value.lng as number } : null);
        setPickerOpen(true);
    }, [hasPin, value.lat, value.lng]);

    const confirm = useCallback(() => {
        if (!draft) return;
        onChange(setParkingPin(value, draft.latitude, draft.longitude));
        setPickerOpen(false);
    }, [draft, onChange, value]);

    const title = t('parking.sectionTitle', 'חניה (אופציונלי)');

    return (
        <View className="mb-3" testID="parking-pin-field">
            <Text className="text-gray-700 font-medium mb-1">{title}</Text>

            {hasPin ? (
                <View className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <View className="flex-row items-center">
                        <View className="w-7 h-7 rounded-full bg-blue-700 items-center justify-center" style={{ marginEnd: 8 }}>
                            <Text className="text-white font-bold text-xs">P</Text>
                        </View>
                        <Text className="flex-1 text-gray-800 font-medium" testID="parking-pin-set">
                            {t('parking.pinSet', 'מיקום החניה סומן במפה')}
                        </Text>
                    </View>
                    <View className="flex-row flex-wrap mt-2" style={{ gap: 8 }}>
                        <TouchableOpacity
                            onPress={openPicker}
                            disabled={disabled}
                            accessibilityRole="button"
                            accessibilityLabel={t('parking.changePinA11y', 'שינוי מיקום החניה במפה')}
                            className="px-4 rounded-full bg-white border border-blue-300 items-center justify-center"
                            style={{ minHeight: 44 }}
                        >
                            <Text className="text-blue-800 font-bold text-sm">{t('parking.changePin', 'שינוי')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            testID="parking-remove"
                            // Removes the pin only: the note below is a separate field and stays.
                            onPress={() => onChange(clearParkingPin(value))}
                            disabled={disabled}
                            accessibilityRole="button"
                            accessibilityLabel={t('parking.removePinA11y', 'הסרת סימון החניה מהמפה')}
                            className="px-4 rounded-full bg-white border border-gray-300 items-center justify-center"
                            style={{ minHeight: 44 }}
                        >
                            <Text className="text-gray-700 font-bold text-sm">{t('parking.removePin', 'הסרת הסימון')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <TouchableOpacity
                    testID="parking-add"
                    onPress={openPicker}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={t('parking.addPin', 'סימון מיקום החניה במפה')}
                    className="flex-row items-center bg-gray-100 rounded-lg px-3"
                    style={{ minHeight: 48 }}
                >
                    <FontAwesome name="map-pin" size={16} color="#1d4ed8" style={{ width: 24 }} />
                    <Text className="flex-1 text-gray-700">{t('parking.addPin', 'סימון מיקום החניה במפה')}</Text>
                </TouchableOpacity>
            )}

            {/* The note is its own optional field: it can be filled with or without a pin. */}
            <Text className="text-gray-700 font-medium mt-3 mb-1">
                {t('parking.noteLabel', 'הערה לחניה (אופציונלי)')}
            </Text>
            <View className="flex-row items-center bg-gray-100 rounded-lg">
                <TextInput
                    testID="parking-note"
                    value={value.note}
                    onChangeText={(text) => onChange(setParkingNote(value, text))}
                    onFocus={onNoteFocus}
                    onBlur={onNoteBlur}
                    editable={!disabled}
                    maxLength={PARKING_NOTE_MAX_LENGTH}
                    placeholder={t('parking.notePlaceholder', 'למשל: חניון חינם מאחורי האולם')}
                    accessibilityLabel={t('parking.noteLabel', 'הערה לחניה (אופציונלי)')}
                    returnKeyType="done"
                    className="flex-1 p-3"
                    style={{ textAlign }}
                />
                {value.note.length > 0 && (
                    <TouchableOpacity
                        testID="parking-note-clear"
                        onPress={() => onChange(clearParkingNote(value))}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityLabel={t('parking.clearNote', 'ניקוי ההערה')}
                        className="items-center justify-center"
                        style={{ minWidth: 44, minHeight: 44 }}
                    >
                        <FontAwesome name="times-circle" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                )}
            </View>
            <Text className="text-gray-400 text-xs mt-1" accessibilityElementsHidden importantForAccessibility="no">
                {value.note.length}/{PARKING_NOTE_MAX_LENGTH}
            </Text>

            <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
                <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
                    <View className="flex-row items-center justify-between px-2 py-1 border-b border-gray-100">
                        <TouchableOpacity
                            onPress={() => setPickerOpen(false)}
                            accessibilityRole="button"
                            className="px-3 justify-center"
                            style={{ minHeight: 44 }}
                        >
                            <Text className="text-gray-500 font-bold">{t('common.cancel', 'ביטול')}</Text>
                        </TouchableOpacity>
                        <Text className="font-bold text-gray-900" accessibilityRole="header">{t('parking.pickTitle', 'מיקום החניה')}</Text>
                        <TouchableOpacity
                            testID="parking-confirm"
                            onPress={confirm}
                            disabled={!draft}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !draft }}
                            className="px-3 justify-center"
                            style={{ minHeight: 44 }}
                        >
                            <Text className={`font-bold ${draft ? 'text-brand' : 'text-gray-300'}`}>{t('parking.pickConfirm', 'אישור')}</Text>
                        </TouchableOpacity>
                    </View>
                    <View className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <Text className="text-gray-600 text-xs text-center">
                            {t('parking.pickHint', 'הקישו על המפה במקום שבו חונים')}
                        </Text>
                    </View>
                    <AppBaseMap
                        variant="fill"
                        className="flex-1"
                        markers={NO_MARKERS}
                        renderMarker={() => null}
                        onMapPress={setDraft}
                        initialRegion={initialRegion}
                        clusteringEnabled={false}
                        overlayChildren={draft ? <CustomPointMarker coordinate={draft} /> : null}
                    />
                </SafeAreaView>
            </Modal>
        </View>
    );
}
