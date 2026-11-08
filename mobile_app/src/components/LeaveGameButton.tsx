import React, { useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator, Alert } from "react-native";
import SuccessorPickerModal, { eligibleSuccessors, type AdminCandidate } from "./SuccessorPickerModal";
import { gamesApi } from "@/services/api";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { appAlert } from "@/i18n/appAlert";

export default function LeaveGameButton({
    gameId,
    onLeft,
    organizerId,
    participants
}: {
    gameId: string;
    onLeft?: () => void;
    /** When the viewer is the organizer, leaving requires appointing a successor from `participants`. */
    organizerId?: string | null;
    participants?: AdminCandidate[];
}) {
    const { getToken } = useAuth();
    const { user } = useUser();
    const { notifyGameUpdate } = useGameUpdate();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const isOrganizer = !!user?.id && organizerId === user.id;
    const candidates = eligibleSuccessors(participants, user?.id);

    const handleLeave = () => {
        if (isOrganizer) {
            setPickerOpen(true);
            return;
        }
        Alert.alert(
            t("game.leaveGame"),
            t("game.confirmLeave"),
            [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("game.leave"), style: "destructive", onPress: () => leave() }
            ]
        );
    };

    const leave = async (successorId?: string) => {
        setPickerOpen(false);
        setLoading(true);
        try {
            const token = await getToken().catch(() => "");
            if (!token) throw new Error("Unauthorized");

            await gamesApi.leave(gameId, token, successorId);
            notifyGameUpdate(gameId, "leave", user?.id || "");
            if (onLeft) onLeft();
        } catch (e: any) {
            console.error("Leave Failed:", e);
            appAlert(t('common.error'), e.message || t('game.leaveFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
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
                    <Text numberOfLines={1} ellipsizeMode="tail" className="ml-1 text-red-600 font-bold text-base flex-shrink">{t("game.leave")}</Text>
                </>
            )}
        </TouchableOpacity>
        <SuccessorPickerModal
            visible={pickerOpen}
            candidates={candidates}
            onPick={(id) => leave(id)}
            onCancel={() => setPickerOpen(false)}
        />
        </>
    );
}
