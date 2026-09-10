import React, { useMemo } from "react";
import { View, ScrollView } from "react-native";
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

function getDayLabel(d: Date, isToday: boolean, isTomorrow: boolean) {
    if (isToday) return "היום";
    if (isTomorrow) return "מחר";
    return d.toLocaleDateString("he-IL", { weekday: "short", day: "numeric" });
}

export default function GamesDateNav({ selectedDate, onSelectDate }: GamesDateNavProps) {
    const datesList = useMemo(() => {
        const arr = [];
        const t = new Date();
        for (let i = 0; i < 14; i++) {
            const d = new Date(t);
            d.setDate(t.getDate() + i);
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
