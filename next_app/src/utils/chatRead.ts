/** Messages count as read only while the chat is on screen: not suspended (minimized) and the tab is visible. */
export function canMarkRead(suspended: boolean, visibilityState?: string): boolean {
    return !suspended && visibilityState === "visible";
}
