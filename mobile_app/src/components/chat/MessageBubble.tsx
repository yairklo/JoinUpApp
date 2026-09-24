import React, { memo, useMemo, useRef } from "react";
import { View, Text, Image, TouchableOpacity, Pressable, Animated, PanResponder } from "react-native";
import { useTranslation } from "react-i18next";
import { ChatMessage } from "@/types/chat";
import { Ionicons } from "@expo/vector-icons";

interface MessageBubbleProps {
    message: ChatMessage;
    isMe: boolean;
    showAvatar: boolean;
    displayName?: string;
    displayAvatar?: string | null;
    currentUserId?: string | null;
    onLongPress?: (message: ChatMessage) => void;
    onPressUser?: (userId: string) => void;
    onReply?: (message: ChatMessage) => void;
    onReact?: (message: ChatMessage, emoji: string) => void;
}

// Swipe distance (px) that commits a reply, and the max the bubble follows the finger.
const SWIPE_REPLY_THRESHOLD = 56;
const SWIPE_MAX = 80;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_EMOJI = "❤️";

function MessageBubble({
    message,
    isMe,
    showAvatar,
    displayName,
    displayAvatar,
    currentUserId,
    onLongPress,
    onPressUser,
    onReply,
    onReact,
}: MessageBubbleProps) {
    const { t } = useTranslation();
    const reactionsList = Object.entries(message.reactions || {});
    const hasReactions = reactionsList.length > 0;
    const senderId = message.userId || message.senderId || message.sender?.id;
    const senderName = displayName || message.senderName || message.sender?.name || t('game.user', 'User');
    const avatarUri =
        displayAvatar ||
        message.sender?.image ||
        "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";
    const isInteractive = message.status !== 'blocked' && !message.isDeleted;

    const handlePressUser = () => {
        if (senderId && onPressUser) onPressUser(String(senderId));
    };

    // Double-tap = quick ❤️ (Telegram-style). Single tap does nothing, so no delay is added.
    const lastTapRef = useRef(0);
    const handlePress = () => {
        if (!isInteractive || !onReact) return;
        const now = Date.now();
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
            lastTapRef.current = 0;
            onReact(message, DOUBLE_TAP_EMOJI);
        } else {
            lastTapRef.current = now;
        }
    };

    // Swipe-to-reply (WhatsApp-style). Horizontal-only so vertical list scrolling is untouched.
    const translateX = useRef(new Animated.Value(0)).current;
    const latest = useRef({ message, onReply, isInteractive });
    latest.current = { message, onReply, isInteractive };

    const panResponder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
            latest.current.isInteractive && !!latest.current.onReply &&
            Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderMove: (_e, g) => {
            const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, g.dx));
            translateX.setValue(clamped);
        },
        onPanResponderRelease: (_e, g) => {
            if (Math.abs(g.dx) >= SWIPE_REPLY_THRESHOLD) {
                latest.current.onReply?.(latest.current.message);
            }
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        },
        onPanResponderTerminate: () => {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminationRequest: () => false,
    }), [translateX]);

    // dx/translateX are physical, so the hint sits on the physical side the bubble moves away from.
    const leftHintOpacity = translateX.interpolate({
        inputRange: [12, SWIPE_REPLY_THRESHOLD],
        outputRange: [0, 1],
        extrapolate: "clamp",
    });
    const rightHintOpacity = translateX.interpolate({
        inputRange: [-SWIPE_REPLY_THRESHOLD, -12],
        outputRange: [1, 0],
        extrapolate: "clamp",
    });

    const renderReplyHint = (side: "left" | "right", opacity: Animated.AnimatedInterpolation<number>) => (
        <Animated.View
            pointerEvents="none"
            style={{ position: "absolute", top: 0, bottom: 0, [side]: 12, justifyContent: "center", opacity }}
        >
            <View className="w-8 h-8 rounded-full bg-gray-200 items-center justify-center">
                <Ionicons name="arrow-undo" size={16} color="#374151" />
            </View>
        </Animated.View>
    );

    return (
        <View className={`mb-3 px-4 ${hasReactions ? 'pb-3' : ''}`}>
            {/* Reply hint revealed behind the bubble while swiping */}
            {renderReplyHint("left", leftHintOpacity)}
            {renderReplyHint("right", rightHintOpacity)}

            <Animated.View
                {...panResponder.panHandlers}
                style={{ flexDirection: "row", justifyContent: isMe ? "flex-end" : "flex-start", transform: [{ translateX }] }}
            >
                {!isMe && (
                    <View className="w-8 mr-2 justify-end pb-1">
                        {showAvatar ? (
                            <TouchableOpacity onPress={handlePressUser} disabled={!senderId || !onPressUser} activeOpacity={0.7}>
                                <Image
                                    source={{ uri: avatarUri }}
                                    className="w-8 h-8 rounded-full bg-gray-100 border border-gray-100"
                                />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                )}

                <View className="max-w-[75%]">
                    <Pressable
                        onPress={handlePress}
                        onLongPress={() => {
                            if (isInteractive) onLongPress?.(message);
                        }}
                        delayLongPress={300}
                        className={`px-4 py-3 rounded-3xl ${isMe
                                ? 'bg-brand rounded-tr-none shadow-sm shadow-brand-pale'
                                : 'bg-gray-100 rounded-tl-none border border-gray-50'
                            }`}
                    >
                        {!isMe && showAvatar && (
                            <TouchableOpacity onPress={handlePressUser} disabled={!senderId || !onPressUser} activeOpacity={0.7} hitSlop={6}>
                                <Text className="text-xs font-black text-brand mb-1 text-left">
                                    {senderName}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {message.replyTo && (
                            <View className={`mb-2 p-2 rounded-xl border-l-4 ${isMe ? 'bg-brand-dark/50 border-brand-light' : 'bg-gray-200 border-gray-400'}`}>
                                <Text className={`text-[10px] font-bold ${isMe ? 'text-brand-pale' : 'text-gray-500'}`}>
                                    {message.replyTo.senderName || "User"}
                                </Text>
                                <Text className={`text-xs ${isMe ? 'text-brand-mist' : 'text-gray-600'}`} numberOfLines={1}>
                                    {message.replyTo.text}
                                </Text>
                            </View>
                        )}

                        <Text className={`text-base leading-5 ${isMe ? 'text-white' : 'text-gray-900'}`}>
                            {message.isDeleted ? "[Content Removed]" : (message.text || message.content)}
                        </Text>

                        <View className="flex-row items-center justify-end mt-1">
                            {message.isEdited && !message.isDeleted && (
                                <Text className={`text-[9px] mr-1 ${isMe ? 'text-brand-pale' : 'text-gray-400'}`}>{t('chat.edited', 'Edited')}</Text>
                            )}
                            <Text className={`text-[9px] font-medium ${isMe ? 'text-brand-pale' : 'text-gray-400'}`}>
                                {new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                            {isMe && message.status !== 'blocked' && (
                                <View className="ml-1">
                                    <Ionicons
                                        name={message.status === 'read' ? "checkmark-done" : "checkmark"}
                                        size={12}
                                        color={message.status === 'read' ? "#93c5fd" : "#bfdbfe"}
                                    />
                                </View>
                            )}
                        </View>
                    </Pressable>

                    {/* Reactions pill overlapping the bubble's bottom edge; tap to toggle your own */}
                    {hasReactions && (
                        <View
                            className={`flex-row flex-wrap -mt-2 ${isMe ? 'self-end mr-2' : 'self-start ml-2'}`}
                        >
                            {reactionsList.map(([emoji, r]) => {
                                const info = r as { count?: number; userIds?: string[] } | any[];
                                const userIds: string[] = Array.isArray(info) ? info.map((x: any) => x?.userId ?? x) : (info?.userIds || []);
                                const count = Array.isArray(info) ? info.length : (info?.count ?? userIds.length);
                                const mine = !!currentUserId && userIds.includes(currentUserId);
                                return (
                                    <TouchableOpacity
                                        key={emoji}
                                        onPress={() => onReact?.(message, emoji)}
                                        disabled={!onReact || !isInteractive}
                                        activeOpacity={0.7}
                                        className={`flex-row items-center px-2 py-0.5 rounded-full mr-1 border shadow-sm ${mine ? 'bg-brand-mist border-brand-light' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className="text-sm">{emoji}</Text>
                                        {count > 1 && (
                                            <Text className="text-[11px] ml-1 font-bold text-gray-600">{count}</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {isMe && message.status === 'blocked' && (
                        <Text className="text-red-500 text-xs mt-1 px-2">
                            {t('chat.blockedOffensive', 'ההודעה מכילה תוכן פוגעני ולכן לא נשלחה')}
                        </Text>
                    )}
                </View>
            </Animated.View>
        </View>
    );
}

export default memo(MessageBubble, (prev, next) => (
    prev.isMe === next.isMe &&
    prev.showAvatar === next.showAvatar &&
    prev.displayName === next.displayName &&
    prev.displayAvatar === next.displayAvatar &&
    prev.currentUserId === next.currentUserId &&
    prev.message.id === next.message.id &&
    prev.message.text === next.message.text &&
    prev.message.content === next.message.content &&
    prev.message.status === next.message.status &&
    prev.message.isEdited === next.message.isEdited &&
    prev.message.isDeleted === next.message.isDeleted &&
    prev.message.reactions === next.message.reactions &&
    prev.message.replyTo === next.message.replyTo &&
    prev.onPressUser === next.onPressUser &&
    prev.onLongPress === next.onLongPress &&
    prev.onReply === next.onReply &&
    prev.onReact === next.onReact
));
