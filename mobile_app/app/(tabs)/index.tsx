import { View, Text, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView, Appearance, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback } from 'react';
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

export default function HomeScreen() {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const { games, loading, refreshGames, selectedDate, setSelectedDate } = useGamesByDate(today);
  const { user } = useUser();
  const colorScheme = useColorScheme();
  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refreshGames();
    // Simulate a brief delay so the spinner shows properly for the user interaction
    setTimeout(() => setRefreshing(false), 800);
  }, [refreshGames]);

  const renderGameItem = useCallback(({ item }: { item: Game }) => {
    const isJoined = item.participants?.some(p => p.id === user?.id);

    return (
      <View className="px-5">
        <GameCard game={item} isJoined={isJoined}>
          <View className="flex-1">
            {isJoined ? (
              <LeaveGameButton gameId={item.id} onLeft={() => { }} />
            ) : (
              <JoinGameButton
                gameId={item.id}
                registrationOpensAt={item.registrationOpensAt}
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
      <View className="flex-1 mt-2">
        <FlatList
          data={games}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            <View>
              <View className="px-6 mb-4 flex-row justify-between items-center">
                <View>
                  <Text className="text-gray-400 font-bold text-xs uppercase tracking-widest">{t("home.welcomeBack")}</Text>
                  <Text className="text-2xl font-black text-gray-900 dark:text-cyber-text">👋 {user?.firstName || t("home.friend")}</Text>
                </View>
                <TouchableOpacity 
                  onPress={() => {
                      const newTheme = colorScheme === 'dark' ? 'light' : 'dark';
                      Appearance.setColorScheme(newTheme);
                  }}
                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-cyber-card items-center justify-center shadow-sm"
                >
                  <Ionicons name={colorScheme === 'dark' ? 'sunny' : 'moon'} size={20} color={colorScheme === 'dark' ? '#facc15' : '#4b5563'} />
                </TouchableOpacity>
              </View>
              <MyGamesSection />
              <SeriesSection />
              <GamesDateNav
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </View>
          }
          renderItem={renderGameItem}
          contentContainerStyle={{ paddingVertical: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
          }
          ListEmptyComponent={
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
          }
        />
      </View>

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
