import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import TeamPageScreen from '@/components/tournaments/team/TeamPageScreen';

export default function TeamRoute() {
    const { id, teamId } = useLocalSearchParams<{ id: string; teamId: string }>();
    return <TeamPageScreen tournamentId={id} teamId={teamId} />;
}
