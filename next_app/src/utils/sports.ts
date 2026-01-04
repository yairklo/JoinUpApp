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

export type SportType = keyof typeof SPORT_IMAGES;
export type SportFilter = SportType | "ALL";
