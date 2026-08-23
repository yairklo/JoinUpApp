"use client";

import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import UploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import Avatar from "./Avatar";
import { MAX_IMAGE_FILE_SIZE, ACCEPTED_IMAGE_TYPES } from "@joinup/shared/upload";

export { MAX_IMAGE_FILE_SIZE, ACCEPTED_IMAGE_TYPES };

export function validateImageFile(file: File): string | null {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        return "ניתן להעלות רק תמונות מסוג JPEG, PNG, WEBP או GIF";
    }
    if (file.size > MAX_IMAGE_FILE_SIZE) {
        return "גודל התמונה חייב להיות עד 5MB";
    }
    return null;
}

interface ImageUploadFieldProps {
    imageUrl?: string | null;
    name?: string;
    label: string;
    disabled?: boolean;
    onUpload: (file: File) => Promise<{ imageUrl: string }>;
    onUploaded: (url: string) => void;
    onRemove?: () => Promise<unknown>;
    onRemoved?: () => void;
}

export default function ImageUploadField({
    imageUrl,
    name,
    label,
    disabled,
    onUpload,
    onUploaded,
    onRemove,
    onRemoved,
}: ImageUploadFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePick = () => inputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-selecting the same file later
        if (!file) return;

        const validationError = validateImageFile(file);
        if (validationError) {
            setError(validationError);
            return;
        }

        setError(null);
        setBusy(true);
        try {
            const result = await onUpload(file);
            onUploaded(result.imageUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : "העלאת התמונה נכשלה");
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async () => {
        if (!onRemove) return;
        setError(null);
        setBusy(true);
        try {
            await onRemove();
            onRemoved?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : "הסרת התמונה נכשלה");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box display="flex" flexDirection="column" gap={0.5}>
            <Box display="flex" alignItems="center" gap={2}>
                <Box position="relative" display="inline-flex">
                    <Avatar src={imageUrl} name={name || label} alt={name || label} size="lg" />
                    {busy && (
                        <Box
                            position="absolute"
                            top={0}
                            left={0}
                            right={0}
                            bottom={0}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            bgcolor="rgba(0,0,0,0.35)"
                            borderRadius="50%"
                        >
                            <CircularProgress size={20} sx={{ color: "#fff" }} />
                        </Box>
                    )}
                </Box>

                <Box display="flex" flexDirection="column" gap={0.5}>
                    <Box display="flex" gap={1}>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<UploadIcon />}
                            onClick={handlePick}
                            disabled={disabled || busy}
                        >
                            {imageUrl ? "החלף תמונה" : label}
                        </Button>
                        {imageUrl && onRemove && (
                            <Button
                                size="small"
                                variant="text"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={handleRemove}
                                disabled={disabled || busy}
                            >
                                הסר
                            </Button>
                        )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                        JPEG, PNG, WEBP או GIF — עד 5MB
                    </Typography>
                </Box>

                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    hidden
                    onChange={handleFileChange}
                />
            </Box>
            {error && (
                <Typography variant="caption" color="error">
                    {error}
                </Typography>
            )}
        </Box>
    );
}
