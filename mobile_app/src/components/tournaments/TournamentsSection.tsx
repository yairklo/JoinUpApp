import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import SectionHeader from '@/components/ui/SectionHeader';
import { useTournamentCapabilities, useTournaments } from '@/hooks/useTournaments';
import type { Tournament } from '@/types/tournament';
import TournamentCard from './TournamentCard';
import type { Lang } from './matchFormat';

const RAIL_LIMIT = 6;
const CARD_W = 280;

/**
 * Home rail "Tournaments" (spec 1.1): the app's entry point to the tournaments list (no tab slot).
 * Renders only when the server lets this viewer into the feature (`canView`) and the viewer can create tournaments, or at least one tournament exists.
 * Up to 6 cards horizontally; the header link opens the full list.
 */
export default function TournamentsSection() {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const { canCreate, canView } = useTournamentCapabilities();
    const { tournaments } = useTournaments({ limit: RAIL_LIMIT }, { enabled: canView });

    if (!canView) return null;
    if (tournaments.length === 0 && !canCreate) return null;

    return (
        <View testID="home-tournaments-rail" className="mt-4">
            <SectionHeader title={t('tournaments.title')} seeAllLabel={t('tournaments.all')} onSeeAll={() => router.push('/tournaments' as any)} />
            {tournaments.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                    {tournaments.slice(0, RAIL_LIMIT).map((x: Tournament) => (
                        <TournamentCard key={x.id} tournament={x} lang={lang} width={CARD_W} onPress={(tr) => router.push(`/tournaments/${tr.id}` as any)} />
                    ))}
                </ScrollView>
            ) : null}
        </View>
    );
}
