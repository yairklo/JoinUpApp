import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tabular } from '@/components/results/resultUtils';

interface Props {
    sets: string[][];
    bestOf: 3 | 5;
    onChange: (next: string[][]) => void;
    /** Per-row error text (index -> message). */
    errors?: Record<number, string>;
    disabled?: boolean;
}

const digits = (s: string) => s.replace(/[^0-9]/g, '').slice(0, 2);

/** Tennis set rows (F1 3.3): home first at the start edge, 48px inputs, add/remove up to best-of. */
export default function TennisSetRows({ sets, bestOf, onChange, errors, disabled }: Props) {
    const { t } = useTranslation();
    const setVal = (i: number, j: 0 | 1, v: string) =>
        onChange(sets.map((r, idx) => (idx === i ? (j === 0 ? [digits(v), r[1]] : [r[0], digits(v)]) : r)));
    return (
        <View testID="score-sets">
            {sets.map((row, i) => (
                <View key={i} className="mb-2">
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                        <Text className="w-14 text-sm font-semibold text-gray-600 dark:text-cyber-muted">{t('tournaments.score.setN', { n: i + 1 })}</Text>
                        {[0, 1].map((j) => (
                            <React.Fragment key={j}>
                                {j === 1 ? <Text className="text-lg font-bold text-gray-400 dark:text-cyber-muted">:</Text> : null}
                                <TextInput
                                    testID={`score-set-${i}-${j === 0 ? 'home' : 'away'}`}
                                    value={row[j]}
                                    editable={!disabled}
                                    onChangeText={(v) => setVal(i, j as 0 | 1, v)}
                                    keyboardType="number-pad"
                                    maxLength={2}
                                    accessibilityLabel={`${t('tournaments.score.setN', { n: i + 1 })} ${j === 0 ? 'A' : 'B'}`}
                                    className="flex-1 rounded-xl border border-gray-300 dark:border-cyber-border bg-white dark:bg-cyber-card text-center text-xl font-bold text-gray-900 dark:text-cyber-text"
                                    style={[tabular, { height: 48 }]}
                                />
                            </React.Fragment>
                        ))}
                        {sets.length > 1 ? (
                            <Pressable
                                onPress={() => onChange(sets.filter((_, idx) => idx !== i))}
                                disabled={disabled}
                                accessibilityRole="button"
                                accessibilityLabel={t('resultEditor.removeSet', { n: i + 1 }) as string}
                                style={{ width: 44, height: 44 }}
                                className="items-center justify-center"
                            >
                                <Ionicons name="close" size={20} color="#6b7280" />
                            </Pressable>
                        ) : (
                            <View style={{ width: 44 }} />
                        )}
                    </View>
                    {errors?.[i] ? <Text className="ms-16 mt-1 text-xs text-red-600 dark:text-red-400">{errors[i]}</Text> : null}
                </View>
            ))}
            {sets.length < bestOf ? (
                <Pressable
                    testID="score-set-add"
                    onPress={() => onChange([...sets, ['', '']])}
                    disabled={disabled}
                    accessibilityRole="button"
                    style={{ minHeight: 44 }}
                    className="flex-row items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-cyber-border"
                >
                    <Ionicons name="add" size={18} color="#6b7280" />
                    <Text className="ms-1 font-semibold text-gray-700 dark:text-cyber-text">{t('resultEditor.addSet')}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}
