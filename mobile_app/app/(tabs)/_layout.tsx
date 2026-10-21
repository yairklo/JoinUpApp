import React, { useCallback } from 'react';
import { Tabs, Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TouchableOpacity, Text, View, Image } from 'react-native';
import i18n, { changeLanguage } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useMyAvatar } from '@/hooks/useMyAvatar';
import { useNotificationCounters } from '@/context/NotificationCountersContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorMode } from '@/theme/ColorModeContext';

const BRAND = '#059669';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Outline glyph when inactive, filled when active, over a soft brand pill. */
function TabBarIcon({ name, focused, color, isDark }: { name: 'list' | 'football' | 'home' | 'chatbubbles' | 'people'; focused: boolean; color: string; isDark?: boolean }) {
  return (
    <View
      style={{
        width: 56,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? (isDark ? 'rgba(52,211,153,0.16)' : 'rgba(5,150,105,0.12)') : 'transparent',
      }}
    >
      <Ionicons name={(focused ? name : `${name}-outline`) as IoniconName} size={22} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const { colorMode, toggleColorMode } = useColorMode();
  const { imageUrl: avatarUrl, hasImage: hasAvatar } = useMyAvatar();
  const { friendRequests, unreadMessages } = useNotificationCounters();
  const insets = useSafeAreaInsets();
  const isDark = colorMode === 'dark';

  const HeaderRight = useCallback(() => (
    <View className="flex-row items-center gap-2 pr-4 pl-4">
      <TouchableOpacity
        onPress={toggleColorMode}
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
        <TouchableOpacity testID="header-profile" className="w-8 h-8 bg-brand-mist dark:bg-cyber-card rounded-xl items-center justify-center border border-brand-pale dark:border-cyber-border overflow-hidden">
          {hasAvatar ? (
            <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Ionicons name="person-outline" size={16} color={isDark ? '#f1f5f9' : '#0f172a'} />
          )}
        </TouchableOpacity>
      </Link>
    </View>
  ), [toggleColorMode, avatarUrl, hasAvatar, isDark]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: isDark ? '#34d399' : BRAND,
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
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          width: 56,
          height: 30,
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
        name="fields"
        options={{
          tabBarButtonTestID: 'tab-fields',
          title: t('tabs.fields'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="list" focused={focused} color={color} isDark={isDark} />,
          headerTitle: t('tabs.fields'),
          headerRight: HeaderRight,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarButtonTestID: 'tab-search',
          title: t('tabs.games', 'משחקים'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="football" focused={focused} color={color} isDark={isDark} />,
          headerTitle: t('tabs.games', 'משחקים'),
          headerRight: HeaderRight,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarButtonTestID: 'tab-home',
          title: t('tabs.home', 'בית'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="home" focused={focused} color={color} isDark={isDark} />,
          headerTitle: 'JoinUp',
          headerRight: HeaderRight,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          tabBarButtonTestID: 'tab-chats',
          title: t('tabs.chats'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="chatbubbles" focused={focused} color={color} isDark={isDark} />,
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
          headerTitle: t('tabs.chats'),
          headerRight: HeaderRight,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          tabBarButtonTestID: 'tab-friends',
          title: t('tabs.friends'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="people" focused={focused} color={color} isDark={isDark} />,
          tabBarBadge: friendRequests > 0 ? friendRequests : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
          headerTitle: t('tabs.friends'),
          headerRight: HeaderRight,
        }}
      />
      <Tabs.Screen
        name="game"
        options={{
          // Not a tab button (href: null) -- still one of this Tabs navigator's own
          // screens, so pushing into game/[id] etc. keeps the bottom tab bar visible
          // instead of covering it the way a root-stack screen would.
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
