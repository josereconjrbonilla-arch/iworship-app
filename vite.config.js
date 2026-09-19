import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// iWorship — built as an installable Progressive Web App first.
// The PWA is what PWABuilder (pwabuilder.com) later wraps into the Android
// APK/AAB (see README.md, "Packaging an installable Android APK") — one
// codebase, no separate native app to maintain.
export default defineConfig({
  plugins: [
    VitePWA({
      // [2026-09-10] Was 'autoUpdate' -- a new service worker used to take
      // over silently in the background with zero visible signal, which is
      // exactly what confused Jared while testing several versions in quick
      // succession ("why do I need to refresh for new updates to come in").
      // 'prompt' makes a new service worker install and WAIT instead of
      // taking over immediately; app.js's own registerSW() call (see the
      // startup block near the end of that file) drives a persistent
      // in-app banner asking the person to update, rather than reloading
      // anything out from under them uninvited. injectRegister:false stops
      // this plugin from ALSO auto-injecting its own default registration
      // script into index.html, which would otherwise register a second,
      // conflicting listener alongside app.js's own custom one.
      registerType: 'prompt',
      injectRegister: false,
      // injectManifest [2026-09-10] -- was the default 'generateSW' mode,
      // which auto-writes the whole service worker from a Workbox recipe
      // with no room to add custom logic. Real (works-when-closed) push
      // notifications need Firebase Cloud Messaging's onBackgroundMessage
      // handler living in the SAME service worker file as the app-shell
      // caching, so src/sw.js is now the hand-written source (bundled by
      // Rollup) and this plugin just injects the precache manifest into it
      // via self.__WB_MANIFEST -- see src/sw.js for the full rationale and
      // the app-shell caching rule ported over from the old workbox block
      // below.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'],
      manifest: {
        name: 'iWorship',
        short_name: 'iWorship',
        description: 'Your congregation’s hymnal, chord book, and live worship sessions.',
        theme_color: '#6B1220',
        // Loading-flash fix [2026-09-05]: Jared, on his phone: "it still
        // shows very quickly a browser screen loading." background_color is
        // what the OS paints as the native splash screen the INSTANT the app
        // is tapped from the home screen -- before any HTML/CSS/JS has even
        // been fetched, let alone index.html's own inlined #splash div (see
        // index.html's <style>/<script> for that one, which already matches
        // the icon's #6B1220 background exactly). This was '#F6EFDD' (the
        // app's cream page background) instead, so launching showed a wrong-
        // colored flash for a beat before the real (correctly-colored)
        // splash took over. Matching it to the same #6B1220 makes the native
        // splash and the in-app splash visually indistinguishable -- one
        // continuous screen, no flash, regardless of network speed.
        background_color: '#6B1220',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // The old `workbox: {...}` generateSW config (globPatterns/globIgnores/
      // runtimeCaching for the KJV Bible chunk) has been ported, by hand, into
      // src/sw.js's "APP SHELL CACHING" section now that this plugin no
      // longer generates the service worker itself. injectManifest still
      // needs to know what to precache, though -- that's the `injectManifest`
      // key below (NOT `injectManifestOptions` -- that's not a real option;
      // vite-plugin-pwa's own buildSW() spreads `options.injectManifest`
      // straight into workbox-build's injectManifest() call), the equivalent
      // of the old globPatterns/globIgnores pair.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/kjv-*.js']
      }
    })
  ],
  server: { port: 5173 },
  // esnext: data/index.js uses a top-level `await import()` to pick the
  // Firestore vs. local data layer, which needs a target that supports
  // top-level await. Fine for a PWA — every browser this installs on
  // (modern Chrome/Safari on phones and tablets) supports it.
  build: { outDir: 'dist', target: 'esnext' },
  esbuild: { target: 'esnext' }
});
