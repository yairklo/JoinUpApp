import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { fieldsApi } from '@/services/api';
import { tournamentsApi } from '@/services/api/tournaments';
import { useTournament } from '@/hooks/useTournament';
import { useTournamentAdminMutations } from '@/hooks/useTournamentMutations';
import { useTournamentCapabilities } from '@/hooks/useTournaments';
import { tournamentErrorKey, tournamentErrorParams } from '@/utils/tournamentErrors';
import TournamentWizard from './TournamentWizard';
import { defaultWizardState, wizardFromTournament, wizardToInput, wizardToPatch, type WizardState } from './wizardModel';

/** Hide-don't-disable surface for people who may not create / manage (spec 0.8). */
function NoAccess({ onBack }: { onBack: () => void }) {
    const { t } = useTranslation();
    return (
        <SafeAreaView className="flex-1 items-center justify-center bg-gray-50 dark:bg-cyber-bg px-8" testID="wizard-no-access">
            <Text className="text-center text-gray-700 dark:text-cyber-text mb-4">{t('tournaments.wizard.noAccess')}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={onBack} className="h-11 px-6 rounded-xl bg-brand items-center justify-center">
                <Text className="text-white font-bold">{t('tournaments.wizard.back')}</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}

function Centered({ children, testID }: { children: React.ReactNode; testID: string }) {
    return (
        <SafeAreaView testID={testID} className="flex-1 items-center justify-center bg-gray-50 dark:bg-cyber-bg px-8">
            {children}
        </SafeAreaView>
    );
}

/**
 * Container for `/tournaments/new` and `/tournaments/[id]/edit`: loads capability / tournament,
 * maps the wizard callbacks onto create / update / setStatus and server errors onto the top alert.
 */
export default function TournamentWizardScreen({ tournamentId }: { tournamentId?: string }) {
    const { t } = useTranslation();
    const router = useRouter();
    const { getToken } = useAuth();
    const editing = !!tournamentId;
    const caps = useTournamentCapabilities();
    const detail = useTournament(tournamentId);
    const api = useTournamentAdminMutations(tournamentId);
    const [error, setError] = useState<string | null>(null);
    const [fieldName, setFieldName] = useState('');

    const tournament = detail.tournament;
    useEffect(() => {
        if (!tournament?.fieldId) return;
        let off = false;
        fieldsApi
            .getById(tournament.fieldId)
            .then((f) => !off && setFieldName(f.name))
            .catch(() => {});
        return () => {
            off = true;
        };
    }, [tournament?.fieldId]);

    const initial = useMemo<WizardState>(() => {
        if (!tournament) return defaultWizardState();
        return { ...wizardFromTournament(tournament), fieldName };
    }, [tournament?.id, fieldName]); // eslint-disable-line react-hooks/exhaustive-deps

    const goTournament = (id: string) => router.replace(`/tournaments/${id}` as any);
    const goBack = () => (router.canGoBack() ? router.back() : router.replace('/' as any));

    const fail = (err: any) => {
        const key = tournamentErrorKey(err);
        setError(String(key ? t(key, tournamentErrorParams(err) as any) : err?.status === 400 ? t('tournaments.wizard.serverInvalid') : t('common.error')));
    };

    if (editing ? detail.loading : caps.loading) {
        return (
            <Centered testID="wizard-loading">
                <ActivityIndicator color="#059669" />
            </Centered>
        );
    }
    if (editing && (detail.notFound || detail.error)) {
        return (
            <Centered testID="wizard-error">
                <Text className="text-center text-gray-700 dark:text-cyber-text mb-4">{t('common.error')}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={detail.refetch} className="h-11 px-6 rounded-xl bg-brand items-center justify-center">
                    <Text className="text-white font-bold">{t('common.retry')}</Text>
                </TouchableOpacity>
            </Centered>
        );
    }
    if (editing ? !tournament?.capabilities.canManage : !caps.canCreate) return <NoAccess onBack={goBack} />;

    const isOrganizer = tournament?.myRole === 'ORGANIZER';
    const hasSchedule = (tournament?.counts.matchesTotal ?? 0) > 0;
    const mode = !editing ? 'create' : tournament?.status === 'DRAFT' ? 'edit-draft' : 'edit-published';

    const saveDraft = async (s: WizardState) => {
        setError(null);
        try {
            if (editing) await api.update(wizardToPatch(s));
            else {
                const created = await api.create(wizardToInput(s));
                Alert.alert(t('tournaments.wizard.draftSaved'));
                return goTournament(created.id);
            }
            Alert.alert(t('tournaments.wizard.draftSaved'));
        } catch (err) {
            fail(err);
        }
    };

    const publish = async (s: WizardState) => {
        setError(null);
        try {
            let id = tournamentId;
            if (editing) await api.update(wizardToPatch(s));
            else id = (await api.create(wizardToInput(s))).id;
            // A just-created tournament has no bound hook yet, so open registration with the client directly.
            const token = await getToken();
            await tournamentsApi.setStatus(id as string, { status: 'REGISTRATION_OPEN' }, token as string);
            goTournament(id as string);
        } catch (err) {
            fail(err);
        }
    };

    const savePublished = (s: WizardState) => {
        const run = async (force: boolean) => {
            setError(null);
            try {
                await api.update(wizardToPatch(s, force));
                goTournament(tournamentId as string);
            } catch (err) {
                fail(err);
            }
        };
        if (isOrganizer && hasSchedule) {
            Alert.alert(t('tournaments.wizard.changeAnyway'), t('tournaments.wizard.changeAnywayWarn'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('tournaments.wizard.changeAnyway'), style: 'destructive', onPress: () => void run(true) },
            ]);
        } else void run(false);
    };

    return (
        <TournamentWizard
            initial={initial}
            mode={mode}
            structureLocked={hasSchedule && !isOrganizer}
            pending={api.pending}
            serverError={error}
            onSaveDraft={saveDraft}
            onPublish={publish}
            onSavePublished={savePublished}
            onClose={goBack}
        />
    );
}
