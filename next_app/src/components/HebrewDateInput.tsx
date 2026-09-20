"use client";

import { useRef } from "react";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import InputAdornment from "@mui/material/InputAdornment";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { formatHebrewDate } from "@/utils/hebrewDate";

type Props = {
  /** ISO `YYYY-MM-DD`, or "" for no date. */
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  min?: string;
  max?: string;
};

/**
 * Date field that always *shows* a Hebrew date.
 *
 * A native `<input type="date">` renders its placeholder/segments (`mm/dd/yyyy`) from the
 * browser's UI language and ignores `lang`, so in an English Chrome the Hebrew UI showed
 * `mm/dd/yyyy`. Here the visible text is a read-only field formatted via `formatHebrewDate`,
 * and a transparent native date input sits on top of it to open the platform picker.
 */
export default function HebrewDateInput({ value, onChange, label = "תאריך", min, max }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    try {
      inputRef.current?.showPicker?.();
    } catch {
      // showPicker throws when not allowed in this context; the click already focused the input.
    }
  };

  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      <TextField
        value={value ? formatHebrewDate(value) : ""}
        placeholder="בחר תאריך"
        label={label}
        size="small"
        fullWidth
        slotProps={{
          inputLabel: { shrink: true },
          input: {
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <CalendarMonthIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          },
          htmlInput: { tabIndex: -1, "aria-hidden": true },
        }}
      />
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onClick={openPicker}
        aria-label={label}
        lang="he-IL"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
          border: 0,
          padding: 0,
        }}
      />
    </Box>
  );
}
