import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { ResultOutcome } from "@joinup/shared/matchStats";

/** Outcome chip colours (spec 1.2): a loss is neutral, never red. */
export function outcomeSx(outcome: ResultOutcome | null) {
  return (t: Theme) => {
    const dark = t.palette.mode === "dark";
    if (outcome === "WIN") {
      return { color: dark ? t.palette.success.main : t.palette.success.dark, bgcolor: alpha(t.palette.success.main, 0.14) };
    }
    if (outcome === "DRAW") {
      return { color: dark ? t.palette.secondary.light : t.palette.secondary.dark, bgcolor: alpha(t.palette.secondary.main, 0.14) };
    }
    return { color: t.palette.text.secondary, bgcolor: t.palette.action.hover };
  };
}

/** Team swatch: 10px circle with a ring so near-black / yellow stay visible (spec 1.2). */
export function swatchSx(color: string | null | undefined, fallback: "accent" | "neutral") {
  return (t: Theme) => ({
    width: 10,
    height: 10,
    flexShrink: 0,
    borderRadius: "50%",
    border: "1px solid",
    borderColor: "divider",
    bgcolor: color || (fallback === "neutral" ? t.palette.text.disabled : t.palette.primary.main),
  });
}
