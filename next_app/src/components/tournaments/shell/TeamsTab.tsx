"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import TeamBadge from "../TeamBadge";
import UpdatedCue from "../UpdatedCue";
import MatchCard from "../MatchCard";
import { TabEmpty, TabError, TabSkeleton } from "../tabs/TabStates";
import { useTournamentSchedule, useTournamentTeams } from "@/hooks/tournaments";
import type { TeamMember, TournamentDetail, TournamentTeam } from "@/types/tournament";
import { shortDate } from "./shellModel";

const ROLE_ORDER = { CAPTAIN: 0, PLAYER: 1, SUBSTITUTE: 2 } as const;
const ROLE_LABEL = { CAPTAIN: "קפטן", PLAYER: "שחקן", SUBSTITUTE: "מחליף" } as const;

function groupLabel(groupId: string | null | undefined, names: ReadonlyMap<string, string>): string | null {
    if (!groupId) return null;
    const n = names.get(groupId);
    return n ? `בית ${n}` : null;
}

function TeamRow({ team, mine, group, wide, manager, onOpen }: { team: TournamentTeam; mine: boolean; group: string | null; wide: boolean; manager: boolean; onOpen: () => void }) {
    const withdrawn = team.status === "WITHDRAWN";
    return (
        <ButtonBase
            onClick={onOpen}
            data-testid={`team-card-${team.id}`}
            sx={(theme) => ({
                width: "100%",
                textAlign: "start",
                justifyContent: "flex-start",
                gap: 1.5,
                px: 2.25,
                py: 1.25,
                minHeight: wide ? 88 : 68,
                borderRadius: 2.5,
                border: "1px solid",
                borderColor: mine ? "primary.main" : "divider",
                bgcolor: "background.paper",
                boxShadow: theme.shadows[1],
                opacity: withdrawn ? 0.6 : 1,
                transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: theme.shadows[2],
                    borderColor: mine ? "primary.main" : alpha(theme.palette.primary.main, 0.35),
                },
            })}
        >
            <TeamBadge team={team} size={wide ? 40 : 32} lines={2} strikeThrough={withdrawn} testId={`team-badge-${team.id}`} />
            <Box sx={{ flex: 1 }} />
            <Stack alignItems="flex-end" spacing={0.5}>
                {mine && <Chip size="small" color="primary" variant="outlined" label="הקבוצה שלך" sx={{ fontWeight: 700 }} />}
                {group && <Chip size="small" variant="outlined" label={group} sx={{ fontWeight: 600 }} />}
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{team.memberCount === 1 ? "שחקן אחד" : `${team.memberCount} שחקנים`}</Typography>
                {manager && team.seed != null && <Typography variant="caption" color="text.secondary" fontWeight={700}>{`#${team.seed}`}</Typography>}
            </Stack>
            {!wide && <ChevronLeftRounded aria-hidden color="disabled" />}
        </ButtonBase>
    );
}

function Roster({ members }: { members: TeamMember[] }) {
    const sorted = useMemo(
        () => [...members].filter((m) => m.status === "ACCEPTED").sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]),
        [members]
    );
    if (sorted.length === 0) return <Typography color="text.secondary">עוד אין שחקנים בהרכב.</Typography>;
    return (
        <Stack spacing={1} component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
            {sorted.map((m) => (
                <Stack
                    key={m.userId}
                    component="li"
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    data-testid={`team-sheet-member-${m.userId}`}
                    sx={{ p: 1, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
                >
                    <Avatar src={m.imageUrl ?? undefined} alt="" sx={{ width: 34, height: 34 }} />
                    <Typography sx={{ flex: 1, fontWeight: 600 }} noWrap>{m.name}</Typography>
                    {m.jerseyNumber != null && <Typography variant="caption" color="text.secondary" fontWeight={700}>{`#${m.jerseyNumber}`}</Typography>}
                    {m.role !== "PLAYER" && <Chip size="small" label={ROLE_LABEL[m.role]} sx={{ fontWeight: 600 }} />}
                </Stack>
            ))}
        </Stack>
    );
}

function TeamSheet({ tournamentId, team, onClose, phone }: { tournamentId: string; team: TournamentTeam | null; onClose: () => void; phone: boolean }) {
    const { matches, matchNumberById, groupNameById } = useTournamentSchedule(tournamentId, team ? { teamId: team.id } : {}, { live: false });
    const context = useMemo(() => ({ matchNumberById, groupNameById, locale: "he" as const }), [matchNumberById, groupNameById]);
    const shown = team ? matches.slice(0, 3) : [];
    return (
        <Drawer
            anchor={phone ? "bottom" : "left"}
            open={!!team}
            onClose={onClose}
            PaperProps={{ sx: phone ? { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85vh" } : { width: 400, maxWidth: "100vw" }, dir: "rtl" }}
            data-testid="team-sheet"
        >
            {team && (
                <Stack spacing={2.5} sx={{ p: 2.5 }}>
                    <TeamBadge team={team} size={40} lines={2} testId="team-sheet-badge" />
                    <Roster members={team.members ?? []} />
                    {shown.length > 0 && (
                        <Stack spacing={1.25}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>משחקי הקבוצה</Typography>
                            {shown.map((m) => (
                                <MatchCard key={m.id} match={m} context={context} myTeamId={team.id} href={`/tournaments/${tournamentId}/matches/${m.id}`} />
                            ))}
                        </Stack>
                    )}
                    <Button component={Link} href={`/tournaments/${tournamentId}/team/${team.id}`} variant="outlined" sx={{ minHeight: 44 }}>
                        לעמוד הקבוצה
                    </Button>
                </Stack>
            )}
        </Drawer>
    );
}

/** Teams tab (spec 6): grid on desktop, list on phones, grouped by group, withdrawn last, detail sheet. */
export default function TeamsTab({ tournament, registerHref }: { tournament: TournamentDetail; registerHref?: string }) {
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up("md"));
    const phone = useMediaQuery(theme.breakpoints.down("sm"));
    const { teams, loading, error, reload, updated } = useTournamentTeams(tournament.id);
    const { stages, groupNameById } = useTournamentSchedule(tournament.id, {}, { live: false });
    const [openId, setOpenId] = useState<string | null>(null);
    const myId = tournament.myTeam?.id ?? null;
    const manager = tournament.capabilities.canManage;

    const { active, withdrawn } = useMemo(() => {
        const act = teams.filter((t) => t.status !== "WITHDRAWN");
        act.sort((a, b) => Number(b.id === myId) - Number(a.id === myId) || (a.seed ?? 999) - (b.seed ?? 999) || a.name.localeCompare(b.name, "he"));
        return { active: act, withdrawn: teams.filter((t) => t.status === "WITHDRAWN") };
    }, [teams, myId]);
    const sections = useMemo(() => {
        const hasGroups = stages.some((s) => s.groups.length > 0);
        if (!hasGroups) return [{ key: "all", title: null as string | null, items: active }];
        const out: Array<{ key: string; title: string | null; items: TournamentTeam[] }> = [];
        for (const g of stages.flatMap((s) => s.groups)) {
            const items = active.filter((t) => t.groupId === g.id);
            if (items.length) out.push({ key: g.id, title: `בית ${g.name}`, items });
        }
        const rest = active.filter((t) => !t.groupId);
        if (rest.length) out.push({ key: "rest", title: null, items: rest });
        return out;
    }, [stages, active]);

    if (loading && teams.length === 0) return <div data-testid="teams-tab"><TabSkeleton rows={6} height={wide ? 88 : 68} /></div>;
    if (error && teams.length === 0) return <div data-testid="teams-tab"><TabError error={error} onRetry={reload} /></div>;

    const gridSx = wide ? { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 } : { display: "grid", gap: 1.25 };
    const open = teams.find((t) => t.id === openId) ?? null;

    if (teams.length === 0) {
        const before = tournament.status === "DRAFT" || (tournament.registrationOpensAt && new Date(tournament.registrationOpensAt) > new Date());
        return (
            <div data-testid="teams-tab">
                <TabEmpty
                    testId="teams-empty"
                    action={registerHref && !before ? <Button component={Link} href={registerHref} variant="contained">רישום קבוצה</Button> : undefined}
                >
                    {before && tournament.registrationOpensAt ? `עוד אין קבוצות. ההרשמה תיפתח ב-${shortDate(tournament.registrationOpensAt)}.` : "עוד אין קבוצות רשומות. היו הראשונים!"}
                </TabEmpty>
            </div>
        );
    }

    return (
        <Stack spacing={3} data-testid="teams-tab">
            <UpdatedCue show={updated} />
            {sections.map((s) => (
                <Box key={s.key}>
                    {s.title && <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.25 }}>{s.title}</Typography>}
                    <Box sx={gridSx}>
                        {s.items.map((t) => (
                            <TeamRow key={t.id} team={t} mine={t.id === myId} group={s.title ? null : groupLabel(t.groupId, groupNameById)} wide={wide} manager={manager} onOpen={() => setOpenId(t.id)} />
                        ))}
                    </Box>
                </Box>
            ))}
            {withdrawn.length > 0 && (
                <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.25 }} color="text.secondary">יצאו מהטורניר</Typography>
                    <Box sx={gridSx}>
                        {withdrawn.map((t) => (
                            <TeamRow key={t.id} team={t} mine={false} group={null} wide={wide} manager={false} onOpen={() => setOpenId(t.id)} />
                        ))}
                    </Box>
                </Box>
            )}
            {manager && (
                <Button component={Link} href={`/tournaments/${tournament.id}/manage`} size="small" variant="outlined" sx={{ alignSelf: "flex-start" }}>
                    ניהול תור הקבוצות
                </Button>
            )}
            <TeamSheet tournamentId={tournament.id} team={open} onClose={() => setOpenId(null)} phone={phone} />
        </Stack>
    );
}
