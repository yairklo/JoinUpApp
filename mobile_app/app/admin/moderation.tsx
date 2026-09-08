import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
    usersApi,
    fieldsApi,
    AdminFieldCommentFlag,
    AdminFieldIssueFlag,
} from '@/services/api';
import LoadingMotif from '@/components/loading/LoadingMotif';

const REASON_LABELS: Record<string, string> = {
    OFFENSIVE: 'תוכן פוגעני',
    FALSE_INFO: 'מידע שקרי',
    SPAM: 'ספאם',
    OTHER: 'אחר',
};

/**
 * Mobile counterpart of next_app's admin/moderation page, scoped to the
 * field-content flag queue (reported comments/issue-reports) -- the piece
 * that was just added and asked for on mobile. The pre-existing AI-flagged
 * chat-message queue (next_app's usersApi.listFlaggedMessages) has no mobile
 * screen today and isn't duplicated here; this screen is additive to that.
 */
export default function AdminModerationScreen() {
    const router = useRouter();
    const { getToken } = useAuth();

    const [commentFlags, setCommentFlags] = useState<AdminFieldCommentFlag[]>([]);
    const [issueFlags, setIssueFlags] = useState<AdminFieldIssueFlag[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) {
                setLoading(false);
                return;
            }
            const [comments, issues] = await Promise.all([
                usersApi.listFieldCommentFlags(token),
                usersApi.listFieldIssueFlags(token),
            ]);
            setCommentFlags(Array.isArray(comments) ? comments : []);
            setIssueFlags(Array.isArray(issues) ? issues : []);
        } catch (e) {
            console.error('Failed to load moderation queue', e);
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => { load(); }, [load]);

    const dismissComment = useCallback(async (flag: AdminFieldCommentFlag) => {
        setBusyId(flag.id);
        try {
            const token = await getToken();
            if (!token) return;
            await usersApi.dismissFieldCommentFlag(flag.id, token);
            setCommentFlags((prev) => prev.filter((f) => f.id !== flag.id));
        } catch (e) {
            console.error('Failed to dismiss comment flag', e);
        } finally {
            setBusyId(null);
        }
    }, [getToken]);

    const deleteComment = useCallback((flag: AdminFieldCommentFlag) => {
        Alert.alert('מחיקת תגובה', 'למחוק את התגובה?', [
            { text: 'ביטול', style: 'cancel' },
            {
                text: 'מחק', style: 'destructive', onPress: async () => {
                    setBusyId(flag.id);
                    try {
                        const token = await getToken();
                        if (!token) return;
                        await fieldsApi.deleteComment(flag.comment.fieldId, flag.comment.id, token);
                        setCommentFlags((prev) => prev.filter((f) => f.comment.id !== flag.comment.id));
                    } catch (e) {
                        console.error('Failed to delete flagged comment', e);
                    } finally {
                        setBusyId(null);
                    }
                }
            },
        ]);
    }, [getToken]);

    const dismissIssue = useCallback(async (flag: AdminFieldIssueFlag) => {
        setBusyId(flag.id);
        try {
            const token = await getToken();
            if (!token) return;
            await usersApi.dismissFieldIssueFlag(flag.id, token);
            setIssueFlags((prev) => prev.filter((f) => f.id !== flag.id));
        } catch (e) {
            console.error('Failed to dismiss issue flag', e);
        } finally {
            setBusyId(null);
        }
    }, [getToken]);

    const deleteIssue = useCallback((flag: AdminFieldIssueFlag) => {
        Alert.alert('מחיקת דיווח', 'למחוק את הדיווח?', [
            { text: 'ביטול', style: 'cancel' },
            {
                text: 'מחק', style: 'destructive', onPress: async () => {
                    setBusyId(flag.id);
                    try {
                        const token = await getToken();
                        if (!token) return;
                        await fieldsApi.deleteIssue(flag.issue.fieldId, flag.issue.id, token);
                        setIssueFlags((prev) => prev.filter((f) => f.issue.id !== flag.issue.id));
                    } catch (e) {
                        console.error('Failed to delete flagged issue', e);
                    } finally {
                        setBusyId(null);
                    }
                }
            },
        ]);
    }, [getToken]);

    const toggleBlock = useCallback((userId: string, currentlyBlocked: boolean) => {
        Alert.alert(
            currentlyBlocked ? 'ביטול חסימה' : 'חסימת משתמש',
            currentlyBlocked ? `לבטל את החסימה של ${userId}?` : `לחסום את ${userId} מתגובות/דיווחים על מגרשים?`,
            [
                { text: 'ביטול', style: 'cancel' },
                {
                    text: currentlyBlocked ? 'בטל חסימה' : 'חסום', style: currentlyBlocked ? 'default' : 'destructive', onPress: async () => {
                        setBusyId(userId);
                        try {
                            const token = await getToken();
                            if (!token) return;
                            if (currentlyBlocked) {
                                await usersApi.unblockUserFromFieldSocial(userId, token);
                            } else {
                                await usersApi.blockUserFromFieldSocial(userId, token);
                            }
                            const patch = (u: { id: string; blockedFromFieldSocial: boolean }) =>
                                u.id === userId ? { ...u, blockedFromFieldSocial: !currentlyBlocked } : u;
                            setCommentFlags((prev) => prev.map((f) => ({ ...f, comment: { ...f.comment, user: patch(f.comment.user) } })));
                            setIssueFlags((prev) => prev.map((f) => ({ ...f, issue: { ...f.issue, user: patch(f.issue.user) } })));
                        } catch (e) {
                            console.error('Failed to toggle field-social block', e);
                        } finally {
                            setBusyId(null);
                        }
                    }
                },
            ]
        );
    }, [getToken]);

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3" accessibilityRole="button">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>ניהול תוכן ודיווחים</Text>
            </View>

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <LoadingMotif id="brand-pulse" label="טוען…" />
                </View>
            ) : (
                <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
                    <Text className="text-lg font-bold text-gray-800">תגובות שדווחו</Text>
                    {commentFlags.length === 0 ? (
                        <Text className="text-gray-500 text-sm">אין תגובות מדווחות.</Text>
                    ) : (
                        commentFlags.map((flag) => (
                            <View key={flag.id} className="border border-orange-200 bg-orange-50 rounded-xl p-3" style={{ gap: 6 }}>
                                <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
                                    <View className="px-2 py-0.5 rounded-full bg-orange-200">
                                        <Text className="text-orange-800 text-xs font-bold">{REASON_LABELS[flag.reason] || flag.reason}</Text>
                                    </View>
                                    <Text className="text-gray-500 text-xs">{flag.comment.fieldName}</Text>
                                    <Text className="text-gray-800 text-xs font-bold">{flag.comment.user.name || flag.comment.user.id}</Text>
                                    {flag.comment.user.blockedFromFieldSocial && (
                                        <View className="px-2 py-0.5 rounded-full bg-red-100">
                                            <Text className="text-red-700 text-xs font-bold">חסום</Text>
                                        </View>
                                    )}
                                </View>
                                <Text className="text-gray-700 text-sm">{flag.comment.text}</Text>
                                <Text className="text-gray-400 text-xs">דווח ע&quot;י {flag.reporter.name || flag.reporter.id}</Text>
                                <View className="flex-row" style={{ gap: 14 }}>
                                    <TouchableOpacity onPress={() => dismissComment(flag)} disabled={busyId === flag.id}>
                                        <Text className="text-gray-600 text-xs font-bold">התעלם</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => deleteComment(flag)} disabled={busyId === flag.id}>
                                        <Text className="text-orange-700 text-xs font-bold">מחק תגובה</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => toggleBlock(flag.comment.user.id, flag.comment.user.blockedFromFieldSocial)} disabled={busyId === flag.comment.user.id}>
                                        <Text className={`text-xs font-bold ${flag.comment.user.blockedFromFieldSocial ? 'text-green-700' : 'text-red-700'}`}>
                                            {flag.comment.user.blockedFromFieldSocial ? 'בטל חסימה' : 'חסום משתמש'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}

                    <Text className="text-lg font-bold text-gray-800 mt-2">דיווחי ליקויים שדווחו</Text>
                    {issueFlags.length === 0 ? (
                        <Text className="text-gray-500 text-sm">אין דיווחים מדווחים.</Text>
                    ) : (
                        issueFlags.map((flag) => (
                            <View key={flag.id} className="border border-orange-200 bg-orange-50 rounded-xl p-3" style={{ gap: 6 }}>
                                <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
                                    <View className="px-2 py-0.5 rounded-full bg-orange-200">
                                        <Text className="text-orange-800 text-xs font-bold">{REASON_LABELS[flag.reason] || flag.reason}</Text>
                                    </View>
                                    <Text className="text-gray-500 text-xs">{flag.issue.fieldName}</Text>
                                    <Text className="text-gray-800 text-xs font-bold">{flag.issue.user.name || flag.issue.user.id}</Text>
                                    {flag.issue.user.blockedFromFieldSocial && (
                                        <View className="px-2 py-0.5 rounded-full bg-red-100">
                                            <Text className="text-red-700 text-xs font-bold">חסום</Text>
                                        </View>
                                    )}
                                </View>
                                {!!flag.issue.description && <Text className="text-gray-700 text-sm">{flag.issue.description}</Text>}
                                <Text className="text-gray-400 text-xs">דווח ע&quot;י {flag.reporter.name || flag.reporter.id}</Text>
                                <View className="flex-row" style={{ gap: 14 }}>
                                    <TouchableOpacity onPress={() => dismissIssue(flag)} disabled={busyId === flag.id}>
                                        <Text className="text-gray-600 text-xs font-bold">התעלם</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => deleteIssue(flag)} disabled={busyId === flag.id}>
                                        <Text className="text-orange-700 text-xs font-bold">מחק דיווח</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => toggleBlock(flag.issue.user.id, flag.issue.user.blockedFromFieldSocial)} disabled={busyId === flag.issue.user.id}>
                                        <Text className={`text-xs font-bold ${flag.issue.user.blockedFromFieldSocial ? 'text-green-700' : 'text-red-700'}`}>
                                            {flag.issue.user.blockedFromFieldSocial ? 'בטל חסימה' : 'חסום משתמש'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}
