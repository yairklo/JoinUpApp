import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TeamMember } from '@/types/tournament';

export type RosterAction = 'jersey' | 'toBench' | 'toRoster' | 'remove' | 'leave' | 'cancelInvite';

interface Props {
    member: TeamMember;
    /** Actions the viewer may run on this row (computed by the container from role + lock). */
    actions: RosterAction[];
    onAction: (action: RosterAction, member: TeamMember) => void;
    disabled?: boolean;
}

const avatar = (m: TeamMember) => m.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name || 'User')}`;

const ACTION_LABEL: Record<RosterAction, string> = {
    jersey: 'tournaments.team.jersey',
    toBench: 'tournaments.team.toBench',
    toRoster: 'tournaments.team.toRoster',
    remove: 'tournaments.team.remove',
    leave: 'tournaments.team.leave',
    cancelInvite: 'tournaments.team.cancelInvite',
};

/**
 * Roster row (spec 4.3): avatar, name, role chip, jersey at the end edge, invited / declined captions and
 * actions. Rows are at least 56px tall. The overflow menu is an inline action strip toggled by the
 * ellipsis button, so no native menu dependency is needed.
 */
export default function RosterRow({ member, actions, onAction, disabled }: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = React.useState(false);
    const invited = member.status === 'INVITED';
    const declined = member.status === 'DECLINED';
    const inline = invited && actions.includes('cancelInvite');
    const menu = actions.filter((a) => a !== 'cancelInvite');
    return (
        <View testID={`team-member-${member.userId}`} className="border-b border-gray-100 dark:border-cyber-border">
            <View className={`flex-row items-center min-h-[56px] py-2 ${declined ? 'opacity-50' : ''}`}>
                <Image source={{ uri: avatar(member) }} accessibilityIgnoresInvertColors className={`w-10 h-10 rounded-full bg-gray-200 ${invited ? 'opacity-60' : ''}`} />
                <View className="flex-1 ms-3">
                    <Text numberOfLines={2} className="text-[15px] font-semibold text-gray-900 dark:text-cyber-text">
                        {member.name}
                    </Text>
                    {invited ? (
                        <Text className="text-xs text-gray-500 dark:text-cyber-muted">{t('tournaments.team.invited')}</Text>
                    ) : declined ? (
                        <Text className="text-xs text-gray-500 dark:text-cyber-muted">{t('tournaments.team.declined')}</Text>
                    ) : (
                        <View className="flex-row items-center mt-0.5">
                            {member.role === 'CAPTAIN' ? <Ionicons name="shield" size={14} color="#059669" /> : null}
                            <Text className={`text-xs ${member.role === 'CAPTAIN' ? 'ms-1 font-bold text-brand-dark dark:text-brand-light' : 'text-gray-500 dark:text-cyber-muted'}`}>
                                {t(`tournaments.team.role.${member.role}`)}
                            </Text>
                        </View>
                    )}
                </View>
                {member.jerseyNumber != null && !invited ? (
                    <Text className="text-sm text-gray-500 dark:text-cyber-muted me-1" style={{ fontVariant: ['tabular-nums'] }}>
                        #{member.jerseyNumber}
                    </Text>
                ) : null}
                {inline ? (
                    <TouchableOpacity
                        testID={`team-member-cancel-${member.userId}`}
                        accessibilityRole="button"
                        disabled={disabled}
                        onPress={() => onAction('cancelInvite', member)}
                        className="min-h-[44px] px-2 justify-center"
                    >
                        <Text className="text-xs font-bold text-red-600 dark:text-red-400">{t('tournaments.team.cancelInvite')}</Text>
                    </TouchableOpacity>
                ) : null}
                {menu.length ? (
                    <TouchableOpacity
                        testID={`team-member-menu-${member.userId}`}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        accessibilityLabel={member.name}
                        disabled={disabled}
                        onPress={() => setOpen((v) => !v)}
                        className="w-11 h-11 items-center justify-center"
                    >
                        <Ionicons name="ellipsis-horizontal" size={20} color="#6b7280" />
                    </TouchableOpacity>
                ) : null}
            </View>
            {open && menu.length ? (
                <View className="flex-row flex-wrap pb-2" style={{ gap: 8 }}>
                    {menu.map((a) => (
                        <TouchableOpacity
                            key={a}
                            testID={`team-member-${a}-${member.userId}`}
                            accessibilityRole="button"
                            onPress={() => {
                                setOpen(false);
                                onAction(a, member);
                            }}
                            className="min-h-[44px] px-3 rounded-xl border border-gray-200 dark:border-cyber-border justify-center"
                        >
                            <Text className={`text-xs font-semibold ${a === 'remove' || a === 'leave' ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-cyber-text'}`}>
                                {t(ACTION_LABEL[a])}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ) : null}
        </View>
    );
}
