import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MatchSlot } from '@/types/tournament';
import TeamBadge, { type TeamBadgeSize } from './TeamBadge';
import { describeSlot, SLOT_PLACEHOLDER_TEXT } from './tournamentTokens';

interface Props {
    /** `match.home` / `match.away` (or any `{ team, source }`). */
    slot: Pick<MatchSlot, 'team' | 'source'>;
    /** `useTournamentSchedule().numberById`, to turn `WINNER_OF`/`LOSER_OF` into "Winner of match N". */
    numberById?: Record<string, number>;
    /** groupId -> group name for `GROUP_RANK` placeholders. */
    groupNames?: Record<string, string>;
    seed?: number | null;
    bye?: boolean;
    size?: TeamBadgeSize;
    lines?: 1 | 2;
    bold?: boolean;
    muted?: boolean;
    strike?: boolean;
    testID?: string;
}

/**
 * A team (`TeamBadge`) or, when the team is not known yet, an italic placeholder with a dashed 10px
 * ring (spec 0.4): "Winner of match 3", "2 in group A", "Seed 4", "Bye" or "TBD". Props only.
 */
export default function SlotLabel({ slot, numberById, groupNames, seed, bye, size, lines = 1, bold, muted, strike, testID }: Props) {
    const { t } = useTranslation();
    const d = describeSlot(slot, { numberById, groupNames, seed, bye });
    if (d.kind === 'team' && slot.team) {
        return (
            <TeamBadge
                testID={testID}
                name={slot.team.name}
                color={slot.team.color}
                logoUrl={slot.team.logoUrl}
                size={size}
                lines={lines}
                bold={bold}
                muted={muted}
                strike={strike}
            />
        );
    }
    const text = t(d.key as string, d.params as any) as string;
    return (
        <View testID={testID} accessible accessibilityLabel={text} className="flex-row items-center" style={{ minWidth: 0 }}>
            <View className="w-2.5 h-2.5 rounded-full border border-dashed border-gray-400 dark:border-cyber-muted" />
            <Text numberOfLines={lines} className={`ms-2 text-[14px] ${SLOT_PLACEHOLDER_TEXT}`} style={{ flexShrink: 1, minWidth: 0 }}>
                {text}
            </Text>
        </View>
    );
}
