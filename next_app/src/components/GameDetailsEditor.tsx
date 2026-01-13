"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

// MUI
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Collapse from "@mui/material/Collapse";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";

// Icons
import EditIcon from "@mui/icons-material/Edit";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

import { SPORT_MAPPING } from "@/utils/sports";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export const SPORTS = Object.entries(SPORT_MAPPING).map(([value, label]) => ({
  value,
  label,
}));

// Helper functions to get local date/time parts from ISO string
function getIsoDatePart(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getIsoTimePart(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

interface GameDetailsEditorProps {
  gameId: string;
  initialTime: string;
  initialDate: string;
  initialMaxPlayers: number;
  initialSport?: string;
  initialRegistrationOpensAt?: string | null;
  initialFriendsOnlyUntil?: string | null;
  initialIsFriendsOnly: boolean;
  initialTitle?: string | null;
  canManage: boolean;
}

export default function GameDetailsEditor({
  gameId,
  initialTime,
  initialDate,
  initialMaxPlayers,
  initialSport = "SOCCER",
  initialRegistrationOpensAt,
  initialFriendsOnlyUntil,
  initialIsFriendsOnly,
  initialTitle,
  canManage
}: GameDetailsEditorProps) {
  const { getToken } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [time, setTime] = useState(initialTime);
  const [date, setDate] = useState(initialDate);
  const [maxPlayers, setMaxPlayers] = useState(initialMaxPlayers);
  const [sport, setSport] = useState(initialSport);
  const [title, setTitle] = useState(initialTitle || "");
  const [isFriendsOnly, setIsFriendsOnly] = useState(initialIsFriendsOnly);

  // Future Registration State
  const [futureRegEnabled, setFutureRegEnabled] = useState(!!initialRegistrationOpensAt);
  const [regDate, setRegDate] = useState(getIsoDatePart(initialRegistrationOpensAt));
  const [regTime, setRegTime] = useState(getIsoTimePart(initialRegistrationOpensAt));

  // Public Later State
  const [makePublicLater, setMakePublicLater] = useState(!!initialFriendsOnlyUntil);
  const [publicDate, setPublicDate] = useState(getIsoDatePart(initialFriendsOnlyUntil));
  const [publicTime, setPublicTime] = useState(getIsoTimePart(initialFriendsOnlyUntil));

  const handleOpen = () => {
    setTime(initialTime);
    setDate(initialDate);
    setMaxPlayers(initialMaxPlayers);
    setSport(initialSport || "SOCCER");
    setTitle(initialTitle || "");
    setIsFriendsOnly(initialIsFriendsOnly);

    setFutureRegEnabled(!!initialRegistrationOpensAt);
    if (initialRegistrationOpensAt) {
      setRegDate(getIsoDatePart(initialRegistrationOpensAt));
      setRegTime(getIsoTimePart(initialRegistrationOpensAt));
    } else {
      setRegTime("");
    }

    setMakePublicLater(!!initialFriendsOnlyUntil);
    if (initialFriendsOnlyUntil) {
      setPublicDate(getIsoDatePart(initialFriendsOnlyUntil));
      setPublicTime(getIsoTimePart(initialFriendsOnlyUntil));
    } else {
      setPublicDate("");
      setPublicTime("");
    }

    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = await getToken();

      let registrationOpensAt = null;
      if (futureRegEnabled) {
        if (regDate && regTime) {
          registrationOpensAt = new Date(`${regDate}T${regTime}:00`).toISOString();
        }
      }

      let friendsOnlyUntil = null;
      if (makePublicLater) {
        if (publicDate && publicTime) {
          friendsOnlyUntil = new Date(`${publicDate}T${publicTime}:00`).toISOString();
        }
      }

      const res = await fetch(`${API_BASE}/api/games/${gameId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          time,
          date,
          maxPlayers,
          sport,
          title,
          isFriendsOnly,
          registrationOpensAt: futureRegEnabled ? registrationOpensAt : null,
          friendsOnlyUntil: (isFriendsOnly && makePublicLater) ? friendsOnlyUntil : null
        }),
      });

      if (!res.ok) throw new Error("Failed to update game");

      router.refresh();
      handleClose();
    } catch (error) {
      console.error(error);
      alert("Failed to update game details");
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) return null;

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<EditIcon />}
        onClick={handleOpen}
        sx={{ mt: 2, borderRadius: 2 }}
        fullWidth
      >
        ערוך פרטי משחק
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, direction: "rtl" }}>
          <EditIcon color="primary" />
          עריכת פרטי משחק
        </DialogTitle>
        <DialogContent dir="rtl">
          <Alert severity="info" sx={{ mb: 2 }}>
            שינויים אלו יחולו על המשחק הנוכחי בלבד.
          </Alert>
          <Box py={1}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="כותרת המשחק (אופציונלי)"
                  fullWidth
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="למשל: כדורגל שישי בצהריים"
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="תאריך"
                  type="date"
                  fullWidth
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="שעה"
                  type="time"
                  fullWidth
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="כמות שחקנים מקסימלית"
                  type="number"
                  fullWidth
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                  InputProps={{ inputProps: { min: 2 } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  select
                  label="סוג ספורט"
                  fullWidth
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                >
                  {SPORTS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Future Registration Section */}
              <Grid size={{ xs: 12 }} mt={2}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <FormControlLabel
                    control={<Switch checked={futureRegEnabled} onChange={(e) => setFutureRegEnabled(e.target.checked)} />}
                    label="פתיחת רישום עתידית"
                    sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                  />
                  <Collapse in={futureRegEnabled}>
                    <Grid container spacing={2} mt={1}>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="תאריך פתיחה"
                          type="date"
                          fullWidth
                          value={regDate}
                          onChange={(e) => setRegDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="שעה"
                          type="time"
                          fullWidth
                          value={regTime}
                          onChange={(e) => setRegTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                    </Grid>
                  </Collapse>
                </Paper>
              </Grid>

              {/* Friends Only / Private Section */}
              <Grid size={{ xs: 12 }} mt={2}>
                <Paper variant="outlined" sx={{ p: 2, borderColor: isFriendsOnly ? 'primary.main' : 'divider' }}>
                  <FormControlLabel
                    control={<Switch checked={isFriendsOnly} onChange={(e) => setIsFriendsOnly(e.target.checked)} />}
                    label="משחק פרטי (לחברים בלבד)"
                    sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                  />

                  <Collapse in={isFriendsOnly}>
                    <Box mt={2} p={2} bgcolor="grey.50" borderRadius={1} border={1} borderColor="divider">
                      <FormControlLabel
                        control={<Switch checked={makePublicLater} onChange={(e) => setMakePublicLater(e.target.checked)} />}
                        label="פתח לציבור במועד מאוחר יותר"
                        sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                      />
                      <Collapse in={makePublicLater}>
                        <Grid container spacing={2} mt={1}>
                          <Grid size={{ xs: 6 }}>
                            <TextField
                              label="תאריך פתיחה לציבור"
                              type="date"
                              fullWidth
                              value={publicDate}
                              onChange={(e) => setPublicDate(e.target.value)}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <TextField
                              label="שעת פתיחה"
                              type="time"
                              fullWidth
                              value={publicTime}
                              onChange={(e) => setPublicTime(e.target.value)}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      </Collapse>
                    </Box>
                  </Collapse>
                </Paper>
              </Grid>

              {/* Make Public Later Section */}


            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ direction: "ltr" }}>
          <Button onClick={handleClose} color="inherit">ביטול</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : "שמור שינויים"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}