"use client";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import FieldCard from "@/components/FieldCard";

type Field = { id: string; name: string; location: string };

export default function FieldsCarousel({ fields }: { fields: Field[] }) {
  if (!fields || fields.length === 0) return null;
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        overflowX: "auto",
        py: 1,
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        scrollSnapType: "x mandatory",
        "& > *": { scrollSnapAlign: "start" },
      }}
    >
      {fields.map((f) => (
        <Box key={f.id} sx={{ minWidth: 280, flexShrink: 0 }}>
          <FieldCard field={{ id: f.id, name: f.name, location: f.location, price: 0, rating: 0, type: "open" }} />
        </Box>
      ))}
    </Stack>
  );
}
