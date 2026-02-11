/* eslint-disable no-undef */
// Give the service worker access to Firebase Messaging.
const SW_VERSION = 'v1.2.0'; // Change this to force update
console.log(`[firebase-messaging-sw.js] Service Worker Version: ${SW_VERSION}`);

self.addEventListener('install', (event) => {
    console.log('[firebase-messaging-sw.js] Installing new version...');
    self.skipWaiting(); // Force this SW to become active immediately
});

self.addEventListener('activate', (event) => {
    console.log('[firebase-messaging-sw.js] Activating new version...');
    event.waitUntil(clients.claim()); // Take control of all clients immediately
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

    // Customize notification here
    const notificationTitle = payload.data.title || payload.notification?.title || 'New Notification';
    const notificationOptions = {
        body: payload.data.body || payload.notification?.body,
        icon: '/icons/web-app-manifest-192x192.png',
        badge: '/icons/favicon-96x96.png',
        data: {
            link: payload.data.link || '/'
        }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
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
