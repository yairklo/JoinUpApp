import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import { supportApi, SupportMessageType } from '@/services/api';

const MAX_MESSAGE_LENGTH = 2000;

export default function FeedbackScreen() {
    const router = useRouter();
    const { getToken } = useAuth();
    const { t } = useTranslation();

    const [type, setType] = useState<SupportMessageType>('BUG');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const TYPES: { value: SupportMessageType; label: string }[] = [
        { value: 'BUG', label: t('feedback.typeBug') },
        { value: 'FEEDBACK', label: t('feedback.typeFeedback') },
    ];

    const handleSubmit = async () => {
        const trimmed = message.trim();
        if (!trimmed) return;
        setSubmitting(true);
        try {
            const token = await getToken();
            if (!token) return;
            await supportApi.submit({ type, message: trimmed, context: 'mobile:/settings/feedback' }, token);
            Alert.alert('', t('feedback.success'));
            router.back();
        } catch (e) {
            console.error('Failed to submit feedback', e);
            Alert.alert(t('error', 'Error'), t('feedback.failure'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'left', 'right']}>
            <View className="flex-row items-center p-4 border-b border-gray-200 bg-white">
                <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
                    <FontAwesome name="chevron-left" size={20} color="#374151" />
                </TouchableOpacity>
                <Text className="flex-1 text-center font-bold text-lg mr-10">{t('feedback.title')}</Text>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }}>
                <Text className="text-gray-500 mb-6">{t('feedback.description')}</Text>

                <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
                    {TYPES.map((opt, idx) => {
                        const active = type === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.value}
                                onPress={() => setType(opt.value)}
                                className={`flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-gray-50' : ''}`}
                            >
                                <Text className={`text-base ${active ? 'text-brand font-bold' : 'text-gray-700'}`}>
                                    {opt.label}
                                </Text>
                                {active && <FontAwesome name="check" size={16} color="#059669" />}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text className="font-bold text-gray-800 mb-3">{t('feedback.messageLabel')}</Text>
                <TextInput
                    value={message}
                    onChangeText={(v) => setMessage(v.slice(0, MAX_MESSAGE_LENGTH))}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    className="bg-white rounded-2xl border border-gray-100 p-4 text-base text-gray-800 mb-2"
                    style={{ minHeight: 140 }}
                />
                <Text className="text-gray-400 text-xs mb-6">{message.length}/{MAX_MESSAGE_LENGTH}</Text>

                <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={submitting || !message.trim()}
                    className="bg-brand rounded-2xl py-4 items-center mt-2"
                    style={{ opacity: submitting || !message.trim() ? 0.6 : 1 }}
                >
                    {submitting ? (
                        <ActivityIndicator color="#ffffff" />
                    ) : (
                        <Text className="text-white font-bold text-base">{t('feedback.submit')}</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}
