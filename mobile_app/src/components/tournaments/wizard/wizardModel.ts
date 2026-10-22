import { validateLimits } from '@joinup/shared/tournament/rosterRules';
import type {
    Tournament,
    TournamentFormat,
    TournamentInput,
    TournamentPatch,
    TournamentSport,
} from '@/types/tournament';

/** Editable wizard state (spec 3). Dates are real `Date`s so pickers can use them directly. */
export interface WizardState {
    title: string;
    sport: TournamentSport;
    description: string;
    startsAt: Date;
    endsAt: Date | null;
    fieldId: string | null;
    fieldName: string;
    customLocation: string;
    isPublic: boolean;
    minTeams: number;
    maxTeams: number;
    startersPerTeam: number;
    minPlayers: number;
    maxPlayers: number;
    format: TournamentFormat;
    pointsWin: number;
    pointsDraw: number;
    pointsLoss: number;
    tiebreak: string[];
    legs: 1 | 2;
    groupCount: number;
    advancePerGroup: number;
    thirdPlace: boolean;
    seeding: 'MANUAL' | 'RANDOM';
    bestOf: 3 | 5;
    matchMinutes: number;
    breakMinutes: number;
    minRestMinutes: number;
    forfeitWinner: number;
    forfeitLoser: number;
    regOpensAt: Date;
    regClosesAt: Date | null;
    rosterLockAt: Date | null;
    requireApproval: boolean;
}

export const ALL_TIEBREAKS = ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR', 'WINS', 'FAIR_PLAY', 'DRAW_LOT'] as const;
export const DEFAULT_TIEBREAK = ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR', 'DRAW_LOT'];
export const WIZARD_STEPS = ['basics', 'teams', 'format', 'registration', 'review'] as const;
export type WizardStepKey = (typeof WIZARD_STEPS)[number];

const DAY = 24 * 60 * 60 * 1000;

export function defaultWizardState(now = new Date()): WizardState {
    const start = new Date(now.getTime() + 14 * DAY);
    start.setMinutes(0, 0, 0);
    return {
        title: '',
        sport: 'SOCCER',
        description: '',
        startsAt: start,
        endsAt: null,
        fieldId: null,
        fieldName: '',
        customLocation: '',
        isPublic: true,
        minTeams: 4,
        maxTeams: 12,
        startersPerTeam: 5,
        minPlayers: 5,
        maxPlayers: 9,
        format: 'LEAGUE',
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        tiebreak: [...DEFAULT_TIEBREAK],
        legs: 1,
        groupCount: 2,
        advancePerGroup: 2,
        thirdPlace: false,
        seeding: 'RANDOM',
        bestOf: 3,
        matchMinutes: 30,
        breakMinutes: 10,
        minRestMinutes: 30,
        forfeitWinner: 3,
        forfeitLoser: 0,
        regOpensAt: now,
        regClosesAt: null,
        rosterLockAt: null,
        requireApproval: true,
    };
}

const toDate = (v?: string | null) => (v ? new Date(v) : null);

/** Fills the wizard from a loaded tournament (edit mode). Missing rules fall back to the defaults. */
export function wizardFromTournament(t: Tournament): WizardState {
    const d = defaultWizardState();
    const r = t.rules ?? {};
    return {
        ...d,
        title: t.title,
        sport: t.sport,
        description: t.description ?? '',
        startsAt: new Date(t.startsAt),
        endsAt: toDate(t.endsAt),
        fieldId: t.fieldId ?? null,
        customLocation: t.customLocation ?? '',
        isPublic: t.isPublic !== false,
        minTeams: t.minTeams ?? d.minTeams,
        maxTeams: t.maxTeams,
        startersPerTeam: t.startersPerTeam,
        minPlayers: t.minPlayersPerTeam,
        maxPlayers: t.maxPlayersPerTeam,
        format: t.format,
        pointsWin: r.points?.win ?? d.pointsWin,
        pointsDraw: r.points?.draw ?? d.pointsDraw,
        pointsLoss: r.points?.loss ?? d.pointsLoss,
        tiebreak: r.tiebreak?.length ? [...r.tiebreak] : d.tiebreak,
        legs: r.legs ?? d.legs,
        groupCount: r.groupCount ?? d.groupCount,
        advancePerGroup: r.advancePerGroup ?? d.advancePerGroup,
        thirdPlace: r.thirdPlace ?? d.thirdPlace,
        seeding: r.seeding ?? d.seeding,
        bestOf: r.bestOf ?? d.bestOf,
        matchMinutes: r.matchMinutes ?? d.matchMinutes,
        breakMinutes: r.breakMinutes ?? d.breakMinutes,
        minRestMinutes: r.minRestMinutes ?? d.minRestMinutes,
        forfeitWinner: r.forfeitScore?.winner ?? d.forfeitWinner,
        forfeitLoser: r.forfeitScore?.loser ?? d.forfeitLoser,
        regOpensAt: toDate(t.registrationOpensAt) ?? d.regOpensAt,
        regClosesAt: toDate(t.registrationClosesAt),
        rosterLockAt: toDate(t.rosterLockAt),
        requireApproval: t.requireApproval !== false,
    };
}

export type WizardErrors = Partial<Record<string, { key: string; params?: Record<string, unknown> }>>;

/** Field errors of one step (`wizard-error-{field}`); empty object = valid. Warnings are separate. */
export function validateStep(step: WizardStepKey, s: WizardState): WizardErrors {
    const e: WizardErrors = {};
    if (step === 'basics') {
        if (!s.title.trim()) e.title = { key: 'tournaments.wizard.err.required' };
        if (s.endsAt && s.endsAt < s.startsAt) e.endsAt = { key: 'tournaments.wizard.err.endBeforeStart' };
    }
    if (step === 'teams') {
        if (s.minTeams > s.maxTeams) e.teams = { key: 'tournaments.wizard.err.teamsMinOverMax' };
        for (const issue of validateLimits({
            minPlayers: s.minPlayers,
            maxPlayers: s.maxPlayers,
            startersPerTeam: s.startersPerTeam,
        })) {
            if (issue.code === 'MIN_GREATER_THAN_MAX') e.players = { key: 'tournaments.wizard.err.minOverMax' };
            else if (issue.code === 'STARTERS_EXCEED_MIN')
                e.starters = { key: 'tournaments.wizard.err.startersOverMin', params: { min: s.minPlayers } };
            else e.players = e.players ?? { key: 'tournaments.wizard.err.minOverMax' };
        }
    }
    if (step === 'registration') {
        if (s.regClosesAt && s.regClosesAt <= s.regOpensAt) e.regClosesAt = { key: 'tournaments.wizard.err.closeBeforeOpen' };
        if (s.rosterLockAt && s.regClosesAt && s.rosterLockAt < s.regClosesAt)
            e.rosterLockAt = { key: 'tournaments.wizard.err.lockBeforeClose' };
    }
    return e;
}

/** Soft problems for the review step: they do not block saving a draft. */
export function wizardWarnings(s: WizardState): string[] {
    const w: string[] = [];
    if (!s.regClosesAt) w.push('tournaments.wizard.warn.noRegClose');
    else if (s.regClosesAt > s.startsAt) w.push('tournaments.wizard.warn.closeAfterStart');
    return w;
}

/** True when the first hard error across all steps blocks publishing; returns that step or null. */
export function firstInvalidStep(s: WizardState): WizardStepKey | null {
    for (const step of WIZARD_STEPS) if (Object.keys(validateStep(step, s)).length) return step;
    return null;
}

/** Knockout bye count for the info row (spec 3.3). */
export function knockoutByes(teams: number): number {
    if (teams < 2) return 0;
    let p = 1;
    while (p < teams) p *= 2;
    return p - teams;
}

/** Match counts for the preview caption (spec 3.4); `null` when the format has no formula. */
export function matchCountPreview(s: WizardState): { count: number; extra?: number } | null {
    const n = s.maxTeams;
    if (s.format === 'LEAGUE') return { count: ((n * (n - 1)) / 2) * s.legs };
    if (s.format === 'KNOCKOUT') return { count: Math.max(0, n - 1) + (s.thirdPlace ? 1 : 0) };
    if (s.format === 'GROUPS_KNOCKOUT') {
        const g = Math.max(1, s.groupCount);
        const base = Math.floor(n / g);
        const rem = n % g;
        let groupMatches = 0;
        for (let i = 0; i < g; i += 1) {
            const size = base + (i < rem ? 1 : 0);
            groupMatches += ((size * (size - 1)) / 2) * s.legs;
        }
        const adv = g * s.advancePerGroup;
        return { count: groupMatches, extra: Math.max(0, adv - 1) + (s.thirdPlace ? 1 : 0) };
    }
    return null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : undefined);

function buildRules(s: WizardState): NonNullable<TournamentInput['rules']> {
    const rules: NonNullable<TournamentInput['rules']> = {
        matchMinutes: s.matchMinutes,
        breakMinutes: s.breakMinutes,
        minRestMinutes: s.minRestMinutes,
        forfeitScore: { winner: s.forfeitWinner, loser: s.forfeitLoser },
    };
    if (s.format === 'LEAGUE' || s.format === 'GROUPS_KNOCKOUT') {
        rules.points = { win: s.pointsWin, draw: s.pointsDraw, loss: s.pointsLoss };
        rules.tiebreak = s.tiebreak;
        rules.legs = s.legs;
    }
    if (s.format === 'GROUPS_KNOCKOUT') {
        rules.groupCount = s.groupCount;
        rules.advancePerGroup = s.advancePerGroup;
    }
    if (s.format === 'KNOCKOUT' || s.format === 'GROUPS_KNOCKOUT') {
        rules.thirdPlace = s.thirdPlace;
        rules.seeding = s.seeding;
    }
    if (s.sport === 'TENNIS') rules.bestOf = s.bestOf;
    return rules;
}

/** Payload for create (`TournamentInput`); `openToMinors` is never sent (the server forces false). */
export function wizardToInput(s: WizardState): TournamentInput {
    return {
        title: s.title.trim(),
        description: s.description.trim() || undefined,
        sport: s.sport,
        format: s.format,
        startsAt: s.startsAt.toISOString(),
        endsAt: iso(s.endsAt),
        fieldId: s.fieldId ?? undefined,
        customLocation: !s.fieldId && s.customLocation.trim() ? s.customLocation.trim() : undefined,
        isPublic: s.isPublic,
        registrationOpensAt: iso(s.regOpensAt),
        registrationClosesAt: iso(s.regClosesAt),
        rosterLockAt: iso(s.rosterLockAt),
        minTeams: s.minTeams,
        maxTeams: s.maxTeams,
        startersPerTeam: s.startersPerTeam,
        minPlayersPerTeam: s.minPlayers,
        maxPlayersPerTeam: s.maxPlayers,
        requireApproval: s.requireApproval,
        rules: buildRules(s),
    };
}

/** Same as the input but typed for PATCH; `force` is organizer-only ("change anyway"). */
export function wizardToPatch(s: WizardState, force?: boolean): TournamentPatch {
    return { ...wizardToInput(s), ...(force ? { force: true } : {}) };
}

/** Fields the server locks once a schedule exists (spec 3.6). */
export const STRUCTURE_FIELDS = ['format', 'limits', 'rules'] as const;
