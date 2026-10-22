import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTournamentAdminMutations } from '@/hooks/useTournamentMutations';
import { startProblems, tournamentErrorKey, tournamentErrorParams } from '@/utils/tournamentErrors';
import type { TournamentDetail, TournamentStatus } from '@/types/tournament';
import StatusConfirmDialog, { type StartProblem } from './StatusConfirmDialog';

const FLOW: TournamentStatus[] = ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED'];
const NAME_KEY: Record<TournamentStatus, string> = {
    DRAFT: 'tournaments.status.DRAFT',
    REGISTRATION_OPEN: 'tournaments.status.REGISTRATION_OPEN',
    REGISTRATION_CLOSED: 'tournaments.status.REGISTRATION_CLOSED',
    IN_PROGRESS: 'tournaments.status.IN_PROGRESS',
    COMPLETED: 'tournaments.status.COMPLETED',
    CANCELLED: 'tournaments.status.CANCELLED',
};

interface Transition {
    to: TournamentStatus;
    label: string;
    confirm: string;
}

interface Props {
    tournament: TournamentDetail;
    onChanged: () => void;
    /** Open the schedule section (NO_SCHEDULE problem). */
    onGoSchedule: () => void;
    /** Open the teams section (roster problems). */
    onGoTeams: () => void;
}

/** Status timeline + next-transition buttons with confirms (spec 11.3), CANNOT_START checklist, organizer force. */
export default function StatusControls({ tournament, onChanged, onGoSchedule, onGoTeams }: Props) {
    const { t } = useTranslation();
    const mut = useTournamentAdminMutations(tournament.id);
    const status = tournament.status;
    const isOrganizer = tournament.myRole === 'ORGANIZER';
    const final = status === 'COMPLETED' || status === 'CANCELLED';

    const [pending, setPending] = useState<Transition | null>(null);
    const [problems, setProblems] = useState<StartProblem[]>([]);
    const [errorText, setErrorText] = useState<string | null>(null);

    const next: Transition[] = [];
    if (status === 'DRAFT') next.push({ to: 'REGISTRATION_OPEN', label: t('tournaments.manage.status.publish') as string, confirm: t('tournaments.manage.status.publishConfirm') as string });
    if (status === 'REGISTRATION_OPEN') next.push({ to: 'REGISTRATION_CLOSED', label: t('tournaments.manage.status.close') as string, confirm: t('tournaments.manage.status.closeConfirm') as string });
    if (status === 'REGISTRATION_CLOSED') {
        if (tournament.counts.matchesTotal === 0) {
            const until = tournament.registrationClosesAt ? new Date(String(tournament.registrationClosesAt)).toLocaleDateString() : '';
            next.push({
                to: 'REGISTRATION_OPEN',
                label: t('tournaments.manage.status.reopen') as string,
                confirm: (until ? t('tournaments.manage.status.reopenConfirm', { date: until }) : t('tournaments.manage.status.reopenConfirmNoDate')) as string,
            });
        }
        next.push({ to: 'IN_PROGRESS', label: t('tournaments.manage.status.start') as string, confirm: t('tournaments.manage.status.startConfirm') as string });
    }
    if (status === 'IN_PROGRESS') next.push({ to: 'COMPLETED', label: t('tournaments.manage.status.complete') as string, confirm: t('tournaments.manage.status.completeConfirm') as string });

    const cancelT: Transition = { to: 'CANCELLED', label: t('tournaments.manage.status.cancel') as string, confirm: t('tournaments.manage.status.cancelConfirm') as string };

    const open = (tr: Transition) => {
        setPending(tr);
        setProblems([]);
        setErrorText(null);
    };
    const close = () => {
        if (mut.pending) return;
        setPending(null);
        setProblems([]);
        setErrorText(null);
    };

    const apply = async (force?: boolean) => {
        if (!pending) return;
        setErrorText(null);
        try {
            await mut.setStatus(pending.to, force);
            setPending(null);
            setProblems([]);
            onChanged();
        } catch (err: any) {
            const p = startProblems(err);
            if (p.length) {
                setProblems(p as StartProblem[]);
                return;
            }
            if (!err?.code && !err?.status) setErrorText(t('resultEditor.offline') as string);
            else {
                const key = tournamentErrorKey(err);
                setErrorText(key ? (t(key, tournamentErrorParams(err)) as string) : (t('tournaments.manage.status.failed') as string));
            }
        }
    };

    const idx = FLOW.indexOf(status);
    return (
        <ScrollView testID="manage-section-status" className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {status === 'CANCELLED' ? (
                <View className="rounded-xl border border-red-200 dark:border-red-900 p-3 mb-4">
                    <Text className="font-bold text-red-600 dark:text-red-400">{t(NAME_KEY.CANCELLED)}</Text>
                </View>
            ) : null}
            <View accessibilityRole="list">
                {FLOW.map((s, i) => {
                    const current = s === status;
                    const done = status === 'CANCELLED' ? false : idx > i;
                    const nextForS = next.find((n) => n.to === s && i > idx);
                    return (
                        <View key={s} className="flex-row" accessibilityLabel={`${t(NAME_KEY[s])}${current ? ' ✓' : ''}`}>
                            <View className="items-center" style={{ width: 28 }}>
                                <View
                                    className={`w-5 h-5 rounded-full items-center justify-center ${current ? 'bg-brand' : done ? 'bg-brand-mist dark:bg-brand-ink' : 'border border-gray-300 dark:border-cyber-border'}`}
                                >
                                    {done || current ? <Ionicons name="checkmark" size={12} color={current ? '#fff' : '#059669'} /> : null}
                                </View>
                                {i < FLOW.length - 1 ? <View className="w-0.5 flex-1 bg-gray-200 dark:bg-cyber-border" style={{ minHeight: 24 }} /> : null}
                            </View>
                            <View className="flex-1 ms-2 pb-4">
                                <Text className={`${current ? 'font-extrabold text-gray-900 dark:text-cyber-text' : 'text-gray-500 dark:text-cyber-muted'}`}>{t(NAME_KEY[s])}</Text>
                                {nextForS ? (
                                    <Pressable
                                        testID={`status-action-${s}`}
                                        onPress={() => open(nextForS)}
                                        accessibilityRole="button"
                                        style={{ minHeight: 48 }}
                                        className="mt-2 rounded-2xl bg-brand items-center justify-center px-4"
                                    >
                                        <Text className="font-extrabold text-white">{nextForS.label}</Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        </View>
                    );
                })}
            </View>

            {/* backwards transition (reopen) is not on the forward timeline */}
            {next
                .filter((n) => FLOW.indexOf(n.to) <= idx)
                .map((n) => (
                    <Pressable
                        key={n.to}
                        testID={`status-action-${n.to}-reopen`}
                        onPress={() => open(n)}
                        accessibilityRole="button"
                        style={{ minHeight: 48 }}
                        className="mt-1 rounded-2xl border border-gray-300 dark:border-cyber-border items-center justify-center px-4"
                    >
                        <Text className="font-bold text-gray-800 dark:text-cyber-text">{n.label}</Text>
                    </Pressable>
                ))}

            {!final ? (
                <Pressable
                    testID="status-action-CANCELLED"
                    onPress={() => open(cancelT)}
                    accessibilityRole="button"
                    style={{ minHeight: 48 }}
                    className="mt-8 rounded-2xl border border-red-300 dark:border-red-900 items-center justify-center px-4"
                >
                    <Text className="font-bold text-red-600 dark:text-red-400">{cancelT.label}</Text>
                </Pressable>
            ) : null}

            <StatusConfirmDialog
                open={!!pending}
                title={pending?.label ?? ''}
                body={pending?.confirm ?? ''}
                confirmLabel={pending?.label ?? ''}
                destructive={pending?.to === 'CANCELLED'}
                typeToConfirm={pending?.to === 'CANCELLED' ? tournament.title : undefined}
                problems={problems}
                onForce={isOrganizer ? () => apply(true) : undefined}
                busy={mut.pending}
                errorText={errorText}
                onProblemPress={(p) => {
                    close();
                    if (p.code === 'NO_SCHEDULE') onGoSchedule();
                    else onGoTeams();
                }}
                onConfirm={() => apply()}
                onClose={close}
            />
        </ScrollView>
    );
}
