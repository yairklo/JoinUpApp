"use client";

import { useRef } from "react";
import Box from "@mui/material/Box";
import TextField, { TextFieldProps } from "@mui/material/TextField";
import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import { formatHebrewDateShort } from "@/utils/hebrewDate";

type BaseProps = {
  label?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fullWidth?: boolean;
  size?: TextFieldProps["size"];
  min?: string;
  error?: boolean;
  helperText?: React.ReactNode;
  disabled?: boolean;
};

const FIELD_HEIGHT = { small: 40, medium: 56 } as const;

/**
 * Native <input type="date"|"time"> render mm/dd/yyyy and AM/PM on many browsers/OSes no matter
 * what `lang`/locale hint is set -- there's no reliable cross-browser way to force a Hebrew
 * dd.mm.yyyy / 24h display through attributes or CSS alone (see BUG-A3/BUG-1 in the UX audit).
 * This keeps the real native input mounted underneath (so the platform's own picker UI and
 * keyboard/segment editing still work exactly as before, and the stored value stays the same
 * ISO string `parseJerusalemTimeToUTC` already expects) but paints its value ourselves in Hebrew
 * format on top, masking the native text instead of trying to reformat it.
 */
function HebrewNativeField({
  type,
  icon,
  displayValue,
  placeholder,
  label,
  value,
  onChange,
  fullWidth,
  size = "medium",
  min,
  error,
  helperText,
  disabled,
}: BaseProps & {
  type: "date" | "time";
  icon: React.ReactNode;
  displayValue: string;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      // Not supported everywhere (notably older Safari) -- a plain focus() still leaves a real,
      // if invisible, native input that most browsers open a picker for on the next interaction.
      (el as unknown as { showPicker?: () => void }).showPicker?.();
    } catch {
      /* picker may already be open, or unsupported -- ignore */
    }
  };

  return (
    <Box sx={{ position: "relative", width: fullWidth ? "100%" : undefined }}>
      <TextField
        inputRef={inputRef}
        type={type}
        label={label}
        fullWidth={fullWidth}
        size={size}
        value={value}
        onChange={onChange}
        onClick={openPicker}
        disabled={disabled}
        error={error}
        helperText={helperText}
        InputLabelProps={{ shrink: true }}
        slotProps={{ htmlInput: { min, lang: "he-IL" } }}
        sx={{
          "& input": {
            position: "relative",
            zIndex: 1,
            color: "transparent",
            caretColor: "transparent",
            cursor: disabled ? "default" : "pointer",
          },
          "& input::-webkit-calendar-picker-indicator": { opacity: 0, cursor: "pointer" },
          // Chrome renders the currently-focused date/time segment (e.g. the day you're
          // actively typing into) with its own highlight text color that ignores the input's
          // `color`, so it can briefly show a native-format digit while editing -- these force
          // every segment transparent too, focused or not.
          "& input::-webkit-datetime-edit-fields-wrapper, & input::-webkit-datetime-edit-text, & input::-webkit-datetime-edit-day-field, & input::-webkit-datetime-edit-month-field, & input::-webkit-datetime-edit-year-field, & input::-webkit-datetime-edit-hour-field, & input::-webkit-datetime-edit-minute-field, & input::-webkit-datetime-edit-second-field, & input::-webkit-datetime-edit-ampm-field":
            { color: "transparent" },
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          insetInlineStart: 14,
          insetInlineEnd: 36,
          top: 0,
          height: FIELD_HEIGHT[size === "small" ? "small" : "medium"],
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          pointerEvents: "none",
          color: disabled ? "text.disabled" : value ? "text.primary" : "text.secondary",
          fontSize: size === "small" ? "0.875rem" : "1rem",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {icon}
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {value ? displayValue : placeholder}
        </Box>
      </Box>
    </Box>
  );
}

export function HebrewDateField(props: BaseProps) {
  return (
    <HebrewNativeField
      {...props}
      type="date"
      icon={<CalendarTodayRoundedIcon sx={{ fontSize: 18, opacity: 0.6 }} />}
      displayValue={formatHebrewDateShort(props.value)}
      placeholder="בחר תאריך"
    />
  );
}

export function HebrewTimeField(props: BaseProps) {
  return (
    <HebrewNativeField
      {...props}
      type="time"
      icon={<AccessTimeRoundedIcon sx={{ fontSize: 18, opacity: 0.6 }} />}
      // <input type="time">'s value is always locale-independent 24h "HH:MM" per the HTML spec,
      // so it's already exactly the display format we want -- no conversion needed.
      displayValue={props.value}
      placeholder="בחר שעה"
    />
  );
}
