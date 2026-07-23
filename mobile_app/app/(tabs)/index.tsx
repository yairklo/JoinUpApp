import { View, Text, RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { useGamesByDate } from '@/hooks/useGamesByDate';
import { useRouter } from 'expo-router';
import { Game } from '@/types/game';
import { useUser } from '@clerk/clerk-expo';
import GameCard from '@/components/GameCard';
import JoinGameButton from '@/components/JoinGameButton';
import LeaveGameButton from '@/components/LeaveGameButton';
import GamesDateNav from '@/components/GamesDateNav';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import MyGamesSection from '@/components/MyGamesSection';
import SeriesSection from '@/components/SeriesSection';
import GamesByCitySection from '@/components/GamesByCitySection';
import GamesByFriendsSection from '@/components/GamesByFriendsSection';
import GlobalSearchOmnibar from '@/components/GlobalSearchOmnibar';
import { SPORT_MAPPING } from '@/utils/sports';

const SPORTS = [
  { id: 'ALL', label: 'הכל' },
  ...Object.keys(SPORT_MAPPING).map(key => ({
      id: key,
      label: SPORT_MAPPING[key]
  }))
];

const BRAND = '#059669';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];
  const { games, loading, refreshGames, selectedDate, setSelectedDate } = useGamesByDate(today);
  const { user } = useUser();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSport, setSelectedSport] = useState('ALL');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refreshGames();
    setTimeout(() => setRefreshing(false), 800);
  }, [refreshGames]);

  const filteredGames = useMemo(() => {
    if (!games) return [];
    if (selectedSport === 'ALL') return games;
    return games.filter((g: Game) => g.sport === selectedSport);
  }, [games, selectedSport]);

  const cappedGames = useMemo(() => filteredGames.slice(0, 3), [filteredGames]);

  const renderGameItem = useCallback((item: Game) => {
    const isJoined =
      item.viewerParticipationStatus === 'CONFIRMED' ||
      item.participants?.some(p => p.id === user?.id);

    return (
      <View key={item.id} className="px-5 mb-4">
        <GameCard game={item} isJoined={!!isJoined}>
          <View className="flex-1">
            {isJoined ? (
              <LeaveGameButton gameId={item.id} onLeft={() => { }} />
            ) : (
                            <JoinGameButton
                                gameId={item.id}
                                registrationOpensAt={item.registrationOpensAt}
                                joinPolicy={item.joinPolicy}
                                viewerParticipationStatus={item.viewerParticipationStatus}
                                waitlistOfferPending={item.waitlistOfferPending}
                                isFull={item.currentPlayers >= item.maxPlayers}
                                onJoined={() => { }}
                            />
            )}
          </View>
        </GameCard>
      </View>
    );
  }, [user]);

  return (
    <View className="flex-1 bg-brand-mist/40 dark:bg-cyber-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />
        }
      >
        {/* Compact welcome / brand hero */}
        <View className="mx-5 mb-4 rounded-3xl overflow-hidden bg-brand-dark px-5 py-5">
          <Text className="text-brand-pale font-bold text-xs uppercase tracking-widest mb-1">
            {t('home.welcomeBack')}
          </Text>
          <Text className="text-2xl font-black text-white mb-1">
            היי {user?.firstName || t('home.friend')}
          </Text>
          <Text className="text-brand-pale/90 text-sm leading-5">
            מוצאים משחק. מצטרפים. משחקים.
          </Text>
        </View>

        <GlobalSearchOmnibar />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4"
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 }}
        >
          {SPORTS.map((s) => {
            const isActive = selectedSport === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => setSelectedSport(s.id)}
                style={{ flexShrink: 0, flexGrow: 0, alignSelf: 'center' }}
                className={`w-auto px-4 py-2 rounded-full mr-3 border ${
                  isActive
                    ? 'bg-brand border-brand'
                    : 'bg-white dark:bg-cyber-card border-gray-200 dark:border-cyber-border'
                }`}
              >
                <Text className={`font-bold text-sm ${isActive ? 'text-white' : 'text-gray-600 dark:text-cyber-muted'}`}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <MyGamesSection />
        <SeriesSection />
        <GamesByCitySection sportFilter={selectedSport !== 'ALL' ? selectedSport : undefined} />
        <GamesByFriendsSection sportFilter={selectedSport !== 'ALL' ? selectedSport : undefined} />
        <GamesDateNav selectedDate={selectedDate} onSelectDate={setSelectedDate} />

        {loading && games.length === 0 ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color={BRAND} />
          </View>
        ) : cappedGames.length > 0 ? (
          <View className="mt-2">
            {cappedGames.map(renderGameItem)}

            {filteredGames.length > 3 && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(tabs)/search', params: { date: selectedDate, hideMap: 'true', sport: selectedSport !== 'ALL' ? selectedSport : undefined } })}
                className="mx-5 mb-4 p-4 rounded-2xl border border-brand-pale bg-brand-mist items-center"
              >
                <Text className="text-brand-dark font-bold text-center">הצג הכל ({filteredGames.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View className="items-center justify-center py-20 px-10">
            <View className="w-20 h-20 bg-brand-mist rounded-full items-center justify-center mb-4">
              <Ionicons name="calendar-outline" size={32} color={BRAND} />
            </View>
            <Text className="text-gray-900 dark:text-cyber-text font-black text-xl text-center">{t("home.noGamesToday")}</Text>
            <Text className="text-gray-500 dark:text-cyber-muted text-center mt-2 leading-5">
              {t("home.noGamesDesc")}
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedDate(today)}
              className="mt-6 bg-brand-mist px-6 py-3 rounded-2xl"
            >
              <Text className="text-brand-dark font-bold">{t("home.backToToday")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
