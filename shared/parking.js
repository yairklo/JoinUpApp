// Optional parking spot of a field: a map pin (lat + lng) plus a short note.
// One set of rules for the server (request validation) and both clients (form state and the
// request they send), so web, mobile and the API cannot drift apart:
//   - the pin is a pair: lat and lng are set together or not at all;
//   - a note only exists next to a pin: no pin means no note, and removing the pin drops the note;
//   - a coordinate is a finite number in range. Blank text, booleans, arrays and anything
//     non-numeric are never coerced into one (Number('') and Number(' ') are 0, which is a real
//     point in the Gulf of Guinea).

const PARKING_NOTE_MAX_LENGTH = 140;

const PARKING_ERRORS = {
  PAIR: 'parkingLat and parkingLng must be sent together',
  COORDINATES: 'parkingLat/parkingLng must be valid coordinates',
  NOTE_TYPE: 'parkingNote must be a string',
  NOTE_WITHOUT_PIN: 'parkingNote requires a parking location (parkingLat and parkingLng)',
};

const DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * A coordinate from a number or a plain decimal string, or null when it is not one.
 * @param {unknown} value
 * @param {number} limit 90 for latitude, 180 for longitude
 * @returns {number | null}
 */
function parseCoordinate(value, limit) {
  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!DECIMAL.test(trimmed)) return null;
    n = Number(trimmed);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return n;
}

function defaultSanitizeNote(note) {
  return note.trim().slice(0, PARKING_NOTE_MAX_LENGTH);
}

/**
 * Validates the parking part of a request body. Only keys present in `body` end up in `data`,
 * so the result can be spread into a create or a partial update.
 *   - pin absent, note absent            -> {}
 *   - both coordinates valid             -> the pin, plus the note when one was sent
 *   - both coordinates null              -> clears the pin AND the note
 *   - a non-empty note without a pin in the same body -> error
 * @param {Record<string, unknown> | null | undefined} body
 * @param {{ sanitizeNote?: (note: string) => string }} [options] server passes its HTML-stripping sanitizer
 * @returns {{ data: { parkingLat?: number | null, parkingLng?: number | null, parkingNote?: string | null } } | { error: string }}
 */
function validateParking(body, options) {
  const src = body || {};
  const sanitizeNote = (options && options.sanitizeNote) || defaultSanitizeNote;
  const data = {};

  const hasLat = src.parkingLat !== undefined;
  const hasLng = src.parkingLng !== undefined;
  if (hasLat !== hasLng) return { error: PARKING_ERRORS.PAIR };

  let note; // undefined = not sent, '' = sent empty
  if (src.parkingNote !== undefined) {
    if (src.parkingNote !== null && typeof src.parkingNote !== 'string') {
      return { error: PARKING_ERRORS.NOTE_TYPE };
    }
    note = typeof src.parkingNote === 'string' ? String(sanitizeNote(src.parkingNote) || '').trim() : '';
  }

  let pin = 'absent';
  if (hasLat) {
    if (src.parkingLat === null && src.parkingLng === null) {
      pin = 'cleared';
    } else if (src.parkingLat === null || src.parkingLng === null) {
      return { error: PARKING_ERRORS.PAIR };
    } else {
      const lat = parseCoordinate(src.parkingLat, 90);
      const lng = parseCoordinate(src.parkingLng, 180);
      if (lat === null || lng === null) return { error: PARKING_ERRORS.COORDINATES };
      data.parkingLat = lat;
      data.parkingLng = lng;
      pin = 'set';
    }
  }

  if (pin !== 'set' && note) return { error: PARKING_ERRORS.NOTE_WITHOUT_PIN };

  if (pin === 'cleared') {
    data.parkingLat = null;
    data.parkingLng = null;
    data.parkingNote = null;
  } else if (note !== undefined) {
    data.parkingNote = note || null;
  }

  return { data };
}

/** Form state the clients keep: `{ lat, lng, note }`, with no pin as nulls and an empty note. */
const EMPTY_PARKING = Object.freeze({ lat: null, lng: null, note: '' });

function hasParkingPin(value) {
  return !!value && parseCoordinate(value.lat, 90) !== null && parseCoordinate(value.lng, 180) !== null;
}

/** Places or moves the pin. An invalid point leaves the state as it was. */
function setParkingPin(value, lat, lng) {
  const la = parseCoordinate(lat, 90);
  const ln = parseCoordinate(lng, 180);
  const current = value || EMPTY_PARKING;
  if (la === null || ln === null) return current;
  return { lat: la, lng: ln, note: current.note || '' };
}

/** Removing the pin always drops the note with it. */
function clearParkingPin() {
  return { lat: null, lng: null, note: '' };
}

/** Typing in the note. Ignored while there is no pin; capped at the max length. */
function setParkingNote(value, note) {
  const current = value || EMPTY_PARKING;
  if (!hasParkingPin(current)) return { lat: null, lng: null, note: '' };
  return { lat: current.lat, lng: current.lng, note: String(note == null ? '' : note).slice(0, PARKING_NOTE_MAX_LENGTH) };
}

/**
 * The fields a client adds to a create/suggest request: nothing at all without a valid pin,
 * otherwise the pin and (only when non-empty) the trimmed note.
 * @returns {{ parkingLat?: number, parkingLng?: number, parkingNote?: string }}
 */
function parkingRequestFields(value) {
  if (!hasParkingPin(value)) return {};
  const note = String(value.note || '').trim().slice(0, PARKING_NOTE_MAX_LENGTH);
  return {
    parkingLat: parseCoordinate(value.lat, 90),
    parkingLng: parseCoordinate(value.lng, 180),
    ...(note ? { parkingNote: note } : {}),
  };
}

module.exports = {
  PARKING_NOTE_MAX_LENGTH,
  PARKING_ERRORS,
  EMPTY_PARKING,
  parseCoordinate,
  validateParking,
  hasParkingPin,
  setParkingPin,
  clearParkingPin,
  setParkingNote,
  parkingRequestFields,
};
