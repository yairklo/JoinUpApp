export interface RosterLimits {
  minPlayers: number;
  maxPlayers: number;
  startersPerTeam: number;
}

export interface RosterRules extends RosterLimits {
  /** Minors rule as an input flag; the caller decides who is a minor. Default true. */
  allowMinors?: boolean;
  /** Default true. */
  requireCaptain?: boolean;
}

export interface RosterMember {
  userId: string;
  isMinor?: boolean;
  isStarter?: boolean;
}

export interface Roster {
  captainId?: string | null;
  members: RosterMember[];
}

export interface RosterContext {
  /** Default true. Set false while the team is still forming. */
  enforceMin?: boolean;
  /** Require exactly startersPerTeam members flagged isStarter. Default false. */
  requireStarters?: boolean;
  /** Players already on a team in this tournament: userId -> teamId. */
  memberships?: Record<string, string>;
  /** This team's id, so a player's own membership is not a clash. */
  teamId?: string;
}

export type RosterErrorCode =
  | 'DUPLICATE_PLAYER'
  | 'TOO_MANY_PLAYERS'
  | 'TOO_FEW_PLAYERS'
  | 'NO_CAPTAIN'
  | 'CAPTAIN_NOT_ON_ROSTER'
  | 'MINORS_NOT_ALLOWED'
  | 'PLAYER_IN_OTHER_TEAM'
  | 'TOO_MANY_STARTERS'
  | 'TOO_FEW_STARTERS';

export interface RosterError {
  code: RosterErrorCode;
  message: string;
  userId?: string;
}

export interface RosterValidation {
  valid: boolean;
  errors: RosterError[];
}

export type LimitsErrorCode =
  | 'INVALID_MIN_PLAYERS'
  | 'INVALID_MAX_PLAYERS'
  | 'INVALID_STARTERS'
  | 'MIN_GREATER_THAN_MAX'
  | 'STARTERS_EXCEED_MIN';

/** Organizer-configured limits; [] when valid. */
export function validateLimits(rules: Partial<RosterLimits>): { code: LimitsErrorCode; message: string }[];

/** Throws if `rules` fail validateLimits. */
export function validateRoster(roster: Roster, rules: RosterRules, context?: RosterContext): RosterValidation;

/** Validate the roster with `candidate` added (minimum not enforced). */
export function canAddMember(
  roster: Roster,
  rules: RosterRules,
  candidate: RosterMember,
  context?: RosterContext,
): RosterValidation;
