import React, { useState } from 'react';

import { useTranslation } from 'react-i18next';
import GameResultPanel from '@/components/GameResultPanel';
import GameResultEditor, { type EditorErrorKind } from '@/components/GameResultEditor';
import ReportUserDialog, { type ReportErrorKind } from '@/components/ReportUserDialog';
import { useGameResult } from '@/hooks/useGameResult';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { SPORT_EMOJI } from '@/utils/sports';
import { formatShortDate, toLang } from '@/components/results/resultUtils';
import type { Game } from '@/types/game';
import { appAlert } from '@/i18n/appAlert';

const hasStatus = (e: any, s: number) => e?.status === s;

function reportErrorKind(err: any): ReportErrorKind {
    if (hasStatus(err, 429)) return 'rateLimited';
    if (err?.status == null) return 'offline';
    return 'generic';
}

/** Thin container: loads the result, owns editor/dispute dialogs. Renders nothing when there is nothing to show. */
export default function GameResultSection({ game }: { game: Game }) {
    const { t, i18n } = useTranslation();
    const lang = toLang(i18n.language);
    const r = useGameResult(game.id);
    const admin = useIsAdmin();
    const isAdmin = admin.status === 'allowed';

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorError, setEditorError] = useState<EditorErrorKind>(null);
    const [disputeOpen, setDisputeOpen] = useState(false);
    const [disputeState, setDisputeState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [disputeErr, setDisputeErr] = useState<ReportErrorKind>('generic');
    const [disputed, setDisputed] = useState(false);

    const sport = (r.data?.sport ?? String(game.sport || '')).toUpperCase();
    if (!['SOCCER', 'BASKETBALL', 'TENNIS'].includes(sport)) return null;

    const view = r.data;
    const state = r.loading && !view ? 'loading' : r.error && !view ? 'error' : 'ready';
    // A friends-only/not-visible game answers an error; stay silent for non-managers rather than showing an error card.
    if (state === 'error' && (r.error?.status === 403 || r.error?.status === 404)) return null;
    // Nothing to show before the game has finished.
    if (state === 'ready' && view && !view.eligible && !view.result) return null;

    const canEdit = !!view?.canEdit || (isAdmin && !!view?.eligible);
    const viewerCanDispute = game.viewerParticipationStatus === 'CONFIRMED' && !canEdit;
    const subtitle = [(SPORT_EMOJI as Record<string, string>)[sport], game.title, formatShortDate(game.date, lang)].filter(Boolean).join(' ');

    const handleSave = async (body: Parameters<typeof r.save>[0]) => {
        setEditorError(null);
        try {
            await r.save(body);
            setEditorOpen(false);
            appAlert('', t('resultEditor.saved'));
        } catch (err: any) {
            if (err?.code === 'RESULT_LOCKED') setEditorError('locked');
            else if (err?.status === 400) setEditorError('validation');
            else setEditorError('offline');
        }
    };

    const handleDelete = async () => {
        try {
            await r.remove();
            setEditorOpen(false);
        } catch (err: any) {
            setEditorError(err?.code === 'RESULT_LOCKED' ? 'locked' : 'offline');
        }
    };

    const handleDispute = async (_reason: unknown, details?: string) => {
        setDisputeState('submitting');
        try {
            await r.dispute(details);
            setDisputeState('success');
            setDisputed(true);
        } catch (err: any) {
            setDisputeErr(reportErrorKind(err));
            setDisputeState('error');
        }
    };

    return (
        <>
            <GameResultPanel
                sport={sport}
                result={view?.result ?? null}
                roster={view?.roster}
                teams={game.teams}
                state={state}
                eligible={view?.eligible}
                canEdit={canEdit}
                locked={view?.locked}
                lockedAt={view?.result?.lockedAt}
                viewerCanDispute={viewerCanDispute}
                disputed={disputed}
                onEdit={() => {
                    setEditorError(null);
                    setEditorOpen(true);
                }}
                onDispute={() => {
                    setDisputeState('idle');
                    setDisputeOpen(true);
                }}
                onRetry={r.refresh}
            />
            {canEdit ? (
                <GameResultEditor
                    open={editorOpen}
                    sport={sport}
                    initial={view?.result ?? null}
                    roster={view?.roster ?? []}
                    teams={game.teams}
                    subtitle={subtitle}
                    locked={view?.locked}
                    lockedAt={view?.result?.lockedAt}
                    isAdmin={isAdmin}
                    saving={r.saving || r.deleting}
                    errorKind={editorError}
                    warnings={r.warnings}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onClose={() => setEditorOpen(false)}
                />
            ) : null}
            {viewerCanDispute ? (
                <ReportUserDialog
                    open={disputeOpen}
                    mode="dispute"
                    target={{ name: subtitle }}
                    state={disputeState}
                    errorKind={disputeErr}
                    onClose={() => setDisputeOpen(false)}
                    onSubmit={handleDispute}
                />
            ) : null}
        </>
    );
}
