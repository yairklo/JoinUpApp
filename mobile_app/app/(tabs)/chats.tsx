import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import React, { useState, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { useChat, ChatPreview, dedupeChatsById } from '@/context/ChatContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

// Extracted + memoized chat item — only re-renders when its own data changes
const ChatItem = React.memo(({ item, userId, isTyping, youLabel, noMessagesLabel, onPress }: {
    item: ChatPreview;
    userId?: string;
    isTyping?: string;
    youLabel: string;
    noMessagesLabel: string;
    onPress: () => void;
}) => (
    <TouchableOpacity
        className="flex-row items-center p-4 bg-white border-b border-gray-100"
        onPress={onPress}
    >
        <Image
            source={{ uri: item.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || '?')}` }}
            style={{ width: 48, height: 48, borderRadius: 24 }}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
        />
        <View className="flex-1 mr-4 justify-center">
            <View className="flex-row justify-between mb-1">
                <Text className="text-gray-900 font-bold text-base text-left" numberOfLines={1}>
                    {item.name}
                </Text>
                {item.lastMessage && (
                    <Text className="text-gray-400 text-xs">
                        {new Date(item.lastMessage.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                )}
            </View>
            <View className="flex-row justify-between items-center">
                <Text
                    className={`text-sm flex-1 ml-2 text-left ${isTyping ? 'text-brand italic' : item.unreadCount > 0 ? 'text-gray-900 font-semibold' : 'text-gray-500'}`}
                    numberOfLines={1}
                >
                    {isTyping
                        ? isTyping
                        : (item.lastMessage
                            ? (item.lastMessage.senderId === userId ? youLabel : '') + item.lastMessage.text
                            : noMessagesLabel)}
                </Text>
                {item.unreadCount > 0 && (
                    <View className="bg-brand rounded-full px-2 py-0.5 ml-2">
                        <Text className="text-white text-xs font-bold">{item.unreadCount}</Text>
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
    const { t } = useTranslation();
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
    ), [user?.id, typingStatus, youLabel, noMessagesLabel, router]);

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
                <ActivityIndicator size="large" color="#059669" />
            </View>
        );
    }

    const formatBadge = (count: number) => (count > 99 ? '99+' : String(count));

    return (
        <View className="flex-1 bg-gray-50">
            {/* Custom Tabs */}
            <View className="flex-row bg-white border-b border-gray-200">
                <TouchableOpacity
                    className={`flex-1 py-4 items-center border-b-2 ${tabValue === 0 ? 'border-brand' : 'border-transparent'}`}
                    onPress={() => setTabValue(0)}
                >
                    <View className="flex-row items-center">
                        <Text className={`font-bold ${tabValue === 0 ? 'text-brand' : 'text-gray-500'}`}>
                            {t('chats.players')}
                        </Text>
                        {playersUnread > 0 && (
                            <View className="bg-red-500 rounded-full min-w-[18px] h-[18px] px-1 ml-1.5 items-center justify-center">
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
                            <View className="bg-red-500 rounded-full min-w-[18px] h-[18px] px-1 ml-1.5 items-center justify-center">
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
                    <View className="items-center justify-center py-20">
                        <Text className="text-gray-400 text-lg">
                            {tabValue === 0 ? t('chats.noActiveChats') : t('chats.noGamesRegistered')}
                        </Text>
                    </View>
                }
            />
        </View>
    );
}
