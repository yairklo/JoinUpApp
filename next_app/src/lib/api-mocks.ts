// Define types based on requirements and existing context
export type SeriesSummary = {
  id: string;
  fieldName: string;
  fieldLocation: string;
  time: string;
  dayOfWeek: number | null; // 0=Sun, 6=Sat
  type: 'WEEKLY' | 'CUSTOM';
};

export type FriendActivity = {
  id: string;
  friendName: string;
  action: 'joined' | 'created';
  gameName: string;
  gameId: string;
  timeAgo: string;
};

// --- MOCK DATA ---

const MOCK_SERIES: SeriesSummary[] = [
  {
    id: "s1",
    fieldName: "Central Park Field 1",
    fieldLocation: "New York, NY",
    time: "18:00",
    dayOfWeek: 3, // Wednesday
    type: 'WEEKLY',
  },
  {
    id: "s2",
    fieldName: "Beach Volleyball Court",
    fieldLocation: "Santa Monica, CA",
    time: "10:00",
    dayOfWeek: 6, // Saturday
    type: 'WEEKLY',
  },
];

const MOCK_ACTIVITIES: FriendActivity[] = [
  {
    id: "a1",
    friendName: "Alex Johnson",
    action: "joined",
    gameName: "Evening Pickup Soccer",
    gameId: "g101",
    timeAgo: "5 minutes ago",
  },
  {
    id: "a2",
    friendName: "Sarah Lee",
    action: "created",
    gameName: "Sunday Morning Hoops",
    gameId: "g102",
    timeAgo: "1 hour ago",
  },
  {
    id: "a3",
    friendName: "Mike Chen",
    action: "joined",
    gameName: "Lunchtime Tennis",
    gameId: "g103",
    timeAgo: "3 hours ago",
  },
];

// Helper to simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mock function to fetch user's subscribed series.
 * Replace with actual API call later.
 */
export async function fetchMySeries(userId: string): Promise<SeriesSummary[]> {
  // console.log(`Mock fetching series for user: ${userId}`);
  await delay(500);
  return MOCK_SERIES;
}

/**
 * Mock function to fetch friends' recent game activity.
 * Replace with actual API call later.
 */
export async function fetchFriendsActivity(userId: string): Promise<FriendActivity[]> {
  // console.log(`Mock fetching friends activity for user: ${userId}`);
  await delay(600);
  return MOCK_ACTIVITIES;
}
