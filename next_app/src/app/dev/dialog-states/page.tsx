"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import StandingsOverrideDialog from "@/components/tournaments/StandingsOverrideDialog";
import ShareDialog from "@/components/ShareDialog";
import type { StandingsTableData } from "@/types/tournament";

const TABLE: StandingsTableData = {
  stageId: "s1",
  stageName: "GROUP",
  stageType: "GROUP",
  groupId: "g1",
  groupName: "A",
  complete: false,
  needsManualRank: false,
  manualOrder: true,
  rows: ["הפועל מרכז", "מכבי הצפון", "בית״ר דרום", "הכוכבים"].map((name, i) => ({
    rank: i + 1,
    team: { id: `t${i}`, name, color: ["#047857", "#4f46e5", "#f59e0b", "#dc2626"][i] },
    played: 3, won: 2 - (i % 2), drawn: i % 2, lost: i % 2, gf: 7 - i, ga: 3 + i, gd: 4 - 2 * i, points: 6 - i,
    autoPoints: 6 - i, pointsAdjustment: 0, adjustmentReason: null, tied: false, manualRank: null,
  })),
};

function Inner() {
  const which = useSearchParams()?.get("d") ?? null;
  const [open, setOpen] = useState(true);
  return (
    <Stack spacing={2} sx={{ p: 2 }} dir="rtl">
      <Typography variant="overline">Dialog states for phone-width QA: ?d=standings | ?d=share</Typography>
      <Button onClick={() => setOpen(true)}>פתח שוב</Button>
      <StandingsOverrideDialog
        open={open && which === "standings"}
        table={TABLE}
        saving={false}
        onSave={() => setOpen(false)}
        onReset={() => setOpen(false)}
        onClose={() => setOpen(false)}
      />
      <ShareDialog
        open={open && which === "share"}
        onClose={() => setOpen(false)}
        title="שיתוף משחק"
        url="https://joinup.example/games/abc123"
        whatsappText="בואו לשחק איתנו"
        copyState="idle"
        onCopy={() => undefined}
      />
    </Stack>
  );
}

/** Internal design QA page (local dev only, see app/dev/layout.tsx): three-button dialogs at any width. */
export default function DialogStatesPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
