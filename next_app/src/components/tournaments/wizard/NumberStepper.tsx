"use client";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import RemoveRounded from "@mui/icons-material/RemoveRounded";

export interface NumberStepperProps {
    label: string;
    value: number;
    onChange: (n: number) => void;
    min?: number;
    max?: number;
    suffix?: string;
    disabled?: boolean;
    /** aria-label base, e.g. "מספר הקבוצות המקסימלי" -> "הגדלת ..." / "הקטנת ...". */
    ariaLabel?: string;
    testId?: string;
    error?: boolean;
}

/** 44px outlined −/+ buttons around a tappable, typeable value (spec 3.3). */
export default function NumberStepper({
    label,
    value,
    onChange,
    min = 0,
    max = 999,
    suffix,
    disabled,
    ariaLabel,
    testId,
    error,
}: NumberStepperProps) {
    const clamp = (n: number) => Math.min(max, Math.max(min, n));
    const name = ariaLabel ?? label;
    return (
        <Box data-testid={testId} sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                {label}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <IconButton
                    aria-label={`הגדלת ${name}`}
                    disabled={disabled || value >= max}
                    onClick={() => onChange(clamp(value + 1))}
                    sx={{ width: 44, height: 44, border: 1, borderColor: "divider", borderRadius: 2 }}
                >
                    <AddRounded />
                </IconButton>
                <InputBase
                    value={Number.isFinite(value) ? value : ""}
                    disabled={disabled}
                    onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d-]/g, "");
                        if (raw === "" || raw === "-") return;
                        onChange(clamp(parseInt(raw, 10)));
                    }}
                    inputProps={{
                        inputMode: "numeric",
                        "aria-label": name,
                        "data-testid": testId ? `${testId}-input` : undefined,
                        style: { textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 700 },
                    }}
                    sx={{
                        width: suffix ? 72 : 52,
                        height: 44,
                        border: 1,
                        borderColor: error ? "error.main" : "divider",
                        borderRadius: 2,
                        px: 0.5,
                    }}
                    endAdornment={suffix ? <Typography variant="caption" color="text.secondary" sx={{ pe: 0.5 }}>{suffix}</Typography> : undefined}
                />
                <IconButton
                    aria-label={`הקטנת ${name}`}
                    disabled={disabled || value <= min}
                    onClick={() => onChange(clamp(value - 1))}
                    sx={{ width: 44, height: 44, border: 1, borderColor: "divider", borderRadius: 2 }}
                >
                    <RemoveRounded />
                </IconButton>
            </Box>
        </Box>
    );
}
