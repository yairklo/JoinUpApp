import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { getAgeInJerusalem, type AgeGateInfo } from '@joinup/shared/ageGate';
import { getLegalTexts } from '@joinup/shared/legal';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/services/api/users';

const toYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatHe = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;

function CheckRow({ checked, onToggle, children, testID }: { checked: boolean; onToggle: () => void; children: React.ReactNode; testID?: string }) {
    return (
        <Pressable testID={testID} onPress={onToggle} className="flex-row items-start gap-3 py-2" accessibilityRole="checkbox" accessibilityState={{ checked }}>
            <View testID={testID ? `${testID}-box` : undefined} className={`w-6 h-6 rounded-md border-2 items-center justify-center mt-0.5 ${checked ? 'bg-brand border-brand' : 'border-gray-400 dark:border-gray-500'}`}>
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
    const { isSignedIn, userId, getToken, signOut } = useAuth();
    const segments = useSegments();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t, i18n } = useTranslation();
    const legal = getLegalTexts(i18n.language);
    const rtl = { textAlign: legal.dir === 'rtl' ? ('right' as const) : ('left' as const), writingDirection: legal.dir };

    const [gate, setGate] = useState<AgeGateInfo | null>(null);
    const [birthDate, setBirthDate] = useState<Date | null>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [guardianConsent, setGuardianConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Bumped on every user change / sign-out so a late response for a previous user is dropped.
    const requestSeq = useRef(0);
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    // This overlay stays mounted across sign-out, so wipe all form state (consent must never carry
    // over from another person on the same device) whenever the signed-in user changes.
    useEffect(() => {
        const seq = ++requestSeq.current;
        setGate(null);
        setBirthDate(null);
        setShowPicker(false);
        setAcceptTerms(false);
        setGuardianConsent(false);
        setBusy(false);
        setError(null);
        if (!isSignedIn || !userId) return;
        (async () => {
            try {
                const token = await getTokenRef.current();
                if (!token || seq !== requestSeq.current) return;
                const me = await usersApi.getMe(token);
                if (seq !== requestSeq.current) return;
                setGate(me.ageGate ?? null);
            } catch {
                // Network/API failure: don't lock the app; the server still enforces the gate.
            }
        })();
    }, [isSignedIn, userId]);

    if (!isSignedIn || !gate || gate.status === 'OK' || segments[0] === 'legal') return null;

    const needsBirthDate = gate.status === 'NEEDS_BIRTHDATE';
    const age = needsBirthDate ? (birthDate ? getAgeInJerusalem(toYmd(birthDate)) : null) : gate.age;
    const tooYoung = gate.status === 'UNDER_MIN_AGE';
    const isMinor = age !== null && age >= gate.minAge && age < gate.adultAge;
    const canSubmit = !busy && acceptTerms && (!needsBirthDate || !!birthDate) && (!isMinor || guardianConsent);

    const submit = async () => {
        const seq = requestSeq.current;
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
            if (seq === requestSeq.current) setGate(res.ageGate);
        } catch (e) {
            if (seq !== requestSeq.current) return;
            setError(e instanceof Error && e.message ? e.message : t('ageGate.saveFailed', 'השמירה נכשלה. נסו שוב.'));
        } finally {
            if (seq === requestSeq.current) setBusy(false);
        }
    };

    const deleteAccount = () => {
        Alert.alert(t('ageGate.deleteTitle', 'מחיקת חשבון'), t('ageGate.deleteBody', 'החשבון וכל המידע שבו יימחקו לצמיתות.'), [
            { text: t('common.cancel', 'ביטול'), style: 'cancel' },
            {
                text: t('ageGate.deleteConfirm', 'מחק את החשבון'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        const token = await getToken();
                        if (token) await usersApi.deleteAccount(token);
                        try { await signOut(); } catch { /* Clerk user already gone */ }
                    } catch {
                        Alert.alert(t('ageGate.deleteFailedTitle', 'מחיקת החשבון נכשלה'), t('ageGate.deleteFailedBody', 'בדקו את החיבור ונסו שוב.'));
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
                            {t('ageGate.tooYoungTitle', 'JoinUp מיועדת לגיל {{minAge}} ומעלה', { minAge: gate.minAge })}
                        </Text>
                        <Text className="text-base text-gray-700 dark:text-gray-300 mb-3" style={rtl}>
                            {t('ageGate.tooYoungBody', 'לפי תאריך הלידה שהוזן, אי אפשר להשתמש ב-JoinUp כרגע. נשמח לראות אותך כאן כשתגיע/י לגיל {{minAge}}.', { minAge: gate.minAge })}
                        </Text>
                        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6" style={rtl}>
                            {t('ageGate.tooYoungHelp', 'אם תאריך הלידה הוזן בטעות, אפשר לפנות לתמיכה. אפשר גם למחוק את החשבון ואת כל המידע שבו.')}
                        </Text>
                        <Pressable onPress={deleteAccount} className="border border-red-500 rounded-xl py-3 mb-3">
                            <Text className="text-red-600 text-center font-bold">{t('ageGate.deleteAccount', 'מחק את החשבון שלי')}</Text>
                        </Pressable>
                    </>
                ) : (
                    <>
                        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2" style={rtl}>
                            {needsBirthDate ? t('ageGate.titleBirthDate', 'עוד פרט אחד לפני שמתחילים') : t('ageGate.titleTerms', 'עדכנו את תנאי השימוש')}
                        </Text>

                        {needsBirthDate && (
                            <>
                                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4" style={rtl}>
                                    {t('ageGate.birthDateHint', 'תאריך הלידה משמש להגנה על משתמשים צעירים. אי אפשר לשנות אותו אחר כך.')}
                                </Text>
                                <Text className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1" style={rtl}>{t('ageGate.birthDateLabel', 'תאריך לידה')}</Text>
                                <Pressable
                                    testID="age-gate-birthdate"
                                    onPress={() => setShowPicker(true)}
                                    className="border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 mb-2"
                                >
                                    <Text className={birthDate ? 'text-gray-900 dark:text-white' : 'text-gray-400'} style={rtl}>
                                        {birthDate ? formatHe(birthDate) : t('ageGate.pickDate', 'בחירת תאריך')}
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
                                        {t('ageGate.tooYoungTitle', 'JoinUp מיועדת לגיל {{minAge}} ומעלה', { minAge: gate.minAge })}
                                    </Text>
                                )}
                            </>
                        )}

                        <View className="mt-4">
                            <CheckRow testID="age-gate-terms-checkbox" checked={acceptTerms} onToggle={() => setAcceptTerms((v) => !v)}>
                                <Text className="text-gray-800 dark:text-gray-200" style={rtl}>
                                    {t('auth.agreeToTermsPrefix', 'אני מאשר/ת שקראתי ומסכים/ה ל')}
                                    <Text className="text-brand font-bold" onPress={() => router.push('/legal/terms' as any)}>{t('auth.termsOfService', 'תנאי השימוש')}</Text>
                                    {' '}{t('auth.and', 'ול')}
                                    <Text className="text-brand font-bold" onPress={() => router.push('/legal/privacy' as any)}>{t('auth.privacyPolicy', 'מדיניות הפרטיות')}</Text>
                                </Text>
                            </CheckRow>

                            {isMinor && (
                                <CheckRow checked={guardianConsent} onToggle={() => setGuardianConsent((v) => !v)}>
                                    <Text className="text-gray-800 dark:text-gray-200" style={rtl}>{legal.guardianDeclarationLabel}</Text>
                                </CheckRow>
                            )}
                        </View>

                        {error && <Text className="text-red-600 mt-3" style={rtl}>{error}</Text>}

                        <Pressable
                            testID="age-gate-continue"
                            onPress={submit}
                            disabled={!canSubmit}
                            className={`rounded-xl py-3.5 mt-6 ${canSubmit ? 'bg-brand' : 'bg-gray-300 dark:bg-gray-700'}`}
                        >
                            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-center font-bold text-base">{t('ageGate.continue', 'המשך')}</Text>}
                        </Pressable>
                    </>
                )}

                <Pressable onPress={() => signOut()} className="py-3 mt-2">
                    <Text className="text-gray-500 dark:text-gray-400 text-center">{t('ageGate.signOut', 'התנתקות')}</Text>
                </Pressable>
            </ScrollView>
        </View>
    );
}
