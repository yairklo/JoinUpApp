"use client";

import Box from "@mui/material/Box";
import Fade from "@mui/material/Fade";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { alpha, keyframes } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import type { TournamentLocale } from "@/utils/tournament";

export interface UpdatedCueProps {
    /** Usually the `updated` flag from useTournament / useTournamentSchedule / ... */
    show: boolean;
    locale?: TournamentLocale;
    /** Default `updated-cue`. */
    testId?: string;
}

/**
 * "Updated just now" pill (spec 0.5). The `aria-live="polite"` region is always mounted so announcements work;
 * the pill fades in/out inside it. Place under the tab bar at the start edge.
 */
export default function UpdatedCue({ show, locale = "he", testId = "updated-cue" }: UpdatedCueProps) {
    return (
        <Box aria-live="polite" role="status" data-testid={testId} data-visible={show ? "true" : "false"} sx={{ minHeight: 24 }}>
            <Fade in={show} timeout={{ enter: 200, exit: 300 }} mountOnEnter unmountOnExit>
                <Box
                    sx={(theme) => ({
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                        px: 1.25,
                        py: 0.25,
                        borderRadius: 999,
                        bgcolor: alpha(theme.palette.secondary.main, 0.12),
                        color: theme.palette.mode === "dark" ? theme.palette.secondary.light : theme.palette.secondary.dark,
                        typography: "caption",
                        fontWeight: 600,
                    })}
                >
                    <RefreshRounded sx={{ fontSize: 12 }} />
                    {locale === "he" ? "עודכן עכשיו" : "Updated just now"}
                </Box>
            </Fade>
        </Box>
    );
}

const flash = keyframes`from{background-color:var(--flash-from)}to{background-color:transparent}`;

/**
 * sx for a row/card whose match id is in `changedMatchIds`: a 1.2s background flash (spec 0.5). With reduced
 * motion there is no flash. Spread into the element's `sx` (use an array to combine).
 */
export function changedFlashSx(active: boolean): SxProps<Theme> {
    if (!active) return {};
    return (theme: Theme) => ({
        "--flash-from": alpha(theme.palette.secondary.main, 0.16),
        animation: `${flash} 1.2s ease-out 1`,
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
    });
}
