"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import { gamesApi } from "@/services/api/games";

/**
 * Organizer action: cancel this one game (not the whole series). The game stays visible with a
 * "cancelled" state, joining is closed and everyone on the roster is notified.
 */
export default function CancelGameButton({ gameId, isSeriesGame }: { gameId: string; isSeriesGame?: boolean }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmCancel = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("no token");
      await gamesApi.cancel(gameId, token);
      setOpen(false);
      router.refresh();
    } catch {
      setError("ביטול המשחק נכשל. נסו שוב.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        size="small"
        startIcon={<EventBusyOutlinedIcon fontSize="small" />}
        onClick={() => setOpen(true)}
      >
        בטל משחק
      </Button>
      <Dialog open={open} onClose={() => !loading && setOpen(false)} fullWidth maxWidth="xs" dir="rtl">
        <DialogTitle>לבטל את המשחק?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            המשחק יסומן כמבוטל, לא ניתן יהיה להצטרף אליו, וכל המשתתפים יקבלו הודעה.
            {isSeriesGame ? " שאר המשחקים בקבוצה לא יושפעו." : ""}
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            חזרה
          </Button>
          <Button onClick={confirmCancel} color="error" variant="contained" disabled={loading}>
            {loading ? "מבטל..." : "כן, בטל משחק"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
