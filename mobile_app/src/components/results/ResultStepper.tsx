import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tabular } from './resultUtils';

interface Props {
    value: number;
    max: number;
    onChange: (next: number) => void;
    /** 56 for score steppers, 44 for stat steppers. */
    size?: 56 | 44;
    valueClassName?: string;
    disabled?: boolean;
    /** Basketball: hold +/- to repeat. */
    repeat?: boolean;
    incLabel: string;
    decLabel: string;
    testIDBase: string;
    editable?: boolean;
}

/** `[–] value [+]`; tapping the value turns it into a number input. */
export default function ResultStepper({
    value,
    max,
    onChange,
    size = 44,
    valueClassName = 'text-[28px]',
    disabled,
    repeat,
    incLabel,
    decLabel,
    testIDBase,
    editable = true,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));
    const valueRef = useRef(value);
    valueRef.current = value;
    const timers = useRef<{ start?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});

    const stop = () => {
        if (timers.current.start) clearTimeout(timers.current.start);
        if (timers.current.tick) clearInterval(timers.current.tick);
        timers.current = {};
    };
    useEffect(() => stop, []);

    const clamp = (n: number) => Math.max(0, Math.min(max, n));
    const step = (d: number) => onChange(clamp(valueRef.current + d));
    const startRepeat = (d: number) => {
        if (!repeat || disabled) return;
        timers.current.start = setTimeout(() => {
            timers.current.tick = setInterval(() => step(d), 80);
        }, 400);
    };

    const btnSize = size === 56 ? 'w-14 h-14' : 'w-11 h-11';
    const btn = (d: 1 | -1) => {
        const off = disabled || (d === 1 ? value >= max : value <= 0);
        return (
            <Pressable
                testID={`${testIDBase}-${d === 1 ? 'inc' : 'dec'}`}
                accessibilityRole="button"
                accessibilityLabel={d === 1 ? incLabel : decLabel}
                accessibilityState={{ disabled: off }}
                disabled={off}
                onPress={() => step(d)}
                onPressIn={() => startRepeat(d)}
                onPressOut={stop}
                className={`${btnSize} rounded-2xl bg-white dark:bg-cyber-card border border-gray-200 dark:border-cyber-border items-center justify-center ${off ? 'opacity-40' : ''}`}
            >
                <Ionicons name={d === 1 ? 'add' : 'remove'} size={24} color="#374151" />
            </Pressable>
        );
    };

    const commit = () => {
        const n = parseInt(draft, 10);
        if (Number.isFinite(n)) onChange(clamp(n));
        setEditing(false);
    };

    return (
        <View className="flex-row items-center justify-between">
            {btn(-1)}
            <View
                style={{ minWidth: 56 }}
                className="items-center justify-center"
                accessible={!editing}
                accessibilityRole="adjustable"
                accessibilityValue={{ now: value, min: 0, max }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
            >
                {editing ? (
                    <TextInput
                        autoFocus
                        value={draft}
                        onChangeText={setDraft}
                        onBlur={commit}
                        onSubmitEditing={commit}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        maxLength={String(max).length}
                        className={`${valueClassName} font-extrabold text-center text-gray-900 dark:text-cyber-text`}
                        style={[tabular, { minWidth: 56 }]}
                    />
                ) : (
                    <TouchableOpacity
                        disabled={disabled || !editable}
                        onPress={() => {
                            setDraft(String(value));
                            setEditing(true);
                        }}
                        testID={testIDBase}
                    >
                        <Text className={`${valueClassName} font-extrabold text-gray-900 dark:text-cyber-text`} style={tabular}>
                            {value}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
            {btn(1)}
        </View>
    );
}
