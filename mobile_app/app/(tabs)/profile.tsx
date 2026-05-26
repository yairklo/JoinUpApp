import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { usersApi, UserProfile } from '../../src/services/api/users';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const SPORT_MAPPING: Record<string, string> = {
  BASKETBALL: 'כדורסל',
  SOCCER: 'כדורגל',
  TENNIS: 'טניס',
  VOLLEYBALL: 'כדורעף'
};

function calculateAge(birthDate?: string | null) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  const ageDt = new Date(diff);
  return Math.abs(ageDt.getUTCFullYear() - 1970);
}

export default function ProfileScreen() {
    const { t } = useTranslation();
    const { user } = useUser();
    const { signOut, getToken } = useAuth();
    const router = useRouter();
    
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ city: '', phone: '' });

    useEffect(() => {
        if (!user?.id) return;
        const loadProfile = async () => {
            try {
                const token = await getToken();
                if (token) {
                    const data = await usersApi.getProfile(user.id, token);
                    setProfile(data);
                    setForm({ city: data?.city || '', phone: data?.phone || '' });
                }
            } catch (err) {
                console.error("Failed to load profile", err);
            } finally {
                setLoading(false);
            }
        };
        loadProfile();
    }, [user?.id]);

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
            Alert.alert(t("profile.error"), t("profile.updateFailed"));
        } finally {
            setSaving(false);
        }
    };

    if (!user || loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50">
                <ActivityIndicator size="large" color="#0000ff" />
            </View>
        )
    }

    const age = calculateAge(profile?.birthDate);

    return (
        <ScrollView className="flex-1 bg-gray-50 p-4">
            {/* Header / Avatar */}
            <View className="items-center bg-white p-6 rounded-2xl shadow-sm mb-4">
                <Image
                    source={{ uri: profile?.imageUrl || user.imageUrl }}
                    className="w-24 h-24 rounded-full mb-4"
                />
                <Text className="text-2xl font-bold text-gray-800">{profile?.name || user.fullName}</Text>
                <Text className="text-gray-500 mb-2">{profile?.city || t("profile.unknownCity")}</Text>
            </View>

            {/* Info Section */}
            <View className="bg-white p-6 rounded-2xl shadow-sm mb-4">
                <View className="flex-row justify-between items-center mb-4 border-b border-gray-100 pb-2">
                    <Text className="text-lg font-bold text-gray-800">{t("profile.personalDetails")}</Text>
                </View>
                
                <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-gray-500 font-medium">{t("profile.email")}</Text>
                    <Text className="text-gray-800 text-left">{profile?.email || user.primaryEmailAddress?.emailAddress || '-'}</Text>
                </View>
                
                <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-gray-500 font-medium">{t("profile.phone")}</Text>
                    {isEditing ? (
                        <TextInput 
                            value={form.phone} 
                            onChangeText={(text) => setForm({ ...form, phone: text })}
                            className="bg-gray-50 border border-gray-200 rounded px-2 py-1 flex-1 mr-4 text-left"
                            keyboardType="phone-pad"
                        />
                    ) : (
                        <Text className="text-gray-800 text-left">{profile?.phone || '-'}</Text>
                    )}
                </View>

                <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-gray-500 font-medium">{t("profile.city")}</Text>
                    {isEditing ? (
                        <TextInput 
                            value={form.city} 
                            onChangeText={(text) => setForm({ ...form, city: text })}
                            className="bg-gray-50 border border-gray-200 rounded px-2 py-1 flex-1 mr-4 text-left"
                        />
                    ) : (
                        <Text className="text-gray-800 text-left">{profile?.city || '-'}</Text>
                    )}
                </View>

                <View className="flex-row justify-between mb-3">
                    <Text className="text-gray-500 font-medium">{t("profile.age")}</Text>
                    <Text className="text-gray-800 text-left">{age ? String(age) : '-'}</Text>
                </View>

                {/* Edit Toggle Button */}
                {!isEditing ? (
                    <TouchableOpacity 
                        onPress={() => setIsEditing(true)} 
                        className="mt-4 py-3 rounded-xl items-center bg-gray-100 border border-gray-200"
                    >
                        <Text className="text-gray-700 font-bold">{t("profile.editProfile")}</Text>
                    </TouchableOpacity>
                ) : (
                    <View className="mt-4 flex-row justify-between space-x-2 space-x-reverse">
                        <TouchableOpacity 
                            onPress={() => { setIsEditing(false); setForm({ city: profile?.city || '', phone: profile?.phone || '' }); }} 
                            className="flex-1 py-3 rounded-xl items-center bg-red-50 border border-red-100 ml-2"
                        >
                            <Text className="text-red-600 font-bold">ביטול</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={handleSave} 
                            disabled={saving}
                            className={`flex-1 py-3 rounded-xl items-center ${saving ? 'bg-blue-300' : 'bg-blue-600'}`}
                        >
                            {saving ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold">שמור</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

            </View>

            {/* Sports Section */}
            <View className="bg-white p-6 rounded-2xl shadow-sm mb-6">
                <Text className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2 text-left">ספורט ועמדות</Text>
                
                {profile?.sports && profile.sports.length > 0 ? (
                    <View className="flex-row flex-wrap">
                        {profile.sports.map(s => {
                            const hebrewName = SPORT_MAPPING[s.name] || SPORT_MAPPING[s.id] || s.name;
                            const label = s.position ? `${hebrewName} (${s.position})` : hebrewName;
                            return (
                                <View key={s.id} className="bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 ml-2 mb-2">
                                    <Text className="text-blue-600 font-medium">{label}</Text>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <Text className="text-gray-400 italic text-left">לא הוגדרו ענפי ספורט</Text>
                )}
            </View>

            <TouchableOpacity
                onPress={handleSignOut}
                className="bg-red-50 p-4 rounded-xl items-center border border-red-100 mb-8 shadow-sm"
            >
                <Text className="text-red-600 font-bold text-lg">{t("profile.signOut")}</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}
