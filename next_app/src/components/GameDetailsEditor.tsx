"use client";

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
import Paper from "@mui/material/Paper";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";

// Icons
import EditIcon from "@mui/icons-material/Edit";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

import { SPORT_MAPPING } from "@/utils/sports";
import { useGameEditor, GameEditorProps } from "@/hooks/useGameEditor";
import type { FieldOption } from "@/hooks/useGameCreator";

export const SPORTS = Object.entries(SPORT_MAPPING).map(([value, label]) => ({
  value,
  label,
}));

const filter = createFilterOptions<FieldOption>();

// Extend the props to include canManage, which isn't in the hook props but is in the component props
interface ComponentProps extends GameEditorProps {
  canManage: boolean;
}

export default function GameDetailsEditor(props: ComponentProps) {
  const { canManage } = props;

  // Use the custom hook
  const { state, actions } = useGameEditor(props);

  if (!canManage) return null;

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<EditIcon />}
        onClick={actions.handleOpen}
        sx={{ mt: 2, borderRadius: 2 }}
        fullWidth
      >
        ערוך פרטי משחק
      </Button>

      <Dialog open={state.open} onClose={actions.handleClose} maxWidth="sm" fullWidth>
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
                {state.newFieldMode ? (
                  <Box border={1} borderColor="divider" borderRadius={1} p={2} bgcolor="action.hover">
                    <Typography variant="subtitle2" gutterBottom>צור מגרש חדש</Typography>
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
                      <Stack direction="row" spacing={2}>
                        <FormControlLabel
                          control={<Checkbox checked={state.newField.type === 'open'} onChange={() => actions.setNewField(p => ({ ...p, type: 'open' }))} />}
                          label="פתוח (חיצוני)"
                        />
                        <FormControlLabel
                          control={<Checkbox checked={state.newField.type === 'closed'} onChange={() => actions.setNewField(p => ({ ...p, type: 'closed' }))} />}
                          label="סגור (פנימי)"
                        />
                      </Stack>
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
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="כותרת המשחק (אופציונלי)"
                  fullWidth
                  value={state.title}
                  onChange={(e) => actions.setTitle(e.target.value)}
                  placeholder="למשל: כדורגל שישי בצהריים"
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="תאריך"
                  type="date"
                  fullWidth
                  value={state.date}
                  onChange={(e) => actions.setDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="שעה"
                  type="time"
                  fullWidth
                  value={state.time}
                  onChange={(e) => actions.setTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="כמות שחקנים מקסימלית"
                  type="number"
                  fullWidth
                  value={state.maxPlayers}
                  onChange={(e) => actions.setMaxPlayers(parseInt(e.target.value))}
                  InputProps={{ inputProps: { min: 2 } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label='גודל קבוצה (למשל 5 ל "5X5")'
                  type="number"
                  fullWidth
                  value={state.teamSize || ""}
                  onChange={(e) => actions.setTeamSize(e.target.value ? parseInt(e.target.value) : null)}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="מחיר (₪)"
                  type="number"
                  fullWidth
                  value={state.price || ""}
                  onChange={(e) => actions.setPrice(e.target.value ? parseInt(e.target.value) : null)}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  select
                  label="סוג ספורט"
                  fullWidth
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
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="משך זמן (שעות)"
                  type="number"
                  fullWidth
                  value={state.duration}
                  onChange={(e) => actions.setDuration(parseFloat(e.target.value) || 1)}
                  InputProps={{ inputProps: { min: 0.5, step: 0.25 } }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  margin="dense"
                  label="תיאור / הערות נוספות"
                  type="text"
                  fullWidth
                  multiline
                  rows={2}
                  variant="outlined"
                  value={state.description}
                  onChange={(e) => actions.setDescription(e.target.value)}
                  dir="rtl"
                />
                
                <TextField
                  margin="dense"
                  label="הודעת פתיחה אוטומטית (נשלח בפרטי למצטרפים)"
                  type="text"
                  fullWidth
                  multiline
                  rows={2}
                  variant="outlined"
                  value={state.welcomeMessage}
                  onChange={(e) => actions.setWelcomeMessage(e.target.value)}
                  dir="rtl"
                />
              </Grid>

              {/* Future Registration Section */}
              <Grid size={{ xs: 12 }} mt={2}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <FormControlLabel
                    control={<Switch checked={state.futureRegEnabled} onChange={(e) => actions.setFutureRegEnabled(e.target.checked)} />}
                    label="פתיחת רישום עתידית"
                    sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                  />
                  <Collapse in={state.futureRegEnabled}>
                    <Grid container spacing={2} mt={1}>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="תאריך פתיחה"
                          type="date"
                          fullWidth
                          value={state.regDate}
                          onChange={(e) => actions.setRegDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="שעה"
                          type="time"
                          fullWidth
                          value={state.regTime}
                          onChange={(e) => actions.setRegTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                    </Grid>
                  </Collapse>
                </Paper>
              </Grid>

              {/* Friends Only / Private Section */}
              <Grid size={{ xs: 12 }} mt={2}>
                <Paper variant="outlined" sx={{ p: 2, borderColor: state.isFriendsOnly ? 'primary.main' : 'divider' }}>
                  <FormControlLabel
                    control={<Switch checked={state.isFriendsOnly} onChange={(e) => actions.setIsFriendsOnly(e.target.checked)} />}
                    label="משחק פרטי (לחברים בלבד)"
                    sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                  />

                  <FormControlLabel
                    control={<Switch checked={state.requiresApproval} onChange={(e) => actions.setRequiresApproval(e.target.checked)} />}
                    label="דורש אישור הצטרפות"
                    sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                  />

                  <Collapse in={state.isFriendsOnly}>
                    <Box mt={2} p={2} bgcolor="grey.50" borderRadius={1} border={1} borderColor="divider">
                      <FormControlLabel
                        control={<Switch checked={state.makePublicLater} onChange={(e) => actions.setMakePublicLater(e.target.checked)} />}
                        label="פתח לציבור במועד מאוחר יותר"
                        sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                      />
                      <Collapse in={state.makePublicLater}>
                        <Grid container spacing={2} mt={1}>
                          <Grid size={{ xs: 6 }}>
                            <TextField
                              label="תאריך פתיחה לציבור"
                              type="date"
                              fullWidth
                              value={state.publicDate}
                              onChange={(e) => actions.setPublicDate(e.target.value)}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <TextField
                              label="שעת פתיחה"
                              type="time"
                              fullWidth
                              value={state.publicTime}
                              onChange={(e) => actions.setPublicTime(e.target.value)}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      </Collapse>
                    </Box>
                  </Collapse>
                </Paper>
              </Grid>

            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ direction: "ltr", display: "flex", justifyContent: "space-between" }}>
          <Button
            color="error"
            onClick={actions.deleteGame}
            startIcon={<DeleteForeverIcon />}
            disabled={state.loading}
          >
            מחק משחק
          </Button>
          <Box>
            <Button onClick={actions.handleClose} color="inherit" sx={{ mr: 1 }}>ביטול</Button>
            <Button
              onClick={actions.saveGame}
              variant="contained"
              disabled={state.loading}
            >
              {state.loading ? <CircularProgress size={24} color="inherit" /> : "שמור שינויים"}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </>
  );
}
