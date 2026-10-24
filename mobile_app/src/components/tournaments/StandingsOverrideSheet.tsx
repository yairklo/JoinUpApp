import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { tabular } from '@/components/results/resultUtils';
import type { StandingsOverrideInput, StandingsRow, StandingsTable } from '@/types/tournament';
import TeamBadge from './TeamBadge';

interface Props {
    open: boolean;
    table: StandingsTable | null;
    busy?: boolean;
    errorText?: string | null;
    onClose: () => void;
    onSave: (input: StandingsOverrideInput) => void;
    onReset?: () => void;
}

type Draft = { points: string; reason: string };

function draftFromRow(row: StandingsRow): Draft {
    const d = row.pointsAdjustment;
    return { points: typeof d === 'number' && d !== 0 ? String(d) : '', reason: row.adjustmentReason ?? '' };
}

function parsePoints(raw: string): number | null {
    const s = raw.trim().replace('−', '-');
    if (!s) return 0;
    if (!/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    if (n < -100 || n > 100) return null;
    return n;
}

function move(ids: string[], from: number, to: number): string[] {
    if (to < 0 || to >= ids.length || from === to) return ids;
    const next = ids.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

/** Manager sheet: manual order until reset, optional additive points adjustments. */
export default function StandingsOverrideSheet({ open, table, busy, errorText, onClose, onSave, onReset }: Props) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [order, setOrder] = useState<string[]>([]);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !table) return;
        setOrder(table.rows.map((r) => r.team.id));
        setDrafts(Object.fromEntries(table.rows.map((r) => [r.team.id, draftFromRow(r)])));
        setLocalError(null);
    }, [open, table]);

    const byId = new Map((table?.rows ?? []).map((r) => [r.team.id, r]));

    const save = () => {
        if (!table) return;
        const adjustments: NonNullable<StandingsOverrideInput['adjustments']> = [];
        for (const id of order) {
            const draft = drafts[id] ?? { points: '', reason: '' };
            const points = parsePoints(draft.points);
            if (points === null) {
                setLocalError(t('tournaments.standings.override.pointsInvalid'));
                return;
            }
            if (points !== 0 && !draft.reason.trim()) {
                setLocalError(t('tournaments.standings.override.reasonRequired'));
                return;
            }
            if (points !== 0) adjustments.push({ teamId: id, points, reason: draft.reason.trim() });
        }
        setLocalError(null);
        onSave({ stageId: table.stageId, groupId: table.groupId, teamOrder: order, adjustments });
    };

    const setDraft = (id: string, patch: Partial<Draft>) => {
        setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { points: '', reason: '' }), ...patch } }));
    };

    const message = localError || errorText;

    return (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => !busy && onClose()} statusBarTranslucent>
            <View className="flex-1 justify-end bg-black/40">
                <Pressable className="flex-1" onPress={() => !busy && onClose()} accessibilityLabel={t('common.close') as string} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View testID="standings-override-sheet" className="bg-gray-50 dark:bg-cyber-bg rounded-t-3xl" style={{ maxHeight: '90%', paddingBottom: insets.bottom }}>
                        <View className="items-center pt-2">
                            <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-cyber-border" />
                        </View>
                        <Text className="text-center font-extrabold text-gray-900 dark:text-cyber-text py-2">{t('tournaments.standings.override.title')}</Text>
                        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
                            <Text className="text-[13px] text-gray-500 dark:text-cyber-muted mb-3">{t('tournaments.standings.override.help')}</Text>
                            {message ? (
                                <View accessibilityRole="alert" className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 mb-3">
                                    <Text className="text-red-700 dark:text-red-300">{message}</Text>
                                </View>
                            ) : null}
                            {order.map((id, i) => {
                                const row = byId.get(id);
                                if (!row) return null;
                                const draft = drafts[id] ?? { points: '', reason: '' };
                                return (
                                    <View key={id} testID={`standings-override-row-${id}`} className="rounded-2xl bg-white dark:bg-cyber-card border border-gray-100 dark:border-cyber-border p-3 mb-2">
                                        <View className="flex-row items-center">
                                            <Text className="w-6 text-gray-500 dark:text-cyber-muted font-bold" style={tabular}>{i + 1}</Text>
                                            <View className="flex-1" style={{ minWidth: 0 }}>
                                                <TeamBadge name={row.team.name} color={row.team.color} logoUrl={row.team.logoUrl} />
                                                <Text className="text-[11px] text-gray-500 dark:text-cyber-muted mt-0.5">
                                                    {t('tournaments.standings.override.autoPoints', { points: row.autoPoints ?? row.points, played: row.played })}
                                                </Text>
                                            </View>
                                            <Pressable
                                                testID={`standings-override-up-${id}`}
                                                accessibilityRole="button"
                                                accessibilityLabel={t('tournaments.standings.override.moveUp') as string}
                                                disabled={busy || i === 0}
                                                onPress={() => setOrder((ids) => move(ids, i, i - 1))}
                                                className="w-11 h-11 items-center justify-center"
                                            >
                                                <Text className={`text-lg font-bold ${i === 0 ? 'text-gray-300' : 'text-gray-800 dark:text-cyber-text'}`}>↑</Text>
                                            </Pressable>
                                            <Pressable
                                                testID={`standings-override-down-${id}`}
                                                accessibilityRole="button"
                                                accessibilityLabel={t('tournaments.standings.override.moveDown') as string}
                                                disabled={busy || i === order.length - 1}
                                                onPress={() => setOrder((ids) => move(ids, i, i + 1))}
                                                className="w-11 h-11 items-center justify-center"
                                            >
                                                <Text className={`text-lg font-bold ${i === order.length - 1 ? 'text-gray-300' : 'text-gray-800 dark:text-cyber-text'}`}>↓</Text>
                                            </Pressable>
                                        </View>
                                        <View className="flex-row mt-2" style={{ gap: 8 }}>
                                            <TextInput
                                                testID={`standings-override-points-${id}`}
                                                value={draft.points}
                                                onChangeText={(v) => setDraft(id, { points: v })}
                                                editable={!busy}
                                                keyboardType="numbers-and-punctuation"
                                                placeholder={t('tournaments.standings.override.points') as string}
                                                placeholderTextColor="#9ca3af"
                                                className="rounded-xl border border-gray-300 dark:border-cyber-border px-2 text-gray-900 dark:text-cyber-text"
                                                style={[tabular, { width: 120, height: 44, textAlign: 'center' }]}
                                            />
                                            <TextInput
                                                testID={`standings-override-reason-${id}`}
                                                value={draft.reason}
                                                onChangeText={(v) => setDraft(id, { reason: v })}
                                                editable={!busy}
                                                maxLength={200}
                                                placeholder={t('tournaments.standings.override.reasonPlaceholder') as string}
                                                placeholderTextColor="#9ca3af"
                                                className="flex-1 rounded-xl border border-gray-300 dark:border-cyber-border px-3 text-gray-900 dark:text-cyber-text"
                                                style={{ height: 44 }}
                                            />
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>
                        <View className="px-4 pt-2 pb-3" style={{ gap: 8 }}>
                            {table?.manualOrder && onReset ? (
                                <Pressable testID="standings-override-reset" onPress={onReset} disabled={busy} accessibilityRole="button" className="items-center justify-center rounded-full border border-gray-300 dark:border-cyber-border" style={{ minHeight: 44 }}>
                                    <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.standings.override.reset')}</Text>
                                </Pressable>
                            ) : null}
                            <View className="flex-row" style={{ gap: 8 }}>
                                <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" className="flex-1 items-center justify-center rounded-full border border-gray-300 dark:border-cyber-border" style={{ minHeight: 48 }}>
                                    <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.standings.override.cancel')}</Text>
                                </Pressable>
                                <Pressable testID="standings-override-save" onPress={save} disabled={busy || order.length === 0} accessibilityRole="button" className="flex-1 items-center justify-center rounded-full bg-brand" style={{ minHeight: 48, opacity: busy ? 0.7 : 1 }}>
                                    {busy ? <ActivityIndicator color="#fff" /> : <Text className="font-extrabold text-white">{t('tournaments.standings.override.save')}</Text>}
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}
