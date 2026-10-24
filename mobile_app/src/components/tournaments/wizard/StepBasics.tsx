import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { SPORT_THEME } from '@joinup/shared/sports';
import type { TournamentSport } from '@/types/tournament';
import { Card, FieldError, SwitchRow, TextField } from './WizardControls';
import type { WizardErrors, WizardState } from './wizardModel';

interface Props {
    state: WizardState;
    errors: WizardErrors;
    onChange: (patch: Partial<WizardState>) => void;
    /** Opens the existing field picker; the container supplies it. */
    onPickField: () => void;
    /** Sport and structure cannot change once a schedule exists. */
    sportLocked?: boolean;
}

const SPORTS: { key: TournamentSport; emoji: string; label: string }[] = [
    { key: 'SOCCER', emoji: '⚽', label: 'sports.soccer' },
    { key: 'BASKETBALL', emoji: '🏀', label: 'sports.basketball' },
    { key: 'TENNIS', emoji: '🎾', label: 'sports.tennis' },
];

function DateButton({
    label,
    value,
    onChange,
    testID,
    optional,
    onClear,
}: {
    label: string;
    value: Date | null;
    onChange: (d: Date) => void;
    testID: string;
    optional?: boolean;
    onClear?: () => void;
}) {
    const [mode, setMode] = useState<'date' | 'time' | null>(null);
    const current = value ?? new Date();
    return (
        <View className="mb-3">
            <Text className="text-sm font-semibold text-gray-700 dark:text-cyber-text mb-1">{label}</Text>
            <View className="flex-row" style={{ gap: 8 }}>
                <TouchableOpacity
                    testID={`${testID}-date`}
                    accessibilityRole="button"
                    onPress={() => setMode('date')}
                    className="flex-1 h-12 rounded-xl bg-gray-50 dark:bg-cyber-bg border border-gray-200 dark:border-cyber-border items-center justify-center"
                >
                    <Text className="text-gray-900 dark:text-cyber-text">{value ? value.toLocaleDateString() : '—'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    testID={`${testID}-time`}
                    accessibilityRole="button"
                    onPress={() => setMode('time')}
                    className="w-28 h-12 rounded-xl bg-gray-50 dark:bg-cyber-bg border border-gray-200 dark:border-cyber-border items-center justify-center"
                >
                    <Text className="text-gray-900 dark:text-cyber-text">
                        {value ? value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </Text>
                </TouchableOpacity>
                {optional && value && onClear ? (
                    <TouchableOpacity
                        testID={`${testID}-clear`}
                        accessibilityRole="button"
                        accessibilityLabel="clear"
                        onPress={onClear}
                        className="w-12 h-12 items-center justify-center"
                    >
                        <Text className="text-gray-500 text-lg">✕</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
            {mode ? (
                <DateTimePicker
                    value={current}
                    mode={mode}
                    display="default"
                    onChange={(_e, d) => {
                        setMode(null);
                        if (!d) return;
                        const next = new Date(current);
                        if (mode === 'date') next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                        else next.setHours(d.getHours(), d.getMinutes(), 0, 0);
                        onChange(next);
                    }}
                />
            ) : null}
        </View>
    );
}

export { DateButton };

/** Step 1 (spec 3.2). Cover image is not offered: the tournament API has no upload endpoint yet. */
export default function StepBasics({ state, errors, onChange, onPickField, sportLocked }: Props) {
    const { t } = useTranslation();
    return (
        <View testID="wizard-step-1">
            <Card>
                <TextField
                    testID="wizard-title"
                    label={t('tournaments.wizard.title')}
                    value={state.title}
                    maxLength={80}
                    onChangeText={(title) => onChange({ title })}
                    invalid={!!errors.title}
                />
                <FieldError testID="wizard-error-title" message={errors.title ? t(errors.title.key) : undefined} />
            </Card>

            <Card title={t('tournaments.wizard.sport')}>
                <View className="flex-row" style={{ gap: 8 }}>
                    {SPORTS.map((s) => {
                        const on = state.sport === s.key;
                        const theme = SPORT_THEME[s.key];
                        return (
                            <TouchableOpacity
                                key={s.key}
                                testID={`wizard-sport-${s.key}`}
                                disabled={sportLocked}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on, disabled: sportLocked }}
                                accessibilityLabel={t(s.label)}
                                onPress={() => onChange({ sport: s.key })}
                                className={`flex-1 h-[72px] rounded-2xl items-center justify-center border-2 ${sportLocked ? 'opacity-50' : ''}`}
                                style={{ backgroundColor: on ? theme.tint : undefined, borderColor: on ? theme.base : '#e5e7eb' }}
                            >
                                <Text className="text-2xl">{s.emoji}</Text>
                                <Text className={`text-xs mt-1 font-semibold ${on ? 'text-gray-900' : 'text-gray-600 dark:text-cyber-muted'}`}>
                                    {t(s.label)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </Card>

            <Card>
                <TextField
                    testID="wizard-description"
                    label={t('tournaments.wizard.description')}
                    value={state.description}
                    maxLength={2000}
                    multiline
                    onChangeText={(description) => onChange({ description })}
                />
            </Card>

            <Card>
                <DateButton
                    testID="wizard-starts"
                    label={t('tournaments.wizard.startsAt')}
                    value={state.startsAt}
                    onChange={(startsAt) => onChange({ startsAt })}
                />
                <DateButton
                    testID="wizard-ends"
                    label={t('tournaments.wizard.endsAt')}
                    value={state.endsAt}
                    optional
                    onClear={() => onChange({ endsAt: null })}
                    onChange={(endsAt) => onChange({ endsAt })}
                />
                <FieldError testID="wizard-error-endsAt" message={errors.endsAt ? t(errors.endsAt.key) : undefined} />
            </Card>

            <Card title={t('tournaments.wizard.venue')}>
                <TouchableOpacity
                    testID="wizard-venue-pick"
                    accessibilityRole="button"
                    onPress={onPickField}
                    className="h-12 rounded-xl bg-gray-50 dark:bg-cyber-bg border border-gray-200 dark:border-cyber-border px-3 justify-center mb-3"
                >
                    <Text className="text-gray-900 dark:text-cyber-text" numberOfLines={1}>
                        {state.fieldName || t('tournaments.wizard.pickField')}
                    </Text>
                </TouchableOpacity>
                {state.fieldId ? null : (
                    <TextField
                        testID="wizard-custom-location"
                        label={t('tournaments.wizard.otherLocation')}
                        value={state.customLocation}
                        onChangeText={(customLocation) => onChange({ customLocation })}
                    />
                )}
            </Card>

            <Card>
                <SwitchRow
                    testID="wizard-public"
                    label={t('tournaments.wizard.public')}
                    hint={t('tournaments.wizard.publicHint')}
                    value={state.isPublic}
                    onChange={(isPublic) => onChange({ isPublic })}
                />
                <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-3">{t('tournaments.wizard.adultsOnly')}</Text>
            </Card>
        </View>
    );
}
