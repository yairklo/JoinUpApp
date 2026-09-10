import React, { useEffect, useState } from 'react';
import { TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/services/api';

// Module-level favorite-ids cache + a subscriber list, shared by every mounted
// FavoriteButton for the signed-in user. A toggle updates this cache and
// notifies every subscriber synchronously, so e.g. starring a field on the
// detail screen is immediately reflected in an already-mounted list row too.
let favoriteIds: Set<string> | null = null;
let favoriteIdsUserId: string | null = null;
let loadPromise: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

function notify() {
    listeners.forEach((l) => l());
}

function loadFavoriteIds(userId: string, token: string): Promise<Set<string>> {
    if (favoriteIds && favoriteIdsUserId === userId) {
        return Promise.resolve(favoriteIds);
    }
    if (loadPromise && favoriteIdsUserId === userId) {
        return loadPromise;
    }
    favoriteIdsUserId = userId;
    loadPromise = usersApi.getFavorites(userId, token)
        .then((fields) => {
            favoriteIds = new Set(fields.map((f) => f.id));
            notify();
            return favoriteIds;
        })
        .catch(() => {
            loadPromise = null;
            return new Set<string>();
        });
    return loadPromise;
}

function setFavorite(fieldId: string, isFav: boolean) {
    if (!favoriteIds) favoriteIds = new Set();
    if (isFav) favoriteIds.add(fieldId); else favoriteIds.delete(fieldId);
    notify();
}

export default function FavoriteButton({ fieldId, size = 20 }: { fieldId: string; size?: number }) {
    const { t } = useTranslation();
    const { userId, getToken } = useAuth();
    const [isFav, setIsFav] = useState(() => favoriteIds?.has(fieldId) ?? false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const sync = () => { if (!cancelled) setIsFav(favoriteIds?.has(fieldId) ?? false); };
        listeners.add(sync);
        (async () => {
            const token = await getToken();
            if (!token || cancelled) return;
            await loadFavoriteIds(userId, token);
            sync();
        })();
        return () => { cancelled = true; listeners.delete(sync); };
    }, [userId, fieldId]);

    if (!userId) return null;

    const toggle = async () => {
        if (loading) return;
        setLoading(true);
        const next = !isFav;
        try {
            const token = await getToken();
            if (!token) return;
            if (next) {
                await usersApi.addFavorite(userId, fieldId, token);
            } else {
                await usersApi.removeFavorite(userId, fieldId, token);
            }
            setFavorite(fieldId, next);
        } catch (e) {
            console.error('Failed to toggle favorite', e);
            Alert.alert(t('common.error', 'שגיאה'), t('favorites.updateFailed', 'לא ניתן היה לעדכן את המועדפים, נסה שוב'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <TouchableOpacity
            onPress={toggle}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={isFav ? t('favorites.remove', 'הסר ממועדפים') : t('favorites.add', 'הוסף למועדפים')}
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
