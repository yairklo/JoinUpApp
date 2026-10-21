/**
 * Deterministic moderation provider for dev and CI.
 *
 * Enabled only by MODERATION_PROVIDER=stub. Refuses to run when
 * NODE_ENV=production, so a production deploy cannot turn the paid model off
 * by setting the variable.
 *
 * Product rules this provider must not undo:
 * - Severe sexual slurs are blocked only on the private adult→minor path, and
 *   that block happens in chatSafety (the lexicon) before any provider runs.
 * - Ordinary profanity is not blocked. Group chats have no lexicon filter.
 * - A proposal to meet in person is allowed (game coordination, not a block).
 *   Phone numbers and links are allowed too: the web regression sends them and
 *   expects delivery. The verdict is verified (no `unverified`), so the
 *   fail-closed path for a missing model does not apply.
 */

const STUB_PROVIDER = 'stub';

function stubRequested(env) {
  return env.MODERATION_PROVIDER === STUB_PROVIDER;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'stub'|'live'}
 */
function resolveModerationProvider(env = process.env) {
  if (!stubRequested(env)) return 'live';
  if (env.NODE_ENV === 'production') {
    throw new Error('MODERATION_PROVIDER=stub cannot be enabled when NODE_ENV=production');
  }
  return 'stub';
}

function stubVerdict() {
  return {
    isSafe: true,
    source: 'stub',
    reason: 'allowed',
  };
}

module.exports = {
  STUB_PROVIDER,
  resolveModerationProvider,
  stubVerdict,
};
