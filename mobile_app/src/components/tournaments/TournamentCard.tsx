import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SPORT_EMOJI } from '@/utils/sports';
import SportCover, { getSportTheme } from '@/components/ui/SportCover';
import type { Tournament } from '@/types/tournament';
import TournamentStatusChip from './TournamentStatusChip';
import { capacityPct, fmtDateRange, fmtShortDate } from './shellUtils';
import type { Lang } from './matchFormat';

interface Props {
    tournament: Tournament;
    lang: Lang;
    /** Fixed width for the horizontal home rail; full width otherwise. */
    width?: number;
    onPress: (t: Tournament) => void;
}

/**
 * List card (spec 1.2): cover (image or generated sport art) with the status chip and sport emoji, a
 * 2-line title, dates and place, a capacity bar and a status-dependent bottom line. Drafts are dimmed.
 * Props only. List summaries lack progress and venue name (spec 19.10/19.11): dates and `customLocation`.
 */
export default function TournamentCard({ tournament: tr, lang, width, onPress }: Props) {
    const { t } = useTranslation();
    const theme = getSportTheme(tr.sport);
    const approved = tr.approvedTeams ?? 0;
    const full = approved >= tr.maxTeams;
    const closesAt = tr.registrationClosesAt;
    const closesSoon = !!closesAt && new Date(closesAt).getTime() - Date.now() < 3 * 86400000;

    let bottom: string | null = null;
    if (tr.status === 'REGISTRATION_OPEN' && closesAt) bottom = t('tournaments.registrationUntil', { date: fmtShortDate(closesAt, lang) });
    else if (tr.status === 'CANCELLED') bottom = t('tournaments.list.cancelled');

    const place = tr.customLocation ? ` · ${tr.customLocation}` : '';
    const summary = `${tr.title}, ${t(`tournaments.status.${tr.status}`)}, ${fmtDateRange(tr.startsAt, tr.endsAt, lang)}`;

    return (
        <Pressable
            testID={`tournament-card-${tr.id}`}
            onPress={() => onPress(tr)}
            accessibilityRole="button"
            accessibilityLabel={summary}
            className="rounded-2xl overflow-hidden bg-white dark:bg-cyber-card border border-gray-100 dark:border-cyber-border mb-3"
            style={[{ opacity: tr.status === 'DRAFT' ? 0.85 : 1 }, width ? { width, marginEnd: 12 } : null]}
        >
            <View style={{ height: 112 }}>
                {tr.imageUrl ? (
                    <Image source={{ uri: tr.imageUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                    <SportCover sport={tr.sport} height={112} />
                )}
                <View className="absolute top-2 start-2">
                    <TournamentStatusChip status={tr.status} testID={`tournament-card-status-${tr.id}`} />
                </View>
                <Text className="absolute top-2 end-3 text-[20px]" accessibilityElementsHidden importantForAccessibility="no">
                    {SPORT_EMOJI[tr.sport as keyof typeof SPORT_EMOJI] ?? ''}
                </Text>
            </View>
            <View className="p-3">
                <Text numberOfLines={2} className="text-[16px] font-extrabold text-gray-900 dark:text-cyber-text">
                    {tr.title}
                </Text>
                <Text numberOfLines={1} className="text-[13px] text-gray-600 dark:text-cyber-muted mt-1">
                    {fmtDateRange(tr.startsAt, tr.endsAt, lang)}
                    {place}
                </Text>
                <View className="flex-row items-center mt-2">
                    <View className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-cyber-border overflow-hidden me-2">
                        <View
                            style={{
                                width: `${capacityPct(approved, tr.maxTeams)}%`,
                                height: '100%',
                                backgroundColor: full ? '#9ca3af' : theme.base,
                            }}
                        />
                    </View>
                    <Text className="text-[12px] font-semibold text-gray-700 dark:text-cyber-text" style={{ fontVariant: ['tabular-nums'] }}>
                        {full ? t('tournaments.full') : t('tournaments.teamsCount', { approved, max: tr.maxTeams })}
                    </Text>
                </View>
                {bottom ? (
                    <Text
                        className={`text-[12px] mt-1.5 ${closesSoon && tr.status === 'REGISTRATION_OPEN' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-gray-500 dark:text-cyber-muted'}`}
                    >
                        {bottom}
                    </Text>
                ) : null}
            </View>
        </Pressable>
    );
}
