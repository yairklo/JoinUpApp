// Shared projection from a Prisma User record (raw field: `imageUrl`) to the
// `sender` shape every chat client reads (`sender.image`), so the socket path
// (server/index.js) and the REST history path (server/routes/messages.js)
// can't drift out of sync the way they did before.
function mapUserToSender(user) {
  if (!user) return undefined;
  return { id: user.id, name: user.name, image: user.imageUrl };
}

module.exports = { mapUserToSender };
