import React, { useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { gamesApi } from "@/services/api";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { Ionicons } from "@expo/vector-icons";

export default function JoinGameButton({
    gameId,
    registrationOpensAt,
    onJoined
}: {
    gameId: string;
    registrationOpensAt?: string | null;
    onJoined?: () => void;
}) {
    const { getToken } = useAuth();
    const { user } = useUser();
    const { notifyGameUpdate } = useGameUpdate();
    const [loading, setLoading] = useState(false);

    const now = new Date();
    const openDate = registrationOpensAt ? new Date(registrationOpensAt) : null;
    const isRegistrationClosed = openDate && now < openDate;

    const join = async () => {
        if (isRegistrationClosed || loading) return;
        setLoading(true);
        try {
            const token = await getToken().catch(() => "");
            if (!token) throw new Error("Unauthorized");

            await gamesApi.join(gameId, token);
            notifyGameUpdate(gameId, "join", user?.id || "");
            if (onJoined) onJoined();
        } catch (e: any) {
            console.error("Join Failed:", e);
            alert(e.message || "Failed to join game");
        } finally {
            setLoading(true); // Keep loading state until navigation or update, or just reset
            setLoading(false);
        }
    };

    if (isRegistrationClosed && openDate) {
        const timeStr = openDate.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
        return (
            <TouchableOpacity
                disabled
                className="bg-gray-100 flex-row items-center justify-center p-3 rounded-xl border border-gray-200"
            >
                <Ionicons name="lock-closed" size={16} color="#6b7280" />
                <Text className="ml-2 text-gray-500 font-bold">Opens at {timeStr}</Text>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            onPress={join}
            disabled={loading}
            className={`flex-row items-center justify-center p-3 rounded-xl shadow-sm ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
        >
            {loading ? (
                <ActivityIndicator size="small" color="white" />
            ) : (
                <>
                    <Ionicons name="add" size={20} color="white" />
                    <Text className="ml-1 text-white font-bold text-base">הצטרף</Text>
                </>
            )}
        </TouchableOpacity>
    );
}
