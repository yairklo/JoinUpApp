/**
 * Pure web-push capability detection, split out of useNotification so it can be unit
 * tested per user agent (see pushSupport.test.ts). Must stay in sync with
 * IS_WEBKIT_SAFARI in public/firebase-messaging-sw.js.
 */

/**
 * 'checking'           - support not known yet (render nothing)
 * 'supported'          - permission can be requested
 * 'ios-needs-install'  - iPhone/iPad browser tab: web push only works from a Home Screen app (iOS 16.4+)
 * 'unsupported'        - no web push in this browser, or permission already denied
 */
export type PushSupport = 'checking' | 'supported' | 'ios-needs-install' | 'unsupported';

export interface PushEnv {
    userAgent: string;
    /** 'ontouchend' in document - tells iPadOS (which reports "Macintosh") from a Mac */
    hasTouch: boolean;
    /** matchMedia('(display-mode: standalone)') or navigator.standalone (Home Screen app) */
    standalone: boolean;
    hasNotification: boolean;
    hasServiceWorker: boolean;
    hasPushManager: boolean;
}

export const isIOSDevice = (ua: string, hasTouch: boolean) =>
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as Macintosh
    (/Macintosh/.test(ua) && hasTouch);

// Safari/WebKit: every iOS browser, plus desktop Safari. The SW always shows a system
// notification there, so the page skips its Snackbar.
export const isWebKitSafari = (ua: string, hasTouch: boolean) =>
    isIOSDevice(ua, hasTouch) ||
    (/AppleWebKit/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua));

// In-app browsers (Instagram, Facebook, LINE, ...) can't "Add to Home Screen" - the page has
// to be opened in Safari first. (Safari View Controller sends a plain Safari UA, so it
// can't be told apart and gets the normal steps.)
export const isIOSInAppBrowser = (ua: string) =>
    /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|musical_ly|GSA\//.test(ua);

/**
 * Decision before the async Firebase messaging check. 'needs-messaging-check' means the
 * browser exposes the push APIs; the hook then awaits Firebase's isSupported and the
 * current permission to choose between 'supported' and 'unsupported'.
 */
export function detectPushSupport(env: PushEnv): {
    support: 'ios-needs-install' | 'unsupported' | 'needs-messaging-check';
    iosInAppBrowser: boolean;
} {
    // On iOS, web push only ever works from a Home Screen app - decide that first,
    // regardless of which push APIs a given iOS version exposes in a browser tab.
    if (isIOSDevice(env.userAgent, env.hasTouch) && !env.standalone) {
        return { support: 'ios-needs-install', iosInAppBrowser: isIOSInAppBrowser(env.userAgent) };
    }
    if (!env.hasNotification || !env.hasServiceWorker || !env.hasPushManager) {
        return { support: 'unsupported', iosInAppBrowser: false };
    }
    return { support: 'needs-messaging-check', iosInAppBrowser: false };
}

export function readPushEnv(): PushEnv {
    return {
        userAgent: navigator.userAgent,
        hasTouch: 'ontouchend' in document,
        standalone:
            window.matchMedia?.('(display-mode: standalone)').matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true,
        hasNotification: 'Notification' in window,
        hasServiceWorker: 'serviceWorker' in navigator,
        hasPushManager: 'PushManager' in window,
    };
}

/** What NotificationAsker renders (the Snackbar for foreground messages is always mounted). */
export type AskerView = 'nothing' | 'enable-button' | 'install-hint' | 'install-hint-in-app';

export function askerView(opts: {
    signedIn: boolean;
    hasToken: boolean;
    pushSupport: PushSupport;
    iosHintDismissed: boolean;
    iosInAppBrowser: boolean;
}): AskerView {
    if (opts.hasToken || !opts.signedIn) return 'nothing';
    if (opts.pushSupport === 'supported') return 'enable-button';
    if (opts.pushSupport === 'ios-needs-install' && !opts.iosHintDismissed) {
        return opts.iosInAppBrowser ? 'install-hint-in-app' : 'install-hint';
    }
    return 'nothing';
}
