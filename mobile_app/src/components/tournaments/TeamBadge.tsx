import React from 'react';
import { Image, Text, View } from 'react-native';

export type TeamBadgeSize = 24 | 32 | 40;

interface Props {
    name: string;
    /** Team colour hex: only ever used for the swatch (never behind text). */
    color?: string | null;
    logoUrl?: string | null;
    /** Logo diameter. Default 24. Without a logo a 10px swatch is shown regardless of size. */
    size?: TeamBadgeSize;
    /** 1 for tables/rows, 2 for cards. Default 1. */
    lines?: 1 | 2;
    /** Winner emphasis (800). */
    bold?: boolean;
    /** Loser / secondary emphasis. */
    muted?: boolean;
    /** Strike the name through (cancelled matches). */
    strike?: boolean;
    /** Hide the name and show only the logo/swatch. */
    hideName?: boolean;
    testID?: string;
}

/**
 * Team logo (circle with a 1px ring) or colour swatch plus the name (spec 0.7). Props only.
 * The name has `flexShrink: 1` and `minWidth: 0`, so wrap it in a width-bounded parent.
 */
export default function TeamBadge({ name, color, logoUrl, size = 24, lines = 1, bold, muted, strike, hideName, testID }: Props) {
    const tone = muted ? 'text-gray-500 dark:text-cyber-muted' : 'text-gray-900 dark:text-cyber-text';
    return (
        <View testID={testID} accessible accessibilityLabel={name} className="flex-row items-center" style={{ minWidth: 0 }}>
            {logoUrl ? (
                <Image
                    source={{ uri: logoUrl }}
                    accessibilityIgnoresInvertColors
                    className="rounded-full border border-gray-200 dark:border-cyber-border"
                    style={{ width: size, height: size }}
                />
            ) : (
                <View
                    className="w-2.5 h-2.5 rounded-full border border-gray-200 dark:border-cyber-border"
                    style={{ backgroundColor: color || '#9ca3af' }}
                />
            )}
            {hideName ? null : (
                <Text
                    numberOfLines={lines}
                    className={`ms-2 text-[14px] ${bold ? 'font-extrabold' : 'font-semibold'} ${tone} ${strike ? 'line-through' : ''}`}
                    style={{ flexShrink: 1, minWidth: 0 }}
                >
                    {name}
                </Text>
            )}
        </View>
    );
}
