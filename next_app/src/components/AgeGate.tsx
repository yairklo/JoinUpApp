"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Link from "@mui/material/Link";
import CircularProgress from "@mui/material/CircularProgress";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { getAgeInJerusalem, type AgeGateInfo } from "@joinup/shared/ageGate";
import { GUARDIAN_DECLARATION_LABEL } from "@joinup/shared/legal";
import { usersApi } from "@/services/api/users";
import DeleteAccountCard from "@/components/DeleteAccountCard";

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Blocking dialog until the signed-in user has a birth date, accepted the current terms,
 * and (13-17) declared guardian consent. Status comes from GET /api/users/me; the server
 * enforces the same rule. Legal pages stay readable underneath.
 */
export default function AgeGate() {
    const { isSignedIn, getToken } = useAuth();
    const { signOut } = useClerk();
    const pathname = usePathname();
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

    const [gate, setGate] = useState<AgeGateInfo | null>(null);
    const [birthDate, setBirthDate] = useState("");
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [guardianConsent, setGuardianConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const me = await usersApi.getMe(token);
            setGate(me.ageGate ?? null);
        } catch {
            // Network/API failure: don't lock the UI; the server still enforces the gate.
        }
    }, [getToken]);

    useEffect(() => {
        if (isSignedIn) load();
        else setGate(null);
    }, [isSignedIn, load]);

    if (!isSignedIn || !gate || gate.status === "OK" || pathname?.startsWith("/legal")) return null;

    const needsBirthDate = gate.status === "NEEDS_BIRTHDATE";
    const age = needsBirthDate ? (birthDate ? getAgeInJerusalem(birthDate) : null) : gate.age;
    const tooYoung = gate.status === "UNDER_MIN_AGE";
    const isMinor = age !== null && age >= gate.minAge && age < gate.adultAge;
    const canSubmit =
        !busy && acceptTerms && (!needsBirthDate || !!birthDate) && (!isMinor || guardianConsent);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error("not signed in");
            const res = await usersApi.submitAgeGate(
                {
                    ...(needsBirthDate ? { birthDate } : {}),
                    acceptTerms,
                    guardianConsent: isMinor ? guardianConsent : undefined,
                },
                token
            );
            setGate(res.ageGate);
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : "השמירה נכשלה. נסו שוב.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open fullScreen={fullScreen} maxWidth="sm" fullWidth dir="rtl" disableEscapeKeyDown>
            {tooYoung ? (
                <>
                    <DialogTitle>JoinUp מיועדת לגיל {gate.minAge} ומעלה</DialogTitle>
                    <DialogContent>
                        <Typography mb={2}>
                            לפי תאריך הלידה שהוזן, אי אפשר להשתמש ב-JoinUp כרגע. נשמח לראות אותך כאן כשתגיע/י לגיל {gate.minAge}.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            אם תאריך הלידה הוזן בטעות, אפשר לפנות לתמיכה. אפשר גם למחוק את החשבון ואת כל המידע שבו.
                        </Typography>
                        <DeleteAccountCard />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => signOut({ redirectUrl: "/" })}>התנתקות</Button>
                    </DialogActions>
                </>
            ) : (
                <>
                    <DialogTitle>
                        {needsBirthDate ? "עוד פרט אחד לפני שמתחילים" : "עדכנו את תנאי השימוש"}
                    </DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} pt={1}>
                            {needsBirthDate && (
                                <>
                                    <Typography variant="body2" color="text.secondary">
                                        תאריך הלידה משמש להגנה על משתמשים צעירים. אי אפשר לשנות אותו אחר כך.
                                    </Typography>
                                    <TextField
                                        label="תאריך לידה"
                                        type="date"
                                        value={birthDate}
                                        onChange={(e) => setBirthDate(e.target.value)}
                                        InputLabelProps={{ shrink: true }}
                                        slotProps={{ htmlInput: { max: todayStr(), lang: "he-IL" } }}
                                        fullWidth
                                    />
                                    {age !== null && age < gate.minAge && (
                                        <Alert severity="warning">JoinUp מיועדת לגיל {gate.minAge} ומעלה.</Alert>
                                    )}
                                </>
                            )}

                            <FormControlLabel
                                control={<Checkbox checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />}
                                label={
                                    <Typography variant="body2">
                                        קראתי ואני מסכים/ה ל
                                        <Link href="/legal/terms" target="_blank" rel="noopener">תנאי השימוש</Link>
                                        {" "}ול
                                        <Link href="/legal/privacy" target="_blank" rel="noopener">מדיניות הפרטיות</Link>
                                    </Typography>
                                }
                            />

                            {isMinor && (
                                <FormControlLabel
                                    control={<Checkbox checked={guardianConsent} onChange={(e) => setGuardianConsent(e.target.checked)} />}
                                    label={<Typography variant="body2">{GUARDIAN_DECLARATION_LABEL}</Typography>}
                                />
                            )}

                            {error && <Alert severity="error">{error}</Alert>}
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => signOut({ redirectUrl: "/" })} disabled={busy}>התנתקות</Button>
                        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
                            {busy ? <CircularProgress size={22} color="inherit" /> : "המשך"}
                        </Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
}
