/** Dev preview the screenshot pack targets unless BASE_URL is set. */
export const DEV_PREVIEW_URL =
  "https://join-up-app-git-dev-yair-klausners-projects.vercel.app";

export const USERS = {
  "organizer-o": "organizer-o+clerk_test@example.com",
  "adult-a": "adult-a+clerk_test@example.com",
  "adult-b": "adult-b+clerk_test@example.com",
  "minor-c": "minor-c+clerk_test@example.com",
} as const;

export type UserKey = keyof typeof USERS;

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
export type ThemeName = "light" | "dark";
export type FeatureName = "match-results" | "tournaments" | "profile";

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
    route: "/manage",
    user: "organizer-o",
    source: "next_app/src/components/gameResult/GameResultPanel.tsx",
    openDetailPrefix: "/games/",
    openDetailSkip: ["/games/new", "/team-management", "/edit"],
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
    id: "tournaments-invites",
    feature: "tournaments",
    route: "/tournaments/invites",
    user: "adult-a",
    source: "next_app/src/app/tournaments/invites/page.tsx",
  },
  {
    id: "tournament",
    feature: "tournaments",
    route: "/tournaments",
    user: "organizer-o",
    source: "next_app/src/components/tournaments/shell/TournamentPage.tsx",
    openDetailPrefix: "/tournaments/",
    openDetailSkip: ["/tournaments/new", "/tournaments/invites", "/edit", "/manage", "/team", "/matches"],
    optionalDetail: true,
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
