"use client";

import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import type { CopyState } from "@/hooks/useShareDialog";

/** Presentational half of the desktop share fallback (see useShareDialog for the logic). */
export default function ShareDialog({
  open,
  onClose,
  title,
  url,
  whatsappText,
  copyState,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
  whatsappText: string;
  copyState: CopyState;
  onCopy: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" dir="rtl">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          value={url}
          fullWidth
          size="small"
          label="קישור"
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
        <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={onCopy}>
          {copyState === "copied" ? "הועתק" : "העתק קישור"}
        </Button>
        <Button
          component="a"
          variant="outlined"
          startIcon={<WhatsAppIcon />}
          href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
          target="_blank"
          rel="noreferrer"
        >
          שיתוף בוואטסאפ
        </Button>
        <Button onClick={onClose}>סגור</Button>
      </DialogActions>
    </Dialog>
  );
}
