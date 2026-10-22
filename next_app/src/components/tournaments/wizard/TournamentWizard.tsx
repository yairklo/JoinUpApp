"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Step from "@mui/material/Step";
import StepButton from "@mui/material/StepButton";
import Stepper from "@mui/material/Stepper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseRounded from "@mui/icons-material/CloseRounded";
import StepBasics, { type FieldOption } from "./StepBasics";
import StepFormat from "./StepFormat";
import StepRegistration from "./StepRegistration";
import StepReview from "./StepReview";
import StepTeams from "./StepTeams";
import { WIZARD_STEP_TITLES, type WizardErrors, type WizardValues } from "./wizardModel";

export interface TournamentWizardProps {
    values: WizardValues;
    /** Errors for the visible step (keyed by field). */
    errors: WizardErrors;
    /** Flat hard-error list shown on the review step. */
    reviewErrors: string[];
    /** 1..5 */
    step: number;
    maxVisitedStep: number;
    onStepChange: (step: number) => void;
    onChange: (patch: Partial<WizardValues>) => void;
    onNext: () => void;
    onBack: () => void;
    onSaveDraft: () => void;
    /** Called after the user confirms the publish dialog (create) or the save button (edit of a live tournament). */
    onSubmit: () => void;
    onClose: () => void;
    saving?: boolean;
    /** Edit mode: label and flow differ. */
    isEdit?: boolean;
    /** Edit of an already published tournament: last step saves instead of publishing. */
    isPublished?: boolean;
    /** Structure fields locked by the server (schedule exists). */
    locked?: boolean;
    /** Top server-error alert. */
    serverError?: string | null;
    onRetry?: () => void;
    /** Publish dialog date text, e.g. the registration close date. */
    closesLabel?: string;
    onSearchFields?: (q: string) => Promise<FieldOption[]>;
}

export default function TournamentWizard(p: TournamentWizardProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const last = p.step === 5;
    const publishing = !p.isPublished;
    const stepProps = { values: p.values, errors: p.errors, onChange: p.onChange, disabled: p.saving, locked: p.locked };
    const nextLabel = last ? (p.isPublished ? "שמירה" : "פרסום") : "הבא";

    const body =
        p.step === 1 ? (
            <StepBasics {...stepProps} onSearchFields={p.onSearchFields} />
        ) : p.step === 2 ? (
            <StepTeams {...stepProps} />
        ) : p.step === 3 ? (
            <StepFormat {...stepProps} />
        ) : p.step === 4 ? (
            <StepRegistration {...stepProps} />
        ) : (
            <StepReview values={p.values} onEdit={p.onStepChange} errors={p.reviewErrors} />
        );

    const handlePrimary = () => {
        if (!last) return p.onNext();
        if (publishing) return setConfirmOpen(true);
        p.onSubmit();
    };

    return (
        <Box data-testid="wizard" sx={{ width: "100%" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h5" component="h1" fontWeight={800}>
                    {p.isEdit ? "עריכת טורניר" : "טורניר חדש"}
                </Typography>
                <IconButton aria-label="סגירה" onClick={p.onClose} sx={{ width: 44, height: 44 }}>
                    <CloseRounded />
                </IconButton>
            </Stack>

            {/* phone progress */}
            <Box sx={{ display: { xs: "block", md: "none" }, mb: 2 }}>
                <Typography variant="body2" color="text.secondary" data-testid="wizard-progress-label">
                    {`שלב ${p.step} מתוך 5 · ${WIZARD_STEP_TITLES[p.step - 1]}`}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 1 }} aria-hidden>
                    {WIZARD_STEP_TITLES.map((_, i) => (
                        <Box key={i} sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: i < p.step ? "primary.main" : "action.hover" }} />
                    ))}
                </Box>
            </Box>

            <Stack direction="row" spacing={3} alignItems="flex-start">
                <Box sx={{ display: { xs: "none", md: "block" }, width: 220, flexShrink: 0 }}>
                    <Stepper nonLinear activeStep={p.step - 1} orientation="vertical">
                        {WIZARD_STEP_TITLES.map((t, i) => (
                            <Step key={t} completed={i + 1 < p.step}>
                                <StepButton disabled={i + 1 > p.maxVisitedStep} onClick={() => p.onStepChange(i + 1)}>
                                    {t}
                                </StepButton>
                            </Step>
                        ))}
                    </Stepper>
                </Box>

                <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, borderRadius: 3, overflow: "hidden" }}>
                    <Box sx={{ p: { xs: 2, md: 3 } }}>
                        {p.serverError && (
                            <Alert
                                severity="error"
                                sx={{ mb: 2 }}
                                data-testid="wizard-server-error"
                                action={p.onRetry ? <Button color="inherit" size="small" onClick={p.onRetry}>ניסיון חוזר</Button> : undefined}
                            >
                                {p.serverError}
                            </Alert>
                        )}
                        {body}
                    </Box>
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ position: "sticky", bottom: 0, p: 1.5, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}
                    >
                        <Button data-testid="wizard-back" onClick={p.onBack} disabled={p.saving || p.step === 1} sx={{ minHeight: 44 }}>
                            חזרה
                        </Button>
                        <Box sx={{ flex: 1 }} />
                        {!p.isPublished && (
                            <Button data-testid="wizard-save-draft" variant="outlined" onClick={p.onSaveDraft} disabled={p.saving} sx={{ minHeight: 44 }}>
                                שמירה כטיוטה
                            </Button>
                        )}
                        <Button
                            data-testid={last ? "wizard-publish" : "wizard-next"}
                            variant="contained"
                            onClick={handlePrimary}
                            disabled={p.saving}
                            startIcon={p.saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={{ minHeight: 44, minWidth: 96 }}
                        >
                            {nextLabel}
                        </Button>
                    </Stack>
                </Paper>
            </Stack>

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>לפרסם את הטורניר?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {`הטורניר יופיע ברשימה וקבוצות יוכלו להירשם${p.closesLabel ? ` עד ${p.closesLabel}` : ""}. אחרי פרסום עדיין אפשר לערוך פרטים, אבל לא את מבנה הטורניר אחרי שייבנה לוח משחקים.`}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>ביטול</Button>
                    <Button
                        variant="contained"
                        data-testid="wizard-publish-confirm"
                        onClick={() => {
                            setConfirmOpen(false);
                            p.onSubmit();
                        }}
                    >
                        פרסום
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
