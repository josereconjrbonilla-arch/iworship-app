// One-time Storage migration: copies every uploaded file (media library
// images/videos, profile photos, sermon slide backgrounds, story/short
// media) from the OLD project's bucket into the NEW iworship-ph project's
// bucket, at the same path. Run locally on Jared's machine, same setup as
// migrate-firestore.mjs (needs the two service account JSON files).
//
// This downloads each file from the old bucket and re-uploads it to the new
// one -- slower than a same-project copy, but it works without needing any
// cross-project IAM permissions set up, which is the simpler and safer
// option for a one-time move. For a lot of large video files this can take
// a while; it prints progress as it goes and is safe to re-run (it just
// re-uploads/overwrites the same paths).

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';

// ---- FILL THESE IN ----
// Same folder convention as migrate-firestore.mjs -- both JSON key files
// live in this project's root folder, and you run this from there too.
const OLD_SERVICE_ACCOUNT_PATH = './iworship-8b3e6-firebase-adminsdk-fbsvc-4a5b4bf816.json';
const NEW_SERVICE_ACCOUNT_PATH = './iworship-ph-firebase-adminsdk-fbsvc-f142e897bb.json';
// Best-guess default bucket names based on each project's id -- CONFIRM
// both against the Storage tab in each project's Firebase console before
// running (it shows the exact bucket name at the top of the file list) and
// correct these if they don't match.
const OLD_BUCKET_NAME = 'iworship-8b3e6.firebasestorage.app';
const NEW_BUCKET_NAME = 'iworship-ph.firebasestorage.app';
// ------------------------

const oldApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(OLD_SERVICE_ACCOUNT_PATH, 'utf8'))), storageBucket: OLD_BUCKET_NAME },
  'old-storage'
);
const newApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(NEW_SERVICE_ACCOUNT_PATH, 'utf8'))), storageBucket: NEW_BUCKET_NAME },
  'new-storage'
);

const oldBucket = getStorage(oldApp).bucket();
const newBucket = getStorage(newApp).bucket();

async function main() {
  const [files] = await oldBucket.getFiles();
  console.log(`Found ${files.length} file(s) in the old bucket.\n`);
  let done = 0;
  for (const file of files) {
    const destFile = newBucket.file(file.name);
    const [buffer] = await file.download();
    await destFile.save(buffer, {
      metadata: (await file.getMetadata())[0].contentType
        ? { contentType: (await file.getMetadata())[0].contentType }
        : undefined
    });
    done++;
    console.log(`  [${done}/${files.length}] ${file.name}`);
  }
  console.log('\nDone. Nothing in the old bucket was modified or deleted.');
}

main().catch((err) => {
  console.error('Storage migration failed:', err);
  process.exit(1);
});
