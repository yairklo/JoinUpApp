export const PARKING_NOTE_MAX_LENGTH: 140;

/** Client form state: no pin is `lat: null, lng: null` with an empty note. */
export interface ParkingValue {
  lat: number | null;
  lng: number | null;
  note: string;
}

export const EMPTY_PARKING: Readonly<ParkingValue>;

/** A finite, in-range coordinate from a number or plain decimal string; null for anything else (blank included). */
export function parseCoordinate(value: unknown, limit: number): number | null;

export function hasParkingPin(value: Partial<ParkingValue> | null | undefined): boolean;

/** Places or moves the pin; an invalid point leaves the state unchanged. */
export function setParkingPin(value: ParkingValue | null | undefined, lat: unknown, lng: unknown): ParkingValue;

/** Removing the pin always drops the note with it. */
export function clearParkingPin(): ParkingValue;

/** Ignored while there is no pin; capped at PARKING_NOTE_MAX_LENGTH. */
export function setParkingNote(value: ParkingValue | null | undefined, note: string): ParkingValue;

/** Request fields for create/suggest: empty without a valid pin. */
export function parkingRequestFields(
  value: Partial<ParkingValue> | null | undefined,
): { parkingLat?: number; parkingLng?: number; parkingNote?: string };
