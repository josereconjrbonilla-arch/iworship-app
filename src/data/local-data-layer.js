// Local demo-mode data layer — used automatically whenever firebase-config.js
// still has placeholder values (see data/index.js). Implements the exact same
// interface as firestore-data-layer.js (see interface.md) using localStorage
// for persistence and BroadcastChannel for realtime updates *between tabs on
// this one browser* — enough to fully exercise every screen, including a
// live-hosted Worship Session between two tabs, before a real Firebase
// project exists. It does not sync between separate devices; only the real
// Firestore layer does that.
import { SONGS_SEED } from '../content/songs-seed.js';
import { sha256Hex } from './hash.js';

const LS_SONGS = 'iworship:local:songs';
const LS_PROFILE_PREFIX = 'iworship:local:profile:';
const LS_ROOMS = 'iworship:local:rooms';
const LS_UID = 'iworship:local:uid';
const LS_USER = 'iworship:local:user';
const LS_MESSAGES_PREFIX = 'iworship:local:messages:';

let channel = null;
try { channel = new BroadcastChannel('iworship-local'); } catch (e) { /* unsupported */ }

// BroadcastChannel only delivers to *other* tabs, never back to the sender —
// so a same-tab listener (e.g. the host's own screen, right after it makes a
// change) needs a plain in-process pub-sub too, fired alongside the broadcast.
const localListeners = new Map(); // kind -> Set<fn>
function broadcast(kind) {
  (localListeners.get(kind) || []).forEach((fn) => fn());
  try { channel?.postMessage({ kind }); } catch (e) { /* ignore */ }
}
function onBroadcast(kind, fn) {
  if (!localListeners.has(kind)) localListeners.set(kind, new Set());
  localListeners.get(kind).add(fn);
  const offLocal = () => localListeners.get(kind)?.delete(fn);
  if (!channel) return offLocal;
  const handler = (ev) => { if (ev.data?.kind === kind) fn(); };
  channel.addEventListener('message', handler);
  return () => { offLocal(); channel.removeEventListener('message', handler); };
}

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

function ensureSongsSeeded() {
  if (localStorage.getItem(LS_SONGS) === null) writeJSON(LS_SONGS, SONGS_SEED);
}

// ---------------------------------------------------------------------- Songs
export function watchSongs(callback) {
  ensureSongsSeeded();
  const fire = () => callback(readJSON(LS_SONGS, []));
  fire();
  return onBroadcast('songs', fire);
}

export async function addSong(song) {
  ensureSongsSeeded();
  const songs = readJSON(LS_SONGS, []);
  const withId = { ...song, id: song.id || 'local-' + Date.now() };
  songs.push(withId);
  writeJSON(LS_SONGS, songs);
  broadcast('songs');
  return withId.id;
}

// Shallow-merges patch into an existing song (e.g. setting `themes` after an
// AI-tagging suggestion is accepted). Silently no-ops if the id isn't found,
// same tolerance as the rest of this local layer.
export async function updateSong(id, patch) {
  ensureSongsSeeded();
  const songs = readJSON(LS_SONGS, []);
  const idx = songs.findIndex((s) => s.id === id);
  if (idx === -1) return;
  songs[idx] = { ...songs[idx], ...patch };
  writeJSON(LS_SONGS, songs);
  broadcast('songs');
}

// Song usage tracking [2026-09-24] -- see firestore-data-layer.js's own
// comment on recordSongUsage() for the full design. Demo mode has no
// Firestore increment()/serverTimestamp(), so this just does the plain-JS
// equivalent directly on the local songs array.
export async function recordSongUsage(songId) {
  ensureSongsSeeded();
  const songs = readJSON(LS_SONGS, []);
  const idx = songs.findIndex((s) => s.id === songId);
  if (idx === -1) return;
  songs[idx] = { ...songs[idx], songUseCount: (songs[idx].songUseCount || 0) + 1, songLastUsedAt: Date.now() };
  writeJSON(LS_SONGS, songs);
  broadcast('songs');
}

// ----------------------------------------------------------------------- Auth
// Demo mode has no real account system — it mints a stable per-browser "local
// demo user" id and lets the person set a display name, honestly labeled as a
// preview rather than pretending to be Google sign-in.
function currentUser() {
  return readJSON(LS_USER, null);
}
export function watchAuth(callback) {
  const fire = () => callback(currentUser());
  fire();
  return onBroadcast('auth', fire);
}
export async function signInWithGoogle() {
  // No real OAuth in demo mode — mints a stable per-browser identity instead.
  // The app itself asks for a display name right after (see app.js), same as
  // it asks every new sign-in for a church name, since Google wouldn't know
  // that part either.
  let uid = localStorage.getItem(LS_UID);
  if (!uid) { uid = 'local-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(LS_UID, uid); }
  const user = { uid, displayName: null, email: null, isDemo: true };
  writeJSON(LS_USER, user);
  broadcast('auth');
  return user;
}
export async function signOutUser() {
  localStorage.removeItem(LS_USER);
  broadcast('auth');
}

// Email/password login [2026-09-10] -- demo-mode stand-in for the real
// Firestore layer's linkWithCredential-backed version (see that file's
// comment for the real design). Simulated locally with a small
// email->{uid,passwordHash} map so the UI/flow can be built and tested
// before Jared enables the real Email/Password sign-in provider.
const LS_EMAIL_ACCOUNTS = 'iworship:local:emailAccounts';
function readEmailAccounts() { return readJSON(LS_EMAIL_ACCOUNTS, {}); }
function writeEmailAccounts(map) { writeJSON(LS_EMAIL_ACCOUNTS, map); }
export async function signUpWithEmail(email, password) {
  const key = (email || '').trim().toLowerCase();
  if (!key || !password) throw new Error('Enter both an email and a password.');
  const accounts = readEmailAccounts();
  if (accounts[key]) throw new Error('An account with that email already exists (demo mode) -- try signing in instead.');
  const uid = 'local-' + Math.random().toString(36).slice(2, 10);
  accounts[key] = { uid, passwordHash: await sha256Hex(password) };
  writeEmailAccounts(accounts);
  const user = { uid, displayName: null, email: key, isDemo: true };
  writeJSON(LS_USER, user);
  broadcast('auth');
  return user;
}
export async function signInWithEmail(email, password) {
  const key = (email || '').trim().toLowerCase();
  const accounts = readEmailAccounts();
  const acct = accounts[key];
  const hash = await sha256Hex(password || '');
  if (!acct || acct.passwordHash !== hash) throw new Error('Wrong email or password (demo mode).');
  const priorProfile = readJSON(profileKey(acct.uid), {});
  const user = { uid: acct.uid, displayName: priorProfile.displayName || null, email: key, isDemo: true };
  writeJSON(LS_USER, user);
  broadcast('auth');
  return user;
}
export async function linkPasswordToAccount(email, password) {
  const user = currentUser();
  if (!user) throw new Error('Sign in first, then add a password to your account.');
  const key = (email || '').trim().toLowerCase();
  if (!key || !password) throw new Error('Enter both an email and a password.');
  const accounts = readEmailAccounts();
  accounts[key] = { uid: user.uid, passwordHash: await sha256Hex(password) };
  writeEmailAccounts(accounts);
  writeJSON(LS_USER, { ...user, email: key });
  broadcast('auth');
}
export function hasPasswordLogin() {
  const user = currentUser();
  if (!user) return false;
  return Object.values(readEmailAccounts()).some((a) => a.uid === user.uid);
}
export async function sendPasswordReset(email) {
  // Demo mode: nothing real to send -- resolves as a safe no-op, same
  // tolerance pattern as the rest of this file.
}

// Push notifications [2026-09-10] -- demo mode has no real backend to push
// through (no service worker messaging, no server), so every function here
// is an honest no-op/simulation matching the real layer's interface exactly,
// rather than pretending push works locally.
export async function pushSupported() { return false; }
export async function enablePushNotifications(uid) { return 'unconfigured'; }
export function currentNotificationPermission() {
  return (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
}
export async function disablePushNotifications(uid) {}
export function watchForegroundPush(callback) { return () => {}; }

// -------------------------------------------------------------------- Profile
function profileKey(uid) { return LS_PROFILE_PREFIX + uid; }
function defaultProfile() {
  return {
    displayName: '', churchName: '', mode: 'sing', scale: 1, theme: null, favorites: [],
    // Monetization fields -- see interface.md. null/false until an Admin
    // sets them via the in-app Admin screen.
    role: null, churchId: null, pastorTitle: null, isBetaTester: false,
    // Fellowship [2026-09-08] -- see interface.md's "FELLOWSHIP" section.
    // bio/photoURL/photoStoragePath are the public-profile fields shown on
    // renderProfileView(); blockedUids is this person's own block list
    // (never someone else's -- see canDmSafely()/isBlockedEitherWay() in
    // app.js for how it's checked both directions before a DM/group invite).
    bio: '', photoURL: null, photoStoragePath: null, blockedUids: [],
    // Notification preferences [2026-09-17] -- mirrors firestore-data-
    // layer.js's defaultProfile() exactly (see that file's comment); demo
    // mode has no push at all (pushSupported() always returns false here),
    // so this only ever matters for the Settings toggle rendering the same
    // way in both modes -- it never actually gates a send in demo mode.
    notifPrefs: { sessions: true, dailyVerse: true }
  };
}
export function watchProfile(uid, callback) {
  const fire = () => callback({ ...defaultProfile(), ...readJSON(profileKey(uid), {}) });
  fire();
  return onBroadcast('profile:' + uid, fire);
}
// Matches firestore-data-layer.js's real fetchProfileFromServer() -- demo
// mode's localStorage read is already synchronous and authoritative (no
// cache-vs-server distinction exists here), so this is just watchProfile()'s
// own one-shot read wrapped in a resolved promise to keep the same shape.
export async function fetchProfileFromServer(uid) {
  return { ...defaultProfile(), ...readJSON(profileKey(uid), {}) };
}
// No-op here to match the real Firestore layer's interface (see that
// file's ensureDirectoryEntry() for the actual bug/fix it exists for) --
// demo mode's watchDirectory() below always recomputes live straight from
// each profile's own localStorage record, so there's no separate
// denormalized directory doc that could ever fall out of sync in the
// first place.
export async function ensureDirectoryEntry(uid, profile) {}

export async function saveProfile(uid, patch) {
  const current = readJSON(profileKey(uid), defaultProfile());
  writeJSON(profileKey(uid), { ...current, ...patch });
  broadcast('profile:' + uid);
  // Also fires the generic 'profiles' channel (below) so the Admin screen's
  // by-name search picks up this change too, on top of the uid-specific
  // 'profile:'+uid channel any watchProfile(uid) subscriber already gets.
  broadcast('profiles');
}

// Every profile that has ever been saved *on this browser* -- demo mode has
// no real cross-device backend, so this only ever reflects local identities
// this same device has signed in as (see interface.md's "Testing this
// locally" note). Powers the Admin screen's "find by name" search so an
// Admin doesn't have to already have a person's Account ID pasted to them --
// scans localStorage for every iworship:local:profile:* key rather than
// keeping a separate index, since demo mode never has more than a handful
// of local identities anyway.
export function watchAllUsers(callback) {
  const fire = () => {
    const users = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(LS_PROFILE_PREFIX) === 0) {
        const uid = key.slice(LS_PROFILE_PREFIX.length);
        users.push({ uid, ...defaultProfile(), ...readJSON(key, {}) });
      }
    }
    users.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    callback(users);
  };
  fire();
  return onBroadcast('profiles', fire);
}

// Directory search [2026-09-04] -- powers the Sermons screen's "search for
// someone to share with" box (Account ID / name / church), open to every
// signed-in person, not just Admins (unlike watchAllUsers() just above,
// which the Admin screen alone uses). Demo mode has no separate privacy
// boundary to enforce here (see watchAllUsers()'s comment -- it's all one
// browser's localStorage), so this just re-scans the same local profiles
// and narrows the shape to {uid, displayName, churchName} to keep the two
// data layers' *interfaces* matching, even though the real layer enforces
// a real narrower Firestore collection for this -- see
// firestore-data-layer.js's watchDirectory() and firestore.rules'
// directory/{uid} block for the actual privacy boundary.
export function watchDirectory(callback) {
  const fire = () => {
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(LS_PROFILE_PREFIX) === 0) {
        const uid = key.slice(LS_PROFILE_PREFIX.length);
        const p = readJSON(key, {});
        // photoURL joined in [2026-09-08, Fellowship] -- an avatar is exactly
        // as public as a display name once profile pictures exist, so the
        // People directory/DM-composer can show one next to a search result
        // the same way it already shows a name/church. bio + favorites
        // joined in the same pass [2026-09-08, Fellowship profile page] --
        // Jared's social-profile ask needs a bio and a "favorite hymnals"
        // list visible on someone else's profile page cross-church, and
        // users/{uid} itself is private-by-default (see firestore.rules) --
        // so, same reasoning as displayName/churchName/photoURL, these two
        // fields are exactly as public as the rest of the directory entry
        // once a public profile page exists. role/churchId/isBetaTester/
        // blockedUids stay off the directory and out of this list.
        // followerCount/followingCount [2026-09-09, social redesign] --
        // computed fresh from the `follows` collection every time, same
        // "no denormalized counter in demo mode" reasoning as
        // likeCountFor/commentCountFor above -- the real Firestore layer's
        // directory/{uid} doc carries these as real incremented fields
        // instead (see saveProfile()/followUser()'s comments there), but
        // this local layer just recomputes them so the interface still
        // matches: directoryEntry(uid).followerCount always works either way.
        if (p.displayName) list.push({ uid, displayName: p.displayName || '', churchName: p.churchName || '', photoURL: p.photoURL || null, bio: p.bio || '', favorites: p.favorites || [], followerCount: followerCountFor(uid), followingCount: followingCountFor(uid) });
      }
    }
    list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    callback(list);
  };
  fire();
  const offProfiles = onBroadcast('profiles', fire);
  const offFollows = onBroadcast('follows', fire);
  return () => { offProfiles(); offFollows(); };
}

// ---------------------------------------------------------------------- Rooms
function readRooms() { return readJSON(LS_ROOMS, {}); }
function writeRooms(rooms) { writeJSON(LS_ROOMS, rooms); broadcast('rooms'); }

function makeRoomCode(rooms) {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join(''); }
  while (rooms[code]);
  return code;
}

export async function createRoom(room) {
  const rooms = readRooms();
  const code = makeRoomCode(rooms);
  const passwordHash = room.password ? await sha256Hex(room.password) : null;
  rooms[code] = {
    code, name: room.name, hostUid: room.hostUid, hostName: room.hostName, churchName: room.churchName || '',
    isPublic: room.isPublic, passwordHash,
    currentSongId: null, currentSectionIndex: 0, setlist: room.setlist || [],
    // Co-hosting [2026-09-05] -- see the matching comment in
    // firestore-data-layer.js's createRoom().
    coHostUids: [], controllerUid: room.hostUid,
    createdAt: Date.now(), updatedAt: Date.now()
  };
  writeRooms(rooms);
  return code;
}

export function watchRoom(code, callback) {
  const fire = () => callback(readRooms()[code] || null);
  fire();
  return onBroadcast('rooms', fire);
}

export async function updateRoom(code, patch) {
  const rooms = readRooms();
  if (!rooms[code]) return;
  rooms[code] = { ...rooms[code], ...patch, updatedAt: Date.now() };
  writeRooms(rooms);
}

export async function endRoom(code) {
  const rooms = readRooms();
  delete rooms[code];
  writeRooms(rooms);
  // Clear the room's chat too, so if this 4-character code ever gets reused
  // by a later session, that new session doesn't inherit an old conversation.
  try { localStorage.removeItem(LS_MESSAGES_PREFIX + code); } catch (e) { /* ignore */ }
}

export function watchPublicRooms(callback) {
  const sixHoursAgo = () => Date.now() - 6 * 60 * 60 * 1000;
  const fire = () => {
    const rooms = Object.values(readRooms()).filter((r) => r.isPublic && r.updatedAt > sixHoursAgo());
    rooms.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(rooms);
  };
  fire();
  return onBroadcast('rooms', fire);
}

// Every room a given uid has ever hosted, regardless of age or whether it's
// still "active" -- unlike watchPublicRooms above (which deliberately hides
// anything older than 6 hours from the public browse list), this is the
// host's own management view, specifically so a session left open by
// accident (closed tab, forgot to end it) can be found and ended later
// instead of piling up invisibly.
export function watchHostRooms(uid, callback) {
  const fire = () => {
    const rooms = Object.values(readRooms()).filter((r) => r.hostUid === uid);
    rooms.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(rooms);
  };
  fire();
  return onBroadcast('rooms', fire);
}

// Mirrors watchHostRooms above, just filtered by coHostUids membership
// instead of hostUid -- see the matching comment in
// firestore-data-layer.js's watchCoHostRooms().
export function watchCoHostRooms(uid, callback) {
  const fire = () => {
    const rooms = Object.values(readRooms()).filter((r) => (r.coHostUids||[]).includes(uid));
    rooms.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(rooms);
  };
  fire();
  return onBroadcast('rooms', fire);
}

export async function checkRoomPassword(code, password) {
  const room = readRooms()[code];
  if (!room) return false;
  if (!room.passwordHash) return true;
  return (await sha256Hex(password || '')) === room.passwordHash;
}

// -------------------------------------------------------------------- Editor
// Demo mode originally made every signed-in local user trivially "on the
// editor list" -- fine before per-role gating existed, since nothing was
// actually restricted yet. Now that Add Song and Hosting are for-real
// gated [2026-09-03] (see canAddSongs()/canHost() in app.js, which OR this
// legacy allowlist together with the new role system), staying
// unconditionally true here would make it impossible to ever demo an
// *ordinary* member's experience locally -- every demo user would bypass
// both gates no matter what. So this checks a tiny local allowlist
// instead, defaulting to nobody -- to simulate being on the legacy
// worship-team list in demo mode, open the browser console and run:
//   localStorage.setItem('iworship:local:editors', JSON.stringify(['<uid>']))
// (copy '<uid>' from that account's own landing page -- "Your Account ID").
// Normally you don't need this at all: use the Admin screen instead to
// assign a real role (Editor, Music Director, etc.) or beta access, which
// exercises the actual monetization path this allowlist is just a
// grandfather clause for. The real check only exists in
// firestore-data-layer.js's editors collection.
const LS_EDITORS = 'iworship:local:editors';
export async function checkIsEditor(uid) {
  if (!uid) return false;
  return readJSON(LS_EDITORS, []).includes(uid);
}

// Demo mode has no real Admins allowlist either -- same reasoning as
// checkIsEditor above: an Admin bypasses every monetization gate via
// hasFullAccess(), so making this unconditionally true would make it
// impossible to ever demo an *ordinary* member's experience locally. So
// this checks a tiny local allowlist instead, defaulting to nobody -- to
// try out the Admin screen in demo mode, open the browser console and run:
//   localStorage.setItem('iworship:local:admins', JSON.stringify(['<uid>']))
// (copy '<uid>' from that account's own landing page -- "Your Account ID").
// The real check only exists in firestore-data-layer.js's admins collection.
const LS_ADMINS = 'iworship:local:admins';
export async function checkIsAdmin(uid) {
  if (!uid) return false;
  return readJSON(LS_ADMINS, []).includes(uid);
}

// ------------------------------------------------------------------- Chat
function messagesKey(code) { return LS_MESSAGES_PREFIX + code; }
function readMessages(code) { return readJSON(messagesKey(code), []); }
function writeMessages(code, messages) {
  writeJSON(messagesKey(code), messages);
  broadcast('messages:' + code);
}

export function watchSessionMessages(code, channel, callback) {
  const fire = () => callback(readMessages(code).filter((m) => m.channel === channel).slice(-200));
  fire();
  return onBroadcast('messages:' + code, fire);
}

export async function sendSessionMessage(code, channel, message) {
  const messages = readMessages(code);
  messages.push({
    id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    channel,
    text: message.text,
    senderName: message.senderName || 'Someone',
    senderUid: message.senderUid || null,
    createdAt: Date.now()
  });
  writeMessages(code, messages);
}

// ------------------------------------------------------------------ Churches
// Monetization foundation only (see claude/monetization-plan.md in the
// project docs) -- nothing in the app calls this yet. There's no
// registration flow in either data layer at this point; this just
// establishes the same read shape the real Firestore layer has, so a future
// Pastor-onboarding/church-registration screen has something to build on.
// Confirmed shape (schema settled [2026-09-03], not yet populated by
// anything): { id, name, plan, seatLimits: { pastors, editors,
// musicDirectors, musicians }, hiddenSongIds: string[], gracePeriodDays,
// billingCadence, createdAt }. See interface.md for what each field means --
// `hiddenSongIds` is an exclusion list (the "Church Library" view), not a
// second copy of the hymnal, and real writes will go through the Cloud
// Functions scaffold in functions/ at the repo root, not this local layer.
const LS_CHURCHES = 'iworship:local:churches';
export function watchChurch(churchId, callback) {
  const fire = () => callback(readJSON(LS_CHURCHES, {})[churchId] || null);
  fire();
  return onBroadcast('churches', fire);
}

// Every registered church, for the Admin screen's church list/picker.
export function watchAllChurches(callback) {
  const fire = () => {
    const churches = Object.values(readJSON(LS_CHURCHES, {}));
    churches.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    callback(churches);
  };
  fire();
  return onBroadcast('churches', fire);
}

export function newChurchId() {
  return 'church-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export async function saveChurch(churchId, patch) {
  const churches = readJSON(LS_CHURCHES, {});
  churches[churchId] = { ...(churches[churchId] || { id: churchId }), ...patch, id: churchId };
  writeJSON(LS_CHURCHES, churches);
  broadcast('churches');
}

// ------------------------------------------------------------- Song Requests
// "Free access" path for someone who can't add songs directly (see
// canAddSongs() in app.js) to still get a hymn into the shared hymnal: they
// submit a title (and optionally paste lyrics), a worship-team editor or
// Admin reviews it in the Song Requests queue and either "Approve & Add"s it
// -- which prefills the existing Add Song form via detectSections(), the
// same auto-detect the direct-add path already uses -- or rejects it.
// Stored as one array blob (unlike per-uid profiles) since demo mode never
// accumulates more than a handful of these. See interface.md's "Song
// requests" section and firestore.rules' songRequests/{requestId} match
// block for the full design, including why the duplicate-detection is
// title-only (not lyrics) and stored at submit time rather than recomputed.
const LS_SONG_REQUESTS = 'iworship:local:songRequests';
function readSongRequests() { return readJSON(LS_SONG_REQUESTS, []); }
function writeSongRequests(list) { writeJSON(LS_SONG_REQUESTS, list); broadcast('songRequests'); }

export async function submitSongRequest(request) {
  const list = readSongRequests();
  const withId = {
    ...request,
    id: 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    status: 'pending',
    createdAt: Date.now(),
    reviewedByUid: null, reviewedByName: null, reviewedAt: null, reviewNote: ''
  };
  list.push(withId);
  writeSongRequests(list);
  return withId.id;
}

// The review queue -- every editor/Admin sees the same unfiltered pending
// list, oldest first (first come, first reviewed).
export function watchPendingSongRequests(callback) {
  const fire = () => {
    const pending = readSongRequests().filter((r) => r.status === 'pending');
    pending.sort((a, b) => a.createdAt - b.createdAt);
    callback(pending);
  };
  fire();
  return onBroadcast('songRequests', fire);
}

// One person's own requests (any status), newest first -- shown on their own
// Request a Song screen so they can see whether theirs was approved/rejected
// without having to ask an editor.
export function watchMySongRequests(uid, callback) {
  const fire = () => {
    const mine = readSongRequests().filter((r) => r.submittedByUid === uid);
    mine.sort((a, b) => b.createdAt - a.createdAt);
    callback(mine);
  };
  fire();
  return onBroadcast('songRequests', fire);
}

// Editor/Admin review action -- shallow-merges patch (status/reviewedByUid/
// reviewedByName/reviewNote) same convention as saveProfile/saveChurch, and
// always stamps reviewedAt itself (never trusts the caller's clock), same
// convention as updateRoom's updatedAt.
export async function reviewSongRequest(requestId, patch) {
  const list = readSongRequests();
  const idx = list.findIndex((r) => r.id === requestId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch, reviewedAt: Date.now() };
  writeSongRequests(list);
}

// -------------------------------------------------------------------------
// Sermons/presentations [2026-09-04] -- a `sermons` doc is an ordered list
// of slides a host builds ahead of time, then presents live the same way a
// song's sections are presented (see rooms' currentContentType/
// currentSermonId/currentSlideIndex fields below and app.js's
// ensureViewSermonWatch()). Deliberately NOT preloaded globally the way
// songs are (no "browse all sermons" screen exists) -- only the owner's own
// list (watchMySermons, for building/picking one to present) and a single
// sermon by id (watchSermon, for whoever's currently viewing a room that's
// presenting one) are ever fetched.
const LS_SERMONS = 'iworship:local:sermons';
function readSermons() { return readJSON(LS_SERMONS, []); }
function writeSermons(list) { writeJSON(LS_SERMONS, list); broadcast('sermons'); }

export async function createSermon(sermon) {
  const list = readSermons();
  const withId = {
    ...sermon,
    sharedWithUids: sermon.sharedWithUids || [], // see "SHARING" note below
    id: 'sermon-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(), updatedAt: Date.now()
  };
  list.push(withId);
  writeSermons(list);
  return withId.id;
}

export async function updateSermon(id, patch) {
  const list = readSermons();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
  writeSermons(list);
}

export async function deleteSermon(id) {
  writeSermons(readSermons().filter((s) => s.id !== id));
}

export function watchMySermons(uid, callback) {
  const fire = () => {
    const mine = readSermons().filter((s) => s.createdByUid === uid);
    mine.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(mine);
  };
  fire();
  return onBroadcast('sermons', fire);
}

export function watchSermon(id, callback) {
  const fire = () => callback(readSermons().find((s) => s.id === id) || null);
  fire();
  return onBroadcast('sermons', fire);
}

// ------------------------------------------------------------- SHARING
// [2026-09-04] Jared: "give them a search bar where they can search for
// Account ID, name, church, and add an option to share the link as well."
// A sermon's `sharedWithUids` array names every uid who can find it in
// their OWN "Shared With You" list (see watchSermonsSharedWithMe below) --
// added either by the owner searching the directory (shareSermon, called
// with the owner still the one performing the write, same as any other
// updateSermon) or by the recipient themselves opening a ?sermon=<id> link
// (also shareSermon, but called with THEIR OWN uid -- see
// firestore.rules' sermons/{sermonId} update rule for the narrow
// self-service carve-out that makes that second case safe to allow at
// all: any signed-in person may patch *only* sharedWithUids on a sermon
// they don't own, never any other field).
export async function shareSermon(id, uid) {
  const list = readSermons();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const current = list[idx].sharedWithUids || [];
  if (!current.includes(uid)) {
    list[idx] = { ...list[idx], sharedWithUids: current.concat([uid]), updatedAt: Date.now() };
    writeSermons(list);
  }
}

export async function unshareSermon(id, uid) {
  const list = readSermons();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const current = list[idx].sharedWithUids || [];
  if (current.includes(uid)) {
    list[idx] = { ...list[idx], sharedWithUids: current.filter((x) => x !== uid), updatedAt: Date.now() };
    writeSermons(list);
  }
}

// A sermon someone else built and shared with this uid -- separate from
// watchMySermons (which is creator-only) so the Sermons screen can show
// "Yours" and "Shared With You" as two distinct groups, and so the host
// picker (renderSermonPicker() in app.js) can offer both when presenting.
export function watchSermonsSharedWithMe(uid, callback) {
  const fire = () => {
    const shared = readSermons().filter((s) => (s.sharedWithUids || []).includes(uid) && s.createdByUid !== uid);
    shared.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(shared);
  };
  fire();
  return onBroadcast('sermons', fire);
}

// -------------------------------------------------------------- Media/AVP
// [2026-09-06] See firestore-data-layer.js's matching comment for the full
// design (image/video/slideshow/embed, the sharing model). This demo-mode
// twin has no real Cloud Storage to upload to, so uploadMediaFile() below
// just wraps the picked File in an in-memory object URL (URL.createObjectURL)
// instead -- resolves instantly (no real network upload, so onProgress is
// just called once at 100 for UI consistency), and is honestly disclosed as
// device/tab-local only: unlike every other piece of demo-mode data (which
// persists to localStorage and survives a reload), an object URL is only
// ever valid for the lifetime of the page that created it, so a media item
// uploaded in demo mode stops rendering after a refresh -- acceptable for
// kicking the tires locally, since demo mode was never meant to survive a
// reload's worth of real files anyway (see README.md/architecture doc: demo
// mode graduates to the real Firebase backend, which is where this actually
// needs to work for good).
const LS_MEDIA = 'iworship:local:media';
function readMedia() { return readJSON(LS_MEDIA, []); }
function writeMedia(list) { writeJSON(LS_MEDIA, list); broadcast('media'); }

export async function createMedia(media) {
  const list = readMedia();
  const withId = {
    ...media,
    sharedWithUids: media.sharedWithUids || [],
    id: 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(), updatedAt: Date.now()
  };
  list.push(withId);
  writeMedia(list);
  return withId.id;
}

export async function updateMedia(id, patch) {
  const list = readMedia();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
  writeMedia(list);
}

export async function deleteMedia(id /*, media -- storage cleanup is a real-backend-only concern, see below */) {
  writeMedia(readMedia().filter((m) => m.id !== id));
}

export function watchMyMedia(uid, callback) {
  const fire = () => {
    const mine = readMedia().filter((m) => m.createdByUid === uid);
    mine.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(mine);
  };
  fire();
  return onBroadcast('media', fire);
}

export function watchMedia(id, callback) {
  const fire = () => callback(readMedia().find((m) => m.id === id) || null);
  fire();
  return onBroadcast('media', fire);
}

export async function shareMedia(id, uid) {
  const list = readMedia();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return;
  const current = list[idx].sharedWithUids || [];
  if (!current.includes(uid)) {
    list[idx] = { ...list[idx], sharedWithUids: current.concat([uid]), updatedAt: Date.now() };
    writeMedia(list);
  }
}

export async function unshareMedia(id, uid) {
  const list = readMedia();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return;
  const current = list[idx].sharedWithUids || [];
  if (current.includes(uid)) {
    list[idx] = { ...list[idx], sharedWithUids: current.filter((x) => x !== uid), updatedAt: Date.now() };
    writeMedia(list);
  }
}

export function watchMediaSharedWithMe(uid, callback) {
  const fire = () => {
    const shared = readMedia().filter((m) => (m.sharedWithUids || []).includes(uid) && m.createdByUid !== uid);
    shared.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(shared);
  };
  fire();
  return onBroadcast('media', fire);
}

// See the comment on LS_MEDIA above -- an object URL, not a real upload.
// `kind` ('image'|'video') is accepted for interface parity with the real
// layer but unused here (nothing to route by content-type locally).
export function uploadMediaFile(file, uid, kind, onProgress) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (onProgress) onProgress(100);
    resolve({ url, storagePath: 'local:' + url, mimeType: file.type, sizeBytes: file.size });
  });
}

export async function deleteMediaFile(storagePath) {
  if (typeof storagePath === 'string' && storagePath.indexOf('local:') === 0) {
    try { URL.revokeObjectURL(storagePath.slice('local:'.length)); } catch (e) { /* already gone */ }
  }
}

// PowerPoint upload [2026-09-24] -- see firestore-data-layer.js's matching
// pair for the real design. There's no local/offline way to actually
// render a .pptx (that needs LibreOffice, running server-side in the real
// pptx-converter Cloud Run service) -- uploadPptxSourceFile() still works
// locally (same object-URL trick as uploadMediaFile() above, since the
// caller just needs SOME storagePath back to hand to the next call), but
// convertPptxToSlideshow() below honestly rejects rather than pretending
// to convert anything, so the UI's existing "couldn't convert" error
// handling is what a demo-mode user actually sees.
export function uploadPptxSourceFile(file, uid, onProgress) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (onProgress) onProgress(100);
    resolve({ storagePath: 'local:' + url });
  });
}

export async function convertPptxToSlideshow(storagePath, title) {
  throw new Error('PowerPoint conversion needs the real (non-demo) app -- it runs on a server, not in this browser.');
}

// --------------------------------------------------------- Media Folders
// [2026-09-06] See firestore-data-layer.js's matching comment for the full
// design. Demo-mode twin, same localStorage+BroadcastChannel pattern as
// everything else here.
const LS_MEDIA_FOLDERS = 'iworship:local:mediaFolders';
function readMediaFolders() { return readJSON(LS_MEDIA_FOLDERS, []); }
function writeMediaFolders(list) { writeJSON(LS_MEDIA_FOLDERS, list); broadcast('mediaFolders'); }

export async function createMediaFolder(folder) {
  const list = readMediaFolders();
  const withId = {
    ...folder,
    id: 'mediaFolder-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(), updatedAt: Date.now()
  };
  list.push(withId);
  writeMediaFolders(list);
  return withId.id;
}

export async function updateMediaFolder(id, patch) {
  const list = readMediaFolders();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
  writeMediaFolders(list);
}

// Un-files (never deletes) every media item inside this folder, then
// removes the folder doc itself -- same contract as the real backend.
export async function deleteMediaFolder(id) {
  const mediaList = readMedia();
  let changed = false;
  const updatedMedia = mediaList.map((m) => {
    if (m.folderId === id) { changed = true; return { ...m, folderId: null, updatedAt: Date.now() }; }
    return m;
  });
  if (changed) writeMedia(updatedMedia);
  writeMediaFolders(readMediaFolders().filter((f) => f.id !== id));
}

export function watchMyMediaFolders(uid, callback) {
  const fire = () => {
    const mine = readMediaFolders().filter((f) => f.createdByUid === uid);
    mine.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    callback(mine);
  };
  fire();
  return onBroadcast('mediaFolders', fire);
}

// ============================================================= FELLOWSHIP
// [2026-09-08] Jared: "add something like a social media in here as well...
// profile with social details... post anything, plain text to videos and
// images... a bio... profile pics... DMs... group chats." See
// interface.md's "FELLOWSHIP" section for the full design writeup --
// cross-church by design (same "no data walls" principle as the hymnal
// itself), with block/report built in from day one rather than bolted on
// later, per Jared's own answer when asked. Four independent pieces below:
// posts (a public feed), reports (the moderation queue -- blocking itself
// is just `blockedUids` on the existing Profile, no new collection needed),
// DMs, and group chats.

// ------------------------------------------------------------------- Posts
// A post is public (readable by anyone, matching songs/rooms/sermons'
// existing "no data walls" openness) but the FEED a person actually sees is
// filtered client-side to exclude posts from anyone on THEIR OWN
// blockedUids list (see renderFellowshipFeed() in app.js) -- blocking is a
// personal, one-directional filter, not a takedown, so the post still
// exists and still shows up for everyone who hasn't blocked its author.
const LS_POSTS = 'iworship:local:posts';
function readPosts() { return readJSON(LS_POSTS, []); }
function writePosts(list) { writeJSON(LS_POSTS, list); broadcast('posts'); }

export async function createPost(post) {
  const list = readPosts();
  const withId = {
    ...post,
    id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now()
  };
  list.push(withId);
  writePosts(list);
  return withId.id;
}

export async function deletePost(id /*, post -- real-backend Storage cleanup only */) {
  writePosts(readPosts().filter((p) => p.id !== id));
}

// The global feed -- every post, newest first, capped at 100 for a demo
// (the real layer's equivalent Firestore query does the same cap server-
// side). Client-side blockedUids filtering happens in app.js, not here --
// this always returns the true unfiltered set, same as watchSongs() always
// returns every song regardless of who's asking.
export function watchFeedPosts(callback) {
  const fire = () => {
    const posts = readPosts().slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    callback(posts);
  };
  fire();
  return onBroadcast('posts', fire);
}

// One person's own posts, newest first -- powers the "Posts" section on
// their own profile page (renderProfileView()).
export function watchUserPosts(uid, callback) {
  const fire = () => {
    const mine = readPosts().filter((p) => p.authorUid === uid);
    mine.sort((a, b) => b.createdAt - a.createdAt);
    callback(mine);
  };
  fire();
  return onBroadcast('posts', fire);
}

// ------------------------------------------------------------------ Reports
// The moderation queue a report lands in -- Admin-reviewed, mirrors
// songRequests' pending/resolved shape exactly. `targetType`/`targetId` name
// what's being reported (a post, or a profile) so an Admin can find it;
// there's no automated takedown -- an Admin decides by hand (e.g. deleting
// the post via the same deletePost() above, then marking the report
// resolved) since a false report shouldn't silently remove real content.
const LS_REPORTS = 'iworship:local:reports';
function readReports() { return readJSON(LS_REPORTS, []); }
function writeReports(list) { writeJSON(LS_REPORTS, list); broadcast('reports'); }

export async function submitReport(report) {
  const list = readReports();
  const withId = {
    ...report,
    id: 'report-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    status: 'pending',
    createdAt: Date.now(),
    resolvedByUid: null, resolvedByName: null, resolvedAt: null
  };
  list.push(withId);
  writeReports(list);
  return withId.id;
}

export function watchPendingReports(callback) {
  const fire = () => {
    const pending = readReports().filter((r) => r.status === 'pending');
    pending.sort((a, b) => a.createdAt - b.createdAt);
    callback(pending);
  };
  fire();
  return onBroadcast('reports', fire);
}

export async function resolveReport(id, patch) {
  const list = readReports();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch, status: 'resolved', resolvedAt: Date.now() };
  writeReports(list);
}

// ----------------------------------------------------------------------- DMs
// One thread per PAIR of people, ever -- dmThreadId() below derives a
// stable, deterministic id from the two uids (sorted so it doesn't matter
// who messages whom first), so "start a DM" is really just "find or create
// the one thread that already represents this pair" rather than minting a
// new thread every time. Messages live in a per-thread array, same
// per-code pattern as rooms/{code}/messages.
export function dmThreadId(uidA, uidB) {
  return 'dm-' + [uidA, uidB].sort().join('_');
}

const LS_DM_THREADS = 'iworship:local:dmThreads';
const LS_DM_MESSAGES_PREFIX = 'iworship:local:dmMessages:';
function readDmThreads() { return readJSON(LS_DM_THREADS, {}); }
function writeDmThreads(threads) { writeJSON(LS_DM_THREADS, threads); broadcast('dmThreads'); }

// Finds the existing thread for this pair, or creates it -- either way
// returns its id. `names`/`photos` are {uid: displayName}/{uid: photoURL}
// maps for both participants, stashed on the thread doc itself so the inbox
// list (watchMyDmThreads) can render "who's this conversation with" without
// a second profile lookup per row.
export async function ensureDmThread(uidA, uidB, names, photos) {
  const id = dmThreadId(uidA, uidB);
  const threads = readDmThreads();
  if (!threads[id]) {
    const now = Date.now();
    threads[id] = {
      id, participantUids: [uidA, uidB], participantNames: names || {}, participantPhotos: photos || {},
      // readAt [v36, Messages unread badge] -- both participants "read" a
      // brand-new empty thread the instant it's created (nothing to be
      // unread yet), same timestamp as lastMessageAt below so the badge
      // math (lastMessageAt > readAt[uid]) starts out false for both.
      readAt: { [uidA]: now, [uidB]: now },
      lastMessageText: '', lastMessageAt: now, createdAt: now
    };
    writeDmThreads(threads);
  }
  return id;
}

// Every DM thread this uid is part of, most-recently-active first -- the
// inbox list.
export function watchMyDmThreads(uid, callback) {
  const fire = () => {
    const mine = Object.values(readDmThreads()).filter((t) => t.participantUids.includes(uid));
    mine.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    callback(mine);
  };
  fire();
  return onBroadcast('dmThreads', fire);
}

function dmMessagesKey(threadId) { return LS_DM_MESSAGES_PREFIX + threadId; }
export function watchDmMessages(threadId, callback) {
  const fire = () => callback(readJSON(dmMessagesKey(threadId), []).slice(-500));
  fire();
  return onBroadcast('dmMessages:' + threadId, fire);
}

export async function sendDmMessage(threadId, message) {
  const key = dmMessagesKey(threadId);
  const messages = readJSON(key, []);
  messages.push({
    id: 'dmmsg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    senderUid: message.senderUid, senderName: message.senderName || 'Someone',
    text: message.text, createdAt: Date.now()
  });
  writeJSON(key, messages);
  broadcast('dmMessages:' + threadId);
  // Also touch the thread's own lastMessageText/lastMessageAt so the inbox
  // list re-sorts and shows a preview, mirroring how updateRoom() stamps
  // updatedAt on every room write. [v36] Also stamp the SENDER's own
  // readAt entry -- a person never sees their own just-sent message as
  // unread (see markDmThreadRead() below for the "I opened this thread"
  // path the OTHER participant goes through).
  const threads = readDmThreads();
  if (threads[threadId]) {
    const now = Date.now();
    threads[threadId] = {
      ...threads[threadId], lastMessageText: message.text, lastMessageAt: now,
      readAt: { ...(threads[threadId].readAt || {}), [message.senderUid]: now }
    };
    writeDmThreads(threads);
  }
}

// [v36, Messages unread badge] Called whenever a person actually opens a DM
// thread (the dock popup or the full thread view) -- merge-writes just
// their own readAt entry, mirroring markNotificationRead()'s "only touch
// what I'm marking read" shape below.
export async function markDmThreadRead(threadId, uid) {
  const threads = readDmThreads();
  if (threads[threadId]) {
    threads[threadId] = { ...threads[threadId], readAt: { ...(threads[threadId].readAt || {}), [uid]: Date.now() } };
    writeDmThreads(threads);
  }
}

// ------------------------------------------------------------- Group chats
// Same shape/pattern as DMs just above, but named, owner-managed, and
// multi-member instead of a fixed pair. Leaving a group is self-service
// (any member can remove themselves) -- see firestore.rules' groupChats
// update rule for the narrow carve-out that makes that safe to allow,
// mirroring the sermon/media sharedWithUids self-removal pattern.
const LS_GROUP_CHATS = 'iworship:local:groupChats';
const LS_GROUP_MESSAGES_PREFIX = 'iworship:local:groupMessages:';
function readGroupChats() { return readJSON(LS_GROUP_CHATS, []); }
function writeGroupChats(list) { writeJSON(LS_GROUP_CHATS, list); broadcast('groupChats'); }

export async function createGroupChat(group) {
  const list = readGroupChats();
  const now = Date.now();
  const withId = {
    lastMessageText: '',
    ...group,
    // readAt [v36, Messages unread badge] -- only the owner has "read" a
    // group at the moment they create it; every other member they add
    // correctly starts out with the new group showing as unread for them.
    readAt: { [group.ownerUid]: now },
    id: 'group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: now, updatedAt: now
  };
  list.push(withId);
  writeGroupChats(list);
  return withId.id;
}

export async function updateGroupChat(id, patch) {
  const list = readGroupChats();
  const idx = list.findIndex((g) => g.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
  writeGroupChats(list);
}

// Owner-only, mirrors firestore.rules' groupChats/{groupId} "allow delete"
// rule -- app.js's renderGroupChatThread() calls this instead of the
// self-removal updateGroupChat() path when the person leaving is the
// group's owner, since there'd otherwise be no way for anyone to ever
// manage/rename/delete the group again once the owner is no longer in it.
export async function deleteGroupChat(id) {
  const list = readGroupChats().filter((g) => g.id !== id);
  writeGroupChats(list);
  try { localStorage.removeItem(LS_GROUP_MESSAGES_PREFIX + id); } catch (e) { /* ignore */ }
}

export function watchMyGroupChats(uid, callback) {
  const fire = () => {
    const mine = readGroupChats().filter((g) => (g.memberUids || []).includes(uid));
    mine.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(mine);
  };
  fire();
  return onBroadcast('groupChats', fire);
}

export function watchGroupChat(id, callback) {
  const fire = () => callback(readGroupChats().find((g) => g.id === id) || null);
  fire();
  return onBroadcast('groupChats', fire);
}

function groupMessagesKey(groupId) { return LS_GROUP_MESSAGES_PREFIX + groupId; }
export function watchGroupChatMessages(groupId, callback) {
  const fire = () => callback(readJSON(groupMessagesKey(groupId), []).slice(-500));
  fire();
  return onBroadcast('groupMessages:' + groupId, fire);
}

export async function sendGroupChatMessage(groupId, message) {
  const key = groupMessagesKey(groupId);
  const messages = readJSON(key, []);
  messages.push({
    id: 'gmsg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    senderUid: message.senderUid, senderName: message.senderName || 'Someone',
    text: message.text, createdAt: Date.now()
  });
  writeJSON(key, messages);
  broadcast('groupMessages:' + groupId);
  const list = readGroupChats();
  const idx = list.findIndex((g) => g.id === groupId);
  if (idx !== -1) {
    // [v36] Previously only stamped updatedAt -- lastMessageText was never
    // actually updated after a group's creation, so the inbox list's
    // preview line under a group's name stayed blank/stale forever
    // (found while wiring up the unread badge; fixed alongside it since
    // it's the same "touch the parent doc on send" code path as the
    // sender's own readAt entry just below).
    const now = Date.now();
    list[idx] = {
      ...list[idx], lastMessageText: message.text, updatedAt: now,
      readAt: { ...(list[idx].readAt || {}), [message.senderUid]: now }
    };
    writeGroupChats(list);
  }
}

// [v36, Messages unread badge] Mirrors markDmThreadRead() above -- called
// when a member opens a group's thread (dock popup or full view).
export async function markGroupChatRead(groupId, uid) {
  const list = readGroupChats();
  const idx = list.findIndex((g) => g.id === groupId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], readAt: { ...(list[idx].readAt || {}), [uid]: Date.now() } };
    writeGroupChats(list);
  }
}

// ==================================================== FELLOWSHIP REDESIGN
// [2026-09-09] Jared: "make the fellowship part look like an actual social
// media feed... likes, comments, share/repost, save/bookmark... a Shorts
// video feed... a hamburger menu with account settings/log out/switch
// interface... profile pic next to the logo up top... notifications,
// explore/discover, stories... search for people and interact just like
// facebook." See claude/fellowship-plan.md's "v2: social redesign" section
// for the full writeup of every judgment call below (follow being one-
// directional rather than a request/accept friendship, trending computed
// client-side, stories expiring client-side rather than via a Cloud
// Function, etc.) and src/data/interface.md's matching section for the
// exact shapes. Everything below follows the SAME conventions as the
// FELLOWSHIP section above: one flat localStorage blob + BroadcastChannel
// per concept, no denormalization tricks that would only matter at a scale
// this demo layer will never actually see (likeCount/commentCount are
// simply *computed* here by counting matching rows, rather than the
// increment()-based counters the real Firestore layer uses to avoid a full
// subcollection read -- see that file's comment).

// ---- Likes (posts AND shorts share one collection, keyed by kind) --------
const LS_LIKES = 'iworship:local:likes';
function readLikes() { return readJSON(LS_LIKES, []); }
function writeLikes(list) { writeJSON(LS_LIKES, list); broadcast('likes'); }
function likeId(kind, itemId, uid) { return kind + '_' + itemId + '_' + uid; }

export function likeCountFor(kind, itemId) {
  return readLikes().filter((l) => l.kind === kind && l.itemId === itemId).length;
}
export async function likeItem(kind, itemId, uid) {
  const list = readLikes();
  const id = likeId(kind, itemId, uid);
  if (list.some((l) => l.id === id)) return; // already liked -- no-op, matches a set's idempotence
  list.push({ id, kind, itemId, uid, createdAt: Date.now() });
  writeLikes(list);
}
export async function unlikeItem(kind, itemId, uid) {
  writeLikes(readLikes().filter((l) => l.id !== likeId(kind, itemId, uid)));
}
// Every kind:itemId this uid has liked, as a Set of "kind:itemId" strings --
// lets renderFeedPostCard()/renderShortCard() check "did I like this" with a
// plain Set.has() instead of re-scanning the whole likes list per card.
export function watchMyLikes(uid, callback) {
  const fire = () => {
    const mine = new Set(readLikes().filter((l) => l.uid === uid).map((l) => l.kind + ':' + l.itemId));
    callback(mine);
  };
  fire();
  return onBroadcast('likes', fire);
}

// ---- Comments (posts AND shorts share one collection, keyed by kind) -----
const LS_COMMENTS = 'iworship:local:comments';
function readComments() { return readJSON(LS_COMMENTS, []); }
function writeComments(list) { writeJSON(LS_COMMENTS, list); broadcast('comments'); }

export function commentCountFor(kind, itemId) {
  return readComments().filter((c) => c.kind === kind && c.itemId === itemId).length;
}
export async function addComment(kind, itemId, comment) {
  const list = readComments();
  const withId = {
    ...comment, kind, itemId,
    id: 'comment-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now()
  };
  list.push(withId);
  writeComments(list);
  return withId.id;
}
// kind/itemId are accepted (and ignored) here for interface parity with the
// real layer, which needs them to know which parent doc's commentCount to
// decrement -- this demo layer computes commentCountFor() fresh every time
// instead, so it has nothing to decrement.
export async function deleteComment(commentId, kind, itemId) {
  writeComments(readComments().filter((c) => c.id !== commentId));
}
export function watchComments(kind, itemId, callback) {
  const fire = () => {
    const mine = readComments().filter((c) => c.kind === kind && c.itemId === itemId);
    mine.sort((a, b) => a.createdAt - b.createdAt);
    callback(mine);
  };
  fire();
  return onBroadcast('comments', fire);
}

// ---- Repost (posts only -- a repost is just a new post that carries a
// snapshot of the original) -------------------------------------------------
export function repostCountFor(postId) {
  return readPosts().filter((p) => p.repostOf && p.repostOf.postId === postId).length;
}
export async function repostPost(uid, name, original) {
  return createPost({
    authorUid: uid, authorName: name, text: '',
    mediaUrl: null, mediaKind: null, mediaStoragePath: null,
    repostOf: {
      postId: original.id, authorUid: original.authorUid, authorName: original.authorName,
      text: original.text || '', mediaUrl: original.mediaUrl || null, mediaKind: original.mediaKind || null
    }
  });
}

// ---- Save / Bookmark (private per-user list, mirrors Profile.favorites'
// shape but kept separate since a saved POST isn't a favorite HYMN) --------
function savedKey(uid) { return 'iworship:local:saved:' + uid; }
export function watchMySaved(uid, callback) {
  const fire = () => callback(readJSON(savedKey(uid), []));
  fire();
  return onBroadcast('saved:' + uid, fire);
}
export async function toggleSave(uid, kind, itemId) {
  const list = readJSON(savedKey(uid), []);
  const idx = list.findIndex((s) => s.kind === kind && s.itemId === itemId);
  if (idx === -1) list.push({ kind, itemId, savedAt: Date.now() });
  else list.splice(idx, 1);
  writeJSON(savedKey(uid), list);
  broadcast('saved:' + uid);
}

// ---- Follow (one-directional, like an Instagram/Twitter/Facebook Page
// follow, not a two-sided friend request -- see fellowship-plan.md for why
// that's the reasonable-default reading of "interact just like facebook"
// without building a whole request/accept inbox nobody asked for) ----------
const LS_FOLLOWS = 'iworship:local:follows';
function readFollows() { return readJSON(LS_FOLLOWS, []); }
function writeFollows(list) { writeJSON(LS_FOLLOWS, list); broadcast('follows'); }

export async function followUser(followerUid, targetUid) {
  if (followerUid === targetUid) return;
  const list = readFollows();
  if (list.some((f) => f.followerUid === followerUid && f.targetUid === targetUid)) return;
  list.push({ followerUid, targetUid, createdAt: Date.now() });
  writeFollows(list);
}
export async function unfollowUser(followerUid, targetUid) {
  writeFollows(readFollows().filter((f) => !(f.followerUid === followerUid && f.targetUid === targetUid)));
}
export function followerCountFor(uid) { return readFollows().filter((f) => f.targetUid === uid).length; }
export function followingCountFor(uid) { return readFollows().filter((f) => f.followerUid === uid).length; }
// Every uid this uid follows, as a Set -- powers "am I following them"
// buttons and Explore's "suggested people you don't already follow" filter.
export function watchMyFollowing(uid, callback) {
  const fire = () => callback(new Set(readFollows().filter((f) => f.followerUid === uid).map((f) => f.targetUid)));
  fire();
  return onBroadcast('follows', fire);
}

// ---- Notifications (per-recipient, written by the ACTOR who did the
// liking/commenting/following/reposting -- see app.js's notify() wrapper,
// which is the one thing that actually calls this from every action site
// rather than every action site remembering to call it itself) -------------
function notificationsKey(uid) { return 'iworship:local:notifications:' + uid; }
export function watchNotifications(uid, callback) {
  const fire = () => {
    const list = readJSON(notificationsKey(uid), []).slice();
    list.sort((a, b) => b.createdAt - a.createdAt);
    callback(list.slice(0, 100));
  };
  fire();
  return onBroadcast('notifications:' + uid, fire);
}
export async function createNotification(recipientUid, payload) {
  if (recipientUid === payload.actorUid) return; // never notify yourself about your own action
  const list = readJSON(notificationsKey(recipientUid), []);
  list.push({
    ...payload,
    id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    read: false, createdAt: Date.now()
  });
  writeJSON(notificationsKey(recipientUid), list);
  broadcast('notifications:' + recipientUid);
}
export async function markNotificationRead(uid, id) {
  const list = readJSON(notificationsKey(uid), []);
  const idx = list.findIndex((n) => n.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], read: true };
  writeJSON(notificationsKey(uid), list);
  broadcast('notifications:' + uid);
}
export async function markAllNotificationsRead(uid) {
  const list = readJSON(notificationsKey(uid), []).map((n) => ({ ...n, read: true }));
  writeJSON(notificationsKey(uid), list);
  broadcast('notifications:' + uid);
}

// ---- Stories (24h ephemeral, cross-church, wide-open read -- expiry is
// enforced by client-side filtering in watchActiveStories(), same "don't
// build a Cloud Function just to delete old docs" reasoning as everywhere
// else in this app) ----------------------------------------------------
const LS_STORIES = 'iworship:local:stories';
const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
function readStories() { return readJSON(LS_STORIES, []); }
function writeStories(list) { writeJSON(LS_STORIES, list); broadcast('stories'); }

export async function createStory(story) {
  const list = readStories();
  const withId = {
    ...story,
    id: 'story-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now()
  };
  list.push(withId);
  writeStories(list);
  return withId.id;
}
export async function deleteStory(id) {
  writeStories(readStories().filter((s) => s.id !== id));
}
// Only ever-active (< 24h old) stories, newest first -- app.js groups these
// by authorUid into one "story ring" per person.
export function watchActiveStories(callback) {
  const fire = () => {
    const cutoff = Date.now() - STORY_LIFETIME_MS;
    const active = readStories().filter((s) => s.createdAt > cutoff);
    active.sort((a, b) => b.createdAt - a.createdAt);
    callback(active);
  };
  fire();
  return onBroadcast('stories', fire);
}
// Opportunistic cleanup of THIS uid's own expired stories -- called from
// openProfileEdit()/after createStory(), never on a timer (this app has no
// background jobs anywhere, see the rest of this file).
export async function deleteExpiredStoriesFor(uid) {
  const cutoff = Date.now() - STORY_LIFETIME_MS;
  const mine = readStories().filter((s) => s.authorUid === uid && s.createdAt <= cutoff);
  if (!mine.length) return;
  writeStories(readStories().filter((s) => !(s.authorUid === uid && s.createdAt <= cutoff)));
}

// ---- Shorts (short vertical video -- its own feed, separate from the main
// text/image/video post feed, per Jared's "another interface on its own")---
const LS_SHORTS = 'iworship:local:shorts';
function readShorts() { return readJSON(LS_SHORTS, []); }
function writeShorts(list) { writeJSON(LS_SHORTS, list); broadcast('shorts'); }

export async function createShort(short) {
  const list = readShorts();
  const withId = {
    ...short,
    id: 'short-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now()
  };
  list.push(withId);
  writeShorts(list);
  return withId.id;
}
export async function deleteShort(id) {
  writeShorts(readShorts().filter((s) => s.id !== id));
}
export function watchShortsFeed(callback) {
  const fire = () => {
    const shorts = readShorts().slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    callback(shorts);
  };
  fire();
  return onBroadcast('shorts', fire);
}

// Trending (Explore/Discover) is computed client-side in app.js from
// state.feedPosts -- see firestore-data-layer.js's matching comment for why
// there's no separate watchTrendingPosts() query in either layer.
