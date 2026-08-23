function parseAdminAllowlist(raw = process.env.ADMIN_USER_IDS) {
  return String(raw || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function metadataIsAdmin(meta) {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.isAdmin === true || meta.isAdmin === 'true' || meta.isAdmin === 1) return true;
  return String(meta.role || '').toLowerCase() === 'admin';
}

/** True when the Clerk user is an operator (metadata) or listed in ADMIN_USER_IDS. */
function resolveIsAdmin(userId, clerkUser) {
  if (userId && parseAdminAllowlist().includes(String(userId))) return true;
  return metadataIsAdmin(clerkUser?.publicMetadata) || metadataIsAdmin(clerkUser?.privateMetadata);
}

module.exports = {
  parseAdminAllowlist,
  metadataIsAdmin,
  resolveIsAdmin,
};
