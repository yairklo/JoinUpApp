"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import { searchApi } from "@/services/api/search";
import { tournamentErrorMessage } from "@/services/api/tournaments";
import { useTournament, useTournamentCapabilities, useTournamentMutations } from "@/hooks/tournaments";
import { getActionErrorMessage } from "@/utils/apiError";
import type { FieldOption } from "./StepBasics";
import TournamentWizard from "./TournamentWizard";
import {
    defaultValues,
    fromTournament,
    toCreateInput,
    validateAll,
    validateStep,
    validateTeamsStep,
    type WizardErrors,
    type WizardValues,
} from "./wizardModel";

/** Thin container: `/tournaments/new` (no id) and `/tournaments/[id]/edit`. */
export default function TournamentWizardContainer({ tournamentId }: { tournamentId?: string }) {
    const router = useRouter();
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const isEdit = !!tournamentId;
    const caps = useTournamentCapabilities();
    const t = useTournament(tournamentId, { live: false });
    const mut = useTournamentMutations();

    const [values, setValues] = useState<WizardValues>(defaultValues);
    const [loadedId, setLoadedId] = useState<string | null>(null);
    const [step, setStep] = useState(1);
    const [maxStep, setMaxStep] = useState(1);
    const [errors, setErrors] = useState<WizardErrors>({});
    const [dirty, setDirty] = useState(false);
    const [snack, setSnack] = useState<string | null>(null);
    const [leaveOpen, setLeaveOpen] = useState(false);
    const [unlocked, setUnlocked] = useState(false);
    const [forceOpen, setForceOpen] = useState(false);
    const savedId = useRef<string | undefined>(tournamentId);

    // Hydrate once when the edit target arrives.
    useEffect(() => {
        if (t.tournament && loadedId !== t.tournament.id) {
            setValues(fromTournament(t.tournament));
            setLoadedId(t.tournament.id);
        }
    }, [t.tournament, loadedId]);

    useEffect(() => {
        if (!dirty) return;
        const h = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", h);
        return () => window.removeEventListener("beforeunload", h);
    }, [dirty]);

    const detail = t.tournament;
    const isPublished = isEdit && !!detail && detail.status !== "DRAFT";
    const locked = isEdit && !!detail && detail.counts.matchesTotal > 0 && !unlocked;
    const isOrganizer = detail?.myRole === "ORGANIZER";

    const onChange = useCallback((patch: Partial<WizardValues>) => {
        setValues((v) => ({ ...v, ...patch }));
        setDirty(true);
        setErrors((e) => {
            const next = { ...e };
            for (const k of Object.keys(next)) delete next[k];
            return next;
        });
    }, []);

    const onSearchFields = useCallback(
        async (q: string): Promise<FieldOption[]> => {
            const token = (await getToken()) ?? undefined;
            const res = await searchApi.global(q, token);
            return res.fields.map((f) => ({ id: f.id, name: f.name }));
        },
        [getToken]
    );

    const goStep = (s: number) => {
        setStep(s);
        setMaxStep((m) => Math.max(m, s));
    };

    const onNext = () => {
        const e = validateStep(step, values);
        setErrors(e);
        if (Object.keys(e).length) {
            requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-testid^='wizard-error-'], .Mui-error")?.scrollIntoView({ block: "center", behavior: "smooth" }));
            return;
        }
        goStep(Math.min(5, step + 1));
    };

    const reviewErrors = useMemo(
        () => validateAll(values, true).flatMap((r) => Object.values(r.errors).filter((x): x is string => !!x)),
        [values]
    );

    /** Create/patch, then optionally publish. Returns the id on success. */
    const persist = async (publish: boolean): Promise<string | undefined> => {
        const failures = validateAll(values, publish);
        if (failures.length) {
            setStep(failures[0].step);
            setErrors(failures[0].errors);
            return undefined;
        }
        const input = toCreateInput(values);
        let id = savedId.current;
        if (id) {
            const res = await mut.patch(id, unlocked ? { ...input, force: true } : input);
            if (!res) return undefined;
        } else {
            const res = await mut.create(input);
            if (!res) return undefined;
            id = res.id;
            savedId.current = id;
        }
        if (publish && (!detail || detail.status === "DRAFT")) {
            const st = await mut.setStatus(id, "REGISTRATION_OPEN");
            if (!st) return undefined;
        }
        setDirty(false);
        return id;
    };

    const saveDraft = async () => {
        const id = await persist(false);
        if (id) {
            setSnack("הטיוטה נשמרה");
            if (!isEdit) router.replace(`/tournaments/${id}/edit`);
        }
    };

    const submit = async () => {
        const id = await persist(!isPublished);
        if (id) router.push(`/tournaments/${id}`);
    };

    const close = () => (dirty ? setLeaveOpen(true) : router.back());

    if (!isLoaded || (isEdit ? t.loading && !detail : caps.loading)) {
        return <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }} dir="rtl"><CircularProgress aria-label="טוען" /></Container>;
    }
    if (!isSignedIn) {
        return <Container maxWidth="md" sx={{ py: 4 }} dir="rtl"><Alert severity="info" sx={{ borderRadius: 2 }}>יש להתחבר כדי ליצור או לערוך טורניר</Alert></Container>;
    }
    if (isEdit && t.notFound) {
        return <Container maxWidth="md" sx={{ py: 4 }} dir="rtl"><Alert severity="error" sx={{ borderRadius: 2 }}>הטורניר לא נמצא</Alert></Container>;
    }
    if ((isEdit && !detail && t.error) || (!isEdit && caps.error)) {
        return (
            <Container maxWidth="md" sx={{ py: 4 }} dir="rtl">
                <Alert severity="warning" sx={{ borderRadius: 2 }} action={<Button color="inherit" size="small" onClick={() => void (isEdit ? t.reload() : caps.reload())}>נסו שוב</Button>}>
                    לא הצלחנו לבדוק את ההרשאה. נסו שוב.
                </Alert>
            </Container>
        );
    }
    if ((isEdit && detail && !detail.capabilities.canManage) || (!isEdit && !caps.canCreateTournaments)) {
        return <Container maxWidth="md" sx={{ py: 4 }} dir="rtl"><Alert severity="warning" sx={{ borderRadius: 2 }} data-testid="wizard-forbidden">אין לך הרשאה לפעולה הזו</Alert></Container>;
    }

    const serverError = mut.error ? tournamentErrorMessage(mut.error) ?? getActionErrorMessage(mut.error) : null;
    const closesLabel = values.registrationClosesAt
        ? new Date(values.registrationClosesAt).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })
        : undefined;

    return (
        <Container maxWidth="lg" sx={{ pt: { xs: 2.5, md: 4 }, pb: { xs: 13, md: 6 } }} dir="rtl">
            {locked && isOrganizer && (
                <Stack sx={{ mb: 2 }}>
                    <Alert severity="info" sx={{ borderRadius: 2 }} action={<Button color="inherit" size="small" onClick={() => setForceOpen(true)}>שינוי בכל זאת</Button>}>
                        המבנה נעול אחרי בניית לוח המשחקים
                    </Alert>
                </Stack>
            )}
            <TournamentWizard
                values={values}
                errors={step === 2 ? validateTeamsStep(values) : errors}
                reviewErrors={reviewErrors}
                step={step}
                maxVisitedStep={isEdit ? 5 : maxStep}
                onStepChange={goStep}
                onChange={onChange}
                onNext={onNext}
                onBack={() => goStep(Math.max(1, step - 1))}
                onSaveDraft={saveDraft}
                onSubmit={submit}
                onClose={close}
                saving={mut.pending}
                isEdit={isEdit}
                isPublished={isPublished}
                locked={locked}
                serverError={serverError}
                onRetry={mut.error ? () => { mut.clearError(); void submit(); } : undefined}
                closesLabel={closesLabel}
                onSearchFields={onSearchFields}
            />
            <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack} />
            <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} dir="rtl">
                <DialogTitle>לצאת בלי לשמור?</DialogTitle>
                <DialogContent><DialogContentText>שינויים שלא נשמרו יאבדו.</DialogContentText></DialogContent>
                <DialogActions>
                    <Button onClick={() => setLeaveOpen(false)}>המשך עריכה</Button>
                    <Button color="error" onClick={() => { setDirty(false); setLeaveOpen(false); router.back(); }}>יציאה</Button>
                </DialogActions>
            </Dialog>
            <Dialog open={forceOpen} onClose={() => setForceOpen(false)} dir="rtl">
                <DialogTitle>לשנות את המבנה?</DialogTitle>
                <DialogContent><DialogContentText>שינוי המבנה עלול לבטל משחקים שתוכננו</DialogContentText></DialogContent>
                <DialogActions>
                    <Button onClick={() => setForceOpen(false)}>ביטול</Button>
                    <Button color="error" onClick={() => { setUnlocked(true); setForceOpen(false); }}>שינוי בכל זאת</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
