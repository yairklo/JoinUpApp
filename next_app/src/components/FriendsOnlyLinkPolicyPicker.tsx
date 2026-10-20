"use client";
import Box from "@mui/material/Box";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
import type { FriendsOnlyLinkPolicy } from "@/types/game";

type Props = {
  value: FriendsOnlyLinkPolicy;
  onChange: (value: FriendsOnlyLinkPolicy) => void;
  /** Copy says "game" or "group". */
  kind?: "game" | "series";
  disabled?: boolean;
};

// What a friends-only game's / group's link does for people who aren't the organizer's friends.
export default function FriendsOnlyLinkPolicyPicker({ value, onChange, kind = "game", disabled }: Props) {
  const noun = kind === "series" ? "הקבוצה" : "המשחק";
  const options: { value: FriendsOnlyLinkPolicy; label: string; hint: string }[] = [
    {
      value: "REQUEST_TO_JOIN",
      label: "קישור פתוח, הצטרפות באישור",
      hint: `מי שמקבל את הקישור יכול לראות את ${noun} ולבקש להצטרף. חברים שלך מצטרפים כרגיל.`,
    },
    {
      value: "BLOCKED",
      label: "קישור חסום למי שאינו חבר",
      hint: `רק חברים שלך ומי שכבר ב${noun === "הקבוצה" ? "קבוצה" : "משחק"} יוכלו לפתוח את הקישור.`,
    },
  ];

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} mb={0.5}>
        מי יכול להיכנס דרך קישור?
      </Typography>
      <RadioGroup
        value={value}
        onChange={(e) => onChange(e.target.value as FriendsOnlyLinkPolicy)}
      >
        {options.map((o) => (
          <FormControlLabel
            key={o.value}
            value={o.value}
            disabled={disabled}
            control={<Radio size="small" />}
            sx={{ alignItems: "flex-start", mr: 0, mb: 0.5 }}
            label={
              <Box pt={0.75}>
                <Typography variant="body2" fontWeight={600}>{o.label}</Typography>
                <Typography variant="caption" color="text.secondary">{o.hint}</Typography>
              </Box>
            }
          />
        ))}
      </RadioGroup>
    </Box>
  );
}
