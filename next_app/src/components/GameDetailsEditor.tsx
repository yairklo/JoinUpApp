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

interface GameDetailsEditorProps {
  gameId: string;
  initialTime: string;
  initialDate: string;
  initialMaxPlayers: number;
  initialSport?: string;
  initialRegistrationOpensAt?: string | null;
  canManage: boolean;
}

export default function GameDetailsEditor({
  gameId,
  initialTime,
  initialDate,
  initialMaxPlayers,
  initialSport = "SOCCER",
  initialRegistrationOpensAt,
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

  // Future Registration State
  const [futureRegEnabled, setFutureRegEnabled] = useState(!!initialRegistrationOpensAt);
  const [regDate, setRegDate] = useState(initialRegistrationOpensAt ? initialRegistrationOpensAt.split('T')[0] : "");
  const [regTime, setRegTime] = useState(initialRegistrationOpensAt ? initialRegistrationOpensAt.split('T')[1]?.substring(0, 5) : "");

  const handleOpen = () => {
    setTime(initialTime);
    setDate(initialDate);
    setMaxPlayers(initialMaxPlayers);
    setSport(initialSport || "SOCCER");

    setFutureRegEnabled(!!initialRegistrationOpensAt);
    if (initialRegistrationOpensAt) {
      setRegDate(initialRegistrationOpensAt.split('T')[0]);
      setRegTime(initialRegistrationOpensAt.split('T')[1]?.substring(0, 5) || "");
    } else {
      setRegDate("");
      setRegTime("");
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
          registrationOpensAt = `${regDate}T${regTime}:00`;
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
          registrationOpensAt: futureRegEnabled ? registrationOpensAt : null
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