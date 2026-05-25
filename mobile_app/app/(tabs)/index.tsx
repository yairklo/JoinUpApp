import { View, Text, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
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

export default function HomeScreen() {
  const today = new Date().toISOString().split('T')[0];
  const { games, loading, refreshGames, selectedDate, setSelectedDate } = useGamesByDate(today);
  const { user } = useUser();
  const onRefresh = useCallback(() => {
    refreshGames();
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
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Search/Filter Bar (Simulated) */}
      <View className="flex-row items-center justify-between px-6 py-4">
        <View>
          <Text className="text-gray-400 font-bold text-xs uppercase tracking-widest">Welcome back</Text>
          <Text className="text-2xl font-black text-gray-900">{user?.firstName || "Friend"} 👋</Text>
        </View>
        <Link href="/notifications" asChild>
          <TouchableOpacity className="w-12 h-12 bg-gray-50 rounded-2xl items-center justify-center border border-gray-100">
            <Ionicons name="notifications-outline" size={22} color="#111827" />
          </TouchableOpacity>
        </Link>
      </View>

      <GamesDateNav
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      <View className="flex-1 mt-2">
        <FlatList
          data={games}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderGameItem}
          contentContainerStyle={{ paddingVertical: 10 }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#2563eb" />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 px-10">
              <View className="w-20 h-20 bg-gray-50 rounded-full items-center justify-center mb-4">
                <Ionicons name="calendar-outline" size={32} color="#9ca3af" />
              </View>
              <Text className="text-gray-900 font-black text-xl text-center">אין משחקים בתאריך זה</Text>
              <Text className="text-gray-500 text-center mt-2 leading-5">
                נראה שאין משחקים זמינים כרגע. נסה לבחור תאריך אחר או צור משחק חדש!
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedDate(today)}
                className="mt-6 bg-blue-50 px-6 py-3 rounded-2xl"
              >
                <Text className="text-blue-600 font-bold">חזור להיום</Text>
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
