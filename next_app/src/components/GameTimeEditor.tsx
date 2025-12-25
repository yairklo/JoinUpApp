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

// Icons
import EditIcon from "@mui/icons-material/Edit";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

interface GameTimeEditorProps {
  gameId: string;
  initialTime: string;
  canManage: boolean;
}

export default function GameTimeEditor({ gameId, initialTime, canManage }: GameTimeEditorProps) {
  const { getToken } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newTime, setNewTime] = useState(initialTime);

  const handleOpen = () => {
    setNewTime(initialTime);
    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/games/${gameId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ time: newTime }),
      });

      if (!res.ok) throw new Error("Failed to update time");

      router.refresh();
      handleClose();
    } catch (error) {
      console.error(error);
      alert("Failed to update time");
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
        startIcon={<AccessTimeIcon />}
        onClick={handleOpen}
        sx={{ mt: 2, borderRadius: 2 }}
        fullWidth
      >
        Change Game Time
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon color="primary" />
            Edit Game Time
        </DialogTitle>
        <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
                This will update the time for this specific game only.
            </Alert>
            <Box py={1}>
                <TextField
                    label="New Time"
                    type="time"
                    fullWidth
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ mt: 1 }}
                />
            </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="inherit">Cancel</Button>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : "Save New Time"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}