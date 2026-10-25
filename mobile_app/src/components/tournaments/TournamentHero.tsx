import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SPORT_EMOJI, SPORT_MAPPING } from '@/utils/sports';
import SportCover, { getSportTheme } from '@/components/ui/SportCover';
import type { TournamentDetail } from '@/types/tournament';
import TournamentStatusChip from './TournamentStatusChip';
import { fmtDateRange, fmtShortDate } from './shellUtils';
import { pendingInvite } from './heroCta';
import type { Lang } from './matchFormat';
import { appAlert } from '@/i18n/appAlert';

interface Props {
    tournament: TournamentDetail;
    lang: Lang;
    liveCount: number;
    hasSchedule: boolean;
    onGoLive: () => void;
    onPublish: () => void;
    onShare: () => void;
    onEdit: () => void;
    onOpenInvite: (teamId: string) => void;
}

/**
 * Tournament hero (spec 2.1/2.2): 160px cover, then status chip, sport and format, 2-line title, meta
 * and the status-specific treatment (draft strip, registration caption, closed caption, progress bar +
 * live chip, cancelled alert) plus the invite banner. The primary CTA is the page's sticky bar.
 */
export default function TournamentHero({ tournament: tr, lang, liveCount, hasSchedule, onGoLive, onPublish, onShare, onEdit, onOpenInvite }: Props) {
    const { t } = useTranslation();
    const theme = getSportTheme(tr.sport);
    const invite = pendingInvite(tr);
    const total = tr.counts?.matchesTotal ?? 0;
    const done = tr.counts?.matchesFinished ?? 0;
    const approved = tr.counts?.teamsApproved ?? 0;

    const menu = () => {
        const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [{ text: t('tournaments.share') as string, onPress: onShare }];
        if (tr.capabilities?.canManage) buttons.push({ text: t('tournaments.hero.edit') as string, onPress: onEdit });
        buttons.push({ text: t('tournaments.hero.cancel') as string, style: 'cancel' });
        appAlert(tr.title, undefined, buttons);
    };

    return (
        <View testID="tournament-hero">
            {tr.status === 'DRAFT' ? (
                <View testID="tournament-draft-strip" className="flex-row items-center px-4 py-2 bg-amber-50 dark:bg-amber-900/30">
                    <Text className="flex-1 text-[13px] text-amber-900 dark:text-amber-200">{t('tournaments.draftBanner')}</Text>
                    {tr.capabilities?.canManage ? (
                        <Pressable testID="tournament-publish" onPress={onPublish} accessibilityRole="button" className="px-4 rounded-full bg-brand items-center justify-center" style={{ minHeight: 44 }}>
                            <Text className="text-white font-bold text-[13px]">{t('tournaments.publish')}</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}

            <View style={{ height: 160 }}>
                {tr.imageUrl ? (
                    <Image source={{ uri: tr.imageUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                    <SportCover sport={tr.sport} height={160} />
                )}
            </View>

            <View className="px-4 pt-3">
                <View className="flex-row items-center">
                    <TournamentStatusChip status={tr.status} />
                    <Text className="text-[13px] text-gray-600 dark:text-cyber-muted ms-2 flex-1" numberOfLines={1}>
                        {SPORT_EMOJI[tr.sport as keyof typeof SPORT_EMOJI]} {SPORT_MAPPING[tr.sport as keyof typeof SPORT_MAPPING]} · {t(`tournaments.format.${tr.format}`)}
                    </Text>
                    <Pressable
                        testID="tournament-menu"
                        onPress={menu}
                        accessibilityRole="button"
                        accessibilityLabel={t('tournaments.hero.menu')}
                        hitSlop={4}
                        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Ionicons name="ellipsis-vertical" size={20} color="#6b7280" />
                    </Pressable>
                </View>
                <Text accessibilityRole="header" numberOfLines={2} className="text-[22px] font-extrabold text-gray-900 dark:text-cyber-text mt-1">
                    {tr.title}
                </Text>
                <Text className="text-[13px] text-gray-600 dark:text-cyber-muted mt-1">
                    {fmtDateRange(tr.startsAt, tr.endsAt, lang)}
                    {tr.customLocation ? ` · ${tr.customLocation}` : ''} · {t('tournaments.teamsCount', { approved, max: tr.maxTeams })}
                </Text>

                {tr.status === 'REGISTRATION_OPEN' && tr.registrationClosesAt ? (
                    <Text className="text-[13px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1">
                        {t('tournaments.registrationUntil', { date: fmtShortDate(tr.registrationClosesAt, lang) })}
                    </Text>
                ) : null}
                {tr.status === 'REGISTRATION_CLOSED' ? (
                    <Text className="text-[13px] text-gray-600 dark:text-cyber-muted mt-1">
                        {t(hasSchedule ? 'tournaments.hero.closedPublished' : 'tournaments.hero.closedSoon')}
                    </Text>
                ) : null}

                {tr.status === 'IN_PROGRESS' ? (
                    <View className="mt-3">
                        {liveCount > 0 ? (
                            <Pressable testID="tournament-live-chip" onPress={onGoLive} accessibilityRole="button" className="self-start flex-row items-center rounded-full bg-red-50 dark:bg-red-900/30 px-3 mb-2" style={{ minHeight: 44 }}>
                                <View className="w-2 h-2 rounded-full bg-red-600 me-2" />
                                <Text className="text-[13px] font-bold text-red-700 dark:text-red-300">{t('tournaments.liveNow', { count: liveCount })}</Text>
                            </Pressable>
                        ) : null}
                        <View testID="tournament-progress" accessibilityRole="progressbar" accessibilityLabel={t('tournaments.progress', { finished: done, total })}>
                            <View className="h-2 rounded-full bg-gray-200 dark:bg-cyber-border overflow-hidden">
                                <View style={{ width: `${total ? Math.round((done / total) * 100) : 0}%`, height: '100%', backgroundColor: theme.base }} />
                            </View>
                            <Text className="text-[12px] text-gray-600 dark:text-cyber-muted mt-1" style={{ fontVariant: ['tabular-nums'] }}>
                                {t('tournaments.progress', { finished: done, total })}
                            </Text>
                        </View>
                    </View>
                ) : null}
            </View>

            {tr.status === 'CANCELLED' ? (
                <View testID="tournament-cancelled" accessibilityRole="alert" className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
                    <Text className="text-[13px] text-amber-900 dark:text-amber-200">{t('tournaments.cancelledBanner')}</Text>
                </View>
            ) : null}

            {invite ? (
                <Pressable
                    testID="tournament-invite-banner"
                    onPress={() => onOpenInvite(invite.teamId)}
                    accessibilityRole="button"
                    className="mx-4 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex-row items-center"
                    style={{ minHeight: 48 }}
                >
                    <Text className="flex-1 text-[14px] font-semibold text-emerald-900 dark:text-emerald-200">{t('tournaments.hero.invited', { name: invite.name })}</Text>
                    <Text className="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">{t('tournaments.hero.invitedAction')}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}
