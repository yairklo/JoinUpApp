"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { WizardValues } from "./wizardModel";
import { WIZARD_STEP_TITLES, matchCountText, reviewWarnings } from "./wizardModel";

export interface StepReviewProps {
    values: WizardValues;
    onEdit: (step: number) => void;
    /** Hard-error messages gathered from every step. */
    errors: string[];
}

const FORMAT_NAME: Record<WizardValues["format"], string> = {
    LEAGUE: "ליגה",
    KNOCKOUT: "נוקאאוט",
    GROUPS_KNOCKOUT: "בתים + נוקאאוט",
    CUSTOM: "מותאם אישית",
};
const SPORT_NAME: Record<WizardValues["sport"], string> = { SOCCER: "כדורגל", BASKETBALL: "כדורסל", TENNIS: "טניס" };

const fmt = (s: string) => (s ? new Date(s).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" }) : "לא נקבע");

export default function StepReview({ values: v, onEdit, errors }: StepReviewProps) {
    const warnings = reviewWarnings(v);
    const cards: { step: number; lines: string[] }[] = [
        { step: 1, lines: [v.title || "ללא שם", SPORT_NAME[v.sport], `התחלה: ${fmt(v.startsAt)}`, v.isPublic ? "ציבורי" : "פרטי"] },
        { step: 2, lines: [`${v.minTeams}–${v.maxTeams} קבוצות`, `${v.minPlayersPerTeam}–${v.maxPlayersPerTeam} שחקנים, ${v.startersPerTeam} בהרכב`] },
        { step: 3, lines: [FORMAT_NAME[v.format], matchCountText(v) ?? "", `משחק ${v.matchMinutes} דק׳`].filter(Boolean) },
        {
            step: 4,
            lines: [
                `נפתחת: ${v.registrationOpensAt ? fmt(v.registrationOpensAt) : "עם הפרסום"}`,
                `נסגרת: ${fmt(v.registrationClosesAt)}`,
                v.requireApproval ? "אישור ידני" : "אישור אוטומטי",
            ],
        },
    ];
    return (
        <Stack spacing={2} data-testid="wizard-step-5">
            {errors.length > 0 && (
                <Alert severity="error" sx={{ borderRadius: 2 }} data-testid="wizard-review-errors">
                    <Stack component="ul" sx={{ m: 0, ps: 2 }}>{errors.map((e) => <li key={e}>{e}</li>)}</Stack>
                </Alert>
            )}
            {warnings.length > 0 && (
                <Alert severity="warning" sx={{ borderRadius: 2 }} data-testid="wizard-review-warnings">
                    <Stack component="ul" sx={{ m: 0, ps: 2 }}>{warnings.map((w) => <li key={w}>{w}</li>)}</Stack>
                </Alert>
            )}
            {cards.map((c) => (
                <Paper
                    key={c.step}
                    variant="outlined"
                    sx={(theme) => ({
                        p: 2.25,
                        borderRadius: 2.5,
                        bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.025 : 0.015),
                    })}
                >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                        <Typography variant="subtitle2" component="h3" fontWeight={800}>{WIZARD_STEP_TITLES[c.step - 1]}</Typography>
                        <Button size="small" variant="outlined" onClick={() => onEdit(c.step)} aria-label={`עריכה: ${WIZARD_STEP_TITLES[c.step - 1]}`}>עריכה</Button>
                    </Stack>
                    <Stack spacing={0.25}>
                        {c.lines.map((l) => (
                            <Typography key={l} variant="body2" color="text.secondary" fontWeight={500}>{l}</Typography>
                        ))}
                    </Stack>
                </Paper>
            ))}
        </Stack>
    );
}
