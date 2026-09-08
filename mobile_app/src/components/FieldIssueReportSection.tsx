import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { fieldsApi, FieldIssueCategory, FieldIssueReport, FieldFlagReason, PickedImage } from '@/services/api';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { formatJerusalemDate, formatJerusalemTime } from '@/utils/timezone';
import { pickOneImage } from '@/utils/pickImage';

const CATEGORIES: FieldIssueCategory[] = ['POTHOLE', 'LIGHTING', 'SURFACE', 'GOAL_NET', 'FENCE', 'OTHER'];

const CATEGORY_KEY: Record<FieldIssueCategory, string> = {
    POTHOLE: 'field.categoryPothole',
    LIGHTING: 'field.categoryLighting',
    SURFACE: 'field.categorySurface',
    GOAL_NET: 'field.categoryGoalNet',
    FENCE: 'field.categoryFence',
    OTHER: 'field.categoryOther',
};

function replaceInTree(list: FieldIssueReport[], id: string, next: FieldIssueReport): FieldIssueReport[] {
    return list.map((i) => {
        if (i.id === id) return next;
        if (i.replies?.some((r) => r.id === id)) {
            return { ...i, replies: i.replies.map((r) => (r.id === id ? next : r)) };
        }
        return i;
    });
}

function removeFromTree(list: FieldIssueReport[], id: string): FieldIssueReport[] {
    return list
        .filter((i) => i.id !== id)
        .map((i) => ({ ...i, replies: (i.replies || []).filter((r) => r.id !== id) }));
}

export default function FieldIssueReportSection({ fieldId }: { fieldId: string }) {
    const { t } = useTranslation();
    const { getToken, userId } = useAuth();
    const { isAdmin } = useIsAdmin();
    const [issues, setIssues] = useState<FieldIssueReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<FieldIssueCategory>('POTHOLE');
    const [description, setDescription] = useState('');
    const [photo, setPhoto] = useState<PickedImage | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const token = await getToken().catch(() => null);
            fieldsApi.getIssues(fieldId, token || undefined)
                .then((data) => { if (!cancelled) setIssues(data); })
                .catch(() => { if (!cancelled) setIssues([]); })
                .finally(() => { if (!cancelled) setLoading(false); });
        })();
        return () => { cancelled = true; };
    }, [fieldId]);

    const submit = useCallback(async () => {
        if (submitting) return;
        setSubmitting(true);
        setDone(false);
        try {
            const token = await getToken();
            if (!token) return;
            let created = await fieldsApi.addIssue(fieldId, { category, description: description.trim() || undefined }, token);
            if (photo) {
                try {
                    created = await fieldsApi.uploadIssuePhoto(fieldId, created.id, photo, token);
                } catch (e) {
                    console.error('Failed to upload field issue photo', e);
                }
            }
            setIssues((prev) => [created, ...prev]);
            setDescription('');
            setPhoto(null);
            setDone(true);
        } catch (e) {
            console.error('Failed to add field issue', e);
        } finally {
            setSubmitting(false);
        }
    }, [submitting, fieldId, category, description, photo, getToken]);

    const pickPhoto = useCallback(async () => {
        const image = await pickOneImage();
        if (image) setPhoto(image);
    }, []);

    const removePhoto = useCallback(async (issue: FieldIssueReport) => {
        setBusyId(issue.id);
        try {
            const token = await getToken();
            if (!token) return;
            const updated = await fieldsApi.removeIssuePhoto(fieldId, issue.id, token);
            setIssues((prev) => replaceInTree(prev, issue.id, updated));
        } catch (e) {
            console.error('Failed to remove field issue photo', e);
        } finally {
            setBusyId(null);
        }
    }, [fieldId, getToken]);

    const submitReply = useCallback(async (parentId: string) => {
        const trimmed = replyText.trim();
        if (!trimmed) return;
        setBusyId(parentId);
        try {
            const token = await getToken();
            if (!token) return;
            const created = await fieldsApi.addIssue(fieldId, { description: trimmed, parentId }, token);
            setIssues((prev) => prev.map((i) => (i.id === parentId ? { ...i, replies: [...i.replies, created] } : i)));
            setReplyingTo(null);
            setReplyText('');
        } catch (e) {
            console.error('Failed to reply to field issue', e);
        } finally {
            setBusyId(null);
        }
    }, [replyText, fieldId, getToken]);

    const saveEdit = useCallback(async (issue: FieldIssueReport) => {
        const trimmed = editText.trim();
        if (!trimmed) return;
        setBusyId(issue.id);
        try {
            const token = await getToken();
            if (!token) return;
            const updated = await fieldsApi.editIssue(fieldId, issue.id, trimmed, token);
            setIssues((prev) => replaceInTree(prev, issue.id, updated));
            setEditingId(null);
        } catch (e) {
            console.error('Failed to edit field issue', e);
        } finally {
            setBusyId(null);
        }
    }, [editText, fieldId, getToken]);

    const remove = useCallback((issueId: string) => {
        Alert.alert(t('field.issuesTitle'), t('field.confirmDeleteIssue'), [
            { text: t('field.cancel'), style: 'cancel' },
            {
                text: t('field.delete'), style: 'destructive', onPress: async () => {
                    setBusyId(issueId);
                    try {
                        const token = await getToken();
                        if (!token) return;
                        await fieldsApi.deleteIssue(fieldId, issueId, token);
                        setIssues((prev) => removeFromTree(prev, issueId));
                    } catch (e) {
                        console.error('Failed to delete field issue', e);
                    } finally {
                        setBusyId(null);
                    }
                }
            },
        ]);
    }, [fieldId, getToken, t]);

    const react = useCallback(async (issue: FieldIssueReport, type: 'LIKE' | 'DISLIKE') => {
        setBusyId(issue.id);
        try {
            const token = await getToken();
            if (!token) return;
            const result = await fieldsApi.reactToIssue(fieldId, issue.id, type, token);
            setIssues((prev) => replaceInTree(prev, issue.id, { ...issue, ...result }));
        } catch (e) {
            console.error('Failed to react to field issue', e);
        } finally {
            setBusyId(null);
        }
    }, [fieldId, getToken]);

    const flag = useCallback(async (issueId: string, reason: FieldFlagReason) => {
        try {
            const token = await getToken();
            if (!token) return;
            await fieldsApi.flagIssue(fieldId, issueId, reason, undefined, token);
            Alert.alert(t('field.reportSent'));
        } catch (e) {
            console.error('Failed to flag field issue', e);
        }
    }, [fieldId, getToken, t]);

    const promptFlag = useCallback((issueId: string) => {
        Alert.alert(t('field.reportContent'), undefined, [
            { text: t('field.flagOffensive'), onPress: () => flag(issueId, 'OFFENSIVE') },
            { text: t('field.flagFalseInfo'), onPress: () => flag(issueId, 'FALSE_INFO') },
            { text: t('field.flagSpam'), onPress: () => flag(issueId, 'SPAM') },
            { text: t('field.flagOther'), onPress: () => flag(issueId, 'OTHER') },
            { text: t('field.cancel'), style: 'cancel' },
        ]);
    }, [flag, t]);

    const renderRow = (issue: FieldIssueReport, isReply: boolean) => {
        const isOwn = !!userId && issue.user.id === userId;
        const canModify = isOwn || isAdmin;
        const isEditing = editingId === issue.id;
        const isBusy = busyId === issue.id;

        return (
            <View key={issue.id} className={isReply ? 'mt-3' : 'mt-3 pt-3 border-t border-gray-100'}>
                <View className="flex-row justify-between items-center flex-wrap">
                    <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
                        <Text className="font-bold text-gray-800 text-sm">{issue.user.name || '?'}</Text>
                        {!isReply && issue.category && (
                            <View className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200">
                                <Text className="text-orange-700 text-xs font-bold">{t(CATEGORY_KEY[issue.category])}</Text>
                            </View>
                        )}
                        {!isReply && (
                            <View className={`px-2 py-0.5 rounded-full ${issue.status === 'OPEN' ? 'bg-gray-100' : 'bg-green-100'}`}>
                                <Text className={`text-xs font-bold ${issue.status === 'OPEN' ? 'text-gray-600' : 'text-green-700'}`}>
                                    {issue.status === 'OPEN' ? t('field.statusOpen') : t('field.statusResolved')}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text className="text-gray-400" style={{ fontSize: 11 }}>
                        {formatJerusalemDate(issue.createdAt).split('-').reverse().join('/')} {formatJerusalemTime(issue.createdAt)}
                        {issue.edited ? ` · ${t('field.edited')}` : ''}
                    </Text>
                </View>

                {isEditing ? (
                    <View className="flex-row items-center mt-1" style={{ gap: 6 }}>
                        <TextInput
                            value={editText}
                            onChangeText={setEditText}
                            editable={!isBusy}
                            maxLength={1000}
                            style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8 }}
                        />
                        <TouchableOpacity onPress={() => saveEdit(issue)} disabled={isBusy || !editText.trim()}>
                            <Text className="text-brand font-bold">{t('field.save')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingId(null)} disabled={isBusy}>
                            <Text className="text-gray-500">{t('field.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    issue.description ? <Text className="text-gray-700 text-sm mt-1">{issue.description}</Text> : null
                )}

                {issue.photoUrl && !isEditing && (
                    <View className="mt-2" style={{ width: 140, position: 'relative' }}>
                        <Image source={{ uri: issue.photoUrl }} style={{ width: 140, height: 100, borderRadius: 8 }} />
                        {isOwn && (
                            <TouchableOpacity
                                onPress={() => removePhoto(issue)}
                                disabled={isBusy}
                                style={{ position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 999, padding: 2 }}
                            >
                                <FontAwesome name="times" size={12} color="#374151" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                <View className="flex-row items-center mt-1 flex-wrap" style={{ gap: 10 }}>
                    <TouchableOpacity className="flex-row items-center" onPress={() => react(issue, 'LIKE')} disabled={isBusy} style={{ gap: 4 }}>
                        <FontAwesome name={issue.viewerReaction === 'LIKE' ? 'thumbs-up' : 'thumbs-o-up'} size={14} color={issue.viewerReaction === 'LIKE' ? '#059669' : '#6b7280'} />
                        {issue.likeCount > 0 && <Text className="text-gray-500 text-xs">{issue.likeCount}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-row items-center" onPress={() => react(issue, 'DISLIKE')} disabled={isBusy} style={{ gap: 4 }}>
                        <FontAwesome name={issue.viewerReaction === 'DISLIKE' ? 'thumbs-down' : 'thumbs-o-down'} size={14} color={issue.viewerReaction === 'DISLIKE' ? '#dc2626' : '#6b7280'} />
                        {issue.dislikeCount > 0 && <Text className="text-gray-500 text-xs">{issue.dislikeCount}</Text>}
                    </TouchableOpacity>
                    {!isReply && (
                        <TouchableOpacity onPress={() => { setReplyingTo(issue.id); setReplyText(''); }}>
                            <Text className="text-brand text-xs font-bold">{t('field.reply')}</Text>
                        </TouchableOpacity>
                    )}
                    {isOwn && !isEditing && (
                        <TouchableOpacity onPress={() => { setEditingId(issue.id); setEditText(issue.description || ''); }}>
                            <FontAwesome name="pencil" size={13} color="#6b7280" />
                        </TouchableOpacity>
                    )}
                    {!isOwn && userId && (
                        <TouchableOpacity onPress={() => promptFlag(issue.id)}>
                            <FontAwesome name="flag-o" size={13} color="#6b7280" />
                        </TouchableOpacity>
                    )}
                    {canModify && (
                        <TouchableOpacity onPress={() => remove(issue.id)} disabled={isBusy}>
                            <FontAwesome name="trash-o" size={14} color="#dc2626" />
                        </TouchableOpacity>
                    )}
                </View>

                {replyingTo === issue.id && (
                    <View className="flex-row items-center mt-2" style={{ gap: 6 }}>
                        <TextInput
                            value={replyText}
                            onChangeText={setReplyText}
                            placeholder={t('field.commentPlaceholder')}
                            editable={busyId !== issue.id}
                            maxLength={1000}
                            style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8 }}
                        />
                        <TouchableOpacity onPress={() => submitReply(issue.id)} disabled={busyId === issue.id || !replyText.trim()}>
                            <Text className="text-brand font-bold">{t('field.send')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setReplyingTo(null)}>
                            <Text className="text-gray-500">{t('field.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {!isReply && issue.replies.length > 0 && (
                    <View className="mt-2 pl-3" style={{ borderRightWidth: 2, borderRightColor: '#e5e7eb', paddingRight: 8 }}>
                        {issue.replies.map((r) => renderRow(r, true))}
                    </View>
                )}
            </View>
        );
    };

    return (
        <View className="bg-white p-4 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-800">{t('field.issuesTitle')}</Text>
            <Text className="text-gray-400 text-xs mb-3">{t('field.issuesSubtitle')}</Text>

            {userId ? (
                <>
                    <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
                        {CATEGORIES.map((c) => (
                            <TouchableOpacity
                                key={c}
                                onPress={() => setCategory(c)}
                                className={`px-3 py-1.5 rounded-full border ${category === c ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
                            >
                                <Text className={category === c ? 'text-white font-bold text-xs' : 'text-gray-700 text-xs'}>
                                    {t(CATEGORY_KEY[c])}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View className="flex-row items-center mb-2" style={{ gap: 8 }}>
                        <TextInput
                            value={description}
                            onChangeText={setDescription}
                            placeholder={t('field.issueDescriptionPlaceholder')}
                            editable={!submitting}
                            maxLength={1000}
                            style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10 }}
                        />
                        <TouchableOpacity
                            onPress={submit}
                            disabled={submitting}
                            className={`px-4 py-2.5 rounded-lg ${submitting ? 'bg-gray-300' : 'bg-orange-500'}`}
                        >
                            {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                                <Text className="text-white font-bold">{t('field.reportIssue')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={pickPhoto} className="flex-row items-center self-start" disabled={submitting}>
                        <FontAwesome name="camera" size={14} color="#6b7280" />
                        <Text className="text-gray-600 text-xs font-bold ml-2">
                            {photo ? photo.name : t('field.attachPhoto')}
                        </Text>
                    </TouchableOpacity>
                    {photo && (
                        <View className="flex-row items-center mt-2" style={{ gap: 8 }}>
                            <Image source={{ uri: photo.uri }} style={{ width: 60, height: 60, borderRadius: 8 }} />
                            <TouchableOpacity onPress={() => setPhoto(null)}>
                                <FontAwesome name="times-circle" size={18} color="#9ca3af" />
                            </TouchableOpacity>
                        </View>
                    )}
                    {done && (
                        <Text className="text-green-600 text-xs font-bold mt-2">{t('field.issueReported')}</Text>
                    )}
                </>
            ) : (
                <Text className="text-gray-500 text-sm">{t('field.signInToReportIssue')}</Text>
            )}

            {loading ? (
                <Text className="text-gray-500 text-sm mt-3">{t('field.loadingIssues')}</Text>
            ) : issues.length === 0 ? (
                <Text className="text-gray-500 text-sm mt-3">{t('field.noOpenIssues')}</Text>
            ) : (
                issues.map((i) => renderRow(i, false))
            )}
        </View>
    );
}
