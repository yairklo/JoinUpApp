import React, { useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator, Alert } from "react-native";
import { gamesApi } from "@/services/api";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { Ionicons } from "@expo/vector-icons";

export default function LeaveGameButton({
    gameId,
    onLeft
}: {
    gameId: string;
    onLeft?: () => void;
}) {
    const { getToken } = useAuth();
    const { user } = useUser();
    const { notifyGameUpdate } = useGameUpdate();
    const [loading, setLoading] = useState(false);

    const handleLeave = () => {
        Alert.alert(
            "עזיבת משחק",
            "האם אתה בטוח שברצונך לעזוב את המשחק?",
            [
                { text: "ביטול", style: "cancel" },
                { text: "עזוב", style: "destructive", onPress: leave }
            ]
        );
    };

    const leave = async () => {
        setLoading(true);
        try {
            const token = await getToken().catch(() => "");
            if (!token) throw new Error("Unauthorized");

            await gamesApi.leave(gameId, token);
            notifyGameUpdate(gameId, "leave", user?.id || "");
            if (onLeft) onLeft();
        } catch (e: any) {
            console.error("Leave Failed:", e);
            alert(e.message || "Failed to leave game");
        } finally {
            setLoading(false);
        }
    };

    return (
        <TouchableOpacity
            onPress={handleLeave}
            disabled={loading}
            className={`flex-row items-center justify-center p-3 rounded-xl border border-red-100 ${loading ? 'bg-red-50' : 'bg-red-50'}`}
        >
            {loading ? (
                <ActivityIndicator size="small" color="#dc2626" />
            ) : (
                <>
                    <Ionicons name="exit-outline" size={20} color="#dc2626" />
                    <Text className="ml-1 text-red-600 font-bold text-base">עזוב</Text>
                </>
            )}
        </TouchableOpacity>
    );
}
