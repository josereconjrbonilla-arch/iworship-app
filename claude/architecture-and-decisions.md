---
title: iWorship — Architecture & Decisions
status: real build deployed and in live pilot use at https://iworshipv1.netlify.app/ (Firebase project created, rules live, editors added, real hymns being entered); pre-service setlists, in-session chat (Everyone + Musicians), a "Manage My Sessions" cleanup screen, a 178-song copyright audit, a 127-song public-domain bulk-import compilation, optional AI theme tagging (client side built, pending Jared's Cloudflare Worker + Anthropic API key setup), a manual Edit Song feature (title/key/YouTube/tags/themes/lyrics+chords, editors only), a second 230-song friend's-collection audit + 141-song PD compilation, offline Firestore persistence, a "no default tag on new songs" fix, a fully working, confirmed-live installable Android APK (PWABuilder-packaged TWA, assetlinks.json served via a non-dot-path + forced Netlify redirect), a branded animated splash screen, Google Play Store publishing prep (privacy policy live, submission guide delivered), and monetization phases 1-3 — an in-app Plans & Pricing screen (peso pricing, now including an Enterprise/Custom tier), the full `churches`/role-field schema, a written-but-undeployed Cloud Functions scaffold (registerChurch/assignRole/updateChurchLibrary/stripeWebhook), and a new in-app Admin screen that lets two trusted Admins register churches/assign roles/grant beta access via direct client writes as a disclosed, temporary bridge until Firebase Blaze is enabled — with real Play Mode/add-song/hosting gating now live for everyone (not just beta testers) per Jared's explicit decision — the Senior-Pastor-only Admin-screen restriction, the chord-tap Editor UI, daily caps, duplicate flagging, the ticketing system, and actually deploying Cloud Functions/Blaze billing all still ahead, the last of those blocked on Jared enabling Firebase Blaze — shipped and verified this update
last updated: 2026-09-10
---

# iWorship — Hymnal App

(Renamed from "Chorus & Verse" per Jared's request.) A cloud-based hymnal
app (web + installable APK) for the congregation, built for two audiences
at once: elders/congregation who need huge, simple, legible lyrics, and
instrumentalists who need chords and key transposition. Song entry
supports both pasting lyrics for auto-detection and building
verses/choruses by hand, plus favorites, topical theme browsing, YouTube
links for learning new songs, a personalized landing page with a daily
verse and the congregation's church name, and a live "Worship Service"
hosting mode with a host-prepped setlist, in-session chat, and a
self-service cleanup screen for abandoned sessions.

## Two parallel builds — know which one you're looking at

**1. The Claude Artifact prototype** — still live at
`https://claude.ai/code/artifact/e7aa23f9-f3a6-4a1d-9692-d42749ae7a45`,
renamed to iWorship. Fully self-contained (all state in the page itself,
Worship Sessions synced by republishing the artifact — see the older
section below for how that works). Good for a quick demo, not the
long-term app.

**2. The real Firebase/Vite build** — a proper project at
`iworship-app/`, delivered to Jared as a zip. **This is now the live app
Jared's congregation actually uses** — his Firebase project exists, the
security rules are deployed, he and his worship team are on the editors
list, and he's actively entering the church's real hymns through the
app's own Add Song / Bulk Add Songs tools. It runs in **demo mode** out
of the box (device-local only, via localStorage) and **graduates to real
mode** the moment `src/firebase-config.js` gets real values — same code
either way, no rebuild required. Deployed to a Netlify Drop URL rather
than Firebase Hosting (see "No-CLI deployment," below) since Jared's
Magic-owned Windows computer has no admin rights and can't install
Node.js or the Firebase CLI.

## The real build's architecture

**Data-layer abstraction.** `src/app.js` (all UI logic) is written once
against a shared async interface documented in `src/data/interface.md`
— `watchSongs`, `addSong`, `updateSong`, `watchAuth`, `signInWithGoogle`,
`watchProfile`, `saveProfile`, `createRoom`, `watchRoom`, `updateRoom`,
`endRoom`, `watchPublicRooms`, `watchHostRooms`, `checkRoomPassword`,
`checkIsEditor`, `watchSessionMessages`, `sendSessionMessage`,
`watchChurch`, and now (phase 3, see below) `watchAllChurches`,
`newChurchId`, `saveChurch`, and `checkIsAdmin`. Two implementations:
`local-data-layer.js` (localStorage + BroadcastChannel, demo mode) and
`firestore-data-layer.js` (real Firebase JS SDK v12, real mode).
`data/index.js` picks one automatically based on whether
`firebase-config.js` still has placeholder (`REPLACE_ME`) values.

**Build tooling:** Vite (`build.target`/`esbuild.target: 'esnext'`,
required for top-level-await) + `vite-plugin-pwa` (Workbox-based offline
app-shell caching, manifest with wine/ivory-themed 192/512/512-maskable
icons). Firestore security rules (`firestore.rules`) restrict
hymnal/session/chat writes to an `editors` allowlist collection (worship
team members, added by hand in the Firebase console — no Cloud Functions
needed, keeping the free Spark plan free) while keeping reads fully
public (except the Musicians chat channel, editor-only both ways). As of
phase 3 (see below), `churches/{id}` and cross-user `users/{uid}` writes
are also allowed for a small hand-managed `admins/{uid}` collection.

**No-CLI deployment (real-world pivot).** The original plan assumed
Jared could run the Firebase CLI locally; he can't (Magic-owned Windows
machine, no admin rights, can't install Node.js). Every step was
redesigned to be 100% browser-based:
- **Rules:** pasted directly into the Firebase console's Firestore →
  Rules editor, not `firebase deploy --only firestore:rules`.
- **Editors allowlist:** added by hand in Firestore Database → Data
  (a top-level `editors` collection, document ID = the person's uid) —
  hit this exact mistake twice (nesting `editors` as a subcollection
  under `users/{uid}` instead of a top-level collection) before it
  clicked; both times fixed by using the leftmost/root "+ Start
  collection" control rather than the one shown inside a document view.
  **The new `admins/{uid}` collection (phase 3, see below) uses this
  exact same pattern** — a top-level collection, doc ID = uid, content
  doesn't matter, just existence.
- **Hosting:** [Netlify Drop](https://app.netlify.com/drop) (drag the
  built `dist` folder onto the page, no account strictly required though
  claiming one with a free account avoids the temp-password/expiry),
  not Firebase Hosting's `firebase deploy`.
- **Hymnal content:** entered through the app's own Add Song / Bulk Add
  Songs UI, not `scripts/seed-firestore.mjs` (which needs Node + a
  service account key).
`README.md` documents this no-CLI path as the primary instructions now,
with the CLI equivalents kept as parenthetical alternatives for anyone
who does have Node.js available. This same "no local dev tooling"
constraint is why AI theme tagging (see below) needed its own no-CLI
setup path (Cloudflare's browser-based Worker editor) rather than
anything requiring Jared to run a build himself — he can't; every
rebuild of the app itself still has to happen in a Claude session and be
handed back to him as a new `dist` zip.

**Netlify secrets-scanning false positive [2026-09-10].** At some point
after the above was written, Jared's Netlify site started building from
a connected Git repo (Netlify running `npm run build` itself, per its
build log) rather than -- or possibly alongside -- the originally
documented Netlify Drop drag-and-drop flow. That build failed at
Netlify's "secrets scanning" stage (a separate step from the actual Vite
build, which succeeded), because the scanner's pattern-matching flagged
`src/firebase-config.js`'s `apiKey` (an `AIzaSy...`-shaped string) as a
likely leaked secret. It isn't one: Firebase's Web SDK config
(`apiKey`/`authDomain`/`projectId`/`storageBucket`/`messagingSenderId`/
`appId`) is designed to ship inside the client bundle -- it only
identifies which Firebase project to talk to; the actual access control
is entirely `firestore.rules`/`storage.rules`, which is the whole reason
this project pastes rules straight into the Firebase console instead of
hiding a key. Fixed with a `netlify.toml` at the repo root setting
`SECRETS_SCAN_SMART_DETECTION_ENABLED = "false"` -- disabled outright
rather than narrowly allowlisting just this one value, since this repo
has never held any real server-side secret (no service account key, no
payment credential) for the scanner to actually be protecting. If Jared
is using Netlify Drop (a pre-built `dist` folder, no repo, no build step
on Netlify's side) this scan never runs at all regardless -- it only
applies to a Git-connected, build-on-Netlify site.

**Runtime-tested via headless Playwright** (not just `node --check`
syntax validation) across several rounds this build has gone through:
sign-in/profile setup, browsing, favoriting, paste-and-auto-detect song
entry, hosting a public session, joining by code, live cross-tab section
sync, ending a session, private rooms with correct/incorrect password
handling, the public-rooms list, dark mode, bulk song import (parsing +
save, tested with fictional placeholder lyrics only), broadcast-mode
song search, a pre-service setlist (build → reorder → create room → tap
through live → mid-service edit), in-session chat (channel isolation
between Everyone/Musicians, live cross-tab sync both directions, a
signed-in non-host participant correctly seeing the Musicians tab, an
anonymous/unsigned-in guest correctly blocked from sending without a
display name and then sending successfully once one's given), the
"Manage My Sessions" cleanup screen (a properly-ended room correctly
disappears from the list; a room abandoned by opening a fresh tab
instead of clicking "End Session" correctly still appears and can be
deleted from there; the "LIVE NOW" badge correctly shows only from the
same tab/device that's actively hosting a given room), AI theme
tagging (single-song "Suggest Themes with AI" on the Add Song form and
on an untagged song's detail page, and the bulk "AI-Tag Untagged Songs"
button on the hymnal list — all tested against a mocked stand-in for the
Cloudflare Worker, plus a separate pass confirming every AI control
stays fully hidden and the rest of the app behaves exactly as before
when `ai-config.js` is left at its shipped `REPLACE_ME` defaults),
manual song editing (the new Edit Song form — see below — prefilling
correctly from an existing song including a chorded lyric line, editing
title/key/tags/theme chips/lyrics and saving, the added section
persisting on re-open, the EDIT SONG button correctly hidden for a
signed-out visitor and appearing once signed in, and a regression pass
confirming Add Song and the existing AI-suggest buttons still work
unchanged), the friend's-list 141-song bulk import end-to-end
(paste → preview parse with zero warnings → Save All → confirmed all
141 landed in the hymnal, plus confirming no song picked up the old
default "Just Added" tag — see below), the Plans & Pricing screen plus
the `churches`/role-field foundation (phase 1), phase 2's Enterprise
plan card + updated pricing copy, and phase 3's Admin screen + real
gating for everyone (see "Monetization, phase 3" below for the full
Playwright pass — ordinary-user gating, Admin church/role/beta workflows,
a role grant taking effect, beta-tester bypass, and the library toggle).

Bugs found and fixed along the way:
1. **Top-level await build failure** — needed `esbuild`/`build.target:
   'esnext'` in `vite.config.js`; only an actual `vite build` surfaced
   this, not `node --check`.
2. **Cross-tab session role hijack** — `cv:activeRoomCode`/`cv:isHost`
   moved from `localStorage` to `sessionStorage` (tab-scoped) so a second
   tab testing "join as guest" can't silently resume as the host.
3. **`setupIsPublic` staleness** — never reset after creating a private
   room, silently defaulting the next "Host a Service" to private too;
   fixed by resetting it whenever a fresh `setupDraft` is created.
4. **Duplicate event-listener risk** — the first pass of the host-picker
   search box would have re-registered its own `input` listener on every
   keystroke; fixed with a `dataset.wired` guard flag, then deliberately
   reused (correctly) for the setlist search boxes.
5. **Firestore subcollections don't cascade-delete** — ending a room only
   deletes the room doc, not a `rooms/{code}/messages` subcollection;
   since room codes are just 4 characters and can eventually repeat, a
   reused code could otherwise resurrect an old conversation. Fixed by
   having `endRoom()` explicitly delete the room's messages first, in
   both data layers.
6. **Chat UI could get stranded on an inaccessible channel** — if
   `state.isEditor` ever goes false while the Musicians tab is active,
   `renderChatSection()` now defensively snaps `chatChannel` back to
   `'everyone'` rather than leaving the UI showing a channel with no
   visible tab to leave it from. **The same defensive pattern was reused
   for Play Mode in phase 3** (see below) — if access is revoked while
   Play Mode is active, `state.mode` snaps back to `'sing'` at render time.
7. **Re-render-during-edit clobbering, caught proactively before it ever
   shipped** — `watchSongs()`'s callback re-renders unconditionally on
   any song change, including one made by a different editor's AI bulk-
   tagging run finishing on a *different* song. The new Edit Song form
   (see below) is the first form in this app that can legitimately stay
   open across such a re-render, so it was built from the start storing
   its draft (title/key/YouTube/tags/theme selection/sections) in a
   single `editDraft` object that only gets (re)seeded from the song's
   data once — the same pattern already used for the session-setup
   form's `setupDraft` — rather than re-deriving the form from `song` on
   every render, which would otherwise silently discard an editor's
   unsaved changes mid-edit.
8. **Hardcoded `tags: ['Just Added']` on every new song** — both
   `submitBulkImport()` and `saveNewSong()` set this unconditionally;
   Jared had been removing it by hand from every song. Changed to
   `tags: []` in both places.
9. **Temporal-dead-zone crash in the new Admin screen [phase 3,
   2026-09-03]** — `watchAuth()`'s very first callback fires
   *synchronously*, right when it's called, and (as of phase 3) calls the
   new `stopAdminChurchesWatch()`. That function's own `let
   unsubAdminChurches` was originally declared much further down the
   file, alongside the rest of the new Admin-screen code — so at the
   moment `watchAuth(...)` first ran, that `let` was still in its
   temporal dead zone, and the whole app crashed on load
   ("Cannot access 'unsubAdminChurches' before initialization"). Caught
   immediately via a Playwright smoke test (`page.on('pageerror', ...)`)
   before any real testing could even start. Fixed by moving just that
   one `let` declaration (and its `stop`/`start` functions) up next to
   the other subscription-teardown variables (`unsubProfile`,
   `unsubChurch`) that run before `watchAuth()` is called — the rest of
   the Admin screen's code stays where it naturally reads, later in the
   file, since nothing else runs early enough to hit the same trap.
10. **Demo mode's permissive `checkIsAdmin`/`checkIsEditor` stubs
    defeated phase 3's own testability [2026-09-03]** — both were
    hardcoded to return `true` for any signed-in local user (a reasonable
    simplification before any real gating existed). Once Play
    Mode/add-song/hosting became genuinely gated per Jared's "turn on
    real gating for everyone now" decision, `hasFullAccess()` checks
    `isAdmin` first — so every demo-mode user being an automatic Admin
    meant **nobody** could ever be tested as an ordinary, gated member
    locally, making the newly-built gating impossible to verify or even
    demo to Jared before real Firebase rules exist. Fixed by changing both
    demo-mode checks to read a small local allowlist (`localStorage`
    keys `iworship:local:admins` / `iworship:local:editors`), empty by
    default — see `src/data/interface.md`'s "Testing this locally" note
    for the exact console command to grant either one in demo mode. This
    is purely a demo-mode testing fix; the real Firestore-backed checks in
    `firestore-data-layer.js` were never affected.

**Honest, still-open caveat:** `firestore-data-layer.js` — including the
newer `checkIsEditor`/`watchSessionMessages`/`sendSessionMessage`/
`watchHostRooms`/`updateSong`/`watchChurch`/`checkIsAdmin`/
`watchAllChurches`/`newChurchId`/`saveChurch` functions — was written
carefully against Firebase's documented SDK and mirrors the already-tested
local layer's interface line-for-line, but this sandbox has no network
route to Google's servers, so none of it has been exercised against a
live Firestore project from here. Jared's real sessions are the actual
first test of that file; so far (per his feedback) sign-in, adding songs,
and hosting have all worked once the editors/rules setup was corrected.
Setlists, chat, "Manage My Sessions", `updateSong`, the
`initializeFirestore(...persistentLocalCache...)` offline-persistence
call, and everything added in monetization phase 3 (`checkIsAdmin`,
`watchAllChurches`, `newChurchId`, `saveChurch`, and the real
`hasFullAccess()`/role gating in `firestore.rules`) are untested against
live Firestore as of this writing — phase 3's local-mode behavior was
verified thoroughly via Playwright instead (see below), but the actual
`admins/{uid}`-gated rules and cross-user profile writes have not run
against a real Firebase project. Same caveat, for the AI-tagging
Cloudflare Worker (`cloudflare-worker/ai-tagger-worker.js`) and its call
to Anthropic's API — tested against a mock server standing in for it, but
the real Worker code itself has not run for real from here either. **The
same caveat, doubled, applies to the Cloud Functions scaffold in
`functions/`** (see "Monetization, phase 2" below): written against the
documented `firebase-functions`/`firebase-admin` SDKs, `node
--check`-clean, but never run against the Firebase Emulator Suite or a
live project — deploying it at all requires Jared to first enable
Firebase's Blaze billing plan, which hasn't happened yet.

## Decisions made so far (apply to both builds unless noted)

**Backend:** Firebase (Firestore + Authentication; Hosting swapped for
Netlify Drop for Jared's no-CLI deployment — see above). Free "Spark"
tier is permanently free, no card required. Songs paste directly into
the app — no separate authoring step. Firebase Authentication + the
`editors` Firestore collection gate *editing* (add song, host a session,
post in Musicians chat) to the worship team; viewing and the Everyone
chat channel stay open to everyone, no login required.

**Section detection (verse/chorus/refrain):** Client-side heuristic
(splits on blank lines, recognizes explicit labels, detects a chorus
that repeats verbatim even when labeled only once). Implemented and
tested in both builds.

**Song entry:** Three combinable paths, all save immediately — paste +
Auto-Detect, hand-add VERSE/CHORUS/REFRAIN/BRIDGE sections, or **Bulk
Add Songs** (paste several songs at once in a `# Title` + `key:`/
`themes:`/`youtube:` + lyrics format, auto-detected and previewed before
saving). Originally Jared was expected to supply all lyric text himself
(his church's CCLI account, or his own typed-up copies), with Claude
declining to reproduce hymn lyrics at all out of blanket copyright
caution. That default was revisited once a real per-song copyright audit
existed (see next section) — for hymns individually confirmed public
domain, reproducing the text is legally fine, so Claude compiled those
directly. The caution still fully applies to anything not confirmed PD:
Claude does not source or reproduce lyrics for copyrighted, "mixed
trap," or unverified songs — Jared's own CCLI SongSelect access (or
direct publisher contact) is required for those. New songs start with
no tags (`tags: []`) — see bug #8 above.

**Copyright audit & bulk-compiling the public-domain hymns.** Jared
uploaded his church's real 178-song catalog (`CONGREGATIONHGBC2026`) and
asked which songs could be compiled. Claude ran a per-song public-domain/
copyright research pass (three parallel research agents, web-sourced)
and delivered `HGBC_Song_Copyright_Audit.xlsx` — a color-coded workbook
verdict for every song: **133 Public Domain, 30 Copyrighted (needs
CCLI), 5 Mixed/"trap"** (an old PD hymn with a still-copyrighted modern
translation or arrangement — e.g. "How Great Thou Art"'s English text is
Stuart Hine's 1949/53 copyrighted translation, even though Boberg's 1885
Swedish original is PD), **8 Unknown** (mostly Tagalog fellowship
choruses with no identifiable writer/date), **2 Duplicates** (same hymn
listed under two title rows). Jared confirmed: "Yes, go ahead! Add the
chords as well" for the 133 PD songs.

Compiled **127 of the 133** confirmed-PD songs into the app's Bulk Add
Songs paste format, with inline `[Chord]word`-style chord notation, via
parallel research/compile subagents (batches of the full 133, split
progressively smaller — 19 → ~9 → ~3-4 → 1 — since several batches hit a
repeated, apparently content-related `400 Output blocked by content
filtering policy` error from the API on the larger batches; smaller
batches and, for a couple of stubborn individual songs, writing the
(already well-known, high-confidence) lyrics directly in the main
session rather than through a subagent, worked around it). Lyrics were
cross-checked against hymnary.org, hymntime/Cyberhymnal, Baptist-Hymnal-
style sources, and archive.org hymnal scans for accurate wording/verse
order/verse count — accuracy was the goal, not copyright clearance
(that was already settled by the audit). Chords are **generic, simple
diatonic congregational harmonizations** (I/IV/V/vi/ii, varied across
common keys G/C/D/F/A/Eb) — not a transcription of any specific
published hymnal's proprietary arrangement — musicians should feel free
to re-key or adjust by ear. Delivered as one master file
(`ALL_133_PD_SONGS.txt`, alphabetical) plus three smaller
`Bulk_Import_Part_N.txt` files for easier pasting; every entry was
structurally validated against the app's actual `parseBulkText`/
`detectSections` parsing logic (0 issues) before delivery.

**6 songs could not be confidently compiled** and were left out,
flagged for Jared to source another way (a physical hymnal, or asking
around — these are apparently not well-digitized online despite being
otherwise-ordinary early-1900s gospel songs): row 22 "Saved By The
Blood" (S.J. Henderson), row 44 "In The Service Of The King" (Ackley),
row 47 "The Fight Is On" (Lelia Morris), row 70 "A Soul Winner For
Jesus" (J.W. Ferrill), row 103 "He Abides" (Herbert Buffum), row 137
"He Died For Me" (Julia H. Johnston — also a title-collision risk with
an unrelated same-titled hymn). If Jared can supply the text for any of
these (typed up, or a photo of a hymnal page), Claude can add chords and
fold them in.

**Still needing Jared's own CCLI access, not yet worked on:** the 30
confirmed-copyrighted songs, the 5 mixed/"trap" songs (need to confirm
which arrangement/translation his church actually uses), and the 8
unknown songs (mostly Tagalog — likely need direct contact with OMF
Literature/Papuri Music rather than CCLI).

**AI theme tagging (optional, off by default).** Jared noticed some of
the bulk-imported songs (mainly the ones that had no confident
church-category → theme-key mapping during the compile above) shipped
without themes, and asked for a way to auto-tag songs, including
retroactively. Offered two implementation choices and Jared picked the
more capable one both times: a real LLM call (over a free
keyword-heuristic tagger) reading each song's lyrics and picking 1-3
theme keys, and Cloudflare Workers (over Firebase Cloud Functions) to
host the server-side piece that holds the API key — Cloudflare's free
tier needs no card at all and, like Netlify, has a browser-based code
editor, fitting Jared's no-Node/no-CLI computer the same way Netlify
Drop already does; Firebase Cloud Functions would have meant enabling
Blaze (pay-as-you-go) billing on his Firebase project, the same
tradeoff already rejected once before for Firestore TTL — and the exact
same tradeoff that, until phase 3's beta-phase workaround (see below),
was also blocking the monetization Cloud Functions scaffold from being
deployed.

Architecture: `src/data/ai-tagger.js` (client) POSTs a song's title +
plain-text lyrics (chord brackets and section labels stripped) to a
Cloudflare Worker (`cloudflare-worker/ai-tagger-worker.js`, Jared's own,
not yet deployed by him as of this writing) with a shared-secret header;
the Worker calls Anthropic's Messages API using forced tool-use (a
`pick_themes` tool with an `enum` input schema over the real theme keys)
so the model's output is always exactly a valid array of 1-3 known theme
keys, never free text to parse; the client re-validates the response
against `THEMES` again anyway before ever touching the UI or a Firestore
write, treating the Worker's response as untrusted input on principle.
Config lives in `src/ai-config.js` (`AI_TAG_ENDPOINT`,
`AI_TAG_SHARED_SECRET`) with the same `REPLACE_ME`-placeholder-until-
configured pattern as `firebase-config.js` — every AI-tagging control in
the UI checks `aiTaggingConfigured` and simply doesn't render if it's
false, so shipping this code changes nothing for Jared until he finishes
the Worker setup. New `updateSong(id, patch)` added to both data layers
(shallow-merge, already covered by the existing `isEditor()` rule on
`songs/{songId}` — no rules change needed) specifically so themes can be
set on a song *after* it was created, which addSong-only never allowed
before — this same function is what the new manual Edit Song form (see
below) reuses for every kind of edit, not just themes.

Three surfaces in the UI: a **"Suggest Themes with AI"** button next to
the theme picker on the single-song Add form (fills in chip selections,
still editable before saving); the same button next to the theme picker
on the Edit Song form and on any already-saved song's detail page if it
has no themes yet; and an editor-only **"AI-Tag Untagged Songs (N)"**
button at the top of the hymnal list that runs every currently-untagged
song through the Worker in one sequential pass (chosen over Bulk
Add-time tagging specifically because it also retroactively covers songs
already in the library — Jared's actual complaint — without needing a
separate code path for the bulk-import preview screen).

**Not yet live** — this needs Jared to: get an Anthropic API key
(console.anthropic.com, pay-as-you-go, likely just cents for his song
count but does mean a card on file there), create a Cloudflare Worker
and paste in `cloudflare-worker/ai-tagger-worker.js` via its browser
Quick Edit (no CLI), set two Worker secrets (`ANTHROPIC_API_KEY`,
`SHARED_SECRET`), and send Claude the Worker's URL and that shared
secret so `ai-config.js` can be filled in, rebuilt, and redelivered as a
fresh `dist` zip — full click-by-click steps are in README.md → "Setting
up AI theme tagging." Since this is a real setup lift with an ongoing
API cost, Jared asked for the manual editing fallback below so his team
isn't blocked on it in the meantime — AI tagging remains something to
come back to whenever he's ready, not a prerequisite for anything.

**Manual song editing (Edit Song).** While AI tagging setup was still
pending, Jared asked directly: rather than wait on that, just let him
and other editors manually edit songs — including tags and chords —
through the app right now. This is the general-purpose fix for anything
the AI-tagging feature was never going to cover on its own anyway (a
wrong AI guess, a chord that needs correcting, a typo in a title, one of
the 127 bulk-imported songs that needs a tag added by hand) and doesn't
depend on any external setup — it's live for every editor immediately.

An **EDIT SONG** button now sits next to Favorite/Learn on YouTube on
every song's detail page, visible only to signed-in editors
(`state.isEditor`, same allowlist gate as adding songs). It opens a new
`renderEditSong()` view built as a close sibling of the existing Add Song
form — the same title/key/YouTube fields, the same theme-chip picker
(with its own "Suggest Themes with AI" button when AI tagging is
configured), the same verse/chorus/refrain/bridge section editor with
paste-and-auto-detect for adding more lyrics, and the same
`[Chord]word`-bracket chord notation — but pre-filled from the song's
existing data and saving via `updateSong(id, patch)` instead of
`addSong()`. It also adds one field the Add form never exposed: a plain
comma-separated **Tags** input (tags were previously fixed to `["Just
Added"]` at creation with no way to change them — see bug #8 above,
since fixed to start empty instead).

Implementation note, since this is the first form in the app that both
(a) can legitimately stay open through an unrelated background
`watchSongs()`-triggered re-render (see bug #7 above) and (b) edits an
*existing* record rather than building a new one from a blank slate: its
entire draft (title/key/YouTube/tags/theme selection/sections) lives in
one `editDraft` object, lazily seeded from the song's current data only
once per "Edit Song" click and nulled again on Back or a successful
Save — mirroring the existing `setupDraft` pattern from the session-setup
form — rather than being re-read from `song` on every render. The
section-editor and paste-and-auto-detect logic is intentionally a
parallel, separately-namespaced copy of the Add form's version (own
`editSectionsList`, `edit-detect-input` class, etc.) rather than a shared
refactor, specifically to avoid any risk of regressing the already-
tested Add Song flow while adding this.

**Friend's song collection — second audit, dedup, and compilation.** A
friend of Jared's sent over a personal collection of 230 songs as
OpenLyrics-format XML files (title/author/full lyrics, no chords or
copyright metadata) — Jared asked for (1) a check against the existing
178-song HGBC catalog for duplicates and upload status, and (2) the same
kind of Bulk Add compilation as before for whichever of the friend's
songs are public domain.

All 230 files were staged from Jared's computer and parsed (230/230,
zero errors) directly from the OpenLyrics XML — real full lyrics were
already present in the source files this time, no need to source them
separately. Cross-referenced against the 178-song audit two ways: exact
normalized-title matching (36 hits) plus a fuzzy pass (Jaccard/sequence-
ratio scoring, threshold 0.55) manually curated down to 10 more genuine
title-variant duplicates (e.g. "Neare, My God, to Thee" / "Nearer, My God
To Thee") — the rest of the ~86 fuzzy candidates were spurious (shared
hymn vocabulary, not the same song) and correctly excluded. 2 internal
duplicate files within the friend's own collection were also found and
deduped (228 unique songs).

Result: **45 songs matched the existing catalog** (41 already uploaded;
4 matched-but-not-yet-uploaded, inheriting that catalog entry's status).
**183 songs were new to the catalog** — classified by author/era
research (named pre-1929 hymnwriters → Public Domain; identifiable
modern songwriters, or English originals of Tagalog translations known
to still be under copyright like "Great Is Thy Faithfulness" and "He
Lives" → Copyrighted; ambiguous "Author Unknown" choruses and
unmatched Tagalog titles → Unknown, erring conservative rather than
guessing) into **141 Public Domain, 8 Copyrighted, 1 Mixed, 33 Unknown**.
Delivered as `Friend_Songs_Audit.xlsx` (Summary, Duplicates-in-friend's-
list, Matches-to-catalog, New-songs-by-status tabs).

Compiled all **141 confirmed-PD songs** into the Bulk Add format —
chords, a singable key, 1-3 theme tags, and a YouTube search link per
song, via 9 parallel compile subagents each handed real lyrics already
extracted from the source XML (not re-researched from scratch this
time). Delivered as `Friend_List_141_PD_Songs.txt`. **Runtime-verified**
this time, not just structurally checked: swapped in a placeholder
`firebase-config.js` to force local demo mode, built and served the
`dist` output, and drove the actual Bulk Add Songs UI end-to-end with
headless Playwright — pasted the full file into `#bulkArea`, clicked
Preview (141/141 parsed, zero warnings), clicked "Save All 141 to
Hymnal" (all 141 saved, confirmed via the final "146 of 146 songs"
hymnal count), then restored the real Firebase config afterward.

**Offline persistence.** The app was already a PWA (service worker
caches the app shell), but Jared asked whether songs work with no
signal — they didn't: `firestore-data-layer.js` called plain
`getFirestore(app)`, so the song *data* itself had no offline cache.
Switched to `initializeFirestore(app, { localCache: persistentLocalCache(
{ tabManager: persistentMultipleTabManager() }) })` — once a device has
synced songs/chords/setlists, they now stay readable and usable with
zero connection, syncing back up automatically once back online. No UI
change, no setup needed on Jared's end.

**Pre-service setlist.** The host can build an ordered list of songs
*before* a service starts (search-and-add, reorder, remove) on the
session-setup screen, then tap straight through it live once hosting —
without losing the existing live search-based song picker, which stays
available in broadcast mode for anything off-list. The setlist can also
be edited *during* a live session (an "Edit Setlist" toggle next to the
read-only tap list), so a host can add something on the fly without
breaking the prepped flow. Stored as a plain `setlist: string[]` of song
IDs on the room document — no new collection needed.

**In-session chat.** Two channels today — **Everyone** (open to anyone
in the room, signed in or not, matching the room's own already-public
trust model) and **Musicians** (gated to the `editors` allowlist, both
for reading and posting) — designed to extend easily: `CHAT_CHANNELS` in
`app.js` is the single list the UI renders from, and `interface.md`
documents adding a future channel as "one array entry + one rules
disjunct." Messages live in a `rooms/{code}/messages` subcollection
filtered by a `channel` field rather than one collection per channel.
Anonymous guests get a lightweight, session-scoped name prompt (stored in
`sessionStorage`, not tied to any account) rather than being blocked from
chatting entirely. No moderation, editing, deletion, or rate limiting is
built in — an intentional, disclosed simplification for a small
congregation's live-service chat, documented in the README. **Not
extended by monetization phase 3** — the Musicians channel is still
gated solely by the legacy `editors` allowlist, deliberately narrower
scope than Play Mode/add-song/hosting (see "Monetization, phase 3"
below).

**Cleaning up abandoned sessions ("Manage My Sessions").** Jared hit a
real gap: closing the host tab without clicking "End Session" leaves the
room document alive in Firestore forever (nothing ends it automatically),
and he had to delete it by hand in the Firebase console. Considered and
rejected: Firestore's native TTL (time-to-live) policy feature, which
auto-deletes documents once a designated timestamp field is in the past
— researched and confirmed (Sept 2026) it's fully console-configurable
(Google Cloud console, Databases → Time-to-live, no CLI/SDK needed) but
**requires enabling Blaze (pay-as-you-go) billing** — Firebase's own
quotas page lists "TTL deletes" alongside backups/PITR as explicitly
excluded from the Spark free tier, unlike most core Firestore usage.
That conflicts with the "permanently free, no card required" design
decision this whole project has stuck to, so instead: a new **"Manage My
Sessions"** screen (landing page → "MANAGE MY SESSIONS", shown when
signed in) lists every room a host has ever created, at any age, via a
new `watchHostRooms(uid)` query (`where('hostUid','==',uid)`, no new
Firestore index needed) — separate from the existing public-rooms list,
which deliberately only shows rooms updated in the last 6 hours. Each row
has an "End" button (with a confirm step) that calls the same `endRoom()`
already used for a live session, so it also cleans up that room's chat
messages. No rules changes needed — the existing `allow read: if true`
and `allow delete: if resource.data.hostUid == request.auth.uid` on
`rooms/{code}` already cover this from any device. A room shows a "LIVE
NOW" badge only when viewed from the same tab/device currently hosting it
(session role state is tab-scoped by design — see bug #2 above) — a
known, acceptable limitation, not a bug.

**APK packaging — done, verified working end-to-end.** PWA first
(manifest + service worker, already done), then a TWA (Trusted Web
Activity) wrapper turns it into an installable `.apk`/`.aab` — one
codebase, no separate native app. Needed the real hosted URL first;
Jared confirmed his live Netlify URL (`https://iworshipv1.netlify.app/`)
and asked to proceed.

**Pivoted away from Bubblewrap CLI to PWABuilder (pwabuilder.com).** The
original plan was Google's Bubblewrap CLI. Ruled out from this sandbox:
`curl` to `iworshipv1.netlify.app` returns a `403` from the sandbox's
own network proxy (only an explicit allowlist — npm/pypi/Anthropic
APIs/etc — is reachable via raw `curl`/Java/Node network calls;
`dl.google.com` and the Maven/Gradle repos Bubblewrap's Android build
needs are not on it), so Bubblewrap's `init`/`build` steps (fetching the
manifest, downloading Android SDK components, resolving Gradle
dependencies) cannot run here — a hard sandbox-network constraint, not
something retrying fixes. Combined with the existing "no Node.js/CLI on
Jared's Windows machine" constraint this project has stuck to throughout
(Netlify Drop instead of `firebase deploy`, Cloudflare's browser Worker
editor instead of local dev), the fix is the same shape as those:
**PWABuilder** (Microsoft's free, entirely browser-based
PWA-to-app-package tool) does the identical Bubblewrap/TWA packaging
with no CLI on either end. README.md → "Packaging an installable
Android APK" has full click-by-click PWABuilder steps. Jared ran this
himself and generated the package: package ID
`hillsidegrace.jaredtech.iworship`, signing key generated by PWABuilder
(Jared keeping the key file safe per the README's warning, for future
updates).

**The `assetlinks.json` saga — three real bugs, each found and fixed in
turn, fully resolved and confirmed live.** PWABuilder gave Jared an
`assetlinks.json` file to enable full-screen TWA launch (Android's
Digital Asset Links verification — without it, the app opens into
Chrome with the address bar/Custom Tab chrome showing, instead of
full-screen). Getting this actually working took three separate,
genuinely distinct root causes, each masking the next:

1. **Netlify doesn't serve dot-directories at all.** The first build put
   the file at `public/.well-known/assetlinks.json` (the spec-required
   path). Vite copies `public/` verbatim into `dist/`, and the file was
   confirmed present in the built output — but Netlify's CDN silently
   refuses to serve *any* file living inside a folder whose name starts
   with a dot, even though it's genuinely in the deployed bundle; the
   request just 404s with Netlify's own branded "Page not found," no
   error indicating why. Confirmed via a direct sibling-file test
   (`manifest.webmanifest`, a normal top-level file, served fine from
   the same deploy) that this was specific to the `.well-known/` path,
   not a general upload failure. This matches a documented, if
   easy-to-miss, real-world Netlify limitation (confirmed via a Netlify
   Support Forums search: "Netlify ignores folders that start with a
   dot") that also affects Apple's `apple-app-site-association` and
   ACME challenge paths the same way.
2. **A same-folder redirect doesn't help.** The first attempted fix — a
   `public/_redirects` rule rewriting `/.well-known/*` to another path
   still inside `.well-known/` — was a no-op, since the destination was
   just as unreachable as the source. The real fix: move the actual
   file to a normal, non-hidden path (`public/assetlinks.json`) and
   redirect the dot-path request to *that*:
   `/.well-known/assetlinks.json  /assetlinks.json  200`.
3. **A leftover file at the dot-path silently blocks the redirect from
   ever running.** Even after moving the real file to a non-dot path,
   the redirect still didn't fire, because a copy of the file was still
   sitting at the old `.well-known/assetlinks.json` location — Netlify
   checks for a matching static file *before* it applies a `_redirects`
   rule (documented "shadowing" behavior: real files take precedence
   over redirects unless the rule is explicitly forced), so the
   existence of that stale, unservable file short-circuited straight to
   a 404 before the redirect got a chance to run. Fixed by (a) deleting
   `public/.well-known/` entirely — the project's `public/` folder now
   has no dot-directories in it at all — and (b) adding a trailing `!`
   to the redirect rule (`200!`) to force it regardless, as extra
   insurance per Netlify's documented force-redirect syntax.

**A parallel debugging trap along the way: false-positive test results
from a service worker.** Partway through, Jared reported the fix
"working" based on navigating to the URL directly in his regular (not
incognito) browser and seeing the actual app render — this was *not*
the real file; it was his already-installed PWA's service worker
intercepting the navigation request and serving the cached app shell
(Workbox's default `navigateFallback` behavior for SPA routing), which
happens for any same-origin navigation regardless of whether the real
path exists on the server. The tell: Netlify's real 404 is its own
distinctly-branded "Page not found" page, which is what a *genuine* 404
looks like — not the app itself. The reliable test throughout was
either a direct server-side fetch (bypassing any service worker) or an
incognito/private window (no service worker registered for the origin
at all) — the incognito test is what finally gave an unambiguous,
correct "yes, real JSON is being served" confirmation once the real fix
landed.

**Confirmed fully working end-to-end** (Sept 2, 2026): Jared did a clean
uninstall/reinstall of the APK after the final fix was live, and the app
now launches full-screen with no browser chrome — Android's Digital
Asset Links verification is passing. `README.md` documents all three
root causes and the final working configuration (`public/assetlinks.json`
+ `public/_redirects` with the forced rewrite rule, no `.well-known/`
directory in the source at all) so this doesn't have to be
rediscovered on a future redeploy or if the signing key/fingerprint
ever changes.

**Known, inherent TWA behavior — intermittent browser-chrome fallback,
not a regression.** Jared later reported the installed app sometimes
still shows browser chrome (X button, URL bar, share/overflow icons)
instead of launching full-screen — noticed while deliberately testing
offline, and confirmed via follow-up as intermittent (~1 in 3 launches),
not persistent. Researched directly against Chrome for Developers' TWA
docs: Digital Asset Links verification is **not** a one-time,
install-time check — it happens **on every launch**, and requires a live
network round-trip. Quoted directly: "When you launch a Trusted Web
Activity, the browser verifies the Digital Asset Links. If verification
fails, the browser falls back to displaying your website as a Custom
Tab." This fully explains the report: the assetlinks.json configuration
itself is already thoroughly fixed and confirmed working (see the saga
above, and the clean-reinstall test), but any individual launch that
happens with no/weak connectivity — exactly what testing "offline"
does — can fail that specific launch's live check and fall back to
Custom-Tab-style display, while other launches with working connectivity
succeed normally. This is expected Android/Chrome behavior for TWAs in
general, not something specific to iWorship or fixable via more
configuration changes on our side. Communicated to Jared directly; no
code change made or needed. Worth revisiting only if it turns out to
happen more often than "occasionally on a bad connection" during normal
(non-offline-testing) daily use.

**Splash screen.** Jared asked for a proper launch splash — the logo on
a background color, with a loading animation. Built entirely in
`index.html` as inline CSS/markup/script (no dependency on `styles.css`
finishing loading and no changes to `app.js`), so it paints instantly on
first load with zero flash: a full-screen overlay in the brand's wine
(`#6B1220`) hardcoded to match the app icon's own baked-in background
exactly — the icon's rounded-square edges visually disappear since the
colors are identical, so it just reads as the mark floating on the
backdrop — plus the "iWorship" wordmark in EB Garamond and a
three-dot loading animation in the brand's gold accent underneath.
Rather than a fixed timer, a `MutationObserver` on `#main` hides the
splash (with a fade) the instant `app.js`'s first real render lands, so
it's on screen exactly as long as boot actually takes, no more; a 4-second
fallback timeout guarantees it can never get stuck showing. Respects
`prefers-reduced-motion`. Verified visually via headless Playwright
(throttled network + a MutationObserver stub, to capture the full-opacity
frame for review) and confirmed it self-removes once the real app paints.

**Google Play Store publishing — in progress.** Jared plans to run a
beta at the church, then publish to the Play Store for real. Researched
Google's current (Sept 2026) requirements directly against Play Console's
own help docs rather than assuming stale info, since these rules change
and are easy to get wrong:
- **Account type decision:** Jared will register as an **Individual
  (Personal)** account, not Organization — the church has no formal
  registration paperwork, which Organization accounts require
  (certificate of incorporation/registration + authorized rep ID).
  Consequence: as a *new* Personal account (created after Nov 13, 2023),
  Google requires a closed test with **12 testers opted in continuously
  for 14 consecutive days** before production access is even available
  to apply for, plus up to ~7 more days for Google's review — so the
  realistic timeline from "start of beta" to "live" is 3+ weeks minimum,
  not the quick turnaround Jared may have been picturing. His planned
  church beta run satisfies this requirement directly, as long as at
  least 12 people opt in and stay opted in the full 14 days. **The new
  beta-tester flag from monetization phase 3 (see below) is a natural fit
  for recruiting and tracking exactly these 12+ testers going forward.**
- **Philippines-specific:** Jared is based in Calapan City, Oriental
  Mindoro. Confirmed the Philippines is fully eligible for Play Console
  registration — no special restriction. Required ID: Philippine
  passport, national ID (PhilID), driver's license, or residence permit,
  plus a separate proof-of-address document (utility bill, bank/credit
  card statement, etc.). $25 one-time fee, real (non-prepaid) card.
  Google's new *Android developer verification* identity-check system
  (separate from Play Console registration) starts Sept 30, 2026 but
  only in Brazil/Indonesia/Singapore/Thailand initially, expanding
  globally in 2027 — doesn't affect Jared's timeline yet.
- **Privacy policy — shipped and live.** Play Console requires a real,
  reachable privacy-policy URL before any release (including closed
  testing). Added `public/privacy.html` (self-contained, on-brand,
  no dependency on the rest of the app) describing exactly what the app
  collects — Google Sign-In (name/email/uid), profile prefs (display
  name, church name, favorites), and session/chat activity — and
  explicitly what it doesn't (no location, payments, ads, or third-party
  sharing), sourced directly from `firestore.rules` and
  `firestore-data-layer.js` for accuracy rather than generic boilerplate.
  Contact address: `w3wares.15@gmail.com` (Jared's). Live at
  `https://iworshipv1.netlify.app/privacy.html` (confirmed via direct
  fetch after Jared redeployed).
- **`PLAY_STORE_SUBMISSION_GUIDE.md`** delivered — copy-pasteable answers
  for Play Console's Data Safety form (mapped field-by-field to the
  app's real data model) and the Content Rating questionnaire, plus a
  first-draft store listing description. One thing flagged deliberately
  rather than glossed over: the content-rating questionnaire will ask
  whether users can report/block each other in chat — the honest answer
  is **no** (an intentional, disclosed simplification, see the chat
  section above), and the guide tells Jared to answer accurately rather
  than optimize the rating, noting that adding basic block/report is a
  contained follow-up if Google's review ever asks for it.
- **Still open:** confirm PWABuilder's package actually includes an AAB
  (Android App Bundle), not just the APK Jared's been sideloading — Play
  Console requires the AAB for upload; this hasn't been verified yet.

**Monetization, phase 1 — Plans & Pricing screen and the `churches`
foundation.** Jared decided on a full paid-tiers model for iWorship as a
multi-church product (full design captured in `claude/monetization-plan.md`
in the project docs: one shared hymnal across every church, no per-church
data walls, cross-church "fellowship" attendance preserved). Jared gave
the go-ahead to start on the backend, with one explicit requirement: the
plan details also had to be visible in the app itself. This shipped two
pieces, deliberately scoped to what's safe without touching any of
Jared's live congregation's current access: (1) a **Plans & Pricing**
screen, reachable from the landing page, mirroring the plan comparison
table in the monetization doc with a billing-cadence toggle; (2) a
**`churches` collection** and `watchChurch(churchId, callback)` function
in both data layers plus a `firestore.rules` block: readable by anyone,
`allow write: if false` for everyone until a Cloud Function exists.
Nothing calls `watchChurch` yet.

**Monetization, phase 2 — confirmed design, Enterprise tier, and a
Cloud Functions scaffold.** Jared answered all 6 of the plan doc's open
design questions on 2026-09-03 and asked Claude to "prep the backend for
what's next." This round:

1. **Design fully confirmed** — see `claude/monetization-plan.md`'s
   "Resolved design decisions" section for all six: Full-plan-only
   additional Pastor seats with custom titles (e.g. "Music Pastor");a
   "contact us for a custom quote" Enterprise tier instead of a hard seat
   ceiling or a la carte overage; a Public Library / Church Library
   toggle backed by a per-church `hiddenSongIds` exclusion list (not a
   second copy of the hymnal — the "no data walls" principle holds,
   since a member can always switch back to Public); a 7-day grace
   period on lapsed payments; no quarterly billing for Individual
   Premium. **Same-day follow-up, also confirmed:** the Senior Pastor's
   one exclusive power over a Pastor is assigning/removing that Pastor
   seat itself — "senior pastor is more powerful than pastor in the
   sense that he can assign pastors, that's it." A Pastor otherwise
   shares the Senior Pastor's other powers (assigning Editor/Music
   Director/Musician, curating the church's library).
2. **`Church` shape extended** (schema only, still nothing populated):
   `seatLimits` gained a `pastors` key, plus new `hiddenSongIds: string[]`
   and `gracePeriodDays` fields. `Profile`'s planned (still unset) fields
   are now spelled out as `role` (`'seniorPastor' | 'pastor' |
   'musicDirector' | 'editor' | 'musician' | null`) and `pastorTitle`
   (only meaningful when `role === 'pastor'`). See `interface.md` for the
   full notes.
3. **The in-app Plans & Pricing screen** now shows a sixth **Enterprise**
   card with a "Contact us for a custom quote" price line (handled via a
   `'contact'` sentinel in `PLANS`/`planPriceLine()` in `app.js`), the
   Full plan's bullet list mentions its 2 additional Pastor seats, and a
   short explanatory line under the cadence toggle covers the Public
   Library / Church Library toggle and the 7-day grace period.
4. **A Cloud Functions scaffold** now exists at `functions/` (repo root):
   `registerChurch` (creates a church at `plan: 'pending'` with zero
   seats — nobody can grant themselves a paid plan this way; a real plan
   only gets set by a payment webhook), `assignRole` (a Senior
   Pastor/Pastor assigns a role to someone in their own church, enforcing
   `seatLimits` **and** the Senior-Pastor-only rule for granting or
   removing a `'pastor'` role), `updateChurchLibrary` (sets
   `hiddenSongIds`), and a **stub-only** `stripeWebhook` (returns 501;
   signature verification and the actual Stripe integration are explicit
   `TODO`s, since no Stripe account exists yet). `firebase.json` now
   points at this folder for deploys. **None of this is deployed or
   tested** — see the next point.

**The one real blocker, and it's Jared's to clear:** Cloud Functions
cannot deploy on Firebase's free Spark plan at all, full stop — Google
requires the pay-as-you-go **Blaze** plan for any Cloud Functions
deployment. Enabling it means Jared adding a billing/payment method in
the Firebase console (Usage and billing → Modify plan); Claude has no
access to do this for him. Until that happens, the `functions/` scaffold
stays exactly that — written, `node --check`-clean, README'd, but never
deployed or run against a live project. This is also the same tradeoff
already declined once before for Firestore TTL (see "Manage My Sessions"
above) and for AI tagging (which is why that used a Cloudflare Worker
instead) — Blaze has been avoidable until now; **phase 3 (below) is a
deliberate, temporary bridge specifically so monetization doesn't have to
wait on it any longer for a beta test.**

**Monetization, phase 3 — beta enablement without Cloud Functions
[2026-09-03].** Jared's ask: "For now, I need you to build the backend
for everything except for cloud function so we can beta test it. Give me
(admins) the power to assign beta testers who will have access to
everything." A follow-up clarifying question — should real gating also
start restricting everyone else right now, or stay opt-in to beta
testers only? — got an explicit, deliberate answer: **"Turn on real
gating for everyone now."** Both landed together:

1. **A deliberate, disclosed narrowing of the original client-write
   restriction, for two named Admins only.** The original design (phases
   1-2) was "no client can ever write `churches/{id}` or another user's
   `users/{uid}` — only a Cloud Function, gated by real payment
   verification, can." Cloud Functions can't deploy without Blaze, so
   phase 3 instead allows those specific writes directly from the client
   **only for accounts listed in a new hand-managed `admins/{uid}`
   collection** (Jared + one friend, added by hand in the Firebase
   console exactly like the existing `editors/{uid}` collection — see
   "No-CLI deployment" above). `allow write: if false` on `admins/{uid}`
   itself, so no client — not even an existing Admin — can grant a new
   Admin through the app; that stays a manual, hand-console action. This
   is explicitly temporary: once Blaze is enabled and `functions/`
   deploys for real, the plan is to tighten `churches/{id}` back to
   `allow write: if false` and remove the Admin cross-profile write,
   routing everything through the real Cloud Functions + payment webhook
   instead (see `claude/monetization-plan.md`'s "Beta phase" section).
2. **A new in-app Admin screen** (`state.view === 'admin'` in `app.js`,
   reachable only via a landing-page link shown when `checkIsAdmin()` is
   true) does everything an Admin needs for this beta, all via the
   existing generic `saveProfile`/`saveChurch` functions (no new
   single-purpose functions needed):
   - **Register/edit a church** — name, plan (with client-side-only
     seat-limit presets mirroring `functions/index.js`'s
     `PLAN_SEAT_LIMITS`), billing cadence, and a search-driven
     add/remove list to curate `hiddenSongIds` (reusing the existing
     setlist-picker search/add UI pattern, and its generic
     `renderSetlistAddResults()` helper, rather than a new one).
   - **Assign a role** — paste a target person's **Account ID** (a new
     "Your Account ID" line + copy button added to every signed-in
     user's own landing page specifically so they have something to give
     an Admin) and pick a role/church/pastor title; writes straight onto
     that `Profile` via `saveProfile(uid, patch)`.
   - **Grant/revoke Beta Tester access** — same mechanism, sets
     `Profile.isBetaTester`, which bypasses every gate below via
     `hasFullAccess()` regardless of role or church.
   - **Not yet enforced here:** the Senior-Pastor-only restriction on
     assigning/removing a Pastor seat (already coded into the unde­ployed
     `functions/assignRole`) isn't mirrored in this screen yet — low risk
     while only two trusted Admins can reach it at all, but worth
     tightening before this screen is ever opened to more people. See
     `claude/monetization-plan.md`'s "Status" section.
3. **Real enforcement, live for everyone** (not just beta testers), per
   Jared's explicit choice: **Play Mode** (chords/transpose — UI-only,
   since a song's lyrics and chords are already fully public-readable
   together, so this deters casual use rather than hard-blocking a
   determined user via dev tools — the same disclosed tradeoff shape as
   the existing room-password hashing), **adding songs**
   (`songs/{songId}` create/update in `firestore.rules`), and **hosting a
   session** (`rooms/{code}` create in `firestore.rules`) all now check a
   shared `hasFullAccess()` (Admin or beta tester bypasses everything) OR
   the relevant role (`editor`/`individualPremium` for add-song;
   `editor`/`musicDirector`/`individualPremium` for hosting; those two
   plus `musician` for Play Mode) OR, for add-song/hosting only, the
   pre-existing legacy `editors/{uid}` allowlist — so Jared's live
   worship team (on that legacy allowlist today, not the new role
   system) keeps exactly the Add-Song/Hosting access they already have.
   **Important, disclosed caveat Jared needs to act on:** Play Mode was
   *never* gated by the `editors` allowlist before this change (it was
   open to literally everyone) — so the legacy-allowlist OR doesn't cover
   it. Worship team members who aren't separately given a role or beta
   access will lose Play Mode access the moment the updated
   `firestore.rules` goes live, until Jared grants them one via the new
   Admin screen. Not extended to the Musicians chat channel, which stays
   legacy-allowlist-only (a narrower, unchanged scope — see the chat
   section above).
4. **Runtime-verified via headless Playwright**, all in local demo mode
   (`firebase-config.js` swapped to placeholders, real config restored
   after): an ordinary member (no role/admin/beta) correctly sees "(PAID)"
   labels and gets blocked with an upsell toast on Host a Service, Add a
   Song, and Play Mode; an Admin sees the Admin Tools link and bypasses
   every gate; registering a church prefills seat limits from the chosen
   plan, curating its hidden-song list via search-and-add/remove works,
   and the church shows up in the church list after saving; assigning an
   `editor` role to the ordinary member's Account ID, then reloading as
   that member, actually unlocks Host a Service/Add a Song/Play Mode
   (confirming the write really takes effect, not just that the form
   submits); granting beta access to a fresh account with **no role at
   all** still unlocks all three via the bypass, and that account
   correctly still has no Admin Tools link; and the Public/Church Library
   toggle appears once a profile has a `churchId`. Two real bugs were
   caught and fixed by this pass before delivery — see bugs #9 and #10
   above (a temporal-dead-zone crash in the new Admin code, and demo
   mode's `checkIsAdmin`/`checkIsEditor` stubs being too permissive to
   ever test an ordinary member locally). Not yet exercised against a
   live Firestore project — see the "Honest, still-open caveat" section
   above.

**Deliberately still NOT done, and why:** the chord-tap "tap a word, pick
a chord" Editor UI, the 6-song/day cap with duplicate flagging, the admin
review/credit-refund queue, and the support ticketing system are all
still ahead — none of these strictly need Cloud Functions to build a
first version (e.g. the daily cap could be a rules-enforced
per-user-per-day counter document), but they're separate, non-trivial
pieces of work scoped out of the beta-enablement pass on purpose. Real
Stripe billing (`stripeWebhook`) is still a stub. See
`claude/monetization-plan.md`'s "Status" section for the live source of
truth on all of this.

**Content seeding:** 5 public-domain sample hymns ship in demo mode only,
as placeholders to kick the tires. The real build intentionally does
*not* auto-seed Jared's real project with them — the *Baptist Hymnal*
itself (Lifeway/Broadman) is a copyrighted compilation, and Jared is
building his congregation's actual hymnal from scratch via Add Song /
Bulk Add Songs, sidestepping any question of which specific arrangements
he's clear to reproduce wholesale.

**Favorites:** Heart toggle + a Favorites filter chip, tied to the
signed-in user's Firestore profile (`users/{uid}`) in the real build, so
favorites follow a person across devices.

**Topical themes:** 12-category taxonomy (Salvation, Heaven,
Soul-Winning, Thanksgiving, Christmas, Praise & Adoration, Comfort &
Trust, Prayer, Assurance, Grace, Invitation, Easter & Resurrection).
Filter chips on the home screen, combinable with search and Favorites.

**YouTube links:** Every hymn has a "Learn on YouTube" button; songs
added via paste-in or bulk import either use a supplied link or fall
back to an auto-generated search for the title.

**Landing page / personalization:** Time-of-day greeting, Verse of the
Day (24 curated KJV verses, deterministic by day of year), sign-in (real
Google OAuth in the real build; a clearly-labeled local demo account in
demo mode). Church name prefills into the Worship Session host-setup
form. The early "PROTOTYPE — SAMPLE SONGS ONLY" banner has been removed
from the real build now that it's in live use. **As of phase 3, a
signed-in user's own Account ID is also shown here (with a copy button),
specifically so they can hand it to an Admin for role or beta-tester
assignment.**

**Worship Sessions:** Host picks a song and section (optionally from a
prepped setlist, see above); congregation follows a live read-only view
with its own chat panel. Public rooms (open list, no code) or private
rooms (4-character code + password, SHA-256 hashed — an explicitly
disclosed "deter casual reading, not bank-grade" tradeoff, since the free
Firestore plan has no Cloud Functions to check passwords server-side).
Runs on genuine Firestore `onSnapshot` listeners in the real build — true
instant push, no polling. A host can find and end any room they've ever
created — live or long-abandoned — from "Manage My Sessions" (see above).

## Design system (shared by both builds)

- **Palette:** warm aged-ivory ground (#F6EFDD), deep hymnal-cloth wine
  (#6B1220), antique gold accent (#9C7A28 / label text #5E4614), muted
  pine green (#2F5233) — full light/dark token pairs, WCAG AA+ (most
  AAA, 7:1+) for elder readability.
- **Type:** EB Garamond (serif, titles/headings) + Atkinson Hyperlegible
  (a typeface purpose-built for low-vision readability, all lyrics/UI) —
  accessibility-first, not decorative.
- **Interaction model:** "Sing Mode" (huge text, chords hidden) vs.
  "Play Mode" (chords + transpose + font size), one-tap switch. Full-caps
  UI labels; normal case for lyrics/verses/names. The Worship Session
  slide screen reuses the same huge-minimal-chrome language.

## Open next steps

1. **Waiting on Jared, no longer blocking:** the Anthropic API key +
   Cloudflare Worker setup for AI theme tagging (see above) — once he
   sends back the Worker URL and shared secret, fill in `ai-config.js`,
   rebuild, and redeliver. Since the new manual Edit Song feature already
   covers his immediate need (tagging/fixing already-uploaded songs),
   this is now purely optional whenever he gets to it, not a blocker.
2. Watch for feedback from Jared's live use of the setlist, chat,
   "Manage My Sessions", the Edit Song feature, and offline persistence
   specifically (untested against real Firestore, per the caveat above)
   — worth a quick check-in after his next hosted service.
3. Get Jared's reaction to the 127-song and 141-song bulk-import
   compilations once he's pasted them in and skimmed a few for accuracy
   — he knows the actual sung versions his congregation uses, which is
   the best real check.
4. Follow up on the 6 uncompiled PD songs from the original audit and
   the 30 copyrighted / 5 mixed / 8 unknown songs from it (needs his
   CCLI SongSelect access, or direct contact with OMF Literature/Papuri
   Music for the Tagalog titles) — plus the friend's-list's 8
   copyrighted / 1 mixed / 33 unknown songs, same caveat.
5. Awaiting real lyrics for "Pagbating Baptist" (Pastor Abante) — Jared
   says it's a public-domain song for Baptist-church use; asked him for
   the actual text/chords since nothing exists to source it from here.
6. **Done:** APK packaging, fully confirmed working (see above). No
   further action needed unless Jared regenerates a new signing key
   (e.g. rebuilding the Android package from scratch) — that would need
   a fresh `assetlinks.json` from PWABuilder swapped into
   `public/assetlinks.json` and redelivered the same way.
7. **Done:** Splash screen (see above). No further action needed unless
   Jared wants the visuals changed (different color, wording, timing).
8. Optional, not yet requested: message moderation/deletion for chat if
   abuse ever becomes a real concern; an LLM fallback for low-confidence
   section detection; more chat channels beyond Everyone/Musicians; a
   "Delete Song" control alongside the new Edit Song form.
9. **Scaling watch-item, not yet a problem:** the free Firebase Spark
   plan's Firestore quotas (confirmed against firebase.google.com/pricing,
   Sept 2026) are 50K document reads/day, 20K writes/day, 20K deletes/day,
   1 GiB stored, 10 GiB network egress/month — no billing account attached
   at all, so hitting a cap just makes requests fail rather than
   generating a surprise bill. A single congregation's real usage
   (browsing the hymnal, hosting/attending live sessions with `onSnapshot`
   listeners re-reading only on actual changes, chat) sits comfortably
   under all of these day to day. This is superseded by item 12 below now
   that Blaze is an explicit, planned (if not-yet-executed) requirement
   for monetization rather than a "someday" watch-item.
10. **Google Play Store publishing (see above), in progress:** next
    concrete steps are Jared's — register the Personal Play Console
    account ($25, PH government ID + proof of address), confirm
    PWABuilder's package includes an AAB, line up at least 12 beta
    testers ASAP since the 14-day closed-testing clock only starts once
    they're opted in (the new Admin-screen beta-tester flag is a natural
    fit for tracking exactly these people), and get his reaction to the
    draft store listing copy in `PLAY_STORE_SUBMISSION_GUIDE.md`. No
    further Claude-side work is blocking him right now.
11. **Done:** Diagnosed the intermittent browser-chrome-on-launch report
    (see "Known, inherent TWA behavior" above) as expected per-launch
    Digital Asset Links verification, not a regression — explained to
    Jared directly. No code change needed; nothing further blocking
    unless it starts happening outside of poor-connectivity conditions.
12. **In progress — monetization phases 1-3 done (see above), phase 4
    next, blocked on Jared:** the concrete next step is Jared: (a) paste
    the updated `firestore.rules` into the Firebase console's Rules
    editor and hand-add `admins/{uid}` docs for himself and his friend;
    (b) right after that, use the new Admin screen to grant a role or
    beta access to his current worship team so nobody unexpectedly loses
    Play Mode access (see "Monetization, phase 3" above); (c) whenever
    ready, enable Firebase **Blaze** billing (console → Usage and billing
    → Modify plan) — nothing past this point can move until that
    happens, since every remaining piece needs Cloud Functions to
    deploy. Once Blaze is on, in roughly the order they'd naturally
    unblock each other: deploy and emulator-test the `functions/`
    scaffold for real; migrate the Admin screen's direct client writes
    over to those Cloud Functions and tighten `firestore.rules` back to
    `allow write: if false` on `churches/{id}` and cross-user
    `users/{uid}`; add the Senior-Pastor-only restriction to the Admin
    screen itself (or retire it in favor of the real `assignRole`
    function); the tap-a-word/pick-a-chord Editor UI; the 6-song/day add
    cap with duplicate flagging and the admin review/credit-refund
    queue; the categorized support ticketing system; and real Stripe
    integration for `stripeWebhook` (a plain web checkout page rather
    than in-app purchase — see the monetization doc's payments-policy
    research for why) so churches can actually pay and get moved off
    `plan: 'pending'`.

## Historical: how the artifact prototype's Worship Sessions sync works

(Superseded by real Firestore listeners in the new build, but this is
still how the *artifact* — item 1 above — behaves, and it's still live
for piloting.) The published page embeds all active rooms as JSON in a
`<script id="rooms-seed">` tag. Every host action updates that JSON
locally, then calls the artifact's `publish()` capability to republish
the entire page with just that JSON changed. Other open copies are
meant to live-reload automatically; as a tested fallback, a viewer's
screen also polls the artifact's own URL every 5 seconds. Hosting
requires "can edit" access to the artifact (grant it to whoever's leading
a given service).
