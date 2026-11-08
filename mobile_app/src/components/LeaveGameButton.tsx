import React, { useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator, Alert, Modal, View, FlatList } from "react-native";
import { gamesApi } from "@/services/api";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { appAlert } from "@/i18n/appAlert";

export type AdminCandidate = { id: string; name?: string | null };

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
    const candidates = (participants || []).filter((p) => p.id !== user?.id);

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
        <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
            <View className="flex-1 justify-center bg-black/40 px-6">
                <View className="bg-white rounded-2xl p-4 max-h-96">
                    <Text className="text-lg font-bold mb-1">{t("game.appointAdminTitle")}</Text>
                    <Text className="text-gray-600 mb-3">{t("game.appointAdminBody")}</Text>
                    {candidates.length === 0 ? (
                        <Text className="text-gray-500 py-3">{t("game.appointAdminNone")}</Text>
                    ) : (
                        <FlatList
                            data={candidates}
                            keyExtractor={(c) => c.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => leave(item.id)}
                                    className="py-3 border-b border-gray-100"
                                >
                                    <Text className="text-base">{item.name || t("common.user", { defaultValue: "User" })}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                    <TouchableOpacity onPress={() => setPickerOpen(false)} className="pt-3 items-center">
                        <Text className="text-gray-600 font-bold">{t("common.cancel")}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
        </>
    );
}
