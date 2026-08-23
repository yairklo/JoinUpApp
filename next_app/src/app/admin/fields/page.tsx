"use client";

import { useCallback, useEffect, useState } from "react";
import { SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { fieldsApi, Field } from "@/services/api/fields";
import { usersApi } from "@/services/api/users";

import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Divider from "@mui/material/Divider";

export default function AdminFieldsPage() {
  const { getToken } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState<"open" | "closed">("open");
  const [price, setPrice] = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    const me = await usersApi.getMe(token);
    if (!me.isAdmin) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    setAllowed(true);
    const list = await fieldsApi.listForAdmin(token);
    setFields(Array.isArray(list) ? list : []);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    load().catch((e) => {
      console.error(e);
      setAllowed(false);
      setLoading(false);
    });
  }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      await fieldsApi.create(
        {
          name: name.trim(),
          location: location.trim(),
          city: city.trim() || undefined,
          type,
          price: type === "closed" ? Number(price) || 0 : 0,
        },
        token
      );
      setName("");
      setLocation("");
      setCity("");
      setPrice("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "יצירת המגרש נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (field: Field) => {
    try {
      const token = await getToken();
      if (!token) return;
      await fieldsApi.update(field.id, { available: !field.available }, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "עדכון המגרש נכשל");
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 6 }} dir="rtl">
      <SignedOut>
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography gutterBottom>עליך להתחבר כדי לנהל מגרשים.</Typography>
            <SignInButton mode="modal">
              <Button variant="contained">התחברות</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </SignedOut>

      <SignedIn>
        {loading || allowed === null ? (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress />
          </Box>
        ) : !allowed ? (
          <Alert severity="warning">אין הרשאת מפעיל. פנו למי שמגדיר ADMIN_USER_IDS או Clerk metadata.</Alert>
        ) : (
          <Stack spacing={3}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" fontWeight={800}>ניהול מגרשים</Typography>
              <Button component={Link} href="/fields">חזרה למגרשים</Button>
            </Stack>

            <Card>
              <CardContent>
                <Typography fontWeight={700} mb={2}>מגרש חדש</Typography>
                <Stack spacing={2}>
                  <TextField label="שם" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
                  <TextField label="כתובת" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth />
                  <TextField label="עיר" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
                  <TextField select label="סוג" value={type} onChange={(e) => setType(e.target.value as "open" | "closed")}>
                    <MenuItem value="open">פתוח</MenuItem>
                    <MenuItem value="closed">סגור / מקורה</MenuItem>
                  </TextField>
                  {type === "closed" && (
                    <TextField
                      label="מחיר לשעה (₪)"
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  )}
                  {error && <Alert severity="error">{error}</Alert>}
                  <Button
                    variant="contained"
                    disabled={saving || !name.trim() || !location.trim()}
                    onClick={handleCreate}
                  >
                    {saving ? "שומר…" : "הוסף מגרש"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography fontWeight={700} mb={2}>כל המגרשים ({fields.length})</Typography>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={1.5}>
                  {fields.map((field) => (
                    <Stack
                      key={field.id}
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      alignItems={{ sm: "center" }}
                      spacing={1}
                      sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}
                    >
                      <Box>
                        <Typography fontWeight={700}>{field.name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {field.city || field.location}
                        </Typography>
                      </Box>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={field.available !== false}
                            onChange={() => toggleAvailable(field)}
                          />
                        }
                        label={field.available === false ? "מוסתר" : "גלוי"}
                      />
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}
      </SignedIn>
    </Container>
  );
}
