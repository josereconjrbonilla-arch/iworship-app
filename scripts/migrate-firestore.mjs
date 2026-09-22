// One-time Firestore migration: copies every collection/subcollection from
// the OLD project (nam5, US) into the NEW project (iworship-ph, asia-
// southeast1). Run this locally with Node -- it needs a real network path
// to both Firebase projects, which this sandboxed environment does not
// have, so this is meant for Jared's own machine.
//
// SETUP (once):
//   1. npm install firebase-admin   (in this scripts/ folder, or the repo root)
//   2. Download a service account key for EACH project:
//      Firebase console -> Project Settings -> Service Accounts ->
//      Generate new private key. Save them somewhere OUTSIDE this repo
//      (e.g. your Desktop) -- never commit these files to git.
//   3. Fill in the two paths below.
//
// RUN:
//   node scripts/migrate-firestore.mjs
//
// This is safe to re-run -- it overwrites documents at the same path in the
// destination project (doc IDs are preserved), it never deletes or touches
// anything in the OLD project, and it does not touch Auth users (Firebase
// Auth accounts have to be recreated by each person signing in again on the
// new project -- there is no API to copy passwords/Google-linked identities
// across projects).

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// ---- FILL THESE IN ----
// Both paths are relative to wherever you run `node scripts/...` from --
// see REBUILD_TO_IWORSHIP_PH.md: put both downloaded JSON key files
// directly in this project's root folder (next to package.json) and run
// the script from there, and these relative names just work as-is.
const OLD_SERVICE_ACCOUNT_PATH = './iworship-8b3e6-firebase-adminsdk-fbsvc-4a5b4bf816.json';
const NEW_SERVICE_ACCOUNT_PATH = './iworship-ph-firebase-adminsdk-fbsvc-f142e897bb.json';
// ------------------------

const oldApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(OLD_SERVICE_ACCOUNT_PATH, 'utf8'))) },
  'old'
);
const newApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(NEW_SERVICE_ACCOUNT_PATH, 'utf8'))) },
  'new'
);
const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

const BATCH_SIZE = 400; // under Firestore's 500-writes-per-batch limit

async function copyCollection(oldColRef, newColRef, pathLabel) {
  const snap = await oldColRef.get();
  console.log(`  ${pathLabel}: ${snap.size} doc(s)`);
  let batch = newDb.batch();
  let count = 0;
  for (const docSnap of snap.docs) {
    const destDocRef = newColRef.doc(docSnap.id);
    batch.set(destDocRef, docSnap.data());
    count++;
    if (count % BATCH_SIZE === 0) {
      await batch.commit();
      batch = newDb.batch();
    }
    // Recurse into subcollections (e.g. users/{uid}/pushTokens, rooms/{code}/messages).
    const subcols = await docSnap.ref.listCollections();
    for (const subcol of subcols) {
      await copyCollection(
        subcol,
        destDocRef.collection(subcol.id),
        `${pathLabel}/${docSnap.id}/${subcol.id}`
      );
    }
  }
  if (count % BATCH_SIZE !== 0) await batch.commit();
}

async function main() {
  const topLevelCollections = await oldDb.listCollections();
  console.log(`Found ${topLevelCollections.length} top-level collections in the old project:`);
  console.log(topLevelCollections.map((c) => c.id).join(', '));
  console.log('');
  for (const col of topLevelCollections) {
    await copyCollection(col, newDb.collection(col.id), col.id);
  }
  console.log('\nDone. Nothing in the old project was modified or deleted.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
