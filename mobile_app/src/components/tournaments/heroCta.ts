import type { TournamentDetail } from '@/types/tournament';

export type HeroCtaKind = 'signIn' | 'register' | 'myTeam' | 'manageTeam' | 'enterScores' | 'manage';

export interface HeroCta {
    kind: HeroCtaKind;
    /** `tournaments.cta.*` key. */
    labelKey: string;
}

/**
 * Primary hero CTA per the role matrix (spec 0.8). Hide, never disable: returns `null` when the viewer
 * has no relevant action. Order of precedence: manager+ > scorekeeper > team member > register / sign in.
 * A cancelled tournament has no CTA. Guests only get "sign in to register" while registration is open.
 */
export function heroCta(t: TournamentDetail, signedIn: boolean): HeroCta | null {
    if (t.status === 'CANCELLED') return null;
    const caps = t.capabilities;
    if (caps?.canManage) return { kind: 'manage', labelKey: 'tournaments.cta.manage' };
    if (caps?.canScore && t.status === 'IN_PROGRESS') return { kind: 'enterScores', labelKey: 'tournaments.cta.enterScores' };
    const team = t.myTeam;
    if (team && team.status !== 'WITHDRAWN' && team.status !== 'REJECTED' && team.memberStatus === 'ACCEPTED') {
        return team.isCaptain
            ? { kind: 'manageTeam', labelKey: 'tournaments.cta.manageTeam' }
            : { kind: 'myTeam', labelKey: 'tournaments.cta.myTeam' };
    }
    if (!signedIn) return t.status === 'REGISTRATION_OPEN' ? { kind: 'signIn', labelKey: 'tournaments.cta.signIn' } : null;
    if (caps?.canRegisterTeam && !team) return { kind: 'register', labelKey: 'tournaments.cta.register' };
    return null;
}

/** Pending invite to a team (spec 0.8 "Invited"): the viewer is on the roster as INVITED. */
export function pendingInvite(t: TournamentDetail): { teamId: string; name: string } | null {
    const team = t.myTeam;
    return team && team.memberStatus === 'INVITED' ? { teamId: team.id, name: team.name } : null;
}
