import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import BouncingBall from "./BouncingBall";

function Bone({ className }: { className: string }) {
    return <View className={`bg-gray-200 rounded-lg ${className}`} />;
}

/**
 * Loading state for game/[id].tsx, shown while the game details fetch is in
 * flight. Mirrors that screen's section layout (header, utility actions,
 * map, participants) as skeletons so the swap to real content doesn't jump
 * around, with a bouncing-ball motif in place of a plain spinner — the
 * mobile counterpart of next_app's games/[id]/loading.tsx.
 */
export default function GameDetailsSkeleton() {
    const router = useRouter();
    const { t } = useTranslation();

    return (
        <SafeAreaView edges={["top"]} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="flex-1 text-xl font-bold text-gray-900">{t("game.details")}</Text>
            </View>

            <View className="flex-1 bg-gray-50">
                <View className="bg-white p-6 mb-4 shadow-sm items-center justify-center">
                    <BouncingBall />
                    <Text className="text-gray-400 mt-2">טוען את המשחק…</Text>
                </View>

                <View className="bg-white p-4 mb-4 shadow-sm flex-row justify-around border-y border-gray-100">
                    {[0, 1, 2].map((i) => (
                        <View key={i} className="items-center">
                            <View className="w-12 h-12 bg-gray-100 rounded-full mb-1" />
                            <Bone className="w-8 h-2" />
                        </View>
                    ))}
                </View>

                <View className="bg-white p-4 mb-4 shadow-sm border-b border-gray-100">
                    <Bone className="w-40 h-4 mb-3" />
                    <View className="h-48 rounded-xl bg-gray-100" />
                </View>

                <View className="bg-white p-6 shadow-sm">
                    <View className="flex-row justify-between items-center mb-4">
                        <Bone className="w-24 h-4" />
                        <Bone className="w-10 h-4" />
                    </View>
                    <View className="flex-row flex-wrap">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <View key={i} className="ml-4 mb-4 items-center w-16">
                                <View className="w-12 h-12 bg-gray-100 rounded-full mb-1" />
                                <Bone className="w-10 h-2" />
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
}
