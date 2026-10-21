// jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock')) for tournament tests.
// Bearer token = `<userId>` or `<userId>:admin`; the user row must exist (see ensureUsers).
function parse(req) {
  const header = req.headers && req.headers.authorization;
  const token = header && header.split(' ')[1];
  if (!token) return null;
  const [id, flag] = token.split(':');
  return { id, name: id, avatar: null, isAdmin: flag === 'admin' };
}

module.exports = {
  authenticateToken: (req, res, next) => {
    const user = parse(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    return next();
  },
  attachOptionalUser: (req, res, next) => {
    const user = parse(req);
    if (user) req.user = user;
    next();
  },
};
