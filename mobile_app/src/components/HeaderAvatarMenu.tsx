import React, { useCallback, useRef, useState } from 'react';
import { Dimensions, I18nManager, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import SafeImage from '@/components/SafeImage';

const CARD_WIDTH = 184;
const EDGE_MARGIN = 8;
const GAP = 6;

type Anchor = { x: number; y: number; width: number; height: number };

type Props = {
  avatarUrl?: string | null;
  hasAvatar: boolean;
  isDark: boolean;
};

/** Header avatar that opens a small Profile / Settings menu anchored under it. */
export default function HeaderAvatarMenu({ avatarUrl, hasAvatar, isDark }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const buttonRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [open, setOpen] = useState(false);

  const openMenu = useCallback(() => {
    const node = buttonRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const go = useCallback((href: '/user/profile' | '/settings') => {
    setOpen(false);
    router.push(href as any);
  }, [router]);

  // Align the card's end edge with the avatar's end edge. measureInWindow returns physical
  // coordinates, so in RTL (cluster on the left) the card extends rightwards from the avatar.
  const screenWidth = Dimensions.get('window').width;
  const rawLeft = anchor
    ? (I18nManager.isRTL ? anchor.x : anchor.x + anchor.width - CARD_WIDTH)
    : EDGE_MARGIN;
  const left = Math.max(EDGE_MARGIN, Math.min(rawLeft, screenWidth - CARD_WIDTH - EDGE_MARGIN));
  const top = anchor ? anchor.y + anchor.height + GAP : 0;

  const iconColor = isDark ? '#f1f5f9' : '#0f172a';

  return (
    <>
      <TouchableOpacity
        ref={buttonRef as any}
        testID="header-profile"
        onPress={openMenu}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('header.accountMenu', 'תפריט חשבון')}
        className="w-8 h-8 bg-brand-mist dark:bg-cyber-card rounded-xl items-center justify-center border border-brand-pale dark:border-cyber-border overflow-hidden"
      >
        {hasAvatar && avatarUrl ? (
          <SafeImage source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Ionicons name="person-outline" size={16} color={iconColor} />
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable
          style={{ flex: 1 }}
          onPress={close}
          accessibilityLabel={t('header.accountMenu', 'תפריט חשבון')}
        >
          <View
            accessibilityRole="menu"
            className="absolute rounded-2xl bg-white dark:bg-cyber-card border border-gray-200 dark:border-cyber-border overflow-hidden"
            style={{
              top,
              left,
              width: CARD_WIDTH,
              elevation: 8,
              shadowColor: '#0f172a',
              shadowOpacity: 0.15,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <MenuRow
              testID="header-menu-profile"
              icon="person-outline"
              label={t('header.menuProfile', 'פרופיל')}
              color={iconColor}
              onPress={() => go('/user/profile')}
            />
            <View className="h-px bg-gray-100 dark:bg-cyber-border" />
            <MenuRow
              testID="header-menu-settings"
              icon="settings-outline"
              label={t('header.menuSettings', 'הגדרות')}
              color={iconColor}
              onPress={() => go('/settings')}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuRow({ testID, icon, label, color, onPress }: {
  testID: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 px-4"
      style={{ minHeight: 48 }}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">{label}</Text>
    </TouchableOpacity>
  );
}
