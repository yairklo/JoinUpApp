import React from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import TeamBadge from '../TeamBadge';
import MinorsCard from './MinorsCard';
import { TEAM_COLORS } from './teamUtils';

interface Props {
    name: string;
    color: string;
    onNameChange: (v: string) => void;
    onColorChange: (c: string) => void;
    onSubmit: () => void;
    pending?: boolean;
    /** Inline error message (known codes mapped by the container). */
    error?: string | null;
    /** Replaces the form with the minors card. */
    minors?: boolean;
}

const MAX_NAME = 40;

/** Create-team form (spec 4.1): live badge preview, name with counter, 8 colour swatches, submit. Props only. */
export default function CreateTeamForm({ name, color, onNameChange, onColorChange, onSubmit, pending, error, minors }: Props) {
    const { t } = useTranslation();
    if (minors) {
        return (
            <View className="p-4">
                <MinorsCard />
            </View>
        );
    }
    return (
        <ScrollView testID="team-create-form" className="flex-1" contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View className="rounded-2xl bg-white dark:bg-cyber-card p-4 border border-gray-100 dark:border-cyber-border mb-3 items-center">
                <TeamBadge name={name.trim() || t('tournaments.team.name')} color={color} size={40} bold muted={!name.trim()} />
            </View>

            <View className="rounded-2xl bg-white dark:bg-cyber-card p-4 border border-gray-100 dark:border-cyber-border mb-3">
                <View className="flex-row justify-between mb-1">
                    <Text className="text-sm font-semibold text-gray-700 dark:text-cyber-text">{t('tournaments.team.name')}</Text>
                    <Text className="text-xs text-gray-400 dark:text-cyber-muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {name.length}/{MAX_NAME}
                    </Text>
                </View>
                <TextInput
                    testID="team-create-name"
                    value={name}
                    onChangeText={onNameChange}
                    maxLength={MAX_NAME}
                    accessibilityLabel={t('tournaments.team.name')}
                    className={`h-12 rounded-xl px-3 bg-gray-50 dark:bg-cyber-bg text-gray-900 dark:text-cyber-text border ${error ? 'border-red-400' : 'border-gray-200 dark:border-cyber-border'}`}
                />
                {error ? (
                    <Text testID="team-create-error" accessibilityRole="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {error}
                    </Text>
                ) : null}

                <Text className="text-sm font-semibold text-gray-700 dark:text-cyber-text mt-4 mb-2">{t('tournaments.team.color')}</Text>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {TEAM_COLORS.map((c, i) => {
                        const on = c === color;
                        return (
                            <TouchableOpacity
                                key={c}
                                testID={`team-create-color-${i}`}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={c}
                                onPress={() => onColorChange(c)}
                                className={`w-11 h-11 rounded-full items-center justify-center ${on ? 'border-2 border-gray-900 dark:border-white' : 'border border-gray-200 dark:border-cyber-border'}`}
                                style={{ backgroundColor: c }}
                            >
                                {on ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <Text className="text-xs text-gray-600 dark:text-cyber-muted mb-4">{t('tournaments.team.captainNote')}</Text>

            <TouchableOpacity
                testID="team-create-submit"
                accessibilityRole="button"
                accessibilityState={{ busy: !!pending }}
                disabled={pending}
                onPress={onSubmit}
                className="h-[52px] rounded-2xl bg-brand items-center justify-center"
            >
                {pending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">{t('tournaments.team.create')}</Text>}
            </TouchableOpacity>
        </ScrollView>
    );
}
