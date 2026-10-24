import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { gamesApi, UpdateGameDTO, fieldsApi } from "@/services/api";
import type { FriendsOnlyLinkPolicy } from "@/types/game";
import type { FieldOption } from "@/hooks/useGameCreator";
import { toIsoDateInput } from "@/utils/hebrewDate";
import { formatJerusalemDate, formatJerusalemTime, parseJerusalemTimeToUTC } from "@/utils/timezone";

// Helper functions (moved from component)
// `iso` is a real UTC instant (registrationOpensAt/friendsOnlyUntil from the DB) -- these must
// read it back out via the Jerusalem formatters, not local Date getters, or the date/time shown
// in the edit form drifts by the server/browser's own timezone offset from what was actually set.
export function getIsoDatePart(iso: string | null | undefined) {
    if (!iso) return "";
    return formatJerusalemDate(iso);
}

export function getIsoTimePart(iso: string | null | undefined) {
    if (!iso) return "";
    return formatJerusalemTime(iso);
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
    initialFriendsOnlyLinkPolicy?: FriendsOnlyLinkPolicy;
    initialJoinPolicy?: 'INSTANT' | 'REQUIRES_APPROVAL';
    initialTitle?: string | null;
    initialTeamSize?: number | null;
    initialPrice?: number | null;
    initialDuration?: number;
    initialDescription?: string | null;
    initialWelcomeMessage?: string | null;
    /** Group games only: members-vs-guests overrides (see server utils/membersGuests.js). */
    isSeriesGame?: boolean;
    initialMembersOnlyPriority?: boolean | null;
    initialGuestRegistrationOpensAt?: string | null;
    initialGuestWelcomeMessage?: string | null;
    initialGuestDescription?: string | null;
    initialGuestPrice?: number | null;
    initialFieldId?: string | null;
    initialFieldName?: string | null;
    initialFieldLocation?: string | null;
    initialImageUrl?: string | null;
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
    initialFriendsOnlyLinkPolicy = 'REQUEST_TO_JOIN',
    initialJoinPolicy = 'INSTANT',
    initialTitle,
    initialTeamSize,
    initialPrice,
    initialDuration = 1,
    initialDescription,
    initialWelcomeMessage,
    isSeriesGame,
    initialMembersOnlyPriority,
    initialGuestRegistrationOpensAt,
    initialGuestWelcomeMessage,
    initialGuestDescription,
    initialGuestPrice,
    initialFieldId,
    initialFieldName,
    initialFieldLocation,
    initialImageUrl,
}: GameEditorProps) {
    const { getToken } = useAuth();
    const router = useRouter();

    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    // Form State
    const [time, setTime] = useState(initialTime);
    const [date, setDate] = useState(() => toIsoDateInput(initialDate));
    const [maxPlayers, setMaxPlayers] = useState(initialMaxPlayers);
    const [sport, setSport] = useState(initialSport);
    const [title, setTitle] = useState(initialTitle || "");
    const [teamSize, setTeamSize] = useState<number | null>(initialTeamSize ?? null);
    const [price, setPrice] = useState<number | null>(initialPrice ?? null);
    const [isFriendsOnly, setIsFriendsOnly] = useState(initialIsFriendsOnly);
    const [friendsOnlyLinkPolicy, setFriendsOnlyLinkPolicy] = useState<FriendsOnlyLinkPolicy>(initialFriendsOnlyLinkPolicy);
    const [requiresApproval, setRequiresApproval] = useState(initialJoinPolicy === 'REQUIRES_APPROVAL');
    const [duration, setDuration] = useState<number>(initialDuration);
    const [description, setDescription] = useState<string>(initialDescription || "");
    const [welcomeMessage, setWelcomeMessage] = useState<string>(initialWelcomeMessage || "");
    const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);

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

    // Guest registration window (members-only priority): guests open at their own date/time.
    const [membersOnlyPriority, setMembersOnlyPriority] = useState(!!initialMembersOnlyPriority);
    const [guestRegEnabled, setGuestRegEnabled] = useState(!!initialGuestRegistrationOpensAt);
    const [guestRegDate, setGuestRegDate] = useState(getIsoDatePart(initialGuestRegistrationOpensAt));
    const [guestRegTime, setGuestRegTime] = useState(getIsoTimePart(initialGuestRegistrationOpensAt));
    const [guestWelcomeMessage, setGuestWelcomeMessage] = useState<string>(initialGuestWelcomeMessage || "");
    const [guestDescription, setGuestDescription] = useState<string>(initialGuestDescription || "");
    const [guestPrice, setGuestPrice] = useState<number | null>(initialGuestPrice ?? null);

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
        // Must go through toIsoDateInput like the initial useState above -- setting the raw
        // `initialDate` directly can leave the native date input showing blank (it requires an
        // exact YYYY-MM-DD value) even though the Hebrew helper text below it still renders a
        // date, since formatHebrewDate normalizes internally.
        setDate(toIsoDateInput(initialDate));
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

        setMembersOnlyPriority(!!initialMembersOnlyPriority);
        setGuestRegEnabled(!!initialGuestRegistrationOpensAt);
        setGuestRegDate(getIsoDatePart(initialGuestRegistrationOpensAt));
        setGuestRegTime(getIsoTimePart(initialGuestRegistrationOpensAt));
        setGuestWelcomeMessage(initialGuestWelcomeMessage || "");
        setGuestDescription(initialGuestDescription || "");
        setGuestPrice(initialGuestPrice ?? null);

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
                registrationOpensAt = parseJerusalemTimeToUTC(regDate, regTime).toISOString();
            }

            let guestRegistrationOpensAt: string | null = null;
            if (guestRegEnabled && guestRegDate && guestRegTime) {
                guestRegistrationOpensAt = parseJerusalemTimeToUTC(guestRegDate, guestRegTime).toISOString();
            }
            if (isSeriesGame && membersOnlyPriority && guestRegistrationOpensAt && registrationOpensAt
                && new Date(guestRegistrationOpensAt) < new Date(registrationOpensAt)) {
                alert("פתיחת ההרשמה לאורחים חייבת להיות אחרי פתיחת ההרשמה לחברים (או באותו זמן)");
                setLoading(false);
                return false;
            }

            let friendsOnlyUntil = null;
            if (makePublicLater && publicDate && publicTime) {
                friendsOnlyUntil = parseJerusalemTimeToUTC(publicDate, publicTime).toISOString();
            }

            // date/time are Jerusalem-local wall-clock values typed into the edit form -- must go
            // through parseJerusalemTimeToUTC, not a bare `new Date(...)`, which the JS engine
            // interprets in whatever timezone it's running in (the visitor's browser).
            const start = parseJerusalemTimeToUTC(date, time).toISOString();

            const updateData: UpdateGameDTO & { start?: string } = {
                start,
                maxPlayers,
                sport,
                title,
                teamSize: teamSize || undefined,
                price,
                isFriendsOnly,
                friendsOnlyLinkPolicy,
                joinPolicy: requiresApproval ? 'REQUIRES_APPROVAL' : 'INSTANT',
                registrationOpensAt: futureRegEnabled ? registrationOpensAt : null,
                friendsOnlyUntil: (isFriendsOnly && makePublicLater) ? friendsOnlyUntil : null,
                duration,
                description,
                welcomeMessage,
                ...(isSeriesGame
                    ? {
                        membersOnlyPriority,
                        guestRegistrationOpensAt: membersOnlyPriority ? guestRegistrationOpensAt : null,
                        guestWelcomeMessage: guestWelcomeMessage || null,
                        guestDescription: guestDescription || null,
                        guestPrice,
                    }
                    : {}),
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

    // The image is saved immediately on upload/remove (like the series editor), independent of Save.
    const uploadImage = async (file: File) => {
        const token = await getToken();
        if (!token) throw new Error("יש להתחבר מחדש");
        return gamesApi.uploadImage(gameId, file, token);
    };
    const removeImage = async () => {
        const token = await getToken();
        if (!token) throw new Error("יש להתחבר מחדש");
        return gamesApi.removeImage(gameId, token);
    };
    const handleImageUploaded = (url: string) => { setImageUrl(url); router.refresh(); };
    const handleImageRemoved = () => { setImageUrl(null); router.refresh(); };

    return {
        state: {
            open, loading,
            time, date, maxPlayers, sport, title, teamSize, price, isFriendsOnly, friendsOnlyLinkPolicy, requiresApproval,
            futureRegEnabled, regDate, regTime,
            isSeriesGame: !!isSeriesGame,
            membersOnlyPriority, guestRegEnabled, guestRegDate, guestRegTime, guestWelcomeMessage, guestDescription, guestPrice,
            makePublicLater, publicDate, publicTime,
            duration, description, welcomeMessage, imageUrl,
            fields, selectedField, newFieldMode, newField,
        },
        actions: {
            setOpen, setTime, setDate, setMaxPlayers, setSport, setTitle, setTeamSize, setPrice, setIsFriendsOnly, setFriendsOnlyLinkPolicy, setRequiresApproval,
            setFutureRegEnabled, setRegDate, setRegTime,
            setMembersOnlyPriority, setGuestRegEnabled, setGuestRegDate, setGuestRegTime, setGuestWelcomeMessage, setGuestDescription, setGuestPrice,
            setMakePublicLater, setPublicDate, setPublicTime,
            setDuration, setDescription, setWelcomeMessage,
            setSelectedField, setNewFieldMode, setNewField,
            handleOpen, handleClose, saveGame, deleteGame,
            uploadImage, removeImage, handleImageUploaded, handleImageRemoved,
        }
    };
}
