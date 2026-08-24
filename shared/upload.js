const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const ACCEPTED_IMAGE_TYPES = Object.keys(MIME_EXTENSIONS);

module.exports = {
  MAX_IMAGE_FILE_SIZE,
  MIME_EXTENSIONS,
  ACCEPTED_IMAGE_TYPES,
};
