import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { tournamentsApi } from '@/services/api/tournaments';
import { useMyInvites } from '@/hooks/useTournaments';
import type { MyInvite } from '@/types/tournament';
import InviteCard, { type InviteCardState } from './InviteCard';
import { describeTeamError } from './teamUtils';

/** Container of `/tournaments/invites`: invites grouped by tournament, accept / decline, "one team only" note. */
export default function InvitesScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { getToken, isSignedIn } = useAuth();
    const { user } = useUser();
    const { invites, loading, error, refetch } = useMyInvites();
    const [states, setStates] = useState<Record<string, InviteCardState>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const groups = useMemo(() => {
        const map = new Map<string, MyInvite[]>();
        for (const i of invites) {
            if (hidden.has(i.teamId)) continue;
            map.set(i.tournamentId, [...(map.get(i.tournamentId) ?? []), i]);
        }
        return [...map.entries()];
    }, [invites, hidden]);

    const respond = async (inv: MyInvite, accept: boolean) => {
        if (!user?.id) return;
        setStates((s) => ({ ...s, [inv.teamId]: 'pending' }));
        setErrors((e) => ({ ...e, [inv.teamId]: '' }));
        try {
            const token = await getToken();
            await tournamentsApi.respondToInvite(inv.tournamentId, inv.teamId, user.id, accept, token as string);
            if (accept) {
                setStates((s) => ({ ...s, [inv.teamId]: 'joined' }));
                // Accepting voids the other invites of that tournament: fade them out.
                setHidden((h) => {
                    const n = new Set(h);
                    invites.filter((o) => o.tournamentId === inv.tournamentId && o.teamId !== inv.teamId).forEach((o) => n.add(o.teamId));
                    return n;
                });
            } else {
                setHidden((h) => new Set(h).add(inv.teamId));
            }
        } catch (err) {
            const d = describeTeamError(t, err, { self: true });
            setStates((s) => ({ ...s, [inv.teamId]: 'idle' }));
            setErrors((e) => ({ ...e, [inv.teamId]: d.kind === 'message' ? d.message : String(t('tournaments.minors.title')) }));
        }
    };

    const accept = (inv: MyInvite) => {
        const others = invites.filter((o) => o.tournamentId === inv.tournamentId && o.teamId !== inv.teamId && !hidden.has(o.teamId));
        if (!others.length) return void respond(inv, true);
        Alert.alert(
            String(t('tournaments.invites.acceptConfirm', { team: inv.teamName, others: others.map((o) => o.teamName).join(', ') })),
            undefined,
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('tournaments.invites.accept'), onPress: () => void respond(inv, true) },
            ]
        );
    };

    let body: React.ReactNode;
    if (!isSignedIn) {
        body = <Text className="text-center text-gray-600 dark:text-cyber-muted mt-16">{t('tournaments.join.signIn')}</Text>;
    } else if (loading) {
        body = <ActivityIndicator className="mt-16" color="#059669" />;
    } else if (error) {
        body = (
            <View className="items-center mt-16">
                <Text className="text-gray-700 dark:text-cyber-text mb-4">{t('common.error')}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={refetch} className="h-11 px-6 rounded-xl bg-brand items-center justify-center">
                    <Text className="text-white font-bold">{t('tournaments.team.retry')}</Text>
                </TouchableOpacity>
            </View>
        );
    } else if (!groups.length) {
        body = (
            <Text testID="invites-empty" className="text-center text-gray-500 dark:text-cyber-muted mt-16">
                {t('tournaments.invites.empty')}
            </Text>
        );
    } else {
        body = groups.map(([tid, list]) => (
            <View key={tid} testID={`invites-group-${tid}`}>
                {list.length > 1 ? (
                    <Text testID="invites-one-team-note" className="text-xs text-gray-600 dark:text-cyber-muted mb-2">
                        {t('tournaments.invites.oneTeam')}
                    </Text>
                ) : null}
                {list.map((inv) => (
                    <InviteCard
                        key={inv.teamId}
                        invite={inv}
                        state={states[inv.teamId] ?? 'idle'}
                        error={errors[inv.teamId]}
                        onAccept={accept}
                        onDecline={(i) => void respond(i, false)}
                        onOpenTeam={(i) => router.push(`/tournaments/${i.tournamentId}/team/${i.teamId}` as any)}
                    />
                ))}
            </View>
        ));
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-cyber-bg" edges={['bottom']}>
            <Stack.Screen options={{ title: t('tournaments.invites.title') }} />
            <ScrollView
                testID="invites-list"
                contentContainerStyle={{ padding: 16 }}
                refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
            >
                {body}
            </ScrollView>
        </SafeAreaView>
    );
}
