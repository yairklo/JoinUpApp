"use client";
import { useMemo, useState } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";

// MUI Imports
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Switch from "@mui/material/Switch";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";

// Icons
import MapIcon from "@mui/icons-material/Map";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AddIcon from "@mui/icons-material/Add";

import { useGameCreator, FieldOption } from "@/hooks/useGameCreator";

const filter = createFilterOptions<FieldOption>();

export default function NewGameInline({ fieldId, onCreated }: { fieldId?: string; onCreated?: (fieldId: string) => void }) {
  const { state, actions } = useGameCreator(fieldId, onCreated);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const MapWithNoSSR = useMemo(
    () => dynamic(() => import("./MapComponent"), { ssr: false, loading: () => <div className="p-4 text-center">Loading map...</div> }),
    []
  );

  return (
    <Box>
      <SignedOut>
        <Alert severity="warning" action={<SignInButton mode="modal"><Button color="inherit" size="small">Sign in</Button></SignInButton>}>
          You must sign in to create a game.
        </Alert>
      </SignedOut>

      <SignedIn>
        {state.error && <Alert severity="error" sx={{ mb: 2 }}>{state.error}</Alert>}
        {state.success && <Alert severity="success" sx={{ mb: 2 }}>{state.success}</Alert>}

        <form onSubmit={actions.submit}>
          <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Stack spacing={3}>

              {/* --- SECTION 1: FIELD SELECTION --- */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" mb={1}>Where & When</Typography>
                <Grid container spacing={2} alignItems="flex-start">
                  <Grid size={{ xs: 12, sm: 8 }}>
                    {state.newFieldMode ? (
                      <Box border={1} borderColor="divider" borderRadius={1} p={2} bgcolor="action.hover">
                        <Typography variant="subtitle2" gutterBottom>Create New Field</Typography>
                        <Stack spacing={2}>
                          <TextField label="Field Name" size="small" fullWidth value={state.newField.name} onChange={e => actions.setNewField(p => ({ ...p, name: e.target.value }))} />
                          <TextField label="Location / Address" size="small" fullWidth value={state.newField.location} onChange={e => actions.setNewField(p => ({ ...p, location: e.target.value }))} />
                          <Stack direction="row" spacing={2}>
                            <FormControlLabel control={<Checkbox checked={state.newField.type === 'open'} onChange={() => actions.setNewField(p => ({ ...p, type: 'open' }))} />} label="Open (Outdoor)" />
                            <FormControlLabel control={<Checkbox checked={state.newField.type === 'closed'} onChange={() => actions.setNewField(p => ({ ...p, type: 'closed' }))} />} label="Closed (Indoor)" />
                          </Stack>
                          <Button size="small" onClick={() => actions.setNewFieldMode(false)}>Cancel</Button>
                        </Stack>
                      </Box>
                    ) : (
                      <Autocomplete
                        value={state.selectedField}
                        onChange={(event, newValue) => {
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
                              name: `Add "${inputValue}"`,
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
                        renderOption={(props, option) => {
                          const { key, ...otherProps } = props;
                          return (
                            <li key={option.id} {...otherProps}>
                              {option.name} {option.location ? `— ${option.location}` : ""}
                            </li>
                          );
                        }}
                        renderInput={(params) => <TextField {...params} label="Search Field" placeholder="Type to search or add new..." size="small" />}
                      />
                    )}
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Button
                      variant="outlined"
                      startIcon={<MapIcon />}
                      fullWidth
                      onClick={() => setShowMap(true)}
                      sx={{ height: 40 }}
                    >
                      Map
                    </Button>
                  </Grid>
                </Grid>
              </Box>

              {/* --- SECTION 2: BASIC DETAILS --- */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Game Title (Optional)"
                    placeholder="e.g. Friday Night Soccer"
                    size="small"
                    fullWidth
                    value={state.form.title}
                    onChange={(e) => actions.update("title", e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Date"
                    type="date"
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={state.form.date}
                    slotProps={{ htmlInput: { min: state.todayStr } }}
                    onChange={(e) => actions.update("date", e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Time"
                    type="time"
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={state.form.time}
                    onChange={(e) => actions.update("time", e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Duration (h)"
                    type="number"
                    fullWidth
                    size="small"
                    value={state.form.duration}
                    onChange={(e) => actions.update("duration", Number(e.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Max Players"
                    type="number"
                    fullWidth
                    size="small"
                    value={state.form.maxPlayers}
                    onChange={(e) => actions.update("maxPlayers", Number(e.target.value))}
                  />
                </Grid>
              </Grid>

              {/* --- SECTION 3: ADVANCED TOGGLE --- */}
              <Box>
                <Button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  size="small"
                  color="inherit"
                >
                  {showAdvanced ? "Hide Options" : "More Options (Description, Lottery, Private)"}
                </Button>

                <Collapse in={showAdvanced}>
                  <Stack spacing={2} mt={2}>
                    <TextField
                      label="Description / Notes"
                      multiline
                      rows={2}
                      fullWidth
                      size="small"
                      value={state.form.description}
                      onChange={(e) => actions.update("description", e.target.value)}
                    />

                    <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
                      <FormControlLabel
                        control={<Switch checked={state.form.isFriendsOnly} onChange={(e) => actions.update("isFriendsOnly", e.target.checked)} />}
                        label="Friends Only (Private)"
                      />
                      <FormControlLabel
                        control={<Switch checked={state.form.lotteryEnabled} onChange={(e) => actions.update("lotteryEnabled", e.target.checked)} />}
                        label="Enable Lottery"
                      />
                      <FormControlLabel
                        control={<Switch checked={state.form.futureRegistration} onChange={(e) => actions.update("futureRegistration", e.target.checked)} />}
                        label="Future Registration"
                      />
                    </Stack>

                    <Collapse in={state.form.lotteryEnabled}>
                      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'warning.light', borderColor: 'warning.main' }}>
                        <Stack spacing={2}>
                          <Typography variant="caption" fontWeight="bold" color="warning.contrastText">
                            LOTTERY SETTINGS
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid size={6}>
                              <TextField
                                label="Lottery Date"
                                type="date"
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={state.form.lotteryDate}
                                onChange={(e) => actions.update("lotteryDate", e.target.value)}
                              />
                            </Grid>
                            <Grid size={6}>
                              <TextField
                                label="Lottery Time"
                                type="time"
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={state.form.lotteryTime}
                                onChange={(e) => actions.update("lotteryTime", e.target.value)}
                              />
                            </Grid>
                          </Grid>
                          <FormControlLabel
                            control={<Checkbox checked={state.form.organizerInLottery} onChange={(e) => actions.update("organizerInLottery", e.target.checked)} />}
                            label="Include me (organizer) in the lottery draw"
                          />
                        </Stack>
                      </Paper>
                    </Collapse>

                    <Collapse in={state.form.futureRegistration}>
                      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'info.light', borderColor: 'info.main', mt: 2 }}>
                        <Stack spacing={2}>
                          <Typography variant="caption" fontWeight="bold" color="info.contrastText">
                            REGISTRATION OPENS AT
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid size={6}>
                              <TextField
                                label="Open Date"
                                type="date"
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={state.form.futureRegDate}
                                onChange={(e) => actions.update("futureRegDate", e.target.value)}
                              />
                            </Grid>
                            <Grid size={6}>
                              <TextField
                                label="Open Time"
                                type="time"
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={state.form.futureRegTime}
                                onChange={(e) => actions.update("futureRegTime", e.target.value)}
                              />
                            </Grid>
                          </Grid>
                        </Stack>
                      </Paper>
                    </Collapse>

                  </Stack>
                </Collapse>
              </Box>

              <Box display="flex" justifyContent="flex-end">
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!state.canSubmit || state.submitting}
                  startIcon={state.submitting ? null : <AddIcon />}
                >
                  {state.submitting ? "Creating..." : "Create Game"}
                </Button>
              </Box>

            </Stack>
          </Paper>
        </form>

        <Dialog open={showMap} onClose={() => setShowMap(false)} fullWidth maxWidth="md">
          <DialogTitle>Field Map</DialogTitle>
          <DialogContent sx={{ p: 0, height: 400 }}>
            <MapWithNoSSR />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowMap(false)}>Close</Button>
          </DialogActions>
        </Dialog>

      </SignedIn>
    </Box>
  );
}