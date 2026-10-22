"use client";

import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { StepProps } from "./stepTypes";

export default function StepRegistration({ values: v, errors, onChange, disabled }: StepProps) {
    return (
        <Stack spacing={2.5} data-testid="wizard-step-4">
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                    label="פתיחת הרשמה"
                    type="datetime-local"
                    value={v.registrationOpensAt}
                    disabled={disabled}
                    onChange={(e) => onChange({ registrationOpensAt: e.target.value })}
                    helperText="ריק = מיד עם הפרסום"
                    slotProps={{ inputLabel: { shrink: true } }}
                    fullWidth
                />
                <TextField
                    label="סגירת הרשמה"
                    type="datetime-local"
                    value={v.registrationClosesAt}
                    disabled={disabled}
                    onChange={(e) => onChange({ registrationClosesAt: e.target.value })}
                    error={!!errors.registrationClosesAt}
                    helperText={errors.registrationClosesAt}
                    slotProps={{ inputLabel: { shrink: true }, formHelperText: { ...({ "data-testid": "wizard-error-registrationClosesAt" } as object) } }}
                    fullWidth
                />
            </Stack>
            <TextField
                label="נעילת סגלים (אופציונלי)"
                type="datetime-local"
                value={v.rosterLockAt}
                disabled={disabled}
                onChange={(e) => onChange({ rosterLockAt: e.target.value })}
                error={!!errors.rosterLockAt}
                helperText={errors.rosterLockAt ?? "אחרי המועד הזה קפטנים לא יוכלו לשנות את הסגל"}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
            />
            <Box
                sx={(theme) => ({
                    p: 2,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.03 : 0.015),
                })}
            >
                <FormControlLabel
                    control={<Switch checked={v.requireApproval} disabled={disabled} onChange={(e) => onChange({ requireApproval: e.target.checked })} />}
                    label={<Typography variant="body2" fontWeight={700}>אישור ידני של קבוצות</Typography>}
                    sx={{ mx: 0 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    כשכבוי, קבוצה שנרשמת מאושרת מיד (עד שהטורניר מתמלא)
                </Typography>
            </Box>
        </Stack>
    );
}
