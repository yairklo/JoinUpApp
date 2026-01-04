export const SPORT_IMAGES = {
    SOCCER: "https://images.unsplash.com/photo-1579952363873-27f3bde9be2d?auto=format&fit=crop&w=800&q=80",
    BASKETBALL: "https://images.unsplash.com/photo-1519861531473-920026393112?auto=format&fit=crop&w=800&q=80",
    TENNIS: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=800&q=80"
};

export const SPORT_MAPPING: Record<string, string> = {
    SOCCER: "כדורגל",
    BASKETBALL: "כדורסל",
    TENNIS: "טניס"
};

export type SportType = keyof typeof SPORT_IMAGES;
