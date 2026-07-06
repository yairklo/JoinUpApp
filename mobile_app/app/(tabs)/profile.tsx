import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, Modal, FlatList } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { usersApi, UserProfile } from '../../src/services/api/users';
import { apiClient, API_BASE } from '../../src/services/api/client';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SPORT_MAPPING } from '@/utils/sports';

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

    const [friends, setFriends] = useState<any[]>([]);
    const [incomingRequests, setIncomingRequests] = useState<any[]>([]);

    const loadProfile = async () => {
        try {
            const token = await getToken();
            if (token) {
                const [data, friendsData, incomingData] = await Promise.all([
                    usersApi.getProfile(user!.id, token),
                    usersApi.getFriends(user!.id, token),
                    usersApi.getIncomingRequests(user!.id, token)
                ]);
                
                setProfile(data);
                setFriends(friendsData);
                setIncomingRequests(incomingData);

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

    const handleAcceptRequest = async (requestId: string) => {
        try {
            const token = await getToken();
            if (token) {
                await usersApi.acceptFriendRequest(requestId, token);
                loadProfile(); // Refresh lists
            }
        } catch (err) {
            Alert.alert(t('error', 'שגיאה'), t('profile.failedToAccept', 'Failed to accept request'));
        }
    };

    const handleDeclineRequest = async (requestId: string) => {
        try {
            const token = await getToken();
            if (token) {
                await usersApi.declineFriendRequest(requestId, token);
                loadProfile(); // Refresh lists
            }
        } catch (err) {
            Alert.alert(t('error', 'שגיאה'), t('profile.failedToDecline', 'Failed to decline request'));
        }
    };

    const handleRemoveFriend = async (friendId: string) => {
        try {
            const token = await getToken();
            if (token) {
                await usersApi.removeFriend(user!.id, friendId, token);
                loadProfile(); // Refresh lists
            }
        } catch (err) {
            Alert.alert(t('error', 'שגיאה'), t('profile.failedToRemove', 'Failed to remove friend'));
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

    // Add a free-text custom position (appended to existing)
    const addCustomPosition = (sportId: string, custom: string) => {
        if (!custom.trim()) return;
        setForm(prev => ({
            ...prev,
            sportsData: prev.sportsData.map(s => {
                if (s.sportId !== sportId) return s;
                const current = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                if (current.includes(custom.trim())) return s;
                return { ...s, position: [...current, custom.trim()].join(', ') };
            })
        }));
    };

    // Remove a specific position tag
    const removePositionTag = (sportId: string, pos: string) => {
        setForm(prev => ({
            ...prev,
            sportsData: prev.sportsData.map(s => {
                if (s.sportId !== sportId) return s;
                const updated = s.position.split(',').map(p => p.trim()).filter(p => p && p !== pos);
                return { ...s, position: updated.join(', ') };
            })
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
                                        {/* Selected positions tags */}
                                        {(() => {
                                            const selectedPositions = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                                            if (selectedPositions.length === 0) return null;
                                            return (
                                                <View className="flex-row flex-wrap mb-2">
                                                    {selectedPositions.map(pos => (
                                                        <View key={pos} className="flex-row items-center bg-blue-600 px-2.5 py-1 rounded-full mr-1.5 mb-1.5">
                                                            <Text className="text-white text-xs font-medium mr-1">{pos}</Text>
                                                            <TouchableOpacity onPress={() => removePositionTag(s.sportId, pos)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                                                                <FontAwesome name="times" size={10} color="rgba(255,255,255,0.8)" />
                                                            </TouchableOpacity>
                                                        </View>
                                                    ))}
                                                </View>
                                            );
                                        })()}

                                        {/* Preset position chips — multi-select toggle */}
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
                                                                    className={`px-3 py-1.5 rounded-full mr-2 border ${selected ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-200'}`}
                                                                >
                                                                    <Text className={`text-xs font-medium ${selected ? 'text-blue-700' : 'text-gray-600'}`}>{pos}</Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                </ScrollView>
                                            </View>
                                        )}

                                        {/* Free-text custom position */}
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
                                                    className={`px-3 rounded-lg items-center justify-center ${(customTexts[s.sportId] || '').trim() ? 'bg-blue-600' : 'bg-gray-200'}`}
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
                        // View mode: sport card with individual position chips
                        <View>
                            {profile?.sports?.map(s => {
                                const hebrewName = SPORT_MAPPING[s.name] || SPORT_MAPPING[s.id] || s.name;
                                const positions = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                                return (
                                    <View key={s.id} className="mb-3 last:mb-0">
                                        <View className="flex-row items-center mb-1.5">
                                            <View className="w-7 h-7 bg-blue-100 rounded-full items-center justify-center mr-2">
                                                <FontAwesome name="futbol-o" size={12} color="#2563eb" />
                                            </View>
                                            <Text className="font-bold text-gray-800">{hebrewName}</Text>
                                        </View>
                                        {positions.length > 0 ? (
                                            <View className="flex-row flex-wrap mr-9">
                                                {positions.map(pos => (
                                                    <View key={pos} className="bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 mr-1.5 mb-1">
                                                        <Text className="text-blue-700 text-xs font-medium">{pos}</Text>
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

                {/* Social Section */}
                {!isEditing && (
                    <View className="mb-6 mx-4">
                        {/* Incoming Requests */}
                        {incomingRequests.length > 0 && (
                            <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4">
                                <Text className="font-bold text-gray-900 mb-3 flex-row items-center">
                                    <FontAwesome name="bell" size={16} color="#eab308" style={{ marginRight: 6 }} />
                                    {' '}{t('profile.incomingRequests', 'בקשות חברות נכנסות')} ({incomingRequests.length})
                                </Text>
                                {incomingRequests.map(req => (
                                    <View key={req.id} className="flex-row items-center justify-between mb-3 last:mb-0">
                                        <TouchableOpacity onPress={() => router.push(`/user/${req.requester.id}`)} className="flex-row items-center flex-1">
                                            <Image 
                                                source={{ uri: req.requester.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.requester.name)}` }} 
                                                className="w-10 h-10 rounded-full bg-gray-200 mr-3" 
                                            />
                                            <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>{req.requester.name}</Text>
                                        </TouchableOpacity>
                                        <View className="flex-row items-center ml-2">
                                            <TouchableOpacity 
                                                onPress={() => handleAcceptRequest(req.id)}
                                                className="bg-green-100 p-2 rounded-full mr-2"
                                            >
                                                <FontAwesome name="check" size={16} color="#16a34a" />
                                            </TouchableOpacity>
                                            <TouchableOpacity 
                                                onPress={() => handleDeclineRequest(req.id)}
                                                className="bg-red-100 p-2 rounded-full"
                                            >
                                                <FontAwesome name="times" size={16} color="#dc2626" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Friends List */}
                        <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                            <Text className="font-bold text-gray-900 mb-3 flex-row items-center">
                                <FontAwesome name="users" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
                                {' '}{t('profile.myFriends', 'החברים שלי')} ({friends.length})
                            </Text>
                            {friends.length === 0 ? (
                                <Text className="text-gray-500 text-sm">{t('profile.noFriends', 'עדיין אין לך חברים ברשת.')}</Text>
                            ) : (
                                friends.map(friend => (
                                    <View key={friend.id} className="flex-row items-center justify-between mb-3 last:mb-0">
                                        <TouchableOpacity onPress={() => router.push(`/user/${friend.id}`)} className="flex-row items-center flex-1">
                                            <Image 
                                                source={{ uri: friend.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.name)}` }} 
                                                className="w-10 h-10 rounded-full bg-gray-200 mr-3" 
                                            />
                                            <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>{friend.name}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            onPress={() => handleRemoveFriend(friend.id)}
                                            className="bg-red-50 px-3 py-1.5 rounded-lg border border-red-100"
                                        >
                                            <Text className="text-xs text-red-600 font-bold">{t('profile.removeFriend', 'הסר')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </View>
                    </View>
                )}

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
