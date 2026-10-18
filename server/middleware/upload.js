const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// server/shared/ is a vendored copy (Docker's build context can't reach the sibling shared/
// directory at the repo root) -- see server/scripts/sync-shared.js.
const { MAX_IMAGE_FILE_SIZE: MAX_FILE_SIZE, MIME_EXTENSIONS } = require('../shared/upload');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

// Container disks are ephemeral (wiped on every deploy/restart), so in production images go to
// Cloudinary, enabled by CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>).
// No silent fallback: a missing or malformed CLOUDINARY_URL throws at require time (i.e. the server
// refuses to boot) so a misconfigured deploy fails loudly instead of quietly writing to the
// ephemeral container disk. Local disk is only allowed for tests/dev, or when explicitly opted in
// with ALLOW_DISK_UPLOADS=true.
// An optional ?query (e.g. ?secure_distribution=...) is valid in the Cloudinary SDK's URL format.
const CLOUDINARY_URL_RE = /^cloudinary:\/\/[^:\s]+:[^@\s]+@([^\s/?]+)(?:\?\S*)?$/;
const rawCloudinaryUrl = process.env.CLOUDINARY_URL;
const diskAllowed = ['test', 'development'].includes(process.env.NODE_ENV)
  || process.env.ALLOW_DISK_UPLOADS === 'true';
if (rawCloudinaryUrl && !CLOUDINARY_URL_RE.test(rawCloudinaryUrl)) {
  throw new Error('[uploads] CLOUDINARY_URL is malformed (expected cloudinary://<key>:<secret>@<cloud_name>, no quotes, spaces or "CLOUDINARY_URL=" prefix)');
}
if (!rawCloudinaryUrl && !diskAllowed) {
  throw new Error('[uploads] CLOUDINARY_URL is not set; refusing to store uploads on local disk (set ALLOW_DISK_UPLOADS=true to override for local dev)');
}
const useCloudinary = () => Boolean(rawCloudinaryUrl);
const CLOUD_NAME = rawCloudinaryUrl ? rawCloudinaryUrl.match(CLOUDINARY_URL_RE)[1] : null;
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
      let done = false;
      const finish = (err, info) => {
        if (done) return;
        done = true;
        cb(err, info);
      };
      const stream = getCloudinary().uploader.upload_stream(
        {
          folder: `${CLOUDINARY_FOLDER}/${subfolder}`,
          public_id: crypto.randomUUID(),
          resource_type: 'image',
        },
        (err, result) => {
          if (err) return finish(err);
          finish(null, { filename: result.secure_url, size: result.bytes, path: result.public_id });
        }
      );
      file.stream.on('error', (e) => { stream.destroy(); finish(e); });
      file.stream.pipe(stream);
    },
    _removeFile(req, file, cb) {
      getCloudinary().uploader.destroy(file.path, { invalidate: true }).then(() => cb(null), cb);
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
//
// The file is stored before the route handler runs its ownership/existence checks and DB write, so
// any handler that then answers with an error (403/404/400/500) would leave an orphaned file in
// Cloudinary / on disk (and let any signed-in user fill storage). Discard the stored file centrally
// whenever the response ends with a 4xx/5xx; routes need no per-branch cleanup.
function handleSingleUpload(upload, fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: err.message || 'Invalid image upload' });
      }
      if (req.file) {
        res.on('finish', () => {
          if (res.statusCode >= 400) discardStoredFile(req.file);
        });
      }
      next();
    });
  };
}

function discardStoredFile(file) {
  if (useCloudinary() && /^https?:\/\//.test(file.filename || '')) {
    if (file.path) {
      getCloudinary().uploader.destroy(file.path, { invalidate: true })
        .catch((e) => console.error('[uploads] failed to discard orphaned Cloudinary upload:', e && e.message));
    }
    return;
  }
  if (file.path) fs.unlink(file.path, () => {});
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

// True for a URL pointing at storage this server manages (our Cloudinary cloud or our own
// /uploads/ path) -- i.e. one deleteUploadedFile() would act on.
function isManagedUploadUrl(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.includes('res.cloudinary.com/')) return Boolean(cloudinaryPublicId(value));
  return localUploadPath(value) !== null;
}

// Extracts our Cloudinary public_id from a delivery URL, or null if it isn't one of ours
// (wrong cloud, outside our folder, or containing path-traversal segments).
function cloudinaryPublicId(url) {
  if (!CLOUD_NAME) return null;
  const m = url.match(/^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/([^?#]+?)\.[a-z0-9]+(?:[?#].*)?$/i);
  if (!m || m[1] !== CLOUD_NAME) return null;
  let rest;
  try {
    rest = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  // `rest` may be prefixed by transformation / version segments; our public_ids always start at the folder.
  const marker = `${CLOUDINARY_FOLDER}/`;
  const idx = rest.startsWith(marker) ? 0 : rest.indexOf(`/${marker}`) + 1;
  if (idx <= 0 && !rest.startsWith(marker)) return null;
  const publicId = rest.slice(idx);
  if (publicId.split('/').includes('..')) return null;
  return publicId;
}

function localUploadPath(urlOrPath) {
  let pathname;
  try {
    pathname = urlOrPath.startsWith('http') ? new URL(urlOrPath).pathname : urlOrPath;
  } catch {
    return null;
  }
  if (!pathname.startsWith('/uploads/')) return null;
  const filePath = path.join(UPLOADS_ROOT, pathname.slice('/uploads/'.length));
  // `+ path.sep`: a bare startsWith(UPLOADS_ROOT) also accepts sibling dirs like "uploads-private".
  if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return filePath;
}

// Best-effort cleanup of a previously uploaded file when it's replaced/removed.
// No-ops for external URLs (Clerk avatars, pasted links) -- only touches our own /uploads/ paths
// and our own Cloudinary folder.
function deleteUploadedFile(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return;
  if (urlOrPath.includes('res.cloudinary.com/')) {
    const publicId = cloudinaryPublicId(urlOrPath);
    if (publicId) {
      getCloudinary().uploader.destroy(publicId, { invalidate: true })
        .catch((e) => console.error('[uploads] failed to delete Cloudinary image:', e && e.message));
    }
    return;
  }
  const filePath = localUploadPath(urlOrPath);
  if (filePath) fs.unlink(filePath, () => {});
}

module.exports = {
  UPLOADS_ROOT,
  createImageUpload,
  handleSingleUpload,
  absoluteUrlFor,
  deleteUploadedFile,
  isManagedUploadUrl,
};
