import React from 'react';
import { Stack } from 'expo-router';
import TournamentWizardScreen from '@/components/tournaments/wizard/TournamentWizardScreen';

export default function NewTournamentScreen() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <TournamentWizardScreen />
        </>
    );
}
