import { useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from './useRouter.adapter';
import { seriesApi } from '@/services/api';

interface UseSeriesLogicProps {
    gameId: string;
    seriesId: string | null;
    initialTime: string;
}

export function useSeriesLogic({ gameId, seriesId, initialTime }: UseSeriesLogicProps) {
    const { getToken } = useAuth();
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [subLoading, setSubLoading] = useState(false);

    // Create Series State
    const [tabValue, setTabValue] = useState(0);
    const [customDates, setCustomDates] = useState<string[]>([]);
    const [tempDate, setTempDate] = useState("");

    // Manage Series State
    const [editData, setEditData] = useState({
        time: initialTime,
        updateFutureGames: true,
    });
    const [isSubscribed, setIsSubscribed] = useState(false); // Note: Initial state is naive. Ideally fetch from API.

    const handleMakeRecurring = async () => {
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;

            const type = tabValue === 0 ? "WEEKLY" : "CUSTOM";
            const payload = {
                type: type as "WEEKLY" | "CUSTOM",
                dates: type === "CUSTOM" ? customDates : undefined,
            };

            const data = await seriesApi.createRecurrence(gameId, payload, token);
            const newSeriesId = data.seriesId || data.series?.id;

            if (newSeriesId) {
                router.push(`/series/${newSeriesId}`);
            } else {
                router.refresh();
            }
            setOpen(false);
        } catch (error) {
            console.error(error);
            alert("Error creating series");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSeries = async () => {
        if (!seriesId) return;
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;

            await seriesApi.update(seriesId, editData, token);

            alert("Series updated successfully!");
            router.refresh();
            setOpen(false);
        } catch (err) {
            console.error(err);
            alert("Update failed");
        } finally {
            setLoading(false);
        }
    };

    const handleToggleSubscribe = async () => {
        if (!seriesId) return;
        setSubLoading(true);
        try {
            const token = await getToken();
            if (!token) return;

            await seriesApi.toggleSubscribe(seriesId, isSubscribed, token);
            setIsSubscribed(!isSubscribed);
            router.refresh();
        } catch (err) {
            console.error(err);
        } finally {
            setSubLoading(false);
        }
    };

    const addCustomDate = () => {
        if (!tempDate) return;
        if (customDates.includes(tempDate)) return;
        setCustomDates([...customDates, tempDate]);
        setTempDate("");
    };

    const removeCustomDate = (dateToRemove: string) => {
        setCustomDates(customDates.filter(d => d !== dateToRemove));
    };

    return {
        state: {
            open,
            deleteDialogOpen,
            loading,
            subLoading,
            tabValue,
            customDates,
            tempDate,
            editData,
            isSubscribed
        },
        actions: {
            setOpen,
            setDeleteDialogOpen,
            setTabValue,
            setTempDate,
            setEditData,
            handleMakeRecurring,
            handleUpdateSeries,
            handleToggleSubscribe,
            addCustomDate,
            removeCustomDate,
            handleDeleteSeriesSuccess: () => router.push("/")
        }
    };
}
