/** Dev preview the screenshot pack targets unless BASE_URL is set. */
export const DEV_PREVIEW_URL =
  "https://join-up-app-git-dev-yair-klausners-projects.vercel.app";

export const USERS = {
  "organizer-o": "organizer-o+clerk_test@example.com",
  "adult-a": "adult-a+clerk_test@example.com",
  "adult-b": "adult-b+clerk_test@example.com",
  "minor-c": "minor-c+clerk_test@example.com",
} as const;

/** "guest" = signed out (no Clerk session, empty storage state). */
export type UserKey = keyof typeof USERS | "guest";

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
export type ThemeName = "light" | "dark";
export type FeatureName = "match-results" | "tournaments" | "profile" | "home";

export type ScreenAction =
  | "profile-history"
  | "finished-game"
  | "wizard-step-2"
  | "wizard-step-3"
  | "wizard-step-4"
  | "wizard-step-5"
  | "match-score-entry"
  | "report-user";

export type ScreenDef = {
  id: string;
  feature: FeatureName;
  /** Path to open. Detail screens may navigate onward from here. */
  route: string;
  user: UserKey;
  /** Source file the design agent should edit. */
  source: string;
  /**
   * After `route` loads, open the first link whose href contains this prefix
   * and is not in `openDetailSkip`. Used for /games/[id] and /tournaments/[id].
   */
  openDetailPrefix?: string;
  openDetailSkip?: string[];
  /** When no detail link exists, leave the INDEX row as "not yet" instead of failing. */
  optionalDetail?: boolean;
  /** Pre-capture interaction sequence. */
  action?: ScreenAction;
};

export const screens: ScreenDef[] = [
  {
    id: "profile",
    feature: "profile",
    route: "/profile",
    user: "adult-a",
    source: "next_app/src/app/profile/page.tsx",
  },
  {
    id: "profile-history",
    feature: "profile",
    route: "/profile",
    user: "adult-a",
    source: "next_app/src/app/profile/page.tsx",
    action: "profile-history",
  },
  {
    id: "profile-settings",
    feature: "profile",
    route: "/profile/settings",
    user: "adult-a",
    source: "next_app/src/app/profile/settings/page.tsx",
  },
  {
    id: "profile-minor",
    feature: "profile",
    route: "/profile",
    user: "minor-c",
    source: "next_app/src/app/profile/page.tsx",
  },
  {
    id: "game",
    feature: "match-results",
    // Finished game ("QA results A") reached via adult-a's profile history, so the result panel renders.
    route: "/profile",
    user: "adult-a",
    source: "next_app/src/components/gameResult/GameResultPanel.tsx",
    action: "finished-game",
  },
  {
    id: "game-upcoming",
    feature: "match-results",
    // Upcoming seeded game organized by organizer-o; viewed as a non-organizer player.
    route: "/games/seed_game_approval",
    user: "adult-a",
    source: "next_app/src/app/games/[id]/page.tsx",
  },
  {
    id: "game-upcoming-guest",
    feature: "match-results",
    route: "/games/seed_game_approval",
    user: "guest",
    source: "next_app/src/app/games/[id]/page.tsx",
  },
  {
    id: "game-finished-guest",
    feature: "match-results",
    // Finished game "QA results A" (id looked up from adult-a's profile history).
    route: "/games/cmvimszfo0038nw0ihwu88lkm",
    user: "guest",
    source: "next_app/src/app/games/[id]/page.tsx",
  },
  {
    id: "home-managed",
    feature: "home",
    route: "/games",
    user: "organizer-o",
    source: "next_app/src/components/GamesPageContent.tsx",
  },
  {
    id: "game-report-user",
    feature: "match-results",
    route: "/profile",
    user: "adult-a",
    source: "next_app/src/components/ReportUserDialog.tsx",
    action: "report-user",
  },
  {
    id: "tournaments-list",
    feature: "tournaments",
    route: "/tournaments",
    user: "organizer-o",
    source: "next_app/src/app/tournaments/page.tsx",
  },
  {
    id: "tournaments-new",
    feature: "tournaments",
    route: "/tournaments/new",
    user: "organizer-o",
    source: "next_app/src/app/tournaments/new/page.tsx",
  },
  {
    id: "tournaments-new-step2",
    feature: "tournaments",
    route: "/tournaments/new",
    user: "organizer-o",
    source: "next_app/src/components/tournaments/wizard/StepTeams.tsx",
    action: "wizard-step-2",
  },
  {
    id: "tournaments-new-step3",
    feature: "tournaments",
    route: "/tournaments/new",
    user: "organizer-o",
    source: "next_app/src/components/tournaments/wizard/StepFormat.tsx",
    action: "wizard-step-3",
  },
  {
    id: "tournaments-new-step4",
    feature: "tournaments",
    route: "/tournaments/new",
    user: "organizer-o",
    source: "next_app/src/components/tournaments/wizard/StepRegistration.tsx",
    action: "wizard-step-4",
  },
  {
    id: "tournaments-new-step5",
    feature: "tournaments",
    route: "/tournaments/new",
    user: "organizer-o",
    source: "next_app/src/components/tournaments/wizard/StepReview.tsx",
    action: "wizard-step-5",
  },
  {
    id: "tournaments-invites",
    feature: "tournaments",
    route: "/tournaments/invites",
    user: "adult-a",
    source: "next_app/src/app/tournaments/invites/page.tsx",
  },
  {
    id: "tournament",
    feature: "tournaments",
    route: "/tournaments/cmvjad6r3000gqe0iifmjp349",
    user: "adult-a",
    source: "next_app/src/components/tournaments/shell/TournamentPage.tsx",
  },
  {
    id: "tournament-schedule",
    feature: "tournaments",
    route: "/tournaments/cmvjad6r3000gqe0iifmjp349?tab=schedule",
    user: "adult-a",
    source: "next_app/src/components/tournaments/tabs/ScheduleTab.tsx",
  },
  {
    id: "tournament-standings",
    feature: "tournaments",
    route: "/tournaments/cmvjad6r3000gqe0iifmjp349?tab=standings",
    user: "adult-a",
    source: "next_app/src/components/tournaments/tabs/StandingsTab.tsx",
  },
  {
    id: "tournament-leaders",
    feature: "tournaments",
    route: "/tournaments/cmvjad6r3000gqe0iifmjp349?tab=leaders",
    user: "adult-a",
    source: "next_app/src/components/tournaments/tabs/TopPlayersTab.tsx",
  },
  {
    id: "tournament-manage",
    feature: "tournaments",
    route: "/tournaments/cmvjad6r3000gqe0iifmjp349/manage",
    user: "organizer-o",
    source: "next_app/src/components/tournaments/manage/ManageConsole.tsx",
  },
  {
    id: "tournament-score-sheet",
    feature: "tournaments",
    route: "/tournaments/cmvjad6r3000gqe0iifmjp349?tab=schedule",
    user: "organizer-o",
    source: "next_app/src/components/tournaments/ScoreEntrySheet.tsx",
    action: "match-score-entry",
  },
];

/** Same ids as the Maestro flows under mobile_app/.maestro/screenshots/. */
export const mobileScreens: Array<{ id: string; feature: FeatureName; route: string; source: string }> = [
  { id: "profile", feature: "profile", route: "/user/profile", source: "mobile_app/app/user/profile.tsx" },
  { id: "profile-settings", feature: "profile", route: "/profile/settings", source: "mobile_app/app/profile/settings.tsx" },
  { id: "game", feature: "match-results", route: "/(tabs)/game/[id]", source: "mobile_app/app/(tabs)/game/[id].tsx" },
  { id: "tournaments-list", feature: "tournaments", route: "/tournaments", source: "mobile_app/app/tournaments/index.tsx" },
  { id: "tournaments-new", feature: "tournaments", route: "/tournaments/new", source: "mobile_app/app/tournaments/new.tsx" },
];
