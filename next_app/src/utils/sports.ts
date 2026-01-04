export const SPORT_IMAGES = {
    SOCCER: "https://images.unsplash.com/photo-1579952363873-27f3bde9be2d?auto=format&fit=crop&w=800&q=80",
    BASKETBALL: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80",
    TENNIS: "https://images.unsplash.com/photo-1595435934249-5df7ed86c1c0?auto=format&fit=crop&w=800&q=80"
};

export const SPORT_MAPPING: Record<string, string> = {
    SOCCER: "כדורגל",
    BASKETBALL: "כדורסל",
    TENNIS: "טניס"
};

export type SportType = keyof typeof SPORT_IMAGES;
