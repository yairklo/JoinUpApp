"use client";
import React, { useState } from "react";
import GameLocationMap from "@/components/GameLocationMap";

// MUI
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

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
  const canUseNativeShare = () =>
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    // Desktop browsers either open no visible dialog (automation) or an OS sheet users don't
    // expect -- copy the link there and confirm with a toast, like series sharing does.
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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

  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);

  const share = async () => {
    // Read the origin at click time: it is empty during SSR, which would copy a relative path.
    const url = `${window.location.origin}/games/${gameId}`;
    if (canUseNativeShare()) {
      try {
        await navigator.share({ title: fieldName || "JoinUp", text: shareText, url: gameUrl });
        return;
      } catch (err: unknown) {
        const name = err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name) : "";
        if (name === "AbortError" || name === "NotAllowedError") return;
        // fall through to the clipboard/WhatsApp fallback below
      }
    }
    let copiedOk = false;
    try {
      await navigator.clipboard.writeText(url);
      copiedOk = true;
      setCopied(true);
    } catch {
      // fall through
    }
    if (!copiedOk) {
      // Clipboard unavailable (insecure context / denied): hand the link to WhatsApp and say so.
      setShareError(true);
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
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
      <Snackbar
        open={shareError}
        autoHideDuration={3500}
        onClose={() => setShareError(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setShareError(false)} severity="info" variant="filled" sx={{ width: "100%" }}>
          לא הצלחנו להעתיק את הקישור, פתחנו שיתוף בוואטסאפ
        </Alert>
      </Snackbar>
      <Snackbar
        open={copied}
        autoHideDuration={2500}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setCopied(false)} severity="success" variant="filled" sx={{ width: "100%" }}>
          הקישור הועתק ללוח
        </Alert>
      </Snackbar>
    </Box>
  );
}
