import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TOURNAMENT_ICONS } from '../tournamentTokens';

interface Props {
    code: string;
    /** Registration is closed: the code is inactive and actions are hidden. */
    closed?: boolean;
    pending?: boolean;
    onCopy: () => void;
    onShare: () => void;
    onRotate: () => void;
}

/** Join code box (spec 4.6): monospace code, three 44px icon actions. Props only. */
export default function JoinCodeBox({ code, closed, pending, onCopy, onShare, onRotate }: Props) {
    const { t } = useTranslation();
    const btn = (id: string, icon: React.ComponentProps<typeof Ionicons>['name'], label: string, onPress: () => void) => (
        <TouchableOpacity
            testID={id}
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={pending}
            onPress={onPress}
            className="w-11 h-11 rounded-xl border border-gray-200 dark:border-cyber-border items-center justify-center"
        >
            <Ionicons name={icon} size={20} color="#059669" />
        </TouchableOpacity>
    );
    return (
        <View testID="team-join-code-box">
            <Text className="text-sm font-bold text-gray-900 dark:text-cyber-text mb-2">{t('tournaments.team.code.label')}</Text>
            {closed ? (
                <Text testID="team-join-code-closed" className="text-sm text-gray-500 dark:text-cyber-muted">
                    {t('tournaments.team.code.closed')}
                </Text>
            ) : (
                <>
                    <View className="rounded-xl bg-gray-50 dark:bg-cyber-bg border border-gray-200 dark:border-cyber-border px-4 py-3 items-center mb-2">
                        <Text
                            testID="team-join-code"
                            selectable
                            accessibilityLabel={`${t('tournaments.team.code.label')} ${code.split('').join(' ')}`}
                            className="text-gray-900 dark:text-cyber-text"
                            style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: '700', letterSpacing: 2 }}
                        >
                            {code}
                        </Text>
                    </View>
                    <View className="flex-row justify-center" style={{ gap: 12 }}>
                        {btn('team-join-code-copy', TOURNAMENT_ICONS.copy, t('tournaments.team.code.copy'), onCopy)}
                        {btn('team-join-code-share', TOURNAMENT_ICONS.share, t('tournaments.team.code.share'), onShare)}
                        {btn('team-join-code-rotate', TOURNAMENT_ICONS.rotate, t('tournaments.team.code.rotate'), onRotate)}
                    </View>
                </>
            )}
        </View>
    );
}
