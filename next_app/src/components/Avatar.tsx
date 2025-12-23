"use client";

import MuiAvatar from "@mui/material/Avatar";

type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizePx: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
};

function getInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function stringToColor(string: string) {
  let hash = 0;
  for (let i = 0; i < string.length; i++) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += `00${value.toString(16)}`.slice(-2);
  }
  return color;
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
  const initials = getInitials(name || alt || "");
  const displayName = name || alt || "";

  return (
    <MuiAvatar
      src={src || undefined}
      alt={alt}
      className={className}
      sx={{
        width: px,
        height: px,
        fontSize: px / 2.2,
        bgcolor: src ? 'transparent' : stringToColor(displayName),
      }}
    >
      {initials}
    </MuiAvatar>
  );
}