export type Game = {
    id: string;
    fieldId: string;
    fieldName: string;
    fieldLocation: string;
    date: string;
    time: string;
    duration?: number;
    maxPlayers: number;
    currentPlayers: number;
    participants?: Array<{ id: string; name?: string | null }>;
    sport?: string;
    seriesId?: string | null;
    registrationOpensAt?: string | null;
    title?: string | null;
    teamSize?: number | null;
    price?: number | null;
};
