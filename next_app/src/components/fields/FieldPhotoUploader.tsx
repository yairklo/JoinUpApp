"use client";

import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddPhotoIcon from "@mui/icons-material/AddPhotoAlternate";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import ErrorIcon from "@mui/icons-material/ErrorOutline";
import ImageIcon from "@mui/icons-material/ImageOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
    ACCEPTED_IMAGE_TYPES,
    MAX_FIELD_PHOTOS,
    MAX_PENDING_PHOTOS_PER_USER_PER_FIELD,
    type FieldPhotoErrorKind,
} from "@joinup/shared/upload";
import { useFieldPhotoUpload, isRetryable, type UploadItem } from "@/hooks/useFieldPhotoUpload";

const ERROR_TEXT: Record<FieldPhotoErrorKind, string> = {
    TYPE: "סוג הקובץ לא נתמך. אפשר להעלות JPEG, PNG, WEBP או GIF",
    SIZE: "התמונה גדולה מדי (עד 5MB)",
    FIELD_FULL: `הגלריה של המגרש מלאה (${MAX_FIELD_PHOTOS} תמונות)`,
    PENDING_PER_FIELD: `יש לך כבר ${MAX_PENDING_PHOTOS_PER_USER_PER_FIELD} תמונות שממתינות לאישור במגרש הזה`,
    PENDING_TOTAL: "יש לך הרבה תמונות שממתינות לאישור. אפשר להוסיף עוד אחרי שהן ייבדקו",
    DAILY: "הגעת למספר ההעלאות היומי. אפשר לנסות שוב מחר",
    RATE: "יותר מדי בקשות, נסו שוב בעוד רגע",
    BLOCKED: "אין לך אפשרות להוסיף תמונות למגרשים",
    AUTH: "נדרש להתחבר מחדש",
    NETWORK: "ההעלאה נכשלה. בדקו את החיבור ונסו שוב",
    UNKNOWN: "ההעלאה נכשלה, נסו שוב",
};

/** "אפשר להוסיף עוד תמונה אחת" / "אפשר להוסיף עוד 3 תמונות". */
export function remainingText(remaining: number): string {
    if (remaining <= 0) return "אי אפשר להוסיף עוד תמונות כרגע";
    return remaining === 1 ? "אפשר להוסיף עוד תמונה אחת" : `אפשר להוסיף עוד ${remaining} תמונות`;
}

const STATUS_TEXT: Record<UploadItem["status"], string> = {
    queued: "ממתינה בתור",
    resizing: "מכינה את התמונה",
    uploading: "מעלה",
    done: "הועלתה",
    error: "נכשלה",
};

function UploadRow({ item, onRetry, onDismiss }: { item: UploadItem; onRetry: () => void; onDismiss: () => void }) {
    const working = item.status === "queued" || item.status === "resizing" || item.status === "uploading";
    return (
        <Stack component="li" direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
            <Box
                sx={{
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    borderRadius: 1,
                    overflow: "hidden",
                    bgcolor: "action.hover",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                    <ImageIcon color="disabled" />
                )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap dir="auto" title={item.name}>
                    {item.name}
                </Typography>
                {working && (
                    <LinearProgress
                        variant={item.status === "uploading" ? "determinate" : "indeterminate"}
                        value={item.progress}
                        aria-label={`${STATUS_TEXT[item.status]}: ${item.name}`}
                        sx={{ mt: 0.75, borderRadius: 999 }}
                    />
                )}
                <Typography
                    variant="caption"
                    color={item.status === "error" ? "error" : "text.secondary"}
                    sx={{ display: "block", mt: working ? 0.25 : 0 }}
                >
                    {item.status === "error" && item.errorKind
                        ? ERROR_TEXT[item.errorKind]
                        : item.status === "uploading"
                            ? `${STATUS_TEXT.uploading} ${item.progress}%`
                            : STATUS_TEXT[item.status]}
                </Typography>
            </Box>
            {item.status === "done" && <CheckCircleIcon color="success" aria-hidden />}
            {item.status === "error" && (
                <>
                    <ErrorIcon color="error" aria-hidden />
                    {isRetryable(item.errorKind) && (
                        <IconButton size="small" onClick={onRetry} aria-label={`ניסיון נוסף: ${item.name}`}>
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    )}
                </>
            )}
            {item.status !== "uploading" && item.status !== "resizing" && item.status !== "done" && (
                <IconButton size="small" onClick={onDismiss} aria-label={`הסרה מהרשימה: ${item.name}`}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            )}
        </Stack>
    );
}

interface FieldPhotoUploaderProps {
    open: boolean;
    onClose: () => void;
    fieldId: string;
    fieldName: string;
    /** Slots the server last reported for this user on this field. */
    remaining: number;
    fieldFull: boolean;
    /** Called after each successful upload so the gallery can show the new photo. */
    onUploaded: () => void;
}

/**
 * "Add photos" dialog: pick several files at once, see one row per file with its own progress
 * and error. A selection larger than the slots left is trimmed and the user is told how many were
 * left out -- nothing is dropped silently.
 */
export default function FieldPhotoUploader({
    open,
    onClose,
    fieldId,
    fieldName,
    remaining,
    fieldFull,
    onUploaded,
}: FieldPhotoUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const { items, busy, doneCount, addFiles, retry, dismiss, clearSettled } = useFieldPhotoUpload(fieldId, onUploaded);
    const [trimNotice, setTrimNotice] = useState<string | null>(null);

    // Rows already queued hold slots the server has not counted yet.
    const queued = items.filter((it) => it.status === "queued" || it.status === "resizing" || it.status === "uploading").length;
    const slots = Math.max(0, remaining - queued);
    const canPick = !fieldFull && slots > 0;

    useEffect(() => {
        if (!open) setTrimNotice(null);
    }, [open]);

    const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (selected.length === 0) return;
        const result = addFiles(selected, slots);
        setTrimNotice(
            result.skippedCount > 0
                ? `בחרת ${selected.length} תמונות, אבל כרגע ${
                      slots === 1 ? "אפשר להוסיף רק תמונה אחת" : `אפשר להוסיף רק ${slots} תמונות`
                  }. ${result.skippedCount === 1 ? "תמונה אחת לא נשלחה." : `${result.skippedCount} תמונות לא נשלחו.`}`
                : null,
        );
    };

    const handleClose = () => {
        if (busy) return;
        clearSettled();
        onClose();
    };

    const allDone = !busy && doneCount > 0;

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs" dir="rtl" aria-labelledby="field-photo-uploader-title">
            <DialogTitle id="field-photo-uploader-title">הוספת תמונות ל{fieldName}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {fieldFull
                        ? ERROR_TEXT.FIELD_FULL
                        : `${remainingText(slots)}. התמונות יוצגו לכולם אחרי אישור של מנהל.`}
                </Typography>

                <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<AddPhotoIcon />}
                    onClick={() => inputRef.current?.click()}
                    disabled={!canPick}
                    sx={{ py: 1.5, borderStyle: "dashed" }}
                >
                    בחירת תמונות
                </Button>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    hidden
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    onChange={handleFiles}
                    aria-label="בחירת תמונות להעלאה"
                />

                <Box aria-live="polite" sx={{ mt: 1 }}>
                    {trimNotice && (
                        <Alert severity="warning" sx={{ mt: 1 }} onClose={() => setTrimNotice(null)}>
                            {trimNotice}
                        </Alert>
                    )}
                    {allDone && (
                        <Alert severity="success" sx={{ mt: 1 }}>
                            {doneCount === 1 ? "התמונה הועלתה. תודה!" : `${doneCount} תמונות הועלו. תודה!`}
                        </Alert>
                    )}
                </Box>

                {items.length > 0 && (
                    <Box component="ul" aria-label="תמונות בהעלאה" sx={{ listStyle: "none", p: 0, m: 0, mt: 1 }}>
                        {items.map((item) => (
                            <UploadRow key={item.id} item={item} onRetry={() => retry(item.id)} onDismiss={() => dismiss(item.id)} />
                        ))}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={busy}>
                    {busy ? "מעלה..." : "סגירה"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
