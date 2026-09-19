# iWorship

A cloud-based hymnal, chord book, and live worship-session app for your
congregation. This folder is the real, cloud-backed build — it runs today
in **demo mode** (everything saved on just this one device/browser) and
"graduates" to **real mode** (a shared hymnal and live sessions synced
across every phone and tablet in the building) the moment you connect a
free Firebase project. That's the only thing separating the two modes —
same app, same code, no rebuild.

## Quick start (demo mode — works right now, no setup)

```
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). You'll see a
banner explaining you're in demo mode. Everything works — add songs,
favorite them, host and join a live worship session — but it's all saved
to just this one browser, and a second browser tab will act like a
different person's device (which is exactly how it's meant to work, but
worth knowing when you're testing).

## Connecting your real Firebase project

This is the one part only you can do — creating the project is tied to
your own Google account. It takes about 10 minutes and Firebase's free
"Spark" plan costs nothing for a single congregation's worth of use.

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with whatever Google account you want to own this (a shared church account is a good choice, if you have one).
2. Click **Add project**.
3. Name it something like `iworship-<your-church-name>` and click **Continue**.
4. Google Analytics isn't needed — you can turn it off — then click **Create project**.

### 2. Register a Web App and get your config

1. On the project's home screen, click the **`</>`** (web) icon to add an app.
2. Nickname it "iWorship" and click **Register app**. (Skip the Firebase Hosting checkbox here — we'll do that with the command line later.)
3. You'll see a code block that starts with `const firebaseConfig = {...}`. Keep this tab open — you'll copy six values out of it in a moment.

### 3. Turn on Firestore (the database)

1. In the left sidebar, click **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Start in production mode** (not test mode — the app ships its own security rules, deployed in step 6).
4. Pick a location close to your congregation, then **Enable**.

### 4. Turn on Google Sign-In

1. In the left sidebar, click **Build → Authentication**.
2. Click **Get started**.
3. Under **Sign-in method**, click **Google**, toggle it **Enable**, pick a support email, and **Save**.

### 5. Paste your config into the app

Open `src/firebase-config.js` in this project and replace the six
`REPLACE_ME` values with the matching values from the code block you kept
open in step 2 — `apiKey`, `authDomain`, `projectId`, `storageBucket`,
`messagingSenderId`, `appId`. Save the file. **This one edit is what
switches the whole app from demo mode to real mode.**

### 6. Deploy the security rules

The rules (in `firestore.rules`) are what let everyone read the hymnal
and follow along in a session, but only worship-team members add songs,
host a session, or post in the Musicians chat. **You don't need Node.js,
a terminal, or admin rights on your computer for this** — it's a
copy-paste into the Firebase console:

1. In the Firebase console, go to **Firestore Database → Rules**.
2. Select all the existing text in the editor and delete it.
3. Open `firestore.rules` in this project folder, copy its entire
   contents, and paste it into the console's editor.
4. Click **Publish**.

**If you're re-doing this step for an app update** (for example, this
release added the pre-service setlist and in-session chat), just repeat
steps 2–4 with the new `firestore.rules` — replace the whole thing, don't
try to merge it by hand. Existing songs, rooms, and editors aren't
affected; you're only ever replacing the rules text, never the data.

*(If you do have Node.js and a terminal and would rather use the Firebase
CLI: `npm run login`, then `npx firebase use --add` and pick this project
with alias `default`, then `npm run deploy:rules` does the same thing.)*

### 7. Add yourself (and your worship team) as editors

"Editors" are the people allowed to add songs and host a live service —
your worship team, basically. There's no admin screen for this yet (it's
one Firestore write, managed by hand to keep the free plan free — no
Cloud Functions needed), so:

1. Open the app (see step 8) and sign in with **Continue with Google**
   at least once, so your account exists. If you get a permissions error
   trying to add a song or host a session, that's expected — you're not
   an editor yet.
2. In the Firebase console, go to **Firestore Database → Data**.
3. Click **Start collection**, name it exactly `editors`.
4. For the first document, set **Document ID** to your own **uid**. To
   find your uid: Firebase console → **Authentication → Users** — it's in
   the `User UID` column next to your email, after you've signed in once.
5. Leave the document's fields empty (or add one field like `name: "Jared"`
   just so it's easy to read later — the app only checks whether the
   document exists, not what's in it) and click **Save**.
6. Repeat for each worship team member, once they've each signed in once.

### 7b. Add yourself (and one other trusted person) as Admins — for the beta

**Admins** are different from editors — an Admin can register churches,
assign roles (Pastor, Editor, Music Director, Musician), and grant/revoke
Beta Tester access to anyone, right from a new **Admin Tools** screen inside
the app. This is a deliberate, temporary stand-in for the real Cloud
Functions (see `claude/architecture-and-decisions.md`'s "Monetization, phase
3" in the project docs) — Blaze billing isn't enabled yet, so instead these
specific writes are allowed directly from the client, but only for accounts
you add here by hand. Keep this list very short — just yourself and one
other person you trust completely, since an Admin can write a role onto any
signed-in person's account.

1. Sign in with that account at least once first (same as step 7).
2. In the Firebase console, go to **Firestore Database → Data**.
3. Click **Start collection** (the root-level one, not one nested inside a
   document — see the warning in step 7 if you land in the wrong place),
   name it exactly `admins`.
4. For the first document, set **Document ID** to that account's **uid**
   (same place to find it as step 7: **Authentication → Users**).
5. Leave the document's fields empty and click **Save**.
6. Repeat for the one other trusted person, if any.
7. Reload the app while signed in as an Admin — an **ADMIN TOOLS** link now
   appears on the landing page, next to Plans & Pricing.

**Right after you deploy this update, do this first:** real gating for Play
Mode, adding songs, and hosting is now live for *everyone*, not just beta
testers. Your current worship team (on the editors list from step 7) keeps
its Add-Song and Hosting access automatically, but **Play Mode was never
tied to that list before** — so they'll lose chords/transpose access the
moment this goes live, until you assign each of them a role (or beta access)
via the new Admin Tools screen. Their own **Account ID**, which they'll need
to give you, now shows right on their own landing page once signed in (with
a COPY button).

### 7c. What's new since your last deploy [2026-09-04]

Two things shipped after the Admin Tools screen above, both needing the same
"paste the new `firestore.rules`, drag the new `dist` build to Netlify"
routine from steps 3-4/the deploy step — see this project's monetization
doc (`claude/monetization-plan.md`'s "Phase 4") for the full writeup:

- **Find someone by name.** Both the "Assign a Role" and "Beta Tester
  Access" forms on the Admin Tools screen now have a search box above the
  Account ID field — type a name, tap the result, and it fills the ID in
  for you. You no longer need someone to have already copied and sent you
  their Account ID first (pasting one directly still works too).
- **Song Requests.** Anyone signed in who isn't an Editor/Music Director/
  Individual Premium now sees a **Request a Song** button instead of the
  paid Add a Song button — they submit a title (and optionally paste
  lyrics), the app flags if it looks like something already in the
  hymnal, and it lands in a new **Song Requests** queue linked from the
  landing page (next to Plans & Pricing), visible to anyone on your
  editors list or with beta/Admin access. Approving a request pre-fills
  the existing Add a Song form from any pasted lyrics — you just check it
  over and save; rejecting is one click. This replaces the old "queued for
  next update" wording on the Plans page with something that actually
  works today.

Because this added a new Firestore collection (`songRequests`), you'll need
to re-paste the updated `firestore.rules` into the Firebase console one more
time (same steps 3-4 as before — replace the whole thing, don't try to merge
by hand) for the Song Requests queue to work in real mode; the Admin search
feature needed no rules change at all. **This deploy adds two more new
collections, `sermons` and `directory` (see below) — the same one re-paste
covers all three, so you only need to do it once.**

**A third thing, no rules change needed at all:** while hosting a live
session, you'll now see two new buttons — **PROJECTOR VIEW** (opens a
second browser tab meant for a TV/projector — drag that tab onto the
second screen and hit your browser's fullscreen, usually F11) and
**SPLIT SCREEN** (shows your controls next to a big, clean preview of
exactly what the congregation/projector sees, side by side on one
screen — stacks instead of splitting on a phone or small tablet). Handy
if you're running the service from a laptop connected to a projector.

**A fourth thing, also no rules change needed:** the app now uses your
whole screen width on a laptop/desktop instead of staying capped at a
narrow phone-width column — the hymnal list and Plans & Pricing lay out
as a multi-column grid on wider windows.

**And a fifth:** a new **OPEN THE BIBLE (KJV)** button on the landing
page — the full King James Version, public domain, built in (book →
chapter → verse browsing, plus search across the whole text). It's a
one-time ~4MB download the first time anyone on a device opens it (after
that it's cached and instant, even offline), so don't be surprised by a
brief "Loading the KJV text…" the very first time. Only KJV for now —
see `claude/phase4-features-and-scoping.md` for why NIV/LSB/LEB aren't
bundled yet (a real copyright/licensing question, not a technical one).

**And a sixth — this one needs the `firestore.rules` re-paste above:**
sermon/preaching presentations. If you (or anyone with hosting rights)
can host a service, you'll now see a **SERMONS** link next to "Manage My
Sessions" on the landing page — build a sermon there ahead of time
(**Title**, **Point**, and **Bible Verse** slides; the verse slide has a
**LOOK UP FROM KJV** button that pulls the text straight from the built-in
Bible above), then present it live from the Host Session screen: a new
**SERMON** button sits right next to **SONGS**, and picking a sermon
swaps the whole "now showing" area over to slide controls (PREVIOUS/NEXT,
tap any slide to jump to it) — the congregation, the Presenter/Projector
tab, and the split-screen preview all update live, exactly the way song
sections already do, since it's the same underlying mechanism. A
**SWITCH BACK TO SONGS** link (or just tapping SONGS again) returns to
wherever the song setlist left off.

**And a seventh — also covered by the same `firestore.rules` re-paste:**
sharing a sermon with someone else. Every sermon card on the Sermons
screen now has a **SHARE** button — search by Account ID, name, or
church (searches everyone who's ever set up a profile, not just people
already on your team) and tap **SHARE** next to their name, or tap
**COPY LINK** to hand them a direct link instead (opening it lets them
add the sermon to their own account themselves, no search needed on
their end). Either way it shows up in their own Sermons screen under
**Shared With You**, and — this is the point of it — in their own Host
Session **SERMON** picker too, so a friend pastor or your AVP/tech team
can actually present something you built, from their own hosted
session, not just look at it. Removing access works the same way in
reverse, from either side.

**An eighth — the "one-stop-shop AVP tool" Jared asked for.** A new
**MEDIA LIBRARY** (linked from the landing page, and a new **MEDIA** tab
right next to SONGS/SERMON/BIBLE on the Host Session screen) lets you
upload images and videos, build a slideshow from an exported Canva/Google
Slides/PowerPoint deck (export it as images first, then upload every
page at once, in order), or save a live Canva/Google Slides/PowerPoint
**embed link** — then present any of them live, exactly like a song or
sermon: PREVIEW + GO LIVE, full-screen on the projector/split-screen
view, with PLAY/PAUSE/RESTART for video (synced across every screen) and
PREV/NEXT for a slideshow. This needs the same `firestore.rules` re-paste
as the rest of this list (a new `media` collection) — **but uploading an
actual image or video also needs one more thing this app hasn't needed
anywhere else: Firebase Storage, which Google has required the paid
"Blaze" (pay-as-you-go) plan for on every project since September
2024 — there's no free-plan option for it, unlike everything else this
app uses.** To turn it on: Firebase console → your project → click
**Upgrade** (bottom-left, next to the Spark plan name) → **Blaze** → add
a billing account. Blaze is still pay-as-you-go, not a flat fee — a
single congregation's worth of media uploads is normally pennies a month,
but it's the one part of this app that isn't simply free. Once Blaze is
on, deploy `storage.rules` the same way you deployed `firestore.rules` in
step 6 (Firebase console → **Storage → Rules** → paste its contents →
Publish, or `firebase deploy --only storage` if you're using the CLI).
Skip all of that and Media/AVP simply won't upload anything yet — every
other feature in this app is completely unaffected.

See `claude/phase4-features-and-scoping.md` in the project docs for more
on all of this.

**And a ninth — upload mid-service, and organize by folder.** Two small
follow-ups to Media/AVP above, both from Jared's own feedback after trying
it: first, the Host Session screen's **MEDIA** tab now has its own
**+ UPLOAD NEW** button, so you (or your AVP operator) can add a brand-new
image/video/slideshow/embed without ever leaving the live session to visit
the separate Media Library. Second, the **Media Library** screen itself now
supports **folders** — a **+ NEW FOLDER** button groups media ahead of time
(e.g. "Christmas 2026," "Youth Group"), each item can be **MOVE**d between
folders (or back to unfiled) at any time, and a folder can be **RENAME**d or
**DELETE**d — deleting a folder never deletes what's inside it, it just
un-files those items back to the library's root, exactly like deleting a
folder in a normal file manager. This needs the same `firestore.rules`
re-paste as the rest of this list (one new collection, `mediaFolders`) —
**no Storage/Blaze change at all**, since a folder is just a name, not a
file.

**And a tenth — faster controls for the person actually driving a service.**
On the Host Session screen, the fixed bottom bar (where you stage the next
song section/sermon slide/media slide, then hit GO LIVE) now has a small
**YOUR CONTROLS** label along its top edge at all times, so it's unmistakable
that it's an interactive panel, not just a status readout. It also has two
new shortcuts for anyone on a physical keyboard: the **Left/Right arrow
keys** now do exactly what the PREV/NEXT buttons do (advance the staged
preview, not what's live), and **double-clicking** the status text next to
those buttons goes live, as an alternative to the existing double-tap-Enter
shortcut. No `firestore.rules` change — this is pure on-screen behavior.

**And an eleventh — a real preview screen, not just status text.** SPLIT
SCREEN on the Host Session screen used to show only one big read-only
mirror of what's actually live. Now it shows two, side by side: a
**PREVIEW** panel (gold "PREVIEW" badge) showing exactly what you've
staged but haven't published yet, right next to the existing **LIVE**
panel (wine "LIVE" badge) showing what the congregation/projector
actually sees — the same Program/Preview layout ProPresenter and similar
tools use. Stacks to Preview-then-Live-then-controls on a phone/small
tablet, same as the rest of split screen. No `firestore.rules` change —
this is pure on-screen behavior too.

**And a twelfth — sermon slides are now a real presentation builder, not
three fixed templates.** Building a sermon slide used to mean picking
Title/Point/Bible Verse and everything landed dead-center, no way to move
it. Opening **Sermons → a slide** now drops you into a free canvas: **ADD
HEADING**, **ADD TEXT**, **ADD BULLET LIST**, **ADD IMAGE**, and **ADD
VERSE (KJV)** each add one block to the slide, and every block can be
dragged anywhere and resized by its handle — click a block to select it,
then use the panel underneath to edit its text, alignment, size, and bold,
or replace/remove an image. Each slide also gets its own background — one
of five on-brand color presets, or **+** to upload a custom image — instead
of the fixed ivory card every slide used to have. It all still presents
live exactly the way it always did (stage/projector, split screen, the
congregation's own screen, the musician chart view), and any sermon you
built before this update opens and upgrades itself automatically the
moment you open it in the editor — nothing to migrate by hand, and nothing
breaks if you never touch an old sermon again. No `firestore.rules`
change — a sermon's `slides` field never had a fixed shape enforced there
to begin with. A custom background image reuses the same Media/AVP image
upload as everything else, so it still needs Blaze/Cloud Storage turned on
(see the eighth item above) — a slide with only color backgrounds and no
uploaded images needs nothing extra.

**And a thirteenth — more keyboard shortcuts on the Host Session screen,
and a hint for every one of them.** Double-tapping the **Space bar** now
goes live too, alongside the existing double-Enter and double-click — pick
whichever feels most natural. On top of that, most of the other buttons on
this screen now have a one-key shortcut as well: **1**/**2**/**3**/**4**
switch the SONGS/SERMON/BIBLE/MEDIA tabs, **P** opens the projector view,
**S** toggles split screen, **C** opens/closes chat, **H** opens Manage
Hosts (if you're the session owner), and **L** copies the musician chart
link. None of these fire while you're typing in a text field, and holding
a key down won't rapid-fire a toggle. A small key-cap badge now sits right
on each button showing its shortcut, plus a one-line legend under "Your
Controls" spelling all of them out — both are hidden automatically on a
phone/tablet, where there's no physical keyboard to use them with anyway.
Deliberately **not** given a shortcut: **END SESSION** and **BACK** — a
stray keypress accidentally ending a live service is a much worse mistake
than a stray keypress toggling split screen, so those two still require an
actual click/tap. No `firestore.rules` change — this is pure on-screen
keyboard behavior, no data-model change of any kind.

**Bugfix [2026-09-08]:** double-tapping Space to go live was scrolling the
page down on the first tap (a browser default for the Space bar that
double-Enter never had). Fixed so Space no longer scrolls the page at all
on this screen, while the shortcut itself works exactly as before —
double-tap Space still goes live. No visible change otherwise.

**Bugfix [2026-09-08]:** in the sermon slide builder, a text block's
REMOVE BLOCK button was sharing a CSS class built for a small round "×"
icon button — cramming the words "REMOVE BLOCK" into a 38px circle made
the text overflow and overlap the BOLD button next to it. REMOVE BLOCK
now has its own properly-sized button. Purely visual — nothing about
what the button does changed.

**Fellowship [2026-09-08]** — this one needs the `firestore.rules`
re-paste above (five new collections: `posts`, `reports`, `dmThreads` +
its `messages` subcollection, `groupChats` + its `messages`
subcollection): a whole social layer, cross-church, same "no data walls"
design as the hymnal itself. **OPEN FELLOWSHIP** and **MESSAGES** buttons
now sit on the landing page once you're signed in, alongside a **MY
PROFILE** link. My Profile lets you write a bio, add a profile photo, and
shows your favorite hymns (the same heart-toggle favorites list you
already had, now also shown on your public profile page). Fellowship
itself is one shared feed — post plain text, a photo, or a video, and
everyone (any church) sees it, newest first; tap anyone's name to see
their profile, DM them, or (if you need to) block or report them. **MY
PROFILE** also has a **Blocked Accounts** list, since a blocked person's
posts/search results disappear everywhere else — that's the only way
back to unblock someone. **MESSAGES** covers both one-on-one DMs and
named group chats you can create with anyone in the app; leaving a group
you own deletes it for everyone (there'd be no one left to manage it
otherwise), while leaving one you don't own just removes you. Every
report you or anyone else files lands in a new **Reports** section on
the Admin Tools screen, so moderation is built in from day one, not an
afterthought. Profile photos and post photos/videos reuse the exact same
upload path as Media/AVP, so the same disclosed caveat applies: uploads
need Cloud Storage/Blaze billing turned on in your real Firebase project
(see "What's still demo-only" below) — demo mode works today with no
setup, same as everything else in this app.

**Fellowship redesign [2026-09-09]** — needs another `firestore.rules`
re-paste (seven more new collections: `likes`, `comments`, `follows`,
`notifications`, `stories`, `shorts`, plus a private `saved` list under
each person's own profile). Fellowship now looks and behaves like an
actual social feed: every post has a like button, a comment thread,
repost, and save/bookmark. There's a brand-new **Shorts** tab — short
vertical videos, swipe up for the next one, upload your own. A
**Follow** button now appears on everyone's profile (one-directional,
like Instagram — following someone doesn't require them to accept
anything). A notification bell in the top bar tells you when someone
likes/comments/follows/reposts, with an unread badge. An **Explore** tab
combines trending posts, suggested people, and a people-search box (find
anyone by name or church and follow/message them straight from the
results — "just like Facebook"). Stories — a photo or video that
disappears after 24 hours — now show as a row of circles at the top of
the feed; tap the **+** to add your own, tap anyone else's to view
theirs. And the whole app now has a persistent header: your own profile
photo sits next to the "iWorship" logo (tap it to open My Profile), and
a new hamburger (☰) menu button holds My Profile, Notifications,
Messages, Explore, **Switch to Worship/Fellowship** (this is the "switch
between interfaces" control), Plans & Pricing, and Sign Out — reachable
from anywhere, not just the landing page. Shorts and Stories uploads
carry the same Blaze-billing caveat as every other upload in this app;
liking, commenting, following, and notifications need no billing change
at all.

### 8. Add your hymns

No CLI needed here either — the app itself is the tool. Once you're
signed in and on the editors list (previous step), use **Add a Song** (one at
a time, with the section builder) or **Bulk Add Songs** (paste several at
once, in the format that page describes) right from the app's own menu.
There's no pre-loaded sample hymnal to copy in real mode — you're
building your congregation's actual hymnal from scratch, which also
sidesteps any question of whether a given arrangement is copyright-clear
to reproduce wholesale.

*(If you do have Node.js and a terminal: `npm run seed` copies this
project's 5 placeholder sample hymns in, useful only for kicking the
tires — not a substitute for adding your real hymnal.)*

**Fixing a song later:** open any song and, if you're on the editors list,
you'll see an **EDIT SONG** button next to Favorite/Learn on YouTube. It opens
the same kind of form as Add a Song — title, key, YouTube link, tags, themes,
and the lyrics/chords themselves (verse by verse, same `[G]Amazing grace`
chord-bracket format) — pre-filled with that song's current content, so
correcting a typo, fixing a chord, or adding themes to something bulk-imported
without any never takes more than opening the song and editing it right there.
No AI or separate setup needed for this — it's always available to anyone on
the editors list.

### 9. Put it online

This project ships as a pre-built `dist` folder specifically so this step
never needs Node.js, a terminal, or admin rights — just a browser:

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop) in your
   browser.
2. Drag the whole `dist` folder onto the page.
3. In a few seconds it gives you a live URL — that's your real, shareable
   app. Share that link with your worship team and congregation; opening
   it on a phone and choosing "Add to Home Screen" (iPhone) or "Install
   app" (Android) makes it behave like a normal app icon.

That link has a temporary password on it unless you claim it with a free
Netlify account (the drop page offers this right after deploying) —
claiming it is quick and worth doing so the link doesn't expire.

**Works with no signal:** once someone's opened the app with a connection at
least once, every song, chord chart, and setlist they've seen stays on their
device and keeps working with zero signal — a dead spot in the sanctuary, a
phone in airplane mode, whatever. It quietly catches back up the moment the
connection returns. Nothing to turn on; it's automatic.

Any time you get an updated `dist` folder (a new feature, a bug fix),
just drag it onto [app.netlify.com/drop](https://app.netlify.com/drop)
again the same way — dropping a new build to an account you've claimed
updates the same site and keeps the same URL.

*(If you do have Node.js, a terminal, and have already run `firebase use
--add`: `npm run deploy` builds and deploys to Firebase Hosting instead,
giving you a `https://<your-project-id>.web.app` URL.)*

## Packaging an installable Android APK

Now that the app is live at your real Netlify URL
(`https://iworshipv1.netlify.app/`), it can be wrapped into a proper
Android app — a "Trusted Web Activity" (TWA), which is really just your
website running full-screen in a chrome-less wrapper, no rebuild of the
app itself involved.

The tool for this is normally **Bubblewrap**, but that's a command-line
tool that needs Node.js and the Android SDK — exactly the kind of setup
your Windows computer can't do (no admin rights) and, as it turns out,
the sandbox this app gets built in can't do either (no route to Google's
Android SDK/build servers from there). So instead, use
**[PWABuilder](https://www.pwabuilder.com)** — Microsoft's free,
entirely browser-based version of the same thing. No install, no
terminal, on either end:

1. Go to **[pwabuilder.com](https://www.pwabuilder.com)** in your
   browser.
2. Paste in `https://iworshipv1.netlify.app/` and click **Start**. It
   scans the live site and shows a report card — the manifest and
   service worker are already set up correctly (that's the PWA work
   already done), so this should come back green with little to fix.
3. Click **Package For Stores** → choose **Android**.
4. Fill in the package details:
   - **Package ID** — a reverse-domain name that identifies the app,
     e.g. `church.homegrovebaptist.iworship`. Pick anything sensible;
     it can't be changed later without it becoming a "different" app.
   - **App name** / **Launcher name** — "iWorship" is fine for both.
   - **Signing key** — choose **"Create a new signing key"** and let
     PWABuilder generate one for you (it'll ask for an alias/password —
     anything you'll remember). **Download the signing key it gives you
     and keep it somewhere safe** (a cloud drive, not just a temp
     folder) — you need that exact file for every future update to this
     app. Lose it, and a future version can't be published as an update
     to the same app; it'd look like a brand new one to any device that
     already has this one installed.
5. Click **Generate**. It downloads a `.zip` with a ready-to-install
   `.apk` (for handing the file directly to someone's phone — they may
   need to allow "install from unknown sources" once) and a `.aab`
   (the format the Google Play Store wants, if you ever set up a Play
   Developer account — $25 one-time — and want it there instead of
   sideloaded).
6. PWABuilder may also ask you to place a small `assetlinks.json` file
   at `https://iworshipv1.netlify.app/.well-known/assetlinks.json` —
   this is what proves to Android that the app and the website are the
   same people, so the app opens full-screen instead of showing a
   browser address bar (without it, the app launches into Chrome with
   the address bar showing, instead of full-screen). **This is already
   done** — it's baked into the build at `public/.well-known/assetlinks.json`
   now, so every future Netlify Drop upload includes it automatically.
   If PWABuilder ever regenerates a new signing key, send the new
   `assetlinks.json` it gives you and this file gets swapped in the same
   way.

   **Confirmed working end-to-end** (as of Sept 2, 2026): full-screen
   launch verified on Jared's device after a clean reinstall.

   **A Netlify-specific gotcha, also already fixed:** Netlify silently
   refuses to serve anything inside a folder whose name starts with a
   dot (like `.well-known`), even though the file is sitting right there
   in the deployed bundle — it just 404s, Netlify's own branded "Page
   not found" page. The fix takes two parts, both already done: (1) the
   real file lives at a normal, non-hidden path
   (`public/assetlinks.json`, no dot-folder involved at all), and (2)
   `public/_redirects` has a rule rewriting the dot-path request to it —
   `/.well-known/assetlinks.json  /assetlinks.json  200!`. Critically,
   there must be **no literal file left at the dot-path** — Netlify
   checks for a matching static file before it applies a redirect, so
   even a leftover, unservable file sitting at
   `.well-known/assetlinks.json` can short-circuit straight to a 404
   before the redirect rule gets a chance to run; that trailing `!` on
   the rule additionally forces it to apply regardless. Nothing to do
   here day-to-day — this is just why the project's `public/` folder
   has no `.well-known/` directory at all, only the plain
   `assetlinks.json` + `_redirects`. (If this project ever moves off
   Netlify, `_redirects` is harmless — other static hosts ignore it,
   since it's a Netlify-specific convention.)

Send the signing key details (or the whole `.zip` PWABuilder gives you)
along if you'd like help with a future update — otherwise, once you have
it, that key is yours to keep and this step doesn't need to touch a
Claude session again.

## What's still demo-only

Everything in this README is real once you've done steps 1–9 above.
Nothing about the app's *features* changes between demo and real mode —
same screens, same flows. The one honest caveat: the Firestore-backed
code (`src/data/firestore-data-layer.js`) was written and reviewed
carefully against Firebase's documented SDK, and it shares its interface
line-for-line with the demo-mode code that HAS been fully tested end to
end (sign-in, adding songs, favoriting, hosting and joining a live
session with two devices, private-room passwords, public room listings,
pre-service setlists, and in-session chat) — but it could not be run
against a real Firebase project from where this app was built, since that
sandbox has no route to Google's servers. Your first real sign-in and
first real hosted session, after step 9, are the actual first test of
that file. If anything looks off there, that's the place to look first.

Same honest caveat applies to AI theme tagging, doubly so: it was tested
end to end in demo mode against a stand-in server that mimics the real
Cloudflare Worker's responses, but the Worker code itself
(`cloudflare-worker/ai-tagger-worker.js`) and its call to Anthropic's API
could not be run for real from this sandbox either. If AI tagging ever
returns an error, check the Worker's logs in the Cloudflare dashboard
first — that'll usually show whether it's a missing/wrong secret, an
Anthropic API issue, or something else.

Same caveat again for the beta-phase monetization backend (Admin Tools,
role/beta-tester assignment, church registration — step 7b): tested
thoroughly end to end in demo mode (an ordinary member correctly blocked
from Play Mode/Add Song/Hosting with an upsell prompt; an Admin registering
a church, curating its hidden-song list, assigning a role, and granting
beta access; that role/beta grant actually taking effect for the target
account; the Public/Church Library toggle) but not against your real
Firestore project, since the `admins`/`editors` allowlists and the new
`firestore.rules` gating can only really be proven once you've deployed
step 6's rules and step 7b's `admins` collection yourself. If a role or
beta-tester assignment doesn't seem to take effect, double-check the
Account ID was pasted correctly and that your `firestore.rules` deploy
included the Admin-write rules for `churches/{id}` and `users/{uid}`.

Same caveat a third time for the Media/AVP feature (Media Library, the
MEDIA tab — see step 7c's eighth item): tested thoroughly end to end in
demo mode (uploading an image/video/multi-slide slideshow, saving an
embed link, presenting each one live through Preview/Go Live, video
PLAY/PAUSE/RESTART, slideshow navigation, projector keyboard shortcuts)
but demo mode never touches Firebase Storage at all — it fakes an
upload with a same-tab browser URL instead (see
`claude/phase4-features-and-scoping.md`'s Media/AVP section for exactly
why), so your first real upload against your own Firebase project,
**after enabling Blaze billing** (see step 7c), is the actual first test
of that code path. If an upload fails there, check that Blaze is
actually on and that `storage.rules` got deployed — a 402/403 error on
upload almost always means one of those two steps was skipped.

Same caveat a fourth time for Fellowship (profiles, posts, DMs, group
chats — see the changelog entry above): tested thoroughly end to end in
demo mode (bio + profile photo, favorite hymns showing on a profile
page, a text post and an image post both appearing in the feed, viewing
someone else's profile, blocking someone and confirming their post
disappears from the feed and unblocking them again from Blocked
Accounts, filing a report and resolving it from the Admin screen and
deleting the reported post from there too, a full DM round trip, and
creating/messaging/leaving a group chat) but never against a real
Firestore project, for the same reason as the two caveats above — and
profile photos/post photos/videos reuse Media/AVP's exact same upload
path, so they carry that feature's Blaze-billing dependency too. If
Fellowship posts/DMs/group chats don't sync between real accounts, check
that step 6's `firestore.rules` re-paste actually included the new
`posts`/`reports`/`dmThreads`/`groupChats` collections above; if a
profile photo or post photo/video won't upload, it's almost always the
same Blaze/`storage.rules` check as the Media/AVP caveat just above.

Same caveat a fifth time for the Fellowship redesign (likes, comments,
repost, save, follow, notifications, Explore, Stories, Shorts — see the
changelog entry above): tested thoroughly end to end in demo mode (liking/
commenting/saving/reposting a seeded second person's post and confirming
a notification landed in their inbox, following that person and finding
them again via Explore's people search, a seeded Short showing in the
Shorts feed, a seeded Story opening the full-screen viewer, and the
hamburger's Switch-to-Worship/Fellowship toggle working both directions)
but never against a real Firestore project, same reason as every caveat
above. If `firestore.rules` wasn't re-pasted with THIS version (it needs
seven more new collections — `likes`, `comments`, `follows`,
`notifications`, `stories`, `shorts`, plus a `saved` subcollection under
each profile — on top of everything Fellowship already had), liking,
commenting, following, and notifications will all silently fail; Shorts
video uploads and Stories photo/video uploads carry the same Blaze-
billing dependency as every other upload in this app.

## About the in-session chat

The **Everyone** channel is intentionally open: anyone who joins a session
by its room code can read and post, whether or not they've signed in —
same trust level as the rest of a Worship Session (joining at all needs
no account either). There's no message moderation, editing, or deletion
built in, and no rate limiting — for a small congregation's live-service
chat that's a reasonable tradeoff, but it's worth knowing before sharing
a public room code widely. The **Musicians** channel is private to
whoever's on the editors list (see step 7) — anyone else simply never
sees that tab. A session's chat is cleared automatically when the host
ends it, so it doesn't carry over if a room code ever gets reused later.

## Setting up AI theme tagging (optional)

By default, the Themes field (Salvation, Heaven, Grace, etc.) is picked by
hand — on the Add Song form, in Bulk Add's `Themes:` line, or left blank.
This optional feature lets the app suggest themes automatically by having a
real AI model read a song's lyrics, both for new songs and, via an
**"AI-Tag Untagged Songs"** button on the hymnal list (editors only), for
songs already in your library that don't have themes yet — including
anything added before this feature existed, or without a `Themes:` line.

It's off by default and the rest of the app works exactly the same either
way — nothing breaks if you skip this section.

**Why it needs a bit of setup, unlike everything else in this app:** calling
an AI model needs an API key, and an API key can never go directly in the
app's JavaScript — anyone could open their browser's dev tools and steal it.
So this needs one small piece hosted separately, whose only job is to hold
that key and make the AI call on the app's behalf. **Cloudflare Workers** is
free (no card required for its usage tier, which is far more than a church
hymnal needs) and — like Netlify Drop — has a way to set it up entirely in
the browser, no Node.js or command line needed.

1. **Get an Anthropic API key.** Go to
   [console.anthropic.com](https://console.anthropic.com), sign up, and
   create an API key (Settings → API Keys). This is a pay-as-you-go key —
   tagging a song costs a small fraction of a cent, so even tagging your
   whole library many times over should only run a few cents — but it does
   mean linking a card there, separately from everything else in this app.
   You can set a spending limit in the console if you want a hard ceiling.
2. **Create a Cloudflare Worker.** Go to
   [workers.cloudflare.com](https://workers.cloudflare.com), sign up (free,
   no card), and create a new Worker (usually a "Create" or "Deploy" button
   on the dashboard, then choose to start from a blank/"Hello World"
   Worker).
3. **Paste in the Worker code.** Open the new Worker's editor (often called
   "Quick Edit" or "Edit code") and replace everything in it with the
   contents of `cloudflare-worker/ai-tagger-worker.js` from this project.
   Click **Deploy** (or **Save and Deploy**).
4. **Add two secrets.** In the Worker's dashboard, find **Settings →
   Variables and Secrets** (wording varies slightly by Cloudflare's current
   UI) and add two variables, both set to type **Secret**, not plain text:
   - `ANTHROPIC_API_KEY` — the key from step 1.
   - `SHARED_SECRET` — any random string you make up (think of it as a
     password between your app and this Worker, so a stranger who finds the
     Worker's URL can't call it and run up your API bill). A long mix of
     letters and numbers is fine — you'll never need to type it again after
     this.
5. **Copy the Worker's URL.** It's shown at the top of the Worker's
   dashboard page, and looks like
   `https://iworship-ai-tagger.YOUR-NAME.workers.dev`.
6. **Paste both values into the app.** Open `src/ai-config.js` and replace
   `AI_TAG_ENDPOINT`'s `'REPLACE_ME'` with the URL from step 5, and
   `AI_TAG_SHARED_SECRET`'s `'REPLACE_ME'` with the exact secret string from
   step 4.
7. **Rebuild and redeploy** the app the same way as any other update — see
   step 9 above (Netlify Drop, drag the new `dist` folder in).
8. **Optional, once your Netlify site's URL is settled:** open
   `cloudflare-worker/ai-tagger-worker.js` (both the copy in this project
   and the one pasted into the Worker's editor), change `ALLOWED_ORIGIN`
   from `'*'` to your exact site URL (e.g.
   `'https://your-site-name.netlify.app'`), and re-deploy the Worker. This
   locks the Worker down so only your app's own pages can call it — a nice
   extra layer on top of the shared secret, not required to get started.

Once set up, you'll see **"SUGGEST THEMES WITH AI"** on the Add Song form
and on any song's detail page that doesn't have themes yet, and an
**"AI-TAG UNTAGGED SONGS (N)"** button at the top of the hymnal list
(visible to signed-in worship-team members) that works through every
untagged song in one pass. Suggestions are always just that — themes
still show up as regular pill/chip tags you (or the person adding a song)
can add to or remove before or after saving.

## Project structure

```
src/
  app.js                    -- all UI logic; same code for demo and real mode
  firebase-config.js         -- the "REPLACE_ME" file from step 5
  ai-config.js                -- the "REPLACE_ME" file for AI theme tagging (optional, see above)
  data/
    interface.md              -- the shared contract both data layers implement
    local-data-layer.js        -- demo mode (localStorage + BroadcastChannel)
    firestore-data-layer.js    -- real mode (Firebase Firestore + Auth)
    index.js                   -- picks one of the above automatically
    ai-tagger.js                -- client side of AI theme tagging (calls the Cloudflare Worker below)
  content/                   -- sample hymns, icons, themes, Bible verses
firestore.rules              -- who can read/write what (deployed in step 6)
scripts/seed-firestore.mjs   -- one-time hymnal import (step 8)
cloudflare-worker/
  ai-tagger-worker.js         -- paste this into a Cloudflare Worker for AI theme tagging (optional, see above)
```
