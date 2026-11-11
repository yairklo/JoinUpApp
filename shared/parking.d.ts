export const PARKING_NOTE_MAX_LENGTH: 140;

/** Client form state: no pin is `lat: null, lng: null`; no note is an empty string. Each is optional on its own. */
export interface ParkingValue {
  lat: number | null;
  lng: number | null;
  note: string;
}

type ParkingLike = { lat?: unknown; lng?: unknown; note?: unknown } | null | undefined;

export const EMPTY_PARKING: Readonly<ParkingValue>;

/** A finite, in-range coordinate from a number or plain decimal string; null for anything else (blank included). */
export function parseCoordinate(value: unknown, limit: number): number | null;

export function hasParkingPin(value: ParkingLike): boolean;

/** A non-blank note is present, with or without a pin. */
export function hasParkingNote(value: ParkingLike): boolean;

/** A pin, a note, or both. */
export function hasParking(value: ParkingLike): boolean;

/** Places or moves the pin and keeps the note; an invalid point leaves the state unchanged. */
export function setParkingPin(value: ParkingValue | null | undefined, lat: unknown, lng: unknown): ParkingValue;

/** Removes the pin only. The note is kept. */
export function clearParkingPin(value: ParkingValue | null | undefined): ParkingValue;

/** Sets the note with or without a pin; capped at PARKING_NOTE_MAX_LENGTH. */
export function setParkingNote(value: ParkingValue | null | undefined, note: string): ParkingValue;

/** Clears the note only. The pin is kept. */
export function clearParkingNote(value: ParkingValue | null | undefined): ParkingValue;

/** Request fields for create/suggest: the pin pair and the note, each only when present. */
export function parkingRequestFields(
  value: ParkingLike,
): { parkingLat?: number; parkingLng?: number; parkingNote?: string };
