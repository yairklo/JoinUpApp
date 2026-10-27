-- The tournaments gate looks up TournamentRole by userId on every request. Add-only.

CREATE INDEX "TournamentRole_userId_idx" ON "TournamentRole"("userId");
