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
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
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
                alignItems="flex-start"
                spacing={1.5}
                sx={(theme) => ({
                    px: { xs: 2, md: 2.5 },
                    py: { xs: 1.75, md: 2 },
                    mb: 2,
                    borderRadius: 4,
                    color: "common.white",
                    position: "relative",
                    overflow: "hidden",
                    border: 1,
                    borderColor: theme.palette.mode === "dark" ? alpha(theme.palette.common.white, 0.08) : "transparent",
                    background:
                        theme.palette.mode === "dark"
                            ? `linear-gradient(135deg, ${alpha(theme.palette.common.white, 0.07)}, ${alpha(theme.palette.common.white, 0.03)})`
                            : "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                    boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[3],
                })}
            >
                <Box
                    aria-hidden
                    sx={(theme) => ({
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        borderRadius: 2.5,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: alpha(theme.palette.warning.main, 0.18),
                        color: "warning.light",
                    })}
                >
                    <AdminPanelSettingsRoundedIcon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        variant="caption"
                        sx={{ display: "block", color: alpha("#fff", 0.65), fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1.4 }}
                    >
                        מצב ניהול
                    </Typography>
                    <Typography
                        variant="subtitle1"
                        fontWeight={800}
                        sx={{
                            lineHeight: 1.3,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            wordBreak: "break-word",
                        }}
                    >
                        {t.title}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                        <TournamentStatusChip status={t.status} />
                    </Box>
                </Box>
                <Button
                    component={Link}
                    href={`/tournaments/${t.id}`}
                    size="small"
                    variant="outlined"
                    color="inherit"
                    endIcon={<ArrowBackRoundedIcon sx={{ transform: "scaleX(-1)" }} />}
                    sx={{ minHeight: 40, flexShrink: 0, borderColor: alpha("#fff", 0.25), whiteSpace: "nowrap", "&:hover": { borderColor: alpha("#fff", 0.5) } }}
                    data-testid="manage-back"
                >
                    לטורניר
                </Button>
            </Stack>

            <Tabs
                value={section}
                onChange={(_, v) => setSection(v)}
                variant="scrollable"
                scrollButtons={false}
                sx={{
                    mb: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0" },
                    "& .MuiTab-root": {
                        flex: { xs: "1 0 auto", md: "none" },
                        minWidth: 0,
                        minHeight: 48,
                        px: { xs: 1.25, md: 2.5 },
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                    },
                }}
            >
                <Tab value="teams" label="קבוצות" data-testid="manage-tab-teams" />
                <Tab value="schedule" label="לוח משחקים" data-testid="manage-tab-schedule" />
                <Tab value="status" label="סטטוס" data-testid="manage-tab-status" />
                {canRoles && <Tab value="roles" label="הרשאות" data-testid="manage-tab-roles" />}
            </Tabs>
            <UpdatedCue show={updated} testId="manage-updated-cue" />

            <Box sx={{ pt: 2 }}>
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
