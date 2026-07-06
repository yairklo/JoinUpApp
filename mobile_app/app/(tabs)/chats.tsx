import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image'; // Fix #2b: expo-image for disk+memory caching
import React, { useState, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { useChat, ChatPreview } from '@/context/ChatContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

// Fix #2a: Extracted + memoized chat item — only re-renders when its own data changes
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
                    className={`text-sm flex-1 ml-2 text-left ${isTyping ? 'text-blue-500 italic' : 'text-gray-500'}`} 
                    numberOfLines={1}
                >
                    {isTyping ? isTyping : (item.lastMessage
                        ? (item.lastMessage.senderId === userId ? youLabel : '') + item.lastMessage.text
                        : noMessagesLabel)}
                </Text>
                {item.unreadCount > 0 && (
                    <View className="bg-blue-600 rounded-full px-2 py-0.5">
                        <Text className="text-white text-xs font-bold">{item.unreadCount}</Text>
                    </View>
                )}
            </View>
        </View>
    </TouchableOpacity>
), (prev, next) =>
    // Custom equality: only re-render if these specific fields changed
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

    // Fix #2a: memoized filter — only recomputes when chats or tab changes
    const filteredChats = useMemo(
        () => chats.filter(chat => tabValue === 0 ? chat.type === 'private' : chat.type === 'group'),
        [chats, tabValue]
    );

    // Cache translation strings so they're stable references in renderItem
    const youLabel = t('chats.you');
    const noMessagesLabel = t('chats.noMessages');

    // Fix #2a: stable renderItem reference — won't cause FlatList to re-render all items
    const renderItem = useCallback(({ item }: { item: ChatPreview }) => (
        <ChatItem
            item={item}
            userId={user?.id}
            isTyping={typingStatus?.[item.id]}
            youLabel={youLabel}
            noMessagesLabel={noMessagesLabel}
            onPress={() => {
                const route = item.type === 'group' ? `/games/${item.id}` : `/chat/${item.id}`;
                router.push(route as any);
            }}
        />
    ), [user?.id, typingStatus, youLabel, noMessagesLabel, router]);

    if (loadingChats && !refreshing) {
        return (
            <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50">
            {/* Custom Tabs */}
            <View className="flex-row bg-white border-b border-gray-200">
                <TouchableOpacity
                    className={`flex-1 py-4 items-center border-b-2 ${tabValue === 0 ? 'border-blue-600' : 'border-transparent'}`}
                    onPress={() => setTabValue(0)}
                >
                    <Text className={`font-bold ${tabValue === 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                        {t('chats.players')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    className={`flex-1 py-4 items-center border-b-2 ${tabValue === 1 ? 'border-blue-600' : 'border-transparent'}`}
                    onPress={() => setTabValue(1)}
                >
                    <Text className={`font-bold ${tabValue === 1 ? 'text-blue-600' : 'text-gray-500'}`}>
                        {t('chats.games')}
                    </Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={filteredChats}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                extraData={typingStatus}
                // Performance props
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
