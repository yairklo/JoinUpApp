import React from "react";
import { View, Text, Image, TouchableOpacity, ViewStyle } from "react-native";
import { Game } from "@/types/game";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Link } from "expo-router";

const SPORT_IMAGES: Record<string, string> = {
    SOCCER: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800",
    BASKETBALL: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&q=80&w=800",
    TENNIS: "https://images.unsplash.com/photo-1622279457486-62dcc4a4bd13?auto=format&fit=crop&q=80&w=800",
    DEFAULT: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80&w=800"
};

interface GameCardProps {
    game: Game;
    isJoined?: boolean;
    children?: React.ReactNode;
}

export default function GameCard({ game, isJoined, children }: GameCardProps) {
    const sportImg = SPORT_IMAGES[game.sport?.toUpperCase() || "DEFAULT"] || SPORT_IMAGES.DEFAULT;
    const occupancyPercentage = Math.min((game.currentPlayers / game.maxPlayers) * 100, 100);
    const isFull = game.currentPlayers >= game.maxPlayers;

    // Date formatting (DD/MM)
    const displayDate = game.date?.includes('-') ? game.date.split('-').reverse().slice(0, 2).join('/') : game.date;

    return (
        <View
            className={`bg-white rounded-3xl overflow-hidden shadow-lg shadow-gray-200 mb-6 border ${isJoined ? 'border-green-200' : 'border-gray-50'}`}
        >
            {/* Image Section */}
            <View className="relative h-40">
                <Image source={{ uri: sportImg }} className="w-full h-full" />
                <View className="absolute top-4 left-4 bg-black/50 px-3 py-1.5 rounded-full border border-white/20">
                    <Text className="text-white text-xs font-bold">{game.sport || "Sport"}</Text>
                </View>
                {isJoined && (
                    <View className="absolute top-4 right-4 bg-green-500 px-3 py-1.5 rounded-full shadow-sm">
                        <Text className="text-white text-xs font-bold">צטרפת ✅</Text>
                    </View>
                )}
            </View>

            {/* Content Section */}
            <View className={`p-5 ${isJoined ? 'bg-green-50/30' : ''}`}>
                <View className="flex-row justify-between items-center mb-3">
                    <View className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-xl">
                        <Ionicons name="time-outline" size={14} color="#2563eb" />
                        <Text className="ml-1.5 text-blue-700 font-bold text-xs">
                            {displayDate} • {game.time}
                        </Text>
                    </View>
                    <View className="flex-row items-center">
                        {game.price ? (
                            <View className="bg-green-50 px-2 py-1 rounded-lg border border-green-100 mr-2">
                                <Text className="text-green-700 font-bold text-[10px]">{game.price}₪</Text>
                            </View>
                        ) : null}
                        <View className="bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                            <Text className="text-gray-600 font-bold text-[10px]">
                                {game.teamSize ? `${game.teamSize}X${game.teamSize}` : `${game.maxPlayers} Players`}
                            </Text>
                        </View>
                    </View>
                </View>

                <Text className="text-xl font-black text-gray-900 mb-1" numberOfLines={1}>
                    {game.title || game.fieldName || "משחק כדורגל"}
                </Text>
                <View className="flex-row items-center mb-4">
                    <Ionicons name="location-outline" size={12} color="#9ca3af" />
                    <Text className="ml-1 text-gray-400 text-xs flex-1" numberOfLines={1}>
                        {game.fieldLocation}
                    </Text>
                </View>

                {/* Capacity Bar */}
                <View className="mb-4">
                    <View className="flex-row justify-between items-center mb-1.5">
                        <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">תפוסה</Text>
                        <Text className={`text-xs font-black ${isFull ? 'text-red-500' : 'text-blue-600'}`}>
                            {game.currentPlayers}/{game.maxPlayers} {isFull ? '(מלא)' : ''}
                        </Text>
                    </View>
                    <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <View
                            style={{ width: `${occupancyPercentage}%` } as ViewStyle}
                            className={`h-full rounded-full ${isFull ? 'bg-red-500' : 'bg-blue-600'}`}
                        />
                    </View>
                </View>

                {/* Footer Actions */}
                <View className="flex-row items-center justify-between mt-2">
                    <View className="flex-1 mr-3">
                        {children}
                    </View>
                    <Link href={`/game/${game.id}`} asChild>
                        <TouchableOpacity className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <Ionicons name="arrow-forward" size={20} color="#4b5563" />
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>
        </View>
    );
}
