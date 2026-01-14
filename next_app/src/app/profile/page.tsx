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

// Icons
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import DeleteIcon from "@mui/icons-material/Delete";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";

// MUI Form


// Custom Components
import { SPORT_MAPPING } from "@/utils/sports";

import Avatar from "@/components/Avatar";
import AddFriendButton from "@/components/AddFriendButton";

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
  sports?: { id: string; name: string; position?: string | null }[];
  positions?: { id: string; name: string; sportId: string }[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

function calculateAge(birthDate?: string | null) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  const ageDt = new Date(diff);
  return Math.abs(ageDt.getUTCFullYear() - 1970);
}


export default function ProfilePage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id;

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string | null; imageUrl?: string | null; city?: string | null }>>([]);
  const [friends, setFriends] = useState<Array<{ id: string; name: string | null; imageUrl?: string | null; mutualCount?: number }>>([]);
  const [incoming, setIncoming] = useState<Array<{ id: string; requester: PublicUser; createdAt: string }>>([]);
  const [availableSports, setAvailableSports] = useState<Array<{ id: string; name: string }>>([]);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    imageUrl: "",
    city: "",
    birthDate: "",
    sportsData: [] as { sportId: string; position: string; }[]
  });
  const [newSportId, setNewSportId] = useState("");

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
      sportsData: (profile.sports || []).map(s => ({ sportId: s.id, position: s.position || "" })),
    });
  }, [profile]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      const res = await fetch(`${API_BASE}/api/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...form, birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : null }),
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

  const friendIdSet = new Set(friends.map((f) => f.id));

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <SignedOut>
        <Alert severity="warning" action={<SignInButton mode="modal"><Button color="inherit" size="small">Sign in</Button></SignInButton>}>
          You must sign in to view and edit your profile.
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
                        {profile.name || "Unnamed User"}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        {profile.city || "Unknown City"}
                      </Typography>
                    </Box>
                    {!editing && (
                      <Button
                        startIcon={<EditIcon />}
                        variant="outlined"
                        onClick={() => setEditing(true)}
                      >
                        Edit Profile
                      </Button>
                    )}
                  </Box>

                  <Divider sx={{ mb: 3 }} />

                  {/* Details Area */}
                  {!editing ? (
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">Email</Typography>
                        <Typography variant="body1">{profile.email || '-'}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">Phone</Typography>
                        <Typography variant="body1">{profile.phone || '-'}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Typography variant="caption" color="text.secondary">Age</Typography>
                        <Typography variant="body1">{calculateAge(profile.birthDate) || '-'}</Typography>
                      </Grid>
                      <Grid size={12}>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>Sports</Typography>
                        {(profile.sports && profile.sports.length > 0) ? (
                          <Stack direction="row" spacing={1}>
                            {profile.sports.map(s => <Chip key={s.id} label={s.position ? `${s.name} (${s.position})` : s.name} size="small" />)}
                          </Stack>
                        ) : <Typography variant="body2">-</Typography>}
                      </Grid>
                      <Grid size={12}>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>Positions</Typography>
                        {(profile.positions && profile.positions.length > 0) ? (
                          <Stack direction="row" spacing={1}>
                            {profile.positions.map(p => <Chip key={p.id} label={p.name} size="small" variant="outlined" />)}
                          </Stack>
                        ) : <Typography variant="body2">-</Typography>}
                      </Grid>
                    </Grid>
                  ) : (
                    // טופס עריכה
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size="small" />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} size="small" />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} size="small" />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} size="small" />
                      </Grid>
                      {/* Sports Editing */}
                      <Grid size={12}>
                        <Typography variant="subtitle2" gutterBottom>Sports & Positions</Typography>
                        <Stack spacing={2}>
                          {form.sportsData.map((s, idx) => {
                            // Using simplified logic assuming s.sportId is the key (or even if it is ID, we show it if not in mapping)
                            const hebrewName = SPORT_MAPPING[s.sportId] || s.sportId;

                            return (
                              <Box key={s.sportId} display="flex" gap={1} alignItems="center">
                                <Chip label={hebrewName} />
                                <TextField
                                  label="Position"
                                  size="small"
                                  value={s.position}
                                  onChange={(e) => {
                                    const newData = [...form.sportsData];
                                    newData[idx].position = e.target.value;
                                    setForm({ ...form, sportsData: newData });
                                  }}
                                  sx={{ flexGrow: 1 }}
                                />
                                <IconButton size="small" color="error" onClick={() => {
                                  const newData = form.sportsData.filter(x => x.sportId !== s.sportId);
                                  setForm({ ...form, sportsData: newData });
                                }}>
                                  <DeleteIcon />
                                </IconButton>
                              </Box>
                            );
                          })}

                          <Box display="flex" gap={1}>
                            <FormControl size="small" sx={{ minWidth: 150, flexGrow: 1 }}>
                              <InputLabel>Add Sport</InputLabel>
                              <Select
                                value={newSportId}
                                label="Add Sport"
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
                              Add
                            </Button>
                          </Box>
                        </Stack>
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          fullWidth
                          label="Birth Date"
                          type="date"
                          value={form.birthDate}
                          onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                          size="small"
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid size={12}>
                        <TextField fullWidth label="Avatar URL" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} size="small" helperText="Paste a link to an image" />
                      </Grid>
                      <Grid size={12} sx={{ mt: 2, display: 'flex', gap: 2 }}>
                        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
                          {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button variant="outlined" color="inherit" startIcon={<CancelIcon />} onClick={() => setEditing(false)}>
                          Cancel
                        </Button>
                      </Grid>
                    </Grid>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* צד ימין: סרגל צד */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={3}>

                {/* 1. Friends List */}
                <Card elevation={2}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="h6">Friends</Typography>
                      <Link href="/profile/friends" passHref>
                        <Button size="small">Show all</Button>
                      </Link>
                    </Box>
                    <List dense>
                      {friends.length === 0 && <Typography variant="body2" color="text.secondary">No friends yet.</Typography>}
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
                            primary={<Link href={`/users/${f.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{f.name || "Unknown"}</Link>}
                            secondary={f.mutualCount ? `${f.mutualCount} mutual` : null}
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
                      <Typography variant="h6" gutterBottom>Friend Requests</Typography>
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
                    <Typography variant="h6" gutterBottom>People</Typography>
                    <List dense>
                      {allUsers.filter(u => u.id !== profile.id).slice(0, 6).map((u) => {
                        const isFriend = friendIdSet.has(u.id);
                        return (
                          <ListItem key={u.id}>
                            <ListItemAvatar>
                              <Avatar src={u.imageUrl} name={u.name || ""} alt="" size="sm" />
                            </ListItemAvatar>
                            <ListItemText
                              primary={<Link href={`/users/${u.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{u.name || "Unknown"}</Link>}
                            />
                            {isFriend ? (
                              <Chip label="Friends" size="small" color="success" variant="outlined" />
                            ) : (
                              <AddFriendButton receiverId={u.id} />
                            )}
                          </ListItem>
                        );
                      })}
                      {allUsers.length <= 1 && <Typography variant="body2" color="text.secondary">No other users found.</Typography>}
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