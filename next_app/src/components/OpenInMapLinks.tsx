"use client";

import Button from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import NavigationRoundedIcon from "@mui/icons-material/NavigationRounded";
import { buildMapLinks, type MapLocationInput } from "@joinup/shared/mapLinks";

const linkSx = {
  fontWeight: 700,
  flexShrink: 0,
  whiteSpace: "nowrap",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
} as const;

/**
 * "פתיחה במפה" for a field or venue. Google Maps and Waze, each in a new tab.
 * Renders nothing when the venue has no coordinates and no address or name.
 */
export default function OpenInMapLinks({
  location,
  variant = "button",
}: {
  location: MapLocationInput;
  /** Pill buttons on the game and group pages; text links in a tight row. */
  variant?: "button" | "link";
}) {
  const links = buildMapLinks(location);
  if (!links) return null;

  if (variant === "link") {
    return (
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0 }}>
        <MuiLink
          href={links.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          variant="body2"
          sx={linkSx}
        >
          פתיחה במפה
        </MuiLink>
        <MuiLink
          href={links.wazeUrl}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          variant="body2"
          sx={linkSx}
        >
          Waze
        </MuiLink>
      </Stack>
    );
  }

  return (
    <>
      <Button
        component="a"
        variant="contained"
        disableElevation
        startIcon={<NavigationRoundedIcon fontSize="small" />}
        href={links.googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ borderRadius: 999, fontWeight: 800, px: 2.5 }}
      >
        פתיחה במפה
      </Button>
      <Button
        component="a"
        variant="outlined"
        href={links.wazeUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ borderRadius: 999, fontWeight: 800, px: 2.5 }}
      >
        Waze
      </Button>
    </>
  );
}
