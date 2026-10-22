import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import JoinScreen from '@/components/tournaments/team/JoinScreen';

export default function JoinRoute() {
    const { id, code } = useLocalSearchParams<{ id: string; code: string }>();
    return <JoinScreen tournamentId={id} code={code} />;
}
