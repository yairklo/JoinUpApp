"use client";
import Link from "next/link";
import { useState } from "react";

// MUI
import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";

// Icons
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import HomeWorkOutlinedIcon from "@mui/icons-material/HomeWorkOutlined";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";

import FavoriteButton from "@/components/FavoriteButton";
import NewGameInline from "@/components/NewGameInline";

export type Field = {
  id: string;
  name: string;
  location: string;
  price: number;
  rating: number;
  image?: string | null;
  type: "open" | "closed";
  favoritesCount?: number;
};

export default function FieldCard({ field }: { field: Field }) {
  const [showNewGame, setShowNewGame] = useState(false);
  const imgSrc = field.image && field.image.trim().length > 0 ? field.image : "/images/default-field.jpg";
  const isFree = !field.price || field.price <= 0;
  const isOpen = field.type === "open";

  return (
    <Card
      elevation={0}
      dir="rtl"
      sx={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 5,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 14px 32px rgba(15,23,42,0.14)",
        },
      }}
    >
      {/* ── Image ── */}
      <Box sx={{ position: "relative" }}>
        <CardMedia component="img" height="150" image={imgSrc} alt={field.name} />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(2,6,23,0.1) 0%, transparent 40%, rgba(2,6,23,0.5) 100%)",
          }}
        />

        <Box sx={{ position: "absolute", top: 10, insetInlineEnd: 10 }}>
          <FavoriteButton fieldId={field.id} />
        </Box>

        {/* Type + price pills */}
        <Stack direction="row" spacing={0.75} sx={{ position: "absolute", bottom: 10, insetInlineStart: 10 }}>
          <Chip
            size="small"
            icon={
              isOpen
                ? <WbSunnyOutlinedIcon sx={{ fontSize: "14px !important", color: "#fff !important" }} />
                : <HomeWorkOutlinedIcon sx={{ fontSize: "14px !important", color: "#fff !important" }} />
            }
            label={isOpen ? "מגרש פתוח" : "אולם סגור"}
            sx={{
              height: 24,
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#fff",
              bgcolor: "rgba(2,6,23,0.55)",
              backdropFilter: "blur(6px)",
            }}
          />
          <Chip
            size="small"
            label={isFree ? "חינם" : `₪${field.price}/שעה`}
            sx={{
              height: 24,
              fontSize: "0.75rem",
              fontWeight: 800,
              color: "#022c22",
              bgcolor: "rgba(167,243,208,0.95)",
            }}
          />
        </Stack>
      </Box>

      {/* ── Content ── */}
      <CardContent sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1, "&:last-child": { pb: 2 } }}>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.05rem", lineHeight: 1.3 }} noWrap>
            {field.name}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25, color: "text.secondary" }}>
            <PlaceOutlinedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ fontSize: "0.82rem" }} noWrap>
              {field.location}
            </Typography>
          </Stack>
        </Box>

        <Stack direction="row" spacing={1} sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
          <Button
            component={Link}
            href={`/fields/${field.id}`}
            variant="outlined"
            size="small"
            fullWidth
            aria-label={`לפרופיל המגרש ${field.name}`}
          >
            פרופיל המגרש
          </Button>
          <Button
            component={Link}
            href={`/games?fieldId=${field.id}`}
            variant="contained"
            size="small"
            fullWidth
            startIcon={<SportsSoccerIcon sx={{ fontSize: 16 }} />}
            aria-label={`למשחקים במגרש ${field.name}`}
          >
            משחקים
          </Button>
          <IconButton
            size="small"
            onClick={() => setShowNewGame(true)}
            aria-label="משחק חדש במגרש הזה"
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 999,
              flexShrink: 0,
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Stack>
      </CardContent>

      {/* New game dialog */}
      <Dialog open={showNewGame} onClose={() => setShowNewGame(false)} fullWidth maxWidth="sm" dir="rtl">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 700 }}>
          <Box>
            משחק חדש ב{field.name}
            <Typography variant="body2" color="text.secondary">
              {field.location}
            </Typography>
          </Box>
          <IconButton onClick={() => setShowNewGame(false)} aria-label="סגור">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <NewGameInline
            fieldId={field.id}
            onCreated={(fid) => {
              setShowNewGame(false);
              try {
                window.location.href = `/games?fieldId=${fid}`;
              } catch {}
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
