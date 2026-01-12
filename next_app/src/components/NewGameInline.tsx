"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";

// MUI Imports
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid"; // בגרסה החדשה זה Grid v2
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type FieldOption = { id: string; name: string; location?: string | null; inputValue?: string };

const filter = createFilterOptions<FieldOption>();

export default function NewGameInline({ fieldId, onCreated }: { fieldId?: string; onCreated?: (fieldId: string) => void }) {
  const { getToken, isSignedIn } = useAuth();

  // States
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Field Logic States
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [selectedField, setSelectedField] = useState<FieldOption | null>(null);
  const [newFieldMode, setNewFieldMode] = useState(false);
  const [newField, setNewField] = useState<{ name: string; location: string; type: "open" | "closed" }>({
    name: "",
    location: "",
    type: "open",
  });

  const [form, setForm] = useState({
    date: "",
    time: "",
    duration: 1,
    maxPlayers: 10,
    description: "",
    isFriendsOnly: false,
    lotteryEnabled: false,
    organizerInLottery: false,
    lotteryDate: "",
    lotteryTime: "",
    futureRegistration: false,
    futureRegDate: "",
    futureRegTime: "",
  });

  const MapWithNoSSR = useMemo(
    () => dynamic(() => import("./MapComponent"), { ssr: false, loading: () => <div className="p-4 text-center">Loading map...</div> }),
    []
  );

  // Time Helpers
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  function roundUpToNextQuarter(d: Date) {
    const t = new Date(d.getTime());
    t.setSeconds(0, 0);
    const minutes = t.getMinutes();
    const add = (15 - (minutes % 15)) % 15;
    if (add > 0) t.setMinutes(minutes + add);
    const h = String(t.getHours()).padStart(2, "0");
    const m = String(t.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  const nextQuarterTimeStr = useMemo(() => roundUpToNextQuarter(today), []);

  // 1. Fetch Fields
  useEffect(() => {
    let ignore = false;
    async function fetchFields() {
      try {
        const res = await fetch(`${API_BASE}/api/fields`, { cache: "no-store" });
        if (!res.ok) return;
        const arr: Array<{ id: string; name: string; location?: string | null }> = await res.json();
        if (!ignore) setFields(arr);

        if (fieldId && !ignore) {
          const found = arr.find(f => f.id === fieldId);
          if (found) setSelectedField(found);
        }
      } catch { }
    }
    fetchFields();
    return () => { ignore = true; };
  }, [fieldId]);

  // 2. Auto-set time
  useEffect(() => {
    if (form.date === todayStr) {
      if (!form.time || form.time < nextQuarterTimeStr) {
        setForm((prev) => ({ ...prev, time: nextQuarterTimeStr }));
      }
    }
  }, [form.date, nextQuarterTimeStr, todayStr]);

  const canSubmit = useMemo(() => {
    const hasField = !!selectedField?.id || (newFieldMode && newField.name.trim() && newField.location.trim());
    return Boolean(isSignedIn && hasField && form.date && form.time && form.maxPlayers);
  }, [isSignedIn, selectedField, newFieldMode, newField, form.date, form.time, form.maxPlayers]);

  // Submit Handler
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      const fieldIdToUse = selectedField?.id || "";

      if (form.lotteryEnabled) {
        if (!form.lotteryDate || !form.lotteryTime) throw new Error("Please select lottery date and time");
        const startTs = new Date(`${form.date}T${form.time}:00`).getTime();
        const lotteryTs = new Date(`${form.lotteryDate}T${form.lotteryTime}:00`).getTime();
        if (lotteryTs >= startTs) throw new Error("Lottery time must be before game start");
      }

      const res = await fetch(`${API_BASE}/api/games`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fieldId: fieldIdToUse,
          ...form,
          ...(newFieldMode
            ? { newField: { name: newField.name.trim(), location: newField.location.trim(), type: newField.type } }
            : {}),
          isOpenToJoin: !form.isFriendsOnly,
          lotteryAt: form.lotteryEnabled ? `${form.lotteryDate}T${form.lotteryTime}:00` : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create game");
      }

      const created = await res.json();
      setSuccess("Game created successfully!");
      if (onCreated) onCreated(created.fieldId);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Box>
      <SignedOut>
        <Alert severity="warning" action={<SignInButton mode="modal"><Button color="inherit" size="small">Sign in</Button></SignInButton>}>
          You must sign in to create a game.
        </Alert>
      </SignedOut>

      <SignedIn>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <form onSubmit={onSubmit}>
          <Paper elevation={0} variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
            <Stack spacing={3}>

              {/* --- SECTION 1: FIELD SELECTION --- */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" mb={1}>Where & When</Typography>
                <Grid container spacing={2} alignItems="flex-start">
                  <Grid size={{ xs: 12, sm: 8 }}>
                    {newFieldMode ? (
                      <Box border={1} borderColor="divider" borderRadius={1} p={2} bgcolor="action.hover">
                        <Typography variant="subtitle2" gutterBottom>Create New Field</Typography>
                        <Stack spacing={2}>
                          <TextField label="Field Name" size="small" fullWidth value={newField.name} onChange={e => setNewField(p => ({ ...p, name: e.target.value }))} />
                          <TextField label="Location / Address" size="small" fullWidth value={newField.location} onChange={e => setNewField(p => ({ ...p, location: e.target.value }))} />
                          <Stack direction="row" spacing={2}>
                            <FormControlLabel control={<Checkbox checked={newField.type === 'open'} onChange={() => setNewField(p => ({ ...p, type: 'open' }))} />} label="Open (Outdoor)" />
                            <FormControlLabel control={<Checkbox checked={newField.type === 'closed'} onChange={() => setNewField(p => ({ ...p, type: 'closed' }))} />} label="Closed (Indoor)" />
                          </Stack>
                          <Button size="small" onClick={() => setNewFieldMode(false)}>Cancel</Button>
                        </Stack>
                      </Box>
                    ) : (
                      <Autocomplete
                        value={selectedField}
                        onChange={(event, newValue) => {
                          if (typeof newValue === 'string') {
                            setTimeout(() => {
                              setNewFieldMode(true);
                              setNewField(p => ({ ...p, name: newValue }));
                            });
                          } else if (newValue && newValue.inputValue) {
                            setNewFieldMode(true);
                            setNewField(p => ({ ...p, name: newValue.inputValue || "" }));
                          } else {
                            setSelectedField(newValue);
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
                        options={fields}
                        getOptionLabel={(option) => {
                          if (typeof option === 'string') return option;
                          if (option.inputValue) return option.inputValue;
                          return option.name;
                        }}
                        renderOption={(props, option) => {
                          // הסרנו את ה-key מפה והעברנו ל-li כי Autocomplete מטפל בזה
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
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Date"
                    type="date"
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={form.date}
                    slotProps={{ htmlInput: { min: todayStr } }}
                    onChange={(e) => update("date", e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Time"
                    type="time"
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={form.time}
                    onChange={(e) => update("time", e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Duration (h)"
                    type="number"
                    fullWidth
                    size="small"
                    value={form.duration}
                    onChange={(e) => update("duration", Number(e.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Max Players"
                    type="number"
                    fullWidth
                    size="small"
                    value={form.maxPlayers}
                    onChange={(e) => update("maxPlayers", Number(e.target.value))}
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
                    {/* Description */}
                    <TextField
                      label="Description / Notes"
                      multiline
                      rows={2}
                      fullWidth
                      size="small"
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                    />


                    {/* Toggles */}
                    <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
                      <FormControlLabel
                        control={<Switch checked={form.isFriendsOnly} onChange={(e) => update("isFriendsOnly", e.target.checked)} />}
                        label="Friends Only (Private)"
                      />
                      <FormControlLabel
                        control={<Switch checked={form.lotteryEnabled} onChange={(e) => update("lotteryEnabled", e.target.checked)} />}
                        label="Enable Lottery"
                      />
                      <FormControlLabel
                        control={<Switch checked={form.futureRegistration} onChange={(e) => update("futureRegistration", e.target.checked)} />}
                        label="Future Registration"
                      />
                    </Stack>

                    {/* Lottery Details */}
                    <Collapse in={form.lotteryEnabled}>
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
                                value={form.lotteryDate}
                                onChange={(e) => update("lotteryDate", e.target.value)}
                              />
                            </Grid>
                            <Grid size={6}>
                              <TextField
                                label="Lottery Time"
                                type="time"
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={form.lotteryTime}
                                onChange={(e) => update("lotteryTime", e.target.value)}
                              />
                            </Grid>
                          </Grid>
                          <FormControlLabel
                            control={<Checkbox checked={form.organizerInLottery} onChange={(e) => update("organizerInLottery", e.target.checked)} />}
                            label="Include me (organizer) in the lottery draw"
                          />
                        </Stack>
                      </Paper>
                    </Collapse>

                    {/* Future Registration Details */}
                    <Collapse in={form.futureRegistration}>
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
                                value={form.futureRegDate}
                                onChange={(e) => update("futureRegDate", e.target.value)}
                              />
                            </Grid>
                            <Grid size={6}>
                              <TextField
                                label="Open Time"
                                type="time"
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                                value={form.futureRegTime}
                                onChange={(e) => update("futureRegTime", e.target.value)}
                              />
                            </Grid>
                          </Grid>
                        </Stack>
                      </Paper>
                    </Collapse>

                  </Stack>
                </Collapse>
              </Box>

              {/* --- SUBMIT --- */}
              <Box display="flex" justifyContent="flex-end">
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!canSubmit || submitting}
                  startIcon={submitting ? null : <AddIcon />}
                >
                  {submitting ? "Creating..." : "Create Game"}
                </Button>
              </Box>

            </Stack>
          </Paper>
        </form>

        {/* --- MAP DIALOG --- */}
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