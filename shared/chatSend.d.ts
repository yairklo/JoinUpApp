export const SEND_TIMEOUT_MS: number;
export type TickKind = 'single' | 'double' | 'read' | 'error' | 'none';
export function messageTickKind(status: string | undefined): TickKind;

interface SendMsg { id: string | number; status?: string; userId?: string; retryable?: boolean }
export function markFailed<T extends SendMsg>(messages: T[], id: string | number, retryable?: boolean): T[];
export function markPending<T extends SendMsg>(messages: T[], id: string | number): T[];
export function discardFailed<T extends SendMsg>(messages: T[], id: string | number): T[];
export function applyStatusUpdate<T extends SendMsg>(messages: T[], myUserId: string | undefined, status: string): T[];
