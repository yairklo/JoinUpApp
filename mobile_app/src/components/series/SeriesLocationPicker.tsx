import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fieldsApi } from '@/services/api';

export interface SeriesFieldOption {
    id: string;
    name: string;
    location?: string | null;
}

interface SeriesLocationPickerProps {
    selectedField: SeriesFieldOption | null;
    onSelectField: (field: SeriesFieldOption | null) => void;
    newFieldMode: boolean;
    onNewFieldModeChange: (on: boolean) => void;
    newFieldName: string;
    onNewFieldNameChange: (v: string) => void;
    newFieldLocation: string;
    onNewFieldLocationChange: (v: string) => void;
}

/** Venue picker for a group: pick an existing field by city, or type a free-form new one (same as web / game edit). */
export default function SeriesLocationPicker({
    selectedField, onSelectField, newFieldMode, onNewFieldModeChange,
    newFieldName, onNewFieldNameChange, newFieldLocation, onNewFieldLocationChange,
}: SeriesLocationPickerProps) {
    const { t } = useTranslation();
    const [cities, setCities] = useState<string[]>([]);
    const [selectedCity, setSelectedCity] = useState<string | null>(null);
    const [fields, setFields] = useState<SeriesFieldOption[]>([]);

    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const list = await fieldsApi.getCities();
                if (ignore) return;
                setCities(list || []);
                // Open on the current field's city so the selected venue is actually in the list.
                let startCity: string | null = null;
                if (selectedField?.id) {
                    try {
                        const current = await fieldsApi.getById(selectedField.id);
                        if (current?.city && list?.includes(current.city)) startCity = current.city;
                    } catch {
                        // fall back to the first city
                    }
                }
                if (ignore) return;
                if (list?.length) setSelectedCity((prev) => prev || startCity || list[0]);
            } catch (e) {
                console.error('Failed to load cities', e);
            }
        })();
        return () => { ignore = true; };
        // Runs once on mount; the initial selectedField only seeds the starting city.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!selectedCity) return;
        let ignore = false;
        (async () => {
            try {
                const page = await fieldsApi.getPage({ take: 200, skip: 0, city: selectedCity });
                if (ignore) return;
                const list: SeriesFieldOption[] = [...page.items];
                if (selectedField?.id && !list.some((f) => f.id === selectedField.id)) list.unshift(selectedField);
                setFields(list);
            } catch (e) {
                console.error('Failed to load fields for city', e);
            }
        })();
        return () => { ignore = true; };
        // selectedField intentionally omitted: only refetch when the city changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCity]);

    return (
        <View className="mb-4">
            <View className="flex-row justify-between items-center mb-2">
                <Text className="text-gray-700 font-bold">{t('series.location', 'מיקום / מגרש')}</Text>
                <TouchableOpacity
                    onPress={() => onNewFieldModeChange(!newFieldMode)}
                    className="bg-brand-mist px-3 py-1 rounded-full border border-brand-pale"
                >
                    <Text className="text-brand-dark font-bold text-xs">
                        {newFieldMode ? t('series.pickFromList', 'בחר מהרשימה') : t('series.addNewField', 'הוסף מגרש חדש')}
                    </Text>
                </TouchableOpacity>
            </View>

            {newFieldMode ? (
                <View className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <TextInput
                        value={newFieldName}
                        onChangeText={onNewFieldNameChange}
                        placeholder={t('series.newFieldName', 'שם המגרש')}
                        className="bg-white p-3 rounded-lg mb-2 border border-gray-200"
                    />
                    <TextInput
                        value={newFieldLocation}
                        onChangeText={onNewFieldLocationChange}
                        placeholder={t('series.newFieldLocation', 'מיקום / כתובת')}
                        className="bg-white p-3 rounded-lg border border-gray-200"
                    />
                </View>
            ) : (
                <>
                    {selectedField && (
                        <View className="bg-green-50 p-3 rounded-lg mb-3 border border-green-200">
                            <Text className="text-green-800 font-bold">{selectedField.name}</Text>
                            {!!selectedField.location && <Text className="text-green-700 text-xs mt-1">{selectedField.location}</Text>}
                        </View>
                    )}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                        {cities.map((city) => (
                            <TouchableOpacity
                                key={city}
                                onPress={() => setSelectedCity(city)}
                                className={`mr-2 px-4 py-2 rounded-full border ${selectedCity === city ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
                            >
                                <Text className={selectedCity === city ? 'text-white' : 'text-gray-700'}>{city}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {fields.map((field) => (
                            <TouchableOpacity
                                key={field.id}
                                onPress={() => onSelectField(field)}
                                className={`mr-3 p-3 rounded-xl border w-40 ${selectedField?.id === field.id ? 'bg-brand-mist border-brand' : 'bg-white border-gray-200'}`}
                            >
                                <Text className={`font-bold ${selectedField?.id === field.id ? 'text-brand-dark' : 'text-gray-800'}`} numberOfLines={1}>
                                    {field.name}
                                </Text>
                                <Text className="text-xs text-gray-500" numberOfLines={1}>{field.location}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </>
            )}
        </View>
    );
}
