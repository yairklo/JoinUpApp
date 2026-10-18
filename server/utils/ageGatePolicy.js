// Server-side switch + exemptions for the age gate (statuses live in shared/ageGate.js).
// Kept out of utils/auth.js so callers still work when tests mock the auth module.

// Off until AGE_GATE_ENFORCED=true, so it can be switched on once app builds that show the
// age-gate screen are out (older builds would otherwise just see 403s everywhere).
function isAgeGateEnforced() {
  return process.env.AGE_GATE_ENFORCED === 'true';
}

// Routes a user must reach to clear the gate (or leave): read own status, submit it, delete account.
function isAgeGateExempt(req) {
  const url = (req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  if (url === '/api/users/me') return req.method === 'GET' || req.method === 'DELETE';
  return req.method === 'POST' && url === '/api/users/me/age-gate';
}

module.exports = { isAgeGateEnforced, isAgeGateExempt };
