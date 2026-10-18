"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { alpha } from "@mui/material/styles";

import { SportFilter, SPORT_MAPPING, getSportTheme } from "@/utils/sports";
import SportIcon from "@/components/ui/SportIcon";

const FILTERS: { label: string; value: SportFilter }[] = [
    { label: "הכל", value: "ALL" },
    { label: SPORT_MAPPING.SOCCER, value: "SOCCER" },
    { label: SPORT_MAPPING.BASKETBALL, value: "BASKETBALL" },
    { label: SPORT_MAPPING.TENNIS, value: "TENNIS" },
];

/**
 * Sport filter pills for the games feed. One row on every width (scrolls horizontally if it
 * ever overflows) so the sticky bar stays a single compact strip on phones; the active pill
 * takes its sport's identity color (SPORT_THEME) so the filter itself teaches the color code
 * used on cards and map pins.
 */
export default function SportFilterBar({
    value,
    onChange,
}: {
    value: SportFilter;
    onChange: (value: SportFilter) => void;
}) {
    return (
        <Box
            role="radiogroup"
            aria-label="סינון לפי ענף"
            sx={{
                display: "flex",
                gap: 1,
                overflowX: "auto",
                scrollbarWidth: "none",
                "&::-webkit-scrollbar": { display: "none" },
                WebkitOverflowScrolling: "touch",
            }}
        >
            {FILTERS.map((f) => {
                const selected = value === f.value;
                const sportColors = f.value !== "ALL" ? getSportTheme(f.value) : null;
                return (
                    <ButtonBase
                        key={f.value}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(f.value)}
                        sx={(t) => {
                            const accent = sportColors ? sportColors.base : t.palette.primary.main;
                            const accentDeep = sportColors ? sportColors.deep : t.palette.primary.dark;
                            return {
                                flexShrink: 0,
                                height: 36,
                                px: 1.75,
                                gap: 0.75,
                                borderRadius: 999,
                                fontFamily: "inherit",
                                fontSize: "0.875rem",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                border: "1px solid",
                                transition: "background-color 150ms ease, color 150ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 150ms cubic-bezier(0.16, 1, 0.3, 1)",
                                "&:active": { transform: "scale(0.96)" },
                                "&.Mui-focusVisible": { outline: `2px solid ${accent}`, outlineOffset: 2 },
                                ...(selected
                                    ? {
                                          color: "#fff",
                                          borderColor: "transparent",
                                          backgroundImage: `linear-gradient(135deg, ${accent} 0%, ${accentDeep} 100%)`,
                                          boxShadow: `0 6px 16px -4px ${alpha(accent, 0.55)}`,
                                      }
                                    : {
                                          color: "text.secondary",
                                          bgcolor: "background.paper",
                                          borderColor: alpha(t.palette.text.primary, 0.1),
                                          "@media (hover: hover)": {
                                              "&:hover": {
                                                  color: "text.primary",
                                                  borderColor: alpha(accent, 0.45),
                                                  bgcolor: alpha(accent, 0.06),
                                              },
                                          },
                                      }),
                            };
                        }}
                    >
                        {sportColors && (
                            <SportIcon
                                sport={f.value}
                                sx={{ fontSize: 18, color: selected ? "#fff" : sportColors.base, transition: "color 150ms ease" }}
                            />
                        )}
                        {f.label}
                    </ButtonBase>
                );
            })}
        </Box>
    );
}
