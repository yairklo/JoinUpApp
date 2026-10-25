import React from 'react';
import { Text, View } from 'react-native';
import { formatEveningSummary, type EveningSummary, type EveningSummaryLang } from '@joinup/shared/eveningSummary';

/** Editor preview and saved board: same lines, same legend. */
export default function EveningSummaryLines({
    testID,
    title,
    summary,
    sport,
    lang,
    nameOf,
    className,
}: {
    testID: string;
    title: string;
    summary: EveningSummary;
    sport: string;
    lang: EveningSummaryLang;
    nameOf: (userId: string) => string;
    className?: string;
}) {
    const lines = formatEveningSummary({
        teams: summary.teams,
        players: summary.players.map((player) => ({ ...player, name: nameOf(player.userId) })),
        sport,
        lang,
    });
    return (
        <View testID={testID} className={className || 'rounded-2xl bg-gray-50 dark:bg-cyber-card p-3'}>
            <Text className="font-bold text-gray-900 dark:text-cyber-text">{title}</Text>
            <Text className="text-gray-500 dark:text-cyber-muted mb-1" testID={`${testID}-legend`}>{lines.legend}</Text>
            {lines.teams.map((row) => (
                <Text key={row.key} className="text-gray-800 dark:text-cyber-text py-0.5">{row.line}</Text>
            ))}
            {lines.players.map((row) => (
                <Text key={row.key} className="text-gray-500 dark:text-cyber-muted py-0.5">{row.line}</Text>
            ))}
        </View>
    );
}
