"use client";
import React, { useState } from "react";
import GameLocationMap from "@/components/GameLocationMap";

// MUI
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";

// Icons
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import NavigationOutlinedIcon from "@mui/icons-material/NavigationOutlined";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import CloseIcon from "@mui/icons-material/Close";

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
  const [mapOpen, setMapOpen] = useState(false);

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
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {isLoc && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<MapOutlinedIcon fontSize="small" />}
            onClick={() => setMapOpen(true)}
          >
            הצג במפה
          </Button>
        )}

        {isLoc && (
          <Button
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

      {/* Map dialog */}
      {isLoc && (
        <Dialog open={mapOpen} onClose={() => setMapOpen(false)} fullWidth maxWidth="md" dir="rtl">
          <DialogTitle
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 700,
            }}
          >
            {fieldName || "מיקום המשחק"}
            <IconButton onClick={() => setMapOpen(false)} aria-label="סגור">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ pt: 0 }}>
            <Box sx={{ borderRadius: 3, overflow: "hidden" }}>
              <GameLocationMap lat={lat as number} lng={lng as number} title={fieldName} height={360} />
            </Box>
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
}
