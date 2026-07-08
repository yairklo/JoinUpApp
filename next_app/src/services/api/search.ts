import { apiClient } from './client';

export interface SearchUserResult {
    id: string;
    name: string | null;
    imageUrl?: string | null;
}

export interface SearchFieldResult {
    id: string;
    name: string;
    city?: string | null;
}

export interface SearchGameResult {
    id: string;
    title?: string | null;
    sport?: string | null;
    start: string;
    date?: string;
    time?: string;
    field?: { name: string; city?: string | null } | null;
}

export interface GlobalSearchResults {
    users: SearchUserResult[];
    fields: SearchFieldResult[];
    games: SearchGameResult[];
}

export const searchApi = {
    global: (q: string, token?: string) =>
        apiClient<GlobalSearchResults>(
            `/api/search/global?q=${encodeURIComponent(q)}`,
            { token }
        ),
};
