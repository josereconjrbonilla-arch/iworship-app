# Data layer interface

Both `local-data-layer.js` (offline/demo mode) and `firestore-data-layer.js`
(real cloud backend) implement this exact same shape. `data/index.js` picks
one at startup based on `isFirebaseConfigured`, and `app.js` never imports
either implementation directly — only this interface — so switching from
demo mode to the real backend is a config change, not a code change.

```
watchSongs(callback)              -> unsubscribe()      // callback(Song[]) — fires immediately, then on any change
addSong(song)                     -> Promise<id>
updateSong(id, patch)             -> Promise<void>       // shallow-merges patch into the song doc (e.g. { themes: [...] } after AI tagging)

watchAuth(callback)               -> unsubscribe()      // callback(User|null)
signInWithGoogle()                -> Promise<User>
signOutUser()                     -> Promise<void>

watchProfile(uid, callback)       -> unsubscribe()      // callback(Profile)
saveProfile(uid, patch)           -> Promise<void>       // shallow-merges patch into the profile

createRoom(room)                  -> Promise<code>
watchRoom(code, callback)         -> unsubscribe()      // callback(Room|null) — null means ended/not found
updateRoom(code, patch)           -> Promise<void>
endRoom(code)                     -> Promise<void>       // also clears the room's chat messages (see below)
watchPublicRooms(callback)        -> unsubscribe()      // callback(Room[]) -- public rooms updated in the last 6 hours only
watchHostRooms(uid, callback)     -> unsubscribe()      // callback(Room[]) -- every room this uid has hosted, any age, for the "My Sessions" cleanup view
checkRoomPassword(code, password) -> Promise<boolean>

checkIsEditor(uid)                          -> Promise<boolean>  // is this uid on the worship team's editor allowlist? (demo mode: always true)
checkIsAdmin(uid)                           -> Promise<boolean>  // is this uid an app Admin? (demo mode: checks a local allowlist, empty by default -- see below)
watchSessionMessages(code, channel, cb)     -> unsubscribe()     // cb(Message[]) — last 200, oldest first, fires on any change
sendSessionMessage(code, channel, message)  -> Promise<void>     // message: { text, senderName, senderUid|null }

watchChurch(churchId, callback)             -> unsubscribe()     // cb(Church|null) — a single church, e.g. the signed-in member's own
watchAllChurches(callback)                  -> unsubscribe()     // cb(Church[]) — every registered church, for the Admin screen's list/picker
newChurchId()                               -> string            // mints a fresh churches/{id} id, unsaved until saveChurch() writes it
saveChurch(churchId, patch)                 -> Promise<void>     // shallow-merges patch into the church doc (create or edit) -- Admin-only, see below
watchAllUsers(callback)                     -> unsubscribe()     // cb(Profile[], each with a uid field) -- every signed-up profile, for the Admin screen's "find by name" search

submitSongRequest(request)                  -> Promise<id>       // request: { title, lyricsRaw, submittedByUid, submittedByName, churchName, possibleDuplicateId, possibleDuplicateTitle } -- see "Song requests" below
watchPendingSongRequests(callback)          -> unsubscribe()     // cb(SongRequest[]) -- every request with status:'pending', oldest first -- the review queue
watchMySongRequests(uid, callback)          -> unsubscribe()     // cb(SongRequest[]) -- one person's own requests (any status), newest first
reviewSongRequest(requestId, patch)         -> Promise<void>     // patch: { status:'approved'|'rejected', reviewedByUid, reviewedByName, reviewNote } -- reviewedAt is stamped by the data layer itself, never trusted from the caller

createSermon(sermon)                        -> Promise<id>       // sermon: { title, speaker, slides, createdByUid, createdByName } -- see "Sermons" below
updateSermon(id, patch)                     -> Promise<void>     // shallow-merges patch (title/speaker/slides) -- creator-only, see firestore.rules
deleteSermon(id)                            -> Promise<void>     // creator, or an Admin/beta tester cleaning up on their behalf
watchMySermons(uid, callback)               -> unsubscribe()     // cb(Sermon[]) -- one person's own sermons, newest-updated first -- powers the Sermons manager AND the host's "pick a sermon to present" list
watchSermon(id, callback)                   -> unsubscribe()     // cb(Sermon|null) -- ONE sermon by id, for whoever's currently viewing a room that's presenting it (host/congregant/projector alike) -- see app.js's ensureViewSermonWatch()

watchDirectory(callback)                    -> unsubscribe()     // cb(DirectoryEntry[]) -- every {uid, displayName, churchName, photoURL, bio, favorites}, open to any signed-in person -- see "Sermon sharing" below and "FELLOWSHIP" for why photoURL/bio/favorites graduated onto this public-by-design entry too
shareSermon(id, uid)                        -> Promise<void>     // adds uid to the sermon's sharedWithUids -- called by the owner (searching the directory) OR by uid themselves (opening a ?sermon=<id> link)
unshareSermon(id, uid)                      -> Promise<void>     // removes uid from sharedWithUids -- same two callers as above, e.g. "REMOVE" on either side of the share
watchSermonsSharedWithMe(uid, callback)     -> unsubscribe()     // cb(Sermon[]) -- sermons someone ELSE built with uid in sharedWithUids, newest-updated first -- powers "Shared With You" and the host picker

createMedia(media)                          -> Promise<id>       // media: { title, type: 'image'|'video'|'slideshow'|'embed', url, storagePath, slides, embedUrl, embedProvider, mimeType, sizeBytes, createdByUid, createdByName } -- see "Media/AVP" below
updateMedia(id, patch)                      -> Promise<void>     // shallow-merges patch -- creator-only, see firestore.rules
deleteMedia(id, media)                      -> Promise<void>     // creator, or an Admin/beta tester cleaning up on their behalf -- `media` (the doc's own fields) is passed through so the REAL backend can also best-effort delete its Storage file(s); the local/demo layer ignores that second arg
watchMyMedia(uid, callback)                 -> unsubscribe()     // cb(MediaItem[]) -- one person's own media, newest-updated first -- powers the Media Library screen AND the host's "pick media to present" list
watchMedia(id, callback)                    -> unsubscribe()     // cb(MediaItem|null) -- ONE media item by id, for whoever's currently viewing a room that's presenting it
shareMedia(id, uid)                         -> Promise<void>     // same shape as shareSermon() -- adds uid to sharedWithUids
unshareMedia(id, uid)                       -> Promise<void>     // same shape as unshareSermon()
watchMediaSharedWithMe(uid, callback)       -> unsubscribe()     // cb(MediaItem[]) -- media someone ELSE uploaded and shared with this uid
uploadMediaFile(file, uid, kind, onProgress) -> Promise<{url, storagePath, mimeType, sizeBytes}>  // kind: 'image'|'video' -- uploads one file to Cloud Storage (real backend) or wraps it in an object URL (demo mode, see local-data-layer.js); onProgress(pct) fires 0-100 as it goes
deleteMediaFile(storagePath)                -> Promise<void>     // removes one uploaded file directly (rarely needed standalone -- deleteMedia() above already does this for a whole media item)
createMediaFolder(folder)                   -> Promise<id>       // folder: { name, createdByUid } -- see "Media Folders" below
updateMediaFolder(id, patch)                -> Promise<void>     // shallow-merges patch (e.g. renaming) -- creator-only, see firestore.rules
deleteMediaFolder(id)                       -> Promise<void>     // un-files (folderId -> null) every media item pointing at this folder, THEN deletes the folder doc -- never deletes the media itself
watchMyMediaFolders(uid, callback)          -> unsubscribe()     // cb(MediaFolder[]) -- one person's own folders, alphabetical by name

createPost(post)                            -> Promise<id>       // post: { authorUid, authorName, text, mediaUrl, mediaKind: 'image'|'video'|null, mediaStoragePath } -- see "FELLOWSHIP" below
deletePost(id, post)                        -> Promise<void>     // author, or an Admin/beta tester moderating -- `post` (the doc's own fields) is passed through so the real backend can best-effort delete its Storage file; local/demo layer ignores that second arg
watchFeedPosts(callback)                    -> unsubscribe()     // cb(Post[]) -- the ONE shared cross-church feed, newest-first, capped to the most recent 100 -- block filtering happens client-side (see below), not in this query
watchUserPosts(uid, callback)               -> unsubscribe()     // cb(Post[]) -- one person's own posts, newest-first -- powers their profile page
submitReport(report)                        -> Promise<id>       // report: { reportedByUid, targetType: 'post'|'profile', targetId, reason } -- status:'pending' and createdAt are stamped by the data layer itself
watchPendingReports(callback)               -> unsubscribe()     // cb(Report[]) -- every report with status:'pending' -- the Admin moderation queue
resolveReport(id, resolvedByUid)            -> Promise<void>     // sets status:'resolved' + resolvedByUid/resolvedAt -- Admin-only, see firestore.rules
dmThreadId(uidA, uidB)                      -> string            // pure function, no I/O -- deterministic 'dm-' + sorted-pair id, so there's ever only one thread per pair of people
ensureDmThread(uidA, uidB, names, photos)   -> Promise<threadId> // checks-then-creates; names/photos: {uid: displayName}/{uid: photoURL} maps stashed on the thread doc so the inbox can render "who's this with" with no extra lookup
watchMyDmThreads(uid, callback)             -> unsubscribe()     // cb(DmThread[]) -- every thread this uid is a participant of, most-recently-active first -- the DM inbox
watchDmMessages(threadId, callback)         -> unsubscribe()     // cb(DmMessage[]) -- one thread's messages, oldest-first, capped to the most recent 500
sendDmMessage(threadId, message)            -> Promise<void>     // message: { senderUid, text } -- also bumps the thread's lastMessageText/lastMessageAt and stamps the SENDER's own readAt.<uid> entry
markDmThreadRead(threadId, uid)             -> Promise<void>     // [v36] merge-writes ONLY this uid's own readAt entry -- called when a thread is actually opened (dock popup or full thread view); powers the Messages unread badge
createGroupChat(group)                      -> Promise<id>       // group: { name, ownerUid, memberUids: string[] } (owner included in memberUids) -- readAt seeds to {ownerUid: now}, lastMessageText defaults to ''
updateGroupChat(id, patch)                  -> Promise<void>     // owner: change anything (rename/add/remove members); any current member: self-removal ONLY (leaving) -- see firestore.rules' narrow carve-out
deleteGroupChat(id)                         -> Promise<void>     // owner-only -- app.js calls this (not the self-removal path above) when the person leaving IS the owner, since an owner-less group could never be managed/deleted again
watchMyGroupChats(uid, callback)            -> unsubscribe()     // cb(GroupChat[]) -- every group this uid is a member of, most-recently-active first
watchGroupChat(id, callback)                -> unsubscribe()     // cb(GroupChat|null) -- ONE group's own doc (name/memberUids/ownerUid), for whoever has its thread open
watchGroupChatMessages(groupId, callback)   -> unsubscribe()     // cb(GroupMessage[]) -- one group's messages, oldest-first, capped to the most recent 500
sendGroupChatMessage(groupId, message)      -> Promise<void>     // message: { senderUid, text } -- also bumps the group's lastMessageText/updatedAt and stamps the SENDER's own readAt.<uid> entry [v36 -- previously only touched updatedAt, see below]
markGroupChatRead(groupId, uid)             -> Promise<void>     // [v36] mirrors markDmThreadRead() -- merge-writes ONLY this uid's own readAt entry; see firestore.rules' groupChats update rule for the narrow carve-out that makes this (and the sender's own stamp above) safe for non-owner members too

likeItem(kind, itemId, uid)                 -> Promise<void>     // kind: 'posts'|'shorts' -- creates likes/{kind}_{itemId}_{uid}; bumps that item's likeCount (real layer: increment(); demo layer: computed fresh, see below)
unlikeItem(kind, itemId, uid)               -> Promise<void>     // deletes that same doc; decrements likeCount
watchMyLikes(uid, callback)                 -> unsubscribe()     // cb(Set<"kind:itemId">) -- every like THIS uid has made, across posts and shorts, one subscription
likeCountFor(kind, itemId)                  -> number            // DEMO LAYER ONLY -- computed fresh from the local likes array; the real layer has no equivalent function, callers read item.likeCount directly instead (see app.js's itemLikeCount())
addComment(kind, itemId, comment)           -> Promise<id>       // comment: { authorUid, authorName, text } -- bumps that item's commentCount
deleteComment(commentId, kind, itemId)      -> Promise<void>     // author or hasFullAccess(); kind/itemId needed to know which parent's commentCount to decrement
watchComments(kind, itemId, callback)       -> unsubscribe()     // cb(Comment[]) -- one item's comments, oldest-first
commentCountFor(kind, itemId)               -> number            // DEMO LAYER ONLY, same shape as likeCountFor
repostPost(uid, name, original)             -> Promise<id>       // creates a new post with a `repostOf` snapshot of `original`; bumps original's repostCount
repostCountFor(postId)                      -> number            // DEMO LAYER ONLY, same shape as likeCountFor
watchMySaved(uid, callback)                 -> unsubscribe()     // cb({kind, itemId, savedAt}[]) -- this uid's own private bookmarks list
toggleSave(uid, kind, itemId)               -> Promise<void>     // adds/removes users/{uid}/saved/{kind}_{itemId}
followUser(followerUid, targetUid)          -> Promise<void>     // creates follows/{followerUid}_{targetUid}; bumps targetUid's followerCount + followerUid's own followingCount (both on directory/{uid})
unfollowUser(followerUid, targetUid)        -> Promise<void>     // deletes that doc; decrements both counts
watchMyFollowing(uid, callback)             -> unsubscribe()     // cb(Set<uid>) -- every uid this uid follows
followerCountFor(uid) / followingCountFor(uid) -> number          // DEMO LAYER ONLY -- computed fresh; the real layer denormalizes both onto directory/{uid} instead (read directoryEntry(uid).followerCount directly)
watchNotifications(uid, callback)           -> unsubscribe()     // cb(Notification[]) -- this uid's own inbox, newest-first, capped at 100
createNotification(recipientUid, payload)   -> Promise<void>     // payload: { actorUid, actorName, type: 'like'|'comment'|'follow'|'repost', kind?, itemId? } -- written by the ACTOR into the RECIPIENT's subcollection; no-ops if recipientUid === actorUid
markNotificationRead(uid, id)               -> Promise<void>
markAllNotificationsRead(uid, ids)          -> Promise<void>
createStory(story)                          -> Promise<id>       // story: { authorUid, authorName, mediaUrl, mediaKind: 'image'|'video', mediaStoragePath }
deleteStory(id)                             -> Promise<void>     // author, or an Admin/beta tester
watchActiveStories(callback)                -> unsubscribe()     // cb(Story[]) -- every story younger than 24h, newest-first, cross-church -- expiry is a client-side filter, not a server-side TTL
deleteExpiredStoriesFor(uid)                -> Promise<void>     // opportunistic cleanup of THIS uid's own >24h-old stories -- called from openProfileEdit()/after createStory(), never on a timer
createShort(short)                          -> Promise<id>       // short: { authorUid, authorName, videoUrl, videoStoragePath, caption }
deleteShort(id, short)                      -> Promise<void>     // author, or an Admin/beta tester; `short` passed through for real-backend Storage cleanup
watchShortsFeed(callback)                   -> unsubscribe()     // cb(Short[]) -- newest-first, capped at 50
```

`Profile` shape: `{ displayName, churchName, mode, scale, theme, favorites: string[],
role, churchId, pastorTitle, isBetaTester, bio, photoURL, photoStoragePath, blockedUids: string[] }`
— `role`/`churchId`/`pastorTitle`/`isBetaTester` are the monetization fields, `null`/`null`/`null`/
`false` until an Admin sets them (see "BETA PHASE" below); `role` is one of `'seniorPastor' |
'pastor' | 'musicDirector' | 'editor' | 'musician' | 'individualPremium' | null`, and `pastorTitle`
is only meaningful when `role === 'pastor'` (e.g. "Music Pastor"). `bio`/`photoURL`/
`photoStoragePath`/`blockedUids` are the Fellowship fields (see "FELLOWSHIP" below) — `''`/`null`/
`null`/`[]` until the person sets up their profile page; `blockedUids` is this person's OWN block
list (who *they've* blocked), never who's blocked them.

`Church` shape: `{ id, name, plan, seatLimits: { pastors, editors, musicDirectors, musicians },
hiddenSongIds: string[], gracePeriodDays, billingCadence, createdAt }`. `seatLimits.pastors`
covers additional (non-Senior) Pastor seats, Full-plan only. `hiddenSongIds` is an exclusion
list, not a second copy of the hymnal — a church's "Church Library" view (see the toggle on
the hymnal browse screen) is the full `songs` collection minus whatever's in this array, so a
member can always switch back to the unfiltered "Public Library" and see everything; this
keeps the "no data walls" principle intact per Jared's fellowship design. `gracePeriodDays`
is fixed at 7 per Jared's answer, stored per-church (not hardcoded) in case an
Enterprise/Custom plan ever needs a different value; not yet enforced anywhere (no billing
exists yet to lapse).

Confirmed by Jared [2026-09-03]: a Pastor seat can assign/remove Editor, Music Director, and
Musician the same as the Senior Pastor, but only the Senior Pastor can grant or remove the
`'pastor'` role itself — "senior pastor is more powerful than pastor in the sense that he can
assign pastors, that's it." Not yet enforced anywhere in the app itself (the Admin screen can
assign any role to anyone, since it's Admin-only already) — see `functions/assignRole` for
where this rule lives once Cloud Functions actually deploy.

## BETA PHASE — no Cloud Functions yet [2026-09-03]

Jared asked to build the monetization backend for a beta test *without* Cloud Functions
(Blaze isn't enabled yet). Rather than wait, `churches/{id}` writes and cross-user `users/{uid}`
writes are allowed directly from the client **for Admins only** (see `firestore.rules`' "BETA
PHASE" comment on both). This is a deliberate, disclosed, narrower version of the original
"only a payment-verified Cloud Function can write these" design — Admins are two specific,
trusted, hand-added people (Jared + one friend via `admins/{uid}`, same doc-exists-only
pattern as `editors/{uid}`), not the general public. A new in-app **Admin screen**
(`state.view === 'admin'`, visible only when `checkIsAdmin()` is true) is where this actually
happens:
- **Register/edit a church** — name, plan, seat limits, billing cadence, and a checkbox list
  to curate `hiddenSongIds` — via `saveChurch()`/`newChurchId()`/`watchAllChurches()` above.
- **Assign a role** — enter a target person's Account ID (shown to every signed-in user on
  their own landing page, for them to copy and send an Admin), pick a role/church/pastor
  title, and it's written straight onto that person's `Profile` via the existing generic
  `saveProfile(uid, patch)` — no new function needed, since `saveProfile` already accepts any
  uid and firestore.rules now allows an Admin to write to any `users/{uid}`.
- **Grant/revoke Beta Tester access** — same mechanism, sets `Profile.isBetaTester`. A beta
  tester bypasses every monetization gate below regardless of their `role` or `churchId` —
  see `hasFullAccess()` in `app.js` and in `firestore.rules`.
- **Find someone by name** [2026-09-04] — both the role-assignment and beta-access forms have
  a "find by name" search above the raw Account ID field, backed by `watchAllUsers()` above,
  so an Admin doesn't need the person to already have copied and sent their Account ID.
  Clicking a result just fills in the Account ID field (which stays visible/editable) rather
  than replacing it outright — pasting an ID directly still works exactly as before, which
  matters since a brand-new sign-in with no display name set yet won't show up in the search
  (nothing to match on) but can still be found by ID from their own landing page.

Testing this locally before a real Firebase project exists: unlike `checkIsEditor` (kept
permissive in demo mode since before any of this existed, so every local session can already
host/add-song), demo mode's `checkIsAdmin` is deliberately **not** permissive — an Admin
bypasses every gate via `hasFullAccess()`, so making it unconditionally true would make it
impossible to ever see an ordinary member's experience locally. It checks a small local
allowlist instead, empty by default. To try out the Admin screen in demo mode, open the
browser console and run
`localStorage.setItem('iworship:local:admins', JSON.stringify(['<uid>']))` with that account's
own Account ID (shown on its landing page), then reload.

Once Blaze is enabled and `functions/` actually deploys, the plan is to tighten `churches/{id}`
back to `allow write: if false` and remove the Admin cross-profile write, routing everything
through the real Cloud Functions + a payment webhook instead — see
`claude/architecture-and-decisions.md`'s "Monetization, phase 3" for that migration note.

## Real enforcement, live now [2026-09-03]

Per Jared's explicit decision (asked directly, not assumed), three things are now actually
gated for everyone, not just beta testers:
- **Play Mode** (chords + transpose) — `canUsePlayMode()` in `app.js`. UI-only: there's no
  separate Firestore write to restrict, since a song's lyrics and chords are already fully
  public-readable together. A determined user could still see chords via browser dev tools —
  an explicitly disclosed "deter casual use, not bank-grade" tradeoff, the same shape as the
  existing room-password hashing tradeoff.
- **Adding songs** — `songs/{songId}` create/update in `firestore.rules`.
- **Hosting a session** — `rooms/{code}` create in `firestore.rules`.

All three accept **either** the legacy `editors/{uid}` allowlist (`checkIsEditor()`) **or**
the new monetization role system (`role === 'editor'`, plus `'musicDirector'`/
`'individualPremium'` for hosting) **or** an Admin **or** a beta tester — so anyone already on
the legacy allowlist (Jared's live worship team today) keeps exactly the access they have now;
the new role system only adds gating for people who were previously wide open (everyone, for
Play Mode) or previously blocked by the same legacy allowlist anyway (add-song/hosting).
**Not** extended to the Musicians chat channel — that's still legacy-allowlist-only, a known,
narrower scope than the rest, see `claude/architecture-and-decisions.md`.

**Still not built, deliberately deferred** (see `claude/monetization-plan.md`'s "Status" for
the live source of truth): the 6-song/day add cap for paid Editors (the *free-tier* request-
and-approve path below is a separate, now-built thing), the tap-to-chord Editor UI, the
ticketing system, and real Stripe billing (`stripeWebhook` in `functions/` is still a stub).
None of these strictly require Cloud Functions to build a first version (e.g. the daily cap
could be a rules-enforced per-user-per-day counter document), but they're separate, non-trivial
pieces of work scoped out of this beta-enablement pass on purpose.

## Song requests [2026-09-04]

The free-access path to still get a hymn into the shared hymnal without paid Add Song rights:
anyone signed in can suggest a title (and optionally paste lyrics) via **Request a Song** — the
button that replaces "Add a Song" for anyone `canAddSongs()` is false for — and a worship-team
editor or Admin reviews it in the **Song Requests** queue (linked from the landing page, visible
only to `state.isEditor || hasFullAccess()` — deliberately narrower than `canAddSongs()`, since
an `individualPremium` person already has their own direct-add access and has no reason to
moderate other congregations' submissions; same reviewer set as the Musicians chat channel).

`SongRequest` shape: `{ id, title, lyricsRaw, submittedByUid, submittedByName, churchName,
possibleDuplicateId, possibleDuplicateTitle, status: 'pending'|'approved'|'rejected',
createdAt, reviewedByUid, reviewedByName, reviewedAt, reviewNote }`. `lyricsRaw` is genuinely
optional — a title-only request is valid, matching the submission form's "leave blank to just
suggest the title" copy.

Duplicate detection (`findPossibleDuplicateSong()` in `app.js`) is deliberately simple:
normalized-title matching (reusing `normalizeForCompare()`, the same helper `detectSections()`
uses for verse/chorus grouping) against the whole library's *titles* only, not lyrics — an
exact match, or one title containing the other once both are at least 6 characters normalized.
It fires live as the submitter types (patched into the DOM in place, not a full re-render, so it
never steals focus mid-keystroke) and is captured once at submit time onto the request itself
(`possibleDuplicateId`/`possibleDuplicateTitle`) rather than recomputed at review time, since the
library can change in between — the reviewer still sees the flag either way, and can submit
knowing it might be a different arrangement or translation of an existing hymn.

**Approve & Add** hands the request's title and, if lyrics were pasted, its auto-detected
sections (run through the exact same `detectSections()` the direct Add Song textarea uses)
straight into that existing Add Song form, pre-filled — the reviewer checks it over (themes
aren't carried over; nothing in a song request captures them) and saves normally, at which point
the request is marked `approved` under the reviewer's name. **Reject** marks it `rejected`
immediately, no note-taking UI in v1 (the data shape has `reviewNote` ready for one if that
turns out to matter). Either way the submitter sees the final status next time they open Request
a Song (`watchMySongRequests`), whether or not they're still around when it happens.

Deliberately **not built**: a live pending-count badge anywhere outside the queue screen itself
(that would mean an always-on `watchPendingSongRequests()` subscription for every signed-in
person just to decide whether to show a number — `firestore.rules`' read rule would deny that
query for anyone who isn't a reviewer anyway, so the subscription only ever starts once someone
opens the Song Requests screen); an edit-after-submit flow for the submitter; and the 6-song/day
cap mentioned above, which is a *paid*-tier limit and orthogonal to this free-tier path.

`Room` shape: `{ code, name, hostUid, hostName, churchName, isPublic, passwordHash, currentSongId, currentSectionIndex, currentContentType: 'song'|'sermon'|'verse'|'media'|undefined, currentSermonId, currentSlideIndex, currentVerseRef, currentVerseText, currentVerseSegments, currentMediaId, currentMediaSlideIndex, mediaPlaying, mediaClockStartedAtMs, mediaClockBaseOffsetSec, stageOverride: 'black'|'logo'|'default-bg'|null|undefined, livestreamUrl: string|null|undefined, setlist: string[], createdAt, updatedAt }`.
`stageOverride` is new [2026-09-24] -- Jared: "I also don't see the background logo, black, or option to add background." Set/cleared by the presenter toolbar's BLACK/LOGO/DEFAULT BG buttons in `renderSessionHost()` (`app.js`), each a toggle: tapping an inactive one writes that string, tapping the active one writes it back to `null`. Deliberately a field that sits ALONGSIDE `currentContentType`/`currentSongId`/etc. rather than replacing them -- it's a cutaway, not a content change, so whatever's actually selected underneath is untouched and reappears exactly where it was the moment the override clears. `resolveLiveDisplayContent()` (not `resolveRoomContent()`) is what actually applies it, and only for the audience-facing surfaces (the host's own LIVE column, the `?stage=` projector, a congregant's in-app live view, and the projector's own keyboard-advance shortcut) -- `resolveRoomContent()` itself stays override-blind on purpose, since the host's own PREVIEW staging (`resolvePreviewContent()`/`ensurePreviewFromLive()`) and the musician chord chart (`renderSessionChart()`, via its own `?chart=` link) both need to keep working from the real underlying selection throughout a blackout. LOGO reads from a new `presenterLogo: {url, storagePath}|null` field on the presenter's own profile doc (`users/{uid}`, alongside the existing `defaultStageBg` field DEFAULT BG reads from) -- see the "Presentation Logo" card in `renderSettings()`, an exact mirror of the existing "Presentation Background" card's upload/replace/remove flow.
`livestreamUrl` is new [2026-09-24] -- Jared, asked about embedding the church's Facebook/YouTube Live: "it's enough for us to just have the option to share the link via chat. like a chat message that remains at the top so joiners can open them." A single plain URL string (or `null`), set/cleared from a new STREAM LINK toolbar panel in `renderSessionHost()` (`renderStreamLinkPanel()`/`attachStreamLinkHandlers()`), gated on `canControlRoom()` same as the stage-override buttons rather than owner-only like Manage Hosts. Deliberately **not** an iframe embed (ruled out early -- most FB/YouTube Live share links aren't in the embeddable URL format without extra parsing, and Jared's own simplified ask above superseded the original embed idea anyway) and deliberately **not** a real chat message (a message scrolls away with the rest of the conversation; a "remains at the top" link needs to live outside the message list). `renderChatSection()` -- shared verbatim by the host's floating chat panel and the congregant's inline chat, per its own pre-existing comment -- reads `state.room.livestreamUrl` directly and renders it as a pinned banner link above the channel tabs/message list when set, so both surfaces pick it up automatically with no per-view wiring.
`currentVerseSegments` is new [2026-09-15] -- `null` for a plain single presented verse, or `[{verse, text}, ...]` (one entry per verse, in combined order) when the host presented a multi-verse selection built via SELECT MULTIPLE VERSES, so every viewer can render each verse's own number as a small superscript ahead of its text instead of a same-size digit baked into `currentVerseText`'s plain string. Written explicitly as `null` (never left `undefined`) whenever a single verse goes live, so it doesn't linger from a previous multi-verse presentation.
The last three fields are new [2026-09-04] -- see "Sermons" below. `currentContentType` absent
(every room created before this feature) or `'song'` both mean the same thing: the original
currentSongId/currentSectionIndex pair is what's live. `updateRoom()` was already a generic
shallow-merge patch in both data layers, and `firestore.rules`' `rooms/{code}` update rule was
already "the host can write anything" rather than an allowlist of specific fields -- so none of
this required a data-layer or rules change, just new fields on an existing doc.

`currentMediaId`/`currentMediaSlideIndex`/`mediaPlaying`/`mediaClockStartedAtMs`/
`mediaClockBaseOffsetSec` are new [2026-09-06] -- see "Media/AVP" below. The last three only ever
matter for a `type:'video'` media item's synchronized playback: rather than continuously writing
the video's playhead position (expensive, and never perfectly smooth), the room doc just states a
simple clock -- `mediaClockStartedAtMs` (a plain client `Date.now()` epoch, NOT `serverTimestamp()`
-- see the comment on `goLive()`'s media branch in `app.js` for why) is the wall-clock moment
`mediaClockBaseOffsetSec` corresponds to, and `mediaPlaying` says whether that clock is currently
ticking forward at all. Every viewer (host split-screen, projector, congregant) computes the
video's own `currentTime` locally from those three fields and nudges the real `<video>` element to
match -- see `syncStageMediaVideo()` in `app.js`.

`Message` shape: `{ id, channel, text, senderName, senderUid: string|null, createdAt }`

`Song` gained `songUseCount: number|undefined` and `songLastUsedAt: timestamp|undefined` [2026-09-24] --
Jared: "song usage tracking, you can add that to admins." A plain running total (not a per-event
log collection -- the ask was "tracking," not a history browser) incremented via
`recordSongUsage(songId)` from `goLive()`'s song branch in `app.js`, fired only once a room write
actually succeeds and only for an actual GO LIVE publish, not staging/PREV/NEXT within the same
song. Surfaced on a new "Song Usage" card on the Admin screen (`renderAdminSongUsageSection()`),
most-used first, with a title filter -- Admin-only, per Jared's ask. **Needs a `firestore.rules`
re-paste**: `songs/{songId}`'s update rule needed a narrow carve-out (any signed-in user, but only
these two fields via `hasOnly()`) since most hosts presenting a song aren't an
editor/`canAddSongsRole()` account -- same "carve out just the fields this action needs" pattern
as sermon/media sharing's `sharedWithUids`-only rule and the room doc's controller-write carve-out
above.

**Bulk Add: CSV/ChordPro file upload** [2026-09-24] -- Jared: "Bulk song import, build that as
well." The Bulk Add screen already let someone paste several songs at once in the app's own
`# Title` plain-text format (`parseBulkText()`); this adds a second, additive input path -- a file
picker (`<input type="file" multiple>`) accepting `.csv`, `.cho`/`.crd`/`.chordpro`, or `.txt`.
`detectBulkFileFormat()` picks a parser per file (extension first, content-sniffed for a bare
`.txt`); `parseCsvText()`/`parseChordProText()` both return the exact same `{songs, warnings}`
shape `parseBulkText()` already does, so `renderBulkPreview()`/`submitBulkImport()` needed no
changes at all. A CSV needs `title`/`lyrics` columns (optional `key`/`themes`/`youtube`);
ChordPro is one song per file, `{title:}`/`{key:}` plus `{start_of_verse}`/`{start_of_chorus}`/
`{start_of_bridge}` section markers (or none at all -- falls back to blank-line grouping). The one
genuinely lucky part: this app's own chorded-lyric storage format already IS ChordPro's inline
`[Chord]word` syntax (see `renderChordLyricLine()`), so a ChordPro file's actual chord/lyric
content needs zero transformation -- `chordProToLabeledText()` only translates the `{directive}`
lines into this app's own explicit section-label convention and hands the result straight to the
existing `detectSections()`, rather than reimplementing section-grouping a second time. No
`firestore.rules` or data-layer change -- this is pure client-side parsing feeding the same
`addSong()` calls Bulk Add already made.

**First-run tour** [2026-09-24] -- Jared: "I'd love the first run tour as well, not just for
hosts, but also for new users." Two independent step-through overlays (`showTourOverlay()`), each
gated by its own per-device `localStorage` flag (`cv:sawWelcomeTour`/`cv:sawHostTour`) so it shows
once per device, not once per account: a GENERAL tour (`TOUR_STEPS_GENERAL`) fires the first time
`renderLanding()` renders a fully set-up Home screen (deliberately skipped while
`needsProfileSetup` is true, so it never competes with the "Almost There" name/church form), and a
HOST tour (`TOUR_STEPS_HOST`) fires the first time `renderSessionHost()` renders. Both are a plain
centered modal card (icon/title/body, dot progress, BACK/NEXT/SKIP/GOT IT, an always-available ×
to dismiss), deliberately NOT a spotlight/coach-mark anchored to specific on-screen elements --
that needs live layout measurement per screen size to position correctly, which is real risk for a
feature with no way to visually verify positioning before shipping; a centered modal covers the
same ground without it. Same one-off-DOM-element pattern (`document.body.appendChild`, independent
of `render()`'s reactive HTML) as `showUpdateBanner()`/`showOfflineBanner()` above. No
`firestore.rules` or data-layer change.

**Projector fullscreen shortcut (F/Escape) + offline-resilient projector** [2026-09-24] -- Jared
tested the projector's F/Escape fullscreen shortcut and reported it didn't work, then separately
asked for the projector to survive going offline. Two fixes: (1) F is now relayed from the Host
Controls window to the separate Presenter/Projector window (`window.open()`-launched, a different
browsing context with its own keyboard focus) via `BroadcastChannel('iworship:projector-fullscreen')`,
keyed by room code -- see the keydown listeners near the projector's own space/arrow shortcut in
`app.js` for the full reasoning; Escape still exits locally via the existing
`toggleStagePresentationMode()`/`fullscreenchange` handling. (2) `watchActiveRoom()` now reads the
Presenter/Projector route's room doc through a new `watchProjectorRoom()` (data layer) instead of
the ordinary `watchRoom()` -- an otherwise-identical twin that reads through a second, isolated
Firebase app instance (`projectorApp`/`projectorDb` in `firestore-data-layer.js`) configured with a
real persistent (IndexedDB-backed) cache, so a projector tab that reloads while offline can still
show its last-known content instead of going blank. This is a deliberately narrow, scoped
re-opening of the persistent-cache question closed by "The `iworship-ph` account reset..." --
see `architecture-and-decisions.md`'s final section for the full reasoning on why this is safe
(the isolated connection never authenticates, since `rooms/{code}` reads are public, so it can't
reproduce the profile/auth race that caused that incident; a cold-start race here, if it still
happens, only ever shows the existing "session isn't available" placeholder for a moment before
self-correcting). Every other route (host, viewer, co-host) is untouched -- still `watchRoom()` on
the original `memoryLocalCache()` connection. `local-data-layer.js`'s `watchProjectorRoom()` is a
plain alias of its own `watchRoom()` (demo mode has no persistence to isolate). No
`firestore.rules` change.

**Same-device room relay** [2026-09-24] -- Jared, live-testing the above: "can't move the
lyrics" while driving both Host Controls and the Projector from one physical device offline. Root
cause: Firestore's own "latency compensation" only ever echoes a tab's write back to THAT tab's own
listener instantly -- the Controls tab sees its own change right away regardless of network, but the
Projector tab is a separate `window.open()`ed context with its own separate connection
(`projectorDb`, isolated on purpose -- see just above), which only learns of the write once it
actually reaches Google's servers and comes back down; with no network at all, it never does. Fix:
a second `BroadcastChannel('iworship:room-relay')`, same zero-network relay pattern as the
fullscreen fix above. `watchActiveRoom()`'s Firestore callback was refactored into a shared
`applyRoomSnapshot(code, room, broadcast)` -- when a non-projector tab's own listener fires
(`broadcast: true`), it re-posts the room snapshot on this channel; the Projector tab's `onmessage`
handler applies that same snapshot locally (`broadcast: false`, so it never re-posts and can't echo
loop). Only the live "pointer" fields need to travel this way -- the actual lyrics are already
sitting in `state.library` in memory on both tabs (`watchSongs()` loads the whole hymnal
unconditionally at startup, independent of Firestore persistence). No `firestore.rules` change.

**"Switching..." veil** [2026-09-24] -- Jared: "when switching pages of projector mode
online/offline, there's a delay... add a loading screen in between... so it doesn't look awkward."
The gap is the same one described just above: GO LIVE writes from Controls, and the Projector tab
only finds out once that write actually reaches it, which can never be truly instant over a real
network even same-device. What CAN be instant is a heads-up that a change is coming: `goLive()` now
also posts a `{pending:true}` ping on the same `iworship:room-relay` channel, immediately before its
`updateRoom()` call -- arriving well before the real update ever could, since it travels the exact
same near-instant relay. The Projector tab's relay handler shows a brief translucent
`.stage-pending-veil` (a spinner over the still-visible previous slide, never a blank screen) the
instant that ping lands, via `showStagePending()`, and clears it the moment the real update arrives
via `applyRoomSnapshot()` (either through this same relay, or through this tab's own
`watchProjectorRoom()` catching up over the network) -- see both functions' own comments in `app.js`
for the full reasoning. `stagePendingTimer` is a safety net that clears the veil on its own if the
expected follow-up update never shows up (a failed write, a closed Controls tab), so it can't get
stuck. This only helps the same-device setup the relay above already covers -- two genuinely
separate machines (a real second computer driving the projector output) have no shared browser to
relay through, so real network latency there is unavoidable, just already minimized by the isolated
low-overhead projector connection. No `firestore.rules` or data-layer change.

**Media load-gated veil** [2026-09-24] -- Jared, after the veil above shipped: "the delay is more
obvious on media." Root cause: song/sermon/verse text needs no network fetch once the room pointer
arrives (already sitting in memory), but an image/video is a real file the browser has to fetch --
completely independent of how fast the pointer itself synced. The original version cleared the veil
the instant `applyRoomSnapshot()` ran, which for media revealed a still-blank/loading `<img>`/`<video>`
underneath it -- the exact gap Jared meant. Fix: `applyRoomSnapshot()` no longer clears the veil at
all -- that decision moved into `renderSessionProjector()` itself, per render. For plain text (or an
`embed` iframe, or media nothing's been chosen for yet -- nothing to fetch either way) it still clears
immediately, same as before (`mediaNeedsLoad` is false). For an actual image/video/slideshow slide, the
veil stays up, the new (loading) element renders underneath it, and a one-time `load`/`loadeddata`/
`error` listener on that exact element (`.stage-media-img`/`.stage-media-video` -- always the fresh one
`renderStageSlide()` just wrote) clears it and re-reveals the slide the moment that fetch actually
finishes -- instantly for anything the browser already has cached, honestly however long it takes for
something genuinely new. `showStagePending()`'s safety timer was extended from 4s to 8s to cover a
slower real fetch without leaving the veil up indefinitely if the expected update never lands at all.
No `firestore.rules` or data-layer change.

**Active Sessions on the landing page** [2026-09-24] -- Jared: "add a feature where we can see
which sessions are currently active especially for hosts in the landing page." No new query or
collection -- `renderLandingActiveSessionsSection()` in `app.js` reuses `hostRoomsList`/
`coHostRoomsList` (My Sessions' own lists -- see `watchHostRooms()`'s comment above: a room doc
only ever exists while it's genuinely live, since `endRoom()` deletes it outright rather than
marking it ended, so every entry in either list already IS a currently-active session) plus
`state.publicRooms` (the same list Join a Session already shows), minus whatever this account
already owns/co-hosts so a host's own room never appears twice on one card. Renders nothing at all
for a non-host visitor when nothing's actually live, so the landing page isn't permanently showing
an empty card; a `canHost()` account still gets a small "No sessions are live right now" card even
then, since being able to check at a glance is the point for a host specifically. RESUME HOSTING/
OPEN/JOIN all reuse the exact same `resumeAsHost()`/`joinAsCoHost()`/`attemptJoin()` these actions
already went through from My Sessions / Join a Session -- no new join or resume path. No
`firestore.rules` or data-layer change -- `rooms/{code}` was already wide-open-read and already
queryable by `hostUid`/`coHostUids`.

## Sermons [2026-09-04]

Jared's ask: "Pastors can upload the outline of their preaching, and how they want each slide to
look like. There will be readymade templates... kinda like powerpoint presentation, where there's
a presented screen, a presenter's control screen... I need that to be with the songs broadcast as
well." A sermon is an ordered list of slides a host builds ahead of time (the **Sermons** screen,
linked from the landing page's Worship Sessions card for anyone `canHost()`), then presents live
from the **Host Session** screen by picking it from a `SERMON` picker sitting right next to the
existing `SONGS` picker -- both write into the exact same room doc, generalized as described
above, and both go through the exact same Presenter/Projector (`?stage=`) and split-screen
machinery already built for songs (`resolveRoomContent()` / `renderStageSlide()` in `app.js`
branch on `content.type` once, so neither the live-sync mechanism nor the stage view needed a
second implementation).

`Sermon` shape: `{ id, title, speaker, slides: Slide[], createdByUid, createdByName,
sharedWithUids: string[], createdAt, updatedAt }` (`sharedWithUids` added [2026-09-04], see
"Sermon sharing" below).

**Slide shape, presentation builder [2026-09-08]:** a `Slide` is now
`{ id, background: Background, blocks: Block[] }` -- a free canvas of independently
positioned/sized blocks instead of the original three fixed templates (Title/Point/Bible Verse,
below). `Background` is `{ type:'color', color:'default'|'wine'|'pine'|'gold'|'black' }` or
`{ type:'image', url, storagePath }`. `Block` is `{ id, type:'text', x, y, w, h, text, align:
'left'|'center'|'right', size:'sm'|'md'|'lg'|'xl', bold }` or `{ id, type:'image', x, y, w, h, url,
storagePath }` -- `x`/`y`/`w`/`h` are all PERCENTAGES of the slide (0-100), which is what lets one
block's position/size render identically (same relative layout) whether it ends up small inside a
`.slide-card` thumbnail, mid-drag in the editor, or full-bleed on a projector -- no separate
per-context layout logic anywhere (see `renderSlideCanvas()`/`renderSlideCanvasEditable()` in
`app.js`). Reasoning, full interaction model (drag/resize/select), and the editor's delegated
pointer-event wiring are written up in `claude/phase4-features-and-scoping.md`.

**Legacy slides**: any `Slide` saved before 2026-09-08 has no `.blocks` array at all -- still
`{ id, template: 'title'|'point'|'verse', heading, subtitle, points: string[], verseRef, verseText
}` (all three templates sharing one shape rather than a discriminated union, a template only ever
reading the fields it uses). `isBlocksSlide(sl)` (`Array.isArray(sl.blocks)`) tells the two apart at
every render site; an old slide keeps rendering exactly as it always did (dead-centered, via the
original `sermonSlideLineParts()`/`sermonLinesAsCardHtml()`/`sermonLinesAsStageHtml()`, unchanged --
also still used, permanently, by the unrelated ad hoc Bible-verse-presenting feature) until it's
opened in the Sermons editor, at which point `migrateLegacySlideToBlocks()` converts it to the new
shape on the spot -- there's no separate "upgrade" button or migration script; hitting SAVE (even
with no edits) on a reopened old sermon is the upgrade, same as any file format migrating the
moment it's resaved.

The verse template's/verse block's **KJV lookup** (`ADD VERSE (KJV)`, previously **LOOK UP FROM
KJV**) reuses the built-in Bible's own data and lookup (`kjvData`/`bibleVerseEntries()`/
`loadKjvData()`) via a small `parseVerseRef()` wrapper that matches a typed "Book Chapter:Verse" (or
same-chapter range, e.g. "Psalm 23:1-6") string against it -- no separate verse data source, and no
network call, since the KJV chunk is already fetched lazily the same way the Bible screen fetches
it. A slide's verse text is copied in as plain text at lookup time (not a live reference), so
editing or removing it later never depends on the Bible feature still being available.

Read access is wide open (`allow read: if true`, same as `songs`/`rooms`) rather than owner-only,
because a room viewer or the Presenter/Projector tab needs to read whichever ONE sermon a room
names by `currentSermonId` (`watchSermon(id)` -- a single-doc get, not a list query), regardless
of who owns it. There is deliberately no "browse all sermons" screen for anyone but the sermon's
own creator, so this openness never becomes an actual list-safety question the way `songRequests`
above did -- see `firestore.rules`' `sermons/{sermonId}` comment. Create/update/delete are
creator-owned, mirroring `rooms/{code}`'s `hostUid`-based ownership exactly. `slides`' shape has
never been enforced there (it's an opaque array as far as `firestore.rules` is concerned), so the
2026-09-08 shape change above needed no rules change at all.

An image block's/image background's upload reuses `uploadMediaFile()` (Media/AVP's own upload
helper, `media/{uid}/images/{fileId}` in Storage) as-is -- no new Storage path, no `storage.rules`
change.

Deliberately **not built**: reordering by drag (the up/down-arrow buttons mirror the pre-service
setlist builder's own reorder controls instead); a live pending/draft indicator anywhere outside
the Sermons screen itself, for the same reason a live Song Requests badge wasn't built either; and
(as of 2026-09-08) any color-picker beyond the five on-brand background presets, or pixel-level
snapping/alignment guides while dragging a block -- both were deliberately left out to keep this a
focused slide builder rather than turning into a second, unrelated general design tool.

## Sermon sharing [2026-09-04]

Jared's ask: "how about we add a share button so pastors can share their sermons to whomever they
want to as long as they have access to it? Like they wanna share it to a friend pastor or to the
AVP team who would be operating it on their behalf" -- then, when asked how the recipient should
be found: "give them a search bar where they can search for Account ID, name, church, and add an
option to share the link as well."

**The access-model question this raised, and how it was resolved.** A real "search other people by
name/church" feature needs *some* collection of other users' profile data that's readable by an
ordinary (non-Admin) signed-in person. `users/{uid}` deliberately isn't that -- its read rule
(`request.auth.uid == uid || isAdmin()`) exists specifically so role/churchId/isBetaTester and the
rest of a profile stay between a person and Admins (see that rule's own comment). Rather than
loosening `users/{uid}` itself -- which would hand every signed-in person read access to every
OTHER person's full profile, monetization fields included, well beyond what sharing a sermon
needs -- a separate, narrower `directory/{uid}` collection was added, holding only
`{ uid, displayName, churchName, updatedAt }` and kept in sync by `saveProfile()` itself (see
`firestore-data-layer.js`) whenever a caller sets `displayName`. It's `allow read: if true`, same
list-safety shape as `songs`/`rooms`/`sermons` themselves (nothing to prove for a query against an
unconditionally-open rule) -- and it exposes nothing that isn't already visible elsewhere in the
app to anyone in a room: a display name and church name both already show on every chat message
and song-request submission. `watchDirectory()` backs the Sermons screen's search box (by exact
Account ID, or a case-insensitive substring of name/church), started only while that screen is
open.

**The sharing relationship itself** lives on the sermon, not the person: `sharedWithUids: string[]`
on the `Sermon` doc (default `[]` at creation). `shareSermon(id, uid)`/`unshareSermon(id, uid)` add
or remove one uid, via `arrayUnion`/`arrayRemove` in the real data layer so two people sharing
around the same moment can't clobber each other. `watchSermonsSharedWithMe(uid)` is an
`array-contains` query, trivially provable under `sermons/{sermonId}`'s already-unconditional read
rule -- no new read-side reasoning needed there, only on the *update* side (next paragraph).
Recipients see these in a "Shared With You" section on the Sermons screen (with a REMOVE action --
`unshareSermon(id, ownUid)`) and in the Host Session `SERMON` picker alongside their own sermons
(`renderSermonPicker()` now concats `state.mySermons` and `state.sharedSermons`) -- `presentSermon()`
just patches the room by id with no ownership check, the same as picking any song from the shared
hymnal.

**The link option** ("share the link as well") is `?sermon=<id>` on the app's own URL (see the
"COPY LINK" button next to the search box, and the deep-link block near the top of `app.js`).
Opening it shows a small read-only preview (title/speaker/slide count/builder name, fetched with
the ordinary `watchSermon(id)`, itself already unconditionally readable) and, once signed in, an
**ADD TO MY SERMONS** button. That button calls `shareSermon(id, theirOwnUid)` -- the recipient
adding *themselves*, not the owner adding them -- which only works because
`firestore.rules`' `sermons/{sermonId}` update rule was given a second, narrow disjunct: any
signed-in person may update a sermon they don't own if `sharedWithUids` (and `updatedAt`) is the
ONLY field being touched. This is what makes the link self-service (no action required from the
sermon's owner for a link recipient to gain access) without opening up the rest of the document --
title/speaker/slides stay creator-only either way. It does not separately verify that the array
only gained/lost the caller's own uid rather than someone else's; given the sermon content itself
is already fully public-readable regardless (see "Read access is wide open" above), a determined
person tampering with someone else's share list is a low-stakes, explicitly accepted gap for this
beta app, the same "deter casual misuse, not bank-grade" tradeoff already made for Play Mode
gating and room-password hashing elsewhere in this file.

## Media/AVP [2026-09-06]

Jared's ask, mid-way through the Preview/Go-Live round: "is there a way for us to upload a
presentation (canva, pptx, google slides embed)? an image? a video? in the app? so it can be used
as a one-stop-shop AVP tool as well." Researched EasyWorship/ProPresenter's own conventions first
(see `claude/phase4-features-and-scoping.md`'s write-up) before building anything: both treat
media as its own library (organized, named, reusable across services) presented live the same way
lyrics are, both support a full-screen image/video as a song background or its own slide, and
ProPresenter 21+ added *native* PowerPoint import (no PowerPoint installation needed) with three
modes -- keep it editable, flatten to images, or (legacy) objects+text.

iWorship's version follows the same shape as Sermons almost exactly -- a `media` doc mirrors a
`sermon` doc's whole access model (creator-owned, wide-open read, the same `sharedWithUids`
self-service sharing carve-out) -- presented from the Host Session screen's new fourth `MEDIA` tab
(alongside `SONGS`/`SERMON`/`BIBLE`) through the exact same Preview/Go-Live staging + Presenter/
Projector + split-screen machinery already built for the other three content types
(`resolveRoomContent()`/`resolvePreviewContent()`/`renderStageSlide()` in `app.js` just branch on
`content.type==='media'` too).

`MediaItem` shape: `{ id, title, type: 'image'|'video'|'slideshow'|'embed', url, storagePath, slides: {url, storagePath}[], embedUrl, embedProvider: 'Google Slides'|'Canva'|'PowerPoint'|'Other', mimeType, sizeBytes, createdByUid, createdByName, sharedWithUids: string[], createdAt, updatedAt }`.
Only the fields relevant to a given `type` are ever set:
- **`image`**: `url`/`storagePath`/`mimeType`/`sizeBytes` for one uploaded file, shown full-bleed
  (letterboxed, never cropped) on stage.
- **`video`**: same shape as `image`, but played back on the room's live-synced clock -- see the
  `Room` shape note above and `mediaPlayPause()`/`mediaRestart()` in `app.js`. Picking/staging a
  video works exactly like everything else (through `hostPreview` + GO LIVE); once it's actually
  live, PLAY/PAUSE/RESTART act as DIRECT live writes (bypassing the preview stage entirely) --
  scrubbing an already-playing video isn't "which thing to show next," it's controlling the thing
  that's already showing, the same reasoning `advanceLiveSection()`/`advanceLiveSermonSlide()`
  already established for the projector's own direct-advance shortcut.
- **`slideshow`**: how a Canva/Google Slides/PowerPoint deck actually gets in here -- **export it
  as images (or a PDF, converted to images) outside the app**, then upload each page as one
  ordered `slides[]` entry, presented and navigated exactly like a sermon's slide array (same
  PREV/NEXT, same jump chips, same `changeMediaSlide()`/`advanceLiveMediaSlide()` pairing as
  `changeSermonSlide()`/`advanceLiveSermonSlide()`). Chosen over trying to parse a real `.pptx`/
  Canva file directly, which would need either a paid conversion API or (per ProPresenter's own
  native-import writeup) a real PowerPoint-format parser -- well beyond a free-tier, no-Cloud-
  Functions app -- and this way the result is just images, so it can never break by a slide
  library's own formatting/quirks.
- **`embed`**: no uploaded file at all -- a pasted public share/embed link (Google Slides
  "Publish to web → Embed", Canva "Share → More → Embed," or a PowerPoint Online embed link),
  rendered in a sandboxed `<iframe>` on stage. `embedProvider` is auto-detected from the URL's
  hostname (`docs.google.com`→Google Slides, `canva.com`→Canva, `onedrive.live.com`/
  `sway.office.com`→PowerPoint, else Other) purely for the library list's own icon/label -- nothing
  about playback depends on which provider it is. **Deliberately, disclosed simplification:** slide
  navigation for an embed happens *inside* that iframe, using whichever player controls the
  provider itself renders (its own on-screen arrows, or the presenter clicking inside it) -- this
  app's own PREV/NEXT/jump/Preview-Go-Live controls don't reach inside a third party's embedded
  player at all. GO LIVE for an embed just means "show/hide this iframe for the room," nothing
  more.

**Cloud Storage, and the same Blaze billing wall this project has hit before.** Image/video bytes
go to Cloud Storage for Firebase (`uploadMediaFile()` in `firestore-data-layer.js`, gated by the
new `storage.rules`) -- the first thing in this whole app to touch Storage at all (see the old
"Deliberately not built: image slides (Firebase Storage is still unused anywhere in this app)"
line in the Sermons section above, now superseded). **Cloud Storage has required the Blaze
(pay-as-you-go) plan for every Firebase project since September 2024, no exception, the same
shape as the Cloud Functions/Firestore-TTL blocker documented elsewhere in this project** -- the
code is fully written and ready, but uploads will fail with a 402/403 until Jared enables Blaze
billing (console → Usage and billing → Modify plan). No-cost usage remains available even on
Blaze (a real free-tier allowance before anything is actually billed), so turning it on doesn't by
itself start a bill for a normal-sized church media library -- see `storage.rules`' own header
comment and `claude/architecture-and-decisions.md` for the full note. Demo/local mode never hits
this at all: `uploadMediaFile()` there just wraps the picked file in a same-tab `URL.createObjectURL`
object URL instead of a real upload (see `local-data-layer.js`) -- enough to build/test the whole
feature end-to-end without Storage, but, unlike every other piece of demo-mode data, it does not
survive a page reload (an object URL only lives as long as the tab that created it does).

**Deliberately not built (v1), noted here rather than silently skipped:** true synchronized
slide-advance inside a live embed (see "embed" above); server-side `.pptx`/Canva-file parsing
(needs a paid conversion API this free-tier app doesn't have); a `?media=<id>` shareable-link
landing screen the way Sermons has (`renderSharedSermonLink()`) -- media sharing today only works
via the in-app directory search on the Media Library screen's SHARE panel, not a standalone link
someone can open cold; congregant phones show media inline in their own small `.slide-card` (an
image renders directly, a video gets native `<video controls>` for opt-in playback, an embed gets
its own iframe) but with **no playback sync attempt at all** for video there -- keeping N phones'
individually varying network conditions in lockstep with the stage screen isn't attempted, only
the projector/stage/split-screen views share one clock.

### Media Folders + in-session upload [2026-09-06]

Jared, after the Media/AVP feature above shipped: "with media uploading, there should be an option
to upload during and within the session. also, these media should be available outside the session
like a separate folder or section where AVPs can prep upload beforehand and manage it by folders."
Two additions, both layered on top of the `MediaItem`/`media` shape above rather than changing it:

**In-session upload.** The Host Session screen's `MEDIA` tab picker (`renderMediaPicker()`) gained
its own "+ UPLOAD NEW" toggle that reveals the exact same segmented IMAGE/VIDEO/SLIDESHOW/EMBED-LINK
row + upload panel the Media Library screen already had (`renderMediaAddPanel()`, now a shared
helper reused by both screens) -- so an AVP operator mid-service can add something new without
navigating away from the live room. A media item uploaded this way is created with `folderId: null`
(unfiled) -- folders are a Media-Library-only prep/organization concept, so the in-session picker
itself stays flat and recency-sorted exactly as before, folder-unaware.

**Folders.** A new `mediaFolders/{folderId}` collection (see `firestore.rules`), deliberately tiny:
`MediaFolder` shape is `{ id, name, createdByUid, createdAt, updatedAt }` -- just enough to group and
label. Nothing here lists a folder's contents; instead every `MediaItem` gained an optional
`folderId` field (absent/`null` = unfiled, at the library's top level). The Media Library screen's
root view now shows folder cards (name + a live item count from the currently-loaded media list)
side by side with any unfiled items -- never a forced click-through just to see loose media -- plus
a "+ NEW FOLDER" action; opening a folder shows a breadcrumb back to root, that folder's items, and
a per-item MOVE action (to another folder or back to Unfiled). Folder cards get RENAME (inline) and
DELETE (same confirm-step UI pattern used elsewhere). **Deleting a folder never deletes the media
inside it** -- `deleteMediaFolder()` above un-files every affected item first (mirrors a real file
manager's "delete this folder, keep the files" behavior, not a bulk-delete) -- see the function
table above and `firestore.rules`' own comment on `mediaFolders/{folderId}` for why this needs no
special server-side cascade rule (the update just uses MEDIA's existing creator-can-change-anything
rule).

Chat channels are just a string `channel` field, not a fixed enum in the data layer —
today the UI offers `'everyone'` (open to anyone in the room, signed in or not) and
`'musicians'` (gated to `checkIsEditor()` worship-team members) via the `CHAT_CHANNELS`
list in `app.js`. Adding another channel later is a small, three-part change: add an
entry to `CHAT_CHANNELS`, decide who can read/write it, and add a matching disjunct to
the `rooms/{code}/messages` rules in `firestore.rules` (see that file's comments).

AI theme tagging (optional, off by default) lives entirely outside this interface —
`src/data/ai-tagger.js` calls a small external Cloudflare Worker directly (see
`src/ai-config.js` and `cloudflare-worker/ai-tagger-worker.js`), not a `data/` function,
since it isn't specific to either data layer. It only ever *reads* a song's existing
fields (title, sections) and writes back via the plain `updateSong(id, { themes })` call
above — both data layers already support that the same way, so AI tagging needed zero
data-layer-specific code.

### FELLOWSHIP [2026-09-08]

Jared: *"How about we create something like a social media in here as well. Like give users an
option to create a profile complete with their own social details. add a feature to post anything
as well from plain text, to videos, images, and etc. Add an option to post a bio as well, like in
facebook. Add their own profile pics as well. The most important thing here is the fellowship so
add an option to send DMs to each other and create group chats as well."* Confirmed cross-church
(same "no data walls" design as the hymnal itself, not scoped per-church), confirmed to include
block/report from day one (not a later add-on), and one follow-up: *"maybe like add 'favorite
hymnals' in the social media feature"* — done by showing the existing `Profile.favorites` heart-
toggle list on the profile page rather than adding a second, separate favorites concept.

**Profile.** Four new `Profile` fields (see the shape note above): `bio`, `photoURL`,
`photoStoragePath`, `blockedUids`. No new upload path for the photo — it reuses the exact same
`uploadMediaFile(file, uid, 'image', onProgress)` call and Storage path (`media/{uid}/images/
{fileId}`) Media/AVP already established, so `storage.rules` needed zero changes for this entire
feature. `bio`/`favorites`/`photoURL` additionally get mirrored onto the person's `directory/{uid}`
entry (see `saveProfile()`'s own comment in `firestore-data-layer.js`) — `users/{uid}` itself is
private-by-default (owner or Admin only), so a public profile page needs its own public-by-design
copy of just the fields meant to be public; `role`/`churchId`/`isBetaTester`/`blockedUids` never
get mirrored anywhere.

**Posts.** A single `posts/{postId}` collection, wide-open read (same reasoning as songs/rooms/
sermons — no data walls), `Post` shape `{ id, authorUid, authorName, text, mediaUrl, mediaKind:
'image'|'video'|null, mediaStoragePath, createdAt }`. A post needs real text or an attached photo/
video, never neither. No edit — delete-and-repost is the whole moderation story, same shape as
songs' own "no update path for the thing that would need re-review." `watchFeedPosts()` is the
first query in this entire app to use a real Firestore `orderBy()+limit()` server-side (every
other list query here deliberately avoids `orderBy` to sidestep needing a composite index, sorting
client-side instead) — safe here specifically because a lone `orderBy` with no accompanying
`where()` needs no composite index.

**Block.** `Profile.blockedUids` is reused as-is, no new collection. Blocking is enforced two
places: client-side, `watchFeedPosts()`'s results get filtered by `!blockedUids.includes(authorUid)`
before rendering (see `app.js`'s `isBlockedByMe()`); server-side (the part that actually matters),
`firestore.rules`' `blockedUidsOf()`/`dmOtherUid()` helpers check BOTH directions (did I block them
/ did they block me) on every `dmThreads/{threadId}` create AND every message create inside it, so
blocking mid-conversation is enforced immediately, not just for a brand-new thread. There's no
"blocked users" collection or list surfaced anywhere in the UI *except* a "Blocked Accounts" panel
on My Profile — deliberately added, not an afterthought: once someone's blocked, their posts/DM-
search/group-invite-search results all disappear (by design), which would otherwise leave literally
no way back to their profile to ever unblock them again.

**Reports.** A single `reports/{reportId}` collection. `Report` shape `{ id, reportedByUid,
targetType: 'post'|'profile', targetId, reason, status: 'pending'|'resolved', createdAt,
resolvedByUid, resolvedAt }`. Anyone signed in can file one; only `hasFullAccess()` (Admin or beta
tester) can read the pending queue or resolve one — mirrors the Song Requests review queue's own
shape. The Admin screen's "Reports" section resolves a report's `targetId` into a readable summary
using whatever's already loaded client-side (`state.feedPosts`/`state.directory`) rather than a
second fetch — good enough for a first pass, and never blocks the queue from rendering if the
underlying post/profile is already gone.

**DMs.** `dmThreadId(uidA, uidB)` is a pure, deterministic `'dm-' + [uidA, uidB].sort().join('_')`
— guarantees exactly one thread per pair of people, ever, regardless of who messages first.
`DmThread` shape `{ id, participantUids: [uidA, uidB], participantNames, participantPhotos,
readAt, lastMessageText, lastMessageAt, createdAt }`; messages live in a `messages` subcollection,
`DmMessage` shape `{ id, senderUid, text, createdAt }`. `ensureDmThread()` checks-then-creates rather
than always creating fresh.

**Group chats.** A single `groupChats/{groupId}` collection (not subcollections-of-a-thread the
way DMs are), `GroupChat` shape `{ id, name, ownerUid, memberUids: string[], readAt, lastMessageText,
updatedAt, createdAt }`; messages live in a `messages` subcollection, `GroupMessage` shape
`{ id, senderUid, text, createdAt }`. The owner can rename/add/remove members/delete; any OTHER
member can only remove themselves (leaving) — a self-service carve-out mirroring the sermon/media
`sharedWithUids` self-removal pattern elsewhere in this app. The owner has no such self-removal
path (leaving would orphan the group with no one able to manage/rename/delete it again), so
`app.js`'s "leave" button reads DELETE GROUP instead of LEAVE GROUP for the owner, and really does
delete the whole group for everyone via `deleteGroupChat()` — messages left in the subcollection
aren't swept, since nothing ever queries them again once the parent doc (the only thing any query
filters on, via `memberUids`) is gone.

**readAt / unread tracking [v36].** Both `DmThread` and `GroupChat` carry a `readAt: {uid: timestamp}`
map — one entry per participant/member, stamped with when THEY last "read" that thread/group.
`ensureDmThread()`/`createGroupChat()` seed it at creation time (both DM participants for a
brand-new empty thread; just the owner for a brand-new group, so newly-added members correctly see
it as unread). `sendDmMessage()`/`sendGroupChatMessage()` merge-write the SENDER's own entry on every
send (so nobody sees their own message as unread); `markDmThreadRead()`/`markGroupChatRead()`
merge-write the CALLER's own entry, and are called whenever a thread is actually opened, whether
through the floating chat dock or the full thread view. `app.js`'s `unreadMessagesCount()` (the
topbar Messages badge) counts a thread/group as unread when its own `lastMessageAt`/`updatedAt` is
newer than the signed-in uid's `readAt` entry. `firestore.rules`' `dmThreads` update rule already
let either participant update any field on their own thread (no field-level narrowing existed there
to begin with), so DM readAt writes needed no rules change; `groupChats`' update rule DID need a new
narrow carve-out (a member may merge-write `lastMessageText`/`updatedAt`/`readAt`, but only their own
key inside `readAt`) — see that rule's own comment for how it also fixed a pre-existing bug where a
non-owner member's `sendGroupChatMessage()` follow-up parent-doc update always failed
permission-denied.

**Deliberately not built (v1), noted here rather than silently skipped:** editing a post after
posting (delete-and-repost only, see above); push notifications for a new DM/group message/mention
(read receipts/unread tracking shipped in v36 — see above); a public "browse the whole directory"
screen (profiles are reached by tapping a name wherever one already appears — a post's author, a
DM, a group member row — not by browsing a list); muting a group chat without leaving it; renaming
yourself out of a group chat's history (a member who leaves keeps appearing on already-sent
messages under their name at the time, same as any chat app); an in-app image/video cropper or
compressor before upload (same disclosed Blaze-billing dependency as Media/AVP: uploads work
against a real Firebase project once Cloud Storage/Blaze billing is enabled there, and demo mode's
`uploadMediaFile()` wraps the file in a same-tab `URL.createObjectURL` instead, which — like every
other Media/AVP object URL — doesn't survive a page reload).

### FELLOWSHIP REDESIGN [2026-09-09]

Jared, right after v22 shipped: *"I think it's better if the fellowship part looks like an actual
social media feed. Get best practices from facebook, tiktok, and etc. Add options to upload shorts
videos, as well, and a feed for shorts. Like crazy features of social media. So it will be like
another interface all on its own in the same app, then the user can switch between the worship
interface and the fellowship interface."* Clarifying answers: all four engagement features (likes,
comments, share/repost, save/bookmark); Shorts as full-screen vertical swipe+autoplay "if doable,
else a tap-to-play grid" (full swipe+autoplay shipped — see "Shorts" below); a hamburger menu
housing account settings/log out/switch-interface/"other features you can think of", plus a header
avatar next to the logo opening your own profile; and all three of Notifications, Explore/Discover,
and Stories. A follow-up message added people-search: *"add a feature where people can search for
people and interact just like facebook."*

**Likes.** One shared `likes/{kind}_{itemId}_{uid}` collection (`kind` is `'posts'` or `'shorts'`,
one collection instead of four so the same action-bar code works on either feed). The doc id is
deterministic, so liking twice is a no-op and unliking is just deleting that one doc — no read-
then-write race. The real layer denormalizes a `likeCount` field directly onto the post/short doc
via `increment()` (so displaying a count never needs a subcollection read); the demo layer instead
computes it fresh from the flat local array every time, since there's no read cost to avoid at that
scale — see `likeCountFor()`'s comment. `app.js`'s `itemLikeCount()` is the one place that reads
either shape uniformly.

**Comments.** One flat `comments/{commentId}` collection (not a subcollection), filtered by
`kind`+`itemId` — two plain equality filters need no composite index (Firestore merge-joins
single-field indexes for pure-equality multi-field queries), sorted client-side. Bumps the same
`commentCount` counter pattern as likes. Only the commenter or `hasFullAccess()` can delete a
comment — deliberately NOT the post's own author (an author silently deleting a comment they
dislike wasn't asked for; REPORT + a real Admin is the same moderation path every other content
type in this app already uses).

**Repost.** Reuses `posts/{postId}` itself — a repost is just a normal post authored by the
reposter, carrying a `repostOf` SNAPSHOT (`{ postId, authorUid, authorName, text, mediaUrl,
mediaKind }`) of the original at repost time, not a live reference — so it still renders correctly
even if the original is later deleted. Bumps the original's `repostCount`. Shorts have no repost
(scope cut — Jared's engagement-feature answer named posts' feed, not Shorts specifically, and a
"repost a Short" concept would need its own UI decision nobody asked for yet).

**Save/Bookmark.** A private `users/{uid}/saved/{kind}_{itemId}` subcollection — owner-read/write
only, no directory mirror (unlike a favorite hymn, a saved post is explicitly private, closer to a
bookmarks folder). No dedicated "My Saved Posts" screen shipped yet (noted below) — the data layer
and the save/unsave toggle are both fully built and tested; only the browse-your-saves screen was
deferred as a reasonable v1 cut given everything else in this pass.

**Follow.** A `follows/{followerUid}_{targetUid}` collection, one-directional — a judgment call:
Jared's phrase was "interact just like facebook," and Facebook actually supports both a symmetric
Friend request/accept AND an asymmetric Page/public-figure Follow. Building a request/accept inbox
would have meant an entirely new pending-request UI and notification type nobody specifically asked
for; a one-directional follow (Instagram/Twitter/Facebook-Page-style) delivers the same practical
outcome — "keep up with someone, see them highlighted, they know you're interested" — with far less
net-new surface area, and is trivially reversible (unfollow) if this guess turns out wrong.
`followerCount`/`followingCount` are denormalized onto `directory/{uid}` (real layer: `increment()`
on both docs; demo layer: computed fresh, joined onto `watchDirectory()`'s own results so
`directoryEntry(uid).followerCount` reads identically either way).

**Notifications.** `notifications/{recipientUid}/items/{itemId}`, written by the ACTOR whose
like/comment/follow/repost triggered it, directly into the RECIPIENT's own subcollection — the
inverse of every other ownership rule in this app (the writer isn't the owner of what they're
writing into, by design). Only the recipient can ever read their own inbox or mark something read.
No push notifications (same "deliberately not built" cut as DMs/group messages above) — this is an
in-app bell + badge only, populated live via `watchNotifications()`, which every screen keeps
running from the moment someone signs in (see `app.js`'s `startSocialWatches()`), not just while a
Notifications screen happens to be open, since the header badge needs to be live everywhere.

**Stories.** `stories/{storyId}`, wide-open read/cross-church like posts, `{ authorUid, authorName,
mediaUrl, mediaKind, mediaStoragePath, createdAt }`. 24-hour expiry is a pure client-side filter in
`watchActiveStories()` (`createdAt` within the last 24h) — no Cloud Function sweeps old docs, same
"nothing in this app runs on a timer" principle as everywhere else; `deleteExpiredStoriesFor(uid)`
is instead called opportunistically (opening My Profile, right after posting a new story) so a
person's own old story docs don't accumulate forever, without needing a scheduled job to do it.

**Shorts.** `shorts/{shortId}`, its own feed entirely separate from the text/image/video post feed
— `{ authorUid, authorName, videoUrl, videoStoragePath, caption, likeCount, commentCount,
createdAt }`, reusing likes/comments via `kind:'shorts'`. The vertical swipe+autoplay feed (option 1
of the two offered) turned out to be reliably buildable with plain CSS (`scroll-snap-type:y
mandatory` on the container, `scroll-snap-align:start` per card) plus an `IntersectionObserver` to
play/pause whichever video is actually on screen — no gesture library needed — so that shipped
rather than falling back to the tap-to-play grid. One deliberate simplification: it's a tall,
self-contained scroll region (`.shorts-feed`, capped height) rather than hijacking the whole page's
scroll the way a native TikTok-style feed would — keeps the BACK button/subnav on screen the whole
time and doesn't touch the `main-full-bleed` mechanism the Presenter/Projector view already owns for
an unrelated reason.

**Interface switch + navigation chrome.** Jared's own answer superseded the two options originally
offered (a bottom tab bar, or a top toggle button): *"add a burger button where the other stuff can
also be transferred to like account settings, log out, switch interface, and other features..."*
`app.js`'s `FELLOWSHIP_VIEWS` array names which `state.view`s count as "the Fellowship interface";
the hamburger's one "SWITCH TO WORSHIP/FELLOWSHIP" item reads that set to know both its label and
its direction. The hamburger (opened from a button that's always visible, signed in or out) also
absorbed PLANS & PRICING, SONG REQUESTS, and ADMIN TOOLS — previously landing-page-only links — as
the "other features you can think of" Jared invited; those links stay on the landing page too
(nothing was removed, only duplicated somewhere more reachable). The header avatar (next to the
logo, exactly as asked) opens My Profile; it and the notification bell live in `index.html`, OUTSIDE
`#main`, so they persist across every `render()` instead of being torn down and rebuilt per screen —
see `app.js`'s `renderHeaderChrome()`.

**People search.** No new data layer at all — reuses `state.directory` (already loaded by
`watchDirectory()`, the exact same client-filtered-by-name/church search every other "find someone"
box in this app already does for starting a DM, adding a group member, or sharing a sermon), now
surfaced as its own search box on the Explore screen with FOLLOW/MESSAGE/VIEW PROFILE on every
result — the "interact just like facebook" ask.

**Explore/Discover.** Deliberately NOT a new query — `trendingPosts()` in `app.js` just re-sorts the
SAME `state.feedPosts` already loaded by `watchFeedPosts()`, by like count (within a 14-day window,
so a months-old post's stale high count doesn't dominate forever) instead of recency. A dedicated
`orderBy('likeCount','desc')` Firestore query was considered and rejected: Firestore's `orderBy`
silently EXCLUDES any document missing that field, so a post from before this feature existed (or
one that's simply never been liked) would vanish from Explore entirely rather than correctly
sorting last. Suggested people are directory entries you don't already follow.

**Deliberately not built (v2), same "noted here, not silently skipped" convention as v1 above:** a
dedicated "My Saved Posts" browse screen (the save/unsave toggle and its data are fully live; only
the list-everything-you've-saved screen was cut); a request/accept Friend model alongside the
one-directional Follow that shipped (see "Follow" above for the reasoning); reposting a Short;
push notifications for any of the new engagement types (in-app bell/badge only); a "who liked this"
list on a post/short (the count is public, the list of likers currently isn't surfaced anywhere);
comment replies/threading (comments are a single flat list per post/short, not nested); Stories
seen-by/viewer-list; a truly full-bleed, whole-page-hijacking Shorts experience (shipped instead as
a tall self-contained scroll region — see "Shorts" above).

## Program Builder [2026-09-24]

Jared's ask: "what if we had another feature where the host can arrange the sequence of everything
that will be presented? Along with notes and remarks for context, like a service program builder.
Make it accessible for other members that the host will share it with" -- followed shortly after by
"hosts have the option to tick off or check out the completed parts." A **program** is a host-built
order-of-service: an ordered list of items (song/sermon/verse/media/other), each with a resolved
label, an optional point-of-contact, free-text notes, an estimated duration, and a `done` checkbox
a host or any shared collaborator can tick off live as the service actually runs.

**Data model.** `Program` shape: `{ id, title, createdByUid, createdByName, sharedWithUids: string[],
items: [{ id, type: 'song'|'sermon'|'verse'|'media'|'other', label, refId, pocUid, pocName, notes,
durationMinutes, done }], createdAt, updatedAt }`. `refId` points at the linked `song`/`sermon`/
`media` doc for those three types (its CURRENT title is what actually displays --
`programItemDisplayLabel()` in `app.js` looks the linked item up live rather than trusting a
possibly-stale stored `label` -- so renaming a song elsewhere updates every program that references
it); `verse`/`other` items have no linked doc, just the free-text `label` itself. Lives in its own
top-level `programs/{programId}` collection (both `firestore-data-layer.js` and
`local-data-layer.js` implement the identical function set: `createProgram`, `updateProgram`,
`deleteProgram`, `watchMyPrograms`, `watchProgram`, `shareProgram`, `unshareProgram`,
`watchProgramsSharedWithMe`) -- as close a copy of Sermons' own data layer and `firestore.rules`
shape as the extra collaborative-checkbox requirement allows: wide-open read (no "browse all
programs" query anywhere, only ever a single-doc read by id, exactly like a sermon or a media
item), creator-only create, the same `sharedWithUids` self-service SHARING carve-out a share link
uses to add/remove the visiting uid. The one place Programs' `firestore.rules` update rule
diverges from Sermons/Media's two-disjunct shape is a THIRD disjunct: anyone currently listed in
`sharedWithUids` may also patch `items`+`updatedAt` (nothing else), which is what lets
`toggleProgramItemDoneLive()` actually work for a shared collaborator, not just the program's
creator -- see the rule's own comment in `firestore.rules` for the exact reasoning and its accepted
tradeoffs.

**Editor screen** (`renderPrograms()`/`renderProgramEdit()` in `app.js`, reached from a new
`PROGRAMS` button on the Host Hub, `canHost()`-gated): a library list mirroring Sermons' own
(create/open/share/delete), and a per-program item editor mirroring Sermons' slide editor --
add/reorder/remove items, pick each item's type (which swaps in either a linked-content `<select>`
of songs/sermons/media, or a free-text label input for verse/other), notes, an estimated duration,
and a POC field with the same directory-search-and-pick pattern shareSermon()'s panel already uses.
Sharing works exactly like a sermon: a `?program=<id>` link (`renderSharedProgramLink()`, the
`shared-program-link` view) that a signed-in recipient opens to add themselves to `sharedWithUids`
on the spot, same self-service carve-out.

**Room integration.** No new room-doc shape needed -- `room.programId` (which program is currently
attached) and `room.programCurrentItemId` (the current item's own `id`, deliberately not an array
index, so it survives the host reordering or editing items mid-service) are just two more fields on
the existing wide-open `rooms/{code}` update rule, the same way `currentSermonId`/`currentMediaId`
needed no rules change either. The Host Session screen gets a fifth content tab, `PROGRAM`
(alongside `SONGS`/`SERMON`/`BIBLE`/`MEDIA`, keyboard shortcut `5`), rendered by
`renderProgramPanel()`: with no program attached yet, an attach-picker over `state.myPrograms`
concat `state.sharedPrograms`; once attached, the live item list with, per item, a `done` checkbox
(`toggleProgramItemDoneLive()` -- merge-patches just that one item's `done` flag via `updateProgram()`,
which is exactly the field-narrow write the new `firestore.rules` disjunct exists for), a PRESENT
button (`presentProgramItem()` -- calls straight into the existing `chooseSong()`/`presentSermon()`/
`presentMedia()` staging functions per item type, so it's staged into `hostPreview` and still gated
behind the existing GO LIVE button like every other content type; also switches the visible content
tab to match and records `programCurrentItemId`), and, for an item with a POC assigned, a GIVE
CONTROL button (`giveControlToProgramPoc()` -- owner-only, reuses the existing `coHostUids`/
`controllerUid` co-hosting mechanism, auto-adding the POC as a co-host in the same write if they
aren't one already).

**One-way song sync.** Attaching a program to a room (`attachProgramToRoom()`) additively merges
every song `refId` among its items into `room.setlist` -- appends anything not already there,
never removes or reorders an existing entry -- so the setlist a host already knows how to run stays
the single source of truth for actually picking a song to present; the program is an outer sequence
wrapped around it, not a replacement for it. This merge does NOT re-run on every silent program
edit (adding/removing a song item later needs a deliberate SYNC SONGS TO SETLIST button --
`syncProgramSongsToSetlist()`), so a host mid-service never gets their current setlist silently
reshuffled underneath them by an edit happening elsewhere. Detaching (`detachProgramFromRoom()`)
clears `programId`/`programCurrentItemId` but never touches `setlist` -- the synced songs stay.

No `firestore.rules` change was needed for any of the room-integration or setlist-sync fields
above -- they're just more fields on `rooms/{code}`'s already wide-open per-field update rule,
the same story as every other room-doc addition documented throughout this file.

## Spiritual Growth [2026-09-28]

Gospel invitation -> confirmation -> discipleship path -> personal journal. Full copy (and the six
decisions Jared confirmed before this was built) lives in `docs/spiritual-growth-draft-copy.md` --
this section is the data shape only. Deliberately the most private data this app stores: a
profession of faith and a personal journal are about as sensitive as app data gets, so
`spiritualGrowth/{uid}` (and its `journal` subcollection) is the one collection in the whole app
with **zero Admin visibility anywhere in `firestore.rules`** -- strictly owner-only, full stop, not
even an Admin bypass. See that file's own header comment on the block.

`SpiritualGrowth` doc (`spiritualGrowth/{uid}`) shape: `{ professedAt: Timestamp|null, milestones: {
[topicKey]: {completedAt: Timestamp}|null } }`. `professedAt` is set once, idempotently, by
`recordSalvationDecision(uid)` -- called when someone taps "I've already trusted Christ" on the
Gospel Invitation screen (`renderSpiritualGrowthInvitation()` in `app.js`); tapping it again (a
reload, a second visit) is a safe no-op, never overwriting the original timestamp. `milestones` is
keyed by each topic's key in `SPIRITUAL_GROWTH_TOPICS` (`app.js`) -- `setMilestoneComplete(uid, key,
completed)` toggles one entry at a time via a narrow merge write, leaving every other topic's own
entry untouched. Both read live via `watchSpiritualGrowth(uid, callback)`.

`JournalEntry` shape (`spiritualGrowth/{uid}/journal/{entryId}`): `{ text, milestoneKey: string|null,
createdAt: Timestamp }`. `milestoneKey` links a reflection back to whichever topic prompted it (set
from the "add a reflection" box on a milestone's own reading screen) or stays `null` for an
open-journal entry written from the Journal tab directly with no topic in mind -- either kind reads
back through the exact same `watchJournalEntries(uid, callback)` list, newest first
(`orderBy('createdAt','desc')`), and the Journal screen doesn't visually distinguish the two beyond
an optional small "from: <topic title>" tag on a milestone-linked entry. `addJournalEntry(uid, text,
milestoneKey)` / `deleteJournalEntry(uid, entryId)` round out the CRUD -- there's no edit-in-place;
correcting an entry is delete-and-rewrite, same as this app's existing Fellowship comments.

Not built in this pass, on purpose (all four were explicitly out of scope per the discipleship-copy
review): any follow-up/notification to a pastor or admin when someone professes faith or completes a
milestone (the privacy decision above means the app itself has no visibility to notify FROM); a
progress badge/percentage anywhere outside the path screen itself; a way to un-profess/reset
progress (Settings has no "clear my Spiritual Growth data" control yet -- would need its own
explicit ask, given how sensitive this data is); and any tie-in to Fellowship (a profession or
journal entry is never shareable to the feed, unlike a devotional).

### Expanding Discipleship Path: custom topics [2026-09-28 continued]

Jared, after the Path first shipped: "bro growth means continual. why does it end after the last
lesson?" -- first answered narrowly with a "Growth Doesn't Stop Here" completion card pointing on to
Journal/Devotionals. He then confirmed the broader ask directly: "yep I want an expanding path" -- the
Path itself should be able to grow with new topics over time, not just the 9 built-in ones.

The 9 built-in `SPIRITUAL_GROWTH_TOPICS` (`app.js`) are left completely untouched -- no migration,
since `spiritualGrowth/{uid}`'s `milestones` map is keyed by topic `key` and those keys never change.
Additional topics instead live in a new, separate, top-level collection, `growthTopics/{topicId}`:
`{ title: string, blocks: Block[], createdAt: Timestamp, createdBy: uid }`, where `Block` is the exact
same shape `renderSgBlocks()` in `app.js` already consumes for a built-in topic's reading content
(`{type:'p'|'label'|'verse', text, ref?}` -- `'p'` is a plain paragraph; the admin authoring UI (see
below) labels these Paragraph / Section Label / Bible Verse. See the built-in topics' own definitions
for the precise per-type fields). `watchGrowthTopics(callback)` / `addGrowthTopic(title, blocks)` /
`deleteGrowthTopic(topicId)` are the only three functions -- v1 is deliberately add + list + delete
only, no edit/reorder (topics sort by `createdAt` ascending; a wrong one gets deleted and re-added
rather than patched in place).

🔶 **Write access is Admin-only** (`firestore.rules`' `growthTopics/{topicId}`: `allow read: if
isSignedIn(); allow write: if isAdmin();`) -- the same gate as `churches/{churchId}` and every other
doctrinal-content collection in this file (who can add a discipleship lesson is the same question as
who can add a hymn or register a church). This is a default, not something Jared was asked to
confirm first -- flagging it here in case he wants topic-authoring opened up to another role (e.g.
editors) later, which would just mean loosening this one rule line.

`app.js` merges built-in + custom at render time via `allSpiritualGrowthTopics()` (built-in array
concatenated with `state.spiritualGrowthCustomTopics`, the latter populated by a
`startGrowthTopicsWatch()` call alongside `openSpiritualGrowth()`'s existing
`startSpiritualGrowthWatch()`/`startJournalWatch()`), rather than migrating or duplicating data --
every existing callsite that used to read `SPIRITUAL_GROWTH_TOPICS` directly (the Path list, the
all-done completion check, the topic-detail screen, and the Journal's "from: &lt;topic&gt;" lookup)
now reads through this merged accessor instead, so a custom topic behaves identically to a built-in
one everywhere in the UI once it's Admin-authored. Authoring itself is a new Admin-only card
(`renderAdmin()`) with a repeatable block-list editor (add/remove a block, each with a type selector
-- Paragraph / Section Label / Bible Verse -- and that type's own field(s)) rather than a parsed-text
mini-syntax, since Jared authors these himself and isn't a developer.

## "BUILD THEM ALL NOW" batch 1: Testimony Wall, Prayer Wall, Bible Reading Plan [2026-09-28]

After the "Introducing iWorship" launch deck's 13 feature ideas, Jared: "I LIKE YOUR IDEAS, BUILD
THEM ALL NOW." Sequenced into 5 batches by the deck's own theme grouping; this is batch 1
(Discipleship & Spiritual Life). All three are reached as three new cards on
`renderSpiritualGrowthHome()`'s hub (alongside Invitation/Confirmation/Path/Journal), using the exact
same `spiritualGrowthScreen`/`goToSgScreen()`/`goBackSgScreen()` drill-down mechanism -- not new
primary bottom-tabs, since Jared separately said the nav was already "crowded" right before Growth
itself got promoted to a tab.

**Testimony Wall** (`testimonies/{testimonyId}`): `{ authorUid, authorName, title: string|null, text,
likeCount, createdAt }`. Wide-open read (`allow read: if true`), same "no data walls, cross-church"
reasoning as Fellowship posts and sermons. Deliberately much thinner than a Fellowship post -- no
comments, no repost -- just the text plus an "Amen" tap. That tap **reuses the existing generic
`likes/{likeId}` mechanism** posts/shorts already share (`'testimonies'` added to that rule's `kind`
allowlist) rather than a new counter mechanism: `likeItem('testimonies', id, uid)` /
`isLikedByMe('testimonies', id)` / `itemLikeCount('testimonies', item)` are the exact same helper
calls Fellowship's own like button uses. `watchTestimonies(callback)` / `addTestimony(authorUid,
authorName, title, text)` / `deleteTestimony(id)` round out the CRUD -- add + list + delete only, no
edit (same "delete and re-share is the simplest moderation story" as posts/{postId}).

🔶 **No pre-review/moderation queue** -- a testimony goes live immediately on save, exactly like a
Fellowship post does today. This is a default, not something Jared confirmed first: flagging it here
in case a moderation queue (mirroring Song Requests' pending/reviewed shape) turns out to matter once
real testimonies start coming in.

**Prayer Wall** (`prayerRequests/{requestId}`): `{ authorUid, authorName, requestText, onBehalfOf:
string|null, isPrivate: boolean, status: 'open'|'answered', answeredNote: string|null, likeCount,
createdAt, updatedAt }`. Unlike testimonies, **not** wide-open read -- a private request is as
sensitive as a journal entry, so `firestore.rules` gates read to the author, OR (once `isPrivate ==
false`) any signed-in person, OR an Admin/beta tester. Two independent watches, each provable on its
own the way every other OR-shaped read rule in this app already is:
`watchPublicPrayerRequests(callback)` (`where('isPrivate','==',false)`) and
`watchMyPrayerRequests(uid, callback)` (`where('authorUid','==',uid)`) -- `app.js`'s
`prayerWallRequests()` merges the two callbacks and de-dupes by id (a person's own public request
would otherwise show up from both watches at once). Neither query uses `orderBy` (this app's
established way of avoiding a composite-index requirement); both callbacks hand back an
already-client-sorted (newest-first) list.

"Praying for this" **also reuses the generic likes mechanism** (`'prayerRequests'` added to the same
`kind` allowlist) -- the Firestore field is still literally `likeCount` even though the UI labels the
tap "🙏 I'm praying," purely to avoid standing up a second, near-identical counter mechanism just for
a different display label (see that rule's own comment in `firestore.rules`). The update rule's
likeCount-only carve-out is further gated to `isPrivate == false`, so a private request's counter can
never be bumped by anyone but its own author. `addPrayerRequest(authorUid, authorName, requestText,
onBehalfOf, isPrivate)` / `markPrayerRequestAnswered(id, answeredNote)` /
`setPrayerRequestPrivacy(id, isPrivate)` / `deletePrayerRequest(id)` round out the CRUD. Marking a
request "answered" does **not** auto-post anything to the Testimony Wall above -- it just adds an
"ANSWERED ✓" badge (and optional note) in place, matching the deck's own "kept as a quiet testimony of
its own" framing rather than inventing an unrequested cross-feature auto-post.

**Bible Reading Plan**: deliberately has **no Firestore collection for the plan's actual content** --
`src/content/reading-plan.json` (generated by `scripts/build-reading-plan.mjs`) is a static, 365-day,
**language-agnostic** schedule: `{ days: [ [{book, chapter}, ...], ... ] }`, one entry per canonical
Bible chapter (Genesis 1 through Revelation 22, 1189 chapters total), chunked evenly across 365 days
using the standard "distribute N items into K bins as evenly as possible" formula so the ~94 days that
need a 4th chapter are spread across the year rather than front-loaded. Because it's just `{book,
chapter}` refs keyed by the same 66 English book names `kjv.json`/`tagalog-bible.json` both already
share (see that file's own header comment on verified byte-for-byte chapter parity between the two),
this ONE generated plan works for either translation with zero extra content -- exactly what
"Available in either KJV or Tagalog" needs, since the reader UI just looks up whichever
`activeBibleData()` is currently selected.

Only **per-person progress** needs a collection: `readingPlanProgress/{uid}`: `{ startedAt,
completedDayNumbers: number[], completedDates: string[] (YYYY-MM-DD, local device date), updatedAt
}`. As private as `spiritualGrowth/{uid}` (someone's reading habits/gaps are personal) -- strictly
owner-only, no Admin bypass. `watchReadingPlanProgress(uid, callback)` /
`markReadingPlanDayDone(uid, dayNumber, isoDate)` (idempotent via `arrayUnion` in the real layer / a
plain "already there?" check in the demo layer) are the only two functions. "Which day is due" is
computed client-side as the smallest day number NOT yet in `completedDayNumbers` (`app.js`'s
`readingPlanCurrentDay()`) -- not tied to a calendar date -- so someone who falls behind just picks up
at the day they left off rather than skipping ahead or losing days. The streak counter
(`readingPlanStreak()`) is also computed entirely client-side from `completedDates` (never stored
pre-computed, so it can never drift): "current" counts consecutive calendar days backward from today,
treating yesterday as an equally valid anchor so the streak isn't reported broken before someone's had
a chance to do today's reading yet -- the "gentle nudge" the deck describes, not a punitive reset the
instant a day ticks over. Marking a day done is **self-reported** ("MARK TODAY'S READING DONE"), not
auto-detected from opening the Bible screen -- simpler, and matches every other progress checkbox
already in this app (the Discipleship Path's "MARK AS READ," the Journal).

## "BUILD THEM ALL NOW" batch 2: Worship Team Scheduling, Practice Mode [2026-09-28]

Batch 2 (Worship & Music Ministry) from the same 5-batch sequencing as batch 1 above. The
deck's third idea in this theme, **Suggest a Song**, needed no new work at all -- it's
already the existing "Song requests" feature (see that section further up this file,
shipped 2026-09-04) under a different marketing name; this was confirmed by reading that
section rather than assumed, and flagged to Jared rather than silently skipped.

**Worship Team Scheduling** (`serviceAssignments/{assignmentId}`): `{ churchId,
serviceDate: string (YYYY-MM-DD), role: string, assignedUid, assignedName, notes:
string|null, status: 'invited'|'confirmed'|'declined', createdByUid, createdByName,
createdAt, updatedAt }`. A leader (or an Admin managing a church remotely) assigns a
Church Team roster member (see `churchRoster/{uid}` above) to serve on a given date/role;
the assigned member confirms or declines from their own screen. Deliberately reuses Church
Team's own `churchTeamTargetChurchId()`/`state.churchRoster`/`state.adminChurches`
machinery wholesale in `app.js` rather than inventing a second "which church, who's on it"
resolver -- a leader/Admin lands on the exact same church context switching between the
Church Team and Team Schedule screens.

Two independent queries, same "no `orderBy`, client-sort instead" composite-index
avoidance as Prayer Wall above, but -- unlike Prayer Wall -- never merged, since "my
assignments" and "this church's whole schedule" are two different tabs of the same
screen, never one combined list: `watchMyAssignments(uid, callback)`
(`where('assignedUid','==',uid)`) and `watchChurchAssignments(churchId, callback)`
(`where('churchId','==',churchId)`), both client-sorted oldest-service-date-first.
`addAssignment(churchId, serviceDate, role, assignedUid, assignedName, notes,
createdByUid, createdByName)` (leader/Admin only), `respondToAssignment(assignmentId,
status)` (the assigned member only, field-scoped to `status`/`updatedAt` in
`firestore.rules` so a "confirm" tap can never double as a way to reassign the shift or
change its date), and `deleteAssignment(assignmentId)` (leader/Admin only) round out the
five functions.

🔶 **Read access is scoped narrower than "everyone on the team can see who else is
serving"** -- a default, not confirmed with Jared first. `firestore.rules` gates read to
the assigned member, a church-team leader of the SAME church, or an Admin -- mirroring
`churchRoster/{uid}`'s own read rule exactly (a plain `musician` role can't read the whole
roster either, so this matches existing precedent rather than inventing a looser one).
Worth revisiting if a team wants to see who ELSE is serving a given date, not just their
own assignment -- that would just mean widening the read rule to
`isChurchTeamMemberRole()` instead of `isChurchTeamLeaderRole()`, nothing structural.

Nav entry: "TEAM SCHEDULE" in both the hamburger drawer and desktop sidebar's Church Tools
section, gated on `CHURCH_TEAM_MEMBER_ROLES.includes(myRole()) || canManageAnyChurchTeam()`
(i.e. any team member incl. a plain musician, a leader, or an Admin) -- broader than Church
Team's own nav gate (leaders/Admin only), since a plain team member has no reason to see
the roster-management screen but every reason to see their own upcoming assignments.

**Practice Mode**: entirely client-side, **no Firestore collection, no `firestore.rules`
change at all**. A new `state.view === 'practice'` screen, reached from a "PRACTICE MODE"
button on the song detail screen's action row (gated identically to Play Mode --
`canUsePlayMode()` -- since practicing needs the same chords/transpose Play Mode already
paywalls, not a separate paid tier). Reuses the exact same key-transpose/text-size steppers
and `renderChordLyricLine()` chord/lyric rendering Play Mode already has, plus two things
Play Mode doesn't: a metronome (BPM stepper 30-240, a Web Audio oscillator click plus a
visual pulsing dot for silent environments, so a musician can practice at the song's actual
tempo) and hands-free autoscroll (speed 1-10, `window.scrollBy` on an interval, so both
hands can stay on an instrument). Nothing here persists across sessions or devices, same
as the existing per-song transpose/text-size prefs.

🔶 **The metronome's timing is a plain `setInterval`, not Web Audio's own scheduling
clock** -- not confirmed with Jared first. Accurate enough to practice roughly at tempo,
but it will drift a little over a long stretch (browser timer throttling, especially on a
backgrounded tab) the way a real metronome app's sample-accurate lookahead scheduler
wouldn't. Flagged rather than silently shipping something that quietly claims more
precision than it has; worth a proper lookahead-scheduler rewrite if anyone practices long
sessions against it and notices real drift.

Cleanup: leaving Practice Mode via its own BACK button stops both timers explicitly; a
second, defensive stop is also wired into `render()`'s own view-change detection (right
where it already tracks `lastRenderedView` for the page-transition fade) so navigating away
by any OTHER means -- a browser back/forward tap, signing out, a reload restoring a
different view -- can't leave a metronome or autoscroll timer running silently in the
background.

**Verification.** `node --check` passed on every changed file (`firestore.rules`,
`src/app.js`, both data layers, `data/index.js`, `src/content/icons.js`); a real `npm run
build` succeeded with no new warnings. A standalone Node test harness (16 checks, same
stubbed-`localStorage`/`BroadcastChannel` pattern as this session's other verification
passes) exercised all five new demo-mode Worship Team Scheduling functions directly: an
assignment appears live in both the assigned member's own watch and the whole-church
watch; a second musician's assignment doesn't leak into the first musician's own watch;
the church-wide list sorts oldest-service-date-first; confirming/declining updates status
live in both watches at once; deleting one assignment removes exactly that one; and a
different church's schedule stays fully independent. All passed. Practice Mode has no
data-layer functions to test this way (it's pure client-side UI state) -- its metronome/
autoscroll start-stop logic and the `render()` cleanup hook were verified by code review
rather than a standalone harness, and, same as the rest of this session's UI work, not
clicked through in a live browser (this sandbox's tooling still can't safely swap
`firebase-config.js` to demo mode and drive a real browser against it). **Recommend Jared,
after his next deploy: from a leader account, add a Team Schedule assignment for someone
on the roster and confirm it shows up live from a second (that assigned person's) account;
confirm/decline it from that second account and watch the leader's MANAGE view update;
and, from the song detail screen, open Practice Mode, start the metronome and confirm it
actually ticks (audibly and visually) at the displayed BPM, then start autoscroll and
confirm the page actually scrolls.**

`firestore.rules`, `src/app.js`, `src/content/icons.js`, `src/styles.css`,
`src/data/firestore-data-layer.js`, `src/data/local-data-layer.js`, `src/data/index.js`.
Delivered to Jared's connected folder and committed locally; **not yet confirmed by him**
-- needs the same `npm run build` + Netlify deploy, plus a `firestore.rules` re-paste in
the Firebase console for Worship Team Scheduling's gates to actually take effect, as
everything else still pending from this session's "BUILD THEM ALL NOW" work. Batches 3
through 5 (Sermons & Teaching, including the flagged Live Captions vendor research;
Community & Church Life; Accessibility & Reach, including the flagged Full App Translation
scoping question) are tracked and still to come.

## "BUILD THEM ALL NOW" batch 3, part 1: Sermon Archive [2026-09-28]

Batch 3 (Sermons & Teaching). Unlike Suggest a Song (batch 2), the deck's **Sermon
Archive** idea was checked and confirmed to be genuinely new work, not something already
covered under a different name: the existing **Sermons** screen (see the "Sermons" section
above) is a private, creator-owned slide-BUILDING and live-PRESENTING tool -- there was
never a "browse everyone's past sermons" screen anywhere in this app. This section covers
Sermon Archive; the deck's other Sermons & Teaching idea, **Live Captions**, needs a real
speech-to-text vendor decision (researched and presented to Jared before building anything,
per this project's own pptx-converter precedent) and is tracked separately, still pending
his answer as of this write-up.

**What it is.** A PUBLIC, congregation-facing screen where anyone -- signed in or not, no
account needed -- can browse past sermons a pastor has chosen to publish, and reopen any
one of them to read through slide by slide at their own pace. Reachable from three
redundant entry points, matching this session's own "give new features redundant,
discoverable entry points" practice: a big SERMON ARCHIVE button on the Home screen
(right next to the existing DAILY DEVOTIONALS button -- both are "public content, no
sign-in needed" in the exact same sense), the hamburger drawer's Personal section (both
signed-in and signed-out variants), the desktop sidebar's Personal section, AND a
"BROWSE THE SERMON ARCHIVE" link from inside the existing (private) Sermons screen itself,
for a pastor who's just published something and wants to go see how it looks.

**Data model -- deliberately reuses the existing `Sermon` doc, no new collection.** Three
new optional fields: `archived` (bool, default absent/false), `archivedAt` (a plain
client timestamp, same `Date.now()`-not-`serverTimestamp()` reasoning as every other
"needs to be readable back instantly, not after a round trip" timestamp in this app --
see Media/AVP's video-clock fields for the fullest writeup of why), `summary` (a short,
optional blurb shown on the archive's browse card so two similarly-titled sermons can be
told apart without opening either), and `dateGiven` (an optional plain free-text string --
e.g. "September 28, 2026" or "the Sunday before Easter" -- rather than a date-picker input,
since this app has no date-input UI convention anywhere else worth matching, and a pastor
typing a rough date is perfectly fine for a browse card). Publishing/un-publishing/editing
these three fields is just a plain call to the sermon feature's own existing, generic
`updateSermon(id, patch)` -- no new write function was needed at all, on either data layer.

**The one genuinely new read: `watchSermonArchive()`.** `where('archived', '==', true)`
against the `sermons` collection, client-sorted by `archivedAt` descending (never combined
with a Firestore `orderBy`, this app's established way of avoiding a composite-index
requirement). This is the first real "browse sermons a person doesn't own" LIST query this
collection has ever had -- `firestore.rules`' `sermons/{sermonId}` read rule comment was
updated to say so plainly (it used to claim, correctly at the time, that no such query
existed). No rule CHANGE was needed, though: the read rule was already unconditionally
`allow read: if true`, same as `songs`/`rooms`, and unlike `songRequests`' own list-query
rule (which has to actively hide other people's still-pending drafts from being listed),
there's no equivalent leak here to guard against -- an unpublished sermon a pastor is
still drafting simply never matches `archived == true` in the first place, so it can never
be returned by this query regardless of who's asking.

**Publishing UI.** On the Sermons screen, each of a pastor's own sermon cards gets a new
PUBLISH TO ARCHIVE button (ARCHIVE DETAILS, once published, plus an "IN SERMON ARCHIVE"
pill next to its slide count) -- same one-panel-open-at-a-time convention as that same
card's existing SHARE button. The panel has two optional plain-text fields (date preached,
short summary) and a PUBLISH TO ARCHIVE button; once published, the same panel becomes
SAVE DETAILS / REMOVE FROM ARCHIVE. Publishing is immediate and doesn't block on filling in
either optional field first -- a pastor can publish right away and come back to add a
summary later from the same panel.

**Reading UI.** `renderSermonArchive()` lists every published sermon (title, speaker,
date, slide count, summary excerpt); tapping one opens `renderSermonArchiveDetail()`, a
simple read-only slide-by-slide viewer (PREV/NEXT plus a "Slide X of N" counter) that
reuses the exact same slide-rendering helpers the live stage/split-screen views already
use -- `isBlocksSlide()`/`renderSlideCanvas(slide,'card')` for a modern blocks-based
sermon, `sermonLinesAsCardHtml(slide)` for a legacy one -- rather than a second sermon-
rendering implementation. If a sermon gets un-published while someone still has its detail
page open, it simply falls out of `state.sermonArchive` and the screen shows "This sermon
is no longer in the archive" instead of erroring.

🔶 **Reload-resume gap, accepted rather than built around.** A full page reload while
parked exactly on the Sermon Archive screen falls back to Home, the same accepted gap this
app already has for two other screens ('admin'/'media-library' -- see `RESUME_NO_DEPENDENCY`'s
own comment in `app.js`). Both of those are gated behind a permission flag that resolves a
moment after reload; Sermon Archive's actual reason is different but the tradeoff is the
same: it needs a live Firestore watch re-started to render meaningfully (unlike Bible/
Devotionals, which are static content and restore instantly with no watch at all), and
building a third, more elaborate reload-resume path for one low-traffic public browse
screen wasn't judged worth the extra plumbing. Easy to revisit if Jared finds this
actually bothers people in practice.

**Verification.** `node --check` passed on every changed file; a real `npm run build`
succeeded with no new warnings. A standalone Node test harness (stubbed
`localStorage`/`BroadcastChannel`, same pattern as this session's other verification
passes) exercised the new demo-mode `watchSermonArchive()` directly: an unpublished sermon
never appears; publishing makes it appear live with its summary/date intact; a second
published sermon sorts ahead of an earlier one (newest-published first); un-publishing
removes exactly that one sermon live, live, without disturbing the other; and a SEPARATE
simulated viewer (not the sermon's own creator) can successfully browse a sermon they
don't own -- the actual point of the feature, and the first time this app's test suite has
exercised that access shape at all. All 10 checks passed. Also re-ran this session's
mechanical `data/index.js`-export-vs-`app.js`-import cross-check (the same discipline that
caught a real bug earlier this session) after adding `watchSermonArchive` to both files --
clean, zero missing, zero unexplained extras.

**What this round could NOT verify**, same limitation as the rest of this session's UI
work: the actual on-screen flow (publishing a sermon from its card, opening the public
Sermon Archive screen, browsing to and reading through a sermon's slides, PREV/NEXT) has
only been read carefully, not clicked through in a live browser. **Recommend Jared, after
his next deploy: publish one sermon to the archive with a date and summary filled in, open
the Sermon Archive from the Home screen (ideally signed out, in a private/incognito
window, to confirm the "no sign-in needed" part actually holds), find that sermon, open
it, and page through its slides with PREV/NEXT; then go remove it from the archive and
confirm it disappears from the public list.**

`firestore.rules` (comment-only, no rule change), `src/app.js`,
`src/data/firestore-data-layer.js`, `src/data/local-data-layer.js`, `src/data/index.js`.
Delivered to Jared's connected folder and committed locally; **not yet confirmed by him**
-- needs the usual `npm run build` + Netlify deploy, as everything else still pending from
this session's "BUILD THEM ALL NOW" work (no `firestore.rules` re-paste is actually
required for this particular feature, since nothing about the rule itself changed -- only
the comment explaining it). Live Captions (the rest of batch 3) is still pending Jared's
vendor-choice answer; batches 4 (Community & Church Life) and 5 (Accessibility & Reach,
including the flagged Full App Translation scoping question) are tracked and still to
come.

## "BUILD THEM ALL NOW" batch 4: Church Directory, Small Group Finder, Events Calendar [2026-09-28]

Batch 4 (Community & Church Life), all three of the deck's ideas in this theme, all
genuinely new work.

**Church Directory** -- the cheapest of the three by far: **zero new fields, zero new
collections, zero new `firestore.rules`, zero new watch.** It's a pure read-only view built
entirely on machinery this app already had for Explore's people-search: the existing public
`directory/{uid}` collection (`state.directory`, kept warm by `startDirectoryWatch()`) and
the existing `renderPersonRow(d)` card renderer, `data-open-profile`/`data-follow-uid`
wiring included, reused verbatim. `churchDirectoryPeople()` just filters `state.directory`
down to entries whose `churchName` (case-folded, trimmed via `normalizedChurchName()`)
matches the signed-in person's own `profile.churchName`, excluding themselves.

🔶 **Matches on free-text `churchName`, not the internal `churchId` field** -- a disclosed
default, not confirmed with Jared first. `churchId` (the field Church Team/Team Schedule
use) is only ever set for someone an Admin or church-team leader has formally added to a
church's roster -- a small minority of accounts. Scoping this feature to `churchId` instead
would leave it looking nearly empty for most churches, so it matches on the one thing every
congregant already fills in on their own profile instead. The real cost: two different
spellings/abbreviations of the same church ("Cedar Grove Baptist Church" vs. "Cedar Grove
Baptist" vs. a typo) end up as silently separate, non-matching groups of people who never
see each other in this list. Worth revisiting if a real `churches/{id}`-linked profile model
ever replaces free-text `churchName` for ordinary members; until then this is the tradeoff.

**Small Group Finder** (`smallGroups/{groupId}`): `{ name, description: string|null,
schedule: string|null, location: string|null, memberUids: [uid], createdByUid,
createdByName, createdAt, updatedAt }`. Public read; any signed-in person can start a group
(🔶 below); `joinSmallGroup(id, uid)`/`leaveSmallGroup(id, uid)` use `arrayUnion`/
`arrayRemove` (not a read-modify-write) so two people joining the same group at once can
never clobber each other -- exact same reasoning as sermon sharing's `shareSermon()`/
`unshareSermon()`. `createSmallGroup`/`updateSmallGroup`/`deleteSmallGroup` round out the
six functions; `watchSmallGroups()` client-sorts newest-created-first (no `orderBy`, same
composite-index avoidance as every other list query this session has added). Screen-scoped
in `app.js` (started on open, stopped on BACK), matching the convention every batch-1/2/3
feature already established, not an always-on global watch like `songs`/`rooms`.

🔶 **Creation is open to ANY signed-in person, not leader/host-only** -- a disclosed
default, not confirmed with Jared first. This matches Testimony Wall/Prayer Wall's
low-friction "anyone can post" precedent rather than Sermons'/Events' host-eligible-only
gate, on the reasoning that starting an informal small group (unlike publishing an official
church-wide event) is something any member might reasonably do without a leader's
involvement. Easy to tighten to `canHostRole()`-only later in `firestore.rules` if a real
church finds this the wrong default for how they want to run it.

**Events Calendar** (`events/{eventId}`): `{ title, eventDate: string (YYYY-MM-DD),
eventTime: string|null, location: string|null, description: string|null, createdByUid,
createdByName, createdAt, updatedAt }`. Public read; creation is gated to a host-eligible
person (`isEditor() || canHostRole()`, mirroring Sermons' own create rule exactly) --
unlike Small Groups above, publishing an official church-wide event reads more like an
administrative/announcement action, the same distinction this app already draws between
"anyone can suggest a song" (song requests) and "only an editor/host builds a sermon"
(sermons). `eventDate` is a plain `'YYYY-MM-DD'` string from a native `<input type="date">`
(an existing UI convention already used by Team Schedule and Devotionals' date-jump);
`watchEvents()` client-sorts by `eventDate.localeCompare()` -- correct chronological
ordering for ISO date strings with zero date-parsing, same trick this app leans on for a
handful of other plain-string sort keys. A past event isn't hidden, just shown with reduced
opacity and a "PAST" pill (`eventIsPast()` compares against today's own ISO date string).

**Caught before verification: a real `formatEventDate()` bug.** `renderEventsCalendar()`
originally called a `formatEventDate(evt.eventDate)` helper that was never defined anywhere
in the codebase -- a genuine `ReferenceError` that would have thrown the instant the Events
Calendar screen rendered with even one event present, invisible to `node --check` (syntax-
only) exactly the way this project's own past temporal-dead-zone sign-in bug was. Caught by
a careful re-read before this batch was ever built/tested/delivered, not reported by Jared.
Fixed by adding a small `formatEventDate(isoDate)` helper that parses the `'YYYY-MM-DD'`
string's year/month/day parts directly and builds a local `Date` from them (e.g. "Sep 28,
2026") -- deliberately NOT `new Date('YYYY-MM-DD')`, which the spec treats as UTC midnight
and which would then print as the PREVIOUS day in any timezone behind UTC, i.e. anywhere in
the Philippines, always. Grepped the rest of this batch's new code afterward for the same
"calls a helper that was never defined" class of bug -- none found.

**Nav entry points.** Church Directory and Small Groups: hamburger drawer + desktop sidebar
Personal section only (signed-in variant for Church Directory, since it needs a profile's
`churchName` to mean anything; both signed-in and signed-out variants for Small Groups,
since it's public-read like Sermon Archive). Events Calendar gets the same three-entry-point
treatment Sermon Archive got -- including a big EVENTS CALENDAR button on the Home screen,
right under Sermon Archive's -- since it's equally public content with no sign-in required
to browse, and a dated calendar of what's coming up is arguably more universally relevant on
first landing than Small Groups/Church Directory are.

**Verification.** `node --check` passed on every changed file; a real `npm run build`
succeeded with no new warnings. A standalone Node test harness (15 checks, same stubbed-
`localStorage`/`BroadcastChannel` pattern as this session's other verification passes)
exercised all 10 new demo-mode Small Groups/Events functions directly: a group appears live
and auto-adds its creator as a member; joining is idempotent (no duplicate member from
joining twice); leaving removes exactly that member; editing a group's fields updates live;
a second, differently-owned group also appears (confirming "anyone can start one"); deleting
a group removes exactly that one; events sort chronologically by `eventDate` rather than
creation order; editing and deleting an event both update/remove live. All 15 passed.
Church Directory has no new data-layer functions to test this way (it's a pure filter over
data another feature already watches) -- covered by code review and the recommended
spot-check below instead. Also re-ran this session's mechanical `data/index.js`-export-vs-
`app.js`-import cross-check for all 10 newly added function names -- clean, zero missing,
zero unexplained extras (`usingDemoMode` is the same pre-existing legitimate extra noted in
every earlier batch's write-up).

**What this round could NOT verify**, same limitation as the rest of this session's UI
work: the actual on-screen flow (browsing the Church Directory with a churchName set,
starting/joining/leaving/editing/deleting a Small Group, adding/editing/deleting an Event
and watching PAST styling kick in after its date passes) has only been read carefully, not
clicked through in a live browser. **Recommend Jared, after his next deploy: set a church
name in My Profile and open Church Directory to confirm you see anyone else from the same
church (or the right empty-state message if not); from Small Groups, start a group, then
sign in as a second account and join/leave it, confirming the member count updates live for
both of you; and from Events Calendar (host/editor account), add an event dated a few days
from now plus one dated yesterday, and confirm the past one shows the PAST pill while the
upcoming one doesn't.**

`firestore.rules` (two new match blocks this time -- an actual rule change, unlike Sermon
Archive's comment-only edit), `src/app.js`, `src/data/firestore-data-layer.js`,
`src/data/local-data-layer.js`, `src/data/index.js`. Delivered to Jared's connected folder
and committed locally; **not yet confirmed by him** -- needs `npm run build` + Netlify
deploy, PLUS a `firestore.rules` re-paste in the Firebase console this time (Small
Groups'/Events' actual access gates -- who can create, the memberUids-only join/leave
carve-out, host-eligible-only event creation -- don't take effect until that re-paste
happens, same as Worship Team Scheduling's rules needed one in batch 2). Live Captions
(the rest of batch 3) is still pending Jared's vendor-choice answer; batch 5 (Accessibility
& Reach: Kids Ministry Mode, plus the flagged Full App Translation scoping question) is
tracked and still to come.
