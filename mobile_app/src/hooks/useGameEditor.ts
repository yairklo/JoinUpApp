import { useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "./useRouter.adapter";
import { gamesApi, UpdateGameDTO } from "@/services/api";

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
    initialTitle?: string | null;
    initialTeamSize?: number | null;
    initialPrice?: number | null;
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
    initialTitle,
    initialTeamSize,
    initialPrice
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

    // Future Registration State
    const [futureRegEnabled, setFutureRegEnabled] = useState(!!initialRegistrationOpensAt);
    const [regDate, setRegDate] = useState(getIsoDatePart(initialRegistrationOpensAt));
    const [regTime, setRegTime] = useState(getIsoTimePart(initialRegistrationOpensAt));

    // Public Later State
    const [makePublicLater, setMakePublicLater] = useState(!!initialFriendsOnlyUntil);
    const [publicDate, setPublicDate] = useState(getIsoDatePart(initialFriendsOnlyUntil));
    const [publicTime, setPublicTime] = useState(getIsoTimePart(initialFriendsOnlyUntil));

    const resetForm = () => {
        setTime(initialTime);
        setDate(initialDate);
        setMaxPlayers(initialMaxPlayers);
        setSport(initialSport || "SOCCER");
        setTitle(initialTitle || "");
        setTeamSize(initialTeamSize ?? null);
        setPrice(initialPrice ?? null);
        setIsFriendsOnly(initialIsFriendsOnly);

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

            const updateData: UpdateGameDTO = {
                time,
                date,
                maxPlayers,
                sport,
                title,
                teamSize,
                price,
                isFriendsOnly,
                registrationOpensAt: futureRegEnabled ? registrationOpensAt : null,
                friendsOnlyUntil: (isFriendsOnly && makePublicLater) ? friendsOnlyUntil : null
            };

            await gamesApi.update(gameId, updateData, token);

            router.refresh();
            handleClose();
            return true;
        } catch (error) {
            console.error(error);
            alert("Failed to update game details");
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteGame = async () => {
        if (!confirm("Are you sure you want to delete this game? This action cannot be undone.")) return;
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) throw new Error("Not authenticated");

            await gamesApi.delete(gameId, token);
            router.push("/");
        } catch (error) {
            console.error(error);
            alert("Failed to delete game");
        } finally {
            setLoading(false);
        }
    };

    return {
        state: {
            open, loading,
            time, date, maxPlayers, sport, title, teamSize, price, isFriendsOnly,
            futureRegEnabled, regDate, regTime,
            makePublicLater, publicDate, publicTime
        },
        actions: {
            setOpen, setTime, setDate, setMaxPlayers, setSport, setTitle, setTeamSize, setPrice, setIsFriendsOnly,
            setFutureRegEnabled, setRegDate, setRegTime,
            setMakePublicLater, setPublicDate, setPublicTime,
            handleOpen, handleClose, saveGame, deleteGame
        }
    };
}
