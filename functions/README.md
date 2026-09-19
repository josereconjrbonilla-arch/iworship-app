# iWorship Cloud Functions -- scaffold, not deployed

Everything in this folder is **written but not deployed and not tested
against a live Firestore project.** It was built as backend prep for the
monetization plan (see `claude/monetization-plan.md` and
`claude/architecture-and-decisions.md` in the Claude project docs), ahead
of Pastor onboarding actually going live.

## Why this hasn't been deployed yet

Cloud Functions cannot deploy on Firebase's free **Spark** plan at all --
Google requires the pay-as-you-go **Blaze** plan for any Cloud Functions
deployment, regardless of how little they're actually used. That's a
billing decision that needs a payment method on file, which only Jared can
add (Firebase console -> Usage and billing -> Modify plan). Nothing here
can be verified end-to-end until that happens.

## What's in here

- `registerChurch` (callable) -- a Senior Pastor registers their church.
  Deliberately creates the church at `plan: 'pending'` with **zero** paid
  seats -- nobody, including the person registering, can grant themselves a
  paid plan this way. A real plan/seatLimits only gets set once
  `stripeWebhook` (below) confirms a real payment.
- `assignRole` (callable) -- a Senior Pastor or Pastor assigns a role
  (`pastor` / `musicDirector` / `editor` / `musician`, or `null` to remove)
  to another user within their own church, enforcing the church's
  `seatLimits`.
- `updateChurchLibrary` (callable) -- a Senior Pastor or Pastor sets their
  church's `hiddenSongIds` list (the Public Library / Church Library
  toggle members see).
- `stripeWebhook` (HTTPS, **stub only**) -- receives Stripe events and is
  supposed to move a church from `plan: 'pending'` to its real paid plan.
  Signature verification and the actual price-ID -> plan mapping are not
  implemented (`TODO` markers in the code) because there's no Stripe
  account or keys wired up yet. Do not deploy this one until that's built
  out -- right now it would accept unverified requests.
- `sendPushOnNotification` (Firestore trigger) -- fires on every new
  `notifications/{uid}/items/{itemId}` doc (likes/comments/follows/reposts/
  messages from `notify()` in `app.js`, plus `session_live` items from
  `onNewSessionNotify` below) and sends a real push to every one of that
  person's registered devices via FCM.
- `onNewSessionNotify` (Firestore trigger) [2026-09-17] -- fires when a new
  **public** room is created; fans out `session_live` notification items to
  the host's followers and same-church directory members (skipping anyone
  who's opted out via `users/{uid}.notifPrefs.sessions`), capped at
  `MAX_SESSION_FANOUT`. Rides `sendPushOnNotification` above for the actual
  push -- no separate send logic.
- `dailyVerseNotify` (scheduled, 23:00 UTC / 7am Philippines) [2026-09-17] --
  sends the day's verse (same rotation as `src/content/verses.js`'s
  `todaysVerse()`, mirrored by hand as `DAILY_VERSES`) directly to every
  opted-in device's token (`users/{uid}.notifPrefs.dailyVerse`). Doesn't
  write anything to Firestore per recipient -- see its own comment for why.

## Before deploying any of this

1. Enable Blaze billing on the Firebase project.
2. Run `npm install` inside this folder.
3. Actually test `registerChurch`, `assignRole`, `updateChurchLibrary`,
   `onNewSessionNotify`, and `dailyVerseNotify` against the Firebase
   Emulator Suite (`firebase emulators:start`) with real Firestore data
   shaped like `claude/monetization-plan.md` describes -- none of this has
   been exercised against real data yet, the same honest caveat
   `firestore-data-layer.js` already carries for the rest of this app. The
   emulator suite's scheduler support is limited (it doesn't actually fire
   `onSchedule` on a timer) -- test `dailyVerseNotify` by calling it
   directly from a script instead, since it takes no meaningful arguments.
4. Leave `stripeWebhook` disabled/undeployed until real Stripe keys and
   signature verification are added -- see the `TODO`s in `index.js`.
5. `firebase deploy --only functions` from the repo root once the above is
   done.
