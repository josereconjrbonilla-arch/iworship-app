#!/usr/bin/env node
// One-time import of the sample hymns into a real Firestore project's
// "songs" collection. Run this once, right after you've created the
// Firebase project and swapped in real values in src/firebase-config.js
// (see README.md, "Seeding the hymnal").
//
//   npm run seed
//
// Uses firebase-admin with Application Default Credentials, which for a
// project you own is easiest via the Firebase CLI:
//   npx firebase login
//   npx firebase use <your-project-id>
//   GOOGLE_APPLICATION_CREDENTIALS unset, then just run: npm run seed
// (the Firebase CLI login is enough for `firebase deploy`, but
// firebase-admin here needs its own credential -- see the try/catch below,
// which gives you the exact gcloud command if this fails.)
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Pull the project ID out of src/firebase-config.js so this script doesn't
// need its own separate config to stay in sync.
const configSrc = readFileSync(path.join(root, 'src/firebase-config.js'), 'utf8');
const projectIdMatch = configSrc.match(/projectId:\s*'([^']+)'/);
const projectId = projectIdMatch ? projectIdMatch[1] : null;

if (!projectId || projectId === 'REPLACE_ME') {
  console.error(
    'src/firebase-config.js still has placeholder values.\n' +
    'Fill in your real Firebase project config there first (see README.md,\n' +
    '"Connecting your Firebase project"), then run `npm run seed` again.'
  );
  process.exit(1);
}

const serviceAccountPath = path.join(root, 'service-account.json');
let app;
try {
  if (existsSync(serviceAccountPath)) {
    app = initializeApp({ credential: cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8'))), projectId });
  } else {
    app = initializeApp({ credential: applicationDefault(), projectId });
  }
} catch (e) {
  console.error(
    'Could not load Firebase Admin credentials.\n\n' +
    'Easiest fix -- generate a service account key and save it as\n' +
    'service-account.json in this project\'s root folder (it\'s already in\n' +
    '.gitignore so it won\'t get committed by accident):\n' +
    '  Firebase console -> Project settings -> Service accounts -> Generate new private key\n\n' +
    'Or, if you have the gcloud CLI set up for this project:\n' +
    '  gcloud auth application-default login\n\n' +
    'Original error: ' + e.message
  );
  process.exit(1);
}

const db = getFirestore(app);
const { SONGS_SEED } = await import('../src/content/songs-seed.js');

console.log(`Seeding ${SONGS_SEED.length} songs into project "${projectId}"...`);
let count = 0;
for (const song of SONGS_SEED) {
  const { id, ...data } = song;
  await db.collection('songs').doc(id).set(data, { merge: true });
  count++;
  console.log(`  [${count}/${SONGS_SEED.length}] ${song.title}`);
}
console.log('Done. Open the Firebase console -> Firestore Database to see the "songs" collection.');
process.exit(0);
