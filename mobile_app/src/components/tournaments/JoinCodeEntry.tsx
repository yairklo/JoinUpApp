import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
    open: boolean;
    onClose: () => void;
    /** Receives the trimmed code. */
    onSubmit: (code: string) => void;
}

/** Small prompt to type a team join code (secondary hero CTA "join with a code"). */
export default function JoinCodeEntry({ open, onClose, onSubmit }: Props) {
    const { t } = useTranslation();
    const [code, setCode] = useState('');
    const trimmed = code.trim();
    return (
        <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center px-6 bg-black/40">
                <View testID="join-code-entry" className="rounded-2xl bg-white dark:bg-cyber-card p-4">
                    <Text accessibilityRole="header" className="text-[16px] font-extrabold text-gray-900 dark:text-cyber-text mb-2">
                        {t('tournaments.join.codeLabel')}
                    </Text>
                    <TextInput
                        testID="join-code-input"
                        value={code}
                        onChangeText={setCode}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                        accessibilityLabel={t('tournaments.join.codeLabel')}
                        className="rounded-xl border border-gray-300 dark:border-cyber-border px-3 text-gray-900 dark:text-cyber-text"
                        style={{ minHeight: 48 }}
                    />
                    <View className="flex-row mt-3">
                        <Pressable onPress={onClose} accessibilityRole="button" className="flex-1 items-center justify-center rounded-xl border border-gray-300 dark:border-cyber-border me-2" style={{ minHeight: 48 }}>
                            <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.hero.cancel')}</Text>
                        </Pressable>
                        <Pressable
                            testID="join-code-submit"
                            disabled={!trimmed}
                            onPress={() => {
                                onSubmit(trimmed);
                                setCode('');
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !trimmed }}
                            className={`flex-1 items-center justify-center rounded-xl ${trimmed ? 'bg-brand' : 'bg-gray-300 dark:bg-cyber-border'}`}
                            style={{ minHeight: 48 }}
                        >
                            <Text className="font-bold text-white">{t('tournaments.hero.codeSubmit')}</Text>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
