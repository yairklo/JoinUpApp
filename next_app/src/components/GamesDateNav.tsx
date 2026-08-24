"use client";
import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

// MUI Imports
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import Tooltip from "@mui/material/Tooltip";
import Stack from "@mui/material/Stack";
import { styled, alpha } from "@mui/material/styles";

// Helper date formatter
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

// Styled Tab for "Pill" look
const StyledTab = styled(Tab)(({ theme }) => ({
  textTransform: "none",
  minWidth: 0,
  fontSize: "0.9rem",
  fontWeight: 700,
  color: theme.palette.text.secondary,
  borderRadius: 999,
  marginInlineEnd: theme.spacing(1),
  padding: "6px 16px",
  minHeight: 36,
  border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
  backgroundColor: alpha(theme.palette.text.primary, 0.03),
  transition: "all 0.15s ease",
  "&.Mui-selected": {
    color: theme.palette.primary.contrastText,
    backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
    borderColor: "transparent",
    boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
  },
  "&:hover:not(.Mui-selected)": {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
    borderColor: alpha(theme.palette.primary.main, 0.3),
    color: theme.palette.primary.main,
  },
}));

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

  function handleDateChange(newDate: string) {
    if (onSelectDate) {
      onSelectDate(newDate);
      return;
    }
    const base = "/games";
    const url = new URL(base, window.location.origin);
    url.searchParams.set("date", newDate);
    if (fieldId) url.searchParams.set("fieldId", fieldId);
    router.push(url.pathname + url.search);
  }

  const isSelectedInList = datesList.some((d) => ymd(d) === selectedDate);
  const tabValue = isSelectedInList ? selectedDate : false;

  return (
    <Box sx={{ width: "100%", py: 1 }}>
      <Stack direction="row" alignItems="center">
        <Tabs
          value={tabValue}
          onChange={(e, newVal) => handleDateChange(newVal)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="games date filters"
          // Hide the default underline indicator
          TabIndicatorProps={{ style: { display: "none" } }}
          sx={{
            flexGrow: 1,
            minHeight: 36, // Compact height
            "& .MuiTabs-scrollButtons": {
                width: 28,
            }
          }}
        >
          {datesList.map((d, index) => {
            const dateStr = ymd(d);
            const label = getDayLabel(d, index === 0, index === 1);
            return <StyledTab key={dateStr} label={label} value={dateStr} disableRipple />;
          })}
        </Tabs>

        <Box px={1} sx={{ borderInlineStart: "1px solid", borderColor: "divider", marginInlineStart: 1 }}>
          <Tooltip title="בחר תאריך">
            <IconButton 
                size="small"
                onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.focus()}
            >
              <CalendarMonthIcon fontSize="small" color={!isSelectedInList ? "primary" : "action"} />
            </IconButton>
          </Tooltip>

          <input
            ref={dateInputRef}
            type="date"
            style={{ position: "absolute", opacity: 0, width: 0, height: 0, bottom: 0 }}
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