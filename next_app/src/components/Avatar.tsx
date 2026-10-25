"use client";
import MuiAvatar from "@mui/material/Avatar";

type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizePx: Record<AvatarSize, number> = {
  xs: 16,  // chat – very small
  sm: 24,  // short lists (friends/participants)
  md: 36,  // user headers
  lg: 48,  // profile avatar
};

// Deterministic pastel color from a name, for pleasant initials fallbacks
const FALLBACK_COLORS = [
  "#047857", "#4f46e5", "#b45309", "#0369a1",
  "#be185d", "#6d28d9", "#0f766e", "#c2410c",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function getInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  src,
  alt,
  name,
  size = "sm",
  className,
}: {
  src?: string | null;
  alt: string;
  name?: string;
  size?: AvatarSize;
  className?: string;
}) {
  const px = sizePx[size] ?? sizePx.sm;
  const display = name || alt || "";
  const initials = getInitials(display);
  const hasImage = !!(src && src.trim().length > 0);

  return (
    <MuiAvatar
      src={hasImage ? (src as string) : undefined}
      alt={alt}
      className={className}
      sx={{
        width: px,
        height: px,
        fontSize: px * 0.4,
        fontWeight: 700,
        bgcolor: hasImage ? undefined : colorFor(display),
        color: "#fff",
      }}
    >
      {!hasImage ? initials : null}
    </MuiAvatar>
  );
}
