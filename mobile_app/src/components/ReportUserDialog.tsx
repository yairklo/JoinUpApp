import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Image,
    Modal,
    Pressable,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { USER_REPORT_DETAILS_MAX, type UserReportReason } from '@/types/results';

/** `RESULT_DISPUTE` is never offered here; it is the fixed reason of dispute mode. */
export const USER_REPORT_PICKABLE_REASONS = [
    'HARASSMENT',
    'VIOLENCE',
    'CHEATING',
    'NO_SHOW',
    'FAKE_PROFILE',
    'INAPPROPRIATE_CONTENT',
    'OTHER',
] as const satisfies readonly UserReportReason[];

export type ReportErrorKind = 'rateLimited' | 'offline' | 'generic';

export interface ReportUserDialogProps {
    open: boolean;
    mode: 'user' | 'dispute';
    /** user mode: the reported player. dispute mode: the game (name = emoji + title + date). */
    target: { name: string; imageUrl?: string | null };
    state: 'idle' | 'submitting' | 'success' | 'error';
    errorKind?: ReportErrorKind;
    onClose: () => void;
    onSubmit: (reason: UserReportReason, details?: string) => void;
}

export default function ReportUserDialog({ open, mode, target, state, errorKind, onClose, onSubmit }: ReportUserDialogProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const isDispute = mode === 'dispute';
    const [reason, setReason] = useState<UserReportReason | null>(null);
    const [details, setDetails] = useState('');
    const submitting = state === 'submitting';

    useEffect(() => {
        if (open && state === 'idle') {
            setReason(null);
            setDetails('');
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const canSend = !submitting && (isDispute || reason !== null);
    const send = () => {
        if (!canSend) return;
        onSubmit(isDispute ? 'RESULT_DISPUTE' : (reason as UserReportReason), details.trim() || undefined);
    };
    const errorText =
        errorKind === 'rateLimited'
            ? t('userReport.rateLimited')
            : errorKind === 'offline'
              ? t('errors.offline', "You're offline")
              : t('userReport.failed');

    return (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => !submitting && onClose()}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
                <Pressable
                    className="absolute inset-0 bg-black/40"
                    onPress={() => !submitting && onClose()}
                    accessibilityLabel={t('userReport.cancel')}
                />
                <View
                    testID="report-user-dialog"
                    className="bg-white dark:bg-cyber-card rounded-t-3xl px-5 pt-3"
                    style={{ maxHeight: '90%', paddingBottom: insets.bottom + 16 }}
                >
                    <View className="w-10 h-1 rounded-full bg-gray-300 self-center mb-3" />
                    {state === 'success' ? (
                        <View testID="report-user-success" className="items-center py-4">
                            <View className="w-12 h-12 rounded-full bg-brand-mist dark:bg-cyber-border items-center justify-center">
                                <Ionicons name="checkmark" size={28} color="#059669" />
                            </View>
                            <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text mt-3 text-center">
                                {isDispute ? t('userReport.disputeSuccess') : t('userReport.successTitle')}
                            </Text>
                            {!isDispute ? (
                                <Text className="text-gray-500 dark:text-cyber-muted mt-2 text-center">{t('userReport.successBody')}</Text>
                            ) : null}
                            <TouchableOpacity
                                onPress={onClose}
                                accessibilityRole="button"
                                className="mt-5 h-[52px] self-stretch rounded-2xl bg-brand items-center justify-center"
                            >
                                <Text className="text-white font-bold text-[16px]">{t('userReport.close')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text">
                                {isDispute ? t('userReport.disputeTitle') : t('userReport.title')}
                            </Text>
                            <View className="flex-row items-center bg-gray-50 dark:bg-cyber-bg rounded-xl p-2 mt-3">
                                {!isDispute ? (
                                    target.imageUrl ? (
                                        <Image source={{ uri: target.imageUrl }} className="w-8 h-8 rounded-full bg-gray-200" />
                                    ) : (
                                        <View className="w-8 h-8 rounded-full bg-gray-200 dark:bg-cyber-border" />
                                    )
                                ) : null}
                                <Text
                                    numberOfLines={1}
                                    className={`flex-1 font-semibold text-gray-900 dark:text-cyber-text ${isDispute ? '' : 'ms-2'}`}
                                >
                                    {target.name}
                                </Text>
                            </View>

                            {!isDispute ? (
                                <>
                                    <Text className="mt-4 mb-1 font-semibold text-gray-700 dark:text-cyber-text">{t('userReport.question')}</Text>
                                    {USER_REPORT_PICKABLE_REASONS.map((r) => {
                                        const selected = reason === r;
                                        return (
                                            <TouchableOpacity
                                                key={r}
                                                testID={`report-user-reason-${r}`}
                                                onPress={() => setReason(r)}
                                                disabled={submitting}
                                                accessibilityRole="radio"
                                                accessibilityState={{ selected }}
                                                className="flex-row items-center h-12"
                                            >
                                                <View
                                                    className={`w-5 h-5 rounded-full border-2 items-center justify-center ${selected ? 'border-brand' : 'border-gray-300 dark:border-cyber-border'}`}
                                                >
                                                    {selected ? <View className="w-2.5 h-2.5 rounded-full bg-brand" /> : null}
                                                </View>
                                                <Text className="ms-3 text-[15px] text-gray-900 dark:text-cyber-text">
                                                    {t(`userReport.reasons.${r}`)}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </>
                            ) : (
                                <Text className="mt-4 mb-1 font-semibold text-gray-700 dark:text-cyber-text">{t('userReport.disputeQuestion')}</Text>
                            )}

                            <TextInput
                                testID="report-user-details"
                                value={details}
                                onChangeText={setDetails}
                                editable={!submitting}
                                multiline
                                maxLength={USER_REPORT_DETAILS_MAX}
                                placeholder={isDispute ? t('userReport.disputePlaceholder') : t('userReport.details')}
                                placeholderTextColor="#9ca3af"
                                textAlignVertical="top"
                                className="mt-2 min-h-[88px] rounded-xl border border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-bg p-3 text-gray-900 dark:text-cyber-text"
                            />
                            <Text
                                className={`text-xs mt-1 text-end ${details.length >= USER_REPORT_DETAILS_MAX ? 'text-red-600' : 'text-gray-500 dark:text-cyber-muted'}`}
                            >
                                {details.length}/{USER_REPORT_DETAILS_MAX}
                            </Text>
                            <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-2">
                                {isDispute ? t('userReport.disputeNote') : t('userReport.privacyNote')}
                            </Text>

                            {state === 'error' ? (
                                <View
                                    testID="report-user-error"
                                    className="mt-3 rounded-2xl p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900"
                                >
                                    <Text className="text-red-700 dark:text-red-200">{errorText}</Text>
                                </View>
                            ) : null}

                            <View className="flex-row mt-4" style={{ gap: 12 }}>
                                <TouchableOpacity
                                    testID="report-user-cancel"
                                    onPress={onClose}
                                    disabled={submitting}
                                    accessibilityRole="button"
                                    className="flex-1 h-[52px] rounded-2xl bg-gray-100 dark:bg-cyber-border items-center justify-center"
                                >
                                    <Text className="font-bold text-gray-700 dark:text-cyber-text">{t('userReport.cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    testID="report-user-submit"
                                    onPress={send}
                                    disabled={!canSend}
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: !canSend }}
                                    className={`flex-1 h-[52px] rounded-2xl items-center justify-center ${isDispute ? 'bg-brand' : 'bg-red-600'} ${canSend ? '' : 'opacity-50'}`}
                                >
                                    {submitting ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text className="text-white font-bold">
                                            {isDispute ? t('userReport.disputeSubmit') : t('userReport.submit')}
                                        </Text>
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
