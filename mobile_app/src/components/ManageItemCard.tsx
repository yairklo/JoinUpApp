import React from 'react';
import { I18nManager, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { describeStart } from '@joinup/shared/manage';
import type { ManageItem, ManagedGame } from '@/services/api/manage';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** "Today 20:00" / "Tomorrow 20:00" / "Saturday 20:00 • 12/12", all in Jerusalem time. */
function useWhenLabel() {
    const { t } = useTranslation();
    return (startIso: string) => {
        const when = describeStart(startIso);
        if (!when) return '';
        if (when.kind === 'today') return `${t('common.today')} ${when.time}`;
        if (when.kind === 'tomorrow') return `${t('common.tomorrow')} ${when.time}`;
        return `${t(`common.days.${DAY_KEYS[when.dayOfWeek]}`)} ${when.time} • ${when.day}/${when.month}`;
    };
}

function Stat({ icon, text, tone = 'muted' }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone?: 'muted' | 'alert' }) {
    const color = tone === 'alert' ? '#b45309' : '#64748b';
    return (
        <View className={`flex-row items-center rounded-full px-2 py-1 mr-2 mb-1 ${tone === 'alert' ? 'bg-amber-100' : 'bg-gray-100 dark:bg-cyber-border'}`}>
            <Ionicons name={icon} size={12} color={color} />
            <Text className={`text-xs font-bold ml-1 ${tone === 'alert' ? 'text-amber-800' : 'text-gray-600 dark:text-cyber-muted'}`}>{text}</Text>
        </View>
    );
}

function GameStats({ game }: { game: ManagedGame }) {
    const { t } = useTranslation();
    return (
        <View className="flex-row flex-wrap mt-2">
            <Stat icon="people-outline" text={t('manage.registered', { count: game.confirmedCount, max: game.maxPlayers })} />
            {game.pendingCount > 0 && (
                <Stat icon="hourglass-outline" tone="alert" text={t('manage.pending', { count: game.pendingCount })} />
            )}
            {game.waitlistCount > 0 && (
                <Stat icon="list-outline" text={t('manage.waitlist', { count: game.waitlistCount })} />
            )}
        </View>
    );
}

export default function ManageItemCard({ item }: { item: ManageItem }) {
    const { t } = useTranslation();
    const router = useRouter();
    const when = useWhenLabel();
    const textAlign = I18nManager.isRTL ? 'right' : 'left';

    const isGroup = item.kind === 'group';
    const game = isGroup ? item.group.nextGame : item.game;
    const role = isGroup ? item.group.role : item.game.role;
    const title = isGroup ? item.group.name : (item.game.title || item.game.fieldName);
    const subtitle = isGroup ? item.group.fieldName : item.game.fieldName;
    const mainPath = isGroup ? `/series/${item.group.id}` : `/game/${item.game.id}`;
    const hasNextGame = isGroup && !!game;

    return (
        <View className="mx-5 mb-3 rounded-2xl bg-white dark:bg-cyber-card border border-brand-pale dark:border-cyber-border p-4">
            <TouchableOpacity onPress={() => router.push(mainPath as any)} activeOpacity={0.85} accessibilityRole="button">
                <View className="flex-row items-center mb-2">
                    <View className={`flex-row items-center px-2 py-1 rounded-full ${isGroup ? 'bg-brand' : 'bg-slate-600'}`}>
                        <Ionicons name={isGroup ? 'people' : 'football-outline'} size={10} color="#fff" />
                        <Text className="text-white text-[10px] font-bold ml-1">
                            {isGroup ? t('manage.badgeGroup') : t('manage.badgeGame')}
                        </Text>
                    </View>
                    <Text className="text-gray-500 dark:text-cyber-muted text-[11px] font-semibold ml-2">
                        {role === 'ORGANIZER' ? t('manage.roleOrganizer') : t('manage.roleManager')}
                    </Text>
                </View>
                <Text className="font-bold text-lg text-gray-900 dark:text-cyber-text" numberOfLines={1} style={{ textAlign }}>
                    {title}
                </Text>
                <Text className="text-gray-500 dark:text-cyber-muted text-xs mt-0.5" numberOfLines={1} style={{ textAlign }}>
                    {subtitle}
                </Text>
                <Text className="text-brand-dark dark:text-brand-light text-sm font-bold mt-2" style={{ textAlign }}>
                    {game ? when(game.start) : t('manage.noUpcoming')}
                </Text>
                {game ? <GameStats game={game} /> : null}
                {isGroup && (
                    <Text className="text-gray-500 dark:text-cyber-muted text-xs mt-1" style={{ textAlign }}>
                        {t('manage.members', { count: item.group.memberCount })}
                    </Text>
                )}
            </TouchableOpacity>

            <View className="flex-row mt-3">
                {hasNextGame && game ? (
                    <TouchableOpacity
                        onPress={() => router.push(`/game/${game.id}` as any)}
                        className="flex-1 bg-brand py-2.5 rounded-xl items-center mr-2"
                        accessibilityRole="button"
                    >
                        <Text className="text-white font-bold text-sm">{t('manage.openNextGame')}</Text>
                    </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                    onPress={() => router.push(mainPath as any)}
                    className={`flex-1 py-2.5 rounded-xl items-center border ${hasNextGame ? 'border-brand-pale bg-brand-mist dark:bg-cyber-border dark:border-cyber-border' : 'border-brand bg-brand'}`}
                    accessibilityRole="button"
                >
                    <Text className={`font-bold text-sm ${hasNextGame ? 'text-brand-dark dark:text-brand-light' : 'text-white'}`}>
                        {isGroup ? t('manage.openGroup') : t('manage.openGame')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
