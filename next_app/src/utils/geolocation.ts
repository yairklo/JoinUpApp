/**
 * True only when the browser already holds a *granted* geolocation permission.
 *
 * Used to auto-center on the user without ever triggering the permission prompt: a prompt
 * should only follow an explicit gesture ("השתמש במיקום שלי"), not a page load. Browsers that
 * lack (or reject) the Permissions API for geolocation, e.g. mobile Safari, count as "not granted".
 */
export async function isGeolocationPermissionGranted(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.geolocation) return false;
    const query = navigator.permissions?.query;
    if (typeof query !== "function") return false;
    const status = await query.call(navigator.permissions, { name: "geolocation" as PermissionName });
    return status.state === "granted";
  } catch {
    return false;
  }
}
