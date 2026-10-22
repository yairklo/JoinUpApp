import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';
import type { TournamentStatus } from '@/types/tournament';
import { TOURNAMENT_STATUS_TONE } from './tournamentTokens';

interface Props {
    status: TournamentStatus;
    /** Default `tournament-status`. */
    testID?: string;
}

/** Tournament status pill (spec 0.3): text + colour, COMPLETED also shows a trophy. Props only. */
export default function TournamentStatusChip({ status, testID = 'tournament-status' }: Props) {
    const { t } = useTranslation();
    const { colorMode } = useColorMode();
    const tone = TOURNAMENT_STATUS_TONE[status] ?? TOURNAMENT_STATUS_TONE.DRAFT;
    const label = t(`tournaments.status.${status}`);
    return (
        <View testID={testID} accessible accessibilityLabel={label} className={`flex-row items-center self-start ${tone.container}`}>
            {status === 'COMPLETED' ? (
                <Ionicons name="trophy" size={12} color={colorMode === 'dark' ? '#d1d5db' : '#4b5563'} style={{ marginEnd: 4 }} />
            ) : null}
            <Text className={`text-xs font-bold ${tone.text}`}>{label}</Text>
        </View>
    );
}
