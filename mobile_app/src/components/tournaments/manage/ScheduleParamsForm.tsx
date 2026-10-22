import React from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tabular } from '@/components/results/resultUtils';
import { isDateStr, isTimeStr } from './manageUtils';

export interface DayRow {
    date: string;
    from: string;
    to: string;
}

export interface ScheduleParams {
    days: DayRow[];
    namedCourts: boolean;
    courtCount: number;
    courtNames: string[];
    matchMinutes: number;
    breakMinutes: number;
    minRestMinutes: number;
    stepMinutes: number;
    seed: number;
}

interface Props {
    value: ScheduleParams;
    onChange: (next: ScheduleParams) => void;
    onPreview: () => void;
    busy?: boolean;
    /** Show the field-level errors (after a failed preview attempt). */
    showErrors?: boolean;
}

export const paramsValid = (p: ScheduleParams) =>
    p.days.length > 0 &&
    p.days.every((d) => isDateStr(d.date) && isTimeStr(d.from) && isTimeStr(d.to) && d.from < d.to) &&
    (p.namedCourts ? p.courtNames.filter((n) => n.trim()).length > 0 : p.courtCount >= 1 && p.courtCount <= 20) &&
    p.matchMinutes > 0;

function Stepper({ label, value, min, max, step = 5, onChange, testID }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; testID: string }) {
    const { t } = useTranslation();
    return (
        <View className="flex-row items-center justify-between py-2" testID={testID}>
            <Text className="flex-1 text-gray-800 dark:text-cyber-text">{label}</Text>
            <Pressable
                onPress={() => onChange(Math.max(min, value - step))}
                accessibilityRole="button"
                accessibilityLabel={`− ${label}`}
                style={{ width: 44, height: 44 }}
                className="rounded-xl bg-white dark:bg-cyber-card border border-gray-200 dark:border-cyber-border items-center justify-center"
            >
                <Ionicons name="remove" size={20} color="#374151" />
            </Pressable>
            <Text className="w-20 text-center font-extrabold text-gray-900 dark:text-cyber-text" style={tabular}>
                {value} {t('tournaments.manage.sched.minShort')}
            </Text>
            <Pressable
                onPress={() => onChange(Math.min(max, value + step))}
                accessibilityRole="button"
                accessibilityLabel={`+ ${label}`}
                style={{ width: 44, height: 44 }}
                className="rounded-xl bg-white dark:bg-cyber-card border border-gray-200 dark:border-cyber-border items-center justify-center"
            >
                <Ionicons name="add" size={20} color="#374151" />
            </Pressable>
        </View>
    );
}

const box = 'rounded-xl border border-gray-300 dark:border-cyber-border bg-white dark:bg-cyber-card text-center text-gray-900 dark:text-cyber-text';

/** Parameters step of the schedule builder (spec 11.2): days (Israel time), courts, durations, advanced. Props only. */
export default function ScheduleParamsForm({ value: p, onChange, onPreview, busy, showErrors }: Props) {
    const { t } = useTranslation();
    const set = (patch: Partial<ScheduleParams>) => onChange({ ...p, ...patch });
    const setDay = (i: number, patch: Partial<DayRow>) => set({ days: p.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });
    const [advanced, setAdvanced] = React.useState(false);
    const valid = paramsValid(p);
    return (
        <View testID="schedule-params">
            <Text className="font-bold text-gray-900 dark:text-cyber-text">{t('tournaments.manage.sched.days')}</Text>
            <Text className="text-xs text-gray-500 dark:text-cyber-muted mb-2">
                {t('tournaments.israelTime')} · {t('tournaments.manage.sched.tzHint')}
            </Text>
            {p.days.map((d, i) => {
                const bad = showErrors && !(isDateStr(d.date) && isTimeStr(d.from) && isTimeStr(d.to) && d.from < d.to);
                return (
                    <View key={i} testID={`schedule-param-day-${i}`} className="flex-row items-center mb-2" style={{ gap: 6 }}>
                        <TextInput
                            value={d.date}
                            onChangeText={(v) => setDay(i, { date: v.trim() })}
                            placeholder="2026-11-05"
                            keyboardType="numbers-and-punctuation"
                            accessibilityLabel={t('tournaments.manage.sched.date') as string}
                            className={`${box} ${bad ? 'border-red-500' : ''}`}
                            style={[tabular, { flex: 2, height: 48 }]}
                        />
                        <TextInput
                            value={d.from}
                            onChangeText={(v) => setDay(i, { from: v.trim() })}
                            placeholder="18:00"
                            keyboardType="numbers-and-punctuation"
                            accessibilityLabel={t('tournaments.manage.sched.from') as string}
                            className={`${box} ${bad ? 'border-red-500' : ''}`}
                            style={[tabular, { flex: 1, height: 48 }]}
                        />
                        <TextInput
                            value={d.to}
                            onChangeText={(v) => setDay(i, { to: v.trim() })}
                            placeholder="22:00"
                            keyboardType="numbers-and-punctuation"
                            accessibilityLabel={t('tournaments.manage.sched.to') as string}
                            className={`${box} ${bad ? 'border-red-500' : ''}`}
                            style={[tabular, { flex: 1, height: 48 }]}
                        />
                        <Pressable
                            onPress={() => set({ days: p.days.filter((_, idx) => idx !== i) })}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.remove') as string}
                            style={{ width: 44, height: 44 }}
                            className="items-center justify-center"
                        >
                            <Ionicons name="close" size={20} color="#6b7280" />
                        </Pressable>
                    </View>
                );
            })}
            {showErrors && p.days.length === 0 ? <Text className="text-xs text-red-600 mb-1">{t('tournaments.manage.sched.needDay')}</Text> : null}
            <Pressable
                testID="schedule-add-day"
                onPress={() => {
                    const last = p.days[p.days.length - 1];
                    set({ days: [...p.days, { date: '', from: last?.from ?? '18:00', to: last?.to ?? '22:00' }] });
                }}
                accessibilityRole="button"
                style={{ minHeight: 44 }}
                className="flex-row items-center"
            >
                <Ionicons name="add-circle-outline" size={20} color="#059669" />
                <Text className="ms-1 font-bold text-brand-dark dark:text-brand-light">{t('tournaments.manage.sched.addDay')}</Text>
            </Pressable>

            <Text className="font-bold text-gray-900 dark:text-cyber-text mt-4">{t('tournaments.manage.sched.courts')}</Text>
            <View className="flex-row items-center justify-between" style={{ minHeight: 44 }}>
                <Text className="flex-1 text-gray-700 dark:text-cyber-text">{t('tournaments.manage.sched.nameCourts')}</Text>
                <Switch value={p.namedCourts} onValueChange={(v) => set({ namedCourts: v })} accessibilityLabel={t('tournaments.manage.sched.nameCourts') as string} />
            </View>
            {p.namedCourts ? (
                <View testID="schedule-param-courts">
                    {p.courtNames.map((n, i) => (
                        <View key={i} className="flex-row items-center mb-2">
                            <TextInput
                                value={n}
                                onChangeText={(v) => set({ courtNames: p.courtNames.map((x, idx) => (idx === i ? v : x)) })}
                                placeholder={t('tournaments.manage.sched.court', { n: i + 1 }) as string}
                                className="flex-1 rounded-xl border border-gray-300 dark:border-cyber-border bg-white dark:bg-cyber-card px-3 text-gray-900 dark:text-cyber-text"
                                style={{ height: 48 }}
                            />
                            <Pressable
                                onPress={() => set({ courtNames: p.courtNames.filter((_, idx) => idx !== i) })}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.remove') as string}
                                style={{ width: 44, height: 44 }}
                                className="items-center justify-center"
                            >
                                <Ionicons name="close" size={20} color="#6b7280" />
                            </Pressable>
                        </View>
                    ))}
                    {p.courtNames.length < 20 ? (
                        <Pressable onPress={() => set({ courtNames: [...p.courtNames, ''] })} accessibilityRole="button" style={{ minHeight: 44 }} className="flex-row items-center">
                            <Ionicons name="add-circle-outline" size={20} color="#059669" />
                            <Text className="ms-1 font-bold text-brand-dark dark:text-brand-light">{t('tournaments.manage.sched.addCourt')}</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : (
                <Stepper testID="schedule-param-courts" label={t('tournaments.manage.sched.courtCount') as string} value={p.courtCount} min={1} max={20} step={1} onChange={(n) => set({ courtCount: n })} />
            )}

            <View className="mt-3">
                <Stepper testID="schedule-param-match" label={t('tournaments.manage.sched.matchMinutes') as string} value={p.matchMinutes} min={5} max={240} onChange={(n) => set({ matchMinutes: n })} />
                <Stepper testID="schedule-param-break" label={t('tournaments.manage.sched.breakMinutes') as string} value={p.breakMinutes} min={0} max={120} onChange={(n) => set({ breakMinutes: n })} />
                <Stepper testID="schedule-param-rest" label={t('tournaments.manage.sched.minRest') as string} value={p.minRestMinutes} min={0} max={240} onChange={(n) => set({ minRestMinutes: n })} />
            </View>

            <Pressable onPress={() => setAdvanced((a) => !a)} accessibilityRole="button" accessibilityState={{ expanded: advanced }} style={{ minHeight: 44 }} className="flex-row items-center mt-1">
                <Ionicons name={advanced ? 'chevron-down' : 'chevron-forward'} size={18} color="#6b7280" />
                <Text className="ms-1 font-semibold text-gray-600 dark:text-cyber-muted">{t('tournaments.manage.sched.advanced')}</Text>
            </Pressable>
            {advanced ? (
                <View>
                    <Stepper testID="schedule-param-step" label={t('tournaments.manage.sched.stepMinutes') as string} value={p.stepMinutes} min={5} max={60} onChange={(n) => set({ stepMinutes: n })} />
                    <View className="flex-row items-center justify-between py-2">
                        <Text className="text-gray-800 dark:text-cyber-text" style={tabular}>
                            {t('tournaments.manage.sched.seed')}: {p.seed}
                        </Text>
                        <Pressable
                            testID="schedule-new-seed"
                            onPress={() => set({ seed: Math.floor(Math.random() * 1_000_000) })}
                            accessibilityRole="button"
                            style={{ minHeight: 44 }}
                            className="px-4 rounded-xl border border-gray-300 dark:border-cyber-border items-center justify-center"
                        >
                            <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.manage.sched.newSeed')}</Text>
                        </Pressable>
                    </View>
                </View>
            ) : null}

            <Pressable
                testID="schedule-preview"
                onPress={onPreview}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!busy, busy: !!busy }}
                style={{ height: 56, opacity: busy ? 0.6 : valid || !showErrors ? 1 : 0.85 }}
                className="mt-5 rounded-2xl bg-brand items-center justify-center"
            >
                <Text className="text-white font-extrabold text-base">{t('tournaments.manage.sched.preview')}</Text>
            </Pressable>
        </View>
    );
}
