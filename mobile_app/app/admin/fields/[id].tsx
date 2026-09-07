import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fieldsApi, Field } from '@/services/api/fields';
import FieldEditorForm from '@/components/admin/FieldEditorForm';

export default function AdminFieldEditScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [field, setField] = useState<Field | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await fieldsApi.getById(id);
                if (!cancelled) setField(data);
            } catch (e) {
                console.error('Failed to load field', e);
                if (!cancelled) setError('טעינת המגרש נכשלה');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [id]);

    if (loading) {
        return (
            <SafeAreaView className="flex-1 bg-white items-center justify-center">
                <ActivityIndicator size="large" color="#059669" />
            </SafeAreaView>
        );
    }

    if (error || !field) {
        return (
            <SafeAreaView className="flex-1 bg-white items-center justify-center px-8">
                <Text className="text-gray-500 text-center">{error || 'המגרש לא נמצא'}</Text>
            </SafeAreaView>
        );
    }

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <FieldEditorForm field={field} />
        </>
    );
}
