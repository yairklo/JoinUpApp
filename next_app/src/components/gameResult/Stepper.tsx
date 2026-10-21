"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";

export interface StepperProps {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  /** Button size in px (44 score steppers, 36 compact). */
  size?: number;
  valueFontSize?: number;
  disabled?: boolean;
  /** Hold +/- to repeat (basketball). */
  repeat?: boolean;
  incLabel: string;
  decLabel: string;
  testIds: { inc: string; dec: string; value: string };
  /** Tap the value to type a number (big basketball scores). */
  editable?: boolean;
}

export default function Stepper({
  value, min = 0, max, onChange, size = 44, valueFontSize = 28, disabled, repeat, incLabel, decLabel, testIds, editable,
}: StepperProps) {
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const held = useRef(false);
  const latest = useRef(value);
  latest.current = value;

  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
    timer.current = interval.current = null;
  };
  useEffect(() => stop, []);

  const step = (d: number) => {
    const next = clamp(latest.current + d);
    latest.current = next;
    onChange(next);
  };
  const holdProps = (d: number) =>
    repeat
      ? {
          onPointerDown: () => {
            held.current = false;
            timer.current = setTimeout(() => {
              held.current = true;
              interval.current = setInterval(() => step(d), 80);
            }, 400);
          },
          onPointerUp: stop,
          onPointerLeave: stop,
          onPointerCancel: stop,
        }
      : {};
  const click = (d: number) => () => {
    if (held.current) {
      held.current = false;
      return;
    }
    step(d);
  };

  const btnSx = { width: size, height: size, border: "1px solid", borderColor: "divider" } as const;
  return (
    <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
      <IconButton aria-label={decLabel} disabled={disabled || value <= min} onClick={click(-1)} data-testid={testIds.dec} sx={btnSx} {...holdProps(-1)}>
        <RemoveRoundedIcon />
      </IconButton>
      <Box sx={{ minWidth: 56, textAlign: "center" }}>
        {typing ? (
          <InputBase
            autoFocus
            type="number"
            value={value}
            onChange={(e) => onChange(clamp(parseInt(e.target.value || "0", 10) || 0))}
            onBlur={() => setTyping(false)}
            onKeyDown={(e) => e.key === "Enter" && setTyping(false)}
            inputProps={{ inputMode: "numeric", min, max, "aria-label": incLabel, style: { textAlign: "center" } }}
            sx={{ width: 64, fontSize: valueFontSize, fontWeight: 800 }}
          />
        ) : (
          <Box
            component="span"
            role={editable ? "button" : undefined}
            tabIndex={editable && !disabled ? 0 : undefined}
            aria-live="polite"
            data-testid={testIds.value}
            onClick={() => editable && !disabled && setTyping(true)}
            onKeyDown={(e: React.KeyboardEvent) => editable && !disabled && e.key === "Enter" && setTyping(true)}
            sx={{ fontSize: valueFontSize, fontWeight: 800, fontVariantNumeric: "tabular-nums", cursor: editable ? "text" : "default" }}
          >
            {value}
          </Box>
        )}
      </Box>
      <IconButton aria-label={incLabel} disabled={disabled || value >= max} onClick={click(1)} data-testid={testIds.inc} sx={btnSx} {...holdProps(1)}>
        <AddRoundedIcon />
      </IconButton>
    </Stack>
  );
}
