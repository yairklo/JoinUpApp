import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported, Messaging, MessagePayload } from "firebase/messaging";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let messagingReady: Promise<Messaging | null> | null = null;

/**
 * Resolves to the Messaging instance once FCM support has been checked (null where
 * push is unavailable, e.g. iOS Safari outside an installed Home Screen app).
 * Callers must await this rather than read a module-level variable — the support
 * check is async, so a synchronous read on mount races it and gets null.
 */
export const getMessagingReady = (): Promise<Messaging | null> => {
    if (typeof window === "undefined") return Promise.resolve(null);
    if (!messagingReady) {
        messagingReady = isMessagingSupported()
            .then((supported) => (supported ? getMessaging(app) : null))
            .catch((err) => {
                console.log("FCM support check failed:", err);
                return null;
            });
    }
    return messagingReady;
};

if (typeof window !== "undefined") {
    // Initialize Firebase Cloud Messaging and Analytics only on the client side
    getMessagingReady();
    isAnalyticsSupported().then((supported) => {
        if (supported) getAnalytics(app);
    }).catch(() => { });
}

export { app };

export const requestForToken = async () => {
    const messaging = await getMessagingReady();
    if (!messaging) return null;
    try {
        const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
        });
        if (currentToken) {
            console.log("FCM Token:", currentToken);
            return currentToken;
        } else {
            console.log("No registration token available. Request permission to generate one.");
            return null;
        }
    } catch (err) {
        console.log("An error occurred while retrieving token. ", err);
        return null;
    }
};

/**
 * Subscribe to foreground messages. Returns an unsubscribe function.
 * (Previously a one-shot Promise, so only the first foreground message was ever seen.)
 */
export const onMessageListener = (callback: (payload: MessagePayload) => void): (() => void) => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    getMessagingReady().then((messaging) => {
        if (!messaging || cancelled) return;
        unsubscribe = onMessage(messaging, callback);
    });
    return () => {
        cancelled = true;
        unsubscribe?.();
    };
};
