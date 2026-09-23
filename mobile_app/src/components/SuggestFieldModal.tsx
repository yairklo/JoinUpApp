import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { fieldsApi } from '@/services/api';

type PaidChoice = 'yes' | 'no' | 'unknown';

interface SuggestFieldModalProps {
    visible: boolean;
    onClose: () => void;
    /** Called after a successful submit (the modal closes itself); the parent shows the confirmation. */
    onSubmitted: () => void;
}

// "הצע מגרש חדש": a request to the product admins to list a venue. It does not create a field
// and does not change the game's location -- the free-form map point stays the way to play
// somewhere that isn't a listed field.
export default function SuggestFieldModal({ visible, onClose, onSubmitted }: SuggestFieldModalProps) {
    const { t } = useTranslation();
    const { getToken } = useAuth();
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [paid, setPaid] = useState<PaidChoice>('unknown');
    const [contactInfo, setContactInfo] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setName('');
        setAddress('');
        setPaid('unknown');
        setContactInfo('');
        setError(null);
    }, [visible]);

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
                },
                token
            );
            onClose();
            onSubmitted();
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
        <Modal visible={visible} transparent animationType="slide" onRequestClose={submitting ? undefined : onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/50">
                <View className="bg-white rounded-t-3xl p-5">
                    <Text className="text-xl font-bold text-gray-800 mb-1">{t('newGame.suggestTitle', 'הצע מגרש חדש')}</Text>
                    <Text className="text-gray-500 text-sm mb-4">
                        {t('newGame.suggestExplainer', 'הבקשה תישלח לצוות JoinUp. אחרי בדיקה נוסיף את המגרש לרשימה וכולם יוכלו לבחור בו.')}
                    </Text>

                    <Text className="text-gray-700 font-medium mb-1">{t('newGame.suggestName', 'שם המגרש')} *</Text>
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        maxLength={200}
                        className="bg-gray-100 p-3 rounded-lg mb-3 text-right"
                    />

                    <Text className="text-gray-700 font-medium mb-1">{t('newGame.suggestAddress', 'כתובת')} *</Text>
                    <TextInput
                        value={address}
                        onChangeText={setAddress}
                        maxLength={300}
                        placeholder={t('newGame.suggestAddressPlaceholder', 'רחוב, מספר, עיר')}
                        className="bg-gray-100 p-3 rounded-lg mb-3 text-right"
                    />

                    <Text className="text-gray-700 font-medium mb-1">{t('newGame.suggestIsPaid', 'האם המגרש בתשלום?')}</Text>
                    <View className="flex-row mb-3">
                        {paidOptions.map((opt) => {
                            const selected = paid === opt.value;
                            return (
                                <TouchableOpacity
                                    key={opt.value}
                                    onPress={() => setPaid(opt.value)}
                                    className={`px-4 py-2 rounded-full mr-2 border ${selected ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
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
                        className="bg-gray-100 p-3 rounded-lg mb-3 text-right"
                    />

                    {error && <Text className="text-red-600 text-sm mb-3">{error}</Text>}

                    <View className="flex-row justify-end mt-1">
                        <TouchableOpacity onPress={onClose} disabled={submitting} className="px-4 py-3 mr-2">
                            <Text className="text-gray-600 font-medium">{t('newGame.suggestCancel', 'ביטול')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={submitting}
                            className={`px-5 py-3 rounded-xl ${submitting ? 'bg-gray-400' : 'bg-brand'}`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text className="text-white font-bold">{t('newGame.suggestSubmit', 'שליחת בקשה')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
