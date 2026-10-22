import React, { useMemo } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBracket, useStandings } from '@/hooks/useTournamentViews';
import { getSportTheme } from '@/components/ui/SportCover';
import type { TournamentDetail } from '@/types/tournament';
import TeamBadge from './TeamBadge';
import { deriveChampion } from './shellUtils';

export const tournamentLink = (id: string) => `https://join-up-app.vercel.app/tournaments/${encodeURIComponent(id)}`;

/**
 * Champion moment for a COMPLETED tournament (spec 2.4): sport deep->ink surface, champion badge, podium
 * line when 2nd/3rd are known, share. Champion is derived on the client (spec 19.1); renders nothing
 * when it cannot be derived (CUSTOM format, incomplete table). The confetti burst is not implemented.
 */
export default function ChampionBanner({ tournament }: { tournament: TournamentDetail }) {
    const { t } = useTranslation();
    const theme = getSportTheme(tournament.sport);
    const knockout = tournament.format === 'KNOCKOUT' || tournament.format === 'GROUPS_KNOCKOUT';
    const bracket = useBracket(knockout ? tournament.id : undefined);
    const standings = useStandings(tournament.format === 'LEAGUE' ? tournament.id : undefined);
    const result = useMemo(
        () => deriveChampion(tournament.format, bracket.stages, standings.tables),
        [tournament.format, bracket.stages, standings.tables]
    );
    if (!result) return null;
    const { champion, second, third } = result;

    return (
        <LinearGradient colors={[theme.deep, theme.ink]} testID="tournament-champion" className="mx-4 mt-3 rounded-2xl" style={{ borderRadius: 16, padding: 20, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.glow }}>
                <Ionicons name="trophy" size={34} color={theme.glow} />
            </View>
            <Text accessibilityRole="header" style={{ color: theme.glow, marginTop: 8, fontSize: 13, fontWeight: '700' }}>
                {t('tournaments.champion.title', { title: tournament.title })}
            </Text>
            <View style={{ marginTop: 8, maxWidth: '100%' }}>
                <TeamBadge name={champion.name} color={champion.color} logoUrl={champion.logoUrl} size={40} lines={2} bold testID="tournament-champion-team" />
            </View>
            {second || third ? (
                <View style={{ flexDirection: 'row', marginTop: 12, gap: 16 }}>
                    {second ? (
                        <Text style={{ color: '#ffffff', fontSize: 13 }} accessibilityLabel={`${t('tournaments.champion.runnerUp')}: ${second.name}`}>
                            🥈 {second.name}
                        </Text>
                    ) : null}
                    {third ? (
                        <Text style={{ color: '#ffffff', fontSize: 13 }} accessibilityLabel={`${t('tournaments.champion.third')}: ${third.name}`}>
                            🥉 {third.name}
                        </Text>
                    ) : null}
                </View>
            ) : null}
            <Pressable
                testID="tournament-share"
                onPress={() =>
                    void Share.share({
                        message: `${t('tournaments.champion.shareText', { team: champion.name, title: tournament.title })}\n${tournamentLink(tournament.id)}`,
                    })
                }
                accessibilityRole="button"
                style={{ marginTop: 14, minHeight: 44, paddingHorizontal: 24, borderRadius: 22, borderWidth: 1, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}
            >
                <Text style={{ color: '#ffffff', fontWeight: '700' }}>{t('tournaments.champion.share')}</Text>
            </Pressable>
        </LinearGradient>
    );
}
