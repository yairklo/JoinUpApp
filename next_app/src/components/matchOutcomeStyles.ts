import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type { ResultOutcome } from '@/types/matchResult';

/**
 * Outcome colours from the MUI palette (design spec 1.2). A loss is neutral grey, not red; the
 * letter/label always carries the meaning. `null` (player without a side) looks like a loss.
 */
export function outcomeSx(outcome: ResultOutcome | null) {
    return (theme: Theme) => {
        const dark = theme.palette.mode === 'dark';
        if (outcome === 'WIN') {
            return {
                color: dark ? theme.palette.success.main : theme.palette.success.dark,
                bgcolor: alpha(theme.palette.success.main, 0.14),
            };
        }
        if (outcome === 'DRAW') {
            return {
                color: dark ? theme.palette.secondary.light : theme.palette.secondary.dark,
                bgcolor: alpha(theme.palette.secondary.main, 0.14),
            };
        }
        return { color: theme.palette.text.secondary, bgcolor: theme.palette.action.hover };
    };
}
