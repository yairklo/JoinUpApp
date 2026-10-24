// Serialise roster writes for one game. Joins, approvals, and the lottery draw all take this
// lock before they count free spots or assign CONFIRMED/NOT_SELECTED, so none of them can
// decide from a snapshot the others are about to change.
async function lockGameRow(tx, gameId) {
  const rows = await tx.$queryRaw`SELECT "maxPlayers" FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
  return rows[0]?.maxPlayers ?? 0;
}

module.exports = { lockGameRow };
