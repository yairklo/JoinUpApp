import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Card } from './WizardControls';
import { matchCountPreview, WIZARD_STEPS, type WizardState, type WizardStepKey } from './wizardModel';

interface Props {
    state: WizardState;
    /** i18n keys of soft problems (`wizardWarnings`). */
    warnings: string[];
    /** Steps with hard errors (publishing is blocked until they are fixed). */
    invalidSteps: WizardStepKey[];
    onEdit: (step: WizardStepKey) => void;
}

function Row({ k, v }: { k: string; v: string }) {
    return (
        <View className="flex-row justify-between py-0.5">
            <Text className="text-xs text-gray-500 dark:text-cyber-muted">{k}</Text>
            <Text className="text-xs font-semibold text-gray-900 dark:text-cyber-text ms-3 flex-1 text-end" numberOfLines={2}>
                {v}
            </Text>
        </View>
    );
}

/** Step 5 (spec 3.6): summary card per step with "edit", plus the problems list. */
export default function StepReview({ state, warnings, invalidSteps, onEdit }: Props) {
    const { t } = useTranslation();
    const fmt = (d: Date | null) => (d ? `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—');
    const preview = matchCountPreview(state);
    const sections: { step: WizardStepKey; rows: [string, string][] }[] = [
        {
            step: 'basics',
            rows: [
                [t('tournaments.wizard.title'), state.title || '—'],
                [t('tournaments.wizard.sport'), t(`sports.${state.sport.toLowerCase()}`)],
                [t('tournaments.wizard.startsAt'), fmt(state.startsAt)],
                [t('tournaments.wizard.venue'), state.fieldName || state.customLocation || '—'],
            ],
        },
        {
            step: 'teams',
            rows: [
                [t('tournaments.wizard.teamCount'), `${state.minTeams}–${state.maxTeams}`],
                [t('tournaments.wizard.playersPerTeam'), `${state.minPlayers}–${state.maxPlayers}`],
                [t('tournaments.wizard.starters'), String(state.startersPerTeam)],
            ],
        },
        {
            step: 'format',
            rows: [
                [t('tournaments.wizard.format'), t(`tournaments.format.${state.format}`)],
                ...(preview ? [[t('tournaments.wizard.matchCount', { teams: state.maxTeams, count: preview.count }), ''] as [string, string]] : []),
            ],
        },
        {
            step: 'registration',
            rows: [
                [t('tournaments.wizard.regOpens'), fmt(state.regOpensAt)],
                [t('tournaments.wizard.regCloses'), fmt(state.regClosesAt)],
                [t('tournaments.wizard.approval'), state.requireApproval ? '✓' : '—'],
            ],
        },
    ];
    return (
        <View testID="wizard-step-5">
            {warnings.length || invalidSteps.length ? (
                <View
                    testID="wizard-problems"
                    accessibilityRole="alert"
                    className="rounded-2xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 mb-3"
                >
                    {invalidSteps.map((s) => (
                        <Text key={s} className="text-xs text-amber-800 dark:text-amber-200">
                            • {t('tournaments.wizard.warn.fixStep', { step: t(`tournaments.wizard.steps.${s}`) })}
                        </Text>
                    ))}
                    {warnings.map((w) => (
                        <Text key={w} className="text-xs text-amber-800 dark:text-amber-200">
                            • {t(w)}
                        </Text>
                    ))}
                </View>
            ) : null}
            {sections.map((s) => (
                <Card key={s.step} testID={`wizard-summary-${s.step}`}>
                    <View className="flex-row justify-between items-center mb-1">
                        <Text className="text-sm font-bold text-gray-900 dark:text-cyber-text">{t(`tournaments.wizard.steps.${s.step}`)}</Text>
                        <TouchableOpacity
                            testID={`wizard-edit-${s.step}`}
                            accessibilityRole="button"
                            onPress={() => onEdit(s.step)}
                            className="min-h-[44px] px-2 flex-row items-center"
                        >
                            <Ionicons name="create-outline" size={16} color="#059669" />
                            <Text className="text-brand-dark dark:text-brand-light text-xs font-bold ms-1">{t('tournaments.wizard.edit')}</Text>
                        </TouchableOpacity>
                    </View>
                    {s.rows.map(([k, v], i) => (
                        <Row key={i} k={k} v={v} />
                    ))}
                </Card>
            ))}
        </View>
    );
}

export { WIZARD_STEPS };
