import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { useChat, ChatPreview, dedupeChatsById } from '@/context/ChatContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import LoadingMotif from '@/components/loading/LoadingMotif';

// Avatar with a neutral placeholder if the image fails to load (e.g. a deleted /uploads file)
const ChatAvatar = ({ uri }: { uri: string }) => {
    const [failedUri, setFailedUri] = useState<string | null>(null);
    if (failedUri === uri) {
        return <View className="bg-gray-200 dark:bg-cyber-card" style={{ width: 52, height: 52, borderRadius: 26 }} />;
    }
    return (
        <Image
            source={{ uri }}
            style={{ width: 52, height: 52, borderRadius: 26 }}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
            onError={() => setFailedUri(uri)}
        />
    );
};

// Time-of-day for today's messages, short date otherwise (presentation of the same timestamp)
const formatChatTime = (createdAt: string | number | Date, language?: string) => {
    const locale = language?.startsWith('en') ? 'en-GB' : 'he-IL';
    const d = new Date(createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString()
        ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
};

// Extracted + memoized chat item — only re-renders when its own data changes
const ChatItem = React.memo(({ item, userId, isTyping, youLabel, noMessagesLabel, language, onPress }: {
    item: ChatPreview;
    userId?: string;
    isTyping?: string;
    youLabel: string;
    noMessagesLabel: string;
    language?: string;
    onPress: () => void;
}) => (
    <TouchableOpacity
        className="flex-row items-stretch px-4 min-h-[72px] bg-white dark:bg-cyber-card"
        onPress={onPress}
    >
        <View className="justify-center py-3">
            <ChatAvatar uri={item.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || '?')}`} />
        </View>
        <View className="flex-1 ms-3 py-3 justify-center border-b border-gray-100 dark:border-white/10" style={{ borderBottomWidth: StyleSheet.hairlineWidth }}>
            <View className="flex-row items-baseline mb-1">
                <Text
                    className={`flex-1 shrink text-base text-gray-900 dark:text-white ${item.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}
                    numberOfLines={1}
                >
                    {item.name}
                </Text>
                {item.lastMessage && (
                    <Text className={`ms-2 text-xs ${item.unreadCount > 0 ? 'text-brand font-semibold' : 'text-gray-400'}`}>
                        {formatChatTime(item.lastMessage.createdAt, language)}
                    </Text>
                )}
            </View>
            <View className="flex-row justify-between items-center">
                <Text
                    className={`text-sm flex-1 ${isTyping ? 'text-brand italic' : item.unreadCount > 0 ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
                    numberOfLines={1}
                >
                    {isTyping
                        ? isTyping
                        : (item.lastMessage
                            ? (item.lastMessage.senderId === userId ? youLabel : '') + item.lastMessage.text
                            : noMessagesLabel)}
                </Text>
                {item.unreadCount > 0 && (
                    <View className="bg-brand rounded-full min-w-[20px] h-5 px-1.5 ms-2 items-center justify-center">
                        <Text className="text-white text-xs font-bold">{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                    </View>
                )}
            </View>
        </View>
    </TouchableOpacity>
), (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.lastMessage?.text === next.item.lastMessage?.text &&
    prev.item.lastMessage?.createdAt === next.item.lastMessage?.createdAt &&
    prev.item.unreadCount === next.item.unreadCount &&
    prev.userId === next.userId &&
    prev.isTyping === next.isTyping
);

export default function ChatsScreen() {
    const { t, i18n } = useTranslation();
    const { user, isLoaded } = useUser();
    const router = useRouter();

    const { chats, loadChats, loadingChats, typingStatus } = useChat();
    const [refreshing, setRefreshing] = useState(false);
    const [tabValue, setTabValue] = useState(0); // 0 = private, 1 = group

    useFocusEffect(
        useCallback(() => {
            if (isLoaded && user) loadChats();
        }, [isLoaded, user, loadChats])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadChats(true);
        setRefreshing(false);
    }, [loadChats]);

    const filteredChats = useMemo(
        () => dedupeChatsById(chats.filter(chat => tabValue === 0 ? chat.type === 'private' : chat.type === 'group')),
        [chats, tabValue]
    );

    const { playersUnread, gamesUnread } = useMemo(() => {
        let players = 0;
        let games = 0;
        for (const chat of chats) {
            if ((chat.unreadCount || 0) <= 0) continue;
            if (chat.type === 'private') players += 1;
            else if (chat.type === 'group') games += 1;
        }
        return { playersUnread: players, gamesUnread: games };
    }, [chats]);

    const youLabel = t('chats.you');
    const noMessagesLabel = t('chats.noMessages');

    const renderItem = useCallback(({ item }: { item: ChatPreview }) => (
        <ChatItem
            item={item}
            userId={user?.id}
            isTyping={typingStatus?.[item.id]}
            youLabel={youLabel}
            language={i18n.language}
            noMessagesLabel={noMessagesLabel}
            onPress={() => {
                // Same route as Game Details: chat room id === game id for group/game chats
                router.push({
                    pathname: '/chat/[id]',
                    params: {
                        id: item.id,
                        name: item.name || '',
                    },
                });
            }}
        />
    ), [user?.id, typingStatus, youLabel, noMessagesLabel, i18n.language, router]);

    // KEY FIX: extraData must change whenever chats reorder, get new messages, or typing changes.
    // Without this, FlatList sees the same array reference and skips re-rendering rows.
    const extraData = useMemo(() => ({
        typing: typingStatus,
        // A diff-signal string that changes when any chat bubbles up, gets a new message, or unread count changes
        msgKey: filteredChats.map(c => `${c.id}:${c.lastMessage?.createdAt ?? ''}:${c.unreadCount}`).join('|'),
    }), [typingStatus, filteredChats]);

    if (loadingChats && !refreshing) {
        return (
            <View className="flex-1 justify-center items-center">
                <LoadingMotif id="message-stack" label={t('chats.loadingChats', "טוען צ'אטים…")} />
            </View>
        );
    }

    const formatBadge = (count: number) => (count > 99 ? '99+' : String(count));

    return (
        <View className="flex-1 bg-gray-50 dark:bg-cyber-bg">
            {/* Custom Tabs */}
            <View className="flex-row bg-white dark:bg-cyber-card border-b border-gray-200 dark:border-white/10">
                <TouchableOpacity
                    className={`flex-1 py-4 items-center border-b-2 ${tabValue === 0 ? 'border-brand' : 'border-transparent'}`}
                    onPress={() => setTabValue(0)}
                >
                    <View className="flex-row items-center">
                        <Text className={`font-bold ${tabValue === 0 ? 'text-brand' : 'text-gray-500'}`}>
                            {t('chats.players')}
                        </Text>
                        {playersUnread > 0 && (
                            <View className="bg-brand rounded-full min-w-[18px] h-[18px] px-1 ms-1.5 items-center justify-center">
                                <Text className="text-white text-[10px] font-bold">{formatBadge(playersUnread)}</Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
                <TouchableOpacity
                    className={`flex-1 py-4 items-center border-b-2 ${tabValue === 1 ? 'border-brand' : 'border-transparent'}`}
                    onPress={() => setTabValue(1)}
                >
                    <View className="flex-row items-center">
                        <Text className={`font-bold ${tabValue === 1 ? 'text-brand' : 'text-gray-500'}`}>
                            {t('chats.games')}
                        </Text>
                        {gamesUnread > 0 && (
                            <View className="bg-brand rounded-full min-w-[18px] h-[18px] px-1 ms-1.5 items-center justify-center">
                                <Text className="text-white text-[10px] font-bold">{formatBadge(gamesUnread)}</Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </View>

            <FlatList
                data={filteredChats}
                keyExtractor={(item, index) => (item.id ? String(item.id) : `chat-row-${index}`)}
                renderItem={renderItem}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                extraData={extraData}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={10}
                initialNumToRender={12}
                ListEmptyComponent={
                    <View className="items-center justify-center py-20 px-6">
                        <Ionicons name={tabValue === 0 ? 'chatbubbles-outline' : 'people-outline'} size={40} color="#9ca3af" />
                        <Text className="text-gray-400 text-base text-center mt-3">
                            {tabValue === 0 ? t('chats.noActiveChats') : t('chats.noGamesRegistered')}
                        </Text>
                    </View>
                }
            />
        </View>
    );
}
