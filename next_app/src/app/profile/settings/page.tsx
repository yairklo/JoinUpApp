"use client";

import { useEffect, useState } from "react";
import { useUser, useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { usersApi, PrivacyLevel, PrivacySettings } from "@/services/api/users";

import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import LockIcon from "@mui/icons-material/Lock";

type FieldKey = "privacyFriends" | "privacyGames" | "privacyMessages";

// null = "use age-based default"; otherwise an explicit choice
type FieldValue = PrivacyLevel | "DEFAULT";

const FIELDS: { key: FieldKey; label: string }[] = [
    { key: "privacyFriends", label: "מי יכול לראות את החברים שלי" },
    { key: "privacyGames", label: "מי יכול לראות את היסטוריית המשחקים שלי" },
    { key: "privacyMessages", label: "מי יכול לשלוח לי הודעות" },
];

export default function PrivacySettingsPage() {
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();

    const [values, setValues] = useState<Record<FieldKey, FieldValue>>({
        privacyFriends: "DEFAULT",
        privacyGames: "DEFAULT",
        privacyMessages: "DEFAULT",
    });
    const [resolved, setResolved] = useState<PrivacySettings["resolved"] | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.id) return;
        let active = true;
        (async () => {
            try {
                const token = await getToken();
                const data = await usersApi.getProfile(user.id, token || undefined);
                if (!active) return;
                const ps = data.privacySettings;
                if (ps) {
                    setValues({
                        privacyFriends: ps.privacyFriends ?? "DEFAULT",
                        privacyGames: ps.privacyGames ?? "DEFAULT",
                        privacyMessages: ps.privacyMessages ?? "DEFAULT",
                    });
                    setResolved(ps.resolved);
                }
            } catch (e) {
                console.error("Failed to load settings:", e);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [user?.id, getToken]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;
            const payload: Partial<Record<FieldKey, PrivacyLevel | null>> = {
                privacyFriends: values.privacyFriends === "DEFAULT" ? null : values.privacyFriends,
                privacyGames: values.privacyGames === "DEFAULT" ? null : values.privacyGames,
                privacyMessages: values.privacyMessages === "DEFAULT" ? null : values.privacyMessages,
            };
            const res = await usersApi.updatePrivacySettings(payload, token);
            setResolved(res.resolved);
            setSuccess(true);
        } catch (e) {
            console.error("Failed to save settings:", e);
            setError("שמירת ההגדרות נכשלה. אנא נסה שנית.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl">
            <SignedOut>
                <Card sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ textAlign: "center", py: 6 }}>
                        <Typography gutterBottom>עליך להתחבר כדי לגשת להגדרות הפרטיות.</Typography>
                        <SignInButton mode="modal">
                            <Button variant="contained">התחברות</Button>
                        </SignInButton>
                    </CardContent>
                </Card>
            </SignedOut>

            <SignedIn>
                <Card elevation={3} sx={{ borderRadius: 3 }}>
                    <CardContent>
                        <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                            <LockIcon color="primary" />
                            <Typography variant="h5" fontWeight="bold">הגדרות פרטיות</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" mb={3}>
                            שלוט מי יכול לראות את המידע שלך וליצור איתך קשר. בחירת &quot;ברירת מחדל&quot; נקבעת אוטומטית לפי הגיל.
                        </Typography>

                        <Divider sx={{ mb: 3 }} />

                        {loading ? (
                            <Box display="flex" justifyContent="center" py={4}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : (
                            <Stack spacing={3}>
                                {FIELDS.map((f) => (
                                    <FormControl key={f.key} fullWidth>
                                        <InputLabel id={`${f.key}-label`}>{f.label}</InputLabel>
                                        <Select
                                            labelId={`${f.key}-label`}
                                            label={f.label}
                                            value={values[f.key]}
                                            onChange={(e) =>
                                                setValues((prev) => ({ ...prev, [f.key]: e.target.value as FieldValue }))
                                            }
                                        >
                                            <MenuItem value="DEFAULT">
                                                ברירת מחדל לפי גיל{resolved ? ` (${resolved[f.key] === "EVERYONE" ? "כולם" : "חברים בלבד"})` : ""}
                                            </MenuItem>
                                            <MenuItem value="EVERYONE">כולם</MenuItem>
                                            <MenuItem value="FRIENDS_ONLY">חברים בלבד</MenuItem>
                                        </Select>
                                    </FormControl>
                                ))}

                                <Stack direction="row" spacing={2} justifyContent="flex-end">
                                    <Button variant="text" onClick={() => router.push("/profile")}>
                                        חזרה לפרופיל
                                    </Button>
                                    <Button
                                        variant="contained"
                                        onClick={handleSave}
                                        disabled={saving}
                                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                                    >
                                        שמירה
                                    </Button>
                                </Stack>
                            </Stack>
                        )}
                    </CardContent>
                </Card>
            </SignedIn>

            <Snackbar
                open={success}
                autoHideDuration={2000}
                onClose={() => setSuccess(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity="success" variant="filled" onClose={() => setSuccess(false)}>
                    נשמר בהצלחה
                </Alert>
            </Snackbar>

            <Snackbar
                open={!!error}
                autoHideDuration={3000}
                onClose={() => setError(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity="error" variant="filled" onClose={() => setError(null)}>
                    {error}
                </Alert>
            </Snackbar>
        </Container>
    );
}
