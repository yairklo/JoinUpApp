// Optional parking spot of a field: a map pin (lat + lng) plus a short note.
// Client-side form state and the request a client sends, mirroring what the API accepts
// (validateParking in server/routes/fields.js), so a form can never produce a rejected combination:
//   - the pin is a pair: lat and lng are set together or not at all;
//   - a note only exists next to a pin: no pin means no note, and removing the pin drops the note;
//   - a coordinate is a finite number in range. Blank text, booleans, arrays and anything
//     non-numeric are never coerced into one (Number('') and Number(' ') are 0, which is a real
//     point in the Gulf of Guinea).

const PARKING_NOTE_MAX_LENGTH = 140;

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
  EMPTY_PARKING,
  parseCoordinate,
  hasParkingPin,
  setParkingPin,
  clearParkingPin,
  setParkingNote,
  parkingRequestFields,
};
