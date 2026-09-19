---
title: iWorship — Monetization & Paid Tiers Plan
description: Role/permission model, plan comparison, and pricing (PHP primary, USD reference) for turning iWorship into a paid product across multiple churches, while keeping one shared hymnal and open cross-church "fellowship" attendance. Phase 1 (Plans & Pricing screen, churches foundation) shipped; phase 2 (confirmed design decisions, Enterprise tier, Cloud Functions scaffold) shipped 2026-09-03; phase 3 (beta-enablement — real gating live for everyone, an in-app Admin screen, client-side writes for two trusted Admins in place of Cloud Functions) also shipped 2026-09-03; phase 4 (Admin "find by name" search, and the free-tier Song Requests review queue) shipped 2026-09-04 — so a beta test can start now without waiting on Firebase Blaze.
status: Design is fully settled (see "Resolved design decisions" below). Phases 1-4 have all shipped — real enforcement (Play Mode, add-song, hosting) is live for everyone, not just beta testers, per Jared's explicit choice; an in-app Admin screen lets Jared and one friend register churches, assign roles, and grant beta access right now (with a "find by name" search so they don't need someone's Account ID pasted to them first), without Cloud Functions; and the free tier now has a real Song Requests path (submit a title/lyrics, a worship-team editor reviews and approves straight into the hymnal or rejects) instead of "next batch." This deliberately narrows the original "no client can ever write churches/cross-user profiles" design for two named, trusted Admins only — see "Beta phase" below — as a disclosed, temporary bridge until Blaze is enabled and the real `functions/` scaffold can deploy.
last updated: 2026-09-04
---

# iWorship — Monetization & Paid Tiers Plan

## Core principle, confirmed by Jared

The hymnal stays **one shared library across every church** — no per-church data
walls on the *content*. Any church can attend any other church's live worship
session ("fellowship" is the point, not a bug). What churches *do* get,
per Jared's answer to open question 3/4 below, is a **curated view**: each
registered church can maintain its own list of songs hidden from its
congregation's default view, and a member can switch between the full
"Public Library" and their own church's curated list. The underlying song
data is never duplicated or walled off — this is a display filter
(`hiddenSongIds` on the church doc), not a second copy of the hymnal.

## Roles

- **Admin** (Jared + one friend, not for sale) — the only accounts that can
  edit an *existing* song's lyrics/chords/title. Everyone else can only add
  new songs, never touch what's already live. Admins also review the
  newly-added-songs queue and can refund an Editor's daily add-credit if an
  admin catches a duplicate that slipped through. **Beta phase addition
  [2026-09-03]:** an Admin can also, right now, register/edit churches and
  write any role or beta-tester flag onto any user's profile via the new
  in-app Admin screen — see "Beta phase" below.
- **Senior Pastor** (exactly 1 per church, included in every paid church
  plan) — the only role that can assign or remove a **Pastor** seat
  (confirmed by Jared: "senior pastor is more powerful than pastor in the
  sense that he can assign pastors, that's it"). Also assigns/removes
  Editors, Music Director, and Musicians, and curates the church's
  `hiddenSongIds` list (the Public Library / Church Library toggle members
  see) — powers a Pastor shares equally.
- **Pastor** (paid seat, **Full plan only** — confirmed by Jared) — one or
  more additional pastoral seats alongside the Senior Pastor, each with a
  customizable title (e.g. "Music Pastor," "Youth Pastor"). Confirmed:
  a Pastor can assign/remove Editor, Music Director, and Musician roles and
  curate the church's library exactly like the Senior Pastor — the one
  thing a Pastor cannot do is create, remove, or retitle another Pastor
  seat (or themselves); that's Senior-Pastor-only. Full plan ships with
  **2 additional Pastor seats** by default (placeholder count — easy to
  change before this goes live).
- **Editor** (paid seat) — can add new songs directly, immediately, no
  review wait. Cannot edit any existing song. Capped at **6 new songs per
  day per editor** (matches a standard 2-service Sunday, 3 songs/service).
  Can host live sessions in both Sing Mode and Play Mode. Gets a purpose-built
  "tap a word, pick a chord" add-song interface (still stores to the existing
  `[Chord]word` inline format under the hood — no data-model change needed
  for this part). Also reviews the free tier's Song Requests queue (see
  "Phase 4" below) — same reviewer set as the legacy Musicians chat channel.
- **Music Director** (paid seat, a specialized Musician) — same Play Mode/
  chord access as a Musician, plus the ability to host live sessions. Regular
  Musicians cannot host.
- **Musician** (paid seat) — Play Mode / chord + transpose access. No
  add-song rights, no hosting. **Play Mode is now actually gated to
  Musician-and-above seats, live for everyone, since 2026-09-03** — see
  "Beta phase" below for what "live for everyone" means in practice.
- **Individual Premium** (paid, no church affiliation required) — bundles
  Editor + Musician + Music Director capabilities (add songs, view chords,
  host) onto one personal account, for someone not part of any registered
  church. Subject to the same 6/day cap and duplicate-flagging as a church
  Editor. **Annual or monthly billing only — confirmed no quarterly option**
  (open question 6, resolved). Not part of the Song Requests reviewer set —
  see "Phase 4" below for why.
- **Free / Congregation** (everyone, no account needed to browse) — full
  hymnal browsing (Public Library by default, or their linked church's
  curated list if they belong to one), Sing Mode (lyrics only, no chords),
  favorites, topical search, joining any public "fellowship" session hosted
  by any church, and submitting a free **song request** — title plus
  optionally pasted lyrics — that a worship-team editor reviews and either
  approves straight into the hymnal or rejects (real, live queue as of
  2026-09-04 — see "Phase 4" below; no more "next batch" wait).
- **Beta Tester** (not a role — a flag, `Profile.isBetaTester`, set only via
  the Admin screen) — bypasses every one of the three gates below (Play
  Mode, add-song, hosting) regardless of `role` or `churchId` or payment.
  Purpose-built for onboarding real people into the beta right now, with no
  payment or Cloud Functions involved yet.

## Overage beyond the Full plan (open question 2, resolved)

Rather than a hard ceiling or a la carte add-ons, Jared confirmed the SaaS-
standard approach: churches that outgrow the Full plan's seat counts contact
Jared/the admin team directly for a custom-quoted plan. This is shown in the
app as a sixth **"Enterprise / Custom"** card with a "contact us" call to
action instead of a listed price (see the Plan comparison table below and
`src/app.js`'s `PLANS` array, id `'enterprise'`).

## Plan comparison

| | Free | Starter (church) | Growing (church) | Full (church) | Enterprise (church) | Individual Premium |
|---|---|---|---|---|---|---|
| **Price** | ₱0 | ₱1,899/yr · ₱549/qtr · ₱199/mo | ₱3,499/yr · ₱999/qtr · ₱379/mo | ₱5,299/yr · ₱1,499/qtr · ₱599/mo | Contact us | ₱2,499/yr or ₱269/mo |
| *(USD reference)* | *$0* | *$30/yr · $9/qtr · $3.50/mo* | *$55/yr · $16/qtr · $6/mo* | *$85/yr · $24/qtr · $9/mo* | *—* | *$40/yr or $4.50/mo* |
| Billing cadence | — | Annual, quarterly, or monthly | Annual, quarterly, or monthly | Annual, quarterly, or monthly | Custom | Annual or monthly only |
| Browse hymnal, Sing Mode, favorites, topical search | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Join public fellowship sessions (any church) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit a song request (editor-reviewed: approved straight into the hymnal, or rejected) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Senior Pastor seat (only role that can assign/remove Pastors) | — | 1 | 1 | 1 | 1 | — |
| Additional Pastor seats (custom title, e.g. "Music Pastor") | — | — | — | 2 | Custom | — |
| Public Library / Church Library toggle for members | n/a | ✅ | ✅ | ✅ | ✅ | n/a (no church) |
| Editor seats (add songs instantly, 6/day cap each, host, review Song Requests) | — | up to 3 | up to 3 | 3 | Custom | 1 (bundled) |
| Music Director seat (Play Mode + host) | — | 0 (Editors host instead) | 1 | 1 | Custom | 1 (bundled) |
| Musician seats (Play Mode / chords, no host) | — | up to 5 | up to 10 | 20 | Custom | 1 (bundled, self) |
| Play Mode / chord + transpose access | ❌ | Editors/MD/Musicians only | Editors/MD/Musicians only | Editors/MD/Musicians only | Editors/MD/Musicians only | ✅ |
| Duplicate-add flagging + admin review queue | n/a (Song Requests queue serves this role for the free tier) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Support ticketing (categorized, 3–5 business day SLA) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Grace period on a lapsed payment before features lock | n/a | 7 days | 7 days | 7 days | Custom | 7 days |

Peso is the primary/actual sticker price for Philippine churches paying
directly in pesos — these are fixed price points, not a live daily FX
conversion. The USD row is kept only as a rough reference (based on a
Sept 2, 2026 rate of roughly ₱62.5 = $1, via Wise) in case of a non-Philippine
church or an Individual Premium user paying in dollars later.

Ticket categories (Jared asked for suggestions): Song correction, Duplicate
or wrong song, Billing/subscription, Account or access, Bug report, Feature
request, Other (free text).

## Resolved design decisions (previously "Open questions")

All six were answered by Jared on 2026-09-03; a follow-up the same day
resolved the one remaining fine detail from #1:

1. **Pastor tiering** — confirmed: exactly one Senior Pastor per church,
   plus additional (non-senior) Pastor seats *only on the Full plan*, each
   given a custom title by the Senior Pastor (e.g. "Music Pastor"). **Now
   fully resolved:** a Pastor seat can assign/remove Editor, Music Director,
   and Musician roles and curate the church's library exactly like the
   Senior Pastor — the Senior Pastor's one exclusive power is assigning or
   removing a **Pastor** seat itself. The seat count (2, above) is still
   just a placeholder default, easy to change later since it's data, not a
   structural decision.
2. **Overage beyond the bundle** — confirmed: "contact us" for a custom
   quote, not a hard ceiling or a la carte add-ons. Shown as the new
   Enterprise/Custom plan card.
3. **Pastor's "manage visibility" feature** — confirmed: members can switch
   between the shared Public Library and their own church's curated list;
   the Senior Pastor or a Pastor manages which songs are excluded from
   their church's list. Modeled as `hiddenSongIds` on the church doc — an
   exclusion list, not a duplicate library, so the "no data walls" principle
   still holds (nothing stops a member from switching back to Public).
4. **"Servers" terminology** — confirmed: same answer as #3. No separate
   concept needed.
5. **Grace period on lapsed payments** — confirmed: **7 days** before paid
   features lock after a failed payment.
6. **Quarterly for Individual Premium** — confirmed: **no**, stays
   annual/monthly only.

## Beta phase — real gating live now, without Cloud Functions [2026-09-03]

Jared asked to build the monetization backend for a beta test *without*
waiting on Cloud Functions (Blaze isn't enabled yet), and gave Admins the
power to designate specific people as **beta testers** with full access to
everything. When asked directly whether real enforcement should also start
restricting *everyone else* right now, or stay opt-in to beta testers only,
Jared chose the former: **"Turn on real gating for everyone now."** Both
requests shipped together:

- **`churches/{id}` writes and cross-user `users/{uid}` writes are now
  allowed directly from the client, but only for two named, trusted Admin
  accounts** (Jared + one friend, via a hand-managed `admins/{uid}`
  collection — same doc-exists-only pattern as the pre-existing `editors`
  allowlist). This is a deliberate, disclosed, *narrower* version of the
  original "only a payment-verified Cloud Function can ever write these"
  design in this doc's "Infrastructure implications" section below — not an
  abandonment of it. Once Blaze is enabled and `functions/` actually
  deploys, the plan is to tighten this back to `allow write: if false` and
  route everything through the real Cloud Functions + a payment webhook
  instead.
- **A new in-app Admin screen** (visible only to Admins) is where this
  happens: register/edit a church (name, plan, seat limits, billing
  cadence, and a Church Library curation list), assign a role to anyone by
  their Account ID, and grant or revoke Beta Tester access. See
  `src/data/interface.md`'s "BETA PHASE" section for the exact mechanics.
- **Real enforcement is live for everyone, not just beta testers**, per
  Jared's explicit choice above: Play Mode, adding songs, and hosting a
  session are now genuinely gated in both `app.js` (UI) and
  `firestore.rules` (the real write-time check). Anyone already on the
  legacy `editors` allowlist (Jared's live worship team today) keeps
  Add-Song and Hosting access unchanged, since the new role system is
  OR'd together with that allowlist rather than replacing it — **but Play
  Mode was never gated by that allowlist before**, so worship team members
  who aren't also given a role or beta access will lose Play Mode (chords/
  transpose) access the moment this rules update is live in Jared's
  Firebase project, until he assigns them one via the Admin screen. This is
  a direct, immediate consequence of "gate everyone now" that Jared should
  know about before deploying the updated `firestore.rules`.

## Phase 4 — Admin search, and a real Song Requests queue [2026-09-04]

Two smaller features shipped the day after phase 3, both requested directly
by Jared once he started actually using the Admin screen and Plans page:

- **"Find by name" search on the Admin screen.** Both the role-assignment
  and beta-access forms now have a live search box above the Account ID
  field — Jared no longer needs someone to have already copied and sent
  their Account ID before he can grant them anything. Backed by a new
  `watchAllUsers()` data-layer function; see `src/data/interface.md`'s
  "Find someone by name" note for the mechanics and its one limitation (a
  brand-new sign-in with no display name yet won't show up in search until
  they set one).
- **Song Requests — a real free-tier path, not "next batch."** The Free
  plan's marketing copy always said members could "submit a song request,"
  but nothing backed it until now. Anyone signed in who doesn't already have
  paid Add Song access sees **Request a Song** instead of the paid Add Song
  button; they submit a title (optionally with pasted lyrics), the app flags
  a possible duplicate against the existing hymnal by title as they type,
  and a worship-team editor (or Admin/beta tester) reviews it in a new
  **Song Requests** queue linked from the landing page. Approving hands the
  title and any auto-detected sections straight into the existing Add Song
  form, pre-filled, so the editor just checks it over and saves; rejecting
  is immediate. The submitter sees the final status next time they open
  Request a Song. Deliberately **not** opened to Individual Premium users
  reviewing requests — they already have their own direct-add access and
  reviewing is a worship-team-moderation concept, not a personal-plan perk
  — see `src/data/interface.md`'s "Song requests" section for the full
  design, including why there's no live pending-count badge anywhere else
  in the app (avoids an always-on subscription that `firestore.rules` would
  just deny for non-reviewers anyway).

Both are additive, no-rules-migration features — `firestore.rules` gained
one new `songRequests/{requestId}` match block (see that file's "SONG
REQUESTS" comment) but nothing about the phase 3 beta-phase design changed.

## Infrastructure implications

Enforcing the 6/day cap, duplicate detection at scale, seat/plan limits, and
role assignment/library curation robustly for the *general public* (not just
two trusted, hand-added Admins) still needs Cloud Functions. **Cloud
Functions cannot be deployed on Firebase's free Spark plan at all** — it
requires switching this Firebase project to Blaze (pay-as-you-go), which
means Jared adding a billing method in the Firebase console. That's a real
step only Jared can take (Claude has no access to the Firebase console or a
payment method to add), and it's what the beta-phase Admin screen above is
deliberately standing in for in the meantime. A Cloud Functions scaffold has
been written in `functions/` (see `claude/architecture-and-decisions.md`) so
it's ready to deploy the moment Blaze is on — it has not been deployed or
tested against a live project. `functions/assignRole` already enforces the
Senior-Pastor-only rule for granting or removing a Pastor seat (see item 1
above), though the beta-phase Admin screen itself doesn't yet enforce that
restriction client-side (see "Status" below).

Billing itself (collecting the actual subscription payments) should happen
through a plain web signup/checkout page, not an in-app purchase inside the
Android app — Google Play's payments policy would otherwise require routing
paid app-functionality purchases through Play Billing (and its cut) for
purchases initiated inside the installed app; a purchase made on a separate
web page, with the app only checking entitlement, sidesteps that. The
`registerChurch` Cloud Function scaffold reflects this: it always creates a
church at `plan: 'pending'` with zero paid seats — a church only gets its
real plan and seat limits once a `stripeWebhook` (also scaffolded, not yet
wired to a real Stripe account) confirms payment. Under the beta-phase Admin
screen, an Admin *can* set a plan and seat limits directly (since it's
Admin-only, not general client access) — this is fine for onboarding beta
churches by hand, but real self-serve payment still routes through Stripe
once that's built.

## Status

Phase 1 (in-app Plans & Pricing screen, read-only `churches` foundation) and
phase 2 (confirmed design, Enterprise tier, Cloud Functions scaffold, not
deployed) shipped first — see git history / architecture doc for details.

**Phase 3 shipped 2026-09-03** — beta enablement without Cloud Functions:

- Two Admin accounts (Jared + one friend) can now register churches, assign
  roles, and grant/revoke beta access directly from a new in-app Admin
  screen, via client writes `firestore.rules` allows for Admins only — see
  "Beta phase" above.
- Play Mode, add-song, and hosting are now **actually gated for everyone**,
  not just beta testers, per Jared's explicit decision — both in the UI
  (`app.js`) and at write-time (`firestore.rules`).
- The legacy `editors` allowlist still fully works and is OR'd together
  with the new role system for add-song/hosting, so Jared's live worship
  team keeps that access — but see the Play-Mode caveat under "Beta phase"
  above, which needs Jared's attention before/right after deploying.

**Phase 4 shipped 2026-09-04** — see "Phase 4" above for the full writeup,
and `claude/phase4-features-and-scoping.md` for everything below except
Song Requests:

- Admin screen's role/beta-access forms both gained a "find by name" search
  so Jared doesn't need an Account ID in hand first.
- A real Song Requests queue: free-tier members submit a title/lyrics, a
  worship-team editor reviews (approve straight into the hymnal, pre-filled
  from any pasted lyrics, or reject) — replacing the old "queued for next
  batch" placeholder copy on the Plans page.
- A Presenter/Projector ("stage") view and in-page split screen for hosts,
  and a desktop/computer-screen sizing fix (the app no longer stays capped
  at a narrow mobile-width column on a laptop/desktop browser).
- A built-in KJV Bible (public domain, free) — book/chapter/verse browsing
  plus whole-text search, reachable from the landing page for everyone,
  no plan gate. NIV/LSB/LEB aren't bundled — real licensing questions, not
  yet pursued.
- Sermon/preaching presentations: a `canHost()`-gated Sermons screen where
  a host builds a slide-by-slide sermon (three templates: title, point,
  and Bible-verse-with-KJV-lookup), then presents it live from the Host
  Session screen through the exact same Presenter/Projector machinery
  songs already use — same paid-tier gate as hosting itself (Editor, Music
  Director, or Individual Premium), since presenting a sermon only ever
  happens from within a hosted session.
- Sermon sharing: a **SHARE** panel on every sermon (search anyone who's
  set up a profile by Account ID/name/church, or copy a `?sermon=<id>`
  link) so a sermon's owner can hand access to "a friend pastor or the
  AVP team" (Jared's own examples) — it shows up in the recipient's own
  Sermons screen AND their own Host Session SERMON picker, so they can
  actually present it themselves, not just view it. Backed by a new,
  narrow `directory/{uid}` collection (just uid/displayName/churchName,
  publicly readable) rather than loosening the private `users/{uid}`
  profile collection — see `claude/phase4-features-and-scoping.md` and
  `src/data/interface.md` for the full reasoning.

**Still not built, deliberately deferred:** the Senior-Pastor-only
restriction on assigning/removing a Pastor seat is enforced in the
unde­ployed `functions/assignRole`, but *not* yet in the beta-phase Admin
screen itself (any Admin can currently assign any role to anyone, since
the whole screen is Admin-only already) — low risk with only two trusted
Admins, worth tightening before this screen is ever opened to more people.
Also still deferred: the 6-song/day add cap for *paid* Editors (the
now-shipped Song Requests queue is a separate, free-tier thing and isn't a
substitute for it), the tap-to-chord Editor UI, the ticketing system, and
real Stripe billing (`stripeWebhook` is still a stub).

**Next concrete steps:**

1. **Jared:** paste the updated `firestore.rules` into the Firebase
   console's Rules editor (no-CLI deployment, per this project's
   established pattern) — it now includes the phase 4 `songRequests/{id}`
   match block alongside everything from phase 3 — and hand-add
   `admins/{uid}` documents for himself and his friend in the Firestore
   console (same doc-exists-only pattern as the existing `editors`
   collection) — see README.md's "Adding Admins" section.
2. **Jared, right after deploying:** use the new Admin screen to grant a
   role or beta access to his current worship team members so they don't
   unexpectedly lose Play Mode access — see the caveat under "Beta phase"
   above.
3. Whenever Blaze gets enabled: deploy the real `functions/` scaffold and
   migrate off the beta-phase Admin screen's direct client writes, per the
   plan in `claude/architecture-and-decisions.md`'s "Monetization, phase 3"
   section.
