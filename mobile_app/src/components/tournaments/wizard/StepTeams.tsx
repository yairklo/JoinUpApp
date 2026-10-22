import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import RosterMeter from '../RosterMeter';
import { Card, FieldError, NumberStepper } from './WizardControls';
import { knockoutByes, type WizardErrors, type WizardState } from './wizardModel';

interface Props {
    state: WizardState;
    errors: WizardErrors;
    onChange: (patch: Partial<WizardState>) => void;
    /** Limits are locked once a schedule exists (non-organizers cannot override). */
    locked?: boolean;
}

/** Step 2 (spec 3.3): team count, starters, players range (steppers), live RosterMeter preview. */
export default function StepTeams({ state, errors, onChange, locked }: Props) {
    const { t } = useTranslation();
    const err = (k: string) => (errors[k] ? String(t(errors[k]!.key, errors[k]!.params as any)) : undefined);
    const byes = knockoutByes(state.maxTeams);
    const showByes = state.format === 'KNOCKOUT' && byes > 0;
    const inc = (what: string) => t('tournaments.wizard.inc', { what });
    const dec = (what: string) => t('tournaments.wizard.dec', { what });
    const lbl = {
        minTeams: `${t('tournaments.wizard.teamCount')} · ${t('tournaments.wizard.min')}`,
        maxTeams: `${t('tournaments.wizard.teamCount')} · ${t('tournaments.wizard.max')}`,
        minPlayers: `${t('tournaments.wizard.playersPerTeam')} · ${t('tournaments.wizard.min')}`,
        maxPlayers: `${t('tournaments.wizard.playersPerTeam')} · ${t('tournaments.wizard.max')}`,
        starters: t('tournaments.wizard.starters'),
    };
    return (
        <View testID="wizard-step-2">
            <Card title={t('tournaments.wizard.teamCount')}>
                <NumberStepper
                    testID="wizard-min-teams"
                    label={t('tournaments.wizard.min')}
                    value={state.minTeams}
                    min={2}
                    max={64}
                    disabled={locked}
                    incLabel={inc(lbl.minTeams)}
                    decLabel={dec(lbl.minTeams)}
                    onChange={(minTeams) => onChange({ minTeams })}
                />
                <NumberStepper
                    testID="wizard-max-teams"
                    label={t('tournaments.wizard.max')}
                    value={state.maxTeams}
                    min={2}
                    max={64}
                    disabled={locked}
                    incLabel={inc(lbl.maxTeams)}
                    decLabel={dec(lbl.maxTeams)}
                    onChange={(maxTeams) => onChange({ maxTeams })}
                />
                <FieldError testID="wizard-error-teams" message={err('teams')} />
                {showByes ? (
                    <Text className="text-xs text-indigo-700 dark:text-indigo-300 mt-2">
                        {t('tournaments.wizard.info.byes', { n: state.maxTeams, byes })}
                    </Text>
                ) : null}
            </Card>

            <Card title={t('tournaments.wizard.teamSize')}>
                <NumberStepper
                    testID="wizard-starters"
                    label={lbl.starters}
                    value={state.startersPerTeam}
                    min={1}
                    max={30}
                    disabled={locked}
                    incLabel={inc(lbl.starters)}
                    decLabel={dec(lbl.starters)}
                    onChange={(startersPerTeam) => onChange({ startersPerTeam })}
                />
                <FieldError testID="wizard-error-starters" message={err('starters')} />
                <View testID="wizard-players-range" className="mt-2">
                    <Text className="text-sm font-semibold text-gray-700 dark:text-cyber-text mb-1">
                        {t('tournaments.wizard.playersPerTeam')} · {state.minPlayers}–{state.maxPlayers}
                    </Text>
                    <NumberStepper
                        testID="wizard-min-players"
                        label={t('tournaments.wizard.min')}
                        value={state.minPlayers}
                        min={1}
                        max={30}
                        disabled={locked}
                        incLabel={inc(lbl.minPlayers)}
                        decLabel={dec(lbl.minPlayers)}
                        onChange={(minPlayers) => onChange({ minPlayers })}
                    />
                    <NumberStepper
                        testID="wizard-max-players"
                        label={t('tournaments.wizard.max')}
                        value={state.maxPlayers}
                        min={1}
                        max={30}
                        disabled={locked}
                        incLabel={inc(lbl.maxPlayers)}
                        decLabel={dec(lbl.maxPlayers)}
                        onChange={(maxPlayers) => onChange({ maxPlayers })}
                    />
                    <FieldError testID="wizard-error-players" message={err('players')} />
                </View>
            </Card>

            <Card>
                <RosterMeter
                    accepted={state.startersPerTeam}
                    min={state.minPlayers}
                    max={Math.max(state.maxPlayers, 1)}
                    starters={state.startersPerTeam}
                    testID="wizard-roster-preview"
                />
                <Text className="text-xs text-gray-600 dark:text-cyber-muted mt-3">
                    {t('tournaments.wizard.rosterSentence', {
                        min: state.minPlayers,
                        max: state.maxPlayers,
                        starters: state.startersPerTeam,
                    })}
                </Text>
            </Card>
        </View>
    );
}
