import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { fieldsApi, FieldComment, FieldFlagReason } from '@/services/api';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { formatJerusalemDate, formatJerusalemTime } from '@/utils/timezone';

function replaceInTree(list: FieldComment[], id: string, next: FieldComment): FieldComment[] {
    return list.map((c) => {
        if (c.id === id) return next;
        if (c.replies?.some((r) => r.id === id)) {
            return { ...c, replies: c.replies.map((r) => (r.id === id ? next : r)) };
        }
        return c;
    });
}

function removeFromTree(list: FieldComment[], id: string): FieldComment[] {
    return list
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, replies: (c.replies || []).filter((r) => r.id !== id) }));
}

export default function FieldCommentsSection({ fieldId }: { fieldId: string }) {
    const { t } = useTranslation();
    const { getToken, userId } = useAuth();
    const { isAdmin } = useIsAdmin();
    const [comments, setComments] = useState<FieldComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const token = await getToken().catch(() => null);
            fieldsApi.getComments(fieldId, token || undefined)
                .then((data) => { if (!cancelled) setComments(data); })
                .catch(() => { if (!cancelled) setComments([]); })
                .finally(() => { if (!cancelled) setLoading(false); });
        })();
        return () => { cancelled = true; };
    }, [fieldId]);

    const submit = useCallback(async () => {
        const trimmed = text.trim();
        if (!trimmed || submitting) return;
        setSubmitting(true);
        try {
            const token = await getToken();
            if (!token) return;
            const created = await fieldsApi.addComment(fieldId, trimmed, token);
            setComments((prev) => [created, ...prev]);
            setText('');
        } catch (e) {
            console.error('Failed to add field comment', e);
        } finally {
            setSubmitting(false);
        }
    }, [text, submitting, fieldId, getToken]);

    const submitReply = useCallback(async (parentId: string) => {
        const trimmed = replyText.trim();
        if (!trimmed) return;
        setBusyId(parentId);
        try {
            const token = await getToken();
            if (!token) return;
            const created = await fieldsApi.addComment(fieldId, trimmed, token, parentId);
            setComments((prev) => prev.map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, created] } : c)));
            setReplyingTo(null);
            setReplyText('');
        } catch (e) {
            console.error('Failed to reply to field comment', e);
        } finally {
            setBusyId(null);
        }
    }, [replyText, fieldId, getToken]);

    const saveEdit = useCallback(async (comment: FieldComment) => {
        const trimmed = editText.trim();
        if (!trimmed) return;
        setBusyId(comment.id);
        try {
            const token = await getToken();
            if (!token) return;
            const updated = await fieldsApi.editComment(fieldId, comment.id, trimmed, token);
            setComments((prev) => replaceInTree(prev, comment.id, updated));
            setEditingId(null);
        } catch (e) {
            console.error('Failed to edit field comment', e);
        } finally {
            setBusyId(null);
        }
    }, [editText, fieldId, getToken]);

    const remove = useCallback((commentId: string) => {
        Alert.alert(t('field.comments'), t('field.confirmDeleteComment'), [
            { text: t('field.cancel'), style: 'cancel' },
            {
                text: t('field.delete'), style: 'destructive', onPress: async () => {
                    setBusyId(commentId);
                    try {
                        const token = await getToken();
                        if (!token) return;
                        await fieldsApi.deleteComment(fieldId, commentId, token);
                        setComments((prev) => removeFromTree(prev, commentId));
                    } catch (e) {
                        console.error('Failed to delete field comment', e);
                    } finally {
                        setBusyId(null);
                    }
                }
            },
        ]);
    }, [fieldId, getToken, t]);

    const react = useCallback(async (comment: FieldComment, type: 'LIKE' | 'DISLIKE') => {
        setBusyId(comment.id);
        try {
            const token = await getToken();
            if (!token) return;
            const result = await fieldsApi.reactToComment(fieldId, comment.id, type, token);
            setComments((prev) => replaceInTree(prev, comment.id, { ...comment, ...result }));
        } catch (e) {
            console.error('Failed to react to field comment', e);
        } finally {
            setBusyId(null);
        }
    }, [fieldId, getToken]);

    const flag = useCallback(async (commentId: string, reason: FieldFlagReason) => {
        try {
            const token = await getToken();
            if (!token) return;
            await fieldsApi.flagComment(fieldId, commentId, reason, undefined, token);
            Alert.alert(t('field.reportSent'));
        } catch (e) {
            console.error('Failed to flag field comment', e);
        }
    }, [fieldId, getToken, t]);

    const promptFlag = useCallback((commentId: string) => {
        Alert.alert(t('field.reportContent'), undefined, [
            { text: t('field.flagOffensive'), onPress: () => flag(commentId, 'OFFENSIVE') },
            { text: t('field.flagFalseInfo'), onPress: () => flag(commentId, 'FALSE_INFO') },
            { text: t('field.flagSpam'), onPress: () => flag(commentId, 'SPAM') },
            { text: t('field.flagOther'), onPress: () => flag(commentId, 'OTHER') },
            { text: t('field.cancel'), style: 'cancel' },
        ]);
    }, [flag, t]);

    const renderRow = (comment: FieldComment, isReply: boolean) => {
        const isOwn = !!userId && comment.user.id === userId;
        const canModify = isOwn || isAdmin;
        const isEditing = editingId === comment.id;
        const isBusy = busyId === comment.id;

        return (
            <View key={comment.id} className={isReply ? 'mt-3' : 'mt-3 pt-3 border-t border-gray-100'}>
                <View className="flex-row justify-between items-center">
                    <Text className="font-bold text-gray-800 text-sm">{comment.user.name || '?'}</Text>
                    <Text className="text-gray-400" style={{ fontSize: 11 }}>
                        {formatJerusalemDate(comment.createdAt).split('-').reverse().join('/')} {formatJerusalemTime(comment.createdAt)}
                        {comment.edited ? ` · ${t('field.edited')}` : ''}
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
                        <TouchableOpacity onPress={() => saveEdit(comment)} disabled={isBusy || !editText.trim()}>
                            <Text className="text-brand font-bold">{t('field.save')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingId(null)} disabled={isBusy}>
                            <Text className="text-gray-500">{t('field.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <Text className="text-gray-700 text-sm mt-1">{comment.text}</Text>
                )}

                <View className="flex-row items-center mt-1" style={{ gap: 10 }}>
                    <TouchableOpacity className="flex-row items-center" onPress={() => react(comment, 'LIKE')} disabled={isBusy} style={{ gap: 4 }}>
                        <FontAwesome name={comment.viewerReaction === 'LIKE' ? 'thumbs-up' : 'thumbs-o-up'} size={14} color={comment.viewerReaction === 'LIKE' ? '#059669' : '#6b7280'} />
                        {comment.likeCount > 0 && <Text className="text-gray-500 text-xs">{comment.likeCount}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-row items-center" onPress={() => react(comment, 'DISLIKE')} disabled={isBusy} style={{ gap: 4 }}>
                        <FontAwesome name={comment.viewerReaction === 'DISLIKE' ? 'thumbs-down' : 'thumbs-o-down'} size={14} color={comment.viewerReaction === 'DISLIKE' ? '#dc2626' : '#6b7280'} />
                        {comment.dislikeCount > 0 && <Text className="text-gray-500 text-xs">{comment.dislikeCount}</Text>}
                    </TouchableOpacity>
                    {!isReply && (
                        <TouchableOpacity onPress={() => { setReplyingTo(comment.id); setReplyText(''); }}>
                            <Text className="text-brand text-xs font-bold">{t('field.reply')}</Text>
                        </TouchableOpacity>
                    )}
                    {isOwn && !isEditing && (
                        <TouchableOpacity onPress={() => { setEditingId(comment.id); setEditText(comment.text); }}>
                            <FontAwesome name="pencil" size={13} color="#6b7280" />
                        </TouchableOpacity>
                    )}
                    {canModify && (
                        <TouchableOpacity onPress={() => remove(comment.id)} disabled={isBusy}>
                            <FontAwesome name="trash-o" size={14} color="#dc2626" />
                        </TouchableOpacity>
                    )}
                    {!isOwn && userId && (
                        <TouchableOpacity onPress={() => promptFlag(comment.id)}>
                            <FontAwesome name="flag-o" size={13} color="#6b7280" />
                        </TouchableOpacity>
                    )}
                </View>

                {replyingTo === comment.id && (
                    <View className="flex-row items-center mt-2" style={{ gap: 6 }}>
                        <TextInput
                            value={replyText}
                            onChangeText={setReplyText}
                            placeholder={t('field.commentPlaceholder')}
                            editable={busyId !== comment.id}
                            maxLength={1000}
                            style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8 }}
                        />
                        <TouchableOpacity onPress={() => submitReply(comment.id)} disabled={busyId === comment.id || !replyText.trim()}>
                            <Text className="text-brand font-bold">{t('field.send')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setReplyingTo(null)}>
                            <Text className="text-gray-500">{t('field.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {!isReply && comment.replies.length > 0 && (
                    <View className="mt-2 pl-3" style={{ borderRightWidth: 2, borderRightColor: '#e5e7eb', paddingRight: 8 }}>
                        {comment.replies.map((r) => renderRow(r, true))}
                    </View>
                )}
            </View>
        );
    };

    return (
        <View className="bg-white p-4 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-800 mb-3">{t('field.comments')}</Text>

            {userId ? (
                <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
                    <TextInput
                        value={text}
                        onChangeText={setText}
                        placeholder={t('field.commentPlaceholder')}
                        editable={!submitting}
                        maxLength={1000}
                        style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10 }}
                    />
                    <TouchableOpacity
                        onPress={submit}
                        disabled={submitting || !text.trim()}
                        className={`px-4 py-2.5 rounded-lg ${submitting || !text.trim() ? 'bg-gray-300' : 'bg-brand'}`}
                    >
                        {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                            <Text className="text-white font-bold">{t('field.send')}</Text>
                        )}
                    </TouchableOpacity>
                </View>
            ) : (
                <Text className="text-gray-500 text-sm mb-3">{t('field.signInToComment')}</Text>
            )}

            {loading ? (
                <Text className="text-gray-500 text-sm">{t('field.loadingComments')}</Text>
            ) : comments.length === 0 ? (
                <Text className="text-gray-500 text-sm">{t('field.noComments')}</Text>
            ) : (
                comments.map((c) => renderRow(c, false))
            )}
        </View>
    );
}
