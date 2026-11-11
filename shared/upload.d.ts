export const MAX_IMAGE_FILE_SIZE: number;
export const MIME_EXTENSIONS: Record<string, string>;
export const ACCEPTED_IMAGE_TYPES: string[];

export const MAX_FIELD_PHOTOS: number;
export const MAX_PENDING_PHOTOS_PER_USER_PER_FIELD: number;
export const MAX_PENDING_PHOTOS_PER_USER: number;
export const MAX_PHOTO_UPLOADS_PER_DAY: number;
export const IMAGE_RESIZE_MAX_EDGE: number;
export const IMAGE_RESIZE_JPEG_QUALITY: number;

export type FieldPhotoLimitReason = 'FIELD_FULL' | 'PENDING_PER_FIELD' | 'PENDING_TOTAL' | 'DAILY';
export const FIELD_PHOTO_LIMIT_REASONS: FieldPhotoLimitReason[];

export interface FieldPhotoAllowanceInput {
    isAdmin?: boolean;
    approvedCountForField: number;
    userPendingForField: number;
    userPendingTotal: number;
    userUploadsLast24h: number;
    /** How many photos the user is trying to add. Defaults to 1. */
    requested?: number;
}

export interface FieldPhotoAllowance {
    /** `requested` trimmed to the slots left. */
    allowed: number;
    /** Slots left for this user on this field right now. */
    remaining: number;
    /** The limit that trimmed the request, or null when all of it fits. */
    reason: FieldPhotoLimitReason | null;
}

export function computeFieldPhotoAllowance(input: FieldPhotoAllowanceInput): FieldPhotoAllowance;

export type FieldPhotoFileError = 'TYPE' | 'SIZE';
export function validateFieldPhotoFile(file: { mimetype?: string | null; size?: number | null }): FieldPhotoFileError | null;

export function computeResizedDimensions(
    width: number,
    height: number,
    maxEdge?: number,
): { width: number; height: number; resized: boolean };
