import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TeamDecision, TournamentTeam } from '@/types/tournament';
import TeamBadge from '../TeamBadge';
import RosterMeter from './RosterMeter';

interface Props {
    team: TournamentTeam;
    captainName?: string;
    min: number;
    max: number;
    /** Decisions offered for this team's status (approve / waitlist / reject). */
    actions: TeamDecision[];
    busy?: boolean;
    /** Seeding mode: show the seed number and up/down buttons instead of decisions. */
    seed?: { index: number; canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void };
    onDecide: (d: TeamDecision) => void;
    /** Shown after a blocked approval attempt (invalid roster). */
    approveBlockedHint?: string | null;
}

const LABEL: Record<TeamDecision, string> = {
    APPROVE: 'tournaments.manage.queue.approve',
    WAITLIST: 'tournaments.manage.queue.toWaitlist',
    REJECT: 'tournaments.manage.queue.reject',
};

/** One team row of the manage queue (spec 11.1): badge, captain, roster meter, validity, actions. Presentational. */
export default function QueueTeamCard({ team, captainName, min, max, actions, busy, seed, onDecide, approveBlockedHint }: Props) {
    const { t } = useTranslation();
    const n = team.memberCount;
    const invalid = n < min || n > max;
    const validity =
        n < min
            ? { text: t('tournaments.manage.queue.missing', { count: min - n }), tone: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200' }
            : n > max
              ? { text: t('tournaments.manage.queue.over', { count: n - max }), tone: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300' }
              : { text: t('tournaments.manage.queue.valid'), tone: 'bg-brand-mist dark:bg-brand-ink text-brand-dark dark:text-brand-light' };
    const [bg, fg] = [validity.tone.split(' ').filter((c) => c.startsWith('bg-') || c.startsWith('dark:bg-')).join(' '), validity.tone.split(' ').filter((c) => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ')];

    return (
        <View testID={`queue-team-${team.id}`} className="rounded-2xl border border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-card p-3 mb-3">
            <View className="flex-row items-center">
                {seed ? (
                    <Text className="w-8 font-extrabold text-gray-500 dark:text-cyber-muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {seed.index + 1}
                    </Text>
                ) : null}
                <View className="flex-1" style={{ minWidth: 0 }}>
                    <TeamBadge name={team.name} color={team.color} logoUrl={team.logoUrl} size={32} lines={2} bold />
                    {captainName ? (
                        <View className="flex-row items-center mt-0.5">
                            <Ionicons name="shield" size={12} color="#9ca3af" />
                            <Text numberOfLines={1} className="ms-1 text-xs text-gray-500 dark:text-cyber-muted" style={{ flexShrink: 1 }}>
                                {captainName}
                            </Text>
                        </View>
                    ) : null}
                </View>
                {seed ? (
                    <View className="flex-row" style={{ gap: 6 }}>
                        <Pressable
                            testID={`seed-up-${team.id}`}
                            onPress={seed.onUp}
                            disabled={!seed.canUp}
                            accessibilityRole="button"
                            accessibilityLabel={`↑ ${team.name}`}
                            style={{ width: 44, height: 44, opacity: seed.canUp ? 1 : 0.35 }}
                            className="rounded-xl border border-gray-300 dark:border-cyber-border items-center justify-center"
                        >
                            <Ionicons name="chevron-up" size={20} color="#374151" />
                        </Pressable>
                        <Pressable
                            testID={`seed-down-${team.id}`}
                            onPress={seed.onDown}
                            disabled={!seed.canDown}
                            accessibilityRole="button"
                            accessibilityLabel={`↓ ${team.name}`}
                            style={{ width: 44, height: 44, opacity: seed.canDown ? 1 : 0.35 }}
                            className="rounded-xl border border-gray-300 dark:border-cyber-border items-center justify-center"
                        >
                            <Ionicons name="chevron-down" size={20} color="#374151" />
                        </Pressable>
                    </View>
                ) : (
                    <View className={`px-2.5 py-1 rounded-full ${bg}`}>
                        <Text className={`text-xs font-bold ${fg}`}>{validity.text}</Text>
                    </View>
                )}
            </View>
            <View className="mt-2">
                <RosterMeter count={n} min={min} max={max} />
                <Text className="mt-1 text-xs text-gray-500 dark:text-cyber-muted" style={{ fontVariant: ['tabular-nums'] }}>
                    {t('tournaments.team.roster', { count: n })}
                </Text>
            </View>
            {!seed && actions.length ? (
                <View className="flex-row mt-3" style={{ gap: 8 }}>
                    {actions.map((a) => {
                        const blocked = a === 'APPROVE' && invalid;
                        const primary = a === 'APPROVE';
                        return (
                            <Pressable
                                key={a}
                                testID={`queue-${a === 'APPROVE' ? 'approve' : a === 'REJECT' ? 'reject' : 'waitlist'}-${team.id}`}
                                onPress={() => onDecide(a)}
                                disabled={busy}
                                accessibilityRole="button"
                                accessibilityLabel={`${t(LABEL[a])} ${team.name}`}
                                accessibilityState={{ disabled: !!busy, busy: !!busy }}
                                style={{ minHeight: 44, opacity: busy ? 0.6 : blocked ? 0.85 : 1 }}
                                className={`flex-1 rounded-xl items-center justify-center flex-row ${
                                    primary ? 'bg-brand' : a === 'REJECT' ? 'border border-red-300 dark:border-red-900' : 'border border-gray-300 dark:border-cyber-border'
                                }`}
                            >
                                {busy && primary ? <ActivityIndicator color="#fff" /> : null}
                                <Text className={`font-bold ${primary ? 'text-white' : a === 'REJECT' ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-cyber-text'}`}>{t(LABEL[a])}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            ) : null}
            {approveBlockedHint ? <Text className="mt-2 text-xs text-amber-700 dark:text-amber-300">{approveBlockedHint}</Text> : null}
        </View>
    );
}
