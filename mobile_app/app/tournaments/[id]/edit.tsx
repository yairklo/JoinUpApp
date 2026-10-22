import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import TournamentWizardScreen from '@/components/tournaments/wizard/TournamentWizardScreen';

export default function EditTournamentScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <TournamentWizardScreen tournamentId={id} />
        </>
    );
}
