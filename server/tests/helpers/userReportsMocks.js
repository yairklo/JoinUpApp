// Shared auth mock for the user-report suites: tokens map to a plain user or an admin.
const USERS = {
  mock_token_reporter: { id: 'ur_reporter', name: 'Reporter', isAdmin: false },
  mock_token_target: { id: 'ur_target', name: 'Target', isAdmin: false },
  mock_token_admin: { id: 'ur_admin', name: 'Admin', isAdmin: true },
};

function authMock(extra = {}) {
  return {
    authenticateToken: (req, res, next) => {
      const token = (req.headers['authorization'] || '').split(' ')[1];
      if (!token) return res.status(401).json({ error: 'No token provided' });
      if (!USERS[token]) return res.status(403).json({ error: 'Invalid token' });
      req.user = { ...USERS[token] };
      return next();
    },
    attachOptionalUser: (_req, _res, next) => next(),
    ...extra,
  };
}

module.exports = { USERS, authMock };
