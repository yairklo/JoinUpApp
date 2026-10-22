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
import AddRounded from "@mui/icons-material/AddRounded";
import SportFilterBar from "@/components/SportFilterBar";
import { useTournamentCapabilities, useTournaments } from "@/hooks/tournaments";
import type { SportFilter } from "@/utils/sports";
import TournamentCard from "./TournamentCard";
import { SECTION_LABEL, STATUS_FILTERS, sectionize, type StatusFilterKey } from "./shellModel";

const GRID_SX = { display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" } } as const;

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
        <Button component={Link} href="/tournaments/new" variant="contained" startIcon={<AddRounded />} data-testid="tournaments-create">
            טורניר חדש
        </Button>
    ) : null;

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }} dir="rtl" data-testid="tournaments-list">
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
                    טורנירים
                </Typography>
                {create}
            </Stack>

            <Stack spacing={1.5} sx={{ mb: 3 }}>
                <SportFilterBar value={sport} onChange={setSport} />
                <Box sx={{ display: "flex", gap: 1, overflowX: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
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
                        />
                    )}
                </Box>
            </Stack>

            {loading && !data ? (
                <Box sx={GRID_SX} data-testid="tournaments-loading" aria-busy="true" aria-label="טוען">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} variant="rounded" height={260} />
                    ))}
                </Box>
            ) : error && !data ? (
                <Alert
                    severity={typeof navigator !== "undefined" && navigator.onLine === false ? "warning" : "error"}
                    data-testid="tournaments-error"
                    action={<Button color="inherit" size="small" onClick={() => void reload()}>ניסיון חוזר</Button>}
                >
                    לא הצלחנו לטעון את הטורנירים.
                </Alert>
            ) : sections.length === 0 ? (
                <Stack alignItems="center" spacing={1.5} sx={{ py: 8, textAlign: "center" }} data-testid="tournaments-empty">
                    <Typography sx={{ fontSize: 48 }} aria-hidden>🏆</Typography>
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
                                <Typography variant="h6" component="h2" sx={{ fontWeight: 800, mb: 1.5 }}>
                                    {SECTION_LABEL[s.key]}
                                </Typography>
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
