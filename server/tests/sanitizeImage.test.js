const sharp = require('sharp');
const { stripImageMetadata, InvalidImageError } = require('../utils/sanitizeImage');

jest.setTimeout(30000);

// A distinctive camera make and a GPS block, so "was it really there to begin with" is checkable
// and a passing test cannot be a vacuous one.
const EXIF = {
  IFD0: { Make: 'LeakyCam', Software: 'GpsLeakTest 1.0', DateTime: '2026:11:11 10:00:00' },
  IFD3: {
    GPSLatitudeRef: 'N',
    GPSLatitude: '32/1 5/1 7/1',
    GPSLongitudeRef: 'E',
    GPSLongitude: '34/1 46/1 54/1',
  },
};
const SOURCES = ['jpeg', 'png', 'webp'];

const base = (w = 40, h = 30) => sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } });
const withExif = (format) => base()[format]().withExif(EXIF).toBuffer();

// The TIFF tag that points at the GPS block (0x8825), in either byte order.
const GPS_POINTER_LE = Buffer.from([0x25, 0x88]);
const GPS_POINTER_BE = Buffer.from([0x88, 0x25]);
const hasGpsBlock = (exif) => !!exif && (exif.includes(GPS_POINTER_LE) || exif.includes(GPS_POINTER_BE));

describe('stripImageMetadata', () => {
  test.each(SOURCES)('%s: the fixture really carries EXIF with a GPS block and the camera make', async (format) => {
    const input = await withExif(format);
    const { exif } = await sharp(input).metadata();
    expect(exif).toBeDefined();
    expect(hasGpsBlock(exif)).toBe(true);
    expect(input.includes(Buffer.from('LeakyCam'))).toBe(true);
  });

  test.each(SOURCES)('%s: the output has no EXIF, no GPS and no camera details, and is still the same picture', async (format) => {
    const input = await withExif(format);
    const { buffer, mimetype } = await stripImageMetadata(input);

    expect(mimetype).toBe(`image/${format}`);
    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe(format);
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(buffer.includes(Buffer.from('LeakyCam'))).toBe(false);
    expect(buffer.includes(Buffer.from('GpsLeakTest'))).toBe(false);
    expect(buffer.includes(Buffer.from('Exif'))).toBe(false);
    expect([meta.width, meta.height]).toEqual([40, 30]);
  });

  test('applies the EXIF orientation to the pixels before dropping it, so a portrait phone photo stays upright', async () => {
    // Stored as 40x30 with orientation 6 (rotate 90 degrees clockwise to display): shows as 30x40.
    const input = await base().jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const { buffer } = await stripImageMetadata(input);
    const meta = await sharp(buffer).metadata();
    expect([meta.width, meta.height]).toEqual([30, 40]);
    expect(meta.orientation).toBeUndefined();
  });

  test('keeps the colour profile: it says how to show the colours, not where or when', async () => {
    const input = await base().jpeg().withIccProfile('p3').toBuffer();
    expect((await sharp(input).metadata()).icc).toBeDefined();
    const { buffer } = await stripImageMetadata(input);
    expect((await sharp(buffer).metadata()).icc).toBeDefined();
  });

  test('keeps every frame of an animated GIF', async () => {
    const frames = await Promise.all(['#ff0000', '#00ff00', '#0000ff'].map((background) =>
      sharp({ create: { width: 20, height: 20, channels: 3, background } }).raw().toBuffer()));
    const input = await sharp(Buffer.concat(frames), { raw: { width: 20, height: 20 * 3, channels: 3, pageHeight: 20 } })
      .gif({ delay: [100, 100, 100], loop: 0 })
      .toBuffer();
    expect((await sharp(input, { animated: true }).metadata()).pages).toBe(3);

    const { buffer, mimetype } = await stripImageMetadata(input);
    expect(mimetype).toBe('image/gif');
    const meta = await sharp(buffer, { animated: true }).metadata();
    expect(meta.pages).toBe(3);
    expect(meta.pageHeight).toBe(20); // height is the whole strip; pageHeight is one frame
  });

  test('reports the type the bytes really are, whatever the client said', async () => {
    const jpeg = await base().jpeg().toBuffer();
    expect((await stripImageMetadata(jpeg)).mimetype).toBe('image/jpeg');
  });

  test.each([
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>')],
    ['HTML', Buffer.from('<html><body><script>alert(1)</script></body></html>')],
    ['a PDF', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n')],
    ['plain text', Buffer.from('not an image at all')],
    ['an empty file', Buffer.alloc(0)],
    ['random bytes', Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 37 + 11) % 256))],
  ])('refuses %s', async (_name, input) => {
    await expect(stripImageMetadata(input)).rejects.toBeInstanceOf(InvalidImageError);
    await expect(stripImageMetadata(input)).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });

  test('refuses a truncated image rather than storing half a file', async () => {
    const input = await base(200, 200).jpeg().toBuffer();
    await expect(stripImageMetadata(input.subarray(0, Math.floor(input.length / 2)))).rejects.toBeInstanceOf(InvalidImageError);
  });

  test('refuses a real image in a format we do not accept (AVIF)', async () => {
    const input = await base().avif().toBuffer();
    await expect(stripImageMetadata(input)).rejects.toBeInstanceOf(InvalidImageError);
  });

  test("the error message is safe to show: nothing from the decoder leaks", async () => {
    await expect(stripImageMetadata(Buffer.from('nope'))).rejects.toThrow('The file is not a valid JPEG, PNG, WEBP or GIF image');
  });
});
