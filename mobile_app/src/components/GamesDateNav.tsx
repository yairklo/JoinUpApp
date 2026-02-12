import React, { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";

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
                        <TouchableOpacity
                            key={dateStr}
                            onPress={() => onSelectDate(dateStr)}
                            className={`mr-3 px-5 py-2.5 rounded-full border ${isSelected
                                ? 'bg-blue-600 border-blue-600'
                                : 'bg-white border-gray-100'
                                }`}
                        >
                            <Text
                                className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-gray-500'
                                    }`}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}
