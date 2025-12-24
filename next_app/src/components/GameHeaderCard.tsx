"use client";

// MUI Imports
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import LinearProgress from "@mui/material/LinearProgress";
import Chip from "@mui/material/Chip";

// Icons
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PeopleIcon from '@mui/icons-material/People';

export default function GameHeaderCard({
  time,
  title,
  currentPlayers,
  maxPlayers,
  durationHours,
  children,
}: {
  time: string;
  title: string;
  currentPlayers: number;
  maxPlayers: number;
  durationHours?: number;
  children?: React.ReactNode;
}) {
  function formatEndTime(startTime: string, hours: number | undefined): string {
    const dur = typeof hours === "number" && Number.isFinite(hours) ? hours : 1;
    const [h, m] = startTime.split(":").map((n) => parseInt(n, 10));
    const base = new Date(1970, 0, 1, isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    base.setHours(base.getHours() + dur);
    const hh = String(base.getHours()).padStart(2, "0");
    const mm = String(base.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const end = formatEndTime(time, durationHours);
  
  // חישוב אחוז תפוסה לבר ההתקדמות
  const occupancyPercentage = Math.min((currentPlayers / maxPlayers) * 100, 100);
  const isFull = currentPlayers >= maxPlayers;

  return (
    <Card 
      elevation={2} 
      sx={{ 
        mb: 3, 
        borderRadius: 3, 
        overflow: 'visible' // כדי שהצל יראה טוב
      }}
    >
      <CardContent sx={{ p: 3 }}>
        
        {/* שורה עליונה: זמן וסטטוס תפוסה */}
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>
                <AccessTimeIcon fontSize="small" />
                <Typography variant="body2" fontWeight="medium">
                    {time} – {end}
                </Typography>
            </Stack>

            <Chip 
                icon={<PeopleIcon />}
                label={`${currentPlayers} / ${maxPlayers}`}
                size="small"
                color={isFull ? "error" : "default"}
                variant={isFull ? "filled" : "outlined"}
                sx={{ fontWeight: 'bold' }}
            />
        </Box>

        {/* כותרת המשחק / שם המגרש */}
        <Typography variant="h5" component="h2" fontWeight="bold" gutterBottom sx={{ mt: 1 }}>
          {title || "Untitled Game"}
        </Typography>

        {/* בר התקדמות ויזואלי */}
        <Box sx={{ mt: 2, mb: 3 }}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">Occupancy</Typography>
                <Typography variant="caption" color={isFull ? "error.main" : "text.secondary"}>
                    {isFull ? "Full capacity" : `${maxPlayers - currentPlayers} spots left`}
                </Typography>
            </Box>
            <LinearProgress 
                variant="determinate" 
                value={occupancyPercentage} 
                color={isFull ? "error" : "primary"}
                sx={{ height: 8, borderRadius: 4 }}
            />
        </Box>

        {/* כפתורי פעולה (Children) - כאן נכנסים הכפתורים של הצטרף/עזוב */}
        <Stack direction="row" spacing={2} mt="auto">
          {children}
        </Stack>

      </CardContent>
    </Card>
  );
}