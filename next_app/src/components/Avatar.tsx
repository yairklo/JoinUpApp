"use client";
import Image from "react-bootstrap/Image";

type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizePx: Record<AvatarSize, number> = {
  xs: 12,  // chat – קטן מאוד
  sm: 20,  // רשימות קצרות (friends/participants)
  md: 32,  // כותרות משתמש
  lg: 40,  // אווטאר פרופיל
};

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
  const initials = getInitials(name || alt || "");

  const url =
    (src && src.trim().length > 0 ? src : `https://placehold.co/${px}x${px}?text=${encodeURIComponent(initials)}`);

  return (
    <Image
      src={url}
      alt={alt}
      roundedCircle
      className={className}
      style={{ width: px, height: px, objectFit: "cover" }}
    />
  );
}


