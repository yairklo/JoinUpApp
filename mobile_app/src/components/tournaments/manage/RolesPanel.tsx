import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/services/api/users';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTournamentAdminMutations } from '@/hooks/useTournamentMutations';
import type { TournamentAssignableRole, TournamentDetail, TournamentRoleRow } from '@/types/tournament';

interface Props {
    tournament: TournamentDetail;
}

const ROLE_CHIP: Record<string, string> = {
    ORGANIZER: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300',
    MANAGER: 'bg-brand-mist dark:bg-brand-ink text-brand-dark dark:text-brand-light',
    SCOREKEEPER: 'bg-gray-100 dark:bg-cyber-border text-gray-700 dark:text-cyber-text',
};

/** Roles section (spec 11.4). Managers see the list read-only; the organizer can add, change and remove. */
export default function RolesPanel({ tournament }: Props) {
    const { t } = useTranslation();
    const mut = useTournamentAdminMutations(tournament.id);
    const getTokenRef = useAuthTokenRef();
    const canEdit = tournament.capabilities.canManageRoles;

    const [rows, setRows] = useState<TournamentRoleRow[] | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [query, setQuery] = useState('');
    const debounced = useDebouncedValue(query, 300);
    const [results, setResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [role, setRole] = useState<TournamentAssignableRole>('SCOREKEEPER');

    const load = useCallback(async () => {
        try {
            setRows(await mut.listRoles());
            setLoadError(false);
        } catch {
            setLoadError(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tournament.id]);
    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!adding || !debounced.trim()) {
            setResults([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setSearching(true);
            try {
                const token = await getTokenRef.current();
                if (!token || cancelled) return;
                const data = await usersApi.search(debounced, token);
                if (!cancelled) setResults(data);
            } catch {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debounced, adding, getTokenRef]);

    const act = async (fn: () => Promise<unknown>) => {
        setActionError(null);
        try {
            await fn();
            await load();
        } catch (err: any) {
            setActionError(!err?.code && !err?.status ? (t('resultEditor.offline') as string) : (t('tournaments.manage.roles.failed') as string));
        }
    };

    const add = (userId: string) =>
        act(async () => {
            await mut.addRole(userId, role);
            setAdding(false);
            setQuery('');
        });

    const rowMenu = (r: TournamentRoleRow) => {
        const other: TournamentAssignableRole = r.role === 'MANAGER' ? 'SCOREKEEPER' : 'MANAGER';
        Alert.alert(r.name, undefined, [
            { text: `${t('tournaments.manage.roles.change')} ${t(`tournaments.manage.roles.${other}`)}`, onPress: () => act(() => mut.addRole(r.userId, other)) },
            { text: t('tournaments.manage.roles.remove') as string, style: 'destructive', onPress: () => act(() => mut.removeRole(r.userId)) },
            { text: t('common.cancel') as string, style: 'cancel' },
        ]);
    };

    if (rows == null && !loadError) {
        return (
            <View className="py-16 items-center">
                <ActivityIndicator color="#059669" />
            </View>
        );
    }
    const others = (rows ?? []).filter((r) => r.role !== 'ORGANIZER');
    const organizers = (rows ?? []).filter((r) => r.role === 'ORGANIZER');

    const renderRow = (r: TournamentRoleRow) => {
        const [bg, fg] = [ROLE_CHIP[r.role].split(' ').filter((c) => /bg-/.test(c)).join(' '), ROLE_CHIP[r.role].split(' ').filter((c) => /text-/.test(c)).join(' ')];
        return (
            <View key={r.userId} testID={`role-row-${r.userId}`} className="flex-row items-center py-2 border-b border-gray-100 dark:border-cyber-border" style={{ minHeight: 56 }}>
                {r.imageUrl ? <Image source={{ uri: r.imageUrl }} className="w-10 h-10 rounded-full bg-gray-200" /> : <View className="w-10 h-10 rounded-full bg-gray-200 dark:bg-cyber-border" />}
                <Text numberOfLines={1} className="ms-3 flex-1 font-semibold text-gray-900 dark:text-cyber-text" style={{ minWidth: 0 }}>
                    {r.name}
                </Text>
                <View className={`px-2.5 py-1 rounded-full ${bg}`}>
                    <Text className={`text-xs font-bold ${fg}`}>{t(`tournaments.manage.roles.${r.role}`)}</Text>
                </View>
                {canEdit && r.role !== 'ORGANIZER' ? (
                    <Pressable onPress={() => rowMenu(r)} accessibilityRole="button" accessibilityLabel={r.name} style={{ width: 44, height: 44 }} className="items-center justify-center">
                        <Ionicons name="ellipsis-horizontal" size={20} color="#6b7280" />
                    </Pressable>
                ) : null}
            </View>
        );
    };

    return (
        <ScrollView testID="manage-section-roles" className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {loadError ? <Text className="text-red-600 mb-3">{t('tournaments.manage.roles.failed')}</Text> : null}
            {actionError ? (
                <View accessibilityRole="alert" className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 mb-3">
                    <Text className="text-red-700 dark:text-red-300">{actionError}</Text>
                </View>
            ) : null}
            <View testID="roles-list">
                {organizers.map(renderRow)}
                {others.map(renderRow)}
                {others.length === 0 ? <Text className="mt-3 text-gray-500 dark:text-cyber-muted">{t('tournaments.manage.roles.empty')}</Text> : null}
            </View>

            <View className="mt-4">
                <Text className="text-sm text-gray-600 dark:text-cyber-muted">
                    <Text className="font-bold">{t('tournaments.manage.roles.MANAGER')}: </Text>
                    {t('tournaments.manage.roles.managerHint')}
                </Text>
                <Text className="mt-1 text-sm text-gray-600 dark:text-cyber-muted">
                    <Text className="font-bold">{t('tournaments.manage.roles.SCOREKEEPER')}: </Text>
                    {t('tournaments.manage.roles.scorekeeperHint')}
                </Text>
            </View>

            {canEdit ? (
                adding ? (
                    <View className="mt-5 rounded-2xl border border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-card p-3">
                        <View className="flex-row mb-3 rounded-xl bg-gray-100 dark:bg-cyber-bg p-1">
                            {(['SCOREKEEPER', 'MANAGER'] as const).map((r) => (
                                <Pressable
                                    key={r}
                                    onPress={() => setRole(r)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: role === r }}
                                    style={{ minHeight: 44 }}
                                    className={`flex-1 items-center justify-center rounded-lg ${role === r ? 'bg-white dark:bg-cyber-border' : ''}`}
                                >
                                    <Text className={`font-bold ${role === r ? 'text-gray-900 dark:text-cyber-text' : 'text-gray-500 dark:text-cyber-muted'}`}>{t(`tournaments.manage.roles.${r}`)}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <TextInput
                            testID="roles-search"
                            value={query}
                            onChangeText={setQuery}
                            placeholder={t('common.search') as string}
                            autoFocus
                            className="rounded-xl border border-gray-300 dark:border-cyber-border bg-white dark:bg-cyber-bg px-3 text-gray-900 dark:text-cyber-text"
                            style={{ height: 48 }}
                        />
                        {searching ? <ActivityIndicator className="mt-3" color="#059669" /> : null}
                        {results
                            .filter((u) => !(rows ?? []).some((r) => r.userId === u.id))
                            .slice(0, 8)
                            .map((u) => (
                                <Pressable
                                    key={u.id}
                                    onPress={() => add(u.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${t('tournaments.manage.roles.add')}: ${u.name}`}
                                    className="flex-row items-center border-b border-gray-100 dark:border-cyber-border"
                                    style={{ minHeight: 52 }}
                                >
                                    {u.imageUrl ? <Image source={{ uri: u.imageUrl }} className="w-9 h-9 rounded-full bg-gray-200" /> : <View className="w-9 h-9 rounded-full bg-gray-200 dark:bg-cyber-border" />}
                                    <Text className="ms-3 flex-1 font-semibold text-gray-900 dark:text-cyber-text">{u.name}</Text>
                                    <Ionicons name="add-circle-outline" size={22} color="#059669" />
                                </Pressable>
                            ))}
                        <Pressable onPress={() => setAdding(false)} accessibilityRole="button" style={{ minHeight: 44 }} className="mt-2 items-center justify-center">
                            <Text className="font-bold text-gray-600 dark:text-cyber-muted">{t('common.cancel')}</Text>
                        </Pressable>
                    </View>
                ) : (
                    <Pressable
                        testID="roles-add"
                        onPress={() => setAdding(true)}
                        accessibilityRole="button"
                        style={{ minHeight: 48 }}
                        className="mt-5 flex-row items-center justify-center rounded-2xl bg-brand"
                    >
                        <Ionicons name="person-add-outline" size={18} color="#fff" />
                        <Text className="ms-2 font-extrabold text-white">{t('tournaments.manage.roles.add')}</Text>
                    </Pressable>
                )
            ) : null}
        </ScrollView>
    );
}
