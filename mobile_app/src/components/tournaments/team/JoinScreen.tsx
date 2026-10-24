import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useTeamMutations } from '@/hooks/useTournamentMutations';
import JoinSheet from './JoinSheet';
import { describeTeamError } from './teamUtils';

/** Route param meaning "no code in the link": the sheet asks for a 6-char code (spec 5.2, "have a code?"). */
export const MANUAL_CODE = '_';

/**
 * Container of `/tournaments/[id]/join/[code]` (also reached by the `joinup://tournaments/{id}/join/{code}`
 * deep link, which expo-router resolves to this file). Joins on confirm, never on open.
 */
export default function JoinScreen({ tournamentId, code: codeParam }: { tournamentId: string; code: string }) {
    const { t } = useTranslation();
    const router = useRouter();
    const { isSignedIn } = useAuth();
    const { tournament, loading, error, notFound, refetch } = useTournament(tournamentId);
    const teams = useTeamMutations(tournamentId);
    const manual = codeParam === MANUAL_CODE;
    const [typed, setTyped] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [minors, setMinors] = useState(false);
    const code = manual ? typed : codeParam;

    const leave = () => (router.canGoBack() ? router.back() : router.replace(`/tournaments/${tournamentId}` as any));

    const submit = async () => {
        setMessage(null);
        try {
            const res = await teams.joinByCode(code);
            router.replace(`/tournaments/${tournamentId}/team/${res.team.id}` as any);
        } catch (err) {
            const d = describeTeamError(t, err, { self: true });
            if (d.kind === 'minors') setMinors(true);
            else setMessage(d.message);
        }
    };

    let body: React.ReactNode;
    if (loading) body = <ActivityIndicator color="#059669" />;
    else if (notFound || error || !tournament)
        body = (
            <>
                <Text className="text-center text-gray-700 dark:text-cyber-text mb-4">{t('common.error')}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={refetch} className="h-11 px-6 rounded-xl bg-brand items-center justify-center">
                    <Text className="text-white font-bold">{t('tournaments.team.retry')}</Text>
                </TouchableOpacity>
            </>
        );
    else
        body = (
            <JoinSheet
                title={tournament.title}
                sport={tournament.sport}
                startsAt={tournament.startsAt}
                manual={manual}
                code={code}
                onCodeChange={setTyped}
                signedIn={!!isSignedIn}
                alreadyInTeam={!!tournament.myTeam}
                pending={teams.pending}
                error={message}
                minors={minors}
                onSubmit={submit}
                onSignIn={() => router.push('/sign-in' as any)}
                onNotNow={leave}
                onToMyTeam={() => router.replace(`/tournaments/${tournamentId}/team/${tournament.myTeam?.id}` as any)}
            />
        );

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-cyber-bg">
            <Stack.Screen options={{ title: t('tournaments.join.title') }} />
            <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
                {body}
            </ScrollView>
        </SafeAreaView>
    );
}
