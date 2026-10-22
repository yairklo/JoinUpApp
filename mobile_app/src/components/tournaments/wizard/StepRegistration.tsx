import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, FieldError, SwitchRow } from './WizardControls';
import { DateButton } from './StepBasics';
import type { WizardErrors, WizardState } from './wizardModel';

interface Props {
    state: WizardState;
    errors: WizardErrors;
    onChange: (patch: Partial<WizardState>) => void;
}

/** Step 4 (spec 3.5): registration window, optional roster lock, manual approval. */
export default function StepRegistration({ state, errors, onChange }: Props) {
    const { t } = useTranslation();
    return (
        <View testID="wizard-step-4">
            <Card>
                <DateButton
                    testID="wizard-reg-opens"
                    label={t('tournaments.wizard.regOpens')}
                    value={state.regOpensAt}
                    onChange={(regOpensAt) => onChange({ regOpensAt })}
                />
                <DateButton
                    testID="wizard-reg-closes"
                    label={t('tournaments.wizard.regCloses')}
                    value={state.regClosesAt}
                    onChange={(regClosesAt) => onChange({ regClosesAt })}
                />
                <FieldError testID="wizard-error-regClosesAt" message={errors.regClosesAt ? t(errors.regClosesAt.key) : undefined} />
                <DateButton
                    testID="wizard-roster-lock"
                    label={t('tournaments.wizard.rosterLock')}
                    value={state.rosterLockAt}
                    optional
                    onClear={() => onChange({ rosterLockAt: null })}
                    onChange={(rosterLockAt) => onChange({ rosterLockAt })}
                />
                <Text className="text-xs text-gray-500 dark:text-cyber-muted -mt-2">{t('tournaments.wizard.rosterLockHint')}</Text>
                <FieldError testID="wizard-error-rosterLockAt" message={errors.rosterLockAt ? t(errors.rosterLockAt.key) : undefined} />
            </Card>
            <Card>
                <SwitchRow
                    testID="wizard-approval"
                    label={t('tournaments.wizard.approval')}
                    hint={t('tournaments.wizard.approvalHint')}
                    value={state.requireApproval}
                    onChange={(requireApproval) => onChange({ requireApproval })}
                />
            </Card>
        </View>
    );
}
