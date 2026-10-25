import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MAX_TEAM_SCORE } from '@joinup/shared/matchStats';
import {
    appendEveningRound,
    eveningFormErrors,
    removeEveningRound,
    rosterFromTeams,
    setEveningLineupMode,
    summarizeEvening,
    toEveningResultBody,
    type EveningForm,
    type ResultLineupMode,
} from '@joinup/shared/eveningSummary';
import EveningSummaryLines from '@/components/results/EveningSummaryLines';
import ResultStepper from '@/components/results/ResultStepper';
import type { GameResultRosterEntry } from '@/types/results';
import type { Team } from '@/types/game';

interface Props {
    form: EveningForm;
    teams: Team[];
    roster: GameResultRosterEntry[];
    sport: string;
    disabled?: boolean;
    showErrors?: boolean;
    onChange: (next: EveningForm) => void;
}

export default function EveningRoundsEditor({ form, teams, roster, sport, disabled, showErrors, onChange }: Props) {
    const { t, i18n } = useTranslation();
    const lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const [open, setOpen] = useState<number | null>(0);
    const max = (MAX_TEAM_SCORE as Record<string, number>)[sport] ?? 99;
    const errors = showErrors ? eveningFormErrors(form) : [];
    const people = rosterFromTeams(roster, teams);
    const summary = summarizeEvening({
        lineupMode: form.lineupMode,
        rounds: toEveningResultBody(form).rounds,
        roster: people,
    });
    const nameOf = (id: string) => roster.find((p) => p.userId === id)?.name || t('results.evening.player');

    const patchSide = (ri: number, si: number, patch: Partial<EveningForm['rounds'][number]['sides'][number]>) => {
        onChange({
            ...form,
            rounds: form.rounds.map((round, i) =>
                i !== ri ? round : { sides: round.sides.map((side, j) => (j === si ? { ...side, ...patch } : side)) },
            ),
        });
    };

    const togglePlayer = (ri: number, si: number, userId: string) => {
        const mine = new Set(form.rounds[ri].sides[si].playerIds);
        if (mine.has(userId)) mine.delete(userId);
        else mine.add(userId);
        onChange({
            ...form,
            rounds: form.rounds.map((item, i) => {
                if (i !== ri) return item;
                return {
                    sides: item.sides.map((side, j) => {
                        if (j === si) return { ...side, playerIds: [...mine] };
                        return { ...side, playerIds: side.playerIds.filter((id) => id !== userId) };
                    }),
                };
            }),
        });
    };

    return (
        <View testID="evening-rounds">
            <Text className="text-gray-500 dark:text-cyber-muted mb-3">{t('results.evening.intro')}</Text>
            <View className="flex-row mb-2" style={{ gap: 8 }}>
                {(['FIXED_TEAMS', 'ROTATING_LINEUPS'] as ResultLineupMode[]).map((mode) => {
                    const selected = form.lineupMode === mode;
                    return (
                        <TouchableOpacity
                            key={mode}
                            disabled={disabled}
                            onPress={() => onChange(setEveningLineupMode(form, mode, teams, people))}
                            accessibilityRole="button"
                            className={`flex-1 min-h-[44px] rounded-2xl items-center justify-center px-2 ${selected ? 'bg-brand' : 'bg-gray-100 dark:bg-cyber-border'}`}
                        >
                            <Text className={`font-bold text-center ${selected ? 'text-white' : 'text-gray-800 dark:text-cyber-text'}`}>
                                {t(mode === 'FIXED_TEAMS' ? 'results.evening.fixed' : 'results.evening.rotating')}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            <Text className="text-xs text-gray-500 dark:text-cyber-muted mb-3">
                {form.lineupMode === 'FIXED_TEAMS' ? t('results.evening.fixedHint') : t('results.evening.rotatingHint')}
            </Text>

            {form.rounds.map((round, ri) => {
                const roundErrors = errors.filter((e) => e.index === ri).map((e) => e.code);
                return (
                    <View key={ri} testID={`evening-round-${ri}`} className="mb-3 rounded-2xl border border-gray-200 dark:border-cyber-border p-3">
                        <View className="flex-row items-center justify-between mb-2">
                            <Text className="font-bold text-gray-900 dark:text-cyber-text">{t('results.evening.round', { n: ri + 1 })}</Text>
                            {form.rounds.length > 1 ? (
                                <TouchableOpacity
                                    accessibilityRole="button"
                                    accessibilityLabel={t('results.evening.removeRound', { n: ri + 1 })}
                                    disabled={disabled}
                                    onPress={() => onChange(removeEveningRound(form, ri))}
                                    className="w-11 h-11 items-center justify-center"
                                >
                                    <Ionicons name="close" size={20} color="#6b7280" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                        {round.sides.map((side, si) => {
                            const list = form.lineupMode === 'FIXED_TEAMS' && side.teamId
                                ? roster.filter((p) => people.find((r) => r.userId === p.userId)?.teamId === side.teamId)
                                : roster;
                            return (
                                <View key={si} className="mb-3">
                                    {form.lineupMode === 'FIXED_TEAMS' && teams.length >= 2 ? (
                                        <View className="flex-row flex-wrap mb-2" style={{ gap: 8 }}>
                                            {teams.map((team) => {
                                                const taken = round.sides[si === 0 ? 1 : 0].teamId === team.id;
                                                const selected = side.teamId === team.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={team.id}
                                                        disabled={disabled || taken}
                                                        onPress={() => patchSide(ri, si, { teamId: team.id, label: team.name, goals: {} })}
                                                        className={`min-h-[36px] px-3 rounded-full items-center justify-center ${selected ? 'bg-brand' : 'bg-gray-100 dark:bg-cyber-border'}`}
                                                    >
                                                        <Text className={`font-bold ${selected ? 'text-white' : 'text-gray-800 dark:text-cyber-text'}`}>{team.name}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    ) : (
                                        <Text className="font-bold text-gray-900 dark:text-cyber-text mb-1">{side.label}</Text>
                                    )}
                                    <ResultStepper
                                        value={side.score}
                                        max={max}
                                        disabled={disabled}
                                        onChange={(score) => patchSide(ri, si, { score })}
                                        incLabel={t('results.evening.inc', { side: side.label })}
                                        decLabel={t('results.evening.dec', { side: side.label })}
                                        testIDBase={`evening-score-${ri}-${si}`}
                                    />
                                    {open === ri ? (
                                        <View className="flex-row flex-wrap mt-2" style={{ gap: 8 }}>
                                            {list.map((p) => {
                                                const onSide = form.lineupMode !== 'ROTATING_LINEUPS' || side.playerIds.includes(p.userId);
                                                const goals = side.goals[p.userId] || 0;
                                                return (
                                                    <View key={p.userId} className="flex-row items-center">
                                                        <TouchableOpacity
                                                            disabled={disabled}
                                                            onPress={() =>
                                                                form.lineupMode === 'ROTATING_LINEUPS'
                                                                    ? togglePlayer(ri, si, p.userId)
                                                                    : patchSide(ri, si, { goals: { ...side.goals, [p.userId]: Math.min(max, goals + 1) } })
                                                            }
                                                            className={`min-h-[40px] px-3 rounded-full items-center justify-center ${onSide ? 'bg-brand' : 'bg-gray-100 dark:bg-cyber-border'}`}
                                                        >
                                                            <Text className={`font-bold ${onSide ? 'text-white' : 'text-gray-800 dark:text-cyber-text'}`}>
                                                                {p.name}{goals > 0 ? ` · ${goals}` : ''}
                                                            </Text>
                                                        </TouchableOpacity>
                                                        {form.lineupMode === 'ROTATING_LINEUPS' && onSide ? (
                                                            <TouchableOpacity
                                                                accessibilityRole="button"
                                                                accessibilityLabel={t('results.evening.goalFor', { name: p.name })}
                                                                disabled={disabled}
                                                                onPress={() => patchSide(ri, si, { goals: { ...side.goals, [p.userId]: Math.min(max, goals + 1) } })}
                                                                className="w-10 h-10 items-center justify-center"
                                                            >
                                                                <Ionicons name="add" size={18} color="#6b7280" />
                                                            </TouchableOpacity>
                                                        ) : null}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ) : null}
                                </View>
                            );
                        })}
                        <TouchableOpacity onPress={() => setOpen(open === ri ? null : ri)} className="min-h-[44px] justify-center">
                            <Text className="font-bold text-brand-dark dark:text-brand-light">
                                {open === ri ? t('results.evening.hidePlayers') : t('results.evening.players')}
                            </Text>
                        </TouchableOpacity>
                        {roundErrors.length > 0 ? (
                            <Text className="text-red-600 mt-1">
                                {roundErrors.includes('EMPTY_SIDE') ? t('results.evening.errEmpty') : ''}
                                {roundErrors.includes('DUPLICATE_PLAYER') ? t('results.evening.errDup') : ''}
                                {roundErrors.includes('SAME_TEAM') ? t('results.evening.errSame') : ''}
                            </Text>
                        ) : null}
                    </View>
                );
            })}

            <TouchableOpacity
                testID="evening-add-round"
                disabled={disabled || form.rounds.length >= 24}
                onPress={() => onChange(appendEveningRound(form, teams))}
                accessibilityRole="button"
                className="h-12 rounded-2xl border border-brand items-center justify-center mb-3"
            >
                <Text className="font-bold text-brand-dark dark:text-brand-light">{t('results.evening.add')}</Text>
            </TouchableOpacity>

            {summary.teams.length > 0 || summary.players.length > 0 ? (
                <EveningSummaryLines
                    testID="evening-summary-preview"
                    title={t('results.evening.summary')}
                    summary={summary}
                    sport={sport}
                    lang={lang}
                    nameOf={nameOf}
                />
            ) : null}
        </View>
    );
}
