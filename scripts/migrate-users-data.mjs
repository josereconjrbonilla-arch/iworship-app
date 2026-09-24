// One-time Firestore migration: re-copies ONLY the user-identity collections
// (users, directory, editors, admins -- and users/{uid}'s saved/pushTokens
// subcollections) from the OLD project (iworship-8b3e6) into the NEW one
// (iworship-ph), skipping Jared's own account.
//
// Since these Firestore documents are keyed by uid, not email, this script
// first looks up Jared's OLD uid itself (via Firebase Auth's
// getUserByEmail(JARED_EMAIL) against the OLD project) rather than needing
// that uid typed in by hand -- see migrate-auth-users.mjs's own comment for
// why matching by email is more reliable than hunting down a uid.
//
// Run migrate-auth-users.mjs FIRST -- this script only restores each
// person's DATA at their original uid; the Auth script is what makes that
// uid reachable again when they sign back in with the same Google account.
//
// Deliberately narrower than migrate-firestore.mjs (the original full
// migration script): this does NOT touch songs, sermons, media, churches,
// dmThreads, groupChats, posts, or any other content/social collection.
// Re-running the full migration now would risk overwriting real content
// that's been added or edited in iworship-ph since the original migration
// with stale copies from the old project -- this script only ever writes to
// the four collections listed above, nothing else.
//
// Safe to re-run -- overwrites documents at the same uid in the destination
// project, never touches or deletes anything in the OLD project.
//
// SETUP: same two service-account JSON files as the other two scripts.
//
// RUN (after migrate-auth-users.mjs):
//   node scripts/migrate-users-data.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

// ---- FILL THIS IN (same value as migrate-auth-users.mjs) ----
const OLD_SERVICE_ACCOUNT_PATH = './iworship-8b3e6-firebase-adminsdk-fbsvc-4a5b4bf816.json';
const NEW_SERVICE_ACCOUNT_PATH = './iworship-ph-firebase-adminsdk-fbsvc-f142e897bb.json';
const JARED_EMAIL = 'josereconjrbonilla@gmail.com';
// ------------------------

const oldApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(OLD_SERVICE_ACCOUNT_PATH, 'utf8'))) },
  'old-data'
);
const newApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(NEW_SERVICE_ACCOUNT_PATH, 'utf8'))) },
  'new-data'
);
const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);
const oldAuth = getAuth(oldApp);

const BATCH_SIZE = 400; // under Firestore's 500-writes-per-batch limit

// Copies a top-level collection, skipping any document whose ID is
// SKIP_DOC_ID (Jared's own uid), and recursing into named subcollections
// for the docs that DO get copied.
async function copyCollection(oldColRef, newColRef, pathLabel, { skipDocId, subcollections } = {}) {
  const snap = await oldColRef.get();
  let batch = newDb.batch();
  let count = 0;
  let skipped = 0;
  for (const docSnap of snap.docs) {
    if (skipDocId && docSnap.id === skipDocId) {
      skipped++;
      continue;
    }
    const destDocRef = newColRef.doc(docSnap.id);
    batch.set(destDocRef, docSnap.data());
    count++;
    if (count % BATCH_SIZE === 0) {
      await batch.commit();
      batch = newDb.batch();
    }
    if (subcollections) {
      for (const subName of subcollections) {
        const subSnap = await docSnap.ref.collection(subName).get();
        if (subSnap.empty) continue;
        let subBatch = newDb.batch();
        let subCount = 0;
        for (const subDoc of subSnap.docs) {
          subBatch.set(destDocRef.collection(subName).doc(subDoc.id), subDoc.data());
          subCount++;
          if (subCount % BATCH_SIZE === 0) {
            await subBatch.commit();
            subBatch = newDb.batch();
          }
        }
        if (subCount % BATCH_SIZE !== 0) await subBatch.commit();
        console.log(`    ${pathLabel}/${docSnap.id}/${subName}: ${subSnap.size} doc(s)`);
      }
    }
  }
  if (count % BATCH_SIZE !== 0) await batch.commit();
  console.log(`  ${pathLabel}: ${count} doc(s) copied${skipped ? `, ${skipped} skipped (your own account)` : ''}`);
}

async function main() {
  let jaredOldUid = null;
  try {
    const jaredUser = await oldAuth.getUserByEmail(JARED_EMAIL);
    jaredOldUid = jaredUser.uid;
    console.log(`Found your old account in iworship-8b3e6 (uid ${jaredOldUid}) -- its documents will be skipped.\n`);
  } catch (err) {
    console.warn(`Warning: no user in iworship-8b3e6 matched ${JARED_EMAIL} (${err.code || err.message}) -- nobody will be excluded. Double-check this is the right email before continuing (Ctrl+C to stop).\n`);
  }

  console.log('Copying user-identity collections from iworship-8b3e6 into iworship-ph (skipping your own account)...\n');

  await copyCollection(oldDb.collection('users'), newDb.collection('users'), 'users', {
    skipDocId: jaredOldUid,
    subcollections: ['saved', 'pushTokens'],
  });
  await copyCollection(oldDb.collection('directory'), newDb.collection('directory'), 'directory', {
    skipDocId: jaredOldUid,
  });
  await copyCollection(oldDb.collection('editors'), newDb.collection('editors'), 'editors', {
    skipDocId: jaredOldUid,
  });
  await copyCollection(oldDb.collection('admins'), newDb.collection('admins'), 'admins', {
    skipDocId: jaredOldUid,
  });

  console.log('\nDone. Nothing in the old project was modified or deleted.');
  console.log('Testers can sign back into iworship-ph with the same Google account now and should see their real profile again.');
}

main().catch((err) => {
  console.error('Data migration failed:', err);
  process.exit(1);
});
