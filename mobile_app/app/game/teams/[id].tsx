import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { gamesApi } from '@/services/api';
import { SocketManager } from '@/services/socketManager';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatLogic } from '@/hooks/useChatLogic';

type PickState = {
  gameId: string;
  organizerId: string;
  pickDrawAt: string | null;
  pickingStartsAt: string | null;
  pickDrawExecutedAt: string | null;
  pickSessionStatus: string;
  pickTurnOrder: string[];
  currentTurnManagerId: string | null;
  managers: { id: string; name?: string | null; avatar?: string | null }[];
  teams: {
    id: string;
    name: string;
    color: string;
    managerId?: string | null;
    players: { id: string; name?: string | null }[];
  }[];
  bench: { id: string; name?: string | null }[];
  managerPickChatId: string | null;
  pendingTrades: {
    id: string;
    proposerId: string;
    receiverId: string;
    offeredPlayerIds: string[];
    requestedPlayerIds: string[];
  }[];
};

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pickStatusLabel(status: string, t: (key: string) => string) {
  const map: Record<string, string> = {
    IDLE: t('teams.statusIdle'),
    DRAW_SCHEDULED: t('teams.statusDrawScheduled'),
    ORDER_SET: t('teams.statusOrderSet'),
    PICKING: t('teams.statusPicking'),
    COMPLETED: t('teams.statusCompleted'),
  };
  return map[status] || status;
}

export default function LiveTeamManagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<PickState | null>(null);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [drawLocal, setDrawLocal] = useState('');
  const [pickLocal, setPickLocal] = useState('');
  const [waitingOffline, setWaitingOffline] = useState(false);
  const [tradeReceiverId, setTradeReceiverId] = useState<string | null>(null);
  const [offeredId, setOfferedId] = useState<string | null>(null);
  const [requestedId, setRequestedId] = useState<string | null>(null);

  const userId = user?.id || '';
  const isOrganizer = state?.organizerId === userId;
  const myTurn = state?.currentTurnManagerId === userId;
  const currentOnline = state?.currentTurnManagerId ? !!presence[state.currentTurnManagerId] : false;
  const pickingActive = state?.pickSessionStatus === 'PICKING';
  const showOfflineControls =
    !!pickingActive &&
    !!isOrganizer &&
    !!state?.currentTurnManagerId &&
    state.currentTurnManagerId !== userId &&
    !currentOnline;

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await gamesApi.getPickSession(id, token);
      setState(data);
      setDrawLocal(toLocalInput(data.pickDrawAt));
      setPickLocal(toLocalInput(data.pickingStartsAt));
    } catch (e) {
      console.error(e);
      Alert.alert(t('teams.error'), t('teams.loadFailed'));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [getToken, id, router, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    SocketManager.emit('joinPickSession', id);

    const unsubState = SocketManager.on('pick:state', (payload: PickState) => {
      if (payload?.gameId === id) setState(payload);
    });
    const unsubPresence = SocketManager.on(
      'pick:presence',
      (payload: { userId: string; isOnline: boolean; gameId?: string }) => {
        if (payload.gameId && payload.gameId !== id) return;
        setPresence((prev) => ({ ...prev, [payload.userId]: payload.isOnline }));
      }
    );
    const unsubClassic = SocketManager.on(
      'presence:update',
      (payload: { userId: string; isOnline: boolean }) => {
        setPresence((prev) => ({ ...prev, [payload.userId]: payload.isOnline }));
      }
    );
    const unsubTrade = SocketManager.on('trade:proposed', () => load());
    const unsubResolved = SocketManager.on('trade:resolved', () => load());

    return () => {
      SocketManager.emit('leavePickSession', id);
      unsubState();
      unsubPresence();
      unsubClassic();
      unsubTrade();
      unsubResolved();
    };
  }, [id, load]);

  useEffect(() => {
    for (const m of state?.managers || []) {
      SocketManager.emit('subscribePresence', m.id);
    }
  }, [state?.managers]);

  const managerName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of state?.managers || []) map[m.id] = m.name || m.id;
    return map;
  }, [state?.managers]);

  const myTeam = state?.teams.find((t) => t.managerId === userId);
  const receiverTeam = state?.teams.find((t) => t.managerId === tradeReceiverId);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert(t('teams.error'), e?.message || t('teams.failed'));
    } finally {
      setBusy(false);
    }
  };

  const saveSchedule = () =>
    run(async () => {
      const token = await getToken();
      if (!token) return;
      const data = await gamesApi.updatePickSchedule(
        id,
        {
          pickDrawAt: drawLocal ? new Date(drawLocal).toISOString() : null,
          pickingStartsAt: pickLocal ? new Date(pickLocal).toISOString() : null,
        },
        token
      );
      setState(data);
      Alert.alert(t('teams.success'), t('teams.scheduleSaved'));
    });

  const moveOrder = (index: number, dir: -1 | 1) =>
    run(async () => {
      if (!state || !isOrganizer) return;
      const order = [...state.pickTurnOrder];
      const j = index + dir;
      if (j < 0 || j >= order.length) return;
      [order[index], order[j]] = [order[j], order[index]];
      const token = await getToken();
      if (!token) return;
      const data = await gamesApi.reorderPickOrder(id, order, token);
      setState(data);
    });

  const pickPlayer = (playerId: string, onBehalf?: boolean) =>
    run(async () => {
      const token = await getToken();
      if (!token) return;
      const data = await gamesApi.makePick(
        id,
        {
          playerId,
          ...(onBehalf && state?.currentTurnManagerId
            ? { onBehalfOfManagerId: state.currentTurnManagerId }
            : {}),
        },
        token
      );
      setState(data);
      setWaitingOffline(false);
    });

  const submitTrade = () =>
    run(async () => {
      if (!tradeReceiverId || !offeredId || !requestedId) {
        throw new Error(t('teams.selectTradePartners'));
      }
      const token = await getToken();
      if (!token) return;
      const result = await gamesApi.proposeTrade(
        id,
        {
          receiverId: tradeReceiverId,
          offeredPlayerIds: [offeredId],
          requestedPlayerIds: [requestedId],
        },
        token
      );
      if (result?.state) setState(result.state);
      else await load();
    });

  const resolve = (tradeId: string, approve: boolean) =>
    run(async () => {
      const token = await getToken();
      if (!token) return;
      const data = await gamesApi.resolveTrade(id, tradeId, approve, token);
      setState(data);
    });

  if (loading || !state) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Stack.Screen options={{ title: t('teams.live') }} />
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <Stack.Screen options={{ title: t('teams.live') }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {isOrganizer && (
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 8 }}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{t('teams.scheduleTitle')}</Text>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>{t('teams.scheduleHint')}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600' }}>{t('teams.drawTime')}</Text>
            <TextInput
              value={drawLocal}
              onChangeText={setDrawLocal}
              placeholder="2026-07-26T18:00"
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10 }}
            />
            <Text style={{ fontSize: 12, fontWeight: '600' }}>{t('teams.pickingStartTime')}</Text>
            <TextInput
              value={pickLocal}
              onChangeText={setPickLocal}
              placeholder="2026-07-26T19:00"
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10 }}
            />
            <TouchableOpacity
              onPress={saveSchedule}
              disabled={busy}
              style={{ backgroundColor: '#2563eb', padding: 12, borderRadius: 8, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t('teams.saveSchedule')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
            {t('teams.status', { status: pickStatusLabel(state.pickSessionStatus, t) })}
          </Text>
          {(state.pickTurnOrder.length ? state.pickTurnOrder : state.managers.map((m) => m.id)).map(
            (mid, idx) => {
              const online = !!presence[mid];
              const isCurrent = state.currentTurnManagerId === mid;
              return (
                <View
                  key={mid}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 8,
                    backgroundColor: isCurrent ? '#eff6ff' : 'transparent',
                    borderRadius: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  <FontAwesome name="circle" size={10} color={online ? '#22c55e' : '#9ca3af'} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: isCurrent ? '800' : '500' }}>
                      {idx + 1}. {managerName[mid]}
                      {isCurrent ? t('teams.currentTurn') : ''}
                    </Text>
                    <Text style={{ color: '#6b7280', fontSize: 12 }}>
                      {online ? t('teams.online') : t('teams.offline')}
                    </Text>
                  </View>
                  {isOrganizer && !!state.pickDrawExecutedAt && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => moveOrder(idx, -1)} disabled={busy || idx === 0}>
                        <FontAwesome name="arrow-up" size={16} color="#374151" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveOrder(idx, 1)}
                        disabled={busy || idx === state.pickTurnOrder.length - 1}
                      >
                        <FontAwesome name="arrow-down" size={16} color="#374151" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }
          )}

          {showOfflineControls && (
            <View style={{ marginTop: 10, padding: 10, backgroundColor: '#fff7ed', borderRadius: 8 }}>
              <Text style={{ fontWeight: '600', marginBottom: 6 }}>{t('teams.managerOffline')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setWaitingOffline(false)}
                  style={{ backgroundColor: '#ea580c', padding: 8, borderRadius: 6 }}
                >
                  <Text style={{ color: '#fff' }}>{t('teams.pickForThem')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setWaitingOffline(true)}
                  style={{ borderWidth: 1, borderColor: '#ea580c', padding: 8, borderRadius: 6 }}
                >
                  <Text style={{ color: '#ea580c' }}>{t('teams.wait')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ marginTop: 6, fontSize: 12, color: '#9a3412' }}>
                {waitingOffline ? t('teams.noSkipWaiting') : t('teams.noSkipSelectBench')}
              </Text>
            </View>
          )}
        </View>

        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
            {t('teams.bench', { count: state.bench.length })}
          </Text>
          {state.bench.map((p) => {
            const canPick =
              pickingActive &&
              ((myTurn && !showOfflineControls) || (showOfflineControls && !waitingOffline));
            return (
              <TouchableOpacity
                key={p.id}
                disabled={busy || !canPick}
                onPress={() => pickPlayer(p.id, !!(showOfflineControls && !waitingOffline))}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: canPick ? '#f0fdf4' : '#f9fafb',
                  marginBottom: 6,
                  opacity: canPick ? 1 : 0.6,
                }}
              >
                <Text>{p.name || p.id}</Text>
              </TouchableOpacity>
            );
          })}
          {state.bench.length === 0 && (
            <Text style={{ color: '#6b7280' }}>{t('teams.noUnassigned')}</Text>
          )}
        </View>

        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{t('teams.teamsLive')}</Text>
          {state.teams.map((team) => (
            <View key={team.id} style={{ borderLeftWidth: 4, borderLeftColor: team.color, paddingLeft: 10 }}>
              <Text style={{ fontWeight: '700' }}>
                {team.name}
                {team.managerId ? ` · ${managerName[team.managerId] || ''}` : ''}
              </Text>
              <Text style={{ color: '#4b5563', marginTop: 4 }}>
                {(team.players || []).map((p) => p.name || p.id).join(', ') || t('teams.noPicksYet')}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{t('teams.playerSwaps')}</Text>
          <Text style={{ color: '#6b7280', fontSize: 12 }}>{t('teams.swapsHint')}</Text>
          <Text style={{ fontWeight: '600' }}>{t('teams.tradeWith')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(state.managers || [])
              .filter((m) => m.id !== userId)
              .map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setTradeReceiverId(m.id)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: tradeReceiverId === m.id ? '#2563eb' : '#e5e7eb',
                  }}
                >
                  <Text style={{ color: tradeReceiverId === m.id ? '#fff' : '#111' }}>{m.name || m.id}</Text>
                </TouchableOpacity>
              ))}
          </View>
          <Text style={{ fontWeight: '600' }}>{t('teams.youOffer')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(myTeam?.players || []).map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setOfferedId(p.id)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: offeredId === p.id ? '#16a34a' : '#e5e7eb',
                }}
              >
                <Text style={{ color: offeredId === p.id ? '#fff' : '#111' }}>{p.name || p.id}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontWeight: '600' }}>{t('teams.youRequest')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(receiverTeam?.players || []).map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setRequestedId(p.id)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: requestedId === p.id ? '#7c3aed' : '#e5e7eb',
                }}
              >
                <Text style={{ color: requestedId === p.id ? '#fff' : '#111' }}>{p.name || p.id}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={submitTrade}
            disabled={busy}
            style={{ backgroundColor: '#111827', padding: 12, borderRadius: 8, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('teams.proposeSwap')}</Text>
          </TouchableOpacity>

          {(state.pendingTrades || []).map((tr) => (
            <View key={tr.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8 }}>
              <Text>
                {managerName[tr.proposerId]} ↔ {managerName[tr.receiverId]}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {tr.receiverId === userId && (
                  <>
                    <TouchableOpacity onPress={() => resolve(tr.id, true)} style={{ backgroundColor: '#16a34a', padding: 8, borderRadius: 6 }}>
                      <Text style={{ color: '#fff' }}>{t('teams.approve')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => resolve(tr.id, false)} style={{ backgroundColor: '#e5e7eb', padding: 8, borderRadius: 6 }}>
                      <Text>{t('teams.reject')}</Text>
                    </TouchableOpacity>
                  </>
                )}
                {tr.proposerId === userId && (
                  <TouchableOpacity onPress={() => resolve(tr.id, false)} style={{ backgroundColor: '#e5e7eb', padding: 8, borderRadius: 6 }}>
                    <Text>{t('teams.cancel')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        {state.managerPickChatId ? (
          <ManagerPickChat roomId={state.managerPickChatId} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ManagerPickChat({ roomId }: { roomId: string }) {
  const { user } = useUser();
  const { t } = useTranslation();
  const { state, actions } = useChatLogic({ roomId, chatName: t('teams.managersChatName') });
  const [text, setText] = useState('');

  return (
    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, minHeight: 220 }}>
      <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 8 }}>{t('teams.managersChat')}</Text>
      <ScrollView style={{ maxHeight: 160, marginBottom: 8 }}>
        {(state.messages || []).slice(-30).map((m: any) => (
          <Text key={m.id || m.tempId} style={{ marginBottom: 4 }}>
            <Text style={{ fontWeight: '700' }}>{m.senderName || m.userId || user?.fullName}: </Text>
            {m.text || m.content}
          </Text>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            actions.setInputValue(v);
          }}
          placeholder={t('teams.messageManagers')}
          style={{ flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10 }}
        />
        <TouchableOpacity
          onPress={() => {
            actions.setInputValue(text);
            setTimeout(() => {
              actions.handleSendMessage();
              setText('');
            }, 0);
          }}
          style={{ backgroundColor: '#2563eb', paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('teams.send')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
