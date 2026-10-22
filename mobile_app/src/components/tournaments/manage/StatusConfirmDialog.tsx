import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export interface StartProblem {
    code: string;
    [k: string]: unknown;
}

interface Props {
    open: boolean;
    title: string;
    body: string;
    confirmLabel: string;
    destructive?: boolean;
    /** The user must type this exactly to enable confirm (cancel tournament). */
    typeToConfirm?: string;
    /** CANNOT_START problems from the server; rendered as an ✕ checklist and confirm turns into "close". */
    problems?: StartProblem[];
    /** Organizer only: shows "Start anyway". */
    onForce?: () => void;
    busy?: boolean;
    errorText?: string | null;
    onProblemPress?: (p: StartProblem) => void;
    onConfirm: () => void;
    onClose: () => void;
}

/** Confirmation dialog for status transitions (spec 11.3): copy, type-to-confirm, CANNOT_START checklist. Props only. */
export default function StatusConfirmDialog({ open, title, body, confirmLabel, destructive, typeToConfirm, problems, onForce, busy, errorText, onProblemPress, onConfirm, onClose }: Props) {
    const { t } = useTranslation();
    const [typed, setTyped] = useState('');
    useEffect(() => {
        if (open) setTyped('');
    }, [open]);
    const blocked = !!problems?.length;
    const typeOk = !typeToConfirm || typed.trim() === typeToConfirm.trim();
    return (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => !busy && onClose()} statusBarTranslucent>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
                <View className="flex-1 justify-center bg-black/50 px-5">
                    <View testID="status-confirm" className="rounded-3xl bg-white dark:bg-cyber-card p-5" style={{ maxHeight: '85%' }}>
                        <Text className="text-lg font-extrabold text-gray-900 dark:text-cyber-text">{title}</Text>
                        <ScrollView keyboardShouldPersistTaps="handled">
                            <Text className="mt-2 text-gray-700 dark:text-cyber-muted leading-5">{body}</Text>
                            {blocked ? (
                                <View testID="cannot-start-list" className="mt-3">
                                    {problems!.map((p, i) => (
                                        <Pressable
                                            key={i}
                                            onPress={() => onProblemPress?.(p)}
                                            accessibilityRole={onProblemPress ? 'button' : 'text'}
                                            className="flex-row items-start py-1.5"
                                        >
                                            <Ionicons name="close-circle" size={18} color="#dc2626" style={{ marginTop: 1 }} />
                                            <Text className="ms-2 flex-1 text-gray-800 dark:text-cyber-text">{t(`tournaments.manage.problem.${p.code}`, p as any) as string}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            ) : null}
                            {typeToConfirm ? (
                                <View className="mt-3">
                                    <Text className="text-xs font-semibold text-gray-500 dark:text-cyber-muted mb-1">{t('tournaments.manage.status.typeTitle')}</Text>
                                    <TextInput
                                        testID="status-type-confirm"
                                        value={typed}
                                        onChangeText={setTyped}
                                        placeholder={typeToConfirm}
                                        autoCapitalize="none"
                                        className="rounded-xl border border-gray-300 dark:border-cyber-border bg-white dark:bg-cyber-bg px-3 text-gray-900 dark:text-cyber-text"
                                        style={{ height: 48 }}
                                    />
                                </View>
                            ) : null}
                            {errorText ? (
                                <View accessibilityRole="alert" className="mt-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3">
                                    <Text className="text-red-700 dark:text-red-300">{errorText}</Text>
                                </View>
                            ) : null}
                        </ScrollView>
                        <View className="mt-4" style={{ gap: 8 }}>
                            {blocked ? (
                                <>
                                    {onForce ? (
                                        <Pressable
                                            testID="status-force"
                                            onPress={onForce}
                                            disabled={busy}
                                            accessibilityRole="button"
                                            style={{ minHeight: 48 }}
                                            className="rounded-2xl border border-amber-500 items-center justify-center flex-row"
                                        >
                                            {busy ? <ActivityIndicator color="#b45309" /> : null}
                                            <Text className="font-bold text-amber-700 dark:text-amber-300">{t('tournaments.manage.status.forceStart')}</Text>
                                        </Pressable>
                                    ) : null}
                                    <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: 48 }} className="rounded-2xl bg-gray-100 dark:bg-cyber-border items-center justify-center">
                                        <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('common.close')}</Text>
                                    </Pressable>
                                </>
                            ) : (
                                <View className="flex-row" style={{ gap: 8 }}>
                                    <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" style={{ minHeight: 48 }} className="flex-1 rounded-2xl border border-gray-300 dark:border-cyber-border items-center justify-center">
                                        <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('common.cancel')}</Text>
                                    </Pressable>
                                    <Pressable
                                        testID="status-confirm-button"
                                        onPress={onConfirm}
                                        disabled={busy || !typeOk}
                                        accessibilityRole="button"
                                        accessibilityState={{ disabled: busy || !typeOk, busy }}
                                        style={{ minHeight: 48, opacity: busy || !typeOk ? 0.5 : 1 }}
                                        className={`flex-[1.5] rounded-2xl items-center justify-center flex-row ${destructive ? 'bg-red-600' : 'bg-brand'}`}
                                    >
                                        {busy ? <ActivityIndicator color="#fff" /> : null}
                                        <Text className="font-extrabold text-white">{confirmLabel}</Text>
                                    </Pressable>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
