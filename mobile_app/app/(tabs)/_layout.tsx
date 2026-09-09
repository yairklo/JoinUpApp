import React, { useCallback } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TouchableOpacity, Text, View, useColorScheme, Image, Platform } from 'react-native';
import i18n, { changeLanguage } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';
import { useNotificationCounters } from '@/context/NotificationCountersContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toggleColorMode } from '@/theme/colorMode';

const BRAND = '#059669';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const { user } = useUser();
  const { friendRequests, unreadMessages } = useNotificationCounters();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';

  const HeaderRight = useCallback(() => (
    <View className="flex-row items-center gap-2 pr-4 pl-4">
      <TouchableOpacity
        onPress={() => {
          toggleColorMode(colorScheme).catch((e) => console.error('Color mode toggle error:', e));
        }}
        className="w-8 h-8 rounded-xl bg-brand-mist dark:bg-cyber-card items-center justify-center border border-brand-pale dark:border-cyber-border"
      >
        <Ionicons name={isDark ? 'sunny' : 'moon'} size={16} color={isDark ? '#facc15' : '#047857'} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => changeLanguage(i18n.language === 'en' ? 'he' : 'en')}
        className="h-8 px-2 bg-brand-mist dark:bg-cyber-card rounded-xl items-center justify-center border border-brand-pale dark:border-cyber-border"
      >
        <Text className="font-bold text-brand-dark dark:text-brand-pale text-xs">
          {i18n.language === 'en' ? 'EN' : 'HE'}
        </Text>
      </TouchableOpacity>
      <Link href="/notifications" asChild>
        <TouchableOpacity className="w-8 h-8 bg-brand-mist dark:bg-cyber-card rounded-xl items-center justify-center border border-brand-pale dark:border-cyber-border">
          <Ionicons name="notifications-outline" size={16} color={isDark ? '#f1f5f9' : '#0f172a'} />
        </TouchableOpacity>
      </Link>
      <Link href="/user/profile" asChild>
        <TouchableOpacity className="w-8 h-8 bg-brand-mist dark:bg-cyber-card rounded-xl items-center justify-center border border-brand-pale dark:border-cyber-border overflow-hidden">
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Ionicons name="person-outline" size={16} color={isDark ? '#f1f5f9' : '#0f172a'} />
          )}
        </TouchableOpacity>
      </Link>
    </View>
  ), [colorScheme, user, isDark]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: isDark ? '#94a3b8' : '#64748b',
        tabBarStyle: {
          backgroundColor: isDark ? 'rgba(17,26,44,0.96)' : 'rgba(255,255,255,0.96)',
          borderTopColor: isDark ? '#1e293b' : '#e2e8f0',
          height: 64 + (insets.bottom > 0 ? insets.bottom : 8),
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 6,
          elevation: 12,
          shadowColor: '#0f172a',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: isDark ? '#0b1220' : '#ffffff',
        },
        headerTitleStyle: {
          fontWeight: '800',
          color: isDark ? '#f1f5f9' : '#0f172a',
        },
        lazy: true,
      }}>
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color }) => <TabBarIcon name="map-marker" color={color} />,
        }}
      />

      <Tabs.Screen
        name="fields"
        options={{
          title: t('tabs.fields'),
          tabBarIcon: ({ color }) => <TabBarIcon name="th-list" color={color} />,
          tabBarButton: (props) => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('tabs.fields')}
              activeOpacity={0.7}
              onPress={() => router.push('/fields')}
              style={props.style}
              className="items-center justify-center"
            >
              {props.children}
            </TouchableOpacity>
          ),
        }}
      />

      {/* Center tab: games — visually elevated/larger since it's the app's home tab */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.games'),
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                marginTop: -18,
                backgroundColor: focused ? BRAND : (isDark ? '#1e293b' : '#e6f6ef'),
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 4,
                borderColor: isDark ? '#0b1220' : '#f6f8fa',
                ...Platform.select({
                  ios: {
                    shadowColor: '#059669',
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                  },
                  android: { elevation: 6 },
                }),
              }}
            >
              <FontAwesome name="soccer-ball-o" size={24} color={focused ? '#fff' : color} />
            </View>
          ),
          headerTitle: 'JoinUp',
          headerRight: HeaderRight,
        }}
      />

      <Tabs.Screen
        name="chats"
        options={{
          title: t('tabs.chats'),
          tabBarIcon: ({ color }) => <TabBarIcon name="comments" color={color} />,
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: t('tabs.friends'),
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
          tabBarBadge: friendRequests > 0 ? friendRequests : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
        }}
      />
    </Tabs>
  );
}
