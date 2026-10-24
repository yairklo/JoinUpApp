import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DownstreamFinishedError,
    VersionConflictError,
    tournamentsApi,
} from '@/services/api/tournaments';
import type {
    CreateMatchInput,
    CreateTeamInput,
    CreateTournamentInput,
    PatchMatchInput,
    PatchMemberInput,
    PatchTeamInput,
    PatchTournamentInput,
    ResultWarning,
    SaveMatchResultInput,
    ScheduleGenerateInput,
    StandingsOverrideInput,
    TeamDecision,
    TournamentMatch,
    TournamentRole,
    TournamentStatus,
} from '@/types/tournament';
import { useAction } from './internal';

// All mutation hooks resolve to the result, or `undefined` on failure (never throw). The typed error is in
// `error` / `errorCode` (see TournamentApiError). They do not refetch: realtime events or the caller's `reload` do.

/** Create / edit a tournament, change its status, manage staff roles. */
export function useTournamentMutations() {
    const a = useAction();
    const { run } = a;
    const api = useMemo(
        () => ({
            create: (data: CreateTournamentInput) => run((t) => tournamentsApi.create(data, t)),
            patch: (id: string, data: PatchTournamentInput) => run((t) => tournamentsApi.patch(id, data, t)),
            /** `force` is organizer-only (CANNOT_START override). A CannotStartError carries `problems`. */
            setStatus: (id: string, status: TournamentStatus, force?: boolean) =>
                run((t) => tournamentsApi.setStatus(id, status, t, force)),
            addRole: (id: string, userId: string, role: Exclude<TournamentRole, 'ORGANIZER'>) =>
                run((t) => tournamentsApi.addRole(id, userId, role, t)),
            removeRole: (id: string, userId: string) => run((t) => tournamentsApi.removeRole(id, userId, t)),
        }),
        [run]
    );
    return { ...api, pending: a.pending, error: a.error, errorCode: a.errorCode, clearError: a.clearError };
}

/** Team lifecycle for a captain / manager: create, edit, withdraw, join code, join by code. */
export function useTeamMutations(tournamentId: string) {
    const a = useAction();
    const { run } = a;
    const api = useMemo(
        () => ({
            /** Resolves `{ team, waitlisted }`. */
            create: (data: CreateTeamInput) => run((t) => tournamentsApi.createTeam(tournamentId, data, t)),
            update: (teamId: string, data: PatchTeamInput) => run((t) => tournamentsApi.patchTeam(tournamentId, teamId, data, t)),
            withdraw: (teamId: string) => run((t) => tournamentsApi.withdrawTeam(tournamentId, teamId, t)),
            rotateJoinCode: (teamId: string) => run((t) => tournamentsApi.rotateJoinCode(tournamentId, teamId, t)),
            joinByCode: (joinCode: string) => run((t) => tournamentsApi.joinByCode(tournamentId, joinCode, t)),
        }),
        [run, tournamentId]
    );
    return { ...api, pending: a.pending, error: a.error, errorCode: a.errorCode, clearError: a.clearError };
}

/** Roster actions on one team: invite, respond (the invitee), edit jersey/role, remove. */
export function useRosterMutations(tournamentId: string, teamId: string) {
    const a = useAction();
    const { run } = a;
    const api = useMemo(
        () => ({
            invite: (userId: string) => run((t) => tournamentsApi.inviteMember(tournamentId, teamId, userId, t)),
            /** The invitee accepts/declines; `userId` is the current user's id. */
            respond: (userId: string, accept: boolean) =>
                run((t) => tournamentsApi.respondToInvite(tournamentId, teamId, userId, accept, t)),
            update: (userId: string, data: PatchMemberInput) =>
                run((t) => tournamentsApi.patchMember(tournamentId, teamId, userId, data, t)),
            remove: (userId: string) => run((t) => tournamentsApi.removeMember(tournamentId, teamId, userId, t)),
        }),
        [run, tournamentId, teamId]
    );
    return { ...api, pending: a.pending, error: a.error, errorCode: a.errorCode, clearError: a.clearError };
}

/** Manager decisions on the teams queue. Resolves `{ team, promotedTeamIds }`; ROSTER_INVALID / TOURNAMENT_FULL land in `errorCode`. */
export function useTeamDecision(tournamentId: string) {
    const a = useAction();
    const { run } = a;
    const decide = useCallback(
        (teamId: string, decision: TeamDecision) => run((t) => tournamentsApi.decideTeam(tournamentId, teamId, decision, t)),
        [run, tournamentId]
    );
    return { decide, pending: a.pending, error: a.error, errorCode: a.errorCode, clearError: a.clearError };
}

/** Schedule builder + manual match edits (manager+). Conflicts come back in the result or as a ScheduleConflictError. */
export function useScheduleMutations(tournamentId: string) {
    const a = useAction();
    const { run } = a;
    const api = useMemo(
        () => ({
            /** Dry run, nothing saved. */
            preview: (data: ScheduleGenerateInput) => run((t) => tournamentsApi.previewSchedule(tournamentId, data, t)),
            /** Commit. Retry with `allowConflicts: true` after a SCHEDULE_CONFLICTS error. */
            generate: (data: ScheduleGenerateInput) => run((t) => tournamentsApi.generateSchedule(tournamentId, data, t)),
            createMatch: (data: CreateMatchInput) => run((t) => tournamentsApi.createMatch(tournamentId, data, t)),
            updateMatch: (matchId: string, data: PatchMatchInput) =>
                run((t) => tournamentsApi.patchMatch(tournamentId, matchId, data, t)),
            deleteMatch: (matchId: string) => run((t) => tournamentsApi.deleteMatch(tournamentId, matchId, t)),
        }),
        [run, tournamentId]
    );
    return { ...api, pending: a.pending, error: a.error, errorCode: a.errorCode, clearError: a.clearError };
}

export type MatchResultStatus = 'idle' | 'saving' | 'saved' | 'VERSION_CONFLICT' | 'DOWNSTREAM_FINISHED' | 'error';

/** Result input without `expectedVersion`; the hook supplies it. */
export type SubmitResultInput = Omit<SaveMatchResultInput, 'expectedVersion' | 'force'>;

/**
 * Score entry for one match with optimistic locking.
 * `version` is the match's current `version` (pass it from the freshest schedule/bracket data); it is sent as
 * `expectedVersion`.
 *
 * `status` machine: idle -> saving -> saved | VERSION_CONFLICT | DOWNSTREAM_FINISHED | error.
 * - VERSION_CONFLICT: `conflict.currentVersion` is the server's version. Refetch the match (spec 19.6), show
 *   the conflict card, then call `rebase(newVersion)` and let the user resubmit (or `submit` again).
 * - DOWNSTREAM_FINISHED: `downstream = { matchId, canForce }`. If `canForce` (organizer), `submit(input, { force: true })`
 *   after the user confirms.
 * - saved: `match`, `changedMatchIds` (rows to flash) and `warnings` (soft, e.g. PLAYER_SUM_EXCEEDS_SCORE).
 */
export function useMatchResult(tournamentId: string, matchId: string, version: number) {
    const a = useAction();
    const { run } = a;
    const versionRef = useRef(version);
    const [status, setStatus] = useState<MatchResultStatus>('idle');
    const [conflict, setConflict] = useState<{ currentVersion: number | undefined } | null>(null);
    const [downstream, setDownstream] = useState<{ matchId: string | undefined; canForce: boolean } | null>(null);
    const [warnings, setWarnings] = useState<ResultWarning[]>([]);
    const [changedMatchIds, setChangedMatchIds] = useState<string[]>([]);
    const [match, setMatch] = useState<TournamentMatch | null>(null);

    // A fresh prop version (after a refetch) always wins over a stale rebase.
    useEffect(() => {
        versionRef.current = version;
    }, [version, matchId]);

    const submit = useCallback(
        async (input: SubmitResultInput, opts: { force?: boolean } = {}) => {
            setStatus('saving');
            setConflict(null);
            setDownstream(null);
            const payload: SaveMatchResultInput = { ...input, expectedVersion: versionRef.current };
            if (opts.force) payload.force = true;
            const res = await run((t) => tournamentsApi.saveResult(tournamentId, matchId, payload, t));
            if (res) {
                versionRef.current = res.match.version;
                setMatch(res.match);
                setWarnings(res.warnings ?? []);
                setChangedMatchIds(res.changedMatchIds ?? []);
                setStatus('saved');
            }
            return res;
        },
        [run, tournamentId, matchId]
    );

    const err = a.error;
    useEffect(() => {
        if (!err) return;
        if (err instanceof VersionConflictError) {
            setConflict({ currentVersion: err.currentVersion });
            setStatus('VERSION_CONFLICT');
        } else if (err instanceof DownstreamFinishedError) {
            setDownstream({ matchId: err.matchId, canForce: err.canForce });
            setStatus('DOWNSTREAM_FINISHED');
        } else {
            setStatus('error');
        }
    }, [err]);

    /** Adopt the server's newer version after a conflict, clearing the conflict state. */
    const rebase = useCallback(
        (newVersion: number) => {
            versionRef.current = newVersion;
            setConflict(null);
            setStatus('idle');
            a.clearError();
        },
        [a]
    );

    const reset = useCallback(() => {
        setStatus('idle');
        setConflict(null);
        setDownstream(null);
        setWarnings([]);
        setChangedMatchIds([]);
        a.clearError();
    }, [a]);

    return {
        submit,
        rebase,
        reset,
        status,
        saving: a.pending,
        conflict,
        downstream,
        warnings,
        changedMatchIds,
        match,
        error: a.error,
        errorCode: a.errorCode,
    };
}

/** Manager+: publish or clear a manual standings order for one group/league table. */
export function useStandingsOverride(tournamentId: string) {
    const a = useAction();
    const { run } = a;
    const api = useMemo(
        () => ({
            save: (data: StandingsOverrideInput) => run((t) => tournamentsApi.putStandingsOverride(tournamentId, data, t)),
            reset: (data: { stageId: string; groupId: string | null }) =>
                run((t) => tournamentsApi.deleteStandingsOverride(tournamentId, data, t)),
        }),
        [run, tournamentId]
    );
    return { ...api, pending: a.pending, error: a.error, errorCode: a.errorCode, clearError: a.clearError };
}
