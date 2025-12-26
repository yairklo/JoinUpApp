import Link from "next/link";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import PersonIcon from "@mui/icons-material/Person";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";

import Section from "@/components/ui/Section";
import { fetchFriendsActivity, FriendActivity } from "@/lib/api-mocks";
import { currentUser } from "@clerk/nextjs/server";

function ActivityCard({ activity }: { activity: FriendActivity }) {
  const actionColor = activity.action === 'joined' ? 'success' : 'info';
  const actionText = activity.action === 'joined' ? 'Joined Game' : 'Created Game';

  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <PersonIcon color="action" sx={{ fontSize: 30 }} />
          <Box flexGrow={1}>
            <Typography variant="body1" fontWeight="bold">
              {activity.friendName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {activity.timeAgo}
            </Typography>
          </Box>
          <Chip label={actionText} size="small" color={actionColor} />
        </Stack>
        
        <Stack direction="row" alignItems="center" spacing={1} mt={1}>
          <SportsSoccerIcon fontSize="small" color="primary" />
          <Link href={`/games/${activity.gameId}`} passHref legacyBehavior>
            <Typography component="a" color="primary" sx={{ cursor: 'pointer' }}>
              {activity.gameName}
            </Typography>
          </Link>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default async function FriendsActivitySection() {
  const user = await currentUser();
  const userId = user?.id;

  if (!userId) {
    return null; 
  }

  // Using mock fetch function
  const activities = await fetchFriendsActivity(userId);

  return (
    <Section title="Friends Activity">
      {activities.length === 0 ? (
        <Typography color="text.secondary">
          No recent activity from your friends.
        </Typography>
      ) : (
        <Box>
          {activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </Box>
      )}
    </Section>
  );
}
