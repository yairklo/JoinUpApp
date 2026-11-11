// Optional parking info of a field: a map pin (lat + lng) and a short note.
// Client-side form state and the request a client sends. The rules:
//   - pin and note are independent and each is optional: a note may exist without a pin
//     ("street parking only") and a pin may exist without a note;
//   - removing the pin does NOT touch the note. The note is cleared only by clearing the note;
//   - the pin is a pair: lat and lng are set together or not at all;
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

function noteOf(value) {
  return value && typeof value.note === 'string' ? value.note : '';
}

function hasParkingPin(value) {
  return !!value && parseCoordinate(value.lat, 90) !== null && parseCoordinate(value.lng, 180) !== null;
}

/** True when a non-blank note is present, with or without a pin. */
function hasParkingNote(value) {
  return noteOf(value).trim() !== '';
}

/** True when there is anything to show or send: a pin, a note, or both. */
function hasParking(value) {
  return hasParkingPin(value) || hasParkingNote(value);
}

/** Places or moves the pin and keeps the note. An invalid point leaves the state as it was. */
function setParkingPin(value, lat, lng) {
  const la = parseCoordinate(lat, 90);
  const ln = parseCoordinate(lng, 180);
  const current = value || EMPTY_PARKING;
  if (la === null || ln === null) return current;
  return { lat: la, lng: ln, note: noteOf(current) };
}

/** Removes the pin only. The note stays exactly as it was. */
function clearParkingPin(value) {
  return { lat: null, lng: null, note: noteOf(value) };
}

/** Typing in the note, with or without a pin; capped at the max length. Never touches the pin. */
function setParkingNote(value, note) {
  const current = value || EMPTY_PARKING;
  const pinned = hasParkingPin(current);
  return {
    lat: pinned ? current.lat : null,
    lng: pinned ? current.lng : null,
    note: String(note == null ? '' : note).slice(0, PARKING_NOTE_MAX_LENGTH),
  };
}

/** Clears the note only. The pin stays exactly as it was. */
function clearParkingNote(value) {
  return setParkingNote(value, '');
}

/**
 * The fields a client adds to a create/suggest request. Pin and note are sent independently:
 * the pair only when it is a valid pin, the trimmed note only when it is non-empty.
 * @returns {{ parkingLat?: number, parkingLng?: number, parkingNote?: string }}
 */
function parkingRequestFields(value) {
  const out = {};
  if (hasParkingPin(value)) {
    out.parkingLat = parseCoordinate(value.lat, 90);
    out.parkingLng = parseCoordinate(value.lng, 180);
  }
  const note = noteOf(value).trim().slice(0, PARKING_NOTE_MAX_LENGTH);
  if (note) out.parkingNote = note;
  return out;
}

module.exports = {
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
};
