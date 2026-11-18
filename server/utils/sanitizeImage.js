// Strips private metadata (EXIF, including GPS position and capture time; XMP; IPTC) from an
// uploaded image by re-encoding it. Phones write the exact location a photo was taken at into
// the file, and a field photo is shown to everyone, so nothing the uploader did not mean to
// publish may survive into the stored file.
//
// Why re-encode rather than cut the metadata segments out: the EXIF block also carries the
// orientation tag. Dropping it alone would turn every phone photo shot in portrait sideways, so
// the rotation is applied to the pixels first (`rotate()` with no argument auto-orients) and only
// then is everything else discarded. sharp keeps no metadata unless asked to, so the output
// carries none; the ICC colour profile is kept deliberately (wide-gamut phone photos would shift
// colour without it) -- a profile describes colours, not where or when.
const sharp = require('sharp');

// A decompression-bomb guard: the 5MB upload limit does not bound the decoded size (a tiny file
// can declare enormous dimensions). Far above any real photo, far below what could exhaust memory.
const MAX_INPUT_PIXELS = 60_000_000;

// The formats we accept, by what sharp detects in the bytes (not by what the client claimed).
const ALLOWED = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

class InvalidImageError extends Error {
  constructor(message = 'The file is not a valid JPEG, PNG, WEBP or GIF image') {
    super(message);
    this.name = 'InvalidImageError';
    this.code = 'INVALID_IMAGE';
  }
}

/**
 * Returns `{ buffer, mimetype }`: the same picture with all metadata removed, and the mime type
 * of what the bytes really are. Throws InvalidImageError for anything that is not a decodable
 * JPEG/PNG/WEBP/GIF, including a file whose declared type does not match its content class
 * (an SVG or HEIC renamed to .jpg, or a document with an image content type).
 */
async function stripImageMetadata(input) {
  const open = (options) => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', ...options });
  try {
    const { format } = await open().metadata();
    const mimetype = ALLOWED[format];
    if (!mimetype) throw new InvalidImageError();

    let pipeline;
    switch (format) {
      case 'jpeg':
        pipeline = open().rotate().keepIccProfile().jpeg({ quality: 90 });
        break;
      case 'png':
        pipeline = open().rotate().keepIccProfile().png();
        break;
      case 'webp':
        pipeline = open().rotate().keepIccProfile().webp({ quality: 90 });
        break;
      default:
        // GIF: no EXIF to orient by, and `animated` keeps every frame.
        pipeline = open({ animated: true }).gif();
    }
    return { buffer: await pipeline.toBuffer(), mimetype };
  } catch (error) {
    if (error instanceof InvalidImageError) throw error;
    // sharp's own messages ("Input buffer contains unsupported image format", "VipsJpeg: ...")
    // are not for users, and which one appears depends on the libvips build.
    throw new InvalidImageError();
  }
}

module.exports = { stripImageMetadata, InvalidImageError, MAX_INPUT_PIXELS };
