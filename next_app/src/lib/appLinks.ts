/**
 * Universal Links (iOS) / App Links (Android) association data, served from /.well-known/*.
 * Paths must stay in sync with mobile_app/app.json (intentFilters pathPrefix) and the screens the
 * app actually handles.
 */
export const APP_BUNDLE_ID = "com.yairklo.joinupapp";
export const APP_LINK_PATHS = ["/games/*", "/series/*"];

// Public identifiers (not secrets). Env vars override.
export const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "XYZUXRFJ5P";
export const ANDROID_SHA256_FINGERPRINTS = [
  process.env.ANDROID_PLAY_SIGNING_SHA256 || "DF:11:88:4A:AE:74:75:42:46:9A:05:27:9A:BC:A6:59:32:67:E9:60:7C:DB:F2:7B:9F:BA:47:87:40:6E:9E:8B", // Play Console > App integrity > App signing key certificate
  process.env.ANDROID_EAS_UPLOAD_SHA256 || "C6:80:3B:86:1A:97:CD:1B:42:32:8C:93:5C:4F:FD:0A:F1:19:12:B6:FC:31:AC:11:89:FD:4D:3C:E9:8E:58:16", // `eas credentials -p android` > keystore SHA256
];

export function appleAppSiteAssociation() {
  return {
    applinks: {
      details: [{ appIDs: [`${APPLE_TEAM_ID}.${APP_BUNDLE_ID}`], components: APP_LINK_PATHS.map((p) => ({ "/": p })) }],
    },
  };
}

export function assetLinks() {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_BUNDLE_ID,
        sha256_cert_fingerprints: ANDROID_SHA256_FINGERPRINTS,
      },
    },
  ];
}

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
}
