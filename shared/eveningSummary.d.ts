export type ResultLineupMode = 'FIXED_TEAMS' | 'ROTATING_LINEUPS';

export interface EveningScorer {
  userId: string;
  goals: number;
}

export interface EveningSummarySide {
  teamId?: string | null;
  label?: string;
  score?: number;
  outcome?: 'WIN' | 'DRAW' | 'LOSS';
  order?: number;
  players?: EveningScorer[];
}

export interface EveningSummaryRound {
  sides: EveningSummarySide[];
}

export interface EveningRosterPerson {
  userId: string;
  teamId?: string | null;
}

export interface EveningTeamStanding {
  teamId: string | null;
  label: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface EveningPlayerStanding {
  userId: string;
  rounds: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
}

export interface EveningSummary {
  teams: EveningTeamStanding[];
  players: EveningPlayerStanding[];
}

export interface EveningFormSide {
  label: string;
  teamId: string | null;
  score: number;
  playerIds: string[];
  goals: Record<string, number>;
}

export interface EveningForm {
  lineupMode: ResultLineupMode;
  notes: string;
  rounds: Array<{ sides: [EveningFormSide, EveningFormSide] | EveningFormSide[] }>;
  roster?: EveningRosterPerson[];
}

export interface EveningFormError {
  code: 'NO_ROUNDS' | 'TOO_MANY_ROUNDS' | 'INVALID_SIDES' | 'SAME_TEAM' | 'EMPTY_SIDE' | 'DUPLICATE_PLAYER';
  index?: number;
}

export interface EveningTeamOption {
  id: string;
  name: string;
  playerIds?: string[];
}

export const MAX_ROUNDS: number;
export const LINEUP_MODES: ResultLineupMode[];

export function expandFixedRounds(rounds: EveningSummaryRound[], roster?: EveningRosterPerson[]): EveningSummaryRound[];
export function summarizeEvening(input: {
  lineupMode?: ResultLineupMode | null;
  rounds?: EveningSummaryRound[];
  roster?: EveningRosterPerson[];
}): EveningSummary;
export function suggestNextRound(input: {
  lineupMode?: ResultLineupMode | null;
  rounds?: EveningSummaryRound[];
  teams?: EveningTeamOption[];
}): { sides: EveningSummarySide[] } | null;
export function rosterFromTeams(
  roster: Array<{ userId: string; teamId?: string | null }>,
  teams?: EveningTeamOption[],
): EveningRosterPerson[];
export function initEveningForm(input: {
  result?: {
    lineupMode?: ResultLineupMode | null;
    notes?: string | null;
    rounds?: EveningSummaryRound[];
    sides?: EveningSummarySide[];
  } | null;
  teams?: EveningTeamOption[];
  roster?: EveningRosterPerson[];
}): EveningForm;
export function appendEveningRound(form: EveningForm, teams?: EveningTeamOption[]): EveningForm;
export function removeEveningRound(form: EveningForm, index: number): EveningForm;
export function setEveningLineupMode(
  form: EveningForm,
  mode: ResultLineupMode,
  teams?: EveningTeamOption[],
  roster?: EveningRosterPerson[],
): EveningForm;
export function eveningFormErrors(form: EveningForm): EveningFormError[];
export function toEveningResultBody(form: EveningForm): {
  lineupMode: ResultLineupMode;
  notes: string | null;
  rounds: Array<{ sides: Array<{ label: string; teamId: string | null; score: number; players: EveningScorer[] }> }>;
};
