/* eslint-disable no-undef */
// Give the service worker access to Firebase Messaging.
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
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icons/icon-192x192.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
