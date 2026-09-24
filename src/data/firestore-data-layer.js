// Real Firebase-backed data layer — used automatically once firebase-config.js
// has real values (see data/index.js). Implements the exact same interface as
// local-data-layer.js (see interface.md). Written against the Firebase JS SDK
// v12 modular API; matches firestore.rules and README.md's data model 1:1.
//
// Honest note: this file could not be exercised against a live Firestore
// project from the sandbox that built it (no route to Google's servers from
// there). It's written correctly against the documented SDK and mirrors the
// local layer's already-tested behavior line for line — but treat your first
// real sign-in and first hosted session as the actual first test of this file.
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, Timestamp, getDoc, getDocs, getDocFromServer,
  arrayUnion, arrayRemove, increment
} from 'firebase/firestore';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  EmailAuthProvider, linkWithCredential, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail
} from 'firebase/auth';
import { getMessaging, getToken as getFcmToken, onMessage, isSupported as isMessagingSupported } from 'firebase/messaging';
import { VAPID_KEY, pushNotificationsConfigured } from '../push-config.js';
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from 'firebase/storage';
// PowerPoint upload [2026-09-24] -- see convertPptxToSlideshow() below and
// its matching Cloud Function in functions/index.js for the full design.
// The only Cloud Function this app's CLIENT calls directly (registerChurch/
// assignRole/updateChurchLibrary are all still client-side-write bridges
// for now -- see their own comments) -- this one genuinely has to run
// server-side (it needs to reach the pptx-converter Cloud Run service),
// so this is this file's first-ever use of the Functions SDK.
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseConfig, isFirebaseConfigured } from '../firebase-config.js';
import { sha256Hex } from './hash.js';

// Perf fix [2026-09-15]: this module is now imported UNCONDITIONALLY (see
// data/index.js's own comment for why) so that Vite can bundle it in
// parallel with the main chunk instead of fetching it as a separate,
// serial round trip. That means this file's top-level code now runs even
// in a demo-mode build, where firebaseConfig is still full of REPLACE_ME
// placeholders -- so every module-scope Firebase SDK initializer below is
// guarded on isFirebaseConfigured and simply left null otherwise. That's
// safe: every exported function in this file is only ever CALLED once
// data/index.js has picked THIS module as `impl`, which only happens when
// isFirebaseConfigured is already true -- so app/db/auth/storage being null
// in a demo-mode build is never actually dereferenced.
const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
// [Bug found + fixed 2026-09-23] This used to use persistentLocalCache()
// (IndexedDB-backed, so profile/song/setlist data survived a full app
// close/reopen with zero connection). Root cause, confirmed by direct A/B
// test: right after DevTools "Clear site data" wipes IndexedDB, ANY
// IndexedDB-backed persistence -- tried both persistentMultipleTabManager
// AND persistentSingleTabManager, same result both times -- has some
// re-initialization window where even getDocFromServer() (documented to
// bypass local cache and hit the network directly) comes back with a false
// "document doesn't exist" for a document confirmed to be sitting right
// there in the Firebase console. Forcing memoryLocalCache() (no IndexedDB
// at all) is the only configuration that has actually held up against the
// same repro so far -- see architecture-and-decisions.md's migration
// section for the full elimination trail (account, document, rules, and
// project were all independently ruled out before landing here).
//
// Tradeoff being accepted for now: data no longer survives a full app
// close/reopen with zero connection (a genuinely offline cold start still
// needs network on relaunch). It DOES still survive a live connection drop
// mid-session -- anything already loaded while the tab was open stays
// readable/usable, and queued writes still flush once the connection
// returns -- since that only needs the in-memory cache, not IndexedDB. For
// how this app is actually used (a phone or laptop running one continuous
// session during a live service), a mid-service wifi drop is the far more
// likely failure mode than someone force-quitting and reopening in airplane
// mode, so this is a reasonable trade for now. Revisit if real persistent
// offline support turns out to matter enough to justify a deeper look at
// why IndexedDB itself won't warm up reliably here.
const db = isFirebaseConfigured ? initializeFirestore(app, {
  localCache: memoryLocalCache()
}) : null;
const auth = isFirebaseConfigured ? getAuth(app) : null;
// Media/AVP [2026-09-06] -- see storage.rules and the "Media" section below.
// Cloud Storage for Firebase requires the Blaze billing plan (since Sept
// 2024, for every project, no exceptions) -- getStorage() itself never
// fails just because Blaze isn't on yet, but every actual upload/delete call
// below will reject with a 402/403 until it is. See storage.rules' own
// header comment for the full note; uploadMediaFile()/deleteMediaFile()
// surface that failure as a normal rejected Promise, same as any other
// network error, so the UI's existing "couldn't save, try again" toast
// pattern already covers it without any special-casing.
const storage = isFirebaseConfigured ? getStorage(app) : null;
// Must match functions/index.js's setGlobalOptions({region:'asia-southeast1'})
// -- an onCall function is only reachable at the region it's actually
// deployed to; getFunctions() defaults to us-central1, which would 404
// every call here if left unset.
const functionsClient = isFirebaseConfigured ? getFunctions(app, 'asia-southeast1') : null;

// Projector-only isolated Firestore connection [2026-09-24] -- Jared, after
// live-testing the offline banner: "make the projector mode continue even
// offline." What already works with zero code here: `db` above stays on
// memoryLocalCache() (see its own big comment), and that alone already
// survives a mid-service connection drop just fine -- Firestore's pending-
// writes queue and listener reconnect are tied to the client instance's
// lifetime, not to persistence config, so the projector just holds its
// last slide and catches back up once wifi returns. What memoryLocalCache()
// genuinely can NOT do is survive the projector TAB ITSELF reloading or
// relaunching while still offline (a browser/OS crash, someone bumping the
// laptop, a kiosk auto-refresh) -- with no persistent cache, a cold reload
// has nothing to read until the network is back, so the screen goes blank
// mid-service. Fixing that for real needs a persistent, IndexedDB-backed
// cache -- the exact thing that was pulled everywhere else in this file
// after it caused a real production bug (see "The iworship-ph account
// reset..." in architecture-and-decisions.md): a cold-IndexedDB
// initialization race that could return a false "document doesn't exist"
// for a moment right after a fresh start, which on the profile-setup
// screen meant real accounts got stuck asking to re-register.
//
// The fix here is NOT "turn persistence back on" -- it's a second,
// completely separate Firebase app instance (`projectorApp`/`projectorDb`,
// same project, same config, just a second named connection), used for
// exactly one thing: the Presenter/Projector route's own read-only room-doc
// subscription (watchProjectorRoom() below), and nothing else -- no
// sign-in, no profile reads, no writes of any kind ever touch this
// instance. Two things make this meaningfully safer than just flipping the
// old switch back on, not just "the same risk moved to a new spot":
//   1. `rooms/{code}` reads are public (`allow read: if true` in
//      firestore.rules) -- this connection never authenticates, so it
//      structurally cannot reproduce the profile/auth race that actually
//      caused the incident, even if the underlying cold-IndexedDB race
//      itself still exists in the SDK.
//   2. If that race DOES still fire here, the blast radius is one
//      `onSnapshot` callback on one screen getting a stale/false null for a
//      moment -- renderSessionProjector() already renders that as "This
//      session isn't available" (same as any other null room) and the very
//      next real snapshot corrects it automatically, same self-healing
//      behavior the projector already has for an ordinary mid-service
//      reconnect. There's no profile-setup-style dead end for it to strand
//      anyone on.
// persistentMultipleTabManager() (rather than the single-tab manager Jared
// already confirmed regresses nothing) -- so this doesn't misbehave if a
// venue ever somehow ends up with two projector tabs open in the same
// browser profile at once.
const projectorApp = isFirebaseConfigured ? initializeApp(firebaseConfig, 'projector') : null;
const projectorDb = isFirebaseConfigured ? initializeFirestore(projectorApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}) : null;

// ---------------------------------------------------------------------- Songs
export function watchSongs(callback) {
  return onSnapshot(collection(db, 'songs'), (snap) => {
    const songs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    songs.sort((a, b) => (a.number || 0) - (b.number || 0));
    callback(songs);
  });
}

export async function addSong(song) {
  const ref = await addDoc(collection(db, 'songs'), { ...song, createdAt: serverTimestamp() });
  return ref.id;
}

// Shallow-merges patch into an existing song doc (e.g. setting `themes`
// after an AI-tagging suggestion is accepted). Covered by the same
// `allow create, update: if isEditor();` rule as addSong -- no rules change
// needed.
export async function updateSong(id, patch) {
  await updateDoc(doc(db, 'songs', id), patch);
}

// Song usage tracking [2026-09-24] -- Jared: "song usage tracking, you can
// add that to admins." A running per-song counter (songUseCount) plus the
// most recent time it went live (songLastUsedAt), incremented from
// goLive()'s song branch every time a host actually publishes a song to a
// live room (not merely staged in preview -- see hostPreview/goLive()'s own
// comments). Deliberately a plain running total rather than a per-event log
// collection -- Jared's ask was "tracking," not a detailed history browser,
// and a log would need its own new collection/rules/UI for a feature this
// narrow. increment()/serverTimestamp() are the same primitives likeItem()/
// followUser() above already use for other running counters. This needed a
// narrow `songs/{songId}` update-rule carve-out (any signed-in user, but
// ONLY these two fields) since most hosts presenting a song aren't an
// editor/canAddSongsRole() -- see firestore.rules' own comment on it.
export async function recordSongUsage(songId) {
  await updateDoc(doc(db, 'songs', songId), { songUseCount: increment(1), songLastUsedAt: serverTimestamp() });
}

// ----------------------------------------------------------------------- Auth
export function watchAuth(callback) {
  return onAuthStateChanged(auth, (user) => {
    callback(user ? { uid: user.uid, displayName: user.displayName, email: user.email, isDemo: false } : null);
  });
}
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const u = result.user;
  return { uid: u.uid, displayName: u.displayName, email: u.email, isDemo: false };
}
export async function signOutUser() {
  await signOut(auth);
}

// Email/password login [2026-09-10] -- Jared: "I was thinking of having a
// username password system as well so we can log in to other devices
// without having to log in our google account itself." Rather than a
// second, disconnected account system, this ADDS a password credential to
// the SAME Firebase account someone already has (via linkWithCredential),
// so either Google OR email+password signs into the identical account —
// same uid, same profile, same everything. signUpWithEmail is for someone
// starting fresh with no Google sign-in at all; linkPasswordToAccount is
// for someone already signed in with Google who wants a fallback login for
// other devices. Requires Jared to turn on the "Email/Password" sign-in
// provider in the Firebase console (Authentication -> Sign-in method) --
// same one-toggle, no-CLI pattern as everything else in this project.
export async function signUpWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const u = result.user;
  return { uid: u.uid, displayName: u.displayName, email: u.email, isDemo: false };
}
export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const u = result.user;
  return { uid: u.uid, displayName: u.displayName, email: u.email, isDemo: false };
}
// Adds a password credential to the CURRENTLY signed-in account (must
// already be signed in via Google) so the same account can also sign in
// with email+password from any device going forward.
export async function linkPasswordToAccount(email, password) {
  if (!auth.currentUser) throw new Error('Sign in first, then add a password to your account.');
  const cred = EmailAuthProvider.credential(email, password);
  await linkWithCredential(auth.currentUser, cred);
}
export function hasPasswordLogin() {
  if (!auth.currentUser) return false;
  return auth.currentUser.providerData.some((p) => p.providerId === 'password');
}
export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

// -------------------------------------------------------------------- Profile
function defaultProfile() {
  return {
    displayName: '', churchName: '', mode: 'sing', scale: 1, theme: null, favorites: [],
    // Monetization fields -- see interface.md for the full shape/notes.
    // null/false until an Admin sets them via the in-app Admin screen
    // (beta phase -- no Cloud Functions/payment flow yet).
    role: null, churchId: null, pastorTitle: null, isBetaTester: false,
    // Fellowship [2026-09-08] -- see interface.md's "FELLOWSHIP" section.
    bio: '', photoURL: null, photoStoragePath: null, blockedUids: [],
    // Notification preferences [2026-09-17] -- per-type opt-OUT, not opt-in:
    // absent/undefined means "on" (both here and in the two Cloud Functions
    // that read this field with the Admin SDK -- onNewSessionNotify/
    // dailyVerseNotify in functions/index.js -- treat a missing notifPrefs
    // doc, or a missing key within it, as true), so enabling push already
    // opts someone into every notification type without an extra step, and
    // this only ever needs writing when someone actively turns ONE off.
    // 'messages' and Fellowship 'social' (like/comment/follow/repost) were
    // deliberately left un-gated by a preference -- they're 1:1 and already
    // rare enough that Jared never asked for a way to mute them; only the
    // two new broadcast-style types (a session going live, the daily verse)
    // get their own toggle, since those are the ones a person could
    // reasonably find too frequent.
    notifPrefs: { sessions: true, dailyVerse: true }
  };
}
export function watchProfile(uid, callback) {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    // meta.fromCache [Bug found 2026-09-22] -- onSnapshot's FIRST callback
    // can come straight from Firestore's local cache before the real
    // server response ever arrives, and right after a cold/cleared cache
    // (a fresh sign-in, or right after DevTools "Clear site data") that
    // cache has nothing for this doc yet -- so `snap.exists()` reads false
    // for a split second even for a person with a real, long-existing
    // profile, before a SECOND callback fires moments later with the
    // server-confirmed truth. app.js's needsProfileSetup gate depends on
    // telling a confirmed "no profile" apart from this tentative one -- see
    // its own comment for why -- so pass along whether THIS snapshot is
    // actually server-confirmed rather than deciding that here.
    callback({ ...defaultProfile(), ...(snap.exists() ? snap.data() : {}) }, { fromCache: snap.metadata.fromCache, exists: snap.exists() });
  }, (err) => {
    // [Bug found 2026-09-23] This listener had NO error handler at all --
    // if Firestore ever actually rejected the read (rules denial, or a
    // genuine backend/connectivity failure) it would fail completely
    // silently: no console error, nothing, just a listener that never
    // calls back again. Jared's diagnostic log showed exactly that shape
    // (one cache-only snapshot, then nothing, forever) -- this at least
    // surfaces whatever Firestore itself says the problem is instead of
    // leaving it a total mystery.
    console.error('[iworship-debug] watchProfile onSnapshot ERROR', err && err.code, err && err.message, err);
  });
}
// [Bug found 2026-09-23] One-shot, cache-bypassing companion to
// watchProfile() above, for exactly the situation its own comment
// describes: right after a cold/cleared local cache, the live onSnapshot
// listener's transition from its tentative cache-miss snapshot to a real
// server-confirmed one has, in practice, sometimes taken longer than any
// reasonable timeout, or not visibly happened at all within it -- flaky in
// a way that pointed at the LISTEN stream itself rather than anything
// about the account or the rules (same account, same steps, worked one
// time and not the next). getDocFromServer() goes over a completely
// different path -- a single request with the SDK's own retry/backoff,
// not a persistent stream -- so app.js fires this the moment it hits that
// ambiguous state, as a second, independent way to find out the truth
// instead of only ever waiting on the one listener that's already acting
// up.
//
// [Bug found 2026-09-23, round 2] Jared's own repro (uid logged and
// confirmed correct, matching a document the Firebase console shows
// intact with a real displayName, checked moments apart) still got back
// snap.exists() === false from a SINGLE getDocFromServer() call, right
// after a Clear-site-data + relogin. Not a rules denial (that throws --
// this resolved normally) and not the wrong project (firebase-config.js
// checked, correctly iworship-ph). That only leaves the read itself being
// unreliable in the first moment or two after IndexedDB persistence gets
// re-initialized from nothing -- so, same fix shape as the listener's own
// flakiness: don't trust a single "not found" here either. Retry a couple
// of times, a beat apart, before believing it.
export async function fetchProfileFromServer(uid, attempt) {
  attempt = attempt || 1;
  const snap = await getDocFromServer(doc(db, 'users', uid));
  console.debug('[iworship-debug] fetchProfileFromServer attempt ' + attempt, {
    uid, exists: snap.exists()
  });
  if (!snap.exists() && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return fetchProfileFromServer(uid, attempt + 1);
  }
  return { ...defaultProfile(), ...(snap.exists() ? snap.data() : {}) };
}
// [Bug found 2026-09-10, fixed v29] Two real accounts (Jared's own second
// test account and his friend's) reported being unable to find EACH OTHER
// by name search, even after the v28 directory/{uid} rules fix. Root cause:
// saveProfile() below only ever mirrors the fields a given call actually
// touches into directory/{uid} -- so an account is only ever searchable by
// name/church once IT HAS MADE A saveProfile() CALL THAT INCLUDES THAT
// FIELD, at some point after the directory collection existed at all
// (2026-09-08). Two different ways to fall through that gap, both hit at
// once here: (1) any account whose displayName/churchName was set back
// before Fellowship/directory shipped, and who hasn't resaved bio/photo/
// favorites since -- Jared's own long-running main account is exactly this
// shape -- has NO directory doc at all; (2) an account whose first-ever
// directory write was a photo-only save (the v28 scenario) has a directory
// doc that exists, but with no displayName field in it at all, since only
// photoURL was ever sent -- unsearchable by name even though the doc is
// there. Both are really the same design gap: directory/{uid} is a
// denormalized MIRROR of fields that live on the real source of truth,
// users/{uid}, and there was never anything that reconciled the two except
// an explicit, field-specific saveProfile() patch.
//
// Fixed by self-healing on every sign-in instead of requiring a one-time
// migration script Jared has no way to run (no Node/CLI -- see
// claude/architecture-and-decisions.md's "No-CLI deployment" note): once
// per session, right after a signed-in person's own profile loads (see
// app.js's watchProfile callback), this pushes their FULL current
// displayName/churchName/photoURL/bio/favorites -- not just whatever a
// specific edit touched -- into their own directory/{uid} doc. A merge
// write, so it's a safe no-op for anyone already in sync, and it's scoped
// to the signed-in person's own uid, matching directory/{uid}'s existing
// owner-only write rule exactly (no rules change needed). The next time
// ANY existing account signs in, past or present, its directory entry
// catches up to reality with zero manual steps on Jared's end.
export async function ensureDirectoryEntry(uid, profile) {
  await setDoc(doc(db, 'directory', uid), {
    uid,
    displayName: profile.displayName || '',
    churchName: profile.churchName || '',
    photoURL: profile.photoURL || null,
    bio: profile.bio || '',
    favorites: profile.favorites || []
  }, { merge: true });
}

export async function saveProfile(uid, patch) {
  await setDoc(doc(db, 'users', uid), patch, { merge: true });
  // Mirror the searchable/public-profile fields into directory/{uid}
  // whenever they're part of this write -- see "SHARING" below and
  // firestore.rules' directory/{uid} block. Deliberately only ever mirrors
  // these fields, never the rest of the profile (role/churchId/
  // isBetaTester/blockedUids etc stay private) -- and only the ones
  // actually touched by this call, merged into the existing directory doc
  // rather than overwriting it outright (an Admin's role-only patch, or a
  // later profile-photo-only save, never reaches here / never wipes the
  // other fields). photoURL joined [2026-09-08, Fellowship]: an avatar is
  // exactly as public as a display name once profile pictures exist. bio +
  // favorites joined in the same feature [2026-09-08, Fellowship profile
  // page]: Jared's social-profile ask needs a bio and a "favorite
  // hymnals" list visible on someone else's profile page, cross-church,
  // and users/{uid} itself is private-by-default -- so, same reasoning,
  // these are exactly as public as the rest of the directory entry once a
  // public profile page exists.
  const directoryPatch = {};
  if (patch.displayName !== undefined) directoryPatch.displayName = patch.displayName || '';
  if (patch.churchName !== undefined) directoryPatch.churchName = patch.churchName || '';
  if (patch.photoURL !== undefined) directoryPatch.photoURL = patch.photoURL || null;
  if (patch.bio !== undefined) directoryPatch.bio = patch.bio || '';
  if (patch.favorites !== undefined) directoryPatch.favorites = patch.favorites || [];
  if (Object.keys(directoryPatch).length) {
    await setDoc(doc(db, 'directory', uid), { uid, ...directoryPatch, updatedAt: serverTimestamp() }, { merge: true });
  }
}

// Every signed-up profile, for the Admin screen's "find by name" search --
// so an Admin can assign a role/beta access without already having the
// person's Account ID in hand. Safe to list unfiltered under firestore.rules'
// users/{uid} read rule (`request.auth.uid == uid || isAdmin()`) specifically
// because that rule depends only on request.auth, never on resource.data --
// Firestore can prove the rule holds for every document in the collection
// given a fixed auth context, so an Admin's unfiltered query is allowed in
// full, while a non-admin's identical query is denied in full (not silently
// filtered down to just their own doc). See firestore.rules' comment on this
// same rule for the long-form version of this reasoning.
export function watchAllUsers(callback) {
  return onSnapshot(collection(db, 'users'), (snap) => {
    const users = snap.docs.map((d) => ({ uid: d.id, ...defaultProfile(), ...d.data() }));
    users.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    callback(users);
  });
}

// Directory search [2026-09-04] -- Jared: "give them a search bar where
// they can search for Account ID, name, church" for sharing a sermon.
// Deliberately NOT reusing watchAllUsers()/users/{uid} above: that read
// rule only lets an Admin list every profile (see its own comment), by
// design -- profiles carry role/churchId/isBetaTester, which stay private
// between a person and Admins. directory/{uid} is a separate, narrower,
// publicly-readable mirror (see saveProfile() above and firestore.rules'
// directory/{uid} block) holding only {uid, displayName, churchName} --
// never anything else -- so ANY signed-in person can search it, the same
// list-safety shape as watchAllChurches()/churches/{id} (unconditional
// `allow read: if true`, so an unfiltered list query is trivially provable
// with nothing to prove).
export function watchDirectory(callback) {
  return onSnapshot(collection(db, 'directory'), (snap) => {
    const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    callback(list);
  });
}

// ---------------------------------------------------------------------- Rooms
function makeRoomCode() {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

export async function createRoom(room) {
  const code = makeRoomCode();
  const passwordHash = room.password ? await sha256Hex(room.password) : null;
  await setDoc(doc(db, 'rooms', code), {
    code, name: room.name, hostUid: room.hostUid, hostName: room.hostName, churchName: room.churchName || '',
    isPublic: room.isPublic, passwordHash,
    currentSongId: null, currentSectionIndex: 0, setlist: room.setlist || [],
    // Co-hosting [2026-09-05]: coHostUids is the owner-managed roster of
    // other accounts allowed into this room's host screen; controllerUid is
    // whichever ONE of {hostUid, ...coHostUids} currently has their hands on
    // the actual controls (starts as the owner). See firestore.rules'
    // rooms/{code} update rule for how these two are protected from a
    // non-owner controller rewriting them.
    coHostUids: [], controllerUid: room.hostUid,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return code;
}

export function watchRoom(code, callback) {
  return onSnapshot(doc(db, 'rooms', code), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// Projector-only [2026-09-24] -- see projectorDb's own big comment above for
// the full reasoning. Identical to watchRoom() in every way except which
// Firestore instance it reads through -- projectorDb (persistent,
// IndexedDB-backed cache) instead of db (memory-only) -- so app.js's
// watchActiveRoom() can swap this in only for the Presenter/Projector
// route with zero other behavior difference.
export function watchProjectorRoom(code, callback) {
  return onSnapshot(doc(projectorDb, 'rooms', code), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function updateRoom(code, patch) {
  await updateDoc(doc(db, 'rooms', code), { ...patch, updatedAt: serverTimestamp() });
}

export async function endRoom(code) {
  // Clear the room's chat subcollection first -- Firestore never cascade-
  // deletes subcollections when the parent doc goes away, and room codes are
  // only 4 characters (so a code can eventually get reused by a later
  // session, which would otherwise silently inherit an old conversation).
  const msgsSnap = await getDocs(collection(db, 'rooms', code, 'messages'));
  await Promise.all(msgsSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'rooms', code));
}

export function watchPublicRooms(callback) {
  const q = query(collection(db, 'rooms'), where('isPublic', '==', true));
  return onSnapshot(q, (snap) => {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const rooms = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => toMillis(r.updatedAt) > sixHoursAgo)
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(rooms);
  });
}
function toMillis(ts) {
  if (!ts) return 0;
  if (ts instanceof Timestamp) return ts.toMillis();
  if (typeof ts === 'number') return ts;
  return 0;
}

// Every room a given uid has ever hosted, regardless of age or whether it's
// still "active" -- unlike watchPublicRooms above (which deliberately hides
// anything older than 6 hours from the public browse list), this is the
// host's own management view, specifically so a session left open by
// accident (closed tab, forgot to end it) can be found and ended later from
// inside the app, instead of needing the Firebase console. A single-field
// where() with a client-side sort, same as watchPublicRooms, so it never
// needs a composite index.
export function watchHostRooms(uid, callback) {
  const q = query(collection(db, 'rooms'), where('hostUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const rooms = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(rooms);
  });
}

// Every room a given uid has been assigned as a co-host on -- mirrors
// watchHostRooms above exactly, just keyed off coHostUids (an array-contains
// query, still a single-field filter with a client-side sort so it never
// needs a composite index either). Lets a co-host find their way back into a
// room's host screen from "My Sessions" the same way the owner does, without
// needing the room code re-shared to them every time.
export function watchCoHostRooms(uid, callback) {
  const q = query(collection(db, 'rooms'), where('coHostUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const rooms = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(rooms);
  });
}

export async function checkRoomPassword(code, password) {
  // Rooms are read-public (see firestore.rules) so this just reads the doc's
  // passwordHash client-side and compares — see hash.js for the threat model.
  const snap = await getDoc(doc(db, 'rooms', code));
  if (!snap.exists()) return false;
  const data = snap.data();
  if (!data.passwordHash) return true;
  return (await sha256Hex(password || '')) === data.passwordHash;
}

// -------------------------------------------------------------------- Editor
// Whether uid is on the worship team's allowlist (see firestore.rules'
// isEditor() and the editors/{uid} docs added by hand in the console). A
// user can only read their own editors/{uid} doc (that's what the rules
// allow) -- this is purely "am I on the list", never a way to check anyone
// else's status.
export async function checkIsEditor(uid) {
  const snap = await getDoc(doc(db, 'editors', uid));
  return snap.exists();
}

// Same doc-exists-only pattern, for the app's Admins (Jared + one friend --
// see firestore.rules' comment on admins/{uid}). Being an Admin bypasses
// every monetization gate (Play Mode/add-song/hosting) and grants write
// access to churches/{id} and any user's profile, for the beta phase.
export async function checkIsAdmin(uid) {
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists();
}

// ------------------------------------------------------------------- Chat
// Messages live in a rooms/{code}/messages subcollection, filtered by a
// `channel` field rather than separate collections per channel -- see
// interface.md for why that keeps adding a future channel a small change.
// The query only filters by channel (no orderBy) so it never needs a
// composite index; sorting the (small, per-service) result set client-side
// is simpler than asking a non-technical host to create one by hand.
export function watchSessionMessages(code, channel, callback) {
  const q = query(collection(db, 'rooms', code, 'messages'), where('channel', '==', channel));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    callback(messages.slice(-200));
  });
}

export async function sendSessionMessage(code, channel, message) {
  await addDoc(collection(db, 'rooms', code, 'messages'), {
    channel,
    text: message.text,
    senderName: message.senderName || 'Someone',
    senderUid: message.senderUid || null,
    createdAt: serverTimestamp()
  });
}

// ------------------------------------------------------------------ Churches
// Monetization foundation only (see claude/monetization-plan.md in the
// project docs) -- nothing in the app calls this yet. Read-only from the
// client on purpose: firestore.rules denies all writes to churches/{id}
// until Cloud Functions (driven by an actual payment webhook) exist to
// manage plan/seat data safely -- see that rule's comment for why. A
// scaffold for those functions (registerChurch, assignRole,
// updateChurchLibrary) lives in functions/ at the repo root -- written but
// not deployed or tested, since deploying requires Jared to switch this
// Firebase project to the Blaze plan first. Confirmed shape (schema settled
// [2026-09-03], not yet populated by anything): { id, name, plan,
// seatLimits: { pastors, editors, musicDirectors, musicians },
// hiddenSongIds: string[], gracePeriodDays, billingCadence, createdAt }.
// See interface.md for what each field means.
export function watchChurch(churchId, callback) {
  return onSnapshot(doc(db, 'churches', churchId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// Every registered church, for the Admin screen's church list/picker. Not
// used anywhere else -- an ordinary member only ever looks up their own
// church via watchChurch(profile.churchId) above.
export function watchAllChurches(callback) {
  return onSnapshot(collection(db, 'churches'), (snap) => {
    const churches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    churches.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    callback(churches);
  });
}

// Reserves a fresh churches/{id} document id without writing anything yet
// -- doc(collection(...)) mints an id client-side, same trick used for
// createRoom's code generation conceptually, just with Firestore's own
// auto-id instead of a 4-character code.
export function newChurchId() {
  return doc(collection(db, 'churches')).id;
}

// Beta-phase replacement for the registerChurch/updateChurchLibrary Cloud
// Functions -- an Admin creates or edits a church directly (see
// firestore.rules' "BETA PHASE" comment on churches/{churchId}). Shallow-
// merges patch, same convention as updateSong/saveProfile.
export async function saveChurch(churchId, patch) {
  await setDoc(doc(db, 'churches', churchId), patch, { merge: true });
}

// ------------------------------------------------------------- Song Requests
// See local-data-layer.js's matching comment and interface.md's "Song
// requests" section for the full design. Gated by firestore.rules'
// songRequests/{requestId} match block: a signed-in person can create their
// own request (submittedByUid must equal their own uid) and read their own
// back via a submittedByUid==uid query -- provable the same way
// watchHostRooms' hostUid==uid query already is under rooms/{code}'s update/
// delete rule. The review queue (watchPendingSongRequests) relies on the
// OTHER read/update disjunct (isEditor() || hasFullAccess()), which depends
// only on request.auth, so it's provable for an unfiltered or status-
// filtered query the same way watchAllUsers() already is under users/{uid}'s
// read rule -- see that function's comment above.
export async function submitSongRequest(request) {
  const ref = await addDoc(collection(db, 'songRequests'), {
    ...request,
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedByUid: null, reviewedByName: null, reviewedAt: null, reviewNote: ''
  });
  return ref.id;
}

export function watchPendingSongRequests(callback) {
  const q = query(collection(db, 'songRequests'), where('status', '==', 'pending'));
  return onSnapshot(q, (snap) => {
    const pending = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    pending.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    callback(pending);
  });
}

export function watchMySongRequests(uid, callback) {
  const q = query(collection(db, 'songRequests'), where('submittedByUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    callback(mine);
  });
}

export async function reviewSongRequest(requestId, patch) {
  await updateDoc(doc(db, 'songRequests', requestId), { ...patch, reviewedAt: serverTimestamp() });
}

// ------------------------------------------------------------------ Sermons
// See local-data-layer.js's matching comment for the design. Gated by
// firestore.rules' sermons/{sermonId} match block: read is wide open (`if
// true`, same as songs/rooms) since a room viewer or the Presenter/Projector
// tab needs to read whichever ONE sermon a room is currently presenting by
// id, without needing broad list-query permissions -- there's no "browse
// all sermons" query anywhere in this app, so that openness never turns
// into an actual list-safety question the way songRequests' did. Only
// create/update/delete are ownership-gated (createdByUid == auth.uid), same
// shape as rooms/{code}'s hostUid-based ownership.
export async function createSermon(sermon) {
  const ref = await addDoc(collection(db, 'sermons'), {
    ...sermon,
    sharedWithUids: sermon.sharedWithUids || [], // see "SHARING" note below
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateSermon(id, patch) {
  await updateDoc(doc(db, 'sermons', id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteSermon(id) {
  await deleteDoc(doc(db, 'sermons', id));
}

export function watchMySermons(uid, callback) {
  const q = query(collection(db, 'sermons'), where('createdByUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(mine);
  });
}

export function watchSermon(id, callback) {
  return onSnapshot(doc(db, 'sermons', id), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// ------------------------------------------------------------- SHARING
// [2026-09-04] Jared: "give them a search bar where they can search for
// Account ID, name, church, and add an option to share the link as well."
// arrayUnion/arrayRemove (rather than a read-modify-write) so two people
// sharing the same sermon around the same moment never clobber each
// other's change. Gated by firestore.rules' sermons/{sermonId} update
// rule's second disjunct: any signed-in person may patch *only*
// sharedWithUids on a sermon they don't own (never any other field) --
// the narrow carve-out that makes the second call site below (a recipient
// adding THEMSELVES via a ?sermon=<id> link) safe without opening up the
// rest of the document.
export async function shareSermon(id, uid) {
  await updateDoc(doc(db, 'sermons', id), { sharedWithUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}
export async function unshareSermon(id, uid) {
  await updateDoc(doc(db, 'sermons', id), { sharedWithUids: arrayRemove(uid), updatedAt: serverTimestamp() });
}

// A sermon someone else built and shared with this uid -- see
// local-data-layer.js's matching comment. Provable under the sermons read
// rule (`allow read: if true`) the same trivial way watchAllChurches() is
// under churches/{id} -- nothing to prove when read is unconditional.
export function watchSermonsSharedWithMe(uid, callback) {
  const q = query(collection(db, 'sermons'), where('sharedWithUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const shared = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.createdByUid !== uid);
    shared.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(shared);
  });
}

// -------------------------------------------------------------- Media/AVP
// [2026-09-06] Jared: "is there a way for us to upload a presentation
// (canva, pptx, google slides embed)? an image? a video?" -- a `media` doc
// is deliberately as close a copy of the `sermons` shape above as the
// content allows (same sharedWithUids sharing model, same wide-open read,
// same creator-only write) -- see firestore.rules' media/{mediaId} block.
// Four `type`s: 'image' (one file, one url/storagePath), 'video' (one file,
// one url/storagePath, played back on the room's live-synced clock -- see
// app.js's mediaPlayPause()/mediaRestart()), 'slideshow' (an ORDERED array
// of {url, storagePath} image slides -- how a Canva/Google Slides/PowerPoint
// deck gets in here: export it as images/a PDF outside the app, then upload
// each page as one slide, same as a sermon's slide array), and 'embed' (no
// uploaded file at all -- just a pasted public share/embed link, e.g. a
// Google Slides "Publish to web" embed URL or a Canva "present" link,
// rendered in a sandboxed <iframe> on stage; slide navigation then happens
// INSIDE that embed, outside this app's own preview/live sync -- a
// disclosed, deliberate simplification rather than trying to remote-control
// a third party's player).
export async function createMedia(media) {
  const ref = await addDoc(collection(db, 'media'), {
    ...media,
    sharedWithUids: media.sharedWithUids || [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateMedia(id, patch) {
  await updateDoc(doc(db, 'media', id), { ...patch, updatedAt: serverTimestamp() });
}

// Deletes the Firestore doc AND its underlying Storage file(s) (best-effort
// -- a file that's already gone, or a doc created before Storage/Blaze was
// even set up, shouldn't block removing the library entry itself). An
// 'embed' item has no storagePath at all (nothing was ever uploaded).
export async function deleteMedia(id, media) {
  const paths = [];
  if (media) {
    if (media.storagePath) paths.push(media.storagePath);
    if (Array.isArray(media.slides)) media.slides.forEach((s) => { if (s && s.storagePath) paths.push(s.storagePath); });
  }
  await Promise.all(paths.map((p) => deleteObject(storageRef(storage, p)).catch(() => {})));
  await deleteDoc(doc(db, 'media', id));
}

export function watchMyMedia(uid, callback) {
  const q = query(collection(db, 'media'), where('createdByUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(mine);
  });
}

export function watchMedia(id, callback) {
  return onSnapshot(doc(db, 'media', id), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function shareMedia(id, uid) {
  await updateDoc(doc(db, 'media', id), { sharedWithUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}
export async function unshareMedia(id, uid) {
  await updateDoc(doc(db, 'media', id), { sharedWithUids: arrayRemove(uid), updatedAt: serverTimestamp() });
}

export function watchMediaSharedWithMe(uid, callback) {
  const q = query(collection(db, 'media'), where('sharedWithUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const shared = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.createdByUid !== uid);
    shared.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(shared);
  });
}

// Uploads one file to Cloud Storage under media/{uid}/{kind}s/{a random id},
// reporting 0-100 progress via onProgress as the bytes go up -- see
// storage.rules for the matching size/content-type caps per kind ('image' or
// 'video'). Resolves with everything a media doc's url/storagePath/
// mimeType/sizeBytes fields need; the caller (app.js) decides whether that's
// the whole media item (a single image/video) or one entry in a slideshow's
// `slides` array.
export function uploadMediaFile(file, uid, kind, onProgress) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  const path = 'media/' + uid + '/' + kind + 's/' + id;
  const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on('state_changed',
      (snap) => { if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)); },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, storagePath: path, mimeType: file.type, sizeBytes: file.size });
        } catch (err) { reject(err); }
      }
    );
  });
}

// PowerPoint upload [2026-09-24] -- see convertPptxToSlideshow()'s own
// comment just below, and the matching Cloud Function in
// functions/index.js, for the full design. Uploads the RAW .pptx to a
// staging path only that Cloud Function (via the Admin SDK) ever reads --
// see storage.rules' pptx-source/{fileId} block, which deliberately has no
// `allow read` at all, unlike uploadMediaFile()'s image/video paths above.
// No getDownloadURL() call here on purpose: this path isn't publicly
// readable, so minting one would just fail (or be useless even if it
// didn't) -- the caller already knows the storagePath it just uploaded to,
// which is all convertPptxToSlideshow() needs.
export function uploadPptxSourceFile(file, uid, onProgress) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  const path = 'media/' + uid + '/pptx-source/' + id + '.pptx';
  const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  return new Promise((resolve, reject) => {
    task.on('state_changed',
      (snap) => { if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)); },
      (err) => reject(err),
      () => resolve({ storagePath: path })
    );
  });
}

// Calls convertPptxToSlideshow (functions/index.js) with the storagePath
// uploadPptxSourceFile() above just produced -- that function does the
// actual conversion (via the pptx-converter Cloud Run service) AND writes
// the resulting 'slideshow' media doc itself (it has to: it's the only
// place with server-side access to do the conversion at all), so unlike
// every other upload path in this file there's no separate createMedia()
// call needed here -- the caller's existing watchMyMedia() listener picks
// the new doc up on its own the moment this resolves. Can take a while
// (LibreOffice rendering a real deck, one slide at a time) -- the caller
// is expected to show its own "converting..." status while this is
// in flight; the Cloud Function's own timeout is 300s.
export async function convertPptxToSlideshow(storagePath, title) {
  const fn = httpsCallable(functionsClient, 'convertPptxToSlideshow');
  const result = await fn({ storagePath, title });
  return result.data; // { mediaId, slideCount }
}

export async function deleteMediaFile(storagePath) {
  await deleteObject(storageRef(storage, storagePath));
}

// ------------------------------------------------------------ Program Builder
// [2026-09-24] Jared: "what if we had another feature where the host can
// arrange the sequence of everything that will be presented? Along with
// notes and remarks for context, like a service program builder. Make it
// accessible for other members that the host will share it with." A
// `programs` doc is a host-built ORDER OF SERVICE -- an ordered list of
// items (song/sermon/verse/media/other), each with a label, an optional
// POC (point of contact -- either a directory-linked account, pocUid, or a
// plain typed name, pocName), notes, an optional duration, and (Jared, same
// request thread, added right after the rest was already scoped) a `done`
// checkbox the host can tick off during a live service. Deliberately as
// close a copy of the sermons/{sermonId} shape above as the content allows
// -- same wide-open read, same creator-only create, same sharedWithUids
// sharing model via shareProgram()/unshareProgram() (Jared: "make it
// accessible for other members that the host will share it with"), since a
// program, like a sermon, is a single host-owned document shared out to
// specific other accounts, never queried/browsed publicly. See
// firestore.rules' programs/{programId} block.
//
// A program item's songId/sermonId/mediaId (whichever applies to its
// `type`) is a LINK, not a copy -- editing the underlying song/sermon/media
// later is reflected automatically wherever the program shows that item's
// title. `label` is always still stored too: it's what free-typed
// 'verse'/'other' items use as their only title, AND it's what a linked
// item falls back to display if the thing it links to is ever deleted out
// from under it (see app.js's programItemDisplayLabel()).
//
// Room integration (no rules change needed -- see firestore.rules'
// rooms/{code} comment: the controlling co-host may already patch any room
// field besides hostUid/coHostUids/controllerUid): room.programId (which
// program, if any, this room is running from) and room.programCurrentItemId
// (the item's own id, NOT an array index, so "the current item" survives
// the host reordering or editing the program mid-service -- see app.js's
// Program tab, applyProgramToRoom()/setProgramCurrentItem()). Songs inside
// a program's items sync ONE-WAY into the room's own `setlist` (Jared:
// "keep the setlist... but whatever songs are in [t]here will also reflect
// in the setlist") -- see applyProgramToRoom() in app.js; the setlist
// stays the actual thing that drives song playback, the program is the
// higher-level run-of-show layered on top of it.
export async function createProgram(program) {
  const ref = await addDoc(collection(db, 'programs'), {
    ...program,
    sharedWithUids: program.sharedWithUids || [], // see "SHARING" note on sermons above -- identical model
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateProgram(id, patch) {
  await updateDoc(doc(db, 'programs', id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteProgram(id) {
  await deleteDoc(doc(db, 'programs', id));
}

export function watchMyPrograms(uid, callback) {
  const q = query(collection(db, 'programs'), where('createdByUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(mine);
  });
}

export function watchProgram(id, callback) {
  return onSnapshot(doc(db, 'programs', id), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function shareProgram(id, uid) {
  await updateDoc(doc(db, 'programs', id), { sharedWithUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}
export async function unshareProgram(id, uid) {
  await updateDoc(doc(db, 'programs', id), { sharedWithUids: arrayRemove(uid), updatedAt: serverTimestamp() });
}

export function watchProgramsSharedWithMe(uid, callback) {
  const q = query(collection(db, 'programs'), where('sharedWithUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const shared = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.createdByUid !== uid);
    shared.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(shared);
  });
}

// --------------------------------------------------------- Media Folders
// [2026-09-06] Jared: AVP team members should be able to "prep upload
// beforehand and manage it by folders" outside a live session. A folder is
// deliberately tiny -- just {name, createdByUid} -- see firestore.rules'
// mediaFolders/{folderId} block. media/{mediaId} docs point INTO a folder
// via their own folderId field (null/absent = unfiled), so deleting a
// folder here must first un-file every media item that points at it --
// it does NOT cascade-delete them, same as a real file manager.
export async function createMediaFolder(folder) {
  const ref = await addDoc(collection(db, 'mediaFolders'), {
    ...folder,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateMediaFolder(id, patch) {
  await updateDoc(doc(db, 'mediaFolders', id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteMediaFolder(id) {
  const q = query(collection(db, 'media'), where('folderId', '==', id));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { folderId: null, updatedAt: serverTimestamp() })));
  await deleteDoc(doc(db, 'mediaFolders', id));
}

export function watchMyMediaFolders(uid, callback) {
  const q = query(collection(db, 'mediaFolders'), where('createdByUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    callback(mine);
  });
}

// ============================================================= FELLOWSHIP
// [2026-09-08] See local-data-layer.js's matching header comment and
// interface.md's "FELLOWSHIP" section for the full design. Mirrors that
// demo-mode layer's shape line for line, backed by real Firestore
// collections instead of localStorage.

// ------------------------------------------------------------------- Posts
// posts/{postId}: wide-open read (see firestore.rules), creator-only
// delete. The global feed is capped server-side via orderBy+limit (unlike
// most other list queries in this app, which sort client-side to avoid a
// composite index -- a single orderBy with no where() needs no composite
// index, so this is the one query in the app that uses one directly).
export async function createPost(post) {
  const ref = await addDoc(collection(db, 'posts'), { ...post, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deletePost(id, post) {
  if (post && post.mediaStoragePath) { await deleteObject(storageRef(storage, post.mediaStoragePath)).catch(() => {}); }
  await deleteDoc(doc(db, 'posts', id));
}

export function watchFeedPosts(callback) {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function watchUserPosts(uid, callback) {
  const q = query(collection(db, 'posts'), where('authorUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    callback(mine);
  });
}

// ------------------------------------------------------------------ Reports
// reports/{reportId}: same read-shape reasoning as songRequests -- a
// reporter reads their own (reportedByUid==uid, provable per-doc) OR an
// Admin/beta-tester reads the whole pending queue (depends only on
// request.auth, provable unfiltered) -- see firestore.rules' comment.
export async function submitReport(report) {
  const ref = await addDoc(collection(db, 'reports'), {
    ...report, status: 'pending', createdAt: serverTimestamp(),
    resolvedByUid: null, resolvedByName: null, resolvedAt: null
  });
  return ref.id;
}

export function watchPendingReports(callback) {
  const q = query(collection(db, 'reports'), where('status', '==', 'pending'));
  return onSnapshot(q, (snap) => {
    const pending = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    pending.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    callback(pending);
  });
}

export async function resolveReport(id, patch) {
  await updateDoc(doc(db, 'reports', id), { ...patch, status: 'resolved', resolvedAt: serverTimestamp() });
}

// ----------------------------------------------------------------------- DMs
// One thread per pair, ever -- dmThreadId() derives a stable id from the
// sorted pair of uids so "start a DM" is "find or create the one doc that
// already represents this pair," never a fresh doc per conversation
// attempt. Messages live in a dmThreads/{id}/messages subcollection.
export function dmThreadId(uidA, uidB) {
  return 'dm-' + [uidA, uidB].sort().join('_');
}

export async function ensureDmThread(uidA, uidB, names, photos) {
  const id = dmThreadId(uidA, uidB);
  const ref = doc(db, 'dmThreads', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participantUids: [uidA, uidB], participantNames: names || {}, participantPhotos: photos || {},
      // readAt [v36, Messages unread badge] -- both participants "read" a
      // brand-new empty thread the instant it's created, matching
      // local-data-layer.js's comment on the same line.
      readAt: { [uidA]: serverTimestamp(), [uidB]: serverTimestamp() },
      lastMessageText: '', lastMessageAt: serverTimestamp(), createdAt: serverTimestamp()
    });
  }
  return id;
}

export function watchMyDmThreads(uid, callback) {
  const q = query(collection(db, 'dmThreads'), where('participantUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt));
    callback(mine);
  });
}

// No where()/orderBy() needed here at all (a thread's own messages
// subcollection has nothing else to filter by), so this can't need a
// composite index either way -- client-side sort, same as room chat.
export function watchDmMessages(threadId, callback) {
  return onSnapshot(collection(db, 'dmThreads', threadId, 'messages'), (snap) => {
    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    callback(messages.slice(-500));
  });
}

export async function sendDmMessage(threadId, message) {
  await addDoc(collection(db, 'dmThreads', threadId, 'messages'), {
    senderUid: message.senderUid, senderName: message.senderName || 'Someone',
    text: message.text, createdAt: serverTimestamp()
  });
  // [v36] Also stamps the sender's own readAt.<uid> entry -- see
  // local-data-layer.js's matching comment. firestore.rules' dmThreads
  // update rule already lets either participant update any field on their
  // own thread, so this needs no rules change.
  await updateDoc(doc(db, 'dmThreads', threadId), {
    lastMessageText: message.text, lastMessageAt: serverTimestamp(),
    ['readAt.' + message.senderUid]: serverTimestamp()
  });
}

// [v36, Messages unread badge] Called whenever a person opens a DM thread
// (the dock popup or the full thread view) -- merge-writes just their own
// readAt entry via Firestore's dot-path field syntax, so it never
// disturbs the other participant's entry.
export async function markDmThreadRead(threadId, uid) {
  await updateDoc(doc(db, 'dmThreads', threadId), { ['readAt.' + uid]: serverTimestamp() });
}

// ------------------------------------------------------------- Group chats
// groupChats/{groupId}: owner creates/renames/manages membership; any
// current member may leave (self-remove from memberUids) -- see
// firestore.rules' groupChats update rule for the narrow carve-out
// mirroring sermons/media's sharedWithUids self-service pattern.
export async function createGroupChat(group) {
  const ref = await addDoc(collection(db, 'groupChats'), {
    lastMessageText: '',
    ...group,
    // readAt [v36, Messages unread badge] -- matches local-data-layer.js's
    // comment: only the owner has "read" a group at the moment they
    // create it.
    readAt: { [group.ownerUid]: serverTimestamp() },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateGroupChat(id, patch) {
  await updateDoc(doc(db, 'groupChats', id), { ...patch, updatedAt: serverTimestamp() });
}

// Owner-only, mirrors firestore.rules' groupChats/{groupId} "allow delete"
// rule -- app.js's renderGroupChatThread() calls this instead of the
// self-removal updateGroupChat() path when the person leaving is the
// group's owner, since there'd otherwise be no way for anyone to ever
// manage/rename/delete the group again once the owner is no longer a
// member. Deliberately doesn't sweep the messages subcollection (no
// public "browse old groups" surface will ever surface those orphaned
// docs, and the group doc itself -- the only thing any query filters
// on, via memberUids -- is gone either way).
export async function deleteGroupChat(id) {
  await deleteDoc(doc(db, 'groupChats', id));
}

export function watchMyGroupChats(uid, callback) {
  const q = query(collection(db, 'groupChats'), where('memberUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mine.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(mine);
  });
}

export function watchGroupChat(id, callback) {
  return onSnapshot(doc(db, 'groupChats', id), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function watchGroupChatMessages(groupId, callback) {
  return onSnapshot(collection(db, 'groupChats', groupId, 'messages'), (snap) => {
    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    callback(messages.slice(-500));
  });
}

export async function sendGroupChatMessage(groupId, message) {
  await addDoc(collection(db, 'groupChats', groupId, 'messages'), {
    senderUid: message.senderUid, senderName: message.senderName || 'Someone',
    text: message.text, createdAt: serverTimestamp()
  });
  // [v36] Previously only touched updatedAt -- see local-data-layer.js's
  // matching comment for the lastMessageText gap this also fixes, and
  // firestore.rules' groupChats update rule for the new narrow carve-out
  // that makes a NON-owner member's write here (readAt + updatedAt +
  // lastMessageText) actually permitted; before that rule existed, a
  // non-owner member's message would send fine but this follow-up
  // updateDoc call would throw permission-denied, which app.js's
  // sendCurrentGroupMsg() catch block then showed as "Couldn't send" even
  // though the message itself had already gone through.
  await updateDoc(doc(db, 'groupChats', groupId), {
    lastMessageText: message.text, updatedAt: serverTimestamp(),
    ['readAt.' + message.senderUid]: serverTimestamp()
  });
}

// [v36, Messages unread badge] Mirrors markDmThreadRead() above -- called
// when a member opens a group's thread (dock popup or full view).
export async function markGroupChatRead(groupId, uid) {
  await updateDoc(doc(db, 'groupChats', groupId), { ['readAt.' + uid]: serverTimestamp() });
}

// ==================================================== FELLOWSHIP REDESIGN
// [2026-09-09] See local-data-layer.js's matching header comment for the
// full "why" (likes/comments/repost/save, follow, notifications, stories,
// Shorts) and claude/fellowship-plan.md for the judgment calls. Backed by
// real Firestore collections instead of localStorage; likeCount/
// commentCount/repostCount/followerCount/followingCount are real
// increment()-ed fields on the parent doc (rather than counted from a full
// subcollection scan on every read) -- see firestore.rules' narrow "only
// these numeric fields may change" carve-outs on posts/{postId},
// shorts/{shortId}, and directory/{uid} that make this safe to let anyone
// signed in do, not just the doc's owner.

// ---- Likes -----------------------------------------------------------
function likeDocId(kind, itemId, uid) { return kind + '_' + itemId + '_' + uid; }

export async function likeItem(kind, itemId, uid) {
  await setDoc(doc(db, 'likes', likeDocId(kind, itemId, uid)), { uid, kind, itemId, createdAt: serverTimestamp() });
  await updateDoc(doc(db, kind, itemId), { likeCount: increment(1) });
}
export async function unlikeItem(kind, itemId, uid) {
  await deleteDoc(doc(db, 'likes', likeDocId(kind, itemId, uid)));
  await updateDoc(doc(db, kind, itemId), { likeCount: increment(-1) });
}
// Every kind:itemId this uid has liked -- a single query across the whole
// `likes` collection filtered to just this uid (provable under
// firestore.rules' likes/{likeId} read rule the same way every other
// owner-filtered list query in this app already is), so app.js can check
// "did I like this" for every card on screen from one live subscription
// instead of one listener per card.
export function watchMyLikes(uid, callback) {
  const q = query(collection(db, 'likes'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => {
    callback(new Set(snap.docs.map((d) => { const v = d.data(); return v.kind + ':' + v.itemId; })));
  });
}

// ---- Comments ----------------------------------------------------------
// Two plain equality filters (kind==, itemId==), sorted client-side -- no
// composite index needed (Firestore can merge-join two single-field
// equality filters on its own; it's only an inequality/orderBy-on-a-third-
// field combination that would need one -- see the rest of this app's
// habit of avoiding those wherever a client-side sort is cheap enough).
export async function addComment(kind, itemId, comment) {
  const ref = await addDoc(collection(db, 'comments'), { ...comment, kind, itemId, createdAt: serverTimestamp() });
  await updateDoc(doc(db, kind, itemId), { commentCount: increment(1) });
  return ref.id;
}
export async function deleteComment(commentId, kind, itemId) {
  await deleteDoc(doc(db, 'comments', commentId));
  await updateDoc(doc(db, kind, itemId), { commentCount: increment(-1) });
}
export function watchComments(kind, itemId, callback) {
  const q = query(collection(db, 'comments'), where('kind', '==', kind), where('itemId', '==', itemId));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    callback(list);
  });
}

// ---- Repost (posts only) ------------------------------------------------
export async function repostPost(uid, name, original) {
  const id = await createPost({
    authorUid: uid, authorName: name, text: '',
    mediaUrl: null, mediaKind: null, mediaStoragePath: null,
    repostOf: {
      postId: original.id, authorUid: original.authorUid, authorName: original.authorName,
      text: original.text || '', mediaUrl: original.mediaUrl || null, mediaKind: original.mediaKind || null
    }
  });
  await updateDoc(doc(db, 'posts', original.id), { repostCount: increment(1) });
  return id;
}

// ---- Save / Bookmark (private, owner-only -- users/{uid}/saved/{id}) ---
function savedDocId(kind, itemId) { return kind + '_' + itemId; }
export function watchMySaved(uid, callback) {
  return onSnapshot(collection(db, 'users', uid, 'saved'), (snap) => {
    callback(snap.docs.map((d) => d.data()));
  });
}
export async function toggleSave(uid, kind, itemId) {
  const ref = doc(db, 'users', uid, 'saved', savedDocId(kind, itemId));
  const snap = await getDoc(ref);
  if (snap.exists()) await deleteDoc(ref);
  else await setDoc(ref, { kind, itemId, savedAt: serverTimestamp() });
}

// ---- Follow (one-directional -- see local-data-layer.js's comment) -----
function followDocId(followerUid, targetUid) { return followerUid + '_' + targetUid; }
export async function followUser(followerUid, targetUid) {
  if (followerUid === targetUid) return;
  await setDoc(doc(db, 'follows', followDocId(followerUid, targetUid)), { followerUid, targetUid, createdAt: serverTimestamp() });
  // setDoc+merge (not updateDoc) on both directory docs -- see the comment
  // on followUser() in local-data-layer.js: every followable account has
  // already been through onboarding (which always sets displayName), so in
  // practice these docs already exist, but merge is the safe form either way.
  await setDoc(doc(db, 'directory', targetUid), { followerCount: increment(1) }, { merge: true });
  await setDoc(doc(db, 'directory', followerUid), { followingCount: increment(1) }, { merge: true });
}
export async function unfollowUser(followerUid, targetUid) {
  await deleteDoc(doc(db, 'follows', followDocId(followerUid, targetUid)));
  await setDoc(doc(db, 'directory', targetUid), { followerCount: increment(-1) }, { merge: true });
  await setDoc(doc(db, 'directory', followerUid), { followingCount: increment(-1) }, { merge: true });
}
export function watchMyFollowing(uid, callback) {
  const q = query(collection(db, 'follows'), where('followerUid', '==', uid));
  return onSnapshot(q, (snap) => callback(new Set(snap.docs.map((d) => d.data().targetUid))));
}

// ---- Notifications -------------------------------------------------------
// notifications/{recipientUid}/items/{itemId} -- written by the ACTOR doing
// the liking/commenting/following/reposting, read/marked-read only by the
// recipient -- see firestore.rules' comment on this collection.
export function watchNotifications(uid, callback) {
  const q = query(collection(db, 'notifications', uid, 'items'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
export async function createNotification(recipientUid, payload) {
  if (recipientUid === payload.actorUid) return;
  await addDoc(collection(db, 'notifications', recipientUid, 'items'), { ...payload, read: false, createdAt: serverTimestamp() });
}
export async function markNotificationRead(uid, id) {
  await updateDoc(doc(db, 'notifications', uid, 'items', id), { read: true });
}
export async function markAllNotificationsRead(uid, ids) {
  await Promise.all(ids.map((id) => updateDoc(doc(db, 'notifications', uid, 'items', id), { read: true })));
}

// ---- Stories (24h ephemeral -- expiry enforced client-side, see
// local-data-layer.js's comment for why) ----------------------------------
export async function createStory(story) {
  const ref = await addDoc(collection(db, 'stories'), { ...story, createdAt: serverTimestamp() });
  return ref.id;
}
export async function deleteStory(id) {
  await deleteDoc(doc(db, 'stories', id));
}
export function watchActiveStories(callback) {
  return onSnapshot(collection(db, 'stories'), (snap) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const active = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => toMillis(s.createdAt) > cutoff)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    callback(active);
  });
}
export async function deleteExpiredStoriesFor(uid) {
  const q = query(collection(db, 'stories'), where('authorUid', '==', uid));
  const snap = await getDocs(q);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const expired = snap.docs.filter((d) => toMillis(d.data().createdAt) <= cutoff);
  await Promise.all(expired.map((d) => deleteDoc(d.ref)));
}

// ---- Shorts ---------------------------------------------------------------
export async function createShort(short) {
  const ref = await addDoc(collection(db, 'shorts'), { ...short, likeCount: 0, commentCount: 0, createdAt: serverTimestamp() });
  return ref.id;
}
export async function deleteShort(id, short) {
  if (short && short.videoStoragePath) { await deleteObject(storageRef(storage, short.videoStoragePath)).catch(() => {}); }
  await deleteDoc(doc(db, 'shorts', id));
}
export function watchShortsFeed(callback) {
  const q = query(collection(db, 'shorts'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

// Trending (Explore/Discover) is deliberately NOT a separate query here --
// see app.js's trendingPosts() helper, which just re-sorts the SAME
// state.feedPosts already loaded by watchFeedPosts() above by likeCount
// instead of recency. A dedicated orderBy('likeCount','desc') query was
// considered and rejected: Firestore's orderBy silently EXCLUDES any
// document missing that field entirely, and every post created before this
// pass (or any post that's simply never been liked, if likeCount were left
// unset rather than defaulted to 0) would vanish from Explore rather than
// correctly sorting last -- re-sorting the already-fetched, always-
// defaulted-to-0 feed client-side sidesteps that trap entirely.

// ---- Push notifications (real, FCM) [2026-09-10] --------------------------
// Jared: "no notif came from the app (when closed) when I messaged her...
// I need you to set up something where the app asks for notif and
// background process permission." See claude/architecture-and-decisions.md
// for the full design (client here + src/sw.js's onBackgroundMessage +
// functions/index.js's sendPushOnNotification). Gated behind
// pushNotificationsConfigured (a VAPID key Jared generates himself in the
// Firebase console -- Project Settings -> Cloud Messaging -> Web Push
// certificates -- same REPLACE_ME-until-configured pattern as ai-config.js)
// so none of this does anything until that's set up.
export async function pushSupported() {
  try { return pushNotificationsConfigured && (await isMessagingSupported()); }
  catch (e) { return false; }
}
// Asks the browser for Notification permission, then (if granted) mints an
// FCM registration token for THIS device/browser and saves it under the
// signed-in person's own users/{uid}/pushTokens/{token} -- the token itself
// is the doc id, so re-enabling on the same device just overwrites the same
// doc instead of piling up duplicates. Returns 'granted' | 'denied' |
// 'unsupported' | 'unconfigured' rather than throwing, so the Settings UI
// can show a clear reason either way.
export async function enablePushNotifications(uid) {
  if (!pushNotificationsConfigured) return 'unconfigured';
  if (!(await pushSupported())) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getFcmToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return 'denied';
  await setDoc(doc(db, 'users', uid, 'pushTokens', token), {
    token, createdAt: serverTimestamp(), userAgent: navigator.userAgent
  });
  // Foreground messages (app open in an active tab) don't go through the
  // service worker's onBackgroundMessage at all -- Firebase delivers those
  // straight to the page instead. app.js's own onMessage listener (wired
  // once at startup, see that file) is what shows something for THIS case;
  // this function just makes sure a messaging instance exists to listen on.
  return 'granted';
}
export function currentNotificationPermission() {
  return (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
}
export async function disablePushNotifications(uid) {
  if (!pushNotificationsConfigured) return;
  if (!(await pushSupported())) return;
  const messaging = getMessaging(app);
  const registration = await navigator.serviceWorker.ready;
  const token = await getFcmToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null);
  if (token) await deleteDoc(doc(db, 'users', uid, 'pushTokens', token)).catch(() => {});
}
export function watchForegroundPush(callback) {
  if (!pushNotificationsConfigured) return () => {};
  let unsub = () => {};
  isMessagingSupported().then((supported) => {
    if (!supported) return;
    const messaging = getMessaging(app);
    unsub = onMessage(messaging, (payload) => callback(payload));
  }).catch(() => {});
  return () => unsub();
}
