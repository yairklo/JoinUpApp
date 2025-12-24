"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";

// MUI Imports
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid"; // MUI v6 Grid
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Switch from "@mui/material/Switch";
import Collapse from "@mui/material/Collapse";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";

// Icons
import MapIcon from "@mui/icons-material/Map";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type FieldOption = { id: string; name: string; location?: string | null; inputValue?: string };
const filter = createFilterOptions<FieldOption>();

function NewGamePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const urlFieldId = params?.get("fieldId") ?? "";
  
  const { getToken, isSignedIn } = useAuth();
  
  // UI States
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Field Logic
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [selectedField, setSelectedField] = useState<FieldOption | null>(null);
  const [newFieldMode, setNewFieldMode] = useState(false);
  const [newField, setNewField] = useState<{ name: string; location: string; type: "open" | "closed" }>({
    name: "",
    location: "",
    type: "open",
  });
  const [customPoint, setCustomPoint] = useState<{ lat: number; lng: number } | null>(null);

  // Form State
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
  });

  const MapWithNoSSR = useMemo(
    () => dynamic(() => import("@/components/MapComponent"), { ssr: false, loading: () => <Box p={4} textAlign="center"><CircularProgress /></Box> }),
    []
  );

  // --- Helpers ---
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
        const arr = await res.json();
        if (!ignore) setFields(arr);
        
        // Handle URL param pre-fill
        if (urlFieldId && !ignore) {
            // אם הגענו עם ID, ננסה למצוא אותו ברשימה או נביא אותו ספציפית
            const found = arr.find((f: any) => f.id === urlFieldId);
            if (found) {
                setSelectedField(found);
            } else {
                // If not in list (maybe pagination?), fetch specific
                fetch(`${API_BASE}/api/fields/${urlFieldId}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(f => {
                        if (f && !ignore) setSelectedField(f);
                    });
            }
        }
      } catch {}
    }
    fetchFields();
    return () => { ignore = true; };
  }, [urlFieldId]);

  // 2. Auto-set time
  useEffect(() => {
    if (form.date === todayStr) {
      if (!form.time || form.time < nextQuarterTimeStr) {
        setForm((prev) => ({ ...prev, time: nextQuarterTimeStr }));
      }
    }
  }, [form.date, nextQuarterTimeStr, todayStr]);

  // Validation
  const canSubmit = useMemo(() => {
    const hasField = !!selectedField?.id || (newFieldMode && (newField.name.trim() || newField.location.trim()));
    // If new field mode active, allow submitting if name exists OR custom point exists
    const validNewField = newFieldMode ? (!!newField.name || !!customPoint) : true;
    
    return Boolean(
      isSignedIn &&
      hasField &&
      validNewField &&
      form.date &&
      form.time &&
      form.maxPlayers
    );
  }, [isSignedIn, selectedField, newFieldMode, newField, customPoint, form.date, form.time, form.maxPlayers]);

  // Submit Logic
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      const fieldIdToUse = selectedField?.id || "";

      // Logic Validation
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
          // New Field Logic
          ...(newFieldMode && !fieldIdToUse
            ? {
                newField: {
                  name: newField.name.trim(),
                  location: newField.location.trim(),
                  type: newField.type
                },
              }
            : {}),
          // Custom Map Point
          ...(customPoint ? { customLat: customPoint.lat, customLng: customPoint.lng } : {}),
          
          isOpenToJoin: !form.isFriendsOnly,
          lotteryAt: form.lotteryEnabled ? `${form.lotteryDate}T${form.lotteryTime}:00` : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create game");
      }
      
      const created = await res.json();
      setSuccess("Game created!");
      router.push(`/games?fieldId=${created.fieldId}`);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom>
        New Game
      </Typography>
      
      {/* Display pre-selected info if exists */}
      {urlFieldId && selectedField && (
         <Typography variant="body2" color="text.secondary" mb={2}>
            Creating game at: <b>{selectedField.name}</b>
         </Typography>
      )}

      <SignedOut>
        <Alert severity="warning" action={<SignInButton mode="modal"><Button color="inherit" size="small">Sign in</Button></SignInButton>}>
            You must sign in to create a game.
        </Alert>
      </SignedOut>

      <SignedIn>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <form onSubmit={onSubmit}>
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Stack spacing={3}>

              {/* --- 1. FIELD SELECTION --- */}
              {/* Only show selection if NOT preset by URL */}
              {!urlFieldId && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" mb={1}>Where & When</Typography>
                    <Grid container spacing={2} alignItems="flex-start">
                        <Grid size={{ xs: 12, sm: 9 }}>
                            {newFieldMode ? (
                                <Box border={1} borderColor="divider" borderRadius={1} p={2} bgcolor="action.hover">
                                    <Typography variant="subtitle2" gutterBottom>New Field Details</Typography>
                                    <Stack spacing={2}>
                                        <TextField 
                                            label="Field Name" 
                                            size="small" 
                                            fullWidth 
                                            value={newField.name} 
                                            onChange={e => setNewField(p => ({...p, name: e.target.value}))} 
                                        />
                                        <TextField 
                                            label="Location / Address" 
                                            size="small" 
                                            fullWidth 
                                            value={newField.location} 
                                            onChange={e => setNewField(p => ({...p, location: e.target.value}))} 
                                            helperText={customPoint ? `Pinned: ${customPoint.lat.toFixed(4)}, ${customPoint.lng.toFixed(4)}` : "Type address or pick on map"}
                                        />
                                        <Stack direction="row" spacing={2}>
                                            <FormControlLabel control={<Checkbox checked={newField.type === 'open'} onChange={() => setNewField(p => ({...p, type: 'open'}))} />} label="Open (Outdoor)" />
                                            <FormControlLabel control={<Checkbox checked={newField.type === 'closed'} onChange={() => setNewField(p => ({...p, type: 'closed'}))} />} label="Closed (Indoor)" />
                                        </Stack>
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            <Button size="small" onClick={() => { setNewFieldMode(false); setCustomPoint(null); }}>Cancel</Button>
                                        </Stack>
                                    </Stack>
                                </Box>
                            ) : (
                                <Autocomplete
                                    value={selectedField}
                                    onChange={(event, newValue) => {
                                        if (typeof newValue === 'string') {
                                            setTimeout(() => {
                                                setNewFieldMode(true);
                                                setNewField(p => ({...p, name: newValue}));
                                            });
                                        } else if (newValue && newValue.inputValue) {
                                            setNewFieldMode(true);
                                            setNewField(p => ({...p, name: newValue.inputValue || ""}));
                                        } else {
                                            setSelectedField(newValue);
                                        }
                                    }}
                                    filterOptions={(options, params) => {
                                        const filtered = filter(options, params);
                                        const { inputValue } = params;
                                        const isExisting = options.some((option) => inputValue === option.name);
                                        if (inputValue !== '' && !isExisting) {
                                            filtered.push({ inputValue, name: `Add "${inputValue}"`, id: "NEW" });
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
                                        const { key, ...otherProps } = props;
                                        return (
                                            <li key={option.id} {...otherProps}>
                                                {option.name} {option.location ? `— ${option.location}` : ""}
                                            </li>
                                        );
                                    }}
                                    renderInput={(params) => <TextField {...params} label="Search Field" placeholder="Type to search or add new..." />}
                                />
                            )}
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                             <Button 
                                variant="outlined" 
                                startIcon={<MapIcon />} 
                                fullWidth 
                                onClick={() => setShowMap(true)}
                                sx={{ height: 56 }} // Match default input height
                             >
                                Map
                             </Button>
                        </Grid>
                    </Grid>
                  </Box>
              )}

              {/* --- 2. GAME DETAILS --- */}
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

              {/* --- 3. ADVANCED OPTIONS --- */}
              <Box>
                 <Button 
                    onClick={() => setShowAdvanced(!showAdvanced)} 
                    endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    color="inherit"
                 >
                    {showAdvanced ? "Hide Advanced Options" : "Advanced Options (Description, Lottery, Private)"}
                 </Button>

                 <Collapse in={showAdvanced}>
                    <Stack spacing={3} mt={2}>
                        <TextField 
                            label="Description / Instructions" 
                            multiline 
                            rows={3} 
                            fullWidth 
                            value={form.description}
                            onChange={(e) => update("description", e.target.value)}
                        />

                        <Stack direction="row" spacing={3} alignItems="center">
                             <FormControlLabel 
                                control={<Switch checked={form.isFriendsOnly} onChange={(e) => update("isFriendsOnly", e.target.checked)} />} 
                                label="Friends Only (Private)" 
                             />
                             <FormControlLabel 
                                control={<Switch checked={form.lotteryEnabled} onChange={(e) => update("lotteryEnabled", e.target.checked)} />} 
                                label="Enable Lottery" 
                             />
                        </Stack>

                        {/* Lottery Settings */}
                        <Collapse in={form.lotteryEnabled}>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'warning.light', borderColor: 'warning.main' }}>
                                <Typography variant="subtitle2" fontWeight="bold" color="warning.contrastText" mb={2}>
                                    LOTTERY SETTINGS
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 12, sm: 6 }}>
                                        <TextField 
                                            label="Lottery Date" 
                                            type="date" 
                                            fullWidth 
                                            size="small" 
                                            InputLabelProps={{ shrink: true }}
                                            value={form.lotteryDate}
                                            slotProps={{ htmlInput: { min: todayStr } }}
                                            onChange={(e) => update("lotteryDate", e.target.value)}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, sm: 6 }}>
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
                                    <Grid size={12}>
                                        <FormControlLabel 
                                            control={<Checkbox checked={form.organizerInLottery} onChange={(e) => update("organizerInLottery", e.target.checked)} />} 
                                            label="Include organizer in lottery pool (not auto-confirmed)" 
                                        />
                                    </Grid>
                                </Grid>
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
                    size="large"
                    disabled={!canSubmit || submitting}
                    startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                >
                    {submitting ? "Creating..." : "Create Game"}
                </Button>
              </Box>

            </Stack>
          </Paper>
        </form>

        {/* --- MAP DIALOG --- */}
        <Dialog open={showMap} onClose={() => setShowMap(false)} fullWidth maxWidth="lg">
            <DialogTitle>Select Field Location</DialogTitle>
            <DialogContent sx={{ p: 0, height: '60vh' }}>
                <MapWithNoSSR
                    // Select existing field from map
                    onSelect={(f: { id: string; name: string; location?: string | null }) => {
                        setSelectedField(f);
                        setNewFieldMode(false);
                        setShowMap(false);
                    }}
                    // Pick NEW location logic
                    pickMode={true} // Allow picking always so user can create new field easily
                    picked={customPoint}
                    onPick={(pt: { lat: number; lng: number }) => {
                        setCustomPoint(pt);
                        if (!newFieldMode) {
                            setNewFieldMode(true);
                            setNewField(p => ({...p, location: ""})); // Clear text location if picked from map
                        }
                    }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setShowMap(false)}>Done</Button>
            </DialogActions>
        </Dialog>

      </SignedIn>
    </Container>
  );
}

export default function NewGamePage() {
  return (
    <Suspense fallback={<Container sx={{ py: 4 }}><CircularProgress /></Container>}>
      <NewGamePageInner />
    </Suspense>
  );
}