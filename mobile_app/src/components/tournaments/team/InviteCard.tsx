import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SPORT_THEME } from '@joinup/shared/sports';
import TeamBadge from '../TeamBadge';
import type { MyInvite } from '@/types/tournament';

export type InviteCardState = 'idle' | 'pending' | 'joined';

interface Props {
    invite: MyInvite;
    state: InviteCardState;
    /** Inline mapped error message (PLAYER_IN_OTHER_TEAM, ROSTER_LOCKED, ...). */
    error?: string | null;
    onAccept: (invite: MyInvite) => void;
    onDecline: (invite: MyInvite) => void;
    onOpenTeam: (invite: MyInvite) => void;
}

const EMOJI: Record<string, string> = { SOCCER: '⚽', BASKETBALL: '🏀', TENNIS: '🎾' };

/** One pending invitation (spec 5.1): tournament, team badge, captain, 44px accept / decline; success state after joining. */
export default function InviteCard({ invite, state, error, onAccept, onDecline, onOpenTeam }: Props) {
    const { t } = useTranslation();
    const theme = SPORT_THEME[invite.sport as keyof typeof SPORT_THEME] ?? SPORT_THEME.SOCCER;
    const busy = state === 'pending';
    return (
        <View
            testID={`invite-card-${invite.teamId}`}
            className="rounded-2xl bg-white dark:bg-cyber-card p-4 mb-3 border border-gray-100 dark:border-cyber-border"
            style={{ borderStartWidth: 4, borderStartColor: theme.base }}
        >
            <Text className="text-xs text-gray-500 dark:text-cyber-muted" numberOfLines={1}>
                {EMOJI[invite.sport] ?? ''} {invite.tournamentTitle} · {new Date(invite.startsAt).toLocaleDateString()}
            </Text>
            <View className="mt-2">
                <TeamBadge name={invite.teamName} color={invite.teamColor} bold lines={2} size={32} />
            </View>
            <Text className="text-xs text-gray-600 dark:text-cyber-muted mt-1">{t('tournaments.invites.captain', { name: invite.captainName })}</Text>

            {state === 'joined' ? (
                <View className="mt-3" accessibilityRole="alert">
                    <Text className="text-sm font-bold text-brand-dark dark:text-brand-light">{t('tournaments.invites.joined', { team: invite.teamName })}</Text>
                    <TouchableOpacity
                        testID={`invite-open-${invite.teamId}`}
                        accessibilityRole="button"
                        onPress={() => onOpenTeam(invite)}
                        className="min-h-[44px] mt-2 rounded-xl bg-brand items-center justify-center"
                    >
                        <Text className="text-white font-bold">{t('tournaments.teams.toTeamPage')}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    {error ? (
                        <Text testID={`invite-error-${invite.teamId}`} accessibilityRole="alert" className="text-xs text-red-600 dark:text-red-400 mt-2">
                            {error}
                        </Text>
                    ) : null}
                    <View className="flex-row items-center mt-3" style={{ gap: 8 }}>
                        <TouchableOpacity
                            testID={`invite-accept-${invite.teamId}`}
                            accessibilityRole="button"
                            accessibilityState={{ busy, disabled: busy }}
                            disabled={busy}
                            onPress={() => onAccept(invite)}
                            className="flex-1 min-h-[44px] rounded-xl bg-brand items-center justify-center"
                        >
                            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">{t('tournaments.invites.accept')}</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                            testID={`invite-decline-${invite.teamId}`}
                            accessibilityRole="button"
                            disabled={busy}
                            onPress={() => onDecline(invite)}
                            className="min-h-[44px] px-4 justify-center"
                        >
                            <Text className="text-gray-700 dark:text-cyber-text font-semibold">{t('tournaments.invites.decline')}</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
}
