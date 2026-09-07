import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { fieldsApi, Field } from '@/services/api/fields';
import { SPORT_MAPPING } from '@/utils/sports';
import FieldLocationPicker from '@/components/admin/FieldLocationPicker';
import FieldImageUpload from '@/components/admin/FieldImageUpload';
import FieldPhotoGallery from '@/components/admin/FieldPhotoGallery';

// Kept explicit and in sync with server/prisma/schema.prisma's SportType enum,
// mirroring next_app's FieldEditorDialog (SPORT_MAPPING's own type is too loose
// to derive a literal union from via `keyof typeof`).
type SportKey = 'SOCCER' | 'BASKETBALL' | 'TENNIS';
const SPORT_KEYS: SportKey[] = ['SOCCER', 'BASKETBALL', 'TENNIS'];

interface FormState {
    name: string;
    location: string;
    city: string;
    neighborhood: string;
    street: string;
    streetNumber: string;
    type: 'open' | 'closed';
    price: string;
    description: string;
    phone: string;
    email: string;
    supportedSports: SportKey[];
    lat: number | null;
    lng: number | null;
}

const EMPTY_FORM: FormState = {
    name: '', location: '', city: '', neighborhood: '', street: '', streetNumber: '',
    type: 'open', price: '', description: '', phone: '', email: '',
    supportedSports: ['SOCCER'], lat: null, lng: null,
};

function fieldToForm(field: Field): FormState {
    return {
        name: field.name || '',
        location: field.location || '',
        city: field.city || '',
        neighborhood: field.neighborhood || '',
        street: field.street || '',
        streetNumber: field.streetNumber || '',
        type: field.type === 'closed' ? 'closed' : 'open',
        price: field.price != null ? String(field.price) : '',
        description: field.description || '',
        phone: field.phone || '',
        email: field.email || '',
        supportedSports: (field.supportedSports?.length ? field.supportedSports : ['SOCCER']) as SportKey[],
        lat: field.lat ?? null,
        lng: field.lng ?? null,
    };
}

function LabeledInput(props: { label: string; value: string; onChangeText: (v: string) => void; keyboardType?: 'default' | 'phone-pad' | 'numeric' | 'email-address'; multiline?: boolean }) {
    return (
        <View className="mb-4">
            <Text className="text-gray-400 text-xs mb-1 text-right">{props.label}</Text>
            <TextInput
                value={props.value}
                onChangeText={props.onChangeText}
                keyboardType={props.keyboardType}
                multiline={props.multiline}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-right text-sm"
                style={props.multiline ? { minHeight: 80, textAlignVertical: 'top' } : undefined}
            />
        </View>
    );
}

interface FieldEditorFormProps {
    field: Field | null; // null = create mode
}

/**
 * Mobile counterpart of next_app's FieldEditorDialog
 * (next_app/src/components/admin/FieldEditorDialog.tsx). Same payload shape
 * and same "save first, then upload images" flow -- photo upload endpoints
 * need an existing field id.
 */
export default function FieldEditorForm({ field }: FieldEditorFormProps) {
    const router = useRouter();
    const { getToken } = useAuth();
    const isEdit = !!field;

    const [form, setForm] = useState<FormState>(field ? fieldToForm(field) : EMPTY_FORM);
    const [savedField, setSavedField] = useState<Field | null>(field);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const activeField = savedField || field;

    const toggleSport = (sport: SportKey) => {
        setForm((f) => {
            const has = f.supportedSports.includes(sport);
            const next = has ? f.supportedSports.filter((s) => s !== sport) : [...f.supportedSports, sport];
            return { ...f, supportedSports: next };
        });
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.location.trim()) {
            setError('שם וכתובת הם שדות חובה');
            return;
        }
        if (form.supportedSports.length === 0) {
            setError('יש לבחור לפחות ענף ספורט אחד');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('נדרש להתחבר מחדש');

            const payload = {
                name: form.name.trim(),
                location: form.location.trim(),
                city: form.city.trim() || undefined,
                neighborhood: form.neighborhood.trim() || undefined,
                street: form.street.trim() || undefined,
                streetNumber: form.streetNumber.trim() || undefined,
                type: form.type,
                price: form.type === 'closed' ? Number(form.price) || 0 : 0,
                description: form.description.trim() || undefined,
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
                supportedSports: form.supportedSports,
                lat: form.lat ?? undefined,
                lng: form.lng ?? undefined,
            };

            if (activeField) {
                const updated = await fieldsApi.update(activeField.id, payload, token);
                setSavedField(updated);
                Alert.alert('נשמר', 'פרטי המגרש עודכנו בהצלחה');
            } else {
                const created = await fieldsApi.create(payload, token);
                setSavedField(created);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'שמירת המגרש נכשלה');
        } finally {
            setSaving(false);
        }
    };

    const addressHint = [form.street, form.streetNumber, form.neighborhood, form.city || form.location]
        .filter(Boolean)
        .join(' ');

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3" accessibilityRole="button">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>
                    {isEdit ? `עריכת מגרש: ${field?.name}` : 'מגרש חדש'}
                </Text>
            </View>

            <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
                {error && (
                    <View className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                        <Text className="text-red-600 text-sm text-center">{error}</Text>
                    </View>
                )}

                <LabeledInput label="שם *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                <LabeledInput label="כתובת *" value={form.location} onChangeText={(v) => setForm({ ...form, location: v })} />
                <LabeledInput label="עיר" value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} />
                <LabeledInput label="שכונה" value={form.neighborhood} onChangeText={(v) => setForm({ ...form, neighborhood: v })} />

                <View className="flex-row gap-3">
                    <View className="flex-1">
                        <LabeledInput label="רחוב" value={form.street} onChangeText={(v) => setForm({ ...form, street: v })} />
                    </View>
                    <View className="w-24">
                        <LabeledInput label="מספר" value={form.streetNumber} onChangeText={(v) => setForm({ ...form, streetNumber: v })} keyboardType="numeric" />
                    </View>
                </View>

                <FieldLocationPicker
                    lat={form.lat}
                    lng={form.lng}
                    addressHint={addressHint || undefined}
                    onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
                />

                <View className="mb-4">
                    <Text className="text-gray-400 text-xs mb-2 text-right">סוג מגרש</Text>
                    <View className="flex-row justify-end gap-2">
                        {([
                            { value: 'open' as const, label: 'פתוח' },
                            { value: 'closed' as const, label: 'סגור / מקורה' },
                        ]).map((opt) => {
                            const selected = form.type === opt.value;
                            return (
                                <TouchableOpacity
                                    key={opt.value}
                                    onPress={() => setForm((f) => ({ ...f, type: opt.value }))}
                                    className={`px-4 py-2 rounded-xl border ${selected ? 'bg-brand border-brand' : 'bg-gray-50 border-gray-200'}`}
                                >
                                    <Text className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-700'}`}>{opt.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {form.type === 'closed' && (
                    <LabeledInput label="מחיר לשעה (₪)" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="numeric" />
                )}

                <View className="mb-4">
                    <Text className="text-gray-400 text-xs mb-2 text-right">ענפי ספורט נתמכים *</Text>
                    <View className="flex-row flex-wrap justify-end gap-2">
                        {SPORT_KEYS.map((sport) => {
                            const selected = form.supportedSports.includes(sport);
                            return (
                                <TouchableOpacity
                                    key={sport}
                                    onPress={() => toggleSport(sport)}
                                    className={`px-3 py-1.5 rounded-full border ${selected ? 'bg-brand-pale border-brand-light' : 'bg-white border-gray-200'}`}
                                >
                                    <Text className={`text-xs font-bold ${selected ? 'text-brand-dark' : 'text-gray-600'}`}>{SPORT_MAPPING[sport]}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <LabeledInput label="תיאור" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />

                <LabeledInput label="טלפון" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
                <LabeledInput label="אימייל" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" />

                <TouchableOpacity
                    onPress={handleSave}
                    disabled={saving}
                    className={`py-3 rounded-xl items-center mb-4 ${saving ? 'bg-brand-soft' : 'bg-brand'}`}
                >
                    {saving ? <ActivityIndicator color="white" /> : (
                        <Text className="text-white font-bold">{isEdit || savedField ? 'שמור שינויים' : 'צור מגרש'}</Text>
                    )}
                </TouchableOpacity>

                <View className="h-px bg-gray-100 mb-4" />

                {activeField ? (
                    <>
                        <FieldImageUpload
                            fieldId={activeField.id}
                            image={activeField.image ?? null}
                            onChange={(image) => setSavedField((f) => (f ? { ...f, image } : f))}
                        />
                        <FieldPhotoGallery
                            fieldId={activeField.id}
                            photos={activeField.photos || []}
                            onChange={(photos) => setSavedField((f) => (f ? { ...f, photos } : f))}
                        />
                    </>
                ) : (
                    <View className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                        <Text className="text-blue-700 text-sm text-center">יש לשמור את המגרש כדי להוסיף תמונות</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
