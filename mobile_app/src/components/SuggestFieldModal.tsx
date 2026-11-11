import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions, I18nManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { EMPTY_PARKING, parkingRequestFields, type ParkingValue } from '@joinup/shared/parking';
import { fieldsApi } from '@/services/api';
import ParkingPinField from '@/components/ParkingPinField';

type PaidChoice = 'yes' | 'no' | 'unknown';

interface SuggestFieldModalProps {
    visible: boolean;
    onClose: () => void;
    /** Prefills the venue name, e.g. with what the user typed into the field search. */
    initialName?: string;
    /** Called after a successful submit. The modal itself then shows the "pending approval" state. */
    onSubmitted?: () => void;
}

// "הוספת מגרש": a request to the product admins to list a venue -- the single add-field flow,
// opened from the fields tab and from the create-game field picker. It does not create a field
// or a game and does not change the game's location: the venue is listed only once an admin
// approves it, so after submitting the modal says it is pending approval.
export default function SuggestFieldModal({ visible, onClose, initialName = '', onSubmitted }: SuggestFieldModalProps) {
    const { t } = useTranslation();
    const { getToken } = useAuth();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const scrollRef = useRef<ScrollView>(null);
    const noteFocusedRef = useRef(false);
    // Android: this modal is drawn edge-to-edge, so the window does not resize for the keyboard
    // and KeyboardAvoidingView has nothing to react to. Track the keyboard height and lift and
    // shrink the sheet by it, so the last inputs and the buttons stay visible.
    const [kbHeight, setKbHeight] = useState(0);
    const [name, setName] = useState(initialName);
    const [address, setAddress] = useState('');
    const [paid, setPaid] = useState<PaidChoice>('unknown');
    const [contactInfo, setContactInfo] = useState('');
    const [parking, setParking] = useState<ParkingValue>({ ...EMPTY_PARKING });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Text views align to the paragraph start on their own (right for Hebrew in RTL); only TextInput
    // needs an explicit alignment.
    const textAlign = I18nManager.isRTL ? 'right' : 'left';

    // The note is the last input. Focusing it opens the keyboard and the sheet then shrinks, so
    // scroll to the end once the keyboard is actually up (not at focus time, which is too early).
    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', (e) => {
            if (Platform.OS === 'android') setKbHeight(e.endCoordinates.height);
            if (noteFocusedRef.current) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
        });
        const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
        return () => { show.remove(); hide.remove(); };
    }, []);

    useEffect(() => {
        if (!visible) return;
        noteFocusedRef.current = false;
        setName(initialName);
        setAddress('');
        setPaid('unknown');
        setContactInfo('');
        setParking({ ...EMPTY_PARKING });
        setSubmitted(false);
        setError(null);
    }, [visible, initialName]);

    const handleSubmit = async () => {
        if (!name.trim() || !address.trim()) {
            setError(t('newGame.suggestRequired', 'יש למלא שם וכתובת'));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('not signed in');
            await fieldsApi.suggestField(
                {
                    name: name.trim(),
                    address: address.trim(),
                    isPaid: paid === 'unknown' ? null : paid === 'yes',
                    ...(contactInfo.trim() ? { contactInfo: contactInfo.trim() } : {}),
                    ...parkingRequestFields(parking),
                },
                token
            );
            setSubmitted(true);
            onSubmitted?.();
        } catch (e) {
            console.error('Suggest field failed', e);
            setError(t('newGame.suggestFailed', 'שליחת הבקשה נכשלה, נסו שוב'));
        } finally {
            setSubmitting(false);
        }
    };

    const paidOptions: { value: PaidChoice; label: string }[] = [
        { value: 'yes', label: t('newGame.suggestPaidYes', 'כן') },
        { value: 'no', label: t('newGame.suggestPaidNo', 'לא') },
        { value: 'unknown', label: t('newGame.suggestPaidUnknown', 'לא יודע/ת') },
    ];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={submitting ? undefined : onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1 justify-end bg-black/50"
                style={{ paddingBottom: kbHeight }}
            >
                <View
                    className="bg-white rounded-t-3xl px-5 pt-5"
                    style={{
                        maxHeight: windowHeight - insets.top - 24 - kbHeight,
                        paddingBottom: kbHeight > 0 ? 8 : Math.max(insets.bottom, 16) + 4,
                    }}
                >
                    {submitted ? (
                        <View testID="suggest-field-pending" className="items-center py-4" accessibilityLiveRegion="polite">
                            <FontAwesome name="hourglass-half" size={36} color="#d97706" />
                            <Text className="text-xl font-bold text-gray-800 mt-3 text-center" accessibilityRole="header">
                                {t('newGame.suggestPendingTitle', 'המגרש נשלח וממתין לאישור')}
                            </Text>
                            <Text className="text-gray-500 text-sm mt-2 text-center">
                                {t('newGame.suggestPendingBody', 'צוות JoinUp יבדוק את הפרטים ויאשר בהקדם. עד האישור המגרש לא יופיע ברשימת המגרשים.')}
                            </Text>
                            <TouchableOpacity
                                testID="suggest-field-pending-close"
                                onPress={onClose}
                                accessibilityRole="button"
                                className="bg-brand rounded-xl px-8 mt-5 items-center justify-center"
                                style={{ minHeight: 48 }}
                            >
                                <Text className="text-white font-bold">{t('newGame.suggestPendingClose', 'סגירה')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                    <ScrollView
                        ref={scrollRef}
                        keyboardShouldPersistTaps="handled"
                        bounces={false}
                        showsVerticalScrollIndicator={false}
                        // The sheet resizes when the keyboard opens: re-pin to the end once it has.
                        onLayout={() => { if (noteFocusedRef.current) scrollRef.current?.scrollToEnd({ animated: false }); }}
                    >
                    <Text className="text-xl font-bold text-gray-800 mb-1" accessibilityRole="header">
                        {t('newGame.suggestTitle', 'הוספת מגרש')}
                    </Text>
                    <Text className="text-gray-500 text-sm mb-4">
                        {t('newGame.suggestExplainer', 'הבקשה תישלח לצוות JoinUp. אחרי אישור המגרש יתווסף לרשימה וכולם יוכלו לבחור בו.')}
                    </Text>

                    <Text className="text-gray-700 font-medium mb-1">{t('newGame.suggestName', 'שם המגרש')} *</Text>
                    <TextInput
                        testID="suggest-field-name"
                        value={name}
                        onChangeText={setName}
                        maxLength={200}
                        accessibilityLabel={t('newGame.suggestName', 'שם המגרש')}
                        className="bg-gray-100 p-3 rounded-lg mb-3"
                        style={{ textAlign }}
                    />

                    <Text className="text-gray-700 font-medium mb-1">{t('newGame.suggestAddress', 'כתובת')} *</Text>
                    <TextInput
                        testID="suggest-field-address"
                        value={address}
                        onChangeText={setAddress}
                        maxLength={300}
                        placeholder={t('newGame.suggestAddressPlaceholder', 'רחוב, מספר, עיר')}
                        accessibilityLabel={t('newGame.suggestAddress', 'כתובת')}
                        className="bg-gray-100 p-3 rounded-lg mb-3"
                        style={{ textAlign }}
                    />

                    <Text className="text-gray-700 font-medium mb-1">{t('newGame.suggestIsPaid', 'האם המגרש בתשלום?')}</Text>
                    <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }} accessibilityRole="radiogroup">
                        {paidOptions.map((opt) => {
                            const selected = paid === opt.value;
                            return (
                                <TouchableOpacity
                                    key={opt.value}
                                    onPress={() => setPaid(opt.value)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                    className={`px-4 rounded-full border items-center justify-center ${selected ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
                                    style={{ minHeight: 44 }}
                                >
                                    <Text className={selected ? 'text-white font-medium' : 'text-gray-700'}>{opt.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text className="text-gray-700 font-medium mb-1">{t('newGame.suggestContact', 'איש קשר (אופציונלי)')}</Text>
                    <TextInput
                        value={contactInfo}
                        onChangeText={setContactInfo}
                        maxLength={200}
                        placeholder={t('newGame.suggestContactPlaceholder', 'שם / טלפון / קישור')}
                        accessibilityLabel={t('newGame.suggestContact', 'איש קשר (אופציונלי)')}
                        className="bg-gray-100 p-3 rounded-lg mb-3"
                        style={{ textAlign }}
                    />

                    <ParkingPinField
                        value={parking}
                        onChange={setParking}
                        disabled={submitting}
                        // The note is the last input: bring it (and the buttons) above the keyboard.
                        onNoteFocus={() => {
                            noteFocusedRef.current = true;
                            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
                        }}
                        onNoteBlur={() => { noteFocusedRef.current = false; }}
                    />

                    {error && <Text className="text-red-600 text-sm mb-3" accessibilityLiveRegion="assertive">{error}</Text>}

                    <View className="flex-row justify-end mt-1" style={{ gap: 8 }}>
                        <TouchableOpacity
                            onPress={onClose}
                            disabled={submitting}
                            accessibilityRole="button"
                            className="px-4 justify-center"
                            style={{ minHeight: 48 }}
                        >
                            <Text className="text-gray-600 font-medium">{t('newGame.suggestCancel', 'ביטול')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            testID="suggest-field-submit"
                            onPress={handleSubmit}
                            disabled={submitting}
                            accessibilityRole="button"
                            className={`px-5 rounded-xl justify-center ${submitting ? 'bg-gray-400' : 'bg-brand'}`}
                            style={{ minHeight: 48 }}
                        >
                            {/* The label stays in the layout (hidden while submitting) and the spinner is drawn
                                over it, so the button keeps its width and the cancel button does not shift. */}
                            <Text className="text-white font-bold" style={{ opacity: submitting ? 0 : 1 }}>
                                {t('newGame.suggestSubmit', 'שליחת בקשה')}
                            </Text>
                            {submitting && (
                                <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
                                    <ActivityIndicator color="#fff" />
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                    </ScrollView>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
