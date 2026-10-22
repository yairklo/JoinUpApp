import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TournamentFormat } from '@/types/tournament';
import { Card, NumberStepper, Segmented, SwitchRow } from './WizardControls';
import { ALL_TIEBREAKS, matchCountPreview, type WizardState } from './wizardModel';

interface Props {
    state: WizardState;
    onChange: (patch: Partial<WizardState>) => void;
    /** Structure is locked after the schedule exists. */
    locked?: boolean;
}

const FORMATS: { key: TournamentFormat; icon: React.ComponentProps<typeof Ionicons>['name']; name: string }[] = [
    { key: 'LEAGUE', icon: 'list-outline', name: 'tournaments.format.LEAGUE' },
    { key: 'KNOCKOUT', icon: 'git-network-outline', name: 'tournaments.format.KNOCKOUT' },
    { key: 'GROUPS_KNOCKOUT', icon: 'grid-outline', name: 'tournaments.format.GROUPS_KNOCKOUT' },
    { key: 'CUSTOM', icon: 'construct-outline', name: 'tournaments.format.CUSTOM' },
];

/** Step 3 (spec 3.4): format cards, points, tiebreak order (up/down), legs, groups, knockout, timing. */
export default function StepFormat({ state, onChange, locked }: Props) {
    const { t } = useTranslation();
    const [advanced, setAdvanced] = useState(false);
    const hasTable = state.format === 'LEAGUE' || state.format === 'GROUPS_KNOCKOUT';
    const hasBracket = state.format === 'KNOCKOUT' || state.format === 'GROUPS_KNOCKOUT';
    const preview = matchCountPreview(state);
    const tbLabel = (key: string) =>
        state.sport === 'BASKETBALL' && (key === 'GOAL_DIFFERENCE' || key === 'GOALS_FOR')
            ? t(`tournaments.wizard.tbBasketball.${key}`)
            : t(`tournaments.wizard.tb.${key}`);
    const unused = ALL_TIEBREAKS.filter((k) => !state.tiebreak.includes(k));
    const move = (i: number, d: -1 | 1) => {
        const next = [...state.tiebreak];
        const j = i + d;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange({ tiebreak: next });
    };
    const step = (key: keyof WizardState, label: string, min: number, max: number, suffix?: string) => (
        <NumberStepper
            key={String(key)}
            testID={`wizard-${String(key)}`}
            label={label}
            value={state[key] as number}
            min={min}
            max={max}
            suffix={suffix}
            disabled={locked}
            incLabel={`${t('tournaments.wizard.inc', { what: label })}`}
            decLabel={`${t('tournaments.wizard.dec', { what: label })}`}
            onChange={(v) => onChange({ [key]: v } as Partial<WizardState>)}
        />
    );
    const mins = t('tournaments.wizard.minutesSuffix');

    return (
        <View testID="wizard-step-3">
            {locked ? (
                <View className="flex-row items-center mb-3" testID="wizard-locked-note">
                    <Ionicons name="lock-closed-outline" size={14} color="#6b7280" />
                    <Text className="text-xs text-gray-500 dark:text-cyber-muted ms-1">{t('tournaments.wizard.lockedAfterSchedule')}</Text>
                </View>
            ) : null}
            <Card title={t('tournaments.wizard.format')}>
                {FORMATS.map((f) => {
                    const on = state.format === f.key;
                    return (
                        <TouchableOpacity
                            key={f.key}
                            testID={`wizard-format-${f.key}`}
                            disabled={locked}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on, disabled: locked }}
                            onPress={() => onChange({ format: f.key })}
                            className={`flex-row items-center rounded-2xl p-3 mb-2 border-2 ${
                                on ? 'border-brand bg-brand-mist dark:bg-brand-ink' : 'border-gray-200 dark:border-cyber-border'
                            } ${locked ? 'opacity-50' : ''}`}
                        >
                            <Ionicons name={f.icon} size={24} color={on ? '#059669' : '#6b7280'} />
                            <View className="ms-3 flex-1">
                                <Text className="text-[15px] font-bold text-gray-900 dark:text-cyber-text">{t(f.name)}</Text>
                                <Text className="text-xs text-gray-600 dark:text-cyber-muted">{t(`tournaments.wizard.formatHint.${f.key}`)}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
                {preview ? (
                    <Text testID="wizard-match-count" className="text-xs text-gray-600 dark:text-cyber-muted mt-1">
                        {t('tournaments.wizard.matchCount', { teams: state.maxTeams, count: preview.count })}
                        {preview.extra != null ? ` + ${preview.extra}` : ''}
                    </Text>
                ) : null}
            </Card>

            {hasTable ? (
                <>
                    <Card title={t('tournaments.wizard.points')}>
                        {step('pointsWin', t('tournaments.wizard.win'), -10, 10)}
                        {step('pointsDraw', t('tournaments.wizard.draw'), -10, 10)}
                        {step('pointsLoss', t('tournaments.wizard.loss'), -10, 10)}
                    </Card>
                    <Card title={t('tournaments.wizard.tiebreak')}>
                        {state.tiebreak.map((k, i) => (
                            <View key={k} testID={`wizard-tiebreak-${k}`} className="flex-row items-center py-1">
                                <Text className="w-6 text-sm text-gray-500" style={{ fontVariant: ['tabular-nums'] }}>
                                    {i + 1}
                                </Text>
                                <Text className="flex-1 text-sm text-gray-900 dark:text-cyber-text">{tbLabel(k)}</Text>
                                <TouchableOpacity
                                    testID={`wizard-tiebreak-${k}-up`}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('tournaments.wizard.moveUp')}
                                    disabled={i === 0}
                                    onPress={() => move(i, -1)}
                                    className={`w-11 h-11 items-center justify-center ${i === 0 ? 'opacity-30' : ''}`}
                                >
                                    <Ionicons name="chevron-up" size={20} color="#6b7280" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    testID={`wizard-tiebreak-${k}-down`}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('tournaments.wizard.moveDown')}
                                    disabled={i === state.tiebreak.length - 1}
                                    onPress={() => move(i, 1)}
                                    className={`w-11 h-11 items-center justify-center ${i === state.tiebreak.length - 1 ? 'opacity-30' : ''}`}
                                >
                                    <Ionicons name="chevron-down" size={20} color="#6b7280" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    testID={`wizard-tiebreak-${k}-remove`}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('tournaments.wizard.removeTiebreak')}
                                    disabled={state.tiebreak.length <= 1}
                                    onPress={() => onChange({ tiebreak: state.tiebreak.filter((x) => x !== k) })}
                                    className="w-11 h-11 items-center justify-center"
                                >
                                    <Ionicons name="close" size={18} color="#9ca3af" />
                                </TouchableOpacity>
                            </View>
                        ))}
                        {unused.length ? <View className="h-px bg-gray-200 dark:bg-cyber-border my-2" /> : null}
                        {unused.map((k) => (
                            <TouchableOpacity
                                key={k}
                                testID={`wizard-tiebreak-add-${k}`}
                                accessibilityRole="button"
                                onPress={() => onChange({ tiebreak: [...state.tiebreak, k] })}
                                className="flex-row items-center min-h-[44px]"
                            >
                                <Ionicons name="add-circle-outline" size={20} color="#059669" />
                                <Text className="ms-2 text-sm text-gray-700 dark:text-cyber-text">{tbLabel(k)}</Text>
                            </TouchableOpacity>
                        ))}
                    </Card>
                    <Card title={t('tournaments.wizard.legs')}>
                        <Segmented
                            value={state.legs}
                            disabled={locked}
                            onChange={(legs) => onChange({ legs })}
                            options={[
                                { value: 1, label: t('tournaments.wizard.legs1'), testID: 'wizard-legs-1' },
                                { value: 2, label: t('tournaments.wizard.legs2'), testID: 'wizard-legs-2' },
                            ]}
                        />
                    </Card>
                </>
            ) : null}

            {state.format === 'GROUPS_KNOCKOUT' ? (
                <Card>
                    {step('groupCount', t('tournaments.wizard.groupCount'), 1, 16)}
                    {step('advancePerGroup', t('tournaments.wizard.advancePerGroup'), 1, 16)}
                    <Text className="text-xs text-gray-600 dark:text-cyber-muted mt-1">
                        {t('tournaments.wizard.advanceTotal', { count: state.groupCount * state.advancePerGroup })}
                    </Text>
                </Card>
            ) : null}

            {hasBracket ? (
                <Card>
                    <SwitchRow
                        testID="wizard-third-place"
                        label={t('tournaments.wizard.thirdPlace')}
                        value={state.thirdPlace}
                        onChange={(thirdPlace) => onChange({ thirdPlace })}
                    />
                    <Text className="text-sm font-semibold text-gray-700 dark:text-cyber-text mt-3 mb-1">{t('tournaments.wizard.seeding')}</Text>
                    <Segmented
                        value={state.seeding}
                        onChange={(seeding) => onChange({ seeding })}
                        options={[
                            { value: 'MANUAL', label: t('tournaments.wizard.seedingManual'), testID: 'wizard-seeding-MANUAL' },
                            { value: 'RANDOM', label: t('tournaments.wizard.seedingRandom'), testID: 'wizard-seeding-RANDOM' },
                        ]}
                    />
                </Card>
            ) : null}

            {state.sport === 'TENNIS' ? (
                <Card>
                    <Segmented
                        value={state.bestOf}
                        onChange={(bestOf) => onChange({ bestOf })}
                        options={[
                            { value: 3, label: t('tournaments.wizard.bestOf3'), testID: 'wizard-bestof-3' },
                            { value: 5, label: t('tournaments.wizard.bestOf5'), testID: 'wizard-bestof-5' },
                        ]}
                    />
                </Card>
            ) : null}

            <Card>
                {step('matchMinutes', t('tournaments.wizard.matchMinutes'), 1, 300, mins)}
                {step('breakMinutes', t('tournaments.wizard.breakMinutes'), 0, 120, mins)}
                {step('minRestMinutes', t('tournaments.wizard.minRest'), 0, 600, mins)}
            </Card>

            <Card>
                <TouchableOpacity
                    testID="wizard-advanced-toggle"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: advanced }}
                    onPress={() => setAdvanced((v) => !v)}
                    className="flex-row items-center justify-between min-h-[44px]"
                >
                    <Text className="text-sm font-bold text-gray-900 dark:text-cyber-text">{t('tournaments.wizard.advanced')}</Text>
                    <Ionicons name={advanced ? 'chevron-up' : 'chevron-down'} size={18} color="#6b7280" />
                </TouchableOpacity>
                {advanced ? (
                    <View>
                        <Text className="text-sm text-gray-700 dark:text-cyber-text mt-1">{t('tournaments.wizard.forfeitScore')}</Text>
                        {step('forfeitWinner', t('tournaments.wizard.win'), 0, 99)}
                        {step('forfeitLoser', t('tournaments.wizard.loss'), 0, 99)}
                    </View>
                ) : null}
            </Card>
        </View>
    );
}
