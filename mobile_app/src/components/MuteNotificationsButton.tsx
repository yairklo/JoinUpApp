import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { NotificationMute, NotificationMuteTarget } from '@joinup/shared/notificationPrefs';
import { notificationsApi } from '@/services/api/notifications';

interface Props {
    targetType: NotificationMuteTarget;
    targetId: string;
    /** i18n key for the "mute" label */
    labelKey?: string;
    className?: string;
}

/** Mute / unmute notifications that originate from a user, group or game. */
export default function MuteNotificationsButton({ targetType, targetId, labelKey = 'notificationSettings.mute', className }: Props) {
    const { t } = useTranslation();
    const { isLoaded, userId, getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

    const [mute, setMute] = useState<NotificationMute | null | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    const pick = (mutes: NotificationMute[]) =>
        mutes.find(m => m.targetType === targetType && m.targetId === targetId) || null;

    useEffect(() => {
        if (!isLoaded || !userId) return;
        let cancelled = false;
        (async () => {
            try {
                const token = await getTokenRef.current();
                if (!token) return;
                const mutes = await notificationsApi.getMutes(token);
                if (!cancelled) setMute(pick(mutes));
            } catch (error) {
                console.error('[MUTE] Failed to load mutes:', error);
                if (!cancelled) setMute(null);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, userId, targetType, targetId]);

    const run = async (fn: (token: string) => Promise<NotificationMute[]>) => {
        setBusy(true);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            setMute(pick(await fn(token)));
        } catch (error) {
            console.error('[MUTE] Failed to update mute:', error);
            Alert.alert(t('common.error', 'שגיאה'), t('notificationSettings.actionFailed'));
        } finally {
            setBusy(false);
        }
    };

    const chooseDuration = () => {
        Alert.alert(t('notificationSettings.muteFor'), undefined, [
            { text: t('notificationSettings.mute8h'), onPress: () => run(tk => notificationsApi.mute(targetType, targetId, 8, tk)) },
            { text: t('notificationSettings.muteWeek'), onPress: () => run(tk => notificationsApi.mute(targetType, targetId, 168, tk)) },
            { text: t('notificationSettings.muteForever'), onPress: () => run(tk => notificationsApi.mute(targetType, targetId, null, tk)) },
            { text: t('common.cancel', 'ביטול'), style: 'cancel' },
        ]);
    };

    if (!isLoaded || !userId || userId === targetId || mute === undefined) return null;

    return (
        <TouchableOpacity
            onPress={mute ? () => run(tk => notificationsApi.unmute(targetType, targetId, tk)) : chooseDuration}
            disabled={busy}
            accessibilityRole="button"
            className={className ?? 'bg-white px-5 py-3 rounded-xl border border-gray-200 flex-row items-center justify-center'}
        >
            {busy ? (
                <ActivityIndicator size="small" />
            ) : (
                <>
                    <FontAwesome name={mute ? 'bell' : 'bell-slash'} size={15} color="#4b5563" style={{ marginRight: 8 }} />
                    <Text className="text-gray-700 font-bold">{mute ? t('notificationSettings.unmute') : t(labelKey)}</Text>
                </>
            )}
        </TouchableOpacity>
    );
}
