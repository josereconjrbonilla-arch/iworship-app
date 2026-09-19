---
title: iWorship — Phase 4 Features, and Scoping Notes for What's Next
description: Documents four things shipped 2026-09-04 -- the Presenter/Projector ("stage") view, the desktop/computer-screen sizing fix, the built-in KJV Bible, and sermon/preaching presentations (reusing the Presenter/Projector live-sync as its foundation, per Jared's request) -- plus why only KJV is bundled so far (NIV/LSB/LEB licensing), a same-day follow-up section on the stage-view autofit/full-bleed/presentation-mode bugs found via Playwright testing after Jared tried it live, a further same-day section on the new musician chord-chart view (?chart= link) plus a host-resume crash bug it surfaced and fixed, a same-day section on host session recovery ("My Sessions" resume) plus ad hoc Bible verse presenting, two more same-day rounds reorganizing the host/presenter controls screen (segmented content-source picker + icon toolbar + collapsible chat, then a fixed "Now Live" bar + floating chat widget + a room-code visibility toggle) after Jared found it crowded, a same-day section fixing a setlist-disappearing bug plus adding prev/next controls under the split-screen presenter preview, a same-day section making all three content-source tabs (SONGS/SERMON/BIBLE) symmetrically resume whatever was last live instead of just SONGS, a six-feature batch the next day (Bible verse ranges, "recently shown" quick lists, next-up preview, split-screen persistence, projector keyboard shortcuts, and musician-only chords on the projector), a following-day section fixing a duplicate-label bug in split screen plus adding co-hosting (an owner-managed roster of other accounts who can be handed control of the presentation, one at a time), a v12 batch (chords off the shared screen, a tab-highlight fix, a setlist-default-view fix, an easier Bible verse picker), a v13 Preview/Go-Live workflow plus a fade transition on the live view, a v14 Media/AVP feature (image/video/slideshow/live-embed upload and presenting, one-stop-shop AVP per Jared's request, disclosed-blocked on Firebase Storage's Blaze billing requirement the same way Cloud Functions already is), a v15 follow-up adding in-session media upload plus Media Library folders for AVP prep work (organize/rename/delete-un-files-not-deletes-contents/move media between folders), and a v16 follow-up adding preview-bar keyboard shortcuts (arrow-key staging navigation, distinct from the projector's own live-write arrow shortcut), double-click-to-go-live, and an always-visible "Your Controls" label on the preview bar, and a v17 follow-up adding a real PREVIEW panel alongside the LIVE panel in split screen (a ProPresenter/vMix-style Program/Preview dual view), replacing split screen's old single read-only LIVE-only mirror, and a v18 follow-up turning sermon slides into a real presentation builder -- a free canvas of independently draggable/resizable text and image blocks plus a background color/image, replacing the original three fixed, always-centered templates, with any sermon saved under the old shape auto-migrating to the new one the instant it's reopened in the editor, and a v19 follow-up adding a double-Space go-live shortcut plus one-key shortcuts for the rest of the presenter toolbar (tab switching, projector/split/chat/hosts/chart-link), each one now indicated with an on-button key-cap badge and a shortcuts legend line, deliberately excluding End Session/Back, and a v20 bugfix removing an unwanted page-scroll side effect from the first press of the double-Space shortcut while keeping the shortcut itself unchanged, a v21 bugfix for a REMOVE BLOCK/BOLD button overlap in the presentation builder's block-properties panel, and v22 shipping Fellowship -- a full cross-church social layer (profiles with bio/photo/favorite hymns, a post feed, DMs, group chats, block/report moderation) -- see claude/fellowship-plan.md for its full writeup, and v23 shipping the Fellowship social-media REDESIGN (likes/comments/repost/save on posts and a new Shorts vertical-video feed, one-directional follow, an in-app notifications bell, an Explore/Discover + people-search page, 24-hour Stories, and a hamburger-menu-driven switch between the Worship and Fellowship interfaces plus a header avatar next to the logo) -- see claude/fellowship-plan.md's "v2: social redesign" section for its full writeup, and v24 a same-day bugfix pass after Jared tested v23 live on his own phone, fixing a real header-overflow bug (the hamburger button was getting pushed off-screen on a narrow phone) and a real search-icon/text-overlap bug (a CSS specificity collision affecting several search boxes, Messages included), plus disclosing that the other two things he reported (MESSAGE button, profile photo upload) reproduce as working correctly in demo mode and most likely need the still-outstanding firestore.rules paste and Blaze billing enablement -- see claude/fellowship-plan.md's "v24 hotfix" section -- and v25/v26/v27, three more same-day passes off Jared's continued live real-account testing: v25 made cross-account write failures show a real error code in their toast instead of a generic message, v26 used that diagnostic to find and fix an actual firestore.rules bug (a null-resource dereference denying the very first DM between two real accounts, undetectable by the existing demo-mode test suite since demo mode has no security rules at all), and v27 fixed a gap in v25/v26's own diagnostic helper that was silently hiding the error code when a thrown error had no `.code` property -- see claude/fellowship-plan.md's "v25"/"v26"/"v27" sections for the full writeups. See claude/architecture-and-decisions.md and monetization-plan.md for the Admin search + Song Requests features shipped the same day as v22.
last updated: 2026-09-09
---

# Phase 4 features, and scoping notes for what's next

This doc documents four phase-4 features not already covered elsewhere:
the Presenter/Projector view, the desktop/computer-screen sizing fix, the
built-in KJV Bible, and sermon/preaching presentations (which reuses the
Presenter/Projector work as its foundation, exactly as scoped below when
it was still an open idea).

For the other two phase-4 features shipped the same day — the Admin
screen's "find by name" search, and the free-tier Song Requests review
queue — see `claude/monetization-plan.md`'s "Phase 4" section and
`src/data/interface.md`'s "Song requests" section. This doc doesn't repeat
those.

## Shipped: Presenter/Projector ("stage") view [2026-09-04]

Jared's ask: "when someone hosts a service, give an option for the host
to have a presenter screen, one screen for the projector/second screen,
one screen for presenter controls... best used in PC versions, but it can
be used in mobile and tablets as well, it's just that the presenter
screen can either be toggled and split screened."

Built as a pure frontend feature on top of the *existing* live-room sync
(Firestore `onSnapshot` in real mode, BroadcastChannel in demo mode) —
no new collection, no rules change, no data-model change. Two ways to
get it, matching "toggled and split screened" directly:

1. **PROJECTOR VIEW** (new button on the host's session screen) opens a
   second browser tab/window at `?stage=<room code>` — a new, chrome-less,
   read-only route (`renderSessionProjector()` in `app.js`, `.stage-view`
   in `styles.css`) that shows nothing but the current section in very
   large type (`clamp()`-based font sizing so it scales with viewport,
   not a fixed size that would look wrong on a phone used the same way).
   No chat, no controls, just a small "&times;" in the corner to close the
   tab. This is the piece meant for an actual PC-with-projector setup:
   open the projector-view tab, drag it onto the projector's monitor
   (standard OS "extend display" + move-window behavior), hit the
   browser's own fullscreen (F11) — no new app code needed for that part,
   it's just what browsers already do with a second monitor.
2. **SPLIT SCREEN** (a toggle button right next to it) instead changes the
   *same* host screen into a two-column CSS grid (`.host-split-grid`) —
   controls on one side, a bigger/cleaner read-only preview of the exact
   same live slide (`renderStageSlide()`, shared with the projector view
   above) on the other. On a narrow viewport (phone, small tablet in
   portrait) the grid collapses to a single stacked column via a media
   query, so it reads as "preview on top, controls below" rather than a
   true side-by-side split — this is the mobile/tablet behavior Jared
   described ("it can be used in mobile and tablets as well, it's just
   toggled").

Implementation notes for whoever picks this up next:
- The `?stage=<code>` deep link is parsed once at module load (right
  where the existing "resume mid-session on reload" logic already lives)
  and takes priority over it. It's intentionally read-only and never
  written to `sessionStorage` — closing that tab and reopening the app
  normally starts fresh, it never tries to "resume" into stage view.
- It's a same-origin link the host generates for themselves (via
  `window.open()` from their own already-authenticated host screen), not
  something meant to be shared publicly — reading a room's data is
  already `allow read: if true` in `firestore.rules` regardless, so
  there's no new security surface here, just a UX shortcut that skips
  re-entering a join code/password.
- Verified end-to-end via headless Playwright in demo mode: hosting a
  session, toggling split screen (grid appears/disappears, both columns
  render, live lyric text present), opening the `?stage=` URL in a
  second tab (chrome-less, shows the live section, no chat/controls
  present), and — the important one — advancing a section from the host
  tab and confirming the projector tab updates live via the same
  cross-tab broadcast the rest of the app already relies on.

**Deliberately not built yet, worth asking Jared about before adding:**
a "next slide" preview (so a host glances ahead before advancing — useful
enough on a real second monitor that it's a natural next step); showing
chords on the projector view for a Play-Mode host who wants their own
monitor mirrored there too (currently always lyrics-only, matching
Sing Mode); remembering the split-screen toggle's on/off state across a
page reload (currently resets to off each time `renderSessionHost()`'s
enclosing session starts fresh); and a keyboard shortcut (space/arrow
keys) to advance sections from the projector tab itself, for a host who
wants to control from the same screen as the display (right now
advancing only works from the controls screen, by design — the projector
tab is meant to be look-only).

## Shipped: desktop/computer-screen sizing [2026-09-04]

Jared's answer to "a PC version of this app" (see the scoping analysis
this doc originally had here): **"web app, but at least fix the sizing to
also fit computer screens apart from phones and tablets"** — explicitly
not asking for an Electron/Tauri installer or even to test the PWA
desktop-install option, just the responsive layout itself. Before this,
`main` (and the topbar) were capped at a single ~920px-wide mobile-style
column no matter how wide the browser window was. Fixed with two
`@media (min-width: …)` blocks in `styles.css`: `main`/`.topbar-inner`
widen at 900px and again at 1400px, and the hymnal list + the Plans &
Pricing cards switch from one stacked column to a responsive
`repeat(auto-fill, minmax(…,1fr))` grid so the extra width is actually
used. Text-heavy single-column content (forms, the verse-of-the-day card,
slide displays, the Bible reader below) keeps its own narrower
max-width/ch caps, so it stays a comfortable reading width even inside a
wider `main` — this was a targeted fix, not a full desktop redesign.

One real bug worth flagging for whoever touches `styles.css` next: the
first attempt at this placed the `@media (min-width:900px)` block right
after the base `main{...}` rule near the top of the file, and it silently
did nothing — `getComputedStyle` showed the old mobile layout even at a
1600px viewport. CSS resolves ties in specificity by **source order**, and
a media-query-guarded rule's position in that ordering is wherever it's
*written*, not "wins whenever its condition is true." An unconditional
rule of equal specificity later in the file beats an earlier
media-guarded one even when the media condition matches. Fix: the
responsive block was moved to the very end of `styles.css` (right before
the closing `[hidden]` rule), after every plain rule it needs to beat.
Any future override rule in this file should go at the end for the same
reason.

## Shipped: built-in KJV Bible [2026-09-04]

Jared's ask, and his answer once the licensing question below was put to
him: **"Start with KJV only"**. Built as a `BIBLE` entry point on the
landing page (`renderBible()` in `app.js`) — book grid (Old/New Testament,
all 66 books) → chapter grid → a reading pane (`.lyric-sheet`, same look
as a song's lyric sheet) with verse numbers and prev/next-chapter nav,
plus a whole-Bible text search (3+ characters, plain substring match
across all 31,102 verses, capped at 60 hits — instant, no index needed at
this size).

**Data source and licensing**: the KJV (1769 edition) text came from the
`kjv` npm package (MIT/Public-Domain license, no dependencies, deprecated
but the text itself doesn't change) — reshaped once at build time (not a
build step that runs automatically; see below) into
`src/content/kjv.json`: `{ books: [66 names, canonical order], text: {
[book]: { [chapter]: { [verse]: "text" } } } }`. This sidesteps the
sandbox's network allowlist (arbitrary web/GitHub fetches are blocked;
npm/pypi registries aren't) and lands on the same public-domain footing
as the hymnal's own compiled public-domain lyrics — no license needed,
unlike NIV/LSB/LEB (see "Not pursued yet" below).

**Why it's lazy-loaded, not bundled**: the reshaped JSON is ~4.3MB — small
for "the whole Bible" but too big to add to every page load for people
who never open it. `app.js` pulls it in via `import('./content/kjv.json')`
only when Bible is actually opened, which Vite/Rollup automatically
code-splits into its own chunk (`dist/assets/kjv-*.js`). `vite.config.js`'s
`workbox` config explicitly excludes that chunk from the PWA's precache
list (`globIgnores: ['**/kjv-*.js']` — without this, the build fails
outright, since the default precache limit is 2MiB and this chunk is
4.4MB) and instead adds a `CacheFirst` runtime-caching rule for it, so the
first time anyone opens Bible it's fetched once and then cached for a
year — every visit after that, including offline, is instant, without
ever forcing that 4MB onto someone who only ever opens the hymnal.

**Deliberately not built yet**: there's no way to regenerate
`src/content/kjv.json` from source via an npm script in this repo — it
was a one-time transform run in a scratch directory during this session
(see this doc's git history / the session transcript if it ever needs
regenerating, e.g. to fix a data issue). No verse-of-the-day pull from
this new full text (the existing `src/content/verses.js` pool is a
separate, much smaller, hand-picked set and is untouched). No
copy/share-a-verse button, no bookmarking/highlighting, no jumping
straight to a reference typed as "John 3:16" from the search box (it's
plain substring search over verse text only, not reference parsing) —
worth adding if Jared wants faster reference lookup than
browse-then-search.

**NIV / LSB / LEB — not pursued yet.** Same conclusion as before Jared's
answer, just now the acted-upon one: NIV (Biblica) and LSB (316
Publishing/Lockman) are actively copyrighted and would need a real
publisher license (api.bible is the standard licensed-access route,
American Bible Society-operated) before their text could ship the same
way KJV just did; LEB (Faithlife)'s "unusually permissive" reputation
still hasn't been verified against Faithlife's actual current terms for a
paid app. None of this is blocking — KJV alone is a complete, working
Bible feature — but it's the reason there's only one translation and no
translation switcher in the UI yet.

## Shipped: sermon/preaching presentations [2026-09-04]

Jared's ask: "Pastors can upload the outline of their preaching, and how
they want each slide to look like. There will be readymade templates...
kinda like powerpoint presentation, where there's a presented screen, a
presenter's control screen... I need that to be with the songs broadcast
as well." Built exactly as scoped: a new **Sermons** screen (linked from
the landing page's Worship Sessions card, for anyone `canHost()`) where a
slide-by-slide sermon is built ahead of time, then a **SERMON** picker
sitting right next to the existing **SONGS** picker on the Host Session
screen presents it live — both write into the same room doc, and both go
through the exact same Presenter/Projector (`?stage=`) and split-screen
machinery already built for songs above, not a second parallel system.
`src/data/interface.md`'s "Sermons" section has the full data-shape/design
writeup; this section covers the three open questions this doc left for
Jared, and how each got decided.

The three questions this doc asked before building, and what shipped
instead of blocking on an answer (this was a "make the reasonable call
and keep going, state it plainly" pass rather than a back-and-forth —
easy to revisit if Jared wants something different):
- **Template look** — a fixed set of three, matching the existing wine/
  ivory/gold palette rather than a freeform layout designer: **Title
  Slide** (heading + optional subtitle, for opening a sermon or a new
  point), **Point Slide** (a heading plus a bulleted list of points, one
  per line), and **Bible Verse Slide** (an optional label, a reference,
  and the verse text). Reusing `.slide-card`/`.stage-lines` styling
  end to end, the same as songs, rather than inventing new visual chrome.
- **Images on day one** — no. Text-only v1, per the doc's own lower-risk
  option; Firebase Storage is still unused anywhere in this app, and nothing
  about the shipped data model (`Slide` has no image field at all) blocks
  adding one later.
- **Verse-text auto-fill** — yes, wired up, since the KJV Bible above made
  it cheap: the verse template has a **LOOK UP FROM KJV** button that
  parses a typed "Book Chapter:Verse" reference (e.g. "John 3:16") against
  the exact same `kjvData`/`bibleVerseEntries()` the Bible screen uses, and
  fills the verse text in as plain, editable text — no live link back to
  the Bible feature, no new data source.

Verified end-to-end via headless Playwright in demo mode: building a
three-slide sermon (one of each template) including a live KJV lookup on
the verse slide, hosting a session, presenting the sermon from the SERMON
picker, advancing/jumping between slides, a congregant's session view
updating live as the host advances (same cross-tab broadcast every other
live-sync feature in this app relies on), the Presenter/Projector `?stage=`
tab showing the sermon with a "SERMON" label, the in-page split-screen
preview showing the same content, and switching back to songs afterward
(picking a song from SONGS, or the dedicated SWITCH BACK TO SONGS link,
both flip `currentContentType` back to `'song'` without disturbing
whatever song/section was showing before the sermon started). Also
reran the pre-existing song-hosting/projector/Bible Playwright checks
afterward to confirm nothing about this regressed them.

**Deliberately not built:** a verse *range* on one slide ("Psalm 23:1-6" —
the lookup only matches a single verse); drag-to-reorder slides (up/down
arrow buttons instead, mirroring the pre-service setlist builder's own
reorder controls); and a live draft/slide-count indicator anywhere
outside the Sermons screen itself, for the same reason a live Song
Requests badge wasn't built either (see that section in
`claude/monetization-plan.md`). Sharing a sermon with someone else
*was* a deliberate gap here as of the first sermons shipment above — see
the next section for why and how it got built.

## Shipped: sermon sharing [2026-09-04]

Jared's ask: "how about we add a share button so pastors can share their
sermons to whomever they want to as long as they have access to it? Like
they wanna share it to a friend pastor or to the AVP team who would be
operating it on their behalf." Asked how the recipient should be found
(Account-ID-based vs. a shareable link); Jared's answer covered both:
"give them a search bar where they can search for Account ID, name,
church, and add an option to share the link as well." Both shipped,
together, as literally asked for.

The real design decision this raised wasn't the UI (a search box plus a
"COPY LINK" button, both on a **SHARE** panel now on every sermon card
on the Sermons screen) — it was where the searchable name/church data
comes from. `users/{uid}`'s read rule is deliberately Admin-only-or-self
(see `firestore.rules`), specifically so role/churchId/isBetaTester and
the rest of a profile stay private between a person and Admins. Rather
than loosen that rule so any signed-in person can read any OTHER
person's full profile just to support a name search, a new, narrower
`directory/{uid}` collection was added instead — publicly readable, but
holding only `{ uid, displayName, churchName }`, kept in sync by
`saveProfile()` itself. It exposes nothing that isn't already visible
elsewhere in the app to anyone in a room (a display name and church name
already show on every chat message and song-request submission) — it
just makes that same "public-within-the-app" pair searchable, without
opening up anything monetization-related. This was a "make the
reasonable, more conservative call and keep going, state it plainly"
pass rather than a blocking question, consistent with how the KJV-only
Bible-translation decision and the "no images in sermon slides v1"
decision above were both handled without stopping to ask first.

The link option works the same way conceptually: `?sermon=<id>` opens a
small read-only preview (the sermon is already publicly readable by id,
same as songs/rooms) plus, once signed in, an **ADD TO MY SERMONS**
button — which is the recipient adding *themselves*, not the sermon's
owner adding them. `firestore.rules`' `sermons/{sermonId}` update rule
got one narrow addition to allow that: any signed-in person may patch a
sermon they don't own if `sharedWithUids` is the only field touched —
title/speaker/slides stay creator-only regardless. See
`src/data/interface.md`'s new "Sermon sharing" section for the full
data-shape/access-model writeup, including the specific low-stakes gap
this narrow update-rule carve-out accepts (documented there rather than
repeated here).

A shared sermon shows up on the recipient's own Sermons screen under a
new **Shared With You** section, AND in their own Host Session **SERMON**
picker alongside their own sermons — the actual point of the feature,
per Jared's own examples ("a friend pastor," "the AVP team who would be
operating it on their behalf"): being able to see it isn't enough, they
need to be able to *present* it from their own hosted session, which
`presentSermon()` already supported for free (it patches the room by id
with no ownership check, same as picking any song from the shared
hymnal). Removing access works the same in both directions: the owner
can remove anyone from a sermon's share panel, and a recipient can remove
it from their own "Shared With You" list — same update-rule carve-out
either way.

Verified end-to-end via headless Playwright in demo mode, simulating
three separate accounts in one browser (demo mode's signed-in identity
lives in localStorage, so this needed swapping the stored local uid
between runs rather than the multi-tab trick used for live-session
tests): a sermon owner searching for and sharing with a second account by
name, that share appearing and later being removable from both sides; a
third account opening a copied share link, previewing it, adding it to
their own account, then actually hosting a session and presenting that
shared sermon from their own Host Session SERMON picker (confirming the
slide content appears correctly for a non-owner); and removing access
both ways (recipient self-removal via the link-flow rule, owner-side
removal via the search-flow rule) independently of each other.

## Stage-view follow-up fixes [2026-09-04]

After the Presenter/Projector view (above) shipped and Jared actually
tried it live, he reported two problems and one new request, verbatim:
"text does not autofit the page. It's too big. Also, there are still
blank spaces at the sides in PC version," followed by "add an option for
the share screen itself to be full screen and not show the head bar or
any interface." The side-gutter part turned out to be simple (the stage
view was documented as full-bleed but `main` still had its normal
centered-column `max-width` cap from the desktop-sizing pass above — a
one-line CSS override fixed it), and the new fullscreen/hide-chrome
button was a straightforward addition. The "text too big" part looked
simple too, and wasn't — testing it properly surfaced three real bugs
that a quick visual check would have missed entirely, worth documenting
so the same mistakes aren't repeated:

1. **A crash on every stage-view page load.** The presentation-mode
   toggle's state lives in a `let stagePresentationMode` declared next to
   the code that uses it, which is normal — except `watchRoom()`'s
   callback fires *synchronously* on subscribe (see
   `local-data-layer.js` / `firestore-data-layer.js`), so the very first
   `render()` call can happen as early as the `?stage=` deep-link
   handling near the top of `app.js`, long before a `let` declared much
   later in that same top-level scope would have run. Every `?stage=`
   link — i.e. the feature itself — crashed with a temporal-dead-zone
   error before anything rendered. Fixed by moving the flag's declaration
   up near the other early `let`s. This is exactly the kind of bug a
   glance at the rendered page can't catch (it's a synchronous throw
   during initial load, not a visual glitch), which is the main reason
   this follow-up got a full Playwright pass instead of a build-and-eyeball
   check.
2. **`fitStageLines()`'s JS override had zero effect.** It set
   `.style.fontSize` on the `.stage-lines` wrapper div, but the visible
   text lives in the `p` children inside it, which had their own
   `font-size:clamp(...)` rule directly. A more specific CSS rule on a
   descendant always wins over whatever a parent's inline style would
   otherwise hand down through plain inheritance, so every "shrink the
   text" attempt was silently a no-op — confirmed by tracing the fit
   loop's own measurements, which showed the *identical* content height
   at every font size it tried. This alone was almost certainly the
   whole of what Jared saw. Fixed by moving the clamp() into a
   `--stage-font-size` custom property that the `p` rule reads and the
   JS can actually override (custom properties inherit *and* can be
   overridden inline, plain `font-size` values can't be both).
3. **The container the JS measures against was never a fixed size.**
   `.stage-view` set its own `min-height:100vh`, independent of how much
   room its flex parent (`main`, inside `.app`'s `min-height:100dvh` flex
   column) actually had left after the real header above it and footer
   below it — so the page was always taller than one screen by roughly
   the header+footer height, no matter how small the text got. Fixing
   this needed two things together: a hard `height:100dvh` cap on `.app`
   (scoped to a `stage-page` class Jared's `render()` dispatcher now
   toggles on `<body>`, since capping it globally would clip content on
   every *other* screen, which is meant to scroll normally), and
   `min-height:0` on every flex link in the chain down to `.stage-view`
   (flex items default to "never shrink below your own content's natural
   size," which would otherwise defeat the cap one layer down). Once
   `.stage-view`'s height was a real, fixed number instead of a floor
   that grows to fit whatever's inside it, `fitStageLines()`'s budget
   calculation could switch from `window.innerHeight` (which ignores the
   real header/footer chrome around the view) to the container's own
   `clientHeight` — accurate at any screen size instead of a rough guess.
   The always-irrelevant "iWorship — your congregation's..." promo
   footer is now also hidden specifically on this view (not just in
   presentation mode), both because it has no reason to be on an actual
   projector display and because on a short/narrow screen it was real
   vertical budget the slide text needed.

None of these three would show up from a build succeeding or even a
quick screenshot at one screen size — (1) only throws on a fresh page
load via the `?stage=` link specifically, not on every render; (2) and
(3) both *looked* like they were working (font-size was being set,
budgets were being computed) while silently doing nothing or computing
against the wrong number. Caught by actually driving the feature with
Playwright across several real screen sizes (a 1366×768 and a 1024×768
laptop, a 1920×1080 and 2560×1440 desktop monitor, and a 375×700 phone)
and checking the *rendered* content's bounding box against the
container's, not just whether the build compiled or a single screenshot
looked plausible. All five now fit with no clipping and no page-level
scroll; the phone case additionally got a `@media (max-width: 480px)`
padding reduction on `.stage-view` (less edge padding = more width
before a verse line has to wrap = less vertical pressure) since it's
already the tightest case this has to handle — the view is really meant
for a second monitor/projector, per the original design comment, not a
phone screen.

## Musician chart view [2026-09-04]

Jared's ask, verbatim: "what if when the presenter is sharing, the
musicians that join can see the chords as well instead of just the
lyrics." Two design questions came up before writing any code, both
resolved with Jared directly rather than guessed at, since either one
would have meant redoing the feature if guessed wrong: who gets to see
chords (reusing the existing Play Mode role gate vs. open to anyone who
joins vs. a host-controlled per-session toggle — chose reusing Play
Mode's existing gate, so chord access stays consistent with the
monetization plan already drawn around it and needed zero new logic),
and where they see it (a separate musician view/link vs. folding chords
into the plain participant join screen — chose a separate link).

That second choice shaped the whole design: this is deliberately **not**
another mode of the Presenter/Projector view. That view shows one big
slide at a time, chrome-less and full-bleed, because it's meant to be
read from across a room on a second monitor. A musician following along
wants close to the opposite — the **whole song at once** (so they can see
what's coming, not just whatever's currently on screen), on their own
device/stand, normal scrollable app chrome, and their own transpose
control, independent of everyone else's. So it reuses the ordinary in-app
page shell rather than the stage view's full-bleed treatment, and reuses
Play Mode's existing `.lyric-sheet.play`/`.chord`/`renderChordLyricLine()`
styling and transpose logic wholesale (`renderDetail()`, phase-4-adjacent)
instead of inventing new chord-rendering code — just live-synced to
whichever song the host has up (via the same `resolveRoomContent()`/
`watchRoom()` plumbing as every other session view), with the section the
host is actually on highlighted (a `chart-active-section`/"NOW" badge)
rather than isolated to just that one section.

Mechanically: a new `?chart=<code>` deep link, parallel to `?stage=<code>`
but meant to be handed to OTHER people (band members, on their own
devices) rather than kept host-only — so it copies the `?sermon=<id>`
link's shape (a plain URL param, a "COPY LINK"-style button on the host
screen: "COPY MUSICIAN CHART LINK") rather than `?stage=`'s `window.open()`
pattern (which is for the host's own second screen). Whoever opens the
link gets gated by their **own** account's `canUsePlayMode()` — signed
out or without an eligible role sees a plain "sign in" / "musician access
needed" message instead of the chart. No `firestore.rules` change needed:
chord data was already sitting in the public-readable song doc before
this feature existed (Play Mode has always been a UI-only gate, per
`src/data/interface.md`), so this only decides who the UI *shows* it to.

A structural bug this surfaced, worth its own note since it's unrelated
to chords specifically: testing the new "COPY MUSICIAN CHART LINK" button
meant, for the first time, actually driving a page load that resumes
straight into a hosted session (`sessionStorage`-based "reopen the tab
while hosting" resume, not a fresh session-setup flow) through Playwright
rather than by hand — and that resume crashed on load with a temporal-
dead-zone error, same bug class as the `stagePresentationMode` crash from
the stage-view follow-up section above (`presenterSplitView`, read by
`renderSessionHost()`, was declared too late in the file relative to
`watchRoom()`'s callback firing synchronously). That's a real, previously
-uncaught "any host who refreshes their browser tab mid-service" crash,
nothing to do with today's feature. Rather than relocate one more `let`
(the third time this exact bug shape had been hit) the whole startup-
routing block — `?stage=`/`?chart=`/`?sermon=` deep-link parsing plus the
plain session-resume-on-load logic — was moved from near the top of the
file to the very end, immediately before the final `render()` call, so
any synchronous first render it triggers always finds every closure
variable in the file already initialized, regardless of which view it's
routing into or what future view gets added. `stagePresentationMode` and
`chartTransposeSteps` moved back to their natural declaration sites next
to where they're used, now that the workaround that put them up top isn't
needed anymore.

Verified via headless Playwright in demo mode: not-signed-in and signed-
in-without-role both show the correct gate message with zero console
errors (confirming the TDZ crash is actually fixed, not just moved);
signed in as a `musician` role renders the full song (all sections, not
just the current one), chords correctly parsed and displayed, the host's
current section highlighted with the "NOW" badge, and the local transpose
control changing the displayed key/chords without touching the room's
synced state; a sermon-content room shows a no-chords note plus the
current slide instead of erroring; a room with no song picked yet shows
the same "waiting for the host" message the stage view uses. Separately
confirmed the host-resume crash fix by seeding `sessionStorage` to
simulate a host reloading mid-session and finding the host screen (with
the new button) up with zero page errors — and re-ran the stage-view
regression suite from the section above to confirm moving the startup
block didn't disturb it.

## Host session recovery + ad hoc Bible verse presenting [2026-09-04]

Jared, same day, in one message: *"let's say a host accidentally closes
his app or web. he cannot enter the same room again. I can't [find] the
option to do so. Or let's say he's moving to a different device. Please
make the current active rooms still accessible for the host. Also, add an
ability for the host to present bible verses at will."* Two independent
features, both shipped together.

**Host session recovery.** Before this, the only way to *become* a room's
host was `submitCreateRoom()` — create-only, no re-entry path. A host who
closed their tab (or just wanted to keep hosting from their phone instead
of their laptop) had no way back in, even though the room itself stayed
live for everyone else already connected to it. "My Sessions" already
listed every room a signed-in person had ever hosted (`watchHostRooms()`,
scoped by `hostUid`) for cleanup purposes; it just had no way to *use* one
of those rooms again, only end it. Each room card there now gets a
RESUME HOSTING button (CONTINUE HOSTING, if this same browser tab happens
to already be the live host of it) that calls a new `resumeAsHost(code)`,
which mirrors `submitCreateRoom()`'s post-creation setup (the
`cv:activeRoomCode`/`cv:isHost` session-storage keys, `watchActiveRoom()`/
`watchChat()`, the sermon watches) rather than inventing a second setup
path that could drift out of sync with it. No password prompt, unlike
joining as a *viewer* (`attemptJoin()`) — Firestore's room-update rule is
already keyed on `resource.data.hostUid == request.auth.uid`, and
`watchHostRooms()` only ever surfaces rooms this uid owns in the first
place, so anything reachable from that list is already provably theirs to
resume. No `firestore.rules` change needed, same reasoning as the
chord-chart feature above (room updates have no field allowlist).

**Ad hoc Bible verse presenting.** Distinct from a verse baked into a
prepared sermon slide (the existing "Bible Verse Slide" template) — this
is a third, independent content source a host can switch to mid-service
without having built anything ahead of time, exactly like switching
between SONGS and SERMON. Deliberately its own `currentContentType:
'verse'` (with `currentVerseRef`/`currentVerseText` on the room doc)
rather than disguising it as a one-slide fake sermon, which would have
incorrectly pulled in sermon-specific host UI (the sermon picker,
multi-slide nav, "SWITCH BACK TO SONGS" wording already fits fine, so
that part IS reused). The host's new BIBLE tab is a single reference
input ("e.g. John 3:16") with a live preview as they type, reusing the
exact same single-verse KJV lookup (`parseVerseRef()`) the sermon
slide editor's verse template already uses — so it inherits that same
v1 limitation (one verse at a time, not a range like "Psalm 23:1-6").
`resolveRoomContent()` gained a `verse` branch and a `verseAsSlide()`
helper that wraps a presented verse as the same `{template, heading,
verseText, verseRef}` shape sermon slides already use, so all four
existing render paths (host, congregant, stage/projector, and the
musician chord-chart view from the section above) render it through the
same `sermonSlideLineParts()`/`sermonLinesAsCardHtml()`/
`sermonLinesAsStageHtml()` helpers already built for sermon slides — one
line of code per view, not a parallel rendering system. The musician
chart view shows a "no chords apply" note plus the verse text rather than
erroring, same treatment as an active sermon.

A real bug surfaced along the way, unrelated to either feature directly:
`loadKjvData()`'s one-time dynamic import only ever re-rendered the
screen once it resolved if `state.view === 'bible'` — fine when the only
place that triggered a *lazy* load was the Bible screen itself, but the
new host BIBLE picker can be opened (and can trigger the load) from
`session-host`, which would then sit stuck on "Loading the KJV text…"
forever once the import actually finished, since nothing told it to
repaint. Generalized into a small `viewNeedsKjvRerender()` helper
(`'bible'`, `'sermon-edit'`, or `'session-host'` while the verse picker is
open) so any current or future Bible-dependent screen gets repainted
once the import resolves, not just the one screen that happened to exist
when this was first built.

Verified via headless Playwright in demo mode: presenting a verse from
the host screen shows the correct live preview, updates the NOW SHOWING
label, and displays correctly in the congregant view, the stage/projector
split-screen preview, and the musician chart view (chords note suppressed
correctly) — all with zero page errors; resuming as host from a
simulated "new device" (no `sessionStorage` keys, a fresh profile/user
seed, same `hostUid`) via My Sessions lands cleanly back on the host
screen with the room's live state (including an in-progress presented
verse) intact; and a regression pass confirmed the still-live-in-this-tab
case (LIVE NOW badge, CONTINUE HOSTING wording), ending a resumed session
cleans up correctly, and the Bible screen itself still renders fine after
the `loadKjvData()` change.

## Host/presenter controls reorganization, round 1 [2026-09-04]

Jared, same day, after the two features above stacked one more picker
(BIBLE) and one more toolbar button (COPY MUSICIAN CHART LINK) onto an
already busy screen: *"the presenter controls screen is a little
crowded. please help me organize it so it's more user friendly. Get best
practices from existing apps."* By this point `renderSessionHost()` was
stacking, top to bottom: three full-size `.btn` content-source buttons
(SONGS/SERMON/BIBLE), three more full-size buttons for presenter tools
(PROJECTOR VIEW/SPLIT SCREEN/COPY MUSICIAN CHART LINK), the setlist, the
live slide preview and its nav, an always-expanded chat card, and the End
Session button — six large (56px-min-height) buttons alone before
reaching anything else.

Two patterns borrowed from existing presenter/meeting-control software,
per Jared's ask to look at what other apps do:

- **A segmented control for the content-source picker.** SONGS/SERMON/
  BIBLE are a single three-way, mutually-exclusive choice — exactly what
  the standard iOS/Android "segmented control" tab pattern (and
  ProPresenter's own source-picker) exists for — not three peer actions,
  which is what three separate full-size buttons visually implied. Now
  one connected pill (`.content-segmented`/`.segment-btn` in styles.css)
  with short, fixed labels; whatever's actually live moved out into its
  own one-line status readout below ("Now showing: **Amazing Grace**")
  instead of being crammed into the segment label itself, which used to
  grow/wrap with a long song or sermon title.
- **A compact icon toolbar for secondary tools.** PROJECTOR VIEW, SPLIT
  SCREEN, CHAT (see below), and COPY MUSICIAN CHART LINK are all
  less-frequently-tapped utilities, not the primary "what am I presenting
  right now" controls — the same relationship Zoom/Meet-style control
  bars capture by giving core actions full buttons and tucking secondary
  ones into small icon-first buttons. `.presenter-toolbar`/`.icon-tool-btn`
  replace three (now four) full-size buttons with small square icon+label
  buttons in one row, active-state highlighted the same way the segmented
  control is. Two new icons (`monitor`, `chat`) were added to
  `src/content/icons.js` for this; SPLIT SCREEN now reuses the existing
  `expand`/`compress` icon pair (already in the icon set for the stage
  fullscreen toggle) rather than adding a third new one.

A third change, not from external research but from simply counting what
was on the screen: **chat is now collapsed by default** on the host
screen only (`hostChatOpen`, a new host-only state flag — `<CHAT>` in the
toolbar toggles it, and the collapsed state shows a dashed, tappable
"CHAT IS HIDDEN — TAP TO SHOW" placeholder instead of nothing). Most of a
live service, a host is watching the room and the current slide, not the
chat thread — the always-expanded chat card was one of the single
largest contributors to the crowding. `renderChatSection()` itself (still
shared with the congregant view, which is unaffected by any of this) was
left untouched; only whether `renderSessionHost()` includes its output
changed. (Round 2 below moved chat again, from an inline collapsible card
to a floating widget — this round's toolbar CHAT toggle no longer
exists.)

Everything that was already there works exactly as before — same
button ids, same click handlers, same picker panels, same split-screen
behavior — only the container markup/styling and the chat card's
default visibility changed. No data model or `firestore.rules` change of
any kind.

Verified via headless Playwright in demo mode, at both a desktop
(1280px) and a mobile (390px) viewport: the segmented control and the
four-item icon toolbar each fit on one row at both widths with no
horizontal scroll; switching between SONGS/SERMON/BIBLE opens the right
picker and updates the "Now showing" line; toggling SPLIT SCREEN and
CHAT both work from the new toolbar and their active/inactive icon
states render correctly; section/slide PREVIOUS-NEXT navigation still
works; and a full regression pass confirmed the ad hoc verse-presenting
flow, the sermon picker, and resuming a session from "My Sessions" (both
from the two sections above) all still work unchanged on the
reorganized screen — zero console errors throughout.

## Host/presenter controls reorganization, round 2 [2026-09-04]

Round 1 fixed the button clutter, but Jared came back with two more
notes on the same screen, close together: *"what if we put the 'now
live' section as a non moving part somewhere and the chat can just be a
floating chat at the bottom right. I still find it hard to navigate
because there's a lot of scrolling"*, then, mid-turn, *"as for the room
code, can you put it in a toggle somewhere where it's not always
visible. just a toggle where the host can view it and hide it."* Three
independent changes, all about the same underlying complaint — too much
has to be scrolled past or is visually competing for attention on one
screen — rather than one feature:

- **A fixed "Now Live" bar** (`renderNowLiveBar()`, `.now-live-bar` —
  `position:fixed; bottom:0`) replaced the old inline "what's currently
  showing" status line and its section/slide PREV-NEXT buttons, which
  used to live wherever they fell in normal document flow (scrolling out
  of view the moment the host scrolled down to the setlist or picker).
  It mirrors the "mini player" bar pattern from music apps (Spotify,
  Apple Music, YouTube's sticky bottom player): a collapsed one-line
  status ("Amazing Grace &middot; Section 2 of 4") plus PREV/NEXT is
  always pinned to the bottom of the viewport regardless of scroll
  position; a chevron expands it upward in place (`hostNowLiveExpanded`)
  to reveal the full lyric/verse/sermon-point text and section-jump
  chips, without ever leaving the fixed position or covering the chat
  FAB (see below). This consolidated what used to be three separate
  PREV/NEXT button pairs (one for songs, one for sermon slides, verses
  never had nav) into one pair, dispatching to `changeSermonSlide()` or
  `changeSection()` depending on content type.
- **A floating chat widget** replaced round 1's inline collapsible chat
  card entirely: a circular FAB bottom-right (`.chat-fab`, the
  Intercom/Crisp/Drift-style "chat widget" pattern used all over the
  web) toggles a small overlay panel (`.chat-floating-panel`) rather
  than taking up a slot in the normal page flow at all.
  `renderChatSection()` itself is completely unchanged — still shared
  verbatim with the congregant view's inline chat — only where its
  output gets mounted changed. Both the FAB and the panel position
  themselves relative to the Now Live bar's actual rendered height via a
  `--now-live-bar-h` CSS custom property, set by JS
  (`document.documentElement.style.setProperty('--now-live-bar-h',
  bar.offsetHeight + 'px')`) right after each render, the same pattern
  `fitStageLines()` already used for the stage view's font sizing — the
  bar's height varies with content length and expand state, so a fixed
  pixel offset would either leave a gap or get covered.
- **A room-code visibility toggle** (`hostCodeVisible`, a new host-only
  state flag) hides the big `.code-display` block by default behind a
  SHOW ROOM CODE / HIDE ROOM CODE button, reusing the existing
  `.switch-account` link styling rather than adding a new button style.
  The code only matters once, at the start of a service (getting
  congregants connected) — leaving it permanently on-screen afterward
  was pure vertical space a host doesn't need for the rest of the
  service.

Verified via headless Playwright in demo mode: the Now Live bar stays
fixed to the viewport bottom through scrolling and renders the correct
status/nav for all three content types (song/sermon/verse), its expand
toggle reveals the full slide text and section-jump chips and collapses
back; the chat FAB opens/closes the floating panel and existing chat
send/receive still works unchanged; the room-code toggle shows/hides the
code block and defaults to hidden; and a regression pass re-confirmed
verse presenting, the sermon picker, split-screen, and session-resume
all still work with the reorganized layout — zero console errors.

## Setlist-disappearing bug fix + split-screen stage nav [2026-09-04]

Two more notes from Jared after living with the reorganized screen for a
bit. First, a real bug, verbatim: *"I noticed that when I switch from
songs to sermon to bible, when I go back to songs, my setlist is gone."*
Second, a request while testing split screen with a sermon actually
presenting on the projector side: *"also during split screen, I also
need the controls to be present below the presenter screen."*

**The setlist bug.** `renderSetlistSection(room)` (the setlist card) is
gated on `!isSermon && !isVerse`, both derived from
`room.currentContentType` via `resolveRoomContent()` — not from which
picker tab/panel happens to be locally open. Tapping the SONGS segmented-
control tab, though, only ever toggled the local `hostPickerOpen`
picker-panel-open flag — it never actually told the room to switch
`currentContentType` back to `'song'`. So the sequence Jared described
(present a sermon — which switches content type to `'sermon'`
immediately, per the existing tap-to-present design — then tap BIBLE,
which only opens the verse picker and changes nothing, then tap SONGS,
expecting to be "back") left `room.currentContentType` stuck on
`'sermon'` the whole time, and the setlist stayed hidden even though the
host believed tapping SONGS had taken them back. `chooseSong()` (picking
an actual song) and the dedicated `backToSongsBtn`/"SWITCH BACK TO
SONGS" link both already did the right thing here; the segmented-control
tab itself was the one path that didn't. Fixed by having the SONGS tab's
click handler call `updateRoom(code, { currentContentType:'song' })`
whenever a sermon or verse was actually live at the moment of the click
— mirroring `backToSongsBtn`'s exact action — in addition to its existing
picker-toggle behavior. (At the time this shipped, SERMON and BIBLE's
tab handlers deliberately did *not* get the same treatment, so that
SONGS alone was the reliably "safe" way back — Jared asked for the other
two tabs to behave the same way shortly after, which the very next
section below covers.)

**Split-screen stage nav.** In split view, the live stage preview
(`.host-stage-col`) sits in its own sticky column next to the controls;
Jared wanted PREV/NEXT reachable without looking away from that preview
back toward the fixed Now Live bar or the controls column. A small
`renderStageNavRow()` renders a compact duplicate PREV/NEXT pair
(reusing `.now-live-nav-btn`'s existing button styling, new
`.stage-nav-row` wrapper for layout only) directly under
`renderStageSlide()`'s output inside `.host-stage-col`, wired to the same
`changeSermonSlide()`/`changeSection()` dispatch as the Now Live bar's
own buttons — same action, different ids, so both rows coexist in the
DOM without collision. Verse content still never shows nav, matching the
Now Live bar's existing behavior (a presented verse has no "next" to
advance to). Confirmed via Playwright that this row sits well clear of
the fixed Now Live bar even scrolled to the very bottom of a long page
(the outer split-view wrapper's existing `padding-bottom:
calc(var(--now-live-bar-h) + 24px)` already left enough room for it,
since the stage nav row lives inside that same padded wrapper).

Verified via headless Playwright in demo mode: presenting a sermon, then
opening BIBLE (no change), then tapping SONGS confirms `currentContentType`
reverts to `'song'` and the setlist reappears immediately, with the
SONGS segment showing active; the same check repeated for a presented
verse instead of a sermon; confirmed merely tapping into SERMON/BIBLE
(without presenting anything) leaves `currentContentType` untouched, so
the fix doesn't over-correct; split screen's new stage-nav row renders
only when there's actually a song section or sermon slide to navigate,
its PREV/NEXT buttons correctly advance `currentSectionIndex`/
`currentSlideIndex`, and toggling split screen on/off still works
cleanly; zero console errors throughout.

## Symmetric tab resume (SONGS/SERMON/BIBLE) [2026-09-04]

Right after the setlist-bug fix above, Jared asked a sharp follow-up
question: does that fix also mean whatever sermon slide or Bible verse
was previously showing comes back when toggling between all three tabs,
not just songs? The honest answer at the time was no — only SONGS had
been made to resume; SERMON and BIBLE still just opened their picker
panel with no memory of what had been live before, and re-presenting
meant either losing the sermon's slide position (`presentSermon()`
always resets `currentSlideIndex` to 0) or retyping/re-confirming a
verse that hadn't actually changed. Jared's reply: *"then make it happen
that way so we can lessen repetitive work."*

All three content-source tabs are now symmetric. Tapping SERMON, if a
sermon was already live at some point in this room and the room isn't
already showing it, calls `updateRoom(code, { currentContentType:
'sermon' })` — deliberately **not** touching `currentSermonId` or
`currentSlideIndex`, so whatever slide was last showing comes back
exactly, not slide one. Tapping BIBLE does the same for `'verse'` when
`currentVerseText` is already set — a verse has no position to lose, but
this saves the extra retype-and-re-confirm step. Both mirror exactly how
the SONGS tab already resumed a song and section without disturbing
either. The condition guards on whether that content type has ever been
presented in this room at all (`room.currentSermonId`/
`room.currentVerseText` present) — a brand-new room where nobody has
built or presented anything yet still just opens the empty picker, same
as before; there's nothing to resume. And **only** the tab tap resumes —
actually picking a different item from a picker (`presentSermon()`,
`presentVerse()`, `chooseSong()`) still starts that item fresh from the
top, exactly as before; this only removes the false start of merely
switching tabs.

Verified via headless Playwright in demo mode: presented a sermon,
advanced 3 slides in, switched to BIBLE and presented a verse, switched
to SONGS (resumes the song/section as already covered above), then
tapped SERMON alone (no picker selection) and confirmed the room jumped
straight back to the exact slide index it had been on, not slide 0;
separately confirmed tapping BIBLE alone afterward brought back the same
verse reference; and confirmed a freshly created room where no sermon or
verse had ever been presented still just opens the plain picker when its
tab is tapped, with `currentContentType` unchanged, so the resume logic
never fires when there's genuinely nothing to resume. Also re-ran the
prior regression suite (split-screen toggle and its stage-nav row, the
floating chat FAB, the room-code toggle) to confirm none of it was
disturbed — zero console errors throughout.

## Six-feature batch: ranges, recent lists, next-up, split persistence, keyboard nav, gated chords [2026-09-04]

Jared, after seeing the tab-resume fix, asked what else was worth adding to
this screen; six ideas came out of that discussion (Bible verse ranges, a
recently-shown quick list, a next-up preview, split screen surviving a
reload, keyboard shortcuts on the projector, and chords on the projector)
and his answer was *"add all of those"* — with one explicit constraint on
the last one: *"only make them visible on the musician viewers not on
public viewers cause that would lose the purpose of gating that
function."* All six shipped together.

**Bible verse ranges.** `parseVerseRef()` (shared by the sermon-slide
verse template's LOOK UP FROM KJV button and the host's ad hoc BIBLE tab)
now accepts "Book Chapter:Verse-Verse" (e.g. "Psalms 23:1-6") alongside
the original single-verse form, closing the oldest documented gap in the
KJV/verse-presenting work. A requested range that runs past the end of a
short chapter is clamped to however many verses actually exist rather
than failing outright. The returned shape grew a `refLabel` (the
canonical "Book Chapter:Verse" or "...:Verse-Verse" string, replacing
each call site's own hand-assembly from `book`/`chapter`/`verse`) and,
for a multi-verse range, `text` becomes each verse's cleaned text
prefixed with its own verse number and joined into one running passage —
deliberately still a single string with no schema change, since
`verseAsSlide()`/the 'verse' sermon template already render `verseText`
as one continuous paragraph. A single-verse ref's `text` is completely
unchanged (no number prefix), so no existing saved sermon slide's
displayed text shifts.

**"Recently shown" quick lists.** Each content type keeps its own short,
most-recent-first, deduped history directly on the room doc
(`recentSongIds`/`recentSermonIds`/`recentVerses`, capped at 5 via a
shared `pushRecentId()`/`pushRecentVerse()` pair) updated inside
`chooseSong()`/`presentSermon()`/`presentVerse()` themselves — it rides
along with every other room-doc field these already write, no new watch
or `firestore.rules` entry needed. Each picker (`renderHostPicker()`,
`renderSermonPicker()`, `renderVersePicker()`) shows a "RECENTLY SHOWN"
chip row above its normal list/input when there's history, reusing the
existing `.section-jump` chip styling from the Now Live bar's jump rows.
The song and sermon chips reuse the exact same `data-pick-id`/
`data-present-sermon` attributes their full lists already use, so the
existing global click-wiring picks them up for free; verse chips needed
one small new handler (`data-recent-verse-idx`) since re-presenting a
past verse means replaying its saved `{ref, text}` pair, not looking
anything up again. Tapping a chip always presents that item fresh from
the top (same as picking it from the full list) — this is a distinct,
complementary feature to the tab-resume fix from the previous section,
not a replacement for it: tab-resume brings back exactly the ONE most
recent item of a type without restarting it; these chips reach further
back into history, at the cost of restarting whatever's tapped.

**Next-up preview.** A small `nextItemLabel()` helper returns the label
of whatever song section or sermon slide comes after the current one (or
`null` at the end, or always for a presented verse, which never has a
"next"). Shown as an "Up next: **…**" line in the Now Live bar's expanded
body and underneath split screen's stage-nav row (see the section
above) — the two places a host is already looking to advance from.

**Split screen surviving a reload.** `presenterSplitView` now
initializes from `localStorage` (`safeGet`/`safeSet`, the existing small
device-local-preference pattern) instead of always starting `false`, and
the SPLIT SCREEN toggle button writes its new value back on every click.
Deliberately a per-DEVICE preference rather than a room-synced field —
two hosts resuming the same room from different devices might reasonably
want different layouts — so this doesn't touch the room doc at all.

**Keyboard shortcuts on the projector.** Space/Right Arrow advances,
Left Arrow goes back, from the `?stage=` projector tab itself — the same
`changeSermonSlide()`/`changeSection()` actions the host's own controls
screen already calls, reachable now from the display tab too, for a host
running everything from one laptop connected straight to a TV with no
separate control device. The real design question here wasn't the key
bindings, it was WHO gets to drive it: `?stage=` is deliberately openable
by anyone with the room code (see the original Presenter/Projector
section above), so a keydown listener with no gate at all would let any
congregant who stumbled onto the link on their own phone hijack what's
showing for the whole room. The gate is `room.hostUid === state.user.uid`
— whichever account is actually signed in on THAT SPECIFIC tab has to be
the room's own host — checked fresh on every keypress via a single
always-on `document.addEventListener('keydown', ...)` (mirroring the
existing resize-listener pattern) rather than wired per-render. This is
also why it's account-based rather than reusing `state.isHost`: the
`?stage=` route sets `state.isHost = false` unconditionally on load (see
the startup-routing block), precisely because that flag was never meant
to mean anything on this read-only route — hostUid ownership is the
actual, pre-existing trust check (the same one `resumeAsHost()`/RESUME
HOSTING already relies on), just applied here for the first time to a
route other than the controls screen itself.

**Chords on the projector, gated to musician viewers only.** This is the
one Jared added an explicit constraint to, and it shaped the whole
implementation: `renderStageSlide()` (shared by the actual `?stage=`
route AND the host's own split-screen preview column — there is no
separate "musician copy" of either) took a new `showChords` parameter,
and BOTH call sites pass `canUsePlayMode()` — the exact same Play Mode
role check that already gates chords in `renderDetail()` and the
`?chart=` musician chart view — evaluated fresh for whichever account is
signed in on THAT viewer's own tab. This is a completely different axis
from the keyboard gate above: ownership (host or not) decides who can
ADVANCE the projector; role (`canUsePlayMode()`) decides who SEES chords
on it, and the two are independent — a musician who isn't the host sees
chords but still can't drive it from the keyboard; a host with no
musician role can drive it but sees lyrics-only, same as before this
shipped. Since chord data was already public-readable in the song doc
before this feature existed (Play Mode has always been a UI-only gate),
this needed no `firestore.rules` change, same reasoning as the `?chart=`
view's own gate.

Verified via headless Playwright in demo mode: a range lookup
("Psalms 23:1-6") shows the correct combined refLabel/multi-verse text
and presents correctly, while a single-verse lookup's saved text still
carries no number prefix; each picker's recently-shown chips appear only
once something of that type has actually been presented, tapping a chip
re-presents the right item, and a song/sermon/verse never-presented-yet
room shows no chip row at all; the Now Live bar and split screen's
stage-nav row both show/hide "Up next" correctly across mid-song and
last-section states; toggling split screen on and reloading the page
confirms it stays on; and four separate simulated accounts against one
`?stage=` link confirmed the two independent gates matrix correctly —
the room's own host account can advance via keyboard and sees lyrics-only
(no musician role); a different signed-in account cannot advance; a
musician account that is NOT the host sees chords but still cannot
advance; and a signed-out viewer sees lyrics-only with no crash — zero
console errors across all of it, and a final regression pass confirmed
the setlist-resume fix, floating chat, and room-code toggle from earlier
sections were undisturbed.

## Split-screen duplicate label fix, and co-hosting [2026-09-05]

**Duplicate "Verse 1 / Verse 1" label in split screen.** Jared: "the
shared screen has redundant labels such as 'verse 1' 'verse 1'."
Reproduced with Playwright: it only showed up in split-screen view, with
the Now Live bar also expanded — `.host-stage-col` (the always-visible
live preview column) already renders the current section/slide's label
and full lyrics, and expanding the Now Live bar on top of that rendered
the exact same label-plus-lyrics block a second time, right below it.
Fixed by giving `renderNowLiveBar()` a `hideSlidePreview` param (passed
as `presenterSplitView`) that suppresses just the duplicate `.slide-card`
preview in all three content branches (sermon/verse/song) while split
view is on; the section/slide quick-jump row and "Up next" hint stay,
since the stage column doesn't offer either of those. The normal
(non-split) single-column view is untouched — there's no stage column to
fall back on there, so the Now Live bar's own preview is still the only
place to see it.

**Co-hosting.** Jared: "add a new feature where hosts can assign other
hosts to their session and grant controls to one person at a time." Two
new room-doc fields: `coHostUids` (an owner-managed roster of other
signed-in accounts) and `controllerUid` (which ONE of `{hostUid,
...coHostUids}` is actually allowed to drive the presentation right now
— defaults to `hostUid` on `createRoom()`). Two new helpers,
`isRoomOwner(room)` and `canControlRoom(room)`, are the single source of
truth for gating: every content-mutating function (`chooseSong`,
`presentSermon`, `presentVerse`, `changeSection`/`changeSermonSlide`,
`jumpToSection`/`jumpToSermonSlide`, `patchSetlist`, the three tab-resume
handlers, even the projector's keyboard-shortcut listener) now checks
`canControlRoom()` before writing, and the Now Live bar / split-screen
stage-nav row's Prev/Next buttons are disabled (not just blocked) when
the viewer doesn't currently hold control — a co-host without control
sees a clear "Watch-only for now" banner naming who does, rather than
silently-failing buttons. Ending the session outright stays
owner-only (`isRoomOwner()`), separate from `canControlRoom()` — a
co-host handed the mic for a moment shouldn't be able to shut down the
whole service.

A new "HOSTS" button in the presenter toolbar (owner-only) opens Manage
Hosts, which mirrors the sermon-sharing panel's pattern almost exactly
(same `state.directory` search by Account ID/name/church, same
`setlist-items` list markup) — search and ADD a co-host, GIVE CONTROL to
any one of them (or TAKE BACK CONTROL as the owner), or remove a
co-host outright (which reverts control to the owner if they currently
held it). A co-host reaches the room at all via a new "Co-Hosting"
section on "My Sessions" (a new `watchCoHostRooms()` — an
`array-contains` query on `coHostUids`, mirroring `watchHostRooms()`
exactly) and `joinAsCoHost()` (mirrors `resumeAsHost()`, setting a new
`state.isCoHost` flag instead of `state.isHost` — persisted the same way,
via a `cv:isCoHost` sessionStorage key, so a page refresh mid-co-hosting
resumes correctly).

**`firestore.rules` change required for this to work outside demo mode.**
The room update rule was `hostUid == request.auth.uid` only — a
co-host's writes would have been rejected outright. It's now: the owner
can still do anything, OR the current `controllerUid` can update the
room PROVIDED the write doesn't touch `hostUid`, `coHostUids`, or
`controllerUid` itself — so a controlling co-host can drive the
presentation but can't self-promote to owner, edit the roster, or
refuse to hand control back. This needs deploying (`firebase deploy
--only firestore:rules`) before co-hosting will work against the real
backend; demo mode needed no equivalent change since it has no security
rules to begin with.

Verified via Playwright simulating two separate local accounts sharing
one browser's localStorage (swapping which uid is "signed in," since
demo mode has no real multi-device backend): a co-host with no control
sees the watch-only banner and disabled Prev/Next, and an attempt to
change the current song is silently rejected (content unchanged); the
owner's Manage Hosts panel correctly lists both the owner (HAS CONTROL)
and the co-host (GIVE CONTROL); clicking GIVE CONTROL flips
`controllerUid`; and the co-host, reloaded, then sees no banner and can
successfully change the current song. A regression pass (sermon
presenting, tab-resume, verse ranges, projector keyboard nav for the
owner) confirmed nothing from the six-feature batch broke.

## Launch-flash fix (manifest background_color) [2026-09-05]

Jared, from his phone: "I hate it that when the app loads in my phone, it
still shows very quickly a browser screen loading." The app already had a
carefully-inlined `#splash` div in `index.html` (matches the icon's own
`#6B1220` background, paints before app.js/styles.css even finish
fetching) — but `vite.config.js`'s PWA manifest had
`background_color: '#F6EFDD'` (the app's cream page background), while
`theme_color` and the inlined splash were both `#6B1220` (dark maroon).
`background_color` is what the OS paints as the native splash the INSTANT
a home-screen launch starts, before any HTML has loaded — so the actual
sequence was: OS's own cream screen → in-app's correctly-colored maroon
splash → the app itself. That mismatch was the "browser screen loading"
flash. Fixed by matching `background_color` to `#6B1220` so the two
splashes are visually identical (no perceptible handoff at all), plus
three new iOS meta tags (`apple-mobile-web-app-capable`,
`apple-mobile-web-app-status-bar-style: black-translucent`,
`apple-mobile-web-app-title`) so a home-screen launch on iOS is treated
as a true standalone app from the first frame rather than briefly
showing Safari's own tab chrome. Caveat worth knowing: a phone that
already has the app on its home screen from before this fix may have
cached the old manifest values at install time — removing and re-adding
the home-screen icon picks up the corrected color; a fresh install
doesn't need that.

## Chords off the shared screen, tab-highlight fix, setlist-default-view fix, easier Bible verse picker [2026-09-06]

Four related fixes/features shipped together in v12, all on the Host Session screen and the shared `?stage=` projector route.

**Chords removed from the shared screen entirely.** Jared: "I told you to remove the chords from the share screen, it should only be an option when musicians join the session on their phones." The previous design (shipped 2026-09-04) gated chords on `renderStageSlide()` per-VIEWER, via `canUsePlayMode()` — a congregant saw lyrics-only, but a musician/editor account opening the same `?stage=` URL, or the host's own split-screen preview, saw chords too. Jared's newer instruction supersedes that: chords must never appear on the shared/projector screen or the host's split-screen preview, for anyone, regardless of role. `renderStageSlide()` no longer takes a `showChords` parameter at all — song lines always render as plain lyrics (`escapeHtml(l.replace(/\[[^\]]*\]/g,''))`), and the footer no longer appends "Key of X". Both call sites (`renderSessionProjector()`'s `?stage=` route, and the split-screen host stage column in `renderSessionHost()`) were updated to stop passing `canUsePlayMode()`. The only place chords still appear is the separate `?chart=` musician-chart route (`renderSessionChart()`), which a musician opens on their own phone — unchanged, and confirmed still working via Playwright (inline chord letters render correctly there).

This also resolved the "verse 1"/"Verse 1" redundant-label screenshot Jared sent from the actual `?stage=` route (a different location from the split-screen duplicate fixed 2026-09-05): the working hypothesis was a bracket-wrapped label like `[Verse 1]` embedded in a lyric line rendering as an oversized "chord" via `renderChordLyricLine()`. Since chords are now never rendered there at all, and the lyric-only path already strips any `[...]` bracket content from every line, this class of artifact can no longer occur regardless of the underlying song data.

**Tab highlight now moves independently of what's actually live.** Jared: "when I toggle here, the red highlight does not move from one option to another unless [you] put it live." The SONGS/SERMON/BIBLE segmented control used to derive its highlighted tab straight from the room's actual live content type (`content.type`) — tapping SERMON when no sermon had ever been made live yet correctly opened the sermon picker, but the highlight stayed on SONGS since nothing had actually gone live. A new purely-local `hostContentTab` state ('song'/'sermon'/'verse') now drives the highlight and which panel (picker vs. setlist) shows, decoupled from the room's real live content type (`isSermon`/`isVerse`, still used correctly for the Now Live bar, stage nav row, and PREV/NEXT). It moves the instant a tab is tapped, defaults from the room's real content the first time a session is entered, and resets on a fresh resume/create/co-host-join. Verified via Playwright: tapping SERMON then BIBLE then back to SONGS moves the highlight each time, confirmed via `.segment-btn.active`.

**Setlist now always defaults to the plain view.** Jared: "when I toggle between songs, sermon, and bible verse, and go back to songs, my set list is gone, the setlist should be the default view, just leave the edit setlist whenever a song needs to be added." `hostSetlistEditorOpen` is a persistent flag toggled only by the EDIT SETLIST/DONE EDITING button, and nothing previously reset it when switching tabs — landing back on SONGS after SERMON/BIBLE could leave a host stuck looking at the reorder/remove/add-search editing UI instead of the plain tap-to-jump list. All three tab handlers (`pickSongBtn`/`pickSermonBtn`/`pickVerseBtn`) plus `backToSongsBtn` now reset `hostSetlistEditorOpen = false`, so returning to SONGS always lands on the default view. Verified via Playwright: toggled EDIT SETLIST to DONE EDITING, switched to SERMON, switched back to SONGS — button read "EDIT SETLIST" again (default view), not stuck on "DONE EDITING".

**Easier Bible verse picker.** Jared: "for the bible verse view in the live session, give it an easier interface apart from searching, give it an option to pick from a set of books, chapters, and verses. and when searching, give suggestions." The "Present a Bible Verse" panel now has a BROWSE/SEARCH toggle (`hostVerseMode`):
- BROWSE (the new default) reuses the standalone Bible tab's own book -> chapter -> verse drill-down logic (`bibleChapterNumbers()`/`bibleVerseEntries()`, same OT/NT book grouping) via its own local position state (`hostVerseBrowseBook`/`hostVerseBrowseChapter`, deliberately separate from the Bible tab's own `bibleBook`/`bibleChapter` so browsing here never disturbs where a host left off on the actual Bible screen). Tapping a verse presents it immediately — no typing needed at all.
- SEARCH is the original typed-reference field, now also showing live suggestions once there's text that isn't yet a full valid reference: matching book names ("DID YOU MEAN...", tap to autocomplete "Book " into the field) and, once there's enough text, matching verse TEXT via `bibleSearch()` (the same whole-Bible substring search the standalone Bible tab's own search box already uses) under "MATCHING VERSES" — tap a result to present that verse directly.

All four fixes verified end-to-end via Playwright in demo mode: tab-highlight movement, setlist-view reset, chords absent from `?stage=` (both flat and split-screen) while still present on `?chart=`, and the Bible verse browse-to-present and search-suggestion-to-present flows.

**Deploy**: `iworship-deploy-v12.zip`. No `firestore.rules` change this round — this round only touches host-side UI/render logic in `src/app.js` (plus one new `.link-btn` CSS rule in `src/styles.css` for the Bible-browse breadcrumb).

## Preview/Go Live workflow + fade transition on the live view [2026-09-06]

Two related changes to how a host actually presents content, shipped in v13.

**Fade transition.** Jared: "can we add a quick fade transition to any change in the live view?" `renderStageSlide()` (shared by the `?stage=` projector screen and the split-screen host stage mirror) now tracks the previous call's content identity (`lastStageSignature` — which song/section, which sermon/slide, which verse) and only applies a `.stage-fade-in` CSS animation class when it actually differs from last time. This matters because both views fully rebuild their markup on every render, including ones that have nothing to do with the slide itself (a chat message, a co-host change, a toggle) — animating unconditionally would replay the fade constantly instead of only on real content changes. Verified via Playwright: the fade class is present immediately after a content change and absent after an unrelated re-render (toggling the chat FAB).

**Preview / Go Live.** Jared: "I think it's better if we have a preview and a live view, then if the host is good with the preview, he can [click] on go live (phone and tablet) or double enter in the keyboard for PC." Before this, every host action — picking a song, tapping PREV/NEXT, jumping to a section — wrote straight to the room doc and was instantly visible to the whole congregation. Now:
- `hostPreview` is a purely LOCAL (never synced to Firestore) draft of what the host is staging — null means "nothing staged, preview mirrors live"; once set it holds exactly the fields (`songId`/`sectionIndex`, `sermonId`/`slideIndex`, or `verseRef`/`verseText`) that would need to go live. Deliberately per-device: only whoever holds control is driving anyway, and their in-progress draft shouldn't leak to anyone else's screen (including another co-host's) before they publish it.
- `chooseSong()`/`presentSermon()`/`presentVerse()` (picking something new) and `changeSection()`/`jumpToSection()`/`changeSermonSlide()`/`jumpToSermonSlide()` (nav/jump) all now stage into `hostPreview` instead of writing to the room. First touch of nav on a fresh session clones from whatever's actually live (`ensurePreviewFromLive()`), so "next section" continues from where the congregation already is rather than from nothing.
- `goLive()` is the one and only place that publishes — writes the staged fields to the room doc (and moves "recently shown" bookkeeping here from the old chooseSong/presentSermon/presentVerse, since it should reflect what's actually been shown, not merely staged and maybe abandoned).
- The fixed bottom bar (`renderNowLiveBar()`, renamed `renderPreviewBar()`) is now the staging surface: its status text, PREV/NEXT, expanded slide-card, and jump chips all read/write the preview, not the room. A small "PREVIEW" tag appears next to the status text whenever the preview has actually diverged from live (`previewIsDirty()`), and a read-only "LIVE NOW: ..." line inside the expanded body always shows the true live content so a host has a one-glance answer without needing split screen. A GO LIVE button (bolt icon) sits at the end of the row, enabled only when there's something to publish.
- Split-screen's stage-mirror column is now a pure read-only LIVE display (just a "● LIVE" badge + `renderStageSlide(content)`, `content` = true live) — its old duplicate PREV/NEXT row (`renderStageNavRow()`) was removed entirely, since advancing now happens through the preview bar.
- The SONGS/SERMON/BIBLE tabs no longer write to the room at all when tapped — "resume" now happens for free, since `hostPreview` is a single persistent draft untouched by simply looking at a different tab.
- The **projector view's own space/arrow-key shortcut is deliberately unchanged** — it still advances the LIVE room directly (`advanceLiveSection()`/`advanceLiveSermonSlide()`, the pre-2026-09-06 bodies of `changeSection()`/`changeSermonSlide()`, kept under new names) rather than staging into `hostPreview`. A person standing at the projector/second monitor pressing a clicker wants an immediate change on the screen in front of them, not a draft they'd then have to find a GO LIVE button for.
- **Double-Enter on a keyboard** (within 600ms, skipped inside any input/textarea/contenteditable so it never hijacks ordinary typing) calls `goLive()` — the desktop equivalent of tapping GO LIVE on phone/tablet.

Known limitation, accepted for this v1 given `hostPreview` is local-only: if control gets handed to someone else mid-draft, the new controller's own preview state doesn't know about the outgoing host's abandoned draft (there was never anything to know — it was local to their browser). This only matters in the narrow co-hosting case of a handoff happening while someone had something staged but not yet live; it doesn't affect solo hosting at all.

Verified end-to-end via Playwright: picking a song stages it (PREVIEW tag, GO LIVE enabled) without touching the live/split-screen mirror; PREV/NEXT on the preview bar advances the draft only; GO LIVE (button and double-Enter both) publishes and the LIVE mirror updates with the fade transition; an unrelated re-render never re-triggers the fade; the projector's own spacebar shortcut still advances live content immediately, bypassing preview entirely, exactly as before.

**Deploy**: `iworship-deploy-v13.zip`. No `firestore.rules` change this round — hostPreview is local-only and never touches the room doc's shape.

## Media/AVP: images, video, slideshows, and live embeds [2026-09-06]

Jared, mid-turn while another feature was in progress: "is there a way for us to upload a presentation (canva, pptx, google slides embed)? an image? a video? in the app? so it can be used as a one-stop-shop AVP tool as well. Get best practices from easyworship and other apps like this." Researched EasyWorship/ProPresenter conventions first (folder-organized media libraries; full-screen images/video as backgrounds or standalone slides; ProPresenter 21+'s native PowerPoint import with editable/flattened-to-images/legacy-objects modes) before building anything, then asked three clarifying questions. Jared's answers: all four media types for v1 (image/video/slideshow/embed, not a smaller v1); direct upload to Firebase Storage for video, not a link/embed-only approach; and for presentations, **both** an image-slideshow import (from an externally-exported deck) and a live iframe embed (Google Slides/Canva/PowerPoint share link), host's choice per item.

**A fourth `currentContentType`, mirroring Sermons almost exactly.** `media/{mediaId}` is a new Firestore collection with the same ownership shape as `sermons/{sermonId}` (`createdByUid`, `sharedWithUids`, wide-open `allow read: if true`, creator-only write with a narrow "only `sharedWithUids`/`updatedAt` changed" carve-out for the share/unshare flow) — same reasoning, same low-stakes gap, documented once in `src/data/interface.md` rather than repeated per collection. A `MediaItem` has one of four `type`s: `'image'` (single file, full-bleed letterboxed on stage), `'video'` (single file, synced playback across viewers via a room-doc clock), `'slideshow'` (an ordered array of `{url, storagePath}` image slides — navigated exactly like a sermon's slide array, reusing that same PREV/NEXT/jump machinery), and `'embed'` (a pasted public share/embed link rendered in a sandboxed `<iframe>`, with slide navigation happening *inside* that iframe using the provider's own controls — a deliberate, disclosed simplification rather than attempting to parse/control a live Canva or Google Slides embed from outside it). A new **Media Library** screen (upload/manage/share/delete, reachable both from the landing page and from the Host Session screen's new fourth **MEDIA** tab) mirrors the Sermons screen's own layout and share-panel pattern almost verbatim.

**Why not server-side `.pptx`/Canva-file parsing.** Would need a paid conversion API this free-tier app doesn't have access to. Slideshow import instead asks the host to export their deck as images externally first (Canva/Google Slides/PowerPoint all support "export as images" or "export as PDF" natively), then upload every page at once, in order — reusing the exact same slide-array infrastructure sermons already use, no new concept.

**Video sync: a room-doc clock, not continuous position writes.** Three new room-doc fields — `mediaPlaying` (bool), `mediaClockStartedAtMs` (a plain client `Date.now()` epoch, deliberately **not** `serverTimestamp()`), `mediaClockBaseOffsetSec` (the video-seconds position that timestamp corresponds to) — let every viewer compute `currentMediaClockSeconds(room)` locally and nudge their own `<video>` element to match (only correcting drift greater than 0.75s, to avoid visible jank from constant micro-seeks). `serverTimestamp()` was deliberately avoided here: it resolves asynchronously and reads back `null` for one round-trip after every write, which would leave every viewer's sync function with nothing to compute against for a moment on every single play/pause/restart — a plain client timestamp has no such gap. **PLAY/PAUSE/RESTART are direct live writes**, not staged through `hostPreview` like everything else on the Host Session screen — the same reasoning `advanceLiveSection()`/`advanceLiveSermonSlide()` established for the projector's own keyboard shortcut during the Preview/Go-Live work above: once a video is already live, transport controls the thing that's already showing, not "what to show next."

**Browser autoplay policy.** The `<video>` element always renders `muted` — every browser allows a muted element to autoplay with no user gesture. A separate UNMUTE overlay button is the only way to get sound, since unmuting specifically requires a real click/tap on that exact tab/device; there is no way around this from JS, so the app doesn't try to auto-unmute anything. Congregants' own phones get **no** video sync at all, by design — `renderSessionView()`'s media branch shows a native `<video controls>` for fully opt-in playback on their own device/connection, deliberately not kept in lockstep with the stage screen (keeping N phones' independently varying network conditions in sync isn't attempted; see "Deliberately not built" below).

**Firebase Storage requires Blaze billing — a real, disclosed blocker.** Confirmed via web research: Cloud Storage for Firebase has required the Blaze (pay-as-you-go) plan for every project since September 2024, no Spark-plan exception — a project still on the free plan gets a 402/403 on any Storage call. This is the same shape of blocker this project has hit before for Cloud Functions (`functions/` scaffold) and Firestore TTL, and it's handled the same way: **built fully ready, disclosed everywhere it matters, not gated behind a half-finished feature**. The disclosure lives in three places: `storage.rules`'s own header comment (with the specific policy-change date), `src/data/interface.md`'s "Media/AVP" section, and inline comments in `firestore-data-layer.js` right where `uploadMediaFile()`/`getStorage()` are defined. Until Jared enables Blaze billing on the Firebase project and deploys `storage.rules` (`firebase deploy --only storage`, alongside the usual `firestore.rules` re-paste for the new `media` collection), uploads against the real backend will fail — demo mode is unaffected, since it never touches Firebase Storage at all (see below).

**Demo-mode uploads: `URL.createObjectURL`, not a real backend.** `uploadMediaFile()` in `local-data-layer.js` wraps whichever file was picked in a blob: URL and resolves instantly (a single `onProgress(100)` call, no real upload to simulate) — enough to fully exercise every screen (the add-panel's upload-progress text, the library list, presenting/going live, split-screen rendering, video transport, slideshow navigation) without a real Firebase project. The one honest caveat, called out in that file's own comments: a blob: URL only resolves inside the browser **document** that created it, so it does not survive a page reload, and it cannot be loaded from a separate tab/window (a real `?stage=`/congregant link opened as its own tab) either — this is a demo-mode-only limitation of `URL.createObjectURL` itself, not a bug in the feature; the real Firestore/Storage layer serves ordinary `https://` download URLs, which work everywhere, including across tabs and after a reload.

**Deliberately not built:** a `?media=<id>` shareable deep-link screen (unlike Sermons' `?sermon=<id>`) — sharing a media item today only works via the in-app directory search on the Media Library's SHARE panel, same UI as Sermons, just no separate public preview link yet; a rename/edit UI for an already-uploaded item (its title is set once, at upload time); any attempt to control a live embed's slide position from outside the iframe (Google Slides/Canva/PowerPoint don't expose that to an embedding page, so navigation inside an 'embed' item is left entirely to the provider's own on-screen controls); keeping a congregant's own video playback in sync with the stage (see above).

**CSS.** New rules in `styles.css`: `.stage-media-frame` (full-bleed, `position:absolute; inset:0`, letterboxed black background) breaks the image/video/embed out of `.stage-view`'s/`.host-stage-col`'s normal padded, centered-text layout, the same way EasyWorship/ProPresenter treat media full-screen rather than as a lyric slide; `.stage-media-img`/`.stage-media-video` (`object-fit:contain`, fills the frame); `.stage-media-embed` (fills the frame, no border); `.stage-media-unmute` (a bottom-right circular overlay button). Two knock-on fixes this required: `.host-stage-col`'s `position:sticky` (needed as the containing block for the new absolutely-positioned frame) is dropped to `position:static` in this app's existing narrow-viewport media query, which would have broken that containing-block relationship and let a live image/video blow up to cover the whole viewport instead of staying inside the split-screen card — changed to `position:relative` there instead, which lays out identically to `:static` but still anchors the frame correctly; and `.host-stage-col` needed an explicit `min-height` added, since an absolutely-positioned frame contributes no height of its own to a non-fixed-height parent (unlike an ordinary song/sermon slide's in-flow paragraphs), and would otherwise have collapsed the whole split-screen stage column down to just its LIVE badge's height whenever a media item was live.

Verified end-to-end via headless Playwright in demo mode (25 checks, all passing): uploading a fake image, a fake video, and a two-image slideshow, plus saving an embed link with its provider auto-detected from the URL's hostname — all four appearing correctly in the Media Library list; the MEDIA tab's picker listing all four; presenting each type via Preview + GO LIVE and confirming the split-screen stage column renders the right element (`<img>`, `<video muted>`, `<iframe>`) with the right source; the slideshow's NEXT/PREV correctly staging then publishing a different slide and disabling NEXT at the last slide; the video's PLAY/PAUSE and RESTART buttons (inside the Now Live bar's expanded body) correctly toggling `room.mediaPlaying`/resetting `room.mediaClockBaseOffsetSec`; the projector's keyboard shortcut correctly toggling a live video's play/pause on Space and advancing a live slideshow's slide index on Right Arrow (functional checks against the room doc, not pixel checks — see the demo-mode blob-URL caveat above for why); and the Media Library's SHARE panel opening and DELETE's confirm-then-cancel-then-confirm flow actually removing exactly the right item and leaving the other three untouched.

**Deploy**: `iworship-deploy-v14.zip`. **Needs both a `firestore.rules` re-paste** (the new `media` collection) **and, before real uploads will work, Blaze billing enabled on the Firebase project plus a `storage.rules` deploy** (`firebase deploy --only storage`, or paste `storage.rules`'s contents into Firebase console → Storage → Rules the same way `firestore.rules` gets pasted) — see this section's "Firebase Storage requires Blaze billing" note above.

## Media Folders + in-session upload [2026-09-06]

Jared's ask, verbatim: "so with media uploading, there should be an option to upload during and within the session. also, these media should be available outside the session like a separate folder or section where AVPs can prep upload beforehand and manage it by folders." Two independent additions on top of the Media/AVP feature above, both mirroring existing patterns rather than inventing new ones.

**In-session upload.** The Host Session screen's MEDIA picker (`renderMediaPicker()`) gained a "+ UPLOAD NEW" toggle sitting beside the existing "+ OPEN MEDIA LIBRARY" button. Toggling it reveals the same IMAGE/VIDEO/SLIDESHOW/EMBED-LINK segmented row and upload panel the Media Library screen already uses — extracted into a shared `renderMediaAddSegmentedRow()` helper so both screens render and wire up identically rather than maintaining two copies. An item uploaded this way is folder-unaware (`folderId: null`, i.e. unfiled) — it lands directly in the picker's own list and the Media Library's root "unfiled" section, ready to present immediately without a detour through the library screen at all. This is the "upload during and within the session" half of the request.

**Media Library folders.** The separate Media Library screen (the AVP-prep side of the request) gained a new `mediaFolders/{folderId}` Firestore collection — `{ id, name, createdByUid, createdAt, updatedAt }` — and every `MediaItem` gained an optional `folderId` (absent/`null` = unfiled). The root view now shows a folder grid (name, item count, RENAME/DELETE) above the unfiled items and the existing Shared-With-You section; opening a folder shows a breadcrumb plus just that folder's items. Every media item's card gained a MOVE action (a chip row of "Unfiled" plus every other folder) alongside the existing SHARE/DELETE, so an AVP can reorganize items after the fact without re-uploading. `mediaFolders/{folderId}`'s rules mirror `media/{mediaId}`'s ownership shape (wide-open read, creator-only create/update/delete) minus a `sharedWithUids` carve-out — folders aren't shared item-by-item the way a sermon or media item is.

**Deleting a folder never deletes its media.** `deleteMediaFolder()` un-files every item that pointed at it first (`folderId` → `null`, so they fall back to the root "unfiled" section) and only then deletes the folder doc itself — reorganizing a folder structure can never lose an uploaded file as a side effect, matching the same "make the safer call, state it plainly" precedent as the Media/AVP work's other design decisions.

Verified via headless Playwright in demo mode (22 new checks): creating a folder, uploading directly into it, moving an item between folders and back to unfiled, renaming a folder, deleting an empty folder, and deleting a non-empty folder (confirming its items land in "unfiled" rather than disappearing) all passed; the in-session upload toggle on the Host Session MEDIA tab uploads a fresh item that immediately appears in the picker's list, unfiled. The pre-existing 25-check Media/AVP Playwright suite was re-run as regression and still passed in full.

**Deploy**: `iworship-deploy-v15.zip`. **Needs a `firestore.rules` re-paste** (the new `mediaFolders` collection) — no Storage/Blaze change at all, since folders are pure Firestore metadata and don't touch Storage.

## Preview-bar keyboard shortcuts, double-click-to-go-live, and a clear controls indicator [2026-09-07]

Jared, looking at a screenshot of the fixed bottom preview bar: "can you add keyboard shortcuts here, like arrow keys, and add an option to do double click as well for going live aside from double enter. and also, add a clear indicator that that window below is the controls." Three small, related additions to the Host Session screen's preview/staging bar (`renderPreviewBar()`), shipped together as v16.

**Arrow-key staging navigation — deliberately distinct from the projector's existing arrow shortcut.** This app already had one arrow-key shortcut, built during the six-feature batch on 2026-09-04: Space/Left/Right on the `?stage=` projector tab, which advances the LIVE room directly (`advanceLiveSection()`/`advanceLiveSermonSlide()`) — appropriate there, since someone standing at a projector wants an immediate change on the screen in front of them, not a draft. The new shortcut lives on the Host Session screen itself, scoped to `state.view === 'session-host'`, and deliberately dispatches to the STAGING functions instead — `changeSermonSlide()`/`changeMediaSlide()`/`changeSection()`, exactly what the PREV/NEXT buttons on the preview bar already call. ArrowLeft/ArrowRight nudge the staged preview under `canControlRoom(room)`, reading `resolvePreviewContent(room)` to figure out which nav function applies (song section, sermon slide, or media slide) — a keyboard-driven host can shape the draft before GO LIVE, same as clicking PREV/NEXT, never bypassing staging the way the projector's shortcut intentionally does. The listener skips INPUT/TEXTAREA/contentEditable targets so arrow keys keep moving a text cursor normally inside any form field (verse search, folder rename, etc.) instead of being hijacked.

**Double-click to go live.** A `dblclick` listener on the preview bar's status row (`#nowLiveStatusRow`, not the whole bar) calls `goLive()` when the preview is dirty — an alternative to the existing double-Enter shortcut for anyone who'd rather click than reach for the keyboard, per Jared's ask ("aside from double enter"). Scoped to the status row specifically, deliberately excluding the PREV/NEXT/GO LIVE buttons themselves, so a quick double-click on either of those still only fires their own single-click handlers rather than also triggering an unwanted publish. The row's `title` attribute now reads "Double-click to go live (or double-tap Enter on a keyboard)" as a small on-hover hint.

**"Your Controls" label.** A persistent, always-visible label — "Your Controls — staged here, not yet visible to the room" — sits at the top of the preview bar regardless of its collapsed/expanded state, addressing Jared's third ask directly: nothing before this told a first-time host that the fixed bottom bar was an interactive control surface rather than a passive status readout.

Verified via a dedicated Playwright suite (7 checks, all passing): the "Your Controls" label is present on the rendered bar; ArrowRight advances the staged preview (confirmed via the status text) without writing to the live room; ArrowLeft moves it back; GO LIVE is enabled once the preview is dirty; double-clicking the status row publishes the staged section to the room; and — the regression case that matters most for a keyboard shortcut living on a page full of text inputs — ArrowLeft pressed while focus is inside a real text field still moves that field's text cursor rather than being hijacked by the new listener. The pre-existing Media Folders (22 checks) and Media/AVP (25 checks) Playwright suites were both re-run as regression and passed in full.

**Deploy**: `iworship-deploy-v16.zip`. No `firestore.rules` change — this is pure on-screen host-controls behavior, no data-model or rules change of any kind.

## Preview panel alongside the live panel in split screen [2026-09-08]

Jared, looking at split screen: "can you add a preview screen alongside the live view?" Since the 2026-09-06 Preview/Go-Live rework, split screen's stage column had been a single, pure read-only mirror of what's actually LIVE (`resolveRoomContent()`) — the staged draft (`hostPreview`) was only visible as a line of status text (and a small `.slide-card`, deliberately suppressed while split view is on) inside the fixed preview bar below. That meant a host running split screen lost visual access to what they'd actually staged beyond one line of text — a real gap the Preview/Go-Live rework left behind without fully reconciling, since the split-screen column predates that rework and was never revisited for it.

**The fix mirrors ProPresenter/vMix's own Program/Preview convention directly**: `.host-split-grid` now renders three columns instead of two — controls, a new **PREVIEW** column (`previewContent`/`resolvePreviewContent(room)`, a gold "PREVIEW" badge), and the existing **LIVE** column (`content`/`resolveRoomContent(room)`, the wine "LIVE" badge, unchanged). Both stage columns share the existing `renderStageSlide()` function and the `.host-stage-col` CSS class, so every content type (song/sermon/verse/media, including full-bleed image/video/embed) renders identically in both — no new rendering path. Neither column gets a nav row of its own; advancing the draft is still only ever done through the preview bar's PREV/NEXT + GO LIVE, exactly as the 2026-09-06 rework set up — this feature only adds a second, bigger window onto the exact same `hostPreview` state that already existed, it doesn't change how staging works.

**A real bug this surfaced and fixed along the way**: `renderStageSlide()`'s fade-in tracking (added 2026-09-06 — "can we add a quick fade transition to any change in the live view?") used a single module-level `lastStageSignature` scalar, correctly assuming only one call happened per render (either the projector route, or the single split-screen stage column). Calling it twice per render now — once for PREVIEW, once for LIVE — would have had the second call's signature-check clobber the first's, either replaying a fade that shouldn't fire or suppressing one that should, depending on call order and whether the two streams happened to match. Fixed by keying the tracking on a small `trackKey` parameter (`'preview'`/`'live'`/`'projector'`) into a `lastStageSignatures` map instead of a bare scalar — each of the three call sites (projector route, split-screen PREVIEW column, split-screen LIVE column) now tracks its own content-identity history independently, so a change in one column's content never affects whether the other column's fade class fires.

**Layout**: `.host-split-grid` moved from a 2-column (`1fr 1fr`) to a 3-column (`1.1fr 1fr 1fr`) grid — controls get slightly more room since they carry the setlist/picker. Both stage columns share `.host-stage-col`, so the existing narrow-viewport (≤900px) stacking rule (which already targeted that class) picked up the new PREVIEW column for free, with no additional CSS needed: both stage columns get `order:-1` (tied, so DOM order breaks the tie — PREVIEW above LIVE) above the controls column at the default `order:0`, giving PREVIEW → LIVE → CONTROLS top to bottom on a phone, same "stacks instead of splits" pattern the rest of split screen already follows.

Verified via a dedicated Playwright suite (10 checks, all passing): split screen renders exactly two `.host-stage-col` elements (PREVIEW + LIVE) with the correct badges; staging a nav change (arrow-key shortcut) updates only the PREVIEW column's content and does not touch the live room; GO LIVE then makes the LIVE column's content match PREVIEW exactly; advancing PREVIEW again afterward does NOT replay a fade-in on the LIVE column (confirming the `trackKey` fix actually isolates the two streams); and the narrow-viewport (375px) stack still renders both stage columns. The pre-existing Media/AVP (25 checks), Media Folders (22 checks), and preview-bar keyboard-shortcuts (7 checks) Playwright suites were all re-run as regression and passed in full.

**Deploy**: `iworship-deploy-v17.zip`. No `firestore.rules` change — this is pure on-screen split-screen layout, no data-model or rules change of any kind.

## Presentation builder: free-canvas sermon slides [2026-09-08]

Jared, mid-turn while the preview-panel work above was in flight, asked two things at once: where the sermon slide templates actually live, and a complaint that led straight into a much bigger ask -- "I don't like the formatting as everything is in center. Make it an actual presentation builder." Given how much scope that last sentence could mean (anywhere from "just fix the centering" to "a full drag-and-drop deck editor"), the honest move was to ask rather than guess wrong and redo it: presented as three options -- (1) alignment controls plus a real visual editor, keeping the existing three-template data model; (2) a full ground-up rebuild with free-position/resizable text and image blocks and custom backgrounds; (3) alignment-only, no editor changes. Jared answered **"1 and 2"** -- the full combined scope, not the smaller alignment fix.

**New data model, replacing the three fixed templates entirely.** A `Slide` is now `{ id, background, blocks }` instead of `{ template, heading, subtitle, points, verseRef, verseText }`. `background` is one of five on-brand color presets (Ivory/Wine/Pine/Gold/Black, matching the app's existing palette variables) or a custom uploaded image. `blocks` is an ordered array of independently positioned/sized text or image blocks -- `{ id, type, x, y, w, h, ...}` where `x`/`y`/`w`/`h` are all PERCENTAGES of the slide, not pixels. That percentage choice is what makes one block's position/size render identically -- same relative layout -- whether it ends up small inside a `.slide-card` thumbnail in the preview bar, mid-drag inside the editor's own canvas, or full-bleed on a projector: no separate per-context layout math anywhere, the exact same markup just scales. A text block carries `text`/`align`('left'/'center'/'right')/`size`('sm'/'md'/'lg'/'xl')/`bold`; an image block carries `url`/`storagePath`, reusing `uploadMediaFile()` -- the same upload helper Media/AVP already built -- for both block images and custom slide backgrounds, so no new Storage path or `storage.rules` change was needed for either.

**The editor.** Each slide in the Sermons screen now renders as an interactive canvas (`renderSlideCanvasEditable()`) with a toolbar underneath: ADD HEADING/ADD TEXT/ADD BULLET LIST/ADD IMAGE/ADD VERSE (KJV), each dropping a sensibly-positioned starting block onto the canvas (freely movable afterward -- these are just starting points, not locked layouts) and auto-selecting it. Clicking a block selects it (a wine outline plus a resize handle in the corner) and opens a properties panel below the canvas -- a text block gets a textarea plus align/size/bold controls, an image block gets upload/replace/remove. Dragging a block or its resize handle updates position/size live as percentages of the canvas. ADD VERSE (KJV) reuses the exact same `parseVerseRef()`/KJV lookup the old verse template used, just inserting a pre-styled verse-quote block plus a reference-line block instead of filling in fixed form fields. A background row under the toolbar offers the five color swatches plus a custom-image upload.

**Interaction implementation, worth documenting for whoever touches this next.** All of it is one delegated `pointerdown` listener attached ONCE to the stable `#sermonSlidesList` container (guarded by a `holder.dataset.wired` flag), since `renderSermonSlidesList()` only ever replaces that element's `innerHTML`, never the element itself -- the same "attach once, re-query fresh elements after any re-render" pattern this app already uses elsewhere. Selecting a block re-renders once (to paint its outline/handle), then re-queries fresh DOM references before a drag begins; the drag/resize itself mutates the block's data AND its element's inline `style.left/top/width/height` directly on every `pointermove`, deliberately WITHOUT calling `renderSermonSlidesList()` mid-drag, since a full re-render would tear down the very element being dragged. Typing into the properties panel's textarea is the same story for a different reason: a naive full re-render on every keystroke would destroy and recreate that textarea, throwing away focus and cursor position, so `patchSelectedBlockText()` instead updates the block's data AND directly patches just the matching canvas block's `innerHTML`, leaving the textarea itself untouched.

**A real, pre-existing bug this surfaced and fixed.** Building that textarea-focus-preservation logic above led straight into finding a genuine latent bug, unrelated to but exposed by it: `loadKjvData()` (the one-time async import of the ~4.3MB KJV text, kicked off automatically the moment the Sermons editor opens, so ADD VERSE (KJV) never needs to wait) calls a full `render()` once it resolves, if `viewNeedsKjvRerender()` says the current view needs one -- and `'sermon-edit'` had been on that list since the very first ad hoc Bible-verse-presenting work on 2026-09-04. It didn't need to be: nothing `renderSermonSlidesList()` paints actually depends on `kjvData` being ready (the verse-insert-row's own markup never reads it; only its INSERT button's click handler does, and that already has its own "still loading, try again" toast-and-retry for the rare case someone clicks before the import resolves). Left listed, though, that KJV-finished rerender could fire at literally any moment shortly after opening the editor -- exactly the window someone is likely to already be typing a sermon's title or a slide's heading -- and a full `renderSermonEdit()` firing out from under them would silently eat whatever they'd just typed, no error, no warning. Caught because a fresh Playwright check for "does the properties-panel textarea keep focus while typing" failed intermittently depending on timing, not because it was something anyone had reported yet. Fixed by simply removing `'sermon-edit'` from `viewNeedsKjvRerender()`'s condition -- Bible and the host's ad hoc verse picker both still need it (they genuinely paint KJV-dependent content: book/chapter listings, search results), so those stayed.

**Legacy migration -- no separate upgrade step.** Any sermon saved before this shipped has slides in the old `{template, heading, subtitle, points, verseRef, verseText}` shape, no `.blocks` array at all. `isBlocksSlide(sl)` (`Array.isArray(sl.blocks)`) tells old and new apart at every render site (stage/projector, split-screen, congregant slide-card, chart view, the preview bar's expanded slide-card) -- an old slide keeps rendering exactly as it always has, dead-centered, via the original unmodified renderer functions, right up until it's opened in the Sermons editor, at which point `migrateLegacySlideToBlocks()` converts it to blocks on the spot (a title slide's heading/subtitle become a heading block plus a body block; a point slide's heading/bullets become a heading block plus one bulleted-text block; a verse slide's heading/verse/reference become up to three stacked blocks) so it's immediately draggable/editable in the new builder. There's no dedicated "upgrade this sermon" button or migration script -- opening an old sermon and hitting SAVE, even with zero edits, is the upgrade, the same way any file format migrates the moment it's resaved. The original centered renderer functions (`sermonSlideLineParts()`/`sermonLinesAsCardHtml()`/`sermonLinesAsStageHtml()`) are untouched and still permanently in use by the unrelated ad hoc Bible-verse-presenting feature (`verseAsSlide()`), which was never sermon-slide-shaped to begin with and is deliberately outside this rework's scope.

**Deliberately not built**, consistent with keeping this a focused slide builder rather than a second, unrelated general design tool: any color picker beyond the five on-brand background presets; pixel-level snapping or alignment guides while dragging a block; layering/z-order control when blocks overlap (later blocks in a slide's array simply paint on top); and multi-block selection (one block selected at a time, matching this app's existing "one editable thing at a time" convention elsewhere, e.g. the properties panel pattern itself).

Verified via a dedicated Playwright suite (27 checks, all passing): the blank-canvas copy replacing the old fixed-template copy; a new sermon starting with one blank slide by default and ADD SLIDE adding another; adding a heading block auto-selects it with a visible outline and resize handle; typing in the properties textarea updates the canvas live AND keeps focus (confirming the KJV-rerender fix actually holds); align/size/bold controls each apply to the selected block; adding a bullet-list block and an image block (via a real file upload) both land on the canvas, the image auto-selected with its own properties panel; ADD VERSE (KJV) inserts real KJV text for "John 3:16"; dragging a selected block changes its position and dragging its resize handle changes its size; a background color swatch flips the canvas to its dark-text variant; REMOVE BLOCK removes exactly one block; saving returns to the Sermons list, and the saved sermon presents correctly as a chromeless `.slide-canvas` on the host stage once split screen is toggled on; and, for legacy migration specifically, a hand-seeded old-shape sermon (one slide of each of the three old templates) shows up in My Sermons, opening it in the editor auto-migrates all three slides to blocks-based canvases with the original heading/bullet/verse-reference text carried over correctly, and resaving persists all three in the new blocks shape. The pre-existing Media/AVP (25 checks), Media Folders (22 checks), preview-bar keyboard-shortcuts (7 checks), and preview-alongside-live (10 checks) Playwright suites were all re-run as regression and passed in full.

**Deploy**: `iworship-deploy-v18.zip`. No `firestore.rules` change -- a sermon's `slides` field was never given a fixed shape there, so the new shape needed no rules update; a custom background image reuses Media/AVP's existing upload path, so no `storage.rules` change either (still gated behind Blaze billing for anyone who hasn't enabled it, exactly as Media/AVP already discloses -- a slide using only the five color presets and no uploaded images needs nothing extra).

## More presenter keyboard shortcuts, and indicating them on-screen [2026-09-08]

Jared, right after the presentation-builder work above: "Add double space short cut as well for going live, it seems intuitive. Also, let's add other keyboard shortcuts for other buttons in the presenter controls. Indicate them as well in the interface." Three asks, all shipped together in v19.

**Double-Space to go live.** An exact mirror of the existing double-Enter listener from the 2026-09-06 Preview/Go-Live work -- its own independent press-tracking variable and 600ms window, the same typing-context guard, the same "consume both presses" reset -- kept as a fully separate listener rather than folded into the Enter one so the two keys' double-press timing can never cross-contaminate (an Enter press followed by a Space press within the window correctly does NOT count as a double-press of either). Safe to bind bare Space with no extra guard beyond the existing double-press gate: this listener is scoped to `state.view==='session-host'`, a completely different view from `session-projector`, where Space already has its own, unrelated meaning (advancing LIVE content directly -- see that listener's own section above) -- the two can never conflict since only one of those views is ever active at a time.

**One-key shortcuts for the rest of the presenter toolbar.** Every other button on this screen that didn't already have a shortcut got one: `1`/`2`/`3`/`4` match the SONGS/SERMON/BIBLE/MEDIA segmented tabs in their on-screen left-to-right order; `P`/`S`/`C`/`H` are first-letter mnemonics for PROJECTOR/SPLIT SCREEN/CHAT/HOSTS (HOSTS only fires anything if the button actually exists in the DOM, i.e. only for the room's owner); `L` copies the musician chart Link (the one button whose natural first letter, C, was already taken by Chat). Implementation deliberately calls each button's own `.click()` rather than re-implementing its logic in the keydown handler -- unlike `goLive()`/`changeSection()`/etc. above, none of these seven buttons' actions are backed by a standalone named function, they're small inline closures set up a few hundred lines up wherever each button gets wired after render; simulating the actual click is what guarantees this can never quietly drift out of sync with what clicking the button by hand does, at the cost of one small new convention (this is the first keyboard shortcut in this codebase that delegates to a DOM `.click()` instead of calling a function directly -- worth knowing for whoever adds the next one).

**Safety guards, applied uniformly across the whole new listener:** a bare keypress only -- `e.metaKey`/`e.ctrlKey`/`e.altKey` all bail out immediately, so Cmd/Ctrl+1 (switch browser tab), Cmd+S (save page), Cmd+P (print), Ctrl+H (browser history), etc. are never hijacked, only the plain, unmodified key is treated as one of ours; `e.repeat` also bails out, so holding a key down doesn't rapid-fire a toggle on/off dozens of times a second; and the existing INPUT/TEXTAREA/`isContentEditable` guard (same one every other keydown listener on this screen already uses) so none of this ever hijacks typing in the verse-reference field, a search box, or anywhere else text entry happens. **Deliberately excluded from this whole scheme:** END SESSION and BACK -- both are one keypress away from a real mistake (accidentally ending a live service, or navigating away from it) in a way that toggling split screen or opening chat simply isn't, so those two buttons still require an actual click/tap, with no shortcut offered at all.

**Indicating them in the interface -- Jared's third ask.** Two complementary pieces, both new CSS classes that hide themselves automatically on a touch-primary device (`@media (hover:none) and (pointer:coarse)`, since a phone/tablet has no physical keyboard to use any of this with, and the badges would just be clutter there):
- `.kbd-hint` / `.icon-tool-kbd` -- a small outlined key-cap badge sitting directly on the button it belongs to (inline, after the label, on the four segmented tabs; an absolutely-positioned corner badge on the narrower toolbar buttons, which don't have room for it inline without wrapping). Both use `currentColor` for their border/text with no background of their own, so the exact same badge reads correctly whether the button underneath it is in its normal state or its wine-filled `.active` state -- no separate light/dark-mode-style branching needed for that.
- `.shortcuts-legend` -- one line, always visible, sitting directly under the existing "Your Controls" label (added 2026-09-07 for the same "make it unmistakable this is an interactive panel" reason) inside the fixed preview bar, spelling out literally every shortcut on this screen at a glance: arrows for staging, Space-Space/Enter-Enter for go live, 1-4 for tabs, and P/S/C/H (owner-only)/L for the toolbar.

Verified via a dedicated Playwright suite (22 checks, all passing): the legend line and both kinds of key-cap badges are actually present and correctly worded/labeled; double-Space publishes a staged song while a single, isolated Space press does nothing; 1/2/3/4 each switch to the correct tab (confirmed via each segmented button's `.active` class); S/C/H each toggle their respective panel open and closed again; L doesn't throw; a Ctrl-held "2" is confirmed NOT to switch tabs (proving the modifier-key guard actually works, not just that it compiles); and typing "1" into a real text field still types the character rather than switching tabs. The pre-existing Media/AVP (25), Media Folders (22), preview-bar keyboard-shortcuts (7), preview-alongside-live (10), and presentation-builder (27) Playwright suites were all re-run as regression and passed in full -- 91 checks total, on top of this feature's own 22.

**Deploy**: `iworship-deploy-v19.zip`. No `firestore.rules` change -- this is pure on-screen keyboard behavior and CSS, no data-model change of any kind.

## Bugfix: double-Space was scrolling the page [2026-09-08]

Jared, right after the v19 shortcuts shipped: "annoying when you click space space, the page scrolls down, can you remove that?" -- then, clarifying mid-turn before any fix was made: "I mean remove the scrolling down not the shortcut." Confirms the double-Space-to-go-live shortcut itself was working as intended; only its side effect needed fixing.

**Root cause.** Unlike Enter, a bare Space press has a browser-native default action when nothing more specific is focused: scroll the viewport down. The double-Space listener only called `e.preventDefault()` on the CONFIRMED second press (the old double-press-detection pattern, shared with the double-Enter listener, calls it only after `isDoublePress` is true) -- but the scroll happens on the FIRST press, before the code can know a second one is coming. The listener's own code comment even claimed "there's nothing here for a first Space press to conflict with," which was the actual mistake -- it overlooked Space's own native scroll behavior, distinct from Enter having none.

**Fix.** `e.preventDefault()` now runs on every qualifying Space keydown in this listener, not just the confirmed double-press -- stopping the scroll regardless of whether a second press follows. One new guard was added ahead of it: when the actual focus target is a `BUTTON`, an `A`, or anything with `role="button"`, the listener returns immediately without calling `preventDefault()` at all, so a focused control still natively activates on Space (standard keyboard-accessibility behavior) instead of being globally swallowed. That guard sits right alongside the pre-existing INPUT/TEXTAREA/`isContentEditable` typing-context guard, same pattern.

**Verification.** Added two new checks to the existing 22-check presenter-shortcuts Playwright suite (now 25): a tall spacer div is injected before the double-Space sequence so a missing `preventDefault()` would actually be observable as `window.scrollY` changing, and both the first and second Space presses of the double-press are confirmed not to move `window.scrollY` at all. A third new check confirms the accessibility guard still works -- focusing the split-screen toggle button and pressing Space activates it natively, exactly as clicking it would. All 25 presenter-shortcuts checks pass, and the full regression suite (Media/AVP 25, Media Folders 22, preview-bar keyboard-shortcuts 7, preview-alongside-live 10, presentation-builder 27 -- 91 checks) was re-run and passed in full with no changes needed.

**Deploy**: `iworship-deploy-v20.zip`. No `firestore.rules` change -- this is a pure bugfix to on-screen keyboard behavior, no data-model change of any kind.

## Bugfix: REMOVE BLOCK button overlapping BOLD [2026-09-08]

Jared sent a screenshot from the presentation builder's block-properties panel: the REMOVE BLOCK button's text was overflowing and overlapping the BOLD toggle next to it. Root cause, found via grep rather than guessed: `.remove-btn` is a small round 38px icon-only button class used everywhere else in this file (section removal in the song editor/add-song form, slide removal in the old sermon builder) holding nothing but a literal `&times;` glyph -- `renderBlockPropertiesPanel()` was the one place reusing that same class to hold the words "REMOVE BLOCK," which don't fit a 38px circle. Fixed additively, not by replacing the shared class: a new `.remove-block-btn` CSS override (`width:auto; height:auto; border-radius:10px; padding:8px 14px;`) sits alongside `.remove-btn` on just this one button, giving it a normal pill shape sized to its text while every actual icon-only `.remove-btn` elsewhere keeps its original round shape untouched. Verified visually via a Playwright screenshot showing BOLD and REMOVE BLOCK as two clean, separate pill buttons with no overlap.

**Deploy**: `iworship-deploy-v21.zip`. No `firestore.rules` change -- purely a CSS/class-attribute fix, no data-model change of any kind.

## Fellowship: profiles, posts, DMs, group chats, block/report [2026-09-08]

A full social layer -- see `claude/fellowship-plan.md` for the complete writeup (the ask, the three clarifying-question answers, what shipped, testing, and what's deliberately deferred). In short: cross-church profiles with a bio/photo/favorite-hymns list, one shared post feed (text/image/video), DMs, owner-managed group chats, and block/report moderation built in from day one rather than deferred. Reuses Media/AVP's exact upload path for profile photos and post attachments (no `storage.rules` change), and mirrors `bio`/`favorites`/`photoURL` onto the existing public `directory/{uid}` entry rather than loosening the private `users/{uid}` profile read rule (same reasoning `directory/{uid}` was created for during sermon sharing, above). Tested end-to-end in demo mode via a dedicated Playwright suite (24 checks) plus the full existing regression suite (Media/AVP, Media Folders, host controls/shortcuts, split-screen preview, the presentation builder, presenter keyboard shortcuts -- 116 checks total), all passing.

**Deploy**: `iworship-deploy-v22.zip`. **Needs a `firestore.rules` re-paste** -- five new collections (`posts`, `reports`, `dmThreads` + its `messages` subcollection, `groupChats` + its `messages` subcollection) plus an extended `directory/{uid}` write rule (`bio`/`favorites` fields). Profile photos and post photos/videos carry the same Blaze-billing dependency Media/AVP already discloses; everything else (text posts, DMs, group chats, block, report) needs no billing change at all.

## Fellowship redesign: social-media feed, Shorts, follow, notifications, Explore, Stories, hamburger nav [2026-09-09]

Jared, right after v22 shipped: "I think it's better if the fellowship part looks like an actual social media feed. Get best practices from facebook, tiktok, and etc. Add options to upload shorts videos, as well, and a feed for shorts. Like crazy features of social media. So it will be like another interface all on its own in the same app, then the user can switch between the worship interface and the fellowship interface." Four clarifying questions were asked and answered (all four engagement features; full-screen swipe+autoplay Shorts "if doable"; a hamburger menu plus a header avatar next to the logo for switching interfaces, Jared's own more specific answer superseding the two options offered; all three of Notifications/Explore/Stories), plus a follow-up asking for Facebook-style people search. See `claude/fellowship-plan.md`'s "v2: social redesign" section for the complete writeup -- the ask verbatim, every judgment call explained (one-directional Follow instead of a friend-request model; trending computed client-side instead of a new query; Stories expiring client-side instead of a Cloud Function), and what was deliberately deferred.

In short: a Facebook/TikTok-style action bar (like, comment, repost, save/bookmark) on every post; a brand-new Shorts vertical-video feed built with CSS scroll-snap + an IntersectionObserver for TikTok-style swipe+autoplay (no gesture library needed); a one-directional follow system with denormalized follower/following counts; an in-app notifications bell + badge; an Explore/Discover page combining trending posts, suggested people, and a people-search box with FOLLOW/MESSAGE/VIEW PROFILE; 24-hour ephemeral Stories with a ring bar and full-screen viewer; and a persistent header (avatar next to the "iWorship" logo, opening My Profile) plus a hamburger-menu drawer (My Profile, Notifications, Messages, Explore, Switch to Worship/Fellowship, Plans & Pricing, Song Requests/Admin Tools, Sign Out) that now live outside `#main` in `index.html` so they persist across every screen instead of being rebuilt per view. Seven new Firestore collections (`likes`, `comments`, `follows`, `notifications/{uid}/items`, `stories`, `shorts`, `users/{uid}/saved`), all reusing the exact same upload path (`uploadMediaFile()`) and directory-search infrastructure every prior feature already established -- no `storage.rules` change needed.

Tested via a new 33-check Playwright suite (header chrome, the hamburger's Switch-interface toggle working in both directions, liking/commenting/saving/reposting a second seeded person's post with the resulting notifications landing in THEIR inbox, following that person and confirming it via people-search, a seeded Short appearing in the Shorts feed, and a seeded Story opening the full-screen viewer) plus the complete existing regression suite re-run in full (the original 24-check Fellowship suite, Media/AVP 25, Media Folders 22, the presentation builder 27, presenter shortcuts 25, controls shortcuts 7 -- 130 checks) -- 163 checks total, all passing.

**Deploy**: `iworship-deploy-v23.zip`. **Needs a `firestore.rules` re-paste** -- seven new collections, plus an extended `posts/{postId}` update rule (denormalized `likeCount`/`commentCount`/`repostCount`) and an extended `directory/{uid}` update rule (`followerCount`). Shorts video uploads and Stories photo/video uploads carry the same Blaze-billing dependency every other upload in this app already discloses; likes, comments, follows, and notifications need no billing change at all.

## Bugfix: v23 header overflow + search-icon overlap on a real phone [2026-09-09]

Jared tested v23 live on his own phone (a real Firebase account) and reported four issues. Two were real, reproducible app bugs, found and fixed the same session -- see `claude/fellowship-plan.md`'s "v24 hotfix" section for the full writeup. In short:

1. The new header row (avatar + bell + home + theme + hamburger, 5 tap targets) didn't fit next to the full-size logo on a ~390px phone screen -- the hamburger button (and sometimes the theme toggle) got pushed entirely off the right edge, invisible and unreachable. Fixed by letting the brand title truncate first (ellipsis, rarely needed) while every icon button keeps a fixed size no matter how narrow the screen, plus a phone-width breakpoint that tightens sizing so the ellipsis fallback almost never triggers in practice.
2. Several search boxes (Messages' "start a new conversation" among them) sit inside a `.field` label wrapper whose own input styling has slightly higher CSS specificity than `.search-box`'s -- so the intended 48px of left padding that clears the magnifying-glass icon was silently getting overridden back down to 16px, leaving typed text sitting directly under the icon. This was a latent pre-existing bug (not introduced by v23), just first actually hit on the Messages screen. Fixed with a small override rule that guarantees `.search-box`'s padding wins whenever both apply.

The other two things Jared reported (MESSAGE button seeming to do nothing; a profile photo upload not showing up) could not be reproduced in demo mode -- both flows work correctly there. These match the two real-backend requirements already disclosed since v1/v22 and still outstanding: pasting the latest `firestore.rules` into the Firebase console, and enabling Cloud Storage + Blaze billing for photo/video uploads. Both failure paths already show an explanatory toast; it's easy to miss on a phone since it auto-hides after ~3 seconds.

Verified with before/after screenshots at a 393px mobile viewport plus the full 163-check regression suite (33-check social-redesign suite + 130-check prior suite), all passing with zero regressions.

**Deploy**: `iworship-deploy-v24.zip`. No `firestore.rules` change beyond what v23 already needs -- this pass is CSS/HTML only. If you haven't yet pasted the v23 `firestore.rules` or enabled Blaze billing, those are still the two things standing between here and a fully working real-account test.

