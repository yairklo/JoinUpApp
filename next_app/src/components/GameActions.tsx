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
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

// Icons
import NavigationRoundedIcon from "@mui/icons-material/NavigationRounded";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";

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
    <Card
      component="section"
      dir="rtl"
      elevation={0}
      sx={{ mb: 2, borderRadius: 5, border: "1px solid", borderColor: "divider", overflow: "hidden" }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2, py: 1.5, minWidth: 0 }}>
        <Box
          sx={(t) => ({
            width: 34,
            height: 34,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            color: "primary.main",
            bgcolor: alpha(t.palette.primary.main, 0.1),
          })}
        >
          <PlaceRoundedIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={800} lineHeight={1.2}>
            מיקום
          </Typography>
          {fieldName && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {fieldName}
            </Typography>
          )}
        </Box>
      </Stack>

      {isLoc && (
        <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
          <GameLocationMap lat={lat as number} lng={lng as number} title={fieldName} height={200} />
        </Box>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider", "& > *": { flex: { xs: 1, sm: "0 0 auto" } } }}
      >
        {isLoc && navHref && (
          <Button
            component="a"
            variant="contained"
            disableElevation
            startIcon={<NavigationRoundedIcon fontSize="small" />}
            href={navHref}
            target="_blank"
            rel="noreferrer"
            sx={{ borderRadius: 999, fontWeight: 800, px: 2.5 }}
          >
            ניווט
          </Button>
        )}

        <Button
          variant="outlined"
          startIcon={<IosShareRoundedIcon fontSize="small" />}
          onClick={doShare}
          sx={{ borderRadius: 999, fontWeight: 800, px: 2.5 }}
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
    </Card>
  );
}
