"use client";

import Button from "@mui/material/Button";
import type { SxProps, Theme } from "@mui/material/styles";
import AddLocationAltRoundedIcon from "@mui/icons-material/AddLocationAltRounded";
import { ADD_FIELD_CTA_TEXT } from "@/components/SuggestFieldDialog";

/** "Can't find your field?" call to action for any empty / no-match field search state. */
export default function AddFieldCta({ onClick, sx }: { onClick: () => void; sx?: SxProps<Theme> }) {
  return (
    <Button
      type="button"
      variant="outlined"
      startIcon={<AddLocationAltRoundedIcon />}
      onClick={onClick}
      data-testid="add-field-cta"
      sx={[
        { borderRadius: 3, fontWeight: 700, minHeight: 44, textAlign: "start", whiteSpace: "normal", lineHeight: 1.35 },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {ADD_FIELD_CTA_TEXT}
    </Button>
  );
}
