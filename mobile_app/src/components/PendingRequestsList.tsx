import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { gamesApi } from '@/services/api';
import { JoinRequest } from '@/types/game';

export default function PendingRequestsList({
    gameId,
    onDecision
}: {
    gameId: string;
    onDecision?: () => void;
}) {
    const { getToken } = useAuth();
    const { t } = useTranslation();
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [actingOnUserId, setActingOnUserId] = useState<string | null>(null);

    const fetchRequests = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const data = await gamesApi.getJoinRequests(gameId, token);
            setRequests(data.requests || []);
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
            if (approve) {
                await gamesApi.approveJoinRequest(gameId, userId, token);
            } else {
                await gamesApi.rejectJoinRequest(gameId, userId, token);
            }
            setRequests(prev => prev.filter(r => r.userId !== userId));
            if (onDecision) onDecision();
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

    if (requests.length === 0) return null;

    return (
        <View className="bg-white p-6 mb-4 shadow-sm">
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
        </View>
    );
}
