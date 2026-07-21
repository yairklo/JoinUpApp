import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { ratingsApi, GameRatingTeammate } from '@/services/api/ratings';

function StarRow({
    value,
    onRate,
    disabled,
}: {
    value: number | null;
    onRate: (score: number) => void;
    disabled: boolean;
}) {
    return (
        <View className="flex-row">
            {[1, 2, 3, 4, 5].map((star) => {
                const filled = value != null && star <= value;
                return (
                    <TouchableOpacity
                        key={star}
                        onPress={() => !disabled && value == null && onRate(star)}
                        disabled={disabled || value != null}
                        className="px-1"
                    >
                        <Text style={{ fontSize: 28, color: filled ? '#facc15' : '#d1d5db' }}>★</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

export default function GameRatingsPanel({ gameId }: { gameId: string }) {
    const { getToken } = useAuth();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [eligible, setEligible] = useState(false);
    const [teammates, setTeammates] = useState<GameRatingTeammate[]>([]);
    const [submittingId, setSubmittingId] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const data = await ratingsApi.getGameRatings(gameId, token);
                if (!active) return;
                setEligible(data.eligible);
                setTeammates(data.teammates || []);
            } catch (e) {
                console.error('Failed to load game ratings', e);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [gameId, getToken]);

    const handleRate = async (targetId: string, score: number) => {
        setSubmittingId(targetId);
        try {
            const token = await getToken();
            if (!token) return;
            await ratingsApi.ratePlayer(targetId, { gameId, score }, token);
            setTeammates((prev) =>
                prev.map((tm) => (tm.id === targetId ? { ...tm, myScore: score } : tm))
            );
            Alert.alert('', t('ratings.submitted'));
        } catch (e: unknown) {
            const err = e as Error & { status?: number };
            if (err.status === 409) {
                Alert.alert(t('error', 'Error'), t('ratings.alreadyRated'));
            } else {
                Alert.alert(t('error', 'Error'), t('ratings.submitFailed'));
            }
        } finally {
            setSubmittingId(null);
        }
    };

    if (loading) {
        return (
            <View className="py-6 items-center">
                <ActivityIndicator size="small" color="#059669" />
            </View>
        );
    }

    if (!eligible || teammates.length === 0) {
        return null;
    }

    const allRated = teammates.every((tm) => tm.myScore != null);

    return (
        <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mt-4 mx-5">
            <Text className="font-bold text-gray-900 text-lg mb-2">{t('ratings.title')}</Text>
            {allRated ? (
                <Text className="text-green-600 mb-4">{t('ratings.allDone')}</Text>
            ) : (
                <Text className="text-gray-500 mb-4">{t('ratings.hint')}</Text>
            )}
            {teammates.map((tm) => (
                <View
                    key={tm.id}
                    className="flex-row items-center py-3 border-b border-gray-50"
                    style={{ opacity: tm.myScore != null ? 0.85 : 1 }}
                >
                    <Image
                        source={{
                            uri:
                                tm.imageUrl ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(tm.name || 'U')}&size=100`,
                        }}
                        className="w-12 h-12 rounded-full mr-3 bg-gray-200"
                    />
                    <View className="flex-1">
                        <Text className="text-gray-800 font-medium mb-1">{tm.name || 'שחקן'}</Text>
                        <StarRow
                            value={tm.myScore}
                            onRate={(score) => handleRate(tm.id, score)}
                            disabled={submittingId === tm.id}
                        />
                    </View>
                    {submittingId === tm.id && (
                        <ActivityIndicator size="small" color="#059669" />
                    )}
                </View>
            ))}
        </View>
    );
}
