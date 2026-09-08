"use client";
import React from "react";
import GameLocationMap from "@/components/GameLocationMap";

// MUI
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";

// Icons
import NavigationOutlinedIcon from "@mui/icons-material/NavigationOutlined";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";

export default function GameActions({
  gameId,
  fieldName,
  lat,
  lng,
}: {
  gameId: string;
  fieldName?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const isLoc = typeof lat === "number" && typeof lng === "number";
  const origin =
    typeof window !== "undefined" && window.location ? window.location.origin : "";
  const gameUrl = origin ? `${origin}/games/${gameId}` : `/games/${gameId}`;

  const shareText = `${fieldName ? `${fieldName} – ` : ""}הצטרפו למשחק: ${gameUrl}`;

  // Compute a native-friendly navigation URL (iOS -> Apple Maps; others -> Google Maps)
  const isIOS =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || /Macintosh/.test(navigator.userAgent) && "ontouchend" in document);
  const isAndroid =
    typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const navHref =
    isLoc && isIOS
      ? `http://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(fieldName || "Destination")}`
      : isLoc && isAndroid
      // geo: scheme tends to trigger the Android intent picker when no default is pinned
      ? `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(fieldName || "Destination")})`
      : isLoc
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : undefined;

  // Single Share button: show native share sheet when available;
  // If the user cancels, do nothing. If not supported, copy to clipboard.
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: fieldName || "JoinUp", text: shareText, url: gameUrl });
        return;
      } catch (err: unknown) {
        // If the user closed/cancelled the sheet, do nothing and do not fallback to web
        const name = err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name) : "";
        if (name === "AbortError" || name === "NotAllowedError") {
          return;
        }
        // Other errors: continue to clipboard fallback
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      alert("הקישור הועתק");
    } catch {
      // last resort: open a simple WhatsApp web share
      const web = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(web, "_blank");
    }
  };

  return (
    <Box component="section" dir="rtl" sx={{ mb: 2 }}>
      {isLoc && (
        <Card sx={{ mb: 1.5, overflow: "hidden", borderRadius: 3 }}>
          <GameLocationMap lat={lat as number} lng={lng as number} title={fieldName} height={220} />
        </Card>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {isLoc && navHref && (
          <Button
            component="a"
            variant="outlined"
            size="small"
            startIcon={<NavigationOutlinedIcon fontSize="small" />}
            href={navHref}
            target="_blank"
            rel="noreferrer"
          >
            ניווט
          </Button>
        )}

        <Button
          variant="outlined"
          size="small"
          startIcon={<ShareOutlinedIcon fontSize="small" />}
          onClick={share}
        >
          שיתוף
        </Button>
      </Stack>
    </Box>
  );
}
