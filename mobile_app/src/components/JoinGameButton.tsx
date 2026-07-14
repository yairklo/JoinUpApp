import React, { useEffect, useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator, View, Alert } from "react-native";
import { gamesApi } from "@/services/api";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { hasWaitlistOffer } from "@/utils/waitlistOffer";

export default function JoinGameButton({
    gameId,
    registrationOpensAt,
    joinPolicy,
    viewerParticipationStatus,
    waitlistOfferPending,
    isFull,
    onJoined,
    onRequestSent,
}: {
    gameId: string;
    registrationOpensAt?: string | null;
    joinPolicy?: "INSTANT" | "REQUIRES_APPROVAL";
    viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | null;
    waitlistOfferPending?: boolean;
    /** When true, join goes to the standby queue — do not bump currentPlayers. */
    isFull?: boolean;
    onJoined?: () => void;
    onRequestSent?: () => void;
}) {
    const { getToken } = useAuth();
    const { user } = useUser();
    const { t } = useTranslation();
    const { notifyGameUpdate } = useGameUpdate();
    const [loading, setLoading] = useState(false);
    const offerFromProps = hasWaitlistOffer({
        waitlistOfferPending,
        viewerParticipationStatus,
        joinPolicy,
    });
    const [pending, setPending] = useState(false);
    const [offerPending, setOfferPending] = useState(offerFromProps);
    const [waitlisted, setWaitlisted] = useState(
        viewerParticipationStatus === "WAITLISTED" && !offerFromProps
    );

    useEffect(() => {
        // Any PENDING row gets accept/decline — same as game detail (never dead-end on "ממתין לאישור").
        const offer = hasWaitlistOffer({
            waitlistOfferPending,
            viewerParticipationStatus,
            joinPolicy,
        });
        setOfferPending(offer);
        setPending(false);
        setWaitlisted(viewerParticipationStatus === "WAITLISTED" && !offer);
    }, [viewerParticipationStatus, waitlistOfferPending, joinPolicy]);

    // A REQUIRES_APPROVAL rejection is terminal (server blocks re-requesting); an INSTANT game lets
    // a previously-rejected user join normally, so this only locks the button for the approval flow.
    const isRejectedTerminal = viewerParticipationStatus === "REJECTED" && joinPolicy === "REQUIRES_APPROVAL";

    const now = new Date();
    const openDate = registrationOpensAt ? new Date(registrationOpensAt) : null;
    const isRegistrationClosed = openDate && now < openDate;

    const join = async () => {
        if (isRegistrationClosed || loading || pending || offerPending) return;
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

            if (result.viewerParticipationStatus === "WAITLISTED" || isFull) {
                // Waitlist join — keep roster count stable; only bump waitlist locally.
                setWaitlisted(true);
                notifyGameUpdate(gameId, "waitlist", user?.id || "");
                Alert.alert("Success", "נרשמת לרשימת ההמתנה");
                if (onJoined) onJoined();
                return;
            }

            notifyGameUpdate(gameId, "join", user?.id || "");
            if (onJoined) onJoined();
        } catch (e: any) {
            console.error("Join Failed:", e);
            alert(e.message || "ההצטרפות נכשלה");
        } finally {
            setLoading(false);
        }
    };

    const confirmWaitlist = async (accept: boolean) => {
        if (loading) return;
        setLoading(true);
        try {
            const token = await getToken().catch(() => "");
            if (!token) throw new Error("Unauthorized");
            await gamesApi.waitlistConfirm(gameId, accept, token);
            setOfferPending(false);
            if (accept) {
                notifyGameUpdate(gameId, "join", user?.id || "");
            } else {
                setWaitlisted(false);
            }
            Alert.alert("הצלחה", accept ? "הצטרפת למשחק בהצלחה!" : "ויתרת על המקום בהצלחה");
            if (onJoined) onJoined();
        } catch (e: any) {
            console.error("Waitlist confirm failed:", e);
            Alert.alert("שגיאה", e.message || "לא הצלחנו לעבד את הצעת ההמתנה");
        } finally {
            setLoading(false);
        }
    };

    if (offerPending) {
        return (
            <View className="gap-2">
                <Text className="text-amber-800 font-bold text-xs text-center mb-1">
                    התפנה מקום במשחק! המקום שמור לך.
                </Text>
                <View className="flex-row gap-2">
                    <TouchableOpacity
                        onPress={() => confirmWaitlist(true)}
                        disabled={loading}
                        className={`flex-1 flex-row items-center justify-center p-3 rounded-xl ${loading ? 'bg-green-400' : 'bg-green-600'}`}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <Text numberOfLines={1} className="text-white font-bold text-sm">אישור הצטרפות</Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => confirmWaitlist(false)}
                        disabled={loading}
                        className={`flex-1 flex-row items-center justify-center p-3 rounded-xl ${loading ? 'bg-red-400' : 'bg-red-600'}`}
                    >
                        <Text numberOfLines={1} className="text-white font-bold text-sm">ויתור</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (waitlisted) {
        return (
            <TouchableOpacity
                disabled
                className="bg-gray-100 flex-row items-center justify-center p-3 rounded-xl border border-gray-200"
            >
                <Ionicons name="time-outline" size={16} color="#6b7280" />
                <Text numberOfLines={1} ellipsizeMode="tail" className="ml-2 text-gray-600 font-bold flex-shrink">
                    ברשימת המתנה
                </Text>
            </TouchableOpacity>
        );
    }

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

    const label = isFull
        ? "הצטרף לרשימת המתנה"
        : joinPolicy === "REQUIRES_APPROVAL"
            ? t("game.requestToJoin")
            : t("game.join");

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
                    <Ionicons name={isFull ? "hourglass-outline" : "add"} size={20} color="white" />
                    <Text numberOfLines={1} ellipsizeMode="tail" className="ml-1 text-white font-bold text-base flex-shrink">
                        {label}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}
