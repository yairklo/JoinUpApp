"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

// MUI
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";

// Icons
import UpdateIcon from "@mui/icons-material/Update";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import AddIcon from "@mui/icons-material/Add";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

interface SeriesManagerProps {
  gameId: string;
  seriesId: string | null; // אם null, זה משחק בודד
  isOrganizer: boolean;
  // נתונים בסיסיים של המשחק הנוכחי לשמש כברירת מחדל ליצירה
  gameData: {
    time: string;
    date: string; // YYYY-MM-DD
  };
}

export default function SeriesManager({ gameId, seriesId, isOrganizer, gameData }: SeriesManagerProps) {
  const { getToken } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0); // 0 = WEEKLY, 1 = CUSTOM

  // State for Creating/Editing
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [tempDate, setTempDate] = useState("");
  
  // State for Series Subscription
  const [isSubscribed, setIsSubscribed] = useState(false); // היינו צריכים לקבל את זה מהפרופס, אבל ל-MVP ננהל כאן
  const [subLoading, setSubLoading] = useState(false);

  // State for Editing Existing Series
  const [editData, setEditData] = useState({
    time: gameData.time,
    updateFuture: true,
  });

  // --- Handlers ---

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  // 1. הפיכת משחק לסדרה (Convert)
  const handleMakeRecurring = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      
      const type = tabValue === 0 ? "WEEKLY" : "CUSTOM";
      
      // Payload based on backend requirements
      const payload = {
        type,
        // אם זה שבועי - הבקאנד לוקח את היום מהמשחק המקורי
        // אם זה קסטום - שולחים רשימת תאריכים
        dates: type === "CUSTOM" ? customDates : undefined,
      };

      // קריאה לנקודת הקצה שיצרנו (Convert)
      const res = await fetch(`${API_BASE}/api/games/${gameId}/recurrence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to create series");

      router.refresh();
      handleClose();
    } catch (error) {
      console.error(error);
      alert("Error creating series");
    } finally {
      setLoading(false);
    }
  };

  // 2. עדכון סדרה קיימת
  const handleUpdateSeries = async () => {
    if (!seriesId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/series/${seriesId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            time: editData.time,
            updateFutureGames: editData.updateFuture
        })
      });

      if (!res.ok) throw new Error("Failed to update");
      
      alert("Series updated successfully!");
      router.refresh();
      handleClose();
    } catch (err) {
        console.error(err);
        alert("Update failed");
    } finally {
        setLoading(false);
    }
  };

  // 3. מחיקת סדרה
  const handleDeleteSeries = async () => {
    if (!seriesId || !confirm("WARNING: This will delete the series and ALL future games linked to it. Are you sure?")) return;
    
    setLoading(true);
    try {
        const token = await getToken();
        await fetch(`${API_BASE}/api/series/${seriesId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });
        router.push("/"); // חזרה לדף הבית כי המשחק (אולי) נמחק אם היה עתידי
    } catch (err) {
        console.error(err);
    }
  };

  // 4. ניהול מנוי (Subscribe)
  const handleToggleSubscribe = async () => {
    if (!seriesId) return;
    setSubLoading(true);
    try {
        const token = await getToken();
        const method = isSubscribed ? "DELETE" : "POST";
        
        await fetch(`${API_BASE}/api/series/${seriesId}/subscribe`, {
            method,
            headers: { Authorization: `Bearer ${token}` }
        });
        
        setIsSubscribed(!isSubscribed);
        router.refresh();
    } catch (err) {
        console.error(err);
    } finally {
        setSubLoading(false);
    }
  };

  // --- Logic for Custom Dates ---
  const addCustomDate = () => {
    if (!tempDate) return;
    if (customDates.includes(tempDate)) return;
    setCustomDates([...customDates, tempDate]);
    setTempDate("");
  };

  const removeCustomDate = (dateToRemove: string) => {
    setCustomDates(customDates.filter(d => d !== dateToRemove));
  };


  // --- RENDER ---

  // מצב א': המשחק הוא חלק מסדרה (יש seriesId)
  if (seriesId) {
    return (
      <Box mt={2} p={2} border="1px dashed" borderColor="primary.main" borderRadius={2} bgcolor="primary.50">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Box display="flex" alignItems="center" gap={1}>
                <EventRepeatIcon color="primary" />
                <Box>
                    <Typography variant="subtitle2" fontWeight="bold">Recurring Game</Typography>
                    <Typography variant="caption" color="text.secondary">Part of a series</Typography>
                </Box>
            </Box>

            <FormControlLabel
                control={
                    <Switch 
                        size="small" 
                        checked={isSubscribed} 
                        onChange={handleToggleSubscribe} 
                        disabled={subLoading}
                    />
                }
                label={<Typography variant="caption">Auto-Join Future</Typography>}
            />
        </Stack>
        
        {isOrganizer && (
            <Button 
                startIcon={<EditCalendarIcon />} 
                size="small" 
                variant="outlined" 
                fullWidth 
                sx={{ mt: 2 }}
                onClick={handleOpen}
            >
                Manage Series Settings
            </Button>
        )}

        {/* Dialog: Edit Existing Series */}
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
            <DialogTitle>Series Settings</DialogTitle>
            <DialogContent>
                <Alert severity="info" sx={{ mb: 2 }}>
                    Changes here will apply to all future games in this series.
                </Alert>
                
                <TextField
                    label="Default Time"
                    type="time"
                    fullWidth
                    margin="normal"
                    value={editData.time}
                    onChange={(e) => setEditData({ ...editData, time: e.target.value })}
                />
                
                <FormControlLabel
                    control={
                        <Switch 
                            checked={editData.updateFuture} 
                            onChange={(e) => setEditData({ ...editData, updateFuture: e.target.checked })} 
                        />
                    }
                    label="Update existing future games"
                />
                
                <Box mt={4}>
                    <Button 
                        color="error" 
                        startIcon={<DeleteForeverIcon />} 
                        onClick={handleDeleteSeries}
                    >
                        Delete Series & Future Games
                    </Button>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button variant="contained" onClick={handleUpdateSeries} disabled={loading}>
                    {loading ? "Saving..." : "Save Changes"}
                </Button>
            </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // מצב ב': משחק בודד (אין seriesId) - רק המארגן רואה
  if (!isOrganizer) return null;

  return (
    <>
      <Button
        variant="text"
        color="secondary"
        startIcon={<UpdateIcon />}
        onClick={handleOpen}
        fullWidth
        sx={{ mt: 1, justifyContent: "flex-start" }}
      >
        Make Recurring / Series
      </Button>

      {/* Dialog: Create Series from Game */}
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>Convert to Series</DialogTitle>
        <DialogContent>
            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 2 }}>
                <Tab label="Weekly Auto" />
                <Tab label="Custom Dates" />
            </Tabs>

            {tabValue === 0 ? (
                // WEEKLY TAB
                <Box>
                    <Alert severity="success" sx={{ mb: 2 }}>
                        This will create games automatically <b>every week</b> at <b>{gameData.time}</b>.
                    </Alert>
                    <Typography variant="body2">
                        • The system will generate the next 4 games immediately.<br/>
                        • Current players will be auto-registered if they subscribe.<br/>
                        • You can cancel or edit anytime.
                    </Typography>
                </Box>
            ) : (
                // CUSTOM TAB
                <Box>
                     <Alert severity="info" sx={{ mb: 2 }}>
                        Select specific dates to create a bulk series.
                    </Alert>
                    
                    <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                        <TextField 
                            type="datetime-local" 
                            size="small" 
                            fullWidth
                            value={tempDate}
                            onChange={(e) => setTempDate(e.target.value)}
                        />
                        <Button variant="contained" onClick={addCustomDate} disabled={!tempDate}>
                            <AddIcon />
                        </Button>
                    </Stack>

                    <Box display="flex" flexWrap="wrap" gap={1}>
                        {customDates.map((date) => (
                            <Chip 
                                key={date} 
                                label={new Date(date).toLocaleString()} 
                                onDelete={() => removeCustomDate(date)} 
                            />
                        ))}
                        {customDates.length === 0 && <Typography variant="caption" color="text.secondary">No dates added yet</Typography>}
                    </Box>
                </Box>
            )}
        </DialogContent>
        <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button 
                variant="contained" 
                onClick={handleMakeRecurring} 
                disabled={loading || (tabValue === 1 && customDates.length === 0)}
            >
                {loading ? <CircularProgress size={24} /> : "Create Series"}
            </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}