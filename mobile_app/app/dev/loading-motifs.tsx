import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LOADING_MOTIFS, LOADING_MOTIF_FAMILY_LABELS } from "@joinup/shared";
import LoadingMotif from "@/components/loading/LoadingMotif";

/**
 * Internal picker: preview every loading motif on native so we can choose
 * which screen gets which animation. Web twin: /dev/loading-motifs.
 */
export default function LoadingMotifsPreviewScreen() {
    const router = useRouter();

    return (
        <SafeAreaView edges={["top"]} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3" accessibilityRole="button">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 flex-1">אנימציות טעינה</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} className="bg-gray-50">
                <Text className="text-gray-500 mb-4 leading-5">
                    אותם מזהים כמו בווב. דף המשחק כבר משתמש ב-bouncing-ball. בחרו מוטיב למסכים אחרים — עוד לא חיברנו אותם.
                </Text>
                {LOADING_MOTIFS.map((motif) => (
                    <View key={motif.id} className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
                        <View className="h-40 items-center justify-center bg-slate-50 rounded-xl mb-3">
                            <LoadingMotif id={motif.id} />
                        </View>
                        <View className="flex-row items-center mb-1">
                            <Text className="text-lg font-bold text-gray-900 flex-1">{motif.labelHe}</Text>
                            <View className="bg-emerald-50 px-2 py-1 rounded-full">
                                <Text className="text-emerald-700 text-xs font-semibold">
                                    {LOADING_MOTIF_FAMILY_LABELS[motif.family].he}
                                </Text>
                            </View>
                        </View>
                        <Text className="text-xs text-gray-400 mb-1" style={{ fontFamily: "monospace" }}>
                            {motif.id}
                        </Text>
                        <Text className="text-sm text-gray-500">{motif.suggestedHe}</Text>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}
