import React from 'react';
import { View, Text, TouchableOpacity, Image, ViewStyle, I18nManager } from "react-native";
import { Game } from "@/types/game";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

const SPORT_IMAGES: Record<string, string> = {
    SOCCER: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800",
    BASKETBALL: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&q=80&w=800",
    TENNIS: "https://images.unsplash.com/photo-1622279457486-62dcc4a4bd13?auto=format&fit=crop&q=80&w=800",
    DEFAULT: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80&w=800"
};

const SPORT_LABELS: Record<string, string> = {
    SOCCER: "כדורגל",
    BASKETBALL: "כדורסל",
    TENNIS: "טניס",
};

interface GameCardProps {
    game: Game;
    isJoined?: boolean;
    children?: React.ReactNode;
}

export default function GameCard({ game, isJoined, children }: GameCardProps) {
    const router = useRouter();
    const { t } = useTranslation();
    const sportKey = (game.sport || "DEFAULT").toUpperCase();
    const sportImg = SPORT_IMAGES[sportKey] || SPORT_IMAGES.DEFAULT;
    const sportLabel = SPORT_LABELS[sportKey] || game.sport || t("sport");
    const occupancyPercentage = Math.min((game.currentPlayers / game.maxPlayers) * 100, 100);
    const isFull = game.currentPlayers >= game.maxPlayers;
    const spotsLeft = Math.max(0, game.maxPlayers - game.currentPlayers);
    const almostFull = !isFull && spotsLeft <= 2;

    const displayDate = game.date?.includes('-')
        ? game.date.split('-').reverse().slice(0, 2).join('/')
        : game.date;

    return (
        <TouchableOpacity
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
            {/* Image with overlay chips (contained – no edge bleed) */}
            <View className="relative h-36 overflow-hidden">
                <Image source={{ uri: sportImg }} className="w-full h-full" resizeMode="cover" />
                <View className="absolute inset-0 bg-black/35" />

                <View className="absolute inset-0 p-3 justify-between">
                    <View className="flex-row justify-between items-start">
                        <View className="bg-black/55 px-2.5 py-1 rounded-full max-w-[58%]">
                            <Text className="text-white text-xs font-bold" numberOfLines={1}>
                                {sportLabel}
                            </Text>
                        </View>
                        {isJoined && (
                            <View className="bg-brand px-2.5 py-1 rounded-full flex-row items-center">
                                <Ionicons name="checkmark-circle" size={12} color="#fff" />
                                <Text className="text-white text-xs font-bold ml-1">{t("joined")}</Text>
                            </View>
                        )}
                    </View>

                    <View className="flex-row justify-between items-end">
                        <View className="bg-black/55 px-2.5 py-1 rounded-full flex-row items-center max-w-[72%]">
                            <Ionicons name="time-outline" size={12} color="#fff" />
                            <Text className="text-white text-xs font-bold ml-1" numberOfLines={1}>
                                {displayDate ? `${displayDate} • ` : ''}{game.time}
                            </Text>
                        </View>
                        {typeof game.price === 'number' && game.price > 0 && (
                            <View className="bg-brand-pale px-2.5 py-1 rounded-full">
                                <Text className="text-brand-ink text-xs font-black">₪{game.price}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            <View className={`p-4 ${isJoined ? 'bg-brand-mist/40' : ''}`}>
                <Text
                    className="text-lg font-black text-gray-900 dark:text-cyber-text mb-1"
                    style={{ textAlign: I18nManager.isRTL ? 'right' : 'left', writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr' }}
                    numberOfLines={2}
                >
                    {game.title || game.fieldName || t("game")}
                </Text>

                <View className="flex-row items-center mb-3">
                    <Ionicons name="location-outline" size={14} color="#94a3b8" />
                    <Text
                        className="ml-1 text-gray-500 dark:text-cyber-muted text-xs flex-1"
                        numberOfLines={1}
                        style={{ textAlign: I18nManager.isRTL ? 'right' : 'left' }}
                    >
                        {game.fieldLocation || game.fieldName}
                    </Text>
                </View>

                <View className="mb-3">
                    <View className="flex-row justify-between items-center mb-1.5">
                        <Text className="text-[10px] font-bold text-gray-400 uppercase">
                            {game.currentPlayers}/{game.maxPlayers}
                            {game.teamSize ? ` • ${game.teamSize}X${game.teamSize}` : ''}
                        </Text>
                        <Text className={`text-xs font-bold ${
                            isFull ? 'text-red-500' : almostFull ? 'text-amber-500' : 'text-gray-500'
                        }`}>
                            {isFull ? t("full") : `נשארו ${spotsLeft}`}
                        </Text>
                    </View>
                    <View className="h-1.5 bg-gray-100 dark:bg-cyber-border rounded-full overflow-hidden">
                        <View
                            style={{ width: `${occupancyPercentage}%` } as ViewStyle}
                            className={`h-full rounded-full ${
                                isFull ? 'bg-red-500' : almostFull ? 'bg-amber-500' : 'bg-brand'
                            }`}
                        />
                    </View>
                </View>

                {children && (
                    <View className="pt-3 border-t border-gray-100 dark:border-cyber-border">
                        {children}
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}
