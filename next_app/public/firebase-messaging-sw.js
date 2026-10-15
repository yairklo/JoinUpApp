/* eslint-disable no-undef */
// Give the service worker access to Firebase Messaging.
const SW_VERSION = 'v1.3.0'; // Change this to force update
console.log(`[firebase-messaging-sw.js] Service Worker Version: ${SW_VERSION}`);

self.addEventListener('install', (event) => {
    console.log('[firebase-messaging-sw.js] Installing new version...');
    self.skipWaiting(); // Force this SW to become active immediately
});

self.addEventListener('activate', (event) => {
    console.log('[firebase-messaging-sw.js] Activating new version...');
    event.waitUntil(clients.claim()); // Take control of all clients immediately
});

// Display path (single, owned by this SW):
// The server sends DATA-ONLY FCM messages (title/body/link in `data`), so the browser
// never auto-displays anything and every notification is shown exactly once, here.
//  - No visible joinUp window: Firebase calls onBackgroundMessage below -> showNotification.
//  - A visible window: Firebase forwards the message to the page (Snackbar in
//    NotificationAsker) and shows nothing. That's fine on Chrome/Firefox, but Safari/WebKit
//    (iOS Home Screen apps, macOS Safari) treats a push without a notification as a silent
//    push and revokes the subscription after a few. So on WebKit the 'push' listener below
//    also shows the notification when a window is visible. The two conditions are
//    complementary; `tag` (notificationId) collapses any accidental duplicate.
const IS_WEBKIT_SAFARI = /AppleWebKit/.test(self.navigator.userAgent) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Android/.test(self.navigator.userAgent);

function buildNotification(payload) {
    const data = (payload && payload.data) || {};
    const notification = (payload && payload.notification) || {};
    return {
        title: data.title || notification.title || 'joinUp',
        options: {
            body: data.body || notification.body || '',
            icon: '/icons/web-app-manifest-192x192.png',
            badge: '/icons/favicon-96x96.png',
            tag: data.notificationId || undefined,
            data: {
                link: data.link || '/'
            }
        }
    };
}

function hasVisibleClient() {
    return clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((list) => list.some((c) => c.visibilityState === 'visible'));
}

// Registered before Firebase's own push listener so event.waitUntil is still callable.
self.addEventListener('push', (event) => {
    if (!IS_WEBKIT_SAFARI || !event.data) return;
    let payload;
    try {
        payload = event.data.json();
    } catch (e) {
        return;
    }
    event.waitUntil(hasVisibleClient().then((visible) => {
        if (!visible) return; // onBackgroundMessage handles the background case
        const { title, options } = buildNotification(payload);
        return self.registration.showNotification(title, options);
    }));
});

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config
firebase.initializeApp({
    apiKey: "AIzaSyDk_jqz8vSnFDcHZdRa7asvYQxrn1NJ2Ms",
    authDomain: "joinup-ea816.firebaseapp.com",
    projectId: "joinup-ea816",
    storageBucket: "joinup-ea816.firebasestorage.app",
    messagingSenderId: "387017071876",
    appId: "1:387017071876:web:38c23ebd71cb528ea94451",
    measurementId: "G-K3V1C2Y5SC"
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const { title, options } = buildNotification(payload);
    return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function (event) {
    console.log('[firebase-messaging-sw.js] Notification click received.');

    event.notification.close();

    // Get the link from data, default to root
    const link = event.notification.data?.link || '/';
    // Construct absolute URL
    const urlToOpen = new URL(link, self.registration.scope).href;

    // This looks to see if the current is already open and focuses if it is
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function (clientList) {
            // Check if there's already a tab/window open with this URL
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                // Check if client is in our scope and is focusable
                if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
                    if (link && link !== '/') {
                        client.navigate(urlToOpen);
                    }
                    return client.focus();
                }
            }
            // If not open, open a new window with absolute URL
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
