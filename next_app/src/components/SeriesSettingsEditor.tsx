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
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

// Icons
import SettingsIcon from "@mui/icons-material/Settings";
import SaveIcon from "@mui/icons-material/Save";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

// Components
import DeleteSeriesDialog from "./DeleteSeriesDialog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

interface SeriesSettingsEditorProps {
    seriesId: string;
    initialAutoOpenHours?: number | null;
    initialTitle?: string | null;
    canManage: boolean;
}

export default function SeriesSettingsEditor({
    seriesId,
    initialAutoOpenHours,
    initialTitle,
    canManage
}: SeriesSettingsEditorProps) {
    const { getToken } = useAuth();
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [hours, setHours] = useState<string>(initialAutoOpenHours ? String(initialAutoOpenHours) : "");
    const [title, setTitle] = useState(initialTitle || "");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    if (!canManage) return null;

    const handleOpen = () => {
        setHours(initialAutoOpenHours ? String(initialAutoOpenHours) : "");
        setTitle(initialTitle || "");
        setOpen(true);
    };

    const handleClose = () => setOpen(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            const token = await getToken();

            const payload = {
                autoOpenRegistrationHours: hours === "" ? null : Number(hours),
                title: title || ""
            };

            const res = await fetch(`${API_BASE}/api/series/${seriesId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error("Failed to update series");

            router.refresh();
            handleClose();
        } catch (error) {
            console.error(error);
            alert("Failed to update series settings");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSuccess = () => {
        setDeleteDialogOpen(false);
        router.push('/');
    };

    return (
        <>
            <Button
                variant="outlined"
                color="inherit"
                startIcon={<SettingsIcon />}
                onClick={handleOpen}
                size="small"
            >
                הגדרות סדרה
            </Button>

            <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, direction: "rtl" }}>
                    <SettingsIcon color="primary" />
                    הגדרות סדרה
                </DialogTitle>
                <DialogContent dir="rtl">
                    <Alert severity="info" sx={{ mb: 3 }}>
                        עדכון הגדרות אלו יחול על כל המשחקים העתידיים בסדרה זו.
                    </Alert>

                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                label="שם הסדרה (אופציונלי)"
                                fullWidth
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="למשל: ימי שני בערב"
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                label="שעות לפתיחת רישום לפני המשחק"
                                type="number"
                                fullWidth
                                value={hours}
                                onChange={(e) => setHours(e.target.value)}
                                helperText="השאר ריק כדי שההרשמה תיפתח מיד עם יצירת המשחק"
                                InputLabelProps={{ shrink: true }}
                                placeholder="לדוגמה: 48 (יומיים לפני)"
                            />
                        </Grid>
                    </Grid>

                    <Box mt={4} pt={2} borderTop={1} borderColor="divider">
                        <Typography variant="subtitle2" color="error" gutterBottom fontWeight="bold">
                            אזור מסוכן
                        </Typography>
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteForeverIcon />}
                            onClick={() => setDeleteDialogOpen(true)}
                            fullWidth
                        >
                            מחק סדרה ומשחקים עתידיים
                        </Button>
                    </Box>

                </DialogContent>
                <DialogActions sx={{ direction: "ltr", justifyContent: 'space-between' }}>
                    <Button onClick={handleClose} color="inherit">ביטול</Button>
                    <Button
                        onClick={handleSave}
                        variant="contained"
                        startIcon={!loading && <SaveIcon />}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : "שמור שינויים"}
                    </Button>
                </DialogActions>
            </Dialog>

            <DeleteSeriesDialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                seriesId={seriesId}
                seriesName={title || initialTitle || "Series"}
                onSuccess={handleDeleteSuccess}
            />
        </>
    );
}
