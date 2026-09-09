import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { fieldsApi, gamesApi } from '@/services/api';
import { formatJerusalemDate, parseJerusalemTimeToUTC } from '@/utils/timezone';

export type FieldOption = { id: string; name: string; location?: string | null; inputValue?: string };

export function useGameCreator(initialFieldId?: string, onCreated?: (fieldId: string) => void) {
    const { getToken, isSignedIn } = useAuth();
    const router = useRouter();

    // Form States
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Field State
    const [fields, setFields] = useState<FieldOption[]>([]);
    const [selectedField, setSelectedField] = useState<FieldOption | null>(null);
    const [newFieldMode, setNewFieldMode] = useState(false);
    const [newField, setNewField] = useState<{ name: string; location: string; type: "open" | "closed" }>({
        name: "",
        location: "",
        type: "open",
    });

    const [form, setForm] = useState({
        date: "",
        time: "",
        title: "",
        duration: 1,
        maxPlayers: 10,
        description: "",
        isFriendsOnly: false,
        joinPolicy: "INSTANT" as "INSTANT" | "REQUIRES_APPROVAL",
        lotteryEnabled: false,
        organizerInLottery: false,
        lotteryDate: "",
        lotteryTime: "",
        futureRegistration: false,
        futureRegDate: "",
        futureRegTime: "",
        pickDrawDate: "",
        pickDrawTime: "",
        pickingStartDate: "",
        pickingStartTime: "",
    });

    // Time Helpers
    const today = new Date();
    // Jerusalem calendar date, not UTC -- see games/new/page.tsx's todayStr for why.
    const todayStr = formatJerusalemDate(today);

    function roundUpToNextQuarter(d: Date) {
        const t = new Date(d.getTime());
        t.setSeconds(0, 0);
        const minutes = t.getMinutes();
        const add = (15 - (minutes % 15)) % 15;
        if (add > 0) t.setMinutes(minutes + add);
        const h = String(t.getHours()).padStart(2, "0");
        const m = String(t.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    }
    const nextQuarterTimeStr = useMemo(() => roundUpToNextQuarter(today), []);

    // 1. Fetch Fields
    useEffect(() => {
        let ignore = false;
        async function fetchFields() {
            try {
                const arr = await fieldsApi.getAll();
                if (!ignore) setFields(arr || []);

                if (initialFieldId && !ignore && arr) {
                    const found = arr.find(f => f.id === initialFieldId);
                    if (found) setSelectedField(found);
                }
            } catch { }
        }
        fetchFields();
        return () => { ignore = true; };
    }, [initialFieldId]);

    // 2. Auto-set time
    useEffect(() => {
        if (form.date === todayStr) {
            if (!form.time || form.time < nextQuarterTimeStr) {
                setForm((prev) => ({ ...prev, time: nextQuarterTimeStr }));
            }
        }
    }, [form.date, nextQuarterTimeStr, todayStr]);

    const canSubmit = useMemo(() => {
        const hasField = !!selectedField?.id || (newFieldMode && newField.name.trim() && newField.location.trim());
        return Boolean(isSignedIn && hasField && form.date && form.time && form.maxPlayers);
    }, [isSignedIn, selectedField, newFieldMode, newField, form.date, form.time, form.maxPlayers]);

    const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setSubmitting(true);

        try {
            const token = await getToken({ template: undefined }).catch(() => "");
            if (!token) throw new Error("Not authenticated");

            const fieldIdToUse = selectedField?.id || "";

            if (form.lotteryEnabled) {
                if (!form.lotteryDate || !form.lotteryTime) throw new Error("יש לבחור תאריך ושעת הגרלה");
                const startTs = parseJerusalemTimeToUTC(form.date, form.time).getTime();
                const lotteryTs = parseJerusalemTimeToUTC(form.lotteryDate, form.lotteryTime).getTime();
                if (lotteryTs >= startTs) throw new Error("שעת ההגרלה חייבת להיות לפני תחילת המשחק");
            }

            // Every date+time pair here is Jerusalem-local wall-clock input, so it's converted to a
            // real UTC instant client-side (via parseJerusalemTimeToUTC) before being sent -- sending
            // the raw "YYYY-MM-DDTHH:MM:00" string instead would leave the server to parse it with
            // `new Date(...)`, which uses the server process's own timezone, not Jerusalem's.
            const pickDrawAt =
                form.pickDrawDate && form.pickDrawTime
                    ? parseJerusalemTimeToUTC(form.pickDrawDate, form.pickDrawTime).toISOString()
                    : undefined;
            const pickingStartsAt =
                form.pickingStartDate && form.pickingStartTime
                    ? parseJerusalemTimeToUTC(form.pickingStartDate, form.pickingStartTime).toISOString()
                    : undefined;
            if (pickDrawAt && pickingStartsAt) {
                if (new Date(pickingStartsAt).getTime() < new Date(pickDrawAt).getTime()) {
                    throw new Error("תחילת הבחירה חייבת להיות בזמן ההגרלה או אחריה");
                }
            }

            const payload = {
                fieldId: fieldIdToUse,
                ...form,
                ...(newFieldMode
                    ? { newField: { name: newField.name.trim(), location: newField.location.trim(), type: newField.type } }
                    : {}),
                isOpenToJoin: !form.isFriendsOnly,
                title: form.title || null,
                lotteryAt: form.lotteryEnabled ? parseJerusalemTimeToUTC(form.lotteryDate, form.lotteryTime).toISOString() : undefined,
                pickDrawAt,
                pickingStartsAt,
            };

            const created = await gamesApi.create(payload, token);

            if (onCreated && created.fieldId) onCreated(created.fieldId);
            if (created.id) router.replace(`/games/${created.id}`);

        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "יצירת המשחק נכשלה");
        } finally {
            setSubmitting(false);
        }
    };

    return {
        state: {
            form,
            fields,
            selectedField,
            newField,
            newFieldMode,
            submitting,
            error,
            success,
            canSubmit,
            todayStr
        },
        actions: {
            update,
            submit,
            setSelectedField,
            setNewField,
            setNewFieldMode
        }
    };
}
