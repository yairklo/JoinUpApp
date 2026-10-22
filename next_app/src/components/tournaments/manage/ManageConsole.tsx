"use client";

import { useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import { useTournamentSchedule } from "@/hooks/tournaments";
import type { TournamentDetail } from "@/types/tournament";
import TournamentStatusChip from "../TournamentStatusChip";
import UpdatedCue from "../UpdatedCue";
import RolesPanel from "./RolesPanel";
import ScheduleBuilder from "./ScheduleBuilder";
import StatusControls from "./StatusControls";
import TeamsQueue from "./TeamsQueue";

export type ManageSection = "teams" | "schedule" | "status" | "roles";

export interface ManageConsoleProps {
    tournament: TournamentDetail;
    /** Refetch the tournament (status changed). */
    onChanged?: () => void;
    /** Shows the "updated just now" pill (from useTournament). */
    updated?: boolean;
    initialSection?: ManageSection;
}

/**
 * Manage console frame (spec 11): dark "admin mode" strip, section tabs and the four sections.
 * The roles tab exists only with `capabilities.canManageRoles`. Render it only for `capabilities.canManage`.
 */
export default function ManageConsole({ tournament: t, onChanged, updated = false, initialSection = "teams" }: ManageConsoleProps) {
    const canRoles = t.capabilities.canManageRoles;
    const [section, setSection] = useState<ManageSection>(initialSection === "roles" && !canRoles ? "teams" : initialSection);
    const { matches } = useTournamentSchedule(t.id, {}, { live: false });

    return (
        <Container maxWidth="lg" sx={{ py: 2 }} data-testid="manage-console" dir="rtl">
            <Stack
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={(theme) => ({
                    px: 2,
                    py: 1.5,
                    mb: 2,
                    borderRadius: 3,
                    color: "common.white",
                    bgcolor: theme.palette.mode === "dark" ? alpha(theme.palette.common.white, 0.06) : "#111827",
                })}
            >
                <AdminPanelSettingsRoundedIcon sx={{ color: "warning.light" }} aria-hidden />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={800} noWrap>{`ניהול · ${t.title}`}</Typography>
                </Box>
                <TournamentStatusChip status={t.status} />
                <Button component={Link} href={`/tournaments/${t.id}`} size="small" color="inherit" sx={{ minHeight: 40 }} data-testid="manage-back">
                    לעמוד הטורניר
                </Button>
            </Stack>

            <Tabs value={section} onChange={(_, v) => setSection(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 1 }}>
                <Tab value="teams" label="קבוצות" data-testid="manage-tab-teams" />
                <Tab value="schedule" label="לוח משחקים" data-testid="manage-tab-schedule" />
                <Tab value="status" label="סטטוס" data-testid="manage-tab-status" />
                {canRoles && <Tab value="roles" label="הרשאות" data-testid="manage-tab-roles" />}
            </Tabs>
            <UpdatedCue show={updated} testId="manage-updated-cue" />

            <Box sx={{ pt: 1.5 }}>
                {section === "teams" && <TeamsQueue tournament={t} />}
                {section === "schedule" && <ScheduleBuilder tournament={t} />}
                {section === "status" && (
                    <StatusControls
                        tournament={t}
                        canForce={canRoles}
                        hasSchedule={matches.length > 0}
                        onChanged={onChanged}
                        onGoToSchedule={() => setSection("schedule")}
                        onGoToTeams={() => setSection("teams")}
                    />
                )}
                {section === "roles" && canRoles && <RolesPanel tournamentId={t.id} />}
            </Box>
        </Container>
    );
}
