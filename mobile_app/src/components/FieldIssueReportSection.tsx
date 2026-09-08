import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { fieldsApi, FieldIssueCategory, FieldIssueReport } from '@/services/api';

const CATEGORIES: FieldIssueCategory[] = ['POTHOLE', 'LIGHTING', 'SURFACE', 'GOAL_NET', 'FENCE', 'OTHER'];

const CATEGORY_KEY: Record<FieldIssueCategory, string> = {
    POTHOLE: 'field.categoryPothole',
    LIGHTING: 'field.categoryLighting',
    SURFACE: 'field.categorySurface',
    GOAL_NET: 'field.categoryGoalNet',
    FENCE: 'field.categoryFence',
    OTHER: 'field.categoryOther',
};

export default function FieldIssueReportSection({ fieldId }: { fieldId: string }) {
    const { t } = useTranslation();
    const { getToken, userId } = useAuth();
    const [issues, setIssues] = useState<FieldIssueReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<FieldIssueCategory>('POTHOLE');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fieldsApi.getIssues(fieldId)
            .then((data) => { if (!cancelled) setIssues(data); })
            .catch(() => { if (!cancelled) setIssues([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [fieldId]);

    const openIssues = issues.filter((i) => i.status === 'OPEN');

    const submit = useCallback(async () => {
        if (submitting) return;
        setSubmitting(true);
        setDone(false);
        try {
            const token = await getToken();
            if (!token) return;
            const created = await fieldsApi.addIssue(fieldId, { category, description: description.trim() || undefined }, token);
            setIssues((prev) => [created, ...prev]);
            setDescription('');
            setDone(true);
        } catch (e) {
            console.error('Failed to add field issue', e);
        } finally {
            setSubmitting(false);
        }
    }, [submitting, fieldId, category, description, getToken]);

    return (
        <View className="bg-white p-4 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-800">{t('field.issuesTitle')}</Text>
            <Text className="text-gray-400 text-xs mb-3">{t('field.issuesSubtitle')}</Text>

            {loading ? (
                <Text className="text-gray-500 text-sm mb-3">{t('field.loadingIssues')}</Text>
            ) : openIssues.length > 0 ? (
                <View className="flex-row flex-wrap mb-3" style={{ gap: 6 }}>
                    {openIssues.map((i) => (
                        <View key={i.id} className="px-3 py-1 rounded-full bg-orange-50 border border-orange-200">
                            <Text className="text-orange-700 text-xs font-bold">{t(CATEGORY_KEY[i.category])}</Text>
                        </View>
                    ))}
                </View>
            ) : (
                <Text className="text-gray-500 text-sm mb-3">{t('field.noOpenIssues')}</Text>
            )}

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
                    <View className="flex-row items-center" style={{ gap: 8 }}>
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
                    {done && (
                        <Text className="text-green-600 text-xs font-bold mt-2">{t('field.issueReported')}</Text>
                    )}
                </>
            ) : (
                <Text className="text-gray-500 text-sm">{t('field.signInToReportIssue')}</Text>
            )}
        </View>
    );
}
