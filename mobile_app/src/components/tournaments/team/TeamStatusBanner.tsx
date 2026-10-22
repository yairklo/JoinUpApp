import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TeamStatus } from '@/types/tournament';

interface Props {
    status: TeamStatus;
    /** 1-based waitlist position when the API provides it; otherwise the no-position copy. */
    waitlistPosition?: number | null;
}

type Tone = { box: string; text: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string };

const TONES: Record<TeamStatus, Tone> = {
    PENDING: { box: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-800 dark:text-blue-200', icon: 'information-circle-outline', color: '#2563eb' },
    APPROVED: { box: 'bg-brand-mist dark:bg-brand-ink', text: 'text-brand-dark dark:text-brand-light', icon: 'checkmark-circle-outline', color: '#059669' },
    WAITLISTED: { box: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-800 dark:text-amber-200', icon: 'time-outline', color: '#d97706' },
    REJECTED: { box: 'bg-gray-100 dark:bg-cyber-card', text: 'text-gray-800 dark:text-cyber-text', icon: 'close-circle-outline', color: '#dc2626' },
    WITHDRAWN: { box: 'bg-gray-100 dark:bg-cyber-card', text: 'text-gray-700 dark:text-cyber-muted', icon: 'exit-outline', color: '#6b7280' },
};

/** Status banner of the team page (spec 4.5); all statuses share one shape. */
export default function TeamStatusBanner({ status, waitlistPosition }: Props) {
    const { t } = useTranslation();
    const tone = TONES[status];
    const text =
        status === 'WAITLISTED'
            ? waitlistPosition
                ? t('tournaments.team.banner.WAITLISTED', { n: waitlistPosition })
                : t('tournaments.team.banner.WAITLISTED_NOPOS')
            : t(`tournaments.team.banner.${status}`);
    return (
        <View testID="team-status-banner" accessibilityRole="alert" className={`flex-row items-center rounded-xl p-3 ${tone.box}`}>
            <Ionicons name={tone.icon} size={20} color={tone.color} />
            <Text className={`flex-1 ms-2 text-sm ${tone.text}`}>{text}</Text>
        </View>
    );
}

/** Soft warning/info banner for "roster invalid" and "roster locked" (spec 4.5, bottom rows). */
export function RosterNoticeBanner({ kind, text }: { kind: 'invalid' | 'locked'; text: string }) {
    return (
        <View
            testID={`team-roster-${kind}`}
            accessibilityRole="alert"
            className={`flex-row items-center rounded-xl p-3 ${kind === 'invalid' ? 'bg-amber-50 dark:bg-amber-950' : 'bg-blue-50 dark:bg-blue-950'}`}
        >
            <Ionicons name={kind === 'invalid' ? 'warning-outline' : 'lock-closed-outline'} size={20} color={kind === 'invalid' ? '#d97706' : '#2563eb'} />
            <Text className={`flex-1 ms-2 text-sm ${kind === 'invalid' ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200'}`}>{text}</Text>
        </View>
    );
}
