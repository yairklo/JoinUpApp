import React, { useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { gamesApi } from "@/services/api";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export default function JoinGameButton({
    gameId,
    registrationOpensAt,
    joinPolicy,
    viewerParticipationStatus,
    onJoined,
    onRequestSent
}: {
    gameId: string;
    registrationOpensAt?: string | null;
    joinPolicy?: "INSTANT" | "REQUIRES_APPROVAL";
    viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | null;
    onJoined?: () => void;
    onRequestSent?: () => void;
}) {
    const { getToken } = useAuth();
    const { user } = useUser();
    const { t } = useTranslation();
    const { notifyGameUpdate } = useGameUpdate();
    const [loading, setLoading] = useState(false);
    // Seed from server-provided status so a hard refresh doesn't forget an in-flight request.
    const [pending, setPending] = useState(viewerParticipationStatus === "PENDING");
    // A REQUIRES_APPROVAL rejection is terminal (server blocks re-requesting); an INSTANT game lets
    // a previously-rejected user join normally, so this only locks the button for the approval flow.
    const isRejectedTerminal = viewerParticipationStatus === "REJECTED" && joinPolicy === "REQUIRES_APPROVAL";

    const now = new Date();
    const openDate = registrationOpensAt ? new Date(registrationOpensAt) : null;
    const isRegistrationClosed = openDate && now < openDate;

    const join = async () => {
        if (isRegistrationClosed || loading || pending) return;
        setLoading(true);
        try {
            const token = await getToken().catch(() => "");
            if (!token) throw new Error("Unauthorized");

            const result = await gamesApi.join(gameId, token);
            if (result.pending) {
                setPending(true);
                if (onRequestSent) onRequestSent();
                return;
            }
            notifyGameUpdate(gameId, "join", user?.id || "");
            if (onJoined) onJoined();
        } catch (e: any) {
            console.error("Join Failed:", e);
            alert(e.message || "Failed to join game");
        } finally {
            setLoading(false);
        }
    };

    if (pending) {
        return (
            <TouchableOpacity
                disabled
                className="bg-amber-50 flex-row items-center justify-center p-3 rounded-xl border border-amber-200"
            >
                <Ionicons name="time-outline" size={16} color="#b45309" />
                <Text numberOfLines={1} ellipsizeMode="tail" className="ml-2 text-amber-700 font-bold flex-shrink">{t("game.requestPending")}</Text>
            </TouchableOpacity>
        );
    }

    if (isRejectedTerminal) {
        return (
            <TouchableOpacity
                disabled
                className="bg-gray-100 flex-row items-center justify-center p-3 rounded-xl border border-gray-200"
            >
                <Ionicons name="close-circle-outline" size={16} color="#6b7280" />
                <Text numberOfLines={1} ellipsizeMode="tail" className="ml-2 text-gray-500 font-bold flex-shrink">{t("game.requestRejected")}</Text>
            </TouchableOpacity>
        );
    }

    if (isRegistrationClosed && openDate) {
        const timeStr = openDate.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
        return (
            <TouchableOpacity
                disabled
                className="bg-gray-100 flex-row items-center justify-center p-3 rounded-xl border border-gray-200"
            >
                <Ionicons name="lock-closed" size={16} color="#6b7280" />
                <Text numberOfLines={1} ellipsizeMode="tail" className="ml-2 text-gray-500 font-bold flex-shrink">{t("game.opensAt", { time: timeStr })}</Text>
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
                    <Text numberOfLines={1} ellipsizeMode="tail" className="ml-1 text-white font-bold text-base flex-shrink">
                        {joinPolicy === "REQUIRES_APPROVAL" ? t("game.requestToJoin") : t("game.join")}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}
