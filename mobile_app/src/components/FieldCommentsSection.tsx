import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { fieldsApi, FieldComment } from '@/services/api';
import { formatJerusalemDate, formatJerusalemTime } from '@/utils/timezone';

export default function FieldCommentsSection({ fieldId }: { fieldId: string }) {
    const { t } = useTranslation();
    const { getToken, userId } = useAuth();
    const [comments, setComments] = useState<FieldComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fieldsApi.getComments(fieldId)
            .then((data) => { if (!cancelled) setComments(data); })
            .catch(() => { if (!cancelled) setComments([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
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
                comments.map((c, idx) => (
                    <View key={c.id} className={idx > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}>
                        <View className="flex-row justify-between items-center">
                            <Text className="font-bold text-gray-800 text-sm">{c.user.name || '?'}</Text>
                            <Text className="text-gray-400" style={{ fontSize: 11 }}>
                                {formatJerusalemDate(c.createdAt).split('-').reverse().join('/')} {formatJerusalemTime(c.createdAt)}
                            </Text>
                        </View>
                        <Text className="text-gray-700 text-sm mt-1">{c.text}</Text>
                    </View>
                ))
            )}
        </View>
    );
}
