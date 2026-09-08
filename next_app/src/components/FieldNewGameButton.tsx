"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CloseIcon from "@mui/icons-material/Close";
import NewGameInline from "@/components/NewGameInline";

export default function FieldNewGameButton({ fieldId, fieldName }: { fieldId: string; fieldName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<AddCircleOutlineIcon />}
        onClick={() => setOpen(true)}
        sx={{ fontWeight: 700, py: 1.25 }}
      >
        צור משחק חדש במגרש הזה
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" dir="rtl">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 700 }}>
          <Box sx={{ minWidth: 0, paddingInlineEnd: 1 }}>
            <Typography variant="inherit" noWrap>משחק חדש ב{fieldName}</Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} aria-label="סגור">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <NewGameInline fieldId={fieldId} onCreated={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
