const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// server/shared/ is a vendored copy (Docker's build context can't reach the sibling shared/
// directory at the repo root) -- see server/scripts/sync-shared.js.
const { MAX_IMAGE_FILE_SIZE: MAX_FILE_SIZE, MIME_EXTENSIONS } = require('../shared/upload');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

// Container disks are ephemeral (wiped on every deploy/restart), so in production images go to
// Cloudinary. Enabled when CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>) is set; without
// it (local dev, tests) we fall back to local disk under server/uploads.
const useCloudinary = () => Boolean(process.env.CLOUDINARY_URL);
let cloudinaryClient;
function getCloudinary() {
  if (!cloudinaryClient) cloudinaryClient = require('cloudinary').v2;
  return cloudinaryClient;
}
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'joinup';

// Minimal multer storage engine: streams the upload to Cloudinary. `file.filename` is set to the
// final https URL, which absoluteUrlFor() passes through unchanged, so routes need no changes.
function cloudinaryStorage(subfolder) {
  return {
    _handleFile(req, file, cb) {
      const stream = getCloudinary().uploader.upload_stream(
        {
          folder: `${CLOUDINARY_FOLDER}/${subfolder}`,
          public_id: crypto.randomUUID(),
          resource_type: 'image',
        },
        (err, result) => {
          if (err) return cb(err);
          cb(null, { filename: result.secure_url, size: result.bytes, path: result.public_id });
        }
      );
      file.stream.pipe(stream);
    },
    _removeFile(req, file, cb) {
      getCloudinary().uploader.destroy(file.path).then(() => cb(null), cb);
    },
  };
}

// Returns a multer instance that saves single-image uploads to server/uploads/<subfolder>
// with a random filename (never trusts the client-supplied original filename).
function createImageUpload(subfolder) {
  let storage;
  if (useCloudinary()) {
    storage = cloudinaryStorage(subfolder);
  } else {
    const destDir = path.join(UPLOADS_ROOT, subfolder);
    fs.mkdirSync(destDir, { recursive: true });
    storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, destDir),
      filename: (req, file, cb) => {
        cb(null, `${crypto.randomUUID()}${MIME_EXTENSIONS[file.mimetype] || ''}`);
      },
    });
  }

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
  if (/^https?:\/\//.test(filename)) return filename; // already a full CDN URL (Cloudinary)
  return `${getPublicOrigin(req)}/uploads/${subfolder}/${filename}`;
}

// Best-effort cleanup of a previously uploaded file when it's replaced/removed.
// No-ops for external URLs (Clerk avatars, pasted links) — only touches our own /uploads/ paths
// and our own Cloudinary folder.
function deleteUploadedFile(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return;
  if (urlOrPath.includes('res.cloudinary.com/')) {
    const m = urlOrPath.match(/\/image\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+?)\.[a-z0-9]+(?:\?.*)?$/i);
    const publicId = m && decodeURIComponent(m[1]);
    if (useCloudinary() && publicId && publicId.startsWith(`${CLOUDINARY_FOLDER}/`)) {
      getCloudinary().uploader.destroy(publicId).catch(() => {});
    }
    return;
  }
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
