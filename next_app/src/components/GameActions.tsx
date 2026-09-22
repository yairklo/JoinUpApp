"use client";
import React from "react";
import GameLocationMap from "@/components/GameLocationMap";
import ShareDialog from "@/components/ShareDialog";
import { useShareDialog } from "@/hooks/useShareDialog";

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

  const { open, setOpen, url, copyState, copyLink, share } = useShareDialog();
  const shareText = (link: string) => `${fieldName ? `${fieldName} – ` : ""}הצטרפו למשחק: ${link}`;

  const doShare = () => {
    // Read the origin at click time: it is empty during SSR, which would share a relative path.
    const shareUrl = `${window.location.origin}/games/${gameId}`;
    void share({ title: fieldName || "JoinUp", text: shareText(shareUrl), url: shareUrl });
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
          onClick={doShare}
        >
          שיתוף
        </Button>
      </Stack>

      <ShareDialog
        open={open}
        onClose={() => setOpen(false)}
        title="שיתוף המשחק"
        url={url}
        whatsappText={shareText(url)}
        copyState={copyState}
        onCopy={() => copyLink(url)}
      />
    </Box>
  );
}
