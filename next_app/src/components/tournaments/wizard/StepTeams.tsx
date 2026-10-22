"use client";

import Alert from "@mui/material/Alert";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import RosterMeter from "../RosterMeter";
import NumberStepper from "./NumberStepper";
import type { StepProps } from "./stepTypes";
import { knockoutByes } from "./wizardModel";

export default function StepTeams({ values: v, errors, onChange, disabled, locked }: StepProps) {
    const off = disabled || locked;
    const byes = v.format === "KNOCKOUT" ? knockoutByes(v.maxTeams) : 0;
    return (
        <Stack spacing={3} data-testid="wizard-step-2">
            <Stack spacing={1}>
                <Typography variant="subtitle2" component="h3">מספר קבוצות</Typography>
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                    <NumberStepper
                        label="מינימום"
                        ariaLabel="מספר הקבוצות המינימלי"
                        value={v.minTeams}
                        min={2}
                        max={64}
                        disabled={off}
                        error={!!errors.teams}
                        testId="wizard-min-teams"
                        onChange={(n) => onChange({ minTeams: n })}
                    />
                    <NumberStepper
                        label="מקסימום"
                        ariaLabel="מספר הקבוצות המקסימלי"
                        value={v.maxTeams}
                        min={2}
                        max={64}
                        disabled={off}
                        error={!!errors.teams}
                        testId="wizard-max-teams"
                        onChange={(n) => onChange({ maxTeams: n })}
                    />
                </Stack>
                {errors.teams && (
                    <Typography variant="caption" color="error" data-testid="wizard-error-teams">{errors.teams}</Typography>
                )}
                {byes > 0 && (
                    <Typography variant="caption" color="text.secondary">
                        {`עם ${v.maxTeams} קבוצות יהיו ${byes} פטורים בסיבוב הראשון`}
                    </Typography>
                )}
            </Stack>

            <Stack spacing={1.5}>
                <Typography variant="subtitle2" component="h3">גודל קבוצה</Typography>
                <NumberStepper
                    label="בהרכב (על המגרש)"
                    ariaLabel="מספר השחקנים בהרכב"
                    value={v.startersPerTeam}
                    min={1}
                    max={30}
                    disabled={off}
                    error={!!errors.starters}
                    testId="wizard-starters"
                    onChange={(n) => onChange({ startersPerTeam: n })}
                />
                {errors.starters && (
                    <Typography variant="caption" color="error" data-testid="wizard-error-starters">{errors.starters}</Typography>
                )}
                <Typography variant="caption" color="text.secondary">שחקנים בקבוצה</Typography>
                <Slider
                    data-testid="wizard-players-range"
                    value={[v.minPlayersPerTeam, v.maxPlayersPerTeam]}
                    min={1}
                    max={30}
                    step={1}
                    disableSwap
                    valueLabelDisplay="auto"
                    disabled={off}
                    marks={[{ value: v.startersPerTeam, label: `${v.startersPerTeam}` }]}
                    getAriaLabel={(i) => (i === 0 ? "מינימום שחקנים" : "מקסימום שחקנים")}
                    onChange={(_, val) => {
                        const [a, b] = val as number[];
                        onChange({ minPlayersPerTeam: a, maxPlayersPerTeam: b });
                    }}
                    sx={{ mx: 1, width: "calc(100% - 16px)", direction: "ltr" }}
                />
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                    <NumberStepper
                        label="מינימום"
                        ariaLabel="מינימום שחקנים"
                        value={v.minPlayersPerTeam}
                        min={1}
                        max={30}
                        disabled={off}
                        error={!!errors.players}
                        testId="wizard-min-players"
                        onChange={(n) => onChange({ minPlayersPerTeam: n })}
                    />
                    <NumberStepper
                        label="מקסימום"
                        ariaLabel="מקסימום שחקנים"
                        value={v.maxPlayersPerTeam}
                        min={1}
                        max={30}
                        disabled={off}
                        error={!!errors.players}
                        testId="wizard-max-players"
                        onChange={(n) => onChange({ maxPlayersPerTeam: n })}
                    />
                </Stack>
                {errors.players && (
                    <Typography variant="caption" color="error" data-testid="wizard-error-players">{errors.players}</Typography>
                )}
                {locked && <Alert severity="info" icon={false}>נעול אחרי בניית לוח המשחקים</Alert>}
            </Stack>

            <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">תצוגה</Typography>
                <RosterMeter
                    accepted={Math.min(v.minPlayersPerTeam, v.maxPlayersPerTeam)}
                    min={v.minPlayersPerTeam}
                    max={Math.max(v.maxPlayersPerTeam, 1)}
                    starters={v.startersPerTeam}
                    hideCaption
                />
                <Typography variant="body2">
                    {`כל קבוצה תצטרך ${v.minPlayersPerTeam}–${v.maxPlayersPerTeam} שחקנים, ${v.startersPerTeam} מהם על המגרש.`}
                </Typography>
            </Stack>
        </Stack>
    );
}
