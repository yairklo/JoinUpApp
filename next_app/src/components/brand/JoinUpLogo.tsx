"use client";

import { useContext } from "react";
import { ColorModeContext } from "@/components/theme/themeRegistry";

/**
 * JoinUp brand mark. Paths are copied from design/brand/joinup-logo-kit/svg (symbol + horizontal
 * lockup, all outlined) and inlined so the logo needs no request and always matches the theme the
 * rest of the page is rendered in (colour comes from ColorModeContext, same source as MUI's theme).
 * Palette per kit guide: #047857/#D9480F on light, #10B981/#F2672A on dark (#047857 is only 3.4:1
 * on the dark background).
 */
const PALETTE = {
  light: { main: "#047857", dot: "#D9480F" },
  dark: { main: "#10B981", dot: "#F2672A" },
} as const;

const RING =
  "M225.456 81.456A108 108 0 1 1 174.544 30.544L138.237 66.851A62 62 0 1 0 189.149 117.763Z";
const LETTERS =
  "M56 82A10 10 0 0 1 76 82V146A10 10 0 0 1 56 146ZM76 146A38 38 0 0 1 0 146H20A18 18 0 0 0 56 146ZM0 146A10 10 0 1 1 20 146A10 10 0 1 1 0 146ZM93 143A41 41 0 1 1 175 143A41 41 0 1 1 93 143ZM113 143A21 21 0 1 0 155 143A21 21 0 1 0 113 143ZM192 112A10 10 0 0 1 212 112V174A10 10 0 0 1 192 174ZM229 112A10 10 0 0 1 249 112V174A10 10 0 0 1 229 174ZM291 143A10 10 0 0 1 311 143V174A10 10 0 0 1 291 174ZM229 143A41 41 0 0 1 311 143H291A21 21 0 0 0 249 143ZM328 82A10 10 0 0 1 348 82V143A10 10 0 0 1 328 143ZM390 82A10 10 0 0 1 410 82V143A10 10 0 0 1 390 143ZM410 143A41 41 0 0 1 328 143H348A21 21 0 0 0 390 143ZM427 112A10 10 0 0 1 447 112V214A10 10 0 0 1 427 214ZM427 143A41 41 0 1 1 509 143A41 41 0 1 1 427 143ZM447 143A21 21 0 1 0 489 143A21 21 0 1 0 447 143Z";

export type JoinUpLogoVariant = "lockup" | "symbol";

interface JoinUpLogoProps {
  variant?: JoinUpLogoVariant;
  /** Rendered height in px; width follows the artwork's aspect ratio. */
  height: number;
  /** Force a palette; defaults to the current colour mode. */
  mode?: "light" | "dark";
  /** Hide from assistive tech when a neighbouring element already names the link. */
  decorative?: boolean;
}

export default function JoinUpLogo({ variant = "lockup", height, mode, decorative = false }: JoinUpLogoProps) {
  const ctx = useContext(ColorModeContext);
  const { main, dot } = PALETTE[(mode ?? ctx.mode) === "dark" ? "dark" : "light"];
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "JoinUp" };

  if (variant === "symbol") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="20 20 216 216"
        width={height}
        height={height}
        focusable="false"
        style={{ display: "block", flexShrink: 0 }}
        {...a11y}
      >
        <path d={RING} fill={main} />
        <circle cx="188.104" cy="67.896" r="21" fill={dot} />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="14.4 52.2 708.92 171.8"
      width={(height * 708.92) / 171.8}
      height={height}
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
      {...a11y}
    >
      <g transform="translate(0 37.8) scale(0.72)">
        <path d={RING} fill={main} />
        <circle cx="188.104" cy="67.896" r="21" fill={dot} />
      </g>
      <g transform="translate(214.32 0)">
        <path d={LETTERS} fill={main} />
        <circle cx="202" cy="84" r="12" fill={dot} />
      </g>
    </svg>
  );
}
