// Custom service worker [2026-09-10] -- Jared: "no notif came from the app
// (when closed) when I messaged her. I need you to setup something where the
// app asks for notif and background process permission."
//
// vite-plugin-pwa's default 'generateSW' mode (the old config) auto-writes a
// service worker from a Workbox recipe with no room to add custom logic.
// Firebase Cloud Messaging's *background* push handling (onBackgroundMessage,
// which fires while the app is fully closed/backgrounded — the exact gap
// Jared hit) has to live inside that same service worker file, so this repo
// now uses the 'injectManifest' strategy instead (see vite.config.js): this
// file is the real source, bundled by Rollup, with self.__WB_MANIFEST as the
// one required injection point where the precache list gets spliced in.
//
// Everything under the "APP SHELL CACHING" heading below is a straight,
// explicit port of the runtime-caching rule that used to live in
// vite.config.js's `workbox: {...}` block under generateSW mode — same
// caching behavior, just written by hand instead of generated.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ---- APP SHELL CACHING --------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Same rule as the old generateSW config: the bundled KJV Bible text
// (src/content/kjv.json, ~4.3MB) is its own lazy-loaded chunk, excluded from
// the precache list (see vite.config.js) so installing/updating the app
// stays fast for the vast majority of opens that never touch it. The first
// time someone actually opens Bible, this catches that fetch and caches it
// for a year, so every visit after — including offline — is instant.
registerRoute(
  /\/assets\/kjv-.*\.js$/,
  new CacheFirst({
    cacheName: 'kjv-bible-text',
    plugins: [new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 })]
  })
);

self.skipWaiting();
// no clientsClaim() here -- registerType stays 'prompt' (see vite.config.js
// and app.js's registerSW() call): a new worker installs and WAITS rather
// than taking over open tabs on its own, so a stray reload never yanks
// anyone's in-progress edit out from under them.

// ---- BACKGROUND PUSH (Firebase Cloud Messaging) --------------------------
// Only runs at all once Jared has generated a real VAPID key (see
// push-config.js) -- firebase-config.js's placeholder-check keeps this a
// harmless no-op in demo mode / before that setup step, same pattern as
// every other "requires Jared's one console action" feature in this app.
import { initializeApp } from 'firebase/app';
import { isSupported, getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

if (isFirebaseConfigured) {
  isSupported().then((supported) => {
    if (!supported) return;
    const app = initializeApp(firebaseConfig);
    const messaging = getMessaging(app);
    onBackgroundMessage(messaging, (payload) => {
      // This is what actually fires while the app is closed -- the gap
      // Jared reported. sendPushOnNotification (functions/index.js) sends a
      // top-level `notification` block, so that's the primary shape; the
      // `data` fallback covers a future data-only message.
      const title = (payload.notification && payload.notification.title)
        || (payload.data && payload.data.title)
        || 'iWorship';
      const body = (payload.notification && payload.notification.body)
        || (payload.data && payload.data.body)
        || '';
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: payload.data || {}
      });
    });
  }).catch(() => {
    // Messaging unsupported in this browser (e.g. Safari on older iOS) --
    // the rest of the service worker (app-shell caching) still works fine.
  });
}

// Tapping the OS notification focuses/opens the app instead of just
// dismissing it. session_live [2026-09-17, see onNewSessionNotify in
// functions/index.js] carries a roomCode in its data payload, so tapping
// IT specifically jumps straight into joining that session
// ("?join=<code>", read by the startup routing block in app.js via
// goToJoinScreenWithCode()) rather than just bringing whatever's already
// open to the front -- every other notification type (like/comment/
// follow/message) keeps that original, unrelated-to-content behavior
// unchanged, since there's nothing more specific for those to jump to yet.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const joinUrl = (data.type === 'session_live' && data.roomCode) ? ('/?join=' + encodeURIComponent(data.roomCode)) : null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client){
          if(joinUrl && 'navigate' in client) return client.navigate(joinUrl).then((c) => (c || client).focus());
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(joinUrl || '/');
    })
  );
});
