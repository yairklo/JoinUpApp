"use client";

import Box from "@mui/material/Box";
import Fade from "@mui/material/Fade";
import Portal from "@mui/material/Portal";
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
 * the pill fades in/out inside it. Rendered through a portal as a floating pill (bottom center, above the
 * mobile nav) so it never reserves layout space in the page it sits in.
 */
export default function UpdatedCue({ show, locale = "he", testId = "updated-cue" }: UpdatedCueProps) {
    return (
        <Portal>
            <Box
                aria-live="polite"
                role="status"
                data-testid={testId}
                data-visible={show ? "true" : "false"}
                sx={(theme) => ({
                    position: "fixed",
                    insetInline: 0,
                    bottom: { xs: "calc(96px + env(safe-area-inset-bottom))", md: 24 },
                    zIndex: theme.zIndex.snackbar - 1,
                    display: "flex",
                    justifyContent: "center",
                    pointerEvents: "none",
                })}
            >
                <Fade in={show} timeout={{ enter: 200, exit: 300 }} mountOnEnter unmountOnExit>
                    <Box
                        sx={(theme) => ({
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.75,
                            px: 1.75,
                            py: 0.75,
                            borderRadius: 999,
                            bgcolor: theme.palette.mode === "dark" ? "#1e293b" : theme.palette.common.white,
                            color: theme.palette.mode === "dark" ? theme.palette.secondary.light : theme.palette.secondary.dark,
                            border: 1,
                            borderColor: alpha(theme.palette.secondary.main, 0.35),
                            boxShadow: theme.shadows[4],
                            typography: "caption",
                            fontWeight: 700,
                        })}
                    >
                        <RefreshRounded sx={{ fontSize: 14 }} />
                        {locale === "he" ? "עודכן עכשיו" : "Updated just now"}
                    </Box>
                </Fade>
            </Box>
        </Portal>
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
