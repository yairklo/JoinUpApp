"use client";

import { useState } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { useGameResult } from "@/hooks/useGameResult";
import ReportUserDialog from "@/components/ReportUserDialog";
import { SPORT_EMOJI } from "@/utils/sports";
import GameResultPanel from "./GameResultPanel";
import GameResultEditor from "./GameResultEditor";

interface Props {
  gameId: string;
  sport?: string;
  gameTitle?: string;
  gameDate?: string;
  teams?: Array<{ id: string; name: string; color: string; playerIds: string[] }>;
  viewerId: string;
  viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | "NOT_SELECTED" | null;
}

/** Thin container: wires the presentational panel/editor/dispute dialog to useGameResult. */
export default function GameResultSection({ gameId, sport, gameTitle, gameDate, teams = [], viewerId, viewerParticipationStatus }: Props) {
  const r = useGameResult(gameId);
  const [editing, setEditing] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputed, setDisputed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const view = r.view;
  // Signed out / nothing loaded and no error: nothing to show.
  if (!view && !r.loading && !r.error) return null;
  const state = view ? "ready" : r.loading ? "loading" : "error";
  // Hidden for outsiders and signed-out viewers until there is something to show.
  if (state === "ready" && view && !view.result && !(view.eligible && view.canEdit)) return null;
  if (state === "error" && r.errorCode && ["GAME_FRIENDS_ONLY", "NOT_CONFIRMED_PARTICIPANT"].includes(r.errorCode)) return null;

  // A locked result that is still editable can only be edited by an admin.
  const isAdmin = !!view?.locked && !!view?.canEdit;
  const resultSport = view?.sport || sport || "SOCCER";
  const recorderId = view?.result?.recordedBy?.id;
  // Open item 12.3: API has no flag, so derive it from the confirmed-participant status.
  const viewerCanDispute = !!view && viewerParticipationStatus === "CONFIRMED" && !view.canEdit && !!recorderId && recorderId !== viewerId;
  const gameLabel = `${SPORT_EMOJI[resultSport as keyof typeof SPORT_EMOJI] ?? ""} ${gameTitle ?? ""}${gameDate ? ` · ${gameDate}` : ""}`.trim();

  return (
    <>
      <GameResultPanel
        sport={resultSport}
        result={view?.result ?? null}
        roster={view?.roster ?? []}
        teams={teams}
        eligible={!!view?.eligible}
        canEdit={!!view?.canEdit}
        locked={!!view?.locked}
        viewerCanDispute={viewerCanDispute}
        disputed={disputed}
        state={state}
        onEdit={() => setEditing(true)}
        onDispute={() => setDisputing(true)}
        onRetry={r.reload}
      />
      {view && (
        <GameResultEditor
          open={editing}
          sport={resultSport}
          gameTitle={gameTitle}
          initial={view.result}
          roster={view.roster}
          teams={teams}
          locked={view.locked}
          lockedAt={view.result?.lockedAt}
          isAdmin={isAdmin}
          saving={r.saving}
          warnings={r.warnings}
          error={r.error}
          errorCode={r.errorCode}
          onClose={() => setEditing(false)}
          onSave={async (body) => {
            if (await r.save(body)) {
              setEditing(false);
              setToast("התוצאה נשמרה");
            }
          }}
          onDelete={async () => {
            if (await r.remove()) {
              setEditing(false);
              setToast("התוצאה נמחקה");
            }
          }}
        />
      )}
      {recorderId && (
        <ReportUserDialog
          open={disputing}
          mode="dispute"
          targetId={recorderId}
          targetName={gameLabel}
          gameId={gameId}
          onClose={() => setDisputing(false)}
          onSent={() => setDisputed(true)}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={2000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="success" variant="filled" onClose={() => setToast(null)}>{toast}</Alert>
      </Snackbar>
    </>
  );
}
