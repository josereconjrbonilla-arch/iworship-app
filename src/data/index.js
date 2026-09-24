// Picks the real Firestore data layer once firebase-config.js has real values,
// otherwise falls back to the local demo layer — see interface.md for the
// shared shape both implement, and firebase-config.js for how to "graduate"
// from demo mode. app.js only ever imports from here, never the two
// implementations directly.
//
// Perf fix [2026-09-15] -- Jared: "the app is very slow on my phone. it
// takes a while for everything to pull up." A throttled trace (~1.6Mbps/
// 150ms RTT, matching a weak mobile connection) showed exactly why: this
// used to `await import('./firestore-data-layer.js')` -- a DYNAMIC import,
// which Vite/Rollup splits into its own chunk that the browser only
// discovers and starts fetching once the JS engine actually executes this
// line at runtime. Since app.js imports everything from this file, and this
// was a top-level await, the ENTIRE app was blocked waiting on that chunk
// (891KB) to be requested -- serially, AFTER the main bundle had already
// finished downloading and running -- rather than in parallel with it. The
// trace measured that serial gap alone at ~1.2s of the ~2.2s it took before
// the splash screen could hide. But which data layer gets used is actually
// fixed per deployment already (this project's standing practice is to
// build the ENTIRE app once in real mode with firebase-config.js's real
// values before ever shipping to Jared, or once in demo mode for local
// testing -- see architecture-and-decisions.md -- never both from one same
// build), so there was never a code-splitting benefit here to begin with,
// only a needless round trip. Making both imports static like local-data-
// layer.js already was lets Vite bundle firestore-data-layer.js into the
// same synchronously-reachable graph as the entry point, which means (a) it
// downloads in PARALLEL with the main bundle instead of after it, and (b)
// Vite auto-emits a <link rel="modulepreload"> for it in index.html, so the
// browser starts fetching it before any JS has even run. (The one thing
// that has to change to make this safe: firestore-data-layer.js's own
// module-top-level Firebase initialization now guards itself on
// isFirebaseConfigured too, so merely importing it in a demo-mode build
// doesn't reach out to Firebase with placeholder config values -- see that
// file's top for the guard. Its exported functions were already only ever
// CALLED when isFirebaseConfigured is true, via the `impl` pick below, so
// nothing about actual demo-mode behavior changes.)
import { isFirebaseConfigured } from '../firebase-config.js';
import * as local from './local-data-layer.js';
import * as firestore from './firestore-data-layer.js';

export const usingDemoMode = !isFirebaseConfigured;

const impl = isFirebaseConfigured ? firestore : local;

export const {
  watchSongs, addSong, updateSong, recordSongUsage,
  watchAuth, signInWithGoogle, signOutUser,
  signUpWithEmail, signInWithEmail, linkPasswordToAccount, hasPasswordLogin, sendPasswordReset,
  pushSupported, enablePushNotifications, currentNotificationPermission, disablePushNotifications, watchForegroundPush,
  watchProfile, fetchProfileFromServer, saveProfile, ensureDirectoryEntry,
  createRoom, watchRoom, watchProjectorRoom, updateRoom, endRoom, watchPublicRooms, watchHostRooms, watchCoHostRooms, checkRoomPassword,
  checkIsEditor, watchSessionMessages, sendSessionMessage,
  watchChurch, watchAllChurches, newChurchId, saveChurch, checkIsAdmin,
  watchAllUsers, watchDirectory,
  submitSongRequest, watchPendingSongRequests, watchMySongRequests, reviewSongRequest,
  createSermon, updateSermon, deleteSermon, watchMySermons, watchSermon,
  shareSermon, unshareSermon, watchSermonsSharedWithMe,
  createMedia, updateMedia, deleteMedia, watchMyMedia, watchMedia,
  shareMedia, unshareMedia, watchMediaSharedWithMe,
  uploadMediaFile, deleteMediaFile, uploadPptxSourceFile, convertPptxToSlideshow,
  createMediaFolder, updateMediaFolder, deleteMediaFolder, watchMyMediaFolders,
  createPost, deletePost, watchFeedPosts, watchUserPosts,
  submitReport, watchPendingReports, resolveReport,
  dmThreadId, ensureDmThread, watchMyDmThreads, watchDmMessages, sendDmMessage, markDmThreadRead,
  createGroupChat, updateGroupChat, deleteGroupChat, watchMyGroupChats, watchGroupChat, watchGroupChatMessages, sendGroupChatMessage, markGroupChatRead,
  // Fellowship redesign [2026-09-09] -- see interface.md's "FELLOWSHIP" section.
  likeItem, unlikeItem, watchMyLikes, likeCountFor,
  addComment, deleteComment, watchComments, commentCountFor,
  repostPost, repostCountFor,
  watchMySaved, toggleSave,
  followUser, unfollowUser, watchMyFollowing, followerCountFor, followingCountFor,
  watchNotifications, createNotification, markNotificationRead, markAllNotificationsRead,
  createStory, deleteStory, watchActiveStories, deleteExpiredStoriesFor,
  createShort, deleteShort, watchShortsFeed
} = impl;
