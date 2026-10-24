import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ConflictView } from './manageUtils';

interface Props {
    items: ConflictView[];
    /** Called with a match number when a chip is tapped (scroll to / highlight it). */
    onPickNumber?: (n: number) => void;
    /** Collapsible (phone). Default open. */
    collapsible?: boolean;
}

/** Plain-language conflicts list (spec 11.2): icon, title, explanation, tappable match chips. Props only. */
export default function ConflictsPanel({ items, onPickNumber, collapsible = true }: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(true);
    if (items.length === 0) return null;
    return (
        <View testID="schedule-conflicts" className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3">
            <Pressable
                onPress={() => collapsible && setOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                className="flex-row items-center"
                style={{ minHeight: 32 }}
            >
                <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
                <Text className="ms-2 flex-1 font-bold text-amber-800 dark:text-amber-200">
                    {t('tournaments.manage.sched.conflictsTitle', { count: items.length })}
                </Text>
                {collapsible ? <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#b45309" /> : null}
            </Pressable>
            {open
                ? items.map((c, i) => (
                      <View key={i} testID={`schedule-conflict-${i}`} className="mt-3">
                          <Text className="font-semibold text-gray-900 dark:text-cyber-text">{t(c.titleKey)}</Text>
                          <Text className="text-sm text-gray-700 dark:text-cyber-muted mt-0.5">{t(c.bodyKey, c.params as any) as string}</Text>
                          {c.numbers.length ? (
                              <View className="flex-row flex-wrap mt-1.5" style={{ gap: 6 }}>
                                  {c.numbers.map((n) => (
                                      <Pressable
                                          key={n}
                                          onPress={() => onPickNumber?.(n)}
                                          accessibilityRole="button"
                                          accessibilityLabel={t('tournaments.match.number', { n }) as string}
                                          style={{ minHeight: 32 }}
                                          className="px-3 rounded-full bg-white dark:bg-cyber-card border border-amber-300 dark:border-amber-800 items-center justify-center"
                                      >
                                          <Text className="text-xs font-bold text-amber-800 dark:text-amber-200">#{n}</Text>
                                      </Pressable>
                                  ))}
                              </View>
                          ) : null}
                      </View>
                  ))
                : null}
        </View>
    );
}
