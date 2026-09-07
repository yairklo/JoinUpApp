import React from 'react';
import { Stack } from 'expo-router';
import FieldEditorForm from '@/components/admin/FieldEditorForm';

export default function AdminFieldNewScreen() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <FieldEditorForm field={null} />
        </>
    );
}
