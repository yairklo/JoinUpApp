import { validateLimits } from "@joinup/shared/tournament/rosterRules";
import type {
    CreateTournamentInput,
    Tournament,
    TournamentFormat,
    TournamentRules,
    TournamentSport,
} from "@/types/tournament";

export const WIZARD_STEP_TITLES = ["פרטים בסיסיים", "קבוצות והרכבים", "מבנה וחוקים", "הרשמה", "סקירה ופרסום"] as const;

export const TIEBREAK_KEYS = ["HEAD_TO_HEAD", "GOAL_DIFFERENCE", "GOALS_FOR", "WINS", "FAIR_PLAY", "DRAW_LOT"] as const;
export type TiebreakKey = (typeof TIEBREAK_KEYS)[number];
export const DEFAULT_TIEBREAK: TiebreakKey[] = ["HEAD_TO_HEAD", "GOAL_DIFFERENCE", "GOALS_FOR"];

/** Form state. Dates are `YYYY-MM-DDTHH:mm` strings (datetime-local); '' = not set. */
export interface WizardValues {
    title: string;
    sport: TournamentSport;
    description: string;
    imageUrl: string;
    startsAt: string;
    endsAt: string;
    fieldId: string;
    fieldName: string;
    customLocation: string;
    isPublic: boolean;
    minTeams: number;
    maxTeams: number;
    startersPerTeam: number;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    format: TournamentFormat;
    pointsWin: number;
    pointsDraw: number;
    pointsLoss: number;
    tiebreak: TiebreakKey[];
    legs: 1 | 2;
    groupCount: number;
    advancePerGroup: number;
    thirdPlace: boolean;
    seeding: "MANUAL" | "RANDOM";
    bestOf: 3 | 5;
    matchMinutes: number;
    breakMinutes: number;
    minRestMinutes: number;
    forfeitWinner: number;
    forfeitLoser: number;
    registrationOpensAt: string;
    registrationClosesAt: string;
    rosterLockAt: string;
    requireApproval: boolean;
}

export const SPORT_DEFAULTS: Record<TournamentSport, { starters: number; min: number; max: number; matchMinutes: number }> = {
    SOCCER: { starters: 5, min: 5, max: 9, matchMinutes: 40 },
    BASKETBALL: { starters: 5, min: 5, max: 10, matchMinutes: 40 },
    TENNIS: { starters: 1, min: 1, max: 2, matchMinutes: 60 },
};

export function defaultValues(): WizardValues {
    const d = SPORT_DEFAULTS.SOCCER;
    return {
        title: "",
        sport: "SOCCER",
        description: "",
        imageUrl: "",
        startsAt: "",
        endsAt: "",
        fieldId: "",
        fieldName: "",
        customLocation: "",
        isPublic: true,
        minTeams: 4,
        maxTeams: 12,
        startersPerTeam: d.starters,
        minPlayersPerTeam: d.min,
        maxPlayersPerTeam: d.max,
        format: "LEAGUE",
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        tiebreak: [...DEFAULT_TIEBREAK],
        legs: 1,
        groupCount: 2,
        advancePerGroup: 2,
        thirdPlace: false,
        seeding: "MANUAL",
        bestOf: 3,
        matchMinutes: d.matchMinutes,
        breakMinutes: 0,
        minRestMinutes: 0,
        forfeitWinner: 3,
        forfeitLoser: 0,
        registrationOpensAt: "",
        registrationClosesAt: "",
        rosterLockAt: "",
        requireApproval: true,
    };
}

// ---- date helpers (browser-local time) ----

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant -> `YYYY-MM-DDTHH:mm` in local time; '' for empty/invalid. */
export function isoToLocalInput(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` (local) -> ISO; undefined when empty/invalid. */
export function localInputToIso(s: string): string | undefined {
    if (!s) return undefined;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const ts = (s: string) => (s ? new Date(s).getTime() : NaN);

// ---- derived numbers ----

export function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

/** Byes in the first knockout round for `n` teams (0 when n is a power of two). */
export function knockoutByes(n: number): number {
    return n >= 2 ? nextPow2(n) - n : 0;
}

const pairs = (n: number) => (n * (n - 1)) / 2;

/** Live caption under the format cards (spec 3.4). Null for CUSTOM or invalid input. */
export function matchCountText(
    v: Pick<WizardValues, "format" | "maxTeams" | "legs" | "groupCount" | "advancePerGroup" | "thirdPlace">
): string | null {
    const n = v.maxTeams;
    if (!Number.isFinite(n) || n < 2) return null;
    const extra = v.thirdPlace ? 1 : 0;
    switch (v.format) {
        case "LEAGUE":
            return `עם ${n} קבוצות: ${pairs(n) * v.legs} משחקים בליגה`;
        case "KNOCKOUT":
            return `עם ${n} קבוצות: ${n - 1 + extra} משחקים בנוקאאוט`;
        case "GROUPS_KNOCKOUT": {
            const g = Math.max(1, v.groupCount);
            const base = Math.floor(n / g);
            const rem = n % g;
            let groupMatches = 0;
            for (let i = 0; i < g; i++) groupMatches += pairs(base + (i < rem ? 1 : 0)) * v.legs;
            const advancing = g * v.advancePerGroup;
            const ko = advancing >= 2 ? advancing - 1 + extra : 0;
            return `בתים: ${g} בתים של כ-${Math.ceil(n / g)} · ${groupMatches} משחקים + ${ko} בנוקאאוט`;
        }
        default:
            return null;
    }
}

// ---- validation ----

export type WizardErrors = Partial<Record<string, string>>;

export function validateTeamsStep(v: WizardValues): WizardErrors {
    const e: WizardErrors = {};
    const limits = validateLimits({
        minPlayers: v.minPlayersPerTeam,
        maxPlayers: v.maxPlayersPerTeam,
        startersPerTeam: v.startersPerTeam,
    });
    for (const l of limits) {
        if (l.code === "MIN_GREATER_THAN_MAX") e.players = "המינימום גדול מהמקסימום";
        else if (l.code === "STARTERS_EXCEED_MIN")
            e.starters = `בהרכב לא יכולים להיות יותר שחקנים מהמינימום בקבוצה (${v.minPlayersPerTeam})`;
        else if (l.code === "INVALID_STARTERS") e.starters = "מספר השחקנים בהרכב לא תקין";
        else if (l.code === "INVALID_MIN_PLAYERS") e.players = "מינימום שחקנים לא תקין";
        else if (l.code === "INVALID_MAX_PLAYERS") e.players = "מקסימום שחקנים לא תקין";
    }
    if (!(v.minTeams >= 2)) e.teams = "מספר הקבוצות המינימלי הוא 2";
    else if (v.minTeams > v.maxTeams) e.teams = "מספר הקבוצות המינימלי גדול מהמקסימלי";
    return e;
}

export function validateStep(step: number, v: WizardValues): WizardErrors {
    const e: WizardErrors = {};
    if (step === 1) {
        const title = v.title.trim();
        if (!title) e.title = "יש להזין שם לטורניר";
        else if (title.length > 80) e.title = "השם יכול להכיל עד 80 תווים";
        if (v.description.length > 2000) e.description = "התיאור יכול להכיל עד 2000 תווים";
        if (!v.startsAt || Number.isNaN(ts(v.startsAt))) e.startsAt = "יש לבחור מועד התחלה";
        if (v.endsAt && !(ts(v.endsAt) > ts(v.startsAt))) e.endsAt = "מועד הסיום חייב להיות אחרי ההתחלה";
    } else if (step === 2) {
        Object.assign(e, validateTeamsStep(v));
    } else if (step === 3) {
        for (const k of ["pointsWin", "pointsDraw", "pointsLoss"] as const) {
            if (v[k] < -10 || v[k] > 10) e.points = "נקודות בין -10 ל-10";
        }
        if (v.format === "GROUPS_KNOCKOUT") {
            if (v.groupCount < 1 || v.groupCount > 16) e.groupCount = "מספר הבתים בין 1 ל-16";
            else if (v.groupCount > v.maxTeams) e.groupCount = "מספר הבתים גדול ממספר הקבוצות";
            if (v.advancePerGroup < 1 || v.advancePerGroup > 16) e.advancePerGroup = "מספר העולות בין 1 ל-16";
            else if (v.groupCount * v.advancePerGroup < 2) e.advancePerGroup = "לפחות 2 קבוצות צריכות לעלות";
        }
        if (v.matchMinutes < 1) e.matchMinutes = "משך משחק חייב להיות חיובי";
    } else if (step === 4) {
        const open = ts(v.registrationOpensAt);
        const close = ts(v.registrationClosesAt);
        const lock = ts(v.rosterLockAt);
        if (!Number.isNaN(open) && !Number.isNaN(close) && close <= open) e.registrationClosesAt = "הסגירה חייבת להיות אחרי הפתיחה";
        if (!Number.isNaN(lock) && !Number.isNaN(close) && lock < close)
            e.rosterLockAt = "נעילת הסגל חייבת להיות אחרי סגירת ההרשמה או בדיוק בה";
    }
    return e;
}

/** Hard errors across steps 1-4; publishing additionally needs a registration close time. */
export function validateAll(v: WizardValues, publish: boolean): { step: number; errors: WizardErrors }[] {
    const out: { step: number; errors: WizardErrors }[] = [];
    for (let s = 1; s <= 4; s++) {
        const errors = validateStep(s, v);
        if (publish && s === 4 && !v.registrationClosesAt && !errors.registrationClosesAt)
            errors.registrationClosesAt = "יש לקבוע מועד סגירת הרשמה לפני פרסום";
        if (Object.keys(errors).length) out.push({ step: s, errors });
    }
    return out;
}

/** Soft problems for the review step (spec 3.5/3.6). */
export function reviewWarnings(v: WizardValues): string[] {
    const w: string[] = [];
    if (!v.registrationClosesAt) w.push("לא נקבע מועד סגירת הרשמה");
    const close = ts(v.registrationClosesAt);
    const start = ts(v.startsAt);
    if (!Number.isNaN(close) && !Number.isNaN(start) && close > start) w.push("ההרשמה נסגרת אחרי תחילת הטורניר");
    if (v.format === "KNOCKOUT" && knockoutByes(v.maxTeams) > 0)
        w.push(`עם ${v.maxTeams} קבוצות יהיו ${knockoutByes(v.maxTeams)} פטורים בסיבוב הראשון`);
    return w;
}

// ---- mapping ----

export function buildRules(v: WizardValues): TournamentRules {
    const rules: TournamentRules = {
        matchMinutes: v.matchMinutes,
        breakMinutes: v.breakMinutes,
        minRestMinutes: v.minRestMinutes,
        forfeitScore: { winner: v.forfeitWinner, loser: v.forfeitLoser },
    };
    if (v.format === "LEAGUE" || v.format === "GROUPS_KNOCKOUT") {
        rules.points = { win: v.pointsWin, draw: v.pointsDraw, loss: v.pointsLoss };
        rules.tiebreak = v.tiebreak;
        rules.legs = v.legs;
    }
    if (v.format === "KNOCKOUT" || v.format === "GROUPS_KNOCKOUT") {
        rules.thirdPlace = v.thirdPlace;
        rules.seeding = v.seeding;
    }
    if (v.format === "GROUPS_KNOCKOUT") {
        rules.groupCount = v.groupCount;
        rules.advancePerGroup = v.advancePerGroup;
    }
    if (v.sport === "TENNIS") rules.bestOf = v.bestOf;
    return rules;
}

export function toCreateInput(v: WizardValues): CreateTournamentInput {
    const input: CreateTournamentInput = {
        title: v.title.trim(),
        sport: v.sport,
        format: v.format,
        startsAt: localInputToIso(v.startsAt) as string,
        isPublic: v.isPublic,
        openToMinors: false,
        minTeams: v.minTeams,
        maxTeams: v.maxTeams,
        startersPerTeam: v.startersPerTeam,
        minPlayersPerTeam: v.minPlayersPerTeam,
        maxPlayersPerTeam: v.maxPlayersPerTeam,
        requireApproval: v.requireApproval,
        rules: buildRules(v),
    };
    if (v.description.trim()) input.description = v.description.trim();
    if (v.imageUrl) input.imageUrl = v.imageUrl;
    const endsAt = localInputToIso(v.endsAt);
    if (endsAt) input.endsAt = endsAt;
    const opens = localInputToIso(v.registrationOpensAt);
    if (opens) input.registrationOpensAt = opens;
    const closes = localInputToIso(v.registrationClosesAt);
    if (closes) input.registrationClosesAt = closes;
    const lock = localInputToIso(v.rosterLockAt);
    if (lock) input.rosterLockAt = lock;
    if (v.fieldId) input.fieldId = v.fieldId;
    else if (v.customLocation.trim()) input.customLocation = v.customLocation.trim();
    return input;
}

export function fromTournament(t: Tournament): WizardValues {
    const d = defaultValues();
    const r = t.rules ?? {};
    const tb = (r.tiebreak ?? []).filter((k): k is TiebreakKey => (TIEBREAK_KEYS as readonly string[]).includes(k));
    return {
        ...d,
        title: t.title,
        sport: t.sport,
        description: t.description ?? "",
        imageUrl: t.imageUrl ?? "",
        startsAt: isoToLocalInput(t.startsAt),
        endsAt: isoToLocalInput(t.endsAt),
        fieldId: t.fieldId ?? "",
        customLocation: t.customLocation ?? "",
        isPublic: t.isPublic,
        minTeams: t.minTeams,
        maxTeams: t.maxTeams,
        startersPerTeam: t.startersPerTeam,
        minPlayersPerTeam: t.minPlayersPerTeam,
        maxPlayersPerTeam: t.maxPlayersPerTeam,
        format: t.format,
        pointsWin: r.points?.win ?? d.pointsWin,
        pointsDraw: r.points?.draw ?? d.pointsDraw,
        pointsLoss: r.points?.loss ?? d.pointsLoss,
        tiebreak: tb.length ? tb : d.tiebreak,
        legs: r.legs ?? 1,
        groupCount: r.groupCount ?? d.groupCount,
        advancePerGroup: r.advancePerGroup ?? d.advancePerGroup,
        thirdPlace: r.thirdPlace ?? false,
        seeding: r.seeding ?? "MANUAL",
        bestOf: r.bestOf ?? 3,
        matchMinutes: r.matchMinutes ?? d.matchMinutes,
        breakMinutes: r.breakMinutes ?? 0,
        minRestMinutes: r.minRestMinutes ?? 0,
        forfeitWinner: r.forfeitScore?.winner ?? 3,
        forfeitLoser: r.forfeitScore?.loser ?? 0,
        registrationOpensAt: isoToLocalInput(t.registrationOpensAt),
        registrationClosesAt: isoToLocalInput(t.registrationClosesAt),
        rosterLockAt: isoToLocalInput(t.rosterLockAt),
        requireApproval: t.requireApproval,
    };
}
