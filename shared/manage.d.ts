export type ManageRole = 'ORGANIZER' | 'MANAGER';

export interface ManagedGame {
  id: string;
  title: string | null;
  start: string;
  duration: number;
  sport: string;
  fieldName: string;
  maxPlayers: number;
  confirmedCount: number;
  waitlistCount: number;
  pendingCount: number;
  seriesId: string | null;
  role: ManageRole;
}

export interface ManagedGroup {
  id: string;
  name: string;
  title: string | null;
  fieldName: string;
  dayOfWeek: number | null;
  time: string;
  sport: string;
  imageUrl: string | null;
  role: ManageRole;
  memberCount: number;
  pendingRequestCount: number;
  nextGame: ManagedGame | null;
}

export interface ManageAttentionItem {
  type: 'PENDING_REQUESTS' | 'WAITLIST';
  gameId: string;
  seriesId: string | null;
  /** The group name, or the game's title / field, so the client can say what needs attention. */
  label: string;
  count: number;
  start: string;
}

export interface ManageOverview {
  groups: ManagedGroup[];
  games: ManagedGame[];
  attention: ManageAttentionItem[];
}

export type ManageItem =
  | { kind: 'group'; key: string; start: number; group: ManagedGroup }
  | { kind: 'game'; key: string; start: number; game: ManagedGame };

export type ManageStartDescription = {
  kind: 'today' | 'tomorrow' | 'weekday';
  /** 0 = Sunday */
  dayOfWeek: number;
  day: number;
  month: number;
  /** 'HH:MM', Jerusalem time */
  time: string;
};

export const MANAGE_HOME_LIMIT: number;
export function buildManageItems(overview: ManageOverview | null | undefined): ManageItem[];
export function describeStart(startIso: string, now?: Date): ManageStartDescription | null;
