"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckRounded from "@mui/icons-material/CheckRounded";
import TeamBadge from "../TeamBadge";
import MinorsCard from "./MinorsCard";
import { NAME_MAX, TEAM_COLORS } from "./teamModel";

export interface TeamCreateFormProps {
    onSubmit: (data: { name: string; color: string }) => void;
    submitting?: boolean;
    /** Inline server error (plain language, never the raw code). */
    error?: string | null;
    /** NAME_TAKEN shows under the name field. */
    nameError?: string | null;
    /** MINORS_NOT_ALLOWED replaces the form with the minors card. */
    minors?: boolean;
    onCancel?: () => void;
}

export default function TeamCreateForm({ onSubmit, submitting, error, nameError, minors, onCancel }: TeamCreateFormProps) {
    const [name, setName] = useState("");
    const [color, setColor] = useState<string>(TEAM_COLORS[5]);
    const [touched, setTouched] = useState(false);
    const trimmed = name.trim();
    const localError = touched && !trimmed ? "יש להזין שם לקבוצה" : null;

    if (minors) return <MinorsCard />;

    return (
        <Stack
            component="form"
            spacing={2.5}
            data-testid="team-create-form"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (!trimmed) return;
                onSubmit({ name: trimmed, color });
            }}
        >
            <Box sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 3 }} aria-label="תצוגה מקדימה">
                <TeamBadge team={{ name: trimmed || "שם הקבוצה", color }} size={40} lines={2} />
            </Box>

            <TextField
                label="שם הקבוצה"
                value={name}
                required
                disabled={submitting}
                onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                onBlur={() => setTouched(true)}
                error={!!(nameError || localError)}
                helperText={nameError ?? localError ?? `${name.length}/${NAME_MAX}`}
                slotProps={{ htmlInput: { "data-testid": "team-create-name" } }}
                fullWidth
            />

            <Box role="radiogroup" aria-label="צבע הקבוצה" sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {TEAM_COLORS.map((c, i) => {
                    const selected = c === color;
                    return (
                        <ButtonBase
                            key={c}
                            role="radio"
                            aria-checked={selected}
                            aria-label={`צבע ${i + 1}`}
                            data-testid={`team-create-color-${i}`}
                            disabled={submitting}
                            onClick={() => setColor(c)}
                            sx={{
                                width: 44,
                                height: 44,
                                borderRadius: "50%",
                                bgcolor: c,
                                outline: selected ? "2px solid" : "none",
                                outlineColor: "text.primary",
                                outlineOffset: 2,
                                color: "#fff",
                            }}
                        >
                            {selected && <CheckRounded />}
                        </ButtonBase>
                    );
                })}
            </Box>

            <Typography variant="body2" color="text.secondary">
                אתם תהיו הקפטן של הקבוצה. אחרי ההרשמה אפשר להזמין שחקנים.
            </Typography>

            {error && <Alert severity="error" data-testid="team-create-error">{error}</Alert>}

            <Stack direction="row" spacing={1}>
                {onCancel && <Button onClick={onCancel} disabled={submitting} sx={{ minHeight: 48 }}>ביטול</Button>}
                <Button
                    type="submit"
                    variant="contained"
                    disabled={submitting}
                    data-testid="team-create-submit"
                    startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={{ minHeight: 48, flex: 1 }}
                >
                    רישום הקבוצה
                </Button>
            </Stack>
        </Stack>
    );
}
