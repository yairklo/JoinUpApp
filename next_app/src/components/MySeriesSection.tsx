import Link from "next/link";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

import Section from "@/components/ui/Section";
import { fetchMySeries, SeriesSummary } from "@/lib/api-mocks";
import { currentUser } from "@clerk/nextjs/server";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SeriesCard({ series }: { series: SeriesSummary }) {
  const day = series.dayOfWeek !== null ? dayNames[series.dayOfWeek] : "Custom";
  
  return (
    <Card variant="outlined" sx={{ mb: 2, transition: 'box-shadow 0.3s', '&:hover': { boxShadow: 6 } }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6" component="div" fontWeight="bold">
            {series.fieldName}
          </Typography>
          <Chip label={series.type === 'WEEKLY' ? 'Weekly' : 'Custom'} size="small" color="primary" />
        </Stack>
        
        <Stack spacing={1} mt={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LocationOnIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {series.fieldLocation}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CalendarTodayIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {day}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AccessTimeIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {series.time}
            </Typography>
          </Stack>
        </Stack>
        
        <Box mt={2}>
          <Link href={`/series/${series.id}`} passHref legacyBehavior>
            <Typography component="a" color="primary" sx={{ cursor: 'pointer', fontWeight: 'bold' }}>
              View Details
            </Typography>
          </Link>
        </Box>
      </CardContent>
    </Card>
  );
}

export default async function MySeriesSection() {
  const user = await currentUser();
  const userId = user?.id;

  if (!userId) {
    // If user is not logged in, we might hide this section or show a prompt
    return null; 
  }

  // Using mock fetch function
  const seriesList = await fetchMySeries(userId);

  return (
    <Section title="My Series">
      {seriesList.length === 0 ? (
        <Typography color="text.secondary">
          You are not currently subscribed to any recurring game series.
        </Typography>
      ) : (
        <Box>
          {seriesList.map((series) => (
            <SeriesCard key={series.id} series={series} />
          ))}
        </Box>
      )}
    </Section>
  );
}
