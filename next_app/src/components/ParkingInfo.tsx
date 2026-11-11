import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LocalParkingRoundedIcon from "@mui/icons-material/LocalParkingRounded";
import OpenInMapLinks from "@/components/OpenInMapLinks";

/**
 * "חניה" row for a field or game: the optional note plus, when there is a parking pin, navigate
 * links that open the pin itself (not the venue). Pin and note are independent -- a note alone
 * shows as plain text. Renders nothing when the field has neither.
 */
export default function ParkingInfo({
  lat,
  lng,
  note,
  fieldName,
}: {
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  fieldName?: string | null;
}) {
  const hasPin = typeof lat === "number" && typeof lng === "number";
  if (!hasPin && !note) return null;

  return (
    <Stack
      component="section"
      aria-label="חניה"
      data-testid="field-parking"
      direction="row"
      spacing={1.25}
      useFlexGap
      alignItems="center"
      sx={{ px: 2, py: 1.25, flexWrap: "wrap", minWidth: 0 }}
    >
      <Box
        aria-hidden
        sx={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          color: "#fff",
          bgcolor: "#1d4ed8",
        }}
      >
        <LocalParkingRoundedIcon fontSize="small" />
      </Box>
      <Box sx={{ minWidth: 0, flex: "1 1 140px" }}>
        <Typography variant="subtitle2" component="h3" fontWeight={800} lineHeight={1.2}>
          חניה
        </Typography>
        {note && (
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
            {note}
          </Typography>
        )}
      </Box>
      {hasPin && (
        <OpenInMapLinks
          variant="link"
          location={{ lat, lng, name: fieldName ? `חניה – ${fieldName}` : "חניה" }}
          ariaLabelPrefix="ניווט לחניה"
          primaryLabel="ניווט לחניה"
        />
      )}
    </Stack>
  );
}
