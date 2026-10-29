import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import { supportApi, SupportMessageType } from '@/services/api';
import { appAlert } from '@/i18n/appAlert';
import BackButton from '@/components/ui/BackButton';

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
            if (!token) {
                appAlert(t('common.error', 'Error'), t('feedback.signInRequired'));
                return;
            }
            await supportApi.submit({ type, message: trimmed, context: 'mobile:/settings/feedback' }, token);
            appAlert('', t('feedback.success'));
            router.back();
        } catch (e) {
            console.error('Failed to submit feedback', e);
            appAlert(t('common.error', 'Error'), t('feedback.failure'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-cyber-bg" edges={['top', 'left', 'right']}>
            <View className="flex-row items-center p-4 border-b border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-card">
                <BackButton />
                <Text className="flex-1 text-center font-bold text-lg mr-10 text-gray-900 dark:text-cyber-text">{t('feedback.title')}</Text>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
                <Text className="text-gray-500 dark:text-cyber-muted mb-6">{t('feedback.description')}</Text>

                <View className="bg-white dark:bg-cyber-card rounded-2xl border border-gray-100 dark:border-cyber-border overflow-hidden mb-6">
                    {TYPES.map((opt, idx) => {
                        const active = type === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.value}
                                onPress={() => setType(opt.value)}
                                className={`flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-gray-50 dark:border-cyber-border' : ''}`}
                            >
                                <Text className={`text-base ${active ? 'text-brand dark:text-brand-light font-bold' : 'text-gray-700 dark:text-cyber-text'}`}>
                                    {opt.label}
                                </Text>
                                {active && <FontAwesome name="check" size={16} color="#059669" />}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text className="font-bold text-gray-800 dark:text-cyber-text mb-3">{t('feedback.messageLabel')}</Text>
                <TextInput
                    value={message}
                    onChangeText={(v) => setMessage(v.slice(0, MAX_MESSAGE_LENGTH))}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    className="bg-white dark:bg-cyber-card rounded-2xl border border-gray-100 dark:border-cyber-border p-4 text-base text-gray-800 dark:text-cyber-text mb-2"
                    style={{ minHeight: 140 }}
                />
                <Text className="text-gray-400 dark:text-cyber-muted text-xs mb-6">{message.length}/{MAX_MESSAGE_LENGTH}</Text>

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
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
