import { View, Text, RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useMemo, useState } from 'react';
import { useGamesByDate } from '@/hooks/useGamesByDate';
import { Link, useRouter } from 'expo-router';
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
import { SPORT_MAPPING } from '@/utils/sports';

const SPORTS = [
  { id: 'ALL', label: 'הכל' },
  ...Object.keys(SPORT_MAPPING).map(key => ({
      id: key,
      label: SPORT_MAPPING[key]
  }))
];

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

  // Memoize filtered games to prevent heavy loops in render
  const filteredGames = useMemo(() => {
    if (!games) return [];
    if (selectedSport === 'ALL') return games;
    return games.filter((g: Game) => g.sport === selectedSport);
  }, [games, selectedSport]);

  const cappedGames = useMemo(() => filteredGames.slice(0, 3), [filteredGames]);

  const renderGameItem = useCallback((item: Game) => {
    const isJoined = item.participants?.some(p => p.id === user?.id);

    return (
      <View key={item.id} className="px-5 mb-4">
        <GameCard game={item} isJoined={isJoined}>
          <View className="flex-1">
            {isJoined ? (
              <LeaveGameButton gameId={item.id} onLeft={() => { }} />
            ) : (
              <JoinGameButton
                gameId={item.id}
                registrationOpensAt={item.registrationOpensAt}
                joinPolicy={item.joinPolicy}
                viewerParticipationStatus={item.viewerParticipationStatus}
                onJoined={() => { }}
              />
            )}
          </View>
        </GameCard>
      </View>
    );
  }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-cyber-bg" edges={['top']}>
      <ScrollView
        className="flex-1 mt-2"
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
        }
      >
        <View className="px-6 mb-4">
          <Text className="text-gray-400 font-bold text-xs uppercase tracking-widest">{t('home.welcomeBack')}</Text>
          <Text className="text-2xl font-black text-gray-900 dark:text-cyber-text">👋 {user?.firstName || t('home.friend')}</Text>
        </View>

        {/* Horizontal Sport Pills Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 pl-5 pr-5 flex-row">
          <View className="flex-row pb-2">
            {SPORTS.map((s) => {
              const isActive = selectedSport === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSelectedSport(s.id)}
                  className={`px-4 py-2 rounded-full mr-3 border ${isActive ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                >
                  <Text className={`font-bold text-sm ${isActive ? 'text-white' : 'text-gray-600'}`}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View className="w-5" />
          </View>
        </ScrollView>

        <MyGamesSection />
        <SeriesSection />
        <GamesDateNav selectedDate={selectedDate} onSelectDate={setSelectedDate} />

        {/* Games List */}
        {loading && games.length === 0 ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : cappedGames.length > 0 ? (
          <View className="mt-2">
            {cappedGames.map(renderGameItem)}

            {filteredGames.length > 3 && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(tabs)/search', params: { date: selectedDate, hideMap: 'true', sport: selectedSport !== 'ALL' ? selectedSport : undefined } })}
                className="mx-5 mb-4 p-4 rounded-2xl border border-blue-100 bg-blue-50 items-center"
              >
                <Text className="text-blue-600 font-bold text-center">הצג הכל ({filteredGames.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View className="items-center justify-center py-20 px-10">
            <View className="w-20 h-20 bg-gray-50 rounded-full items-center justify-center mb-4">
              <Ionicons name="calendar-outline" size={32} color="#9ca3af" />
            </View>
            <Text className="text-gray-900 font-black text-xl text-center">{t("home.noGamesToday")}</Text>
            <Text className="text-gray-500 text-center mt-2 leading-5">
              {t("home.noGamesDesc")}
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedDate(today)}
              className="mt-6 bg-blue-50 px-6 py-3 rounded-2xl"
            >
              <Text className="text-blue-600 font-bold">{t("home.backToToday")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <Link href="/game/new" asChild>
        <TouchableOpacity
          activeOpacity={0.8}
          className="absolute bottom-8 right-6 w-16 h-16 bg-blue-600 rounded-3xl items-center justify-center shadow-xl shadow-blue-200 border-4 border-white"
        >
          <Ionicons name="add" size={36} color="white" />
        </TouchableOpacity>
      </Link>
    </SafeAreaView>
  );
}
