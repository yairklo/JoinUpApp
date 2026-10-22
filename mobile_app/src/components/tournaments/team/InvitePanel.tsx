import React from 'react';
import { ActivityIndicator, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface InviteCandidate {
    id: string;
    name: string;
    imageUrl?: string | null;
}

interface Props {
    query: string;
    onQueryChange: (q: string) => void;
    /** Friends (empty query) or search results (typed query). */
    candidates: InviteCandidate[];
    loading?: boolean;
    /** User ids already invited in this session, or already on the roster. */
    invitedIds: Set<string>;
    /** Per-user inline error (mapped message). */
    errors: Record<string, string>;
    pendingId?: string | null;
    onInvite: (userId: string) => void;
}

/** Invite by search / friends (spec 4.6). Props only; the container debounces and fetches. */
export default function InvitePanel({ query, onQueryChange, candidates, loading, invitedIds, errors, pendingId, onInvite }: Props) {
    const { t } = useTranslation();
    const typed = query.trim().length > 0;
    return (
        <View testID="team-invite-panel">
            <TextInput
                testID="team-invite-search"
                value={query}
                onChangeText={onQueryChange}
                placeholder={t('tournaments.team.invite.search')}
                placeholderTextColor="#9ca3af"
                accessibilityLabel={t('tournaments.team.invite.search')}
                autoCapitalize="none"
                autoCorrect={false}
                className="h-12 rounded-xl px-3 bg-gray-50 dark:bg-cyber-bg text-gray-900 dark:text-cyber-text border border-gray-200 dark:border-cyber-border"
            />
            {!typed && candidates.length ? (
                <Text className="text-xs font-bold text-gray-500 dark:text-cyber-muted mt-3">{t('tournaments.team.invite.friends')}</Text>
            ) : null}
            {loading ? <ActivityIndicator className="mt-3" color="#059669" /> : null}
            {!loading && typed && candidates.length === 0 ? (
                <Text className="text-sm text-gray-500 dark:text-cyber-muted mt-3 text-center">{t('profile.noPlayersFound')}</Text>
            ) : null}
            {candidates.map((c) => {
                const done = invitedIds.has(c.id);
                const err = errors[c.id];
                return (
                    <View key={c.id} className="border-b border-gray-100 dark:border-cyber-border">
                        <View className="flex-row items-center min-h-[56px] py-2">
                            <Image
                                source={{ uri: c.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || 'User')}` }}
                                accessibilityIgnoresInvertColors
                                className="w-10 h-10 rounded-full bg-gray-200"
                            />
                            <Text numberOfLines={1} className="flex-1 ms-3 text-[15px] font-semibold text-gray-900 dark:text-cyber-text">
                                {c.name}
                            </Text>
                            <TouchableOpacity
                                testID={`team-invite-${c.id}`}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: done || pendingId === c.id }}
                                disabled={done || pendingId === c.id}
                                onPress={() => onInvite(c.id)}
                                className={`min-h-[44px] px-4 rounded-xl items-center justify-center ${done ? 'bg-gray-100 dark:bg-cyber-border' : 'bg-brand'}`}
                            >
                                {pendingId === c.id ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text className={`text-sm font-bold ${done ? 'text-gray-600 dark:text-cyber-muted' : 'text-white'}`}>
                                        {done ? t('tournaments.team.invite.sent') : t('tournaments.team.invite.send')}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                        {err ? (
                            <Text testID={`team-invite-error-${c.id}`} accessibilityRole="alert" className="text-xs text-red-600 dark:text-red-400 pb-2">
                                {err}
                            </Text>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );
}
