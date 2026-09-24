// One-time, WITHIN-iworship-ph migration: reattaches everything Jared
// authored/participated in under his OLD uid(s) to his NEW (current) uid,
// so it shows correctly for everyone else too -- posts, shorts (videos),
// stories, DM threads + messages, group chats + messages, likes, comments,
// follows, and notifications.
//
// Checks TWO old uids, not just one, because Jared has had three different
// uids across this app's history:
//   1. His original iworship-8b3e6 (pre-migration) uid -- anything he
//      posted/DMed/uploaded before the Singapore migration. That content
//      was already copied into iworship-ph by the original full migration
//      (migrate-firestore.mjs), but it's still stamped with THIS uid.
//   2. His first iworship-ph uid (post-migration, pre-today's-reset) --
//      anything from while he was testing the migrated app, before today's
//      account reset deleted that Auth account.
//   3. His current iworship-ph uid -- where everything should end up.
// This script resolves (1) itself via the old project's Auth, takes (2) as
// a constant below, and resolves (3) itself via the current project's Auth.
//
// Different from the other two scripts: those copy OTHER people's data
// across from the old iworship-8b3e6 PROJECT. This one fixes up Jared's OWN
// content that's already sitting in iworship-ph, just needs BOTH service
// account keys -- the old project's, only to look up uid (1); everything
// actually read/written happens in iworship-ph.
//
// Safe to re-run: every step checks what's already been moved before
// touching it, so running this twice won't double-count follows or
// duplicate messages.
//
// RUN:
//   node scripts/reattach-my-content.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

// ---- FILL THESE IN ----
const OLD_SERVICE_ACCOUNT_PATH = './iworship-8b3e6-firebase-adminsdk-fbsvc-8a028b118a.json';
const NEW_SERVICE_ACCOUNT_PATH = './iworship-ph-firebase-adminsdk-fbsvc-f142e897bb.json';
const JARED_EMAIL = 'josereconjrbonilla@gmail.com';
const IWORSHIP_PH_FIRST_UID = 'GcGWllSGcaVXZjeLW0vXCCX4Zef2'; // your pre-reset iworship-ph uid
// ------------------------

const oldApp = initializeApp({ credential: cert(JSON.parse(readFileSync(OLD_SERVICE_ACCOUNT_PATH, 'utf8'))) }, 'old');
const newApp = initializeApp({ credential: cert(JSON.parse(readFileSync(NEW_SERVICE_ACCOUNT_PATH, 'utf8'))) }, 'new');
const db = getFirestore(newApp); // everything read/written lives in iworship-ph
const oldAuth = getAuth(oldApp);
const newAuth = getAuth(newApp);

function dmThreadId(uidA, uidB) { return 'dm-' + [uidA, uidB].sort().join('_'); }
function likeDocId(kind, itemId, uid) { return kind + '_' + itemId + '_' + uid; }
function followDocId(followerUid, targetUid) { return followerUid + '_' + targetUid; }

let NEW_UID; // resolved in main()

async function copyMessages(oldRef, newRef, uidField, oldUid) {
  const snap = await oldRef.collection('messages').get();
  if (snap.empty) return 0;
  let batch = db.batch();
  let count = 0;
  for (const m of snap.docs) {
    const data = m.data();
    if (data[uidField] === oldUid) data[uidField] = NEW_UID;
    batch.set(newRef.collection('messages').doc(m.id), data);
    count++;
    if (count % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (count % 400 !== 0) await batch.commit();
  return count;
}

async function fixPosts(oldUid) {
  let n = 0;
  const byAuthor = await db.collection('posts').where('authorUid', '==', oldUid).get();
  for (const d of byAuthor.docs) { await d.ref.update({ authorUid: NEW_UID }); n++; }
  const byRepost = await db.collection('posts').where('repostOf.authorUid', '==', oldUid).get();
  for (const d of byRepost.docs) { await d.ref.update({ 'repostOf.authorUid': NEW_UID }); n++; }
  if (n) console.log(`  posts: ${n} updated (own posts + reposts of your posts)`);
  return n;
}

async function fixSimpleAuthorUid(collectionName, oldUid) {
  const snap = await db.collection(collectionName).where('authorUid', '==', oldUid).get();
  for (const d of snap.docs) await d.ref.update({ authorUid: NEW_UID });
  if (snap.size) console.log(`  ${collectionName}: ${snap.size} updated`);
  return snap.size;
}

async function fixComments(oldUid) {
  const snap = await db.collection('comments').where('authorUid', '==', oldUid).get();
  for (const d of snap.docs) await d.ref.update({ authorUid: NEW_UID });
  if (snap.size) console.log(`  comments: ${snap.size} updated`);
  return snap.size;
}

async function fixDmThreads(oldUid) {
  const snap = await db.collection('dmThreads').where('participantUids', 'array-contains', oldUid).get();
  let moved = 0, merged = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const other = data.participantUids.find((u) => u !== oldUid);
    if (!other) continue;
    const newId = dmThreadId(NEW_UID, other);
    const newRef = db.collection('dmThreads').doc(newId);
    const newSnap = await newRef.get();

    const renamedKey = (obj) => {
      if (!obj || !(oldUid in obj)) return obj || {};
      const copy = { ...obj };
      copy[NEW_UID] = copy[oldUid];
      delete copy[oldUid];
      return copy;
    };

    if (!newSnap.exists) {
      await newRef.set({
        participantUids: [NEW_UID, other],
        participantNames: renamedKey(data.participantNames),
        participantPhotos: renamedKey(data.participantPhotos),
        readAt: renamedKey(data.readAt),
        lastMessageText: data.lastMessageText || '',
        lastMessageAt: data.lastMessageAt || FieldValue.serverTimestamp(),
        createdAt: data.createdAt || FieldValue.serverTimestamp(),
      });
      await copyMessages(d.ref, newRef, 'senderUid', oldUid);
      moved++;
    } else {
      await copyMessages(d.ref, newRef, 'senderUid', oldUid);
      const existing = newSnap.data();
      const oldNewer = data.lastMessageAt && (!existing.lastMessageAt || data.lastMessageAt.toMillis() > existing.lastMessageAt.toMillis());
      if (oldNewer) {
        await newRef.update({ lastMessageText: data.lastMessageText || existing.lastMessageText, lastMessageAt: data.lastMessageAt });
      }
      merged++;
    }
    const oldMessages = await d.ref.collection('messages').get();
    for (const m of oldMessages.docs) await m.ref.delete();
    await d.ref.delete();
  }
  if (moved || merged) console.log(`  dmThreads: ${moved} moved, ${merged} merged into an existing thread`);
  return moved + merged;
}

async function fixGroupChats(oldUid) {
  const snap = await db.collection('groupChats').where('memberUids', 'array-contains', oldUid).get();
  for (const d of snap.docs) {
    const data = d.data();
    await d.ref.update({ memberUids: FieldValue.arrayRemove(oldUid) });
    await d.ref.update({ memberUids: FieldValue.arrayUnion(NEW_UID) });
    if (data.ownerUid === oldUid) await d.ref.update({ ownerUid: NEW_UID });
    if (data.readAt && oldUid in data.readAt) {
      const readAt = { ...data.readAt };
      readAt[NEW_UID] = readAt[oldUid];
      delete readAt[oldUid];
      await d.ref.update({ readAt });
    }
    const messages = await d.ref.collection('messages').where('senderUid', '==', oldUid).get();
    for (const m of messages.docs) await m.ref.update({ senderUid: NEW_UID });
  }
  if (snap.size) console.log(`  groupChats: ${snap.size} updated`);
  return snap.size;
}

async function fixLikes(oldUid) {
  const snap = await db.collection('likes').where('uid', '==', oldUid).get();
  let moved = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const newId = likeDocId(data.kind, data.itemId, NEW_UID);
    const newRef = db.collection('likes').doc(newId);
    if (!(await newRef.get()).exists) {
      await newRef.set({ ...data, uid: NEW_UID });
      moved++;
    }
    await d.ref.delete();
  }
  if (moved) console.log(`  likes: ${moved} moved`);
  return moved;
}

async function fixFollows(oldUid) {
  let followingMoved = 0, followerMoved = 0;
  const asFollower = await db.collection('follows').where('followerUid', '==', oldUid).get();
  for (const d of asFollower.docs) {
    const data = d.data();
    const newId = followDocId(NEW_UID, data.targetUid);
    const newRef = db.collection('follows').doc(newId);
    if (!(await newRef.get()).exists) {
      await newRef.set({ ...data, followerUid: NEW_UID });
      followingMoved++;
    }
    await d.ref.delete();
  }
  const asTarget = await db.collection('follows').where('targetUid', '==', oldUid).get();
  for (const d of asTarget.docs) {
    const data = d.data();
    const newId = followDocId(data.followerUid, NEW_UID);
    const newRef = db.collection('follows').doc(newId);
    if (!(await newRef.get()).exists) {
      await newRef.set({ ...data, targetUid: NEW_UID });
      followerMoved++;
    }
    await d.ref.delete();
  }
  if (followingMoved || followerMoved) {
    await db.collection('directory').doc(NEW_UID).set({
      followingCount: FieldValue.increment(followingMoved),
      followerCount: FieldValue.increment(followerMoved),
    }, { merge: true });
    console.log(`  follows: ${followingMoved} "you follow" + ${followerMoved} "follows you" moved, directory counts updated`);
  }
  return followingMoved + followerMoved;
}

async function fixNotifications(oldUid) {
  const oldItems = await db.collection('notifications').doc(oldUid).collection('items').get();
  for (const d of oldItems.docs) {
    await db.collection('notifications').doc(NEW_UID).collection('items').doc(d.id).set(d.data());
    await d.ref.delete();
  }
  let actorFixed = 0;
  try {
    const asActor = await db.collectionGroup('items').where('actorUid', '==', oldUid).get();
    for (const d of asActor.docs) { await d.ref.update({ actorUid: NEW_UID }); actorFixed++; }
  } catch (err) {
    console.warn('  notifications (as actor): skipped -- Firestore wants a composite index for this collection-group query.');
    console.warn('  The error below includes a direct link to create it in one click; run this script again afterward:');
    console.warn('  ' + err.message);
  }
  if (oldItems.size || actorFixed) console.log(`  notifications: ${oldItems.size} received-by-you moved, ${actorFixed} you-were-the-actor updated`);
  return oldItems.size + actorFixed;
}

async function reattachFor(oldUid, label) {
  console.log(`\n--- Checking content under ${label} (${oldUid}) ---`);
  let total = 0;
  total += await fixPosts(oldUid);
  total += await fixSimpleAuthorUid('shorts', oldUid);
  total += await fixSimpleAuthorUid('stories', oldUid);
  total += await fixComments(oldUid);
  total += await fixDmThreads(oldUid);
  total += await fixGroupChats(oldUid);
  total += await fixLikes(oldUid);
  total += await fixFollows(oldUid);
  total += await fixNotifications(oldUid);
  if (total === 0) console.log('  nothing found under this uid.');
  return total;
}

async function main() {
  const newUser = await newAuth.getUserByEmail(JARED_EMAIL);
  NEW_UID = newUser.uid;

  let iworship8b3e6Uid = null;
  try {
    const oldUser = await oldAuth.getUserByEmail(JARED_EMAIL);
    iworship8b3e6Uid = oldUser.uid;
  } catch (err) {
    console.warn(`Could not find ${JARED_EMAIL} in iworship-8b3e6 (${err.code || err.message}) -- skipping that uid.`);
  }

  console.log(`Current uid (iworship-ph): ${NEW_UID}`);

  const oldUids = [
    { uid: IWORSHIP_PH_FIRST_UID, label: 'your first iworship-ph uid' },
    ...(iworship8b3e6Uid ? [{ uid: iworship8b3e6Uid, label: 'your original iworship-8b3e6 uid' }] : []),
  ].filter((o) => o.uid !== NEW_UID);

  for (const { uid, label } of oldUids) {
    await reattachFor(uid, label);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Reattach failed:', err);
  process.exit(1);
});