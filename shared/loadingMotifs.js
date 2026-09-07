/**
 * Shared catalog of page-loading motifs. Visual implementations live in
 * next_app (framer-motion) and mobile_app (Reanimated) under the same `id`s
 * so web and native stay in lockstep when a screen picks a motif.
 */

const LOADING_MOTIFS = [
  {
    id: "bouncing-ball",
    family: "sport",
    labelHe: "כדור קופץ",
    labelEn: "Bouncing ball",
    suggestedHe: "דף משחק (כבר בשימוש), פרטי סדרה",
    suggestedEn: "Game details (already used), series",
  },
  {
    id: "passing-lane",
    family: "sport",
    labelHe: "מסירה",
    labelEn: "Passing lane",
    suggestedHe: "בחירת קבוצות, דף לייב-דראפט",
    suggestedEn: "Team pick, live draft",
  },
  {
    id: "kickoff-ripple",
    family: "sport",
    labelHe: "שריקת פתיחה",
    labelEn: "Kickoff ripple",
    suggestedHe: "בית, משחקים לפי תאריך",
    suggestedEn: "Home feed, games-by-date",
  },
  {
    id: "dribble",
    family: "sport",
    labelHe: "כדרור",
    labelEn: "Dribble",
    suggestedHe: "חיפוש משחקים, רשימות אופקיות",
    suggestedEn: "Search, horizontal game lists",
  },
  {
    id: "brand-pulse",
    family: "brand",
    labelHe: "דופק JoinUp",
    labelEn: "Brand pulse",
    suggestedHe: "מסכים כלליים, הגדרות, פרופיל",
    suggestedEn: "Generic pages, settings, profile",
  },
  {
    id: "pin-drop",
    family: "place",
    labelHe: "נעיצת מיקום",
    labelEn: "Pin drop",
    suggestedHe: "מגרשים, מפה, יצירת משחק",
    suggestedEn: "Fields, map, create-game",
  },
  {
    id: "message-stack",
    family: "social",
    labelHe: "הודעות",
    labelEn: "Message stack",
    suggestedHe: "צ'אטים, חלון שיחה",
    suggestedEn: "Chats, conversation window",
  },
  {
    id: "crowd-wave",
    family: "social",
    labelHe: "גל קהל",
    labelEn: "Crowd wave",
    suggestedHe: "חברים, משתתפים, המשתמשים שלי",
    suggestedEn: "Friends, roster, my games",
  },
];

const LOADING_MOTIF_FAMILY_LABELS = {
  sport: { he: "ספורט", en: "Sport" },
  brand: { he: "מותג", en: "Brand" },
  place: { he: "מקום", en: "Place" },
  social: { he: "חברתי", en: "Social" },
};

const LOADING_MOTIF_IDS = LOADING_MOTIFS.map((m) => m.id);

function isLoadingMotifId(value) {
  return LOADING_MOTIF_IDS.includes(value);
}

module.exports = {
  LOADING_MOTIFS,
  LOADING_MOTIF_IDS,
  LOADING_MOTIF_FAMILY_LABELS,
  isLoadingMotifId,
};
