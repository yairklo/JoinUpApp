"use client";

import { useState } from "react";

// MUI
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import { HebrewTimeField } from "@/components/HebrewDateTimeField";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Collapse from "@mui/material/Collapse";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";

// Icons
import SettingsIcon from "@mui/icons-material/Settings";
import SaveIcon from "@mui/icons-material/Save";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import MenuItem from "@mui/material/MenuItem";

// Components
import ImageUploadField from "./ImageUploadField";
import DeleteSeriesDialog from "./DeleteSeriesDialog";
import { useSeriesSettingsEditor, SeriesSettingsEditorHookProps } from "@/hooks/useSeriesSettingsEditor";
import type { FieldOption } from "@/hooks/useGameCreator";
import { SPORTS } from "@/components/GameDetailsEditor";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
};

// Plain-language preview of the weekday rule for a weekly group, e.g. "למשחק של יום שבת 20:00
// ההרשמה תיפתח ביום ראשון 18:00 שלפניו (6 ימים ו-2 שעות לפני)". Mirrors the server's
// computeRegistrationOpensAt: the latest (day, time) strictly before the game.
function describeWeeklyRule(gameDay: number | null | undefined, gameTime: string, regDay: number, regTime: string): string {
    if (gameDay === null || gameDay === undefined || !/^\d{2}:\d{2}$/.test(gameTime) || !/^\d{2}:\d{2}$/.test(regTime)) {
        return `ההרשמה לכל משחק תיפתח ביום ${DAYS[regDay]} ב־${regTime} שלפניו`;
    }
    let daysBack = (gameDay - regDay + 7) % 7;
    if (daysBack === 0 && toMinutes(regTime) >= toMinutes(gameTime)) daysBack = 7;
    const totalMinutes = daysBack * 24 * 60 + toMinutes(gameTime) - toMinutes(regTime);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const parts = [days ? `${days} ימים` : "", hours ? `${hours} שעות` : ""].filter(Boolean).join(" ו־");
    return `למשחק של יום ${DAYS[gameDay]} ${gameTime} ההרשמה תיפתח ביום ${DAYS[regDay]} ${regTime} שלפניו${parts ? ` (${parts} לפני)` : ""}`;
}

const filter = createFilterOptions<FieldOption>();

interface SeriesSettingsEditorProps extends SeriesSettingsEditorHookProps {
    canManage: boolean;
}

export default function SeriesSettingsEditor({ canManage, ...hookProps }: SeriesSettingsEditorProps) {
    const { state, actions } = useSeriesSettingsEditor(hookProps);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [showAdvancedReg, setShowAdvancedReg] = useState(false);

    if (!canManage) return null;

    const handleDeleteSuccess = () => {
        setDeleteDialogOpen(false);
        actions.handleDeleteSuccess();
    };

    return (
        <>
            <IconButton
                color="inherit"
                onClick={actions.handleOpen}
                size="small"
                aria-label="הגדרות קבוצה"
            >
                <SettingsIcon />
            </IconButton>

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
                            <ImageUploadField
                                imageUrl={state.imageUrl}
                                name={state.title || "קבוצה"}
                                label="העלה תמונת קבוצה"
                                onUpload={actions.uploadImage}
                                onUploaded={actions.handleImageUploaded}
                                onRemove={actions.removeImage}
                                onRemoved={actions.handleImageRemoved}
                            />
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
                                            <HebrewTimeField
                                                label="שעה קבועה"
                                                fullWidth
                                                size="small"
                                                value={state.time}
                                                onChange={(e) => actions.setTime(e.target.value)}
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
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                                    פתיחת הרשמה למשחקים בקבוצה
                                </Typography>
                                <RadioGroup
                                    value={state.regMode}
                                    onChange={(e) => actions.setRegMode(e.target.value as typeof state.regMode)}
                                >
                                    <FormControlLabel value="weekly" control={<Radio size="small" />} label="ביום ובשעה קבועים בכל שבוע" />
                                    <Collapse in={state.regMode === "weekly"}>
                                        <Stack spacing={1.5} sx={{ pr: 4, pb: 1 }}>
                                            <Stack direction="row" spacing={2}>
                                                <TextField
                                                    select
                                                    label="יום"
                                                    size="small"
                                                    value={state.regDay}
                                                    onChange={(e) => actions.setRegDay(Number(e.target.value))}
                                                    sx={{ minWidth: 140 }}
                                                >
                                                    {DAYS.map((d, i) => (
                                                        <MenuItem key={d} value={i}>{d}</MenuItem>
                                                    ))}
                                                </TextField>
                                                <HebrewTimeField
                                                    label="שעה"
                                                    size="small"
                                                    value={state.regTime}
                                                    onChange={(e) => actions.setRegTime(e.target.value)}
                                                />
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary">
                                                {describeWeeklyRule(
                                                    state.seriesType === "WEEKLY" ? state.initialDayOfWeek : null,
                                                    state.time,
                                                    state.regDay,
                                                    state.regTime
                                                )}
                                            </Typography>
                                        </Stack>
                                    </Collapse>
                                    <FormControlLabel value="none" control={<Radio size="small" />} label="ללא פתיחה מתוזמנת (ההרשמה פתוחה מיד)" />
                                    <Collapse in={showAdvancedReg || state.regMode === "hours"}>
                                        <FormControlLabel value="hours" control={<Radio size="small" />} label="מתקדם: מספר שעות קבוע לפני כל משחק" />
                                        <Collapse in={state.regMode === "hours"}>
                                            <TextField
                                                label="שעות לפני המשחק"
                                                type="number"
                                                size="small"
                                                value={state.hours}
                                                onChange={(e) => actions.setHours(e.target.value)}
                                                placeholder="לדוגמה: 48"
                                                sx={{ mr: 4, mb: 1, maxWidth: 200 }}
                                                InputProps={{ inputProps: { min: 1, step: 1 } }}
                                            />
                                        </Collapse>
                                    </Collapse>
                                </RadioGroup>
                                {!showAdvancedReg && state.regMode !== "hours" && (
                                    <Button size="small" onClick={() => setShowAdvancedReg(true)} sx={{ mt: 0.5 }}>
                                        אפשרויות מתקדמות
                                    </Button>
                                )}
                                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                                    חל על כל המשחקים העתידיים בקבוצה. שינוי במשחק בודד לא משפיע על שאר הקבוצה.
                                </Typography>
                            </Paper>
                        </Grid>

                        <Grid size={{ xs: 12 }} mt={1}>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                                    ברירות מחדל למשחקים חדשים בקבוצה
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 6 }}>
                                        <TextField
                                            label="כמות שחקנים מקסימלית"
                                            type="number"
                                            fullWidth
                                            size="small"
                                            value={state.maxPlayers ?? ""}
                                            onChange={(e) => actions.setMaxPlayers(e.target.value === "" ? null : parseInt(e.target.value))}
                                            error={state.maxPlayers === null || state.maxPlayers < 2}
                                            InputProps={{ inputProps: { min: 2 } }}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 6 }}>
                                        <TextField
                                            label='גודל קבוצה (למשל 5 ל "5X5")'
                                            type="number"
                                            fullWidth
                                            size="small"
                                            value={state.teamSize || ""}
                                            onChange={(e) => actions.setTeamSize(e.target.value ? parseInt(e.target.value) : null)}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 6 }}>
                                        <TextField
                                            label="מחיר (₪)"
                                            type="number"
                                            fullWidth
                                            size="small"
                                            value={state.price || ""}
                                            onChange={(e) => actions.setPrice(e.target.value ? parseInt(e.target.value) : null)}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 6 }}>
                                        <TextField
                                            select
                                            label="סוג ספורט"
                                            fullWidth
                                            size="small"
                                            value={state.sport}
                                            onChange={(e) => actions.setSport(e.target.value)}
                                        >
                                            {SPORTS.map((option) => (
                                                <MenuItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    </Grid>
                                    <Grid size={{ xs: 12 }}>
                                        <TextField
                                            label="הודעת פתיחה אוטומטית (נשלח בפרטי למצטרפים)"
                                            fullWidth
                                            multiline
                                            rows={2}
                                            size="small"
                                            value={state.welcomeMessage}
                                            onChange={(e) => actions.setWelcomeMessage(e.target.value)}
                                            InputProps={{ inputProps: { maxLength: 2000 } }}
                                        />
                                    </Grid>
                                </Grid>

                                <Stack mt={2}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={state.isFriendsOnly}
                                                onChange={(e) => actions.setIsFriendsOnly(e.target.checked)}
                                            />
                                        }
                                        label="משחקים לחברים בלבד"
                                        sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={state.requiresApproval}
                                                onChange={(e) => actions.setRequiresApproval(e.target.checked)}
                                            />
                                        }
                                        label="דורש אישור הצטרפות"
                                        sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={state.lotteryEnabled}
                                                onChange={(e) => actions.setLotteryEnabled(e.target.checked)}
                                            />
                                        }
                                        label="הגרלת מקומות"
                                        sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                                    />
                                    <Collapse in={state.lotteryEnabled}>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={state.organizerInLottery}
                                                    onChange={(e) => actions.setOrganizerInLottery(e.target.checked)}
                                                />
                                            }
                                            label="לכלול את המארגן בהגרלה"
                                            sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                                        />
                                    </Collapse>
                                </Stack>
                            </Paper>
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
