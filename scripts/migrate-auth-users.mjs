// One-time Auth migration: re-creates every OTHER user's Firebase Auth
// account in the NEW project (iworship-ph), preserving their EXACT uid and
// Google-linked identity from the OLD project (iworship-8b3e6) -- except
// Jared's own account, which is deliberately skipped (see JARED_OLD_UID
// below) since he already has a clean, freshly-created account in the new
// project and this script must not touch or duplicate that.
//
// Preserving the uid matters: it's what lets someone sign back into
// iworship-ph with the SAME Google account and have Firebase recognize them
// as the same person, so their migrated Firestore profile (run
// migrate-users-data.mjs AFTER this script) is actually reachable instead of
// sitting at an orphaned uid nobody's signed-in session ever matches.
//
// Jared is excluded by EMAIL (JARED_EMAIL below), not uid -- uids are
// different in every Firebase project, so "his uid" is ambiguous across
// iworship-8b3e6 vs iworship-ph vs before/after today's reset. His email is
// the one stable thing to match on.
//
// LIMITATION: this only preserves Google Sign-In identities. The Admin SDK's
// listUsers() never exposes password hashes (a deliberate Firebase security
// restriction) -- so any account that signed up with email/password, not
// Google, comes across with no password, and that person will need to use
// "forgot password" once after this runs. If you have many password-based
// testers and want those preserved too, say so and we'll switch this to the
// `firebase auth:export` / `auth:import` CLI flow instead, which can carry
// password hashes across with the right --hash-algo flags.
//
// SETUP (once, same as migrate-firestore.mjs):
//   1. npm install firebase-admin   (in this scripts/ folder, or the repo root)
//   2. You should already have both service account key JSON files from the
//      original migration -- same two files migrate-firestore.mjs uses.
//   3. JARED_EMAIL below is already filled in with your Google account
//      email -- change it only if the old iworship-8b3e6 account used a
//      different one.
//
// RUN (in this order -- this script first, migrate-users-data.mjs second):
//   node scripts/migrate-auth-users.mjs
//
// Safe to re-run: importUsers() overwrites-in-place for uids that already
// exist in the new project, and never touches or deletes anything in the
// OLD project. If a tester already signed into iworship-ph fresh since
// today's reset, their Google identity is already linked to some OTHER
// (new, mismatched) uid there -- Firebase will refuse to import a second,
// conflicting record for that same Google account, and that person's entry
// will show up in the "Failures" list below rather than silently breaking
// anything. Handle those manually afterward (see the printed errors).

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

// ---- FILL THESE IN ----
const OLD_SERVICE_ACCOUNT_PATH = './iworship-8b3e6-firebase-adminsdk-fbsvc-4a5b4bf816.json';
const NEW_SERVICE_ACCOUNT_PATH = './iworship-ph-firebase-adminsdk-fbsvc-f142e897bb.json';
const JARED_EMAIL = 'josereconjrbonilla@gmail.com';
// ------------------------

const oldApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(OLD_SERVICE_ACCOUNT_PATH, 'utf8'))) },
  'old-auth'
);
const newApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(NEW_SERVICE_ACCOUNT_PATH, 'utf8'))) },
  'new-auth'
);
const oldAuth = getAuth(oldApp);
const newAuth = getAuth(newApp);

async function main() {
  console.log('Listing every user in the OLD project (iworship-8b3e6)...');
  const usersToImport = [];
  let skippedPasswordOnly = 0;
  let jaredFound = false;
  let nextPageToken;
  do {
    const page = await oldAuth.listUsers(1000, nextPageToken);
    for (const u of page.users) {
      if (u.email && u.email.toLowerCase() === JARED_EMAIL.toLowerCase()) {
        jaredFound = true;
        continue; // Jared's own account -- deliberately skipped
      }
      const hasGoogle = u.providerData.some((p) => p.providerId === 'google.com');
      if (!hasGoogle) {
        // Email/password-only account -- no password hash available via this
        // method, so this account still needs to come across (so their
        // Firestore data is reachable once they reset their password and
        // sign in), just without a usable password. They'll need "forgot
        // password" after this.
        skippedPasswordOnly++;
      }
      usersToImport.push({
        uid: u.uid,
        email: u.email || undefined,
        emailVerified: u.emailVerified,
        displayName: u.displayName || undefined,
        photoURL: u.photoURL || undefined,
        disabled: u.disabled,
        providerData: u.providerData.map((p) => ({
          uid: p.uid,
          email: p.email || undefined,
          displayName: p.displayName || undefined,
          photoURL: p.photoURL || undefined,
          providerId: p.providerId,
        })),
      });
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  if (!jaredFound) {
    console.warn(`Warning: no user in iworship-8b3e6 matched ${JARED_EMAIL} -- nobody was excluded. Double-check this is the right email before continuing (Ctrl+C to stop).`);
  }
  console.log(`Found ${usersToImport.length} other user(s) to import${jaredFound ? ' (excluding your own account)' : ''}.`);
  if (skippedPasswordOnly > 0) {
    console.log(`${skippedPasswordOnly} of those are email/password accounts with no Google link -- they'll come across without a working password and need "forgot password" once, after this runs.`);
  }
  if (usersToImport.length === 0) {
    console.log('Nothing to import. Done.');
    return;
  }

  console.log('Importing into the NEW project (iworship-ph)...');
  const result = await newAuth.importUsers(usersToImport);
  console.log(`\nSuccess: ${result.successCount}   Failures: ${result.failureCount}`);
  if (result.failureCount > 0) {
    console.log('\nFailures (likely testers who already re-registered fresh since today\'s reset --');
    console.log('their Google account is already linked to a different, newer uid; leave them on');
    console.log('that fresh account, or delete it in the console first if you want the old one instead):');
    for (const e of result.errors) {
      const failedUser = usersToImport[e.index];
      console.log(`  - ${failedUser.email || failedUser.uid}: ${e.error.message}`);
    }
  }
  console.log('\nNext: run scripts/migrate-users-data.mjs to bring their Firestore profiles across too.');
}

main().catch((err) => {
  console.error('Auth migration failed:', err);
  process.exit(1);
});
