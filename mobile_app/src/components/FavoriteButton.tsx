import React, { useEffect, useState } from 'react';
import { TouchableOpacity, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@clerk/clerk-expo';
import { usersApi } from '@/services/api';
import type { Field } from '@/services/api/fields';

let globalFavoritesPromise: Promise<Field[]> | null = null;
let globalFavoritesUserId: string | null = null;

function getFavorites(userId: string): Promise<Field[]> {
    if (globalFavoritesPromise && globalFavoritesUserId === userId) {
        return globalFavoritesPromise;
    }
    globalFavoritesUserId = userId;
    globalFavoritesPromise = usersApi.getFavorites(userId).catch(() => {
        globalFavoritesPromise = null;
        return [];
    });
    return globalFavoritesPromise;
}

function invalidateFavorites() {
    globalFavoritesPromise = null;
}

export default function FavoriteButton({ fieldId, size = 20 }: { fieldId: string; size?: number }) {
    const { userId, getToken } = useAuth();
    const [isFav, setIsFav] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        getFavorites(userId).then((arr) => {
            if (!cancelled) setIsFav(arr.some((f) => f.id === fieldId));
        });
        return () => { cancelled = true; };
    }, [userId, fieldId]);

    if (!userId) return null;

    const toggle = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            if (!isFav) {
                await usersApi.addFavorite(userId, fieldId, token);
                setIsFav(true);
            } else {
                await usersApi.removeFavorite(userId, fieldId, token);
                setIsFav(false);
            }
            invalidateFavorites();
        } catch (e) {
            console.error('Failed to toggle favorite', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <TouchableOpacity
            onPress={toggle}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={isFav ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
                backgroundColor: 'rgba(255,255,255,0.9)',
                borderRadius: 999,
                width: size + 14,
                height: size + 14,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {loading ? (
                <ActivityIndicator size="small" color="#f59e0b" />
            ) : (
                <FontAwesome name={isFav ? 'star' : 'star-o'} size={size} color={isFav ? '#f59e0b' : '#475569'} />
            )}
        </TouchableOpacity>
    );
}
