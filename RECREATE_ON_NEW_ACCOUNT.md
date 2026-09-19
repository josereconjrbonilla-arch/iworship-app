# Recreating this project on a different Claude account

This zip is everything needed to pick this project back up from scratch
on a new claude.ai account — the full app source (not just a built
`dist` folder) plus the three Claude Project docs that captured every
design decision along the way.

## 1. Set up the new Claude Project

Create a new Project on the new account (any name works, e.g. "Hymnal
App" to match this one). Upload these three files from `claude/` as its
knowledge:

- `claude/phase4-features-and-scoping.md`
- `claude/monetization-plan.md`
- `claude/architecture-and-decisions.md`

These are the running design/decision logs Claude has kept throughout
this build — who asked for what, why things were built the way they
were, what's still open. A new session that reads them has essentially
the same context this one has.

## 2. Get the code into a session

Unzip this file's contents into a new session's working directory (or
attach the zip and have Claude unzip it there). Everything needed to
build and run the app is included:

- `src/` — the actual application source (`app.js`, `styles.css`,
  `data/` layer, `content/` including the KJV Bible data, etc.)
- `public/` — static assets, manifest, service-worker-related files
- `functions/` — the (currently undeployed) Cloud Functions scaffold
- `index.html`, `vite.config.js`, `package.json`, `package-lock.json`
- `firestore.rules`, `firestore.indexes.json`, `storage.rules`,
  `firebase.json`, `.firebaserc` — the real Firebase project's rules
  and config (the actual Firebase *project* itself — the database,
  auth, hosting — isn't something a zip can carry; see below)
- `scripts/`, `bulk-import/`, `cloudflare-worker/` — one-off tooling and
  the AI-tagging Worker source
- Reference/audit files: `Friend_Songs_Audit.xlsx`, `compiled_titles.json`,
  `friend-songs-list.json`, `friend_matched.json`,
  `friend_songs_parsed.json`, `friend_unmatched.json`, `audit_export.csv`
- `README.md` (the full build/deploy history and instructions) and
  `PLAY_STORE_SUBMISSION_GUIDE.md`

Not included (regenerate instead of shipping, since they're huge and
disposable): `node_modules/` — run `npm install`; `dist/` and every
`iworship-deploy-vN.zip` — run `npm run build` to regenerate the current
one.

## 3. What does NOT move with this zip

- **The live Firebase project itself** — the actual database, its data
  (real hymns, users, rooms), and Firebase Authentication all live under
  Jared's Google/Firebase account, entirely separate from any Claude
  account. `src/firebase-config.js` in this zip already points at that
  real project, so a new session's build will still talk to the same
  live backend — nothing to reconnect there. If the app itself ever
  needs to move to a *different* Firebase project, that's a separate,
  bigger step (new project, re-paste rules, migrate data) and isn't
  what this zip is for.
- **The Netlify deployment** — also a separate account/service, unaffected
  by which Claude account is doing the building.
- **Chat/session history** in the old Claude account. The two project
  docs are what carry the *decisions* forward; the raw conversation
  transcript itself doesn't move.

## 4. First thing to do in the new session

Point Claude at this zip and the new Project's docs and say something
like: "This is the iWorship app, continuing from another account — read
the three project docs, then let me know you're up to speed." That's
enough for a new session to pick up right where this one left off.
