import { askerView, detectPushSupport, isWebKitSafari, PushEnv, PushSupport } from "./pushSupport";

// Emulated user agents - real-device behaviour (actual API exposure, Firebase isSupported,
// permission prompts) is NOT covered here.
const UA = {
  iphoneSafari17:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneSafari164:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1",
  iphoneSafari157:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  ipadMobileUA:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadDesktopUA:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  criOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  edgiOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.56 Mobile/15E148 Safari/605.1.15",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; he_IL; he; scale=3.00; 1170x2532; 614296396)",
  facebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.98;FBBV/600000000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/he_IL;FBOP/5]",
  // SFSafariViewController (WhatsApp/iMessage/most "open link" sheets) sends Safari's UA.
  safariViewController:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

const ALL_APIS = { hasNotification: true, hasServiceWorker: true, hasPushManager: true };
const NO_PUSH_APIS = { hasNotification: false, hasServiceWorker: true, hasPushManager: false };

function env(userAgent: string, over: Partial<PushEnv> = {}): PushEnv {
  return { userAgent, hasTouch: false, standalone: false, ...ALL_APIS, ...over };
}

/** Full path to what the user sees, assuming signed in, no token yet, hint not dismissed,
 *  and (where the browser reaches the async check) Firebase messaging supported. */
function view(e: PushEnv, messagingSupported = true) {
  const d = detectPushSupport(e);
  const support: PushSupport =
    d.support === "needs-messaging-check" ? (messagingSupported ? "supported" : "unsupported") : d.support;
  return askerView({ signedIn: true, hasToken: false, pushSupport: support, iosHintDismissed: false, iosInAppBrowser: d.iosInAppBrowser });
}

describe("push support matrix (emulated UAs)", () => {
  // iOS Safari tabs never expose Notification/PushManager - only Home Screen apps on 16.4+ do.
  test.each([
    ["iPhone Safari 17 tab", env(UA.iphoneSafari17, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint"],
    ["iPhone Safari 16.4 tab", env(UA.iphoneSafari164, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint"],
    ["iPhone Safari 15.7 tab", env(UA.iphoneSafari157, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint"],
    ["iPad (mobile UA) tab", env(UA.ipadMobileUA, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint"],
    ["iPad (desktop 'Macintosh' UA + touch) tab", env(UA.ipadDesktopUA, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint"],
    ["iPhone CriOS tab", env(UA.criOS, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint"],
    ["iPhone EdgiOS tab", env(UA.edgiOS, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint"],
    ["Instagram in-app", env(UA.instagram, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint-in-app"],
    ["Facebook in-app", env(UA.facebook, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint-in-app"],
    ["SFSafariViewController (WhatsApp/iMessage)", env(UA.safariViewController, { hasTouch: true, ...NO_PUSH_APIS }), "install-hint"],
    // iOS tabs that DO expose the APIs (hypothetical future iOS) still get the hint.
    ["iPhone Safari 17 tab, APIs exposed", env(UA.iphoneSafari17, { hasTouch: true }), "install-hint"],
  ])("%s -> %s", (_name, e, expected) => {
    expect(view(e)).toBe(expected);
  });

  test.each([
    ["iPhone 17 Home Screen app", env(UA.iphoneSafari17, { hasTouch: true, standalone: true }), "enable-button"],
    ["iPhone 16.4 Home Screen app", env(UA.iphoneSafari164, { hasTouch: true, standalone: true }), "enable-button"],
    ["iPad (desktop UA) Home Screen app", env(UA.ipadDesktopUA, { hasTouch: true, standalone: true }), "enable-button"],
    // Older iOS: Home Screen app but no push APIs -> the button just disappears.
    ["iPhone 15.7 Home Screen app", env(UA.iphoneSafari157, { hasTouch: true, standalone: true, ...NO_PUSH_APIS }), "nothing"],
    ["Android Chrome", env(UA.androidChrome, { hasTouch: true }), "enable-button"],
    ["Android Chrome installed", env(UA.androidChrome, { hasTouch: true, standalone: true }), "enable-button"],
    ["desktop Chrome", env(UA.desktopChrome), "enable-button"],
    ["desktop Safari", env(UA.desktopSafari), "enable-button"],
  ])("%s -> %s", (_name, e, expected) => {
    expect(view(e)).toBe(expected);
  });

  test("Firebase messaging unsupported or permission denied hides the button", () => {
    expect(view(env(UA.desktopChrome), false)).toBe("nothing");
  });

  test("desktop Safari without touch is not treated as iPad", () => {
    expect(detectPushSupport(env(UA.desktopSafari)).support).toBe("needs-messaging-check");
  });
});

describe("isWebKitSafari (in-app Snackbar suppressed; SW always shows a notification)", () => {
  test.each([
    ["iPhone Safari", UA.iphoneSafari17, true, true],
    ["iPad desktop UA + touch", UA.ipadDesktopUA, true, true],
    ["CriOS", UA.criOS, true, true],
    ["EdgiOS", UA.edgiOS, true, true],
    ["desktop Safari", UA.desktopSafari, false, true],
    ["desktop Chrome", UA.desktopChrome, false, false],
    ["Android Chrome", UA.androidChrome, true, false],
  ])("%s", (_name, ua, touch, expected) => {
    expect(isWebKitSafari(ua, touch)).toBe(expected);
  });
});

describe("askerView", () => {
  const base = { signedIn: true, hasToken: false, pushSupport: "supported" as PushSupport, iosHintDismissed: false, iosInAppBrowser: false };
  test("signed out or already has a token -> no button", () => {
    expect(askerView({ ...base, signedIn: false })).toBe("nothing");
    expect(askerView({ ...base, hasToken: true })).toBe("nothing");
  });
  test("checking -> nothing yet; dismissed hint -> nothing", () => {
    expect(askerView({ ...base, pushSupport: "checking" })).toBe("nothing");
    expect(askerView({ ...base, pushSupport: "ios-needs-install", iosHintDismissed: true })).toBe("nothing");
  });
});
