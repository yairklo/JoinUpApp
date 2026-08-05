import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { fieldsApi } from "@/services/api";
import type { FieldOption } from "@/hooks/useGameCreator";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export interface SeriesSettingsEditorHookProps {
    seriesId: string;
    seriesType: "WEEKLY" | "CUSTOM";
    initialTitle?: string | null;
    initialDescription?: string | null;
    initialImageUrl?: string | null;
    initialAutoOpenHours?: number | null;
    initialFieldId?: string | null;
    initialFieldName?: string | null;
    initialFieldLocation?: string | null;
    initialDayOfWeek?: number | null;
    initialTime?: string | null;
    initialDuration?: number | null;
}

export function useSeriesSettingsEditor({
    seriesId,
    seriesType,
    initialTitle,
    initialDescription,
    initialImageUrl,
    initialAutoOpenHours,
    initialFieldId,
    initialFieldName,
    initialFieldLocation,
    initialDayOfWeek,
    initialTime,
    initialDuration,
}: SeriesSettingsEditorHookProps) {
    const { getToken } = useAuth();
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const [title, setTitle] = useState(initialTitle || "");
    const [description, setDescription] = useState(initialDescription || "");
    const [imageUrl, setImageUrl] = useState(initialImageUrl || "");
    const [hours, setHours] = useState<string>(initialAutoOpenHours ? String(initialAutoOpenHours) : "");
    const [time, setTime] = useState(initialTime || "");
    const [duration, setDuration] = useState<number>(initialDuration || 1);
    const [updateFutureGames, setUpdateFutureGames] = useState(true);

    // Field / venue state (same mechanism as game editing)
    const [fields, setFields] = useState<FieldOption[]>([]);
    const [selectedField, setSelectedField] = useState<FieldOption | null>(
        initialFieldId
            ? { id: initialFieldId, name: initialFieldName || "", location: initialFieldLocation || "" }
            : null
    );
    const [newFieldMode, setNewFieldMode] = useState(false);
    const [newField, setNewField] = useState<{ name: string; location: string }>({
        name: "",
        location: "",
    });

    useEffect(() => {
        if (!open) return;
        let ignore = false;
        async function fetchFields() {
            try {
                const arr = await fieldsApi.getAll();
                if (ignore) return;
                const options: FieldOption[] = (arr || []).map((f) => ({
                    id: f.id,
                    name: f.name,
                    location: f.location,
                }));
                if (initialFieldId && !options.some((f) => f.id === initialFieldId)) {
                    options.unshift({
                        id: initialFieldId,
                        name: initialFieldName || "מגרש נוכחי",
                        location: initialFieldLocation || "",
                    });
                }
                setFields(options);
            } catch {
                // keep initial selection if fetch fails
            }
        }
        fetchFields();
        return () => { ignore = true; };
    }, [open, initialFieldId, initialFieldName, initialFieldLocation]);

    const resetForm = () => {
        setTitle(initialTitle || "");
        setDescription(initialDescription || "");
        setImageUrl(initialImageUrl || "");
        setHours(initialAutoOpenHours ? String(initialAutoOpenHours) : "");
        setTime(initialTime || "");
        setDuration(initialDuration || 1);
        setUpdateFutureGames(true);
        setNewFieldMode(false);
        setNewField({ name: "", location: "" });
        setSelectedField(
            initialFieldId
                ? { id: initialFieldId, name: initialFieldName || "", location: initialFieldLocation || "" }
                : null
        );
    };

    const handleOpen = () => {
        resetForm();
        setOpen(true);
    };

    const handleClose = () => setOpen(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            const token = await getToken();

            const payload: Record<string, unknown> = {
                title: title || "",
                description: description || "",
                imageUrl: imageUrl || "",
                autoOpenRegistrationHours: hours === "" ? null : Number(hours),
                time,
                duration,
                updateFutureGames,
                ...(newFieldMode
                    ? {
                        fieldId: "",
                        fieldName: newField.name.trim(),
                        fieldLocation: newField.location.trim(),
                    }
                    : selectedField
                        ? {
                            fieldId: selectedField.id,
                            fieldName: selectedField.name,
                            fieldLocation: selectedField.location || "",
                        }
                        : {}),
            };

            const res = await fetch(`${API_BASE}/api/series/${seriesId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error("Failed to update series");

            router.refresh();
            handleClose();
        } catch (error) {
            console.error(error);
            alert("Failed to update series settings");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSuccess = () => {
        setDeleteDialogOpen(false);
        router.push("/");
    };

    return {
        state: {
            open, loading, deleteDialogOpen,
            title, description, imageUrl, hours, time, duration, updateFutureGames,
            fields, selectedField, newFieldMode, newField,
            seriesType, initialDayOfWeek,
        },
        actions: {
            setTitle, setDescription, setImageUrl, setHours, setTime, setDuration, setUpdateFutureGames,
            setSelectedField, setNewFieldMode, setNewField, setDeleteDialogOpen,
            handleOpen, handleClose, handleSave, handleDeleteSuccess,
        },
    };
}
