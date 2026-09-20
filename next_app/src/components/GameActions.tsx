"use client";
import React, { useState } from "react";
import GameLocationMap from "@/components/GameLocationMap";

// MUI
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";

// Icons
import NavigationOutlinedIcon from "@mui/icons-material/NavigationOutlined";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

type CopyState = "idle" | "copied" | "failed";

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

  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(`/games/${gameId}`);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const shareText = (url: string) => `${fieldName ? `${fieldName} – ` : ""}הצטרפו למשחק: ${url}`;

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      // Clipboard blocked (permissions, unfocused document, insecure context): the link stays
      // visible and selectable in the dialog, so the user can still copy it by hand.
      setCopyState("failed");
    }
  };

  const share = async () => {
    // Read the origin at click time: it is empty during SSR, which would share a relative path.
    const url = `${window.location.origin}/games/${gameId}`;
    // Touch devices have a native share sheet users expect; elsewhere it opens no visible UI
    // (or an OS sheet nobody expects), so show our own dialog with a copyable link.
    if (
      typeof navigator.share === "function" &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ) {
      try {
        await navigator.share({ title: fieldName || "JoinUp", text: shareText(url), url });
        return;
      } catch (err: unknown) {
        const name = err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name) : "";
        if (name === "AbortError" || name === "NotAllowedError") return;
        // fall through to the dialog
      }
    }
    setShareUrl(url);
    setCopyState("idle");
    setShareOpen(true);
    // The click is a user gesture, so copying right away is allowed; the dialog reports the result.
    void copyLink(url);
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

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} fullWidth maxWidth="xs" dir="rtl">
        <DialogTitle>שיתוף המשחק</DialogTitle>
        <DialogContent>
          <TextField
            value={shareUrl}
            fullWidth
            size="small"
            label="קישור למשחק"
            slotProps={{
              input: { readOnly: true },
              htmlInput: { dir: "ltr", onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select() },
            }}
            sx={{ mt: 1 }}
          />
          <Box role="status" aria-live="polite" sx={{ mt: 2, minHeight: 48 }}>
            {copyState === "copied" && <Alert severity="success">הקישור הועתק ללוח</Alert>}
            {copyState === "failed" && (
              <Alert severity="info">לא הצלחנו להעתיק אוטומטית. סמנו את הקישור למעלה והעתיקו אותו, או שתפו בוואטסאפ.</Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1, justifyContent: "flex-start", px: 3, pb: 2 }}>
          <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={() => copyLink(shareUrl)}>
            {copyState === "copied" ? "הועתק" : "העתק קישור"}
          </Button>
          <Button
            component="a"
            variant="outlined"
            startIcon={<WhatsAppIcon />}
            href={`https://wa.me/?text=${encodeURIComponent(shareText(shareUrl))}`}
            target="_blank"
            rel="noreferrer"
          >
            שיתוף בוואטסאפ
          </Button>
          <Button onClick={() => setShareOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
