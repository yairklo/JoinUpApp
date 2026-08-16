"use client";

import { useState } from "react";

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
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";

// Icons
import SettingsIcon from "@mui/icons-material/Settings";
import SaveIcon from "@mui/icons-material/Save";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

// Components
import Avatar from "./Avatar";
import DeleteSeriesDialog from "./DeleteSeriesDialog";
import { useSeriesSettingsEditor, SeriesSettingsEditorHookProps } from "@/hooks/useSeriesSettingsEditor";
import type { FieldOption } from "@/hooks/useGameCreator";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const filter = createFilterOptions<FieldOption>();

interface SeriesSettingsEditorProps extends SeriesSettingsEditorHookProps {
    canManage: boolean;
}

export default function SeriesSettingsEditor({ canManage, ...hookProps }: SeriesSettingsEditorProps) {
    const { state, actions } = useSeriesSettingsEditor(hookProps);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    if (!canManage) return null;

    const handleDeleteSuccess = () => {
        setDeleteDialogOpen(false);
        actions.handleDeleteSuccess();
    };

    return (
        <>
            <Button
                variant="outlined"
                color="inherit"
                startIcon={<SettingsIcon />}
                onClick={actions.handleOpen}
                size="small"
            >
                הגדרות קבוצה
            </Button>

            <Dialog open={state.open} onClose={actions.handleClose} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, direction: "rtl" }}>
                    <SettingsIcon color="primary" />
                    הגדרות קבוצה
                </DialogTitle>
                <DialogContent dir="rtl">
                    <Alert severity="info" sx={{ mb: 3 }}>
                        עדכון הגדרות אלו יחול על כל המשחקים העתידיים בקבוצה זו.
                    </Alert>

                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                label="שם הקבוצה (אופציונלי)"
                                fullWidth
                                value={state.title}
                                onChange={(e) => actions.setTitle(e.target.value)}
                                placeholder="למשל: ימי שני בערב"
                            />
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                            <TextField
                                label="תיאור הקבוצה (אופציונלי)"
                                fullWidth
                                multiline
                                rows={2}
                                value={state.description}
                                onChange={(e) => actions.setDescription(e.target.value)}
                                placeholder="ספרו קצת על הקבוצה..."
                            />
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Avatar
                                    src={state.imageUrl}
                                    name={state.title || "קבוצה"}
                                    alt={state.title || "קבוצה"}
                                    size="lg"
                                />
                                <TextField
                                    fullWidth
                                    label="קישור לתמונת הקבוצה"
                                    value={state.imageUrl}
                                    onChange={(e) => actions.setImageUrl(e.target.value)}
                                    size="small"
                                    helperText="הדבק קישור לתמונה"
                                />
                            </Box>
                        </Grid>

                        {/* Location / Day / Time Section */}
                        <Grid size={{ xs: 12 }} mt={1}>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                                    מיקום ומועד קבוע
                                </Typography>

                                <Stack spacing={2}>
                                    {state.newFieldMode ? (
                                        <Box border={1} borderColor="divider" borderRadius={1} p={2} bgcolor="action.hover">
                                            <Typography variant="subtitle2" gutterBottom>מגרש חדש</Typography>
                                            <Stack spacing={2}>
                                                <TextField
                                                    label="שם המגרש"
                                                    size="small"
                                                    fullWidth
                                                    value={state.newField.name}
                                                    onChange={e => actions.setNewField(p => ({ ...p, name: e.target.value }))}
                                                />
                                                <TextField
                                                    label="מיקום / כתובת"
                                                    size="small"
                                                    fullWidth
                                                    value={state.newField.location}
                                                    onChange={e => actions.setNewField(p => ({ ...p, location: e.target.value }))}
                                                />
                                                <Button size="small" onClick={() => actions.setNewFieldMode(false)}>ביטול</Button>
                                            </Stack>
                                        </Box>
                                    ) : (
                                        <Autocomplete
                                            value={state.selectedField}
                                            onChange={(_event, newValue) => {
                                                if (typeof newValue === 'string') {
                                                    setTimeout(() => {
                                                        actions.setNewFieldMode(true);
                                                        actions.setNewField(p => ({ ...p, name: newValue }));
                                                    });
                                                } else if (newValue && newValue.inputValue) {
                                                    actions.setNewFieldMode(true);
                                                    actions.setNewField(p => ({ ...p, name: newValue.inputValue || "" }));
                                                } else {
                                                    actions.setSelectedField(newValue);
                                                }
                                            }}
                                            filterOptions={(options, params) => {
                                                const filtered = filter(options, params);
                                                const { inputValue } = params;
                                                const isExisting = options.some((option) => inputValue === option.name);
                                                if (inputValue !== '' && !isExisting) {
                                                    filtered.push({
                                                        inputValue,
                                                        name: `הוסף "${inputValue}"`,
                                                        id: "NEW_FIELD_ID_TEMP"
                                                    });
                                                }
                                                return filtered;
                                            }}
                                            selectOnFocus
                                            clearOnBlur
                                            handleHomeEndKeys
                                            options={state.fields}
                                            getOptionLabel={(option) => {
                                                if (typeof option === 'string') return option;
                                                if (option.inputValue) return option.inputValue;
                                                return option.name;
                                            }}
                                            isOptionEqualToValue={(option, value) => option.id === value.id}
                                            renderOption={(props, option) => {
                                                const { key, ...otherProps } = props;
                                                return (
                                                    <li key={option.id} {...otherProps}>
                                                        {option.name} {option.location ? `— ${option.location}` : ""}
                                                    </li>
                                                );
                                            }}
                                            renderInput={(params) => (
                                                <TextField
                                                    {...params}
                                                    label="מיקום / מגרש"
                                                    placeholder="הקלד לחיפוש או להוספת מגרש חדש..."
                                                    size="small"
                                                />
                                            )}
                                        />
                                    )}

                                    <Grid container spacing={2}>
                                        <Grid size={{ xs: 12, sm: state.seriesType === 'WEEKLY' ? 4 : 6 }}>
                                            <TextField
                                                label="שעה קבועה"
                                                type="time"
                                                fullWidth
                                                size="small"
                                                value={state.time}
                                                onChange={(e) => actions.setTime(e.target.value)}
                                                InputLabelProps={{ shrink: true }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: state.seriesType === 'WEEKLY' ? 4 : 6 }}>
                                            <TextField
                                                label="משך זמן (שעות)"
                                                type="number"
                                                fullWidth
                                                size="small"
                                                value={state.duration}
                                                onChange={(e) => actions.setDuration(parseFloat(e.target.value) || 1)}
                                                InputProps={{ inputProps: { min: 0.5, step: 0.25 } }}
                                            />
                                        </Grid>
                                        {state.seriesType === 'WEEKLY' && (
                                            <Grid size={{ xs: 12, sm: 4 }}>
                                                <TextField
                                                    label="יום קבוע"
                                                    fullWidth
                                                    size="small"
                                                    disabled
                                                    value={state.initialDayOfWeek !== null && state.initialDayOfWeek !== undefined ? DAYS[state.initialDayOfWeek] : ""}
                                                    helperText="לא ניתן לשנות יום בקבוצה שבועית קיימת"
                                                />
                                            </Grid>
                                        )}
                                    </Grid>
                                </Stack>
                            </Paper>
                        </Grid>

                        <Grid size={{ xs: 12 }} mt={1}>
                            <TextField
                                label="שעות לפתיחת רישום לפני המשחק"
                                type="number"
                                fullWidth
                                value={state.hours}
                                onChange={(e) => actions.setHours(e.target.value)}
                                helperText="השאר ריק כדי שההרשמה תיפתח מיד עם יצירת המשחק"
                                InputLabelProps={{ shrink: true }}
                                placeholder="לדוגמה: 48 (יומיים לפני)"
                            />
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={state.updateFutureGames}
                                        onChange={(e) => actions.setUpdateFutureGames(e.target.checked)}
                                    />
                                }
                                label="עדכן גם משחקים עתידיים"
                                sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
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
                            מחק קבוצה ומשחקים עתידיים
                        </Button>
                    </Box>

                </DialogContent>
                <DialogActions sx={{ direction: "ltr", justifyContent: 'space-between' }}>
                    <Button onClick={actions.handleClose} color="inherit">ביטול</Button>
                    <Button
                        onClick={actions.handleSave}
                        variant="contained"
                        startIcon={!state.loading && <SaveIcon />}
                        disabled={state.loading}
                    >
                        {state.loading ? <CircularProgress size={24} color="inherit" /> : "שמור שינויים"}
                    </Button>
                </DialogActions>
            </Dialog>

            <DeleteSeriesDialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                seriesId={hookProps.seriesId}
                seriesName={state.title || hookProps.initialTitle || "קבוצה"}
                onSuccess={handleDeleteSuccess}
            />
        </>
    );
}
