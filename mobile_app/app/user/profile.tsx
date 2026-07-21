import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, Modal, FlatList } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter, Stack } from 'expo-router';
import { usersApi, UserProfile } from '../../src/services/api/users';
import { API_BASE } from '../../src/services/api/client';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SPORT_MAPPING } from '@/utils/sports';

const POSITION_OPTIONS: Record<string, string[]> = {
    SOCCER: ['שוער', 'בלם', 'מגן', 'קשר', 'חלוץ'],
    BASKETBALL: ['פוינט גארד', 'שוטינג גארד', 'סמול פורוורד', 'פאואר פורוורד', 'סנטר'],
    TENNIS: ['שחקן בסיס', 'שחקן רשת'],
};

function calculateAge(birthDate?: string | null) {
    if (!birthDate) return null;
    const diff = Date.now() - new Date(birthDate).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

type SportEntry = { sportId: string; position: string };

export default function ProfileScreen() {
    const { t } = useTranslation();
    const { user } = useUser();
    const { signOut, getToken } = useAuth();
    const router = useRouter();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form state
    const [form, setForm] = useState({ city: '', phone: '', sportsData: [] as SportEntry[] });
    // Per-sport free-text input state (keyed by sportId)
    const [customTexts, setCustomTexts] = useState<Record<string, string>>({});

    // Sport picker modal
    const [sportModalVisible, setSportModalVisible] = useState(false);
    const [availableSports, setAvailableSports] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        if (!user?.id) return;
        loadProfile();
        loadSports();
    }, [user?.id]);

    const loadProfile = async () => {
        try {
            const token = await getToken();
            if (token && user) {
                const data = await usersApi.getProfile(user.id, token);
                setProfile(data);

                setForm({
                    city: data?.city || '',
                    phone: data?.phone || '',
                    sportsData: (data?.sports || []).map(s => ({ sportId: s.id, position: s.position || '' })),
                });
            }
        } catch (err) {
            console.error("Failed to load profile", err);
        } finally {
            setLoading(false);
        }
    };

    const loadSports = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/users/sports`);
            if (res.ok) setAvailableSports(await res.json());
        } catch (err) {
            console.error("Failed to load sports", err);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            router.replace('/sign-in');
        } catch (err) {
            console.error("Sign out failed", err);
        }
    };

    const handleSave = async () => {
        if (!user?.id) return;
        setSaving(true);
        try {
            const token = await getToken();
            if (token) {
                const updated = await usersApi.updateProfile(user.id, form, token);
                setProfile(updated);
                setIsEditing(false);
            }
        } catch (err) {
            Alert.alert(t("profile.error", "שגיאה"), t("profile.updateFailed", "עדכון הפרופיל נכשל"));
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setForm({
            city: profile?.city || '',
            phone: profile?.phone || '',
            sportsData: (profile?.sports || []).map(s => ({ sportId: s.id, position: s.position || '' })),
        });
    };

    const addSport = (sportId: string) => {
        if (form.sportsData.some(s => s.sportId === sportId)) return;
        setForm(prev => ({ ...prev, sportsData: [...prev.sportsData, { sportId, position: '' }] }));
        setSportModalVisible(false);
    };

    const removeSport = (sportId: string) => {
        setForm(prev => ({ ...prev, sportsData: prev.sportsData.filter(s => s.sportId !== sportId) }));
    };

    // Toggle a preset position on/off in the comma-separated positions string
    const togglePosition = (sportId: string, pos: string) => {
        setForm(prev => ({
            ...prev,
            sportsData: prev.sportsData.map(s => {
                if (s.sportId !== sportId) return s;
                const current = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                const exists = current.includes(pos);
                const updated = exists ? current.filter(p => p !== pos) : [...current, pos];
                return { ...s, position: updated.join(', ') };
            })
        }));
    };

    const addCustomPosition = (sportId: string, customPos: string) => {
        if (!customPos.trim()) return;
        setForm(prev => ({
            ...prev,
            sportsData: prev.sportsData.map(s => {
                if (s.sportId !== sportId) return s;
                const current = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                if (current.includes(customPos.trim())) return s;
                return { ...s, position: [...current, customPos.trim()].join(', ') };
            })
        }));
    };

    const removePositionTag = (sportId: string, pos: string) => {
        setForm(prev => ({
            ...prev,
            sportsData: prev.sportsData.map(s => {
                if (s.sportId !== sportId) return s;
                const current = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                const updated = current.filter(p => p !== pos);
                return { ...s, position: updated.join(', ') };
            })
        }));
    };

    const unaddedSports = availableSports.filter(
        sport => !form.sportsData.some(s => s.sportId === sport.id)
    );

    if (loading) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
                <ActivityIndicator size="large" color="#059669" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'bottom']}>
            <Stack.Screen options={{ 
                headerShown: false
            }} />
            
            {/* Custom Header Bar */}
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-150 shadow-sm">
                <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
                    <FontAwesome name="chevron-right" size={18} color="#374151" />
                </TouchableOpacity>
                <Text className="flex-1 text-center font-extrabold text-lg text-gray-900">
                    {t('profile.personalDetails', 'הפרופיל שלי')}
                </Text>
                <TouchableOpacity
                    onPress={() => router.push('/profile/settings')}
                    className="w-10 h-10 items-center justify-center"
                >
                    <FontAwesome name="cog" size={20} color="#374151" />
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40, paddingTop: 10 }}>
                {/* Header details */}
                <View className="items-center py-6 bg-white rounded-2xl mx-4 shadow-sm mb-4 border border-gray-100">
                    <Image
                        source={{ uri: user?.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || '')}` }}
                        className="w-24 h-24 rounded-full bg-gray-200 mb-3 border-2 border-brand-mist"
                    />
                    <Text className="text-xl font-black text-gray-900">{user?.fullName || 'User'}</Text>
                    <Text className="text-gray-400 text-sm mt-1">{user?.primaryEmailAddress?.emailAddress}</Text>
                </View>

                {/* Personal Details Form */}
                <View className="bg-white p-6 rounded-2xl mx-4 shadow-sm mb-4 border border-gray-100">
                    <View className="flex-row justify-between items-center mb-4 border-b border-gray-100 pb-2">
                        <Text className="text-lg font-black text-gray-900">{t('profile.personalDetails', 'פרטים אישיים')}</Text>
                        {!isEditing && (
                            <TouchableOpacity
                                onPress={() => setIsEditing(true)}
                                className="flex-row items-center bg-brand-mist px-3 py-1.5 rounded-lg border border-brand-pale"
                            >
                                <FontAwesome name="edit" size={14} color="#059669" style={{ marginRight: 5 }} />
                                <Text className="text-brand font-bold text-sm">{t('profile.editProfile', 'ערוך')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* City */}
                    <View className="mb-4">
                        <Text className="text-gray-400 text-xs mb-1 text-right">{t('profile.city', 'עיר')}</Text>
                        {isEditing ? (
                            <TextInput
                                value={form.city}
                                onChangeText={(val) => setForm(prev => ({ ...prev, city: val }))}
                                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-right text-sm"
                                placeholder="למשל: תל אביב, חיפה..."
                                placeholderTextColor="#9ca3af"
                            />
                        ) : (
                            <Text className="text-gray-800 font-bold text-base text-right">{profile?.city || t('profile.unknownCity', 'לא צוין')}</Text>
                        )}
                    </View>

                    {/* Phone */}
                    <View className="mb-4">
                        <Text className="text-gray-400 text-xs mb-1 text-right">{t('profile.phone', 'טלפון')}</Text>
                        {isEditing ? (
                            <TextInput
                                value={form.phone}
                                onChangeText={(val) => setForm(prev => ({ ...prev, phone: val }))}
                                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-right text-sm"
                                placeholder="למשל: 0501234567"
                                keyboardType="phone-pad"
                                placeholderTextColor="#9ca3af"
                            />
                        ) : (
                            <Text className="text-gray-800 font-bold text-base text-right">{profile?.phone || t('profile.unknownPhone', 'לא צוין')}</Text>
                        )}
                    </View>

                    {/* Email */}
                    <View className="mb-4">
                        <Text className="text-gray-400 text-xs mb-1 text-right">{t('profile.email', 'אימייל')}</Text>
                        <Text className="text-gray-800 font-bold text-base text-right">
                            {profile?.email || user?.primaryEmailAddress?.emailAddress || t('profile.unknownEmail', 'לא צוין')}
                        </Text>
                    </View>

                    {/* Age */}
                    <View className="mb-2">
                        <Text className="text-gray-400 text-xs mb-1 text-right">{t('profile.age', 'גיל')}</Text>
                        <Text className="text-gray-800 font-bold text-base text-right">
                            {calculateAge(profile?.birthDate) || t('profile.unknownAge', 'לא ידוע')}
                        </Text>
                    </View>

                    {isEditing && (
                        <View className="flex-row gap-3 mt-4">
                            <TouchableOpacity
                                onPress={handleCancelEdit}
                                className="flex-1 py-3 rounded-xl border border-gray-200 items-center bg-gray-50"
                            >
                                <Text className="text-red-600 font-bold">ביטול</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={saving}
                                className={`flex-1 py-3 rounded-xl items-center ${saving ? 'bg-brand-soft' : 'bg-brand'}`}
                            >
                                {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">שמור</Text>}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Sports & Positions */}
                <View className="bg-white p-6 rounded-2xl mx-4 shadow-sm mb-4 border border-gray-100">
                    <View className="flex-row justify-between items-center mb-4 border-b border-gray-100 pb-2">
                        <Text className="text-lg font-black text-gray-900">ספורט ועמדות</Text>
                        {isEditing && (
                            <TouchableOpacity
                                onPress={() => setSportModalVisible(true)}
                                className="flex-row items-center bg-brand px-3 py-1.5 rounded-lg"
                                disabled={unaddedSports.length === 0}
                            >
                                <FontAwesome name="plus" size={12} color="white" style={{ marginRight: 5 }} />
                                <Text className="text-white font-bold text-sm">הוסף</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {(isEditing ? form.sportsData : profile?.sports?.map(s => ({ sportId: s.id, position: s.position || '' })) || []).length === 0 ? (
                        <View className="items-center py-4">
                            <FontAwesome name="futbol-o" size={32} color="#d1d5db" />
                            <Text className="text-gray-400 mt-2 text-center text-sm">
                                {isEditing ? 'לחץ "הוסף" כדי להוסיף ענף ספורט' : 'לא הוגדרו ענפי ספורט'}
                            </Text>
                        </View>
                    ) : isEditing ? (
                        <View>
                            {form.sportsData.map((s) => {
                                const sportName = SPORT_MAPPING[s.sportId] || s.sportId;
                                const positions = POSITION_OPTIONS[s.sportId] || [];
                                return (
                                    <View key={s.sportId} className="mb-4 bg-gray-50 rounded-xl p-3 border border-gray-100">
                                        <View className="flex-row justify-between items-center mb-2">
                                            <View className="flex-row items-center">
                                                <View className="w-8 h-8 bg-brand-pale rounded-full items-center justify-center mr-2">
                                                    <FontAwesome name="futbol-o" size={14} color="#059669" />
                                                </View>
                                                <Text className="font-bold text-gray-800">{sportName}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => removeSport(s.sportId)} className="p-1">
                                                <FontAwesome name="times-circle" size={20} color="#ef4444" />
                                            </TouchableOpacity>
                                        </View>
                                        
                                        {/* Selected positions */}
                                        {(() => {
                                            const selectedPositions = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                                            if (selectedPositions.length === 0) return null;
                                            return (
                                                <View className="flex-row flex-wrap mb-2">
                                                    {selectedPositions.map(pos => (
                                                        <View key={pos} className="flex-row items-center bg-brand px-2.5 py-1 rounded-full mr-1.5 mb-1.5">
                                                            <Text className="text-white text-xs font-medium mr-1">{pos}</Text>
                                                            <TouchableOpacity onPress={() => removePositionTag(s.sportId, pos)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                                                                <FontAwesome name="times" size={10} color="rgba(255,255,255,0.8)" />
                                                            </TouchableOpacity>
                                                        </View>
                                                    ))}
                                                </View>
                                            );
                                        })()}

                                        {/* Preset positions */}
                                        {positions.length > 0 && (
                                            <View className="mb-2">
                                                <Text className="text-xs text-gray-500 mb-2">בחר עמדות (ניתן לבחור מספר):</Text>
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                    <View className="flex-row">
                                                        {positions.map(pos => {
                                                            const selected = s.position.split(',').map(p => p.trim()).includes(pos);
                                                            return (
                                                                <TouchableOpacity
                                                                    key={pos}
                                                                    onPress={() => togglePosition(s.sportId, pos)}
                                                                    className={`px-3 py-1.5 rounded-full mr-2 border ${selected ? 'bg-brand-pale border-brand-light' : 'bg-white border-gray-200'}`}
                                                                >
                                                                    <Text className={`text-xs font-medium ${selected ? 'text-brand-dark' : 'text-gray-600'}`}>{pos}</Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                </ScrollView>
                                            </View>
                                        )}

                                        {/* Free text custom position */}
                                        <View className="mt-1">
                                            <Text className="text-xs text-gray-500 mb-1">הוסף עמדה חופשית:</Text>
                                            <View className="flex-row">
                                                <TextInput
                                                    value={customTexts[s.sportId] || ''}
                                                    onChangeText={(v) => setCustomTexts(prev => ({ ...prev, [s.sportId]: v }))}
                                                    placeholder="למשל: קשר פוגעני, חלוץ שני..."
                                                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 mr-2 text-right"
                                                    placeholderTextColor="#9ca3af"
                                                    onSubmitEditing={() => {
                                                        addCustomPosition(s.sportId, customTexts[s.sportId] || '');
                                                        setCustomTexts(prev => ({ ...prev, [s.sportId]: '' }));
                                                    }}
                                                    returnKeyType="done"
                                                />
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        addCustomPosition(s.sportId, customTexts[s.sportId] || '');
                                                        setCustomTexts(prev => ({ ...prev, [s.sportId]: '' }));
                                                    }}
                                                    disabled={!(customTexts[s.sportId] || '').trim()}
                                                    className={`px-3 rounded-lg items-center justify-center ${(customTexts[s.sportId] || '').trim() ? 'bg-brand' : 'bg-gray-200'}`}
                                                >
                                                    <FontAwesome name="plus" size={14} color={(customTexts[s.sportId] || '').trim() ? 'white' : '#9ca3af'} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <View>
                            {profile?.sports?.map(s => {
                                const hebrewName = SPORT_MAPPING[s.name] || SPORT_MAPPING[s.id] || s.name;
                                const positions = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                                return (
                                    <View key={s.id} className="mb-3 last:mb-0">
                                        <View className="flex-row items-center mb-1.5">
                                            <View className="w-7 h-7 bg-brand-pale rounded-full items-center justify-center mr-2">
                                                <FontAwesome name="futbol-o" size={12} color="#059669" />
                                            </View>
                                            <Text className="font-bold text-gray-800">{hebrewName}</Text>
                                        </View>
                                        {positions.length > 0 ? (
                                            <View className="flex-row flex-wrap mr-9">
                                                {positions.map(pos => (
                                                    <View key={pos} className="bg-brand-mist px-2.5 py-1 rounded-full border border-brand-pale mr-1.5 mb-1">
                                                        <Text className="text-brand-dark text-xs font-medium">{pos}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : (
                                            <Text className="text-gray-400 text-xs mr-9">כללי</Text>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Sign Out */}
                <TouchableOpacity
                    onPress={handleSignOut}
                    className="bg-red-50 p-4 rounded-xl items-center border border-red-100 mx-4 mb-8 shadow-sm"
                >
                    <Text className="text-red-600 font-bold text-lg">{t("profile.signOut", "התנתק")}</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Sport Picker Modal */}
            <Modal
                animationType="slide"
                transparent
                visible={sportModalVisible}
                onRequestClose={() => setSportModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6" style={{ maxHeight: '60%' }}>
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-xl font-bold text-gray-800">בחר ענף ספורט</Text>
                            <TouchableOpacity onPress={() => setSportModalVisible(false)}>
                                <FontAwesome name="times" size={22} color="#6b7280" />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={unaddedSports}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => addSport(item.id)}
                                    className="flex-row items-center py-4 border-b border-gray-100"
                                >
                                    <View className="w-10 h-10 bg-brand-mist rounded-full items-center justify-center mr-3">
                                        <FontAwesome name="futbol-o" size={18} color="#059669" />
                                    </View>
                                    <Text className="text-gray-800 font-semibold text-base">
                                        {SPORT_MAPPING[item.id] || SPORT_MAPPING[item.name] || item.name}
                                    </Text>
                                    <FontAwesome name="chevron-left" size={12} color="#d1d5db" style={{ marginRight: 'auto' }} />
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <View className="items-center py-8">
                                    <Text className="text-gray-400">כבר הוספת את כל ענפי הספורט הזמינים</Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
