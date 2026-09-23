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
    /** Fixed weekly registration-open rule (Asia/Jerusalem), 0=Sunday..6=Saturday + "HH:MM". */
    initialRegOpenDay?: number | null;
    initialRegOpenTime?: string | null;
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

/**
 * How a group's games open for registration: a fixed weekday + time (the default, e.g. "every
 * Sunday at 18:00"), the legacy relative "N hours before the game", or no scheduled opening.
 */
export type RegistrationOpenMode = "weekly" | "hours" | "none";

const DEFAULT_REG_OPEN_TIME = "18:00";

function initialRegMode(day: number | null | undefined, time: string | null | undefined, hours: number | null | undefined): RegistrationOpenMode {
    if (day !== null && day !== undefined && time) return "weekly";
    if (hours) return "hours";
    return "none";
}

// Default suggestion when switching a group to the weekday rule: the day after the game day
// (e.g. Saturday game -> registration for the next one opens Sunday).
function defaultRegOpenDay(gameDay: number | null | undefined): number {
    return gameDay !== null && gameDay !== undefined ? (gameDay + 1) % 7 : 0;
}

export function useSeriesSettingsEditor({
    seriesId,
    seriesType,
    initialTitle,
    initialDescription,
    initialImageUrl,
    initialAutoOpenHours,
    initialRegOpenDay,
    initialRegOpenTime,
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
    const [regMode, setRegMode] = useState<RegistrationOpenMode>(() =>
        initialRegMode(initialRegOpenDay, initialRegOpenTime, initialAutoOpenHours)
    );
    const [regDay, setRegDay] = useState<number>(initialRegOpenDay ?? defaultRegOpenDay(initialDayOfWeek));
    const [regTime, setRegTime] = useState<string>(initialRegOpenTime || DEFAULT_REG_OPEN_TIME);
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
        setRegMode(initialRegMode(initialRegOpenDay, initialRegOpenTime, initialAutoOpenHours));
        setRegDay(initialRegOpenDay ?? defaultRegOpenDay(initialDayOfWeek));
        setRegTime(initialRegOpenTime || DEFAULT_REG_OPEN_TIME);
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
        if (regMode === "weekly" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(regTime)) {
            alert("יש לבחור שעה לפתיחת ההרשמה");
            return;
        }
        if (regMode === "hours" && !(Number(hours) > 0)) {
            alert("יש להזין מספר שעות חיובי לפתיחת ההרשמה");
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

            // Registration opening: send exactly one mode, and only when it changed -- the server
            // rewrites registrationOpensAt on every future game whenever these fields are sent.
            const registrationRule = (): Record<string, unknown> => {
                const initialMode = initialRegMode(initialRegOpenDay, initialRegOpenTime, initialAutoOpenHours);
                if (regMode === "weekly") {
                    if (initialMode === "weekly" && regDay === initialRegOpenDay && regTime === initialRegOpenTime) return {};
                    return { registrationOpenDayOfWeek: regDay, registrationOpenTime: regTime, autoOpenRegistrationHours: null };
                }
                if (regMode === "hours") {
                    if (initialMode === "hours" && Number(hours) === initialAutoOpenHours) return {};
                    return { autoOpenRegistrationHours: Number(hours), registrationOpenDayOfWeek: null, registrationOpenTime: null };
                }
                if (initialMode === "none") return {};
                return { autoOpenRegistrationHours: null, registrationOpenDayOfWeek: null, registrationOpenTime: null };
            };

            const payload: Record<string, unknown> = {
                title: title || "",
                description: description || "",
                ...registrationRule(),
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
            title, description, imageUrl, hours, regMode, regDay, regTime, time, duration, updateFutureGames,
            maxPlayers, price, sport, isFriendsOnly, requiresApproval, lotteryEnabled, organizerInLottery, teamSize, welcomeMessage,
            fields, selectedField, newFieldMode, newField,
            seriesType, initialDayOfWeek,
        },
        actions: {
            setTitle, setDescription, setImageUrl, setHours, setRegMode, setRegDay, setRegTime, setTime, setDuration, setUpdateFutureGames,
            setMaxPlayers, setPrice, setSport, setIsFriendsOnly, setRequiresApproval, setLotteryEnabled, setOrganizerInLottery, setTeamSize, setWelcomeMessage,
            setSelectedField, setNewFieldMode, setNewField, setDeleteDialogOpen,
            handleOpen, handleClose, handleSave, handleDeleteSuccess,
            uploadImage, removeImage, handleImageUploaded, handleImageRemoved,
        },
    };
}
