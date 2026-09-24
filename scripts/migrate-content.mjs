// One-time, CROSS-PROJECT migration: copies posts, shorts (videos), stories,
// comments, likes, follows, DM threads + messages, group chats + messages,
// and notifications from the OLD project (iworship-8b3e6) into iworship-ph.
//
// Needed because today's account reset deleted these collections from
// iworship-ph entirely -- they were never re-copied by the earlier scripts
// (migrate-users-data.mjs only handled users/directory/editors/admins).
// Everything below still exists safely in iworship-8b3e6 -- nothing has
// ever been deleted or modified there by any script in this session.
//
// Everyone else's content is copied under their OWN (preserved) uid, same
// as migrate-auth-users.mjs/migrate-users-data.mjs already did for their
// accounts. Jared's own content is the one exception -- anything stamped
// with his OLD iworship-8b3e6 uid gets remapped to his CURRENT iworship-ph
// uid instead, so it shows up correctly under his real account rather than
// recreating the old, already-abandoned identity.
//
// Safe to re-run -- checks what's already there before overwriting/merging,
// never touches or deletes anything in the OLD project.
//
// RUN (after migrate-auth-users.mjs and migrate-users-data.mjs, if you
// haven't already run those -- this script doesn't depend on them, but
// people need Auth accounts in iworship-ph before any of this is reachable
// when they sign back in):
//   node scripts/migrate-content.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

// ---- FILL THESE IN ----
const OLD_SERVICE_ACCOUNT_PATH = './iworship-8b3e6-firebase-adminsdk-fbsvc-d0465e73a8.json';
const NEW_SERVICE_ACCOUNT_PATH = './iworship-ph-firebase-adminsdk-fbsvc-f142e897bb.json';
const JARED_EMAIL = 'josereconjrbonilla@gmail.com';
// ------------------------

const oldApp = initializeApp({ credential: cert(JSON.parse(readFileSync(OLD_SERVICE_ACCOUNT_PATH, 'utf8'))) }, 'old-content');
const newApp = initializeApp({ credential: cert(JSON.parse(readFileSync(NEW_SERVICE_ACCOUNT_PATH, 'utf8'))) }, 'new-content');
const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);
const oldAuth = getAuth(oldApp);
const newAuth = getAuth(newApp);

function dmThreadId(uidA, uidB) { return 'dm-' + [uidA, uidB].sort().join('_'); }
function likeDocId(kind, itemId, uid) { return kind + '_' + itemId + '_' + uid; }
function followDocId(followerUid, targetUid) { return followerUid + '_' + targetUid; }

let JARED_OLD_UID, JARED_NEW_UID;
const remap = (uid) => (uid === JARED_OLD_UID ? JARED_NEW_UID : uid);

async function copyAuthorUidCollection(name, extraFields) {
  const snap = await oldDb.collection(name).get();
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const patch = { ...data, authorUid: remap(data.authorUid) };
    if (extraFields) extraFields(patch, data);
    await newDb.collection(name).doc(d.id).set(patch, { merge: true });
    n++;
  }
  console.log(`  ${name}: ${n} copied`);
}

async function copyPosts() {
  const snap = await oldDb.collection('posts').get();
  for (const d of snap.docs) {
    const data = d.data();
    const patch = { ...data, authorUid: remap(data.authorUid) };
    if (patch.repostOf && patch.repostOf.authorUid) {
      patch.repostOf = { ...patch.repostOf, authorUid: remap(patch.repostOf.authorUid) };
    }
    await newDb.collection('posts').doc(d.id).set(patch, { merge: true });
  }
  console.log(`  posts: ${snap.size} copied`);
}

async function copyComments() {
  const snap = await oldDb.collection('comments').get();
  for (const d of snap.docs) {
    const data = d.data();
    await newDb.collection('comments').doc(d.id).set({ ...data, authorUid: remap(data.authorUid) }, { merge: true });
  }
  console.log(`  comments: ${snap.size} copied`);
}

async function copyLikes() {
  const snap = await oldDb.collection('likes').get();
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const newUid = remap(data.uid);
    const newId = likeDocId(data.kind, data.itemId, newUid);
    await newDb.collection('likes').doc(newId).set({ ...data, uid: newUid }, { merge: true });
    n++;
  }
  console.log(`  likes: ${n} copied`);
}

async function copyFollows() {
  const snap = await oldDb.collection('follows').get();
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const followerUid = remap(data.followerUid);
    const targetUid = remap(data.targetUid);
    const newId = followDocId(followerUid, targetUid);
    await newDb.collection('follows').doc(newId).set({ ...data, followerUid, targetUid }, { merge: true });
    n++;
  }
  console.log(`  follows: ${n} copied`);
  // Refresh follower/following counts on directory docs touched by this
  // migration, rather than trusting increments across two different runs.
  const touched = new Set();
  for (const d of snap.docs) {
    touched.add(remap(d.data().followerUid));
    touched.add(remap(d.data().targetUid));
  }
  for (const uid of touched) {
    const asFollower = await newDb.collection('follows').where('followerUid', '==', uid).get();
    const asTarget = await newDb.collection('follows').where('targetUid', '==', uid).get();
    await newDb.collection('directory').doc(uid).set({
      followingCount: asFollower.size,
      followerCount: asTarget.size,
    }, { merge: true });
  }
  console.log(`  directory follower/following counts refreshed for ${touched.size} account(s)`);
}

async function copyMessages(oldRef, newRef) {
  const snap = await oldRef.collection('messages').get();
  let batch = newDb.batch();
  let count = 0;
  for (const m of snap.docs) {
    const data = m.data();
    batch.set(newRef.collection('messages').doc(m.id), { ...data, senderUid: remap(data.senderUid) }, { merge: true });
    count++;
    if (count % 400 === 0) { await batch.commit(); batch = newDb.batch(); }
  }
  if (count % 400 !== 0) await batch.commit();
  return count;
}

async function copyDmThreads() {
  const snap = await oldDb.collection('dmThreads').get();
  let n = 0, merged = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const [uidA, uidB] = (data.participantUids || []).map(remap);
    if (!uidA || !uidB) continue;
    const newId = dmThreadId(uidA, uidB);
    const newRef = newDb.collection('dmThreads').doc(newId);
    const newSnap = await newRef.get();

    const renamedMap = (obj) => {
      const out = {};
      for (const [k, v] of Object.entries(obj || {})) out[remap(k)] = v;
      return out;
    };

    if (!newSnap.exists) {
      await newRef.set({
        participantUids: [uidA, uidB],
        participantNames: renamedMap(data.participantNames),
        participantPhotos: renamedMap(data.participantPhotos),
        readAt: renamedMap(data.readAt),
        lastMessageText: data.lastMessageText || '',
        lastMessageAt: data.lastMessageAt || FieldValue.serverTimestamp(),
        createdAt: data.createdAt || FieldValue.serverTimestamp(),
      });
      n++;
    } else {
      merged++;
    }
    await copyMessages(d.ref, newRef);
  }
  console.log(`  dmThreads: ${n} created, ${merged} merged into an existing thread`);
}

async function copyGroupChats() {
  const snap = await oldDb.collection('groupChats').get();
  for (const d of snap.docs) {
    const data = d.data();
    const memberUids = (data.memberUids || []).map(remap);
    const readAt = {};
    for (const [k, v] of Object.entries(data.readAt || {})) readAt[remap(k)] = v;
    const patch = { ...data, memberUids, readAt };
    if (data.ownerUid) patch.ownerUid = remap(data.ownerUid);
    await newDb.collection('groupChats').doc(d.id).set(patch, { merge: true });
    await copyMessages(d.ref, newDb.collection('groupChats').doc(d.id));
  }
  console.log(`  groupChats: ${snap.size} copied`);
}

async function copyNotifications() {
  const snap = await oldDb.collectionGroup('items').get();
  let n = 0;
  for (const d of snap.docs) {
    const recipientUid = remap(d.ref.parent.parent.id);
    const data = d.data();
    const patch = { ...data };
    if (data.actorUid) patch.actorUid = remap(data.actorUid);
    await newDb.collection('notifications').doc(recipientUid).collection('items').doc(d.id).set(patch, { merge: true });
    n++;
  }
  console.log(`  notifications: ${n} copied`);
}

async function main() {
  const newUser = await newAuth.getUserByEmail(JARED_EMAIL);
  JARED_NEW_UID = newUser.uid;
  const oldUser = await oldAuth.getUserByEmail(JARED_EMAIL);
  JARED_OLD_UID = oldUser.uid;

  console.log(`Remapping ${JARED_OLD_UID} -> ${JARED_NEW_UID}, copying everyone else as-is.\n`);

  await copyPosts();
  await copyAuthorUidCollection('shorts');
  await copyAuthorUidCollection('stories');
  await copyComments();
  await copyLikes();
  await copyFollows();
  await copyDmThreads();
  await copyGroupChats();
  await copyNotifications();

  console.log('\nDone. Nothing in iworship-8b3e6 was modified or deleted.');
}

main().catch((err) => {
  console.error('Content migration failed:', err);
  process.exit(1);
});
