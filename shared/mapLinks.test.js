const { buildMapLinks, venueMapInput } = require('./mapLinks');

const COORDS = { lat: 32.0853, lng: 34.7818 };

describe('buildMapLinks coordinates', () => {
  test('builds Google, Waze, and Apple URLs from lat/lng', () => {
    const links = buildMapLinks({ ...COORDS, address: 'גני יהושע', name: 'פארק הירקון' });
    expect(links).toEqual({
      query: '32.0853,34.7818',
      usedCoordinates: true,
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=32.0853,34.7818',
      wazeUrl: 'https://waze.com/ul?ll=32.0853,34.7818',
      appleMapsUrl: `http://maps.apple.com/?ll=32.0853,34.7818&q=${encodeURIComponent('פארק הירקון')}`,
    });
  });

  test('uses the address as the Apple pin label when there is no name', () => {
    const links = buildMapLinks({ ...COORDS, address: 'רחוב הרצל 1' });
    expect(links.appleMapsUrl).toBe(
      `http://maps.apple.com/?ll=32.0853,34.7818&q=${encodeURIComponent('רחוב הרצל 1')}`,
    );
  });

  test('accepts the fieldLat/fieldLng names the game and series payloads use', () => {
    const links = buildMapLinks({ fieldLat: 31.25, fieldLng: 34.8, fieldName: 'מגרש' });
    expect(links.usedCoordinates).toBe(true);
    expect(links.googleMapsUrl).toContain('query=31.25,34.8');
  });

  test('treats 0,0 as a real coordinate', () => {
    const links = buildMapLinks({ lat: 0, lng: 0, name: 'origin' });
    expect(links.usedCoordinates).toBe(true);
    expect(links.query).toBe('0,0');
  });
});

describe('buildMapLinks text fallback', () => {
  test('uses the address when coordinates are missing', () => {
    const links = buildMapLinks({ address: 'גני יהושע, תל אביב', name: 'מגרש א' });
    const q = encodeURIComponent('גני יהושע, תל אביב');
    expect(links).toEqual({
      query: 'גני יהושע, תל אביב',
      usedCoordinates: false,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}`,
      wazeUrl: `https://waze.com/ul?q=${q}`,
      appleMapsUrl: `http://maps.apple.com/?q=${q}`,
    });
  });

  test('uses the name when there is no address', () => {
    const links = buildMapLinks({ name: 'אולם הפועל' });
    const q = encodeURIComponent('אולם הפועל');
    expect(links.usedCoordinates).toBe(false);
    expect(links.query).toBe('אולם הפועל');
    expect(links.googleMapsUrl).toBe(`https://www.google.com/maps/search/?api=1&query=${q}`);
    expect(links.wazeUrl).toBe(`https://waze.com/ul?q=${q}`);
  });

  test('encodes spaces, ampersands, and Hebrew in the query', () => {
    const links = buildMapLinks({ address: 'A & B, רחוב 1' });
    expect(links.googleMapsUrl).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('A & B, רחוב 1')}`,
    );
    expect(links.googleMapsUrl).not.toContain(' ');
    expect(links.googleMapsUrl).not.toContain('&query=A &');
  });

  test('prefers customLocation over the field address, and the address over the name', () => {
    expect(venueMapInput({
      customLocation: 'שער 4',
      address: 'רחוב הרצל',
      name: 'אצטדיון',
    })).toMatchObject({ address: 'שער 4', name: 'אצטדיון', lat: null });
    expect(buildMapLinks({ fieldLocation: 'רחוב הרצל', fieldName: 'אצטדיון' }).query).toBe('רחוב הרצל');
  });
});

describe('buildMapLinks hides an empty venue', () => {
  test.each([
    null,
    undefined,
    {},
    { lat: null, lng: null, address: '   ', name: '' },
    { address: '', name: '  ' },
  ])('returns null for %j', (venue) => {
    expect(buildMapLinks(venue)).toBeNull();
    expect(venueMapInput(venue)).toBeNull();
  });
});

describe('buildMapLinks rejects a bad coordinate pair and falls back', () => {
  test('falls back to the address when only one coordinate is present', () => {
    const links = buildMapLinks({ lat: 32.1, address: 'תל אביב' });
    expect(links.usedCoordinates).toBe(false);
    expect(links.query).toBe('תל אביב');
  });

  test('falls back when the pair is out of range', () => {
    expect(buildMapLinks({ lat: 91, lng: 34, name: 'מגרש' }).usedCoordinates).toBe(false);
    expect(buildMapLinks({ lat: 32, lng: 181, name: 'מגרש' }).query).toBe('מגרש');
    expect(buildMapLinks({ lat: -90.1, lng: 0, address: 'אי שם' }).query).toBe('אי שם');
  });

  test('ignores numeric strings and NaN', () => {
    expect(buildMapLinks({ lat: '32.1', lng: '34.8', name: 'מגרש' }).usedCoordinates).toBe(false);
    expect(buildMapLinks({ lat: Number.NaN, lng: 34, address: 'חיפה' }).query).toBe('חיפה');
    expect(buildMapLinks({ lat: Number.POSITIVE_INFINITY, lng: 34, name: 'מגרש' }).query).toBe('מגרש');
  });

  test('returns null when the coordinates are invalid and there is no text', () => {
    expect(buildMapLinks({ lat: 32, lng: null })).toBeNull();
    expect(buildMapLinks({ fieldLat: 200, fieldLng: 10 })).toBeNull();
  });
});

describe('venueMapInput pin priority', () => {
  test('a custom pin wins over the catalog field', () => {
    const input = venueMapInput({
      customLat: 32.5,
      customLng: 35.0,
      fieldLat: 31.0,
      fieldLng: 34.0,
      customLocation: 'הפארק',
      fieldName: 'מגרש עירוני',
    });
    expect(input).toEqual({
      lat: 32.5,
      lng: 35.0,
      address: 'הפארק',
      name: 'מגרש עירוני',
    });
    expect(buildMapLinks(input).googleMapsUrl).toContain('query=32.5,35');
  });

  test('an incomplete custom pin does not hide the field coordinates', () => {
    const links = buildMapLinks({
      customLat: 32.5,
      fieldLat: 31.2,
      fieldLng: 34.9,
      fieldName: 'מגרש',
    });
    expect(links.usedCoordinates).toBe(true);
    expect(links.query).toBe('31.2,34.9');
  });
});
