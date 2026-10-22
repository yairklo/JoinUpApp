import React, { useEffect, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Labeled section card used by every wizard step. */
export function Card({ title, children, testID }: { title?: string; children: React.ReactNode; testID?: string }) {
    return (
        <View testID={testID} className="bg-white dark:bg-cyber-card rounded-2xl p-4 mb-3 border border-gray-100 dark:border-cyber-border">
            {title ? <Text className="text-base font-bold text-gray-900 dark:text-cyber-text mb-3">{title}</Text> : null}
            {children}
        </View>
    );
}

export function FieldError({ message, testID }: { message?: string; testID?: string }) {
    if (!message) return null;
    return (
        <Text testID={testID} accessibilityRole="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
            {message}
        </Text>
    );
}

interface StepperProps {
    value: number;
    min: number;
    max: number;
    onChange: (n: number) => void;
    label: string;
    incLabel: string;
    decLabel: string;
    suffix?: string;
    disabled?: boolean;
    testID?: string;
}

/** `[–] value [+]` with 44px targets; tapping the value types it (spec 3.3). */
export function NumberStepper({ value, min, max, onChange, label, incLabel, decLabel, suffix, disabled, testID }: StepperProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));
    useEffect(() => {
        if (!editing) setDraft(String(value));
    }, [value, editing]);
    const clamp = (n: number) => Math.max(min, Math.min(max, n));
    const commit = () => {
        const n = parseInt(draft, 10);
        if (!Number.isNaN(n)) onChange(clamp(n));
        setEditing(false);
    };
    const btn = (d: 1 | -1) => {
        const off = disabled || (d === 1 ? value >= max : value <= min);
        return (
            <TouchableOpacity
                testID={testID ? `${testID}-${d === 1 ? 'inc' : 'dec'}` : undefined}
                accessibilityRole="button"
                accessibilityLabel={d === 1 ? incLabel : decLabel}
                accessibilityState={{ disabled: off }}
                disabled={off}
                onPress={() => onChange(clamp(value + d))}
                className={`w-11 h-11 rounded-xl border items-center justify-center ${off ? 'border-gray-200 dark:border-cyber-border opacity-40' : 'border-gray-300 dark:border-cyber-border'}`}
            >
                <Ionicons name={d === 1 ? 'add' : 'remove'} size={20} color="#6b7280" />
            </TouchableOpacity>
        );
    };
    return (
        <View className="flex-row items-center justify-between py-1">
            <Text className="text-sm text-gray-700 dark:text-cyber-text flex-1 me-3">{label}</Text>
            <View className="flex-row items-center">
                {btn(-1)}
                {editing ? (
                    <TextInput
                        testID={testID}
                        autoFocus
                        keyboardType="number-pad"
                        value={draft}
                        onChangeText={(v) => setDraft(v.replace(/[^0-9-]/g, ''))}
                        onBlur={commit}
                        onSubmitEditing={commit}
                        accessibilityLabel={label}
                        className="w-16 h-11 text-center text-lg font-bold text-gray-900 dark:text-cyber-text"
                    />
                ) : (
                    <TouchableOpacity
                        testID={testID}
                        disabled={disabled}
                        onPress={() => setEditing(true)}
                        accessibilityRole="adjustable"
                        accessibilityLabel={label}
                        accessibilityValue={{ min, max, now: value }}
                        className="min-w-[56px] h-11 items-center justify-center flex-row"
                    >
                        <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text" style={{ fontVariant: ['tabular-nums'] }}>
                            {value}
                        </Text>
                        {suffix ? <Text className="text-xs text-gray-500 dark:text-cyber-muted ms-1">{suffix}</Text> : null}
                    </TouchableOpacity>
                )}
                {btn(1)}
            </View>
        </View>
    );
}

interface SegmentedProps<T extends string | number> {
    options: { value: T; label: string; testID?: string }[];
    value: T;
    onChange: (v: T) => void;
    disabled?: boolean;
}

export function Segmented<T extends string | number>({ options, value, onChange, disabled }: SegmentedProps<T>) {
    return (
        <View className="flex-row rounded-xl bg-gray-100 dark:bg-cyber-border p-1">
            {options.map((o) => {
                const on = o.value === value;
                return (
                    <TouchableOpacity
                        key={String(o.value)}
                        testID={o.testID}
                        disabled={disabled}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled }}
                        onPress={() => onChange(o.value)}
                        className={`flex-1 min-h-[40px] items-center justify-center rounded-lg ${on ? 'bg-white dark:bg-cyber-card' : ''}`}
                    >
                        <Text className={`text-sm ${on ? 'font-bold text-gray-900 dark:text-cyber-text' : 'text-gray-600 dark:text-cyber-muted'}`}>
                            {o.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

export function SwitchRow({
    label,
    hint,
    value,
    onChange,
    testID,
}: {
    label: string;
    hint?: string;
    value: boolean;
    onChange: (v: boolean) => void;
    testID?: string;
}) {
    return (
        <View className="flex-row items-center justify-between py-1">
            <View className="flex-1 me-3">
                <Text className="text-sm font-semibold text-gray-900 dark:text-cyber-text">{label}</Text>
                {hint ? <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-0.5">{hint}</Text> : null}
            </View>
            <Switch testID={testID} value={value} onValueChange={onChange} accessibilityLabel={label} />
        </View>
    );
}

/** Rounded text input with label (single or multiline). */
export function TextField({
    label,
    value,
    onChangeText,
    multiline,
    maxLength,
    placeholder,
    testID,
    onBlur,
    invalid,
}: {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    multiline?: boolean;
    maxLength?: number;
    placeholder?: string;
    testID?: string;
    onBlur?: () => void;
    invalid?: boolean;
}) {
    return (
        <View className="mb-3">
            <View className="flex-row justify-between mb-1">
                <Text className="text-sm font-semibold text-gray-700 dark:text-cyber-text">{label}</Text>
                {maxLength ? (
                    <Text className="text-xs text-gray-400 dark:text-cyber-muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {value.length}/{maxLength}
                    </Text>
                ) : null}
            </View>
            <TextInput
                testID={testID}
                value={value}
                onChangeText={onChangeText}
                onBlur={onBlur}
                multiline={multiline}
                maxLength={maxLength}
                placeholder={placeholder}
                accessibilityLabel={label}
                placeholderTextColor="#9ca3af"
                textAlignVertical={multiline ? 'top' : 'center'}
                className={`bg-gray-50 dark:bg-cyber-bg text-gray-900 dark:text-cyber-text rounded-xl px-3 border ${
                    invalid ? 'border-red-400' : 'border-gray-200 dark:border-cyber-border'
                } ${multiline ? 'min-h-[96px] py-3' : 'h-12'}`}
            />
        </View>
    );
}
