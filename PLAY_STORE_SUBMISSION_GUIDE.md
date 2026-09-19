# iWorship — Google Play submission cheat sheet

Reference answers for the two questionnaires Play Console will ask you to
fill out before any release (including closed testing) can go live —
**Data Safety** and **Content Rating**. Based on exactly what the app
actually collects and does (see `firestore.rules` and
`src/data/firestore-data-layer.js` for the source of truth). Google's
exact on-screen wording shifts version to version, but these are the
substantively correct answers regardless of phrasing.

## Data Safety form

**Does your app collect or share any of the required user data types?**
Yes.

**Is all user data encrypted in transit?** Yes (Firestore/Firebase Auth
use HTTPS/TLS).

**Do you provide a way for users to request their data be deleted?**
Yes — via the contact address in the privacy policy (`privacy.html`).

**Data types to declare** — go through Play Console's category list and
mark only these as collected, everything else "Not collected":

| Category | Data type | Collected? | Shared with 3rd parties? | Optional? | Purpose |
|---|---|---|---|---|---|
| Personal info | Name | Yes | No | Yes (only if you sign in) | Account management, App functionality |
| Personal info | Email address | Yes | No | Yes (only if you sign in) | Account management |
| Personal info | User IDs | Yes | No | Yes (only if you sign in) | Account management, App functionality |
| Messages | Other in-app messages | Yes | No | Yes (only if you use session chat) | App functionality |
| App activity | Other user-generated content | Yes | No | Yes | App functionality, Personalization |

("Other user-generated content" = favorited songs, church name, and
display preferences saved to your profile.)

Everything else — Location, Financial info, Health & fitness, Photos and
videos, Audio files, Files and docs, Calendar, Contacts, Web browsing,
App info & performance (no Crashlytics/Analytics is wired in), Device or
other IDs — **Not collected**.

**Is data shared with third parties?** No. Firebase/Google Cloud is the
app's own backend infrastructure (a "service provider" processing data
on the app's behalf), not a third party in Play's sense — nothing is
sold, and there are no ad or analytics SDKs in the app.

## Content rating questionnaire

This is normally a straightforward run of "No" answers for a hymnal app
— no violence, sexual content, gambling, drugs/alcohol/tobacco
references, or profanity in the app's own content.

**One thing to know before you answer honestly:** the questionnaire will
ask something like *"Does your app allow users to interact or exchange
content with each other?"* — for iWorship the answer is **Yes**, because
of the in-session chat (Everyone + Musicians channels). A follow-up
question usually asks whether users can **report or block** other users.
Today the honest answer is **No** — the chat intentionally has no
moderation, blocking, or reporting built in (a disclosed, deliberate
simplification for a small congregation's live-service chat — see the
architecture doc). Answering accurately here is what matters, not what
sounds better — misrepresenting this risks a rejection or a takedown
later, and the honest answer shouldn't cause a real problem for an app
this scale. If Google's review ever flags it, adding a basic "block this
person" control to the chat is a contained, well-scoped follow-up we can
build.

**Target audience / "Made for Kids"**: iWorship is a general-audience
app, not directed at or primarily used by children — answer accordingly
(not a Families/Kids app).

## Before you submit

1. Redeploy the latest `dist` zip (already includes `privacy.html`) to
   Netlify so `https://iworshipv1.netlify.app/privacy.html` is live —
   Play Console needs a real, reachable URL for the privacy policy field.
2. **Done:** the contact email in `privacy.html` is set to
   `w3wares.15@gmail.com`.
3. Make sure PWABuilder's package includes an **AAB** (Android App
   Bundle), not just the APK you've been sideloading — Play Console
   requires the AAB for the actual upload.

## Store listing copy

**Short description** (max 80 characters — this one is 73):
> Hymns, chords, and live worship sessions for your congregation.

**Full description:**
> iWorship is your congregation's hymnal, chord book, and worship
> planner — built to work for everyone in the room at once.
>
> For the congregation: huge, easy-to-read lyrics designed for every
> generation in the pews, with a daily verse and a personal touch on
> your home screen.
>
> For musicians: the same songs with chords, key transposition, and a
> one-tap switch between "Sing Mode" (lyrics only) and "Play Mode"
> (chords, transpose, font size).
>
> For worship leaders: build a setlist before the service, then host a
> live Worship Session — the congregation follows along on their own
> phones in real time, with in-session chat for Everyone and a private
> channel just for the musicians.
>
> Also included: favorites, topical browsing (Salvation, Comfort,
> Praise, and more), one-tap links to learn any song on YouTube, and
> offline access so the app keeps working even with a weak signal.
>
> No ads. No account required to browse. Free.

Adjust freely — this is a first draft, not final copy. Tell Claude if
you want a different tone or to mention your specific congregation by
name.
