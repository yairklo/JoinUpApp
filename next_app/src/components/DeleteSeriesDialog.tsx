"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    RadioGroup,
    FormControlLabel,
    Radio,
    Box,
    Checkbox,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    CircularProgress,
    Alert,
    Divider
} from '@mui/material';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import WarningIcon from '@mui/icons-material/Warning';

interface GameSummary {
    id: string;
    date: string;
    fieldLocation?: string;
}

interface DeleteSeriesDialogProps {
    open: boolean;
    onClose: () => void;
    seriesId: string;
    seriesName: string;
    onSuccess: () => void;
}

export default function DeleteSeriesDialog({ open, onClose, seriesId, seriesName, onSuccess }: DeleteSeriesDialogProps) {
    const { getToken } = useAuth();
    const [loading, setLoading] = useState(false);
    const [fetchingGames, setFetchingGames] = useState(false);
    const [games, setGames] = useState<GameSummary[]>([]);
    const [strategy, setStrategy] = useState<'DELETE_ALL' | 'KEEP_GAMES' | 'SELECTIVE'>('DELETE_ALL');
    const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
    const [error, setError] = useState('');

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

    useEffect(() => {
        if (open && seriesId) {
            fetchUpcomingGames();
        }
    }, [open, seriesId]);

    const fetchUpcomingGames = async () => {
        setFetchingGames(true);
        try {
            const token = await getToken();
            // reusing the series details endpoint which returns upcomingGames
            // Note: Ideally this endpoint returns ALL future games for deletion purpose. 
            // The current /api/series/:id returns limit 10. For full robust delete we might need a dedicated endpoint 
            // or just rely on the 10 for UI and trust the user knows. 
            // For now we use what we have.
            // Fetch ALL upcoming games to ensure user sees everything before deleting
            const res = await fetch(`${API_BASE}/api/series/${seriesId}?includeAll=true`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setGames(data.upcomingGames || []);
                // Default select all for selective mode
                setSelectedGameIds(data.upcomingGames?.map((g: any) => g.id) || []);
            }
        } catch (e) {
            console.error("Failed to fetch games", e);
        } finally {
            setFetchingGames(false);
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        setError('');
        try {
            const token = await getToken();
            const payload = {
                strategy,
                gameIdsToDelete: strategy === 'SELECTIVE' ? selectedGameIds : undefined
            };

            // Use POST to ensure body is not stripped by proxies
            const res = await fetch(`${API_BASE}/api/series/${seriesId}/delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to delete series');
            }

            onSuccess();
            onClose();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    };

    const handleToggleGame = (id: string) => {
        setSelectedGameIds(prev =>
            prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedGameIds.length === games.length) {
            setSelectedGameIds([]);
        } else {
            setSelectedGameIds(games.map(g => g.id));
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth dir="rtl">
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
                <DeleteForeverIcon />
                מחיקת סדרה: {seriesName}
            </DialogTitle>
            <DialogContent>
                <Box mb={2}>
                    <Alert severity="warning" icon={<WarningIcon sx={{ ml: 1 }} />}>
                        פעולה זו היא בלתי הפיכה ולא ניתן לבטל אותה.
                    </Alert>
                </Box>

                <Typography variant="body1" gutterBottom>
                    נמצאו <b>{games.length} משחקים עתידיים</b> בסדרה זו. כיצד תרצה להמשיך?
                </Typography>

                <RadioGroup
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value as any)}
                >
                    <FormControlLabel
                        value="DELETE_ALL"
                        control={<Radio color="error" />}
                        label={
                            <Box sx={{ mr: 1 }}>
                                <Typography variant="body2" fontWeight="bold">מחק הכל</Typography>
                                <Typography variant="caption" color="text.secondary">מחק את הסדרה ובטל את כל המשחקים העתידיים.</Typography>
                            </Box>
                        }
                        sx={{ mb: 1, ml: 0 }}
                    />
                    <FormControlLabel
                        value="KEEP_GAMES"
                        control={<Radio color="primary" />}
                        label={
                            <Box sx={{ mr: 1 }}>
                                <Typography variant="body2" fontWeight="bold">שמור משחקים</Typography>
                                <Typography variant="caption" color="text.secondary">מחק את הסדרה אך השאר את המשחקים העתידיים כאירועים נפרדים.</Typography>
                            </Box>
                        }
                        sx={{ mb: 1, ml: 0 }}
                    />
                    <FormControlLabel
                        value="SELECTIVE"
                        control={<Radio color="default" />}
                        label={
                            <Box sx={{ mr: 1 }}>
                                <Typography variant="body2" fontWeight="bold">בחר משחקים למחיקה</Typography>
                                <Typography variant="caption" color="text.secondary">בחר ידנית אילו משחקים לבטל.</Typography>
                            </Box>
                        }
                        sx={{ ml: 0 }}
                    />
                </RadioGroup>

                {strategy === 'SELECTIVE' && (
                    <Box mt={2} border={1} borderColor="divider" borderRadius={1} maxHeight={200} overflow="auto">
                        {fetchingGames ? (
                            <Box p={2} textAlign="center"><CircularProgress size={20} /></Box>
                        ) : (
                            <>
                                <Box p={1} bgcolor="action.hover" display="flex" justifyContent="space-between" alignItems="center">
                                    <Typography variant="caption" fontWeight="bold">משחקים עתידיים</Typography>
                                    <Button size="small" onClick={handleSelectAll} sx={{ fontSize: '0.7rem' }}>
                                        {selectedGameIds.length === games.length ? "נקה בחירה" : "בחר הכל"}
                                    </Button>
                                </Box>
                                <List dense disablePadding>
                                    {games.map(game => (
                                        <ListItem key={game.id} disablePadding>
                                            <ListItemButton onClick={() => handleToggleGame(game.id)} sx={{ textAlign: 'right' }}>
                                                <ListItemIcon sx={{ minWidth: 32 }}>
                                                    <Checkbox
                                                        edge="start"
                                                        checked={selectedGameIds.includes(game.id)}
                                                        tabIndex={-1}
                                                        disableRipple
                                                        size="small"
                                                        color="error"
                                                    />
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={new Date(game.date).toLocaleString('he-IL')}
                                                />
                                            </ListItemButton>
                                        </ListItem>
                                    ))}
                                    {games.length === 0 && <Box p={2}><Typography variant="caption">לא נמצאו משחקים עתידיים.</Typography></Box>}
                                </List>
                            </>
                        )}
                    </Box>
                )}

                {error && (
                    <Box mt={2}>
                        <Alert severity="error">{error}</Alert>
                    </Box>
                )}

            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Button onClick={onClose} disabled={loading} color="inherit">ביטול</Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={handleDelete}
                    disabled={loading || (strategy === 'SELECTIVE' && selectedGameIds.length === 0)}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <DeleteForeverIcon />}
                >
                    {loading ? "מוחק..." : "אשר מחיקה"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
