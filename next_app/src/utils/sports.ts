export const SPORT_IMAGES = {
    SOCCER: "/images/soccer.jpg",
    BASKETBALL: "/images/basketball.jpg",
    TENNIS: "/images/tennis.jpg"
};

export const SPORT_MAPPING: Record<string, string> = {
    SOCCER: "כדורגל",
    BASKETBALL: "כדורסל",
    TENNIS: "טניס"
};

export const SPORT_EMOJI: Record<string, string> = {
    SOCCER: "⚽",
    BASKETBALL: "🏀",
    TENNIS: "🎾"
};

export type SportType = keyof typeof SPORT_IMAGES;
export type SportFilter = SportType | "ALL";

export const POSITION_OPTIONS: Record<string, string[]> = {
    SOCCER: ['שוער', 'בלם', 'מגן', 'קשר', 'חלוץ'],
    BASKETBALL: ['פוינט גארד', 'שוטינג גארד', 'סמול פורוורד', 'פאואר פורוורד', 'סנטר'],
    TENNIS: ['שחקן בסיס', 'שחקן רשת'],
    VOLLEYBALL: ['פאסר', 'חוסם', 'לייבירו', 'תוקף'],
    PADEL: []
};
