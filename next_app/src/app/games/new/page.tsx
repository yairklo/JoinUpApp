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
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";

// Icons
import MapIcon from "@mui/icons-material/Map";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";

import { SPORT_MAPPING, SportType } from "@/utils/sports";

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
    sport: "SOCCER" as SportType,
    date: "",
    time: "",
    title: "",
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
    makePublicLater: false,
    publicDate: "",
    publicTime: "",
    teamSize: null as number | null,
    price: null as number | null,
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
      } catch { }
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

      const startIso = `${form.date}T${form.time}:00`;
      const startTs = new Date(startIso).getTime();

      // Logic Validation
      if (form.lotteryEnabled) {
        if (!form.lotteryDate || !form.lotteryTime) throw new Error("Please select lottery date and time");
        const lotteryTs = new Date(`${form.lotteryDate}T${form.lotteryTime}:00`).getTime();
        if (lotteryTs >= startTs) throw new Error("Lottery time must be before game start");
      }

      let registrationOpensAt: string | undefined = undefined;
      if (form.futureRegistration) {
        if (!form.futureRegDate || !form.futureRegTime) throw new Error("אנא בחר תאריך ושעה לפתיחת הרישום");
        const openTs = new Date(`${form.futureRegDate}T${form.futureRegTime}:00`).getTime();
        if (openTs >= startTs) throw new Error("זמן פתיחת הרישום חייב להיות לפני תחילת המשחק");
        registrationOpensAt = new Date(`${form.futureRegDate}T${form.futureRegTime}:00`).toISOString();
      }

      let friendsOnlyUntil: string | undefined = undefined;
      if (form.isFriendsOnly && form.makePublicLater) {
        if (!form.publicDate || !form.publicTime) throw new Error("אנא בחר תאריך ושעה לפתיחת המשחק לציבור");
        const publicTs = new Date(`${form.publicDate}T${form.publicTime}:00`).getTime();
        if (publicTs >= startTs) throw new Error("המשחק חייב להיפתח לציבור לפני שהמשחק מתחיל");
        friendsOnlyUntil = new Date(`${form.publicDate}T${form.publicTime}:00`).toISOString();
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

          title: form.title || null,
          lotteryAt: form.lotteryEnabled ? new Date(`${form.lotteryDate}T${form.lotteryTime}:00`).toISOString() : undefined,
          registrationOpensAt,
          friendsOnlyUntil
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create game");
      }

      const created = await res.json();
      setSuccess("Game created");
      // redirect to home after creation (main page flow)
      router.push(`/`);
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
      <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom align="right">
        משחק חדש
      </Typography>

      {/* Display pre-selected info if exists */}
      {urlFieldId && selectedField && (
        <Typography variant="body2" color="text.secondary" mb={2} align="right">
          יוצר משחק ב: <b>{selectedField.name}</b>
        </Typography>
      )}

      <SignedOut>
        <Alert severity="warning" action={<SignInButton mode="modal"><Button color="inherit" size="small">התחבר</Button></SignInButton>}>
          עליך להתחבר כדי ליצור משחק.
        </Alert>
      </SignedOut>

      <SignedIn>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <form onSubmit={onSubmit}>
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Stack spacing={3}>

              {/* --- SPORT SELECTION --- */}
              <FormControl fullWidth size="small">
                <InputLabel id="sport-select-label">סוג ספורט</InputLabel>
                <Select
                  labelId="sport-select-label"
                  value={form.sport}
                  label="סוג ספורט"
                  onChange={(e) => update("sport", e.target.value as SportType)}
                >
                  {Object.entries(SPORT_MAPPING).map(([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* --- 1. FIELD SELECTION --- */}
              {/* Only show selection if NOT preset by URL */}
              {!urlFieldId && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" mb={1} align="right">איפה ומתי</Typography>
                  <Grid container spacing={2} alignItems="flex-start" direction="row-reverse">
                    <Grid size={{ xs: 12, sm: 9 }}>
                      {newFieldMode ? (
                        <Box border={1} borderColor="divider" borderRadius={1} p={2} bgcolor="action.hover">
                          <Typography variant="subtitle2" gutterBottom align="right">פרטי מגרש חדש</Typography>
                          <Stack spacing={2}>
                            <TextField
                              label="שם המגרש"
                              size="small"
                              fullWidth
                              value={newField.name}
                              onChange={e => setNewField(p => ({ ...p, name: e.target.value }))}
                              dir="rtl"
                            />
                            <TextField
                              label="מיקום / כתובת"
                              size="small"
                              fullWidth
                              value={newField.location}
                              onChange={e => setNewField(p => ({ ...p, location: e.target.value }))}
                              helperText={customPoint ? `נבחר: ${customPoint.lat.toFixed(4)}, ${customPoint.lng.toFixed(4)}` : "הזן כתובת או בחר במפה"}
                              dir="rtl"
                            />
                            <Stack direction="row" spacing={2} justifyContent="flex-end">
                              <FormControlLabel control={<Checkbox checked={newField.type === 'open'} onChange={() => setNewField(p => ({ ...p, type: 'open' }))} />} label="פתוח" />
                              <FormControlLabel control={<Checkbox checked={newField.type === 'closed'} onChange={() => setNewField(p => ({ ...p, type: 'closed' }))} />} label="סגור (אולם)" />
                            </Stack>
                            <Stack direction="row" spacing={1} justifyContent="flex-start">
                              <Button size="small" onClick={() => { setNewFieldMode(false); setCustomPoint(null); }}>ביטול</Button>
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
                              filtered.push({ inputValue, name: `הוסף "${inputValue}"`, id: "NEW" });
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
                              <li key={option.id} {...otherProps} style={{ direction: "rtl" }}>
                                {option.name} {option.location ? `— ${option.location}` : ""}
                              </li>
                            );
                          }}
                          renderInput={(params) => <TextField {...params} label=" חפש מגרש" placeholder="הקלד לחיפוש או הוסף חדש..." dir="rtl" />}
                        />
                      )}
                    </Grid>
                    <Grid size={{ xs: 12, sm: 3 }}>
                      <Button
                        variant="outlined"
                        startIcon={<MapIcon />}
                        fullWidth
                        onClick={() => setShowMap(true)}
                        sx={{ height: 56 }}
                      >
                        מפה
                      </Button>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* --- 2. GAME DETAILS --- */}
              <Grid container spacing={2} direction="row-reverse">
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="כותרת המשחק (אופציונלי)"
                    placeholder="למשל: כדורגל שישי"
                    size="small"
                    fullWidth
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                    dir="rtl"
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="תאריך"
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
                    label="שעה"
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
                    label="משך (שעות)"
                    type="number"
                    fullWidth
                    size="small"
                    value={form.duration}
                    onChange={(e) => update("duration", Number(e.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="מקסימום שחקנים"
                    type="number"
                    fullWidth
                    size="small"
                    value={form.maxPlayers}
                    onChange={(e) => update("maxPlayers", Number(e.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label='גודל קבוצה (למשל 5 ל "5X5")'
                    type="number"
                    fullWidth
                    size="small"
                    value={form.teamSize || ""}
                    onChange={(e) => update("teamSize", e.target.value ? Number(e.target.value) : null)}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="מחיר (₪)"
                    type="number"
                    fullWidth
                    size="small"
                    value={form.price || ""}
                    onChange={(e) => update("price", e.target.value ? Number(e.target.value) : null)}
                  />
                </Grid>
              </Grid>

              {/* --- 3. ADVANCED OPTIONS --- */}
              <Box>
                <Button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  color="inherit"
                  sx={{ width: '100%', justifyContent: 'flex-end' }}
                >
                  {showAdvanced ? "הסתר אפשרויות מתקדמות" : "אפשרויות מתקדמות (תיאור, הגרלה, פרטי)"}
                </Button>

                <Collapse in={showAdvanced}>
                  <Stack spacing={3} mt={2}>
                    <TextField
                      label="תיאור / הוראות"
                      multiline
                      rows={3}
                      fullWidth
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                      dir="rtl"
                    />

                    <Stack direction="row-reverse" spacing={3} alignItems="center" justifyContent="flex-start">
                      <FormControlLabel
                        control={<Switch checked={form.isFriendsOnly} onChange={(e) => update("isFriendsOnly", e.target.checked)} />}
                        label="לחברים בלבד (פרטי)"
                        sx={{ flexDirection: 'row-reverse', ml: 2 }}
                      />

                      {/* Public Later Settings */}
                      <Collapse in={form.isFriendsOnly} style={{ width: '100%' }}>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', borderColor: 'grey.300', mb: 2 }}>
                          <FormControlLabel
                            control={<Switch checked={form.makePublicLater} onChange={(e) => update("makePublicLater", e.target.checked)} />}
                            label="פתח לציבור במועד מאוחר יותר"
                            sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0, mb: form.makePublicLater ? 2 : 0 }}
                          />

                          <Collapse in={form.makePublicLater}>
                            <Typography variant="subtitle2" fontWeight="bold" color="text.secondary" mb={2} align="right">
                              מועד הפיכת המשחק לציבורי
                            </Typography>
                            <Grid container spacing={2} direction="row-reverse">
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                  label="תאריך פתיחה לציבור"
                                  type="date"
                                  fullWidth
                                  size="small"
                                  InputLabelProps={{ shrink: true }}
                                  value={form.publicDate}
                                  onChange={(e) => update("publicDate", e.target.value)}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                  label="שעת פתיחה לציבור"
                                  type="time"
                                  fullWidth
                                  size="small"
                                  InputLabelProps={{ shrink: true }}
                                  value={form.publicTime}
                                  onChange={(e) => update("publicTime", e.target.value)}
                                />
                              </Grid>
                            </Grid>
                          </Collapse>
                        </Paper>
                      </Collapse>

                      <FormControlLabel
                        control={<Switch checked={form.lotteryEnabled} onChange={(e) => update("lotteryEnabled", e.target.checked)} />}
                        label="אפשר הגרלה"
                        sx={{ flexDirection: 'row-reverse' }}
                      />
                    </Stack>

                    {/* Lottery Settings */}
                    <Collapse in={form.lotteryEnabled}>
                      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'warning.light', borderColor: 'warning.main' }}>
                        <Typography variant="subtitle2" fontWeight="bold" color="warning.contrastText" mb={2} align="right">
                          הגדרות הגרלה
                        </Typography>
                        <Grid container spacing={2} direction="row-reverse">
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              label="תאריך הגרלה"
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
                              label="שעת הגרלה"
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
                              label="כלול מארגן בהגרלה (ללא אישור אוטומטי)"
                              sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                            />
                          </Grid>
                        </Grid>
                      </Paper>

                    </Collapse>

                    <FormControlLabel
                      control={<Switch checked={form.futureRegistration} onChange={(e) => update("futureRegistration", e.target.checked)} />}
                      label="פתיחת רישום עתידית"
                      sx={{ flexDirection: 'row-reverse' }}
                    />

                    {/* Future Registration Settings */}
                    <Collapse in={form.futureRegistration}>
                      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'info.light', borderColor: 'info.main' }}>
                        <Typography variant="subtitle2" fontWeight="bold" color="info.contrastText" mb={2} align="right">
                          מועד פתיחת הרשמה
                        </Typography>
                        <Grid container spacing={2} direction="row-reverse">
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              label="תאריך פתיחה"
                              type="date"
                              fullWidth
                              size="small"
                              InputLabelProps={{ shrink: true }}
                              value={form.futureRegDate}
                              // slotProps={{ htmlInput: { min: todayStr } }} // Optional: restrict to future dates
                              onChange={(e) => update("futureRegDate", e.target.value)}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              label="שעת פתיחה"
                              type="time"
                              fullWidth
                              size="small"
                              InputLabelProps={{ shrink: true }}
                              value={form.futureRegTime}
                              onChange={(e) => update("futureRegTime", e.target.value)}
                            />
                          </Grid>
                        </Grid>
                      </Paper>
                    </Collapse>
                  </Stack>
                </Collapse>
              </Box>

              {/* --- SUBMIT --- */}
              <Box display="flex" justifyContent="flex-start">
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={!canSubmit || submitting}
                  startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                >
                  {submitting ? "יוצר..." : "צור משחק"}
                </Button>
              </Box>

            </Stack>
          </Paper>
        </form >

        {/* --- MAP DIALOG --- */}
        < Dialog open={showMap} onClose={() => setShowMap(false)
        } fullWidth maxWidth="lg" >
          <DialogTitle align="right">בחר מיקום מגרש</DialogTitle>
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
                  setNewField(p => ({ ...p, location: "" })); // Clear text location if picked from map
                }
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowMap(false)}>סיום</Button>
          </DialogActions>
        </Dialog >

      </SignedIn >
    </Container >
  );
}

export default function NewGamePage() {
  return (
    <Suspense fallback={<Container sx={{ py: 4 }}><CircularProgress /></Container>}>
      <NewGamePageInner />
    </Suspense>
  );
}