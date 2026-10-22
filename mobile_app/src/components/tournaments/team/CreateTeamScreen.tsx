import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useTeamMutations } from '@/hooks/useTournamentMutations';
import CreateTeamForm from './CreateTeamForm';
import MinorsCard from './MinorsCard';
import { describeTeamError, TEAM_COLORS } from './teamUtils';

/** Container of `/tournaments/[id]/team/new`: register a team, then go to its page (status banner shows the result). */
export default function CreateTeamScreen({ tournamentId }: { tournamentId: string }) {
    const { t } = useTranslation();
    const router = useRouter();
    const { tournament, loading, error, notFound, refetch } = useTournament(tournamentId);
    const teams = useTeamMutations(tournamentId);
    const [name, setName] = useState('');
    const [color, setColor] = useState(TEAM_COLORS[0]);
    const [message, setMessage] = useState<string | null>(null);
    const [minors, setMinors] = useState(false);

    // Already registered: a person can be on one team per tournament, so go to it.
    const myTeamId = tournament?.myTeam?.id;
    useEffect(() => {
        if (myTeamId) router.replace(`/tournaments/${tournamentId}/team/${myTeamId}` as any);
    }, [myTeamId, tournamentId, router]);

    const Frame = ({ children, testID }: { children: React.ReactNode; testID: string }) => (
        <SafeAreaView testID={testID} className="flex-1 items-center justify-center bg-gray-50 dark:bg-cyber-bg px-8">
            {children}
        </SafeAreaView>
    );

    if (loading || myTeamId) {
        return (
            <Frame testID="team-create-loading">
                <ActivityIndicator color="#059669" />
            </Frame>
        );
    }
    if (notFound || error || !tournament) {
        return (
            <Frame testID="team-create-load-error">
                <Text className="text-center text-gray-700 dark:text-cyber-text mb-4">{t('common.error')}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={refetch} className="h-11 px-6 rounded-xl bg-brand items-center justify-center">
                    <Text className="text-white font-bold">{t('common.retry')}</Text>
                </TouchableOpacity>
            </Frame>
        );
    }
    if (!tournament.capabilities.canRegisterTeam && !minors) {
        // Registration closed / not allowed for this viewer: hide the form, say why (REGISTRATION_CLOSED copy).
        return (
            <Frame testID="team-create-closed">
                <Text className="text-center text-gray-700 dark:text-cyber-text">{t('tournaments.errors.REGISTRATION_CLOSED')}</Text>
            </Frame>
        );
    }

    const submit = async () => {
        if (!name.trim()) {
            setMessage(t('tournaments.wizard.err.required'));
            return;
        }
        setMessage(null);
        try {
            const res = await teams.createTeam({ name: name.trim(), color });
            router.replace(`/tournaments/${tournamentId}/team/${res.team.id}` as any);
        } catch (err) {
            const d = describeTeamError(t, err, { self: true });
            if (d.kind === 'minors') setMinors(true);
            else setMessage(d.message);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-cyber-bg" edges={['bottom']}>
            <Stack.Screen options={{ title: t('tournaments.team.create') }} />
            {minors ? (
                <MinorsCard />
            ) : (
                <CreateTeamForm
                    name={name}
                    color={color}
                    onNameChange={(v) => {
                        setName(v);
                        setMessage(null);
                    }}
                    onColorChange={setColor}
                    onSubmit={submit}
                    pending={teams.pending}
                    error={message}
                />
            )}
        </SafeAreaView>
    );
}
