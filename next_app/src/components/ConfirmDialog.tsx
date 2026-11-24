"use client";

import { useId } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    /** Destructive actions are red, and the Cancel button (not the destructive one) has initial focus. */
    destructive?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

/**
 * The app's confirmation dialog (same shape as CancelGameButton / DeleteSeriesDialog): Hebrew, RTL,
 * labelled for screen readers, closable with Esc or a backdrop click. Replaces window.confirm, which
 * cannot be styled, is not RTL-aware in every browser and is blocked in some embedded contexts.
 */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    cancelLabel = "ביטול",
    destructive = false,
    onConfirm,
    onClose,
}: ConfirmDialogProps) {
    const id = useId();
    const titleId = `${id}-title`;
    const descId = `${id}-desc`;
    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="xs"
            dir="rtl"
            role="alertdialog"
            aria-labelledby={titleId}
            aria-describedby={descId}
        >
            <DialogTitle id={titleId}>{title}</DialogTitle>
            <DialogContent>
                <DialogContentText id={descId}>{message}</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} autoFocus={destructive}>
                    {cancelLabel}
                </Button>
                <Button onClick={onConfirm} color={destructive ? "error" : "primary"} variant="contained" autoFocus={!destructive}>
                    {confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
