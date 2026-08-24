// server/shared/ is a vendored copy (Docker's build context can't reach the sibling shared/
// directory at the repo root) -- see server/scripts/sync-shared.js.
module.exports = require('../shared/timezone');
