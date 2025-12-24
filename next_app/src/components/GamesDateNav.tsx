"use client";
import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// MUI Imports
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import Tooltip from "@mui/material/Tooltip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";

// Helper date formatter
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDayLabel(d: Date, isToday: boolean, isTomorrow: boolean) {
  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";
  // Format: "Sun 24" or "יום א 24"
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

export default function GamesDateNav({
  selectedDate,
  fieldId,
  onSelectDate,
}: {
  selectedDate: string;
  fieldId?: string;
  onSelectDate?: (date: string) => void;
}) {
  const router = useRouter();
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Generate the next 14 days dynamically
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

  const todayStr = ymd(new Date());
  
  // Navigation Logic
  function handleDateChange(newDate: string) {
    if (onSelectDate) {
      onSelectDate(newDate);
      return;
    }
    const base = "/games"; // Or use current pathname if needed
    const url = new URL(base, window.location.origin);
    url.searchParams.set("date", newDate);
    if (fieldId) url.searchParams.set("fieldId", fieldId);
    router.push(url.pathname + url.search);
  }

  // Check if the selected date is within our 14-day list, otherwise false (to unselect tabs)
  const isSelectedInList = datesList.some(d => ymd(d) === selectedDate);
  const tabValue = isSelectedInList ? selectedDate : false;

  return (
    <Box 
      sx={{ 
        width: '100%', 
        bgcolor: 'background.paper', 
        borderBottom: 1, 
        borderColor: 'divider',
        position: 'sticky', // Optional: keeps it visible while scrolling games
        top: 0,
        zIndex: 10
      }}
    >
      <Stack direction="row" alignItems="center">
        
        {/* Scrollable Date Tabs */}
        <Tabs
          value={tabValue}
          onChange={(e, newVal) => handleDateChange(newVal)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="games date navigation"
          sx={{
            flexGrow: 1,
            '& .MuiTab-root': {
              minWidth: 70,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }
          }}
        >
          {datesList.map((d, index) => {
            const dateStr = ymd(d);
            const label = getDayLabel(d, index === 0, index === 1);
            return (
              <Tab 
                key={dateStr} 
                label={label} 
                value={dateStr} 
              />
            );
          })}
        </Tabs>

        <Divider orientation="vertical" flexItem />

        {/* Manual Date Picker Button (For dates far in future) */}
        <Box px={1}>
            <Tooltip title="Pick a specific date">
                <IconButton onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.focus()}>
                    <CalendarMonthIcon color={!isSelectedInList ? "primary" : "action"} />
                </IconButton>
            </Tooltip>
            
            {/* Hidden Input for the actual picker functionality */}
            <input
                ref={dateInputRef}
                type="date"
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, bottom: 0 }}
                min={todayStr}
                value={selectedDate}
                onChange={(e) => {
                    if (e.target.value) handleDateChange(e.target.value);
                }}
            />
        </Box>

      </Stack>
    </Box>
  );
}