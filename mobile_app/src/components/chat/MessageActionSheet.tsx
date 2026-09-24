import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, ActivityIndicator, ScrollView, I18nManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ChatMessage } from "@/types/chat";
import type { MessageReportReason } from "@/services/api/chats";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const REPORT_REASONS: { value: MessageReportReason; key: string; fallback: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: "OFFENSIVE", key: "chat.reportReasonOffensive", fallback: "תוכן פוגעני", icon: "warning-outline" },
    { value: "HARASSMENT", key: "chat.reportReasonHarassment", fallback: "הטרדה או בריונות", icon: "hand-left-outline" },
    { value: "INAPPROPRIATE", key: "chat.reportReasonInappropriate", fallback: "תוכן לא הולם", icon: "eye-off-outline" },
    { value: "SPAM", key: "chat.reportReasonSpam", fallback: "ספאם", icon: "mail-unread-outline" },
    { value: "OTHER", key: "chat.reportReasonOther", fallback: "אחר", icon: "ellipsis-horizontal-circle-outline" },
];

interface MessageActionSheetProps {
    message: ChatMessage | null;
    isMe: boolean;
    senderName?: string;
    currentUserId?: string | null;
    onClose: () => void;
    onReact: (message: ChatMessage, emoji: string) => void;
    onReply: (message: ChatMessage) => void;
    onEdit: (message: ChatMessage) => void;
    onDelete: (message: ChatMessage) => void;
    onViewProfile?: (userId: string) => void;
    onReport: (message: ChatMessage, reason: MessageReportReason) => Promise<void>;
}

type ActionRow = {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    destructive?: boolean;
    onPress: () => void;
};

export default function MessageActionSheet({
    message, isMe, senderName, currentUserId, onClose, onReact, onReply, onEdit, onDelete, onViewProfile, onReport,
}: MessageActionSheetProps) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<"actions" | "report">("actions");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (message) {
            setMode("actions");
            setSubmitting(false);
        }
    }, [message]);

    if (!message) return null;

    const senderId = message.userId || message.senderId || message.sender?.id;
    const myReaction = currentUserId
        ? Object.values(message.reactions || {}).find((r: any) => Array.isArray(r?.userIds) && r.userIds.includes(currentUserId))?.emoji
        : undefined;
    const text = message.text || message.content || "";

    const run = (fn: () => void) => () => { onClose(); fn(); };

    const actions: ActionRow[] = [
        { key: "reply", label: t("chat.reply", "השב"), icon: "arrow-undo-outline", onPress: run(() => onReply(message)) },
        ...(!isMe && senderId && onViewProfile ? [{
            key: "profile", label: t("chat.viewProfile", "צפה בפרופיל"), icon: "person-circle-outline" as const,
            onPress: run(() => onViewProfile(String(senderId))),
        }] : []),
        ...(isMe ? [
            { key: "edit", label: t("chat.edit", "ערוך"), icon: "create-outline" as const, onPress: run(() => onEdit(message)) },
            { key: "delete", label: t("chat.delete", "מחק"), icon: "trash-outline" as const, destructive: true, onPress: run(() => onDelete(message)) },
        ] : [
            { key: "report", label: t("chat.reportMessage", "דווח על הודעה פוגענית"), icon: "flag-outline" as const, destructive: true, onPress: () => setMode("report") },
        ]),
    ];

    const submitReport = async (reason: MessageReportReason) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            await onReport(message, reason);
            onClose();
        } catch {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable
                onPress={submitting ? undefined : onClose}
                style={{ flex: 1, backgroundColor: "rgba(17,24,39,0.55)", justifyContent: "center", paddingHorizontal: 20 }}
            >
                {/* Stop taps inside the sheet from closing it */}
                <Pressable onPress={() => { }} style={{ alignItems: isMe ? "flex-end" : "flex-start" }}>
                    {mode === "actions" ? (
                        <>
                            {message.status !== "blocked" && (
                                <View
                                    className="flex-row bg-white rounded-full px-2 py-1.5 mb-3"
                                    style={{ shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
                                >
                                    {QUICK_REACTIONS.map((emoji) => {
                                        const selected = myReaction === emoji;
                                        return (
                                            <TouchableOpacity
                                                key={emoji}
                                                onPress={run(() => onReact(message, emoji))}
                                                activeOpacity={0.6}
                                                accessibilityLabel={emoji}
                                                style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: selected ? "#D1FAE5" : "transparent", marginHorizontal: 1 }}
                                            >
                                                <Text style={{ fontSize: 26 }}>{emoji}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}

                            {/* The long-pressed message, lifted above the dimmed chat */}
                            <View
                                className={`px-4 py-3 rounded-3xl mb-3 ${isMe ? "bg-brand rounded-tr-none" : "bg-white rounded-tl-none"}`}
                                style={{ maxWidth: "85%" }}
                            >
                                {!isMe && senderName ? (
                                    <Text className="text-xs font-black text-brand mb-1 text-left">{senderName}</Text>
                                ) : null}
                                <ScrollView style={{ maxHeight: 180 }} bounces={false}>
                                    <Text className={`text-base leading-5 text-left ${isMe ? "text-white" : "text-gray-900"}`}>{text}</Text>
                                </ScrollView>
                            </View>

                            <View
                                className="bg-white rounded-2xl overflow-hidden"
                                style={{ width: 240, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
                            >
                                {actions.map((a, i) => (
                                    <TouchableOpacity
                                        key={a.key}
                                        onPress={a.onPress}
                                        activeOpacity={0.6}
                                        className={`flex-row items-center justify-between px-4 py-3.5 ${i > 0 ? "border-t border-gray-100" : ""}`}
                                    >
                                        <Text className={`text-base text-left ${a.destructive ? "text-red-600 font-semibold" : "text-gray-900"}`}>{a.label}</Text>
                                        <Ionicons name={a.icon} size={20} color={a.destructive ? "#DC2626" : "#374151"} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    ) : (
                        <View
                            className="bg-white rounded-2xl overflow-hidden self-stretch"
                            style={{ shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
                        >
                            <View className="flex-row items-center px-4 pt-4 pb-2">
                                <TouchableOpacity onPress={() => setMode("actions")} disabled={submitting} className="p-1 mr-2">
                                    <Ionicons name={I18nManager.isRTL ? "arrow-forward" : "arrow-back"} size={22} color="#374151" />
                                </TouchableOpacity>
                                <Text className="flex-1 text-lg font-black text-gray-900 text-left">{t("chat.reportTitle", "דיווח על הודעה")}</Text>
                            </View>
                            <Text className="px-4 pb-3 text-sm text-gray-500 text-left">
                                {t("chat.reportSubtitle", "מה הבעיה בהודעה? הדיווח יישלח לצוות הניהול, והשולח לא יידע מי דיווח.")}
                            </Text>
                            {REPORT_REASONS.map((r) => (
                                <TouchableOpacity
                                    key={r.value}
                                    onPress={() => submitReport(r.value)}
                                    disabled={submitting}
                                    activeOpacity={0.6}
                                    className="flex-row items-center px-4 py-3.5 border-t border-gray-100"
                                >
                                    <Ionicons name={r.icon} size={20} color="#DC2626" />
                                    <Text className="flex-1 text-base text-gray-900 text-left mx-3">{t(r.key, r.fallback)}</Text>
                                    <Ionicons name={I18nManager.isRTL ? "chevron-back" : "chevron-forward"} size={18} color="#9CA3AF" />
                                </TouchableOpacity>
                            ))}
                            {submitting && (
                                <View className="absolute inset-0 items-center justify-center bg-white/70">
                                    <ActivityIndicator color="#059669" />
                                </View>
                            )}
                        </View>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
}
