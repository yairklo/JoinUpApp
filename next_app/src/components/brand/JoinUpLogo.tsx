"use client";

import { useContext } from "react";
import { ColorModeContext } from "@/components/theme/themeRegistry";

/**
 * JoinUp brand mark: the five-people icon, alone ("symbol") or next to the "JoinUp" wordmark
 * ("lockup", icon left of the wordmark, which always reads LTR). Artwork is generated from
 * design/brand/joinup-logo-v2 into public/brand. Colour follows ColorModeContext (same source as
 * MUI's theme): the dark variant uses the lighter #10B981/#F2672A greens/oranges, since the brand
 * green is too low-contrast on the dark background.
 */
const ASSETS = {
  lockup: { light: "/brand/joinup-lockup-light.png", dark: "/brand/joinup-lockup-dark.png", aspect: 471 / 168 },
  symbol: { light: "/brand/joinup-icon-light.png", dark: "/brand/joinup-icon-dark.png", aspect: 1 },
} as const;

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
  const asset = ASSETS[variant];
  const src = (mode ?? ctx.mode) === "dark" ? asset.dark : asset.light;

  return (
    // Small static brand PNG; next/image would only add a request round-trip through the optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={decorative ? "" : "JoinUp"}
      aria-hidden={decorative || undefined}
      width={Math.round(height * asset.aspect)}
      height={height}
      draggable={false}
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}
