STATUS: DRAFT — matches the template in TEMPLATE.md. This is ready to post
the moment the actual deploy goes out (still on hold for Firebase billing
credits, per Jared's "no credits, for next time, hold it"). Don't post
the "🔒 For Jared only" section at the bottom anywhere public.

---

# iWorship Update — September 2026

A big one this time — a new Bible translation, a friendlier projector,
daily devotionals you can read anytime, and a lot of small things that
just make the app work better day to day. Here's everything in this
update.

## 📖 Hymnals

- **The Bible is now available in Tagalog**, alongside the English King
  James Version — the 1905 Ang Dating Biblia. Switch between the two any
  time with one tap, right from wherever you're reading, and you'll stay
  on the exact same passage when you switch.

## 🎤 Host

- That same Tagalog/English Bible switch is built into **Present a Bible
  Verse** too, so a host can pull up and project a verse in either
  language mid-service.
- Upload one **default background image** in Settings and it'll
  automatically show up behind every song and sermon slide you project —
  no more setting it per slide.
- Bigger, clearer projector text, with a new +/− control to size it to
  the room, and a more readable font.
- A **QR code** for joining sessions — put it on the screen and people
  can scan straight in, no code to type.
- Share a **livestream link** that stays pinned at the top of chat so
  joiners can always find it, even as messages pile up below it.
- Fullscreen keyboard shortcuts on the projector (F to go fullscreen,
  Escape to leave it) actually work now.
- The projector holds up much better through spotty wifi — it keeps
  showing the last slide and catches up automatically once the
  connection's back, including when you're controlling it from the same
  device.
- A small banner now lets you know when you've lost connection, and that
  iWorship is still working and will catch up once you're back online.

## 🤝 Fellowship

- **Daily Devotionals** are here — Charles Spurgeon's classic "Morning
  and Evening," one reading per day, in a brand-new section of its own.
  Step back and forth through any day of the year, or jump straight to a
  date. Your church's admins can also share any day's reading straight to
  the Fellowship feed, and a devotional posts there automatically each
  morning too.

## 🌱 Spiritual Growth

- Still in the works — a guided path from a gospel invitation through
  discipleship and a personal journal is coming in a future update. Stay
  tuned!

## ⛪ For Church Teams & Admins

- **Church Team Roster** — pastors, musical directors, and editors can
  now add, remove, and manage their own church's team roles themselves,
  right in the app, no waiting on an Admin.
- Song usage tracking, so Admins can see which songs actually get used.
- Bulk song import — upload a CSV or a ChordPro file to add a whole batch
  of songs at once, instead of pasting them in one at a time.

## ✨ Also New

- A brand-new **About iWorship** screen — a quick, friendly tour of
  everything the app can do, organized by Hymnals/Host/Fellowship/
  Spiritual Growth. Find it in Settings, or the menu.
- A first-run walkthrough for anyone brand new to the app, and a separate
  one the first time you open Host Controls.

## 🔧 Fixed & Improved

- Fixed an issue where some new accounts could get stuck right after
  signing in for the first time.
- Fixed a layout gap on desktop/PC screens that left empty space on the
  right side of the app.

---

🔒 **For Jared only — remove before posting anywhere public.**

- Regenerate devotional content with the fixed parser before this goes
  out: `node scripts/build-devotionals.mjs --all`, then commit/push
  `src/content/devotionals.json` + `functions/devotionals.json`. (See
  architecture doc, "Topbar-icons alignment fix... standalone Devotionals
  section.")
- `npm run build` + your usual Netlify push for all client-side pieces in
  this bundle.
- `firebase use iworship-ph && firebase deploy --only functions` — covers
  the devotionals auto-post function and anything else pending on
  Functions; afterward, toggle push notifications off/on once in Settings
  to mint a fresh token. (Architecture doc, "Four new features/fixes.")
- Re-paste the current `firestore.rules` into the Firebase console — it's
  picked up new carve-outs since the last paste (song usage tracking,
  Church Team Roster, cross-church Admin access). (Architecture doc,
  "Song usage tracking" + "Church Team Roster" sections.)
- The **"upload a PowerPoint directly"** option will appear in the app
  but won't actually work until you run its own one-time setup —
  `pptx-converter/DEPLOY.md` has the exact steps (`gcloud run deploy`,
  granting `roles/run.invoker`, a `functions/.env` entry). Until that's
  done, consider leaving it out of what you post publicly, or note it as
  "coming very soon."
- After this deploy, worth a couple of live spot-checks against the real
  `iworship-ph` backend rather than just this session's demo-mode tests:
  the Tagalog Bible toggle inside an actual hosted session, and — since
  these touch `firestore.rules` and could only be checked in demo mode
  so far, which has no security rules at all — a Church Team leader
  trying to move someone to a DIFFERENT church (should be rejected) and a
  non-leader account trying to write to a roster directly (should also be
  rejected).
