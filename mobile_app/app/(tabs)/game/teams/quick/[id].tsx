import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, Image, Modal } from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { gamesApi } from '@/services/api';
import LoadingMotif from '@/components/loading/LoadingMotif';
import BackButton from '@/components/ui/BackButton';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import type { Team } from '@joinup/shared/types/game';

type Player = { id: string; name?: string | null; avatar?: string | null };

const JERSEY_COLORS = ['#f97316', '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#1f2937', '#14b8a6'];

const firstName = (name?: string | null) => (name || '?').trim().split(' ')[0] || '?';

function PlayerAvatar({ p, size = 28 }: { p: Player; size?: number }) {
  return (
    <Image
      source={{ uri: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || '?')}` }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e5e7eb' }}
    />
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
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
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

  const load = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const game = await gamesApi.getById(id, token);
      setParticipants((game.participants || []).filter((p) => p.status !== 'WAITLISTED'));
      const existing = (game.teams || []) as Team[];
      setTeams(
        existing.length > 0
          ? existing.map((tm) => ({ ...tm, playerIds: [...(tm.playerIds || [])] }))
          : [
              { id: 't1', name: t('teams.teamA'), color: '#f97316', playerIds: [] },
              { id: 't2', name: t('teams.teamB'), color: '#3b82f6', playerIds: [] },
            ]
      );
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
    const color = JERSEY_COLORS.find((c) => !used.has(c)) || '#6b7280';
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
      const token = await getToken();
      if (!token) return;
      await gamesApi.saveTeams(id, teams, token);
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
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingMotif id="passing-lane" label={t('teams.loadingTeamsSelection')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-gray-50">
      <Stack.Screen options={{ headerShown: false }} />

      <View
        className="bg-white border-b border-gray-100"
        style={{ flexDirection: row, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      >
        <BackButton />
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: '#111827', textAlign: align }}>
          {t('teams.quickEdit')}
        </Text>
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, opacity: saving ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('teams.save')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: Math.max(insets.bottom, 16) + 32 }}>
        <Text style={{ color: '#6b7280', fontSize: 13, textAlign: align }}>{t('teams.quickEditHint')}</Text>

        {/* Bench */}
        <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 12 }}>
          <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', color: '#4b5563' }}>{t('teams.benchTitle', { count: bench.length })}</Text>
            <View style={{ flexDirection: row, gap: 8 }}>
              <TouchableOpacity
                onPress={quickAssign}
                disabled={teams.length === 0 || bench.length === 0}
                style={{ flexDirection: row, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, opacity: teams.length === 0 || bench.length === 0 ? 0.4 : 1 }}
              >
                <FontAwesome name="random" size={12} color="#2563eb" />
                <Text style={{ color: '#2563eb', fontWeight: '600', fontSize: 12 }}>{t('teams.quickAssign')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={resetAll}
                style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: confirmReset ? '#dc2626' : 'transparent' }}
              >
                <Text style={{ color: confirmReset ? '#fff' : '#dc2626', fontWeight: '600', fontSize: 12 }}>
                  {confirmReset ? t('teams.confirmReset') : t('teams.resetAll')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
            {bench.length === 0 && <Text style={{ color: '#6b7280', fontStyle: 'italic' }}>{t('teams.benchEmpty')}</Text>}
            {bench.map((p) => {
              const sel = selectedId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelectedId(sel ? null : p.id)}
                  style={{ flexDirection: row, alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: sel ? '#2563eb' : '#d1d5db', backgroundColor: sel ? '#2563eb' : '#fff' }}
                >
                  <PlayerAvatar p={p} size={24} />
                  <Text style={{ color: sel ? '#fff' : '#111827', fontSize: 13 }}>{firstName(p.name)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Teams */}
        {teams.map((team) => {
          const isTarget = !!selectedId;
          return (
            <TouchableOpacity
              key={team.id}
              activeOpacity={isTarget ? 0.7 : 1}
              onPress={() => isTarget && assignTo(team.id)}
              style={{ backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: isTarget ? 2 : 1, borderStyle: isTarget ? 'dashed' : 'solid', borderColor: isTarget ? team.color : '#e5e7eb' }}
            >
              <View style={{ backgroundColor: team.color, padding: 10, flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{team.name}</Text>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{team.playerIds.length}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: row, gap: 4 }}>
                  <TouchableOpacity onPress={() => startEdit(team)} style={{ padding: 8 }} accessibilityLabel={t('teams.editTeam')}>
                    <FontAwesome name="pencil" size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeTeam(team.id)}
                    style={{ padding: 8, flexDirection: row, alignItems: 'center', gap: 4 }}
                    accessibilityLabel={t('teams.deleteTeam')}
                  >
                    {confirmRemoveId === team.id && <Text style={{ color: '#fecaca', fontSize: 11 }}>{t('teams.confirmDeleteTeam')}</Text>}
                    <FontAwesome name="trash-o" size={16} color={confirmRemoveId === team.id ? '#fecaca' : '#fff'} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ padding: 12 }}>
                {team.playerIds.length === 0 ? (
                  <View style={{ height: 80, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <FontAwesome name="user-plus" size={28} color={isTarget ? team.color : '#d1d5db'} />
                    <Text style={{ fontSize: 12, color: isTarget ? team.color : '#6b7280', fontWeight: isTarget ? '700' : '400' }}>
                      {isTarget ? t('teams.tapToAdd') : t('teams.selectFromBench')}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
                    {team.playerIds.map((pid) => {
                      const p = byId.get(pid);
                      if (!p) return null;
                      const sel = selectedId === pid;
                      return (
                        <TouchableOpacity
                          key={pid}
                          onPress={() => setSelectedId(sel ? null : pid)}
                          style={{ width: '48%', flexDirection: row, alignItems: 'center', gap: 6, padding: 6, borderRadius: 10, backgroundColor: sel ? '#2563eb' : '#f3f4f6' }}
                        >
                          <PlayerAvatar p={p} />
                          <Text numberOfLines={1} style={{ flex: 1, color: sel ? '#fff' : '#111827', fontSize: 13, textAlign: align }}>
                            {firstName(p.name)}
                          </Text>
                          {sel && (
                            <TouchableOpacity onPress={() => removeFromTeam(pid)} hitSlop={8}>
                              <FontAwesome name="times" size={14} color="#fff" />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          onPress={addTeam}
          style={{ minHeight: 80, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9ca3af', alignItems: 'center', justifyContent: 'center', flexDirection: row, gap: 8 }}
        >
          <FontAwesome name="plus" size={14} color="#6b7280" />
          <Text style={{ color: '#6b7280', fontWeight: '600' }}>{t('teams.addTeam')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 }}>
            <Text style={{ fontWeight: '700', fontSize: 18, textAlign: align }}>{t('teams.editTeam')}</Text>
            <TextInput
              value={tempName}
              onChangeText={setTempName}
              placeholder={t('teams.teamName')}
              textAlign={align}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10 }}
            />
            <Text style={{ fontWeight: '600', textAlign: align }}>{t('teams.teamColor')}</Text>
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 12 }}>
              {JERSEY_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setTempColor(c)}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: 3, borderColor: tempColor === c ? '#000' : 'transparent' }}
                />
              ))}
            </View>
            <View style={{ flexDirection: row, justifyContent: 'flex-end', gap: 8 }}>
              <TouchableOpacity onPress={() => setEditing(null)} style={{ padding: 10 }}>
                <Text style={{ color: '#6b7280', fontWeight: '600' }}>{t('teams.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} style={{ backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('teams.update')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
