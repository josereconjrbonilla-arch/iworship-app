// Cloud Functions scaffold for iWorship's monetization backend.
//
// IMPORTANT: written but NOT deployed and NOT tested against a live
// Firestore project -- see README.md in this folder for why (Cloud
// Functions require Firebase's paid Blaze plan to deploy at all, which
// hasn't been enabled yet). Treat every function below the same way
// src/data/firestore-data-layer.js treats itself: correct against the
// documented SDK and the shapes in claude/monetization-plan.md, but not
// proven against a real project until someone actually deploys and
// exercises it.
//
// These functions use the Admin SDK, which bypasses firestore.rules
// entirely -- that's exactly why churches/{id} and cross-user profile
// writes are only ever done from here, never directly from the client
// (see firestore.rules' comments on churches/{churchId} and users/{uid}).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

setGlobalOptions({ region: 'asia-southeast1' });

initializeApp();
const db = getFirestore();

// Seat limits by plan -- mirrors the Plan comparison table in
// claude/monetization-plan.md exactly. 'pending' and 'free' both mean "no
// paid seats yet" -- 'pending' is what registerChurch always starts a
// church at; 'free' only exists here for completeness (a church shouldn't
// normally sit on it, since the whole point of registering is to go paid).
const PLAN_SEAT_LIMITS = {
  pending:    { pastors: 0, editors: 0, musicDirectors: 0, musicians: 0 },
  free:       { pastors: 0, editors: 0, musicDirectors: 0, musicians: 0 },
  starter:    { pastors: 0, editors: 3, musicDirectors: 0, musicians: 5 },
  growing:    { pastors: 0, editors: 3, musicDirectors: 1, musicians: 10 },
  full:       { pastors: 2, editors: 3, musicDirectors: 1, musicians: 20 },
  // enterprise has no fixed limits -- seatLimits gets set by hand once
  // Jared and the church agree on a custom quote; nothing here enforces
  // a number for it.
  enterprise: null
};

const GRACE_PERIOD_DAYS = 7; // confirmed by Jared, 2026-09-03

const ASSIGNABLE_ROLES = ['pastor', 'musicDirector', 'editor', 'musician'];
// Seat-limit keys don't match role names 1:1 (role 'pastor' consumes a
// seatLimits.pastors seat, 'musicDirector' consumes musicDirectors, etc.)
// -- this map is just the plural lookup.
const ROLE_TO_SEAT_KEY = {
  pastor: 'pastors',
  musicDirector: 'musicDirectors',
  editor: 'editors',
  musician: 'musicians'
};

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  return request.auth.uid;
}

async function getProfile(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : {};
}

// --------------------------------------------------------------- registerChurch
// A Senior-Pastor-to-be registers their church. Always creates the church
// at plan 'pending' with zero seats of any kind -- the only way a church
// gets real seats is through stripeWebhook confirming an actual payment.
// This means calling this function costs nothing and grants nothing by
// itself; it just reserves a church record and marks the caller as its
// Senior Pastor so a later checkout flow has something to attach payment
// to.
exports.registerChurch = onCall(async (request) => {
  const uid = requireAuth(request);
  const { name, billingCadence } = request.data || {};

  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 200) {
    throw new HttpsError('invalid-argument', 'Church name is required (2-200 characters).');
  }
  if (!['annual', 'quarterly', 'monthly'].includes(billingCadence)) {
    throw new HttpsError('invalid-argument', 'billingCadence must be annual, quarterly, or monthly.');
  }

  const profile = await getProfile(uid);
  if (profile.churchId) {
    throw new HttpsError('failed-precondition', 'You already belong to a church. Leave it before registering a new one.');
  }

  const churchRef = db.collection('churches').doc();
  await churchRef.set({
    name: name.trim(),
    plan: 'pending',
    seatLimits: PLAN_SEAT_LIMITS.pending,
    hiddenSongIds: [],
    gracePeriodDays: GRACE_PERIOD_DAYS,
    billingCadence,
    createdAt: FieldValue.serverTimestamp()
  });

  await db.collection('users').doc(uid).set(
    { role: 'seniorPastor', churchId: churchRef.id, pastorTitle: null },
    { merge: true }
  );

  return { churchId: churchRef.id };
});

// ------------------------------------------------------------------- assignRole
// A Senior Pastor or a Pastor can assign roles within their own church,
// enforcing seatLimits -- EXCEPT the 'pastor' role itself, which only the
// Senior Pastor can grant or remove (confirmed by Jared, 2026-09-03: "senior
// pastor is more powerful than pastor in the sense that he can assign
// pastors, that's it"). So a Pastor seat can assign/remove Editor, Music
// Director, and Musician just like the Senior Pastor, but cannot create
// another Pastor or demote one. Pass role: null to remove someone from
// their role (they stay linked to the church with no role, same as an
// ordinary free member).
exports.assignRole = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const { targetUid, role, pastorTitle } = request.data || {};

  if (typeof targetUid !== 'string' || !targetUid) {
    throw new HttpsError('invalid-argument', 'targetUid is required.');
  }
  if (role !== null && !ASSIGNABLE_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', 'role must be one of ' + ASSIGNABLE_ROLES.join(', ') + ', or null.');
  }

  const caller = await getProfile(callerUid);
  if (!caller.churchId || !['seniorPastor', 'pastor'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only a Senior Pastor or Pastor can assign roles.');
  }

  const targetRef = db.collection('users').doc(targetUid);
  const targetSnap = await targetRef.get();
  const target = targetSnap.exists ? targetSnap.data() : {};
  if (target.churchId && target.churchId !== caller.churchId) {
    throw new HttpsError('failed-precondition', 'That person already belongs to a different church.');
  }

  // Only the Senior Pastor can grant or remove the 'pastor' role itself --
  // a Pastor can assign every other role but can't create a peer or demote
  // one (or themselves).
  const touchesPastorRole = role === 'pastor' || target.role === 'pastor';
  if (touchesPastorRole && caller.role !== 'seniorPastor') {
    throw new HttpsError('permission-denied', 'Only the Senior Pastor can assign or remove a Pastor seat.');
  }

  if (role === null) {
    await targetRef.set({ role: null, pastorTitle: null }, { merge: true });
    return { ok: true };
  }

  const churchRef = db.collection('churches').doc(caller.churchId);
  const churchSnap = await churchRef.get();
  if (!churchSnap.exists) {
    throw new HttpsError('failed-precondition', 'Your church record is missing.');
  }
  const church = churchSnap.data();
  const seatKey = ROLE_TO_SEAT_KEY[role];
  const limit = church.seatLimits ? church.seatLimits[seatKey] : 0;

  // Enterprise/custom churches may have seatLimits set by hand to whatever
  // was quoted -- this still enforces against whatever number is actually
  // stored, it just doesn't assume a fixed PLAN_SEAT_LIMITS entry for them.
  if (typeof limit !== 'number') {
    throw new HttpsError('failed-precondition', 'Your church has no seat limit configured for that role yet -- contact an admin.');
  }

  const currentHoldersSnap = await db.collection('users')
    .where('churchId', '==', caller.churchId)
    .where('role', '==', role)
    .get();
  const alreadyHasRole = currentHoldersSnap.docs.some((d) => d.id === targetUid);
  if (!alreadyHasRole && currentHoldersSnap.size >= limit) {
    throw new HttpsError('resource-exhausted', 'Your plan has no more ' + role + ' seats available.');
  }

  await targetRef.set(
    { role, churchId: caller.churchId, pastorTitle: role === 'pastor' ? (pastorTitle || null) : null },
    { merge: true }
  );
  return { ok: true };
});

// ----------------------------------------------------------- updateChurchLibrary
// A Senior Pastor or Pastor sets which songs are hidden from their
// congregation's default view. This is an exclusion list, never a second
// copy of the hymnal -- see monetization-plan.md's "Core principle" for why
// that distinction matters. A member can always switch back to the
// unfiltered Public Library in the app regardless of this list.
exports.updateChurchLibrary = onCall(async (request) => {
  const uid = requireAuth(request);
  const { hiddenSongIds } = request.data || {};

  if (!Array.isArray(hiddenSongIds) || hiddenSongIds.some((id) => typeof id !== 'string')) {
    throw new HttpsError('invalid-argument', 'hiddenSongIds must be an array of song id strings.');
  }
  if (hiddenSongIds.length > 5000) {
    throw new HttpsError('invalid-argument', 'That list is implausibly long -- something is probably wrong upstream.');
  }

  const caller = await getProfile(uid);
  if (!caller.churchId || !['seniorPastor', 'pastor'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only a Senior Pastor or Pastor can manage their church\'s library.');
  }

  await db.collection('churches').doc(caller.churchId).set({ hiddenSongIds }, { merge: true });
  return { ok: true };
});

// ---------------------------------------------------------------- stripeWebhook
// STUB ONLY -- do not deploy this until real Stripe keys and signature
// verification exist. Meant to receive Stripe's webhook events, verify the
// signature, and on a successful checkout move the paying church from
// plan: 'pending' to its real plan + seatLimits (via PLAN_SEAT_LIMITS
// above). Left unimplemented on purpose rather than guessing at a Stripe
// integration Jared hasn't set up yet -- see README.md.
exports.stripeWebhook = onRequest(async (req, res) => {
  // TODO: verify req.headers['stripe-signature'] against the raw body using
  // the Stripe SDK and a webhook signing secret from Firebase config/secrets
  // -- do NOT trust req.body until that's in place.
  // TODO: on a `checkout.session.completed` (or subscription-updated) event,
  // look up which churchId the payment was for (e.g. via client_reference_id
  // set at checkout time) and the plan it paid for, then:
  //   await db.collection('churches').doc(churchId).set({
  //     plan, seatLimits: PLAN_SEAT_LIMITS[plan], billingCadence
  //   }, { merge: true });
  // TODO: handle payment-failed / subscription-canceled events too, per the
  // 7-day grace period (GRACE_PERIOD_DAYS) -- not designed yet.
  res.status(501).send('stripeWebhook is a scaffold only -- not implemented. See functions/README.md.');
});

// ---------------------------------------------------------- sendPushOnNotification
// Real (server-delivered) push notifications [2026-09-10]. Jared: "no notif
// came from the app (when closed) when I messaged her." An in-app
// notification bell already existed (app.js's notify()/createNotification())
// but that only shows something once the app itself is open -- this is the
// piece that actually wakes a closed/backgrounded device.
//
// Fires on every new doc under notifications/{uid}/items/{itemId} -- the
// EXACT same writes notify() already makes for likes/comments/follows/
// reposts/messages (see app.js), so no new client-side call was needed to
// trigger this; it rides the existing notification plumbing. Reads every
// registered device (users/{uid}/pushTokens/{token}, one doc per browser/
// device that's granted permission -- see enablePushNotifications() in
// firestore-data-layer.js) and sends to all of them via one multicast call.
// A token that's gone stale (browser data cleared, permission revoked, the
// app uninstalled) comes back from FCM as a registration-token-not-
// registered error -- those specific tokens are deleted so this list
// doesn't grow stale forever; every other error is left alone (could be
// transient) rather than guessed at.
//
// NOT deployed/tested against a live project any more than the rest of
// this file -- see this file's header comment and
// claude/architecture-and-decisions.md's "Push notifications" section.
exports.sendPushOnNotification = onDocumentCreated('notifications/{uid}/items/{itemId}', async (event) => {
  const payload = event.data && event.data.data();
  if (!payload) return;
  const { uid } = event.params;

  const tokensSnap = await db.collection('users').doc(uid).collection('pushTokens').get();
  if (tokensSnap.empty) return;
  const tokens = tokensSnap.docs.map((d) => d.id);

  // Mirrors app.js's notificationText() -- kept in sync by hand since this
  // runs server-side (Admin SDK) and can't import from the client bundle.
  const who = payload.actorName || 'Someone';
  const kindWord = payload.kind === 'shorts' ? 'short' : 'post';
  let body = who + ' interacted with your Fellowship activity.';
  if (payload.type === 'like') body = who + ' liked your ' + kindWord + '.';
  else if (payload.type === 'comment') body = who + ' commented on your ' + kindWord + '.';
  else if (payload.type === 'repost') body = who + ' reposted your post.';
  else if (payload.type === 'follow') body = who + ' started following you.';
  else if (payload.type === 'message') body = who + ' sent you a message.';
  // 'session_live' [2026-09-17, see onNewSessionNotify below] -- who here is
  // the HOST's name (actorUid is set to hostUid when that function writes
  // this item), and churchName is only present/non-empty when this doc came
  // from the church-member branch of that fan-out rather than the follower
  // branch, so the wording says whichever reason actually applies.
  else if (payload.type === 'session_live') {
    body = who + (payload.churchName ? (' at ' + payload.churchName) : '') + ' just started a worship session' + (payload.roomName ? (': ' + payload.roomName) : '') + '.';
  }

  const message = {
    notification: { title: 'iWorship', body },
    data: {
      type: String(payload.type || ''),
      actorUid: String(payload.actorUid || ''),
      kind: String(payload.kind || ''),
      itemId: String(payload.itemId || ''),
      threadId: String(payload.threadId || ''),
      // Lets the service worker's notificationclick handler (src/sw.js) open
      // straight into "?join=<code>" instead of just the app's root -- only
      // ever set for 'session_live', harmless empty string otherwise.
      roomCode: String(payload.roomCode || '')
    },
    tokens
  };

  const messaging = getMessaging();
  const result = await messaging.sendEachForMulticast(message);

  const staleTokens = [];
  result.responses.forEach((resp, i) => {
    if (!resp.success && resp.error && resp.error.code === 'messaging/registration-token-not-registered') {
      staleTokens.push(tokens[i]);
    }
  });
  if (staleTokens.length) {
    await Promise.all(staleTokens.map((t) => db.collection('users').doc(uid).collection('pushTokens').doc(t).delete()));
  }
});

// ---------------------------------------------------------- onNewSessionNotify
// "New sessions from church members or people they follow" [2026-09-17]
// Jared: "sends multiple notifications to the phone's push notif itself,
// like for example for messages, new sessions from their church members or
// other people they follow." Messages/likes/comments/follows/reposts all
// already ride notify()/createNotification() from the client (see app.js) --
// a session starting is different because there's no single "recipient" a
// client-side call could target; it needs to fan out to however many
// followers and same-church members exist, which only an Admin-SDK function
// can safely and cheaply do (fan-out writes from the client would need
// firestore.rules to let a host write directly into a stranger's
// notifications/{uid}/items for MANY strangers at once, which this project
// has deliberately never widened beyond "the actor writes into one known
// recipient's own subcollection").
//
// Fires once per NEW room (not every GO LIVE inside an existing session --
// a host cycling through songs isn't "a new session"), and only for a
// PUBLIC room: a private/password-protected session is deliberately never
// broadcast this way -- if Jared wants his own leaders to know about a
// private session, he shares the code/password himself; nobody should get a
// system notification about a session they then can't actually get into.
//
// Recipients are the union of: (a) this host's followers (follows where
// targetUid == hostUid), and (b) anyone whose directory/{uid}.churchName
// exactly matches this room's churchName (skipped entirely when the room
// has no churchName set). Capped at MAX_SESSION_FANOUT recipients total --
// a pathological case (a host with thousands of followers, or a churchName
// string shared by an implausibly large number of accounts) shouldn't turn
// one tap of CREATE ROOM into an unbounded write storm; a real per-church
// broadcast list with its own size limits would be a bigger feature for
// another day if that ever becomes a real constraint.
//
// Writes a genuine notifications/{uid}/items doc per recipient (same shape
// notify()/createNotification() already write client-side for every other
// type) rather than sending push directly -- this is deliberate reuse, not
// a shortcut: it means sendPushOnNotification (above) fires automatically
// for every one of these, with zero duplicate push-sending logic, AND it
// means the in-app notification bell shows "so-and-so just started a
// worship session" for anyone who hasn't (or can't) enable push, exactly
// like every other notification type in this app already behaves.
const MAX_SESSION_FANOUT = 500;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

exports.onNewSessionNotify = onDocumentCreated('rooms/{code}', async (event) => {
  const room = event.data && event.data.data();
  if (!room || !room.isPublic || !room.hostUid) return;
  const code = event.params.code;
  const hostUid = room.hostUid;
  const churchName = (room.churchName || '').trim();

  const followerUids = new Set();
  const followersSnap = await db.collection('follows').where('targetUid', '==', hostUid).get();
  followersSnap.forEach((d) => followerUids.add(d.data().followerUid));

  const churchUids = new Set();
  if (churchName) {
    const churchSnap = await db.collection('directory').where('churchName', '==', churchName).get();
    churchSnap.forEach((d) => { if (d.id !== hostUid) churchUids.add(d.id); });
  }

  const allUids = Array.from(new Set([...followerUids, ...churchUids])).filter((uid) => uid !== hostUid).slice(0, MAX_SESSION_FANOUT);
  if (!allUids.length) return;

  // Drop anyone who's opted out of this specific notification type -- read
  // via the same document-id 'in' batching trick used below for the daily
  // verse job (Firestore caps 'in' queries at 30 values), since reading
  // users/{uid} one at a time for a large fan-out would be a lot of
  // avoidable round trips.
  const optedIn = [];
  for (const ids of chunk(allUids, 30)) {
    const snap = await db.collection('users').where(FieldPath.documentId(), 'in', ids).get();
    const found = new Map(snap.docs.map((d) => [d.id, d.data()]));
    ids.forEach((uid) => {
      const prefs = found.get(uid) && found.get(uid).notifPrefs;
      if (!prefs || prefs.sessions !== false) optedIn.push(uid);
    });
  }
  if (!optedIn.length) return;

  const hostName = room.hostName || 'Someone';
  for (const batchUids of chunk(optedIn, 450)) { // headroom under Firestore's 500-writes-per-batch cap
    const batch = db.batch();
    batchUids.forEach((uid) => {
      const isChurchOnly = churchUids.has(uid) && !followerUids.has(uid);
      const ref = db.collection('notifications').doc(uid).collection('items').doc();
      batch.set(ref, {
        actorUid: hostUid,
        actorName: hostName,
        type: 'session_live',
        roomCode: code,
        roomName: room.name || '',
        churchName: isChurchOnly ? churchName : null,
        read: false,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }
});

// ---------------------------------------------------------- dailyVerseNotify
// The daily verse push [2026-09-17]. Jared: "...or even a notif about
// today's bible verse." app.js's landing page already shows one (see
// todaysVerse()/VERSES in src/content/verses.js) -- same deterministic
// day-of-year rotation, mirrored here by hand for the same reason
// sendPushOnNotification's body text is mirrored above: this runs under the
// Admin SDK and can't import the client bundle. IMPORTANT: if VERSES in
// src/content/verses.js is ever edited (reordered, added to, trimmed), copy
// the exact same array back into DAILY_VERSES below, or the push and the
// in-app landing verse will drift out of sync with each other.
//
// Deliberately does NOT write a notifications/{uid}/items doc per person --
// unlike session_live above, this isn't personal (every recipient gets the
// exact same verse, which is already sitting on their own landing page the
// moment they open the app) and firing one Firestore write per registered
// device, every single day, forever, would be a lot of ongoing write volume
// for something with no real follow-up value in the in-app bell. This sends
// push directly to every opted-in device's token instead, batched under
// FCM's 500-tokens-per-call multicast limit, with the same stale-token
// cleanup sendPushOnNotification already does.
//
// Schedule: 23:00 UTC, i.e. 7:00 AM in the Philippines (UTC+8) -- Jared and
// this app's congregation are Philippines-based (see claude/architecture-
// and-decisions.md); a 7am verse reads as "start your day with this," not a
// random-hour interruption. Change the schedule string below if a different
// local time is ever wanted.
const DAILY_VERSES = [
  { ref: 'Joshua 1:9', text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.' },
  { ref: 'Isaiah 41:10', text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.' },
  { ref: 'Philippians 4:13', text: 'I can do all things through Christ which strengtheneth me.' },
  { ref: 'Proverbs 3:5-6', text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.' },
  { ref: 'Romans 8:28', text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
  { ref: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
  { ref: 'Psalm 46:1', text: 'God is our refuge and strength, a very present help in trouble.' },
  { ref: '2 Timothy 1:7', text: 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.' },
  { ref: 'Isaiah 40:31', text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.' },
  { ref: 'Matthew 6:33', text: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.' },
  { ref: 'Galatians 6:9', text: 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.' },
  { ref: 'Psalm 27:1', text: 'The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?' },
  { ref: '1 Corinthians 16:13', text: 'Watch ye, stand fast in the faith, quit you like men, be strong.' },
  { ref: 'Deuteronomy 31:6', text: 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.' },
  { ref: 'James 1:22', text: 'But be ye doers of the word, and not hearers only, deceiving your own selves.' },
  { ref: 'Romans 12:2', text: 'And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.' },
  { ref: 'Luke 9:23', text: 'And he said to them all, If any man will come after me, let him deny himself, and take up his cross daily, and follow me.' },
  { ref: '2 Corinthians 5:17', text: 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.' },
  { ref: 'Hebrews 11:1', text: 'Now faith is the substance of things hoped for, the evidence of things not seen.' },
  { ref: 'Micah 6:8', text: 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?' },
  { ref: 'Zephaniah 3:17', text: 'The LORD thy God in the midst of thee is mighty; he will save, he will rejoice over thee with joy; he will rest in his love, he will joy over thee with singing.' },
  { ref: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
  { ref: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' }
];

function dayOfYearUtc(d) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start;
  return Math.floor(diff / 86400000);
}

exports.dailyVerseNotify = onSchedule('0 23 * * *', async () => {
  const verse = DAILY_VERSES[dayOfYearUtc(new Date()) % DAILY_VERSES.length];
  const body = verse.ref + ' -- ' + verse.text;

  // collectionGroup, not a per-user loop: one query reads every registered
  // device across every account, regardless of how many users there are.
  const tokensSnap = await db.collectionGroup('pushTokens').get();
  if (tokensSnap.empty) return;

  // Group tokens by owning uid (users/{uid}/pushTokens/{token} -- a
  // pushTokens doc's parent collection's parent doc is the owning user) so
  // notifPrefs only needs to be looked up once per PERSON, not once per
  // device, and build the reverse (token -> uid) map up front too, so stale-
  // token cleanup afterward doesn't need to search for it.
  const tokensByUid = new Map();
  const tokenToUid = new Map();
  tokensSnap.forEach((d) => {
    const uid = d.ref.parent.parent.id;
    if (!tokensByUid.has(uid)) tokensByUid.set(uid, []);
    tokensByUid.get(uid).push(d.id);
    tokenToUid.set(d.id, uid);
  });

  const allUids = Array.from(tokensByUid.keys());
  const optedInTokens = [];
  for (const ids of chunk(allUids, 30)) {
    const snap = await db.collection('users').where(FieldPath.documentId(), 'in', ids).get();
    const found = new Map(snap.docs.map((d) => [d.id, d.data()]));
    ids.forEach((uid) => {
      const prefs = found.get(uid) && found.get(uid).notifPrefs;
      if (!prefs || prefs.dailyVerse !== false) optedInTokens.push(...tokensByUid.get(uid));
    });
  }
  if (!optedInTokens.length) return;

  const messaging = getMessaging();
  const staleTokens = [];
  for (const tokenBatch of chunk(optedInTokens, 500)) { // FCM's own per-call multicast limit
    const result = await messaging.sendEachForMulticast({
      notification: { title: "Today's Verse", body },
      data: { type: 'daily_verse', ref: verse.ref },
      tokens: tokenBatch
    });
    result.responses.forEach((resp, i) => {
      if (!resp.success && resp.error && resp.error.code === 'messaging/registration-token-not-registered') {
        staleTokens.push(tokenBatch[i]);
      }
    });
  }
  if (staleTokens.length) {
    await Promise.all(staleTokens.map((token) => {
      const uid = tokenToUid.get(token);
      return uid ? db.collection('users').doc(uid).collection('pushTokens').doc(token).delete() : Promise.resolve();
    }));
  }
});
