/**
 * Shared by GameActions and SeriesMembersPanel's share buttons.
 *
 * Desktop browsers with `navigator.share` either open no visible UI (headless/automation) or an
 * OS-level sheet nobody asked for; only touch devices get the native share sheet users expect.
 */
export function canUseNativeShare(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

/**
 * Tries the native share sheet on a touch device. Returns true when the share was handled
 * (shown, completed, or the user dismissed it) — the caller should not do anything else. Returns
 * false when there is no native sheet to use, or it failed for a real reason (not a user
 * cancellation) — the caller should fall back to its own copy/WhatsApp UI.
 */
export async function tryNativeShare(data: { title?: string; text?: string; url: string }): Promise<boolean> {
  if (!canUseNativeShare()) return false;
  try {
    await navigator.share(data);
    return true;
  } catch (err: unknown) {
    const name = err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name) : "";
    // The user closed the sheet themselves: that is a handled outcome, not a failure to fall back from.
    if (name === "AbortError" || name === "NotAllowedError") return true;
    return false;
  }
}
