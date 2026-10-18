import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import type { SvgIconProps } from "@mui/material/SvgIcon";

const ICONS = {
    SOCCER: SportsSoccerIcon,
    BASKETBALL: SportsBasketballIcon,
    TENNIS: SportsTennisIcon,
} as const;

/**
 * Vector sport glyph. Used instead of the sport emoji (⚽🏀🎾) in UI chrome: emoji depend on
 * the OS emoji font, so on systems without a color-emoji font they render as a broken box,
 * and even when they render they ignore our sport colors and sizing.
 */
export default function SportIcon({ sport, ...props }: { sport?: string | null } & SvgIconProps) {
    const Icon = (sport && ICONS[sport as keyof typeof ICONS]) || EmojiEventsRoundedIcon;
    return <Icon aria-hidden {...props} />;
}
