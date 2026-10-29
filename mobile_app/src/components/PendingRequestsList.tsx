import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { gamesApi } from '@/services/api';
import { Game, JoinRequest } from '@/types/game';
import SafeImage from '@/components/SafeImage';
import { lotteryEntrantListCopy } from '@joinup/shared/gameViewerCopy';

export default function PendingRequestsList({
    gameId,
    onDecision,
    lotteryEnabled,
    lotteryPending,
    lotteryExecutedAt,
    lotteryAt,
}: {
    gameId: string;
    onDecision?: (updatedGame?: Game) => void;
    /** Pre-draw lottery: the WAITLISTED rows are the pool, not a ranked waitlist. */
    lotteryEnabled?: boolean;
    lotteryPending?: boolean;
    lotteryExecutedAt?: string | null;
    lotteryAt?: string | null;
}) {
    const { getToken } = useAuth();
    const { t } = useTranslation();
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [activeOffer, setActiveOffer] = useState<JoinRequest | null>(null);
    const [waitlist, setWaitlist] = useState<JoinRequest[]>([]);
    const [rejected, setRejected] = useState<JoinRequest[]>([]);
    const [showRejected, setShowRejected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actingOnUserId, setActingOnUserId] = useState<string | null>(null);

    const fetchRequests = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const data = await gamesApi.getJoinRequests(gameId, token);
            setRequests(data.requests || []);
            setActiveOffer(data.activeOffer || null);
            setWaitlist(data.waitlist || []);
            setRejected(data.rejected || []);
        } catch (e) {
            console.error('Failed to load join requests', e);
        } finally {
            setLoading(false);
        }
    }, [gameId]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const decide = async (userId: string, approve: boolean) => {
        setActingOnUserId(userId);
        try {
            const token = await getToken();
            if (!token) return;
            const updatedGame = approve
                ? await gamesApi.approveJoinRequest(gameId, userId, token)
                : await gamesApi.rejectJoinRequest(gameId, userId, token);

            await fetchRequests();
            if (onDecision) onDecision(updatedGame);
        } catch (e: any) {
            console.error('Failed to record join decision', e);
        } finally {
            setActingOnUserId(null);
        }
    };

    const handleBypass = async (userId: string) => {
        setActingOnUserId(userId);
        try {
            const token = await getToken();
            if (!token) return;
            const res = await gamesApi.bypassWaitlistUser(gameId, userId, token);
            if (res.success) {
                await fetchRequests();
                if (onDecision) onDecision(res.game);
            }
        } catch (e) {
            console.error('Failed to bypass waitlist user', e);
        } finally {
            setActingOnUserId(null);
        }
    };

    if (loading) {
        return (
            <View className="bg-white dark:bg-cyber-card p-6 mb-4 shadow-sm items-center">
                <ActivityIndicator color="#059669" />
            </View>
        );
    }

    if (requests.length === 0 && !activeOffer && waitlist.length === 0 && rejected.length === 0) return null;

    const entrantList = lotteryEntrantListCopy({
        lotteryEnabled,
        lotteryPending,
        lotteryExecutedAt,
        lotteryAt,
        count: waitlist.length,
    });

    return (
        <View className="bg-white dark:bg-cyber-card p-6 mb-4 shadow-sm rounded-xl">
            {/* Active Offer Section */}
            {activeOffer && (
                <View className="mb-6 p-4 bg-brand-mist dark:bg-brand-ink rounded-lg border border-brand-pale">
                    <Text className="text-xs font-bold text-brand-dark dark:text-brand-light mb-3">
                        {t('game.activeWaitlistOffer', 'הוצע מקום אוטומטית (ממתין לאישור השחקן)')}
                    </Text>
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center flex-1">
                            <SafeImage
                                source={{ uri: activeOffer.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y' }}
                                className="w-10 h-10 rounded-full bg-gray-200 dark:bg-cyber-border mr-3"
                            />
                            <Text className="text-gray-800 dark:text-cyber-text font-bold flex-shrink" numberOfLines={1}>
                                {activeOffer.name || t('game.user', 'משתמש')}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => handleBypass(activeOffer.userId)}
                            disabled={actingOnUserId === activeOffer.userId}
                            className="bg-red-600 px-3 py-2 rounded-lg"
                        >
                            <Text className="text-white font-bold text-xs">{t('game.bypassToNext', 'עקוף לבא בתור')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Standard Join Requests */}
            {requests.length > 0 && (
                <View className="mb-6">
                    <Text className="text-lg font-bold text-gray-800 dark:text-cyber-text mb-4">
                        {t('game.joinRequests')} ({requests.length})
                    </Text>
                    {requests.map(req => (
                        <View key={req.userId} className="flex-row items-center justify-between mb-3 last:mb-0">
                            <View className="flex-row items-center flex-1">
                                <SafeImage
                                    source={{ uri: req.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y' }}
                                    className="w-10 h-10 rounded-full bg-gray-200 dark:bg-cyber-border mr-3"
                                />
                                <Text className="text-gray-800 dark:text-cyber-text font-bold flex-shrink" numberOfLines={1}>{req.name || t('game.user', 'משתמש')}</Text>
                            </View>
                            <View className="flex-row">
                                <TouchableOpacity
                                    onPress={() => decide(req.userId, true)}
                                    disabled={actingOnUserId === req.userId}
                                    className="bg-green-100 px-3 py-2 rounded-lg mr-2 border border-green-200"
                                >
                                    <Text className="text-green-700 dark:text-brand-light font-bold text-xs">{t('game.approve')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => decide(req.userId, false)}
                                    disabled={actingOnUserId === req.userId}
                                    className="bg-red-50 dark:bg-red-950 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900"
                                >
                                    <Text className="text-red-600 dark:text-red-400 font-bold text-xs">{t('game.reject')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* Waitlist, or the unordered lottery pool until the draw runs. */}
            {waitlist.length > 0 && (
                <View className="mb-6" testID={entrantList ? 'lottery-entrant-roster' : 'waitlist-roster'}>
                    <Text className={`text-lg font-bold text-gray-800 dark:text-cyber-text ${entrantList ? 'mb-1' : 'mb-4'}`}>
                        {entrantList
                            ? entrantList.title
                            : `${t('game.waitlistTitle', 'רשימת המתנה')} (${waitlist.length})`}
                    </Text>
                    {!!entrantList?.detail && (
                        <Text className="text-sm text-gray-600 dark:text-cyber-muted mb-1">{entrantList.detail}</Text>
                    )}
                    {!!entrantList?.registeredLabel && (
                        <Text className="text-xs text-gray-500 dark:text-cyber-muted mb-4">{entrantList.registeredLabel}</Text>
                    )}
                    {waitlist.map(req => (
                        <View key={req.userId} className="flex-row items-center justify-between mb-3 last:mb-0">
                            <View className="flex-row items-center flex-1">
                                <SafeImage
                                    source={{ uri: req.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y' }}
                                    className="w-10 h-10 rounded-full bg-gray-200 dark:bg-cyber-border mr-3"
                                />
                                <Text className="text-gray-800 dark:text-cyber-text font-bold flex-shrink" numberOfLines={1}>{req.name || t('game.user', 'משתמש')}</Text>
                            </View>
                            {entrantList ? (
                                entrantList.rowLabel ? (
                                    <View className="bg-gray-100 dark:bg-cyber-border px-3 py-1.5 rounded-lg">
                                        <Text className="text-gray-600 dark:text-cyber-muted font-bold text-xs">{entrantList.rowLabel}</Text>
                                    </View>
                                ) : null
                            ) : (
                                <View className="bg-gray-100 dark:bg-cyber-border px-3 py-1.5 rounded-lg">
                                    <Text className="text-gray-600 dark:text-cyber-muted font-bold text-xs">
                                        {t('game.waitlistQueuePosition', { position: req.queuePosition, defaultValue: `ממתין #${req.queuePosition}` })}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ))}
                </View>
            )}

            {rejected.length > 0 && (
                <View className={requests.length > 0 || waitlist.length > 0 ? 'mt-4 pt-4 border-t border-gray-100 dark:border-cyber-border' : ''}>
                    <TouchableOpacity
                        onPress={() => setShowRejected(v => !v)}
                        className="flex-row items-center justify-between"
                    >
                        <Text className="text-sm font-bold text-gray-500 dark:text-cyber-muted">{t('game.rejectedRequests')} ({rejected.length})</Text>
                        <Ionicons name={showRejected ? 'chevron-up' : 'chevron-down'} size={16} color="#6b7280" />
                    </TouchableOpacity>

                    {showRejected && (
                        <View className="mt-3">
                            {rejected.map(req => (
                                <View key={req.userId} className="flex-row items-center justify-between mb-3 last:mb-0">
                                    <View className="flex-row items-center flex-1">
                                        <SafeImage
                                            source={{ uri: req.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y' }}
                                            className="w-10 h-10 rounded-full bg-gray-200 dark:bg-cyber-border mr-3 opacity-60"
                                        />
                                        <Text className="text-gray-500 dark:text-cyber-muted font-bold flex-shrink" numberOfLines={1}>{req.name || t('game.user', 'משתמש')}</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => decide(req.userId, true)}
                                        disabled={actingOnUserId === req.userId}
                                        className="bg-green-50 dark:bg-brand-ink px-3 py-2 rounded-lg border border-green-200"
                                    >
                                        <Text className="text-green-700 dark:text-brand-light font-bold text-xs">{t('game.approveAnyway')}</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}
