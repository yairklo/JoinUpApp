"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import { useSocket } from "@/context/SocketContext";
import { gamesApi, PickSessionState } from "@/services/api/games";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import CircleIcon from "@mui/icons-material/Circle";

type Props = {
  gameId: string;
  currentUserId: string;
};

const PICK_STATUS_LABELS: Record<string, string> = {
  IDLE: "ממתין",
  DRAW_SCHEDULED: "הגרלה מתוזמנת",
  ORDER_SET: "סדר נקבע",
  PICKING: "בחירה פעילה",
  COMPLETED: "הושלם",
};

function statusLabel(status: string) {
  return PICK_STATUS_LABELS[status] || status;
}

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string) {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function LiveTeamManagement({ gameId, currentUserId }: Props) {
  const { getToken } = useAuth();
  const { socket, isConnected } = useSocket();
  const [state, setState] = useState<PickSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [drawLocal, setDrawLocal] = useState("");
  const [pickLocal, setPickLocal] = useState("");
  const [pickOrderTypeLocal, setPickOrderTypeLocal] = useState<"CIRCULAR" | "SNAKE">("CIRCULAR");
  const [waitingOffline, setWaitingOffline] = useState(false);
  const [tradeReceiverId, setTradeReceiverId] = useState("");
  const [offeredId, setOfferedId] = useState("");
  const [requestedId, setRequestedId] = useState("");

  const isOrganizer = state?.organizerId === currentUserId;
  const myTurn = state?.currentTurnManagerId === currentUserId;
  const currentOnline = state?.currentTurnManagerId
    ? !!presence[state.currentTurnManagerId]
    : false;

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");
      const data = await gamesApi.getPickSession(gameId, token);
      setState(data);
      setDrawLocal(toLocalInputValue(data.pickDrawAt));
      setPickLocal(toLocalInputValue(data.pickingStartsAt));
      setPickOrderTypeLocal(data.pickOrderType as "CIRCULAR" | "SNAKE" || "CIRCULAR");
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "הטעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, [gameId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    socket.emit("joinPickSession", gameId);

    const onState = (payload: PickSessionState) => {
      if (payload?.gameId === gameId) setState(payload);
    };
    const onPresence = (payload: { userId: string; isOnline: boolean; gameId?: string }) => {
      if (payload.gameId && payload.gameId !== gameId) return;
      setPresence((prev) => ({ ...prev, [payload.userId]: payload.isOnline }));
    };

    socket.on("pick:state", onState);
    socket.on("pick:presence", onPresence);
    socket.on("trade:proposed", () => load());
    socket.on("trade:resolved", () => load());

    // Subscribe classic presence for each manager once we know them
    return () => {
      socket.emit("leavePickSession", gameId);
      socket.off("pick:state", onState);
      socket.off("pick:presence", onPresence);
      socket.off("trade:proposed");
      socket.off("trade:resolved");
    };
  }, [socket, isConnected, gameId, load]);

  useEffect(() => {
    if (!socket || !state?.managers) return;
    for (const m of state.managers) {
      socket.emit("subscribePresence", m.id);
    }
  }, [socket, state?.managers]);

  const managerName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of state?.managers || []) map[m.id] = m.name || m.id;
    return map;
  }, [state?.managers]);

  const playerName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of state?.bench || []) map[p.id] = p.name || p.id;
    for (const t of state?.teams || []) {
      for (const p of t.players || []) map[p.id] = p.name || p.id;
    }
    return map;
  }, [state]);

  const myTeam = state?.teams.find((t) => t.managerId === currentUserId);
  const receiverTeam = state?.teams.find((t) => t.managerId === tradeReceiverId);

  // Defense in depth: managers are never pickable even if a stale payload includes them.
  const pickableBench = useMemo(() => {
    const managerIds = new Set((state?.managers || []).map((m) => m.id));
    if (state?.organizerId) managerIds.add(state.organizerId);
    return (state?.bench || []).filter((p) => !managerIds.has(p.id));
  }, [state?.bench, state?.managers, state?.organizerId]);

  const tradableMyPlayers = useMemo(() => {
    const managerIds = new Set((state?.managers || []).map((m) => m.id));
    if (state?.organizerId) managerIds.add(state.organizerId);
    return (myTeam?.players || []).filter((p) => !managerIds.has(p.id));
  }, [myTeam?.players, state?.managers, state?.organizerId]);

  const tradableReceiverPlayers = useMemo(() => {
    const managerIds = new Set((state?.managers || []).map((m) => m.id));
    if (state?.organizerId) managerIds.add(state.organizerId);
    return (receiverTeam?.players || []).filter((p) => !managerIds.has(p.id));
  }, [receiverTeam?.players, state?.managers, state?.organizerId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "הפעולה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const saveSchedule = () =>
    run(async () => {
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");
      const data = await gamesApi.updatePickSchedule(
        gameId,
        {
          pickDrawAt: fromLocalInputValue(drawLocal),
          pickingStartsAt: fromLocalInputValue(pickLocal),
          pickOrderType: pickOrderTypeLocal,
        },
        token
      );
      setState(data);
    });

  const moveOrder = (index: number, dir: -1 | 1) =>
    run(async () => {
      if (!state || !isOrganizer) return;
      const order = [...state.pickTurnOrder];
      const j = index + dir;
      if (j < 0 || j >= order.length) return;
      [order[index], order[j]] = [order[j], order[index]];
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");
      const data = await gamesApi.reorderPickOrder(gameId, order, token);
      setState(data);
    });

  // Draft-captain eligibility (state.managers, computed server-side by getManagerIdsForGame)
  // is driven by Participation.isCaptain, not by GameRole -- those are deliberately separate
  // mechanisms, so this must go through the captain-toggle endpoint, not assignRole/removeRole.
  const assignCaptain = (userId: string) =>
    run(async () => {
      if (!isOrganizer || !userId) return;
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");
      await gamesApi.setCaptain(gameId, userId, true, token);
      await load();
    });

  const removeCaptain = (userId: string) =>
    run(async () => {
      if (!isOrganizer || !userId) return;
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");
      await gamesApi.setCaptain(gameId, userId, false, token);
      await load();
    });

  const pickPlayer = (playerId: string, onBehalf?: boolean) =>
    run(async () => {
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");
      const data = await gamesApi.makePick(
        gameId,
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
        throw new Error("יש לבחור מנהל ושני שחקנים");
      }
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");
      const result = await gamesApi.proposeTrade(
        gameId,
        {
          receiverId: tradeReceiverId,
          offeredPlayerIds: [offeredId],
          requestedPlayerIds: [requestedId],
        },
        token
      );
      if (result?.state) setState(result.state);
      else await load();
      setOfferedId("");
      setRequestedId("");
    });

  const resolve = (tradeId: string, approve: boolean) =>
    run(async () => {
      const token = await getToken();
      if (!token) throw new Error("לא מחובר");
      const data = await gamesApi.resolveTrade(gameId, tradeId, approve, token);
      setState(data);
    });

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (!state) {
    return <Alert severity="error">{error || "לא ניתן לטעון את ניהול הקבוצות"}</Alert>;
  }

  const pickingActive = state.pickSessionStatus === "PICKING";
  const showOfflineControls =
    pickingActive &&
    isOrganizer &&
    state.currentTurnManagerId &&
    state.currentTurnManagerId !== currentUserId &&
    !currentOnline;

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      {isOrganizer && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            תזמון הגרלה ובחירה
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            בזמן ההגרלה המערכת מערבבת את סדר תור המנהלים. בזמן תחילת הבחירה נפתח המסך החי אוטומטית.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="זמן הגרלה"
              type="datetime-local"
              value={drawLocal}
              onChange={(e) => setDrawLocal(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="תחילת שלב הבחירה"
              type="datetime-local"
              value={pickLocal}
              onChange={(e) => setPickLocal(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              select
              label="סדר בחירה"
              value={pickOrderTypeLocal}
              onChange={(e) => setPickOrderTypeLocal(e.target.value as "CIRCULAR" | "SNAKE")}
              fullWidth
            >
              <MenuItem value="CIRCULAR">מעגלי (א, ב, ג, א, ב, ג)</MenuItem>
              <MenuItem value="SNAKE">נחש (א, ב, ג, ג, ב, א)</MenuItem>
            </TextField>
          </Stack>
          <Button sx={{ mt: 2 }} variant="contained" disabled={busy} onClick={saveSchedule}>
            שמור לוח זמנים
          </Button>
        </Paper>
      )}

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6" fontWeight={700}>
            מנהלים וסדר תורות
          </Typography>
          <Chip
            size="small"
            label={statusLabel(state.pickSessionStatus)}
            color={pickingActive ? "success" : "default"}
          />
        </Stack>

        <Stack spacing={1}>
          {(state.pickTurnOrder.length ? state.pickTurnOrder : state.managers.map((m) => m.id)).map(
            (mid, idx) => {
              const online = !!presence[mid];
              const isCurrent = state.currentTurnManagerId === mid;
              return (
                <Stack
                  key={mid}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    bgcolor: isCurrent ? "action.selected" : "transparent",
                    border: isCurrent ? "1px solid" : "1px solid transparent",
                    borderColor: isCurrent ? "primary.main" : "transparent",
                  }}
                >
                  <CircleIcon sx={{ fontSize: 12, color: online ? "success.main" : "grey.400" }} />
                  <Avatar
                    src={state.managers.find((m) => m.id === mid)?.avatar}
                    alt={managerName[mid] || mid}
                    name={managerName[mid]}
                    size="sm"
                  />
                  <Box flex={1}>
                    <Typography fontWeight={isCurrent ? 700 : 500}>
                      {idx + 1}. {managerName[mid] || mid}
                      {isCurrent ? " — תור נוכחי" : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {online ? "מחובר" : "לא מחובר"}
                    </Typography>
                  </Box>
                  {isOrganizer && state.pickDrawExecutedAt && (
                    <Stack direction="row">
                      <IconButton size="small" disabled={busy || idx === 0} onClick={() => moveOrder(idx, -1)}>
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={busy || idx === state.pickTurnOrder.length - 1}
                        onClick={() => moveOrder(idx, 1)}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  )}
                </Stack>
              );
            }
          )}
        </Stack>

        {showOfflineControls && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            המנהל הנוכחי לא מחובר.
            <Stack direction="row" spacing={1} mt={1}>
              <Button
                size="small"
                variant="contained"
                disabled={busy || waitingOffline || !pickableBench[0]}
                onClick={() => {
                  /* pick mode: next bench click uses onBehalf */
                  setWaitingOffline(false);
                }}
              >
                בחר במקומו (מהספסל)
              </Button>
              <Button size="small" variant="outlined" onClick={() => setWaitingOffline(true)}>
                המתן
              </Button>
            </Stack>
            {!waitingOffline && (
              <Typography variant="caption" display="block" mt={1}>
                בחר שחקן מהספסל כדי לשייך אותו במקומו. אין אפשרות לדלג/לוותר.
              </Typography>
            )}
            {waitingOffline && (
              <Typography variant="caption" display="block" mt={1}>
                ממתין למנהל שלא מחובר…
              </Typography>
            )}
          </Alert>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={700} mb={2}>
          קפטנים (בוחרים שחקנים)
        </Typography>
        <Stack spacing={1} mb={2}>
          {state.managers.filter(m => m.id !== state.organizerId).map((m) => (
            <Stack key={m.id} direction="row" alignItems="center" spacing={1}>
              <Avatar src={m.avatar} alt={m.name || m.id} name={m.name || undefined} size="sm" />
              <Typography flex={1}>{m.name || m.id}</Typography>
              {isOrganizer && (
                <Button size="small" color="error" onClick={() => removeCaptain(m.id)} disabled={busy}>
                  הסר
                </Button>
              )}
            </Stack>
          ))}
          {state.managers.length <= 1 && (
            <Typography color="text.secondary">לא נבחרו קפטנים</Typography>
          )}
        </Stack>
        {isOrganizer && (
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              fullWidth
              label="בחר שחקן לתפקיד קפטן"
              value=""
              onChange={(e) => assignCaptain(e.target.value)}
              disabled={busy}
            >
              {state.bench.map(p => (
                <MenuItem key={p.id} value={p.id}>{p.name || p.id}</MenuItem>
              ))}
              {state.teams.flatMap(t => t.players).map(p => (
                <MenuItem key={p.id} value={p.id}>{p.name || p.id}</MenuItem>
              ))}
            </TextField>
          </Stack>
        )}
      </Paper>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch">
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            ספסל ({pickableBench.length})
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            אין הגבלת זמן לבחירה. חי לכל המנהלים.
          </Typography>
          <Stack spacing={1}>
            {pickableBench.map((p) => {
              const canPick =
                pickingActive &&
                ((myTurn && !showOfflineControls) ||
                  (showOfflineControls && !waitingOffline));
              return (
                <Button
                  key={p.id}
                  variant="outlined"
                  disabled={busy || !canPick}
                  onClick={() => pickPlayer(p.id, !!(showOfflineControls && !waitingOffline))}
                  sx={{ justifyContent: "flex-start", textTransform: "none" }}
                  startIcon={
                    <Avatar src={p.avatar} alt={p.name || p.id} name={p.name || p.id} size="sm" />
                  }
                >
                  {p.name || p.id}
                </Button>
              );
            })}
            {pickableBench.length === 0 && (
              <Typography color="text.secondary">אין שחקנים לא משובצים</Typography>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, flex: 1.4 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            קבוצות (חי)
          </Typography>
          <Stack spacing={2}>
            {state.teams.map((t) => (
              <Box key={t.id} sx={{ borderLeft: `4px solid ${t.color}`, pl: 1.5 }}>
                <Typography fontWeight={700}>
                  {t.name}
                  {t.managerId ? ` · ${managerName[t.managerId] || ""}` : ""}
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1} mt={1}>
                  {(t.players || []).map((p) => (
                    <Chip key={p.id} label={p.name || p.id} size="small" />
                  ))}
                  {(t.players || []).length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      עדיין אין בחירות
                    </Typography>
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          החלפות שחקנים (מנהלים בלבד)
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          ניתן להציע החלפה בכל עת במהלך או אחרי הבחירה. מתבצעת רק לאחר אישור המנהל השני. השחקנים לא מקבלים התראה.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={2}>
          <TextField
            select
            label="החלף עם"
            value={tradeReceiverId}
            onChange={(e) => setTradeReceiverId(e.target.value)}
            fullWidth
          >
            {(state.managers || [])
              .filter((m) => m.id !== currentUserId)
              .map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name || m.id}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            select
            label="אתה מציע"
            value={offeredId}
            onChange={(e) => setOfferedId(e.target.value)}
            fullWidth
            disabled={!myTeam}
          >
            {(tradableMyPlayers || []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name || p.id}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="אתה מבקש"
            value={requestedId}
            onChange={(e) => setRequestedId(e.target.value)}
            fullWidth
            disabled={!receiverTeam}
          >
            {(tradableReceiverPlayers || []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name || p.id}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Button variant="contained" disabled={busy} onClick={submitTrade}>
          הצע החלפה
        </Button>

        <Divider sx={{ my: 2 }} />
        <Stack spacing={1}>
          {(state.pendingTrades || []).map((t) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2">
                {managerName[t.proposerId] || t.proposerId} מציע{" "}
                {t.offeredPlayerIds.map((id) => playerName[id] || id).join(", ")} תמורת{" "}
                {t.requestedPlayerIds.map((id) => playerName[id] || id).join(", ")}
              </Typography>
              <Stack direction="row" spacing={1} mt={1}>
                {t.receiverId === currentUserId && (
                  <>
                    <Button size="small" variant="contained" disabled={busy} onClick={() => resolve(t.id, true)}>
                      אשר
                    </Button>
                    <Button size="small" color="inherit" disabled={busy} onClick={() => resolve(t.id, false)}>
                      דחה
                    </Button>
                  </>
                )}
                {t.proposerId === currentUserId && t.receiverId !== currentUserId && (
                  <Button size="small" color="inherit" disabled={busy} onClick={() => resolve(t.id, false)}>
                    ביטול
                  </Button>
                )}
              </Stack>
            </Paper>
          ))}
          {(state.pendingTrades || []).length === 0 && (
            <Typography variant="body2" color="text.secondary">
              אין החלפות ממתינות
            </Typography>
          )}
        </Stack>
      </Paper>

      {state.managerPickChatId && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            צ&apos;אט קבוצתי למנהלים
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>
            גלוי למנהלים במהלך הבחירה. נפרד מצ&apos;אטים פרטיים.
          </Typography>
          <Box sx={{ height: 360 }}>
            <Chat roomId={state.managerPickChatId} chatName="מנהלים" language="he" isWidget />
          </Box>
        </Paper>
      )}
    </Stack>
  );
}
