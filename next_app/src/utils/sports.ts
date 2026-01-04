export const SPORT_IMAGES = {
    SOCCER: "https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&w=800&q=80",
    BASKETBALL: "https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&w=800&q=80",
    TENNIS: "https://images.unsplash.com/photo-1595435934249-5df7ed86c1c0?auto=format&fit=crop&w=800&q=80"
};

export const SPORT_MAPPING: Record<string, string> = {
    SOCCER: "כדורגל",
    BASKETBALL: "כדורסל",
    TENNIS: "טניס"
};

export type SportType = keyof typeof SPORT_IMAGES;
