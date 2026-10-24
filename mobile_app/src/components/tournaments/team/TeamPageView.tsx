import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import RosterMeter from '../RosterMeter';
import TeamBadge from '../TeamBadge';
import RosterRow, { type RosterAction } from './RosterRow';
import TeamStatusBanner, { RosterNoticeBanner } from './TeamStatusBanner';
import type { TeamMember, TournamentTeam } from '@/types/tournament';

interface Props {
    team: TournamentTeam;
    tournamentTitle: string;
    limits: { min: number; max: number; starters: number };
    viewerId?: string | null;
    /** Captain or manager: sees invited / declined rows and the roster actions. */
    canEdit: boolean;
    isCaptain: boolean;
    /** Roster locked by `rosterLockAt`; edits are disabled. `lockedDate` is the formatted date. */
    rosterLocked?: boolean;
    lockedDate?: string;
    /** Banner for 1-based waitlist position when available. */
    waitlistPosition?: number | null;
    /** Slots filled by the container (invite search, join code box, own matches). */
    invite?: React.ReactNode;
    joinCode?: React.ReactNode;
    onMemberAction: (action: RosterAction, member: TeamMember) => void;
    onWithdraw: () => void;
    busy?: boolean;
    /** Pull-to-refresh style hooks. */
    footer?: React.ReactNode;
}

function Section({ children, testID }: { children: React.ReactNode; testID?: string }) {
    return (
        <View testID={testID} className="rounded-2xl bg-white dark:bg-cyber-card p-4 mb-3 border border-gray-100 dark:border-cyber-border">
            {children}
        </View>
    );
}

/** Captain's team page body (spec 4.2): header, status banner, roster + meter, invite and join-code slots, withdraw. */
export default function TeamPageView({
    team,
    tournamentTitle,
    limits,
    viewerId,
    canEdit,
    isCaptain,
    rosterLocked,
    lockedDate,
    waitlistPosition,
    invite,
    joinCode,
    onMemberAction,
    onWithdraw,
    busy,
    footer,
}: Props) {
    const { t } = useTranslation();
    const [showDeclined, setShowDeclined] = useState(false);
    const members = team.members ?? [];
    const accepted = members.filter((m) => m.status === 'ACCEPTED');
    const invited = members.filter((m) => m.status === 'INVITED');
    const declined = members.filter((m) => m.status === 'DECLINED');
    const missing = Math.max(0, limits.min - accepted.length);
    const active = team.status !== 'WITHDRAWN' && team.status !== 'REJECTED';

    const actionsFor = (m: TeamMember): RosterAction[] => {
        if (rosterLocked || !active) return [];
        const isSelf = viewerId === m.userId;
        if (m.status === 'INVITED') return canEdit ? ['cancelInvite'] : [];
        if (m.status !== 'ACCEPTED') return [];
        if (m.role === 'CAPTAIN') return canEdit ? ['jersey'] : [];
        const out: RosterAction[] = [];
        if (canEdit) out.push('jersey', m.role === 'SUBSTITUTE' ? 'toRoster' : 'toBench', 'remove');
        else if (isSelf) out.push('leave');
        return out;
    };

    const visible = [...accepted, ...invited].sort((a, b) => (a.role === 'CAPTAIN' ? -1 : b.role === 'CAPTAIN' ? 1 : 0));

    return (
        <ScrollView testID="team-page" className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <Section>
                <TeamBadge name={team.name} color={team.color} logoUrl={team.logoUrl} size={40} bold lines={2} />
                <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-1">{tournamentTitle}</Text>
            </Section>

            <View className="mb-3" style={{ gap: 8 }}>
                <TeamStatusBanner status={team.status} waitlistPosition={waitlistPosition} />
                {active && missing > 0 ? (
                    <RosterNoticeBanner kind="invalid" text={t('tournaments.team.banner.invalid', { count: missing, min: limits.min })} />
                ) : null}
                {rosterLocked ? <RosterNoticeBanner kind="locked" text={t('tournaments.team.banner.locked', { date: lockedDate ?? '' })} /> : null}
            </View>

            <Section testID="team-roster">
                <Text className="text-base font-bold text-gray-900 dark:text-cyber-text mb-2">
                    {t('tournaments.team.roster', { count: accepted.length })}
                </Text>
                <RosterMeter accepted={accepted.length} invited={invited.length} min={limits.min} max={limits.max} starters={limits.starters} />
                <View className="mt-2">
                    {visible.map((m) => (
                        <RosterRow key={m.userId} member={m} actions={actionsFor(m)} onAction={onMemberAction} disabled={busy} />
                    ))}
                </View>
                {canEdit && declined.length ? (
                    <View>
                        <TouchableOpacity
                            testID="team-declined-toggle"
                            accessibilityRole="button"
                            accessibilityState={{ expanded: showDeclined }}
                            onPress={() => setShowDeclined((v) => !v)}
                            className="min-h-[44px] flex-row items-center"
                        >
                            <Ionicons name={showDeclined ? 'chevron-up' : 'chevron-down'} size={16} color="#6b7280" />
                            <Text className="ms-1 text-xs text-gray-600 dark:text-cyber-muted">
                                {t('tournaments.team.declinedGroup', { count: declined.length })}
                            </Text>
                        </TouchableOpacity>
                        {showDeclined ? declined.map((m) => <RosterRow key={m.userId} member={m} actions={[]} onAction={onMemberAction} />) : null}
                    </View>
                ) : null}
            </Section>

            {canEdit && active && !rosterLocked && invite ? <Section testID="team-invite-section">{invite}</Section> : null}
            {canEdit && active && joinCode ? <Section>{joinCode}</Section> : null}
            {footer}

            {isCaptain && active ? (
                <TouchableOpacity
                    testID="team-withdraw"
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={onWithdraw}
                    className="min-h-[44px] items-center justify-center mt-2"
                >
                    <Text className="text-sm font-bold text-red-600 dark:text-red-400">{t('tournaments.team.withdraw')}</Text>
                </TouchableOpacity>
            ) : null}
        </ScrollView>
    );
}
