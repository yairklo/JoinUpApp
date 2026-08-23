const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MAX_IMAGE_FILE_SIZE: MAX_FILE_SIZE, MIME_EXTENSIONS } = require('../../shared/upload');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

// Returns a multer instance that saves single-image uploads to server/uploads/<subfolder>
// with a random filename (never trusts the client-supplied original filename).
function createImageUpload(subfolder) {
  const destDir = path.join(UPLOADS_ROOT, subfolder);
  fs.mkdirSync(destDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destDir),
    filename: (req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${MIME_EXTENSIONS[file.mimetype] || ''}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (!MIME_EXTENSIONS[file.mimetype]) {
        return cb(new Error('Only JPEG, PNG, WEBP, and GIF images are allowed'));
      }
      cb(null, true);
    },
  });
}

// multer errors (wrong type, too large) reject via `next(err)`, which would otherwise
// fall through to the app's generic 500 handler. Wrapping converts them to clean 4xx JSON.
function handleSingleUpload(upload, fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: err.message || 'Invalid image upload' });
      }
      next();
    });
  };
}

// Render/staging sit behind a proxy that terminates TLS, so req.protocol alone can report
// "http" even for an https request; prefer an explicit env override, then the forwarded header.
function getPublicOrigin(req) {
  if (process.env.PUBLIC_SERVER_URL) return process.env.PUBLIC_SERVER_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function absoluteUrlFor(req, subfolder, filename) {
  return `${getPublicOrigin(req)}/uploads/${subfolder}/${filename}`;
}

// Best-effort cleanup of a previously uploaded file when it's replaced/removed.
// No-ops for external URLs (Clerk avatars, pasted links) — only touches our own /uploads/ paths.
function deleteUploadedFile(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return;
  let pathname;
  try {
    pathname = urlOrPath.startsWith('http') ? new URL(urlOrPath).pathname : urlOrPath;
  } catch {
    return;
  }
  if (!pathname.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOADS_ROOT, pathname.slice('/uploads/'.length));
  if (!filePath.startsWith(UPLOADS_ROOT)) return;
  fs.unlink(filePath, () => {});
}

module.exports = {
  UPLOADS_ROOT,
  createImageUpload,
  handleSingleUpload,
  absoluteUrlFor,
  deleteUploadedFile,
};
