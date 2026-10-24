import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tabular } from '@/components/results/resultUtils';
import TeamBadge from '../TeamBadge';

export interface SteppersSide {
    name: string;
    color?: string | null;
    logoUrl?: string | null;
    value: number;
    onChange: (next: number) => void;
}

interface Props {
    home: SteppersSide;
    away: SteppersSide;
    max: number;
    /** Basketball: +2 / +3 chips and long-press repeat. */
    quickPoints?: boolean;
    disabled?: boolean;
    sport: string;
}

interface ColumnProps {
    side: SteppersSide;
    which: 'home' | 'away';
    max: number;
    quickPoints?: boolean;
    disabled?: boolean;
    sport: string;
}

function Column({ side, which, max, quickPoints, disabled, sport }: ColumnProps) {
    const { t } = useTranslation();
    const valueRef = useRef(side.value);
    valueRef.current = side.value;
    const onChangeRef = useRef(side.onChange);
    onChangeRef.current = side.onChange;
    const timers = useRef<{ start?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});
    const stop = () => {
        if (timers.current.start) clearTimeout(timers.current.start);
        if (timers.current.tick) clearInterval(timers.current.tick);
        timers.current = {};
    };
    useEffect(() => stop, []);
    const step = (d: number) => onChangeRef.current(Math.max(0, Math.min(max, valueRef.current + d)));
    const startRepeat = (d: number) => {
        if (!quickPoints || disabled) return;
        timers.current.start = setTimeout(() => {
            timers.current.tick = setInterval(() => step(d), 80);
        }, 400);
    };
    const incKey = sport === 'SOCCER' ? 'tournaments.score.incGoal' : 'tournaments.score.inc';
    const decKey = sport === 'SOCCER' ? 'tournaments.score.decGoal' : 'tournaments.score.dec';
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const commit = () => {
        const n = parseInt(draft, 10);
        if (Number.isFinite(n)) onChangeRef.current(Math.max(0, Math.min(max, n)));
        setEditing(false);
    };
    const btn = (d: 1 | -1) => {
        const off = disabled || (d === 1 ? side.value >= max : side.value <= 0);
        return (
            <Pressable
                testID={`score-${d === 1 ? 'inc' : 'dec'}-${which}`}
                accessibilityRole="button"
                accessibilityLabel={t(d === 1 ? incKey : decKey, { team: side.name }) as string}
                accessibilityState={{ disabled: off }}
                disabled={off}
                onPress={() => step(d)}
                onPressIn={() => startRepeat(d)}
                onPressOut={stop}
                style={{ width: 56, height: 56 }}
                className={`rounded-2xl bg-white dark:bg-cyber-card border border-gray-200 dark:border-cyber-border items-center justify-center ${off ? 'opacity-40' : ''}`}
            >
                <Ionicons name={d === 1 ? 'add' : 'remove'} size={28} color="#374151" />
            </Pressable>
        );
    };
    return (
        <View className="flex-1 items-center" style={{ minWidth: 0 }}>
            <View style={{ minHeight: 40 }} className="justify-center px-1">
                <TeamBadge name={side.name} color={side.color} logoUrl={side.logoUrl} lines={2} />
            </View>
            <View className="my-2">{btn(1)}</View>
            {editing ? (
                <TextInput
                    testID={`score-${which}`}
                    autoFocus
                    value={draft}
                    onChangeText={setDraft}
                    onBlur={commit}
                    onSubmitEditing={commit}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    maxLength={String(max).length}
                    className="text-[40px] font-extrabold text-center text-gray-900 dark:text-cyber-text"
                    style={[tabular, { minWidth: 72, height: 56 }]}
                />
            ) : (
                <Pressable
                    testID={`score-${which}`}
                    disabled={disabled}
                    onPress={() => {
                        setDraft(String(side.value));
                        setEditing(true);
                    }}
                    accessibilityRole="adjustable"
                    accessibilityLabel={side.name}
                    accessibilityValue={{ now: side.value, min: 0, max }}
                    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                    onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
                    style={{ minWidth: 72, height: 56 }}
                    className="items-center justify-center"
                >
                    <Text className="text-[40px] font-extrabold text-gray-900 dark:text-cyber-text" style={tabular}>
                        {side.value}
                    </Text>
                </Pressable>
            )}
            <View className="mt-2">{btn(-1)}</View>
            {quickPoints ? (
                <View className="flex-row mt-3" style={{ gap: 8 }}>
                    {[2, 3].map((n) => (
                        <Pressable
                            key={n}
                            testID={`score-quick-${n}-${which}`}
                            disabled={disabled || side.value >= max}
                            onPress={() => step(n)}
                            accessibilityRole="button"
                            accessibilityLabel={`+${n} ${side.name}`}
                            style={{ height: 36, minWidth: 48 }}
                            className="px-3 rounded-full bg-gray-100 dark:bg-cyber-border items-center justify-center"
                        >
                            <Text className="font-bold text-gray-800 dark:text-cyber-text">+{n}</Text>
                        </Pressable>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

/**
 * Side-by-side vertical steppers (spec 12.2): home column at the start edge, ":" between, + on top.
 * Presentational: values and handlers come from the sheet.
 */
export default function ScoreSteppers({ home, away, max, quickPoints, disabled, sport }: Props) {
    return (
        <View className="flex-row items-start" testID="score-steppers">
            <Column side={home} which="home" max={max} quickPoints={quickPoints} disabled={disabled} sport={sport} />
            <View style={{ paddingTop: 100 }}>
                <Text className="text-[32px] font-extrabold text-gray-400 dark:text-cyber-muted">:</Text>
            </View>
            <Column side={away} which="away" max={max} quickPoints={quickPoints} disabled={disabled} sport={sport} />
        </View>
    );
}
