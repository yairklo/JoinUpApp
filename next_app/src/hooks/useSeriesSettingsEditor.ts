import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { fieldsApi, seriesApi } from "@/services/api";
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
    initialMaxPlayers?: number | null;
    initialPrice?: number | null;
    initialSport?: string | null;
    initialIsFriendsOnly?: boolean | null;
    initialJoinPolicy?: "INSTANT" | "REQUIRES_APPROVAL" | null;
    initialLotteryEnabled?: boolean | null;
    initialOrganizerInLottery?: boolean | null;
    initialTeamSize?: number | null;
    initialWelcomeMessage?: string | null;
}

const MIN_MAX_PLAYERS = 2;

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
    initialMaxPlayers,
    initialPrice,
    initialSport,
    initialIsFriendsOnly,
    initialJoinPolicy,
    initialLotteryEnabled,
    initialOrganizerInLottery,
    initialTeamSize,
    initialWelcomeMessage,
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
    // null while the field is cleared mid-edit; handleSave refuses to submit it (server requires >= 2).
    const [maxPlayers, setMaxPlayers] = useState<number | null>(initialMaxPlayers || 10);
    const [price, setPrice] = useState<number | null>(initialPrice ?? null);
    const [sport, setSport] = useState<string>(initialSport || "SOCCER");
    const [isFriendsOnly, setIsFriendsOnly] = useState<boolean>(!!initialIsFriendsOnly);
    const [requiresApproval, setRequiresApproval] = useState<boolean>(initialJoinPolicy === "REQUIRES_APPROVAL");
    const [lotteryEnabled, setLotteryEnabled] = useState<boolean>(!!initialLotteryEnabled);
    const [organizerInLottery, setOrganizerInLottery] = useState<boolean>(!!initialOrganizerInLottery);
    const [teamSize, setTeamSize] = useState<number | null>(initialTeamSize ?? null);
    const [welcomeMessage, setWelcomeMessage] = useState<string>(initialWelcomeMessage || "");

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
        setMaxPlayers(initialMaxPlayers || 10);
        setPrice(initialPrice ?? null);
        setSport(initialSport || "SOCCER");
        setIsFriendsOnly(!!initialIsFriendsOnly);
        setRequiresApproval(initialJoinPolicy === "REQUIRES_APPROVAL");
        setLotteryEnabled(!!initialLotteryEnabled);
        setOrganizerInLottery(!!initialOrganizerInLottery);
        setTeamSize(initialTeamSize ?? null);
        setWelcomeMessage(initialWelcomeMessage || "");
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
        if (maxPlayers === null || !Number.isInteger(maxPlayers) || maxPlayers < MIN_MAX_PLAYERS) {
            alert(`כמות שחקנים מקסימלית חייבת להיות לפחות ${MIN_MAX_PLAYERS}`);
            return;
        }
        setLoading(true);
        try {
            const token = await getToken();

            // Only send group defaults the user actually changed: with "update future games" on, the
            // server writes every sent field onto all upcoming games, so resending untouched values
            // would overwrite per-game customizations.
            const changedGroupDefaults = () => {
                const changed: Record<string, unknown> = {};
                if (maxPlayers !== (initialMaxPlayers || 10)) changed.maxPlayers = maxPlayers;
                if ((price ?? 0) !== (initialPrice ?? 0)) changed.price = price ?? 0;
                if (sport !== (initialSport || "SOCCER")) changed.sport = sport;
                if (isFriendsOnly !== !!initialIsFriendsOnly) {
                    changed.isFriendsOnly = isFriendsOnly;
                    changed.isOpenToJoin = !isFriendsOnly;
                }
                if (requiresApproval !== (initialJoinPolicy === "REQUIRES_APPROVAL")) {
                    changed.joinPolicy = requiresApproval ? "REQUIRES_APPROVAL" : "INSTANT";
                }
                if (lotteryEnabled !== !!initialLotteryEnabled) changed.lotteryEnabled = lotteryEnabled;
                if (organizerInLottery !== !!initialOrganizerInLottery) changed.organizerInLottery = organizerInLottery;
                if (teamSize !== (initialTeamSize ?? null)) changed.teamSize = teamSize;
                if (welcomeMessage !== (initialWelcomeMessage || "")) changed.welcomeMessage = welcomeMessage;
                return changed;
            };

            const payload: Record<string, unknown> = {
                title: title || "",
                description: description || "",
                autoOpenRegistrationHours: hours === "" ? null : Number(hours),
                time,
                duration,
                updateFutureGames,
                ...changedGroupDefaults(),
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

    const uploadImage = async (file: File) => {
        const token = await getToken();
        if (!token) throw new Error("יש להתחבר מחדש");
        return seriesApi.uploadImage(seriesId, file, token);
    };

    const removeImage = async () => {
        const token = await getToken();
        if (!token) throw new Error("יש להתחבר מחדש");
        return seriesApi.removeImage(seriesId, token);
    };

    const handleImageUploaded = (url: string) => {
        setImageUrl(url);
        router.refresh();
    };

    const handleImageRemoved = () => {
        setImageUrl("");
        router.refresh();
    };

    return {
        state: {
            open, loading, deleteDialogOpen,
            title, description, imageUrl, hours, time, duration, updateFutureGames,
            maxPlayers, price, sport, isFriendsOnly, requiresApproval, lotteryEnabled, organizerInLottery, teamSize, welcomeMessage,
            fields, selectedField, newFieldMode, newField,
            seriesType, initialDayOfWeek,
        },
        actions: {
            setTitle, setDescription, setImageUrl, setHours, setTime, setDuration, setUpdateFutureGames,
            setMaxPlayers, setPrice, setSport, setIsFriendsOnly, setRequiresApproval, setLotteryEnabled, setOrganizerInLottery, setTeamSize, setWelcomeMessage,
            setSelectedField, setNewFieldMode, setNewField, setDeleteDialogOpen,
            handleOpen, handleClose, handleSave, handleDeleteSuccess,
            uploadImage, removeImage, handleImageUploaded, handleImageRemoved,
        },
    };
}
