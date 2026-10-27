import { View, Text, Switch, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator, Share, Modal, Pressable } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { seriesApi, usersApi, chatsApi } from '@/services/api';
import type { UpdateSeriesDTO } from '@/services/api/series';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import LoadingMotif from '@/components/loading/LoadingMotif';
import { SPORT_MAPPING } from '@/utils/sports';
import SeriesImageUpload from '@/components/series/SeriesImageUpload';
import SeriesLocationPicker, { type SeriesFieldOption } from '@/components/series/SeriesLocationPicker';
import SeriesRegistrationRule, {
    type RegistrationOpenMode, DEFAULT_REG_OPEN_TIME, TIME_RE, initialRegMode, defaultRegOpenDay,
} from '@/components/series/SeriesRegistrationRule';
import DeleteSeriesModal from '@/components/series/DeleteSeriesModal';
import MuteNotificationsButton from '@/components/MuteNotificationsButton';
import BackButton from '@/components/ui/BackButton';
import FriendsOnlyLinkPolicyPicker from '@/components/FriendsOnlyLinkPolicyPicker';
import SeriesJoinRequests from '@/components/series/SeriesJoinRequests';
import type { FriendsOnlyLinkPolicy } from '@/types/game';
import SafeImage from '@/components/SafeImage';
import OpenInMapButton from '@/components/OpenInMapButton';
import { appAlert } from '@/i18n/appAlert';
import { friendSuggestions, mergeFriendsFirst } from '@/utils/friendSuggestions';

export default function SeriesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const dateLocale = i18n.language === 'he' ? 'he-IL' : 'en-US';

    const [series, setSeries] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    // Friends-only group whose link is blocked for this viewer (403 SERIES_FRIENDS_ONLY).
    const [friendsOnlyLocked, setFriendsOnlyLocked] = useState(false);
    // Outsider of a friends-only group: their subscribe became a join request.
    const [requestStatus, setRequestStatus] = useState<'PENDING' | 'REJECTED' | null>(null);

    // Settings State
    const [updating, setUpdating] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const scrollViewRef = useRef<ScrollView>(null);
    const settingsSectionY = useRef(0);

    const toggleSettings = () => {
        const next = !showSettings;
        setShowSettings(next);
        if (next) {
            // Settings section is collapsed by default and lives further down the page --
            // scrolling it into view after it expands is what makes the header's gear
            // button (and this same toggle inside the page body) actually useful.
            setTimeout(() => {
                scrollViewRef.current?.scrollTo({ y: settingsSectionY.current, animated: true });
            }, 100);
        }
    };
    const [time, setTime] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [updateFuture, setUpdateFuture] = useState(true);
    const [maxPlayers, setMaxPlayers] = useState('10');
    const [price, setPrice] = useState('');
    const [sport, setSport] = useState('SOCCER');
    const [isFriendsOnly, setIsFriendsOnly] = useState(false);
    const [friendsOnlyLinkPolicy, setFriendsOnlyLinkPolicy] = useState<FriendsOnlyLinkPolicy>('REQUEST_TO_JOIN');
    const [requiresApproval, setRequiresApproval] = useState(false);
    const [lotteryEnabled, setLotteryEnabled] = useState(false);
    const [organizerInLottery, setOrganizerInLottery] = useState(false);
    const [teamSize, setTeamSize] = useState('');
    const [welcomeMessage, setWelcomeMessage] = useState('');
    const [membersOnlyPriority, setMembersOnlyPriority] = useState(false);
    const [guestHours, setGuestHours] = useState('');
    const [guestPrice, setGuestPrice] = useState('');
    const [guestDescription, setGuestDescription] = useState('');
    const [guestWelcomeMessage, setGuestWelcomeMessage] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [duration, setDuration] = useState('1');
    const [regMode, setRegMode] = useState<RegistrationOpenMode>('none');
    const [regDay, setRegDay] = useState(0);
    const [regTime, setRegTime] = useState(DEFAULT_REG_OPEN_TIME);
    const [regHours, setRegHours] = useState('');
    const [selectedField, setSelectedField] = useState<SeriesFieldOption | null>(null);
    const [newFieldMode, setNewFieldMode] = useState(false);
    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldLocation, setNewFieldLocation] = useState('');
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [memberQuery, setMemberQuery] = useState('');
    const [addingMember, setAddingMember] = useState(false);
    const [memberResults, setMemberResults] = useState<any[]>([]);
    const [memberSearching, setMemberSearching] = useState(false);
    const [memberSearchError, setMemberSearchError] = useState(false);
    const [memberFocused, setMemberFocused] = useState(false);
    // Friends are fetched once per screen (first focus of the add-member field) and reused.
    const [myFriends, setMyFriends] = useState<any[] | null>(null);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [friendsError, setFriendsError] = useState(false);
    const friendsInflight = useRef(false);
    const [selectedMembers, setSelectedMembers] = useState<{ id: string; name: string; avatar: string | null }[]>([]);
    const [memberMenu, setMemberMenu] = useState<{ id: string; name: string } | null>(null);

    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        fetchSeries();
    }, [id]);

    const fetchSeries = async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const data = await seriesApi.getById(id, token);
            setSeries(data);
            setFriendsOnlyLocked(false);
            setRequestStatus(data.viewerJoinRequestStatus ?? null);
            setTime(data.time || "20:00");
            setTitle(data.title || data.fieldName || "");
            setDescription(data.description || "");
            setMaxPlayers(data.maxPlayers ? String(data.maxPlayers) : '10');
            setPrice(data.price ? String(data.price) : '');
            setSport(data.sport || 'SOCCER');
            setIsFriendsOnly(!!data.isFriendsOnly);
            setFriendsOnlyLinkPolicy(data.friendsOnlyLinkPolicy === 'BLOCKED' ? 'BLOCKED' : 'REQUEST_TO_JOIN');
            setRequiresApproval(data.joinPolicy === 'REQUIRES_APPROVAL');
            setLotteryEnabled(!!data.lotteryEnabled);
            setOrganizerInLottery(!!data.organizerInLottery);
            setTeamSize(data.teamSize ? String(data.teamSize) : '');
            setWelcomeMessage(data.welcomeMessage || '');
            setMembersOnlyPriority(!!data.membersOnlyPriority);
            setGuestHours(data.guestRegistrationOpenHours != null ? String(data.guestRegistrationOpenHours) : '');
            setGuestPrice(data.guestPrice != null ? String(data.guestPrice) : '');
            setGuestDescription(data.guestDescription || '');
            setGuestWelcomeMessage(data.guestWelcomeMessage || '');
            setImageUrl(data.imageUrl || null);
            setDuration(data.duration ? String(data.duration) : '1');
            setRegMode(initialRegMode(data.registrationOpenDayOfWeek, data.registrationOpenTime, data.autoOpenRegistrationHours));
            setRegDay(data.registrationOpenDayOfWeek ?? defaultRegOpenDay(data.dayOfWeek));
            setRegTime(data.registrationOpenTime || DEFAULT_REG_OPEN_TIME);
            setRegHours(data.autoOpenRegistrationHours ? String(data.autoOpenRegistrationHours) : '');
            setSelectedField(data.fieldId ? { id: data.fieldId, name: data.fieldName || '', location: data.fieldLocation || '' } : null);
            setNewFieldMode(false);
            setNewFieldName('');
            setNewFieldLocation('');

            const isSub = data.subscribers?.some((s: any) => s.userId === user?.id);
            setIsSubscribed(isSub || false);
        } catch (error: any) {
            if (error?.status === 403 && error?.code === 'SERIES_FRIENDS_ONLY') {
                setSeries(null);
                setFriendsOnlyLocked(true);
                return;
            }
            console.error("Failed to load series", error);
            appAlert(t('common.error', 'שגיאה'), t('series.loadError', 'Failed to load group details'));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        setUpdating(true);
        try {
            const token = await getToken();
            if (!token) return;
            // Only send group defaults the user actually changed: with "update future games" on, the
            // server writes every sent field onto all upcoming games, so resending untouched values
            // would overwrite per-game customizations.
            const nextMaxPlayers = maxPlayers ? parseInt(maxPlayers) : NaN;
            if (!Number.isInteger(nextMaxPlayers) || nextMaxPlayers < 2) {
                appAlert(t('common.error', 'שגיאה'), t('series.maxPlayersInvalid', 'Max players must be at least 2'));
                return;
            }
            const nextDuration = Number(duration.trim().replace(',', '.'));
            if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
                appAlert(t('common.error', 'שגיאה'), t('series.durationInvalid', 'משך המשחק חייב להיות חיובי'));
                return;
            }
            if (regMode === 'weekly' && !TIME_RE.test(regTime)) {
                appAlert(t('common.error', 'שגיאה'), t('series.regTimeInvalid', 'יש לבחור שעה לפתיחת ההרשמה'));
                return;
            }
            if (regMode === 'hours' && !(Number(regHours) > 0)) {
                appAlert(t('common.error', 'שגיאה'), t('series.regHoursInvalid', 'יש להזין מספר שעות חיובי לפתיחת ההרשמה'));
                return;
            }
            if (newFieldMode && !newFieldName.trim()) {
                appAlert(t('common.error', 'שגיאה'), t('series.newFieldNameRequired', 'יש להזין שם למגרש החדש'));
                return;
            }
            const nextPrice = price ? parseInt(price) : 0;
            const nextTeamSize = teamSize ? parseInt(teamSize) : null;
            const changes: Partial<UpdateSeriesDTO> = {};
            if (nextMaxPlayers !== (series.maxPlayers || 10)) changes.maxPlayers = nextMaxPlayers;
            if (nextPrice !== (series.price || 0)) changes.price = nextPrice;
            if (sport !== (series.sport || 'SOCCER')) changes.sport = sport;
            if (isFriendsOnly !== !!series.isFriendsOnly) {
                changes.isFriendsOnly = isFriendsOnly;
                // Friends-only is not "closed": friends (and approved requests) must still be able
                // to join, so never close joining when turning it on.
                if (!isFriendsOnly) changes.isOpenToJoin = true;
            }
            if (friendsOnlyLinkPolicy !== (series.friendsOnlyLinkPolicy || 'REQUEST_TO_JOIN')) {
                changes.friendsOnlyLinkPolicy = friendsOnlyLinkPolicy;
            }
            if (requiresApproval !== (series.joinPolicy === 'REQUIRES_APPROVAL')) {
                changes.joinPolicy = requiresApproval ? 'REQUIRES_APPROVAL' : 'INSTANT';
            }
            if (lotteryEnabled !== !!series.lotteryEnabled) changes.lotteryEnabled = lotteryEnabled;
            if (organizerInLottery !== !!series.organizerInLottery) changes.organizerInLottery = organizerInLottery;
            if (nextTeamSize !== (series.teamSize ?? null)) changes.teamSize = nextTeamSize;
            if (welcomeMessage !== (series.welcomeMessage || '')) changes.welcomeMessage = welcomeMessage || null;
            if (membersOnlyPriority !== !!series.membersOnlyPriority) changes.membersOnlyPriority = membersOnlyPriority;
            const nextGuestHours = guestHours.trim() === '' ? null : Number(guestHours);
            if (nextGuestHours !== null && !(Number.isFinite(nextGuestHours) && nextGuestHours >= 0)) {
                appAlert(t('common.error', 'שגיאה'), t('series.guestHoursInvalid', 'שעות פתיחה לאורחים חייבות להיות מספר חיובי'));
                return;
            }
            if (nextGuestHours !== (series.guestRegistrationOpenHours ?? null)) changes.guestRegistrationOpenHours = nextGuestHours;
            const nextGuestPrice = guestPrice.trim() === '' ? null : parseInt(guestPrice, 10);
            if (nextGuestPrice !== (series.guestPrice ?? null)) changes.guestPrice = nextGuestPrice;
            if (guestDescription !== (series.guestDescription || '')) changes.guestDescription = guestDescription || null;
            if (guestWelcomeMessage !== (series.guestWelcomeMessage || '')) changes.guestWelcomeMessage = guestWelcomeMessage || null;

            // Registration opening: send exactly one mode, and only when it changed -- the server rewrites
            // registrationOpensAt on every future game whenever these fields are sent.
            const initialMode = initialRegMode(series.registrationOpenDayOfWeek, series.registrationOpenTime, series.autoOpenRegistrationHours);
            let registrationRule: Partial<UpdateSeriesDTO> = {};
            if (regMode === 'weekly') {
                if (!(initialMode === 'weekly' && regDay === series.registrationOpenDayOfWeek && regTime === series.registrationOpenTime)) {
                    registrationRule = { registrationOpenDayOfWeek: regDay, registrationOpenTime: regTime, autoOpenRegistrationHours: null };
                }
            } else if (regMode === 'hours') {
                if (!(initialMode === 'hours' && Number(regHours) === series.autoOpenRegistrationHours)) {
                    registrationRule = { autoOpenRegistrationHours: Number(regHours), registrationOpenDayOfWeek: null, registrationOpenTime: null };
                }
            } else if (initialMode !== 'none') {
                registrationRule = { autoOpenRegistrationHours: null, registrationOpenDayOfWeek: null, registrationOpenTime: null };
            }

            const fieldChange: Partial<UpdateSeriesDTO> = newFieldMode
                ? { fieldId: null, fieldName: newFieldName.trim(), fieldLocation: newFieldLocation.trim() }
                : selectedField && selectedField.id !== series.fieldId
                    ? { fieldId: selectedField.id, fieldName: selectedField.name, fieldLocation: selectedField.location || '' }
                    : {};

            await seriesApi.update(id, {
                time, title, description, updateFutureGames: updateFuture,
                // Only when changed: with "update future games" on, the server writes it onto every game.
                ...(nextDuration !== (series.duration || 1) ? { duration: nextDuration } : {}),
                ...registrationRule,
                ...fieldChange,
                ...changes,
            }, token);
            appAlert(t('common.success', 'הצלחה'), t('series.updateSuccess', 'Group updated successfully'));
            fetchSeries();
        } catch (error) {
            console.error(error);
            appAlert(t('common.error', 'שגיאה'), t('series.updateError', 'Failed to update group'));
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleted = () => {
        setDeleteModalOpen(false);
        router.replace('/(tabs)');
    };

    const shareInvite = async () => {
        const inviteUrl = `https://join-up-app.vercel.app/series/${id}`;
        const message = t('series.inviteText', 'Join my joinUp group: {{url}}', { url: inviteUrl });
        try {
            await Share.share({ message, url: inviteUrl });
        } catch (e) {
            appAlert(t('common.error', 'שגיאה'), t('series.shareError', 'Failed to share invite'));
        }
    };

    // Debounced user search for the add-member picker. A request counter drops stale responses.
    const searchSeq = useRef(0);
    useEffect(() => {
        const q = memberQuery.trim();
        const seq = ++searchSeq.current;
        if (q.length < 2) {
            setMemberResults([]);
            setMemberSearching(false);
            setMemberSearchError(false);
            return;
        }
        setMemberSearching(true);
        setMemberSearchError(false);
        const timer = setTimeout(async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const results = await usersApi.search(q, token);
                if (seq !== searchSeq.current) return;
                setMemberResults(Array.isArray(results) ? results : []);
            } catch (e) {
                if (seq !== searchSeq.current) return;
                setMemberResults([]);
                setMemberSearchError(true);
            } finally {
                if (seq === searchSeq.current) setMemberSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [memberQuery]);

    const existingMemberIds = new Set<string>([
        ...(series?.subscribers || []).map((sub: any) => sub.userId),
        series?.organizer?.id,
        user?.id,
    ].filter(Boolean));

    const loadFriends = async () => {
        if (myFriends !== null || friendsInflight.current || !user?.id) return;
        friendsInflight.current = true;
        setFriendsLoading(true);
        setFriendsError(false);
        try {
            const token = await getToken();
            if (!token) return;
            const list = await usersApi.getFriends(user.id, token);
            setMyFriends(Array.isArray(list) ? list : []);
        } catch (e) {
            setFriendsError(true);
        } finally {
            friendsInflight.current = false;
            setFriendsLoading(false);
        }
    };

    const trimmedQuery = memberQuery.trim();
    const searchMode = trimmedQuery.length >= 2;
    const visibleResults = searchMode
        ? mergeFriendsFirst(memberResults, myFriends || [], trimmedQuery, existingMemberIds)
        : [];
    const friendOptions = friendSuggestions(myFriends || [], existingMemberIds);

    const toggleSelectedMember = (u: { id: string; name?: string; avatar?: string | null }) => {
        setSelectedMembers((prev) =>
            prev.some((m) => m.id === u.id) ? prev.filter((m) => m.id !== u.id) : [...prev, { id: u.id, name: u.name || '', avatar: u.avatar ?? null }]
        );
    };

    const renderMemberRow = (u: any, isLast: boolean, showFriendBadge: boolean) => {
        const picked = selectedMembers.some((m) => m.id === u.id);
        const label = u.name || t('game.user', 'משתמש');
        return (
            <TouchableOpacity
                key={u.id}
                onPress={() => toggleSelectedMember(u)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: picked }}
                className={`flex-row items-center p-3 ${picked ? 'bg-brand-mist' : 'bg-white'} ${!isLast ? 'border-b border-gray-100' : ''}`}
            >
                {u.avatar || u.imageUrl ? (
                    <SafeImage source={{ uri: u.avatar || u.imageUrl }} className="w-9 h-9 rounded-full border border-gray-200" />
                ) : (
                    <View className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center border border-gray-200">
                        <FontAwesome name="user" size={14} color="#9ca3af" />
                    </View>
                )}
                <Text className="flex-1 mx-3 text-gray-800 font-medium" numberOfLines={1}>{label}</Text>
                {showFriendBadge && (
                    <Text className="text-xs text-brand-dark bg-brand-mist rounded-full px-2 py-0.5 mx-2">{t('series.friendBadge', 'חבר/ה')}</Text>
                )}
                {picked && <FontAwesome name="check" size={14} color="#059669" />}
            </TouchableOpacity>
        );
    };

    const addSelectedMembers = async () => {
        if (!selectedMembers.length) return;
        setAddingMember(true);
        try {
            const token = await getToken();
            if (!token) return;
            const res: any = await seriesApi.addMembers(id, selectedMembers.map((m) => m.id), token);
            if (typeof res?.added === 'number' && res.added < selectedMembers.length) {
                appAlert(t('common.error', 'שגיאה'), t('series.someNotAdded', 'לא ניתן היה להוסיף חלק מהמשתמשים'));
            }
            setSelectedMembers([]);
            setMemberQuery('');
            fetchSeries();
        } catch (e) {
            appAlert(t('common.error', 'שגיאה'), t('series.addMemberError', 'Failed to add member'));
        } finally {
            setAddingMember(false);
        }
    };

    const messageMember = async (userId: string) => {
        try {
            const token = await getToken();
            if (!token) return;
            const res = await chatsApi.createPrivate(userId, token);
            router.push(`/chat/${(res as any).chatId || (res as any).id}`);
        } catch (err: any) {
            if (err?.status === 403) {
                appAlert(t('common.error', 'שגיאה'), t('privacy.messagesBlocked', 'משתמש זה מקבל הודעות מחברים בלבד'));
            } else {
                appAlert(t('common.error', 'שגיאה'), t('profile.failedToStartChat', "פתיחת הצ'אט נכשלה."));
            }
        }
    };

    const onMemberPress = (sub: any) => {
        if (sub.userId === user?.id) {
            router.push(`/user/${sub.userId}`);
            return;
        }
        setMemberMenu({ id: sub.userId, name: sub.user?.name || t('game.user', 'משתמש') });
    };

    const toggleManager = async (userId: string, makeManager: boolean) => {
        try {
            const token = await getToken();
            if (!token) return;
            await seriesApi.setMemberRole(id, userId, makeManager ? 'MANAGER' : 'MEMBER', token);
            fetchSeries();
        } catch (e) {
            appAlert(t('common.error', 'שגיאה'), t('series.roleError', 'Failed to update role'));
        }
    };

    const handleLeaveGroup = async () => {
        Alert.alert(
            t('series.leaveTitle', 'Leave Group'),
            t('series.leaveConfirm', 'Are you sure you want to leave this group?'),
            [
                { text: t('common.cancel', 'Cancel'), style: "cancel" },
                {
                    text: t('series.leave', 'Leave'), style: "destructive", onPress: async () => {
                        try {
                            const token = await getToken();
                            if (!token) return;
                            await seriesApi.toggleSubscribe(id, true, token);
                            router.replace('/(tabs)');
                        } catch (e) {
                            appAlert(t('common.error', 'שגיאה'), t('series.leaveError', 'Failed to leave group'));
                        }
                    }
                }
            ]
        );
    };

    const toggleSubscribe = async () => {
        const prev = isSubscribed;
        // Cancelling a pending request uses the same call as leaving (DELETE subscribe).
        const leaving = prev || requestStatus === 'PENDING';
        if (leaving) setIsSubscribed(false);
        else if (series?.viewerAccess !== 'REQUEST' && !series?.viewerJoinRequiresApproval) setIsSubscribed(true);
        try {
            const token = await getToken();
            if (!token) return;
            const res = await seriesApi.toggleSubscribe(id, leaving, token);
            if (res?.pending) setRequestStatus('PENDING');
            fetchSeries();
        } catch (e: any) {
            setIsSubscribed(prev);
            if (e?.code === 'SERIES_JOIN_DECLINED') {
                setRequestStatus('REJECTED');
                return;
            }
            appAlert(t('common.error', 'שגיאה'), t('series.subscribeError', 'Failed to update subscription'));
        }
    };

    if (loading) {
        return (
            <SafeAreaView edges={['top']} className="flex-1 bg-white">
                <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                    <BackButton className="me-3" />
                    <Text className="text-xl font-bold text-gray-900">{t('series.details', 'Group Details')}</Text>
                </View>
                <View className="flex-1 justify-center items-center">
                    <LoadingMotif id="passing-lane" label={t('series.loadingSeries', 'טוען קבוצה…')} />
                </View>
            </SafeAreaView>
        );
    }

    if (!series) {
        return (
            <SafeAreaView edges={['top']} className="flex-1 bg-white">
                <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                    <BackButton className="me-3" />
                    <Text className="text-xl font-bold text-gray-900">{t('series.details', 'Group Details')}</Text>
                </View>
                <View className="flex-1 justify-center items-center px-6">
                    <Text className="text-gray-500 text-center">
                        {friendsOnlyLocked ? t('friendsOnly.seriesLocked') : t('series.notFound', 'Group not found')}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const isOrganizer = user?.id === series.organizer?.id;
    const isManager = series.subscribers?.some((s: { userId: string; role?: string }) => s.userId === user?.id && s.role === 'MANAGER');
    const canManage = isOrganizer || isManager;
    const days = [
        t('common.days.sunday', 'Sunday'),
        t('common.days.monday', 'Monday'),
        t('common.days.tuesday', 'Tuesday'),
        t('common.days.wednesday', 'Wednesday'),
        t('common.days.thursday', 'Thursday'),
        t('common.days.friday', 'Friday'),
        t('common.days.saturday', 'Saturday')
    ];
    const dayName = series.dayOfWeek !== null && series.dayOfWeek !== undefined
        ? days[series.dayOfWeek]
        : t('series.customDates', 'Custom Dates');

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            {/* Navigation Header — same pattern as game/[id].tsx */}
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <BackButton className="me-3" />
                <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>
                    {series.title || series.fieldName}
                </Text>
                {canManage && (
                    <TouchableOpacity onPress={toggleSettings} className="p-2 ml-2" accessibilityLabel={t('series.manageSettings', 'Manage Group Settings')}>
                        <FontAwesome name="cog" size={20} color="#4b5563" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView ref={scrollViewRef} className="flex-1 bg-gray-50">

                {/* Hero Header Card */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    {!!imageUrl && (
                        <SafeImage source={{ uri: imageUrl }} className="w-full h-40 rounded-xl mb-4" resizeMode="cover" />
                    )}
                    {/* Organizer row */}
                    <View className="flex-row items-center mb-4">
                        {series.organizer?.avatar ? (
                            <SafeImage source={{ uri: series.organizer.avatar }} className="w-12 h-12 rounded-full mr-3 border border-gray-200" />
                        ) : (
                            <View className="w-12 h-12 rounded-full bg-brand-pale items-center justify-center mr-3">
                                <FontAwesome name="user" size={20} color="#059669" />
                            </View>
                        )}
                        <View className="flex-1">
                            <Text className="text-2xl font-bold text-gray-800" numberOfLines={1}>
                                {series.title || series.fieldName}
                            </Text>
                            <Text className="text-gray-500 text-sm mt-0.5">
                                {t('series.organizedBy', 'by')} {series.organizer?.name || t('series.organizer', 'Organizer')}
                            </Text>
                        </View>
                    </View>

                    {/* Info rows */}
                    {series.fieldId ? (
                        <TouchableOpacity
                            onPress={() => router.push(`/field/${series.fieldId}`)}
                            className="flex-row items-center mb-2"
                        >
                            <FontAwesome name="map-marker" size={16} color="#059669" style={{ width: 24 }} />
                            <Text className="text-brand text-base font-bold flex-1" numberOfLines={1}>
                                {series.fieldLocation || series.fieldName}
                            </Text>
                            <FontAwesome name="chevron-left" size={12} color="#059669" />
                        </TouchableOpacity>
                    ) : (
                        <View className="flex-row items-center mb-2">
                            <FontAwesome name="map-marker" size={16} color="#6b7280" style={{ width: 24 }} />
                            <Text className="text-gray-600 text-base flex-1" numberOfLines={1}>
                                {series.fieldLocation || series.fieldName}
                            </Text>
                        </View>
                    )}
                    <OpenInMapButton
                        location={{
                            lat: series.fieldLat,
                            lng: series.fieldLng,
                            address: series.fieldLocation,
                            name: series.fieldName,
                        }}
                    />
                    <View className="flex-row items-center mb-5">
                        <FontAwesome name="clock-o" size={16} color="#6b7280" style={{ width: 24 }} />
                        <Text className="text-gray-600 text-base">{dayName}, {series.time}</Text>
                    </View>

                    {!!series.description && (
                        <Text className="text-gray-700 text-base mb-5" testID="series-description">{series.description}</Text>
                    )}
                    {!!series.membersOnlyPriority && !series.viewerIsMember && (!!series.guestDescription || series.guestPrice != null) && (
                        <View className="bg-gray-50 rounded-xl p-3 mb-5" testID="series-guest-info">
                            <Text className="text-gray-800 font-bold mb-1">{t('series.guestsTitle', 'לאורחים')}</Text>
                            {!!series.guestDescription && <Text className="text-gray-700">{series.guestDescription}</Text>}
                            {series.guestPrice != null && (
                                <Text className="text-gray-700">{t('series.guestPriceLine', 'מחיר לאורחים')}: ₪{series.guestPrice}</Text>
                            )}
                        </View>
                    )}

                    {typeof series.fieldLat === 'number' && typeof series.fieldLng === 'number' && (
                        <View style={{ height: 160, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                            <MapView
                                style={{ flex: 1 }}
                                initialRegion={{
                                    latitude: series.fieldLat,
                                    longitude: series.fieldLng,
                                    latitudeDelta: 0.01,
                                    longitudeDelta: 0.01,
                                }}
                                scrollEnabled={false}
                                zoomEnabled={false}
                            >
                                <Marker coordinate={{ latitude: series.fieldLat, longitude: series.fieldLng }} title={series.fieldName} />
                            </MapView>
                        </View>
                    )}

                    {/* Subscribe button (a join request for outsiders of a friends-only group) */}
                    {!isSubscribed && requestStatus === 'REJECTED' ? (
                        <View className="py-4 rounded-xl items-center bg-gray-100">
                            <Text className="font-bold text-base text-gray-500">{t('series.requestDeclined')}</Text>
                        </View>
                    ) : !isSubscribed && requestStatus === 'PENDING' ? (
                        <View className="flex-row gap-2">
                            <View className="flex-1 py-4 rounded-xl items-center flex-row justify-center bg-gray-100">
                                <FontAwesome name="hourglass-half" size={16} color="#6b7280" style={{ marginRight: 8 }} />
                                <Text className="font-bold text-base text-gray-600">{t('series.requestSent')}</Text>
                            </View>
                            <TouchableOpacity onPress={toggleSubscribe} className="py-4 px-4 rounded-xl items-center justify-center border border-gray-200">
                                <Text className="font-bold text-gray-700">{t('series.cancelRequest')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={toggleSubscribe}
                            className={`py-4 rounded-xl items-center flex-row justify-center ${isSubscribed ? 'bg-brand-mist border border-brand-pale' : 'bg-brand'}`}
                        >
                            <FontAwesome
                                name={isSubscribed ? "check" : "bell"}
                                size={16}
                                color={isSubscribed ? "#059669" : "white"}
                                style={{ marginRight: 8 }}
                            />
                            <Text className={`font-bold text-base ${isSubscribed ? 'text-brand-dark' : 'text-white'}`}>
                                {isSubscribed
                                    ? t('series.subscribed', 'Subscribed ✓')
                                    : (series.viewerAccess === 'REQUEST' || series.viewerJoinRequiresApproval)
                                        ? t('series.requestToJoin')
                                        : t('series.subscribe', 'Subscribe to Group')}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {isSubscribed && typeof id === 'string' && (
                        <MuteNotificationsButton
                            targetType="SERIES"
                            targetId={id}
                            labelKey="notificationSettings.muteGroup"
                            className="mt-3 py-3 rounded-xl border border-gray-200 bg-white flex-row items-center justify-center"
                        />
                    )}
                </View>

                {/* Quick Stats Bar — same pattern as game utility actions */}
                <View className="bg-white mb-4 shadow-sm flex-row justify-around border-y border-gray-100 py-4">
                    <View className="items-center">
                        <View className="w-12 h-12 bg-brand-mist rounded-full items-center justify-center mb-1">
                            <FontAwesome name="users" size={20} color="#059669" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{series.subscribers?.length || 0}</Text>
                        <Text className="text-xs text-gray-400">{t('series.regulars', 'Regulars')}</Text>
                    </View>
                    <View className="items-center">
                        <View className="w-12 h-12 bg-green-50 rounded-full items-center justify-center mb-1">
                            <FontAwesome name="calendar" size={20} color="#16a34a" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{series.upcomingGames?.length || 0}</Text>
                        <Text className="text-xs text-gray-400">{t('series.upcoming', 'Upcoming')}</Text>
                    </View>
                    <View className="items-center">
                        <View className="w-12 h-12 bg-purple-50 rounded-full items-center justify-center mb-1">
                            <FontAwesome name="repeat" size={20} color="#9333ea" />
                        </View>
                        <Text className="text-xs text-gray-600 font-bold">{dayName}</Text>
                        <Text className="text-xs text-gray-400">{t('series.schedule', 'Schedule')}</Text>
                    </View>
                </View>

                {/* Regulars Section */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    <Text className="text-lg font-bold text-gray-800 mb-4">
                        {t('series.regulars', 'The Regulars')} ({series.subscribers?.length || 0})
                    </Text>
                    {series.subscribers?.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {series.subscribers.map((sub: any) => (
                                <View key={sub.userId} className="items-center mr-4 w-16">
                                    <TouchableOpacity
                                        onPress={() => onMemberPress(sub)}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('series.memberActions', 'פעולות עבור {{name}}', { name: sub.user?.name || t('game.user', 'משתמש') })}
                                        className="items-center"
                                    >
                                        {sub.user?.avatar ? (
                                            <SafeImage source={{ uri: sub.user.avatar }} className="w-14 h-14 rounded-full mb-1 border border-gray-200" />
                                        ) : (
                                            <View className="w-14 h-14 rounded-full bg-gray-100 items-center justify-center mb-1 border border-gray-200">
                                                <FontAwesome name="user" size={20} color="#9ca3af" />
                                            </View>
                                        )}
                                        <Text className="text-xs text-gray-700 text-center font-medium" numberOfLines={1}>
                                            {sub.user?.name || t('game.user', 'משתמש')}
                                        </Text>
                                    </TouchableOpacity>
                                    {sub.role === 'MANAGER' && (
                                        <Text className="text-[10px] text-brand font-bold">{t('series.manager', 'Manager')}</Text>
                                    )}
                                    {isOrganizer && sub.userId !== series.organizer?.id && (
                                        <TouchableOpacity onPress={() => toggleManager(sub.userId, sub.role !== 'MANAGER')} className="mt-1">
                                            <FontAwesome name={sub.role === 'MANAGER' ? 'star' : 'star-o'} size={14} color="#059669" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </ScrollView>
                    ) : (
                        <View className="items-center py-4">
                            <FontAwesome name="users" size={32} color="#d1d5db" />
                            <Text className="text-gray-400 mt-2">{t('series.noRegulars', 'No regulars yet. Be the first!')}</Text>
                        </View>
                    )}
                </View>

                {canManage && (series.pendingJoinRequestCount ?? 0) > 0 && typeof id === 'string' && (
                    <SeriesJoinRequests seriesId={id} onApproved={fetchSeries} />
                )}

                {canManage && (
                    <View className="bg-white p-6 mb-4 shadow-sm">
                        <Text className="text-lg font-bold text-gray-800 mb-3">{t('series.inviteMembers', 'Invite & add members')}</Text>
                        <TouchableOpacity onPress={shareInvite} className="py-3 rounded-xl items-center bg-brand mb-3">
                            <Text className="text-white font-bold">{t('series.shareInvite', 'Share invite link')}</Text>
                        </TouchableOpacity>
                        <TextInput
                            value={memberQuery}
                            onChangeText={setMemberQuery}
                            onFocus={() => { setMemberFocused(true); loadFriends(); }}
                            onBlur={() => setMemberFocused(false)}
                            placeholder={t('series.searchUsers', 'חיפוש משתמשים להוספה')}
                            autoCapitalize="none"
                            autoCorrect={false}
                            className="bg-gray-50 p-3 rounded-lg border border-gray-200"
                        />
                        {selectedMembers.length > 0 && (
                            <View className="flex-row flex-wrap gap-2 mt-3">
                                {selectedMembers.map((m) => (
                                    <TouchableOpacity
                                        key={m.id}
                                        onPress={() => toggleSelectedMember(m)}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('series.removeSelected', 'הסר את {{name}}', { name: m.name })}
                                        className="flex-row items-center bg-brand-mist border border-brand-pale rounded-full px-3 py-1"
                                    >
                                        <Text className="text-brand-dark text-sm font-medium">{m.name}</Text>
                                        <FontAwesome name="times" size={12} color="#047857" style={{ marginStart: 6 }} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                        {searchMode && (
                            <View className="mt-3 rounded-lg border border-gray-100 overflow-hidden">
                                {memberSearching ? (
                                    <View className="py-4 items-center"><ActivityIndicator accessibilityLabel={t('series.searching', 'מחפש…')} /></View>
                                ) : visibleResults.length === 0 ? (
                                    memberSearchError ? (
                                        <Text className="text-red-500 text-center py-4">{t('series.searchError', 'החיפוש נכשל. נסו שוב.')}</Text>
                                    ) : (
                                        <Text className="text-gray-400 text-center py-4">{t('series.noUsersFound', 'לא נמצאו משתמשים')}</Text>
                                    )
                                ) : (
                                    visibleResults.map((u, index) => renderMemberRow(u, index === visibleResults.length - 1, u.isFriend))
                                )}
                            </View>
                        )}
                        {!searchMode && memberFocused && (
                            <View className="mt-3 rounded-lg border border-gray-100 overflow-hidden">
                                <Text className="text-xs font-bold text-gray-500 px-3 pt-2 pb-1">{t('series.yourFriends', 'החברים שלך')}</Text>
                                {friendsLoading ? (
                                    <View className="py-4 items-center"><ActivityIndicator accessibilityLabel={t('series.loadingFriends', 'טוען חברים…')} /></View>
                                ) : friendsError ? (
                                    <View className="py-4 items-center">
                                        <Text className="text-red-500 text-center">{t('series.friendsError', 'טעינת החברים נכשלה.')}</Text>
                                        <TouchableOpacity
                                            onPress={loadFriends}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('series.retryFriends', 'נסו שוב')}
                                            className="mt-2 px-4 py-2 rounded-lg bg-gray-100"
                                        >
                                            <Text className="text-gray-700 font-medium">{t('series.retryFriends', 'נסו שוב')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : myFriends !== null && myFriends.length === 0 ? (
                                    <Text className="text-gray-400 text-center py-4">{t('series.noFriendsYet', 'עדיין אין לך חברים. אפשר לחפש לפי שם')}</Text>
                                ) : myFriends !== null && friendOptions.length === 0 ? (
                                    <Text className="text-gray-400 text-center py-4">{t('series.allFriendsInGroup', 'כל החברים שלך כבר בקבוצה')}</Text>
                                ) : (
                                    friendOptions.map((u, index) => renderMemberRow(u, index === friendOptions.length - 1, false))
                                )}
                            </View>
                        )}
                        {selectedMembers.length > 0 && (
                            <TouchableOpacity
                                onPress={addSelectedMembers}
                                disabled={addingMember}
                                accessibilityRole="button"
                                className={`mt-3 py-3 rounded-xl items-center ${addingMember ? 'bg-gray-400' : 'bg-brand'}`}
                            >
                                <Text className="text-white font-bold">{t('series.addSelected', 'הוסף')} ({selectedMembers.length})</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Upcoming Games Section */}
                <View className="bg-white p-6 mb-4 shadow-sm">
                    <Text className="text-lg font-bold text-gray-800 mb-4">{t('series.upcomingGames', 'Upcoming Games')}</Text>
                    {series.upcomingGames?.length > 0 ? (
                        <View className="rounded-xl overflow-hidden border border-gray-100">
                            {series.upcomingGames.map((game: any, index: number) => {
                                const gDate = new Date(game.date);
                                return (
                                    <TouchableOpacity
                                        key={game.id}
                                        onPress={() => router.push(`/game/${game.id}`)}
                                        className={`flex-row items-center p-4 bg-white ${index !== series.upcomingGames.length - 1 ? 'border-b border-gray-100' : ''}`}
                                    >
                                        <View className="bg-brand-mist rounded-xl w-12 h-12 items-center justify-center mr-4 border border-brand-pale">
                                            <Text className="text-brand-dark font-bold text-lg leading-tight">{gDate.toLocaleDateString(dateLocale, { day: 'numeric', timeZone: 'Asia/Jerusalem' })}</Text>
                                            <Text className="text-brand text-[10px] font-bold uppercase">{gDate.toLocaleDateString(dateLocale, { month: 'short', timeZone: 'Asia/Jerusalem' })}</Text>
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-gray-800 text-base">{gDate.toLocaleDateString(dateLocale, { weekday: 'long', timeZone: 'Asia/Jerusalem' })}</Text>
                                            <Text className="text-gray-500 text-xs mt-0.5">
                                                {game.currentPlayers} / {game.maxPlayers} {t('series.players', 'Players')} · {game.time || series.time}
                                            </Text>
                                        </View>
                                        <FontAwesome name="chevron-left" size={12} color="#d1d5db" />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ) : (
                        <View className="items-center py-6">
                            <FontAwesome name="calendar-o" size={32} color="#d1d5db" />
                            <Text className="text-gray-400 mt-2">{t('series.noGames', 'No upcoming games scheduled.')}</Text>
                        </View>
                    )}
                </View>

                {/* Organizer / manager Settings */}
                {canManage && (
                    <View className="p-6 mb-6" onLayout={(e) => { settingsSectionY.current = e.nativeEvent.layout.y; }}>
                        <TouchableOpacity
                            onPress={toggleSettings}
                            className="flex-row items-center justify-between bg-gray-100 p-4 rounded-xl mb-2"
                        >
                            <View className="flex-row items-center">
                                <FontAwesome name="cog" size={18} color="#4b5563" style={{ marginRight: 10 }} />
                                <Text className="font-bold text-gray-700">{t('series.manageSettings', 'Manage Group Settings')}</Text>
                            </View>
                            <FontAwesome name={showSettings ? "chevron-up" : "chevron-down"} size={14} color="#6b7280" />
                        </TouchableOpacity>

                        {showSettings && (
                            <View className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                                <SeriesImageUpload seriesId={id} image={imageUrl} onChange={setImageUrl} />

                                <Text className="text-gray-700 font-bold mb-2">{t('series.title', 'Group name')}</Text>
                                <TextInput
                                    value={title}
                                    onChangeText={setTitle}
                                    className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-base"
                                />

                                <Text className="text-gray-700 font-bold mb-2">{t('series.description', 'Description')}</Text>
                                <TextInput
                                    value={description}
                                    onChangeText={setDescription}
                                    multiline
                                    className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-base min-h-[80px]"
                                />

                                <SeriesLocationPicker
                                    selectedField={selectedField}
                                    onSelectField={setSelectedField}
                                    newFieldMode={newFieldMode}
                                    onNewFieldModeChange={setNewFieldMode}
                                    newFieldName={newFieldName}
                                    onNewFieldNameChange={setNewFieldName}
                                    newFieldLocation={newFieldLocation}
                                    onNewFieldLocationChange={setNewFieldLocation}
                                />

                                <View className="flex-row gap-3 mb-4">
                                    <View className="flex-1">
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.defaultTime', 'Default Time')}</Text>
                                        <TextInput
                                            value={time}
                                            onChangeText={setTime}
                                            placeholder="HH:MM"
                                            className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-base"
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.duration', 'משך (שעות)')}</Text>
                                        <TextInput
                                            value={duration}
                                            onChangeText={setDuration}
                                            keyboardType="decimal-pad"
                                            className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-base"
                                        />
                                    </View>
                                </View>

                                {series.type === 'WEEKLY' && series.dayOfWeek !== null && series.dayOfWeek !== undefined && (
                                    <Text className="text-gray-400 text-xs -mt-2 mb-4">
                                        {t('series.fixedDay', 'יום קבוע')}: {dayName} — {t('series.fixedDayHint', 'לא ניתן לשנות יום בקבוצה שבועית קיימת')}
                                    </Text>
                                )}

                                <SeriesRegistrationRule
                                    mode={regMode}
                                    onModeChange={setRegMode}
                                    day={regDay}
                                    onDayChange={setRegDay}
                                    time={regTime}
                                    onTimeChange={setRegTime}
                                    hours={regHours}
                                    onHoursChange={setRegHours}
                                    gameDay={series.type === 'WEEKLY' ? series.dayOfWeek : null}
                                    gameTime={time}
                                />

                                <Text className="text-gray-700 font-bold mb-2">{t('series.sport', 'Sport')}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                                    {Object.keys(SPORT_MAPPING).map(s => {
                                        const isSelected = sport === s;
                                        return (
                                            <TouchableOpacity
                                                key={s}
                                                onPress={() => setSport(s)}
                                                className={`px-4 py-2 rounded-full mr-2 border ${isSelected ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
                                            >
                                                <Text className={`${isSelected ? 'text-white' : 'text-gray-700'} font-medium`}>
                                                    {SPORT_MAPPING[s]}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>

                                <View className="flex-row gap-3 mb-4">
                                    <View className="flex-1">
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.maxPlayers', 'Max Players')}</Text>
                                        <TextInput
                                            value={maxPlayers}
                                            onChangeText={setMaxPlayers}
                                            keyboardType="number-pad"
                                            className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-base"
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.teamSize', 'Team Size')}</Text>
                                        <TextInput
                                            value={teamSize}
                                            onChangeText={setTeamSize}
                                            keyboardType="number-pad"
                                            placeholder={t('editGame.none', 'None')}
                                            className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-base"
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.price', 'Price')}</Text>
                                        <TextInput
                                            value={price}
                                            onChangeText={setPrice}
                                            keyboardType="number-pad"
                                            placeholder="0"
                                            className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-base"
                                        />
                                    </View>
                                </View>

                                <Text className="text-gray-700 font-bold mb-2">{t('series.welcomeMessage', 'Automatic welcome message')}</Text>
                                <TextInput
                                    value={welcomeMessage}
                                    onChangeText={setWelcomeMessage}
                                    multiline
                                    className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-base min-h-[60px]"
                                />

                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-gray-700 font-bold w-3/4">{t('series.membersOnlyPriority', 'עדיפות לחברי הקבוצה (הרשמה מוקדמת)')}</Text>
                                    <Switch
                                        value={membersOnlyPriority}
                                        onValueChange={setMembersOnlyPriority}
                                        trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                                    />
                                </View>
                                {membersOnlyPriority && (
                                    <View className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200" testID="guest-settings">
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.guestHours', 'הרשמה לאורחים נפתחת (שעות לפני המשחק)')}</Text>
                                        <TextInput
                                            value={guestHours}
                                            onChangeText={setGuestHours}
                                            keyboardType="decimal-pad"
                                            className="bg-white p-3 rounded-lg border border-gray-200 mb-3 text-base"
                                        />
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.guestPrice', 'מחיר לאורחים (₪, להצגה בלבד)')}</Text>
                                        <TextInput
                                            value={guestPrice}
                                            onChangeText={setGuestPrice}
                                            keyboardType="number-pad"
                                            className="bg-white p-3 rounded-lg border border-gray-200 mb-3 text-base"
                                        />
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.guestDescription', 'תיאור לאורחים')}</Text>
                                        <TextInput
                                            value={guestDescription}
                                            onChangeText={setGuestDescription}
                                            multiline
                                            className="bg-white p-3 rounded-lg border border-gray-200 mb-3 text-base min-h-[60px]"
                                        />
                                        <Text className="text-gray-700 font-bold mb-2">{t('series.guestWelcomeMessage', 'הודעת פתיחה לאורחים (נשלחת בפרטי)')}</Text>
                                        <TextInput
                                            value={guestWelcomeMessage}
                                            onChangeText={setGuestWelcomeMessage}
                                            multiline
                                            className="bg-white p-3 rounded-lg border border-gray-200 text-base min-h-[60px]"
                                        />
                                    </View>
                                )}

                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-gray-700 font-bold w-3/4">{t('series.friendsOnly', 'Friends-only games')}</Text>
                                    <Switch
                                        value={isFriendsOnly}
                                        onValueChange={setIsFriendsOnly}
                                        trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                                        thumbColor={isFriendsOnly ? '#059669' : '#f3f4f6'}
                                    />
                                </View>

                                {isFriendsOnly && (
                                    <View className="mb-4">
                                        <FriendsOnlyLinkPolicyPicker value={friendsOnlyLinkPolicy} onChange={setFriendsOnlyLinkPolicy} />
                                    </View>
                                )}

                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-gray-700 font-bold w-3/4">{t('series.requiresApproval', 'Requires approval to join')}</Text>
                                    <Switch
                                        value={requiresApproval}
                                        onValueChange={setRequiresApproval}
                                        trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                                        thumbColor={requiresApproval ? '#059669' : '#f3f4f6'}
                                    />
                                </View>

                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-gray-700 font-bold w-3/4">{t('series.lotteryEnabled', 'Spot lottery')}</Text>
                                    <Switch
                                        value={lotteryEnabled}
                                        onValueChange={setLotteryEnabled}
                                        trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                                        thumbColor={lotteryEnabled ? '#059669' : '#f3f4f6'}
                                    />
                                </View>

                                {lotteryEnabled && (
                                    <View className="flex-row justify-between items-center mb-6">
                                        <Text className="text-gray-700 font-bold w-3/4">{t('series.organizerInLottery', 'Include organizer in lottery')}</Text>
                                        <Switch
                                            value={organizerInLottery}
                                            onValueChange={setOrganizerInLottery}
                                            trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                                            thumbColor={organizerInLottery ? '#059669' : '#f3f4f6'}
                                        />
                                    </View>
                                )}

                                <View className="flex-row justify-between items-center mb-6">
                                    <Text className="text-gray-700 font-bold w-3/4">{t('series.updateFuture', 'Update all future games?')}</Text>
                                    <Switch
                                        value={updateFuture}
                                        onValueChange={setUpdateFuture}
                                        trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                                        thumbColor={updateFuture ? '#059669' : '#f3f4f6'}
                                    />
                                </View>

                                <TouchableOpacity
                                    onPress={handleUpdate}
                                    disabled={updating}
                                    className={`p-4 rounded-xl items-center mb-3 ${updating ? 'bg-gray-400' : 'bg-brand'}`}
                                >
                                    <Text className="text-white font-bold text-base">
                                        {updating ? t('series.saving', 'Saving...') : t('series.saveChanges', 'Save Changes')}
                                    </Text>
                                </TouchableOpacity>

                                {isOrganizer && (
                                <TouchableOpacity
                                    onPress={() => setDeleteModalOpen(true)}
                                    className="bg-red-50 p-4 rounded-xl items-center border border-red-100"
                                >
                                    <Text className="text-red-600 font-bold text-base">{t('series.delete', 'Delete Group')}</Text>
                                </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {isSubscribed && !isOrganizer && (
                    <View className="px-6 mb-6">
                        <TouchableOpacity
                            onPress={handleLeaveGroup}
                            className="bg-red-50 p-4 rounded-xl items-center border border-red-100"
                        >
                            <Text className="text-red-600 font-bold text-base">{t('series.leaveGroup', 'Leave Group')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View className="h-10" />
            </ScrollView>

            <DeleteSeriesModal
                visible={deleteModalOpen}
                seriesId={id}
                seriesName={series.title || series.fieldName || ''}
                onClose={() => setDeleteModalOpen(false)}
                onDeleted={handleDeleted}
            />
            <Modal visible={!!memberMenu} transparent animationType="fade" onRequestClose={() => setMemberMenu(null)} accessibilityViewIsModal>
                <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setMemberMenu(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel', 'ביטול')}>
                    <Pressable className="bg-white rounded-t-2xl p-4" onPress={() => {}}>
                        <Text className="text-center text-gray-800 font-bold mb-3" numberOfLines={1}>{memberMenu?.name}</Text>
                        <TouchableOpacity
                            accessibilityRole="button"
                            className="flex-row items-center py-3"
                            onPress={() => { const m = memberMenu; setMemberMenu(null); if (m) router.push(`/user/${m.id}`); }}
                        >
                            <FontAwesome name="user" size={16} color="#059669" style={{ marginEnd: 12 }} />
                            <Text className="text-gray-800 font-medium">{t('series.openProfile', 'פתח פרופיל')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            accessibilityRole="button"
                            className="flex-row items-center py-3"
                            onPress={() => { const m = memberMenu; setMemberMenu(null); if (m) messageMember(m.id); }}
                        >
                            <FontAwesome name="paper-plane" size={16} color="#059669" style={{ marginEnd: 12 }} />
                            <Text className="text-gray-800 font-medium">{t('series.sendMessage', 'שלח הודעה')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity accessibilityRole="button" className="py-3 items-center" onPress={() => setMemberMenu(null)}>
                            <Text className="text-gray-500 font-medium">{t('common.cancel', 'ביטול')}</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}
