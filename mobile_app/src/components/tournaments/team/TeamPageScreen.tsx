import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/services/api/users';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import { useTournament } from '@/hooks/useTournament';
import { useTournamentTeam } from '@/hooks/useTournamentTeam';
import { useRosterMutations, useTeamMutations } from '@/hooks/useTournamentMutations';
import { UpdatedCue } from '../UpdatedCue';
import InvitePanel, { type InviteCandidate } from './InvitePanel';
import JerseyDialog from './JerseyDialog';
import JoinCodeBox from './JoinCodeBox';
import { type RosterAction } from './RosterRow';
import TeamPageView from './TeamPageView';
import { describeTeamError, joinLink } from './teamUtils';
import type { TeamMember } from '@/types/tournament';
import { appAlert } from '@/i18n/appAlert';

function State({ testID, children }: { testID: string; children: React.ReactNode }) {
    return (
        <SafeAreaView testID={testID} className="flex-1 items-center justify-center bg-gray-50 dark:bg-cyber-bg px-8">
            {children}
        </SafeAreaView>
    );
}

/** Container of `/tournaments/[id]/team/[teamId]`: loads team + tournament and wires every roster action. */
export default function TeamPageScreen({ tournamentId, teamId }: { tournamentId: string; teamId: string }) {
    const { t } = useTranslation();
    const router = useRouter();
    const { userId: authUserId } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const { user } = useUser();
    const viewerId = user?.id ?? authUserId ?? null;
    const { tournament } = useTournament(tournamentId);
    const { team, loading, error, notFound, refetch, updated } = useTournamentTeam(tournamentId, teamId);
    const roster = useRosterMutations(tournamentId);
    const teams = useTeamMutations(tournamentId);

    const [query, setQuery] = useState('');
    const dq = useDebouncedValue(query, 300);
    const [friends, setFriends] = useState<InviteCandidate[]>([]);
    const [results, setResults] = useState<InviteCandidate[]>([]);
    const [searching, setSearching] = useState(false);
    const [invited, setInvited] = useState<Set<string>>(new Set());
    const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
    const [pendingInvite, setPendingInvite] = useState<string | null>(null);
    const [jerseyFor, setJerseyFor] = useState<TeamMember | null>(null);
    const [jerseyError, setJerseyError] = useState<string | null>(null);
    const [codeOverride, setCodeOverride] = useState<string | null>(null);

    const isCaptain = !!team && !!viewerId && team.captainId === viewerId;
    const canEdit = isCaptain || tournament?.capabilities.canManage === true;

    useEffect(() => {
        if (!canEdit || !viewerId) return;
        let off = false;
        (async () => {
            try {
                const token = await getTokenRef.current();
                if (!token) return;
                const list = await usersApi.getFriends(viewerId, token);
                if (!off) setFriends(list.map((f: any) => ({ id: f.id, name: f.name, imageUrl: f.imageUrl })));
            } catch {
                /* friends are a convenience; search still works */
            }
        })();
        return () => {
            off = true;
        };
    }, [canEdit, viewerId, getTokenRef]);

    useEffect(() => {
        if (!dq.trim()) {
            setResults([]);
            return;
        }
        let off = false;
        setSearching(true);
        (async () => {
            try {
                const token = await getTokenRef.current();
                if (!token) return;
                const data = await usersApi.search(dq, token);
                if (!off) setResults(data.map((u: any) => ({ id: u.id, name: u.name, imageUrl: u.imageUrl })));
            } catch {
                if (!off) setResults([]);
            } finally {
                if (!off) setSearching(false);
            }
        })();
        return () => {
            off = true;
        };
    }, [dq, getTokenRef]);

    if (loading) {
        return (
            <State testID="team-page-loading">
                <ActivityIndicator color="#059669" />
            </State>
        );
    }
    if (notFound || error || !team || !tournament) {
        return (
            <State testID="team-page-error">
                <Text className="text-center text-gray-700 dark:text-cyber-text mb-4">{t('common.error')}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={refetch} className="h-11 px-6 rounded-xl bg-brand items-center justify-center">
                    <Text className="text-white font-bold">{t('tournaments.team.retry')}</Text>
                </TouchableOpacity>
            </State>
        );
    }

    const lockAt = tournament.rosterLockAt ? new Date(tournament.rosterLockAt) : null;
    const rosterLocked = !!lockAt && lockAt <= new Date() && !tournament.capabilities.canManage;
    const registrationOpen = tournament.status === 'REGISTRATION_OPEN';
    const code = codeOverride ?? team.joinCode ?? '';
    const busy = roster.pending || teams.pending;
    const msg = (err: any, self = false) => {
        const d = describeTeamError(t, err, { self });
        return d.kind === 'message' ? d.message : String(t('tournaments.minors.title'));
    };

    const invite = async (userId: string) => {
        setPendingInvite(userId);
        setInviteErrors((e) => ({ ...e, [userId]: '' }));
        try {
            await roster.invite(team.id, userId);
            setInvited((s) => new Set(s).add(userId));
            void refetch();
        } catch (err) {
            setInviteErrors((e) => ({ ...e, [userId]: msg(err) }));
        } finally {
            setPendingInvite(null);
        }
    };

    const confirm = (title: string, body: string | undefined, label: string, onOk: () => void, destructive = true) =>
        Alert.alert(title, body, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: label, style: destructive ? 'destructive' : 'default', onPress: onOk },
        ]);

    const run = async (fn: () => Promise<unknown>) => {
        try {
            await fn();
            await refetch();
        } catch (err) {
            appAlert(msg(err));
        }
    };

    const onMemberAction = (action: RosterAction, m: TeamMember) => {
        if (action === 'jersey') {
            setJerseyError(null);
            setJerseyFor(m);
        } else if (action === 'toBench') void run(() => roster.updateMember(team.id, m.userId, { role: 'SUBSTITUTE' }));
        else if (action === 'toRoster') void run(() => roster.updateMember(team.id, m.userId, { role: 'PLAYER' }));
        else if (action === 'remove' || action === 'cancelInvite')
            confirm(t('tournaments.team.removeConfirm', { name: m.name }), undefined, t('tournaments.team.remove'), () => void run(() => roster.remove(team.id, m.userId)));
        else if (action === 'leave')
            confirm(t('tournaments.team.leave'), undefined, t('tournaments.team.leave'), async () => {
                try {
                    await roster.remove(team.id, m.userId);
                    router.replace(`/tournaments/${tournamentId}` as any);
                } catch (err) {
                    appAlert(msg(err));
                }
            });
    };

    const saveJersey = async (n: number | null) => {
        if (!jerseyFor) return;
        try {
            await roster.updateMember(team.id, jerseyFor.userId, { jerseyNumber: n });
            setJerseyFor(null);
            await refetch();
        } catch (err) {
            setJerseyError(msg(err));
        }
    };

    const link = joinLink(tournamentId, code);
    const shareText = t('tournaments.team.code.shareText', { title: tournament.title, team: team.name, link });
    const withdraw = () => {
        const hasSchedule = tournament.counts.matchesTotal > 0;
        confirm(
            t('tournaments.team.withdraw'),
            t(hasSchedule ? 'tournaments.team.withdrawConfirmAfter' : 'tournaments.team.withdrawConfirmBefore', { team: team.name }),
            t('tournaments.team.withdrawAction'),
            async () => {
                try {
                    await teams.withdrawTeam(team.id);
                    await refetch();
                } catch (err) {
                    appAlert(msg(err));
                }
            }
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50 dark:bg-cyber-bg" edges={['bottom']}>
            <Stack.Screen options={{ title: team.name }} />
            <UpdatedCue visible={updated} />
            <TeamPageView
                team={team}
                tournamentTitle={tournament.title}
                limits={{ min: tournament.minPlayersPerTeam, max: tournament.maxPlayersPerTeam, starters: tournament.startersPerTeam }}
                viewerId={viewerId}
                canEdit={canEdit}
                isCaptain={isCaptain}
                rosterLocked={rosterLocked}
                lockedDate={lockAt?.toLocaleDateString()}
                busy={busy}
                onMemberAction={onMemberAction}
                onWithdraw={withdraw}
                invite={
                    <InvitePanel
                        query={query}
                        onQueryChange={setQuery}
                        candidates={(query.trim() ? results : friends).filter((c) => c.id !== viewerId)}
                        loading={searching}
                        invitedIds={new Set([...invited, ...(team.members ?? []).filter((m) => m.status === 'INVITED' || m.status === 'ACCEPTED').map((m) => m.userId)])}
                        errors={inviteErrors}
                        pendingId={pendingInvite}
                        onInvite={invite}
                    />
                }
                joinCode={
                    code ? (
                        <JoinCodeBox
                            code={code}
                            closed={!registrationOpen}
                            pending={teams.pending}
                            onCopy={() => void Share.share({ message: link })}
                            onShare={() => void Share.share({ message: shareText })}
                            onRotate={() =>
                                confirm(t('tournaments.team.code.rotate'), t('tournaments.team.code.rotateConfirm'), t('tournaments.team.code.rotate'), async () => {
                                    try {
                                        const res = await teams.rotateJoinCode(team.id);
                                        setCodeOverride(res.joinCode);
                                    } catch (err) {
                                        appAlert(msg(err));
                                    }
                                }, false)
                            }
                        />
                    ) : null
                }
            />
            <JerseyDialog
                visible={!!jerseyFor}
                name={jerseyFor?.name ?? ''}
                initial={jerseyFor?.jerseyNumber}
                error={jerseyError}
                onCancel={() => setJerseyFor(null)}
                onSave={saveJersey}
            />
        </SafeAreaView>
    );
}
