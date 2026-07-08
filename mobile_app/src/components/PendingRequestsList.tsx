import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { gamesApi } from '@/services/api';
import { Game, JoinRequest } from '@/types/game';

export default function PendingRequestsList({
    gameId,
    onDecision
}: {
    gameId: string;
    onDecision?: (updatedGame?: Game) => void;
}) {
    const { getToken } = useAuth();
    const { t } = useTranslation();
    const [requests, setRequests] = useState<JoinRequest[]>([]);
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

            setRequests(prev => prev.filter(r => r.userId !== userId));
            if (approve) {
                setRejected(prev => prev.filter(r => r.userId !== userId));
            } else {
                const movedFromRequests = requests.find(r => r.userId === userId);
                if (movedFromRequests) setRejected(prev => [...prev, movedFromRequests]);
            }
            if (onDecision) onDecision(updatedGame);
        } catch (e: any) {
            console.error('Failed to record join decision', e);
        } finally {
            setActingOnUserId(null);
        }
    };

    if (loading) {
        return (
            <View className="bg-white p-6 mb-4 shadow-sm items-center">
                <ActivityIndicator color="#2563eb" />
            </View>
        );
    }

    if (requests.length === 0 && rejected.length === 0) return null;

    return (
        <View className="bg-white p-6 mb-4 shadow-sm">
            {requests.length > 0 && (
                <>
                    <Text className="text-lg font-bold text-gray-800 mb-4">{t('game.joinRequests')} ({requests.length})</Text>
                    {requests.map(req => (
                        <View key={req.userId} className="flex-row items-center justify-between mb-3 last:mb-0">
                            <View className="flex-row items-center flex-1">
                                <Image
                                    source={{ uri: req.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y' }}
                                    className="w-10 h-10 rounded-full bg-gray-200 mr-3"
                                />
                                <Text className="text-gray-800 font-bold flex-shrink" numberOfLines={1}>{req.name || 'User'}</Text>
                            </View>
                            <View className="flex-row">
                                <TouchableOpacity
                                    onPress={() => decide(req.userId, true)}
                                    disabled={actingOnUserId === req.userId}
                                    className="bg-green-100 px-3 py-2 rounded-lg mr-2 border border-green-200"
                                >
                                    <Text className="text-green-700 font-bold text-xs">{t('game.approve')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => decide(req.userId, false)}
                                    disabled={actingOnUserId === req.userId}
                                    className="bg-red-50 px-3 py-2 rounded-lg border border-red-100"
                                >
                                    <Text className="text-red-600 font-bold text-xs">{t('game.reject')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </>
            )}

            {rejected.length > 0 && (
                <View className={requests.length > 0 ? 'mt-4 pt-4 border-t border-gray-100' : ''}>
                    <TouchableOpacity
                        onPress={() => setShowRejected(v => !v)}
                        className="flex-row items-center justify-between"
                    >
                        <Text className="text-sm font-bold text-gray-500">{t('game.rejectedRequests')} ({rejected.length})</Text>
                        <Ionicons name={showRejected ? 'chevron-up' : 'chevron-down'} size={16} color="#6b7280" />
                    </TouchableOpacity>

                    {showRejected && (
                        <View className="mt-3">
                            {rejected.map(req => (
                                <View key={req.userId} className="flex-row items-center justify-between mb-3 last:mb-0">
                                    <View className="flex-row items-center flex-1">
                                        <Image
                                            source={{ uri: req.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y' }}
                                            className="w-10 h-10 rounded-full bg-gray-200 mr-3 opacity-60"
                                        />
                                        <Text className="text-gray-500 font-bold flex-shrink" numberOfLines={1}>{req.name || 'User'}</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => decide(req.userId, true)}
                                        disabled={actingOnUserId === req.userId}
                                        className="bg-green-50 px-3 py-2 rounded-lg border border-green-200"
                                    >
                                        <Text className="text-green-700 font-bold text-xs">{t('game.approveAnyway')}</Text>
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
