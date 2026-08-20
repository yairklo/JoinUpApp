"use client";
import { useEffect, useState } from "react";
import { useUser, SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";

// MUI Imports
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid"; // בגרסה החדשה זה ה-Grid הנכון
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

// Icons
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import DeleteIcon from "@mui/icons-material/Delete";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";

// MUI Form


// Custom Components
import { SPORT_MAPPING, POSITION_OPTIONS } from "@/utils/sports";

import Avatar from "@/components/Avatar";
import ImageUploadField from "@/components/ImageUploadField";
import AddFriendButton from "@/components/AddFriendButton";
import { Game } from "@/types/game";
import { gamesApi } from "@/services/api/games";
import { usersApi } from "@/services/api/users";

type PublicUser = {
  id: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  imageUrl?: string | null;
  city?: string | null;
  birthYear?: number | null;
  age?: number | null;
  birthDate?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  sports?: { id: string; name: string; position?: string | null }[];
  positions?: { id: string; name: string; sportId: string }[];
};

const GENDER_LABELS: Record<"MALE" | "FEMALE", string> = {
  MALE: "גבר",
  FEMALE: "אישה",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

function calculateAge(birthDate?: string | null) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  const ageDt = new Date(diff);
  return Math.abs(ageDt.getUTCFullYear() - 1970);
}


import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const userId = user?.id;

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string | null; imageUrl?: string | null; city?: string | null; email?: string | null }>>([]);
  const [friends, setFriends] = useState<Array<{ id: string; name: string | null; imageUrl?: string | null; mutualCount?: number }>>([]);
  const [incoming, setIncoming] = useState<Array<{ id: string; requester: PublicUser; createdAt: string }>>([]);
  const [availableSports, setAvailableSports] = useState<Array<{ id: string; name: string }>>([]);

  const [myGames, setMyGames] = useState<Game[]>([]);
  const [gamesTab, setGamesTab] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    imageUrl: "",
    city: "",
    birthDate: "",
    gender: "" as "" | "MALE" | "FEMALE",
    sportsData: [] as { sportId: string; position: string; }[]
  });
  const [newSportId, setNewSportId] = useState("");
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});

  const togglePosition = (sportId: string, pos: string) => {
    setForm(prev => ({
      ...prev,
      sportsData: prev.sportsData.map(s => {
        if (s.sportId !== sportId) return s;
        const current = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
        const exists = current.includes(pos);
        const updated = exists ? current.filter(p => p !== pos) : [...current, pos];
        return { ...s, position: updated.join(', ') };
      })
    }));
  };

  const addCustomPosition = (sportId: string) => {
    const custom = customTexts[sportId] || "";
    if (!custom.trim()) return;
    setForm(prev => ({
      ...prev,
      sportsData: prev.sportsData.map(s => {
        if (s.sportId !== sportId) return s;
        const current = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
        if (current.includes(custom.trim())) return s;
        return { ...s, position: [...current, custom.trim()].join(', ') };
      })
    }));
    setCustomTexts(prev => ({ ...prev, [sportId]: "" }));
  };

  const removePositionTag = (sportId: string, pos: string) => {
    setForm(prev => ({
      ...prev,
      sportsData: prev.sportsData.map(s => {
        if (s.sportId !== sportId) return s;
        const updated = s.position.split(',').map(p => p.trim()).filter(p => p && p !== pos);
        return { ...s, position: updated.join(', ') };
      })
    }));
  };

  // Fetch logic remains the same...
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/users/${userId}`).then(r => r.json()).then(setProfile).catch(() => { });
    fetch(`${API_BASE}/api/users`).then(r => r.json()).then(setAllUsers).catch(() => { });
    fetch(`${API_BASE}/api/users/${userId}/friends`).then(r => r.json()).then(setFriends).catch(() => { });
    fetch(`${API_BASE}/api/users/${userId}/friends`).then(r => r.json()).then(setFriends).catch(() => { });
    (async () => {
      try {
        const token = await getToken({ template: undefined }).catch(() => "");
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const inc = await fetch(`${API_BASE}/api/users/${userId}/requests/incoming`, { headers });
        if (inc.ok) setIncoming(await inc.json());

        if (token) {
            const games = await gamesApi.getMyGames(token);
            setMyGames(games);
        }
      } catch { }
    })();
  }, [userId]);


  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      imageUrl: profile.imageUrl || "",
      city: profile.city || "",
      birthDate: profile.birthDate ? profile.birthDate.split('T')[0] : "",
      gender: profile.gender === "MALE" || profile.gender === "FEMALE" ? profile.gender : "",
      sportsData: (profile.sports || []).map(s => ({ sportId: s.id, position: s.position || "" })),
    });
  }, [profile]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      // imageUrl is intentionally excluded: it's owned by the dedicated upload/remove
      // endpoints (usersApi.uploadImage/removeImage) and already persisted by the time Save runs.
      const { imageUrl: _imageUrl, ...formWithoutImage } = form;
      const res = await fetch(`${API_BASE}/api/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...formWithoutImage,
          birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : null,
          gender: form.gender || null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      setProfile(updated);
      setEditing(false);
    } catch (e) {
      // noop
    } finally {
      setSaving(false);
    }
  };

  async function acceptRequest(reqId: string) {
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/users/requests/${reqId}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok && userId) {
        fetch(`${API_BASE}/api/users/${userId}/friends`).then(r => r.json()).then(setFriends).catch(() => { });
        const inc = await fetch(`${API_BASE}/api/users/${userId}/requests/incoming`, { headers: { Authorization: `Bearer ${token}` } });
        if (inc.ok) setIncoming(await inc.json());
      }
    } catch { }
  }

  async function declineRequest(reqId: string) {
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/users/requests/${reqId}/decline`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok && userId) {
        const inc = await fetch(`${API_BASE}/api/users/${userId}/requests/incoming`, { headers: { Authorization: `Bearer ${token}` } });
        if (inc.ok) setIncoming(await inc.json());
      }
    } catch { }
  }

  async function removeFriend(friendId: string) {
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token || !userId) return;
      const res = await fetch(`${API_BASE}/api/users/${userId}/friends/${friendId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setFriends(prev => prev.filter(f => f.id !== friendId));
      }
    } catch { }
  }

  const uploadProfileImage = async (file: File) => {
    const token = await getToken({ template: undefined }).catch(() => "");
    if (!token || !userId) throw new Error("יש להתחבר מחדש");
    return usersApi.uploadImage(userId, file, token);
  };

  const removeProfileImage = async () => {
    const token = await getToken({ template: undefined }).catch(() => "");
    if (!token || !userId) throw new Error("יש להתחבר מחדש");
    return usersApi.removeImage(userId, token);
  };

  const handleImageUploaded = (url: string) => {
    setForm((prev) => ({ ...prev, imageUrl: url }));
    setProfile((prev) => (prev ? { ...prev, imageUrl: url } : prev));
  };

  const handleImageRemoved = () => {
    setForm((prev) => ({ ...prev, imageUrl: "" }));
    setProfile((prev) => (prev ? { ...prev, imageUrl: null } : prev));
  };

  const friendIdSet = new Set(friends.map((f) => f.id));

  const now = new Date();
  const upcomingGames = myGames.filter(g => new Date(`${g.date}T${g.time}`) >= now);
  const pastGames = myGames.filter(g => new Date(`${g.date}T${g.time}`) < now);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <SignedOut>
        <Alert severity="warning" action={<SignInButton mode="modal"><Button color="inherit" size="small">התחבר</Button></SignInButton>}>
          עליך להתחבר כדי לצפות ולערוך את הפרופיל שלך.
        </Alert>
      </SignedOut>

      <SignedIn>
        {!profile ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
            <CircularProgress />
          </Box>
        ) : (
          // ראשית: Grid Container
          <Grid container spacing={3}>

            {/* צד שמאל: פרטי פרופיל */}
            {/* שימוש ב-size במקום xs/md */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Card elevation={2}>
                <CardContent>

                  {/* Header Area */}
                  <Box display="flex" alignItems="center" gap={3} mb={3}>
                    <Avatar
                      src={editing ? form.imageUrl : profile.imageUrl}
                      alt={profile.name || ""}
                      name={profile.name || ""}
                      size="lg"
                    />
                    <Box flexGrow={1}>
                      <Typography variant="h4" component="h1" fontWeight="bold">
                        {profile.name || "משתמש ללא שם"}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        {profile.city || "עיר לא ידועה"}
                      </Typography>
                    </Box>
                    {!editing && (
                      <Stack direction="row" spacing={1}>
                        <Button
                          startIcon={<EditIcon />}
                          variant="outlined"
                          onClick={() => setEditing(true)}
                        >
                          ערוך פרופיל
                        </Button>
                        <IconButton
                          aria-label="privacy settings"
                          onClick={() => router.push("/profile/settings")}
                        >
                          <SettingsIcon />
                        </IconButton>
                      </Stack>
                    )}
                  </Box>

                  <Divider sx={{ mb: 3 }} />

                  {/* Details Area */}
                  {!editing ? (
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">אימייל</Typography>
                        <Typography variant="body1">{profile.email || '-'}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">טלפון</Typography>
                        <Typography variant="body1">{profile.phone || '-'}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">גיל</Typography>
                        <Typography variant="body1">{calculateAge(profile.birthDate) || '-'}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">מין</Typography>
                        <Typography variant="body1">
                          {profile.gender ? GENDER_LABELS[profile.gender] : '-'}
                        </Typography>
                      </Grid>
                      <Grid size={12}>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>ספורט ועמדות</Typography>
                        {(profile.sports && profile.sports.length > 0) ? (
                          <Stack spacing={2}>
                            {profile.sports.map(s => {
                              const hebrewName = SPORT_MAPPING[s.name] || SPORT_MAPPING[s.id] || s.name;
                              const positions = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                              return (
                                <Box key={s.id} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                  <Chip label={hebrewName} color="primary" />
                                  {positions.map((pos, i) => (
                                    <Chip key={i} label={pos} size="small" variant="outlined" color="primary" />
                                  ))}
                                </Box>
                              );
                            })}
                          </Stack>
                        ) : <Typography variant="body2">-</Typography>}
                      </Grid>

                    </Grid>
                  ) : (
                    // טופס עריכה
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="שם" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size="small" />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="עיר" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} size="small" />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="אימייל" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} size="small" />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="טלפון" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} size="small" />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel id="profile-gender-label">מין</InputLabel>
                          <Select
                            labelId="profile-gender-label"
                            label="מין"
                            value={form.gender}
                            onChange={(e) => setForm({ ...form, gender: e.target.value as "" | "MALE" | "FEMALE" })}
                          >
                            <MenuItem value="">
                              <em>לא צוין</em>
                            </MenuItem>
                            <MenuItem value="MALE">גבר</MenuItem>
                            <MenuItem value="FEMALE">אישה</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      {/* Sports Editing */}
                      <Grid size={12}>
                        <Typography variant="subtitle2" gutterBottom>ספורט ועמדות</Typography>
                        <Stack spacing={2}>
                          {form.sportsData.map((s, idx) => {
                            // Using simplified logic assuming s.sportId is the key (or even if it is ID, we show it if not in mapping)
                            const hebrewName = SPORT_MAPPING[s.sportId] || s.sportId;

                            const sportPositions = POSITION_OPTIONS[s.sportId] || [];
                            const activePositions = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];

                            return (
                              <Box key={s.sportId} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                  <Typography variant="subtitle1" fontWeight="bold">{hebrewName}</Typography>
                                  <IconButton size="small" color="error" onClick={() => {
                                    const newData = form.sportsData.filter(x => x.sportId !== s.sportId);
                                    setForm({ ...form, sportsData: newData });
                                  }}>
                                    <DeleteIcon />
                                  </IconButton>
                                </Box>
                                
                                {sportPositions.length > 0 && (
                                  <Box mb={2}>
                                    <Typography variant="caption" color="text.secondary" gutterBottom display="block">בחר עמדות:</Typography>
                                    <Stack direction="row" flexWrap="wrap" gap={1}>
                                      {sportPositions.map(pos => {
                                        const isSelected = activePositions.includes(pos);
                                        return (
                                          <Chip
                                            key={pos}
                                            label={pos}
                                            color={isSelected ? "primary" : "default"}
                                            variant={isSelected ? "filled" : "outlined"}
                                            onClick={() => togglePosition(s.sportId, pos)}
                                          />
                                        );
                                      })}
                                    </Stack>
                                  </Box>
                                )}

                                <Box>
                                  <Typography variant="caption" color="text.secondary" gutterBottom display="block">הוסף עמדה חופשית:</Typography>
                                  <Box display="flex" gap={1} alignItems="center">
                                    <TextField
                                      size="small"
                                      placeholder="למשל: קשר פוגעני"
                                      value={customTexts[s.sportId] || ""}
                                      onChange={(e) => setCustomTexts(prev => ({ ...prev, [s.sportId]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          addCustomPosition(s.sportId);
                                        }
                                      }}
                                      sx={{ flexGrow: 1 }}
                                    />
                                    <Button 
                                      variant="contained" 
                                      size="small" 
                                      onClick={() => addCustomPosition(s.sportId)}
                                      disabled={!(customTexts[s.sportId] || "").trim()}
                                    >
                                      הוסף
                                    </Button>
                                  </Box>
                                </Box>

                                {activePositions.filter(p => !sportPositions.includes(p)).length > 0 && (
                                  <Box mt={2}>
                                    <Typography variant="caption" color="text.secondary" gutterBottom display="block">עמדות מותאמות אישית:</Typography>
                                    <Stack direction="row" flexWrap="wrap" gap={1}>
                                      {activePositions.filter(p => !sportPositions.includes(p)).map(pos => (
                                        <Chip
                                          key={pos}
                                          label={pos}
                                          color="primary"
                                          onDelete={() => removePositionTag(s.sportId, pos)}
                                        />
                                      ))}
                                    </Stack>
                                  </Box>
                                )}
                              </Box>
                            );
                          })}

                          <Box display="flex" gap={1}>
                            <FormControl size="small" sx={{ minWidth: 150, flexGrow: 1 }}>
                              <InputLabel>הוסף ספורט</InputLabel>
                              <Select
                                value={newSportId}
                                label="הוסף ספורט"
                                onChange={(e) => setNewSportId(e.target.value)}
                              >
                                {Object.keys(SPORT_MAPPING)
                                  .filter(key => !form.sportsData.some(fs => fs.sportId === key))
                                  .map(key => (
                                    <MenuItem key={key} value={key}>
                                      {SPORT_MAPPING[key]}
                                    </MenuItem>
                                  ))}
                              </Select>
                            </FormControl>
                            <Button
                              variant="outlined"
                              onClick={() => {
                                if (newSportId) {
                                  setForm({
                                    ...form,
                                    sportsData: [...form.sportsData, { sportId: newSportId, position: "" }]
                                  });
                                  setNewSportId("");
                                }
                              }}
                              disabled={!newSportId}
                            >
                              הוסף
                            </Button>
                          </Box>
                        </Stack>
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          fullWidth
                          label="תאריך לידה"
                          type="date"
                          value={form.birthDate}
                          onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                          size="small"
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid size={12}>
                        <ImageUploadField
                          imageUrl={form.imageUrl}
                          name={profile.name || ""}
                          label="העלה תמונת פרופיל"
                          onUpload={uploadProfileImage}
                          onUploaded={handleImageUploaded}
                          onRemove={removeProfileImage}
                          onRemoved={handleImageRemoved}
                        />
                      </Grid>
                      <Grid size={12} sx={{ mt: 2, display: 'flex', gap: 2 }}>
                        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
                          {saving ? 'שומר...' : 'שמור שינויים'}
                        </Button>
                        <Button variant="outlined" color="inherit" startIcon={<CancelIcon />} onClick={() => setEditing(false)}>
                          ביטול
                        </Button>
                      </Grid>
                    </Grid>
                  )}
                </CardContent>
              </Card>

              {/* משחקים - Games Tabs */}
              <Card elevation={2}>
                <CardContent>
                  <Tabs value={gamesTab} onChange={(e, val) => setGamesTab(val)} sx={{ mb: 2 }}>
                    <Tab label="משחקים קרובים" />
                    <Tab label="היסטוריית משחקים" />
                  </Tabs>
                  <Stack spacing={2}>
                    {gamesTab === 0 ? (
                      upcomingGames.length > 0 ? (
                        upcomingGames.map(g => (
                          <Card key={g.id} variant="outlined" sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => router.push(`/games/${g.id}`)}>
                            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                              <Typography variant="subtitle1" fontWeight="bold">{g.title || g.fieldName}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {new Date(g.date).toLocaleDateString('he-IL')} • {g.time}
                              </Typography>
                              {g.fieldLocation && (
                                <Typography variant="caption" color="text.secondary">{g.fieldLocation}</Typography>
                              )}
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <Typography variant="body2" color="text.secondary">אין משחקים קרובים.</Typography>
                      )
                    ) : (
                      pastGames.length > 0 ? (
                        pastGames.map(g => (
                          <Card key={g.id} variant="outlined" sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => router.push(`/games/${g.id}`)}>
                            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                              <Typography variant="subtitle1" fontWeight="bold">{g.title || g.fieldName}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {new Date(g.date).toLocaleDateString('he-IL')} • {g.time}
                              </Typography>
                              {g.fieldLocation && (
                                <Typography variant="caption" color="text.secondary">{g.fieldLocation}</Typography>
                              )}
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <Typography variant="body2" color="text.secondary">אין היסטוריית משחקים.</Typography>
                      )
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* צד ימין: סרגל צד */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={3}>

                {/* 0. Search Players Bar */}
                <Card elevation={2} sx={{ overflow: 'visible' }}>
                  <CardContent sx={{ position: 'relative' }}>
                    <Typography variant="h6" mb={2}>חיפוש שחקנים</Typography>
                    <TextField
                      placeholder="חפש שחקנים לפי שם או אימייל..."
                      size="small"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                      InputProps={{
                        startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          router.push(`/profile/search-players?q=${encodeURIComponent(searchQuery)}`);
                        }
                      }}
                    />
                    {searchFocused && searchQuery.trim() !== '' && (
                      <Card elevation={4} sx={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, mt: 1, maxHeight: 300, overflowY: 'auto' }}>
                        <List dense>
                          {allUsers
                            .filter(u => u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())))
                            .slice(0, 5)
                            .map(u => (
                              <ListItem key={u.id} component="div" sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => router.push(`/users/${u.id}`)}>
                                <ListItemAvatar>
                                  <Avatar src={u.imageUrl} name={u.name || ""} alt="" size="sm" />
                                </ListItemAvatar>
                                <ListItemText primary={u.name || "לא ידוע"} secondary={u.city} />
                              </ListItem>
                            ))}
                          <Divider />
                          <ListItem component="div" sx={{ cursor: 'pointer', justifyContent: 'center', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => router.push(`/profile/search-players?q=${encodeURIComponent(searchQuery)}`)}>
                            <Typography color="primary" variant="button">ראה את כל התוצאות</Typography>
                          </ListItem>
                        </List>
                      </Card>
                    )}
                  </CardContent>
                </Card>

                {/* 1. Friends List */}
                <Card elevation={2}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="h6">חברים</Typography>
                      <Link href="/profile/friends" passHref>
                        <Button size="small">הצג הכל</Button>
                      </Link>
                    </Box>
                    <List dense>
                      {friends.length === 0 && <Typography variant="body2" color="text.secondary">עדיין אין חברים.</Typography>}
                      {friends.slice(0, 5).map((f) => (
                        <ListItem key={f.id} secondaryAction={
                          <IconButton edge="end" aria-label="remove" size="small" onClick={() => removeFriend(f.id)}>
                            <PersonRemoveIcon fontSize="small" color="action" />
                          </IconButton>
                        }>
                          <ListItemAvatar>
                            <Avatar src={f.imageUrl} name={f.name || ""} alt={f.name || ""} size="sm" />
                          </ListItemAvatar>
                          <ListItemText
                            primary={<Link href={`/users/${f.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{f.name || "לא ידוע"}</Link>}
                            secondary={f.mutualCount ? `${f.mutualCount} משותפים` : null}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>
                </Card>

                {/* 2. Friend Requests */}
                {incoming.length > 0 && (
                  <Card elevation={2} sx={{ bgcolor: 'action.hover' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>בקשות חברות</Typography>
                      <List dense>
                        {incoming.map((r) => (
                          <ListItem key={r.id}>
                            <ListItemAvatar>
                              <Avatar src={r.requester.imageUrl} name={r.requester.name || ""} alt="" size="sm" />
                            </ListItemAvatar>
                            <ListItemText primary={r.requester.name} />
                            <Box>
                              <IconButton size="small" color="success" onClick={() => acceptRequest(r.id)}><CheckCircleIcon /></IconButton>
                              <IconButton size="small" color="error" onClick={() => declineRequest(r.id)}><CancelOutlinedIcon /></IconButton>
                            </Box>
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                )}

                {/* 3. People You May Know */}
                <Card elevation={2}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>אנשים</Typography>
                    <List dense>
                      {allUsers.filter(u => u.id !== profile.id).slice(0, 6).map((u) => {
                        const isFriend = friendIdSet.has(u.id);
                        return (
                          <ListItem key={u.id}>
                            <ListItemAvatar>
                              <Avatar src={u.imageUrl} name={u.name || ""} alt="" size="sm" />
                            </ListItemAvatar>
                            <ListItemText
                              primary={<Link href={`/users/${u.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{u.name || "לא ידוע"}</Link>}
                            />
                            {isFriend ? (
                              <Chip label="חברים" size="small" color="success" variant="outlined" />
                            ) : (
                              <AddFriendButton receiverId={u.id} />
                            )}
                          </ListItem>
                        );
                      })}
                      {allUsers.length <= 1 && <Typography variant="body2" color="text.secondary">לא נמצאו משתמשים נוספים.</Typography>}
                    </List>
                  </CardContent>
                </Card>

              </Stack>
            </Grid>
          </Grid>
        )}
      </SignedIn>
    </Container>
  );
}