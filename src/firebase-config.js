// ---------------------------------------------------------------------------
// Paste your real Firebase project's config here once you've created it.
// See README.md → "1. Create the Firebase project" for exact click-by-click
// steps (Firebase console → Project settings → Your apps → SDK setup and
// configuration → Config). Until you do, every value below is a placeholder
// and the app automatically runs in local demo mode instead (see
// src/data/index.js) — nothing breaks, it just doesn't sync between devices.
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: 'AIzaSyAlsHg8djaTiu78bivvIuZy40OML8-mTGI',
  authDomain: 'iworship-8b3e6.firebaseapp.com',
  projectId: 'iworship-8b3e6',
  storageBucket: 'iworship-8b3e6.firebasestorage.app',
  messagingSenderId: '1093836000840',
  appId: '1:1093836000840:web:e66a7ed26e8a89d1a6127d'
};

// True only once every placeholder above has been replaced with a real value.
export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (v) => typeof v === 'string' && !v.includes('REPLACE_ME')
);
