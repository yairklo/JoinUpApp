import { useCallback, useRef, useState } from 'react';
import { tournamentsApi } from '@/services/api/tournaments';
import { useTournamentMutationRunner } from './useTournamentQuery';
import type {
    CreateMatchInput,
    CreateTeamInput,
    DownstreamFinishedState,
    ResultWarning,
    SaveMatchResultInput,
    SaveMatchResultResponse,
    ScheduleGenerateInput,
    StandingsOverrideInput,
    TeamDecision,
    TournamentAssignableRole,
    TournamentInput,
    TournamentPatch,
    TournamentStatus,
    UpdateMatchInput,
    UpdateTeamInput,
    VersionConflictState,
} from '@/types/tournament';

/*
 * Mutation hooks. All of them: resolve a fresh token, expose `pending`, and REJECT with the apiClient
 * error (`err.code`, `err.status`, `err.body`) so the screen maps it with utils/tournamentErrors.
 * None of them refetch: the server broadcasts `tournament:update` (the data hooks refetch on it) and
 * callers can also call the read hook's `refetch()` after success.
 */

function needId(id: string | undefined): string {
    if (!id) throw new Error('Missing tournamentId');
    return id;
}

/** Create / edit / status / roles (organizer and manager actions on the tournament itself). */
export function useTournamentAdminMutations(tournamentId?: string) {
    const { run, pending } = useTournamentMutationRunner();
    return {
        pending,
        create: (data: TournamentInput) => run((t) => tournamentsApi.create(data, t)),
        update: (data: TournamentPatch) => run((t) => tournamentsApi.update(needId(tournamentId), data, t)),
        /** `force` is organizer only (start with problems). A 409 `CANNOT_START` carries `body.problems`. */
        setStatus: (status: TournamentStatus, force?: boolean) =>
            run((t) => tournamentsApi.setStatus(needId(tournamentId), { status, force }, t)),
        listRoles: () => run((t) => tournamentsApi.listRoles(needId(tournamentId), t)),
        addRole: (userId: string, role: TournamentAssignableRole) =>
            run((t) => tournamentsApi.addRole(needId(tournamentId), { userId, role }, t)),
        removeRole: (userId: string) => run((t) => tournamentsApi.removeRole(needId(tournamentId), userId, t)),
    };
}

/** Team lifecycle for the captain, plus joining by code. */
export function useTeamMutations(tournamentId: string | undefined) {
    const { run, pending } = useTournamentMutationRunner();
    return {
        pending,
        /** Resolves `{ team, waitlisted }`; `team.status` says PENDING / APPROVED / WAITLISTED. */
        createTeam: (data: CreateTeamInput) => run((t) => tournamentsApi.createTeam(needId(tournamentId), data, t)),
        updateTeam: (teamId: string, data: UpdateTeamInput) =>
            run((t) => tournamentsApi.updateTeam(needId(tournamentId), teamId, data, t)),
        /** Withdraw (captain / manager). Resolves `{ ok, affectedMatchIds, promotedTeamIds }`. */
        withdrawTeam: (teamId: string) => run((t) => tournamentsApi.withdrawTeam(needId(tournamentId), teamId, t)),
        rotateJoinCode: (teamId: string) => run((t) => tournamentsApi.rotateJoinCode(needId(tournamentId), teamId, t)),
        /** Resolves `{ member, team }`. `INVALID_CODE` / `REGISTRATION_CLOSED` / `PLAYER_IN_OTHER_TEAM` are likely. */
        joinByCode: (joinCode: string) => run((t) => tournamentsApi.joinByCode(needId(tournamentId), joinCode, t)),
    };
}

/** Roster: invitations (captain/manager), the invitee's answer, jersey/role edits, removal / leaving. */
export function useRosterMutations(tournamentId: string | undefined) {
    const { run, pending } = useTournamentMutationRunner();
    return {
        pending,
        invite: (teamId: string, userId: string) =>
            run((t) => tournamentsApi.inviteMember(needId(tournamentId), teamId, userId, t)),
        /** The invitee answers. Accepting voids their other pending invites in that tournament. */
        respond: (teamId: string, userId: string, accept: boolean) =>
            run((t) => tournamentsApi.respondToInvite(needId(tournamentId), teamId, userId, accept, t)),
        updateMember: (teamId: string, userId: string, data: { jerseyNumber?: number | null; role?: 'PLAYER' | 'SUBSTITUTE' }) =>
            run((t) => tournamentsApi.updateMember(needId(tournamentId), teamId, userId, data, t)),
        /** Also used by a member to leave (their own userId). `CAPTAIN_CANNOT_LEAVE` for the captain. */
        remove: (teamId: string, userId: string) =>
            run((t) => tournamentsApi.removeMember(needId(tournamentId), teamId, userId, t)),
    };
}

/** Manager decisions on registered teams. Resolves `{ team, promotedTeamIds }`; `ROSTER_INVALID` / `TOURNAMENT_FULL` are likely. */
export function useTeamDecisions(tournamentId: string | undefined) {
    const { run, pending } = useTournamentMutationRunner();
    return {
        pending,
        decide: (teamId: string, decision: TeamDecision) =>
            run((t) => tournamentsApi.decideTeam(needId(tournamentId), teamId, decision, t)),
    };
}

/** Schedule builder and manual match edits (manager+). */
export function useScheduleMutations(tournamentId: string | undefined) {
    const { run, pending } = useTournamentMutationRunner();
    return {
        pending,
        /** Dry run. Resolves `{ preview: true, matches, conflicts, ... }`. */
        preview: (data: ScheduleGenerateInput) => run((t) => tournamentsApi.previewSchedule(needId(tournamentId), data, t)),
        /** Commit. Rejects `SCHEDULE_CONFLICTS` (see `scheduleConflicts(err)`) unless `data.allowConflicts`; `SCHEDULE_HAS_RESULTS` when locked. */
        generate: (data: ScheduleGenerateInput) => run((t) => tournamentsApi.generateSchedule(needId(tournamentId), data, t)),
        /** Rejects `SCHEDULE_CONFLICT` unless `data.force`. Resolves `{ match, conflicts }`. */
        createMatch: (data: CreateMatchInput) => run((t) => tournamentsApi.createMatch(needId(tournamentId), data, t)),
        updateMatch: (matchId: string, data: UpdateMatchInput) =>
            run((t) => tournamentsApi.updateMatch(needId(tournamentId), matchId, data, t)),
        /** `MATCH_REFERENCED` / `MATCH_FINISHED` when not deletable. */
        deleteMatch: (matchId: string) => run((t) => tournamentsApi.deleteMatch(needId(tournamentId), matchId, t)),
    };
}

/**
 * Saving a match result (scorekeeper+, tournament IN_PROGRESS) with optimistic locking.
 *
 * `save(input)` resolves the response on success. Two server answers do NOT throw but set state and
 * resolve `null`, because they drive dedicated UI (spec 12.5 / 12.6):
 *  - `versionConflict` = `{ currentVersion }` (409 VERSION_CONFLICT): someone else saved first.
 *    Refetch the match to show "theirs" (API gap 6), then `resolveKeepMine()` re-sends the same
 *    input at `currentVersion`, or `dismiss()` to drop yours.
 *  - `downstreamFinished` = `{ matchId, canForce }` (409 DOWNSTREAM_FINISHED): a later match that
 *    depends on this one is already played. Map `matchId` to its number through the schedule
 *    (`numberById`). `forceSave()` re-sends with `force: true` (organizer only, `canForce`).
 * Every other error rejects with the apiClient error (`NEEDS_PENALTIES`, `INVALID_*`, `NOT_IN_PROGRESS`,
 * `TEAMS_UNKNOWN`, ...). `warnings` holds the last response's soft warnings (e.g. PLAYER_SUM_EXCEEDS_SCORE).
 */
export function useSaveMatchResult(tournamentId: string | undefined, matchId: string | undefined) {
    const { run, pending } = useTournamentMutationRunner();
    const [versionConflict, setVersionConflict] = useState<VersionConflictState | null>(null);
    const [downstreamFinished, setDownstreamFinished] = useState<DownstreamFinishedState | null>(null);
    const [warnings, setWarnings] = useState<ResultWarning[]>([]);
    const lastInput = useRef<SaveMatchResultInput | null>(null);

    const dismiss = useCallback(() => {
        setVersionConflict(null);
        setDownstreamFinished(null);
    }, []);

    const save = useCallback(
        async (input: SaveMatchResultInput): Promise<SaveMatchResultResponse | null> => {
            if (!tournamentId || !matchId) throw new Error('Missing tournamentId or matchId');
            lastInput.current = input;
            setVersionConflict(null);
            setDownstreamFinished(null);
            try {
                const res = await run((t) => tournamentsApi.saveResult(tournamentId, matchId, input, t));
                setWarnings(res.warnings ?? []);
                return res;
            } catch (err: any) {
                if (err?.code === 'VERSION_CONFLICT') {
                    setVersionConflict({ currentVersion: Number(err.body?.currentVersion) });
                    return null;
                }
                if (err?.code === 'DOWNSTREAM_FINISHED') {
                    setDownstreamFinished({ matchId: String(err.body?.matchId ?? ''), canForce: err.body?.canForce === true });
                    return null;
                }
                throw err;
            }
        },
        [tournamentId, matchId, run]
    );

    /** After a VERSION_CONFLICT: re-send the last input on top of the newer version ("save mine"). */
    const resolveKeepMine = useCallback(async () => {
        const input = lastInput.current;
        if (!input || !versionConflict) return null;
        return save({ ...input, expectedVersion: versionConflict.currentVersion });
    }, [save, versionConflict]);

    /** After a DOWNSTREAM_FINISHED with `canForce`: re-send the last input with `force: true`. */
    const forceSave = useCallback(async () => {
        const input = lastInput.current;
        if (!input || !downstreamFinished?.canForce) return null;
        return save({ ...input, force: true });
    }, [save, downstreamFinished]);

    return { pending, save, versionConflict, downstreamFinished, warnings, resolveKeepMine, forceSave, dismiss };
}

/** Manager+: publish or clear a manual standings order for one group/league table. */
export function useStandingsOverride(tournamentId: string | undefined) {
    const { run, pending } = useTournamentMutationRunner();
    return {
        pending,
        save: (data: StandingsOverrideInput) => run((t) => tournamentsApi.putStandingsOverride(needId(tournamentId), data, t)),
        reset: (data: { stageId: string; groupId: string | null }) =>
            run((t) => tournamentsApi.deleteStandingsOverride(needId(tournamentId), data, t)),
    };
}
