"use client";

import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import { moveItem } from "@/utils/tournamentManage";

export interface ReorderItem {
    id: string;
    content: ReactNode;
    /** Accessible name for the move buttons. */
    label: string;
}

export interface ReorderListProps {
    items: ReorderItem[];
    onChange: (ids: string[]) => void;
    disabled?: boolean;
    /** First number shown at the start of each row (seed 1, rank 3...). Default 1. */
    startAt?: number;
    testId?: string;
}

/** Reorderable list: drag handle on pointer devices plus 44px up/down buttons so drag is never the only way (spec 11.1). */
export default function ReorderList({ items, onChange, disabled, startAt = 1, testId = "reorder-list" }: ReorderListProps) {
    const [dragFrom, setDragFrom] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const ids = items.map((i) => i.id);
    const move = (from: number, to: number) => onChange(moveItem(ids, from, to));
    return (
        <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }} data-testid={testId}>
            {items.map((it, i) => (
                <Stack
                    key={it.id}
                    component="li"
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    draggable={!disabled}
                    onDragStart={(e: React.DragEvent) => {
                        setDragFrom(i);
                        e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e: React.DragEvent) => {
                        if (dragFrom === null) return;
                        e.preventDefault();
                        setOver(i);
                    }}
                    onDrop={(e: React.DragEvent) => {
                        e.preventDefault();
                        if (dragFrom !== null && dragFrom !== i) move(dragFrom, i);
                        setDragFrom(null);
                        setOver(null);
                    }}
                    onDragEnd={() => {
                        setDragFrom(null);
                        setOver(null);
                    }}
                    data-testid={`${testId}-item-${it.id}`}
                    sx={{
                        minHeight: 56,
                        px: 1,
                        borderBottom: 1,
                        borderColor: "divider",
                        bgcolor: over === i && dragFrom !== i ? "action.hover" : "transparent",
                        opacity: dragFrom === i ? 0.5 : 1,
                    }}
                >
                    <DragIndicatorRoundedIcon
                        fontSize="small"
                        aria-hidden
                        sx={{ color: "text.disabled", cursor: disabled ? "default" : "grab", display: { xs: "none", md: "block" } }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ width: 28, fontVariantNumeric: "tabular-nums" }}>
                        {startAt + i}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>{it.content}</Box>
                    <IconButton
                        aria-label={`הזזה למעלה: ${it.label}`}
                        disabled={disabled || i === 0}
                        onClick={() => move(i, i - 1)}
                        sx={{ width: 44, height: 44 }}
                        data-testid={`${testId}-up-${it.id}`}
                    >
                        <KeyboardArrowUpRoundedIcon />
                    </IconButton>
                    <IconButton
                        aria-label={`הזזה למטה: ${it.label}`}
                        disabled={disabled || i === items.length - 1}
                        onClick={() => move(i, i + 1)}
                        sx={{ width: 44, height: 44 }}
                        data-testid={`${testId}-down-${it.id}`}
                    >
                        <KeyboardArrowDownRoundedIcon />
                    </IconButton>
                </Stack>
            ))}
        </Box>
    );
}
