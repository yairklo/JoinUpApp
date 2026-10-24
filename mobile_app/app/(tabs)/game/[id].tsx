import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Modal, Share, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import React, { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { gamesApi } from '@/services/api';
import { Game } from '@/types/game';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSeriesLogic } from '@/hooks/useSeriesLogic';
import { useTranslation } from 'react-i18next';
import PendingRequestsList from '@/components/PendingRequestsList';
import GameRatingsPanel from '@/components/GameRatingsPanel';
import GameResultSection from '@/components/GameResultSection';
import GameDetailsSkeleton from '@/components/GameDetailsSkeleton';
import { useGameUpdatedListener, useGameUpdate } from '@/context/GameUpdateContext';
import { hasWaitlistOffer, isOrganizerApprovalPending } from '@/utils/waitlistOffer';
import { useAuthTokenRef, useSignedOutSinceMount } from '@/hooks/useAuthTokenRef';
import { tryParseJerusalemTimeToUTC } from '@/utils/timezone';
import BackButton from '@/components/ui/BackButton';
import SportCover, { resolveSportKey, SPORT_GLYPH } from '@/components/ui/SportCover';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SPORT_MAPPING } from '@/utils/sports';
import SafeImage from '@/components/SafeImage';
import OpenInMapButton from '@/components/OpenInMapButton';

const HERO_HEIGHT = 200;

function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <View className="flex-1 bg-white dark:bg-cyber-card rounded-2xl px-3 py-3 border border-gray-100 dark:border-cyber-border">
            <Text className="text-gray-500 dark:text-cyber-muted" style={{ fontSize: 12 }} numberOfLines={1}>
                {label}
            </Text>
            <Text
                className="text-gray-900 dark:text-cyber-text mt-0.5"
                style={{ fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {value}
            </Text>
        </View>
    );
}

/** Neutral outlined secondary action; `destructive` switches to red for destructive actions only. */
function SecondaryAction({
    label,
    icon,
    onPress,
    destructive,
}: {
    label: string;
    icon?: React.ComponentProps<typeof FontAwesome>['name'];
    onPress: () => void;
    destructive?: boolean;
}) {
    const color = destructive ? '#dc2626' : '#6b7280';
    return (
        <TouchableOpacity
            onPress={onPress}
            accessibilityRole="button"
            className={`mt-3 h-12 px-4 rounded-2xl flex-row items-center justify-center border ${
                destructive
                    ? 'border-red-200 bg-white dark:bg-cyber-card'
                    : 'border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-card'
            }`}
        >
            {icon ? <FontAwesome name={icon} size={15} color={color} style={{ marginEnd: 8 }} /> : null}
            <Text className={`font-semibold text-[15px] ${destructive ? 'text-red-600' : 'text-gray-700 dark:text-cyber-text'}`}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

export default function GameDetailsScreen() {
    const { t, i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ id: string | string[] }>();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const signedOutSinceMount = useSignedOutSinceMount();
    const { user } = useUser();
    const router = useRouter();
    const { notifyGameUpdate } = useGameUpdate();

    const [game, setGame] = useState<Game | null>(null);
    const [loading, setLoading] = useState(true);
    // Friends-only game whose link is blocked for this viewer (403 GAME_FRIENDS_ONLY).
    const [friendsOnlyLocked, setFriendsOnlyLocked] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Provide default values to hook, will update when game loads
    const series = useSeriesLogic({
        gameId: id,
        seriesId: game?.seriesId || null,
        initialTime: game?.time || "20:00"
    });

    // Web SSR always sends a Clerk token before first paint. On mobile, getToken() can briefly
    // return null even when signed in — a guest GET omits waitlistOfferPending and hides CTAs.
    const fetchGame = useCallback(async () => {
        if (!id || !isAuthLoaded) return;
        try {
            let token: string | null | undefined = null;
            if (isSignedIn) {
                token = await getTokenRef.current();
                if (!token) {
                    await new Promise((r) => setTimeout(r, 400));
                    token = await getTokenRef.current();
                }
                if (!token) {
                    // Keep spinner — never paint a guest snapshot that hides the offer.
                    return;
                }
            }
            const data = await gamesApi.getById(id, token || undefined);
            setGame(data);
            setFriendsOnlyLocked(false);
            setLoading(false);
        } catch (err: any) {
            if (err?.status === 403 && err?.code === 'GAME_FRIENDS_ONLY') {
                setGame(null);
                setFriendsOnlyLocked(true);
                setLoading(false);
                return;
            }
            if (signedOutSinceMount()) return; // stale screen after sign-out: 401 is expected
            console.error("Failed to load game", err);
            Alert.alert(t('common.error', 'שגיאה'), t('game.loadFailed', 'לא הצלחנו לטעון את פרטי המשחק'));
            setLoading(false);
        }
    }, [id, isAuthLoaded, isSignedIn, getTokenRef]);

    useEffect(() => {
        fetchGame();
    }, [fetchGame]);

    useFocusEffect(
        useCallback(() => {
            fetchGame();
        }, [fetchGame])
    );

    // Live roster sync — merge like web GameLiveSection so we never drop offer flags.
    useGameUpdatedListener(useCallback(({ game: updatedGame }) => {
        if (updatedGame?.id === id) {
            setGame((prev) => (prev ? { ...prev, ...updatedGame } : updatedGame));
        }
    }, [id]));

    const handleJoin = async () => {
        if (!game) return;
        setActionLoading(true);
        try {
            const token = await getToken();
            if (!token) {
                Alert.alert(t('common.error', 'שגיאה'), t('game.mustBeLoggedIn', 'עליך להיות מחובר כדי להצטרף'));
                return;
            }
            const result = await gamesApi.join(game.id, token);
            if (result.pending) {
                Alert.alert(t('game.requestSent'), t('game.requestPending'));
            } else if (result.viewerParticipationStatus === 'WAITLISTED') {
                Alert.alert(t('common.success', 'הצלחה'), t('game.joinWaitlistSuccess', 'נרשמת לרשימת ההמתנה'));
                notifyGameUpdate(game.id, "waitlist", user?.id || "");
            } else {
                Alert.alert(t('common.success', 'הצלחה'), t('game.joinSuccess', 'הצטרפת למשחק!'));
                notifyGameUpdate(game.id, "join", user?.id || "");
            }
            setGame(result);
        } catch (err: any) {
            Alert.alert(t('common.error', 'שגיאה'), err?.message || err?.response?.data?.error || t('game.joinFailed', 'ההצטרפות למשחק נכשלה'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleעזוב = async () => {
        if (!game) return;
        Alert.alert(
            t('game.confirmLeaveTitle', 'עזיבת משחק'),
            t('game.confirmLeaveMessage', 'האם אתה בטוח שברצונך לעזוב את המשחק?'),
            [
                { text: t('common.cancel', 'ביטול'), style: "cancel" },
                {
                    text: t('game.leave', 'עזוב'),
                    style: "destructive",
                    onPress: async () => {
                        setActionLoading(true);
                        try {
                            const token = await getToken();
                            if (!token) return;
                            const res = await gamesApi.leave(game.id, token);
                            notifyGameUpdate(game.id, "leave", user?.id || "");
                            Alert.alert(
                                t('common.success', 'הצלחה'),
                                t('game.leftGameSuccess', 'עזבת את המשחק בהצלחה.')
                            );
                            if ((res as any)?.deleted) {
                                router.replace('/(tabs)');
                            } else {
                                await fetchGame();
                            }
                        } catch (err: any) {
                            Alert.alert(t('common.error', 'שגיאה'), err?.message || err?.response?.data?.error || t('game.actionFailed', 'הפעולה נכשלה'));
                        } finally {
                            setActionLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleWaitlistConfirm = async (accept: boolean) => {
        if (!game) return;
        setActionLoading(true);
        try {
            const token = await getToken();
            if (!token) {
                Alert.alert(t('common.error', 'שגיאה'), t('game.mustBeLoggedInToConfirm', 'עליך להיות מחובר כדי לאשר או לוותר'));
                return;
            }
            const result = await gamesApi.waitlistConfirm(game.id, accept, token);
            setGame(result);
            if (accept) {
                notifyGameUpdate(game.id, "join", user?.id || "");
            } else {
                notifyGameUpdate(game.id, "leave", user?.id || "");
            }
            Alert.alert(
                t('common.success', 'הצלחה'),
                accept
                    ? t('game.waitlistOfferJoined', 'הצטרפת למשחק בהצלחה!')
                    : t('game.waitlistOfferDeclined', 'ויתרת על המקום בהצלחה')
            );
            await fetchGame();
        } catch (err: any) {
            const msg = err?.message || err?.response?.data?.error || "";
            if (String(msg).includes('No pending waitlist offer') || String(msg).includes('waitlist')) {
                Alert.alert(
                    t('game.awaitingOrganizerApproval', 'ממתין לאישור המארגן'),
                    t('game.noActiveWaitlistOffer', 'אין הצעת מקום פעילה מרשימת ההמתנה. אם שלחת בקשת הצטרפות, המארגן צריך לאשר אותה.')
                );
            } else {
                Alert.alert(t('common.error', 'שגיאה'), msg || t('game.waitlistProcessFailed', 'לא הצלחנו לעבד את אישור רשימת ההמתנה'));
            }
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return <GameDetailsSkeleton />;
    }

    if (!game) {
        return (
            <View className="flex-1 justify-center items-center bg-white dark:bg-cyber-card px-6">
                <Text className="text-gray-500 dark:text-cyber-muted text-center">
                    {friendsOnlyLocked ? t('friendsOnly.gameLocked') : t('game.notFound', 'המשחק לא נמצא')}
                </Text>
            </View>
        );
    }

    const isParticipant = game.viewerParticipationStatus === 'CONFIRMED'
        || game.participants?.some(p => p.id === user?.id);
    const isFull = (game.currentPlayers || 0) >= game.maxPlayers;
    const isOrganizer = game.organizerId === user?.id;
    const isManager = game.managers?.some(m => m.id === user?.id && (m.role === 'MANAGER' || m.role === 'MODERATOR')) || false;
    const canManage = isOrganizer || isManager;
    // Must match the server (assertCanManagePick): organizer, MANAGER or CAPTAIN roles only.
    const canManageTeams = isOrganizer
        || (game.managers?.some(m => m.id === user?.id && (m.role === 'MANAGER' || m.role === 'CAPTAIN')) || false);
    const manageTeamsAction = (
        <SecondaryAction
            label={t('game.manageTeams', 'נהל קבוצות')}
            icon="users"
            onPress={() => router.push(`/game/teams/${game.id}`)}
        />
    );
    const isWaitlistOfferPending = hasWaitlistOffer(game);
    // Never show a dead-end "ממתין לאישור" for PENDING — offer CTAs always win.
    // Organizer-approval-only is handled inside offer error handling if confirm fails.
    const isPendingApproval = false;
    const isRejected = game.viewerParticipationStatus === 'REJECTED';
    const isWaitlisted = game.viewerParticipationStatus === 'WAITLISTED' && !isWaitlistOfferPending;
    const approvalOnlyHint = isOrganizerApprovalPending(game);
    const isCancelled = game.status === 'CANCELLED';
    const heroSportKey = resolveSportKey(game.sport);
    const rawSportKey = (game.sport || '').toUpperCase();
    const sportLabel = t('sports.' + rawSportKey.toLowerCase(), SPORT_MAPPING[rawSportKey] || game.sport || t('sports.sport', 'ספורט'));

    const handleCancelGame = () => {
        Alert.alert(
            t('game.cancelGameTitle', 'לבטל את המשחק?'),
            t('game.cancelGameConfirm', 'המשחק יסומן כמבוטל, לא ניתן יהיה להצטרף אליו, וכל המשתתפים יקבלו הודעה.')
                + (game.seriesId ? t('game.cancelGameConfirmSeries', ' שאר המשחקים בקבוצה לא יושפעו.') : ''),
            [
                { text: t('game.cancelGameBack', 'חזרה'), style: 'cancel' },
                {
                    text: t('game.cancelGameYes', 'כן, בטל משחק'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getTokenRef.current();
                            if (!token) return;
                            const updated = await gamesApi.cancel(game.id, token);
                            setGame(updated);
                        } catch (e) {
                            console.error('Cancel game failed', e);
                            Alert.alert(t('common.error', 'שגיאה'), t('game.cancelGameFailed', 'ביטול המשחק נכשל'));
                        }
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-gray-50 dark:bg-cyber-bg">
            <ScrollView className="flex-1 bg-gray-50 dark:bg-cyber-bg">
                {/* Hero */}
                <SportCover sport={game.sport} height={HERO_HEIGHT}>
                    <View className="flex-1 justify-end px-5 pb-5">
                        <View
                            className="self-start px-2.5 py-1 rounded-full flex-row items-center mb-2"
                            style={{ backgroundColor: 'rgba(0,0,0,0.28)' }}
                        >
                            <MaterialCommunityIcons name={SPORT_GLYPH[heroSportKey]} size={13} color="#fff" />
                            <Text className="text-white text-xs font-bold ms-1">{sportLabel}</Text>
                        </View>
                        <Text
                            className="text-white"
                            style={{ fontSize: 24, fontWeight: '800', lineHeight: 30 }}
                            numberOfLines={2}
                        >
                            {game.title || game.field?.name || game.fieldName || t('game.details')}
                        </Text>
                        <TouchableOpacity
                            disabled={!game.fieldId}
                            onPress={() => game.fieldId && router.push(`/field/${game.fieldId}`)}
                            className="flex-row items-center mt-1 self-start"
                        >
                            <Text className="text-white/80 text-[14px] font-semibold" numberOfLines={1}>
                                {game.field?.name || game.fieldName || t('game.unknownField')}
                            </Text>
                            {game.fieldId ? (
                                <FontAwesome name="angle-left" size={16} color="rgba(255,255,255,0.8)" style={{ marginStart: 6 }} />
                            ) : null}
                        </TouchableOpacity>
                    </View>
                </SportCover>

                {/* Stat tiles */}
                <View className="flex-row gap-2.5 px-4 pt-4">
                    <StatTile
                        label={t('game.statWhen', 'מתי')}
                        value={`${new Date(game.date).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'he-IL', { day: 'numeric', month: 'numeric' })} · ${game.time}`}
                    />
                    <StatTile label={t('game.players')} value={`${game.currentPlayers || 0}/${game.maxPlayers}`} />
                    <StatTile label={t('game.statPrice', 'מחיר')} value={game.price ? `₪${game.price}` : t('game.free')} />
                </View>

                {!!game.membersOnlyPriority && game.viewerIsInsider === false
                    && (!!game.guestDescription || game.guestPrice != null) && (
                    <View className="mx-4 mt-3 p-3 rounded-xl bg-gray-50 dark:bg-cyber-card" testID="game-guest-info">
                        <Text className="font-bold text-gray-800 dark:text-white mb-1">{t('game.guestsTitle', 'לאורחים')}</Text>
                        {!!game.guestDescription && <Text className="text-gray-700 dark:text-cyber-muted">{game.guestDescription}</Text>}
                        {game.guestPrice != null && (
                            <Text className="text-gray-700 dark:text-cyber-muted">{t('game.guestPriceLine', 'מחיר לאורחים')}: ₪{game.guestPrice}</Text>
                        )}
                    </View>
                )}

                <View className="flex-row items-center px-5 pt-3 pb-1">
                    <FontAwesome name="map-marker" size={15} color="#9ca3af" style={{ width: 20 }} />
                    <Text className="text-gray-600 dark:text-cyber-muted text-[14px] flex-1" numberOfLines={2}>
                        {game.field?.location || game.fieldLocation || t('game.unknownLocation')}
                    </Text>
                </View>

                {/* Waitlist offer — top of page (same placement idea as web GameLiveSection) */}
                {isWaitlistOfferPending && (
                    <View className="mx-4 mt-4 mb-2 p-4 rounded-xl bg-amber-50 border border-amber-300">
                        <Text className="text-amber-900 font-bold text-lg text-center mb-1">
                            {t('game.spotOpenedUpTitle', 'התפנה מקום במשחק!')}
                        </Text>
                        <Text className="text-amber-800 text-sm text-center mb-4">
                            {approvalOnlyHint
                                ? t('game.waitlistOfferApprovalHint', "אם קיבלת הצעה מרשימת המתנה — אשר או וותר כאן. אם רק ביקשת להצטרף, המארגן צריך לאשר.")
                                : t('game.waitlistOfferSpotReserved', "המקום שמור לך. עליך לאשר את ההצטרפות כדי לתפוס אותו.")}
                        </Text>
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => handleWaitlistConfirm(true)}
                                disabled={actionLoading}
                                className={`flex-1 p-4 rounded-xl items-center ${actionLoading ? 'bg-green-400' : 'bg-green-600'}`}
                            >
                                {actionLoading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text className="text-white font-bold text-base">{t('game.confirmJoin', 'אישור הצטרפות')}</Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleWaitlistConfirm(false)}
                                disabled={actionLoading}
                                className={`flex-1 p-4 rounded-xl items-center border border-red-300 bg-white dark:bg-cyber-card`}
                            >
                                <Text className="text-red-600 font-bold text-base">{t('game.declineSpot', 'ויתור')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {isWaitlisted && !isWaitlistOfferPending && (
                    <View className="mx-4 mt-4 mb-2 p-4 rounded-xl bg-brand-mist border border-brand-pale">
                        <Text className="text-brand-ink font-bold text-base text-center mb-1">{t('game.waitlisted', 'ברשימת המתנה')}</Text>
                        <Text className="text-brand-dark text-sm text-center">
                            {t('game.waitlistSubNotice', 'הרשמת כמחליף. אם יתפנה מקום, תקבל הודעה ותוכל לאשר כאן.')}
                        </Text>
                    </View>
                )}

                {/* Utility Actions Section */}
                <View className="mx-4 mt-3 mb-4 bg-white dark:bg-cyber-card rounded-2xl p-4 flex-row justify-around border border-gray-100 dark:border-cyber-border">
                    <TouchableOpacity 
                        className="items-center"
                        onPress={() => {
                            Share.share({
                                message: t('game.shareMessage', {
                                    defaultValue: `הצטרפו אלי למשחק ב-${game.field?.name || game.fieldName || ''} בתאריך ${game.date.split('-').reverse().join('/')} בשעה ${game.time}!\nhttps://joinup.app/game/${game.id}`,
                                    fieldName: game.field?.name || game.fieldName || '',
                                    date: game.date.split('-').reverse().join('/'),
                                    time: game.time,
                                    id: game.id,
                                }),
                                title: t('game.shareTitle', 'הצטרף למשחק שלי')
                            });
                        }}
                    >
                        <View className="w-12 h-12 bg-brand-mist dark:bg-cyber-border rounded-full items-center justify-center mb-1">
                            <FontAwesome name="share-alt" size={20} color="#059669" />
                        </View>
                        <Text className="text-xs text-gray-600 dark:text-cyber-muted font-bold">{t('game.share', 'שתף')}</Text>
                    </TouchableOpacity>

                    <OpenInMapButton
                        variant="utility"
                        location={{
                            customLat: game.customLat,
                            customLng: game.customLng,
                            lat: game.fieldLat ?? game.field?.lat,
                            lng: game.fieldLng ?? game.field?.lng,
                            customLocation: game.customLocation,
                            address: game.field?.location || game.fieldLocation,
                            name: game.field?.name || game.fieldName,
                        }}
                    />

                    <TouchableOpacity 
                        className="items-center"
                        onPress={() => {
                            const startDate = tryParseJerusalemTimeToUTC(game.date, game.time || '00:00') ?? new Date();
                            const endDate = new Date(startDate.getTime() + (game.duration || 1) * 3600000);
                            
                            const formatGoogleDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
                            
                            const defaultTitle = t('game.calendarDefaultTitle', 'משחק JoinUp');
                            const title = encodeURIComponent(game.title || game.fieldName || defaultTitle);
                            const details = encodeURIComponent(`${defaultTitle}\n\nhttps://joinup.app/game/${game.id}`);
                            const location = encodeURIComponent(game.field?.location || game.fieldLocation || '');
                            
                            const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}&details=${details}&location=${location}`;
                            Linking.openURL(url);
                        }}
                    >
                        <View className="w-12 h-12 bg-brand-mist dark:bg-cyber-border rounded-full items-center justify-center mb-1">
                            <FontAwesome name="calendar-plus-o" size={20} color="#059669" />
                        </View>
                        <Text className="text-xs text-gray-600 dark:text-cyber-muted font-bold">{t('game.calendar', 'יומן')}</Text>
                    </TouchableOpacity>
                </View>

                <GameResultSection game={game} />

                {/* Map Section */}
                <View className="bg-white dark:bg-cyber-card p-4 mb-4 shadow-sm border-b border-gray-100 dark:border-cyber-border">
                    <Text className="text-lg font-bold text-gray-800 dark:text-cyber-text mb-3">{t('game.fieldLocation', 'מיקום המגרש')}</Text>
                    <View className="h-48 rounded-xl overflow-hidden bg-gray-100 dark:bg-cyber-border">
                        <MapView 
                            style={{ flex: 1 }}
                            initialRegion={{
                                latitude: game.customLat || game.fieldLat || 32.0853,
                                longitude: game.customLng || game.fieldLng || 34.7818,
                                latitudeDelta: 0.05,
                                longitudeDelta: 0.05,
                            }}
                        >
                            <Marker 
                                coordinate={{ 
                                    latitude: game.customLat || game.fieldLat || 32.0853, 
                                    longitude: game.customLng || game.fieldLng || 34.7818 
                                }} 
                                title={game.title || game.fieldName} 
                                description={game.customLocation || game.fieldLocation} 
                            />
                        </MapView>
                    </View>
                </View>

                {/* Participants Section */}
                <View className="bg-white dark:bg-cyber-card p-6 mb-4 shadow-sm">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-lg font-bold text-gray-800 dark:text-cyber-text">{t('game.players')}</Text>
                        <Text className="text-gray-500 dark:text-cyber-muted">
                            {game.currentPlayers} / {game.maxPlayers}
                        </Text>
                    </View>

                    {game.teams && game.teams.length > 0 ? (() => {
                                const draftingManagerIds = new Set<string>([
                                    game.organizerId,
                                    ...(game.managers || []).map((m) => m.id),
                                    ...(game.draftingManagerIds || []),
                                ].filter(Boolean) as string[]);
                                const displayTeams = (game.teams || []).map((team) => {
                                    const playerIds = [...(team.playerIds || [])];
                                    if (team.managerId && !playerIds.includes(team.managerId)) {
                                        playerIds.unshift(team.managerId);
                                    }
                                    return { ...team, playerIds };
                                });
                                const assignedPlayerIds = new Set(displayTeams.flatMap(t => t.playerIds || []));
                                for (const mid of draftingManagerIds) assignedPlayerIds.add(mid);
                                const bench = game.participants?.filter(p => !assignedPlayerIds.has(p.id)) || [];
                                return (
                                    <View className="flex-col gap-4">
                                        {displayTeams.map(team => {
                                            if (!team.playerIds || team.playerIds.length === 0) return null;
                                            return (
                                                <View key={team.id} className="border border-gray-100 dark:border-cyber-border rounded-xl p-3 bg-gray-50 dark:bg-cyber-bg" style={{ borderRightWidth: 4, borderRightColor: team.color }}>
                                                    <Text className="font-bold text-gray-800 dark:text-cyber-text mb-2">{team.name} ({team.playerIds.length})</Text>
                                                    <View className="flex-row flex-wrap">
                                                        {team.playerIds.map(pid => {
                                                            const p = game.participants?.find(part => part.id === pid);
                                                            if (!p) return null;
                                                            return (
                                                                <TouchableOpacity key={pid} onPress={() => router.push(`/user/${p.id}`)} className="mr-3 mb-2 items-center w-12">
                                                                    <SafeImage source={{ uri: p.avatar || "https://ui-avatars.com/api/?name=" + p.name }} className="w-10 h-10 rounded-full bg-gray-200 dark:bg-cyber-border mb-1" />
                                                                    <Text className="text-[10px] text-center text-gray-600 dark:text-cyber-muted" numberOfLines={1}>{p.name?.split(' ')[0]}</Text>
                                                                </TouchableOpacity>
                                                            )
                                                        })}
                                                    </View>
                                                </View>
                                            )
                                        })}

                                        {bench.length > 0 && (
                                            <View className="border border-gray-100 dark:border-cyber-border rounded-xl p-3 bg-white dark:bg-cyber-card">
                                                <Text className="font-bold text-gray-500 dark:text-cyber-muted mb-2">{t('game.unassignedBench', 'לא שובצו')} ({bench.length})</Text>
                                                <View className="flex-row flex-wrap">
                                                    {bench.map(p => (
                                                        <TouchableOpacity key={p.id} onPress={() => router.push(`/user/${p.id}`)} className="mr-3 mb-2 items-center w-12">
                                                            <SafeImage source={{ uri: p.avatar || "https://ui-avatars.com/api/?name=" + p.name }} className="w-10 h-10 rounded-full bg-gray-200 dark:bg-cyber-border mb-1" />
                                                            <Text className="text-[10px] text-center text-gray-600 dark:text-cyber-muted" numberOfLines={1}>{p.name?.split(' ')[0]}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                );
                            })() : (
                        <View className="flex-row flex-wrap">
                            {game.participants?.map((p) => (
                                <TouchableOpacity key={p.id} onPress={() => router.push(`/user/${p.id}`)} className="ml-4 mb-4 items-center w-16">
                                    <SafeImage
                                        source={{ uri: p.avatar || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y" }}
                                        className="w-12 h-12 rounded-full bg-gray-200 dark:bg-cyber-border mb-1"
                                    />
                                    <Text
                                        className="text-xs text-center text-gray-600 dark:text-cyber-muted"
                                        numberOfLines={1}
                                    >
                                        {p.name || t('game.user', 'משתמש')}
                                    </Text>
                                    {p.id === game.organizerId && (
                                        <Text className="text-[10px] text-brand font-bold">{t('game.organizer', 'מארגן')}</Text>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Pending Join Requests & Waitlist (organizer/manager only) */}
                {canManage && (
                    <PendingRequestsList
                        gameId={game.id}
                        onDecision={(updatedGame) => {
                            if (updatedGame) setGame(updatedGame);
                            else fetchGame();
                        }}
                    />
                )}

                {/* Organizer tools — one neutral secondary style, red only for destructive */}
                {isOrganizer && (
                    <View className="px-4 pt-2 pb-4">
                        <Text className="text-gray-500 dark:text-cyber-muted text-[12px] font-semibold mb-0.5">
                            {t('game.organizerTools', 'כלי מארגן')}
                        </Text>
                        <SecondaryAction
                            label={t('game.editGame', 'ערוך משחק')}
                            icon="pencil"
                            onPress={() => router.push(`/game/edit/${game.id}`)}
                        />
                        {manageTeamsAction}
                        {/* Series Management */}
                        {game.seriesId ? (
                            <SecondaryAction
                                label={t('game.manageSeries', 'לעמוד הקבוצה')}
                                icon="calendar-check-o"
                                onPress={() => router.push(`/series/${game.seriesId}`)}
                            />
                        ) : (
                            <SecondaryAction
                                label={t('game.convertToGroup', 'הפוך לקבוצה')}
                                icon="repeat"
                                onPress={() => series.actions.setOpen(true)}
                            />
                        )}
                        {!isCancelled && game.status !== 'COMPLETED' && (
                            <SecondaryAction
                                label={t('game.cancelGame', 'בטל משחק')}
                                icon="ban"
                                onPress={handleCancelGame}
                                destructive
                            />
                        )}
                    </View>
                )}

                {/* Game-role managers (not the organizer) get team management only */}
                {!isOrganizer && canManageTeams && (
                    <View className="px-4 pt-2 pb-4">
                        {manageTeamsAction}
                    </View>
                )}

                {game.viewerParticipationStatus === 'CONFIRMED' && (
                    <GameRatingsPanel gameId={game.id} />
                )}

                <View className="h-6" />
            </ScrollView>

            {/* Floating back button over the hero */}
            <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 10, start: 16 }}>
                <BackButton variant="overlay" />
            </View>

            {/* Sticky primary CTA — waitlist offer CTAs live in the top banner only */}
            {(isCancelled || !isWaitlistOfferPending) && (
                <View
                    className="bg-white dark:bg-cyber-card border-t border-gray-100 dark:border-cyber-border px-4 pt-3"
                    // The bottom tab bar stays visible under this screen and already
                    // reserves the device's bottom inset, so only a fixed gap is needed here.
                    style={{ paddingBottom: 12 }}
                >
                    {isCancelled ? (
                        <View className="min-h-[52px] px-4 py-3 rounded-2xl items-center justify-center bg-amber-50 border border-amber-200">
                            <Text className="text-amber-800 font-bold text-[15px] text-center">{t('game.cancelledBanner', 'המשחק בוטל על ידי המארגן, ולא ניתן להצטרף אליו.')}</Text>
                        </View>
                    ) : isParticipant ? (
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                testID="game-open-chat"
                                onPress={() => router.push({
                                    pathname: '/chat/[id]',
                                    params: {
                                        id: game.id,
                                        name: game.title || game.fieldName || '',
                                    },
                                })}
                                className="flex-1 h-[52px] rounded-2xl items-center justify-center flex-row bg-brand"
                            >
                                <FontAwesome name="comments" size={17} color="#fff" style={{ marginEnd: 8 }} />
                                <Text className="text-white font-bold text-[16px]">{t('game.openChat', 'פתח צ\'אט')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleעזוב}
                                disabled={actionLoading}
                                className="h-[52px] px-5 rounded-2xl items-center justify-center border border-red-200 bg-white dark:bg-cyber-card"
                            >
                                <Text className="text-red-600 font-bold text-[15px]">{t('game.leaveGame', 'עזוב משחק')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : isWaitlisted ? (
                        <View className="flex-row gap-3 items-center">
                            <View className="flex-1 min-h-[52px] px-3 py-2 rounded-2xl items-center justify-center bg-gray-100 dark:bg-cyber-border">
                                <Text className="text-gray-700 dark:text-cyber-text font-bold text-[14px] text-center">{t('game.waitlistStatus', 'הרשמת כמחליף (ברשימת המתנה)')}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleעזוב}
                                disabled={actionLoading}
                                className="h-[52px] px-4 rounded-2xl items-center justify-center border border-red-200 bg-white dark:bg-cyber-card"
                            >
                                <Text className="text-red-600 font-bold text-[14px]">{t('game.cancelWaitlist', 'בטל הרשמה כמחליף')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : isPendingApproval ? (
                        <View className="h-[52px] rounded-2xl items-center justify-center bg-amber-50 border border-amber-200">
                            <Text className="text-amber-700 font-bold text-[16px]">{t('game.requestPending')}</Text>
                        </View>
                    ) : isRejected ? (
                        <View className="h-[52px] rounded-2xl items-center justify-center bg-gray-100 dark:bg-cyber-border">
                            <Text className="text-gray-500 dark:text-cyber-muted font-bold text-[16px]">{t('game.reject')}</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            testID="game-join-button"
                            onPress={handleJoin}
                            disabled={actionLoading}
                            className={`h-[52px] rounded-2xl items-center justify-center ${actionLoading ? 'bg-brand-soft' : 'bg-brand'}`}
                            style={{
                                shadowColor: '#059669',
                                shadowOpacity: 0.25,
                                shadowRadius: 10,
                                shadowOffset: { width: 0, height: 4 },
                                elevation: 3,
                            }}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold text-[16px]">
                                    {isFull
                                        ? t('game.joinWaitlist', 'הצטרף לרשימת המתנה')
                                        : game.joinPolicy === 'REQUIRES_APPROVAL'
                                            ? t('game.requestToJoin', 'בקש להצטרף')
                                            : t('game.joinGame', 'הצטרף למשחק')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Series Creation Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={series.state.open}
                onRequestClose={() => series.actions.setOpen(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white dark:bg-cyber-card rounded-t-3xl p-6 h-[70%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-gray-800 dark:text-cyber-text">{t('series.createGroup', 'צור קבוצה')}</Text>
                            <TouchableOpacity onPress={() => series.actions.setOpen(false)}>
                                <Text className="text-brand font-bold">{t('common.cancel', 'ביטול')}</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row mb-6 bg-gray-100 dark:bg-cyber-border p-1 rounded-lg">
                            <TouchableOpacity
                                onPress={() => series.actions.setTabValue(0)}
                                className={`flex-1 p-2 rounded-md items-center ${series.state.tabValue === 0 ? 'bg-white dark:bg-cyber-card shadow-sm' : ''}`}
                            >
                                <Text className={`font-bold ${series.state.tabValue === 0 ? 'text-brand' : 'text-gray-500 dark:text-cyber-muted'}`}>{t('series.weekly', 'שבועי')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => series.actions.setTabValue(1)}
                                className={`flex-1 p-2 rounded-md items-center ${series.state.tabValue === 1 ? 'bg-white dark:bg-cyber-card shadow-sm' : ''}`}
                            >
                                <Text className={`font-bold ${series.state.tabValue === 1 ? 'text-brand' : 'text-gray-500 dark:text-cyber-muted'}`}>{t('series.customDates', 'תאריכים מותאמים אישית')}</Text>
                            </TouchableOpacity>
                        </View>

                        {series.state.tabValue === 0 ? (
                            <View>
                                <Text className="text-gray-600 dark:text-cyber-muted mb-4 leading-6">
                                    • {t('series.weeklyBullet1', 'יוצר משחק בכל שבוע בשעה')} <Text className="font-bold">{game.time}</Text>.{'\n'}
                                    • {t('series.weeklyBullet2', 'מייצר מיד את 4 המשחקים הבאים.')}{'\n'}
                                    • {t('series.weeklyBullet3', 'שחקנים יכולים להירשם להצטרפות אוטומטית.')}
                                </Text>
                            </View>
                        ) : (
                            <View>
                                <Text className="text-gray-600 dark:text-cyber-muted mb-4">{t('series.customDatesHint', 'בחר תאריכים ספציפיים לקבוצה זו.')}</Text>
                                <Text className="text-orange-500 italic">
                                    {t('series.customDatesWebHint', 'בחירת תאריכים מותאמים אישית מותאמת יותר לשימוש באתר. באפליקציה מומלץ להשתמש באפשרות השבועית.')}
                                </Text>
                            </View>
                        )}

                        <View className="flex-1" />

                        <TouchableOpacity
                            onPress={series.actions.handleMakeRecurring}
                            disabled={series.state.loading}
                            className={`p-4 rounded-xl items-center mb-6 ${series.state.loading ? 'bg-gray-400' : 'bg-brand'}`}
                        >
                            {series.state.loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold text-lg">{t('series.createGroup', 'צור קבוצה')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
