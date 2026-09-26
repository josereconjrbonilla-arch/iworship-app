# iWorship Patch Notes — Process & Template

This file explains how patch notes get written for iWorship going forward.
Read this once; then each real release is just a copy of the template
below with the content swapped in. The process doc for this also lives in
the Hymnal App project (`claude/patch-notes-process.md`) so it survives
across sessions even if this file is ever moved.

## The rule

**Updates get bundled, then released together — never one feature at a
time.** Jared: "updates will be bundled before we deploy them, and I need
you to create a patch notes for my users in the future for every new
bundled update." Concretely:

1. Work piles up in the repo/connected folder across a session (or many
   sessions) without being deployed — this is normal and expected, not a
   backlog problem. `claude/architecture-and-decisions.md` keeps tracking
   every individual feature/fix as it's built, same as always.
2. Right before an actual deploy happens (Netlify push + `firebase deploy
   --only functions`, or whatever the deploy step is at the time), write
   ONE patch-notes entry covering **everything that will go out in that
   deploy** — i.e. everything built since the last entry in this folder,
   not just the most recent feature. Check this folder's most recent
   dated file to see where the last one left off.
3. File it here as `YYYY-MM-DD-short-slug.md`, using the template below.
4. Jared decides how it reaches actual users (posted as a Fellowship
   announcement, an in-app "what's new" banner, a Play Store release
   note, etc.) — this process only produces the text, not where it's
   published.

## Two audiences, one file, cleanly separated

Every patch-notes file has two parts:

1. **The public section** — written for the actual congregation using
   the app: hosts, musicians, and ordinary congregants, many of whom are
   not remotely technical. This is what Jared copies out and actually
   posts somewhere.
2. **A "🔒 For Jared only" section at the very bottom** — anything a
   deploy needs that isn't done automatically (a `firestore.rules`
   re-paste, a one-time `gcloud` setup, a Settings toggle to flip once
   post-deploy to mint a fresh token, etc.). This is a short checklist,
   not a re-explanation — link back to the relevant
   `architecture-and-decisions.md` section for the full how-to rather
   than duplicating deploy instructions here. **Always strip this whole
   section out before anything gets posted publicly** — it's operational
   noise for a congregant and occasionally references internal
   infrastructure (Cloud Run, Firestore rules) that shouldn't go out
   under iWorship's own name.

## Tone and voice for the public section

- Plain, warm, a little celebratory — this is good news for the
  congregation, not a software company's release notes. Short sentences.
  No jargon (never "Firestore," "Cloud Function," "API," "cache" — say
  what changed for the person using the app, not how it was built).
- Every entry describes what someone can now DO or notice, not what was
  technically changed. "You can now read the Bible in Tagalog" — not
  "added a bibleTranslation state variable."
- Bug fixes get a short, honest, non-alarming line — "Fixed an issue
  where some new accounts got stuck signing in the first time" — never a
  paragraph of root-cause detail (that belongs in
  architecture-and-decisions.md, not here).
- A one- or two-sentence intro at the top of each release, in Jared's own
  warm/pastoral voice where possible, welcoming people to check out
  what's new.

## Structure — reuse the app's own four categories

Group entries under the same four categories the in-app "About iWorship"
screen and the marketing deck already use, so the whole product tells one
consistent story everywhere: **Hymnals**, **Host**, **Fellowship**, and
**Spiritual Growth** (once that exists) — plus a fifth, app-only bucket,
**For Church Teams & Admins**, for roster/leadership-facing features that
don't fit the congregant-facing four, and a final **Fixed & Improved**
bucket for bug fixes and small polish that don't deserve their own
headline. Skip any category with nothing to report that release — don't
force an empty section.

## Template

```markdown
# iWorship Update — <Month Year>

<One or two warm sentences introducing this update.>

## 📖 Hymnals
- <headline feature, one line, plain language>

## 🎤 Host
- <...>

## 🤝 Fellowship
- <...>

## 🌱 Spiritual Growth
- <...>

## ⛪ For Church Teams & Admins
- <...>

## 🔧 Fixed & Improved
- <...>

---

🔒 **For Jared only — remove before posting.**
- <any manual step this release still needs, one line each, linking to
  the architecture doc section that spells it out in full>
```

## What this first file is not

This template file itself is never posted anywhere — it's the reusable
shape. The first real release notes, covering everything currently
sitting pending-deploy as of 2026-09-26, are in
`2026-09-26-first-bundle.md` in this same folder.
