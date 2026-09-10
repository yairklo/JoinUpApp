import React from 'react';
import { Redirect } from 'expo-router';

export { default as FieldsDirectoryScreen } from '../(tabs)/fields';

export default function FieldsRedirect() {
    return <Redirect href="/(tabs)/fields" />;
}

