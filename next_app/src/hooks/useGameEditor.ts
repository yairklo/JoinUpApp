import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { gamesApi, UpdateGameDTO, fieldsApi } from "@/services/api";
import type { FieldOption } from "@/hooks/useGameCreator";

// Helper functions (moved from component)
export function getIsoDatePart(iso: string | null | undefined) {
    if (!iso) return "";
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getIsoTimePart(iso: string | null | undefined) {
    if (!iso) return "";
    const d = new Date(iso);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

export interface GameEditorProps {
    gameId: string;
    initialTime: string;
    initialDate: string;
    initialMaxPlayers: number;
    initialSport?: string;
    initialRegistrationOpensAt?: string | null;
    initialFriendsOnlyUntil?: string | null;
    initialIsFriendsOnly: boolean;
    initialJoinPolicy?: 'INSTANT' | 'REQUIRES_APPROVAL';
    initialTitle?: string | null;
    initialTeamSize?: number | null;
    initialPrice?: number | null;
    initialDuration?: number;
    initialDescription?: string | null;
    initialWelcomeMessage?: string | null;
    initialFieldId?: string | null;
    initialFieldName?: string | null;
    initialFieldLocation?: string | null;
}

export function useGameEditor({
    gameId,
    initialTime,
    initialDate,
    initialMaxPlayers,
    initialSport = "SOCCER",
    initialRegistrationOpensAt,
    initialFriendsOnlyUntil,
    initialIsFriendsOnly,
    initialJoinPolicy = 'INSTANT',
    initialTitle,
    initialTeamSize,
    initialPrice,
    initialDuration = 1,
    initialDescription,
    initialWelcomeMessage,
    initialFieldId,
    initialFieldName,
    initialFieldLocation,
}: GameEditorProps) {
    const { getToken } = useAuth();
    const router = useRouter();

    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    // Form State
    const [time, setTime] = useState(initialTime);
    const [date, setDate] = useState(initialDate);
    const [maxPlayers, setMaxPlayers] = useState(initialMaxPlayers);
    const [sport, setSport] = useState(initialSport);
    const [title, setTitle] = useState(initialTitle || "");
    const [teamSize, setTeamSize] = useState<number | null>(initialTeamSize ?? null);
    const [price, setPrice] = useState<number | null>(initialPrice ?? null);
    const [isFriendsOnly, setIsFriendsOnly] = useState(initialIsFriendsOnly);
    const [requiresApproval, setRequiresApproval] = useState(initialJoinPolicy === 'REQUIRES_APPROVAL');
    const [duration, setDuration] = useState<number>(initialDuration);
    const [description, setDescription] = useState<string>(initialDescription || "");
    const [welcomeMessage, setWelcomeMessage] = useState<string>(initialWelcomeMessage || "");

    // Field / venue state (same mechanism as create game)
    const [fields, setFields] = useState<FieldOption[]>([]);
    const [selectedField, setSelectedField] = useState<FieldOption | null>(
        initialFieldId
            ? { id: initialFieldId, name: initialFieldName || "", location: initialFieldLocation || "" }
            : null
    );
    const [newFieldMode, setNewFieldMode] = useState(false);
    const [newField, setNewField] = useState<{ name: string; location: string; type: "open" | "closed" }>({
        name: "",
        location: "",
        type: "open",
    });

    // Future Registration State
    const [futureRegEnabled, setFutureRegEnabled] = useState(!!initialRegistrationOpensAt);
    const [regDate, setRegDate] = useState(getIsoDatePart(initialRegistrationOpensAt));
    const [regTime, setRegTime] = useState(getIsoTimePart(initialRegistrationOpensAt));

    // Public Later State
    const [makePublicLater, setMakePublicLater] = useState(!!initialFriendsOnlyUntil);
    const [publicDate, setPublicDate] = useState(getIsoDatePart(initialFriendsOnlyUntil));
    const [publicTime, setPublicTime] = useState(getIsoTimePart(initialFriendsOnlyUntil));

    useEffect(() => {
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
                // Ensure current game field is selectable even if unlisted/custom
                if (initialFieldId && !options.some((f) => f.id === initialFieldId)) {
                    options.unshift({
                        id: initialFieldId,
                        name: initialFieldName || "מגרש נוכחי",
                        location: initialFieldLocation || "",
                    });
                }
                setFields(options);
                if (initialFieldId) {
                    const found = options.find((f) => f.id === initialFieldId);
                    if (found) setSelectedField(found);
                }
            } catch {
                // keep initial selection if fetch fails
            }
        }
        fetchFields();
        return () => { ignore = true; };
    }, [initialFieldId, initialFieldName, initialFieldLocation]);

    const resetForm = () => {
        setTime(initialTime);
        setDate(initialDate);
        setMaxPlayers(initialMaxPlayers);
        setSport(initialSport || "SOCCER");
        setTitle(initialTitle || "");
        setTeamSize(initialTeamSize ?? null);
        setPrice(initialPrice ?? null);
        setIsFriendsOnly(initialIsFriendsOnly);
        setRequiresApproval(initialJoinPolicy === 'REQUIRES_APPROVAL');
        setDuration(initialDuration);
        setDescription(initialDescription || "");
        setWelcomeMessage(initialWelcomeMessage || "");
        setNewFieldMode(false);
        setNewField({ name: "", location: "", type: "open" });
        if (initialFieldId) {
            const found = fields.find((f) => f.id === initialFieldId);
            setSelectedField(
                found || {
                    id: initialFieldId,
                    name: initialFieldName || "",
                    location: initialFieldLocation || "",
                }
            );
        } else {
            setSelectedField(null);
        }

        setFutureRegEnabled(!!initialRegistrationOpensAt);
        if (initialRegistrationOpensAt) {
            setRegDate(getIsoDatePart(initialRegistrationOpensAt));
            setRegTime(getIsoTimePart(initialRegistrationOpensAt));
        } else {
            setRegTime("");
        }

        setMakePublicLater(!!initialFriendsOnlyUntil);
        if (initialFriendsOnlyUntil) {
            setPublicDate(getIsoDatePart(initialFriendsOnlyUntil));
            setPublicTime(getIsoTimePart(initialFriendsOnlyUntil));
        } else {
            setPublicDate("");
            setPublicTime("");
        }
    };

    const handleOpen = () => {
        resetForm();
        setOpen(true);
    };

    const handleClose = () => setOpen(false);

    const saveGame = async () => {
        const hasField =
            !!selectedField?.id ||
            (newFieldMode && newField.name.trim() && newField.location.trim());
        if (!hasField) {
            alert("יש לבחור מגרש או להוסיף מגרש חדש");
            return false;
        }

        setLoading(true);
        try {
            const token = await getToken();
            if (!token) throw new Error("Not authenticated");

            let registrationOpensAt = null;
            if (futureRegEnabled && regDate && regTime) {
                registrationOpensAt = new Date(`${regDate}T${regTime}:00`).toISOString();
            }

            let friendsOnlyUntil = null;
            if (makePublicLater && publicDate && publicTime) {
                friendsOnlyUntil = new Date(`${publicDate}T${publicTime}:00`).toISOString();
            }

            const start = new Date(`${date}T${time}:00`).toISOString();

            const updateData: UpdateGameDTO & { start?: string } = {
                start,
                maxPlayers,
                sport,
                title,
                teamSize: teamSize || undefined,
                price,
                isFriendsOnly,
                joinPolicy: requiresApproval ? 'REQUIRES_APPROVAL' : 'INSTANT',
                registrationOpensAt: futureRegEnabled ? registrationOpensAt : null,
                friendsOnlyUntil: (isFriendsOnly && makePublicLater) ? friendsOnlyUntil : null,
                duration,
                description,
                welcomeMessage,
                ...(newFieldMode
                    ? {
                        fieldId: "",
                        newField: {
                            name: newField.name.trim(),
                            location: newField.location.trim(),
                            type: newField.type,
                        },
                    }
                    : { fieldId: selectedField!.id }),
            };

            await gamesApi.update(gameId, updateData, token);

            router.refresh();
            handleClose();
            return true;
        } catch (error) {
            console.error(error);
            alert("עדכון פרטי המשחק נכשל");
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteGame = async () => {
        if (!confirm("האם אתה בטוח שברצונך למחוק את המשחק? לא ניתן לבטל פעולה זו.")) return;
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) throw new Error("Not authenticated");

            await gamesApi.delete(gameId, token);
            router.push("/");
        } catch (error) {
            console.error(error);
            alert("מחיקת המשחק נכשלה");
        } finally {
            setLoading(false);
        }
    };

    return {
        state: {
            open, loading,
            time, date, maxPlayers, sport, title, teamSize, price, isFriendsOnly, requiresApproval,
            futureRegEnabled, regDate, regTime,
            makePublicLater, publicDate, publicTime,
            duration, description, welcomeMessage,
            fields, selectedField, newFieldMode, newField,
        },
        actions: {
            setOpen, setTime, setDate, setMaxPlayers, setSport, setTitle, setTeamSize, setPrice, setIsFriendsOnly, setRequiresApproval,
            setFutureRegEnabled, setRegDate, setRegTime,
            setMakePublicLater, setPublicDate, setPublicTime,
            setDuration, setDescription, setWelcomeMessage,
            setSelectedField, setNewFieldMode, setNewField,
            handleOpen, handleClose, saveGame, deleteGame
        }
    };
}
