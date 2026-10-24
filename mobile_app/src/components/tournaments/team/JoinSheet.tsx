import React from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SPORT_THEME } from '@joinup/shared/sports';
import MinorsCard from './MinorsCard';

interface Props {
    title: string;
    sport: string;
    startsAt: string;
    /** Manual entry mode: shows a code field (6 chars, auto uppercase). */
    manual?: boolean;
    code: string;
    onCodeChange?: (c: string) => void;
    signedIn: boolean;
    /** Viewer already has a team in this tournament. */
    alreadyInTeam?: boolean;
    pending?: boolean;
    error?: string | null;
    minors?: boolean;
    onSubmit: () => void;
    onSignIn: () => void;
    onNotNow: () => void;
    onToMyTeam: () => void;
}

const EMOJI: Record<string, string> = { SOCCER: '⚽', BASKETBALL: '🏀', TENNIS: '🎾' };

/** Join-by-link / code sheet (spec 5.2). Props only. No team preview: the API does not expose one (spec gap). */
export default function JoinSheet({
    title,
    sport,
    startsAt,
    manual,
    code,
    onCodeChange,
    signedIn,
    alreadyInTeam,
    pending,
    error,
    minors,
    onSubmit,
    onSignIn,
    onNotNow,
    onToMyTeam,
}: Props) {
    const { t } = useTranslation();
    const theme = SPORT_THEME[sport as keyof typeof SPORT_THEME] ?? SPORT_THEME.SOCCER;
    return (
        <View testID="join-sheet" className="rounded-2xl bg-white dark:bg-cyber-card p-5 border border-gray-100 dark:border-cyber-border" style={{ borderTopWidth: 4, borderTopColor: theme.base }}>
            <Text className="text-xs text-gray-500 dark:text-cyber-muted">{t('tournaments.join.title')}</Text>
            <Text className="text-lg font-black text-gray-900 dark:text-cyber-text mt-1" numberOfLines={2}>
                {EMOJI[sport] ?? ''} {title}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-0.5">{new Date(startsAt).toLocaleDateString()}</Text>

            {minors ? (
                <View className="mt-4">
                    <MinorsCard />
                </View>
            ) : alreadyInTeam ? (
                <View className="mt-4">
                    <Text testID="join-already" className="text-sm text-gray-700 dark:text-cyber-text">
                        {t('tournaments.join.alreadyInTeam')}
                    </Text>
                    <TouchableOpacity testID="join-to-my-team" accessibilityRole="button" onPress={onToMyTeam} className="h-[52px] mt-3 rounded-2xl bg-brand items-center justify-center">
                        <Text className="text-white font-bold">{t('tournaments.join.toMyTeam')}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View className="mt-4">
                    {manual ? (
                        <>
                            <Text className="text-sm font-semibold text-gray-700 dark:text-cyber-text mb-1">{t('tournaments.join.codeLabel')}</Text>
                            <TextInput
                                testID="join-code-input"
                                value={code}
                                onChangeText={(v) => onCodeChange?.(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                maxLength={6}
                                accessibilityLabel={t('tournaments.join.codeLabel')}
                                className="h-12 rounded-xl px-3 bg-gray-50 dark:bg-cyber-bg text-gray-900 dark:text-cyber-text border border-gray-200 dark:border-cyber-border text-center"
                                style={{ fontFamily: 'monospace', fontSize: 20, letterSpacing: 2 }}
                            />
                        </>
                    ) : (
                        <Text className="text-sm text-gray-700 dark:text-cyber-text">{t('tournaments.join.generic')}</Text>
                    )}
                    {error ? (
                        <Text testID="join-error" accessibilityRole="alert" className="text-sm text-red-600 dark:text-red-400 mt-2">
                            {error}
                        </Text>
                    ) : null}
                    <TouchableOpacity
                        testID="join-submit"
                        accessibilityRole="button"
                        accessibilityState={{ busy: !!pending }}
                        disabled={pending || (manual && code.length < 1)}
                        onPress={signedIn ? onSubmit : onSignIn}
                        className="h-[52px] mt-4 rounded-2xl bg-brand items-center justify-center"
                    >
                        {pending ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text className="text-white font-bold text-base">{signedIn ? t('tournaments.join.submit') : t('tournaments.join.signIn')}</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
            <TouchableOpacity testID="join-not-now" accessibilityRole="button" onPress={onNotNow} className="min-h-[44px] items-center justify-center mt-2">
                <Text className="text-gray-600 dark:text-cyber-muted font-semibold">{t('tournaments.join.notNow')}</Text>
            </TouchableOpacity>
        </View>
    );
}
