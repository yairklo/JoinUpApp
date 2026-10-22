"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export interface RosterMeterProps {
    /** Accepted members. */
    accepted: number;
    /** Invited, not yet accepted (hatched segments). */
    invited?: number;
    min: number;
    max: number;
    starters: number;
    compact?: boolean;
    /** Hide the caption line under the bar. */
    hideCaption?: boolean;
}

export type RosterMeterState = "below" | "ok" | "full";

export function rosterMeterState(accepted: number, min: number, max: number): RosterMeterState {
    if (accepted >= max) return "full";
    if (accepted < min) return "below";
    return "ok";
}

export function rosterMeterCaption(accepted: number, min: number, max: number): string {
    const s = rosterMeterState(accepted, min, max);
    if (s === "full") return "הסגל מלא";
    if (s === "ok") return "הסגל תקין";
    return `חסרים עוד ${min - accepted} שחקנים כדי שהקבוצה תהיה תקינה`;
}

const FILL: Record<RosterMeterState, string> = { below: "warning.main", ok: "success.main", full: "text.secondary" };

/** Segmented roster bar (spec 4.4). RTL-safe: the flex row follows the document direction. */
export default function RosterMeter({ accepted, invited = 0, min, max, starters, compact, hideCaption }: RosterMeterProps) {
    const state = rosterMeterState(accepted, min, max);
    const h = compact ? 6 : 10;
    const total = Math.max(1, max);
    const continuous = total > 20;
    const pct = (n: number) => `${(Math.min(n, total) / total) * 100}%`;
    return (
        <Box data-testid="roster-meter" sx={{ width: "100%" }}>
            <Box
                role="meter"
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={accepted}
                aria-valuetext={`${accepted} שחקנים, נדרשים ${min} עד ${max}`}
                sx={{ position: "relative", pt: compact ? 0 : 2.5 }}
            >
                {!compact && (
                    <>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ position: "absolute", top: 0, insetInlineStart: pct(min), whiteSpace: "nowrap" }}
                        >
                            {`מינימום ${min}`}
                        </Typography>
                        <Typography
                            variant="caption"
                            color="text.disabled"
                            sx={{ position: "absolute", top: 0, insetInlineStart: pct(starters), whiteSpace: "nowrap", display: starters === min ? "none" : "block" }}
                        >
                            {`בהרכב ${starters}`}
                        </Typography>
                    </>
                )}
                {continuous ? (
                    <Box sx={{ height: h, borderRadius: h, bgcolor: "action.hover", overflow: "hidden", position: "relative" }}>
                        <Box sx={{ position: "absolute", insetBlock: 0, insetInlineStart: 0, width: pct(accepted), bgcolor: FILL[state] }} />
                    </Box>
                ) : (
                    <Box sx={{ display: "flex", gap: "2px" }}>
                        {Array.from({ length: total }, (_, i) => {
                            const isFilled = i < accepted;
                            const isInvited = !isFilled && i < accepted + invited;
                            return (
                                <Box
                                    key={i}
                                    data-testid={isFilled ? "roster-seg-filled" : isInvited ? "roster-seg-invited" : "roster-seg-empty"}
                                    sx={{
                                        flex: 1,
                                        height: h,
                                        borderRadius: h,
                                        border: isInvited || (!isFilled && i === min - 1) ? 1 : 0,
                                        borderColor: "divider",
                                        bgcolor: isFilled ? FILL[state] : "action.hover",
                                        ...(isInvited && {
                                            backgroundImage:
                                                "repeating-linear-gradient(45deg, transparent 0 3px, rgba(128,128,128,0.45) 3px 5px)",
                                        }),
                                    }}
                                />
                            );
                        })}
                    </Box>
                )}
            </Box>
            {!hideCaption && (
                <Typography variant="caption" color={state === "below" ? "warning.dark" : "text.secondary"} sx={{ display: "block", mt: 0.5 }}>
                    {rosterMeterCaption(accepted, min, max)}
                </Typography>
            )}
        </Box>
    );
}
