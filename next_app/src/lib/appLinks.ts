/**
 * Universal Links (iOS) / App Links (Android) association data, served from /.well-known/*.
 * Paths must stay in sync with mobile_app/app.json (intentFilters pathPrefix) and the screens the
 * app actually handles.
 */
export const APP_BUNDLE_ID = "com.yairklo.joinupapp";
export const APP_LINK_PATHS = ["/games/*", "/series/*"];

// TODO(owner): REPLACE before the next store build. Not secrets (public identifiers), but unknown to the repo.
export const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "REPLACE_WITH_APPLE_TEAM_ID";
export const ANDROID_SHA256_FINGERPRINTS = [
  process.env.ANDROID_PLAY_SIGNING_SHA256 || "REPLACE_WITH_PLAY_APP_SIGNING_SHA256", // Play Console > App integrity > App signing key certificate
  process.env.ANDROID_EAS_UPLOAD_SHA256 || "REPLACE_WITH_EAS_UPLOAD_KEY_SHA256", // `eas credentials -p android` > keystore SHA256
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
