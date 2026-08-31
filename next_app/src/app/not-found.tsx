import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import HomeIcon from "@mui/icons-material/Home";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import Link from "next/link";

export default function NotFound() {
  return (
    <Box
      dir="rtl"
      sx={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 2,
        p: 4,
      }}
    >
      <SearchOffIcon sx={{ fontSize: 48, color: "text.secondary" }} />
      <Typography variant="h5" fontWeight="bold">
        הדף לא נמצא
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420 }}>
        הדף שחיפשתם לא קיים, או שהקישור שגוי. ייתכן שהוא הוסר או שהכתובת הוקלדה בטעות.
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, mt: 1 }}>
        <Button variant="contained" component={Link} href="/games" startIcon={<HomeIcon />}>
          חזרה לדף הבית
        </Button>
      </Box>
    </Box>
  );
}
