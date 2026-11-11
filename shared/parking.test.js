const {
  PARKING_NOTE_MAX_LENGTH,
  EMPTY_PARKING,
  parseCoordinate,
  hasParkingPin,
  hasParkingNote,
  hasParking,
  setParkingPin,
  clearParkingPin,
  setParkingNote,
  clearParkingNote,
  parkingRequestFields,
} = require('./parking');

describe('parseCoordinate', () => {
  test('accepts finite numbers and plain decimal strings in range', () => {
    expect(parseCoordinate(32.07, 90)).toBe(32.07);
    expect(parseCoordinate(0, 90)).toBe(0);
    expect(parseCoordinate('34.78', 180)).toBe(34.78);
    expect(parseCoordinate(' -12.5 ', 90)).toBe(-12.5);
    expect(parseCoordinate('.5', 90)).toBe(0.5);
    expect(parseCoordinate('+7', 90)).toBe(7);
  });

  test('never turns blank or non-numeric input into a coordinate', () => {
    for (const bad of ['', ' ', '\t', 'abc', '32,07', '32.07N', '1e2', '0x10', 'NaN', 'Infinity', '--1', '1.', null, undefined, true, false, [5], {}, NaN, Infinity]) {
      expect(parseCoordinate(bad, 90)).toBeNull();
    }
  });

  test('rejects out-of-range values', () => {
    expect(parseCoordinate(90.0001, 90)).toBeNull();
    expect(parseCoordinate(-181, 180)).toBeNull();
    expect(parseCoordinate(180, 180)).toBe(180);
  });
});

describe('client form state: pin and note are independent', () => {
  test('a note can be typed with no pin, and it does not create one', () => {
    const noted = setParkingNote(EMPTY_PARKING, 'street parking only');
    expect(noted).toEqual({ lat: null, lng: null, note: 'street parking only' });
    expect(hasParkingPin(noted)).toBe(false);
    expect(hasParkingNote(noted)).toBe(true);
    expect(hasParking(noted)).toBe(true);
    expect(setParkingNote(null, 'x')).toEqual({ lat: null, lng: null, note: 'x' });
  });

  test('a pin can exist with no note', () => {
    const pinned = setParkingPin(EMPTY_PARKING, 32.07, 34.78);
    expect(pinned).toEqual({ lat: 32.07, lng: 34.78, note: '' });
    expect(hasParkingPin(pinned)).toBe(true);
    expect(hasParkingNote(pinned)).toBe(false);
    expect(hasParking(pinned)).toBe(true);
  });

  test('placing or moving the pin keeps the note', () => {
    const noted = setParkingNote(EMPTY_PARKING, 'free lot');
    const pinned = setParkingPin(noted, 32.07, 34.78);
    expect(pinned).toEqual({ lat: 32.07, lng: 34.78, note: 'free lot' });
    expect(setParkingPin(pinned, 32.08, 34.79)).toEqual({ lat: 32.08, lng: 34.79, note: 'free lot' });
  });

  test('removing the pin does NOT clear the note', () => {
    const both = setParkingNote(setParkingPin(EMPTY_PARKING, 32.07, 34.78), 'free lot');
    const unpinned = clearParkingPin(both);
    expect(unpinned).toEqual({ lat: null, lng: null, note: 'free lot' });
    expect(hasParkingPin(unpinned)).toBe(false);
    expect(hasParking(unpinned)).toBe(true);
    expect(clearParkingPin(null)).toEqual({ lat: null, lng: null, note: '' });
  });

  test('the note is cleared only by clearing the note, and that keeps the pin', () => {
    const both = setParkingNote(setParkingPin(EMPTY_PARKING, 32.07, 34.78), 'free lot');
    expect(clearParkingNote(both)).toEqual({ lat: 32.07, lng: 34.78, note: '' });
    expect(setParkingNote(both, '')).toEqual({ lat: 32.07, lng: 34.78, note: '' });
    expect(hasParking(clearParkingNote(clearParkingPin(both)))).toBe(false);
  });

  test('an invalid point never becomes a pin and leaves the state alone', () => {
    const noted = setParkingNote(EMPTY_PARKING, 'free lot');
    expect(setParkingPin(noted, '', '')).toEqual(noted);
    expect(setParkingPin(noted, 'abc', 34.78)).toEqual(noted);
    expect(setParkingPin(noted, 132, 34.78)).toEqual(noted);
    const pinned = setParkingPin(EMPTY_PARKING, 32.07, 34.78);
    expect(setParkingPin(pinned, NaN, 34.78)).toEqual(pinned);
  });

  test('typing a note never leaves half a pin behind', () => {
    expect(setParkingNote({ lat: 32.07, lng: null, note: '' }, 'x')).toEqual({ lat: null, lng: null, note: 'x' });
  });

  test('the note is capped while typing; a blank note does not count as parking', () => {
    expect(setParkingNote(EMPTY_PARKING, 'x'.repeat(200)).note).toHaveLength(PARKING_NOTE_MAX_LENGTH);
    expect(hasParkingNote({ lat: null, lng: null, note: '   ' })).toBe(false);
    expect(hasParking(EMPTY_PARKING)).toBe(false);
    expect(hasParking(null)).toBe(false);
  });

  test('EMPTY_PARKING cannot be mutated by accident', () => {
    expect(Object.isFrozen(EMPTY_PARKING)).toBe(true);
  });
});

describe('parkingRequestFields', () => {
  test('nothing set sends nothing', () => {
    expect(parkingRequestFields(EMPTY_PARKING)).toEqual({});
    expect(parkingRequestFields(null)).toEqual({});
    expect(parkingRequestFields({ lat: null, lng: null, note: '   ' })).toEqual({});
  });

  test('note only: the note is sent and no coordinates at all', () => {
    expect(parkingRequestFields({ lat: null, lng: null, note: ' street parking ' })).toEqual({ parkingNote: 'street parking' });
  });

  test('pin only: the pair is sent and no note', () => {
    expect(parkingRequestFields({ lat: 32.07, lng: 34.78, note: '' })).toEqual({ parkingLat: 32.07, parkingLng: 34.78 });
    expect(parkingRequestFields({ lat: 32.07, lng: 34.78, note: '  ' })).toEqual({ parkingLat: 32.07, parkingLng: 34.78 });
  });

  test('pin and note: both are sent', () => {
    expect(parkingRequestFields({ lat: 32.07, lng: 34.78, note: ' free lot ' }))
      .toEqual({ parkingLat: 32.07, parkingLng: 34.78, parkingNote: 'free lot' });
  });

  test('half a pin is never sent, but its note still is', () => {
    expect(parkingRequestFields({ lat: 32.07, lng: null, note: 'kept' })).toEqual({ parkingNote: 'kept' });
    expect(parkingRequestFields({ lat: '', lng: '', note: '' })).toEqual({});
  });

  test('a long note is trimmed to the max length before sending', () => {
    const sent = parkingRequestFields({ lat: 32.07, lng: 34.78, note: 'x'.repeat(200) });
    expect(sent.parkingNote).toHaveLength(PARKING_NOTE_MAX_LENGTH);
  });

  test('string coordinates are sent as numbers', () => {
    expect(parkingRequestFields({ lat: '32.07', lng: '34.78', note: '' })).toEqual({ parkingLat: 32.07, parkingLng: 34.78 });
  });
});
