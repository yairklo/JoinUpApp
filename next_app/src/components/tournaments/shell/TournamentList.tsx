"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import AddRounded from "@mui/icons-material/AddRounded";
import SportFilterBar from "@/components/SportFilterBar";
import { useTournamentCapabilities, useTournaments } from "@/hooks/tournaments";
import type { SportFilter } from "@/utils/sports";
import TournamentCard from "./TournamentCard";
import { SECTION_LABEL, STATUS_FILTERS, sectionize, type StatusFilterKey } from "./shellModel";

const GRID_SX = { display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" } } as const;

/** `/tournaments`: discovery list with sport / status / "mine" filters (spec 1). */
export default function TournamentList() {
    const { isSignedIn } = useAuth();
    const { canCreateTournaments } = useTournamentCapabilities();
    const [sport, setSport] = useState<SportFilter>("ALL");
    const [statusKey, setStatusKey] = useState<StatusFilterKey>("all");
    const [mine, setMine] = useState(false);

    const filters = useMemo(
        () => ({
            sport: sport === "ALL" ? undefined : sport,
            status: STATUS_FILTERS.find((s) => s.key === statusKey)?.statuses,
            mine: mine || undefined,
        }),
        [sport, statusKey, mine]
    );
    const { data, loading, error, reload } = useTournaments(filters);
    const filtered = sport !== "ALL" || statusKey !== "all" || mine;
    const sections = useMemo(() => sectionize(data ?? []), [data]);
    const create = canCreateTournaments ? (
        <Button
            component={Link}
            href="/tournaments/new"
            variant="contained"
            startIcon={<AddRounded />}
            data-testid="tournaments-create"
            sx={{ minHeight: 42, px: 2.5, fontWeight: 700 }}
        >
            טורניר חדש
        </Button>
    ) : null;

    return (
        <Container maxWidth="lg" sx={{ pt: { xs: 2.5, md: 4 }, pb: { xs: 12, md: 6 } }} dir="rtl" data-testid="tournaments-list">
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
                <Typography variant="h4" component="h1" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
                    טורנירים
                </Typography>
                {create}
            </Stack>

            <Stack
                spacing={1.5}
                sx={(theme) => ({
                    mb: 3.5,
                    p: { xs: 1.5, sm: 2 },
                    borderRadius: 2.5,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: alpha(theme.palette.background.paper, 0.75),
                })}
            >
                <SportFilterBar value={sport} onChange={setSport} />
                <Box
                    sx={{
                        display: "flex",
                        gap: 1,
                        overflowX: "auto",
                        pb: 0.25,
                        scrollbarWidth: "none",
                        "&::-webkit-scrollbar": { display: "none" },
                    }}
                >
                    {STATUS_FILTERS.map((s) => (
                        <Chip
                            key={s.key}
                            label={s.label}
                            clickable
                            color={statusKey === s.key ? "primary" : "default"}
                            variant={statusKey === s.key ? "filled" : "outlined"}
                            onClick={() => setStatusKey(s.key)}
                            aria-pressed={statusKey === s.key}
                            data-testid={`tournaments-filter-status-${s.key}`}
                            sx={{ fontWeight: statusKey === s.key ? 700 : 600, flexShrink: 0 }}
                        />
                    ))}
                    {isSignedIn && (
                        <Chip
                            label="שלי"
                            clickable
                            color={mine ? "primary" : "default"}
                            variant={mine ? "filled" : "outlined"}
                            onClick={() => setMine((v) => !v)}
                            aria-pressed={mine}
                            data-testid="tournaments-filter-mine"
                            sx={{ fontWeight: mine ? 700 : 600, flexShrink: 0 }}
                        />
                    )}
                </Box>
            </Stack>

            {loading && !data ? (
                <Box sx={GRID_SX} data-testid="tournaments-loading" aria-busy="true" aria-label="טוען">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} variant="rounded" height={268} sx={{ borderRadius: 2.5 }} />
                    ))}
                </Box>
            ) : error && !data ? (
                <Alert
                    severity={typeof navigator !== "undefined" && navigator.onLine === false ? "warning" : "error"}
                    data-testid="tournaments-error"
                    sx={{ borderRadius: 2.5 }}
                    action={<Button color="inherit" size="small" onClick={() => void reload()}>ניסיון חוזר</Button>}
                >
                    לא הצלחנו לטעון את הטורנירים.
                </Alert>
            ) : sections.length === 0 ? (
                <Stack
                    alignItems="center"
                    spacing={1.5}
                    sx={(theme) => ({
                        py: 7,
                        px: 3,
                        textAlign: "center",
                        borderRadius: 3,
                        border: "1px dashed",
                        borderColor: "divider",
                        bgcolor: alpha(theme.palette.background.paper, 0.6),
                    })}
                    data-testid="tournaments-empty"
                >
                    <Box
                        sx={(theme) => ({
                            width: 72,
                            height: 72,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            mb: 0.5,
                        })}
                    >
                        <Typography sx={{ fontSize: 36 }} aria-hidden>🏆</Typography>
                    </Box>
                    {filtered ? (
                        <>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>אין טורנירים שמתאימים לסינון</Typography>
                            <Button
                                variant="outlined"
                                onClick={() => {
                                    setSport("ALL");
                                    setStatusKey("all");
                                    setMine(false);
                                }}
                            >
                                ניקוי סינון
                            </Button>
                        </>
                    ) : (
                        <>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>עוד אין טורנירים</Typography>
                            <Typography color="text.secondary">כשייפתח טורניר באזור שלך, הוא יופיע כאן.</Typography>
                            {create}
                        </>
                    )}
                </Stack>
            ) : (
                <Stack spacing={4}>
                    {sections.map((s) => (
                        <Box key={s.key} component="section" aria-label={SECTION_LABEL[s.key]}>
                            {statusKey === "all" && (
                                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                                    <Box sx={{ width: 4, height: 20, borderRadius: 1, bgcolor: "primary.main" }} />
                                    <Typography variant="h6" component="h2" sx={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
                                        {SECTION_LABEL[s.key]}
                                    </Typography>
                                </Stack>
                            )}
                            <Box sx={GRID_SX}>
                                {s.items.map((t) => (
                                    <TournamentCard key={t.id} t={t} />
                                ))}
                            </Box>
                        </Box>
                    ))}
                </Stack>
            )}
        </Container>
    );
}
