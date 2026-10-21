/**
 * Tiny failure breaker for optional Redis/cluster lookups: after `threshold` consecutive failures
 * the dependency is skipped for `openMs`, so an outage costs one timeout per window instead of one
 * per request.
 */
function createBreaker({ threshold = 3, openMs = 5000, now = Date.now } = {}) {
  let failures = 0;
  let openUntil = 0;
  return {
    allow: () => now() >= openUntil,
    success() { failures = 0; },
    failure() {
      failures += 1;
      if (failures >= threshold) { openUntil = now() + openMs; failures = 0; }
    },
    reset() { failures = 0; openUntil = 0; },
    get isOpen() { return now() < openUntil; },
  };
}

module.exports = { createBreaker };
