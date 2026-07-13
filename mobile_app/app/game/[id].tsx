import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image, Modal, Share, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import React, { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { gamesApi } from '@/services/api';
import { Game } from '@/types/game';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSeriesLogic } from '@/hooks/useSeriesLogic';
import { useTranslation } from 'react-i18next';
import PendingRequestsList from '@/components/PendingRequestsList';
import GameRatingsPanel from '@/components/GameRatingsPanel';
import { useGameUpdatedListener } from '@/context/GameUpdateContext';
import { hasWaitlistOffer, isOrganizerApprovalPending } from '@/utils/waitlistOffer';

/** Visible proof that this Metro bundle is loaded (remove after waitlist QA). */
const MOBILE_GAME_UI_BUILD = 'wl-accept-v3';

export default function GameDetailsScreen() {
    const { t } = useTranslation();
    const params = useLocalSearchParams<{ id: string | string[] }>();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    const router = useRouter();

    const [game, setGame] = useState<Game | null>(null);
    const [loading, setLoading] = useState(true);
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
                token = await getToken();
                if (!token) {
                    await new Promise((r) => setTimeout(r, 400));
                    token = await getToken();
                }
                if (!token) {
                    // Keep spinner — never paint a guest snapshot that hides the offer.
                    return;
                }
            }
            const data = await gamesApi.getById(id, token || undefined);
            setGame(data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to load game", err);
            Alert.alert("Error", "Failed to load game details");
            setLoading(false);
        }
    }, [id, isAuthLoaded, isSignedIn, getToken]);

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
                Alert.alert("Error", "עליך להיות מחובר כדי להצטרף");
                return;
            }
            const result = await gamesApi.join(game.id, token);
            if (result.pending) {
                Alert.alert(t('game.requestSent'), t('game.requestPending'));
            } else if (result.viewerParticipationStatus === 'WAITLISTED') {
                Alert.alert("Success", "נרשמת לרשימת ההמתנה");
            } else {
                Alert.alert("Success", "הצטרפת למשחק!");
            }
            setGame(result);
        } catch (err: any) {
            Alert.alert("Error", err.response?.data?.error || "Failed to join game");
        } finally {
            setActionLoading(false);
        }
    };

    const handleעזוב = async () => {
        if (!game) return;
        Alert.alert("עזוב Game", "האם אתה בטוח שברצונך לעזוב?", [
            { text: "Cancel", style: "cancel" },
            {
                text: t('game.leave'),
                style: "destructive",
                onPress: async () => {
                    setActionLoading(true);
                    try {
                        const token = await getToken();
                        if (!token) return;
                        await gamesApi.leave(game.id, token);
                        Alert.alert("Success", "עזבת את המשחק.");
                        fetchGame(); // Refresh
                    } catch (err: any) {
                        Alert.alert("Error", err.response?.data?.error || "Failed to leave game");
                    } finally {
                        setActionLoading(false);
                    }
                }
            }
        ]);
    };

    const handleWaitlistConfirm = async (accept: boolean) => {
        if (!game) return;
        setActionLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            const result = await gamesApi.waitlistConfirm(game.id, accept, token);
            setGame(result);
            Alert.alert("Success", accept ? "הצטרפת למשחק בהצלחה!" : "ויתרת על המקום בהצלחה");
            fetchGame();
        } catch (err: any) {
            const msg = err?.message || err?.response?.data?.error || "";
            if (String(msg).includes('No pending waitlist offer') || String(msg).includes('waitlist')) {
                Alert.alert(
                    "ממתין לאישור המארגן",
                    "אין הצעת מקום פעילה מרשימת ההמתנה. אם שלחת בקשת הצטרפות, המארגן צריך לאשר אותה."
                );
            } else {
                Alert.alert("Error", msg || "Failed to process waitlist confirmation");
            }
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    if (!game) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <Text className="text-gray-500">המשחק לא נמצא</Text>
            </View>
        );
    }

    const isParticipant = game.viewerParticipationStatus === 'CONFIRMED'
        || game.participants?.some(p => p.id === user?.id);
    const isFull = (game.currentPlayers || 0) >= game.maxPlayers;
    const isOrganizer = game.organizerId === user?.id;
    const isManager = game.managers?.some(m => m.id === user?.id) || false;
    const canManage = isOrganizer || isManager;
    const isWaitlistOfferPending = hasWaitlistOffer(game);
    // Never show a dead-end "ממתין לאישור" for PENDING — offer CTAs always win.
    // Organizer-approval-only is handled inside offer error handling if confirm fails.
    const isPendingApproval = false;
    const isRejected = game.viewerParticipationStatus === 'REJECTED';
    const isWaitlisted = game.viewerParticipationStatus === 'WAITLISTED' && !isWaitlistOfferPending;
    const approvalOnlyHint = isOrganizerApprovalPending(game);

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="flex-1 text-xl font-bold text-gray-900">פרטי משחק · v3</Text>
                <Text className="text-[10px] text-red-500 font-bold">{MOBILE_GAME_UI_BUILD}</Text>
            </View>
            <ScrollView className="flex-1 bg-gray-50">
                {/* Waitlist offer — top of page (same placement idea as web GameLiveSection) */}
                {isWaitlistOfferPending && (
                    <View className="mx-4 mt-4 mb-2 p-4 rounded-xl bg-amber-50 border border-amber-300">
                        <Text className="text-amber-900 font-bold text-lg text-center mb-1">
                            התפנה מקום במשחק!
                        </Text>
                        <Text className="text-amber-800 text-sm text-center mb-4">
                            {approvalOnlyHint
                                ? "אם קיבלת הצעה מרשימת המתנה — אשר או וותר כאן. אם רק ביקשת להצטרף, המארגן צריך לאשר."
                                : "המקום שמור לך. עליך לאשר את ההצטרפות כדי לתפוס אותו."}
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
                                    <Text className="text-white font-bold text-base">אישור הצטרפות</Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleWaitlistConfirm(false)}
                                disabled={actionLoading}
                                className={`flex-1 p-4 rounded-xl items-center border border-red-300 bg-white`}
                            >
                                <Text className="text-red-600 font-bold text-base">ויתור</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {isWaitlisted && !isWaitlistOfferPending && (
                    <View className="mx-4 mt-4 mb-2 p-4 rounded-xl bg-blue-50 border border-blue-200">
                        <Text className="text-blue-900 font-bold text-base text-center mb-1">ברשימת המתנה</Text>
                        <Text className="text-blue-800 text-sm text-center">
                            הרשמת כמחליף. אם יתפנה מקום, תקבל הודעה ותוכל לאשר כאן.
                        </Text>
                    </View>
                )}

                {/* Header Section */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    <TouchableOpacity
                        disabled={!game.fieldId}
                        onPress={() => game.fieldId && router.push(`/field/${game.fieldId}`)}
                        className="flex-row items-center mb-2"
                    >
                        <Text className="text-2xl font-bold text-gray-800 text-left">{game.field?.name || game.fieldName || t('game.unknownField')}</Text>
                        {game.fieldId ? (
                            <FontAwesome name="angle-left" size={20} color="#2563eb" style={{ marginLeft: 8 }} />
                        ) : null}
                    </TouchableOpacity>
                    <View className="flex-row items-center mb-2">
                        <FontAwesome name="calendar" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base">
                            {new Date(game.date).toLocaleDateString()} at {game.time}
                        </Text>
                    </View>
                    <View className="flex-row items-center mb-2">
                        <FontAwesome name="map-marker" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base">
                            {game.field?.location || game.fieldLocation || t('game.unknownLocation')}
                        </Text>
                    </View>
                    <View className="flex-row items-center">
                        <FontAwesome name="money" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base">
                            {game.price ? `₪${game.price}` : t('game.free')}
                        </Text>
                    </View>
                </View>

                {/* Utility Actions Section */}
                <View className="bg-white p-4 mb-4 shadow-sm flex-row justify-around border-y border-gray-100">
                    <TouchableOpacity 
                        className="items-center"
                        onPress={() => {
                            Share.share({
                                message: `הצטרפו אלי למשחק ב-${game.field?.name || game.fieldName} בתאריך ${game.date.split('-').reverse().join('/')} בשעה ${game.time}!\nhttps://joinup.app/game/${game.id}`,
                                title: 'הצטרף למשחק שלי'
                            });
                        }}
                    >
                        <View className="w-12 h-12 bg-blue-50 rounded-full items-center justify-center mb-1">
                            <FontAwesome name="share-alt" size={20} color="#2563eb" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{t('game.share', 'שתף')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        className="items-center"
                        onPress={() => {
                            const query = encodeURIComponent(game.field?.location || game.fieldLocation || '');
                            Linking.openURL(`https://maps.google.com/?q=${query}`);
                        }}
                    >
                        <View className="w-12 h-12 bg-green-50 rounded-full items-center justify-center mb-1">
                            <FontAwesome name="location-arrow" size={20} color="#16a34a" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{t('game.navigate', 'נווט')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        className="items-center"
                        onPress={() => {
                            const startStr = `${game.date}T${game.time || '00:00'}:00`;
                            const startDate = new Date(startStr);
                            const endDate = new Date(startDate.getTime() + (game.duration || 1) * 3600000);
                            
                            const formatGoogleDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
                            
                            const title = encodeURIComponent(game.title || game.fieldName || 'Sports Game');
                            const details = encodeURIComponent(`JoinUp Game\n\nLink: https://joinup.app/game/${game.id}`);
                            const location = encodeURIComponent(game.field?.location || game.fieldLocation || '');
                            
                            const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}&details=${details}&location=${location}`;
                            Linking.openURL(url);
                        }}
                    >
                        <View className="w-12 h-12 bg-purple-50 rounded-full items-center justify-center mb-1">
                            <FontAwesome name="calendar-plus-o" size={20} color="#9333ea" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{t('game.calendar', 'יומן')}</Text>
                    </TouchableOpacity>
                </View>

                {/* Map Section */}
                <View className="bg-white p-4 mb-4 shadow-sm border-b border-gray-100">
                    <Text className="text-lg font-bold text-gray-800 mb-3">{t('game.location', 'מיקום המגרש')}</Text>
                    <View className="h-48 rounded-xl overflow-hidden bg-gray-100">
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
                <View className="bg-white p-6 mb-4 shadow-sm">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-lg font-bold text-gray-800">{t('game.players')}</Text>
                        <Text className="text-gray-500">
                            {game.currentPlayers} / {game.maxPlayers}
                        </Text>
                    </View>

                    {game.teams && game.teams.length > 0 ? (
                        <View className="flex-col gap-4">
                            {game.teams.map(team => {
                                if (!team.playerIds || team.playerIds.length === 0) return null;
                                return (
                                    <View key={team.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50" style={{ borderRightWidth: 4, borderRightColor: team.color }}>
                                        <Text className="font-bold text-gray-800 mb-2">{team.name} ({team.playerIds.length})</Text>
                                        <View className="flex-row flex-wrap">
                                            {team.playerIds.map(pid => {
                                                const p = game.participants?.find(part => part.id === pid);
                                                if (!p) return null;
                                                return (
                                                    <TouchableOpacity key={pid} onPress={() => router.push(`/user/${p.id}`)} className="mr-3 mb-2 items-center w-12">
                                                        <Image source={{ uri: p.avatar || "https://ui-avatars.com/api/?name=" + p.name }} className="w-10 h-10 rounded-full bg-gray-200 mb-1" />
                                                        <Text className="text-[10px] text-center text-gray-600" numberOfLines={1}>{p.name?.split(' ')[0]}</Text>
                                                    </TouchableOpacity>
                                                )
                                            })}
                                        </View>
                                    </View>
                                )
                            })}
                            
                            {/* Unassigned Players (Bench) */}
                            {(() => {
                                const assignedPlayerIds = new Set(game.teams.flatMap(t => t.playerIds || []));
                                const bench = game.participants?.filter(p => !assignedPlayerIds.has(p.id)) || [];
                                if (bench.length === 0) return null;
                                return (
                                    <View className="border border-gray-100 rounded-xl p-3 bg-white">
                                        <Text className="font-bold text-gray-500 mb-2">לא שובצו ({bench.length})</Text>
                                        <View className="flex-row flex-wrap">
                                            {bench.map(p => (
                                                <TouchableOpacity key={p.id} onPress={() => router.push(`/user/${p.id}`)} className="mr-3 mb-2 items-center w-12">
                                                    <Image source={{ uri: p.avatar || "https://ui-avatars.com/api/?name=" + p.name }} className="w-10 h-10 rounded-full bg-gray-200 mb-1" />
                                                    <Text className="text-[10px] text-center text-gray-600" numberOfLines={1}>{p.name?.split(' ')[0]}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                )
                            })()}
                        </View>
                    ) : (
                        <View className="flex-row flex-wrap">
                            {game.participants?.map((p) => (
                                <TouchableOpacity key={p.id} onPress={() => router.push(`/user/${p.id}`)} className="ml-4 mb-4 items-center w-16">
                                    <Image
                                        source={{ uri: p.avatar || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y" }}
                                        className="w-12 h-12 rounded-full bg-gray-200 mb-1"
                                    />
                                    <Text
                                        className="text-xs text-center text-gray-600"
                                        numberOfLines={1}
                                    >
                                        {p.name || "User"}
                                    </Text>
                                    {p.id === game.organizerId && (
                                        <Text className="text-[10px] text-blue-600 font-bold">מארגן</Text>
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

                {/* Actions Section */}
                <View className="p-6">
                    {/* Waitlist offer must win over every other CTA — user has a reserved spot. */}
                    {isWaitlistOfferPending ? (
                        <View>
                            <View className="p-4 rounded-xl items-center bg-amber-50 border border-amber-200 mb-3">
                                <Text className="text-amber-800 font-bold text-base text-center">
                                    התפנה מקום במשחק! המקום שמור לך.
                                </Text>
                            </View>
                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    onPress={() => handleWaitlistConfirm(true)}
                                    disabled={actionLoading}
                                    className={`flex-1 p-4 rounded-xl items-center ${actionLoading ? 'bg-green-400' : 'bg-green-600'}`}
                                >
                                    {actionLoading ? (
                                        <ActivityIndicator color="white" />
                                    ) : (
                                        <Text className="text-white font-bold text-lg">אישור הצטרפות</Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleWaitlistConfirm(false)}
                                    disabled={actionLoading}
                                    className={`flex-1 p-4 rounded-xl items-center ${actionLoading ? 'bg-red-400' : 'bg-red-600'}`}
                                >
                                    <Text className="text-white font-bold text-lg">ויתור</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : isParticipant ? (
                        <View>
                            <TouchableOpacity
                                onPress={() => router.push(`/chat/${game.id}`)}
                                className="bg-blue-100 p-4 rounded-xl items-center mb-3 border border-blue-200"
                            >
                                <Text className="text-blue-700 font-bold text-lg">פתח צ'אט</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleעזוב}
                                disabled={actionLoading}
                                className="bg-red-50 p-4 rounded-xl items-center border border-red-100"
                            >
                                <Text className="text-red-600 font-bold text-lg">עזוב משחק</Text>
                            </TouchableOpacity>
                        </View>
                    ) : isWaitlisted ? (
                        <View>
                            <View className="p-4 rounded-xl items-center bg-gray-100 border border-gray-200 mb-3">
                                <Text className="text-gray-700 font-bold text-base text-center">הרשמת כמחליף (ברשימת המתנה)</Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleעזוב}
                                disabled={actionLoading}
                                className="bg-red-50 p-4 rounded-xl items-center border border-red-100"
                            >
                                <Text className="text-red-600 font-bold text-lg">בטל הרשמה כמחליף</Text>
                            </TouchableOpacity>
                        </View>
                    ) : isPendingApproval ? (
                        <View className="p-4 rounded-xl items-center bg-amber-50 border border-amber-200">
                            <Text className="text-amber-700 font-bold text-lg">{t('game.requestPending')}</Text>
                        </View>
                    ) : isRejected ? (
                        <View className="p-4 rounded-xl items-center bg-gray-100 border border-gray-200">
                            <Text className="text-gray-500 font-bold text-lg">{t('game.reject')}</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={handleJoin}
                            disabled={actionLoading}
                            className={`p-4 rounded-xl items-center ${actionLoading ? 'bg-blue-400' : 'bg-blue-600'}`}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold text-lg">
                                    {isFull
                                        ? "הצטרף לרשימת המתנה"
                                        : game.joinPolicy === 'REQUIRES_APPROVAL'
                                            ? "בקש להצטרף"
                                            : "הצטרף למשחק"}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )}

                    {isOrganizer && (
                        <>
                            <TouchableOpacity
                                onPress={() => router.push(`/game/edit/${game.id}`)}
                                className="mt-4 p-4 rounded-xl items-center border border-gray-300"
                            >
                                <Text className="text-gray-600 font-bold">ערוך משחק</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => router.push(`/game/teams/${game.id}`)}
                                className="mt-4 p-4 rounded-xl items-center border border-indigo-200 bg-indigo-50"
                            >
                                <View className="flex-row items-center">
                                    <FontAwesome name="users" size={16} color="#4f46e5" style={{ marginLeft: 8 }} />
                                    <Text className="text-indigo-700 font-bold">נהל קבוצות</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Series Management */}
                            {game.seriesId ? (
                                <TouchableOpacity
                                    onPress={() => router.push(`/series/${game.seriesId}`)}
                                    className="mt-3 p-4 rounded-xl items-center border border-blue-200 bg-blue-50"
                                >
                                    <View className="flex-row items-center">
                                        <FontAwesome name="calendar-check-o" size={16} color="#2563eb" style={{ marginLeft: 8 }} />
                                        <Text className="text-blue-700 font-bold">נהל סדרה</Text>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    onPress={() => series.actions.setOpen(true)}
                                    className="mt-3 p-4 rounded-xl items-center border border-purple-200 bg-purple-50"
                                >
                                    <View className="flex-row items-center">
                                        <FontAwesome name="repeat" size={16} color="#9333ea" style={{ marginLeft: 8 }} />
                                        <Text className="text-purple-700 font-bold">הפוך לסדרה</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>

                {game.viewerParticipationStatus === 'CONFIRMED' && (
                    <GameRatingsPanel gameId={game.id} />
                )}

                <View className="h-10" />
            </ScrollView>

            {/* Sticky accept/decline so offer actions stay visible without scrolling */}
            {isWaitlistOfferPending && (
                <View className="px-4 py-3 bg-white border-t border-amber-200 flex-row gap-3">
                    <TouchableOpacity
                        onPress={() => handleWaitlistConfirm(true)}
                        disabled={actionLoading}
                        className={`flex-1 p-3.5 rounded-xl items-center ${actionLoading ? 'bg-green-400' : 'bg-green-600'}`}
                    >
                        {actionLoading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-white font-bold text-base">אישור הצטרפות</Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => handleWaitlistConfirm(false)}
                        disabled={actionLoading}
                        className="flex-1 p-3.5 rounded-xl items-center bg-red-600"
                    >
                        <Text className="text-white font-bold text-base">ויתור</Text>
                    </TouchableOpacity>
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
                    <View className="bg-white rounded-t-3xl p-6 h-[70%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-gray-800">צור סדרה</Text>
                            <TouchableOpacity onPress={() => series.actions.setOpen(false)}>
                                <Text className="text-blue-600 font-bold">ביטול</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row mb-6 bg-gray-100 p-1 rounded-lg">
                            <TouchableOpacity
                                onPress={() => series.actions.setTabValue(0)}
                                className={`flex-1 p-2 rounded-md items-center ${series.state.tabValue === 0 ? 'bg-white shadow-sm' : ''}`}
                            >
                                <Text className={`font-bold ${series.state.tabValue === 0 ? 'text-blue-600' : 'text-gray-500'}`}>שבועי</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => series.actions.setTabValue(1)}
                                className={`flex-1 p-2 rounded-md items-center ${series.state.tabValue === 1 ? 'bg-white shadow-sm' : ''}`}
                            >
                                <Text className={`font-bold ${series.state.tabValue === 1 ? 'text-blue-600' : 'text-gray-500'}`}>תאריכים מותאמים אישית</Text>
                            </TouchableOpacity>
                        </View>

                        {series.state.tabValue === 0 ? (
                            <View>
                                <Text className="text-gray-600 mb-4 leading-6">
                                    • Creates a game every week at <Text className="font-bold">{game.time}</Text>.{'\n'}
                                    • Generates the next 4 games immediately.{'\n'}
                                    • Players can subscribe to auto-join.
                                </Text>
                            </View>
                        ) : (
                            <View>
                                <Text className="text-gray-600 mb-4">Select specific dates for this series.</Text>
                                {/* Date picker logic simplified for mobile MVP - perhaps just suggest Weekly for now */}
                                <Text className="text-orange-500 italic">Custom dates feature is optimized for web. Please use Weekly for best experience on mobile.</Text>
                            </View>
                        )}

                        <View className="flex-1" />

                        <TouchableOpacity
                            onPress={series.actions.handleMakeRecurring}
                            disabled={series.state.loading}
                            className={`p-4 rounded-xl items-center mb-6 ${series.state.loading ? 'bg-gray-400' : 'bg-blue-600'}`}
                        >
                            {series.state.loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold text-lg">צור סדרה</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
