import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, type ViewStyle } from 'react-native';
import { getTokenOrThrow } from '@/utils/apiErrors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams, useNavigation, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { gamesApi } from '@/services/api';
import LoadingMotif from '@/components/loading/LoadingMotif';
import BackButton from '@/components/ui/BackButton';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import { useColorMode } from '@/theme/ColorModeContext';
import type { Team } from '@joinup/shared/types/game';
import SafeImage from '@/components/SafeImage';

type Player = { id: string; name?: string | null; avatar?: string | null };

const JERSEY_COLORS = ['#f97316', '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#1f2937', '#14b8a6'];

// Mirrors next_app's TeamBuilderDialog look: emerald brand, indigo quick-assign, cyber dark surfaces.
const PALETTE = {
  light: { bg: '#f6f8fa', card: '#ffffff', border: '#e8ecf1', text: '#0f172a', muted: '#64748b', subtle: '#f1f5f9', primary: '#059669', primaryDeep: '#047857', primarySoft: '#ecfdf5', danger: '#ef4444' },
  dark: { bg: '#0b1220', card: '#111a2c', border: '#1e293b', text: '#f1f5f9', muted: '#94a3b8', subtle: '#0f1828', primary: '#34d399', primaryDeep: '#10b981', primarySoft: 'rgba(52,211,153,0.12)', danger: '#f87171' },
};

// --- small hex color helpers (no MUI on native) ---
const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const alpha = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const darken = (hex: string, amt: number) => rgbToHex(...(hexToRgb(hex).map((v) => v * (1 - amt)) as [number, number, number]));
const lighten = (hex: string, amt: number) => rgbToHex(...(hexToRgb(hex).map((v) => v + (255 - v) * amt) as [number, number, number]));
const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Jersey colors like black vanish on the dark surface, so outlines/tints use a lightened variant.
const isVeryDark = (hex: string) => luminance(hex) < 0.12;

const firstName = (name?: string | null) => (name || '?').trim().split(' ')[0] || '?';

const AVATAR_FALLBACK = ['#059669', '#6366f1', '#f59e0b', '#0ea5e9', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];
const initials = (name?: string | null) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
};
const fallbackColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_FALLBACK[Math.abs(hash) % AVATAR_FALLBACK.length];
};

function PlayerAvatar({ p, size = 28, ring }: { p: Player; size?: number; ring?: string }) {
  const ringStyle = ring ? { borderWidth: 2, borderColor: ring } : null;
  if (p.avatar) {
    return <SafeImage source={{ uri: p.avatar }} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e5e7eb' }, ringStyle]} />;
  }
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: fallbackColor(p.name || p.id), alignItems: 'center', justifyContent: 'center' },
        ringStyle,
      ]}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials(p.name)}</Text>
    </View>
  );
}

/**
 * Mobile counterpart of the web "עריכה ידנית מהירה" (TeamBuilderDialog): pick a player from
 * the bench, tap a team to assign, then save the whole team layout in one PUT.
 */
export default function QuickTeamEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const getTokenRef = useAuthTokenRef();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { colorMode } = useColorMode();
  const isDark = colorMode === 'dark';
  const c = PALETTE[colorMode];
  const isRtl = i18n.language === 'he';
  const row = isRtl ? 'row-reverse' : 'row';
  const align = isRtl ? 'right' : 'left';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Team | null>(null);
  const [tempName, setTempName] = useState('');
  const [tempColor, setTempColor] = useState('');
  // Teams as last loaded/saved -- anything different is unsaved work the user would lose on back.
  const snapshotRef = useRef('');
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const game = await gamesApi.getById(id, token);
      setParticipants((game.participants || []).filter((p) => p.status !== 'WAITLISTED'));
      const existing = (game.teams || []) as Team[];
      const initial =
        existing.length > 0
          ? existing.map((tm) => ({ ...tm, playerIds: [...(tm.playerIds || [])] }))
          : [
              { id: 't1', name: t('teams.teamA'), color: '#f97316', playerIds: [] },
              { id: 't2', name: t('teams.teamB'), color: '#3b82f6', playerIds: [] },
            ];
      snapshotRef.current = JSON.stringify(initial);
      setTeams(initial);
    } catch (e) {
      console.error(e);
      Alert.alert(t('teams.error'), t('teams.loadFailed'));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [getTokenRef, id, router, t]);

  useEffect(() => {
    load();
  }, [load]);

  dirtyRef.current = !loading && JSON.stringify(teams) !== snapshotRef.current;

  // Back button, Android hardware back and the swipe gesture all go through beforeRemove, so one
  // listener guards every way out of the screen while there are unsaved assignments.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      Alert.alert(t('teams.unsavedTitle'), t('teams.unsavedBody'), [
        { text: t('teams.keepEditing'), style: 'cancel' },
        { text: t('teams.discardLeave'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation, t]);

  const bench = useMemo(() => {
    const assigned = new Set(teams.flatMap((tm) => tm.playerIds));
    return participants.filter((p) => !assigned.has(p.id));
  }, [teams, participants]);

  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  const assignTo = (teamId: string) => {
    if (!selectedId) return;
    setTeams((prev) =>
      prev.map((tm) => {
        const without = tm.playerIds.filter((x) => x !== selectedId);
        return tm.id === teamId ? { ...tm, playerIds: [...without, selectedId] } : { ...tm, playerIds: without };
      })
    );
    setSelectedId(null);
  };

  const removeFromTeam = (pid: string) => {
    setTeams((prev) => prev.map((tm) => ({ ...tm, playerIds: tm.playerIds.filter((x) => x !== pid) })));
    setSelectedId(null);
  };

  const quickAssign = () => {
    if (teams.length === 0 || bench.length === 0) return;
    setTeams((prev) => {
      const next = prev.map((tm) => ({ ...tm, playerIds: [...tm.playerIds] }));
      for (const p of bench) {
        const smallest = next.reduce((min, tm) => (tm.playerIds.length < min.playerIds.length ? tm : min), next[0]);
        smallest.playerIds.push(p.id);
      }
      return next;
    });
    setSelectedId(null);
  };

  const resetAll = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setTeams((prev) => prev.map((tm) => ({ ...tm, playerIds: [] })));
    setConfirmReset(false);
  };

  const addTeam = () => {
    const used = new Set(teams.map((tm) => tm.color));
    const color = JERSEY_COLORS.find((col) => !used.has(col)) || '#6b7280';
    setTeams([
      ...teams,
      { id: `t${Date.now()}`, name: t('teams.newTeamName', { n: teams.length + 1 }), color, playerIds: [] },
    ]);
  };

  const removeTeam = (teamId: string) => {
    if (confirmRemoveId !== teamId) {
      setConfirmRemoveId(teamId);
      return;
    }
    setTeams((prev) => prev.filter((tm) => tm.id !== teamId));
    setConfirmRemoveId(null);
  };

  const startEdit = (tm: Team) => {
    setEditing(tm);
    setTempName(tm.name);
    setTempColor(tm.color);
  };

  const saveEdit = () => {
    if (editing) {
      setTeams((prev) =>
        prev.map((tm) => (tm.id === editing.id ? { ...tm, name: tempName.trim() || tm.name, color: tempColor } : tm))
      );
    }
    setEditing(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const token = await getTokenOrThrow(getToken);
      await gamesApi.saveTeams(id, teams, token);
      snapshotRef.current = JSON.stringify(teams);
      dirtyRef.current = false;
      Alert.alert(t('teams.success'), t('teams.saved'));
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert(t('teams.error'), t('teams.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingMotif id="passing-lane" label={t('teams.loadingTeamsSelection')} />
      </SafeAreaView>
    );
  }

  const total = participants.length;
  const assignedCount = total - bench.length;
  const progress = total ? assignedCount / total : 0;
  const sizes = teams.map((tm) => tm.playerIds.length);
  const isBalanced = teams.length < 2 || Math.max(...sizes) - Math.min(...sizes) <= 1;
  const balanceColor = isBalanced ? c.primary : '#f59e0b';
  const selectedPlayer = selectedId ? byId.get(selectedId) : undefined;
  const selectedTeamId = selectedId ? teams.find((tm) => tm.playerIds.includes(selectedId))?.id ?? null : null;
  const quickDisabled = teams.length === 0 || bench.length === 0;
  const headerColor = (col: string) => (isDark && isVeryDark(col) ? lighten(col, 0.18) : col);
  const accentFor = (col: string) => (isDark && isVeryDark(col) ? lighten(col, 0.55) : col);
  const accentTextFor = (col: string) => (isDark ? lighten(accentFor(col), 0.3) : darken(col, 0.1));
  const cardShadow = isDark
    ? null
    : { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* --- Header --- */}
      <View style={{ backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={{ flexDirection: row, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: c.text, textAlign: align }}>{t('teams.quickEdit')}</Text>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: c.muted }}>
                {t('teams.assignedOf', { assigned: assignedCount, total })}
              </Text>
              {teams.length >= 2 && assignedCount > 0 && (
                <View
                  style={{ flexDirection: row, alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: alpha(balanceColor, 0.14) }}
                >
                  <MaterialCommunityIcons name="scale-balance" size={11} color={balanceColor} />
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: balanceColor }}>
                    {isBalanced ? t('teams.balanced') : t('teams.unbalanced')}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85} accessibilityRole="button">
            <LinearGradient
              colors={isDark ? ['#34d399', '#10b981'] : ['#10b981', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flexDirection: row,
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={isDark ? '#052e16' : '#fff'} />
              ) : (
                <Ionicons name="checkmark" size={17} color={isDark ? '#052e16' : '#fff'} />
              )}
              <Text style={{ color: isDark ? '#052e16' : '#fff', fontWeight: '800', fontSize: 14 }}>{t('teams.save')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {/* Progress bar: fills from the reading-start edge */}
        <View style={{ height: 3, flexDirection: row }}>
          <View style={{ width: `${progress * 100}%`, backgroundColor: c.primary }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: Math.max(insets.bottom, 16) + 96 }}>
        {/* --- Bench --- */}
        <View style={[{ backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }, cardShadow]}>
          <View style={{ flexDirection: row, alignItems: 'center', gap: 10, padding: 14, paddingBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft }}>
              <MaterialCommunityIcons name="seat-outline" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: c.text, textAlign: align }}>{t('teams.bench')}</Text>
              <Text style={{ fontSize: 12, color: c.muted, textAlign: align }}>
                {bench.length === 0 ? t('teams.allAssigned') : t('teams.benchWaiting', { count: bench.length })}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: row, gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
            <TouchableOpacity onPress={quickAssign} disabled={quickDisabled} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient
                colors={quickDisabled ? [c.border, c.border] : ['#6366f1', '#4f46e5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999 }}
              >
                <Ionicons name="sparkles" size={15} color={quickDisabled ? c.muted : '#fff'} />
                <Text style={{ color: quickDisabled ? c.muted : '#fff', fontWeight: '700', fontSize: 14 }}>{t('teams.quickAssign')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={resetAll}
              disabled={assignedCount === 0 && !confirmReset}
              activeOpacity={0.8}
              style={{
                flexDirection: row,
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: confirmReset ? c.danger : 'transparent',
                opacity: assignedCount === 0 && !confirmReset ? 0.4 : 1,
              }}
            >
              <Ionicons name="refresh" size={15} color={confirmReset ? '#fff' : c.danger} />
              <Text style={{ color: confirmReset ? '#fff' : c.danger, fontWeight: '700', fontSize: 13 }}>
                {confirmReset ? t('teams.confirmReset') : t('teams.resetAll')}
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.subtle, padding: 12, flexDirection: row, flexWrap: 'wrap', gap: 8, minHeight: 64 }}
          >
            {bench.length === 0 && (
              <View style={{ width: '100%', alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ fontSize: 24 }}>🎉</Text>
                <Text style={{ color: c.muted, fontWeight: '600', marginTop: 4 }}>{t('teams.benchEmpty')}</Text>
              </View>
            )}
            {bench.map((p) => {
              const sel = selectedId === p.id;
              const content = (
                <>
                  <View>
                    <PlayerAvatar p={p} size={26} />
                    {sel && (
                      <View
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 13, backgroundColor: 'rgba(4,47,36,0.55)', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="checkmark" size={15} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={{ color: sel ? (isDark ? '#052e16' : '#fff') : c.text, fontSize: 14, fontWeight: '600' }}>{firstName(p.name)}</Text>
                </>
              );
              const pillStyle: ViewStyle = { flexDirection: row, alignItems: 'center', gap: 6, paddingStart: 4, paddingEnd: 12, paddingVertical: 4, borderRadius: 999 };
              return (
                <TouchableOpacity key={p.id} onPress={() => setSelectedId(sel ? null : p.id)} activeOpacity={0.8} accessibilityState={{ selected: sel }}>
                  {sel ? (
                    <LinearGradient
                      colors={isDark ? ['#34d399', '#10b981'] : ['#059669', '#047857']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[pillStyle, { borderWidth: 1, borderColor: 'transparent', transform: [{ scale: 1.04 }] }]}
                    >
                      {content}
                    </LinearGradient>
                  ) : (
                    <View style={[pillStyle, { borderWidth: 1, borderColor: c.border, backgroundColor: c.card }]}>{content}</View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: row, alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
            <MaterialCommunityIcons name="gesture-tap" size={15} color={c.muted} />
            <Text style={{ flex: 1, fontSize: 12, color: c.muted, textAlign: align }}>{t('teams.quickEditHint')}</Text>
          </View>
        </View>

        {/* --- Teams --- */}
        {teams.map((team) => {
          const isTarget = !!selectedId && selectedTeamId !== team.id;
          const accent = accentFor(team.color);
          const accentText = accentTextFor(team.color);
          const confirmingDelete = confirmRemoveId === team.id;
          const count = team.playerIds.length;
          return (
            <TouchableOpacity
              key={team.id}
              activeOpacity={isTarget ? 0.8 : 1}
              onPress={() => isTarget && assignTo(team.id)}
              accessibilityRole={isTarget ? 'button' : undefined}
              style={[
                { backgroundColor: c.card, borderRadius: 20, overflow: 'hidden', borderWidth: isTarget ? 2 : 1, borderColor: isTarget ? accent : c.border },
                isTarget
                  ? { shadowColor: accent, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }
                  : cardShadow,
              ]}
            >
              {/* Gradient jersey header */}
              <LinearGradient
                colors={[headerColor(team.color), darken(headerColor(team.color), 0.28)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flexDirection: row, alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, overflow: 'hidden' }}
              >
                <MaterialCommunityIcons
                  name="tshirt-crew"
                  size={92}
                  color="rgba(255,255,255,0.13)"
                  style={{ position: 'absolute', top: -20, [isRtl ? 'left' : 'right']: -12, transform: [{ rotate: '-14deg' }] }}
                />
                <View
                  style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{count}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 16, textAlign: align }}>
                    {team.name}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500', textAlign: align }}>
                    {count === 1 ? t('teams.onePlayer') : t('teams.playersCount', { count })}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => startEdit(team)}
                  accessibilityLabel={t('teams.editTeam')}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="pencil" size={15} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeTeam(team.id)}
                  accessibilityLabel={t('teams.deleteTeam')}
                  style={{
                    height: 34,
                    minWidth: 34,
                    paddingHorizontal: confirmingDelete ? 10 : 0,
                    borderRadius: 17,
                    backgroundColor: confirmingDelete ? '#fff' : 'rgba(255,255,255,0.18)',
                    flexDirection: row,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Ionicons name="trash-outline" size={15} color={confirmingDelete ? '#ef4444' : '#fff'} />
                  {confirmingDelete && <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>{t('teams.confirmDeleteTeam')}</Text>}
                </TouchableOpacity>
              </LinearGradient>

              {/* Players */}
              <View style={{ padding: 10 }}>
                {count === 0 ? (
                  <View
                    style={{
                      minHeight: 112,
                      borderRadius: 14,
                      borderWidth: 2,
                      borderStyle: 'dashed',
                      borderColor: alpha(accent, isTarget ? 0.7 : 0.3),
                      backgroundColor: alpha(accent, isTarget ? 0.1 : 0.04),
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(accent, 0.14), alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person-add" size={20} color={accent} />
                    </View>
                    <Text style={{ fontSize: 13, color: isTarget ? accentText : c.muted, fontWeight: isTarget ? '700' : '500' }}>
                      {isTarget ? t('teams.tapToAdd') : t('teams.noPlayersYet')}
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 4 }}>
                    {team.playerIds.map((pid) => {
                      const p = byId.get(pid);
                      if (!p) return null;
                      const sel = selectedId === pid;
                      return (
                        <TouchableOpacity
                          key={pid}
                          onPress={() => setSelectedId(sel ? null : pid)}
                          activeOpacity={0.75}
                          style={{
                            flexDirection: row,
                            alignItems: 'center',
                            gap: 10,
                            paddingHorizontal: 8,
                            paddingVertical: 6,
                            borderRadius: 12,
                            backgroundColor: sel ? alpha(accent, 0.14) : 'transparent',
                            borderWidth: 1.5,
                            borderColor: sel ? accent : 'transparent',
                          }}
                        >
                          <PlayerAvatar p={p} size={36} ring={alpha(accent, 0.55)} />
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontWeight: '600', textAlign: align }}>
                              {p.name || '?'}
                            </Text>
                            {sel && (
                              <Text style={{ color: accentText, fontSize: 11, fontWeight: '600', textAlign: align }}>{t('teams.moveHint')}</Text>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => removeFromTeam(pid)}
                            hitSlop={8}
                            accessibilityLabel={t('teams.returnToBench')}
                            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Ionicons name="person-remove-outline" size={17} color={c.muted} />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                    {isTarget && (
                      <View
                        style={{
                          marginTop: 4,
                          paddingVertical: 9,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderStyle: 'dashed',
                          borderColor: alpha(accent, 0.6),
                          backgroundColor: alpha(accent, 0.08),
                          flexDirection: row,
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <Ionicons name="add" size={17} color={accentText} />
                        <Text style={{ color: accentText, fontWeight: '700', fontSize: 13 }}>{t('teams.addHere')}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* --- Add team --- */}
        <TouchableOpacity
          onPress={addTeam}
          activeOpacity={0.75}
          style={{
            minHeight: 76,
            borderRadius: 20,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: alpha(isDark ? '#94a3b8' : '#64748b', 0.3),
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: row,
            gap: 10,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: alpha(isDark ? '#94a3b8' : '#64748b', 0.12), alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={22} color={c.muted} />
          </View>
          <Text style={{ color: c.muted, fontWeight: '700', fontSize: 15 }}>{t('teams.addTeam')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* --- Floating "player selected" pill --- */}
      {selectedPlayer && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12) + 12, alignItems: 'center' }}>
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: row,
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 6,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: isDark ? '#f1f5f9' : '#0f172a',
              maxWidth: '90%',
              shadowColor: '#000',
              shadowOpacity: 0.3,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 10,
            }}
          >
            <PlayerAvatar p={selectedPlayer} size={34} />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: isDark ? '#0f172a' : '#fff', fontSize: 14, fontWeight: '700' }}>
              {t('teams.pickTeamFor', { name: firstName(selectedPlayer.name) })}
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedId(null)}
              accessibilityLabel={t('teams.cancelSelection')}
              style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.14)' }}
            >
              <Ionicons name="close" size={17} color={isDark ? '#0f172a' : '#fff'} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* --- Edit team sheet --- */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.55)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 20, overflow: 'hidden' }}>
            {/* Live preview of the team header */}
            <LinearGradient
              colors={[headerColor(tempColor || '#6b7280'), darken(headerColor(tempColor || '#6b7280'), 0.28)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingHorizontal: 20, paddingVertical: 18, overflow: 'hidden' }}
            >
              <MaterialCommunityIcons
                name="tshirt-crew"
                size={104}
                color="rgba(255,255,255,0.14)"
                style={{ position: 'absolute', top: -18, [isRtl ? 'left' : 'right']: -10, transform: [{ rotate: '-14deg' }] }}
              />
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', textAlign: align }}>{t('teams.editTeam')}</Text>
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: align }}>
                {tempName.trim() || t('teams.untitled')}
              </Text>
            </LinearGradient>

            <View style={{ padding: 20, gap: 12 }}>
              <Text style={{ fontWeight: '600', color: c.muted, fontSize: 13, textAlign: align }}>{t('teams.teamName')}</Text>
              <TextInput
                value={tempName}
                onChangeText={setTempName}
                placeholder={t('teams.teamName')}
                placeholderTextColor={c.muted}
                textAlign={align}
                onSubmitEditing={saveEdit}
                style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: c.text, backgroundColor: c.subtle, fontSize: 15 }}
              />
              <Text style={{ fontWeight: '600', color: c.muted, fontSize: 13, textAlign: align, marginTop: 4 }}>{t('teams.teamColor')}</Text>
              <View style={{ flexDirection: row, flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 }}>
                {JERSEY_COLORS.map((col) => {
                  const active = tempColor === col;
                  return (
                    <TouchableOpacity
                      key={col}
                      onPress={() => setTempColor(col)}
                      accessibilityState={{ selected: active }}
                      style={{ width: '25%', alignItems: 'center' }}
                    >
                      <View style={{ padding: 3, borderRadius: 26, borderWidth: 2, borderColor: active ? accentFor(col) : 'transparent' }}>
                        <LinearGradient
                          colors={[col, darken(col, 0.28)]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
                        >
                          {active && <Ionicons name="checkmark" size={20} color="#fff" />}
                        </LinearGradient>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: row, justifyContent: 'flex-end', gap: 8, paddingHorizontal: 20, paddingBottom: 18 }}>
              <TouchableOpacity onPress={() => setEditing(null)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 }}>
                <Text style={{ color: c.muted, fontWeight: '700' }}>{t('teams.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} style={{ backgroundColor: c.primary, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999 }}>
                <Text style={{ color: isDark ? '#052e16' : '#fff', fontWeight: '800' }}>{t('teams.update')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
