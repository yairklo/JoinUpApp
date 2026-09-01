"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";

import FieldCard, { type Field } from "@/components/FieldCard";
import { SportFilter, SPORT_MAPPING, SPORT_EMOJI } from "@/utils/sports";

const FILTERS: { label: string; value: SportFilter }[] = [
  { label: "הכל", value: "ALL" },
  { label: SPORT_MAPPING.SOCCER, value: "SOCCER" },
  { label: SPORT_MAPPING.BASKETBALL, value: "BASKETBALL" },
  { label: SPORT_MAPPING.TENNIS, value: "TENNIS" },
];

export default function FieldsBrowser({ fields }: { fields: Field[] }) {
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");

  const filteredFields = useMemo(() => {
    const query = search.trim().toLowerCase();
    return fields.filter((f) => {
      const matchesSearch =
        !query ||
        f.name.toLowerCase().includes(query) ||
        f.location.toLowerCase().includes(query);
      const matchesSport =
        sportFilter === "ALL" || (f.supportedSports || []).includes(sportFilter);
      return matchesSearch && matchesSport;
    });
  }, [fields, search, sportFilter]);

  return (
    <Box>
      <Box sx={{ mb: { xs: 2.5, md: 3 } }}>
        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם מגרש או מיקום..."
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            sx: { borderRadius: 3, bgcolor: "background.paper" },
          }}
          sx={{ mb: 1.5 }}
        />

        <Box
          display="flex"
          gap={1}
          sx={{
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
            WebkitOverflowScrolling: "touch",
            pb: 0.25,
          }}
        >
          {FILTERS.map((f) => {
            const selected = sportFilter === f.value;
            const emoji = f.value !== "ALL" ? SPORT_EMOJI[f.value] : undefined;
            return (
              <Chip
                key={f.value}
                label={emoji ? `${emoji} ${f.label}` : f.label}
                clickable
                onClick={() => setSportFilter(f.value)}
                sx={{
                  flexShrink: 0,
                  px: 0.5,
                  height: 34,
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  border: "1px solid",
                  transition: "all 150ms ease",
                  ...(selected
                    ? {
                        color: "primary.contrastText",
                        borderColor: "transparent",
                        backgroundImage: (t) =>
                          `linear-gradient(135deg, ${t.palette.primary.main} 0%, ${t.palette.primary.dark} 100%)`,
                        boxShadow: (t) => `0 4px 14px ${alpha(t.palette.primary.main, 0.4)}`,
                      }
                    : {
                        color: "text.secondary",
                        bgcolor: (t) => alpha(t.palette.text.primary, 0.03),
                        borderColor: (t) => alpha(t.palette.text.primary, 0.1),
                        "&:hover": {
                          bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                          borderColor: (t) => alpha(t.palette.primary.main, 0.3),
                          color: "primary.main",
                        },
                      }),
                }}
              />
            );
          })}
        </Box>
      </Box>

      {filteredFields.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            borderRadius: 4,
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="body1" color="text.secondary">
            לא נמצאו מגרשים התואמים לחיפוש. נסו מילות חיפוש אחרות או סננון שונה.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
              lg: "repeat(4, 1fr)",
            },
            gap: 2.5,
          }}
        >
          {filteredFields.map((f) => (
            <FieldCard key={f.id} field={f} />
          ))}
        </Box>
      )}
    </Box>
  );
}
