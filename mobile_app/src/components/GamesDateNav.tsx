import React, { useMemo } from "react";
import { View, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import FilterPill from "./FilterPill";

interface GamesDateNavProps {
    selectedDate: string;
    onSelectDate: (date: string) => void;
}

function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export default function GamesDateNav({ selectedDate, onSelectDate }: GamesDateNavProps) {
    const { t, i18n } = useTranslation();
    const dateLocale = i18n.language === "he" ? "he-IL" : "en-US";

    const getDayLabel = (d: Date, isToday: boolean, isTomorrow: boolean) => {
        if (isToday) return t("common.today", "Today");
        if (isTomorrow) return t("common.tomorrow", "Tomorrow");
        return d.toLocaleDateString(dateLocale, { weekday: "short", day: "numeric" });
    };

    const datesList = useMemo(() => {
        const arr = [];
        const now = new Date();
        for (let i = 0; i < 14; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() + i);
            arr.push(d);
        }
        return arr;
    }, []);

    return (
        <View className="py-2 bg-white">
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
            >
                {datesList.map((d, index) => {
                    const dateStr = ymd(d);
                    const isSelected = dateStr === selectedDate;
                    const label = getDayLabel(d, index === 0, index === 1);

                    return (
                        <FilterPill
                            key={dateStr}
                            label={label}
                            selected={isSelected}
                            onPress={() => onSelectDate(dateStr)}
                        />
                    );
                })}
            </ScrollView>
        </View>
    );
}
