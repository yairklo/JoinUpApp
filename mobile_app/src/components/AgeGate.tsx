import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { getAgeInJerusalem, type AgeGateInfo } from '@joinup/shared/ageGate';
import { GUARDIAN_DECLARATION_LABEL } from '@joinup/shared/legal';
import { usersApi } from '@/services/api/users';

const rtl = { textAlign: 'right' as const, writingDirection: 'rtl' as const };
const toYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatHe = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;

function CheckRow({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
    return (
        <Pressable onPress={onToggle} className="flex-row-reverse items-start gap-3 py-2" accessibilityRole="checkbox" accessibilityState={{ checked }}>
            <View className={`w-6 h-6 rounded-md border-2 items-center justify-center mt-0.5 ${checked ? 'bg-brand border-brand' : 'border-gray-400 dark:border-gray-500'}`}>
                {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <View className="flex-1">{children}</View>
        </Pressable>
    );
}

/**
 * Full-screen overlay until the signed-in user has a birth date, accepted the current terms,
 * and (13-17) declared guardian consent. Status comes from GET /api/users/me; the server
 * enforces the same rule. Hidden on /legal/* so the documents can be read.
 */
export default function AgeGate() {
    const { isSignedIn, getToken, signOut } = useAuth();
    const segments = useSegments();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [gate, setGate] = useState<AgeGateInfo | null>(null);
    const [birthDate, setBirthDate] = useState<Date | null>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [guardianConsent, setGuardianConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const me = await usersApi.getMe(token);
            setGate(me.ageGate ?? null);
        } catch {
            // Network/API failure: don't lock the app; the server still enforces the gate.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken identity churns
    }, []);

    useEffect(() => {
        if (isSignedIn) load();
        else setGate(null);
    }, [isSignedIn, load]);

    if (!isSignedIn || !gate || gate.status === 'OK' || segments[0] === 'legal') return null;

    const needsBirthDate = gate.status === 'NEEDS_BIRTHDATE';
    const age = needsBirthDate ? (birthDate ? getAgeInJerusalem(toYmd(birthDate)) : null) : gate.age;
    const tooYoung = gate.status === 'UNDER_MIN_AGE';
    const isMinor = age !== null && age >= gate.minAge && age < gate.adultAge;
    const canSubmit = !busy && acceptTerms && (!needsBirthDate || !!birthDate) && (!isMinor || guardianConsent);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('not signed in');
            const res = await usersApi.submitAgeGate(
                {
                    ...(needsBirthDate && birthDate ? { birthDate: toYmd(birthDate) } : {}),
                    acceptTerms,
                    guardianConsent: isMinor ? guardianConsent : undefined,
                },
                token
            );
            setGate(res.ageGate);
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'השמירה נכשלה. נסו שוב.');
        } finally {
            setBusy(false);
        }
    };

    const deleteAccount = () => {
        Alert.alert('מחיקת חשבון', 'החשבון וכל המידע שבו יימחקו לצמיתות.', [
            { text: 'ביטול', style: 'cancel' },
            {
                text: 'מחק את החשבון',
                style: 'destructive',
                onPress: async () => {
                    try {
                        const token = await getToken();
                        if (token) await usersApi.deleteAccount(token);
                        try { await signOut(); } catch { /* Clerk user already gone */ }
                    } catch {
                        Alert.alert('מחיקת החשבון נכשלה', 'בדקו את החיבור ונסו שוב.');
                    }
                },
            },
        ]);
    };

    return (
        <View
            className="absolute inset-0 bg-white dark:bg-gray-950"
            style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16, zIndex: 1000, elevation: 1000 }}
        >
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
                {tooYoung ? (
                    <>
                        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-3" style={rtl}>
                            JoinUp מיועדת לגיל {gate.minAge} ומעלה
                        </Text>
                        <Text className="text-base text-gray-700 dark:text-gray-300 mb-3" style={rtl}>
                            לפי תאריך הלידה שהוזן, אי אפשר להשתמש ב-JoinUp כרגע. נשמח לראות אותך כאן כשתגיע/י לגיל {gate.minAge}.
                        </Text>
                        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6" style={rtl}>
                            אם תאריך הלידה הוזן בטעות, אפשר לפנות לתמיכה. אפשר גם למחוק את החשבון ואת כל המידע שבו.
                        </Text>
                        <Pressable onPress={deleteAccount} className="border border-red-500 rounded-xl py-3 mb-3">
                            <Text className="text-red-600 text-center font-bold">מחק את החשבון שלי</Text>
                        </Pressable>
                    </>
                ) : (
                    <>
                        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2" style={rtl}>
                            {needsBirthDate ? 'עוד פרט אחד לפני שמתחילים' : 'עדכנו את תנאי השימוש'}
                        </Text>

                        {needsBirthDate && (
                            <>
                                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4" style={rtl}>
                                    תאריך הלידה משמש להגנה על משתמשים צעירים. אי אפשר לשנות אותו אחר כך.
                                </Text>
                                <Text className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1" style={rtl}>תאריך לידה</Text>
                                <Pressable
                                    onPress={() => setShowPicker(true)}
                                    className="border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 mb-2"
                                >
                                    <Text className={birthDate ? 'text-gray-900 dark:text-white' : 'text-gray-400'} style={rtl}>
                                        {birthDate ? formatHe(birthDate) : 'בחירת תאריך'}
                                    </Text>
                                </Pressable>
                                {showPicker && (
                                    <DateTimePicker
                                        value={birthDate ?? new Date(2008, 0, 1)}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        maximumDate={new Date()}
                                        onChange={(_e, d) => {
                                            if (Platform.OS !== 'ios') setShowPicker(false);
                                            if (d) setBirthDate(d);
                                        }}
                                    />
                                )}
                                {age !== null && age < gate.minAge && (
                                    <Text className="text-amber-700 dark:text-amber-300 text-sm mb-2" style={rtl}>
                                        JoinUp מיועדת לגיל {gate.minAge} ומעלה.
                                    </Text>
                                )}
                            </>
                        )}

                        <View className="mt-4">
                            <CheckRow checked={acceptTerms} onToggle={() => setAcceptTerms((v) => !v)}>
                                <Text className="text-gray-800 dark:text-gray-200" style={rtl}>
                                    קראתי ואני מסכים/ה ל
                                    <Text className="text-brand font-bold" onPress={() => router.push('/legal/terms' as any)}>תנאי השימוש</Text>
                                    {' '}ול
                                    <Text className="text-brand font-bold" onPress={() => router.push('/legal/privacy' as any)}>מדיניות הפרטיות</Text>
                                </Text>
                            </CheckRow>

                            {isMinor && (
                                <CheckRow checked={guardianConsent} onToggle={() => setGuardianConsent((v) => !v)}>
                                    <Text className="text-gray-800 dark:text-gray-200" style={rtl}>{GUARDIAN_DECLARATION_LABEL}</Text>
                                </CheckRow>
                            )}
                        </View>

                        {error && <Text className="text-red-600 mt-3" style={rtl}>{error}</Text>}

                        <Pressable
                            onPress={submit}
                            disabled={!canSubmit}
                            className={`rounded-xl py-3.5 mt-6 ${canSubmit ? 'bg-brand' : 'bg-gray-300 dark:bg-gray-700'}`}
                        >
                            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-center font-bold text-base">המשך</Text>}
                        </Pressable>
                    </>
                )}

                <Pressable onPress={() => signOut()} className="py-3 mt-2">
                    <Text className="text-gray-500 dark:text-gray-400 text-center">התנתקות</Text>
                </Pressable>
            </ScrollView>
        </View>
    );
}
