import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle, I18nManager } from "react-native";
import { Game } from "@/types/game";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { SPORT_MAPPING } from '@/utils/sports';
import { formatJerusalemDate } from '@/utils/timezone';
import SportCover, { getSportTheme, resolveSportKey, SPORT_GLYPH } from '@/components/ui/SportCover';

interface GameCardProps {
    game: Game;
    isJoined?: boolean;
    children?: React.ReactNode;
    /** Title lines (ellipsized after). Use 1 for horizontal carousels so cards stay compact and equal height. */
    titleLines?: 1 | 2;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default function GameCard({ game, isJoined, children, titleLines = 2 }: GameCardProps) {
    const router = useRouter();
    const { t } = useTranslation();
    const sportKey = (game.sport || "DEFAULT").toUpperCase();
    const themeKey = resolveSportKey(game.sport);
    const theme = getSportTheme(game.sport);
    const sportLabel = t('sports.' + sportKey.toLowerCase(), SPORT_MAPPING[sportKey] || game.sport || t("sports.sport", "ספורט"));
    const occupancyPercentage = Math.min((game.currentPlayers / game.maxPlayers) * 100, 100);
    const isFull = game.currentPlayers >= game.maxPlayers;
    const spotsLeft = Math.max(0, game.maxPlayers - game.currentPlayers);
    const almostFull = !isFull && spotsLeft <= 2;

    const displayDate = game.date?.includes('-')
        ? game.date.split('-').reverse().slice(0, 2).join('/')
        : game.date;
    const now = Date.now();
    const dayLabel = game.date === formatJerusalemDate(now)
        ? t('common.today', 'היום')
        : game.date === formatJerusalemDate(now + DAY_MS)
            ? t('common.tomorrow', 'מחר')
            : displayDate;
    const whenLabel = [dayLabel, game.time].filter(Boolean).join(' · ');

    const textAlign = I18nManager.isRTL ? 'right' : 'left';
    const barColor = isFull ? '#ef4444' : almostFull ? '#f59e0b' : theme.base;

    return (
        <TouchableOpacity
            testID={`game-card-${game.id}`}
            activeOpacity={0.92}
            onPress={() => router.push(`/game/${game.id}`)}
            className={`bg-white dark:bg-cyber-card rounded-3xl overflow-hidden border ${
                isJoined ? 'border-brand-light' : 'border-gray-100 dark:border-cyber-border'
            }`}
            style={{
                shadowColor: isJoined ? '#059669' : '#0f172a',
                shadowOpacity: isJoined ? 0.18 : 0.06,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
            }}
        >
            <SportCover sport={game.sport} height={132}>
                <View className="flex-1 p-3 justify-between">
                    <View className="flex-row justify-between items-start">
                        <View
                            className="px-2.5 py-1 rounded-full flex-row items-center max-w-[60%]"
                            style={{ backgroundColor: 'rgba(0,0,0,0.28)' }}
                        >
                            <MaterialCommunityIcons name={SPORT_GLYPH[themeKey]} size={13} color="#fff" />
                            <Text className="text-white text-xs font-bold ms-1" numberOfLines={1}>
                                {sportLabel}
                            </Text>
                        </View>
                        {isJoined && (
                            <View className="bg-brand px-2.5 py-1 rounded-full flex-row items-center">
                                <Ionicons name="checkmark-circle" size={12} color="#fff" />
                                <Text className="text-white text-xs font-bold ms-1">{t("game.joined", "הצטרפת")}</Text>
                            </View>
                        )}
                    </View>

                    {typeof game.price === 'number' && game.price > 0 && (
                        <View className="flex-row justify-end">
                            <View className="bg-white/90 px-2.5 py-1 rounded-full">
                                <Text className="text-gray-900 text-xs font-black">₪{game.price}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </SportCover>

            <View className={`px-4 pt-3.5 pb-4 ${isJoined ? 'bg-brand-mist/40 dark:bg-transparent' : ''}`}>
                {!!whenLabel && (
                    <Text
                        className="text-brand dark:text-brand-light mb-1"
                        style={{ fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign }}
                        numberOfLines={1}
                    >
                        {whenLabel}
                    </Text>
                )}

                <Text
                    className="text-gray-900 dark:text-cyber-text mb-1"
                    style={{
                        fontSize: 17,
                        fontWeight: '700',
                        lineHeight: 22,
                        // Always reserve all title lines so cards in a row have equal height
                        // regardless of title length (see mobile-layout.mdc).
                        minHeight: titleLines * 22,
                        textAlign,
                        writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
                    }}
                    numberOfLines={titleLines}
                >
                    {game.title || game.fieldName || t("search.game", "משחק")}
                </Text>

                <View className="flex-row items-center mb-3">
                    <Ionicons name="location-outline" size={14} color="#9ca3af" />
                    <Text
                        className="ms-1 text-gray-500 dark:text-cyber-muted flex-1"
                        style={{ fontSize: 13, textAlign }}
                        numberOfLines={1}
                    >
                        {game.fieldLocation || game.fieldName}
                    </Text>
                </View>

                <View className="flex-row items-center">
                    <Text
                        className="text-gray-900 dark:text-cyber-text"
                        style={{ fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}
                    >
                        {game.currentPlayers}/{game.maxPlayers}
                        {game.teamSize ? (
                            <Text className="text-gray-400 dark:text-cyber-muted" style={{ fontWeight: '500' }}>
                                {` · ${game.teamSize}X${game.teamSize}`}
                            </Text>
                        ) : null}
                    </Text>
                    <View className="flex-1 mx-3 h-1 bg-gray-100 dark:bg-cyber-border rounded-full overflow-hidden">
                        <View
                            style={{ width: `${occupancyPercentage}%`, backgroundColor: barColor } as ViewStyle}
                            className="h-full rounded-full"
                        />
                    </View>
                    <Text
                        className={isFull ? 'text-red-500' : almostFull ? 'text-amber-500' : 'text-gray-500 dark:text-cyber-muted'}
                        style={{ fontSize: 12, fontWeight: '600' }}
                    >
                        {isFull ? t("game.full", "מלא") : t("game.spotsLeft", { count: spotsLeft, defaultValue: `נשארו ${spotsLeft}` })}
                    </Text>
                </View>

                {children && (
                    <View className="mt-3 pt-3 border-t border-gray-100 dark:border-cyber-border">
                        {children}
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}
