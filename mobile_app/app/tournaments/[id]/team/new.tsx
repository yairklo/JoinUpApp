import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import CreateTeamScreen from '@/components/tournaments/team/CreateTeamScreen';

export default function CreateTeamRoute() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return <CreateTeamScreen tournamentId={id} />;
}
