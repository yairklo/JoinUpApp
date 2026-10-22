"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowDownwardRounded from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRounded from "@mui/icons-material/ArrowUpwardRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import LockOutlined from "@mui/icons-material/LockOutlined";
import type { TournamentFormat, TournamentSport } from "@/types/tournament";
import NumberStepper from "./NumberStepper";
import type { StepProps } from "./stepTypes";
import { TIEBREAK_KEYS, matchCountText, type TiebreakKey } from "./wizardModel";

const FORMATS: { format: TournamentFormat; name: string; hint: string }[] = [
    { format: "LEAGUE", name: "ליגה", hint: "כולם נגד כולם, טבלה אחת" },
    { format: "KNOCKOUT", name: "נוקאאוט", hint: "מפסידה יוצאת, עד הגמר" },
    { format: "GROUPS_KNOCKOUT", name: "בתים + נוקאאוט", hint: "שלב בתים ואחריו עץ" },
    { format: "CUSTOM", name: "מותאם אישית", hint: "בונים את המשחקים ידנית" },
];

export function tiebreakLabel(key: TiebreakKey, sport: TournamentSport): string {
    const basket = sport === "BASKETBALL";
    switch (key) {
        case "HEAD_TO_HEAD":
            return "מפגש ישיר";
        case "GOAL_DIFFERENCE":
            return basket ? "הפרש סלים" : "הפרש שערים";
        case "GOALS_FOR":
            return basket ? "סלי זכות" : "שערי זכות";
        case "WINS":
            return "ניצחונות";
        case "FAIR_PLAY":
            return "משחק הוגן";
        default:
            return "הגרלה";
    }
}

export default function StepFormat({ values: v, errors, onChange, disabled, locked }: StepProps) {
    const [advanced, setAdvanced] = useState(false);
    const off = disabled || locked;
    const hasTable = v.format === "LEAGUE" || v.format === "GROUPS_KNOCKOUT";
    const hasKnockout = v.format === "KNOCKOUT" || v.format === "GROUPS_KNOCKOUT";
    const unused = TIEBREAK_KEYS.filter((k) => !v.tiebreak.includes(k));
    const count = matchCountText(v);

    const move = (i: number, dir: -1 | 1) => {
        const next = [...v.tiebreak];
        const j = i + dir;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange({ tiebreak: next });
    };

    return (
        <Stack spacing={3} data-testid="wizard-step-3">
            <Box>
                <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>מבנה הטורניר</Typography>
                <Box role="radiogroup" aria-label="מבנה הטורניר" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                    {FORMATS.map((f) => {
                        const selected = v.format === f.format;
                        return (
                            <ButtonBase
                                key={f.format}
                                role="radio"
                                aria-checked={selected}
                                disabled={off}
                                data-testid={`wizard-format-${f.format}`}
                                onClick={() => onChange({ format: f.format })}
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    border: 2,
                                    borderColor: selected ? "primary.main" : "divider",
                                    bgcolor: selected ? "action.selected" : "transparent",
                                    textAlign: "start",
                                    justifyContent: "flex-start",
                                    alignItems: "flex-start",
                                    flexDirection: "column",
                                }}
                            >
                                <Typography fontWeight={700}>{f.name}</Typography>
                                <Typography variant="caption" color="text.secondary">{f.hint}</Typography>
                            </ButtonBase>
                        );
                    })}
                </Box>
                {locked && (
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
                        <LockOutlined fontSize="small" color="disabled" />
                        <Typography variant="caption" color="text.secondary">נעול אחרי בניית לוח המשחקים</Typography>
                    </Stack>
                )}
                {count && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} data-testid="wizard-match-count">
                        {count}
                    </Typography>
                )}
            </Box>

            {hasTable && (
                <Stack spacing={1}>
                    <Typography variant="subtitle2" component="h3">נקודות</Typography>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                        <NumberStepper label="ניצחון" ariaLabel="נקודות לניצחון" value={v.pointsWin} min={-10} max={10} disabled={off} onChange={(n) => onChange({ pointsWin: n })} />
                        <NumberStepper label="תיקו" ariaLabel="נקודות לתיקו" value={v.pointsDraw} min={-10} max={10} disabled={off} onChange={(n) => onChange({ pointsDraw: n })} />
                        <NumberStepper label="הפסד" ariaLabel="נקודות להפסד" value={v.pointsLoss} min={-10} max={10} disabled={off} onChange={(n) => onChange({ pointsLoss: n })} />
                    </Stack>
                    {errors.points && <Typography variant="caption" color="error" data-testid="wizard-error-points">{errors.points}</Typography>}

                    <Typography variant="subtitle2" component="h3" sx={{ pt: 1 }}>סדר שוברי שוויון</Typography>
                    <Stack component="ol" spacing={0.5} sx={{ m: 0, p: 0, listStyle: "none" }}>
                        {v.tiebreak.map((k, i) => (
                            <Stack
                                component="li"
                                key={k}
                                direction="row"
                                alignItems="center"
                                spacing={0.5}
                                data-testid={`wizard-tiebreak-${k}`}
                                sx={{ minHeight: 44, px: 1, border: 1, borderColor: "divider", borderRadius: 2 }}
                            >
                                <Typography sx={{ flex: 1 }}>{`${i + 1}. ${tiebreakLabel(k, v.sport)}`}</Typography>
                                <IconButton size="small" aria-label={`העלאת ${tiebreakLabel(k, v.sport)}`} disabled={off || i === 0} onClick={() => move(i, -1)} sx={{ width: 36, height: 36 }}>
                                    <ArrowUpwardRounded fontSize="small" />
                                </IconButton>
                                <IconButton size="small" aria-label={`הורדת ${tiebreakLabel(k, v.sport)}`} disabled={off || i === v.tiebreak.length - 1} onClick={() => move(i, 1)} sx={{ width: 36, height: 36 }}>
                                    <ArrowDownwardRounded fontSize="small" />
                                </IconButton>
                                <IconButton size="small" aria-label={`הסרת ${tiebreakLabel(k, v.sport)}`} disabled={off || v.tiebreak.length <= 1} onClick={() => onChange({ tiebreak: v.tiebreak.filter((x) => x !== k) })} sx={{ width: 36, height: 36 }}>
                                    <CloseRounded fontSize="small" />
                                </IconButton>
                            </Stack>
                        ))}
                    </Stack>
                    {unused.length > 0 && (
                        <>
                            <Divider />
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {unused.map((k) => (
                                    <Button key={k} size="small" variant="outlined" startIcon={<AddRounded />} disabled={off} onClick={() => onChange({ tiebreak: [...v.tiebreak, k] })} sx={{ minHeight: 36 }}>
                                        {tiebreakLabel(k, v.sport)}
                                    </Button>
                                ))}
                            </Stack>
                        </>
                    )}

                    <Typography variant="subtitle2" component="h3" sx={{ pt: 1 }}>מפגשים</Typography>
                    <ToggleButtonGroup exclusive size="small" value={v.legs} disabled={off} aria-label="מספר מפגשים" onChange={(_, n) => n && onChange({ legs: n })}>
                        <ToggleButton value={1} sx={{ minHeight: 44 }}>סיבוב אחד</ToggleButton>
                        <ToggleButton value={2} sx={{ minHeight: 44 }}>בית וחוץ</ToggleButton>
                    </ToggleButtonGroup>
                </Stack>
            )}

            {v.format === "GROUPS_KNOCKOUT" && (
                <Stack spacing={1}>
                    <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                        <NumberStepper label="מספר בתים" value={v.groupCount} min={1} max={16} disabled={off} error={!!errors.groupCount} onChange={(n) => onChange({ groupCount: n })} />
                        <NumberStepper label="עולות מכל בית" value={v.advancePerGroup} min={1} max={16} disabled={off} error={!!errors.advancePerGroup} onChange={(n) => onChange({ advancePerGroup: n })} />
                    </Stack>
                    {(errors.groupCount || errors.advancePerGroup) && (
                        <Typography variant="caption" color="error" data-testid="wizard-error-groups">{errors.groupCount ?? errors.advancePerGroup}</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">{`${v.groupCount * v.advancePerGroup} קבוצות יעלו לשלב הנוקאאוט`}</Typography>
                </Stack>
            )}

            {hasKnockout && (
                <Stack spacing={1}>
                    <FormControlLabel control={<Switch checked={v.thirdPlace} disabled={off} onChange={(e) => onChange({ thirdPlace: e.target.checked })} />} label="משחק על המקום השלישי" />
                    <ToggleButtonGroup exclusive size="small" value={v.seeding} disabled={off} aria-label="שיבוץ" onChange={(_, s) => s && onChange({ seeding: s })}>
                        <ToggleButton value="MANUAL" sx={{ minHeight: 44 }}>ידני</ToggleButton>
                        <ToggleButton value="RANDOM" sx={{ minHeight: 44 }}>אקראי</ToggleButton>
                    </ToggleButtonGroup>
                </Stack>
            )}

            {v.sport === "TENNIS" && (
                <Stack spacing={1}>
                    <Typography variant="subtitle2" component="h3">משחק עד</Typography>
                    <ToggleButtonGroup exclusive size="small" value={v.bestOf} aria-label="מספר מערכות" onChange={(_, n) => n && onChange({ bestOf: n })}>
                        <ToggleButton value={3} sx={{ minHeight: 44 }}>2 מתוך 3</ToggleButton>
                        <ToggleButton value={5} sx={{ minHeight: 44 }}>3 מתוך 5</ToggleButton>
                    </ToggleButtonGroup>
                </Stack>
            )}

            <Stack spacing={1}>
                <Typography variant="subtitle2" component="h3">זמנים</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    <NumberStepper label="משחק" ariaLabel="משך משחק" suffix="דק׳" value={v.matchMinutes} min={1} max={300} disabled={disabled} error={!!errors.matchMinutes} onChange={(n) => onChange({ matchMinutes: n })} />
                    <NumberStepper label="הפסקה" ariaLabel="משך הפסקה" suffix="דק׳" value={v.breakMinutes} min={0} max={120} disabled={disabled} onChange={(n) => onChange({ breakMinutes: n })} />
                    <NumberStepper label="מנוחה מינימלית" ariaLabel="מנוחה מינימלית" suffix="דק׳" value={v.minRestMinutes} min={0} max={600} disabled={disabled} onChange={(n) => onChange({ minRestMinutes: n })} />
                </Stack>
            </Stack>

            <Box>
                <Button size="small" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>הגדרות מתקדמות</Button>
                <Collapse in={advanced}>
                    <Stack spacing={1} sx={{ pt: 1 }}>
                        <Typography variant="caption" color="text.secondary">{`ניצחון טכני: ${v.forfeitWinner}–${v.forfeitLoser}`}</Typography>
                        <Stack direction="row" spacing={2}>
                            <NumberStepper label="למנצחת" value={v.forfeitWinner} min={0} max={99} disabled={disabled} onChange={(n) => onChange({ forfeitWinner: n })} />
                            <NumberStepper label="למפסידה" value={v.forfeitLoser} min={0} max={99} disabled={disabled} onChange={(n) => onChange({ forfeitLoser: n })} />
                        </Stack>
                    </Stack>
                </Collapse>
            </Box>
        </Stack>
    );
}
