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
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import OpenInMapLinks from "@/components/OpenInMapLinks";
import { venueMapInput, type MapLocationInput } from "@joinup/shared/mapLinks";

export default function GameActions({
  gameId,
  fieldName,
  lat,
  lng,
  address,
  customLat,
  customLng,
  customLocation,
}: {
  gameId: string;
  fieldName?: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  customLat?: number | null;
  customLng?: number | null;
  customLocation?: string | null;
}) {
  const location: MapLocationInput = {
    lat,
    lng,
    customLat,
    customLng,
    address,
    customLocation,
    name: fieldName,
  };
  const venue = venueMapInput(location);
  const pinLat = venue?.lat;
  const pinLng = venue?.lng;
  const isLoc = typeof pinLat === "number" && typeof pinLng === "number";

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
          <GameLocationMap lat={pinLat as number} lng={pinLng as number} title={fieldName} height={200} />
        </Box>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{
          px: { xs: 2, sm: 2.5 },
          pt: 1.5,
          pb: { xs: 2, sm: 2 },
          borderTop: "1px solid",
          borderColor: "divider",
          "& > *": { flex: { xs: 1, sm: "0 0 auto" }, minHeight: 44 },
        }}
      >
        <OpenInMapLinks location={location} />

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
