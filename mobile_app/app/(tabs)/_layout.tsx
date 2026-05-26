import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TouchableOpacity, Text, View } from 'react-native';
import i18n, { changeLanguage } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563eb', // blue-600
        headerShown: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.games'),
          tabBarIcon: ({ color }) => <TabBarIcon name="soccer-ball-o" color={color} />,
          headerTitle: 'JoinUp Games',
          headerRight: () => (
            <View className="flex-row items-center gap-2 pr-4 pl-4">
              <TouchableOpacity 
                onPress={() => changeLanguage(i18n.language === 'en' ? 'he' : 'en')}
                className="h-8 px-2 bg-gray-100 rounded-lg items-center justify-center border border-gray-200"
              >
                <Text className="font-bold text-gray-800 text-xs">{i18n.language === 'en' ? 'EN' : 'HE'}</Text>
              </TouchableOpacity>
              <Link href="/notifications" asChild>
                <TouchableOpacity className="w-8 h-8 bg-gray-100 rounded-lg items-center justify-center border border-gray-200">
                  <Ionicons name="notifications-outline" size={16} color="#111827" />
                </TouchableOpacity>
              </Link>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color }) => <TabBarIcon name="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t('tabs.chats'),
          tabBarIcon: ({ color }) => <TabBarIcon name="comments" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
