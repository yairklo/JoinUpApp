/** Messages count as read only while the chat is on screen: not suspended (minimized) and the tab is visible. */
export function canMarkRead(suspended: boolean, visibilityState?: string): boolean {
    return !suspended && visibilityState === "visible";
}

/** Minimal socket surface needed to report read state (keeps this testable without socket.io). */
export interface ReadEmitter {
    emit(event: string, payload: unknown): unknown;
}

/**
 * Tells the server whether this chat is really on screen, then marks the room read only if it is.
 * The server ignores `markAsRead` from a socket that last reported the room hidden, so a minimized
 * widget (or a second tab) can never turn the sender's ticks to "read".
 */
export function syncReadState(socket: ReadEmitter, roomId: string, userId: string, canRead: boolean): void {
    socket.emit("chatView", { roomId, visible: canRead });
    if (canRead) socket.emit("markAsRead", { roomId, userId });
}
