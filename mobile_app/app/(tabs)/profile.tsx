import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, Modal, FlatList } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { usersApi, UserProfile } from '../../src/services/api/users';
import { apiClient, API_BASE } from '../../src/services/api/client';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const SPORT_MAPPING: Record<string, string> = {
    BASKETBALL: 'כדורסל',
    SOCCER: 'כדורגל',
    TENNIS: 'טניס',
    VOLLEYBALL: 'כדורעף',
};

const POSITION_OPTIONS: Record<string, string[]> = {
    SOCCER: ['שוער', 'בלם', 'מגן', 'קשר', 'חלוץ'],
    BASKETBALL: ['פוינט גארד', 'שוטינג גארד', 'סמול פורוורד', 'פאואר פורוורד', 'סנטר'],
    TENNIS: ['שחקן בסיס', 'שחקן רשת'],
    VOLLEYBALL: ['פאסר', 'חוסם', 'לייבירו', 'תוקף'],
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
            if (token) {
                const data = await usersApi.getProfile(user!.id, token);
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

    const updatePosition = (sportId: string, position: string) => {
        setForm(prev => ({
            ...prev,
            sportsData: prev.sportsData.map(s => s.sportId === sportId ? { ...s, position } : s),
        }));
    };

    if (!user || loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    const age = calculateAge(profile?.birthDate);
    const unaddedSports = availableSports.filter(s => !form.sportsData.some(fs => fs.sportId === s.id));

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-gray-50">
            <ScrollView className="flex-1">
                {/* Header / Avatar */}
                <View className="items-center bg-white p-6 mb-4 shadow-sm">
                    <Image
                        source={{ uri: profile?.imageUrl || user.imageUrl || undefined }}
                        className="w-24 h-24 rounded-full mb-3"
                    />
                    <Text className="text-2xl font-bold text-gray-800">{profile?.name || user.fullName}</Text>
                    <Text className="text-gray-500 mt-1">{profile?.city || t("profile.unknownCity", "עיר לא ידועה")}</Text>
                </View>

                {/* Personal Details */}
                <View className="bg-white p-6 rounded-2xl mx-4 shadow-sm mb-4">
                    <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">
                        {t("profile.personalDetails", "פרטים אישיים")}
                    </Text>

                    {/* Email */}
                    <View className="flex-row justify-between items-center mb-3">
                        <Text className="text-gray-500 font-medium">{t("profile.email", "אימייל")}</Text>
                        <Text className="text-gray-800">{profile?.email || user.primaryEmailAddress?.emailAddress || '-'}</Text>
                    </View>

                    {/* Phone */}
                    <View className="flex-row justify-between items-center mb-3">
                        <Text className="text-gray-500 font-medium">{t("profile.phone", "טלפון")}</Text>
                        {isEditing ? (
                            <TextInput
                                value={form.phone}
                                onChangeText={(v) => setForm(p => ({ ...p, phone: v }))}
                                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 flex-1 mr-4 text-left"
                                keyboardType="phone-pad"
                                placeholder="050-0000000"
                            />
                        ) : (
                            <Text className="text-gray-800">{profile?.phone || '-'}</Text>
                        )}
                    </View>

                    {/* City */}
                    <View className="flex-row justify-between items-center mb-3">
                        <Text className="text-gray-500 font-medium">{t("profile.city", "עיר")}</Text>
                        {isEditing ? (
                            <TextInput
                                value={form.city}
                                onChangeText={(v) => setForm(p => ({ ...p, city: v }))}
                                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 flex-1 mr-4 text-left"
                                placeholder="תל אביב"
                            />
                        ) : (
                            <Text className="text-gray-800">{profile?.city || '-'}</Text>
                        )}
                    </View>

                    {/* Age */}
                    <View className="flex-row justify-between mb-4">
                        <Text className="text-gray-500 font-medium">{t("profile.age", "גיל")}</Text>
                        <Text className="text-gray-800">{age ? String(age) : '-'}</Text>
                    </View>

                    {/* Edit / Save buttons */}
                    {!isEditing ? (
                        <TouchableOpacity
                            onPress={() => setIsEditing(true)}
                            className="mt-2 py-3 rounded-xl items-center bg-gray-100 border border-gray-200"
                        >
                            <Text className="text-gray-700 font-bold">{t("profile.editProfile", "ערוך פרופיל")}</Text>
                        </TouchableOpacity>
                    ) : (
                        <View className="mt-2 flex-row gap-2">
                            <TouchableOpacity
                                onPress={handleCancelEdit}
                                className="flex-1 py-3 rounded-xl items-center bg-red-50 border border-red-100"
                            >
                                <Text className="text-red-600 font-bold">ביטול</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={saving}
                                className={`flex-1 py-3 rounded-xl items-center ${saving ? 'bg-blue-300' : 'bg-blue-600'}`}
                            >
                                {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">שמור</Text>}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Sports & Positions */}
                <View className="bg-white p-6 rounded-2xl mx-4 shadow-sm mb-4">
                    <View className="flex-row justify-between items-center mb-4 border-b border-gray-100 pb-2">
                        <Text className="text-lg font-bold text-gray-800">ספורט ועמדות</Text>
                        {isEditing && (
                            <TouchableOpacity
                                onPress={() => setSportModalVisible(true)}
                                className="flex-row items-center bg-blue-600 px-3 py-1.5 rounded-lg"
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
                            <Text className="text-gray-400 mt-2 text-center">
                                {isEditing ? 'לחץ "הוסף" כדי להוסיף ענף ספורט' : 'לא הוגדרו ענפי ספורט'}
                            </Text>
                        </View>
                    ) : isEditing ? (
                        // Edit mode: show each sport with position picker + remove button
                        <View>
                            {form.sportsData.map((s) => {
                                const sportName = SPORT_MAPPING[s.sportId] || s.sportId;
                                const positions = POSITION_OPTIONS[s.sportId] || [];
                                return (
                                    <View key={s.sportId} className="mb-4 bg-gray-50 rounded-xl p-3 border border-gray-100">
                                        <View className="flex-row justify-between items-center mb-2">
                                            <View className="flex-row items-center">
                                                <View className="w-8 h-8 bg-blue-100 rounded-full items-center justify-center mr-2">
                                                    <FontAwesome name="futbol-o" size={14} color="#2563eb" />
                                                </View>
                                                <Text className="font-bold text-gray-800">{sportName}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => removeSport(s.sportId)} className="p-1">
                                                <FontAwesome name="times-circle" size={20} color="#ef4444" />
                                            </TouchableOpacity>
                                        </View>
                                        {/* Position chips */}
                                        {positions.length > 0 && (
                                            <View className="mb-2">
                                                <Text className="text-xs text-gray-500 mb-2">עמדה מוגדרת מראש:</Text>
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                    <View className="flex-row">
                                                        <TouchableOpacity
                                                            onPress={() => updatePosition(s.sportId, '')}
                                                            className={`px-3 py-1.5 rounded-full mr-2 border ${!s.position ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                                                        >
                                                            <Text className={`text-xs font-medium ${!s.position ? 'text-white' : 'text-gray-600'}`}>כללי</Text>
                                                        </TouchableOpacity>
                                                        {positions.map(pos => (
                                                            <TouchableOpacity
                                                                key={pos}
                                                                onPress={() => updatePosition(s.sportId, pos)}
                                                                className={`px-3 py-1.5 rounded-full mr-2 border ${s.position === pos ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                                                            >
                                                                <Text className={`text-xs font-medium ${s.position === pos ? 'text-white' : 'text-gray-600'}`}>{pos}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                </ScrollView>
                                            </View>
                                        )}
                                        {/* Free-text position input */}
                                        <View className="mt-1">
                                            <Text className="text-xs text-gray-500 mb-1">או הכנס עמדה חופשית:</Text>
                                            <TextInput
                                                value={positions.includes(s.position) ? '' : s.position}
                                                onChangeText={(v) => updatePosition(s.sportId, v)}
                                                placeholder="למשל: אמצע, קשר פוגעני..."
                                                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-right"
                                                placeholderTextColor="#9ca3af"
                                            />
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        // View mode: show chips
                        <View className="flex-row flex-wrap">
                            {profile?.sports?.map(s => {
                                const hebrewName = SPORT_MAPPING[s.name] || SPORT_MAPPING[s.id] || s.name;
                                const label = s.position ? `${hebrewName} · ${s.position}` : hebrewName;
                                return (
                                    <View key={s.id} className="bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 ml-2 mb-2 flex-row items-center">
                                        <FontAwesome name="futbol-o" size={11} color="#2563eb" style={{ marginRight: 5 }} />
                                        <Text className="text-blue-700 font-medium text-sm">{label}</Text>
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
                                    <View className="w-10 h-10 bg-blue-50 rounded-full items-center justify-center mr-3">
                                        <FontAwesome name="futbol-o" size={18} color="#2563eb" />
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
