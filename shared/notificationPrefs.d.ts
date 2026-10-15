export type NotificationCategoryKey =
  | 'friendRequests' | 'messages' | 'friendGames' | 'friendJoins' | 'gameReminders'
  | 'myGames' | 'invitations' | 'organizer' | 'groupGames' | 'cityGames';
export type NotificationCategoryGroup = 'social' | 'myGames' | 'discovery';
export type NotificationSport = 'SOCCER' | 'BASKETBALL' | 'TENNIS';
export type NotificationMuteTarget = 'USER' | 'SERIES' | 'GAME';

export interface NotificationMute {
  targetType: NotificationMuteTarget;
  targetId: string;
  /** ISO; null = until unmuted */
  until: string | null;
  createdAt: string;
  label: string | null;
  imageUrl: string | null;
}

export interface NotificationSettings {
  pushEnabled: boolean;
  friendRequestsEnabled: boolean;
  messagesEnabled: boolean;
  gameRemindersEnabled: boolean;
  friendRequestsInApp: boolean;
  gameRemindersInApp: boolean;
  myGamesPush: boolean;
  myGamesInApp: boolean;
  invitationsPush: boolean;
  invitationsInApp: boolean;
  organizerPush: boolean;
  organizerInApp: boolean;
  groupGamesPush: boolean;
  groupGamesInApp: boolean;
  friendGamesPush: boolean;
  friendGamesInApp: boolean;
  friendJoinsPush: boolean;
  friendJoinsInApp: boolean;
  cityGamesPush: boolean;
  cityGamesInApp: boolean;
  cityGamesSports: NotificationSport[];
  cityGamesCities: string[];
  quietHoursEnabled: boolean;
  /** minutes since local midnight */
  quietHoursStart: number;
  quietHoursEnd: number;
  timezone: string;
  /** ISO; null when not snoozed */
  snoozeUntil: string | null;
  cityPromptDismissedAt: string | null;
  mutes: NotificationMute[];
}

export type NotificationSettingsUpdate = Partial<Omit<NotificationSettings, 'mutes'>>;

export type NotificationBooleanField = {
  [K in keyof NotificationSettings]: NotificationSettings[K] extends boolean ? K : never
}[keyof NotificationSettings];

export interface NotificationCategory {
  key: NotificationCategoryKey;
  group: NotificationCategoryGroup;
  pushField: NotificationBooleanField;
  inAppField: NotificationBooleanField | null;
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[];
export const NOTIFICATION_CATEGORY_GROUPS: NotificationCategoryGroup[];
export const CATEGORY_BY_NOTIFICATION_TYPE: Record<string, NotificationCategoryKey>;
export const ALWAYS_DELIVERED_TYPES: string[];
export const URGENT_PUSH_TYPES: string[];
export const QUICK_OFF_EXCLUDED_CATEGORIES: NotificationCategoryKey[];
export const SNOOZE_HOURS_OPTIONS: number[];
export const MUTE_DURATION_OPTIONS: Array<number | null>;
export function minutesToHHMM(minutes: number): string;
export function HHMMToMinutes(value: string): number | null;
