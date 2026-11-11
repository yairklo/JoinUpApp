const {
  PARKING_NOTE_MAX_LENGTH,
  EMPTY_PARKING,
  parseCoordinate,
  hasParkingPin,
  setParkingPin,
  clearParkingPin,
  setParkingNote,
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

describe('client form state', () => {
  test('a note cannot be typed before a pin exists', () => {
    expect(setParkingNote(EMPTY_PARKING, 'free lot')).toEqual({ lat: null, lng: null, note: '' });
    expect(setParkingNote(null, 'free lot')).toEqual({ lat: null, lng: null, note: '' });
  });

  test('placing a pin keeps an existing note; moving it too', () => {
    const pinned = setParkingPin(EMPTY_PARKING, 32.07, 34.78);
    expect(pinned).toEqual({ lat: 32.07, lng: 34.78, note: '' });
    const noted = setParkingNote(pinned, 'free lot');
    expect(setParkingPin(noted, 32.08, 34.79)).toEqual({ lat: 32.08, lng: 34.79, note: 'free lot' });
  });

  test('an invalid point never becomes a pin', () => {
    expect(setParkingPin(EMPTY_PARKING, '', '')).toEqual(EMPTY_PARKING);
    expect(setParkingPin(EMPTY_PARKING, 'abc', 34.78)).toEqual(EMPTY_PARKING);
    expect(setParkingPin(EMPTY_PARKING, 132, 34.78)).toEqual(EMPTY_PARKING);
    const pinned = setParkingPin(EMPTY_PARKING, 32.07, 34.78);
    expect(setParkingPin(pinned, NaN, 34.78)).toEqual(pinned);
  });

  test('removing the pin clears the note', () => {
    const noted = setParkingNote(setParkingPin(EMPTY_PARKING, 32.07, 34.78), 'free lot');
    expect(hasParkingPin(noted)).toBe(true);
    const cleared = clearParkingPin();
    expect(cleared).toEqual({ lat: null, lng: null, note: '' });
    expect(hasParkingPin(cleared)).toBe(false);
  });

  test('the note is capped while typing', () => {
    const pinned = setParkingPin(EMPTY_PARKING, 32.07, 34.78);
    expect(setParkingNote(pinned, 'x'.repeat(200)).note).toHaveLength(PARKING_NOTE_MAX_LENGTH);
  });

  test('EMPTY_PARKING cannot be mutated by accident', () => {
    expect(Object.isFrozen(EMPTY_PARKING)).toBe(true);
  });
});

describe('parkingRequestFields', () => {
  test('no pin sends nothing, even if a note is somehow present', () => {
    expect(parkingRequestFields(EMPTY_PARKING)).toEqual({});
    expect(parkingRequestFields(null)).toEqual({});
    expect(parkingRequestFields({ lat: null, lng: null, note: 'orphan' })).toEqual({});
    expect(parkingRequestFields({ lat: 32.07, lng: null, note: 'orphan' })).toEqual({});
  });

  test('a pin sends the pair, and the note only when non-empty', () => {
    expect(parkingRequestFields({ lat: 32.07, lng: 34.78, note: '' })).toEqual({ parkingLat: 32.07, parkingLng: 34.78 });
    expect(parkingRequestFields({ lat: 32.07, lng: 34.78, note: '  ' })).toEqual({ parkingLat: 32.07, parkingLng: 34.78 });
    expect(parkingRequestFields({ lat: 32.07, lng: 34.78, note: ' free lot ' }))
      .toEqual({ parkingLat: 32.07, parkingLng: 34.78, parkingNote: 'free lot' });
  });
  test('a long note is trimmed to the max length before sending', () => {
    const sent = parkingRequestFields({ lat: 32.07, lng: 34.78, note: 'x'.repeat(200) });
    expect(sent.parkingNote).toHaveLength(PARKING_NOTE_MAX_LENGTH);
  });

  test('string coordinates from older state are sent as numbers', () => {
    expect(parkingRequestFields({ lat: '32.07', lng: '34.78', note: '' })).toEqual({ parkingLat: 32.07, parkingLng: 34.78 });
  });
});
