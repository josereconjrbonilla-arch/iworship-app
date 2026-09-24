import { ICONS } from './content/icons.js';
import { THEMES } from './content/themes.js';
import { VERSES } from './content/verses.js';
import {
  usingDemoMode,
  watchSongs, addSong, updateSong, recordSongUsage,
  watchAuth, signInWithGoogle, signOutUser,
  signUpWithEmail, signInWithEmail, linkPasswordToAccount, hasPasswordLogin, sendPasswordReset,
  pushSupported, enablePushNotifications, currentNotificationPermission, disablePushNotifications, watchForegroundPush,
  watchProfile, fetchProfileFromServer, saveProfile, ensureDirectoryEntry,
  createRoom, watchRoom, watchProjectorRoom, updateRoom, endRoom, watchPublicRooms, watchHostRooms, watchCoHostRooms, checkRoomPassword,
  checkIsEditor, watchSessionMessages, sendSessionMessage,
  checkIsAdmin, watchChurch, watchAllChurches, newChurchId, saveChurch,
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
  likeItem, unlikeItem, watchMyLikes, likeCountFor,
  addComment, deleteComment, watchComments, commentCountFor,
  repostPost, repostCountFor,
  watchMySaved, toggleSave,
  followUser, unfollowUser, watchMyFollowing, followerCountFor, followingCountFor,
  watchNotifications, createNotification, markNotificationRead, markAllNotificationsRead,
  createStory, deleteStory, watchActiveStories, deleteExpiredStoriesFor,
  createShort, deleteShort, watchShortsFeed
} from './data/index.js';
import { suggestThemes, aiTaggingConfigured } from './data/ai-tagger.js';
import { pushNotificationsConfigured } from './push-config.js';
import qrcodeGen from './content/qrcode.js';
import { stringToBytes as qrStringToBytesUtf8 } from './content/qrcode-utf8.js';

// Use the Unicode-safe byte encoder for QR data (our join URLs are plain
// ASCII today, but this keeps the encoder correct if that ever changes).
qrcodeGen.stringToBytes = qrStringToBytesUtf8;

"use strict";

  // Hoisted to the very top: module top-level code below runs sequentially,
  // and a couple of the subscriptions set up further down (watchSongs,
  // watchAuth, a resumed session) can fire their first callback synchronously
  // -- calling render() -- before the rest of this file has finished
  // evaluating. `main` has to already exist when that happens.
  const main = document.getElementById('main');

  function icon(name){ return ICONS[name] || ''; }
  function setSVG(el, name){ if(el) el.innerHTML = icon(name); }

  // Debounce [2026-09-16] -- Jared: "get rid of the lag and the delay."
  // A few search boxes (the main Hymnal search, the host SONGS picker) are
  // deliberately full-library browsers, not just lookups -- an empty query
  // is supposed to show everything, so unlike the setlist add-search
  // (which caps at 8 results) their result list can legitimately be
  // hundreds of songs long. Rebuilding that whole list via outerHTML on
  // EVERY keystroke measured ~200ms each at 4x CPU throttle against a
  // 400-song library (roughly Jared's real library size) -- typing
  // "grace" felt like five separate ~200ms stalls, one per letter, since
  // each stall blocks the main thread before the next letter can even
  // register. `fn` here is only the expensive rebuild step, called once
  // `wait`ms after the user stops typing rather than once per letter; the
  // input's own value always updates instantly regardless, since that part
  // is never debounced.
  function debounce(fn, wait){
    let t = null;
    return function(){
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function(){ fn.apply(ctx, args); }, wait);
    };
  }

  /* ============ TOPICAL THEMES ============ */
  function themeLabel(key){ const t = THEMES.find(function(t){return t.key===key;}); return t ? t.label : key; }
  function youtubeSearchUrl(title){ return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(title + ' hymn lyrics'); }

  function dayOfYear(d){
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d - start;
    return Math.floor(diff / 86400000);
  }
  function todaysVerse(){ return VERSES[dayOfYear(new Date()) % VERSES.length]; }
  function timeGreeting(){
    const h = new Date().getHours();
    if(h < 12) return 'Good Morning';
    if(h < 18) return 'Good Afternoon';
    return 'Good Evening';
  }


  /* ============ STATE ============ */
  function safeGet(k, fallback){ try{ const v = localStorage.getItem(k); return v===null?fallback:v; }catch(e){ return fallback; } }
  function safeSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){ /* ignore */ } }
  function safeGetJSON(k, fallback){ try{ const v = localStorage.getItem(k); return v===null?fallback:JSON.parse(v); }catch(e){ return fallback; } }
  function safeRemove(k){ try{ localStorage.removeItem(k); }catch(e){ /* ignore */ } }
  // Session-only variant (sessionStorage, not localStorage) for state that
  // must stay scoped to THIS TAB rather than shared across every tab in the
  // browser -- specifically which worship-session room/role a tab is looking
  // at (cv:activeRoomCode / cv:isHost below). localStorage would make a
  // second tab (e.g. opening one to preview the congregation's view while
  // hosting in another) immediately hijack into "session-host" too, since
  // both tabs would read the same host's saved room code. sessionStorage
  // still survives a same-tab refresh, which is the behavior this is for.
  function safeSessionGet(k, fallback){ try{ const v = sessionStorage.getItem(k); return v===null?fallback:v; }catch(e){ return fallback; } }
  function safeSessionSet(k, v){ try{ sessionStorage.setItem(k, v); }catch(e){ /* ignore */ } }
  function safeSessionRemove(k){ try{ sessionStorage.removeItem(k); }catch(e){ /* ignore */ } }
  // JSON variant of safeSessionGet -- used by cv:lastView (reload-resume,
  // see RESUMABLE_VIEWS' own comment further down) to store {view, id?}
  // instead of a bare string.
  function safeSessionGetJSON(k, fallback){ try{ const v = sessionStorage.getItem(k); return v===null?fallback:JSON.parse(v); }catch(e){ return fallback; } }

  const state = {
    view:'landing',         // landing | list | detail | add | session-*
    songId:null,
    query:'',
    mode: safeGet('cv:mode','sing'),        // sing | play -- device-level display prefs
    scale: parseFloat(safeGet('cv:scale','1')) || 1,
    transpose:{},            // per song id, semitone offset
    library: [],             // populated live by watchSongs()
    aiTagBulk: null,        // {running, current, total, currentTitle} while "AI-Tag Untagged Songs" is running, else null
    showFavoritesOnly:false,
    activeTheme:null,
    user: null,              // populated live by watchAuth() -- {uid, displayName, email, isDemo} or null
    pendingDmUid: null,      // ["?dm=<uid>" notification deep link, 2026-09-24] set by the startup routing block, consumed once watchAuth() has a real user -- see that block's own comment
    pendingProfileUid: null, // ["?profile=<uid>" notification deep link, 2026-09-24] same as pendingDmUid just above, for a like/comment/repost/follow push
    pendingResumeView: null, // ["resume where you left off" on reload, 2026-09-24] set by the startup routing block for a whitelisted view that needs a signed-in user to reconstruct -- consumed once watchAuth() has one, see RESUMABLE_VIEWS' own comment for the full mechanism
    profile: null,           // populated live by watchProfile() once signed in -- {displayName, churchName, mode, scale, theme, favorites[]}
    profileLoaded: false,    // [2026-09-22] true only once watchProfile()'s listener has actually fired at least once for the CURRENT sign-in -- see that subscription's own comment and needsProfileSetup below for why this exists as its own flag rather than inferring "loaded" from state.profile being non-null.
    isEditor: false,         // populated by checkIsEditor() once signed in -- worship-team allowlist, gates the Musicians chat tab
    isAdmin: false,          // populated by checkIsAdmin() once signed in -- app Admin (Jared + friend), bypasses every monetization gate
    church: null,            // populated live by watchChurch(profile.churchId) once signed in with a church -- powers the Public/Church Library toggle
    libraryView: 'public',   // 'public' | 'church' -- which the hymnal list is currently filtered by (see filteredResults())
    adminChurches: [],       // populated live by watchAllChurches() while state.view === 'admin'
    adminUsers: [],          // populated live by watchAllUsers() while state.view === 'admin' -- powers "find by name" search
    mySongRequests: [],      // populated live by watchMySongRequests() while state.view === 'song-request'
    pendingSongRequests: [], // populated live by watchPendingSongRequests() while state.view === 'song-request-queue'
    activeRoomCode: safeSessionGet('cv:activeRoomCode', null),
    isHost: safeSessionGet('cv:isHost', null) === '1',
    // Co-hosting [2026-09-05]: true when this tab is looking at
    // session-host as an ASSIGNED co-host rather than the room's own
    // owner -- see joinAsCoHost(). Mutually exclusive with isHost (a room's
    // creator is never also listed in their own coHostUids); both just mean
    // "show the host screen for this room", with canControlRoom()/
    // isRoomOwner() below doing the actual per-action gating from
    // room.hostUid/controllerUid directly rather than from either flag.
    isCoHost: safeSessionGet('cv:isCoHost', null) === '1',
    room: null,              // populated live by watchActiveRoom() while in a session-* view
    roomLoading: false,
    publicRooms: [],         // populated live by watchPublicRooms() while on session-join
    mySermons: [],           // populated live by watchMySermons() while on the sermons/sermon-edit views, and by the host picker
    sharedSermons: [],       // populated live by watchSermonsSharedWithMe() alongside mySermons -- sermons someone else built and shared with this uid
    directory: [],           // populated live by watchDirectory() while the Sermons screen's share panel is open -- powers "search by name/church" (see startDirectoryWatch())
    viewSermon: null,        // populated live by ensureViewSermonWatch() -- whichever ONE sermon the active room is currently presenting, for host/congregant/projector alike
    myMedia: [],             // Media/AVP [2026-09-06] -- populated live by watchMyMedia() while on the Media Library screen, and by the host's MEDIA picker
    sharedMedia: [],         // populated live by watchMediaSharedWithMe() alongside myMedia -- media someone else uploaded and shared with this uid
    myMediaFolders: [],      // Media Folders [2026-09-06] -- populated live by watchMyMediaFolders() while on the Media Library screen only (the in-session picker stays folder-unaware)
    viewMedia: null,         // populated live by ensureViewMediaWatch() -- whichever ONE media item the active room is currently presenting, for host/congregant/projector alike
    sharedSermonLinkId: null,   // set once, from a ?sermon=<id> deep link on page load -- see the deep-link block near the top of this file
    sharedSermonLinkData: null, // populated live by startSharedSermonLinkWatch() while state.view === 'shared-sermon-link'

    // Fellowship [2026-09-08] -- see interface.md's "FELLOWSHIP" section and
    // claude/fellowship-plan.md for the full design. Cross-church, no data
    // walls, same as the rest of this app; block/report built in from day one.
    feedPosts: [],            // populated live by watchFeedPosts() while state.view === 'fellowship'
    viewProfileUid: null,      // whose profile renderProfileView() is currently showing (never state.user.uid -- that's "My Profile"/renderProfileEdit instead)
    viewProfilePosts: [],      // populated live by watchUserPosts(viewProfileUid) alongside renderProfileView()
    messagesTab: 'dms',        // 'dms' | 'groups' -- which segment renderMessages() (the inbox hub) is showing
    // [v36] myDmThreads/myGroupChats are now app-wide the moment someone
    // signs in (folded into startSocialWatches()/stopSocialWatches() below),
    // not just while inside a Messages view -- the new topbar Messages icon
    // needs a live unread badge/dropdown regardless of what screen is open,
    // same reasoning as notifications just below.
    myDmThreads: [],           // populated live by watchMyDmThreads()
    activeDmThreadId: null,    // which thread renderDmThread() is currently open on
    activeDmMessages: [],      // populated live by watchDmMessages(activeDmThreadId)
    myGroupChats: [],          // populated live by watchMyGroupChats()
    activeGroupChatId: null,   // which group renderGroupChatThread() is currently open on
    activeGroupChat: null,     // populated live by watchGroupChat(activeGroupChatId) -- name/memberUids/ownerUid for the header + member list
    activeGroupMessages: [],   // populated live by watchGroupChatMessages(activeGroupChatId)
    pendingReports: [],        // populated live by watchPendingReports() while state.view === 'admin'

    // Notifications pop-down + Messages dock [v36] -- Jared: "notifs at the
    // left and notifs at the top? a bit redundant, just keep the one at the
    // top... make it a pop down from there first" and "[messages] its own
    // icon just like in facebook, then the messages pop at the bottom (in
    // PC version)... in mobile, you can make it like messenger."
    notifDropdownOpen: false, // topbar bell now toggles this instead of navigating straight to the Notifications page
    msgDropdownOpen: false,   // desktop-only: topbar Messages icon toggles this (a list of conversations)
    dock: null,               // floating chat-dock popup (desktop only, one at a time): {kind:'dm'|'group', id, messages:[]} or null when closed
    // Background media-upload queue [2026-09-24, Jared: "when I upload
    // media, it should be queued somewhere so I can safely go anywhere
    // else in the app without cancelling it"] -- app-wide (not tied to
    // the Media Library view) for the exact same reason as `dock` above:
    // the little floating tray this powers (see renderUploadTray(), by
    // renderChatDock()) has to still be visible/updating no matter which
    // screen is on top. Each entry: {id, kind, title, status:
    // 'uploading'|'converting'|'done'|'error', pct, error}. See
    // pushUploadQueueEntry() (by attachMediaLibraryHandlers()) for what
    // creates these and the fuller story on why this exists at all.
    uploadQueue: [],

    // Social redesign [2026-09-09] -- see claude/fellowship-plan.md's "v2:
    // social redesign" section. These five run app-wide the moment someone
    // signs in (not gated to one view), same as state.profile itself,
    // since the header's notification bell/avatar need them regardless of
    // what screen is currently open -- see startSocialWatches()/
    // stopSocialWatches() near watchAuth().
    myLikedKeys: new Set(),   // "kind:itemId" strings this uid has liked -- populated by watchMyLikes()
    mySavedKeys: new Set(),   // "kind:itemId" strings this uid has saved/bookmarked -- populated by watchMySaved()
    myFollowing: new Set(),   // uids this uid follows -- populated by watchMyFollowing()
    notifications: [],        // populated by watchNotifications() -- newest first, capped at 100
    shortsFeed: [],           // populated live by watchShortsFeed() while state.view === 'shorts'
    activeStories: [],        // populated live by watchActiveStories() while state.view === 'fellowship' (the feed's story bar) or the story viewer is open

    // Homepage redesign [2026-09-10] -- Jared: "having fellowship as the
    // main attraction is better, like recent posts, trending posts." Which
    // segment the home hub's compact Fellowship preview is showing.
    landingFeedTab: 'recent',  // 'recent' | 'trending'

    // Settings [2026-09-10] -- Jared: "we can move light/dark mode in the
    // settings... settings will cover preferences, password, account
    // switching/log in/log out." Transient UI-only state for that screen.
    settingsAddPasswordOpen: false,
    settingsPushStatus: null,   // last result string from enablePushNotifications(), for a one-line status message
    settingsStageBgStatus: null, // last status string from the presentation-background upload below, for a one-line status message
  };

  /* ============ MONETIZATION: access checks ============ */
  // See src/data/interface.md's "BETA PHASE" / "Real enforcement" sections
  // for the full design and why these three specific things (Play Mode,
  // add-song, hosting) are gated while everything else stays open. Admins
  // and beta testers bypass all of it -- hasFullAccess() is the single
  // source of truth for that bypass, mirroring firestore.rules'
  // hasFullAccess() so the UI and the real write-time enforcement never
  // disagree about who gets a free pass.
  function hasFullAccess(){
    return !!state.isAdmin || !!(state.profile && state.profile.isBetaTester);
  }
  function myRole(){ return state.profile ? state.profile.role : null; }
  function canUsePlayMode(){
    if(hasFullAccess()) return true;
    return ['editor','musicDirector','musician','individualPremium'].includes(myRole());
  }
  function canAddSongs(){
    if(hasFullAccess() || state.isEditor) return true; // isEditor: legacy worship-team allowlist, untouched by the new roles
    return myRole() === 'editor' || myRole() === 'individualPremium';
  }
  function canHost(){
    if(hasFullAccess() || state.isEditor) return true; // isEditor: legacy worship-team allowlist, untouched by the new roles
    return ['editor','musicDirector','individualPremium'].includes(myRole());
  }

  // Co-hosting [2026-09-05] -- Jared: "hosts can assign other hosts to their
  // session and grant controls to one person at a time." isRoomOwner() is
  // the room's actual creator (room.hostUid) -- the only one who can edit
  // the coHostUids roster or reassign controllerUid (see
  // renderHostManagePanel()). canControlRoom() is broader: true for the
  // owner OR whoever the owner currently handed controllerUid to -- this is
  // what actually gates every content-mutating action on the host screen
  // (chooseSong/presentSermon/presentVerse/changeSection/etc. below), and
  // matches firestore.rules' rooms/{code} update rule exactly, so a blocked
  // action here would have been rejected server-side anyway -- this just
  // gives a clear reason instead of a failed write round-trip.
  function isRoomOwner(room){
    return !!(room && state.user && room.hostUid === state.user.uid);
  }
  function canControlRoom(room){
    return !!(room && state.user && (room.hostUid === state.user.uid || room.controllerUid === state.user.uid));
  }

  function isFavorite(id){ return !!(state.profile && state.profile.favorites && state.profile.favorites.includes(id)); }
  async function toggleFavorite(id){
    if(!state.user){ showToast('Sign in first so your favorites follow you to any device.'); return; }
    const current = (state.profile && state.profile.favorites) || [];
    const next = current.includes(id) ? current.filter(function(x){return x!==id;}) : current.concat([id]);
    await saveProfile(state.user.uid, { favorites: next });
    // No local re-render needed -- watchProfile's own subscription will fire and re-render.
  }

  /* ============ WORSHIP SESSIONS: live via the data layer ============ */
  // Every host action just writes through updateRoom/createRoom; every open
  // screen -- host or viewer -- is a live subscription (watchRoom /
  // watchPublicRooms) that re-renders itself on its own. No polling, no
  // manual "publish the whole page" trick.
  let unsubRoom = null;
  function stopRoomWatch(){ if(unsubRoom){ unsubRoom(); unsubRoom = null; } }
  // Same-device room relay [2026-09-24] -- Jared, testing the offline fix
  // above: "can't move the lyrics" (offline), then, after being asked how he
  // tested it: "I was controlling the projector using the same device." That
  // pinpoints the actual remaining gap: PREV/NEXT/GO LIVE write through
  // updateRoom() on the CONTROLS tab's own Firestore connection (`db`) --
  // Firestore always applies your OWN pending write to your OWN listener
  // instantly, online or not (this is standard "latency compensation", not
  // anything specific to persistence config), so the Controls tab itself
  // always sees its own change immediately, offline included. But the
  // Projector tab is a SEPARATE `window.open()`ed browsing context with its
  // own SEPARATE Firestore connection (`projectorDb`, isolated on purpose --
  // see its own comment) -- a completely different client, which only ever
  // learns about that write once it actually reaches Google's servers and
  // gets pushed back down. If the one physical device driving both tabs has
  // no network at all, that write can't leave the device, so the Projector
  // tab -- same computer or not -- never hears about it. Same reasoning
  // Jared already had confirmed for him for the F-key fix just above: a
  // BroadcastChannel is a same-origin, same-browser, ZERO-network relay, so
  // it's the right tool for exactly this same-device case.
  //
  // What actually needs to travel is tiny: just the live "pointer" fields on
  // the room doc (which song/section/slide is current) -- the heavy part,
  // the actual lyrics, is already sitting in `state.library` in memory on
  // BOTH tabs (watchSongs() loads the whole hymnal for every screen, not
  // just the host's -- see its own comment) the moment each tab first loads,
  // fully independent of Firestore's cache config. So relaying just the room
  // object, same-device, makes the Projector tab's render pick up the new
  // pointer and resolve it against lyrics it already has -- no network
  // needed for either half once both tabs have been open at least once.
  //
  // applyRoomSnapshot() is the exact body watchActiveRoom's own Firestore
  // callback used to have inline, now shared so the relay receiver below
  // can drive the exact same state/render path a real snapshot would.
  // `broadcast` is false only when applyRoomSnapshot is being called BECAUSE
  // of an incoming relay message -- otherwise every real snapshot re-posts
  // itself to any same-device Projector tab that might be listening (posting
  // is a harmless no-op if no one's listening, and the Projector view itself
  // never re-broadcasts what it receives, so there's no echo loop).
  function applyRoomSnapshot(code, room, broadcast){
    state.roomLoading = false;
    state.room = room;
    ensureViewSermonWatch(room);
    ensureViewMediaWatch(room);
    if(!room && state.activeRoomCode === code){
      // Room is gone -- host ended it, or it never existed on this backend.
      stopRoomWatch();
      stopChatWatch();
      state.activeRoomCode = null; state.isHost = false; state.isCoHost = false; state.room = null;
      safeSessionRemove('cv:activeRoomCode'); safeSessionRemove('cv:isHost'); safeSessionRemove('cv:isCoHost');
      if(state.view === 'session-host' || state.view === 'session-view'){
        showToast('This service session has ended.');
        state.view = 'landing';
      }
    }
    if(broadcast && roomRelayChannel && state.view !== 'session-projector' && state.activeRoomCode === code){
      roomRelayChannel.postMessage({ code: code, room: room });
    }
    render();
  }
  const ROOM_RELAY_CHANNEL = 'iworship:room-relay';
  const roomRelayChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(ROOM_RELAY_CHANNEL) : null;
  if(roomRelayChannel){
    roomRelayChannel.onmessage = function(e){
      if(state.view !== 'session-projector') return;
      if(!e.data || e.data.code !== state.activeRoomCode) return;
      applyRoomSnapshot(e.data.code, e.data.room, false);
    };
  }
  function watchActiveRoom(code){
    stopRoomWatch();
    state.roomLoading = true;
    // Offline-resilient projector [2026-09-24] -- Jared, after live-testing
    // the offline banner: "make the projector mode continue even offline."
    // See watchProjectorRoom()'s own big comment in firestore-data-layer.js
    // for the full reasoning/history (the account-reset bug, why this is
    // scoped and isolated, what's actually different this time). Every
    // other route -- host, viewer, co-host -- keeps using the exact same
    // watchRoom() call as before, completely unchanged; only the dedicated
    // Presenter/Projector route (state.view is already set to
    // 'session-projector' before this ever runs for that route -- see the
    // ?stage= branch in the startup-routing block) reads through the
    // isolated, persistent-cache-backed watcher instead.
    const watchFn = (state.view === 'session-projector') ? watchProjectorRoom : watchRoom;
    unsubRoom = watchFn(code, function(room){
      applyRoomSnapshot(code, room, true);
    });
  }

  // Sermon presentation [2026-09-04] -- a room can now be showing a song
  // (the original behavior) OR a sermon, toggled by `currentContentType`
  // ('song'|'sermon', treated as 'song' when absent for older rooms).
  // Unlike songs (globally preloaded into state.library for everyone, since
  // browsing the hymnal is a core feature), sermons are only fetched one at
  // a time, by id, for whichever room is actually presenting one right now
  // -- there's no "browse all sermons" screen for congregants, just
  // whatever the host is currently showing. This watch is kept in sync
  // from watchActiveRoom's callback above (right after state.room updates,
  // before render()) rather than from inside a render function -- starting
  // a new subscription from inside render() risks a synchronous
  // broadcast-triggered re-render in demo mode (see local-data-layer.js's
  // broadcast()) reentering render() while it's still on the call stack.
  // Doing it here instead means any such reentrant render() call happens
  // with state.room already fully updated, which is harmless (see
  // startMySongRequestsWatch/startPendingSongRequestsWatch for the same
  // reasoning applied elsewhere).
  let unsubViewSermon = null;
  let viewSermonWatchedId = null;
  function stopViewSermonWatch(){
    if(unsubViewSermon){ unsubViewSermon(); unsubViewSermon = null; }
    viewSermonWatchedId = null;
    state.viewSermon = null;
  }
  function ensureViewSermonWatch(room){
    const wantId = (room && room.currentContentType === 'sermon') ? room.currentSermonId : null;
    if(wantId === viewSermonWatchedId) return;
    viewSermonWatchedId = wantId;
    if(unsubViewSermon){ unsubViewSermon(); unsubViewSermon = null; }
    state.viewSermon = null;
    if(!wantId) return;
    unsubViewSermon = watchSermon(wantId, function(sermon){
      state.viewSermon = sermon;
      render();
    });
  }

  // Media/AVP [2026-09-06] -- exact mirror of ensureViewSermonWatch() just
  // above, for whichever ONE media item a room is currently presenting.
  let unsubViewMedia = null;
  let viewMediaWatchedId = null;
  function stopViewMediaWatch(){
    if(unsubViewMedia){ unsubViewMedia(); unsubViewMedia = null; }
    viewMediaWatchedId = null;
    state.viewMedia = null;
  }
  function ensureViewMediaWatch(room){
    const wantId = (room && room.currentContentType === 'media') ? room.currentMediaId : null;
    if(wantId === viewMediaWatchedId) return;
    viewMediaWatchedId = wantId;
    if(unsubViewMedia){ unsubViewMedia(); unsubViewMedia = null; }
    state.viewMedia = null;
    if(!wantId) return;
    unsubViewMedia = watchMedia(wantId, function(media){
      state.viewMedia = media;
      render();
    });
  }

  /* ============ IN-SESSION CHAT: Everyone + Musicians, live ============ */
  // Extensible by design: CHAT_CHANNELS is the whole list of channels the UI
  // offers. Adding another one later (e.g. "Ushers") is just a new entry
  // here plus a matching disjunct in firestore.rules -- see interface.md.
  const CHAT_CHANNELS = [
    { key: 'everyone', label: 'Everyone' },
    { key: 'musicians', label: 'Musicians' }
  ];
  let chatChannel = 'everyone';
  let chatMessages = [];
  let chatGuestName = safeSessionGet('cv:chatName', '');
  let unsubChat = null;
  function stopChatWatch(){ if(unsubChat){ unsubChat(); unsubChat = null; } chatMessages = []; chatChannel = 'everyone'; }
  function watchChat(code, channel){
    if(unsubChat) unsubChat();
    unsubChat = watchSessionMessages(code, channel, function(messages){
      chatMessages = messages;
      // Patch the message list in place when it's already on screen, rather
      // than a full render() -- a message can arrive at any moment while
      // someone's mid-sentence in the compose box below it, and a full
      // re-render would wipe out what they'd typed and drop focus (the same
      // problem the setlist/host-picker search boxes solve, just triggered
      // by incoming data here instead of the user's own typing).
      const el = document.getElementById('chatMessages');
      if(el){
        el.innerHTML = renderChatMessages(messages);
        el.scrollTop = el.scrollHeight;
      } else {
        render();
      }
    });
  }
  function switchChatChannel(code, channel){
    chatChannel = channel;
    chatMessages = [];
    render();
    watchChat(code, channel);
  }
  function currentDisplayName(){
    if(state.profile && state.profile.displayName) return state.profile.displayName;
    if(state.user && state.user.displayName) return state.user.displayName;
    return '';
  }
  function renderChatMessages(messages){
    if(!messages.length) return '<p class="hint chat-empty">No messages yet &mdash; say hello.</p>';
    return messages.map(function(m){
      return '<div class="chat-msg"><span class="chat-msg-name">'+escapeHtml(m.senderName||'Someone')+'</span>' +
        '<span class="chat-msg-text">'+escapeHtml(m.text)+'</span></div>';
    }).join('');
  }
  function renderChatSection(){
    const canSeeMusicians = !!state.isEditor;
    // Defensive: if access to the current channel goes away mid-session
    // (e.g. someone's editor status changes), don't strand the UI showing a
    // now-inaccessible channel with no tab left to get back to Everyone.
    if(chatChannel !== 'everyone' && !canSeeMusicians) chatChannel = 'everyone';
    const tabs = CHAT_CHANNELS.filter(function(c){ return c.key==='everyone' || canSeeMusicians; });
    const showNameField = !currentDisplayName();
    // Livestream link [2026-09-24] -- rendered as a pinned banner, not an
    // actual chat message, specifically so it "remains at the top" (Jared's
    // words) instead of scrolling away like a normal message would. Reads
    // state.room directly (this function is shared by the host's floating
    // chat panel and the congregant's inline chat -- both already keep
    // state.room current via watchActiveRoom()) rather than taking a room
    // param, so neither call site needed to change.
    const liveRoom = state.room;
    const pinnedStream = (liveRoom && liveRoom.livestreamUrl) ?
      ('<a class="chat-pinned-stream" href="'+escapeAttr(liveRoom.livestreamUrl)+'" target="_blank" rel="noopener noreferrer">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('link')+'</svg>' +
        '<span>Watch the livestream</span>' +
      '</a>') : '';
    return '<div class="session-card chat-card">' +
      '<h3 style="margin-bottom:12px;">Chat</h3>' +
      pinnedStream +
      (tabs.length>1 ? ('<div class="chat-tabs">' + tabs.map(function(c){
        return '<button type="button" class="chat-tab'+(chatChannel===c.key?' active':'')+'" data-chat-tab="'+c.key+'">'+c.label+'</button>';
      }).join('') + '</div>') : '') +
      '<div class="chat-messages" id="chatMessages">' + renderChatMessages(chatMessages) + '</div>' +
      (showNameField ? ('<div class="field" style="margin:10px 0 0;"><input type="text" id="chatGuestName" placeholder="Your name" value="'+escapeAttr(chatGuestName)+'" aria-label="Your name, shown next to your messages"></div>') : '') +
      '<div class="chat-compose">' +
        '<input type="text" id="chatInput" placeholder="'+(chatChannel==='musicians'?'Message the worship team&hellip;':'Message everyone&hellip;')+'" aria-label="Chat message">' +
        '<button type="button" class="btn btn-primary" id="chatSendBtn">SEND</button>' +
      '</div>' +
    '</div>';
  }
  function attachChatHandlers(code){
    document.querySelectorAll('[data-chat-tab]').forEach(function(btn){
      btn.addEventListener('click', function(){ switchChatChannel(code, btn.getAttribute('data-chat-tab')); });
    });
    const nameEl = document.getElementById('chatGuestName');
    if(nameEl){
      nameEl.addEventListener('input', function(e){ chatGuestName = e.target.value; safeSessionSet('cv:chatName', chatGuestName); });
    }
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');
    function doSend(){
      if(!input) return;
      const text = input.value.trim();
      if(!text) return;
      const name = (currentDisplayName() || chatGuestName).trim();
      if(!name){ showToast('Enter your name first so people know who&rsquo;s talking.'); if(nameEl) nameEl.focus(); return; }
      input.value = '';
      sendSessionMessage(code, chatChannel, { text: text, senderName: name, senderUid: state.user ? state.user.uid : null })
        .catch(function(){
          showToast(chatChannel==='musicians'
            ? 'Couldn&rsquo;t send &mdash; only worship team members can post in Musicians.'
            : 'Couldn&rsquo;t send that message. Try again.');
        });
    }
    if(sendBtn) sendBtn.addEventListener('click', doSend);
    if(input) input.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); doSend(); } });
    const listEl = document.getElementById('chatMessages');
    if(listEl) listEl.scrollTop = listEl.scrollHeight;
  }

  let unsubPublicRooms = null;
  function stopPublicRoomsWatch(){ if(unsubPublicRooms){ unsubPublicRooms(); unsubPublicRooms = null; } }
  function startPublicRoomsWatch(){
    stopPublicRoomsWatch();
    unsubPublicRooms = watchPublicRooms(function(rooms){
      state.publicRooms = rooms;
      if(state.view === 'session-join') renderSessionJoin();
    });
  }

  // "My Sessions" -- every room this signed-in person has ever hosted, so a
  // session closed without clicking "End Session" can be found and cleaned
  // up from inside the app rather than needing the Firebase console.
  let unsubHostRooms = null;
  let hostRoomsList = [];
  let mySessionsConfirmCode = null;

  // Email/password login [2026-09-10] -- transient UI-only state for the
  // "Make It Yours" sign-in card's email alternative (see renderLanding()).
  // null = collapsed, 'signin' | 'signup' = which form is showing.
  let landingEmailAuthMode = null;
  let landingEmailAuthBusy = false;
  // Declared here (not down by ensureLandingSocialWatchesStarted() itself,
  // where it reads more naturally) for the same reason as HOST_VIEWS/
  // MORE_VIEWS/FELLOWSHIP_VIEWS above: watchAuth() can call render()
  // synchronously the moment it's registered, reaching renderLanding() ->
  // this flag before a `let` declared further down in the file would have
  // run yet -- caught as a real "Cannot access before initialization" crash
  // on first load during testing.
  let landingSocialWatchesStarted = false;
  function stopHostRoomsWatch(){ if(unsubHostRooms){ unsubHostRooms(); unsubHostRooms = null; } }
  function startHostRoomsWatch(){
    stopHostRoomsWatch();
    if(!state.user) return;
    unsubHostRooms = watchHostRooms(state.user.uid, function(rooms){
      hostRoomsList = rooms;
      if(state.view === 'my-sessions') render();
    });
  }

  // Co-hosting [2026-09-05]: the companion list to hostRoomsList above --
  // every room where this uid has been assigned as a co-host (rather than
  // being the room's own creator). Rendered as its own section on "My
  // Sessions" (see renderMySessions()) so a co-host has somewhere to find
  // their way back into a session without needing the room code re-sent to
  // them.
  let unsubCoHostRooms = null;
  let coHostRoomsList = [];
  function stopCoHostRoomsWatch(){ if(unsubCoHostRooms){ unsubCoHostRooms(); unsubCoHostRooms = null; } }
  function startCoHostRoomsWatch(){
    stopCoHostRoomsWatch();
    if(!state.user) return;
    unsubCoHostRooms = watchCoHostRooms(state.user.uid, function(rooms){
      coHostRoomsList = rooms;
      if(state.view === 'my-sessions') render();
    });
  }
  function toMillis(ts){
    if(!ts) return 0;
    if(typeof ts === 'number') return ts;
    if(typeof ts.toMillis === 'function') return ts.toMillis();
    return 0;
  }
  function timeAgo(ms){
    if(!ms) return 'a while ago';
    const diff = Date.now() - ms;
    if(diff < 60000) return 'just now';
    const mins = Math.floor(diff/60000);
    if(mins < 60) return mins + ' minute' + (mins===1?'':'s') + ' ago';
    const hours = Math.floor(mins/60);
    if(hours < 24) return hours + ' hour' + (hours===1?'':'s') + ' ago';
    const days = Math.floor(hours/24);
    return days + ' day' + (days===1?'':'s') + ' ago';
  }

  /* ============ AUTH / PROFILE ============ */
  let unsubProfile = null;
  let profileLoadFallbackTimer = null;
  function stopProfileWatch(){
    if(unsubProfile){ unsubProfile(); unsubProfile = null; }
    if(profileLoadFallbackTimer){ clearTimeout(profileLoadFallbackTimer); profileLoadFallbackTimer = null; }
  }
  // [Bug found 2026-09-10, fixed v29] see ensureDirectoryEntry()'s own
  // comment in firestore-data-layer.js for the full story -- this just
  // tracks which uid has already been self-healed THIS SESSION, so the
  // merge write fires once per sign-in rather than on every single profile
  // snapshot (theme/scale changes included).
  let directorySelfHealedForUid = null;
  // Notification deep links [2026-09-24, Jared: "notifs are finally
  // working! ...but when I click/tap them, they don't open what the notif
  // is about"] -- see the "?dm="/"?profile=" handling near watchAuth()'s
  // first-user-available block, and the startup routing block further down
  // this file, for the two halves of this. Guards the same "only act once
  // per page load, not every watchAuth callback re-fire" concern
  // directorySelfHealedForUid (just above) already solves for its own case.
  let notifDeepLinkHandled = false;
  // Tracks the church currently being watched so a profile re-render (e.g.
  // favorites changing) doesn't tear down and resubscribe watchChurch every
  // time -- only actually resubscribes when churchId itself changes.
  let unsubChurch = null;
  let watchedChurchId = null;
  function stopChurchWatch(){ if(unsubChurch){ unsubChurch(); unsubChurch = null; } watchedChurchId = null; }
  function syncChurchWatch(profile){
    const churchId = profile ? profile.churchId : null;
    if(churchId === watchedChurchId) return;
    stopChurchWatch();
    watchedChurchId = churchId;
    if(churchId){
      unsubChurch = watchChurch(churchId, function(church){ state.church = church; render(); });
    } else {
      state.church = null;
    }
  }
  // Declared here (not down by renderAdmin() below, where the rest of the
  // Admin Tools code lives) because watchAuth()'s very first callback fires
  // synchronously, right below, and calls stopAdminChurchesWatch() -- a
  // `let` declared later in this same function would still be in its
  // temporal dead zone at that point and throw.
  let unsubAdminChurches = null;
  function stopAdminChurchesWatch(){ if(unsubAdminChurches){ unsubAdminChurches(); unsubAdminChurches = null; } }
  function startAdminChurchesWatch(){
    stopAdminChurchesWatch();
    unsubAdminChurches = watchAllChurches(function(churches){
      state.adminChurches = churches;
      if(state.view === 'admin') render();
    });
  }
  // Same TDZ reasoning as unsubAdminChurches just above -- declared here,
  // not down by renderAdmin()'s "find by name" search code, because
  // watchAuth()'s first callback (right below) calls stopAdminUsersWatch()
  // synchronously.
  let unsubAdminUsers = null;
  function stopAdminUsersWatch(){ if(unsubAdminUsers){ unsubAdminUsers(); unsubAdminUsers = null; } }
  function startAdminUsersWatch(){
    stopAdminUsersWatch();
    unsubAdminUsers = watchAllUsers(function(users){
      state.adminUsers = users;
      if(state.view === 'admin') render();
    });
  }
  // Same TDZ reasoning as unsubAdminChurches/unsubAdminUsers just above --
  // declared here, not down by renderSongRequest()/renderSongRequestQueue()
  // where the rest of this feature's code lives, because watchAuth()'s
  // first callback (right below) calls both stop functions synchronously.
  let unsubMySongRequests = null;
  function stopMySongRequestsWatch(){ if(unsubMySongRequests){ unsubMySongRequests(); unsubMySongRequests = null; } }
  function startMySongRequestsWatch(){
    stopMySongRequestsWatch();
    if(!state.user) return;
    unsubMySongRequests = watchMySongRequests(state.user.uid, function(requests){
      state.mySongRequests = requests;
      if(state.view === 'song-request') render();
    });
  }
  let unsubPendingSongRequests = null;
  function stopPendingSongRequestsWatch(){ if(unsubPendingSongRequests){ unsubPendingSongRequests(); unsubPendingSongRequests = null; } }
  function startPendingSongRequestsWatch(){
    stopPendingSongRequestsWatch();
    unsubPendingSongRequests = watchPendingSongRequests(function(requests){
      state.pendingSongRequests = requests;
      if(state.view === 'song-request-queue') render();
    });
  }
  // Same TDZ reasoning again -- a host's own sermon list, used by the
  // sermon builder (renderSermons/renderSermonEdit) AND the "pick a sermon
  // to present" picker on the host's session screen.
  let unsubMySermons = null;
  function stopMySermonsWatch(){ if(unsubMySermons){ unsubMySermons(); unsubMySermons = null; } }
  function startMySermonsWatch(){
    stopMySermonsWatch();
    if(!state.user) return;
    unsubMySermons = watchMySermons(state.user.uid, function(sermons){
      state.mySermons = sermons;
      if(state.view === 'sermons' || state.view === 'sermon-edit' || state.view === 'session-host') render();
    });
  }
  // Sermons someone else built and shared with this uid [2026-09-04] --
  // started/stopped alongside startMySermonsWatch/stopMySermonsWatch at
  // every one of that function's call sites, so "Yours" and "Shared With
  // You" are always in sync together, and so the host picker
  // (renderSermonPicker()) can offer both.
  let unsubSharedSermons = null;
  function stopSharedSermonsWatch(){ if(unsubSharedSermons){ unsubSharedSermons(); unsubSharedSermons = null; } }
  function startSharedSermonsWatch(){
    stopSharedSermonsWatch();
    if(!state.user) return;
    unsubSharedSermons = watchSermonsSharedWithMe(state.user.uid, function(sermons){
      state.sharedSermons = sermons;
      if(state.view === 'sermons' || state.view === 'sermon-edit' || state.view === 'session-host') render();
    });
  }

  // Media/AVP [2026-09-06] -- exact mirror of startMySermonsWatch()/
  // startSharedSermonsWatch() just above, powering the Media Library screen
  // AND the host's "pick media to present" list (state.myMedia/state.sharedMedia).
  let unsubMyMedia = null;
  function stopMyMediaWatch(){ if(unsubMyMedia){ unsubMyMedia(); unsubMyMedia = null; } }
  function startMyMediaWatch(){
    stopMyMediaWatch();
    if(!state.user) return;
    unsubMyMedia = watchMyMedia(state.user.uid, function(media){
      state.myMedia = media;
      if(state.view === 'media-library' || state.view === 'session-host') render();
    });
  }
  let unsubSharedMedia = null;
  function stopSharedMediaWatch(){ if(unsubSharedMedia){ unsubSharedMedia(); unsubSharedMedia = null; } }
  function startSharedMediaWatch(){
    stopSharedMediaWatch();
    if(!state.user) return;
    unsubSharedMedia = watchMediaSharedWithMe(state.user.uid, function(media){
      state.sharedMedia = media;
      if(state.view === 'media-library' || state.view === 'session-host') render();
    });
  }
  // Media Folders [2026-09-06] -- only ever needed on the Media Library
  // screen itself (the in-session MEDIA picker stays folder-unaware, per
  // interface.md's "Media Folders" section), so this is started/stopped
  // there rather than alongside the sign-in-wide watches above.
  let unsubMyMediaFolders = null;
  function stopMyMediaFoldersWatch(){ if(unsubMyMediaFolders){ unsubMyMediaFolders(); unsubMyMediaFolders = null; } }
  function startMyMediaFoldersWatch(){
    stopMyMediaFoldersWatch();
    if(!state.user) return;
    unsubMyMediaFolders = watchMyMediaFolders(state.user.uid, function(folders){
      state.myMediaFolders = folders;
      if(state.view === 'media-library') render();
    });
  }
  // Directory search [2026-09-04] -- only actually needed while the
  // Sermons screen (and its per-sermon share panel) is open, so it's
  // started/stopped there rather than alongside every other sign-in-wide
  // watch above.
  let unsubDirectory = null;
  function stopDirectoryWatch(){ if(unsubDirectory){ unsubDirectory(); unsubDirectory = null; } }
  // unsubFeedPosts declared here too (not down by stopFeedPostsWatch()/
  // startFeedPostsWatch() themselves, where it reads more naturally) --
  // same reason as HOST_VIEWS/landingSocialWatchesStarted above:
  // ensureLandingSocialWatchesStarted() (called from renderLanding()) can
  // now run SYNCHRONOUSLY on first load via watchAuth() below when someone
  // is already signed in (e.g. after a page reload, not just a fresh
  // sign-in click), reaching startFeedPostsWatch() before a `let` declared
  // down in the Fellowship section of the file would have run yet -- caught
  // as a real "Cannot access before initialization" crash during testing.
  let unsubFeedPosts = null;
  function startDirectoryWatch(){
    stopDirectoryWatch();
    unsubDirectory = watchDirectory(function(list){
      state.directory = list;
      // Fellowship [2026-09-08] added to the re-render allowlist: the feed
      // (author names/photos), a profile page (bio/favorites/photo all live
      // on the directory entry -- see watchDirectory()'s comment), the
      // Messages hub (searching someone to DM / add to a group), and both
      // thread screens (header name/photo) all read state.directory.
      // [2026-09-09, social redesign] shorts/explore/notifications joined
      // the same allowlist -- author names/photos and follower counts on
      // those screens all come from the same directory entries.
      if(['sermons','fellowship','profile-view','profile-edit','messages','dm-thread','group-chat-thread','admin','shorts','explore','notifications','landing'].includes(state.view)) render();
    });
  }

  // Bottom-tab / hamburger view-membership lists [2026-09-10] -- declared
  // here (not down by renderBottomTabs()/inFellowshipMode() themselves,
  // where they read more naturally) because they're `const`, and watchAuth()
  // just below can call render() SYNCHRONOUSLY the moment it's registered
  // (local-data-layer's watchAuth fires its callback immediately with
  // whatever's already in localStorage, before this script has finished
  // running top-to-bottom) -- render()'s call chain reaches renderBottomTabs()
  // /inFellowshipMode() right away, and a `const` declared further down in
  // the file wouldn't be initialized yet at that point (a real "Cannot
  // access before initialization" crash on first load, caught in testing).
  // Function declarations are hoisted so inHostMode()/inFellowshipMode()/
  // renderBottomTabs() themselves are fine staying where they read best;
  // only the arrays they close over need to exist this early.
  const HOST_VIEWS = ['host-hub','session-setup','session-host','session-join','session-projector','my-sessions','sermons','sermon-edit','media-library'];
  const MORE_VIEWS = ['settings','admin','song-request-queue'];
  const FELLOWSHIP_VIEWS = ['fellowship','profile-edit','profile-view','messages','dm-thread','group-chat-thread','shorts','explore','notifications'];

  // Reload-resume whitelist [2026-09-24, Jared: "when I refresh a page
  // somewhere, it goes back to the landing page, I need it to go to where
  // it left off"] -- see persistLastViewForResume() (right by render()
  // itself, further down) for what WRITES cv:lastView on every render(),
  // and the startup routing block / watchSongs() / watchAuth() (all
  // further down too) for the three places that READ it back, split by
  // what each view needs ready before it's safe to reconstruct:
  //   RESUME_NO_DEPENDENCY  -- nothing extra; restored immediately, right
  //                            in the startup routing block, same as the
  //                            existing ?devotional=1 deep link just above it.
  //   RESUME_LIBRARY_DEPENDENT -- needs state.library loaded first (just
  //                            'detail', so renderDetail()'s own "song no
  //                            longer exists" snap-back-to-list guard has
  //                            real data to check against instead of an
  //                            empty array) -- restored from watchSongs().
  //   (everything else in RESUMABLE_VIEWS) -- needs a signed-in state.user
  //                            -- restored from watchAuth()'s first-user-
  //                            available callback, via restoreLastViewIfNeeded()
  //                            further down, the same timing gap ?dm=/
  //                            ?profile= already have to deal with.
  // Deliberately a WHITELIST, not "whatever state.view happened to be":
  // a half-filled Add Hymn / Edit Sermon / song-request form, and the
  // whole session-host/session-view/session-projector family (already
  // its own separate, more specific resume mechanism via
  // cv:activeRoomCode, above) are all left OUT on purpose -- silently
  // reopening a form on an accidental refresh would look like data loss
  // even though nothing was actually lost, and this would only ever step
  // on cv:activeRoomCode's own handling of the live-session case anyway.
  // 'admin' and 'media-library' are ALSO deliberately left out even
  // though they're simple, safe-looking views -- both are gated by a
  // permission flag (state.isAdmin / canHost()) that itself only
  // resolves a moment AFTER watchAuth()'s first callback (checkIsAdmin()/
  // checkIsEditor() are async, and canHost() also reads state.profile,
  // which loads separately via watchProfile()) -- restoring straight into
  // either one here would race that and could bounce right back out (or,
  // worse, briefly show a screen the flag would have hidden). Not worth
  // the extra plumbing for two low-traffic, host/admin-only screens; a
  // refresh there just falls back to Home like it always has.
  const RESUMABLE_VIEWS = {
    'bible': null, 'devotionals': null, 'plans': null, 'list': null,
    'settings': null, 'host-hub': null,
    'detail': 'songId',
    'sermons': null, 'fellowship': null, 'shorts': null, 'explore': null,
    'notifications': null, 'messages': null, 'my-sessions': null, 'profile-edit': null,
    'dm-thread': 'activeDmThreadId', 'group-chat-thread': 'activeGroupChatId',
    'profile-view': 'viewProfileUid'
  };
  const RESUME_NO_DEPENDENCY = ['bible','devotionals','plans','list','settings','host-hub'];
  const RESUME_LIBRARY_DEPENDENT = ['detail'];

  // ---- social watches [2026-09-09] -- app-wide the moment someone signs
  // in, not gated to one view, since the header's bell/avatar need fresh
  // data regardless of what screen is open (see watchAuth() below). ------
  let unsubMyLikes = null;
  function stopMyLikesWatch(){ if(unsubMyLikes){ unsubMyLikes(); unsubMyLikes = null; } }
  let unsubMySaved = null;
  function stopMySavedWatch(){ if(unsubMySaved){ unsubMySaved(); unsubMySaved = null; } }
  let unsubMyFollowing = null;
  function stopMyFollowingWatch(){ if(unsubMyFollowing){ unsubMyFollowing(); unsubMyFollowing = null; } }
  let unsubNotifications = null;
  function stopNotificationsWatch(){ if(unsubNotifications){ unsubNotifications(); unsubNotifications = null; } }
  // Foreground push [2026-09-10] -- watchForegroundPush()'s onMessage callback
  // only ever fires while this tab is open and focused; when the app is
  // closed/backgrounded, the OS notification comes from src/sw.js's
  // onBackgroundMessage instead. Firebase's foreground payload can carry the
  // title/body either top-level under `notification` (typical for a message
  // sent with a `notification` block, which is what sendPushOnNotification
  // sends) or, for a data-only message, nested under `data` -- so check both
  // shapes rather than assuming one.
  let unsubForegroundPush = null;
  function stopForegroundPushWatch(){ if(unsubForegroundPush){ unsubForegroundPush(); unsubForegroundPush = null; } }
  function stopSocialWatches(){
    stopMyLikesWatch(); stopMySavedWatch(); stopMyFollowingWatch(); stopNotificationsWatch(); stopForegroundPushWatch();
    // [v36] DM/group-chat inbox watches folded in here too -- see
    // startMyDmThreadsWatch()/startMyGroupChatsWatch()'s own comments
    // (further down this file) for why they need to be app-wide now
    // instead of only running while a Messages view is open.
    stopMyDmThreadsWatch(); stopMyGroupChatsWatch();
    closeChatDock();
    state.myLikedKeys = new Set(); state.mySavedKeys = new Set(); state.myFollowing = new Set(); state.notifications = [];
    state.myDmThreads = []; state.myGroupChats = [];
    state.notifDropdownOpen = false; state.msgDropdownOpen = false;
  }
  function startSocialWatches(uid){
    stopSocialWatches();
    unsubMyLikes = watchMyLikes(uid, function(keys){ state.myLikedKeys = keys; render(); });
    unsubMySaved = watchMySaved(uid, function(list){ state.mySavedKeys = new Set(list.map(function(s){ return s.kind+':'+s.itemId; })); render(); });
    unsubMyFollowing = watchMyFollowing(uid, function(set){ state.myFollowing = set; render(); });
    unsubNotifications = watchNotifications(uid, function(list){ state.notifications = list; render(); });
    unsubForegroundPush = watchForegroundPush(function(payload){
      const body = (payload && payload.notification && (payload.notification.body || payload.notification.title))
        || (payload && payload.data && (payload.data.body || payload.data.title))
        || 'New notification';
      showToast(body);
    });
    startMyDmThreadsWatch();
    startMyGroupChatsWatch();
  }

  // Deferred via queueMicrotask [2026-09-10, found in testing] -- demo
  // mode's watchAuth() (local-data-layer.js) fires its callback SYNCHRONOUSLY
  // the instant it's registered (immediately, with whatever's already
  // signed in), which used to be harmless since nothing reachable from that
  // first callback needed anything declared further down this file. The
  // homepage/nav redesign changed that -- render() now eagerly renders the
  // Fellowship preview (post cards, etc.) and starts the social watches
  // right on the landing screen for anyone already signed in (e.g. on
  // reload, not just a fresh sign-in click), reaching `const`/`let`
  // bindings declared later in the file before they'd been initialized yet
  // (several real "Cannot access before initialization" crashes on
  // reload, caught in testing -- HOST_VIEWS/FELLOWSHIP_VIEWS,
  // landingSocialWatchesStarted, unsubFeedPosts, and likely more along the
  // same call chain). Rather than keep hunting each one individually,
  // queueMicrotask defers the FIRST callback firing until this whole
  // top-to-bottom synchronous module evaluation has finished -- by which
  // point everything below is safely initialized -- while every LATER
  // firing (a real sign-in/out, via onBroadcast) is unaffected either way.
  queueMicrotask(function(){
  watchAuth(function(user){
    state.user = user;
    state.isEditor = false;
    state.isAdmin = false;
    state.profileLoaded = false;
    stopProfileWatch();
    stopChurchWatch();
    stopAdminChurchesWatch();
    stopAdminUsersWatch();
    stopMySongRequestsWatch();
    stopPendingSongRequestsWatch();
    stopMySermonsWatch();
    stopSharedSermonsWatch();
    stopMyMediaWatch();
    stopSharedMediaWatch();
    stopMyMediaFoldersWatch();
    stopDirectoryWatch();
    stopSocialWatches();
    if(user){
      unsubProfile = watchProfile(user.uid, function(profile, meta){
        // TEMP DIAGNOSTIC [2026-09-23] -- Jared: still seeing "Almost There"
        // after a Clear-site-data + relogin even with the fromCache guard
        // below in place. Logging every snapshot this callback actually
        // receives (and which branch it takes) so the next repro gives us
        // real data instead of another guess -- open DevTools -> Console,
        // filter for "iworship-debug", reproduce (Clear site data, close
        // tab, reopen, sign in), and send a screenshot of what prints.
        // Safe to remove once this is root-caused for good.
        console.debug('[iworship-debug] watchProfile snapshot', {
          at: new Date().toISOString(),
          uid: user.uid,
          fromCache: meta && meta.fromCache,
          exists: meta && meta.exists,
          displayName: profile && profile.displayName,
          profileLoadedAlready: state.profileLoaded
        });
        // [Bug found 2026-09-22] See watchProfile()'s own comment in
        // firestore-data-layer.js -- a snapshot that's BOTH "doesn't exist"
        // AND still unconfirmed by the server (fromCache) is ambiguous: it
        // might be a genuinely new user, or it might be an existing one
        // whose local cache just hasn't caught up yet (e.g. right after a
        // relogin, or right after clearing site data, like Jared hit while
        // troubleshooting the notifications bug). Don't let THAT snapshot
        // set profileLoaded/needsProfileSetup -- wait for the next one,
        // which Firestore fires again the moment the real server response
        // lands, either confirming the profile (exists) or confirming it
        // genuinely doesn't (exists:false, fromCache:false). The fallback
        // timer below is just a safety net so a truly offline brand-new
        // user (no server round trip ever completing) isn't stuck on a
        // permanently-loading landing page instead of eventually seeing
        // "Almost There".
        if(meta && meta.fromCache && !meta.exists && !state.profileLoaded){
          console.debug('[iworship-debug] ambiguous cache-miss snapshot -- firing a direct server fetch instead of just waiting on this listener (15s ultimate fallback too)');
          // [Bug found 2026-09-23] Jared's own repro (same steps, same
          // account) sometimes resolved fine and sometimes still showed
          // "Almost There" -- that inconsistency is what pointed at the
          // LIVE LISTENER's cache-to-server transition being flaky here,
          // not the rules or the account. Rather than only ever wait on
          // that same listener to sort itself out, fire an independent,
          // one-shot fetchProfileFromServer() the moment this ambiguous
          // state is hit -- a plain request with its own retry/backoff,
          // not a persistent stream, so it isn't affected by whatever's
          // making the listener itself lag. Whichever settles first (this
          // direct fetch, or a later onSnapshot event) wins, via the
          // !state.profileLoaded guard both paths check.
          if(!profileLoadFallbackTimer){
            fetchProfileFromServer(user.uid).then(function(serverProfile){
              // Guard against a slow fetch resolving after the person has
              // already signed out or switched accounts -- state.user would
              // no longer be THIS uid, and applying a stale result then
              // would corrupt whichever account is current instead.
              if(state.profileLoaded || !state.user || state.user.uid !== user.uid) return;
              console.debug('[iworship-debug] direct server fetch resolved first with', {
                uid: user.uid,
                serverProfile: serverProfile
              });
              if(profileLoadFallbackTimer){ clearTimeout(profileLoadFallbackTimer); profileLoadFallbackTimer = null; }
              state.profile = serverProfile;
              state.profileLoaded = true;
              syncChurchWatch(serverProfile);
              render();
            }).catch(function(e){
              console.error('[iworship-debug] direct server fetch FAILED', e && e.code, e && e.message, e);
              // Leave it to the listener/timer -- a failed one-shot isn't
              // reason enough on its own to declare "no profile".
            });
            profileLoadFallbackTimer = setTimeout(function(){
              profileLoadFallbackTimer = null;
              if(state.profileLoaded) return; // one of the two real paths won the race after all
              console.debug('[iworship-debug] 15s ultimate fallback FIRED -- neither the listener nor the direct fetch confirmed in time, forcing profileLoaded with', profile);
              state.profile = profile;
              state.profileLoaded = true;
              render();
            }, 15000);
          }
          return;
        }
        if(profileLoadFallbackTimer){ clearTimeout(profileLoadFallbackTimer); profileLoadFallbackTimer = null; }
        console.debug('[iworship-debug] trusting this snapshot -- setting profileLoaded=true', {
          uid: user.uid,
          alreadyLoaded: state.profileLoaded,
          fromCache: meta && meta.fromCache,
          exists: meta && meta.exists,
          displayName: profile && profile.displayName
        });
        state.profile = profile;
        state.profileLoaded = true;
        syncChurchWatch(profile);
        if(directorySelfHealedForUid !== user.uid){
          directorySelfHealedForUid = user.uid;
          ensureDirectoryEntry(user.uid, profile).catch(function(){});
        }
        render();
      });
      startSocialWatches(user.uid);
      // Resuming straight into a hosted session on page load (see the
      // resume-on-load block near the top of this file) happens BEFORE
      // watchAuth's first callback ever fires, so state.user is still null
      // at that point and startMySermonsWatch()'s own guard would no-op --
      // catch it here instead, once a user is actually available.
      if((state.isHost || state.isCoHost) && state.activeRoomCode){
        startMySermonsWatch(); startSharedSermonsWatch();
        startMyMediaWatch(); startSharedMediaWatch();
        if(state.isHost) startDirectoryWatch(); // only the owner's session-host resume needs the "Manage Hosts" account search
      }
      // Notification deep links needing a signed-in user ("?dm=<uid>" from
      // a message push, "?profile=<uid>" from a like/comment/repost/follow
      // push -- see src/sw.js's notificationclick handler and the startup
      // routing block further down this file, which sets these two state
      // fields). Same timing gap as the session-resume block just above:
      // the startup routing block runs before watchAuth's first callback
      // ever fires, so state.user is still null when it first tries to read
      // the URL -- this is the "once a user is actually available" catch
      // for these two, guarded so it only ever runs once per page load.
      // state.pendingResumeView [2026-09-24] rides along in this same
      // once-per-load block -- it's the auth-dependent half of the
      // reload-resume feature (RESUMABLE_VIEWS, up by HOST_VIEWS), hitting
      // this exact same "state.user isn't ready yet" gap.
      if(!notifDeepLinkHandled){
        notifDeepLinkHandled = true;
        if(state.pendingDmUid){ const u = state.pendingDmUid; state.pendingDmUid = null; openDmThread(u); }
        else if(state.pendingProfileUid){ const u = state.pendingProfileUid; state.pendingProfileUid = null; openProfileView(u); }
        else if(state.pendingResumeView){ const t = state.pendingResumeView; state.pendingResumeView = null; restoreLastViewIfNeeded(t); }
      }
      checkIsEditor(user.uid).then(function(isEditor){
        state.isEditor = isEditor;
        render();
      }).catch(function(){ /* not on the list, or offline -- Musicians tab just stays hidden */ });
      checkIsAdmin(user.uid).then(function(isAdmin){
        state.isAdmin = isAdmin;
        render();
      }).catch(function(){ /* not an admin, or offline -- Admin Tools just stays hidden */ });
    } else {
      state.profile = null;
      state.church = null;
      render();
    }
  });
  }); // end deferred watchAuth registration (queueMicrotask above)

  /* ============ SONG LIBRARY ============ */
  watchSongs(function(songs){
    state.library = songs;
    // Reload-resume, library-dependent bucket [2026-09-24] -- just
    // 'detail' (see RESUMABLE_VIEWS' own comment, up by HOST_VIEWS): it
    // needs a real, loaded state.library before it's safe to decide
    // whether the song still exists, so it's stashed in
    // state.pendingResumeView by the startup routing block (further down)
    // and applied here instead, once the library snapshot this callback
    // just received is the real thing -- not the (possibly still empty)
    // array from an earlier, still-loading snapshot. Cleared either way so
    // this only ever fires once per page load, same as the auth-dependent
    // bucket's own notifDeepLinkHandled guard.
    if(state.pendingResumeView && RESUME_LIBRARY_DEPENDENT.includes(state.pendingResumeView.view)){
      const target = state.pendingResumeView;
      state.pendingResumeView = null;
      if(target.id && songs.some(function(s){ return s.id === target.id; })){
        state.view = target.view;
        state.songId = target.id;
      }
      // else: that song no longer exists -- leave state.view as whatever
      // the routing block already defaulted it to ('landing'), same as
      // renderDetail()'s own snap-back guard would do for a live navigation.
    }
    render();
  });



  /* ============ THEME ============ */
  // Preference stored is 'light' | 'dark' | 'system' -- 'system' (the
  // default, nothing saved yet) means "no explicit choice, follow the
  // device." [2026-09-10] Moved out of a standalone top-bar icon button
  // and into Settings -> Preferences (Jared: "we can move the light/dark
  // mode in the settings") -- see renderSettings() below for the UI this
  // now lives in; currentTheme()/setThemePreference() are the shared logic
  // both that screen and initTheme() below use.
  function themePreference(){ return safeGet('cv:theme', 'system'); }
  function currentTheme(){
    const pref = themePreference();
    if(pref === 'light' || pref === 'dark') return pref;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setThemePreference(pref){
    safeSet('cv:theme', pref);
    if(pref === 'light' || pref === 'dark') document.documentElement.setAttribute('data-theme', pref);
    else document.documentElement.removeAttribute('data-theme');
    if(state.view === 'settings') render();
  }
  (function initTheme(){
    const pref = themePreference();
    if(pref === 'light' || pref === 'dark') document.documentElement.setAttribute('data-theme', pref);
  })();

  document.getElementById('brandHome').addEventListener('click', function(){
    state.view='landing'; render(); window.scrollTo(0,0);
  });

  // Real back/forward, wiring [2026-09-24] -- see syncHistoryForView()/
  // applyViewSnapshot()'s own comments (up by render()) for the mechanism.
  // navBackBtn/navForwardBtn (index.html) are the on-screen stand-in for a
  // PWA's missing browser chrome -- they just call the same
  // history.back()/forward() the browser's own buttons (or a swipe
  // gesture) would, which is exactly what makes them "just work" the same
  // way regardless of which one the person actually used.
  window.addEventListener('popstate', function(event){
    historyNavInProgress = true;
    const s = event.state;
    const applied = applyViewSnapshot(s);
    lastPushedHistoryKey = (applied && s) ? historyKeyFor(s.view, s.id) : null;
    // !applied (s is null/unrecognized, e.g. the very first, pre-navigation
    // history entry) -- deliberately does nothing further here rather than
    // forcing state.view anywhere: this is genuinely "nothing more to go
    // back to inside the app," same as a real browser's Back button
    // quietly having nothing left to do at the start of a tab's history.
    historyNavInProgress = false;
  });
  const navBackBtn = document.getElementById('navBackBtn');
  if(navBackBtn) navBackBtn.addEventListener('click', function(){ history.back(); });
  const navForwardBtn = document.getElementById('navForwardBtn');
  if(navForwardBtn) navForwardBtn.addEventListener('click', function(){ history.forward(); });

  /* ============ BOTTOM TAB BAR [2026-09-10] ============
     Jared: "I need you to come up with a smoother and better looking way
     to switch between hymnal mode, host mode, and fellowship mode." A
     persistent 4-tab bar (Hymnal / Host / Fellowship / More) replaces the
     old hamburger-only "switch interface" flow -- MORE opens the exact
     same drawer the hamburger button used to (see renderHamburgerDrawerBody
     below), just triggered from here instead of a top-bar icon, which is
     what let the top bar itself shrink down to brand+avatar+bell. */
  // HOST_VIEWS/MORE_VIEWS declared earlier, up by the social-watches section
  // -- see the comment there for why (a `const`-before-initialization crash
  // on first load, caught in testing).
  function inHostMode(){ return HOST_VIEWS.includes(state.view); }
  function renderBottomTabs(){
    const bar = document.getElementById('bottomTabs');
    if(!bar) return;
    const active = inFellowshipMode() ? 'fellowship' : (inHostMode() ? 'host' : (MORE_VIEWS.includes(state.view) ? 'more' : (state.view === 'list' || state.view === 'detail' || state.view === 'edit' || state.view === 'add' || state.view === 'bulk-add' ? 'hymnal' : null)));
    [['tabHymnalBtn','hymnal'],['tabHostBtn','host'],['tabFellowshipBtn','fellowship'],['tabMoreBtn','more']].forEach(function(pair){
      const btn = document.getElementById(pair[0]);
      if(btn) btn.classList.toggle('bottom-tab-active', active === pair[1]);
    });
    // Desktop sidebar's mirrored primary items [2026-09-10] -- same
    // `active` value, just three targets instead of four (there's no
    // sidebar equivalent of the mobile MORE tab -- its contents are always
    // visible in the sidebar already, see renderSidebarExtra()).
    [['sideHymnalBtn','hymnal'],['sideHostBtn','host'],['sideFellowshipBtn','fellowship']].forEach(function(pair){
      const btn = document.getElementById(pair[0]);
      if(btn) btn.classList.toggle('sidebar-item-active', active === pair[1]);
    });
  }
  // Named (not anonymous) so the desktop sidebar's mirrored buttons below
  // can share the exact same handlers instead of duplicating this logic
  // [2026-09-10, desktop nav redesign] -- see styles.css's "Desktop
  // navigation redesign" section for why there are now two sets of nav
  // buttons in the DOM (mobile bottom tabs + desktop sidebar) sharing one
  // set of click behaviors.
  function goHymnalTab(){ state.view='list'; render(); window.scrollTo(0,0); }
  function goHostTab(){
    if(!state.user){ showToast('Sign in first so a session can be attributed to you as the host.'); state.view='landing'; render(); window.scrollTo(0,0); return; }
    state.view='host-hub'; render(); window.scrollTo(0,0);
  }
  function goFellowshipTab(){
    if(!state.user){ showToast('Sign in to open Fellowship.'); state.view='landing'; render(); window.scrollTo(0,0); return; }
    openFellowshipFeed();
  }
  document.getElementById('tabHymnalBtn').addEventListener('click', goHymnalTab);
  document.getElementById('tabHostBtn').addEventListener('click', goHostTab);
  document.getElementById('tabFellowshipBtn').addEventListener('click', goFellowshipTab);
  document.getElementById('tabMoreBtn').addEventListener('click', openHamburger);
  document.getElementById('sideHymnalBtn').addEventListener('click', goHymnalTab);
  document.getElementById('sideHostBtn').addEventListener('click', goHostTab);
  document.getElementById('sideFellowshipBtn').addEventListener('click', goFellowshipTab);

  /* ============ HEADER CHROME + HAMBURGER MENU [2026-09-09] ============
     Jared: "add a burger button where the other stuff can also be
     transferred to like account settings, log out, switch interface, and
     other features you can think of. Also... the iworship app has the
     user's profile pic at the top, like next to the logo, then when it's
     clicked, the user can view their own profile." These elements live in
     index.html OUTSIDE #main (see the topbar/hamburger-overlay markup
     there) so they persist across every render() rather than being
     rebuilt from scratch on every view change -- renderHeaderChrome()
     below just updates their live content (avatar image, unread badge,
     drawer body) each time render() runs; the click handlers are wired
     ONCE here, not per-render. */

  // Which state.view values count as "in the Fellowship interface" --
  // drives the hamburger's "Switch to Worship/Fellowship" label+direction.
  // Everything not in this set is "the Worship interface" by definition.
  // (FELLOWSHIP_VIEWS itself is declared earlier, up by the social-watches
  // section -- see the comment there.)
  function inFellowshipMode(){ return FELLOWSHIP_VIEWS.includes(state.view); }

  // [v36] window.innerWidth check mirrors styles.css's own desktop-nav
  // breakpoint (see "Desktop navigation redesign" in styles.css) -- there's
  // no existing JS-side breakpoint helper anywhere else in this file since
  // the sidebar/bottom-tab split is done purely in CSS, but the Messages
  // icon's click BEHAVIOR (dropdown vs. straight navigation) has to branch
  // in JS, so this is the one place that needs to know the breakpoint.
  function isDesktopWidth(){ return window.innerWidth >= 900; }

  // [v36, Messages unread badge] A thread/group counts as unread when its
  // last-activity timestamp is newer than THIS uid's own readAt entry --
  // see ensureDmThread()/createGroupChat()/sendDmMessage()/
  // sendGroupChatMessage()/markDmThreadRead()/markGroupChatRead() in both
  // data layers for how readAt gets stamped.
  function unreadMessagesCount(){
    if(!state.user) return 0;
    const uid = state.user.uid;
    let n = 0;
    (state.myDmThreads||[]).forEach(function(t){
      const mine = (t.readAt && t.readAt[uid]) ? toMillis(t.readAt[uid]) : 0;
      if(toMillis(t.lastMessageAt) > mine) n++;
    });
    (state.myGroupChats||[]).forEach(function(g){
      const mine = (g.readAt && g.readAt[uid]) ? toMillis(g.readAt[uid]) : 0;
      if(toMillis(g.updatedAt) > mine) n++;
    });
    return n;
  }

  function renderHeaderChrome(){
    const avatarBtn = document.getElementById('headerAvatarBtn');
    const avatarSlot = document.getElementById('headerAvatarSlot');
    const notifBtn = document.getElementById('notifBtn');
    const notifBadge = document.getElementById('notifBadge');
    const msgTopBtn = document.getElementById('msgTopBtn');
    const msgBadge = document.getElementById('msgBadge');
    if(state.user){
      avatarBtn.hidden = false;
      if(avatarSlot) avatarSlot.innerHTML = personAvatar(state.user.uid, 34);
      notifBtn.hidden = false;
      const unread = state.notifications.filter(function(n){ return !n.read; }).length;
      notifBadge.hidden = unread === 0;
      if(unread) notifBadge.textContent = unread > 99 ? '99+' : String(unread);
      if(msgTopBtn) msgTopBtn.hidden = false;
      const unreadMsgs = unreadMessagesCount();
      if(msgBadge){
        msgBadge.hidden = unreadMsgs === 0;
        if(unreadMsgs) msgBadge.textContent = unreadMsgs > 99 ? '99+' : String(unreadMsgs);
      }
    } else {
      avatarBtn.hidden = true;
      notifBtn.hidden = true;
      notifBadge.hidden = true;
      if(msgTopBtn) msgTopBtn.hidden = true;
      if(msgBadge) msgBadge.hidden = true;
      state.notifDropdownOpen = false;
      state.msgDropdownOpen = false;
    }
    renderNotifDropdown();
    renderMsgDropdown();
    // Keep the drawer's own content fresh (unread count, current-mode
    // label) while it's open -- e.g. a notification arriving while the
    // menu is already open shouldn't show a stale count until it's closed
    // and reopened.
    const overlay = document.getElementById('hamburgerOverlay');
    if(overlay && !overlay.hidden) renderHamburgerDrawerBody();
    renderBottomTabs();
    renderSidebarExtra();
    renderChatDock();
    renderUploadTray();
  }

  // ---- Notifications pop-down [v36] --------------------------------------
  // Jared: "notifs at the left and notifs at the top? a bit redundant, just
  // keep the one at the top, and instead of taking you to the notifs page
  // right away, make it a pop down from there first and if the user wants
  // to view all notifs, give them an option to do that." The bell's click
  // handler (bound once, further down this file) now toggles
  // state.notifDropdownOpen instead of calling openNotifications() directly;
  // this renders the dropdown's contents into the always-present
  // #notifDropdown slot in index.html (a sibling of the bell button, so it
  // survives every #main rewrite). Reuses notificationText()/postAge() --
  // same row shape as the full renderNotifications() page below, just
  // capped to the 8 most recent and without the mark-all-read side effect
  // (that still only happens via "View All", matching today's behavior).
  function renderNotifDropdown(){
    const el = document.getElementById('notifDropdown');
    if(!el) return;
    if(!state.user || !state.notifDropdownOpen){ el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const recent = state.notifications.slice(0, 8);
    el.innerHTML =
      '<div class="topbar-dropdown-header">Notifications</div>' +
      '<div class="topbar-dropdown-list">' +
      (recent.length ? recent.map(function(n){
        return '<button type="button" class="topbar-dropdown-row'+(n.read?'':' topbar-dropdown-row-unread')+'" data-notif-id="'+escapeAttr(n.id)+'" data-notif-actor="'+escapeAttr(n.actorUid)+'" data-notif-type="'+escapeAttr(n.type||'')+'" data-notif-room="'+escapeAttr(n.roomCode||'')+'">' +
          personAvatar(n.actorUid, 32) +
          '<span class="topbar-dropdown-row-text"><span>'+notificationText(n)+'</span><span class="hint">'+postAge(n.createdAt)+'</span></span>' +
        '</button>';
      }).join('') : '<div class="topbar-dropdown-empty">No notifications yet.</div>') +
      '</div>' +
      '<button type="button" class="topbar-dropdown-viewall" id="notifDropdownViewAll">VIEW ALL NOTIFICATIONS</button>';

    el.querySelectorAll('[data-notif-actor]').forEach(function(row){
      row.addEventListener('click', function(){
        const id = row.getAttribute('data-notif-id');
        const actorUid = row.getAttribute('data-notif-actor');
        const type = row.getAttribute('data-notif-type');
        state.notifDropdownOpen = false;
        // Unread badge fix [2026-09-24] -- Jared: "even though I've...
        // viewed the notif, they still indicate the number." Opening the
        // dropdown deliberately never mark-all-reads (see this function's
        // own comment above), and until now clicking an individual row
        // didn't mark THAT one read either -- nothing anywhere marked a
        // single notification read on click, only the full Notifications
        // screen's delayed mark-ALL-read (openNotifications()) ever did.
        // Marking it the instant it's actually opened/acted on is more
        // reliable than waiting on that timer, and now also covers this
        // dropdown, which the timer never touches.
        if(id && state.user) markNotificationRead(state.user.uid, id).catch(function(){});
        // Mirrors renderNotifications()'s own row-click branching below --
        // 'session_live' [2026-09-17] joins the room instead of opening the
        // host's profile, same reasoning as 'message' opening the thread.
        if(type === 'message'){ openDmThread(actorUid); }
        else if(type === 'session_live'){
          const code = row.getAttribute('data-notif-room');
          if(code) goToJoinScreenWithCode(code);
        }
        else { openProfileView(actorUid); }
      });
    });
    const viewAll = document.getElementById('notifDropdownViewAll');
    if(viewAll) viewAll.addEventListener('click', function(){ state.notifDropdownOpen = false; openNotifications(); });
  }

  // ---- Messages pop-down / floating dock [v36] ---------------------------
  // Jared: "I think it's good if it has its own icon just like in facebook,
  // then the messages pop at the bottom (in PC version, okay), but in
  // mobile, you can make it like messenger." On desktop the new topbar
  // icon toggles this dropdown of recent conversations (DMs + group chats
  // merged, most-recent first); picking one opens the floating chat dock
  // (openChatDock() below) instead of navigating away. On mobile the icon
  // skips the dropdown entirely and goes straight to the full Messages hub
  // (see the click handler further down this file).
  function renderMsgDropdown(){
    const el = document.getElementById('msgDropdown');
    if(!el) return;
    if(!state.user || !state.msgDropdownOpen){ el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const uid = state.user.uid;
    const dmRows = (state.myDmThreads||[]).map(function(t){
      const other = (t.participantUids||[]).find(function(u){ return u !== uid; });
      if(!other || isBlockedByMe(other)) return null;
      const d = directoryEntry(other);
      const mine = (t.readAt && t.readAt[uid]) ? toMillis(t.readAt[uid]) : 0;
      return {
        kind: 'dm', id: other, sortAt: toMillis(t.lastMessageAt), unread: toMillis(t.lastMessageAt) > mine,
        name: d ? (d.displayName || '(no name set)') : '(unknown)', preview: t.lastMessageText || '',
        avatarHtml: personAvatar(other, 32)
      };
    }).filter(Boolean);
    const groupRows = (state.myGroupChats||[]).map(function(g){
      const mine = (g.readAt && g.readAt[uid]) ? toMillis(g.readAt[uid]) : 0;
      return {
        kind: 'group', id: g.id, sortAt: toMillis(g.updatedAt), unread: toMillis(g.updatedAt) > mine,
        name: g.name || 'Untitled Group', preview: g.lastMessageText || '',
        avatarHtml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px;flex:none;color:var(--ink-soft);">'+icon('mic')+'</svg>'
      };
    });
    const rows = dmRows.concat(groupRows).sort(function(a,b){ return b.sortAt - a.sortAt; }).slice(0, 8);
    el.innerHTML =
      '<div class="topbar-dropdown-header">Messages</div>' +
      '<div class="topbar-dropdown-list">' +
      (rows.length ? rows.map(function(r){
        return '<button type="button" class="topbar-dropdown-row'+(r.unread?' topbar-dropdown-row-unread':'')+'" data-dock-kind="'+r.kind+'" data-dock-id="'+escapeAttr(r.id)+'">' +
          r.avatarHtml +
          '<span class="topbar-dropdown-row-text"><span>'+escapeHtml(r.name)+'</span>'+(r.preview?('<span class="hint">'+escapeHtml(r.preview.slice(0,50))+'</span>'):'')+'</span>' +
        '</button>';
      }).join('') : '<div class="topbar-dropdown-empty">No conversations yet.</div>') +
      '</div>' +
      '<button type="button" class="topbar-dropdown-viewall" id="msgDropdownViewAll">SEE ALL IN MESSAGES</button>';

    el.querySelectorAll('[data-dock-kind]').forEach(function(btn){
      btn.addEventListener('click', function(){
        state.msgDropdownOpen = false;
        openChatDock(btn.getAttribute('data-dock-kind'), btn.getAttribute('data-dock-id'));
      });
    });
    const viewAll = document.getElementById('msgDropdownViewAll');
    if(viewAll) viewAll.addEventListener('click', function(){ state.msgDropdownOpen = false; openMessages(); });
  }

  // ---- Floating chat dock [v36, desktop only, one at a time] -------------
  // Jared confirmed (via clarifying question): one popup at a time --
  // opening a new one replaces whatever's currently docked, same as
  // clicking a different conversation in the dropdown above. Modeled on
  // the existing .chat-fab/.chat-floating-panel host-chat widget's fixed
  // bottom-right position, but its own distinct markup/class names (see
  // styles.css's ".chat-dock" rules) since the two can be on screen at
  // once (e.g. a host popped a Messages conversation while also running
  // the in-session live chat widget).
  let unsubDockMessages = null;
  function stopDockMessagesWatch(){ if(unsubDockMessages){ unsubDockMessages(); unsubDockMessages = null; } }
  function openChatDock(kind, id){
    if(!state.user || !id) return;
    stopDockMessagesWatch();
    // minimized [2026-09-16]: always starts expanded on a fresh open --
    // see renderChatDock()'s minimize button for why this exists at all.
    state.dock = { kind: kind, id: id, messages: [], composerText: '', minimized: false };
    // Patch #chatDockBody in place on every incoming message rather than
    // calling the app-wide render() -- Jared: "when I type in messages and
    // click enter and try to type again, I can't because I have to click
    // on the chat box again" [2026-09-14]. Sending a message doesn't itself
    // call render(), but this watcher fires again the instant that very
    // message round-trips back through Firestore/the local layer (it fires
    // for your OWN writes too, not just the other person's), and a full
    // render() tears down and rebuilds #chatDockInput from scratch via
    // renderChatDock() -- a brand-new DOM node that was never focused, so
    // the cursor silently vanishes and typing again needs another click.
    // Same root cause, same fix shape as watchChat()'s existing
    // "patch the message list in place" comment above for the in-session
    // chat -- this dock just never got the same treatment when it shipped.
    if(kind === 'dm'){
      const threadId = dmThreadId(state.user.uid, id);
      markDmThreadRead(threadId, state.user.uid).catch(function(){});
      unsubDockMessages = watchDmMessages(threadId, function(messages){
        if(!(state.dock && state.dock.kind === 'dm' && state.dock.id === id)) return;
        state.dock.messages = messages;
        const body = document.getElementById('chatDockBody');
        if(body){ body.innerHTML = renderDockMessagesHtml(messages, state.user.uid); body.scrollTop = body.scrollHeight; }
        else render();
      });
    } else {
      markGroupChatRead(id, state.user.uid).catch(function(){});
      unsubDockMessages = watchGroupChatMessages(id, function(messages){
        if(!(state.dock && state.dock.kind === 'group' && state.dock.id === id)) return;
        state.dock.messages = messages;
        const body = document.getElementById('chatDockBody');
        if(body){ body.innerHTML = renderDockMessagesHtml(messages, state.user.uid); body.scrollTop = body.scrollHeight; }
        else render();
      });
    }
    render();
  }
  function closeChatDock(){
    stopDockMessagesWatch();
    state.dock = null;
  }
  // Hidden only on the standalone stage/projector output -- that's the
  // screen actually shown to the congregation (or mirrored to a second
  // monitor), so nothing from the host's own private messages belongs on
  // it. [Fixed 2026-09-15] This used to ALSO suppress session-host and
  // session-view, i.e. the host's and a participant's own control/viewing
  // screens -- Jared: "the messages don't pop up in all pages, they should
  // be fully accessible anywhere." session-view has no competing floating
  // widget at all, so that suppression was just a plain bug; session-host
  // DOES have one (the in-session .chat-fab/.chat-floating-panel, same
  // bottom-right corner) -- renderCurrentView() lifts this dock above it
  // there instead (see body.hosting-page in styles.css's ".chat-dock" rule)
  // rather than hiding personal messages away entirely while hosting.
  function chatDockSuppressedHere(){
    return state.view === 'session-projector' || document.body.classList.contains('stage-page');
  }
  // Shared between renderChatDock()'s own initial render and
  // openChatDock()'s message watcher below, which patches #chatDockBody
  // in place on every incoming message rather than re-running through
  // renderChatDock() -- see that watcher's own comment for why.
  function renderDockMessagesHtml(messages, uid){
    return messages.length ? messages.map(function(m){
      const mine = m.senderUid === uid;
      return '<div class="msg-row '+(mine?'msg-row-mine':'msg-row-theirs')+'">' +
        '<div class="msg-bubble '+(mine?'msg-bubble-mine':'msg-bubble-theirs')+'">'+escapeHtml(m.text||'')+'</div>' +
      '</div>';
    }).join('') : '<p class="hint" style="text-align:center;">Say hello&hellip;</p>';
  }
  function renderChatDock(){
    const el = document.getElementById('chatDock');
    if(!el) return;
    if(!state.dock || !isDesktopWidth() || chatDockSuppressedHere()){ el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const uid = state.user.uid;
    let title = 'Conversation';
    if(state.dock.kind === 'dm'){
      const d = directoryEntry(state.dock.id);
      title = d ? (d.displayName || '(no name set)') : '(unknown)';
    } else {
      const g = (state.myGroupChats||[]).find(function(x){ return x.id === state.dock.id; });
      title = g ? (g.name || 'Group Chat') : 'Group Chat';
    }
    // Minimize [2026-09-16] -- Jared: "put it on the lower right corner
    // where it can be minimized anytime cause it's blocking a lot of things
    // on the interface." Collapses to just the header bar (title still
    // visible, conversation and its message watcher both stay live in the
    // background -- see openChatDock()'s watcher, untouched by this) rather
    // than fully closing, which would lose your scroll position and require
    // reopening from the Messages dropdown to pick it back up. `minimized`
    // el class drives the collapse purely in CSS (see styles.css's
    // ".chat-dock.minimized" rule) so this can't drift out of sync with the
    // markup below.
    const minimized = !!state.dock.minimized;
    el.classList.toggle('minimized', minimized);
    el.innerHTML =
      '<div class="chat-dock-header">' +
        '<span>'+escapeHtml(title)+'</span>' +
        '<span class="chat-dock-header-actions">' +
          '<button type="button" class="chat-dock-minimize" id="chatDockMinimizeBtn" aria-label="'+(minimized?'Restore':'Minimize')+'" title="'+(minimized?'Restore':'Minimize')+'">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;transform:rotate('+(minimized?'-90':'90')+'deg);">'+icon('chevron')+'</svg>' +
          '</button>' +
          '<button type="button" class="chat-dock-close" id="chatDockCloseBtn" aria-label="Close">&times;</button>' +
        '</span>' +
      '</div>' +
      (minimized ? '' : (
        '<div class="chat-dock-body" id="chatDockBody">' + renderDockMessagesHtml(state.dock.messages, uid) + '</div>' +
        '<div class="chat-dock-composer">' +
          '<input type="text" id="chatDockInput" placeholder="Message&hellip;" value="'+escapeAttr(state.dock.composerText||'')+'">' +
          '<button type="button" class="icon-btn-sm" id="chatDockSendBtn" aria-label="Send">&#10148;</button>' +
        '</div>'
      ));

    document.getElementById('chatDockCloseBtn').addEventListener('click', function(){ closeChatDock(); render(); });
    document.getElementById('chatDockMinimizeBtn').addEventListener('click', function(){
      if(!state.dock) return;
      state.dock.minimized = !state.dock.minimized;
      renderChatDock();
    });
    const body = document.getElementById('chatDockBody');
    if(body) body.scrollTop = body.scrollHeight;
    const input = document.getElementById('chatDockInput');
    if(input){
      input.addEventListener('input', function(){ if(state.dock) state.dock.composerText = input.value; });
      input.addEventListener('keydown', function(e){ if(e.key === 'Enter') sendCurrentDockMessage(); });
    }
    const sendBtn = document.getElementById('chatDockSendBtn');
    if(sendBtn) sendBtn.addEventListener('click', sendCurrentDockMessage);
    async function sendCurrentDockMessage(){
      if(!state.dock) return;
      const text = (state.dock.composerText||'').trim();
      if(!text) return;
      const kind = state.dock.kind, id = state.dock.id;
      state.dock.composerText = '';
      const inputEl = document.getElementById('chatDockInput');
      if(inputEl) inputEl.value = '';
      try{
        if(kind === 'dm'){
          const threadId = dmThreadId(uid, id);
          await sendDmMessage(threadId, { senderUid: uid, text: text });
          notify(id, { type:'message', threadId: threadId });
        } else {
          await sendGroupChatMessage(id, { senderUid: uid, text: text });
        }
      }catch(e){ showToast('Couldn&rsquo;t send &mdash; try again.'); }
    }
  }

  // Background upload tray [2026-09-24, Jared: "when I upload media, it
  // should be queued somewhere so I can safely go anywhere else in the app
  // without cancelling it"] -- see index.html's #uploadTray comment and
  // state.uploadQueue's own comment (up by `dock`) for the full story.
  // pushUploadQueueEntry()/updateUploadQueueEntry()/removeUploadQueueEntry()
  // are the only things that touch state.uploadQueue -- used by
  // attachMediaLibraryHandlers()'s five upload handlers further down,
  // each of which now runs its upload against its OWN queue entry instead
  // of the shared mediaUploadBusy/mediaUploadStatus closure vars, so two
  // uploads (started back to back, from two different screens, or just
  // one still finishing while the person's wandered off elsewhere) never
  // collide or stomp on each other's status text the way a single shared
  // pair of variables would.
  let uploadQueueSeq = 0;
  function pushUploadQueueEntry(kind, title){
    // detail: an optional override for the status line (e.g. "Uploading
    // slide 2 of 5..." for a multi-image slideshow, "Converting your
    // slides..." for a PowerPoint) -- separate from `error` (only ever
    // set, and only ever shown, once status is actually 'error') so a
    // normal in-progress message can never be mistaken for a failure.
    const entry = { id: 'up' + (++uploadQueueSeq) + '_' + Date.now(), kind: kind, title: title, status: 'uploading', pct: 0, detail: null, error: null };
    state.uploadQueue.push(entry);
    renderUploadTray();
    return entry;
  }
  function updateUploadQueueEntry(entry, patch){
    Object.assign(entry, patch);
    renderUploadTray();
  }
  function removeUploadQueueEntry(entry){
    state.uploadQueue = state.uploadQueue.filter(function(e){ return e !== entry; });
    renderUploadTray();
  }
  // A finished (or failed) entry doesn't need to sit in the tray forever --
  // success clears itself a few seconds later (long enough to actually
  // notice it landed); a failure stays until the person dismisses it
  // themselves (the × button below), since that's the one case where they
  // actually need to DO something (retry from Media Library) rather than
  // just seeing a passive confirmation.
  function scheduleUploadQueueAutoRemove(entry){
    setTimeout(function(){ removeUploadQueueEntry(entry); }, 4000);
  }
  function uploadQueueStatusText(entry){
    if(entry.status === 'error') return entry.error || 'Failed &mdash; try again from Media Library.';
    if(entry.status === 'converting') return entry.detail || 'Converting&hellip;';
    if(entry.status === 'uploading') return entry.detail || ('Uploading&hellip; ' + entry.pct + '%');
    return 'Added to your media library.';
  }
  function renderUploadTray(){
    const el = document.getElementById('uploadTray');
    if(!el) return;
    if(!state.uploadQueue.length){ el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = state.uploadQueue.map(function(entry){
      return '<div class="upload-tray-item'+(entry.status==='error'?' upload-tray-item-error':'')+'">' +
        '<div class="upload-tray-item-body">' +
          '<div class="upload-tray-item-title">'+escapeHtml(entry.title||'Untitled')+'</div>' +
          '<div class="upload-tray-item-status">'+uploadQueueStatusText(entry)+'</div>' +
        '</div>' +
        (entry.status === 'error' ? '<button type="button" class="upload-tray-item-dismiss" data-dismiss-upload="'+entry.id+'" aria-label="Dismiss">&times;</button>' : '') +
      '</div>';
    }).join('');
    el.querySelectorAll('[data-dismiss-upload]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-dismiss-upload');
        state.uploadQueue = state.uploadQueue.filter(function(e){ return e.id !== id; });
        renderUploadTray();
      });
    });
  }

  function closeHamburger(){
    const overlay = document.getElementById('hamburgerOverlay');
    if(overlay) overlay.hidden = true;
  }
  function openHamburger(){
    renderHamburgerDrawerBody();
    document.getElementById('hamburgerOverlay').hidden = false;
  }

  function renderHamburgerDrawerBody(){
    const body = document.getElementById('hamburgerDrawerBody');
    if(!body) return;
    const signedIn = !!state.user;
    const name = state.profile ? state.profile.displayName : null;
    // [v36] Notifications and Messages rows removed from here -- both are
    // now reachable from the shared topbar (the bell and the new Messages
    // icon in index.html render on every breakpoint, mobile included), so
    // keeping text rows for them in this mobile-only drawer too would just
    // be Jared's original "redundant" complaint one level down. See
    // renderHeaderChrome()'s notif/msg dropdown wiring and the topbar
    // icons' click handlers further down this file.
    body.innerHTML =
      '<div class="hamburger-header">' +
        (signedIn ? (personAvatar(state.user.uid, 48) + '<span>' + escapeHtml(name || 'Your Account') + '</span>') : '<span>Menu</span>') +
        '<button type="button" class="icon-btn-sm" id="hamburgerCloseBtn" aria-label="Close menu" style="margin-left:auto;width:36px;height:36px;">&times;</button>' +
      '</div>' +
      '<div class="hamburger-items">' +
      (signedIn ? (
        '<button type="button" class="hamburger-item" id="hbMyProfileBtn">MY PROFILE</button>' +
        '<button type="button" class="hamburger-item" id="hbDevotionalsBtn">DEVOTIONALS</button>' +
        (canHost() ? '<button type="button" class="hamburger-item" id="hbMediaLibraryBtn">MEDIA LIBRARY</button>' : '') +
        '<button type="button" class="hamburger-item" id="hbExploreBtn">EXPLORE &amp; SEARCH PEOPLE</button>' +
        '<button type="button" class="hamburger-item" id="hbPlansBtn">PLANS &amp; PRICING</button>' +
        ((state.isEditor || hasFullAccess()) ? '<button type="button" class="hamburger-item" id="hbSongRequestsBtn">SONG REQUESTS</button>' : '') +
        (state.isAdmin ? '<button type="button" class="hamburger-item" id="hbAdminBtn">ADMIN TOOLS</button>' : '') +
        '<button type="button" class="hamburger-item" id="hbSettingsBtn">SETTINGS</button>' +
        '<button type="button" class="hamburger-item hamburger-item-danger" id="hbSignOutBtn">SIGN OUT</button>'
      ) : (
        '<button type="button" class="hamburger-item" id="hbHomeBtn">HOME</button>' +
        '<button type="button" class="hamburger-item" id="hbDevotionalsBtn">DEVOTIONALS</button>' +
        '<button type="button" class="hamburger-item" id="hbPlansBtn">PLANS &amp; PRICING</button>' +
        '<button type="button" class="hamburger-item" id="hbSettingsBtn">SETTINGS</button>'
      )) +
      '</div>';

    function goTo(fn){ closeHamburger(); fn(); }
    document.getElementById('hamburgerCloseBtn').addEventListener('click', closeHamburger);
    const hbHome = document.getElementById('hbHomeBtn');
    if(hbHome) hbHome.addEventListener('click', function(){ goTo(function(){ state.view='landing'; render(); window.scrollTo(0,0); }); });
    const hbProfile = document.getElementById('hbMyProfileBtn');
    if(hbProfile) hbProfile.addEventListener('click', function(){ goTo(openProfileEdit); });
    const hbDevotionals = document.getElementById('hbDevotionalsBtn');
    if(hbDevotionals) hbDevotionals.addEventListener('click', function(){ goTo(function(){ state.view='devotionals'; render(); window.scrollTo(0,0); }); });
    const hbMediaLibrary = document.getElementById('hbMediaLibraryBtn');
    if(hbMediaLibrary) hbMediaLibrary.addEventListener('click', function(){ goTo(function(){ openMediaLibrary('landing'); }); });
    const hbExplore = document.getElementById('hbExploreBtn');
    if(hbExplore) hbExplore.addEventListener('click', function(){ goTo(openExplore); });
    const hbPlans = document.getElementById('hbPlansBtn');
    if(hbPlans) hbPlans.addEventListener('click', function(){ goTo(function(){ state.view='plans'; render(); window.scrollTo(0,0); }); });
    const hbSongRequests = document.getElementById('hbSongRequestsBtn');
    if(hbSongRequests) hbSongRequests.addEventListener('click', function(){ goTo(function(){ state.view='song-request-queue'; render(); window.scrollTo(0,0); startPendingSongRequestsWatch(); }); });
    const hbAdmin = document.getElementById('hbAdminBtn');
    if(hbAdmin) hbAdmin.addEventListener('click', function(){ goTo(function(){ state.view='admin'; render(); window.scrollTo(0,0); startAdminChurchesWatch(); startAdminUsersWatch(); startPendingReportsWatch(); startDirectoryWatch(); }); });
    const hbSettings = document.getElementById('hbSettingsBtn');
    if(hbSettings) hbSettings.addEventListener('click', function(){ goTo(function(){ state.view='settings'; render(); window.scrollTo(0,0); }); });
    const hbSignOut = document.getElementById('hbSignOutBtn');
    if(hbSignOut) hbSignOut.addEventListener('click', function(){ goTo(async function(){ await signOutUser(); state.view='landing'; render(); }); });
  }

  // Desktop sidebar's account menu [2026-09-10] -- everything the
  // hamburger drawer above holds (minus its own close button and the
  // signed-in "MY PROFILE" row, which becomes a proper profile card here
  // instead of a plain text button), rendered as a permanently-visible
  // list rather than a slide-in overlay -- that's the actual substance of
  // "Facebook's PC interface" for this app: nothing lives behind a menu
  // button on a wide screen. Rebuilt on every renderHeaderChrome() call
  // (i.e. every render()), same as the hamburger drawer's body already is
  // while open, so unread counts/role-gated items never go stale -- cheap
  // enough at this size, and consistent with how the rest of this file
  // already treats "rebuild the innerHTML, rebind handlers" as the norm
  // rather than diffing.
  function renderSidebarExtra(){
    const slot = document.getElementById('sidebarExtraSlot');
    if(!slot) return;
    const signedIn = !!state.user;
    if(!signedIn){
      slot.innerHTML =
        '<div class="sidebar-section">' +
          '<button type="button" class="sidebar-item" id="sideDevotionalsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg><span>Devotionals</span></button>' +
          '<button type="button" class="sidebar-item" id="sidePlansBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('tag')+'</svg><span>Plans &amp; Pricing</span></button>' +
          '<button type="button" class="sidebar-item" id="sideSettingsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('gear')+'</svg><span>Settings</span></button>' +
        '</div>';
      const devotionalsBtn0 = document.getElementById('sideDevotionalsBtn');
      if(devotionalsBtn0) devotionalsBtn0.addEventListener('click', function(){ state.view='devotionals'; render(); window.scrollTo(0,0); });
      const plansBtn = document.getElementById('sidePlansBtn');
      if(plansBtn) plansBtn.addEventListener('click', function(){ state.view='plans'; render(); window.scrollTo(0,0); });
      const settingsBtn = document.getElementById('sideSettingsBtn');
      if(settingsBtn) settingsBtn.addEventListener('click', function(){ state.view='settings'; render(); window.scrollTo(0,0); });
      return;
    }
    const name = state.profile ? state.profile.displayName : null;
    // [v36] The Notifications row that used to live here is gone -- Jared:
    // "notifs at the left and notifs at the top? a bit redundant, just
    // keep the one at the top." The shared topbar bell (index.html) is now
    // the only Notifications entry point on desktop too. Messages keeps a
    // sidebar row (there's no other always-visible desktop nav spot for
    // it), but now uses the new distinct `messenger` icon instead of the
    // in-session-chat `chat` icon, plus the same unread-badge treatment
    // Notifications used to have.
    const unreadMsgs = unreadMessagesCount();
    slot.innerHTML =
      '<button type="button" class="sidebar-profile-row" id="sideProfileBtn">' +
        personAvatar(state.user.uid, 38) +
        '<span>'+escapeHtml(name || 'Your Account')+'</span>' +
      '</button>' +
      '<div class="sidebar-divider"></div>' +
      '<div class="sidebar-section">' +
        '<button type="button" class="sidebar-item" id="sideMessagesBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('messenger')+'</svg><span>Messages</span>'+(unreadMsgs?(' <span class="notif-badge-inline">'+(unreadMsgs>99?'99+':unreadMsgs)+'</span>'):'')+'</button>' +
        '<button type="button" class="sidebar-item" id="sideDevotionalsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg><span>Devotionals</span></button>' +
        (canHost() ? ('<button type="button" class="sidebar-item" id="sideMediaLibraryBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('image')+'</svg><span>Media Library</span></button>') : '') +
        '<button type="button" class="sidebar-item" id="sideExploreBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('compass')+'</svg><span>Explore &amp; Search People</span></button>' +
        '<button type="button" class="sidebar-item" id="sidePlansBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('tag')+'</svg><span>Plans &amp; Pricing</span></button>' +
        ((state.isEditor || hasFullAccess()) ? ('<button type="button" class="sidebar-item" id="sideSongRequestsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('mic')+'</svg><span>Song Requests</span></button>') : '') +
        (state.isAdmin ? ('<button type="button" class="sidebar-item" id="sideAdminBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('flag')+'</svg><span>Admin Tools</span></button>') : '') +
        '<button type="button" class="sidebar-item" id="sideSettingsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('gear')+'</svg><span>Settings</span></button>' +
      '</div>' +
      '<div class="sidebar-divider"></div>' +
      '<button type="button" class="sidebar-item sidebar-item-danger" id="sideSignOutBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+icon('logout')+'</svg><span>Sign Out</span></button>';

    document.getElementById('sideProfileBtn').addEventListener('click', openProfileEdit);
    document.getElementById('sideMessagesBtn').addEventListener('click', openMessages);
    document.getElementById('sideDevotionalsBtn').addEventListener('click', function(){ state.view='devotionals'; render(); window.scrollTo(0,0); });
    const sideMediaLibraryBtn = document.getElementById('sideMediaLibraryBtn');
    if(sideMediaLibraryBtn) sideMediaLibraryBtn.addEventListener('click', function(){ openMediaLibrary('landing'); });
    document.getElementById('sideExploreBtn').addEventListener('click', openExplore);
    document.getElementById('sidePlansBtn').addEventListener('click', function(){ state.view='plans'; render(); window.scrollTo(0,0); });
    const songReqBtn = document.getElementById('sideSongRequestsBtn');
    if(songReqBtn) songReqBtn.addEventListener('click', function(){ state.view='song-request-queue'; render(); window.scrollTo(0,0); startPendingSongRequestsWatch(); });
    const adminBtn = document.getElementById('sideAdminBtn');
    if(adminBtn) adminBtn.addEventListener('click', function(){ state.view='admin'; render(); window.scrollTo(0,0); startAdminChurchesWatch(); startAdminUsersWatch(); startPendingReportsWatch(); startDirectoryWatch(); });
    document.getElementById('sideSettingsBtn').addEventListener('click', function(){ state.view='settings'; render(); window.scrollTo(0,0); });
    document.getElementById('sideSignOutBtn').addEventListener('click', async function(){ await signOutUser(); state.view='landing'; render(); });
  }

  document.getElementById('headerAvatarBtn').addEventListener('click', function(){ openProfileEdit(); });
  // [v36] Bell no longer navigates straight to the Notifications page --
  // see renderNotifDropdown()'s comment above for the full "why".
  document.getElementById('notifBtn').addEventListener('click', function(){
    if(!state.user) return;
    state.msgDropdownOpen = false;
    state.notifDropdownOpen = !state.notifDropdownOpen;
    render();
  });
  // [v36] New Messages topbar icon -- desktop toggles the conversations
  // dropdown (see renderMsgDropdown()'s comment above), mobile goes
  // straight into the full Messages hub ("in mobile, you can make it like
  // messenger" -- Messenger's own mobile app has no such dropdown, it's
  // just the inbox).
  document.getElementById('msgTopBtn').addEventListener('click', function(){
    if(!state.user) return;
    if(isDesktopWidth()){
      state.notifDropdownOpen = false;
      state.msgDropdownOpen = !state.msgDropdownOpen;
      render();
    } else {
      openMessages();
    }
  });
  // Click-away closes either dropdown [v36] -- both live inside their
  // button's own .topbar-icon-wrap span (see index.html), so a click on
  // the button or a dropdown row itself never reaches this (it's handled,
  // and closed, by that element's own listener first).
  document.addEventListener('click', function(e){
    if(!state.notifDropdownOpen && !state.msgDropdownOpen) return;
    if(e.target.closest && e.target.closest('.topbar-icon-wrap')) return;
    state.notifDropdownOpen = false; state.msgDropdownOpen = false; render();
  });
  document.getElementById('hamburgerScrim').addEventListener('click', closeHamburger);

  /* ============ CHORD TRANSPOSE ============ */
  const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const FLAT_TO_SHARP = {Db:'C#',Eb:'D#',Gb:'F#',Ab:'G#',Bb:'A#',Cb:'B',Fb:'E'};
  function transposeChord(chord, steps){
    if(!steps) return chord;
    const m = chord.match(/^([A-G])(#|b)?(.*)$/);
    if(!m) return chord;
    let root = m[1] + (m[2]||'');
    const rest = m[3] || '';
    if(FLAT_TO_SHARP[root]) root = FLAT_TO_SHARP[root];
    let idx = NOTES.indexOf(root);
    if(idx === -1) return chord;
    idx = ((idx + steps) % 12 + 12) % 12;
    return NOTES[idx] + rest;
  }
  function transposeKeyLabel(key, steps){ return transposeChord(key, steps); }

  function renderChordLyricLine(line, steps){
    const escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;');
    return escaped.replace(/\[([^\]]+)\]/g, function(_, ch){
      return '<span class="chord">' + transposeChord(ch, steps) + '</span>';
    });
  }

  /* ============ SECTION AUTO-DETECT (heuristic; LLM would refine low-confidence blocks) ============ */
  const LABEL_RE = /^(verse\s*\d*|chorus|refrain|bridge|pre-?chorus|tag|coda|intro|outro)\s*[:.\-]?$/i;
  function normalizeForCompare(block){
    return block.toLowerCase().replace(/\[[^\]]*\]/g,'').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  }
  function detectSections(raw){
    const blocks = raw.replace(/\r\n/g,'\n').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);

    // Pass 1: strip any explicit label line and keep just the sung content per block.
    const parsed = blocks.map(function(block){
      let lines = block.split('\n').map(l=>l.trim()).filter(Boolean);
      let explicitType = null, explicitLabel = null;
      if(lines.length > 1 && LABEL_RE.test(lines[0])){
        explicitLabel = lines[0].replace(/[:.\-]$/,'');
        lines = lines.slice(1);
        explicitType = explicitLabel.toLowerCase().replace(/\s*\d*$/,'').replace('-','').trim();
        if(explicitType.startsWith('verse')) explicitType='verse';
      }
      return { lines, explicitType, explicitLabel, normContent: normalizeForCompare(lines.join('\n')) };
    });

    // Pass 2: group blocks by their content only (label line excluded), so a chorus
    // labeled once but simply repeated verbatim later is still recognized as the same chorus.
    const groups = {};
    parsed.forEach(function(p){
      if(!groups[p.normContent]) groups[p.normContent] = { count:0, explicitType:null, explicitLabel:null };
      const g = groups[p.normContent];
      g.count++;
      if(!g.explicitType && p.explicitType){ g.explicitType = p.explicitType; g.explicitLabel = p.explicitLabel; }
    });

    const VALID_TYPES = ['verse','chorus','refrain','bridge','pre-chorus','tag','coda','intro','outro'];
    let verseCount = 0;
    const results = parsed.map(function(p){
      const group = groups[p.normContent];
      let type, label, confidence = 'high';

      if(p.explicitType){
        type = p.explicitType; label = p.explicitLabel;
      } else if(group.count > 1){
        type = group.explicitType || 'chorus';
        label = group.explicitLabel || (type.charAt(0).toUpperCase()+type.slice(1));
      } else {
        type = 'verse'; label = null;
        if(p.lines.length < 2) confidence = 'low';
      }

      if(!VALID_TYPES.includes(type)){ type = 'verse'; confidence = 'low'; }

      if(type === 'verse' && (!label || !/\d/.test(label))){
        verseCount++;
        label = 'Verse ' + verseCount;
      }

      return { type, label, lines: p.lines, confidence };
    });
    return results;
  }

  // Song-request duplicate detection: reuses normalizeForCompare (already
  // used above for detectSections' verse/chorus grouping), but against the
  // whole library's TITLES rather than lyrics -- good enough to catch
  // "we already have this one" at submit time without real fuzzy-matching.
  // A normalized-title match counts as a possible duplicate either when
  // they're equal outright, or (only once the shorter one is at least 6
  // characters, so e.g. "His" doesn't false-positive against "His Eye Is On
  // The Sparrow") when one fully contains the other. Captured once at
  // submit time and stored on the request itself (possibleDuplicateId/
  // possibleDuplicateTitle) rather than recomputed at review time, since the
  // library can change between submission and review.
  function findPossibleDuplicateSong(title){
    const norm = normalizeForCompare(title || '');
    if(!norm) return null;
    let best = null;
    state.library.forEach(function(s){
      if(best) return;
      const n = normalizeForCompare(s.title || '');
      if(!n) return;
      if(n === norm || (norm.length >= 6 && (n.includes(norm) || norm.includes(n)))) best = s;
    });
    return best;
  }

  // Splits a big pasted block into multiple songs, each starting with a
  // "# Title" line, optional "Key:"/"Themes:"/"Youtube:" lines right after
  // it, then lyrics run through the same detectSections() heuristic used
  // for a single song. Lets someone paste a whole batch (sourced from their
  // own hymnal or a site they're licensed to use) and add it all in one
  // click, instead of the single-song form once per hymn.
  const THEME_KEYS = THEMES.map(function(t){ return t.key; });
  function parseBulkText(raw){
    const text = raw.replace(/\r\n/g,'\n');
    const chunks = text.split(/\n(?=#\s)/).map(function(c){return c.trim();}).filter(Boolean);
    const songs = [];
    const warnings = [];
    chunks.forEach(function(chunk, idx){
      const lines = chunk.split('\n');
      const titleLine = lines[0].replace(/^#\s*/, '').trim();
      if(!titleLine){ warnings.push('Song ' + (idx+1) + ': missing a title on its "# " line -- skipped.'); return; }
      let i = 1;
      let key = '', themes = [], youtube = '';
      while(i < lines.length){
        const l = lines[i].trim();
        const keyMatch = l.match(/^key:\s*(.*)$/i);
        const themesMatch = l.match(/^themes?:\s*(.*)$/i);
        const ytMatch = l.match(/^youtube:\s*(.*)$/i);
        if(keyMatch){ key = keyMatch[1].trim(); i++; }
        else if(themesMatch){
          themes = themesMatch[1].split(',').map(function(s){return s.trim().toLowerCase().replace(/\s+/g,'-');}).filter(function(t){ return THEME_KEYS.includes(t); });
          i++;
        }
        else if(ytMatch){ youtube = ytMatch[1].trim(); i++; }
        else if(l === ''){ i++; }
        else break; // first non-metadata, non-blank line -- lyrics start here
      }
      const lyricsRaw = lines.slice(i).join('\n').trim();
      if(!lyricsRaw){ warnings.push('"' + titleLine + '": no lyrics found after the title/metadata lines -- skipped.'); return; }
      const sections = detectSections(lyricsRaw);
      if(!sections.length){ warnings.push('"' + titleLine + '": couldn&rsquo;t detect any sections -- skipped.'); return; }
      songs.push({ title: titleLine, key: key, themes: themes, youtube: youtube, sections: sections });
    });
    return { songs, warnings };
  }

  // Bulk import: CSV / ChordPro file upload [2026-09-24] -- Jared: "Bulk
  // song import, build that as well." parseBulkText() above already covers
  // pasting the app's own "# Title" plain-text format; this section adds
  // two more input formats a worship team is realistically already sitting
  // on -- a CSV export from a spreadsheet, and standard ChordPro (.cho/
  // .crd/.chordpro) files, which most other worship-presentation tools
  // (OnSong, PlanningCenter, SongSelect) can already export to. All three
  // parsers return the exact same `{songs: [{title,key,themes,youtube,
  // sections}], warnings}` shape, so renderBulkPreview()/submitBulkImport()
  // below (already built, already relied on) needed zero changes -- only
  // handleBulkFileUpload() (further down) feeds them from a different
  // source.
  //
  // The lucky part: this app's own chorded-lyric storage format IS
  // ChordPro's inline chord syntax already -- renderChordLyricLine() above
  // parses `[G]Amazing [C]grace` directly out of a stored lyric line. That
  // means a ChordPro file's actual chord/lyric content lines need ZERO
  // transformation, only its `{directive}` lines (title/key/section
  // markers) need interpreting -- so chordProToLabeledText() below just
  // strips/translates those into this app's OWN explicit-section-label
  // convention (the same "Verse"/"Chorus"/"Bridge" line detectSections()
  // already recognizes via LABEL_RE) and hands the result straight to the
  // existing, already-tested detectSections() rather than reimplementing
  // section-grouping a second time.
  function chordProToLabeledText(raw){
    const lines = raw.replace(/\r\n/g,'\n').split('\n');
    let title = '', key = '';
    const blocks = [];
    let current = { label: null, lines: [] };
    let skippingTab = false;
    function flush(){
      if(current.lines.some(function(l){ return l.trim(); })) blocks.push(current);
      current = { label: null, lines: [] };
    }
    const SECTION_OPENERS = {
      start_of_verse:'Verse', sov:'Verse',
      start_of_chorus:'Chorus', soc:'Chorus',
      start_of_bridge:'Bridge', sob:'Bridge'
    };
    const SECTION_CLOSERS = { end_of_verse:1, eov:1, end_of_chorus:1, eoc:1, end_of_bridge:1, eob:1 };
    lines.forEach(function(rawLine){
      const line = rawLine.trim();
      const m = line.match(/^\{([^:}]+)(?::\s*(.*))?\}$/);
      if(m){
        const directive = m[1].trim().toLowerCase().replace(/[\s-]+/g,'_');
        const val = (m[2]||'').trim();
        if(skippingTab){
          if(directive==='end_of_tab' || directive==='eot') skippingTab = false;
          return;
        }
        if(directive==='start_of_tab' || directive==='sot'){ flush(); skippingTab = true; return; }
        if((directive==='title' || directive==='t') && !title){ title = val; return; }
        if((directive==='key' || directive==='k') && !key){ key = val; return; }
        if(SECTION_OPENERS[directive]){ flush(); current.label = SECTION_OPENERS[directive]; return; }
        if(SECTION_CLOSERS[directive]){ flush(); return; }
        return; // any other ChordPro directive (artist, capo, tempo, comment, ...) -- not needed here, ignored
      }
      if(skippingTab) return;
      if(line === ''){
        // A blank line only breaks the block when we're not inside an
        // EXPLICIT {start_of_X}...{end_of_X} pair -- an explicit block is
        // still one section even if its source happens to have a stray
        // blank line in the middle of it.
        if(!current.label) flush();
        return;
      }
      current.lines.push(line);
    });
    flush();
    const text = blocks.map(function(b){ return (b.label ? (b.label + '\n') : '') + b.lines.join('\n'); }).join('\n\n');
    return { title: title, key: key, text: text };
  }
  function parseChordProText(raw, fallbackTitle){
    const { title, key, text } = chordProToLabeledText(raw);
    const songTitle = title || fallbackTitle || '';
    if(!songTitle) return { song:null, warning:'No {title:} directive found, and no filename to fall back on -- skipped.' };
    if(!text.trim()) return { song:null, warning:'"'+songTitle+'": no lyric content found -- skipped.' };
    const sections = detectSections(text);
    if(!sections.length) return { song:null, warning:'"'+songTitle+'": couldn&rsquo;t detect any sections -- skipped.' };
    return { song: { title: songTitle, key: key, themes: [], youtube: '', sections: sections }, warning: null };
  }

  // Minimal RFC4180-ish CSV row parser -- handles quoted fields (embedded
  // commas, embedded newlines for a multi-line lyrics cell, and doubled ""
  // escaped quotes), which a naive split(',') would mangle the moment
  // someone's lyrics cell spans multiple lines (the normal case for a real
  // spreadsheet export). Not attempting every RFC edge case, just what an
  // Excel/Sheets/Numbers export actually produces.
  function parseCsvRows(text){
    const rows = [];
    let row = [], field = '', inQuotes = false;
    const s = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    for(let i=0; i<s.length; i++){
      const c = s[i];
      if(inQuotes){
        if(c === '"'){ if(s[i+1] === '"'){ field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else {
        if(c === '"') inQuotes = true;
        else if(c === ','){ row.push(field); field=''; }
        else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
        else field += c;
      }
    }
    row.push(field); rows.push(row);
    if(rows.length && rows[rows.length-1].length===1 && rows[rows.length-1][0]==='') rows.pop();
    return rows;
  }
  function parseCsvText(raw){
    const cleaned = raw.replace(/^﻿/, ''); // strip a BOM -- common on an Excel CSV export
    const rows = parseCsvRows(cleaned);
    if(!rows.length) return { songs: [], warnings: ['Empty CSV file.'] };
    const header = rows[0].map(function(h){ return h.trim().toLowerCase(); });
    const idx = { title: header.indexOf('title'), key: header.indexOf('key'), themes: header.indexOf('themes'), youtube: header.indexOf('youtube'), lyrics: header.indexOf('lyrics') };
    if(idx.title === -1 || idx.lyrics === -1){
      return { songs: [], warnings: ['CSV needs at least "title" and "lyrics" columns (found: ' + (header.filter(Boolean).join(', ')||'an empty header row') + ').'] };
    }
    const songs = [], warnings = [];
    for(let r=1; r<rows.length; r++){
      const row = rows[r];
      if(row.length===1 && row[0].trim()==='') continue; // stray trailing blank row
      const title = (row[idx.title]||'').trim();
      const lyricsRaw = (row[idx.lyrics]||'').trim();
      if(!title){ warnings.push('Row ' + (r+1) + ': missing a title -- skipped.'); continue; }
      if(!lyricsRaw){ warnings.push('"' + title + '": empty lyrics cell -- skipped.'); continue; }
      const sections = detectSections(lyricsRaw);
      if(!sections.length){ warnings.push('"' + title + '": couldn&rsquo;t detect any sections -- skipped.'); continue; }
      const themes = idx.themes>-1 ? (row[idx.themes]||'').split(/[,;]/).map(function(t){ return t.trim().toLowerCase().replace(/\s+/g,'-'); }).filter(function(t){ return THEME_KEYS.includes(t); }) : [];
      songs.push({ title: title, key: idx.key>-1 ? (row[idx.key]||'').trim() : '', themes: themes, youtube: idx.youtube>-1 ? (row[idx.youtube]||'').trim() : '', sections: sections });
    }
    return { songs, warnings };
  }

  // Per-file format detection for the BULK ADD screen's file-upload path --
  // an explicit file extension wins when present; a plain .txt (or no
  // extension) file is sniffed by content instead, so someone can still
  // upload a .txt file written in either format.
  function detectBulkFileFormat(filename, content){
    const ext = (filename.split('.').pop()||'').toLowerCase();
    if(ext === 'csv') return 'csv';
    if(ext==='cho' || ext==='crd' || ext==='chordpro' || ext==='chopro') return 'chordpro';
    if(/^\s*\{(title|t|start_of_verse|sov|start_of_chorus|soc|key|k)\b/im.test(content)) return 'chordpro';
    const firstLine = (content.split(/\r?\n/).find(function(l){ return l.trim(); }) || '').trim();
    if(!firstLine.startsWith('#') && firstLine.indexOf(',')>-1 && /title/i.test(firstLine) && /lyrics/i.test(firstLine)) return 'csv';
    return 'bulktext'; // falls back to this app's own "# Title" paste format, unchanged
  }
  // Reads every selected file, parses each with the right parser for its
  // format, and merges all of them into ONE combined preview -- so picking
  // several ChordPro files (the realistic case: one song per file) at once
  // imports the whole batch in a single PREVIEW/SAVE ALL pass, same as
  // pasting several songs into the textarea already does.
  async function handleBulkFileUpload(fileList){
    const files = Array.from(fileList || []);
    if(!files.length) return;
    let allSongs = [], allWarnings = [];
    for(let i=0; i<files.length; i++){
      const file = files[i];
      let text;
      try{ text = await file.text(); }
      catch(e){ allWarnings.push(file.name + ': could not read this file -- skipped.'); continue; }
      const format = detectBulkFileFormat(file.name, text);
      if(format === 'csv'){
        const { songs, warnings } = parseCsvText(text);
        allSongs = allSongs.concat(songs);
        warnings.forEach(function(w){ allWarnings.push(file.name + ': ' + w); });
      } else if(format === 'chordpro'){
        const { song, warning } = parseChordProText(text, file.name.replace(/\.[^.]+$/, ''));
        if(song) allSongs.push(song);
        if(warning) allWarnings.push(file.name + ': ' + warning);
      } else {
        const { songs, warnings } = parseBulkText(text);
        allSongs = allSongs.concat(songs);
        warnings.forEach(function(w){ allWarnings.push(file.name + ': ' + w); });
      }
    }
    bulkParsed = allSongs;
    renderBulkPreview(allSongs, allWarnings);
  }

  /* ============ RENDER ============ */
  // Preserve keyboard focus (and cursor position) across a render() call
  // that's triggered by something OTHER than the user's own typing -- an
  // incoming message, a badge count changing, any background watcher
  // firing -- rather than a deliberate navigation. render() always rebuilds
  // whichever view is on screen from scratch, which is fine for almost
  // everything, but for a focused text input it silently swaps the old
  // (focused) DOM node for a brand-new, unfocused one with the same id.
  // Jared: "when I type in messages and click enter and try to type again,
  // I can't because I have to click on the chat box again" [2026-09-14] --
  // traced to startMyDmThreadsWatch()/startMyGroupChatsWatch() (v36) now
  // calling render() UNCONDITIONALLY on every thread-list change (so the
  // Messages badge stays live app-wide), which fires the instant your OWN
  // message's parent-thread lastMessageText/readAt update lands -- i.e. on
  // every single send, regardless of which of the several render()-calling
  // watchers involved actually did it (the DM/group *messages* watchers
  // were also patched to update in place rather than call render() at all,
  // see startDmMessagesWatch()/startGroupChatThreadWatch()/openChatDock()
  // above -- but the *thread-list* watchers still need to call the real
  // render() for the badge/inbox-list/dropdown to update, so this is fixed
  // once here instead, generically, the same "fix the whole class at the
  // root" approach as bug #11 above rather than chasing every individual
  // render()-calling call site one at a time.
  // Reload-resume snapshot [2026-09-24] -- see RESUMABLE_VIEWS' own
  // comment (up by HOST_VIEWS/MORE_VIEWS/FELLOWSHIP_VIEWS) for the
  // whitelist and why a form/live-session view is deliberately excluded.
  // Called from the END of every render() (below), after renderCurrentView()
  // has had a chance to settle state.view itself (e.g. renderDetail()'s own
  // "song no longer exists" snap-back to 'list') -- this always persists
  // whatever the view actually ended up being, never a value that's about
  // to be immediately overridden. sessionStorage (not localStorage) for
  // the same per-TAB reasoning as cv:activeRoomCode above.
  function persistLastViewForResume(){
    if(!Object.prototype.hasOwnProperty.call(RESUMABLE_VIEWS, state.view)) return;
    const idField = RESUMABLE_VIEWS[state.view];
    if(idField && !state[idField]) return; // mid-transition -- don't persist a broken snapshot
    safeSessionSet('cv:lastView', JSON.stringify(idField ? { view: state.view, id: state[idField] } : { view: state.view }));
  }
  // The view as of the end of the LAST render() call -- compared against
  // state.view at the end of THIS one to tell "the screen actually
  // navigated" apart from "render() fired again for some unrelated live-
  // data reason." Powers both the page-transition fade and (a separate
  // concern, see syncHistoryForView() below) real browser back/forward.
  let lastRenderedView = null;

  // Real back/forward [2026-09-24, Jared: "add buttons that give faster
  // back and forward"] -- until now state.view was a plain JS variable
  // with no History API involvement at all, so the browser's own Back
  // button (and, on an installed PWA, the on-screen #navBackBtn/
  // #navForwardBtn pair -- see index.html's comment on those) had NOTHING
  // to go back TO; pressing it just left the app entirely. This pushes one
  // history entry per real navigation and restores from it on
  // back/forward, reusing RESUMABLE_VIEWS -- the exact same whitelist (and
  // the exact same "a mid-edit form/live session isn't safe to just jump
  // back into" reasoning) reload-resume already established, so a form or
  // a live hosted session simply doesn't get a history entry of its own
  // (Back from one skips straight to whatever stable view came before it,
  // rather than risk reopening either mid-edit or mid-session). The
  // History `state` object shape is deliberately identical to
  // cv:lastView's ({view} or {view,id}) so the two features can share one
  // mental model even though they're solving different problems (surviving
  // a RELOAD vs. surviving a BACK tap).
  let lastPushedHistoryKey = null;
  // Set for the duration of applying a popstate (or the very first
  // history.replaceState() call below) so syncHistoryForView() knows NOT
  // to push a brand-new entry for a navigation that's really just US
  // catching up to where the browser's history already pointed -- without
  // this, pressing Back would immediately push a fresh entry undoing the
  // very navigation Back just performed.
  let historyNavInProgress = false;
  // The very FIRST time this fires (whatever screen the page happened to
  // load on -- landing, or a deep link), it REPLACES the initial, state-
  // less history entry the browser already created for the page load,
  // rather than pushing a second entry for the same screen on top of it.
  // Without this, the first real navigation's Back would land on that
  // duplicate, visually-identical-but-technically-different entry and
  // silently do nothing (correct, but confusingly so, on the very first
  // press) -- replacing collapses that redundant step away.
  let historySyncedOnce = false;
  function historyKeyFor(view, id){ return view + (id ? (':' + id) : ''); }
  function syncHistoryForView(){
    if(historyNavInProgress) return;
    if(!Object.prototype.hasOwnProperty.call(RESUMABLE_VIEWS, state.view)) return;
    const idField = RESUMABLE_VIEWS[state.view];
    const idVal = idField ? state[idField] : null;
    if(idField && !idVal) return; // mid-transition, same guard as persistLastViewForResume()
    const key = historyKeyFor(state.view, idVal);
    if(key === lastPushedHistoryKey) return; // still the same screen -- e.g. a live-data re-render, not a real navigation
    lastPushedHistoryKey = key;
    const historyState = idField ? { view: state.view, id: idVal } : { view: state.view };
    // Deliberately keeps the URL itself untouched (just the pathname, no
    // query string) -- the ?stage=/?dm=/?devotional=/etc deep links (see
    // the startup routing block, far below) only ever get read once, at
    // initial page load, so there's no case where changing the visible URL
    // on every in-app navigation would actually help anything; it would
    // just make the address bar (where visible at all -- an installed PWA
    // has none) show a confusing mix of query params that no longer mean
    // what they said.
    if(!historySyncedOnce){
      historySyncedOnce = true;
      history.replaceState(historyState, '', window.location.pathname);
    } else {
      history.pushState(historyState, '', window.location.pathname);
    }
  }
  // Applies a {view, id?} snapshot -- from a popstate event, specifically
  // -- back onto live state. Deliberately reuses the exact same three-
  // bucket dispatch reload-resume already built (RESUME_NO_DEPENDENCY /
  // RESUME_LIBRARY_DEPENDENT / everything else via restoreLastViewIfNeeded(),
  // all further down this file) rather than a second copy of that same
  // logic -- by the time a REAL popstate can fire (well after initial page
  // load), state.user/state.library are already whatever they're going to
  // be, so the boot-time-only timing gap that split reload-resume into
  // three buckets in the first place mostly doesn't apply here; reusing it
  // anyway costs nothing and means one thing to keep in sync, not two.
  function applyViewSnapshot(snapshot){
    if(!snapshot || !snapshot.view || !Object.prototype.hasOwnProperty.call(RESUMABLE_VIEWS, snapshot.view)) return false;
    if(RESUME_NO_DEPENDENCY.includes(snapshot.view)){
      state.view = snapshot.view; render(); window.scrollTo(0,0);
      return true;
    }
    if(RESUME_LIBRARY_DEPENDENT.includes(snapshot.view)){
      if(!snapshot.id || !state.library.some(function(s){ return s.id === snapshot.id; })) return false;
      state.view = snapshot.view; state.songId = snapshot.id;
      render(); window.scrollTo(0,0);
      return true;
    }
    restoreLastViewIfNeeded(snapshot); // the auth-dependent bucket -- no-ops harmlessly if signed out
    return true;
  }

  function render(){
    const focused = document.activeElement;
    const restoreFocus = (focused && focused.id && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA'))
      ? { id: focused.id, selStart: focused.selectionStart, selEnd: focused.selectionEnd }
      : null;
    // Verse-list scroll position [2026-09-17, moved here from the Bible
    // picker's own click handlers -- see withPreservedVerseListScroll()'s
    // own comment for the fuller history]. That per-click-handler fix
    // (v47, hardened in v48) only protected `.lyric-sheet`'s scrollTop
    // around the ONE render() call each handler itself triggered. But the
    // Bible picker deliberately stays open across renders from ANY
    // source, not just its own (see v41's comment on why) -- and in REAL
    // Firestore mode (unlike this app's local demo-mode data layer, which
    // is what every automated Playwright test in this project runs
    // against), the host is also live-watching their own room doc:
    // watchActiveRoom()'s watchRoom() callback calls this SAME render()
    // unconditionally on every snapshot it receives, including echoes of
    // the host's own writes and anything else that touches the room
    // (chat, presence, viewer count, a co-host action). Any one of those
    // can land moments after a host taps a verse -- long after the
    // per-click fix's own two-animation-frame grace window has passed --
    // and silently reset `.lyric-sheet` back to scrollTop 0 the exact
    // same way presenting a verse itself used to, before v47. A screen
    // recording from Jared confirmed exactly this: the list visibly
    // snapping back to the top a beat after a tap, against his real
    // deployed backend -- something no test against this app's demo-mode
    // data layer could ever reproduce, which is why the per-click fix
    // alone looked sufficient in every test run here (nothing else was
    // ever re-rendering the page in the background during those tests).
    // Capturing/restoring `.lyric-sheet`'s scrollTop generically around
    // EVERY render(), the exact same way `restoreFocus` just above
    // already does for focus, fixes the whole class at its root instead
    // of chasing one triggering call site at a time -- it doesn't matter
    // WHY a render() happened while the picker is open and scrolled, the
    // list's position is protected regardless. Harmless everywhere else:
    // `.lyric-sheet` only exists at all while the Bible verse picker (or
    // the Hymnal reading view, which never scrolls internally) is on
    // screen, so this is a no-op single querySelector the rest of the
    // time.
    const lyricSheetBefore = document.querySelector('.lyric-sheet');
    const lyricSheetScroll = lyricSheetBefore ? lyricSheetBefore.scrollTop : 0;
    // #threadScrollBody (DM / group chat full-page thread views) [2026-09-22]
    // -- same root cause and same fix as the .lyric-sheet block just above.
    // startDmMessagesWatch()/startGroupChatThreadWatch() already patch
    // #threadScrollBody in place and re-scroll to bottom when a new message
    // arrives (see their own comments) -- but sendDmMessage()/
    // sendGroupChatMessage() ALSO write to the parent dmThreads/{id} or
    // groupChats/{id} doc (lastMessageText/lastMessageAt/updatedAt, for the
    // inbox list + unread badge), and watchMyDmThreads()/watchMyGroupChats()
    // call this SAME render() unconditionally on every snapshot of that
    // doc -- including the echo of your own just-sent message -- regardless
    // of which view is on screen. That full render() tears down and rebuilds
    // #threadScrollBody from scratch (a fresh element defaults to
    // scrollTop 0), landing moments after the message-watcher's own
    // patch-and-scroll and silently undoing it: Jared, "messages jumps back
    // to top every time a message is sent" / "DMs and group chats"
    // [2026-09-22]. Capturing/restoring scrollTop generically around every
    // render() fixes the whole class regardless of which watcher triggered
    // it, exactly like the lyric-sheet fix above. Harmless elsewhere:
    // #threadScrollBody only exists while a DM or group thread is open.
    const threadBodyBefore = document.getElementById('threadScrollBody');
    const threadBodyScroll = threadBodyBefore ? threadBodyBefore.scrollTop : 0;
    const threadBodyWasAtBottom = threadBodyBefore
      ? (threadBodyBefore.scrollHeight - threadBodyBefore.scrollTop - threadBodyBefore.clientHeight) < 24
      : false;
    renderCurrentView();
    persistLastViewForResume();
    // Page-transition fade [2026-09-24, Jared: "check the transition
    // between pages... make navigation smoother"] -- every render() before
    // this just swapped #main's whole innerHTML instantly with nothing in
    // between, which is what actually made navigation feel abrupt/jumpy
    // (not any one screen's own content, which is why nothing about this
    // showed up looking for a bug in a specific view). Only plays when
    // state.view itself actually CHANGED since the last render -- render()
    // fires constantly for reasons that have nothing to do with navigating
    // (a live Firestore snapshot echo, a chat message arriving, a like
    // count ticking up), and re-fading the current screen on every one of
    // those would be constant, distracting flicker rather than a "page
    // transition." Uses the classic remove-reflow-readd trick (rather than
    // just add()) because #main itself is never recreated -- only its
    // innerHTML is -- so a CSS animation class already sitting on it from
    // the LAST navigation wouldn't replay on its own; forcing a reflow in
    // between makes the browser treat it as a fresh animation start. See
    // .view-fade-in in styles.css (and its stage-page override -- the live
    // projector output deliberately never does this, timing there matters
    // too much to risk it).
    if(state.view !== lastRenderedView){
      lastRenderedView = state.view;
      main.classList.remove('view-fade-in');
      void main.offsetWidth; // force a reflow so the removal above actually "takes" before re-adding
      main.classList.add('view-fade-in');
    }
    syncHistoryForView();
    if(restoreFocus){
      const el = document.getElementById(restoreFocus.id);
      // Only re-focus if it's genuinely the same field re-appearing (same
      // id present after the rebuild) -- if the view actually changed and
      // no element shares that id, this is correctly a no-op.
      if(el && el !== document.activeElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')){
        el.focus();
        try{ el.setSelectionRange(restoreFocus.selStart, restoreFocus.selEnd); }catch(e){ /* not all input types support selection ranges */ }
      }
    }
    if(lyricSheetScroll){
      const lyricSheetAfter = document.querySelector('.lyric-sheet');
      if(lyricSheetAfter) lyricSheetAfter.scrollTop = lyricSheetScroll;
    }
    if(threadBodyBefore){
      const threadBodyAfter = document.getElementById('threadScrollBody');
      if(threadBodyAfter){
        // If the reader was already at (or near) the bottom, keep them
        // pinned to the new bottom -- the content height may have changed
        // (a new message just landed) so the OLD scrollTop number would now
        // sit short of it. Otherwise (they'd scrolled up to read history)
        // restore their exact position rather than yanking them anywhere.
        threadBodyAfter.scrollTop = threadBodyWasAtBottom ? threadBodyAfter.scrollHeight : threadBodyScroll;
      }
    }
  }
  function renderCurrentView(){
    // See styles.css's "main.main-full-bleed" comment -- only the
    // standalone Presenter/Projector view should ignore main's normal
    // centered-column max-width, so this toggle lives in the one place
    // every render() call passes through, rather than being set/unset
    // separately in each of the many render* functions below.
    main.classList.toggle('main-full-bleed', state.view === 'session-projector');
    // See styles.css's "body.stage-page" comment -- .app is normally
    // min-height:100dvh (a floor, so long pages can grow and scroll like
    // any normal web page), which is wrong specifically for the stage view:
    // that one screen is meant to always fit in one viewport, with
    // fitStageLines() (below) shrinking the text to make that true rather
    // than letting the page grow taller and scroll.
    document.body.classList.toggle('stage-page', state.view === 'session-projector');
    // Fix [2026-09-15]: Jared: "the messages don't pop up in all pages, they
    // should be fully accessible anywhere." See chatDockSuppressedHere()'s
    // own updated comment -- session-host is the one screen with a
    // competing floating widget (the in-session .chat-fab/.chat-floating-
    // panel) in the same bottom-right corner.
    // Fix [2026-09-16]: that first fix moved the personal-messages dock to
    // the OPPOSITE corner (left) while hosting -- Jared: "put it on the
    // lower right corner where it can be minimized anytime cause it's
    // blocking a lot of things on the interface," since the left side is
    // exactly where the SONGS/SERMON/BIBLE/MEDIA picker lives, which the
    // dock (tall enough to cover most of a phone-width picker) was sitting
    // directly on top of -- worse than the rare case of two small floating
    // widgets sharing the right corner. It now stays on the right always
    // (see styles.css's own ".chat-dock" comment for how `.hosting-page`,
    // already toggled just below, lifts it above the room-chat FAB there
    // instead of moving it sideways), and gets a real minimize control (see
    // renderChatDock()) so a host can collapse it to a small bar with one
    // tap instead of it ever "blocking a lot of things."
    // Fix [2026-09-15]: see styles.css's own ".toast" comment -- lifts the
    // "You're live."/"Saved" toast above the "Your Controls" bar while
    // hosting, so it stops popping up directly on top of GO LIVE/PREV/NEXT.
    document.body.classList.toggle('hosting-page', state.view === 'session-host');
    renderHeaderChrome();
    if(state.view==='landing') return renderLanding();
    if(state.view==='list') return renderList();
    if(state.view==='detail') return renderDetail();
    if(state.view==='edit') return renderEditSong();
    if(state.view==='add') return renderAdd();
    if(state.view==='bulk-add') return renderBulkAdd();
    if(state.view==='session-setup') return renderSessionSetup();
    if(state.view==='session-host') return renderSessionHost();
    if(state.view==='session-join') return renderSessionJoin();
    if(state.view==='session-view') return renderSessionView();
    if(state.view==='session-projector') return renderSessionProjector();
    if(state.view==='session-chart') return renderSessionChart();
    if(state.view==='my-sessions') return renderMySessions();
    if(state.view==='plans') return renderPlans();
    if(state.view==='admin') return renderAdmin();
    if(state.view==='song-request') return renderSongRequest();
    if(state.view==='song-request-queue') return renderSongRequestQueue();
    if(state.view==='bible') return renderBible();
    if(state.view==='devotionals') return renderDevotionals();
    if(state.view==='sermons') return renderSermons();
    if(state.view==='sermon-edit') return renderSermonEdit();
    if(state.view==='shared-sermon-link') return renderSharedSermonLink();
    if(state.view==='media-library') return renderMediaLibrary();
    if(state.view==='fellowship') return renderFellowshipFeed();
    if(state.view==='profile-edit') return renderProfileEdit();
    if(state.view==='profile-view') return renderProfileView();
    if(state.view==='messages') return renderMessages();
    if(state.view==='dm-thread') return renderDmThread();
    if(state.view==='group-chat-thread') return renderGroupChatThread();
    if(state.view==='shorts') return renderShortsFeed();
    if(state.view==='explore') return renderExplore();
    if(state.view==='notifications') return renderNotifications();
    if(state.view==='settings') return renderSettings();
    if(state.view==='host-hub') return renderHostHub();
  }

  function protoBadge(){
    // Shown during early internal testing; removed once real hymns started
    // going into a real, shared Firestore project for an actual pilot --
    // left as a no-op (rather than deleting its two call sites) so it's easy
    // to bring back if a future build ever needs a similar "still testing"
    // banner again.
    return '';
  }

  // Home hub's compact Fellowship preview [2026-09-10] -- Jared: "at the
  // homepage, I think having fellowship as the main attraction is better.
  // like recent posts, trending posts." A small RECENT/TRENDING-toggled
  // slice of the same feed the full Fellowship tab shows (not a separate
  // query -- trendingPosts() already re-sorts state.feedPosts, same as
  // Explore does), reusing renderFeedPostCard()/attachFeedActionHandlers()
  // so liking/commenting works right from the home hub, not just the feed.
  function landingFeedPreviewPosts(){
    const source = state.landingFeedTab === 'trending'
      ? trendingPosts()
      : state.feedPosts.filter(function(p){ return !isBlockedByMe(p.authorUid); });
    return source.slice(0, 3);
  }
  function renderLandingFellowshipSection(signedIn){
    if(!signedIn){
      return '<div class="session-card">' +
        '<h3>Fellowship</h3>' +
        '<p>Share what God&rsquo;s doing in your life and keep up with your church family &mdash; sign in above to see what everyone&rsquo;s posting.</p>' +
      '</div>';
    }
    const posts = landingFeedPreviewPosts();
    return '<div class="session-card landing-fellowship-preview">' +
      '<div class="landing-fellowship-head">' +
        '<h3>Fellowship</h3>' +
        '<button type="button" class="switch-account" id="landingOpenFellowshipBtn">OPEN FELLOWSHIP &rarr;</button>' +
      '</div>' +
      '<div class="fellowship-preview-tabs">' +
        '<button type="button" class="fellowship-preview-tab'+(state.landingFeedTab==='recent'?' fellowship-preview-tab-active':'')+'" data-landing-feed-tab="recent">RECENT</button>' +
        '<button type="button" class="fellowship-preview-tab'+(state.landingFeedTab==='trending'?' fellowship-preview-tab-active':'')+'" data-landing-feed-tab="trending">TRENDING</button>' +
      '</div>' +
      (posts.length ? posts.map(renderFeedPostCard).join('') :
        '<p class="hint" style="text-align:center;padding:18px 0;">'+(state.landingFeedTab==='trending'?'Nothing trending yet.':'No posts yet')+' &mdash; be the first to share something with your church family.</p>') +
    '</div>';
  }

  // Proactive enable-notifications banner [2026-09-17] -- Jared: "I think
  // there should be a prompt to allow notifications for phones, PCs, and
  // allow background activity as well." Before this, the ONLY way to
  // enable push was to already know to go dig into Settings -> Notifications
  // (see renderSettings() above) -- nothing ever surfaced the option
  // proactively. Shown at most once per device (dismissing it, either way,
  // sets a localStorage flag so it never nags on every visit) -- only when
  // there's something to ask: push is actually configured
  // (pushNotificationsConfigured), signed in with a profile already set up,
  // and Notification.permission is still 'default' (never asked, never
  // denied -- a 'denied' state has its own explanation in Settings instead,
  // since re-prompting from here couldn't do anything about it anyway).
  function renderNotifPromptBanner(signedIn, needsProfileSetup){
    if(!pushNotificationsConfigured || !signedIn || needsProfileSetup) return '';
    if(currentNotificationPermission() !== 'default') return '';
    if(safeGet('iworship:notifBannerDismissed', '')) return '';
    return '<div class="notif-prompt-banner" id="notifPromptBanner">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/></svg>' +
      '<div style="flex:1;min-width:0;">' +
        '<p style="margin:0;font-weight:700;">Turn on notifications?</p>' +
        '<p class="hint" style="margin:4px 0 0;">Get a push for messages, worship sessions from people you follow or your own church, and a daily verse &mdash; even with iWorship fully closed. Your browser will ask to allow notifications; on a phone, also allow background activity when asked, so a closed app can still be woken to show one.</p>' +
        '<div class="notif-prompt-banner-actions">' +
          '<button type="button" class="btn btn-primary" id="notifBannerEnableBtn" style="padding:8px 16px;">ENABLE NOTIFICATIONS</button>' +
          '<button type="button" class="btn btn-ghost" id="notifBannerDismissBtn" style="padding:8px 16px;">NOT NOW</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderLanding(){
    ensureLandingSocialWatchesStarted();
    const verse = todaysVerse();
    const signedIn = !!state.user;
    // [Bug found 2026-09-22] Jared: "when relogging back in, it asked for my
    // name and church name again... after inputting both, it detected that
    // I was the admin, but this time it used the new name that I used in my
    // account." Root cause: watchProfile()'s onSnapshot is async -- on a
    // fresh sign-in (a real relogin, an account switch, or just a cold
    // Firestore cache after the iworship-ph migration) there's a real gap,
    // sometimes a full network round trip, before it fires even once.
    // needsProfileSetup used to fall back to treating "no profile loaded
    // YET" exactly the same as "confirmed no profile exists" (both just
    // read as `!state.profile`) -- and checkIsAdmin()/checkIsEditor() above
    // are two SEPARATE one-off getDoc() calls racing that same listener,
    // each calling render() the instant they resolve. If either won that
    // race, this "Almost There" form rendered for an already-fully-set-up
    // returning user, its YOUR NAME field pre-filled from the *Google*
    // account's displayName (see below) -- and one tap of SAVE & CONTINUE
    // (saveProfile() is a merge write) silently overwrote the person's real
    // in-app display name with it. state.profileLoaded (set true only once
    // watchProfile's listener has actually fired for THIS sign-in -- see
    // its own comment above) closes that gap: this form can now only appear
    // once Firestore has actually confirmed there's no profile.
    const needsProfileSetup = signedIn && state.profileLoaded && (!state.profile || !state.profile.displayName);
    const name = state.profile ? state.profile.displayName : null;
    const churchName = state.profile ? state.profile.churchName : null;
    const favCount = (state.profile && state.profile.favorites) ? state.profile.favorites.length : 0;

    main.innerHTML =
      protoBadge() +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">'+timeGreeting()+(name ? ', '+escapeHtml(name) : '')+'</p>' +
        '<p class="landing-sub">'+(name ? ('Welcome back'+(churchName ? ' &mdash; '+escapeHtml(churchName) : '')+'.') : 'Welcome to your church&rsquo;s home for worship &amp; fellowship &mdash; hymns, live sessions, sermons, Bible, and your community, all in one place.')+'</p>' +
      '</div>' +

      '<div class="verse-card">' +
        '<p class="verse-eyebrow uc">Verse of the Day</p>' +
        '<p class="verse-text">&ldquo;'+verse.text+'&rdquo;</p>' +
        '<p class="verse-ref">'+verse.ref+' &middot; KJV</p>' +
        '<span class="verse-tag pill '+(verse.tag==='challenging'?'pill-wine':'pill-pine')+'">'+verse.tag.toUpperCase()+'</span>' +
      '</div>' +

      renderNotifPromptBanner(signedIn, needsProfileSetup) +

      (!signedIn ? (
        '<div class="signin-card" id="signinCard">' +
          '<h3>Make It Yours</h3>' +
          '<p>Sign in to save your favorites, text size, and theme so they follow you to any device.</p>' +
          '<button class="btn btn-primary" id="signinBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>' +
            (usingDemoMode ? 'SET UP MY ACCOUNT (DEMO MODE)' : 'CONTINUE WITH GOOGLE') +
          '</button>' +
          (usingDemoMode ? '<p class="hint">Demo mode: no real Firebase project is connected yet, so this creates a local account on this device/browser only. Once a real project is wired up, this becomes real Google sign-in that follows you to any device.</p>' : '') +
          // Email/password login [2026-09-10] -- Jared: "I was thinking of
          // having a username password system as well so we can log in to
          // other devices without having to log in our google account
          // itself." A second way IN, alongside Google -- see Settings ->
          // Account for how an existing Google sign-in ADDS a password to
          // the same account rather than creating a separate one.
          '<p style="text-align:center;margin-top:10px;"><button type="button" class="switch-account" id="landingEmailAuthToggleBtn">'+(landingEmailAuthMode ? 'CANCEL' : 'OR SIGN IN WITH EMAIL &amp; PASSWORD')+'</button></p>' +
          (landingEmailAuthMode ? (
            '<div class="email-auth-form">' +
              '<div class="field"><label for="emailAuthEmail">EMAIL</label><input type="email" id="emailAuthEmail" placeholder="you@example.com"></div>' +
              '<div class="field"><label for="emailAuthPassword">PASSWORD</label><input type="password" id="emailAuthPassword" placeholder="'+(landingEmailAuthMode==='signup'?'At least 6 characters':'Your password')+'"></div>' +
              '<button class="btn btn-primary btn-block" id="emailAuthSubmitBtn" '+(landingEmailAuthBusy?'disabled':'')+'>'+(landingEmailAuthMode==='signup'?'CREATE ACCOUNT':'SIGN IN')+'</button>' +
              '<p class="hint" style="text-align:center;margin-top:8px;">'+(landingEmailAuthMode==='signup' ?
                'Already set up a password (maybe on another device)? <button type="button" class="switch-account" id="emailAuthSwitchModeBtn" style="display:inline;">SIGN IN INSTEAD</button>' :
                'No password set up yet? <button type="button" class="switch-account" id="emailAuthSwitchModeBtn" style="display:inline;">CREATE ONE</button>')+'</p>' +
            '</div>'
          ) : '') +
        '</div>'
      ) : needsProfileSetup ? (
        '<div class="signin-card" id="signinCard">' +
          '<h3>Almost There</h3>' +
          '<p>What should we call you, and which church is this for?</p>' +
          '<div class="field"><label for="nameInput">YOUR NAME</label><input type="text" id="nameInput" placeholder="e.g. Jared" value="'+escapeAttr((state.user && state.user.displayName) || '')+'" autofocus></div>' +
          '<div class="field"><label for="churchInput">YOUR CHURCH&rsquo;S NAME <span style="text-transform:none;font-weight:400;">(optional)</span></label><input type="text" id="churchInput" placeholder="e.g. Cedar Grove Baptist Church"></div>' +
          '<button class="btn btn-primary" id="saveProfileBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SAVE &amp; CONTINUE</button>' +
        '</div>'
      ) : '') +
      (name ? '<p style="text-align:center;"><button class="switch-account" id="switchAccountBtn">NOT '+escapeHtml(name)+'? SIGN OUT</button></p>' : '') +
      (signedIn ? ('<p class="hint" style="text-align:center;">Your Account ID (share with an Admin for role or beta access): <code id="myUidText">'+escapeHtml(state.user.uid)+'</code> <button type="button" class="switch-account" id="copyUidBtn" style="display:inline;">COPY</button></p>') : '') +

      (favCount ? ('<div class="quick-links"><button class="btn btn-ghost" id="goFavBtn"><svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">'+icon('heart')+'</svg>VIEW YOUR '+favCount+' FAVORITE'+(favCount===1?'':'S')+'</button></div>') : '') +

      // Homepage redesign [2026-09-10] -- Jared: "having fellowship as the
      // main attraction is better." Fellowship's preview leads; Hymnal and
      // Host both already have their own persistent bottom tab, so this
      // page no longer duplicates those two as big buttons -- just the
      // Bible (which has no tab of its own) and the smaller utility links.
      renderLandingFellowshipSection(signedIn) +

      '<button class="btn btn-ghost btn-lg btn-block" id="openBibleBtn" style="margin-top:14px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg>OPEN THE BIBLE (KJV)</button>' +
      '<button class="btn btn-ghost btn-lg btn-block" id="openDevotionalsBtn" style="margin-top:10px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg>DAILY DEVOTIONALS</button>' +
      // Media Library, promoted to its own Home button [2026-09-24, Jared:
      // "let's add it as a separate section as well just like devotionals
      // (of course this will only appear to those who have host access)"
      // -- then, separately, "i can't find the media library section" once
      // the notification/upload-tray/back-forward work shipped without
      // this]. Before this it was reachable ONLY via a small link buried
      // inside the Host Hub card (renderHostHub(), below) -- easy to miss
      // entirely if you'd never opened Host Hub for another reason. Mirrors
      // the Bible/Devotionals buttons just above exactly (same style, same
      // "big button on Home" treatment); canHost()-gated since it's a
      // host-only tool, same gate the Host Hub link itself already used.
      (canHost() ? ('<button class="btn btn-ghost btn-lg btn-block" id="openMediaLibraryFromHomeBtn" style="margin-top:10px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('image')+'</svg>MEDIA LIBRARY</button>') : '') +
      '<p style="text-align:center;margin-top:14px;">' +
      (signedIn ? '<button class="switch-account" id="messagesBtn">MESSAGES</button> &middot; <button class="switch-account" id="landingShortsBtn">SHORTS</button> &middot; <button class="switch-account" id="landingExploreBtn">EXPLORE</button> &middot; ' : '') +
      '<button class="switch-account" id="plansBtn">PLANS &amp; PRICING</button>' +
      ((state.isEditor || hasFullAccess()) ? ' &middot; <button class="switch-account" id="reviewRequestsBtn">SONG REQUESTS</button>' : '') +
      (state.isAdmin ? ' &middot; <button class="switch-account" id="adminBtn">ADMIN TOOLS</button>' : '') +
      '</p>';

    const goFav = document.getElementById('goFavBtn');
    if(goFav) goFav.addEventListener('click', function(){ state.showFavoritesOnly=true; state.view='list'; render(); window.scrollTo(0,0); });
    const copyUidBtn = document.getElementById('copyUidBtn');
    if(copyUidBtn) copyUidBtn.addEventListener('click', function(){
      const text = state.user.uid;
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){ showToast('Account ID copied.'); }).catch(function(){ showToast(text); });
      } else { showToast(text); }
    });
    const landingOpenFellowshipBtn = document.getElementById('landingOpenFellowshipBtn');
    if(landingOpenFellowshipBtn) landingOpenFellowshipBtn.addEventListener('click', function(){ openFellowshipFeed(); });
    document.querySelectorAll('[data-landing-feed-tab]').forEach(function(btn){
      btn.addEventListener('click', function(){ state.landingFeedTab = btn.getAttribute('data-landing-feed-tab'); render(); });
    });
    if(signedIn){ attachFeedActionHandlers(); }
    document.querySelectorAll('[data-open-profile]').forEach(function(btn){
      btn.addEventListener('click', function(){ openProfileView(btn.getAttribute('data-open-profile')); });
    });
    const messagesBtn = document.getElementById('messagesBtn');
    if(messagesBtn) messagesBtn.addEventListener('click', function(){ openMessages(); });
    const landingShortsBtn = document.getElementById('landingShortsBtn');
    if(landingShortsBtn) landingShortsBtn.addEventListener('click', function(){ openShortsFeed(); });
    const landingExploreBtn = document.getElementById('landingExploreBtn');
    if(landingExploreBtn) landingExploreBtn.addEventListener('click', function(){ openExplore(); });
    const switchBtn = document.getElementById('switchAccountBtn');
    if(switchBtn) switchBtn.addEventListener('click', async function(){ await signOutUser(); });
    document.getElementById('plansBtn').addEventListener('click', function(){ state.view='plans'; render(); window.scrollTo(0,0); });
    document.getElementById('openBibleBtn').addEventListener('click', function(){ state.view='bible'; render(); window.scrollTo(0,0); });
    document.getElementById('openDevotionalsBtn').addEventListener('click', function(){ state.view='devotionals'; render(); window.scrollTo(0,0); });
    const openMediaLibraryFromHomeBtn = document.getElementById('openMediaLibraryFromHomeBtn');
    if(openMediaLibraryFromHomeBtn) openMediaLibraryFromHomeBtn.addEventListener('click', function(){ openMediaLibrary('landing'); });
    const reviewRequestsBtn = document.getElementById('reviewRequestsBtn');
    if(reviewRequestsBtn) reviewRequestsBtn.addEventListener('click', function(){
      state.view='song-request-queue'; render(); window.scrollTo(0,0); startPendingSongRequestsWatch();
    });
    const adminBtn = document.getElementById('adminBtn');
    if(adminBtn) adminBtn.addEventListener('click', function(){ state.view='admin'; render(); window.scrollTo(0,0); startAdminChurchesWatch(); startAdminUsersWatch(); startPendingReportsWatch(); startDirectoryWatch(); });

    const signinBtn = document.getElementById('signinBtn');
    if(signinBtn) signinBtn.addEventListener('click', async function(){
      signinBtn.disabled = true;
      try{ await signInWithGoogle(); }
      catch(e){ showToast('Sign-in didn&rsquo;t go through. Please try again.'); signinBtn.disabled = false; }
      // state.user updates via the watchAuth subscription and re-renders on its own.
    });
    const emailAuthToggleBtn = document.getElementById('landingEmailAuthToggleBtn');
    if(emailAuthToggleBtn) emailAuthToggleBtn.addEventListener('click', function(){
      landingEmailAuthMode = landingEmailAuthMode ? null : 'signin';
      render();
    });
    const emailAuthSwitchModeBtn = document.getElementById('emailAuthSwitchModeBtn');
    if(emailAuthSwitchModeBtn) emailAuthSwitchModeBtn.addEventListener('click', function(){
      landingEmailAuthMode = landingEmailAuthMode === 'signup' ? 'signin' : 'signup';
      render();
    });
    const emailAuthSubmitBtn = document.getElementById('emailAuthSubmitBtn');
    if(emailAuthSubmitBtn) emailAuthSubmitBtn.addEventListener('click', async function(){
      const email = document.getElementById('emailAuthEmail').value.trim();
      const password = document.getElementById('emailAuthPassword').value;
      if(!email || !password){ showToast('Enter both an email and a password.'); return; }
      landingEmailAuthBusy = true; render();
      try{
        if(landingEmailAuthMode === 'signup') await signUpWithEmail(email, password);
        else await signInWithEmail(email, password);
        landingEmailAuthMode = null;
        // state.user updates via the watchAuth subscription and re-renders on its own.
      }catch(e){
        showToast((e && e.message) ? e.message : 'That didn&rsquo;t work &mdash; check your email and password and try again.');
      }
      landingEmailAuthBusy = false; render();
    });
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if(saveProfileBtn) saveProfileBtn.addEventListener('click', async function(){
      const val = document.getElementById('nameInput').value.trim();
      if(!val){ showToast('Type a name first.'); return; }
      const churchVal = document.getElementById('churchInput').value.trim();
      await saveProfile(state.user.uid, { displayName: val, churchName: churchVal || '' });
      // watchProfile's subscription re-renders once the write lands.
    });
    const notifBannerDismissBtn = document.getElementById('notifBannerDismissBtn');
    if(notifBannerDismissBtn) notifBannerDismissBtn.addEventListener('click', function(){
      safeSet('iworship:notifBannerDismissed', '1'); render();
    });
    const notifBannerEnableBtn = document.getElementById('notifBannerEnableBtn');
    if(notifBannerEnableBtn) notifBannerEnableBtn.addEventListener('click', async function(){
      notifBannerEnableBtn.disabled = true;
      // Either outcome (granted or not) means this banner has done its job --
      // 'denied'/'unsupported' can't be fixed by asking again from here (the
      // browser itself won't re-prompt), and Settings -> Notifications always
      // explains what to do instead, so there's no reason to keep nagging.
      safeSet('iworship:notifBannerDismissed', '1');
      try{
        const result = await enablePushNotifications(state.user.uid);
        if(result === 'granted') showToast('Notifications are on for this device.');
        else if(result === 'denied') showToast('Permission wasn&rsquo;t granted &mdash; you can try again anytime from Settings.');
        else if(result === 'unsupported') showToast('Push isn&rsquo;t supported in this browser.');
      }catch(e){ showToast('That didn&rsquo;t work &mdash; you can try again anytime from Settings.'); }
      // [2026-09-18] Previously just re-rendered the landing page, leaving the
      // user to find the notification preference toggles (and, on a denied/
      // unsupported outcome, the fuller background-activity/OS-settings
      // guidance) themselves in Settings -- Jared reported exactly this
      // friction ("it didn't take me to the settings, I had to go to the
      // settings myself"). Every outcome now lands the user on Settings
      // directly, since that's the one place with both the preference
      // toggles and the follow-up guidance regardless of what the browser's
      // permission prompt actually returned.
      state.view = 'settings';
      render();
      window.scrollTo(0,0);
    });

    // First-run tour [2026-09-24] -- see showTourOverlay()'s own comment
    // for the full design. Deliberately gated on !needsProfileSetup so it
    // never competes with the "Almost There" name/church form for a brand
    // new sign-up -- it shows the first time this device lands on a fully
    // set-up Home screen instead (signed in or signed out both count).
    if(!needsProfileSetup) maybeShowWelcomeTour();
  }

  // Host hub [2026-09-10] -- extracted from the old landing page's "Worship
  // Sessions" card into its own screen, reachable from the persistent HOST
  // bottom tab (see the HOST_VIEWS set near renderBottomTabs()). Nothing
  // about hosting itself changed -- same canHost()/session-setup/sermons/
  // media-library flows as before, just given a dedicated home instead of
  // sharing the landing page with everything else.
  function renderHostHub(){
    const signedIn = !!state.user;
    main.innerHTML =
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Host</p>' +
        '<p class="landing-sub">Lead a live worship session, prep a sermon, or manage what you&rsquo;ve shared.</p>' +
      '</div>' +

      '<div class="session-card">' +
        '<h3>Worship Sessions</h3>' +
        '<p>Follow along live as your Pastor or Worship Leader moves through the service &mdash; everyone sees the same song and section at the same time.</p>' +
        '<div class="session-choice-row">' +
          '<button class="btn '+(canHost()?'btn-primary':'btn-ghost')+'" id="hostServiceBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('mic')+'</svg>HOST A SERVICE'+(canHost()?'':' (PAID)')+'</button>' +
          '<button class="btn btn-ghost" id="joinServiceBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg>JOIN A SERVICE</button>' +
        '</div>' +
        '<p style="text-align:center;margin-top:14px;"><button class="switch-account" id="mySessionsBtn">MANAGE MY SESSIONS</button>' +
          (canHost() ? ' &middot; <button class="switch-account" id="sermonsBtn">SERMONS</button>' : '') +
          (canHost() ? ' &middot; <button class="switch-account" id="mediaLibraryBtn">MEDIA LIBRARY</button>' : '') +
        '</p>' +
      '</div>';

    document.getElementById('hostServiceBtn').addEventListener('click', function(){
      if(!canHost()){ showToast('Hosting is a paid feature (Editor, Music Director, or Individual Premium). See Plans & Pricing, or ask an Admin about beta access.'); return; }
      state.view='session-setup'; render(); window.scrollTo(0,0);
    });
    document.getElementById('joinServiceBtn').addEventListener('click', function(){
      state.view='session-join'; render(); window.scrollTo(0,0); startPublicRoomsWatch();
    });
    document.getElementById('mySessionsBtn').addEventListener('click', function(){
      mySessionsConfirmCode = null;
      state.view='my-sessions'; render(); window.scrollTo(0,0); startHostRoomsWatch(); startCoHostRoomsWatch();
    });
    const sermonsBtn = document.getElementById('sermonsBtn');
    if(sermonsBtn) sermonsBtn.addEventListener('click', function(){
      state.view='sermons'; render(); window.scrollTo(0,0); startMySermonsWatch(); startSharedSermonsWatch(); startDirectoryWatch();
    });
    const mediaLibraryBtn = document.getElementById('mediaLibraryBtn');
    if(mediaLibraryBtn) mediaLibraryBtn.addEventListener('click', function(){ openMediaLibrary('host-hub'); });
  }

  // Notification preferences [2026-09-17] -- Jared: "new sessions from
  // their church members or other people they follow, or even a notif
  // about today's bible verse, or other things that you think should be
  // added there." Both of these are genuinely new, potentially-frequent
  // broadcast-style pushes (unlike a DM or a like, which are 1:1 and rare
  // enough that nobody asked for a way to mute them), so each gets its own
  // toggle rather than being bundled silently into "push is on/off" --
  // reads notifPrefs off state.profile (see defaultProfile() in both data
  // layers: absent/undefined means on) and persists a change with the same
  // saveProfile() merge every other profile edit in this app already uses,
  // so this needs no new data-layer function and no firestore.rules change.
  // Only rendered once push is actually granted for this device -- toggling
  // a preference for notifications you can't receive yet would be
  // confusing, so ENABLE PUSH NOTIFICATIONS above always comes first.
  function renderNotifPrefsSection(){
    const prefs = (state.profile && state.profile.notifPrefs) || {};
    function row(key, label, iconPaths){
      const on = prefs[key] !== false;
      return '<div class="pref-toggle-row"><p>'+label+'</p>' +
        '<label class="pref-toggle"><input type="checkbox" data-notif-pref="'+key+'"'+(on?' checked':'')+'>' +
        '<span class="pref-toggle-track"></span></label></div>';
    }
    return '<div style="margin-top:14px;">' +
      '<p class="control-label uc" style="margin-bottom:2px;">What you get notified about</p>' +
      row('sessions', 'New public worship sessions from people you follow, or your own church') +
      row('dailyVerse', 'Daily Bible verse') +
      row('dailyDevotional', 'Daily devotional') +
      '<p class="hint" style="margin-top:6px;">Messages and Fellowship activity (likes, comments, follows, reposts) always notify you &mdash; these are the only ones you can turn off.</p>' +
    '</div>';
  }

  // Settings [2026-09-10] -- Jared: "we can move the light/dark mode in the
  // settings, you can create a settings interface that can be accessed
  // through the burger button... settings will cover preferences, password,
  // account switching/log in/log out, and all other things you can come up
  // with." Reachable from the hamburger drawer's SETTINGS item (see
  // renderHamburgerDrawerBody()) -- covers theme preference (moved out of
  // the top bar), adding a password login alongside Google, push
  // notifications, and sign out.
  function renderSettings(){
    const signedIn = !!state.user;
    const pref = themePreference();
    const linked = signedIn && hasPasswordLogin();
    const notifPermission = currentNotificationPermission();
    // Push "off" state [2026-09-22] -- Jared: "can't turn off notifs at
    // will as well, button is not working." The browser's own
    // Notification.permission is a one-way ratchet: once granted, there is
    // no JS API to un-grant it (only the user, from their browser's own
    // site-settings UI, can do that) -- so `notifPermission` alone can never
    // go back to anything but 'granted' after the first time. TURN OFF FOR
    // THIS DEVICE below only deletes this device's saved FCM token (see
    // disablePushNotifications() in the data layer), which is the right,
    // real effect (this device stops receiving pushes) but before this fix
    // nothing in this render() branched on it -- notifPermission was still
    // 'granted' a moment later, so the exact same "on" branch/button
    // re-rendered and looked like the click had done nothing at all. This
    // flag is this app's own record of the user's last choice on THIS
    // device/browser, independent of the immutable permission flag, so the
    // UI can actually show an "off" state and a way back "on" from it.
    const pushDisabledHere = signedIn && safeGet('iworship:pushDisabledOnThisDevice:'+state.user.uid, '') === '1';

    function themeOption(value, label){
      return '<button type="button" class="settings-theme-opt'+(pref===value?' settings-theme-opt-active':'')+'" data-theme-pref="'+value+'">'+label+'</button>';
    }

    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="settingsBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero"><p class="display landing-greeting">Settings</p></div>' +

      '<div class="session-card">' +
        '<h3>Preferences</h3>' +
        '<p class="hint" style="margin-top:-6px;">Appearance</p>' +
        '<div class="settings-theme-row">' + themeOption('system','SYSTEM') + themeOption('light','LIGHT') + themeOption('dark','DARK') + '</div>' +
      '</div>' +

      (signedIn ? (
        '<div class="session-card">' +
          '<h3>Account</h3>' +
          (usingDemoMode ?
            '<p class="hint">Demo mode: a local account on this device/browser only.</p>' :
            '<p>Signed in with Google'+(state.user.email ? (' as '+escapeHtml(state.user.email)) : '')+'.</p>'
          ) +
          (linked ?
            '<p class="hint">&#10003; Email &amp; password login is also set up for this account &mdash; you can sign in with either on any device.</p>' :
            (
              '<p class="hint">Add a password so you (or your wife) can sign in on another device without going through Google.</p>' +
              '<p style="text-align:center;"><button type="button" class="switch-account" id="settingsAddPasswordToggleBtn">'+(state.settingsAddPasswordOpen ? 'CANCEL' : 'ADD A PASSWORD LOGIN')+'</button></p>' +
              (state.settingsAddPasswordOpen ? (
                '<div class="email-auth-form">' +
                  '<div class="field"><label for="settingsPwEmail">EMAIL</label><input type="email" id="settingsPwEmail" placeholder="you@example.com" value="'+escapeAttr(state.user.email||'')+'"></div>' +
                  '<div class="field"><label for="settingsPwPassword">PASSWORD</label><input type="password" id="settingsPwPassword" placeholder="At least 6 characters"></div>' +
                  '<button class="btn btn-primary btn-block" id="settingsPwSaveBtn">SAVE PASSWORD LOGIN</button>' +
                '</div>'
              ) : '')
            )
          ) +
          '<p style="text-align:center;margin-top:14px;"><button type="button" class="switch-account" id="settingsSwitchAccountBtn">SWITCH ACCOUNT / SIGN OUT</button></p>' +
        '</div>'
      ) : (
        '<div class="session-card"><h3>Account</h3><p>Sign in from the home screen to manage your account here.</p></div>'
      )) +

      // Default Presentation Background [2026-09-24] -- see
      // presenterStageBg()'s comment near newSermonSlide() for the full
      // design. Gated to the same people who can actually present
      // something with it (canHost(), or the legacy isEditor allowlist, or
      // an Admin/beta tester) -- a plain congregant account has no use for
      // this control, same reasoning as canHost() itself.
      (signedIn && (canHost() || state.isEditor || hasFullAccess()) ? (
        '<div class="session-card">' +
          '<h3>Presentation Background</h3>' +
          '<p class="hint" style="margin-top:-6px;">Shown behind song lyrics on the stage/projector view, and used as the starting background for new in-app sermon slides &mdash; a slide you&rsquo;ve already given its own background keeps it either way.</p>' +
          (presenterStageBg() ?
            '<div class="stage-bg-preview"><img src="'+escapeAttr(presenterStageBg().url)+'" alt=""></div>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">' +
              '<label class="btn btn-ghost" style="cursor:pointer;">REPLACE<input type="file" accept="image/*" id="stageBgFileInput" style="display:none;"></label>' +
              '<button type="button" class="btn btn-ghost" id="stageBgRemoveBtn">REMOVE</button>' +
            '</div>'
            :
            '<label class="btn btn-primary" style="cursor:pointer;">UPLOAD A BACKGROUND IMAGE<input type="file" accept="image/*" id="stageBgFileInput" style="display:none;"></label>'
          ) +
          '<p class="hint" id="settingsStageBgStatusText" style="margin-top:8px;">'+escapeHtml(state.settingsStageBgStatus||'')+'</p>' +
        '</div>'
      ) : '') +

      // Presentation Logo [2026-09-24] -- Jared: "I also don't see the
      // background logo, black, or option to add background." Exact mirror
      // of the Presentation Background card just above (same gating, same
      // upload/replace/remove flow) -- this is the image the new LOGO
      // stage-override button in the presenter toolbar shows full-screen
      // (see renderStageSlide()'s stage-override branch).
      (signedIn && (canHost() || state.isEditor || hasFullAccess()) ? (
        '<div class="session-card">' +
          '<h3>Presentation Logo</h3>' +
          '<p class="hint" style="margin-top:-6px;">Shown full-screen on the stage/projector view when you tap LOGO during a live session &mdash; handy for a church or ministry logo between songs.</p>' +
          (presenterLogoUrl() ?
            '<div class="stage-bg-preview"><img src="'+escapeAttr(presenterLogoUrl().url)+'" alt=""></div>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">' +
              '<label class="btn btn-ghost" style="cursor:pointer;">REPLACE<input type="file" accept="image/*" id="stageLogoFileInput" style="display:none;"></label>' +
              '<button type="button" class="btn btn-ghost" id="stageLogoRemoveBtn">REMOVE</button>' +
            '</div>'
            :
            '<label class="btn btn-primary" style="cursor:pointer;">UPLOAD A LOGO IMAGE<input type="file" accept="image/*" id="stageLogoFileInput" style="display:none;"></label>'
          ) +
          '<p class="hint" id="settingsStageLogoStatusText" style="margin-top:8px;">'+escapeHtml(state.settingsStageLogoStatus||'')+'</p>' +
        '</div>'
      ) : '') +

      (signedIn ? (
        '<div class="session-card">' +
          '<h3>Notifications</h3>' +
          (!pushNotificationsConfigured ?
            '<p class="hint">Push notifications aren&rsquo;t set up for this app yet &mdash; the in-app notification bell still works as before.</p>' :
            notifPermission === 'denied' ?
              '<p class="hint">Notifications are blocked for iWorship in this browser. To turn them back on, open your browser&rsquo;s site settings for this page and allow Notifications, then come back here.</p>' :
              notifPermission === 'granted' && !pushDisabledHere ?
                (
                  '<p>&#10003; Push notifications are on for this device.</p>' +
                  '<p class="hint">On a phone (Android): open Settings &rarr; Apps &rarr; iWorship &rarr; Battery and choose Unrestricted, so a push can still wake the app even when it&rsquo;s fully closed and the phone is trying to save battery. On a computer (Windows/Mac): make sure your browser itself is allowed to show notifications in your OS notification settings, and that Focus/Do Not Disturb isn&rsquo;t set to silence it.</p>' +
                  '<button type="button" class="btn btn-ghost" id="settingsDisablePushBtn">TURN OFF FOR THIS DEVICE</button>' +
                  renderNotifPrefsSection()
                ) : notifPermission === 'granted' && pushDisabledHere ? (
                  '<p>Push notifications are turned off for this device.</p>' +
                  '<p class="hint">Your browser still allows notifications for iWorship, but you turned them off here &mdash; turn them back on anytime, no new permission prompt needed.</p>' +
                  '<button type="button" class="btn btn-primary" id="settingsEnablePushBtn">TURN ON FOR THIS DEVICE</button>'
                ) : (
                  '<p>Get notified &mdash; even when iWorship is closed &mdash; when someone messages you, likes, comments, follows, or reposts; when a worship session goes live from someone you follow or your own church; and with a daily Bible verse. You&rsquo;ll be asked to allow notifications (and, on a phone, background activity) so a push can reach you even with the app fully closed.</p>' +
                  '<button type="button" class="btn btn-primary" id="settingsEnablePushBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/></svg>ENABLE PUSH NOTIFICATIONS</button>'
                )
          ) +
          (state.settingsPushStatus ? '<p class="hint" style="margin-top:8px;">'+escapeHtml(state.settingsPushStatus)+'</p>' : '') +
        '</div>'
      ) : '') +

      '<p class="hint" style="text-align:center;margin-top:6px;">iWorship &mdash; worship &amp; fellowship for your congregation: hymns, live sessions, sermons, Bible, and community.</p>';

    document.getElementById('settingsBackBtn').addEventListener('click', function(){ state.view='landing'; render(); window.scrollTo(0,0); });
    document.querySelectorAll('[data-theme-pref]').forEach(function(btn){
      btn.addEventListener('click', function(){ setThemePreference(btn.getAttribute('data-theme-pref')); });
    });
    const switchAccountBtn = document.getElementById('settingsSwitchAccountBtn');
    if(switchAccountBtn) switchAccountBtn.addEventListener('click', async function(){ await signOutUser(); state.view='landing'; render(); });
    const addPwToggleBtn = document.getElementById('settingsAddPasswordToggleBtn');
    if(addPwToggleBtn) addPwToggleBtn.addEventListener('click', function(){ state.settingsAddPasswordOpen = !state.settingsAddPasswordOpen; render(); });
    const pwSaveBtn = document.getElementById('settingsPwSaveBtn');
    if(pwSaveBtn) pwSaveBtn.addEventListener('click', async function(){
      const email = document.getElementById('settingsPwEmail').value.trim();
      const password = document.getElementById('settingsPwPassword').value;
      if(!email || !password){ showToast('Enter both an email and a password.'); return; }
      pwSaveBtn.disabled = true;
      try{
        await linkPasswordToAccount(email, password);
        state.settingsAddPasswordOpen = false;
        showToast('Password login added &mdash; you can now sign in with email + password on any device.');
      }catch(e){ showToast((e && e.message) ? e.message : 'Couldn&rsquo;t add that &mdash; try again.'); }
      pwSaveBtn.disabled = false; render();
    });
    const stageBgFileInput = document.getElementById('stageBgFileInput');
    if(stageBgFileInput) stageBgFileInput.addEventListener('change', async function(){
      const file = stageBgFileInput.files && stageBgFileInput.files[0];
      if(!file) return;
      const oldBg = presenterStageBg();
      state.settingsStageBgStatus = 'Uploading... 0%';
      const statusEl = document.getElementById('settingsStageBgStatusText');
      if(statusEl) statusEl.textContent = state.settingsStageBgStatus;
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'image', function(pct){
          state.settingsStageBgStatus = 'Uploading... ' + pct + '%';
          const el = document.getElementById('settingsStageBgStatusText');
          if(el) el.textContent = state.settingsStageBgStatus;
        });
        await saveProfile(state.user.uid, { defaultStageBg: { url: result.url, storagePath: result.storagePath } });
        // Best-effort cleanup of the file it's replacing -- never blocks the
        // new one taking effect if this fails (same "never blocks" pattern
        // deleteMedia()/deleteMediaFile() use everywhere else in this app).
        if(oldBg && oldBg.storagePath) deleteMediaFile(oldBg.storagePath).catch(function(){});
        state.settingsStageBgStatus = null;
        showToast('Presentation background saved.');
      }catch(e){
        state.settingsStageBgStatus = null;
        showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why.' + describeError(e));
      }
      render();
    });
    const stageBgRemoveBtn = document.getElementById('stageBgRemoveBtn');
    if(stageBgRemoveBtn) stageBgRemoveBtn.addEventListener('click', async function(){
      const oldBg = presenterStageBg();
      stageBgRemoveBtn.disabled = true;
      try{
        await saveProfile(state.user.uid, { defaultStageBg: null });
        if(oldBg && oldBg.storagePath) deleteMediaFile(oldBg.storagePath).catch(function(){});
        showToast('Removed.');
      }catch(e){ showToast('Couldn&rsquo;t remove &mdash; try again.'); }
      render();
    });
    // Presentation Logo [2026-09-24] -- exact mirror of the Presentation
    // Background upload/remove handlers just above.
    const stageLogoFileInput = document.getElementById('stageLogoFileInput');
    if(stageLogoFileInput) stageLogoFileInput.addEventListener('change', async function(){
      const file = stageLogoFileInput.files && stageLogoFileInput.files[0];
      if(!file) return;
      const oldLogo = presenterLogoUrl();
      state.settingsStageLogoStatus = 'Uploading... 0%';
      const statusEl = document.getElementById('settingsStageLogoStatusText');
      if(statusEl) statusEl.textContent = state.settingsStageLogoStatus;
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'image', function(pct){
          state.settingsStageLogoStatus = 'Uploading... ' + pct + '%';
          const el = document.getElementById('settingsStageLogoStatusText');
          if(el) el.textContent = state.settingsStageLogoStatus;
        });
        await saveProfile(state.user.uid, { presenterLogo: { url: result.url, storagePath: result.storagePath } });
        if(oldLogo && oldLogo.storagePath) deleteMediaFile(oldLogo.storagePath).catch(function(){});
        state.settingsStageLogoStatus = null;
        showToast('Presentation logo saved.');
      }catch(e){
        state.settingsStageLogoStatus = null;
        showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why.' + describeError(e));
      }
      render();
    });
    const stageLogoRemoveBtn = document.getElementById('stageLogoRemoveBtn');
    if(stageLogoRemoveBtn) stageLogoRemoveBtn.addEventListener('click', async function(){
      const oldLogo = presenterLogoUrl();
      stageLogoRemoveBtn.disabled = true;
      try{
        await saveProfile(state.user.uid, { presenterLogo: null });
        if(oldLogo && oldLogo.storagePath) deleteMediaFile(oldLogo.storagePath).catch(function(){});
        showToast('Removed.');
      }catch(e){ showToast('Couldn&rsquo;t remove &mdash; try again.'); }
      render();
    });
    const enablePushBtn = document.getElementById('settingsEnablePushBtn');
    if(enablePushBtn) enablePushBtn.addEventListener('click', async function(){
      enablePushBtn.disabled = true;
      try{
        const result = await enablePushNotifications(state.user.uid);
        state.settingsPushStatus = result === 'granted' ? 'Notifications enabled for this device.' :
          result === 'denied' ? 'Permission wasn&rsquo;t granted &mdash; check your browser&rsquo;s notification settings for this site.' :
          result === 'unsupported' ? 'Push isn&rsquo;t supported in this browser.' :
          'Push notifications aren&rsquo;t set up for this app yet.';
        // Re-enabling (whether this is a first grant, or turning back on
        // after a prior TURN OFF FOR THIS DEVICE below) always clears this
        // device's own "off" flag, so the settings screen's branch above
        // reflects it immediately -- see that flag's own comment.
        if(result === 'granted') safeRemove('iworship:pushDisabledOnThisDevice:'+state.user.uid);
      }catch(e){ state.settingsPushStatus = (e && e.message) ? e.message : 'That didn&rsquo;t work &mdash; try again.'; }
      render();
    });
    const disablePushBtn = document.getElementById('settingsDisablePushBtn');
    if(disablePushBtn) disablePushBtn.addEventListener('click', async function(){
      disablePushBtn.disabled = true;
      try{
        await disablePushNotifications(state.user.uid);
        // See the pushDisabledHere comment above renderSettings() -- this is
        // the only place that actually flips the UI's own "off" state, since
        // Notification.permission itself never leaves 'granted' once set.
        safeSet('iworship:pushDisabledOnThisDevice:'+state.user.uid, '1');
        state.settingsPushStatus = 'Turned off for this device.';
      }
      catch(e){ state.settingsPushStatus = 'Couldn&rsquo;t turn that off &mdash; try again.'; }
      render();
    });
    document.querySelectorAll('[data-notif-pref]').forEach(function(input){
      input.addEventListener('change', function(){
        const key = input.getAttribute('data-notif-pref');
        const prefs = { ...((state.profile && state.profile.notifPrefs) || {}), [key]: !!input.checked };
        state.profile = { ...state.profile, notifPrefs: prefs }; // optimistic, so the switch doesn't visually snap back before the write resolves
        saveProfile(state.user.uid, { notifPrefs: prefs }).catch(function(){ showToast('Couldn&rsquo;t save that preference &mdash; try again.'); });
      });
    });
  }

  // Plans & Pricing -- purely informational/marketing content, no backend
  // dependency at all. Prices are pesos-first per Jared's decision; the plan
  // shapes here mirror claude/monetization-plan.md in the project docs
  // exactly, so if that doc changes, update PLANS to match. None of the
  // seat limits, role gates, or billing described here are enforced by the
  // app yet -- see that doc's "Status" section for what's actually wired up
  // versus still on the roadmap.
  const PLANS = [
    {
      id: 'free', name: 'Free', tagline: 'For every member of the congregation',
      price: { annual: 0, quarterly: 0, monthly: 0 },
      features: [
        'Browse the full hymnal &amp; Sing Mode',
        'Favorites and topical search',
        'Join any church&rsquo;s live worship sessions',
        'Submit a song request for a worship-team editor to review'
      ],
      excluded: ['Play Mode (chords &amp; transpose)', 'Add songs directly', 'Host a worship session']
    },
    {
      id: 'starter', name: 'Starter', tagline: 'Small congregations getting started',
      price: { annual: 1899, quarterly: 549, monthly: 199 },
      features: [
        'Everything in Free',
        '1 Senior Pastor seat &mdash; manage your team, curate your church&rsquo;s view',
        'Up to 3 Editor seats &mdash; add new songs instantly (6/day cap each)',
        'Up to 5 Musician seats &mdash; Play Mode chords &amp; transpose',
        'Editors can host worship sessions (Sing Mode &amp; Play Mode)'
      ]
    },
    {
      id: 'growing', name: 'Growing', tagline: 'A fuller worship team and band',
      price: { annual: 3499, quarterly: 999, monthly: 379 },
      features: [
        'Everything in Starter',
        'Up to 10 Musician seats',
        '1 Music Director seat &mdash; hosts sessions, plus Play Mode access'
      ]
    },
    {
      id: 'full', name: 'Full', tagline: 'A large congregation, full band and team',
      price: { annual: 5299, quarterly: 1499, monthly: 599 },
      features: [
        'Everything in Growing',
        '3 Editor seats and 20 Musician seats included',
        '2 additional Pastor seats &mdash; custom titles like &ldquo;Music Pastor&rdquo;'
      ]
    },
    {
      id: 'enterprise', name: 'Enterprise', tagline: 'Larger than Full? Let&rsquo;s build a plan that fits',
      price: { annual: 'contact', quarterly: 'contact', monthly: 'contact' },
      features: [
        'Everything in Full',
        'Custom Pastor, Editor, Music Director &amp; Musician seat counts',
        'Contact us for a custom quote'
      ]
    },
    {
      id: 'individual', name: 'Individual Premium', tagline: 'Not part of a registered church? This is for you',
      price: { annual: 2499, quarterly: null, monthly: 269 },
      features: [
        'Add new songs instantly (6/day cap)',
        'Play Mode &mdash; chords &amp; transpose',
        'Host your own worship sessions (Sing Mode &amp; Play Mode)',
        'Join any church&rsquo;s fellowship sessions too'
      ]
    }
  ];

  let plansCadence = 'annual';

  function pesos(amount){
    return '&#8369;' + amount.toLocaleString('en-US');
  }

  function planPriceLine(plan){
    const amount = plan.price[plansCadence];
    if(amount === 'contact') return 'Contact us for a custom quote';
    if(amount == null) return 'Not offered on this billing option &mdash; see Annual or Monthly';
    if(amount === 0) return 'Free';
    const suffix = plansCadence === 'annual' ? ' / year' : plansCadence === 'quarterly' ? ' / quarter' : ' / month';
    return pesos(amount) + suffix;
  }

  function renderPlanCard(plan){
    return '<div class="session-card plan-card">' +
      '<h3>'+plan.name+'</h3>' +
      '<p class="hint" style="margin-top:-6px;">'+plan.tagline+'</p>' +
      '<p class="plan-price">'+planPriceLine(plan)+'</p>' +
      '<ul class="plan-feature-list">' + plan.features.map(function(f){ return '<li>'+f+'</li>'; }).join('') + '</ul>' +
      (plan.excluded ? '<ul class="plan-feature-list plan-feature-excluded">' + plan.excluded.map(function(f){ return '<li>'+f+'</li>'; }).join('') + '</ul>' : '') +
    '</div>';
  }

  function renderPlans(){
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="plansBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Plans &amp; Pricing</p>' +
        '<p class="landing-sub">One shared hymnal for every church &mdash; choose the plan that fits your congregation.</p>' +
      '</div>' +
      '<div class="toggle-row" id="cadenceToggle">' +
        '<button type="button" data-cadence="annual" class="'+(plansCadence==='annual'?'active':'')+'">ANNUAL</button>' +
        '<button type="button" data-cadence="quarterly" class="'+(plansCadence==='quarterly'?'active':'')+'">QUARTERLY</button>' +
        '<button type="button" data-cadence="monthly" class="'+(plansCadence==='monthly'?'active':'')+'">MONTHLY</button>' +
      '</div>' +
      '<p class="hint" style="text-align:center;margin:10px 0 20px;">Annual saves the most. Quarterly and monthly cost a bit more for the flexibility &mdash; a fixed one-time-a-year fee is easier for some churches to budget for than others.</p>' +
      '<p class="hint" style="text-align:center;margin:0 0 24px;">Every registered church gets its own curated song list &mdash; members can switch between the shared Public Library and their church&rsquo;s list any time. A 7-day grace period applies before paid features lock after a missed payment.</p>' +
      '<div class="plans-grid">' + PLANS.map(renderPlanCard).join('') + '</div>';

    document.getElementById('plansBackBtn').addEventListener('click', function(){ state.view='landing'; render(); window.scrollTo(0,0); });
    document.querySelectorAll('#cadenceToggle button').forEach(function(btn){
      btn.addEventListener('click', function(){ plansCadence = btn.getAttribute('data-cadence'); render(); });
    });
  }

  /* ============ ADMIN TOOLS ============ */
  // Beta phase only -- see src/data/interface.md's "BETA PHASE" section for
  // why an Admin can write churches/{id} and any users/{uid} straight from
  // the client instead of through Cloud Functions (Blaze isn't enabled
  // yet). Reachable only via renderLanding's "ADMIN TOOLS" link, which only
  // shows when state.isAdmin is true (set by checkIsAdmin() in watchAuth
  // above) -- but renderAdmin() below still snap-back-guards itself, same
  // defensive pattern as renderDetail()'s Play Mode check, in case isAdmin
  // flips false (e.g. signing out) while this view is still on screen.

  // Client-side convenience only -- mirrors functions/index.js's
  // PLAN_SEAT_LIMITS exactly, just to prefill the seat-limit inputs when a
  // plan is picked. Not enforced here; real enforcement lives in that file
  // once Cloud Functions actually deploy.
  const PLAN_SEAT_PRESETS = {
    pending:    { pastors: 0, editors: 0, musicDirectors: 0, musicians: 0 },
    free:       { pastors: 0, editors: 0, musicDirectors: 0, musicians: 0 },
    starter:    { pastors: 0, editors: 3, musicDirectors: 0, musicians: 5 },
    growing:    { pastors: 0, editors: 3, musicDirectors: 1, musicians: 10 },
    full:       { pastors: 2, editors: 3, musicDirectors: 1, musicians: 20 },
    enterprise: { pastors: 0, editors: 0, musicDirectors: 0, musicians: 0 } // no fixed preset -- type a custom quote
  };
  const ADMIN_ROLES = [
    { id: '', label: '(no role / free member)' },
    { id: 'seniorPastor', label: 'Senior Pastor' },
    { id: 'pastor', label: 'Pastor' },
    { id: 'musicDirector', label: 'Music Director' },
    { id: 'editor', label: 'Editor' },
    { id: 'musician', label: 'Musician' },
    { id: 'individualPremium', label: 'Individual Premium' }
  ];

  // null = just the church list is showing; an object = the register/edit
  // form is open -- adminEditingChurchId stays null for a brand new church,
  // or holds the id being edited (its draft is a copy, so Cancel discards
  // changes cleanly).
  let adminChurchDraft = null;
  let adminEditingChurchId = null;
  let adminLibraryQuery = '';
  function newChurchDraft(){
    return { name:'', plan:'pending', billingCadence:'annual', seatLimits: { ...PLAN_SEAT_PRESETS.pending }, hiddenSongIds: [] };
  }

  let adminRoleTargetUid = '';
  let adminRoleSelected = '';
  let adminRolePastorTitle = '';
  let adminRoleChurchId = '';
  let adminRoleUserQuery = '';
  let adminBetaTargetUid = '';
  let adminBetaUserQuery = '';
  // Song usage tracking [2026-09-24] -- see recordSongUsage()'s own comment
  // (data/firestore-data-layer.js) for how songUseCount/songLastUsedAt get
  // populated. Purely a local filter for this list, same pattern as
  // adminLibraryQuery above.
  let adminUsageQuery = '';

  function renderAdmin(){
    if(!state.isAdmin){ state.view='landing'; render(); return; }
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="adminBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Admin Tools</p>' +
        '<p class="landing-sub">Register churches, assign roles, and grant beta access &mdash; visible only to Admins.</p>' +
      '</div>' +
      '<div class="session-card">' +
        '<h3>Churches</h3>' +
        (state.adminChurches.length ? ('<ul class="setlist-items">' + state.adminChurches.map(function(c){
          return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(c.name||'(unnamed)')+'</span>' +
            '<span class="hint" style="margin-left:auto;margin-right:10px;">'+escapeHtml(c.plan||'pending')+'</span>' +
            '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-admin-edit-church="'+escapeAttr(c.id)+'" aria-label="Edit" style="width:auto;padding:0 8px;">EDIT</button></span></li>';
        }).join('') + '</ul>') : '<p class="hint">No churches registered yet.</p>') +
        (adminChurchDraft ? renderAdminChurchForm() :
          '<button class="btn btn-ghost" id="newChurchBtn" style="margin-top:14px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>REGISTER A NEW CHURCH</button>') +
      '</div>' +
      '<div class="session-card">' +
        '<h3>Assign a Role</h3>' +
        '<p>Paste the person&rsquo;s Account ID (they can copy it from their own landing page) and pick what they should have. A Senior Pastor can do everything a Pastor can, plus grant or remove the Pastor role itself &mdash; not yet enforced here since this whole screen is Admin-only already.</p>' +
        renderAdminRoleForm() +
      '</div>' +
      '<div class="session-card">' +
        '<h3>Beta Tester Access</h3>' +
        '<p>A beta tester bypasses every paid gate below (Play Mode, Add Song, Hosting) regardless of their role or plan &mdash; use this to onboard beta testers right now, no payment involved.</p>' +
        renderAdminBetaForm() +
      '</div>' +
      '<div class="session-card">' +
        '<h3>Song Usage</h3>' +
        '<p>How often each song has actually gone live in a session, most-used first &mdash; counted the moment a host hits GO LIVE, not just staged in preview.</p>' +
        renderAdminSongUsageSection() +
      '</div>' +
      '<div class="session-card">' +
        '<h3>Reports</h3>' +
        '<p>Posts and profiles reported by anyone in Fellowship &mdash; block/report was built in from day one, per Jared&rsquo;s call.</p>' +
        renderAdminReportsSection() +
      '</div>';

    document.getElementById('adminBackBtn').addEventListener('click', function(){
      stopAdminChurchesWatch(); stopAdminUsersWatch(); stopPendingReportsWatch(); stopDirectoryWatch(); adminChurchDraft = null; adminEditingChurchId = null;
      state.view='landing'; render(); window.scrollTo(0,0);
    });

    document.querySelectorAll('[data-admin-edit-church]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-admin-edit-church');
        const c = state.adminChurches.find(function(x){ return x.id===id; });
        if(!c) return;
        adminEditingChurchId = id;
        adminChurchDraft = {
          name: c.name || '', plan: c.plan || 'pending', billingCadence: c.billingCadence || 'annual',
          seatLimits: { ...(PLAN_SEAT_PRESETS[c.plan] || PLAN_SEAT_PRESETS.pending), ...(c.seatLimits || {}) },
          hiddenSongIds: (c.hiddenSongIds || []).slice()
        };
        adminLibraryQuery = '';
        render();
      });
    });
    const newChurchBtn = document.getElementById('newChurchBtn');
    if(newChurchBtn) newChurchBtn.addEventListener('click', function(){
      adminEditingChurchId = null;
      adminChurchDraft = newChurchDraft();
      adminLibraryQuery = '';
      render();
    });

    attachAdminChurchFormHandlers();
    attachAdminRoleFormHandlers();
    attachAdminBetaFormHandlers();
    attachAdminSongUsageHandlers();
    attachAdminReportsHandlers();
  }

  // Song usage tracking [2026-09-24] -- see adminUsageQuery's own comment
  // and recordSongUsage() (data/firestore-data-layer.js) for how the
  // underlying songUseCount/songLastUsedAt fields get populated. Reads
  // state.library (already kept live by watchSongs() for every screen),
  // no separate watch/query needed. Only songs with at least one recorded
  // use are listed, most-used first -- a full 0-use listing of the whole
  // hymnal would bury the signal Jared actually asked for ("tracking").
  function renderAdminUsageResults(query){
    const q = query.trim().toLowerCase();
    const used = state.library.filter(function(s){ return (s.songUseCount||0) > 0; });
    const filtered = q ? used.filter(function(s){ return (s.title||'').toLowerCase().includes(q); }) : used;
    filtered.sort(function(a,b){ return (b.songUseCount||0) - (a.songUseCount||0); });
    if(!filtered.length) return '<p class="hint">'+(used.length ? 'No songs match that search.' : 'No songs have gone live yet &mdash; this fills in as hosts actually present songs.')+'</p>';
    return '<ul class="setlist-items">' + filtered.slice(0,50).map(function(s){
      return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(s.title||'(untitled)')+'</span>' +
        '<span class="hint" style="margin-left:auto;text-align:right;">'+(s.songUseCount||0)+' time'+((s.songUseCount||0)===1?'':'s')+
        (s.songLastUsedAt ? ' &middot; last '+timeAgo(toMillis(s.songLastUsedAt)) : '') + '</span></li>';
    }).join('') + '</ul>';
  }
  function renderAdminSongUsageSection(){
    return '<div class="field" style="margin-bottom:12px;"><label for="adminUsageSearch">FILTER BY TITLE</label>' +
        '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="adminUsageSearch" placeholder="Search&hellip;" value="'+escapeAttr(adminUsageQuery)+'" autocomplete="off"></div>' +
      '</div>' +
      '<div id="adminUsageResults">' + renderAdminUsageResults(adminUsageQuery) + '</div>';
  }
  function attachAdminSongUsageHandlers(){
    const el = document.getElementById('adminUsageSearch');
    if(el && !el.dataset.wired){
      el.dataset.wired = '1';
      el.addEventListener('input', function(e){
        adminUsageQuery = e.target.value;
        const holder = document.getElementById('adminUsageResults');
        if(holder) holder.innerHTML = renderAdminUsageResults(adminUsageQuery);
      });
    }
  }

  // Fellowship [2026-09-08] -- Admin moderation queue. A report just links
  // to its target by type+id; this resolves that into a readable summary
  // (the reported post's own text/author, or the reported profile's name)
  // using whatever's already loaded (state.feedPosts/state.directory) --
  // good enough for a first pass, and never blocks the queue from
  // rendering if the underlying post/profile is gone.
  function renderAdminReportsSection(){
    if(!state.pendingReports.length) return '<p class="hint">Nothing pending &mdash; the queue is clear.</p>';
    return state.pendingReports.map(function(r){
      const reporter = directoryEntry(r.reportedByUid);
      let targetSummary;
      if(r.targetType === 'post'){
        const post = state.feedPosts.find(function(p){ return p.id === r.targetId; });
        targetSummary = post ? ('Post by '+(directoryEntry(post.authorUid)?escapeHtml(directoryEntry(post.authorUid).displayName||'(no name set)'):escapeHtml(post.authorName||'someone'))+': &ldquo;'+escapeHtml((post.text||'').slice(0,120))+'&rdquo;') : ('Post (id: '+escapeHtml(r.targetId)+', no longer in the feed)');
      } else {
        const d = directoryEntry(r.targetId);
        targetSummary = 'Profile: '+(d?escapeHtml(d.displayName||'(no name set)'):('id: '+escapeHtml(r.targetId)));
      }
      return '<div class="room-list-card" style="flex-direction:column;align-items:stretch;">' +
        '<p><strong>'+targetSummary+'</strong></p>' +
        '<p class="hint">Reported by '+(reporter?escapeHtml(reporter.displayName||'(no name set)'):escapeHtml(r.reportedByUid))+' &middot; '+postAge(r.createdAt)+'</p>' +
        '<p style="margin-top:6px;white-space:pre-wrap;">'+escapeHtml(r.reason||'')+'</p>' +
        '<div style="display:flex;gap:10px;margin-top:10px;">' +
          (r.targetType === 'post' ? ('<button class="btn btn-ghost" data-admin-delete-reported-post="'+escapeAttr(r.targetId)+'" data-report-id="'+r.id+'">DELETE POST</button>') : '') +
          '<button class="btn btn-primary" data-resolve-report="'+r.id+'">MARK RESOLVED</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function attachAdminReportsHandlers(){
    document.querySelectorAll('[data-resolve-report]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-resolve-report');
        btn.disabled = true;
        try{ await resolveReport(id, state.user.uid); showToast('Resolved.'); }
        catch(e){ showToast('Couldn&rsquo;t resolve &mdash; try again.'); btn.disabled = false; }
      });
    });
    document.querySelectorAll('[data-admin-delete-reported-post]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const postId = btn.getAttribute('data-admin-delete-reported-post');
        const reportId = btn.getAttribute('data-report-id');
        const post = state.feedPosts.find(function(p){ return p.id === postId; });
        btn.disabled = true;
        try{
          await deletePost(postId, post);
          await resolveReport(reportId, state.user.uid);
          showToast('Post deleted and report resolved.');
        }catch(e){ showToast('Couldn&rsquo;t finish that &mdash; try again.'); btn.disabled = false; }
      });
    });
  }

  function renderAdminHiddenList(ids){
    if(!ids.length) return '<p class="hint">No songs hidden from this church&rsquo;s library yet &mdash; members see the full Public Library either way.</p>';
    return '<ul class="setlist-items">' + ids.map(function(id){
      const s = state.library.find(function(x){ return x.id===id; });
      const title = s ? s.title : '(song removed from hymnal)';
      return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(title)+'</span>' +
        '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-hidden-remove="'+escapeAttr(id)+'" aria-label="Remove">&times;</button></span></li>';
    }).join('') + '</ul>';
  }

  function renderAdminChurchForm(){
    const d = adminChurchDraft;
    const sl = d.seatLimits || {};
    return '<div class="signin-card" style="margin-top:14px;">' +
      '<h3>'+(adminEditingChurchId ? 'Edit Church' : 'Register New Church')+'</h3>' +
      '<div class="field"><label for="churchNameInputAdmin">CHURCH NAME</label><input type="text" id="churchNameInputAdmin" placeholder="e.g. Cedar Grove Baptist Church" value="'+escapeAttr(d.name)+'"></div>' +
      '<div class="field"><label for="churchPlanSelect">PLAN</label><select id="churchPlanSelect">' +
        ['pending','free','starter','growing','full','enterprise'].map(function(p){
          return '<option value="'+p+'" '+(d.plan===p?'selected':'')+'>'+p.charAt(0).toUpperCase()+p.slice(1)+'</option>';
        }).join('') +
      '</select></div>' +
      '<div class="field"><label for="churchCadenceSelect">BILLING CADENCE</label><select id="churchCadenceSelect">' +
        ['annual','quarterly','monthly'].map(function(c){
          return '<option value="'+c+'" '+(d.billingCadence===c?'selected':'')+'>'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>';
        }).join('') +
      '</select></div>' +
      '<p class="control-label uc" style="margin:14px 0 8px;">Seat Limits</p>' +
      '<div class="field"><label for="seatPastors">PASTOR SEATS <span style="text-transform:none;font-weight:400;">(besides the Senior Pastor)</span></label><input type="number" min="0" id="seatPastors" value="'+(sl.pastors||0)+'"></div>' +
      '<div class="field"><label for="seatEditors">EDITOR SEATS</label><input type="number" min="0" id="seatEditors" value="'+(sl.editors||0)+'"></div>' +
      '<div class="field"><label for="seatMusicDirectors">MUSIC DIRECTOR SEATS</label><input type="number" min="0" id="seatMusicDirectors" value="'+(sl.musicDirectors||0)+'"></div>' +
      '<div class="field"><label for="seatMusicians">MUSICIAN SEATS</label><input type="number" min="0" id="seatMusicians" value="'+(sl.musicians||0)+'"></div>' +
      '<p class="control-label uc" style="margin:18px 0 8px;">Church Library &mdash; hide songs from this church&rsquo;s view</p>' +
      '<p class="hint">Members can always switch back to the Public Library and see everything &mdash; this only curates their default church view, never removes a song from the shared hymnal.</p>' +
      renderAdminHiddenList(d.hiddenSongIds) +
      '<div class="search-box" style="margin:14px 0 10px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="adminLibrarySearch" placeholder="Search songs to hide&hellip;" value="'+escapeAttr(adminLibraryQuery)+'" aria-label="Search songs to hide"></div>' +
      '<div id="adminLibraryAddResults">' + renderSetlistAddResults(adminLibraryQuery, d.hiddenSongIds, 'hidden') + '</div>' +
      '<div style="display:flex;gap:10px;margin-top:18px;">' +
        '<button class="btn btn-primary" id="saveChurchBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SAVE CHURCH</button>' +
        '<button class="btn btn-ghost" id="cancelChurchBtn">CANCEL</button>' +
      '</div>' +
    '</div>';
  }

  function attachAdminChurchFormHandlers(){
    if(!adminChurchDraft) return;
    const d = adminChurchDraft;
    const nameEl = document.getElementById('churchNameInputAdmin');
    if(nameEl) nameEl.addEventListener('input', function(e){ d.name = e.target.value; });
    const planEl = document.getElementById('churchPlanSelect');
    if(planEl) planEl.addEventListener('change', function(e){
      d.plan = e.target.value;
      d.seatLimits = { ...(PLAN_SEAT_PRESETS[d.plan] || PLAN_SEAT_PRESETS.pending) };
      render();
    });
    const cadenceEl = document.getElementById('churchCadenceSelect');
    if(cadenceEl) cadenceEl.addEventListener('change', function(e){ d.billingCadence = e.target.value; });
    const seatIdMap = { pastors:'seatPastors', editors:'seatEditors', musicDirectors:'seatMusicDirectors', musicians:'seatMusicians' };
    Object.keys(seatIdMap).forEach(function(key){
      const el = document.getElementById(seatIdMap[key]);
      if(el) el.addEventListener('input', function(e){ d.seatLimits[key] = Math.max(0, parseInt(e.target.value,10) || 0); });
    });

    document.querySelectorAll('[data-hidden-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-hidden-remove');
        d.hiddenSongIds = d.hiddenSongIds.filter(function(x){ return x!==id; });
        render();
      });
    });
    document.querySelectorAll('[data-hidden-add]').forEach(function(btn){
      btn.addEventListener('click', function(){
        d.hiddenSongIds.push(btn.getAttribute('data-hidden-add'));
        adminLibraryQuery = '';
        render();
      });
    });
    const searchEl = document.getElementById('adminLibrarySearch');
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      searchEl.addEventListener('input', function(e){
        adminLibraryQuery = e.target.value;
        const holder = document.getElementById('adminLibraryAddResults');
        if(holder) holder.innerHTML = renderSetlistAddResults(adminLibraryQuery, d.hiddenSongIds, 'hidden');
        document.querySelectorAll('[data-hidden-add]').forEach(function(btn){
          btn.addEventListener('click', function(){
            d.hiddenSongIds.push(btn.getAttribute('data-hidden-add'));
            adminLibraryQuery = '';
            render();
          });
        });
      });
    }

    const saveBtn = document.getElementById('saveChurchBtn');
    if(saveBtn) saveBtn.addEventListener('click', async function(){
      const name = (d.name||'').trim();
      if(!name){ showToast('Give the church a name first.'); return; }
      saveBtn.disabled = true;
      try{
        const isNew = !adminEditingChurchId;
        const id = adminEditingChurchId || newChurchId();
        const patch = {
          name: name, plan: d.plan, billingCadence: d.billingCadence,
          seatLimits: { ...d.seatLimits }, hiddenSongIds: d.hiddenSongIds.slice()
        };
        if(isNew) patch.createdAt = Date.now();
        await saveChurch(id, patch);
        showToast('Saved &ldquo;'+name+'&rdquo;.');
        adminChurchDraft = null; adminEditingChurchId = null; adminLibraryQuery = '';
        render();
      }catch(e){
        showToast('Couldn&rsquo;t save that church &mdash; check you&rsquo;re still signed in as an Admin.');
        saveBtn.disabled = false;
      }
    });
    const cancelBtn = document.getElementById('cancelChurchBtn');
    if(cancelBtn) cancelBtn.addEventListener('click', function(){
      adminChurchDraft = null; adminEditingChurchId = null; adminLibraryQuery = '';
      render();
    });
  }

  // Shared by both the role-assignment and beta-access forms: a live
  // "find by name" search over state.adminUsers (see watchAllUsers() /
  // startAdminUsersWatch() above), so an Admin doesn't need the person to
  // have already copied and sent their Account ID. `prefix` keeps the two
  // forms' pick buttons (data-admin-pick-role-uid / data-admin-pick-beta-uid)
  // from colliding, same trick as renderSetlistItems'/renderSetlistAddResults'
  // `prefix` argument elsewhere in this file.
  function renderAdminUserResults(query, prefix){
    const q = query.trim().toLowerCase();
    if(!q) return '';
    const matches = state.adminUsers.filter(function(u){
      return (u.displayName||'').toLowerCase().includes(q) || (u.churchName||'').toLowerCase().includes(q);
    }).slice(0,8);
    if(!matches.length) return '<p class="hint">No matching accounts found by name &mdash; they may not have set a display name yet. Ask them to sign in and enter a name, or paste their Account ID directly below.</p>';
    return '<ul class="setlist-items">' + matches.map(function(u){
      return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(u.displayName||'(no name set)')+
        (u.churchName ? ' <span class="hint">&middot; '+escapeHtml(u.churchName)+'</span>' : '') +
        (u.role ? ' <span class="hint">&middot; '+escapeHtml(u.role)+'</span>' : '') +
        (u.isBetaTester ? ' <span class="hint">&middot; beta</span>' : '') +
        '</span>' +
        '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-admin-pick-'+prefix+'-uid="'+escapeAttr(u.uid)+'" aria-label="Use this account" style="width:auto;padding:0 8px;">USE</button></span></li>';
    }).join('') + '</ul>';
  }

  // Small confirmation line under the Account ID field once it matches
  // someone in state.adminUsers -- purely a "yes, that's the right person"
  // sanity check, whether the uid got there by search or by paste.
  function renderSelectedUserHint(uid){
    if(!uid) return '';
    const u = state.adminUsers.find(function(x){ return x.uid === uid; });
    if(!u) return '';
    return '<p class="hint" style="margin-top:-8px;">Selected: '+escapeHtml(u.displayName||'(no name set)')+(u.churchName ? ' &middot; '+escapeHtml(u.churchName) : '')+'</p>';
  }

  function renderAdminRoleForm(){
    return '<div class="field"><label for="adminRoleUserSearch">FIND BY NAME <span style="text-transform:none;font-weight:400;">(optional &mdash; or paste an Account ID below)</span></label>' +
        '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="adminRoleUserSearch" placeholder="Search by name&hellip;" value="'+escapeAttr(adminRoleUserQuery)+'" autocomplete="off"></div>' +
      '</div>' +
      '<div id="adminRoleUserResults">' + renderAdminUserResults(adminRoleUserQuery, 'role') + '</div>' +
      '<div class="field"><label for="adminRoleUidInput">ACCOUNT ID</label><input type="text" id="adminRoleUidInput" placeholder="Paste their Account ID, or pick a name above" value="'+escapeAttr(adminRoleTargetUid)+'"></div>' +
      renderSelectedUserHint(adminRoleTargetUid) +
      '<div class="field"><label for="adminRoleSelect">ROLE</label><select id="adminRoleSelect">' +
        ADMIN_ROLES.map(function(r){ return '<option value="'+r.id+'" '+(adminRoleSelected===r.id?'selected':'')+'>'+r.label+'</option>'; }).join('') +
      '</select></div>' +
      (adminRoleSelected === 'pastor' ? '<div class="field"><label for="adminPastorTitleInput">PASTOR TITLE <span style="text-transform:none;font-weight:400;">(optional, e.g. &ldquo;Music Pastor&rdquo;)</span></label><input type="text" id="adminPastorTitleInput" value="'+escapeAttr(adminRolePastorTitle)+'"></div>' : '') +
      '<div class="field"><label for="adminRoleChurchSelect">CHURCH <span style="text-transform:none;font-weight:400;">(optional)</span></label><select id="adminRoleChurchSelect">' +
        '<option value="">(none)</option>' +
        state.adminChurches.map(function(c){ return '<option value="'+escapeAttr(c.id)+'" '+(adminRoleChurchId===c.id?'selected':'')+'>'+escapeHtml(c.name||'(unnamed)')+'</option>'; }).join('') +
      '</select></div>' +
      '<button class="btn btn-primary" id="assignRoleBtn" style="margin-top:8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>ASSIGN</button>';
  }

  function wireAdminRolePickButtons(){
    document.querySelectorAll('[data-admin-pick-role-uid]').forEach(function(btn){
      btn.addEventListener('click', function(){
        adminRoleTargetUid = btn.getAttribute('data-admin-pick-role-uid');
        adminRoleUserQuery = '';
        render();
      });
    });
  }

  function attachAdminRoleFormHandlers(){
    const searchEl = document.getElementById('adminRoleUserSearch');
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      searchEl.addEventListener('input', function(e){
        adminRoleUserQuery = e.target.value;
        const holder = document.getElementById('adminRoleUserResults');
        if(holder) holder.innerHTML = renderAdminUserResults(adminRoleUserQuery, 'role');
        wireAdminRolePickButtons();
      });
    }
    wireAdminRolePickButtons();

    const uidEl = document.getElementById('adminRoleUidInput');
    if(uidEl) uidEl.addEventListener('input', function(e){ adminRoleTargetUid = e.target.value; });
    const roleEl = document.getElementById('adminRoleSelect');
    if(roleEl) roleEl.addEventListener('change', function(e){ adminRoleSelected = e.target.value; render(); });
    const titleEl = document.getElementById('adminPastorTitleInput');
    if(titleEl) titleEl.addEventListener('input', function(e){ adminRolePastorTitle = e.target.value; });
    const churchEl = document.getElementById('adminRoleChurchSelect');
    if(churchEl) churchEl.addEventListener('change', function(e){ adminRoleChurchId = e.target.value; });

    const assignBtn = document.getElementById('assignRoleBtn');
    if(assignBtn) assignBtn.addEventListener('click', async function(){
      const uid = adminRoleTargetUid.trim();
      if(!uid){ showToast('Paste the person&rsquo;s Account ID first, or find them by name above.'); return; }
      assignBtn.disabled = true;
      try{
        await saveProfile(uid, {
          role: adminRoleSelected || null,
          pastorTitle: adminRoleSelected === 'pastor' ? (adminRolePastorTitle.trim() || null) : null,
          churchId: adminRoleChurchId || null
        });
        showToast('Role saved for that account.');
        adminRoleTargetUid = ''; adminRoleSelected = ''; adminRolePastorTitle = ''; adminRoleChurchId = ''; adminRoleUserQuery = '';
        render();
      }catch(e){
        showToast('Couldn&rsquo;t save that role &mdash; double check the Account ID, and that you&rsquo;re still signed in as an Admin.');
        assignBtn.disabled = false;
      }
    });
  }

  function renderAdminBetaForm(){
    return '<div class="field"><label for="adminBetaUserSearch">FIND BY NAME <span style="text-transform:none;font-weight:400;">(optional &mdash; or paste an Account ID below)</span></label>' +
        '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="adminBetaUserSearch" placeholder="Search by name&hellip;" value="'+escapeAttr(adminBetaUserQuery)+'" autocomplete="off"></div>' +
      '</div>' +
      '<div id="adminBetaUserResults">' + renderAdminUserResults(adminBetaUserQuery, 'beta') + '</div>' +
      '<div class="field"><label for="adminBetaUidInput">ACCOUNT ID</label><input type="text" id="adminBetaUidInput" placeholder="Paste their Account ID, or pick a name above" value="'+escapeAttr(adminBetaTargetUid)+'"></div>' +
      renderSelectedUserHint(adminBetaTargetUid) +
      '<div style="display:flex;gap:10px;">' +
        '<button class="btn btn-primary" id="grantBetaBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>GRANT BETA ACCESS</button>' +
        '<button class="btn btn-ghost" id="revokeBetaBtn">REVOKE</button>' +
      '</div>';
  }

  function wireAdminBetaPickButtons(){
    document.querySelectorAll('[data-admin-pick-beta-uid]').forEach(function(btn){
      btn.addEventListener('click', function(){
        adminBetaTargetUid = btn.getAttribute('data-admin-pick-beta-uid');
        adminBetaUserQuery = '';
        render();
      });
    });
  }

  function attachAdminBetaFormHandlers(){
    const searchEl = document.getElementById('adminBetaUserSearch');
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      searchEl.addEventListener('input', function(e){
        adminBetaUserQuery = e.target.value;
        const holder = document.getElementById('adminBetaUserResults');
        if(holder) holder.innerHTML = renderAdminUserResults(adminBetaUserQuery, 'beta');
        wireAdminBetaPickButtons();
      });
    }
    wireAdminBetaPickButtons();

    const uidEl = document.getElementById('adminBetaUidInput');
    if(uidEl) uidEl.addEventListener('input', function(e){ adminBetaTargetUid = e.target.value; });
    async function setBeta(value){
      const uid = adminBetaTargetUid.trim();
      if(!uid){ showToast('Paste the person&rsquo;s Account ID first, or find them by name above.'); return; }
      try{
        await saveProfile(uid, { isBetaTester: value });
        showToast(value ? 'Beta access granted.' : 'Beta access revoked.');
      }catch(e){
        showToast('Couldn&rsquo;t update that account &mdash; double check the Account ID, and that you&rsquo;re still signed in as an Admin.');
      }
    }
    const grantBtn = document.getElementById('grantBetaBtn');
    if(grantBtn) grantBtn.addEventListener('click', function(){ setBeta(true); });
    const revokeBtn = document.getElementById('revokeBetaBtn');
    if(revokeBtn) revokeBtn.addEventListener('click', function(){ setBeta(false); });
  }

  function filteredResults(){
    const q = state.query.trim().toLowerCase();
    // Church Library view: the full shared hymnal minus whatever the
    // member's church has hidden -- an exclusion list, never a second copy
    // of the hymnal, so switching back to Public always shows everything
    // again. Only applies when a church is actually loaded; if state.church
    // hasn't arrived yet (or has no hiddenSongIds), nothing is filtered.
    const hidden = (state.libraryView === 'church' && state.church && state.church.hiddenSongIds) || [];
    return state.library.filter(function(s){
      if(hidden.includes(s.id)) return false;
      if(state.showFavoritesOnly && !isFavorite(s.id)) return false;
      if(state.activeTheme && !(s.themes||[]).includes(state.activeTheme)) return false;
      if(!q) return true;
      return s.title.toLowerCase().includes(q) || String(s.number).includes(q) ||
        (s.tags||[]).join(' ').toLowerCase().includes(q) ||
        (s.themes||[]).map(themeLabel).join(' ').toLowerCase().includes(q);
    });
  }

  // Shown on the hymnal list only when the signed-in member belongs to a
  // registered church -- lets them switch between the full shared library
  // and their own church's curated view. See filteredResults() above for
  // how hiddenSongIds is actually applied.
  function renderLibraryToggle(){
    if(!(state.profile && state.profile.churchId)) return '';
    return '<div class="toggle-row" id="libraryToggle" style="margin-bottom:14px;">' +
      '<button type="button" data-view="public" class="'+(state.libraryView==='public'?'active':'')+'">PUBLIC LIBRARY</button>' +
      '<button type="button" data-view="church" class="'+(state.libraryView==='church'?'active':'')+'">MY CHURCH&rsquo;S LIBRARY</button>' +
    '</div>';
  }
  function attachLibraryToggleHandlers(){
    const row = document.getElementById('libraryToggle');
    if(!row) return;
    row.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('click', function(){
        state.libraryView = btn.getAttribute('data-view');
        render(); window.scrollTo(0,0);
      });
    });
  }

  function renderFilterRow(){
    return '<p class="control-label uc" style="margin:0 0 10px;">Browse by Favorites or Theme</p><div class="filter-row">' +
      '<button class="chip '+(state.showFavoritesOnly?'active':'')+'" id="favChip"><svg viewBox="0 0 24 24" fill="'+(state.showFavoritesOnly?'currentColor':'none')+'" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">'+icon('heart')+'</svg>FAVORITES</button>' +
      THEMES.map(function(t){
        return '<button class="chip theme-chip '+(state.activeTheme===t.key?'active':'')+'" data-theme="'+t.key+'">'+t.label.toUpperCase()+'</button>';
      }).join('') +
    '</div>';
  }

  function attachFilterRowHandlers(){
    document.getElementById('favChip').addEventListener('click', function(){
      state.showFavoritesOnly = !state.showFavoritesOnly; render(); window.scrollTo(0,0);
    });
    document.querySelectorAll('.theme-chip').forEach(function(btn){
      btn.addEventListener('click', function(){
        const key = btn.getAttribute('data-theme');
        state.activeTheme = (state.activeTheme === key) ? null : key;
        render(); window.scrollTo(0,0);
      });
    });
  }

  function renderList(){
    const results = filteredResults();

    main.innerHTML =
      protoBadge() +
      '<div class="search-row">' +
        '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
          '<input type="text" id="searchInput" placeholder="Search by title, number, tag, or theme&hellip;" value="'+escapeAttr(state.query)+'" aria-label="Search hymns"></div>' +
        '<button class="btn '+(canAddSongs()?'btn-primary':'btn-ghost')+'" id="addSongBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD A SONG'+(canAddSongs()?'':' (PAID)')+'</button>' +
        (canAddSongs() ? '' : '<button class="btn btn-ghost" id="requestSongBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>REQUEST A SONG</button>') +
      '</div>' +
      renderLibraryToggle() +
      renderFilterRow() +
      ((state.isEditor && aiTaggingConfigured) ? renderAiTagBulkControl() : '') +
      '<div class="section-heading"><h2 class="uc">Hymnal</h2><span class="count-note">' + results.length + ' of ' + state.library.length + ' songs</span></div>' +
      (results.length ? renderHymnList(results) : renderEmpty());

    document.getElementById('searchInput').addEventListener('input', function(e){
      state.query = e.target.value;
      updateLibraryCountNote(); // instant feedback -- see its own comment
      debouncedRenderListInPlace();
    });
    document.getElementById('addSongBtn').addEventListener('click', function(){
      if(!canAddSongs()){ showToast('Adding songs directly is a paid feature (Editor or Individual Premium). See Plans & Pricing, or ask an Admin about beta access.'); return; }
      state.view='add'; render(); window.scrollTo(0,0);
    });
    const requestSongBtn = document.getElementById('requestSongBtn');
    if(requestSongBtn) requestSongBtn.addEventListener('click', function(){
      if(!state.user){ showToast('Sign in first so we know who submitted this request.'); return; }
      state.view='song-request'; render(); window.scrollTo(0,0); startMySongRequestsWatch();
    });
    attachLibraryToggleHandlers();
    attachFilterRowHandlers();
    attachCardHandlers();
    const aiTagBulkBtn = document.getElementById('aiTagBulkBtn');
    if(aiTagBulkBtn) aiTagBulkBtn.addEventListener('click', runBulkAiTag);
  }

  // Shown to editors only, and only once AI tagging is configured (see
  // ai-config.js) -- lets a signed-in worship-team member catch every song
  // in the library that doesn't have a theme yet (including songs added
  // before this feature existed, or via Bulk Add without a Themes: line)
  // and have the AI suggest one in one pass, instead of opening each song
  // by hand. Reads live from state.aiTagBulk so the in-progress state
  // survives the re-renders that watchSongs() triggers as each song gets
  // updated mid-run (see runBulkAiTag below).
  function renderAiTagBulkControl(){
    const bulk = state.aiTagBulk;
    if(bulk && bulk.running){
      return '<div class="hint" style="margin:10px 0;">AI-tagging ' + bulk.current + ' of ' + bulk.total +
        (bulk.currentTitle ? (' &mdash; &ldquo;' + escapeHtml(bulk.currentTitle) + '&rdquo;') : '') + '&hellip;</div>';
    }
    const untagged = state.library.filter(function(s){ return !s.themes || !s.themes.length; });
    if(!untagged.length) return '';
    return '<div style="margin:10px 0;"><button type="button" class="switch-account" id="aiTagBulkBtn">AI-TAG UNTAGGED SONGS (' + untagged.length + ')</button></div>';
  }

  async function runBulkAiTag(){
    const untagged = state.library.filter(function(s){ return !s.themes || !s.themes.length; });
    if(!untagged.length || (state.aiTagBulk && state.aiTagBulk.running)) return;
    state.aiTagBulk = { running:true, current:0, total: untagged.length, currentTitle:'' };
    render();
    let tagged = 0, failed = 0;
    for(let i=0; i<untagged.length; i++){
      const s = untagged[i];
      state.aiTagBulk.current = i+1;
      state.aiTagBulk.currentTitle = s.title;
      render();
      try{
        const themes = await suggestThemes(s.title, s.sections);
        await updateSong(s.id, { themes: themes });
        tagged++;
      }catch(e){
        failed++;
      }
    }
    state.aiTagBulk = null;
    render();
    showToast(failed
      ? ('AI-tagged ' + tagged + ' song' + (tagged===1?'':'s') + ' &mdash; ' + failed + ' couldn&rsquo;t be confidently tagged (left as-is; try again or tag by hand).')
      : ('AI-tagged all ' + tagged + ' song' + (tagged===1?'':'s') + '.'));
  }

  function renderListInPlace(){
    // lighter re-render that preserves focus in the search box
    const results = filteredResults();
    document.querySelector('.count-note').textContent = results.length + ' of ' + state.library.length + ' songs';
    const holder = document.querySelector('.hymn-list, .empty-state');
    if(holder) holder.outerHTML = results.length ? renderHymnList(results) : renderEmpty();
    attachCardHandlers();
  }
  // Debounced [2026-09-16] -- see debounce()'s own comment above for why.
  // Split from renderListInPlace() itself (rather than wrapping the whole
  // thing) so the "N of 400 songs" counter still updates on every
  // keystroke, instantly -- only the potentially-hundreds-of-cards list
  // rebuild below it waits the extra beat; a counter that visibly lags
  // behind what you just typed would be its own small, confusing bug.
  function updateLibraryCountNote(){
    const el = document.querySelector('.count-note');
    if(el) el.textContent = filteredResults().length + ' of ' + state.library.length + ' songs';
  }
  const debouncedRenderListInPlace = debounce(renderListInPlace, 160);

  function renderHymnList(results){
    return '<ul class="hymn-list">' + results.map(function(s){
      const fav = isFavorite(s.id);
      return '<li><div class="hymn-card">' +
        '<button class="hymn-card-main" data-id="'+s.id+'">' +
          '<span class="hymn-num">'+s.number+'</span>' +
          '<span class="hymn-meta">' +
            '<p class="hymn-title">'+s.title+'</p>' +
            '<span class="hymn-sub">' +
              (s.tags||[]).map(function(t){return '<span class="pill">'+t.toUpperCase()+'</span>';}).join('') +
              (s.themes||[]).map(function(t){return '<span class="pill pill-pine">'+themeLabel(t).toUpperCase()+'</span>';}).join('') +
              '<span>Key of '+s.key+'</span></span>' +
          '</span>' +
          '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('chevron')+'</svg>' +
        '</button>' +
        '<button class="heart-btn '+(fav?'active':'')+'" data-fav-id="'+s.id+'" aria-label="'+(fav?'Remove from favorites':'Add to favorites')+'" aria-pressed="'+fav+'">' +
          '<svg viewBox="0 0 24 24" fill="'+(fav?'currentColor':'none')+'" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">'+icon('heart')+'</svg>' +
        '</button>' +
      '</div></li>';
    }).join('') + '</ul>';
  }

  function renderEmpty(){
    const reason = state.showFavoritesOnly ? 'You haven&rsquo;t favorited any songs yet.' :
      (state.activeTheme ? 'No songs tagged &ldquo;'+themeLabel(state.activeTheme)+'&rdquo; yet.' :
      'No songs match &ldquo;'+escapeHtml(state.query)+'&rdquo; yet.');
    return '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
      '<p>'+reason+'<br>Try a different search or filter, or add a song to the hymnal.</p></div>';
  }

  function attachCardHandlers(){
    document.querySelectorAll('.hymn-card-main').forEach(function(btn){
      btn.addEventListener('click', function(){
        state.songId = btn.getAttribute('data-id'); state.view='detail'; render(); window.scrollTo(0,0);
      });
    });
    document.querySelectorAll('.heart-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        toggleFavorite(btn.getAttribute('data-fav-id'));
        renderListInPlace();
      });
    });
  }

  function renderDetail(){
    const song = state.library.find(function(s){ return s.id===state.songId; });
    if(!song){ state.view='list'; return render(); }
    const steps = state.transpose[song.id] || 0;
    // Defensive snap-back, same pattern as the Musicians-chat-channel fix
    // (see architecture doc bug #6): if access to Play Mode is ever lost
    // (a beta-tester flag revoked, a role removed) while state.mode is
    // still 'play' from an earlier session, force back to Sing Mode rather
    // than leaving the UI showing a mode nobody should be able to reach.
    if(state.mode === 'play' && !canUsePlayMode()){ state.mode = 'sing'; safeSet('cv:mode','sing'); }
    const mode = state.mode;

    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="backBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK TO HYMNAL</button></div>' +
      '<div class="hymn-header"><p class="hymn-title">'+song.title+'</p><p class="hymn-author">'+song.author+' &middot; Hymn No. '+song.number+'</p>' +
        '<div class="badge-row">' +
          (song.tags||[]).map(function(t){return '<span class="pill">'+t.toUpperCase()+'</span>';}).join('') +
          (song.themes||[]).map(function(t){return '<span class="pill pill-pine">'+themeLabel(t).toUpperCase()+'</span>';}).join('') +
          ((!song.themes || !song.themes.length) && state.isEditor && aiTaggingConfigured ?
            '<button type="button" class="switch-account" id="aiSuggestDetailBtn" style="margin-left:6px;">SUGGEST THEMES WITH AI</button>' : '') +
        '</div>' +
        '<div class="action-row">' +
          '<button class="btn btn-ghost btn-fav '+(isFavorite(song.id)?'active':'')+'" id="favBtn" aria-pressed="'+isFavorite(song.id)+'">' +
            '<svg class="'+(isFavorite(song.id)?'filled':'')+'" viewBox="0 0 24 24" fill="'+(isFavorite(song.id)?'currentColor':'none')+'" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">'+icon('heart')+'</svg>' +
            (isFavorite(song.id)?'FAVORITED':'ADD TO FAVORITES') +
          '</button>' +
          '<a class="btn btn-youtube" href="'+(song.youtube||youtubeSearchUrl(song.title))+'" target="_blank" rel="noopener">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round">'+icon('play')+'</svg>LEARN ON YOUTUBE</a>' +
          (state.isEditor ? '<button class="btn btn-ghost" id="editSongBtn">EDIT SONG</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="mode-switch">' +
        '<button class="'+(mode==='sing'?'active':'')+'" id="modeSing"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('mic')+'</svg>SING MODE</button>' +
        '<button class="'+(mode==='play'?'active':'')+(canUsePlayMode()?'':' locked')+'" id="modePlay"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg>PLAY MODE'+(canUsePlayMode()?'':' (PAID)')+'</button>' +
      '</div>' +
      '<div class="control-bar">' +
        '<div class="control-group"><span class="control-label uc">Text Size</span><div class="stepper">' +
          '<button id="fontDown" aria-label="Smaller text">&minus;</button><span class="val">'+Math.round(state.scale*100)+'%</span><button id="fontUp" aria-label="Larger text">+</button></div></div>' +
        (mode==='play' ? ('<div class="control-group" id="transposeGroup"><span class="control-label uc">Key</span><div class="stepper">' +
          '<button id="keyDown" aria-label="Transpose down a half step">&minus;</button><span class="val">'+transposeKeyLabel(song.key, steps)+'</span><button id="keyUp" aria-label="Transpose up a half step">+</button></div></div>') : '') +
      '</div>' +
      '<div class="lyric-sheet '+(mode==='sing'?'sing hide-chords':'play')+'" style="--scale:'+state.scale+'">' +
        song.sections.map(function(sec){
          return '<div class="verse-block '+sec.type+'"><p class="section-label uc type-'+sec.type+'">'+sec.label+'</p>' +
            sec.lines.map(function(l){ return '<p class="lyric-line">'+renderChordLyricLine(l, steps)+'</p>'; }).join('') +
          '</div>';
        }).join('') +
      '</div>' +
      (mode==='play' ? '<p class="capo-note">Capo suggestions and instrument-specific charts are on the roadmap &mdash; for now, transpose to the key your instrument needs.</p>' : '');

    document.getElementById('backBtn').addEventListener('click', function(){ state.view='list'; render(); window.scrollTo(0,0); });
    document.getElementById('favBtn').addEventListener('click', function(){ toggleFavorite(song.id); render(); });
    document.getElementById('modeSing').addEventListener('click', function(){ state.mode='sing'; safeSet('cv:mode','sing'); render(); });
    document.getElementById('modePlay').addEventListener('click', function(){
      if(!canUsePlayMode()){ showToast('Play Mode (chords & transpose) is a paid feature for Musicians and above. See Plans & Pricing, or ask an Admin about beta access.'); return; }
      state.mode='play'; safeSet('cv:mode','play'); render();
    });
    document.getElementById('fontDown').addEventListener('click', function(){ state.scale = Math.max(0.8, +(state.scale-0.1).toFixed(2)); safeSet('cv:scale', state.scale); render(); });
    document.getElementById('fontUp').addEventListener('click', function(){ state.scale = Math.min(1.6, +(state.scale+0.1).toFixed(2)); safeSet('cv:scale', state.scale); render(); });
    const kd = document.getElementById('keyDown'), ku = document.getElementById('keyUp');
    if(kd) kd.addEventListener('click', function(){ state.transpose[song.id] = (state.transpose[song.id]||0) - 1; render(); });
    if(ku) ku.addEventListener('click', function(){ state.transpose[song.id] = (state.transpose[song.id]||0) + 1; render(); });
    const aiSuggestDetailBtn = document.getElementById('aiSuggestDetailBtn');
    if(aiSuggestDetailBtn){
      aiSuggestDetailBtn.addEventListener('click', async function(){
        aiSuggestDetailBtn.disabled = true;
        aiSuggestDetailBtn.textContent = 'ASKING THE AI…';
        try{
          const themes = await suggestThemes(song.title, song.sections);
          await updateSong(song.id, { themes: themes });
          showToast('Tagged &ldquo;'+song.title+'&rdquo;: ' + themes.map(themeLabel).join(', '));
        }catch(e){
          showToast(e.message || 'Couldn&rsquo;t get AI suggestions.');
          aiSuggestDetailBtn.disabled = false;
          aiSuggestDetailBtn.textContent = 'SUGGEST THEMES WITH AI';
        }
      });
    }
    const editSongBtn = document.getElementById('editSongBtn');
    if(editSongBtn) editSongBtn.addEventListener('click', function(){
      editDraft = null; // always start the edit form fresh from this song's current data
      state.view='edit'; render(); window.scrollTo(0,0);
    });
  }

  /* ============ EDIT SONG (manual editing for worship-team editors) ============ */
  // Lets an editor fix a song's title, key, YouTube link, tags, themes, or the
  // lyrics/chords themselves, straight through the app -- the manual fallback
  // to AI tagging, useful any time (wrong AI guess, a song that predates AI
  // tagging, a typo someone spots, a chord that needs correcting) not just
  // while AI tagging is unset up.
  //
  // editDraft holds every field and is kept in sync on every keystroke/edit,
  // the same pattern renderSessionSetup() uses for setupDraft: render() can
  // legitimately re-run while this view is open (e.g. watchSongs firing
  // because an "AI-Tag Untagged Songs" run elsewhere just updated a
  // *different* song), and re-deriving the form straight from `song` on every
  // call would silently wipe whatever the editor had just typed. Lazily
  // initialized only when null, and nulled again on Back or a successful
  // Save, so the next "Edit Song" click always starts clean from that song's
  // current data.
  let editDraft = null;

  function renderEditSong(){
    const song = state.library.find(function(s){ return s.id===state.songId; });
    if(!song){ state.view='list'; return render(); }
    if(!editDraft){
      editDraft = {
        title: song.title,
        key: song.key || '',
        youtube: song.youtube || '',
        tags: (song.tags||[]).join(', '),
        themeSelection: new Set(song.themes || []),
        sections: (song.sections||[]).map(function(sec){ return { type: sec.type, lines: sec.lines.slice(), confidence:'manual' }; })
      };
    }
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="editBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK TO SONG</button></div>' +
      '<h1 style="font-size:1.8rem;margin-bottom:6px;">Edit Song</h1>' +
      '<p class="hint" style="margin-bottom:22px;">Update the title, key, tags, themes, or the lyrics and chords below, then save.</p>' +
      '<div class="field-row">' +
        '<div class="field"><label for="editTitleInput">SONG TITLE</label><input type="text" id="editTitleInput" value="'+escapeAttr(editDraft.title)+'"></div>' +
        '<div class="field"><label for="editKeyInput">KEY (OPTIONAL)</label><input type="text" id="editKeyInput" value="'+escapeAttr(editDraft.key)+'" placeholder="e.g. G, D, Bb"></div>' +
      '</div>' +
      '<div class="field"><label for="editYoutubeInput">YOUTUBE LINK (OPTIONAL)</label><input type="text" id="editYoutubeInput" value="'+escapeAttr(editDraft.youtube)+'" placeholder="Paste a YouTube link so people can learn the tune">' +
        '<p class="hint">Leave this blank and we&rsquo;ll link to a YouTube search for the title instead.</p></div>' +
      '<div class="field"><label for="editTagsInput">TAGS (COMMA-SEPARATED, OPTIONAL)</label><input type="text" id="editTagsInput" value="'+escapeAttr(editDraft.tags)+'" placeholder="e.g. Just Added, Choir Favorite"></div>' +
      '<div class="field"><label>THEMES (OPTIONAL)</label><div class="theme-picker" id="editThemePicker">' +
        THEMES.map(function(t){ return '<button type="button" class="chip edit-theme-pick'+(editDraft.themeSelection.has(t.key)?' active':'')+'" data-theme="'+t.key+'">'+t.label.toUpperCase()+'</button>'; }).join('') +
      '</div>' +
      (aiTaggingConfigured ? '<button type="button" class="switch-account" id="editAiSuggestThemesBtn" style="margin-top:8px;">SUGGEST THEMES WITH AI</button><span id="editAiSuggestThemesStatus" class="hint"></span>' : '') +
      '</div>' +
      '<div class="field"><label for="editPasteArea">PASTE MORE LYRICS TO ADD (OPTIONAL)</label>' +
        '<textarea id="editPasteArea" placeholder="Paste additional verses here to auto-detect and add them below, or just edit the sections directly."></textarea>' +
        '<p class="hint">Tip: chords in [brackets] before a word, like [G]Amazing grace, will show up as chord markers automatically.</p>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="editDetectBtn" style="margin-bottom:24px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>AUTO-DETECT &amp; ADD</button>' +
      '<div class="section-heading"><h2 class="uc">Song Sections</h2><span class="count-note" id="editSectionCount">'+editDraft.sections.length+' added</span></div>' +
      '<div class="add-section-row">' +
        '<button type="button" class="btn btn-ghost" data-edit-add-type="verse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD VERSE</button>' +
        '<button type="button" class="btn btn-ghost" data-edit-add-type="chorus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD CHORUS</button>' +
        '<button type="button" class="btn btn-ghost" data-edit-add-type="refrain"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD REFRAIN</button>' +
        '<button type="button" class="btn btn-ghost" data-edit-add-type="bridge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD BRIDGE</button>' +
      '</div>' +
      '<div id="editSectionsList"></div>' +
      '<div class="confirm-row" style="margin-top:16px;">' +
        '<button class="btn btn-primary btn-lg btn-block" id="saveEditBtn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SAVE CHANGES</button>' +
      '</div>' +
      '<p class="hint" style="text-align:center;margin-top:10px;">'+(usingDemoMode ? 'Demo mode: this saves to your device/browser only.' : 'Saves straight to your church&rsquo;s shared hymnal &mdash; everyone will see the update.')+'</p>';

    document.getElementById('editBackBtn').addEventListener('click', function(){ editDraft = null; state.view='detail'; render(); window.scrollTo(0,0); });
    document.getElementById('editTitleInput').addEventListener('input', function(e){ editDraft.title = e.target.value; });
    document.getElementById('editKeyInput').addEventListener('input', function(e){ editDraft.key = e.target.value; });
    document.getElementById('editYoutubeInput').addEventListener('input', function(e){ editDraft.youtube = e.target.value; });
    document.getElementById('editTagsInput').addEventListener('input', function(e){ editDraft.tags = e.target.value; });
    document.getElementById('editDetectBtn').addEventListener('click', runEditDetect);
    document.getElementById('saveEditBtn').addEventListener('click', saveEditedSong);
    document.querySelectorAll('[data-edit-add-type]').forEach(function(btn){
      btn.addEventListener('click', function(){
        editDraft.sections.push({ type: btn.getAttribute('data-edit-add-type'), lines:[''], confidence:'manual' });
        renderEditSectionsList();
      });
    });
    document.querySelectorAll('.edit-theme-pick').forEach(function(btn){
      btn.addEventListener('click', function(){
        const key = btn.getAttribute('data-theme');
        if(editDraft.themeSelection.has(key)){ editDraft.themeSelection.delete(key); btn.classList.remove('active'); }
        else { editDraft.themeSelection.add(key); btn.classList.add('active'); }
      });
    });
    const editAiBtn = document.getElementById('editAiSuggestThemesBtn');
    if(editAiBtn){
      editAiBtn.addEventListener('click', async function(){
        document.querySelectorAll('.edit-detect-input').forEach(function(ta){
          const idx = +ta.getAttribute('data-line-idx');
          editDraft.sections[idx].lines = ta.value.split('\n').map(function(l){return l.trim();}).filter(Boolean);
        });
        const statusEl = document.getElementById('editAiSuggestThemesStatus');
        editAiBtn.disabled = true;
        if(statusEl) statusEl.textContent = 'Asking the AI&hellip;';
        try{
          const themes = await suggestThemes(editDraft.title, editDraft.sections);
          applyThemeSuggestions(themes, editDraft.themeSelection, '#editThemePicker .edit-theme-pick');
          if(statusEl) statusEl.textContent = 'Suggested: ' + themes.map(themeLabel).join(', ') + ' &mdash; adjust or add more below.';
        }catch(e){
          if(statusEl) statusEl.textContent = '';
          showToast(e.message || 'Couldn&rsquo;t get AI suggestions.');
        }finally{
          editAiBtn.disabled = false;
        }
      });
    }
    renderEditSectionsList();
  }

  function renderEditSectionsList(){
    const holder = document.getElementById('editSectionsList');
    const countEl = document.getElementById('editSectionCount');
    const sections = editDraft.sections;
    if(countEl) countEl.textContent = sections.length + ' added';
    if(!sections.length){
      holder.innerHTML = '<p class="sections-empty">No sections yet. Add a verse, chorus, refrain, or bridge above, or paste lyrics to auto-detect more.</p>';
      return;
    }
    holder.innerHTML = sections.map(function(sec, i){
      return '<div class="detect-card '+(sec.confidence==='low'?'low-confidence':'')+'">' +
        '<div class="detect-head"><span class="detect-head-left"><select data-edit-idx="'+i+'" class="edit-type-select">' +
          SECTION_TYPES.map(function(t){
            return '<option value="'+t+'"'+(t===sec.type?' selected':'')+'>'+t.replace('-', ' ').toUpperCase()+'</option>';
          }).join('') +
        '</select>' +
        (sec.confidence==='low' ? '<span class="low-confidence-flag"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('flag')+'</svg>LOW CONFIDENCE &mdash; double-check this one</span>' : '') +
        '</span>' +
        '<button type="button" class="remove-btn" data-edit-remove-idx="'+i+'" aria-label="Remove this section">&times;</button>' +
        '</div>' +
        '<textarea class="edit-detect-input" data-line-idx="'+i+'" rows="'+Math.max(2, sec.lines.length)+'" placeholder="Type or paste the lines for this section&hellip;">' + escapeHtml(sec.lines.join('\n')) + '</textarea>' +
      '</div>';
    }).join('');

    document.querySelectorAll('.edit-type-select').forEach(function(sel){
      sel.addEventListener('change', function(){
        editDraft.sections[+sel.getAttribute('data-edit-idx')].type = sel.value;
      });
    });
    document.querySelectorAll('[data-edit-remove-idx]').forEach(function(btn){
      btn.addEventListener('click', function(){
        editDraft.sections.splice(+btn.getAttribute('data-edit-remove-idx'), 1);
        renderEditSectionsList();
      });
    });
    document.querySelectorAll('.edit-detect-input').forEach(function(ta){
      ta.addEventListener('input', function(){
        editDraft.sections[+ta.getAttribute('data-line-idx')].lines = ta.value.split('\n');
      });
    });
  }

  function runEditDetect(){
    const raw = document.getElementById('editPasteArea').value;
    if(!raw.trim()){
      showToast('Paste some lyrics above first, then try auto-detect.');
      return;
    }
    const detected = detectSections(raw);
    detected.forEach(function(d){ editDraft.sections.push(d); });
    renderEditSectionsList();
    document.getElementById('editSectionsList').scrollIntoView({behavior:'smooth', block:'start'});
  }

  async function saveEditedSong(){
    document.querySelectorAll('.edit-detect-input').forEach(function(ta){
      const idx = +ta.getAttribute('data-line-idx');
      editDraft.sections[idx].lines = ta.value.split('\n').map(function(l){return l.trim();}).filter(Boolean);
    });
    const usable = editDraft.sections.filter(function(sec){ return sec.lines.length; });
    if(!usable.length){
      showToast('A song needs at least one section with some words in it.');
      return;
    }
    const song = state.library.find(function(s){ return s.id===state.songId; });
    if(!song){ state.view='list'; render(); return; }
    const title = editDraft.title.trim() || song.title;
    const key = editDraft.key.trim() || 'C';
    const youtubeRaw = editDraft.youtube.trim();
    const tags = editDraft.tags.trim() ? editDraft.tags.split(',').map(function(t){return t.trim();}).filter(Boolean) : [];
    let verseCount = 0;
    const patch = {
      title: title,
      key: key,
      tags: tags,
      themes: Array.from(editDraft.themeSelection),
      youtube: youtubeRaw || youtubeSearchUrl(title),
      sections: usable.map(function(sec){
        let label;
        if(sec.type === 'verse'){ verseCount++; label = 'Verse ' + verseCount; }
        else { label = sec.type.charAt(0).toUpperCase()+sec.type.slice(1); }
        return { type: sec.type, label: label, lines: sec.lines };
      })
    };
    const saveBtn = document.getElementById('saveEditBtn');
    if(saveBtn) saveBtn.disabled = true;
    try{
      await updateSong(song.id, patch);
      showToast('Saved changes to &ldquo;'+title+'&rdquo;');
      editDraft = null;
      state.view='detail'; render(); window.scrollTo(0,0);
    }catch(e){
      showToast('Couldn&rsquo;t save changes &mdash; if you&rsquo;re not on the worship team&rsquo;s editor list yet, ask to be added.');
      if(saveBtn) saveBtn.disabled = false;
    }
  }

  let addThemeSelection = new Set();
  let addSections = [];
  // Set by "Approve & Add" in the Song Requests queue, consumed exactly once
  // by the next renderAdd() call -- prefills the title/sections from an
  // approved request's pasted lyrics (run through the same detectSections()
  // auto-detect the direct-add textarea uses) so an editor doesn't have to
  // retype what the requester already provided. addApprovingRequestId
  // survives past that single render (renderAdd() nulls the prefill object
  // immediately but keeps the id) so saveNewSong() can mark the request
  // approved once the song itself is actually saved -- see both below.
  let addPrefillFromRequest = null;
  let addApprovingRequestId = null;
  const SECTION_TYPES = ['verse','chorus','refrain','bridge','pre-chorus','tag'];

  function renderAdd(){
    // Consumed exactly once -- see addPrefillFromRequest's declaration above.
    const prefill = addPrefillFromRequest;
    addPrefillFromRequest = null;
    addApprovingRequestId = prefill ? prefill.requestId : null;
    addThemeSelection = new Set();
    addSections = prefill ? prefill.sections : [];
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="backBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK TO HYMNAL</button></div>' +
      '<h1 style="font-size:1.8rem;margin-bottom:6px;">Add a Song</h1>' +
      (prefill ? '<p class="hint" style="margin-bottom:8px;">&#9989; Pre-filled from a member&rsquo;s song request &mdash; check it over, then save to approve.</p>' : '') +
      '<p class="hint" style="margin-bottom:8px;">Paste lyrics and let iWorship sort them automatically, add verses and choruses one at a time yourself, or both &mdash; then save whenever you&rsquo;re ready.</p>' +
      '<p style="margin-bottom:22px;"><button type="button" class="switch-account" id="goBulkAddBtn">ADDING SEVERAL SONGS AT ONCE? USE BULK ADD</button></p>' +
      '<div class="field-row">' +
        '<div class="field"><label for="titleInput">SONG TITLE</label><input type="text" id="titleInput" placeholder="e.g. Great Is Thy Faithfulness" value="'+escapeAttr(prefill ? prefill.title : '')+'"></div>' +
        '<div class="field"><label for="keyInput">KEY (OPTIONAL)</label><input type="text" id="keyInput" placeholder="e.g. G, D, Bb"></div>' +
      '</div>' +
      '<div class="field"><label for="youtubeInput">YOUTUBE LINK (OPTIONAL)</label><input type="text" id="youtubeInput" placeholder="Paste a YouTube link so people can learn the tune">' +
        '<p class="hint">Leave this blank and we&rsquo;ll link to a YouTube search for the title instead.</p></div>' +
      '<div class="field"><label>THEMES (OPTIONAL)</label><div class="theme-picker" id="themePicker">' +
        THEMES.map(function(t){ return '<button type="button" class="chip theme-pick" data-theme="'+t.key+'">'+t.label.toUpperCase()+'</button>'; }).join('') +
      '</div>' +
      (aiTaggingConfigured ? '<button type="button" class="switch-account" id="aiSuggestThemesBtn" style="margin-top:8px;">SUGGEST THEMES WITH AI</button><span id="aiSuggestThemesStatus" class="hint"></span>' : '') +
      '</div>' +
      '<div class="field"><label for="pasteArea">PASTE LYRICS (OPTIONAL)</label>' +
        '<textarea id="pasteArea" placeholder="Paste lyrics here. Leave a blank line between verses and the chorus, or label them yourself (e.g. \'Chorus\') on their own line — either way works."></textarea>' +
        '<p class="hint">Tip: chords in [brackets] before a word, like [G]Amazing grace, will show up as chord markers automatically.</p>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="detectBtn" style="margin-bottom:24px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>AUTO-DETECT VERSES &amp; CHORUS</button>' +
      '<div class="section-heading"><h2 class="uc">Or Add Sections Yourself</h2></div>' +
      '<div class="add-section-row">' +
        '<button type="button" class="btn btn-ghost" data-add-type="verse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD VERSE</button>' +
        '<button type="button" class="btn btn-ghost" data-add-type="chorus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD CHORUS</button>' +
        '<button type="button" class="btn btn-ghost" data-add-type="refrain"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD REFRAIN</button>' +
        '<button type="button" class="btn btn-ghost" data-add-type="bridge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD BRIDGE</button>' +
      '</div>' +
      '<div class="section-heading"><h2 class="uc">Song Sections</h2><span class="count-note" id="sectionCount">0 added</span></div>' +
      '<div id="sectionsList"></div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="saveBtn" style="margin-top:10px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SAVE TO HYMNAL</button>' +
      '<p class="hint" style="text-align:center;margin-top:10px;">'+(usingDemoMode ? 'Demo mode: this saves to your device/browser only.' : 'Saves straight to your church&rsquo;s shared hymnal &mdash; everyone will see it.')+'</p>';

    document.getElementById('backBtn').addEventListener('click', function(){ state.view='list'; render(); window.scrollTo(0,0); });
    document.getElementById('goBulkAddBtn').addEventListener('click', function(){ state.view='bulk-add'; render(); window.scrollTo(0,0); });
    document.getElementById('detectBtn').addEventListener('click', runDetect);
    document.getElementById('saveBtn').addEventListener('click', saveNewSong);
    document.querySelectorAll('[data-add-type]').forEach(function(btn){
      btn.addEventListener('click', function(){
        addSections.push({ type: btn.getAttribute('data-add-type'), lines:[''], confidence:'manual' });
        renderSectionsList();
      });
    });
    document.querySelectorAll('.theme-pick').forEach(function(btn){
      btn.addEventListener('click', function(){
        const key = btn.getAttribute('data-theme');
        if(addThemeSelection.has(key)){ addThemeSelection.delete(key); btn.classList.remove('active'); }
        else { addThemeSelection.add(key); btn.classList.add('active'); }
      });
    });
    const aiBtn = document.getElementById('aiSuggestThemesBtn');
    if(aiBtn){
      aiBtn.addEventListener('click', async function(){
        // Pull the latest edited text first, same as saveNewSong does, so
        // suggestions reflect whatever's actually in the section boxes right now.
        document.querySelectorAll('.detect-input').forEach(function(ta){
          const idx = +ta.getAttribute('data-line-idx');
          addSections[idx].lines = ta.value.split('\n').map(function(l){return l.trim();}).filter(Boolean);
        });
        const title = document.getElementById('titleInput').value.trim();
        const statusEl = document.getElementById('aiSuggestThemesStatus');
        aiBtn.disabled = true;
        if(statusEl) statusEl.textContent = 'Asking the AI&hellip;';
        try{
          const themes = await suggestThemes(title, addSections);
          applyThemeSuggestions(themes, addThemeSelection, '#themePicker .theme-pick');
          if(statusEl) statusEl.textContent = 'Suggested: ' + themes.map(themeLabel).join(', ') + ' &mdash; adjust or add more below.';
        }catch(e){
          if(statusEl) statusEl.textContent = '';
          showToast(e.message || 'Couldn&rsquo;t get AI suggestions.');
        }finally{
          aiBtn.disabled = false;
        }
      });
    }
    renderSectionsList();
  }

  // Shared by the single-song "Suggest Themes with AI" button and (in a
  // future extension) anywhere else a theme picker needs to reflect an AI
  // suggestion -- adds the suggested keys to the given Set and lights up
  // the matching chip buttons, without touching any already-selected theme.
  function applyThemeSuggestions(themeKeys, targetSet, chipSelector){
    themeKeys.forEach(function(key){ targetSet.add(key); });
    document.querySelectorAll(chipSelector).forEach(function(btn){
      if(targetSet.has(btn.getAttribute('data-theme'))) btn.classList.add('active');
    });
  }

  function renderSectionsList(){
    const holder = document.getElementById('sectionsList');
    const countEl = document.getElementById('sectionCount');
    if(countEl) countEl.textContent = addSections.length + ' added';
    if(!addSections.length){
      holder.innerHTML = '<p class="sections-empty">No sections yet. Paste lyrics above and auto-detect, or use the buttons above to add a verse, chorus, refrain, or bridge by hand.</p>';
      return;
    }
    holder.innerHTML = addSections.map(function(sec, i){
      return '<div class="detect-card '+(sec.confidence==='low'?'low-confidence':'')+'">' +
        '<div class="detect-head"><span class="detect-head-left"><select data-idx="'+i+'" class="typeSelect">' +
          SECTION_TYPES.map(function(t){
            return '<option value="'+t+'"'+(t===sec.type?' selected':'')+'>'+t.replace('-', ' ').toUpperCase()+'</option>';
          }).join('') +
        '</select>' +
        (sec.confidence==='low' ? '<span class="low-confidence-flag"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('flag')+'</svg>LOW CONFIDENCE &mdash; double-check this one</span>' : '') +
        (sec.confidence==='manual' ? '<span class="low-confidence-flag manual-flag">ADDED BY HAND</span>' : '') +
        '</span>' +
        '<button type="button" class="remove-btn" data-remove-idx="'+i+'" aria-label="Remove this section">&times;</button>' +
        '</div>' +
        '<textarea class="detect-input" data-line-idx="'+i+'" rows="'+Math.max(2, sec.lines.length)+'" placeholder="Type or paste the lines for this section&hellip;">' + escapeHtml(sec.lines.join('\n')) + '</textarea>' +
      '</div>';
    }).join('');

    document.querySelectorAll('.typeSelect').forEach(function(sel){
      sel.addEventListener('change', function(){
        addSections[+sel.getAttribute('data-idx')].type = sel.value;
      });
    });
    document.querySelectorAll('[data-remove-idx]').forEach(function(btn){
      btn.addEventListener('click', function(){
        addSections.splice(+btn.getAttribute('data-remove-idx'), 1);
        renderSectionsList();
      });
    });
    document.querySelectorAll('.detect-input').forEach(function(ta){
      // Keep the underlying data in sync as the person types, so adding another
      // section, removing one, or running auto-detect again never discards an edit.
      ta.addEventListener('input', function(){
        addSections[+ta.getAttribute('data-line-idx')].lines = ta.value.split('\n');
      });
    });
  }

  function runDetect(){
    const raw = document.getElementById('pasteArea').value;
    if(!raw.trim()){
      showToast('Paste some lyrics above first, then try auto-detect.');
      return;
    }
    const detected = detectSections(raw);
    addSections = addSections.concat(detected);
    renderSectionsList();
    document.getElementById('sectionsList').scrollIntoView({behavior:'smooth', block:'start'});
  }

  function renderBulkAdd(){
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="bulkBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK TO ADD A SONG</button></div>' +
      '<h1 style="font-size:1.8rem;margin-bottom:6px;">Bulk Add Songs</h1>' +
      '<p class="hint" style="margin-bottom:16px;">Paste several songs at once, sourced from wherever you&rsquo;re licensed to use them (your own hymnal, a CCLI printout, a public-domain source). Start each song with a line like <code># Title</code>, optionally followed by <code>Key:</code>, <code>Themes:</code>, and <code>Youtube:</code> lines, then a blank line, then the lyrics &mdash; leave a blank line between verses/chorus same as the single-song form. Example shape (not real lyrics, just the format):</p>' +
      '<pre class="bulk-example"># Title Of The First Song\nKey: G\nThemes: praise, comfort\n\n(first verse lines here)\n\n(chorus lines here)\n\n# Title Of The Second Song\nKey: D\n\n(its verse lines here)</pre>' +
      '<div class="field"><label for="bulkArea">PASTE YOUR SONGS</label>' +
        '<textarea id="bulkArea" style="min-height:320px;" placeholder="# First Song Title\nKey: G\nThemes: praise, comfort\n\nVerse lines here...\n\n# Second Song Title\n..."></textarea>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="bulkPreviewBtn" style="margin-bottom:16px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>PREVIEW</button>' +
      // CSV/ChordPro upload [2026-09-24] -- an alternate input path,
      // additive to the paste flow above (unchanged): pick one or more
      // files instead of typing the app's own "# Title" format by hand.
      // See handleBulkFileUpload()'s own comment for the per-file format
      // detection and why a ChordPro file's chord/lyric lines need no
      // transformation at all.
      '<div class="section-heading" style="margin-top:8px;"><h2 class="uc">Or Upload Files</h2></div>' +
      '<p class="hint" style="margin-bottom:12px;">A CSV needs <code>title</code> and <code>lyrics</code> columns (plus optional <code>key</code>/<code>themes</code>/<code>youtube</code> columns); ChordPro files use their own <code>{title:}</code>/<code>[Chord]</code> markup, one song per file &mdash; pick several at once to import a whole batch. Previews automatically once you pick your files.</p>' +
      '<div class="field"><label for="bulkFileInput">CSV, .CHO, .CRD, .CHORDPRO, OR .TXT FILES</label>' +
        '<input type="file" id="bulkFileInput" multiple accept=".csv,.cho,.crd,.chordpro,.chopro,.txt">' +
      '</div>' +
      '<div id="bulkPreviewHolder"></div>';

    document.getElementById('bulkBackBtn').addEventListener('click', function(){ state.view='add'; render(); window.scrollTo(0,0); });
    document.getElementById('bulkPreviewBtn').addEventListener('click', function(){
      const raw = document.getElementById('bulkArea').value;
      if(!raw.trim()){ showToast('Paste at least one song first.'); return; }
      const { songs, warnings } = parseBulkText(raw);
      bulkParsed = songs;
      renderBulkPreview(songs, warnings);
    });
    document.getElementById('bulkFileInput').addEventListener('change', function(e){
      const files = e.target.files;
      if(!files || !files.length) return;
      handleBulkFileUpload(files).catch(function(){ showToast('Could not read one or more of those files. Try again.'); });
      e.target.value = ''; // lets picking the exact same file(s) again re-fire change
    });
  }

  let bulkParsed = [];
  function renderBulkPreview(songs, warnings){
    const holder = document.getElementById('bulkPreviewHolder');
    if(!holder) return;
    holder.innerHTML =
      (warnings.length ? ('<div class="confirm-row" style="flex-direction:column;align-items:flex-start;gap:6px;">' +
        warnings.map(function(w){ return '<span>&#9888; ' + w + '</span>'; }).join('') + '</div>') : '') +
      '<div class="section-heading"><h2 class="uc">Found ' + songs.length + ' Song' + (songs.length===1?'':'s') + '</h2></div>' +
      (songs.length ? ('<ul class="hymn-list">' + songs.map(function(s){
        return '<li><div class="hymn-card"><div class="hymn-card-main" style="cursor:default;">' +
          '<span class="hymn-meta"><p class="hymn-title">'+escapeHtml(s.title)+'</p>' +
          '<p class="hint" style="margin:2px 0 0;">'+s.sections.length+' section'+(s.sections.length===1?'':'s')+(s.key?(' &middot; Key: '+escapeHtml(s.key)):'')+(s.themes.length?(' &middot; '+s.themes.map(themeLabel).join(', ')):'')+'</p></span>' +
        '</div></div></li>';
      }).join('') + '</ul>') : '') +
      (songs.length ? ('<button class="btn btn-primary btn-lg btn-block" id="bulkSaveAllBtn" style="margin-top:16px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SAVE ALL ' + songs.length + ' TO HYMNAL</button>' +
        '<div id="bulkProgress" class="hint" style="text-align:center;margin-top:10px;"></div>') : '');
    const saveAllBtn = document.getElementById('bulkSaveAllBtn');
    if(saveAllBtn) saveAllBtn.addEventListener('click', submitBulkImport);
  }

  async function submitBulkImport(){
    if(!state.user){ showToast('Sign in first so we know who added these.'); return; }
    const btn = document.getElementById('bulkSaveAllBtn');
    const progress = document.getElementById('bulkProgress');
    if(btn) btn.disabled = true;
    let ok = 0, failed = 0;
    for(let i=0; i<bulkParsed.length; i++){
      const s = bulkParsed[i];
      if(progress) progress.textContent = 'Saving ' + (i+1) + ' of ' + bulkParsed.length + ': ' + s.title + '&hellip;';
      let verseCount = 0;
      const newSong = {
        number: state.library.length + ok + 1,
        title: s.title,
        author: (state.profile && state.profile.displayName) ? 'Added by ' + state.profile.displayName : 'Added by you',
        key: s.key || 'C',
        tags: [],
        themes: s.themes,
        youtube: s.youtube || youtubeSearchUrl(s.title),
        sections: s.sections.map(function(sec){
          let label;
          if(sec.type === 'verse'){ verseCount++; label = 'Verse ' + verseCount; }
          else { label = sec.type.charAt(0).toUpperCase()+sec.type.slice(1); }
          return { type: sec.type, label: label, lines: sec.lines };
        })
      };
      try{ await addSong(newSong); ok++; }
      catch(e){ failed++; }
    }
    if(btn) btn.disabled = false;
    if(progress) progress.textContent = '';
    if(failed){
      showToast('Saved ' + ok + ' of ' + bulkParsed.length + ' &mdash; ' + failed + ' failed (check you&rsquo;re on the editor list).');
    } else {
      showToast('Saved all ' + ok + ' songs to your hymnal.');
    }
    if(ok){ state.view='list'; bulkParsed = []; render(); window.scrollTo(0,0); }
  }

  async function saveNewSong(){
    if(!state.user){ showToast('Sign in first so we know who added this.'); return; }
    // Pull the latest edited text straight from each textarea before saving.
    document.querySelectorAll('.detect-input').forEach(function(ta){
      const idx = +ta.getAttribute('data-line-idx');
      addSections[idx].lines = ta.value.split('\n').map(function(l){return l.trim();}).filter(Boolean);
    });
    const usable = addSections.filter(function(sec){ return sec.lines.length; });
    if(!usable.length){
      showToast('Add at least one section with some words in it first.');
      return;
    }
    const title = document.getElementById('titleInput').value.trim() || 'Untitled Song';
    const key = document.getElementById('keyInput').value.trim() || 'C';
    const youtubeRaw = document.getElementById('youtubeInput').value.trim();
    let verseCount = 0;
    const newSong = {
      number: state.library.length + 1,
      title: title,
      author: (state.profile && state.profile.displayName) ? 'Added by ' + state.profile.displayName : 'Added by you',
      key: key,
      tags: [],
      themes: Array.from(addThemeSelection),
      youtube: youtubeRaw || youtubeSearchUrl(title),
      sections: usable.map(function(sec){
        let label;
        if(sec.type === 'verse'){ verseCount++; label = 'Verse ' + verseCount; }
        else { label = sec.type.charAt(0).toUpperCase()+sec.type.slice(1); }
        return { type: sec.type, label: label, lines: sec.lines };
      })
    };
    // Captured and cleared BEFORE addSong() -- addSong's own watchSongs
    // subscription fires synchronously as part of its write (broadcast, not
    // a queued task) and re-renders whatever view is still active, which is
    // still this Add Song form at that point; that re-render would call
    // renderAdd() again and, seeing addPrefillFromRequest already consumed
    // (null), reset addApprovingRequestId back to null right out from under
    // us if we read it only after the await below returns.
    const approvingRequestId = addApprovingRequestId;
    addApprovingRequestId = null;
    try{
      const id = await addSong(newSong);
      // If this save came from "Approve & Add" in the Song Requests queue,
      // mark that request approved now that the song itself is safely
      // saved -- never the other way around, so a review-status write
      // failure can't leave a song silently unsaved.
      let approvedNote = '';
      if(approvingRequestId){
        try{
          await reviewSongRequest(approvingRequestId, {
            status: 'approved',
            reviewedByUid: state.user.uid,
            reviewedByName: (state.profile && state.profile.displayName) || 'An editor',
            reviewNote: ''
          });
          approvedNote = ' &mdash; request marked approved.';
        }catch(e){ /* song is saved either way; the request just stays pending for a retry */ }
      }
      showToast('Saved &ldquo;'+title+'&rdquo; to your hymnal'+approvedNote);
      state.view='detail'; state.songId = id; render(); window.scrollTo(0,0);
    }catch(e){
      showToast('Couldn&rsquo;t save that song &mdash; if you&rsquo;re not on the worship team&rsquo;s editor list yet, ask to be added.');
    }
  }

  /* ============ SONG REQUESTS ============ */
  // The free-access path: submit a title (and optionally paste lyrics),
  // then a worship-team editor or Admin reviews it in the queue below. See
  // interface.md's "Song requests" section and firestore.rules'
  // songRequests/{requestId} match block for the full design.
  let songRequestTitle = '';
  let songRequestLyrics = '';

  function renderSongRequest(){
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="backBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK TO HYMNAL</button></div>' +
      '<h1 style="font-size:1.8rem;margin-bottom:6px;">Request a Song</h1>' +
      '<p class="hint" style="margin-bottom:22px;">Can&rsquo;t add songs directly yet? Suggest one here and a worship team editor will take a look &mdash; paste the lyrics too if you have them and, once approved, it goes straight into the hymnal using the same auto-detect Add Song uses. Title only is fine if you don&rsquo;t have the words handy.</p>' +
      '<div class="field"><label for="reqTitleInput">SONG TITLE</label><input type="text" id="reqTitleInput" placeholder="e.g. Great Is Thy Faithfulness" value="'+escapeAttr(songRequestTitle)+'"></div>' +
      '<div id="reqDuplicateHint"></div>' +
      '<div class="field"><label for="reqLyricsArea">PASTE LYRICS (OPTIONAL)</label>' +
        '<textarea id="reqLyricsArea" placeholder="Paste lyrics here if you have them -- it helps the editor add it faster. Leave blank to just suggest the title.">'+escapeHtml(songRequestLyrics)+'</textarea>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="submitRequestBtn" style="margin-bottom:8px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SUBMIT REQUEST</button>' +
      renderMySongRequestsList();

    document.getElementById('backBtn').addEventListener('click', function(){
      stopMySongRequestsWatch(); state.view='list'; render(); window.scrollTo(0,0);
    });
    document.getElementById('reqTitleInput').addEventListener('input', function(e){
      songRequestTitle = e.target.value;
      renderDuplicateHint();
    });
    document.getElementById('reqLyricsArea').addEventListener('input', function(e){ songRequestLyrics = e.target.value; });
    document.getElementById('submitRequestBtn').addEventListener('click', submitSongRequestFlow);
    renderDuplicateHint();
  }

  // Patches just the duplicate-check hint in place (rather than a full
  // render()) so it never steals focus out of the title input while
  // someone's mid-keystroke -- same reasoning as renderListInPlace's search box.
  function renderDuplicateHint(){
    const holder = document.getElementById('reqDuplicateHint');
    if(!holder) return;
    const dup = findPossibleDuplicateSong(songRequestTitle);
    holder.innerHTML = dup
      ? ('<p class="hint" style="margin:-8px 0 14px;">&#9888; This might already be in the hymnal: &ldquo;'+escapeHtml(dup.title)+'&rdquo;. If yours is a different arrangement or translation, submit anyway below.</p>')
      : '';
  }

  function renderMySongRequestsList(){
    if(!state.mySongRequests.length) return '';
    return '<div class="section-heading" style="margin-top:28px;"><h2 class="uc">Your Requests</h2></div>' +
      '<ul class="hymn-list">' + state.mySongRequests.map(function(r){
        const pillClass = r.status==='approved' ? 'pill-pine' : r.status==='rejected' ? 'pill-wine' : '';
        return '<li><div class="hymn-card">' +
          '<div class="hymn-card-main" style="cursor:default;">' +
            '<span class="hymn-meta"><p class="hymn-title">'+escapeHtml(r.title)+'</p>' +
              '<p class="hint" style="margin:2px 0 0;">'+(r.lyricsRaw ? 'Lyrics attached' : 'Title only')+
                (r.possibleDuplicateTitle ? (' &middot; flagged as possibly matching &ldquo;'+escapeHtml(r.possibleDuplicateTitle)+'&rdquo;') : '')+'</p>' +
            '</span>' +
            '<span class="pill '+pillClass+'">'+r.status.toUpperCase()+'</span>' +
          '</div>' +
        '</div></li>';
      }).join('') + '</ul>';
  }

  async function submitSongRequestFlow(){
    if(!state.user){ showToast('Sign in first so we know who submitted this request.'); return; }
    const title = (document.getElementById('reqTitleInput').value || '').trim();
    if(!title){ showToast('Type a song title first.'); return; }
    const lyricsRaw = (document.getElementById('reqLyricsArea').value || '').trim();
    const dup = findPossibleDuplicateSong(title);
    const btn = document.getElementById('submitRequestBtn');
    btn.disabled = true;
    try{
      await submitSongRequest({
        title: title,
        lyricsRaw: lyricsRaw,
        submittedByUid: state.user.uid,
        submittedByName: (state.profile && state.profile.displayName) || 'Someone',
        churchName: (state.profile && state.profile.churchName) || '',
        possibleDuplicateId: dup ? dup.id : null,
        possibleDuplicateTitle: dup ? dup.title : null
      });
      showToast('Request submitted &mdash; a worship team editor will take a look.');
      songRequestTitle = ''; songRequestLyrics = '';
      render(); window.scrollTo(0,0);
    }catch(e){
      showToast('Couldn&rsquo;t submit that request &mdash; please try again.');
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  // Review queue -- worship-team editors and Admins/beta testers only (see
  // firestore.rules' songRequests/{requestId} comment for why this is
  // narrower than canAddSongs()). No live pending-count badge anywhere else
  // in the app on purpose -- that would mean an always-on
  // watchPendingSongRequests() subscription for every signed-in person just
  // to decide whether to show a number, which firestore.rules' read rule
  // would deny for anyone who isn't a reviewer; starting the watch only once
  // someone actually opens this screen keeps that query scoped to people the
  // rule allows it for.
  function renderSongRequestQueue(){
    if(!(state.isEditor || hasFullAccess())){ state.view='landing'; render(); return; }
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="reqQueueBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Song Requests</p>' +
        '<p class="landing-sub">Suggestions from members without direct Add Song access &mdash; approve to add straight to the hymnal (pre-filled from any lyrics they pasted), or reject.</p>' +
      '</div>' +
      (state.pendingSongRequests.length ? ('<ul class="hymn-list">' + state.pendingSongRequests.map(function(r){
        const sectionCount = r.lyricsRaw ? detectSections(r.lyricsRaw).length : 0;
        return '<li><div class="hymn-card" style="align-items:flex-start;">' +
          '<div class="hymn-card-main" style="cursor:default;flex-direction:column;align-items:flex-start;gap:6px;">' +
            '<p class="hymn-title">'+escapeHtml(r.title)+'</p>' +
            '<p class="hint">Submitted by '+escapeHtml(r.submittedByName||'Someone')+(r.churchName?(' &middot; '+escapeHtml(r.churchName)):'')+'</p>' +
            (r.possibleDuplicateTitle ? ('<p class="hint">&#9888; Might already exist: &ldquo;'+escapeHtml(r.possibleDuplicateTitle)+'&rdquo;</p>') : '') +
            '<p class="hint">'+(r.lyricsRaw ? (sectionCount+' section'+(sectionCount===1?'':'s')+' detected from pasted lyrics.') : 'No lyrics pasted &mdash; title only.')+'</p>' +
            '<div class="setlist-controls">' +
              '<button type="button" class="btn btn-primary" data-approve-request="'+escapeAttr(r.id)+'" style="width:auto;padding:8px 16px;">APPROVE &amp; ADD</button>' +
              '<button type="button" class="btn btn-ghost" data-reject-request="'+escapeAttr(r.id)+'" style="width:auto;padding:8px 16px;">REJECT</button>' +
            '</div>' +
          '</div>' +
        '</div></li>';
      }).join('') + '</ul>') : '<p class="hint">No pending requests right now.</p>');

    document.getElementById('reqQueueBackBtn').addEventListener('click', function(){
      stopPendingSongRequestsWatch(); state.view='landing'; render(); window.scrollTo(0,0);
    });
    document.querySelectorAll('[data-approve-request]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const req = state.pendingSongRequests.find(function(r){ return r.id === btn.getAttribute('data-approve-request'); });
        if(req) approveAndAddRequest(req);
      });
    });
    document.querySelectorAll('[data-reject-request]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-reject-request');
        btn.disabled = true;
        try{
          await reviewSongRequest(id, {
            status: 'rejected',
            reviewedByUid: state.user.uid,
            reviewedByName: (state.profile && state.profile.displayName) || 'An editor',
            reviewNote: ''
          });
          showToast('Request rejected.');
        }catch(e){
          showToast('Couldn&rsquo;t reject that request.');
          btn.disabled = false;
        }
      });
    });
  }

  // "Approve & Add": hands the request's title and (if any) auto-detected
  // sections to the existing Add Song form via addPrefillFromRequest, and
  // remembers the request id (addApprovingRequestId) so saveNewSong() can
  // mark it approved once the editor actually saves -- see both above.
  function approveAndAddRequest(req){
    addPrefillFromRequest = {
      requestId: req.id,
      title: req.title,
      sections: req.lyricsRaw ? detectSections(req.lyricsRaw) : []
    };
    stopPendingSongRequestsWatch();
    state.view = 'add';
    render(); window.scrollTo(0,0);
  }

  /* ============ BUILT-IN BIBLE (KJV) ============
     Public-domain KJV text (1769 edition), sourced from the "kjv" npm
     package (MIT/Public-Domain license, no dependencies) and reshaped at
     build time into src/content/kjv.json -- { books: [66 names in
     canonical order], text: { [book]: { [chapter]: { [verse]: "text" } } } }.
     Per Jared's decision on 2026-09-04 ("Start with KJV only"), this is the
     only translation bundled for now -- NIV and LSB are actively
     copyrighted and would need a publisher license (Biblica / 316
     Publishing-Lockman) before their text could ship the same way, and
     LEB's "unusually permissive" Faithlife terms still need an actual read
     before assuming they're fine for a paid app. See
     claude/phase4-features-and-scoping.md for the full analysis.

     Loaded lazily via dynamic import() the first time anyone opens Bible
     (not bundled into the main JS chunk) -- it's ~4.3MB of text almost
     nobody needs on every page load, and this way it doesn't slow down
     first paint for people who never open it. This whole feature is purely
     static/read-only content, so unlike everything else in this file there
     is no data-layer function, no Firestore collection, and no
     firestore.rules change involved -- it ships the same way the hymnal's
     own public-domain seed songs do, just lazy-loaded instead of bundled
     up front given its size. */
  let kjvData = null; // set once the dynamic import resolves
  let kjvLoading = false;
  let bibleBook = null;
  let bibleChapter = null;
  let bibleQuery = '';

  // Whether the CURRENT screen has any Bible-dependent UI on it worth
  // repainting once the (lazy, one-time) KJV import resolves -- the Bible
  // screen itself, the sermon-slide editor's "Bible Verse Slide" verse
  // lookup, and (2026-09-04) the host's ad hoc "Present a Bible Verse"
  // picker, which can be opened before the import has finished and would
  // otherwise sit stuck on "Loading the KJV text..." forever once it does.
  // Presentation builder [2026-09-08]: 'sermon-edit' USED to be listed here
  // too, on the theory that ADD VERSE (KJV) needed a rerender once the data
  // arrived. It doesn't -- renderSermonSlidesList()'s verse-insert-row never
  // reads kjvData while painting itself, only the data-insert-verse click
  // handler does (and that already has its own "still loading, try again"
  // toast + retry for the rare case someone clicks INSERT before the KJV
  // import resolves, which only takes a moment). Leaving it listed meant a
  // full renderSermonEdit() could fire out from under someone mid-keystroke
  // in the title field or a slide's text block the instant that background
  // load finished, silently eating whatever they'd just typed. Bible and
  // the host's verse picker both genuinely paint KJV-dependent content
  // (book/chapter listings, search results) and still need this.
  function viewNeedsKjvRerender(){
    return state.view === 'bible' ||
      (state.view === 'session-host' && hostVersePickerOpen);
  }
  function loadKjvData(){
    if(kjvData || kjvLoading) return;
    kjvLoading = true;
    import('./content/kjv.json').then(function(mod){
      kjvData = mod.default || mod;
      kjvLoading = false;
      if(viewNeedsKjvRerender()) render();
    }).catch(function(){
      kjvLoading = false;
      if(viewNeedsKjvRerender()) render();
    });
  }

  /* ============ DEVOTIONALS ============
     Public-domain daily devotional text -- Charles Spurgeon's "Morning and
     Evening" (1866; Spurgeon died in 1892, so the underlying text is
     unambiguously public domain), sourced from Christian Classics Ethereal
     Library (ccel.org) and reshaped by scripts/build-devotionals.mjs into
     src/content/devotionals.json -- { [MMDD]: { am:{title,ref,text},
     pm:{title,ref,text} } }, one entry per calendar day (366 keys, Feb 29
     included). Jared's call on 2026-09-23: ship CCEL's text as-is -- the
     1866 text itself is unquestionably PD, and CCEL's own reuse policy
     only asks a commercial USE to contact them first, which given
     devotionals are a free feature shown to every user (not sold
     separately) is a low enough bar not to chase down first. See
     claude/architecture-and-decisions.md for the fuller reasoning.

     Same lazy dynamic-import pattern as the KJV Bible just above -- this
     ships the same way, as a static read-only content asset with no
     Firestore collection or firestore.rules change of its own. Much
     smaller than kjv.json (366 days x two short readings, not the whole
     Bible), so lazy-loading isn't as load-bearing here, but there's still
     no reason to bundle it into the main chunk for the majority of visits
     that never open Fellowship at all.

     DEVOTIONAL_BOT_UID is the authorUid the dailyDevotionalNotify Cloud
     Function (functions/index.js) stamps on the ONE automatic post it
     creates each day -- not a real Firebase Auth uid, so it deliberately
     has no users/{uid} doc, no directory/{uid} doc, and can't be signed
     into. renderFeedPostCard() below checks for this exact constant to
     skip the normal clickable-avatar/name treatment (which would either
     show a bare "?" fallback avatar or, worse, open a profile screen for
     an account that doesn't exist) -- a devotional a human admin/editor
     posts manually through POST A DEVOTIONAL instead keeps their own real
     authorUid and displays like any other post, just with the devotional
     title/reference line added. MUST match the same constant in
     functions/index.js exactly, or the automatic post stops being
     recognized as one. */
  const DEVOTIONAL_BOT_UID = 'iworship-daily-devotional';
  let devotionalsData = null;
  let devotionalsLoading = false;
  function loadDevotionalsData(){
    if(devotionalsData || devotionalsLoading) return;
    devotionalsLoading = true;
    import('./content/devotionals.json').then(function(mod){
      devotionalsData = mod.default || mod;
      devotionalsLoading = false;
      if(state.view === 'fellowship' || state.view === 'devotionals') render();
    }).catch(function(){ devotionalsLoading = false; });
  }
  function devotionalKeyFor(d){
    return String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
  }
  // Walks back up to a week looking for a populated day -- cheap insurance
  // against any single day ending up missing (a failed fetch during the
  // one-time build, or Feb 29 in a source year that skipped it) rather
  // than the picker just going blank for that one day.
  function todaysDevotionalEntry(which){
    if(!devotionalsData) return null;
    const now = new Date();
    for(let back = 0; back < 7; back++){
      const probe = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      const day = devotionalsData[devotionalKeyFor(probe)];
      if(day && day[which]) return day[which];
    }
    return null;
  }

  /* Standalone "Devotionals" section [2026-09-24] -- Jared: "make sure
     that users can access it easily and can toggle from different days of
     the year easily." Until now the only way to see a devotional at all
     was the automatic daily Fellowship post, or an admin manually posting
     one -- there was no place to just go read one, let alone browse any
     OTHER day. This gives every user (signed in or not, matching the
     free-feature decision recorded above) its own reachable page: a big
     button on the Home screen (mirroring OPEN THE BIBLE (KJV) right next
     to it) plus a permanent sidebar/hamburger entry, landing on TODAY's
     reading with MORNING/EVENING tabs and a day-stepper (&larr;/&rarr; one
     day at a time, or a date picker to jump straight to any day of the
     year -- year itself is meaningless here since devotionalsData is only
     ever keyed by MMDD, so the picker always shows 2024 (a leap year, so
     Feb 29 is reachable) and only its month/day are read back out).

     devotionalsViewMonth/Day track the day currently on SCREEN, separately
     from "today" (todaysDevotionalEntry() above stays exactly as it was,
     still only ever used for the automatic post + the composer's POST A
     DEVOTIONAL picker, both of which are always about today's reading) --
     null until renderDevotionals() first runs, at which point it's seeded
     to the real current day. */
  let devotionalsViewMonth = null;
  let devotionalsViewDay = null;
  let devotionalsViewWhich = 'am';
  const DEVOTIONAL_MONTH_DAYS = [31,29,31,30,31,30,31,31,30,31,30,31];
  const DEVOTIONAL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function ensureDevotionalsViewDate(){
    if(devotionalsViewMonth != null) return;
    const now = new Date();
    devotionalsViewMonth = now.getMonth() + 1;
    devotionalsViewDay = now.getDate();
  }
  function devotionalsViewKey(){
    ensureDevotionalsViewDate();
    return String(devotionalsViewMonth).padStart(2,'0') + String(devotionalsViewDay).padStart(2,'0');
  }
  function devotionalsViewLabel(){
    ensureDevotionalsViewDate();
    return DEVOTIONAL_MONTH_NAMES[devotionalsViewMonth-1] + ' ' + devotionalsViewDay;
  }
  // Only ever stepped by exactly +-1 (the &larr;/&rarr; buttons), so this
  // single-step month-rollover walk is all the arithmetic it needs.
  function devotionalsStepDay(delta){
    ensureDevotionalsViewDate();
    let m = devotionalsViewMonth, d = devotionalsViewDay + delta;
    if(delta > 0){
      while(d > DEVOTIONAL_MONTH_DAYS[m-1]){ d -= DEVOTIONAL_MONTH_DAYS[m-1]; m = (m===12?1:m+1); }
    } else {
      while(d < 1){ m = (m===1?12:m-1); d += DEVOTIONAL_MONTH_DAYS[m-1]; }
    }
    devotionalsViewMonth = m; devotionalsViewDay = d;
  }
  function devotionalsIsToday(){
    const now = new Date();
    return devotionalsViewMonth === (now.getMonth()+1) && devotionalsViewDay === now.getDate();
  }

  function bibleChapterNumbers(book){
    if(!kjvData || !kjvData.text[book]) return [];
    return Object.keys(kjvData.text[book]).map(Number).sort(function(a,b){ return a-b; });
  }
  function bibleVerseEntries(book, chapter){
    if(!kjvData || !kjvData.text[book] || !kjvData.text[book][String(chapter)]) return [];
    const ch = kjvData.text[book][String(chapter)];
    return Object.keys(ch).map(Number).sort(function(a,b){ return a-b; }).map(function(v){
      return { verse:v, text:ch[String(v)] };
    });
  }
  // Simple substring search across the whole text, capped at 60 hits --
  // 31,102 verses is small enough that a plain scan is instant, no index
  // needed. The "#" paragraph marker and "[..]" italics brackets the source
  // text uses (see the kjv package's own README) are stripped for display
  // and for matching, so a search for "Son of man" isn't defeated by a
  // stray bracket landing mid-phrase.
  function cleanVerseText(raw){
    return raw.replace(/^#\s*/, '').replace(/\[|\]/g, '');
  }
  function bibleSearch(query){
    if(!kjvData) return [];
    const q = query.trim().toLowerCase();
    if(q.length < 3) return [];
    const results = [];
    for(let bi=0; bi<kjvData.books.length; bi++){
      const book = kjvData.books[bi];
      const chapters = kjvData.text[book];
      for(const chapKey in chapters){
        const verses = chapters[chapKey];
        for(const verseKey in verses){
          const text = cleanVerseText(verses[verseKey]);
          if(text.toLowerCase().indexOf(q) !== -1){
            results.push({ book:book, chapter:Number(chapKey), verse:Number(verseKey), text:text });
            if(results.length >= 60) return results;
          }
        }
      }
    }
    return results;
  }

  function renderBible(){
    if(!kjvData) loadKjvData();
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="bibleBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Bible</p>' +
        '<p class="landing-sub">King James Version (1769) &mdash; public domain, built in.</p>' +
      '</div>' +
      (!kjvData ?
        '<p class="hint" style="text-align:center;">'+(kjvLoading ? 'Loading the KJV text&hellip;' : 'Couldn&rsquo;t load the Bible text. Please try again.')+'</p>'
        :
        ('<div class="field"><label for="bibleSearchInput">SEARCH THE WHOLE BIBLE</label><input type="text" id="bibleSearchInput" placeholder="e.g. faith, shepherd, John 3" value="'+escapeAttr(bibleQuery)+'"></div>' +
        '<div id="bibleBody">' + renderBibleBody() + '</div>')
      );

    document.getElementById('bibleBackBtn').addEventListener('click', function(){
      if(bibleQuery){ bibleQuery=''; render(); window.scrollTo(0,0); return; }
      if(bibleChapter){ bibleChapter=null; render(); window.scrollTo(0,0); return; }
      if(bibleBook){ bibleBook=null; render(); window.scrollTo(0,0); return; }
      state.view='landing'; render(); window.scrollTo(0,0);
    });

    if(!kjvData) return;

    const searchInput = document.getElementById('bibleSearchInput');
    searchInput.addEventListener('input', function(e){
      bibleQuery = e.target.value;
      // Patches just the results/reader pane in place, same reasoning as
      // renderDuplicateHint elsewhere in this file -- never steal focus out
      // of the search box mid-keystroke by re-rendering the whole view.
      document.getElementById('bibleBody').innerHTML = renderBibleBody();
    });

    // Event delegation on the (stable) #bibleBody container rather than
    // re-binding a click handler on every chip/result -- it's attached once
    // here and keeps working across the innerHTML patches above and the
    // full re-renders below, since #bibleBody itself is never replaced,
    // only its children.
    document.getElementById('bibleBody').addEventListener('click', function(e){
      const bookBtn = e.target.closest('[data-open-book]');
      if(bookBtn){ bibleBook = bookBtn.getAttribute('data-open-book'); bibleChapter=null; bibleQuery=''; render(); window.scrollTo(0,0); return; }
      const chBtn = e.target.closest('[data-open-chapter]');
      if(chBtn){ bibleChapter = Number(chBtn.getAttribute('data-open-chapter')); render(); window.scrollTo(0,0); return; }
      const navBtn = e.target.closest('[data-goto-chapter-nav]:not([disabled])');
      if(navBtn){ bibleChapter = Number(navBtn.getAttribute('data-goto-chapter-nav')); render(); window.scrollTo(0,0); return; }
      const resultBtn = e.target.closest('[data-goto-book]');
      if(resultBtn){
        bibleBook = resultBtn.getAttribute('data-goto-book');
        bibleChapter = Number(resultBtn.getAttribute('data-goto-chapter'));
        bibleQuery = '';
        render(); window.scrollTo(0,0);
      }
    });
  }

  function renderBibleBody(){
    const q = bibleQuery.trim();
    if(q){
      // [Bug found 2026-09-10] this box's own placeholder ("e.g. faith,
      // shepherd, John 3") promises a reference like "John 3:16" jumps
      // straight to that verse, but this screen never actually called
      // parseVerseRef() -- typing a real reference just fell through to
      // bibleSearch()'s plain word-in-text scan, which almost never
      // matches a reference string against verse BODY text. The host's
      // in-session verse picker (renderVerseSearchBody()) already parses
      // references correctly; this wires the same parseVerseRef() call in
      // here too, so "John 3:16" (or "Psalm 23:1-6") now shows that exact
      // verse directly, with one tap to jump into reading it in context.
      const found = parseVerseRef(q);
      if(found){
        return '<div class="verse-block" style="margin-bottom:14px;"><p class="section-label uc">'+escapeHtml(found.refLabel)+'</p>' +
            '<p class="lyric-line">'+escapeHtml(found.text)+'</p></div>' +
          '<button type="button" class="btn btn-primary btn-block" data-goto-book="'+escapeAttr(found.book)+'" data-goto-chapter="'+found.chapter+'">READ '+escapeHtml(found.book)+' '+found.chapter+' IN FULL</button>';
      }
      // [Bug found 2026-09-10] this screen used to try bibleSearch() at 2
      // characters, but bibleSearch() itself silently returns [] under 3
      // (see its own comment) -- so a 2-character search always showed
      // "0 matches", which reads exactly like "search is broken" even
      // though it just never actually ran. Aligned to the same 3-character
      // floor bibleSearch() and the host's picker already use, with an
      // honest message instead of a misleading "0 matches" below it.
      if(q.length < 3){
        return '<p class="hint">Keep typing &mdash; at least 3 letters to search verse text (or type a full reference like &ldquo;John 3:16&rdquo;).</p>';
      }
      const results = bibleSearch(q);
      return '<p class="hint" style="margin-bottom:10px;">'+results.length+' match'+(results.length===1?'':'es')+(results.length>=60?' (showing the first 60)':'')+'</p>' +
        (results.length ? results.map(function(r){
          return '<button type="button" class="bible-search-result" data-goto-book="'+escapeAttr(r.book)+'" data-goto-chapter="'+r.chapter+'">' +
            '<span class="hymn-title" style="font-size:1rem;">'+escapeHtml(r.book)+' '+r.chapter+':'+r.verse+'</span>' +
            '<p class="hint">'+escapeHtml(r.text)+'</p>' +
          '</button>';
        }).join('') : '<p class="hint">No matches. Try a shorter word, a full reference (&ldquo;John 3:16&rdquo;), or a book name to browse instead.</p>');
    }
    if(bibleBook && bibleChapter){
      const verses = bibleVerseEntries(bibleBook, bibleChapter);
      const chapters = bibleChapterNumbers(bibleBook);
      const idx = chapters.indexOf(bibleChapter);
      const prevCh = idx > 0 ? chapters[idx-1] : null;
      const nextCh = idx < chapters.length-1 ? chapters[idx+1] : null;
      return '<p class="bible-crumb">'+escapeHtml(bibleBook)+'</p>' +
        '<h2 style="margin:0 0 16px;">'+escapeHtml(bibleBook)+' '+bibleChapter+'</h2>' +
        '<div class="lyric-sheet">' + verses.map(function(v){
          return '<p class="bible-verse-p"><span class="bible-verse-num">'+v.verse+'</span>'+escapeHtml(cleanVerseText(v.text))+'</p>';
        }).join('') + '</div>' +
        '<div class="slide-nav" style="margin-top:18px;">' +
          '<button type="button" class="btn btn-ghost" data-goto-chapter-nav="'+(prevCh||'')+'" '+(prevCh?'':'disabled')+'>&larr; '+(prevCh?('CHAPTER '+prevCh):'PREV')+'</button>' +
          '<button type="button" class="btn btn-ghost" data-goto-chapter-nav="'+(nextCh||'')+'" '+(nextCh?'':'disabled')+'>'+(nextCh?('CHAPTER '+nextCh):'NEXT')+' &rarr;</button>' +
        '</div>';
    }
    if(bibleBook){
      const chapters = bibleChapterNumbers(bibleBook);
      return '<p class="bible-crumb">'+escapeHtml(bibleBook)+' &mdash; choose a chapter</p>' +
        '<div class="filter-row">' + chapters.map(function(c){
          return '<button type="button" class="chip" data-open-chapter="'+c+'">'+c+'</button>';
        }).join('') + '</div>';
    }
    // Book picker, grouped Old/New Testament -- this data's canonical order
    // is Genesis..Malachi (39 books) then Matthew..Revelation (27 books),
    // the standard KJV book count and split, so a plain slice(0,39)/slice(39)
    // is all grouping needs (no separate lookup table to keep in sync).
    const otBooks = kjvData.books.slice(0, 39);
    const ntBooks = kjvData.books.slice(39);
    function bookChips(list){
      return '<div class="filter-row">' + list.map(function(b){
        return '<button type="button" class="chip" data-open-book="'+escapeAttr(b)+'">'+escapeHtml(b)+'</button>';
      }).join('') + '</div>';
    }
    return '<div class="section-heading"><h2 class="uc">Old Testament</h2></div>' + bookChips(otBooks) +
      '<div class="section-heading"><h2 class="uc">New Testament</h2></div>' + bookChips(ntBooks);
  }

  function renderDevotionals(){
    if(!devotionalsData) loadDevotionalsData();
    ensureDevotionalsViewDate();
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="devotionalsBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Devotionals</p>' +
        '<p class="landing-sub">Charles Spurgeon&rsquo;s &ldquo;Morning and Evening&rdquo; (1866) &mdash; a Morning and an Evening reading for every day of the year.</p>' +
      '</div>' +
      '<div id="devotionalsBody">' + renderDevotionalsBody() + '</div>';

    document.getElementById('devotionalsBackBtn').addEventListener('click', function(){
      state.view='landing'; render(); window.scrollTo(0,0);
    });
    attachDevotionalsBodyHandlers();
  }

  // Rebuilds just the #devotionalsBody pane (day nav / tabs / reading /
  // share) in place, same "patch one stable container" reasoning as
  // renderBibleBody()'s own callers -- stepping a day or flipping
  // MORNING/EVENING shouldn't scroll the page back up to the hero text.
  function renderDevotionalsBody(){
    if(!devotionalsData){
      return '<p class="hint" style="text-align:center;">'+(devotionalsLoading ? 'Loading today&rsquo;s devotional&hellip;' : 'Couldn&rsquo;t load the devotionals. Please try again.')+'</p>';
    }
    const key = devotionalsViewKey();
    const day = devotionalsData[key] || null;
    const entry = day ? day[devotionalsViewWhich] : null;
    const isToday = devotionalsIsToday();
    const canShare = !!state.user && (state.isEditor || hasFullAccess());
    // Dummy year 2024 (a leap year, so Feb 29 is a selectable date) -- the
    // <input type="date"> control only ever exists to let someone jump to
    // an arbitrary month/day; its year is discarded the moment it fires
    // (see the 'change' handler below).
    const dateValue = '2024-' + String(devotionalsViewMonth).padStart(2,'0') + '-' + String(devotionalsViewDay).padStart(2,'0');
    return (
      '<div class="devotional-reader-nav">' +
        '<button type="button" class="icon-btn-sm devotional-reader-step" id="devotionalPrevDayBtn" aria-label="Previous day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>' +
        '<div class="devotional-reader-date">' +
          '<span class="devotional-reader-date-label">'+escapeHtml(devotionalsViewLabel())+'</span>' +
          (isToday ? '<span class="devotional-tag" style="margin-top:2px;">TODAY</span>' : '<button type="button" class="switch-account" id="devotionalTodayBtn">JUMP TO TODAY</button>') +
        '</div>' +
        '<button type="button" class="icon-btn-sm devotional-reader-step" id="devotionalNextDayBtn" aria-label="Next day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>' +
      '</div>' +
      '<div class="field devotional-reader-jump"><label for="devotionalDateInput">JUMP TO A DATE</label><input type="date" id="devotionalDateInput" value="'+dateValue+'" aria-label="Jump to a date (day and month only -- this reading repeats every year)"></div>' +
      '<div class="devotional-reader-tabs" role="tablist" aria-label="Morning or Evening reading">' +
        '<button type="button" role="tab" aria-selected="'+(devotionalsViewWhich==='am'?'true':'false')+'" class="btn '+(devotionalsViewWhich==='am'?'btn-primary':'btn-ghost')+'" data-devotionals-which="am">MORNING</button>' +
        '<button type="button" role="tab" aria-selected="'+(devotionalsViewWhich==='pm'?'true':'false')+'" class="btn '+(devotionalsViewWhich==='pm'?'btn-primary':'btn-ghost')+'" data-devotionals-which="pm">EVENING</button>' +
      '</div>' +
      (entry ? (
        '<div class="devotional-reader-card">' +
          '<span class="devotional-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg></span>' +
          '<p class="devotional-reader-title">'+escapeHtml(entry.title||'')+(entry.ref?(' <span class="devotional-reader-ref">&mdash; '+escapeHtml(entry.ref)+'</span>'):'')+'</p>' +
          '<p class="devotional-reader-text">'+escapeHtml(entry.text||'')+'</p>' +
          (canShare ? '<button type="button" class="btn btn-ghost" id="shareDevotionalBtn" style="margin-top:16px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('link')+'</svg>SHARE TO FELLOWSHIP</button>' : '') +
        '</div>'
      ) : '<p class="hint" style="text-align:center;">No reading found for '+escapeHtml(devotionalsViewLabel())+'.</p>')
    );
  }

  function attachDevotionalsBodyHandlers(){
    const body = document.getElementById('devotionalsBody');
    if(!body) return;
    function refreshBody(){ body.innerHTML = renderDevotionalsBody(); attachDevotionalsBodyHandlers(); }
    const prevBtn = document.getElementById('devotionalPrevDayBtn');
    if(prevBtn) prevBtn.addEventListener('click', function(){ devotionalsStepDay(-1); refreshBody(); });
    const nextBtn = document.getElementById('devotionalNextDayBtn');
    if(nextBtn) nextBtn.addEventListener('click', function(){ devotionalsStepDay(1); refreshBody(); });
    const todayBtn = document.getElementById('devotionalTodayBtn');
    if(todayBtn) todayBtn.addEventListener('click', function(){
      const now = new Date();
      devotionalsViewMonth = now.getMonth()+1; devotionalsViewDay = now.getDate();
      refreshBody();
    });
    const dateInput = document.getElementById('devotionalDateInput');
    if(dateInput) dateInput.addEventListener('change', function(){
      const parts = (dateInput.value||'').split('-'); // "2024-MM-DD" -- year is discarded, see this control's own comment above
      if(parts.length===3){
        devotionalsViewMonth = Number(parts[1]); devotionalsViewDay = Number(parts[2]);
        refreshBody();
      }
    });
    document.querySelectorAll('[data-devotionals-which]').forEach(function(btn){
      btn.addEventListener('click', function(){ devotionalsViewWhich = btn.getAttribute('data-devotionals-which'); refreshBody(); });
    });
    const shareBtn = document.getElementById('shareDevotionalBtn');
    if(shareBtn) shareBtn.addEventListener('click', async function(){
      const day = devotionalsData[devotionalsViewKey()];
      const entry = day ? day[devotionalsViewWhich] : null;
      if(!entry || !state.user) return;
      shareBtn.disabled = true;
      try{
        const bodyText = (entry.text || '').length > 1900 ? (entry.text.slice(0, 1900).trim() + '…') : (entry.text || '');
        await createPost({
          authorUid: state.user.uid, authorName: currentDisplayName() || 'Someone',
          kind: 'devotional',
          devotionalTitle: entry.title || '', devotionalRef: entry.ref || '',
          text: bodyText,
          mediaUrl: null, mediaKind: null, mediaStoragePath: null
        });
        showToast('Devotional shared to Fellowship.');
      }catch(e){ showToast('Couldn&rsquo;t share &mdash; try again.'); }
      shareBtn.disabled = false;
    });
  }

  /* ============ SERMON PRESENTATIONS ============
     [2026-09-04] Jared's ask: "Pastors can upload the outline of their
     preaching... there will be readymade templates," presented "kinda like
     powerpoint presentation, where there's a presented screen, a
     presenter's control screen... I need that to be with the songs
     broadcast as well." A sermon is an ordered list of slides, PRESENTED
     from the Host Session screen by reusing the exact same room live-sync
     mechanism songs already use (see ensureViewSermonWatch() and
     renderSessionHost()'s sermon picker below) rather than a separate,
     disconnected presenting system.

     Presentation builder [2026-09-08]: originally shipped as three fixed
     templates (title/point/verse), all hard-centered. Jared: "I don't like
     the formatting as everything is in center. Make it an actual
     presentation builder." A slide is now a free canvas of independently
     positioned/sized TEXT and IMAGE blocks (stored as percentages of the
     slide, so they scale identically at every screen size/aspect this app
     renders them at -- stage/projector, split-screen, congregant slide-
     card, chart view) plus an optional background color or image, instead
     of three fixed layouts -- see isBlocksSlide()/renderSlideCanvas()/
     renderSlideCanvasEditable() below. An OLD slide saved before this (no
     `.blocks` array, still `{template, heading, subtitle, points, verseRef,
     verseText}`) keeps rendering exactly as it always has via the ORIGINAL
     centered renderer (sermonSlideLineParts()/sermonLinesAsCardHtml()/
     sermonLinesAsStageHtml(), unchanged, still also used by ad hoc Bible
     verse presenting's verseAsSlide() -- that feature is deliberately
     untouched by any of this, it was never sermon-slide-shaped to begin
     with) -- until it's opened in this editor, at which point
     migrateLegacySlideToBlocks() converts it to blocks on the spot so it's
     immediately editable in the new builder. There's no separate "upgrade"
     button: opening an old sermon and hitting SAVE (even with no edits) is
     the upgrade, same as any file format migrating the moment it's
     resaved. The slide-list editor below still mirrors the Add Song
     section-builder's UI conventions (an ordered list of cards, add/remove
     by hand, edits synced live into a module-level array, the whole list
     repainted into a single holder div on any structural change) for the
     SLIDE-level controls (reorder/remove) -- see renderSectionsList() above
     for that precedent -- but each slide's own content is now the
     interactive canvas below, not a set of plain form fields. */
  const BLOCK_SIZES = ['sm', 'md', 'lg', 'xl'];
  // A handful of on-brand presets rather than a full color picker -- keeps
  // this from turning into a second, unrelated design-tool feature. `dark`
  // says whether that background needs light (not --ink) block text by
  // default for contrast; a custom uploaded image also defaults to light
  // text (see renderSlideCanvas()) since there's no way to know its actual
  // brightness without inspecting pixels, which this deliberately doesn't do.
  const SLIDE_BACKGROUNDS = [
    { key:'default', label:'Ivory', dark:false },
    { key:'wine', label:'Wine', dark:true },
    { key:'pine', label:'Pine', dark:false },
    { key:'gold', label:'Gold', dark:false },
    { key:'black', label:'Black', dark:true }
  ];
  function slideBgMeta(key){
    return SLIDE_BACKGROUNDS.find(function(b){ return b.key===key; }) || SLIDE_BACKGROUNDS[0];
  }
  function slideBgCssValue(key){
    if(key==='wine') return 'var(--wine)';
    if(key==='pine') return 'var(--pine-tint)';
    if(key==='gold') return 'var(--gold-tint)';
    if(key==='black') return '#000';
    return 'var(--surface)';
  }
  function blockId(){ return 'block-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); }
  // Sensible STARTING position/size per preset -- every value here is just
  // as freely draggable/resizable afterward as a block added any other way;
  // these presets only save the host from placing a first heading/body
  // block from absolute scratch every time.
  function newTextBlock(preset){
    if(preset === 'heading') return { id:blockId(), type:'text', x:10, y:10, w:80, h:20, text:'', align:'center', size:'xl', bold:true };
    if(preset === 'bullets') return { id:blockId(), type:'text', x:10, y:32, w:80, h:55, text:'', align:'left', size:'md', bold:false };
    if(preset === 'verse') return { id:blockId(), type:'text', x:10, y:25, w:80, h:50, text:'', align:'center', size:'lg', bold:false };
    return { id:blockId(), type:'text', x:15, y:40, w:70, h:20, text:'', align:'center', size:'md', bold:false }; // 'body'
  }
  function newImageBlock(){
    return { id:blockId(), type:'image', x:20, y:15, w:60, h:70, url:'', storagePath:'' };
  }
  // Default Presentation Background [2026-09-24] -- Jared: "add an option
  // for presenters to upload a default screen or background image for
  // songs and in-app built sermons." Settable from Settings (see
  // renderSettings()'s "Presentation Background" card), stored on the
  // presenter's own profile (users/{uid}.defaultStageBg) as the same
  // {url, storagePath} shape uploadMediaFile() already returns everywhere
  // else in this app. Two, deliberately different, application points:
  //   - Brand new sermon slides (newSermonSlide() below) start with this as
  //     their background instead of the plain Ivory default -- an EXISTING
  //     slide never changes underneath someone; a per-slide background,
  //     already a fully built feature (see the BACKGROUND swatch row in
  //     renderSermonSlidesList()), always still overrides this per slide.
  //   - Song lyrics on the stage/projector view have never had a
  //     background-image concept before at all -- renderStageSlide() below
  //     paints this behind the lyric lines directly.
  function presenterStageBg(){
    const bg = state.profile && state.profile.defaultStageBg;
    return (bg && bg.url) ? bg : null;
  }
  // Presentation Logo [2026-09-24] -- exact mirror of presenterStageBg()
  // just above, for the new "LOGO" stage override (see resolveRoomContent()'s
  // comment). Stored the same way, on the presenter's own profile
  // (users/{uid}.presenterLogo, same {url, storagePath} shape), with its
  // own upload/replace/remove card in Settings right below Presentation
  // Background.
  function presenterLogoUrl(){
    const logo = state.profile && state.profile.presenterLogo;
    return (logo && logo.url) ? logo : null;
  }
  function newSermonSlide(){
    const presenterBg = presenterStageBg();
    return {
      id: 'slide-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      background: presenterBg ? { type:'image', url: presenterBg.url, storagePath: presenterBg.storagePath || '' } : { type:'color', color:'default' },
      blocks: []
    };
  }
  function isBlocksSlide(slide){ return !!(slide && Array.isArray(slide.blocks)); }
  // Legacy-only label -- a blocks-based slide has no single "type" anymore,
  // so callers use slideShortLabel() below instead; this stays only for an
  // OLD, not-yet-migrated sermon's jump-chip/next-up labels.
  function sermonTemplateLabel(key){
    if(key === 'title') return 'Title Slide';
    if(key === 'point') return 'Point Slide';
    if(key === 'verse') return 'Bible Verse Slide';
    return key || 'Slide';
  }
  // Short label for a slide, used in "next up"/jump-chip contexts -- works
  // for both a legacy {template} slide (delegates to sermonTemplateLabel())
  // and a blocks-based one, which falls back to a snippet of its first text
  // block (or a bare "Slide N" if it's image-only/still empty).
  function slideShortLabel(slide, indexFallback){
    if(!isBlocksSlide(slide)) return sermonTemplateLabel(slide.template);
    const firstText = (slide.blocks||[]).find(function(b){ return b.type==='text' && b.text; });
    if(firstText){
      const line = firstText.text.split('\n')[0];
      return line.length > 28 ? (line.slice(0,28)+'…') : line;
    }
    return 'Slide' + (typeof indexFallback==='number' ? (' '+(indexFallback+1)) : '');
  }
  // Converts an old {template, heading, subtitle, points, verseRef,
  // verseText} slide into the equivalent blocks so an existing sermon opens
  // straight into the visual builder instead of forcing a from-scratch
  // rebuild -- purely a starting LAYOUT, identical in kind to what
  // newTextBlock()'s presets produce.
  function migrateLegacySlideToBlocks(sl){
    const blocks = [];
    if(sl.template === 'title'){
      if(sl.heading) blocks.push(Object.assign(newTextBlock('heading'), { text: sl.heading, y:30, h:22 }));
      if(sl.subtitle) blocks.push(Object.assign(newTextBlock('body'), { text: sl.subtitle, y:54, h:14, size:'md' }));
    } else if(sl.template === 'point'){
      if(sl.heading) blocks.push(Object.assign(newTextBlock('heading'), { text: sl.heading, y:8, h:18 }));
      const points = (sl.points||[]).filter(Boolean);
      if(points.length) blocks.push(Object.assign(newTextBlock('bullets'), { text: points.map(function(p){ return '• ' + p; }).join('\n'), y:30 }));
    } else { // 'verse'
      if(sl.heading) blocks.push(Object.assign(newTextBlock('body'), { text: sl.heading, y:8, h:14, bold:true }));
      if(sl.verseText) blocks.push(Object.assign(newTextBlock('verse'), { text: '“'+sl.verseText+'”', y: sl.heading?24:20, h: sl.heading?52:58 }));
      if(sl.verseRef) blocks.push(Object.assign(newTextBlock('body'), { text: '— ' + sl.verseRef, y:80, h:12, size:'sm' }));
    }
    return { id: sl.id, background: { type:'color', color:'default' }, blocks: blocks };
  }

  let sermonEditId = null;              // null while building a brand-new sermon, else the doc id being edited
  let sermonEditReturnView = 'sermons'; // 'sermons' | 'session-host' -- where BACK and a successful Save both return to
  let sermonEditTitle = '';
  let sermonEditSpeaker = '';
  let sermonEditSlides = [];            // [{ id, background:{type:'color'|'image', color?, url?, storagePath?}, blocks:[Block] }]
  let sermonDeleteConfirmId = null;
  // Which single block (across the whole slide list, since only one can be
  // actively edited at a time) is selected -- {slideIdx, blockIdx} or null.
  // Drives both the selection outline/resize handle on the canvas and which
  // block's properties panel renders below it. Reset whenever the editor
  // opens or a slide's structure changes underneath it.
  let sermonEditSelectedBlock = null;
  // Toggles the small "type a reference, look it up, insert it" row under
  // ADD VERSE (KJV) -- which slide index has that row open, or null.
  let sermonEditVerseRowOpenIdx = null;

  function openSermonEditor(sermon, returnView){
    sermonEditId = sermon ? sermon.id : null;
    sermonEditTitle = sermon ? (sermon.title||'') : '';
    sermonEditSpeaker = sermon ? (sermon.speaker||'') : '';
    sermonEditSlides = (sermon && sermon.slides && sermon.slides.length)
      ? sermon.slides.map(function(sl){
          return isBlocksSlide(sl)
            ? Object.assign({}, sl, { background: sl.background || { type:'color', color:'default' }, blocks: sl.blocks.map(function(b){ return Object.assign({}, b); }) })
            : migrateLegacySlideToBlocks(sl);
        })
      : [newSermonSlide()];
    sermonEditSelectedBlock = null;
    sermonEditVerseRowOpenIdx = null;
    sermonEditReturnView = returnView || 'sermons';
    loadKjvData(); // so ADD VERSE (KJV)'s lookup is ready without a wasted first click
    state.view = 'sermon-edit';
    render(); window.scrollTo(0,0);
  }

  // Parses "Book Chapter:Verse" (e.g. "1 John 3:16") OR a same-chapter range
  // "Book Chapter:Verse-Verse" (e.g. "Psalm 23:1-6") against the same KJV
  // data/lookup the Bible screen uses. [2026-09-04, range support added]
  // Originally single-verse-only; Jared asked for ranges since a lot of
  // real scripture readings (a whole psalm, a longer passage) are more
  // than one verse. A requested range that runs past the end of a short
  // chapter is clamped to however many verses actually exist rather than
  // failing outright (so "Psalm 23:1-8" on a 6-verse chapter still returns
  // verses 1-6) -- `verseEnd` on the returned object reflects the actual
  // last verse found, which may be less than what was typed.
  //
  // Returns null for anything that doesn't parse or match. `text` is the
  // single verse's plain text for a single-verse ref (unchanged from
  // before, so existing sermon slides' saved verseText never gains a
  // number prefix); for a multi-verse range it's each verse's cleaned text
  // prefixed with its own verse number and joined into one running-text
  // passage, since sermonSlideLineParts()'s 'verse' template renders
  // `verseText` as one continuous paragraph. `refLabel` is the canonical
  // "Book Chapter:Verse" or "Book Chapter:Verse-Verse" string callers
  // should store/display instead of hand-assembling it from parts.
  function parseVerseRef(ref){
    if(!kjvData) return null;
    const m = ref.trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
    if(!m) return null;
    const bookInput = m[1].trim().toLowerCase();
    const book = kjvData.books.find(function(b){ return b.toLowerCase() === bookInput; });
    if(!book) return null;
    const chapter = Number(m[2]);
    const verseStart = Number(m[3]);
    const verseEndRequested = m[4] ? Number(m[4]) : verseStart;
    if(verseEndRequested < verseStart) return null; // e.g. "23:6-1" -- not a valid range
    const entries = bibleVerseEntries(book, chapter).filter(function(e){
      return e.verse >= verseStart && e.verse <= verseEndRequested;
    });
    if(!entries.length) return null;
    const verseEnd = entries[entries.length-1].verse;
    const text = entries.length === 1
      ? cleanVerseText(entries[0].text)
      : entries.map(function(e){ return e.verse + ' ' + cleanVerseText(e.text); }).join(' ');
    const refLabel = book + ' ' + chapter + ':' + verseStart + (verseEnd > verseStart ? ('-' + verseEnd) : '');
    return { book: book, chapter: chapter, verse: verseStart, verseStart: verseStart, verseEnd: verseEnd, text: text, refLabel: refLabel };
  }

  // Sermon sharing [2026-09-04] -- Jared: "give them a search bar where
  // they can search for Account ID, name, church, and add an option to
  // share the link as well." sermonShareOpenId tracks which of the
  // caller's own sermon cards has its share panel expanded (only one at a
  // time, mirroring sermonDeleteConfirmId just below); sermonShareQuery is
  // that panel's live search text. See shareSermon()/unshareSermon()/
  // watchSermonsSharedWithMe() in data/index.js, watchDirectory() (backs
  // state.directory, started/stopped alongside this screen -- see
  // startDirectoryWatch() near watchAuth), and firestore.rules'
  // directory/{uid} + sermons/{sermonId} update-rule comments for the
  // access-model reasoning.
  let sermonShareOpenId = null;
  let sermonShareQuery = '';

  function sermonShareLink(id){
    return window.location.origin + window.location.pathname + '?sermon=' + encodeURIComponent(id);
  }

  // Search results inside one sermon's share panel -- mirrors
  // renderAdminUserResults() above, but reads state.directory (open to any
  // signed-in person) instead of the Admin-only state.adminUsers, and an
  // exact (case-sensitive) match on the raw query against uid covers "by
  // Account ID" alongside the case-insensitive name/church substring match.
  function renderSermonShareResults(s, query){
    const raw = query.trim();
    if(!raw) return '';
    const q = raw.toLowerCase();
    const shared = s.sharedWithUids || [];
    const matches = state.directory.filter(function(u){
      if(u.uid === s.createdByUid || shared.includes(u.uid)) return false; // already covered above
      return u.uid === raw || (u.displayName||'').toLowerCase().includes(q) || (u.churchName||'').toLowerCase().includes(q);
    }).slice(0,8);
    if(!matches.length) return '<p class="hint">No matching accounts &mdash; try their exact Account ID, or send them the link below instead.</p>';
    return '<ul class="setlist-items">' + matches.map(function(u){
      return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(u.displayName||'(no name set)')+
        (u.churchName ? ' <span class="hint">&middot; '+escapeHtml(u.churchName)+'</span>' : '') + '</span>' +
        '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-share-sermon="'+s.id+'" data-share-uid="'+escapeAttr(u.uid)+'" aria-label="Share with this account" style="width:auto;padding:0 8px;">SHARE</button></span></li>';
    }).join('') + '</ul>';
  }

  function renderSermonSharePanel(s){
    const shared = s.sharedWithUids || [];
    return '<p class="control-label uc" style="margin-bottom:10px;">Share &ldquo;'+escapeHtml(s.title||'this sermon')+'&rdquo;</p>' +
      (shared.length ? ('<ul class="setlist-items">' + shared.map(function(uid){
          const person = state.directory.find(function(d){ return d.uid===uid; });
          return '<li class="setlist-item"><span class="setlist-title">'+(person ? (escapeHtml(person.displayName||'(no name set)')+(person.churchName?' <span class="hint">&middot; '+escapeHtml(person.churchName)+'</span>':'')) : ('<code>'+escapeHtml(uid)+'</code>'))+'</span>' +
            '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-unshare-sermon="'+s.id+'" data-unshare-uid="'+escapeAttr(uid)+'" aria-label="Remove access" style="width:auto;padding:0 8px;">&times;</button></span></li>';
        }).join('') + '</ul>') : '<p class="hint">Not shared with anyone yet.</p>') +
      '<div class="field" style="margin-top:10px;"><label for="sermonShareSearch-'+s.id+'">FIND BY ACCOUNT ID, NAME, OR CHURCH</label>' +
        '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="sermonShareSearch-'+s.id+'" data-share-search="'+s.id+'" placeholder="Search&hellip;" value="'+escapeAttr(sermonShareQuery)+'" autocomplete="off"></div>' +
      '</div>' +
      '<div data-share-results="'+s.id+'">' + renderSermonShareResults(s, sermonShareQuery) + '</div>' +
      '<p class="hint" style="margin:16px 0 8px;">Or send this link &mdash; anyone signed in who opens it can add this sermon to their own list themselves:</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
        '<code style="word-break:break-all;font-size:.8rem;">'+escapeHtml(sermonShareLink(s.id))+'</code>' +
        '<button type="button" class="switch-account" data-copy-share-link="'+s.id+'">COPY LINK</button>' +
      '</div>';
  }

  // Wires up every currently-rendered SHARE button -- called after the
  // full renderSermons() paint AND after each keystroke's targeted
  // re-render of one panel's results div (see the data-share-search
  // handler below), since that div's contents (and their buttons) are
  // replaced fresh each time.
  function bindSermonShareButtons(){
    document.querySelectorAll('[data-share-sermon]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const sermonId = btn.getAttribute('data-share-sermon');
        const uid = btn.getAttribute('data-share-uid');
        btn.disabled = true;
        try{ await shareSermon(sermonId, uid); showToast('Shared.'); }
        catch(e){ showToast('Couldn&rsquo;t share &mdash; try again.'); }
        render();
      });
    });
  }

  // =========================================================================
  // Media Library [2026-09-06] -- Jared: "is there a way for us to upload a
  // presentation (canva, pptx, google slides embed)? an image? a video?"
  // Everything here mirrors the Sermons screen just above almost exactly
  // (same ownership/sharing model, same list/share/delete pattern) -- see
  // interface.md's "Media/AVP" section for the full design writeup,
  // including why Cloud Storage needs Jared to enable Firebase's Blaze
  // billing plan before uploads will actually succeed.
  let mediaShareOpenId = null;
  let mediaShareQuery = '';
  let mediaDeleteConfirmId = null;
  let mediaLibraryReturnView = 'landing'; // 'landing' | 'session-host' -- where BACK returns to
  // Which "+ ADD ..." quick-action panel is open, if any -- one at a time.
  let mediaAddMode = null; // null | 'image' | 'video' | 'slideshow' | 'embed'
  let mediaAddTitle = '';
  let mediaAddEmbedUrl = '';
  // [2026-09-24] Progress display moved to the background upload tray (see
  // pushUploadQueueEntry(), up by renderChatDock()) -- every upload
  // handler in attachMediaLibraryHandlers() now closes this panel the
  // instant a file's picked, before there's ever a moment to show
  // "busy"/"uploading" IN the panel itself, so mediaUploadBusy effectively
  // never goes true anymore and mediaUploadStatus effectively never shows
  // anything here. Left in place (harmlessly inert, not deleted) rather
  // than ripping out renderMediaAddPanel()'s disabled-state/hint-text
  // markup that reads them -- a future upload TYPE that genuinely needs to
  // block this panel while it runs could still use them again.
  let mediaUploadBusy = false;
  let mediaUploadStatus = '';
  // Media Folders [2026-09-06] -- Jared: "these media should be available
  // outside the session like a separate folder or section where AVPs can
  // prep upload beforehand and manage it by folders." See interface.md's
  // "Media Folders" section for the full design. null = the library's root
  // view (folder cards + unfiled items); otherwise the id of the one folder
  // currently being browsed.
  let mediaLibraryFolderId = null;
  let mediaNewFolderOpen = false;
  let mediaNewFolderName = '';
  let mediaFolderRenameId = null;
  let mediaFolderRenameName = '';
  let mediaFolderDeleteConfirmId = null;
  let mediaMoveOpenId = null; // media item id whose MOVE (to another folder) panel is open
  // Media preview [2026-09-24] -- Jared: "where's the option to preview the
  // media?" Before this, a Media Library card was just an icon + title/meta
  // with no way to actually see the image/video/slideshow/embed before
  // presenting it live. mediaPreviewOpenId is the id of the one item whose
  // PREVIEW panel is open (same one-at-a-time convention as
  // mediaMoveOpenId/mediaShareOpenId); mediaPreviewSlideIndex only matters
  // for a 'slideshow' item, letting the preview page through its slides the
  // same way the live stage does, without touching anything room/session
  // related -- this is a purely local, read-only look, not a rehearsal of
  // what's live.
  let mediaPreviewOpenId = null;
  let mediaPreviewSlideIndex = 0;

  function openMediaLibrary(returnView){
    mediaLibraryReturnView = returnView || 'landing';
    mediaShareOpenId = null; mediaShareQuery = ''; mediaDeleteConfirmId = null;
    mediaAddMode = null; mediaAddTitle = ''; mediaAddEmbedUrl = ''; mediaUploadBusy = false; mediaUploadStatus = '';
    mediaLibraryFolderId = null; mediaNewFolderOpen = false; mediaNewFolderName = '';
    mediaFolderRenameId = null; mediaFolderRenameName = ''; mediaFolderDeleteConfirmId = null; mediaMoveOpenId = null;
    mediaPreviewOpenId = null; mediaPreviewSlideIndex = 0;
    startMyMediaWatch(); startSharedMediaWatch(); startDirectoryWatch(); startMyMediaFoldersWatch();
    state.view = 'media-library';
    render(); window.scrollTo(0,0);
  }

  // A reasonable default title from a picked file's name (strip the
  // extension, swap underscores/dashes for spaces, title-case each word) --
  // used whenever the host didn't type one in first. No rename UI exists
  // yet for an already-uploaded item; see interface.md's "Deliberately not
  // built" note.
  function titleFromFilename(name){
    const base = String(name||'').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if(!base) return 'Untitled';
    return base.replace(/\w\S*/g, function(w){ return w.charAt(0).toUpperCase()+w.slice(1); });
  }

  // Auto-detects a provider label from a pasted embed URL's hostname, purely
  // for the library list's own icon/label -- nothing about playback depends
  // on which provider it is (see interface.md's "embed" note).
  function detectEmbedProvider(url){
    try{
      const host = new URL(url).hostname;
      if(host.indexOf('docs.google.com') !== -1) return 'Google Slides';
      if(host.indexOf('canva.com') !== -1) return 'Canva';
      if(host.indexOf('onedrive.live.com') !== -1 || host.indexOf('sway.office.com') !== -1 || host.indexOf('officeapps.live.com') !== -1) return 'PowerPoint';
      return 'Other';
    }catch(e){ return 'Other'; }
  }

  function renderMediaShareResults(m, query){
    const raw = query.trim();
    if(!raw) return '';
    const q = raw.toLowerCase();
    const shared = m.sharedWithUids || [];
    const matches = state.directory.filter(function(u){
      if(u.uid === m.createdByUid || shared.includes(u.uid)) return false;
      return u.uid === raw || (u.displayName||'').toLowerCase().includes(q) || (u.churchName||'').toLowerCase().includes(q);
    }).slice(0,8);
    if(!matches.length) return '<p class="hint">No matching accounts &mdash; try their exact Account ID.</p>';
    return '<ul class="setlist-items">' + matches.map(function(u){
      return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(u.displayName||'(no name set)')+
        (u.churchName ? ' <span class="hint">&middot; '+escapeHtml(u.churchName)+'</span>' : '') + '</span>' +
        '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-share-media="'+m.id+'" data-share-uid="'+escapeAttr(u.uid)+'" aria-label="Share with this account" style="width:auto;padding:0 8px;">SHARE</button></span></li>';
    }).join('') + '</ul>';
  }

  function renderMediaSharePanel(m){
    const shared = m.sharedWithUids || [];
    return '<p class="control-label uc" style="margin-bottom:10px;">Share &ldquo;'+escapeHtml(m.title||'this media item')+'&rdquo;</p>' +
      (shared.length ? ('<ul class="setlist-items">' + shared.map(function(uid){
          const person = state.directory.find(function(d){ return d.uid===uid; });
          return '<li class="setlist-item"><span class="setlist-title">'+(person ? (escapeHtml(person.displayName||'(no name set)')+(person.churchName?' <span class="hint">&middot; '+escapeHtml(person.churchName)+'</span>':'')) : ('<code>'+escapeHtml(uid)+'</code>'))+'</span>' +
            '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-unshare-media="'+m.id+'" data-unshare-uid="'+escapeAttr(uid)+'" aria-label="Remove access" style="width:auto;padding:0 8px;">&times;</button></span></li>';
        }).join('') + '</ul>') : '<p class="hint">Not shared with anyone yet.</p>') +
      '<div class="field" style="margin-top:10px;"><label for="mediaShareSearch-'+m.id+'">FIND BY ACCOUNT ID, NAME, OR CHURCH</label>' +
        '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="mediaShareSearch-'+m.id+'" data-media-share-search="'+m.id+'" placeholder="Search&hellip;" value="'+escapeAttr(mediaShareQuery)+'" autocomplete="off"></div>' +
      '</div>' +
      '<div data-media-share-results="'+m.id+'">' + renderMediaShareResults(m, mediaShareQuery) + '</div>';
  }

  function bindMediaShareButtons(){
    document.querySelectorAll('[data-share-media]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const mediaId = btn.getAttribute('data-share-media');
        const uid = btn.getAttribute('data-share-uid');
        btn.disabled = true;
        try{ await shareMedia(mediaId, uid); showToast('Shared.'); }
        catch(e){ showToast('Couldn&rsquo;t share &mdash; try again.'); }
        render();
      });
    });
  }

  // The "+ ADD ..." quick-action row's expanded panel -- one small form per
  // mediaAddMode, each ending in either a file input (image/video/slideshow)
  // or a SAVE button (embed). A file input's own 'change' event starts the
  // upload immediately (see attachMediaLibraryHandlers()) -- there's no
  // separate "now click upload" step once a file's picked.
  function renderMediaAddPanel(){
    if(!mediaAddMode) return '';
    const titleField =
      '<div class="field"><label for="mediaAddTitleInput">TITLE</label>' +
        '<input type="text" id="mediaAddTitleInput" placeholder="e.g. Baptism Video, Sunday Announcements" value="'+escapeAttr(mediaAddTitle)+'" '+(mediaUploadBusy?'disabled':'')+'></div>';
    let body;
    if(mediaAddMode === 'image'){
      body = titleField +
        '<div class="field"><label for="mediaImageFileInput">CHOOSE AN IMAGE</label><input type="file" id="mediaImageFileInput" accept="image/*" '+(mediaUploadBusy?'disabled':'')+'></div>';
    } else if(mediaAddMode === 'video'){
      body = titleField +
        '<div class="field"><label for="mediaVideoFileInput">CHOOSE A VIDEO</label><input type="file" id="mediaVideoFileInput" accept="video/*" '+(mediaUploadBusy?'disabled':'')+'></div>' +
        '<p class="hint">Up to 300MB. A shorter, compressed (H.264/MP4) file uploads faster and plays back more reliably during a live service.</p>';
    } else if(mediaAddMode === 'slideshow'){
      body = titleField +
        '<div class="field"><label for="mediaPptxFileInput">UPLOAD A POWERPOINT (.PPTX)</label><input type="file" id="mediaPptxFileInput" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" '+(mediaUploadBusy?'disabled':'')+'></div>' +
        '<p class="hint">Upload your .pptx file directly &mdash; each slide is converted into an image automatically, in order.</p>' +
        '<p class="hint" style="text-align:center;margin:12px 0;">&mdash; OR &mdash;</p>' +
        '<div class="field"><label for="mediaSlideshowFileInput">CHOOSE IMAGES, IN ORDER</label><input type="file" id="mediaSlideshowFileInput" accept="image/*" multiple '+(mediaUploadBusy?'disabled':'')+'></div>' +
        '<p class="hint">Or export your Canva/Google Slides deck as images (or a PDF converted to images) first, then select every page here at once, in the order they should present.</p>';
    } else {
      body = titleField +
        '<div class="field"><label for="mediaEmbedUrlInput">EMBED / SHARE LINK</label><input type="text" id="mediaEmbedUrlInput" placeholder="https://..." value="'+escapeAttr(mediaAddEmbedUrl)+'" '+(mediaUploadBusy?'disabled':'')+'></div>' +
        '<p class="hint">Google Slides: File &rarr; Share &rarr; Publish to web &rarr; Embed. Canva: Share &rarr; More &rarr; Embed. Slide navigation happens inside the embed itself once it&rsquo;s live, using its own controls.</p>' +
        '<button type="button" class="btn btn-primary" id="mediaEmbedSaveBtn" '+(mediaUploadBusy?'disabled':'')+'>SAVE</button>';
    }
    return '<div class="session-card">' + body +
      (mediaUploadStatus ? ('<p class="hint" id="mediaUploadStatusText" style="margin-top:10px;">'+escapeHtml(mediaUploadStatus)+'</p>') : '') +
      '<button type="button" class="switch-account" id="mediaAddCancelBtn" style="margin-top:10px;" '+(mediaUploadBusy?'disabled':'')+'>CANCEL</button>' +
    '</div>';
  }

  // Extracted [2026-09-06, in-session upload] so the exact same segmented
  // IMAGE/VIDEO/SLIDESHOW/EMBED-LINK row can be reused by renderMediaPicker()
  // (the Host Session MEDIA tab's own "+ UPLOAD NEW" toggle) as well as here.
  function renderMediaAddSegmentedRow(){
    return '<div class="content-segmented" style="margin-bottom:14px;flex-wrap:wrap;">' +
        '<button class="segment-btn'+(mediaAddMode==='image'?' active':'')+'" id="mediaAddImageBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('image')+'</svg><span>IMAGE</span></button>' +
        '<button class="segment-btn'+(mediaAddMode==='video'?' active':'')+'" id="mediaAddVideoBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('video')+'</svg><span>VIDEO</span></button>' +
        '<button class="segment-btn'+(mediaAddMode==='slideshow'?' active':'')+'" id="mediaAddSlideshowBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('layers')+'</svg><span>SLIDESHOW</span></button>' +
        '<button class="segment-btn'+(mediaAddMode==='embed'?' active':'')+'" id="mediaAddEmbedBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('link')+'</svg><span>EMBED LINK</span></button>' +
      '</div>';
  }

  // Media Folders [2026-09-06] -- the root Media Library view's folder-card
  // list + "+ NEW FOLDER" action. A folder card shows just a name + a live
  // item count (state.myMedia is already loaded for the whole library, so
  // this needs no separate query); RENAME swaps the name for an inline text
  // input, DELETE uses the same confirm-row pattern as deleting a media item
  // itself. See firestore.rules'/interface.md's notes: deleting a folder
  // un-files its media, never deletes it.
  function renderMediaFolderSection(){
    const folders = state.myMediaFolders;
    return '<div class="section-heading" style="margin-top:6px;">' +
        '<h2 class="uc">Folders</h2>' +
        '<button type="button" class="btn btn-ghost" id="newFolderBtn">'+(mediaNewFolderOpen?'CANCEL':'+ NEW FOLDER')+'</button>' +
      '</div>' +
      (mediaNewFolderOpen ?
        ('<div class="session-card"><div class="field"><label for="newFolderNameInput">FOLDER NAME</label>' +
          '<input type="text" id="newFolderNameInput" placeholder="e.g. Christmas 2026, Youth Group" value="'+escapeAttr(mediaNewFolderName)+'"></div>' +
          '<button type="button" class="btn btn-primary" id="createFolderBtn">CREATE</button></div>')
        : '') +
      (folders.length ? folders.map(function(f){
        const renaming = mediaFolderRenameId === f.id;
        const confirming = mediaFolderDeleteConfirmId === f.id;
        const count = state.myMedia.filter(function(m){ return m.folderId === f.id; }).length;
        return '<div class="room-list-card">' +
          '<div class="room-list-meta" style="display:flex;align-items:center;gap:10px;flex:1;min-width:200px;">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;flex:none;color:var(--ink-soft);">'+icon('folder')+'</svg>' +
            (renaming ?
              ('<span style="flex:1;"><input type="text" id="folderRenameInput-'+f.id+'" data-folder-rename-input="'+f.id+'" value="'+escapeAttr(mediaFolderRenameName)+'"></span>')
              : ('<span><button type="button" class="link-btn" data-open-media-folder="'+f.id+'" style="font-weight:600;">'+escapeHtml(f.name||'Untitled Folder')+'</button>' +
                  '<p class="room-sub">'+count+' item'+(count===1?'':'s')+'</p></span>')) +
          '</div>' +
          (confirming ?
            ('<div class="confirm-row"><span>Delete this folder? Its media won&rsquo;t be deleted.</span>' +
              '<button class="btn btn-primary" data-confirm-delete-folder="'+f.id+'">YES, DELETE</button>' +
              '<button class="btn btn-ghost" data-cancel-delete-folder="'+f.id+'">CANCEL</button></div>')
            : (renaming ?
                ('<span class="setlist-controls">' +
                  '<button class="btn btn-primary" data-save-rename-folder="'+f.id+'">SAVE</button>' +
                  '<button class="btn btn-ghost" data-cancel-rename-folder="'+f.id+'">CANCEL</button>' +
                '</span>')
              : ('<span class="setlist-controls">' +
                  '<button class="btn btn-ghost" data-ask-rename-folder="'+f.id+'">RENAME</button>' +
                  '<button class="btn btn-ghost" data-ask-delete-folder="'+f.id+'">DELETE</button>' +
                '</span>'))) +
        '</div>';
      }).join('') : (mediaNewFolderOpen ? '' : '<p class="hint" style="margin-bottom:20px;">No folders yet &mdash; create one to start organizing media ahead of a service.</p>'));
  }

  // Media Folders [2026-09-06] -- the small MOVE panel opened per media item,
  // listing every destination (Unfiled + every other folder) as one-tap chips
  // -- mirrors the RECENTLY SHOWN chip rows elsewhere in this file.
  function renderMediaMovePanel(m){
    const options = [{ id: null, label: 'Unfiled' }].concat(state.myMediaFolders.map(function(f){ return { id: f.id, label: f.name||'Untitled Folder' }; }));
    return '<p class="control-label uc" style="margin-bottom:10px;">Move &ldquo;'+escapeHtml(m.title||'this item')+'&rdquo; to&hellip;</p>' +
      '<div class="now-live-jump-row">' + options.map(function(o){
        const isCurrent = (m.folderId || null) === o.id;
        return '<button type="button" class="section-jump'+(isCurrent?' active':'')+'" '+(isCurrent?'disabled':('data-move-media="'+m.id+'" data-move-to-folder="'+(o.id===null?'':escapeAttr(o.id))+'"'))+'>'+escapeHtml(o.label)+'</button>';
      }).join('') + '</div>';
  }

  // Media preview [2026-09-24] -- see mediaPreviewOpenId's own comment
  // above. Deliberately its own small function (not folded into
  // renderMediaItemCard() below) since it has real branching per media
  // type, the same four-way split renderStageSlide()'s 'media' branch and
  // renderSessionView()'s congregant card both already use -- this is a
  // fourth, read-only-preview version of that same split, scoped to
  // whatever's already stored on the media doc itself (no room, no
  // resolveRoomContent() involved at all).
  function renderMediaPreviewPanel(m){
    if(m.type === 'image'){
      return '<div class="media-preview-frame"><img src="'+escapeAttr(m.url)+'" alt=""></div>';
    }
    if(m.type === 'video'){
      return '<div class="media-preview-frame"><video src="'+escapeAttr(m.url)+'" controls playsinline></video></div>';
    }
    if(m.type === 'embed'){
      return '<div class="media-preview-frame media-preview-frame-embed"><iframe src="'+escapeAttr(m.embedUrl||'')+'" allow="autoplay; fullscreen" allowfullscreen></iframe></div>' +
        '<p class="hint" style="margin-top:8px;">Slide navigation for an embed happens inside it once it&rsquo;s actually live &mdash; this preview just confirms the link loads.</p>';
    }
    // 'slideshow'
    const slides = m.slides || [];
    if(!slides.length) return '<p class="hint">This presentation has no slides.</p>';
    const idx = Math.min(Math.max(mediaPreviewSlideIndex, 0), slides.length - 1);
    const slide = slides[idx];
    return '<div class="media-preview-frame"><img src="'+escapeAttr(slide ? slide.url : '')+'" alt=""></div>' +
      '<p class="hint" style="text-align:center;margin:8px 0 0;">Slide '+(idx+1)+' of '+slides.length+'</p>' +
      '<div class="now-live-jump-row" style="margin-top:8px;">' +
        slides.map(function(s,i){ return '<button type="button" class="section-jump'+(i===idx?' active':'')+'" data-media-preview-slide="'+i+'">'+(i+1)+'</button>'; }).join('') +
      '</div>';
  }

  // One media item's card -- shared by both the root/unfiled list and a
  // folder's own item list below, since the card itself (PREVIEW/SHARE/
  // DELETE/MOVE) doesn't change depending on where it's shown.
  function renderMediaItemCard(m){
    const confirming = mediaDeleteConfirmId === m.id;
    const sharing = mediaShareOpenId === m.id;
    const moving = mediaMoveOpenId === m.id;
    const previewing = mediaPreviewOpenId === m.id;
    const shareCount = (m.sharedWithUids||[]).length;
    return '<div class="room-list-card">' +
      '<div class="room-list-meta" style="display:flex;align-items:center;gap:10px;flex:1;min-width:200px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;flex:none;color:var(--ink-soft);">'+icon(mediaTypeIcon(m))+'</svg>' +
        '<span><p class="room-name">'+escapeHtml(m.title||'Untitled')+'</p>' +
          '<p class="room-sub">'+mediaTypeMeta(m)+(shareCount?(' &middot; shared with '+shareCount):'')+'</p></span>' +
      '</div>' +
      (confirming ?
        ('<div class="confirm-row"><span>Delete this media item?</span>' +
          '<button class="btn btn-primary" data-confirm-delete-media="'+m.id+'">YES, DELETE</button>' +
          '<button class="btn btn-ghost" data-cancel-delete-media="'+m.id+'">CANCEL</button></div>')
        : ('<span class="setlist-controls">' +
            '<button class="btn btn-ghost" data-toggle-preview-media="'+m.id+'">'+(previewing?'CLOSE':'PREVIEW')+'</button>' +
            '<button class="btn btn-ghost" data-toggle-move-media="'+m.id+'">'+(moving?'CLOSE':'MOVE')+'</button>' +
            '<button class="btn btn-ghost" data-toggle-share-media="'+m.id+'">'+(sharing?'CLOSE':'SHARE')+'</button>' +
            '<button class="btn btn-ghost" data-ask-delete-media="'+m.id+'">DELETE</button>' +
          '</span>')) +
      (previewing ? ('<div style="flex-basis:100%;width:100%;margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">' + renderMediaPreviewPanel(m) + '</div>') : '') +
      (moving ? ('<div style="flex-basis:100%;width:100%;margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">' + renderMediaMovePanel(m) + '</div>') : '') +
      (sharing ? ('<div style="flex-basis:100%;width:100%;margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">' + renderMediaSharePanel(m) + '</div>') : '') +
    '</div>';
  }

  function renderMediaLibrary(){
    const inFolder = !!mediaLibraryFolderId;
    const currentFolder = inFolder ? state.myMediaFolders.find(function(f){ return f.id === mediaLibraryFolderId; }) : null;
    // If the folder being browsed was deleted (e.g. from another tab/device)
    // fall back to root rather than showing a dead breadcrumb.
    if(inFolder && !currentFolder) mediaLibraryFolderId = null;
    const items = state.myMedia.filter(function(m){
      return (mediaLibraryFolderId ? (m.folderId === mediaLibraryFolderId) : !m.folderId);
    });
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="mediaLibraryBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Media Library</p>' +
        '<p class="landing-sub">Upload images, videos, and slideshow presentations -- or link a live Canva/Google Slides/PowerPoint embed -- then present them live alongside your songs and sermons from the Host Session screen.</p>' +
      '</div>' +
      (mediaLibraryFolderId ?
        ('<p class="bible-crumb"><button type="button" class="link-btn" data-media-folder-root="1">All Media</button> &rsaquo; '+escapeHtml(currentFolder ? (currentFolder.name||'Untitled Folder') : '')+'</p>')
        : '') +
      renderMediaAddSegmentedRow() +
      renderMediaAddPanel() +
      (mediaLibraryFolderId ? '' : renderMediaFolderSection()) +
      (items.length ? items.map(renderMediaItemCard).join('') :
        '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon('image')+'</svg><p>'+
          (mediaLibraryFolderId ? 'Nothing in this folder yet &mdash; add something above, or MOVE an existing item in.' : 'No media yet &mdash; add an image, video, slideshow, or embed link above and it&rsquo;ll be ready to pick next time you host.')+
        '</p></div>') +
      (!mediaLibraryFolderId && state.sharedMedia.length ?
        ('<div class="section-heading" style="margin-top:26px;"><h2 class="uc">Shared With You</h2></div>' +
          state.sharedMedia.map(function(m){
            return '<div class="room-list-card">' +
              '<div class="room-list-meta" style="display:flex;align-items:center;gap:10px;">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;flex:none;color:var(--ink-soft);">'+icon(mediaTypeIcon(m))+'</svg>' +
                '<span><p class="room-name">'+escapeHtml(m.title||'Untitled')+'</p>' +
                '<p class="room-sub">'+mediaTypeMeta(m)+' &middot; shared by '+escapeHtml(m.createdByName||'someone')+'</p></span>' +
              '</div>' +
              '<button class="btn btn-ghost" data-remove-shared-media="'+m.id+'">REMOVE</button>' +
            '</div>';
          }).join(''))
        : '');

    document.getElementById('mediaLibraryBackBtn').addEventListener('click', function(){
      stopMyMediaWatch(); stopSharedMediaWatch(); stopDirectoryWatch(); stopMyMediaFoldersWatch();
      state.view = mediaLibraryReturnView; render(); window.scrollTo(0,0);
    });
    attachMediaLibraryHandlers();
  }

  function attachMediaLibraryHandlers(){
    function openAddMode(mode){
      mediaAddMode = (mediaAddMode === mode) ? null : mode;
      mediaAddTitle = ''; mediaAddEmbedUrl = ''; mediaUploadStatus = '';
      render();
    }
    // In-session upload [2026-09-06]: this whole function is now also called
    // after rendering the Host Session screen (see attachSessionHostHandlers'
    // call to it), where these segmented buttons only exist in the DOM while
    // the MEDIA tab's own "+ UPLOAD NEW" toggle (hostMediaUploadOpen) is on --
    // null-guarded, unlike the Media-Library-only elements below, since this
    // is the one row actually shared between both screens.
    const addImageBtn = document.getElementById('mediaAddImageBtn');
    if(addImageBtn) addImageBtn.addEventListener('click', function(){ openAddMode('image'); });
    const addVideoBtn = document.getElementById('mediaAddVideoBtn');
    if(addVideoBtn) addVideoBtn.addEventListener('click', function(){ openAddMode('video'); });
    const addSlideshowBtn = document.getElementById('mediaAddSlideshowBtn');
    if(addSlideshowBtn) addSlideshowBtn.addEventListener('click', function(){ openAddMode('slideshow'); });
    const addEmbedBtn = document.getElementById('mediaAddEmbedBtn');
    if(addEmbedBtn) addEmbedBtn.addEventListener('click', function(){ openAddMode('embed'); });
    const cancelBtn = document.getElementById('mediaAddCancelBtn');
    if(cancelBtn) cancelBtn.addEventListener('click', function(){ mediaAddMode = null; render(); });
    const titleInput = document.getElementById('mediaAddTitleInput');
    if(titleInput) titleInput.addEventListener('input', function(){ mediaAddTitle = titleInput.value; });
    const embedUrlInput = document.getElementById('mediaEmbedUrlInput');
    if(embedUrlInput) embedUrlInput.addEventListener('input', function(){ mediaAddEmbedUrl = embedUrlInput.value; });

    // Background upload queue [2026-09-24, Jared: "when I upload media, it
    // should be queued somewhere so I can safely go anywhere else in the
    // app without cancelling it"] -- the actual network upload always kept
    // running in the background regardless of which screen was on top (a
    // Storage upload is a request, not something tied to the DOM); what
    // broke that illusion was (a) nothing showing its progress once you
    // left this screen, and (b) openMediaLibrary() resetting
    // mediaUploadBusy/mediaUploadStatus back to blank every time it's
    // opened, wiping the one place progress WAS shown even if you came
    // right back. Every handler below now closes the Add-Media panel the
    // instant a file's picked (nothing left in it depends on the upload
    // finishing) and hands the actual work to its own state.uploadQueue
    // entry (see pushUploadQueueEntry(), up by renderChatDock()) instead --
    // the little floating tray that powers is visible from anywhere in the
    // app, survives navigating away and back, and (since each upload gets
    // its OWN entry rather than sharing one pair of closure variables)
    // supports more than one upload actually running at once.
    //
    // folderId is captured HERE, at pick time, rather than read live off
    // mediaLibraryFolderId/state.view once the upload finishes -- by then
    // the person may well have navigated to a totally different screen (or
    // a different folder), and reading those live would silently file the
    // item in the wrong place (or drop it to unfiled) purely because of
    // when it happened to finish, not anything about where it was started.
    function currentUploadFolderId(){
      return state.view === 'media-library' ? (mediaLibraryFolderId || null) : null;
    }
    async function finishUpload(entry, kind, title, uploadResult, extra, folderId){
      try{
        await createMedia(Object.assign({
          title: title, type: kind,
          // Media Folders [2026-09-06]: uploading from inside a folder on
          // the Media Library screen files the new item straight into it;
          // uploading from the in-session MEDIA picker (or from the
          // library's own root/unfiled view) leaves it unfiled -- folders
          // are a Library-only prep concept, see interface.md.
          folderId: folderId,
          createdByUid: state.user.uid, createdByName: currentDisplayName() || 'Someone'
        }, uploadResult, extra||{}));
        updateUploadQueueEntry(entry, { status: 'done', pct: 100 });
        scheduleUploadQueueAutoRemove(entry);
      }catch(e){
        updateUploadQueueEntry(entry, { status: 'error', error: 'Couldn&rsquo;t save that &mdash; try again from Media Library.' });
      }
    }

    const imageInput = document.getElementById('mediaImageFileInput');
    if(imageInput) imageInput.addEventListener('change', async function(){
      const file = imageInput.files && imageInput.files[0];
      if(!file) return;
      const title = mediaAddTitle.trim() || titleFromFilename(file.name);
      const folderId = currentUploadFolderId();
      mediaAddMode = null; mediaUploadStatus = ''; render();
      const entry = pushUploadQueueEntry('image', title);
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'image', function(pct){
          updateUploadQueueEntry(entry, { pct: pct });
        });
        await finishUpload(entry, 'image', title, result, {}, folderId);
      }catch(e){
        updateUploadQueueEntry(entry, { status: 'error', error: 'Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why.' + describeError(e) });
      }
    });

    const videoInput = document.getElementById('mediaVideoFileInput');
    if(videoInput) videoInput.addEventListener('change', async function(){
      const file = videoInput.files && videoInput.files[0];
      if(!file) return;
      const title = mediaAddTitle.trim() || titleFromFilename(file.name);
      const folderId = currentUploadFolderId();
      mediaAddMode = null; mediaUploadStatus = ''; render();
      const entry = pushUploadQueueEntry('video', title);
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'video', function(pct){
          updateUploadQueueEntry(entry, { pct: pct });
        });
        await finishUpload(entry, 'video', title, result, {}, folderId);
      }catch(e){
        updateUploadQueueEntry(entry, { status: 'error', error: 'Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why.' + describeError(e) });
      }
    });

    const slideshowInput = document.getElementById('mediaSlideshowFileInput');
    if(slideshowInput) slideshowInput.addEventListener('change', async function(){
      const files = slideshowInput.files ? Array.from(slideshowInput.files) : [];
      if(!files.length) return;
      const title = mediaAddTitle.trim() || titleFromFilename(files[0].name);
      const folderId = currentUploadFolderId();
      mediaAddMode = null; mediaUploadStatus = ''; render();
      const entry = pushUploadQueueEntry('slideshow', title);
      try{
        const slides = [];
        for(let i=0; i<files.length; i++){
          updateUploadQueueEntry(entry, { status: 'uploading', pct: Math.round((i/files.length)*100), detail: 'Uploading slide ' + (i+1) + ' of ' + files.length + '&hellip;' });
          const result = await uploadMediaFile(files[i], state.user.uid, 'image', function(){});
          slides.push({ url: result.url, storagePath: result.storagePath });
        }
        await finishUpload(entry, 'slideshow', title, {}, { slides: slides }, folderId);
      }catch(e){
        updateUploadQueueEntry(entry, { status: 'error', error: 'Upload failed partway through &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why.' + describeError(e) });
      }
    });

    // PowerPoint upload [2026-09-24]: unlike the other inputs, this one does
    // NOT go through finishUpload()/createMedia() -- convertPptxToSlideshow()
    // runs server-side (see convertPptxToSlideshow in functions/index.js) and
    // writes the media Firestore doc itself once conversion finishes, so all
    // this needs to do is upload the raw file, await the conversion, then
    // mark the queue entry done; the existing watchMyMedia() listener picks
    // up the new item the moment that doc is written, same as any other
    // realtime update. (Its server-side write always leaves the item
    // unfiled/root, same as before -- folder filing on upload is a
    // client-side-createMedia-only concept right now, see finishUpload()'s
    // own comment; a converted deck can still be moved into a folder
    // afterwards from the library like anything else.)
    const pptxInput = document.getElementById('mediaPptxFileInput');
    if(pptxInput) pptxInput.addEventListener('change', async function(){
      const file = pptxInput.files && pptxInput.files[0];
      if(!file) return;
      const title = mediaAddTitle.trim() || titleFromFilename(file.name);
      mediaAddMode = null; mediaUploadStatus = ''; render();
      const entry = pushUploadQueueEntry('slideshow', title);
      try{
        const uploadResult = await uploadPptxSourceFile(file, state.user.uid, function(pct){
          updateUploadQueueEntry(entry, { pct: pct });
        });
        updateUploadQueueEntry(entry, { status: 'converting', detail: 'Converting your slides&hellip; this can take a bit.' });
        await convertPptxToSlideshow(uploadResult.storagePath, title);
        updateUploadQueueEntry(entry, { status: 'done', pct: 100, detail: null });
        scheduleUploadQueueAutoRemove(entry);
      }catch(e){
        updateUploadQueueEntry(entry, { status: 'error', error: 'Couldn&rsquo;t convert that PowerPoint &mdash; try again, or use the image option, from Media Library.' + describeError(e) });
      }
    });

    const embedSaveBtn = document.getElementById('mediaEmbedSaveBtn');
    if(embedSaveBtn) embedSaveBtn.addEventListener('click', async function(){
      const url = mediaAddEmbedUrl.trim();
      if(!url){ showToast('Paste an embed/share link first.'); return; }
      const title = mediaAddTitle.trim() || 'Presentation';
      const folderId = currentUploadFolderId();
      mediaAddMode = null; render();
      const entry = pushUploadQueueEntry('embed', title);
      await finishUpload(entry, 'embed', title, {}, { embedUrl: url, embedProvider: detectEmbedProvider(url) }, folderId);
    });

    document.querySelectorAll('[data-ask-delete-media]').forEach(function(btn){
      btn.addEventListener('click', function(){ mediaDeleteConfirmId = btn.getAttribute('data-ask-delete-media'); mediaShareOpenId = null; mediaPreviewOpenId = null; render(); });
    });
    document.querySelectorAll('[data-cancel-delete-media]').forEach(function(btn){
      btn.addEventListener('click', function(){ mediaDeleteConfirmId = null; render(); });
    });
    // Media preview [2026-09-24] -- see mediaPreviewOpenId's own comment up
    // by its declaration. Exact mirror of the MOVE/SHARE toggle handlers'
    // one-at-a-time convention.
    document.querySelectorAll('[data-toggle-preview-media]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-toggle-preview-media');
        mediaPreviewOpenId = (mediaPreviewOpenId === id) ? null : id;
        mediaPreviewSlideIndex = 0;
        mediaShareOpenId = null; mediaDeleteConfirmId = null; mediaMoveOpenId = null;
        render();
      });
    });
    document.querySelectorAll('[data-media-preview-slide]').forEach(function(btn){
      btn.addEventListener('click', function(){
        mediaPreviewSlideIndex = +btn.getAttribute('data-media-preview-slide');
        render();
      });
    });
    document.querySelectorAll('[data-confirm-delete-media]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-confirm-delete-media');
        const media = state.myMedia.find(function(x){ return x.id===id; });
        btn.disabled = true;
        try{ await deleteMedia(id, media); showToast('Deleted.'); }
        catch(e){ showToast('Couldn&rsquo;t delete that &mdash; try again.'); }
        mediaDeleteConfirmId = null;
        render();
      });
    });
    document.querySelectorAll('[data-toggle-share-media]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-toggle-share-media');
        mediaShareOpenId = (mediaShareOpenId === id) ? null : id;
        mediaShareQuery = '';
        mediaDeleteConfirmId = null; mediaPreviewOpenId = null;
        render();
      });
    });
    document.querySelectorAll('[data-media-share-search]').forEach(function(input){
      input.addEventListener('input', function(){
        mediaShareQuery = input.value;
        const mediaId = input.getAttribute('data-media-share-search');
        const m = state.myMedia.find(function(x){ return x.id === mediaId; });
        const holder = document.querySelector('[data-media-share-results="'+mediaId+'"]');
        if(holder && m){ holder.innerHTML = renderMediaShareResults(m, mediaShareQuery); bindMediaShareButtons(); }
      });
    });
    document.querySelectorAll('[data-unshare-media]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const mediaId = btn.getAttribute('data-unshare-media');
        const uid = btn.getAttribute('data-unshare-uid');
        btn.disabled = true;
        try{ await unshareMedia(mediaId, uid); showToast('Removed.'); }
        catch(e){ showToast('Couldn&rsquo;t remove &mdash; try again.'); }
        render();
      });
    });
    document.querySelectorAll('[data-remove-shared-media]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const mediaId = btn.getAttribute('data-remove-shared-media');
        btn.disabled = true;
        try{ await unshareMedia(mediaId, state.user.uid); showToast('Removed from your list.'); }
        catch(e){ showToast('Couldn&rsquo;t remove &mdash; try again.'); }
        render();
      });
    });

    // Media Folders [2026-09-06] -- everything below only ever exists in the
    // DOM on the Media Library screen itself, so these stay querySelectorAll-
    // based (safe no-ops elsewhere) or getElementById with a null guard,
    // matching the pattern above.
    document.querySelectorAll('[data-open-media-folder]').forEach(function(btn){
      btn.addEventListener('click', function(){
        mediaLibraryFolderId = btn.getAttribute('data-open-media-folder');
        mediaShareOpenId = null; mediaDeleteConfirmId = null; mediaMoveOpenId = null; mediaPreviewOpenId = null;
        mediaAddMode = null; mediaNewFolderOpen = false;
        render(); window.scrollTo(0,0);
      });
    });
    document.querySelectorAll('[data-media-folder-root]').forEach(function(btn){
      btn.addEventListener('click', function(){
        mediaLibraryFolderId = null;
        mediaShareOpenId = null; mediaDeleteConfirmId = null; mediaMoveOpenId = null; mediaPreviewOpenId = null;
        mediaAddMode = null;
        render(); window.scrollTo(0,0);
      });
    });
    const newFolderBtn = document.getElementById('newFolderBtn');
    if(newFolderBtn) newFolderBtn.addEventListener('click', function(){
      mediaNewFolderOpen = !mediaNewFolderOpen;
      mediaNewFolderName = '';
      render();
    });
    const newFolderNameInput = document.getElementById('newFolderNameInput');
    if(newFolderNameInput) newFolderNameInput.addEventListener('input', function(){ mediaNewFolderName = newFolderNameInput.value; });
    const createFolderBtn = document.getElementById('createFolderBtn');
    if(createFolderBtn) createFolderBtn.addEventListener('click', async function(){
      const name = mediaNewFolderName.trim();
      if(!name){ showToast('Give the folder a name first.'); return; }
      createFolderBtn.disabled = true;
      try{
        await createMediaFolder({ name: name, createdByUid: state.user.uid });
        mediaNewFolderOpen = false; mediaNewFolderName = '';
        showToast('Folder created.');
      }catch(e){
        showToast('Couldn&rsquo;t create that folder &mdash; try again.');
      }
      render();
    });
    document.querySelectorAll('[data-ask-rename-folder]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-ask-rename-folder');
        const f = state.myMediaFolders.find(function(x){ return x.id===id; });
        mediaFolderRenameId = id;
        mediaFolderRenameName = f ? (f.name||'') : '';
        mediaFolderDeleteConfirmId = null;
        render();
      });
    });
    document.querySelectorAll('[data-cancel-rename-folder]').forEach(function(btn){
      btn.addEventListener('click', function(){ mediaFolderRenameId = null; render(); });
    });
    document.querySelectorAll('[data-folder-rename-input]').forEach(function(input){
      input.addEventListener('input', function(){ mediaFolderRenameName = input.value; });
    });
    document.querySelectorAll('[data-save-rename-folder]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-save-rename-folder');
        const name = mediaFolderRenameName.trim();
        if(!name){ showToast('Give the folder a name first.'); return; }
        btn.disabled = true;
        try{ await updateMediaFolder(id, { name: name }); showToast('Renamed.'); }
        catch(e){ showToast('Couldn&rsquo;t rename that &mdash; try again.'); }
        mediaFolderRenameId = null;
        render();
      });
    });
    document.querySelectorAll('[data-ask-delete-folder]').forEach(function(btn){
      btn.addEventListener('click', function(){ mediaFolderDeleteConfirmId = btn.getAttribute('data-ask-delete-folder'); mediaFolderRenameId = null; render(); });
    });
    document.querySelectorAll('[data-cancel-delete-folder]').forEach(function(btn){
      btn.addEventListener('click', function(){ mediaFolderDeleteConfirmId = null; render(); });
    });
    document.querySelectorAll('[data-confirm-delete-folder]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-confirm-delete-folder');
        btn.disabled = true;
        try{ await deleteMediaFolder(id); showToast('Folder deleted &mdash; its media is now unfiled.'); }
        catch(e){ showToast('Couldn&rsquo;t delete that &mdash; try again.'); }
        mediaFolderDeleteConfirmId = null;
        if(mediaLibraryFolderId === id) mediaLibraryFolderId = null; // was browsing the folder we just deleted
        render();
      });
    });
    document.querySelectorAll('[data-toggle-move-media]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-toggle-move-media');
        mediaMoveOpenId = (mediaMoveOpenId === id) ? null : id;
        mediaShareOpenId = null; mediaDeleteConfirmId = null; mediaPreviewOpenId = null;
        render();
      });
    });
    document.querySelectorAll('[data-move-media]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-move-media');
        const toFolder = btn.getAttribute('data-move-to-folder') || null;
        btn.disabled = true;
        try{ await updateMedia(id, { folderId: toFolder }); showToast('Moved.'); }
        catch(e){ showToast('Couldn&rsquo;t move that &mdash; try again.'); }
        mediaMoveOpenId = null;
        render();
      });
    });

    bindMediaShareButtons();
  }

  function renderSermons(){
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="sermonsBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Sermons</p>' +
        '<p class="landing-sub">Build a sermon ahead of time &mdash; title, point, and Bible-verse slides &mdash; then present it live alongside your songs from the Host Session screen.</p>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="newSermonBtn" style="margin-bottom:22px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>NEW SERMON</button>' +
      (state.mySermons.length ? state.mySermons.map(function(s){
        const n = (s.slides||[]).length;
        const confirming = sermonDeleteConfirmId === s.id;
        const sharing = sermonShareOpenId === s.id;
        const shareCount = (s.sharedWithUids||[]).length;
        return '<div class="room-list-card">' +
          '<button type="button" data-edit-sermon="'+s.id+'" style="background:none;border:none;padding:0;text-align:left;cursor:pointer;font:inherit;color:inherit;flex:1;min-width:200px;">' +
            '<div class="room-list-meta"><p class="room-name">'+escapeHtml(s.title||'Untitled sermon')+'</p>' +
              '<p class="room-sub">'+(s.speaker?escapeHtml(s.speaker)+' &middot; ':'')+n+' slide'+(n===1?'':'s')+(shareCount?(' &middot; shared with '+shareCount):'')+'</p></div>' +
          '</button>' +
          (confirming ?
            ('<div class="confirm-row"><span>Delete this sermon?</span>' +
              '<button class="btn btn-primary" data-confirm-delete-sermon="'+s.id+'">YES, DELETE</button>' +
              '<button class="btn btn-ghost" data-cancel-delete-sermon="'+s.id+'">CANCEL</button></div>')
            : ('<span class="setlist-controls">' +
                '<button class="btn btn-ghost" data-toggle-share-sermon="'+s.id+'">'+(sharing?'CLOSE':'SHARE')+'</button>' +
                '<button class="btn btn-ghost" data-ask-delete-sermon="'+s.id+'">DELETE</button>' +
              '</span>')) +
          (sharing ? ('<div style="flex-basis:100%;width:100%;margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">' + renderSermonSharePanel(s) + '</div>') : '') +
        '</div>';
      }).join('') : '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg><p>No sermons yet &mdash; build one and it&rsquo;ll be ready to pick next time you host.</p></div>') +
      (state.sharedSermons.length ?
        ('<div class="section-heading" style="margin-top:26px;"><h2 class="uc">Shared With You</h2></div>' +
          state.sharedSermons.map(function(s){
            const n = (s.slides||[]).length;
            return '<div class="room-list-card">' +
              '<div class="room-list-meta"><p class="room-name">'+escapeHtml(s.title||'Untitled sermon')+'</p>' +
                '<p class="room-sub">'+(s.speaker?escapeHtml(s.speaker)+' &middot; ':'')+n+' slide'+(n===1?'':'s')+' &middot; shared by '+escapeHtml(s.createdByName||'someone')+'</p></div>' +
              '<button class="btn btn-ghost" data-remove-shared-sermon="'+s.id+'">REMOVE</button>' +
            '</div>';
          }).join(''))
        : '');

    document.getElementById('sermonsBackBtn').addEventListener('click', function(){ stopMySermonsWatch(); stopSharedSermonsWatch(); stopDirectoryWatch(); state.view='host-hub'; render(); window.scrollTo(0,0); });
    document.getElementById('newSermonBtn').addEventListener('click', function(){ openSermonEditor(null, 'sermons'); });
    document.querySelectorAll('[data-edit-sermon]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const s = state.mySermons.find(function(x){ return x.id===btn.getAttribute('data-edit-sermon'); });
        if(s) openSermonEditor(s, 'sermons');
      });
    });
    document.querySelectorAll('[data-ask-delete-sermon]').forEach(function(btn){
      btn.addEventListener('click', function(){ sermonDeleteConfirmId = btn.getAttribute('data-ask-delete-sermon'); sermonShareOpenId = null; render(); });
    });
    document.querySelectorAll('[data-cancel-delete-sermon]').forEach(function(btn){
      btn.addEventListener('click', function(){ sermonDeleteConfirmId = null; render(); });
    });
    document.querySelectorAll('[data-confirm-delete-sermon]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-confirm-delete-sermon');
        btn.disabled = true;
        try{ await deleteSermon(id); showToast('Sermon deleted.'); }
        catch(e){ showToast('Couldn&rsquo;t delete that sermon &mdash; try again.'); }
        sermonDeleteConfirmId = null;
        render();
      });
    });
    document.querySelectorAll('[data-toggle-share-sermon]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-toggle-share-sermon');
        sermonShareOpenId = (sermonShareOpenId === id) ? null : id;
        sermonShareQuery = '';
        sermonDeleteConfirmId = null;
        render();
      });
    });
    document.querySelectorAll('[data-share-search]').forEach(function(input){
      input.addEventListener('input', function(){
        sermonShareQuery = input.value;
        const sermonId = input.getAttribute('data-share-search');
        const s = state.mySermons.find(function(x){ return x.id === sermonId; });
        const holder = document.querySelector('[data-share-results="'+sermonId+'"]');
        if(holder && s){ holder.innerHTML = renderSermonShareResults(s, sermonShareQuery); bindSermonShareButtons(); }
      });
    });
    document.querySelectorAll('[data-unshare-sermon]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const sermonId = btn.getAttribute('data-unshare-sermon');
        const uid = btn.getAttribute('data-unshare-uid');
        btn.disabled = true;
        try{ await unshareSermon(sermonId, uid); showToast('Removed.'); }
        catch(e){ showToast('Couldn&rsquo;t remove &mdash; try again.'); }
        render();
      });
    });
    document.querySelectorAll('[data-remove-shared-sermon]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const sermonId = btn.getAttribute('data-remove-shared-sermon');
        btn.disabled = true;
        try{ await unshareSermon(sermonId, state.user.uid); showToast('Removed from your list.'); }
        catch(e){ showToast('Couldn&rsquo;t remove &mdash; try again.'); }
        render();
      });
    });
    document.querySelectorAll('[data-copy-share-link]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const link = sermonShareLink(btn.getAttribute('data-copy-share-link'));
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(link).then(function(){ showToast('Share link copied.'); }).catch(function(){ showToast(link); });
        } else { showToast(link); }
      });
    });
    bindSermonShareButtons();
  }

  // The screen a ?sermon=<id> link (see sermonShareLink()/"COPY LINK"
  // above) actually opens to -- a read-only preview plus a one-tap way to
  // add the sermon to the visitor's own "Shared With You" list, rather
  // than dropping them straight into anything. state.sharedSermonLinkData
  // is populated by the watchSermon() subscription started right where
  // sermonLinkId is first read, in the startup-routing block near the
  // bottom of this file (just above the final render() call).
  function renderSharedSermonLink(){
    const sermon = state.sharedSermonLinkData;
    const n = sermon ? (sermon.slides||[]).length : 0;
    const isOwner = !!(sermon && state.user && sermon.createdByUid === state.user.uid);
    const alreadyShared = !!(sermon && state.user && (sermon.sharedWithUids||[]).includes(state.user.uid));

    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="sharedSermonBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Shared Sermon</p>' +
        '<p class="landing-sub">Someone sent you a link to a sermon built in iWorship.</p>' +
      '</div>' +
      (sermon ?
        ('<div class="session-card">' +
          '<p class="control-label uc" style="margin-bottom:6px;">'+escapeHtml(sermon.title||'Untitled sermon')+'</p>' +
          '<p class="hint">'+(sermon.speaker?escapeHtml(sermon.speaker)+' &middot; ':'')+n+' slide'+(n===1?'':'s')+(sermon.createdByName?(' &middot; built by '+escapeHtml(sermon.createdByName)):'')+'</p>' +
          (!state.user ?
            '<p class="hint" style="margin-top:16px;">Sign in from the home screen, then reopen this link to add it to your own sermons.</p>'
          : isOwner ?
            '<p class="hint" style="margin-top:16px;">This is one of your own sermons &mdash; it&rsquo;s already in your list.</p>'
          : alreadyShared ?
            '<p class="hint" style="margin-top:16px;">Already in your Sermons list.</p>'
          :
            '<button class="btn btn-primary btn-lg btn-block" id="addSharedSermonBtn" style="margin-top:16px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD TO MY SERMONS</button>'
          ) +
          (state.user ? '<button type="button" class="switch-account" id="goToSermonsFromLinkBtn" style="margin-top:14px;">GO TO SERMONS</button>' : '') +
        '</div>')
        : '<p style="text-align:center;color:var(--ink-soft);padding:60px 20px;">Loading&hellip; (or this sermon no longer exists)</p>');

    document.getElementById('sharedSermonBackBtn').addEventListener('click', function(){ state.view='landing'; render(); window.scrollTo(0,0); });
    const addBtn = document.getElementById('addSharedSermonBtn');
    if(addBtn) addBtn.addEventListener('click', async function(){
      addBtn.disabled = true;
      try{
        await shareSermon(sermon.id, state.user.uid);
        showToast('Added to your sermons.');
        state.view = 'sermons'; render(); window.scrollTo(0,0);
        startMySermonsWatch(); startSharedSermonsWatch(); startDirectoryWatch();
      }catch(e){
        showToast('Couldn&rsquo;t add that sermon &mdash; try again.');
        addBtn.disabled = false;
      }
    });
    const goBtn = document.getElementById('goToSermonsFromLinkBtn');
    if(goBtn) goBtn.addEventListener('click', function(){
      state.view = 'sermons'; render(); window.scrollTo(0,0);
      startMySermonsWatch(); startSharedSermonsWatch(); startDirectoryWatch();
    });
  }

  function renderSermonEdit(){
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="sermonEditBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<h1 style="font-size:1.8rem;margin-bottom:6px;">'+(sermonEditId?'Edit Sermon':'New Sermon')+'</h1>' +
      '<p class="hint" style="margin-bottom:22px;">Build it slide by slide &mdash; each slide starts as a blank canvas. Add a heading, body text, a bullet list, an image, or a verse pulled straight from the built-in KJV Bible, then drag and resize each one wherever you want on the slide. Presented live the same way songs are.</p>' +
      '<div class="field-row">' +
        '<div class="field"><label for="sermonTitleInput">SERMON TITLE</label><input type="text" id="sermonTitleInput" placeholder="e.g. Anchored in Hope" value="'+escapeAttr(sermonEditTitle)+'"></div>' +
        '<div class="field"><label for="sermonSpeakerInput">SPEAKER (OPTIONAL)</label><input type="text" id="sermonSpeakerInput" placeholder="e.g. Pastor Jared" value="'+escapeAttr(sermonEditSpeaker)+'"></div>' +
      '</div>' +
      '<div class="section-heading"><h2 class="uc">Slides</h2><span class="count-note" id="slideCount">'+sermonEditSlides.length+' slide'+(sermonEditSlides.length===1?'':'s')+'</span></div>' +
      '<div id="sermonSlidesList"></div>' +
      '<div class="add-section-row">' +
        '<button type="button" class="btn btn-ghost" id="addSermonSlideBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>ADD SLIDE</button>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg btn-block" id="saveSermonBtn" style="margin-top:10px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SAVE SERMON</button>' +
      '<p class="hint" style="text-align:center;margin-top:10px;">'+(usingDemoMode ? 'Demo mode: this saves to your device/browser only.' : 'Only you can edit or present this sermon.')+'</p>';

    document.getElementById('sermonEditBackBtn').addEventListener('click', function(){
      state.view = sermonEditReturnView; render(); window.scrollTo(0,0);
    });
    document.getElementById('sermonTitleInput').addEventListener('input', function(e){ sermonEditTitle = e.target.value; });
    document.getElementById('sermonSpeakerInput').addEventListener('input', function(e){ sermonEditSpeaker = e.target.value; });
    document.getElementById('addSermonSlideBtn').addEventListener('click', function(){
      sermonEditSlides.push(newSermonSlide());
      renderSermonSlidesList();
    });
    document.getElementById('saveSermonBtn').addEventListener('click', saveSermonFlow);
    wireSlideCanvasInteractions(); // delegated drag/resize/select -- attached once, holder element itself never gets replaced
    renderSermonSlidesList();
  }

  // The currently-selected block's live data object, or null -- a small
  // shared lookup so every properties-panel handler doesn't repeat the same
  // two-level array indexing.
  function selectedBlockRef(){
    if(!sermonEditSelectedBlock) return null;
    const sl = sermonEditSlides[sermonEditSelectedBlock.slideIdx];
    return sl ? sl.blocks[sermonEditSelectedBlock.blockIdx] : null;
  }
  // Updates a text block's content WITHOUT a full renderSermonSlidesList()
  // rebuild -- typing into the properties panel's textarea would otherwise
  // destroy and recreate that same textarea on every keystroke, throwing
  // away focus/cursor position. Patches only the matching block's own
  // canvas element directly, same idea as the rest of this app's
  // input-updates-a-module-array-without-a-full-rerender convention.
  function patchSelectedBlockText(text){
    if(!sermonEditSelectedBlock) return;
    const b = selectedBlockRef();
    if(!b) return;
    b.text = text;
    const el = document.querySelector('[data-canvas-slide-idx="'+sermonEditSelectedBlock.slideIdx+'"] [data-block-idx="'+sermonEditSelectedBlock.blockIdx+'"]');
    if(el) el.innerHTML = blockTextInnerHtml(text) + '<span class="slide-block-handle" data-resize-handle="1"></span>';
  }
  function clampNum(v, min, max){
    if(max < min) max = min; // degenerate guard -- a block bigger than the canvas already
    return Math.max(min, Math.min(max, v));
  }
  // Delegated pointerdown handler for every slide's interactive canvas --
  // attached ONCE to #sermonSlidesList (renderSermonSlidesList() only ever
  // replaces that element's innerHTML, never the element itself, so a
  // listener here survives every re-render without needing to be reattached
  // per block). Handles three cases: clicking empty canvas space deselects;
  // clicking an unselected block selects it (and re-renders once, to paint
  // its selection outline + resize handle); clicking a block (selected or
  // not) then dragging moves it; clicking the resize handle on an already-
  // selected block then dragging resizes it. Movement/resize happens by
  // mutating the block's data AND its element's inline style directly on
  // every pointermove -- never via renderSermonSlidesList(), which would
  // tear down the very element being dragged.
  function wireSlideCanvasInteractions(){
    const holder = document.getElementById('sermonSlidesList');
    if(!holder || holder.dataset.wired) return;
    holder.dataset.wired = '1';
    holder.addEventListener('pointerdown', function(e){
      const canvas = e.target.closest('[data-canvas-slide-idx]');
      if(!canvas) return;
      const slideIdx = +canvas.getAttribute('data-canvas-slide-idx');
      const onHandle = !!e.target.closest('[data-resize-handle]');
      const blockEl = e.target.closest('.slide-block');
      if(!blockEl){
        if(sermonEditSelectedBlock && sermonEditSelectedBlock.slideIdx === slideIdx){
          sermonEditSelectedBlock = null;
          renderSermonSlidesList();
        }
        return;
      }
      const blockIdx = +blockEl.getAttribute('data-block-idx');
      const wasSelected = !!(sermonEditSelectedBlock && sermonEditSelectedBlock.slideIdx===slideIdx && sermonEditSelectedBlock.blockIdx===blockIdx);
      if(!wasSelected){
        sermonEditSelectedBlock = { slideIdx: slideIdx, blockIdx: blockIdx };
        renderSermonSlidesList(); // repaints this block with its selection outline + handle
      }
      // Re-query fresh elements -- a selection re-render above just
      // destroyed the ones `canvas`/`blockEl` pointed at.
      const freshCanvas = document.querySelector('[data-canvas-slide-idx="'+slideIdx+'"]');
      const freshBlock = freshCanvas && freshCanvas.querySelector('[data-block-idx="'+blockIdx+'"]');
      if(!freshCanvas || !freshBlock) return;
      const b = sermonEditSlides[slideIdx].blocks[blockIdx];
      if(!b) return;
      const dragMode = (onHandle && wasSelected) ? 'resize' : 'move';
      const rect = freshCanvas.getBoundingClientRect();
      const startClientX = e.clientX, startClientY = e.clientY;
      const startX = b.x, startY = b.y, startW = b.w, startH = b.h;
      function onMove(ev){
        const dxPct = (ev.clientX - startClientX) / rect.width * 100;
        const dyPct = (ev.clientY - startClientY) / rect.height * 100;
        if(dragMode === 'resize'){
          b.w = clampNum(startW + dxPct, 8, 100 - b.x);
          b.h = clampNum(startH + dyPct, 8, 100 - b.y);
          freshBlock.style.width = b.w + '%';
          freshBlock.style.height = b.h + '%';
        } else {
          b.x = clampNum(startX + dxPct, 0, 100 - b.w);
          b.y = clampNum(startY + dyPct, 0, 100 - b.h);
          freshBlock.style.left = b.x + '%';
          freshBlock.style.top = b.y + '%';
        }
      }
      function onUp(){
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
  }

  function renderBlockPropertiesPanel(b){
    if(b.type === 'image'){
      return '<div class="block-properties">' +
        '<p class="hint uc" style="margin-bottom:8px;">IMAGE BLOCK</p>' +
        '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">'+(b.url?'REPLACE IMAGE':'UPLOAD IMAGE')+'<input type="file" accept="image/*" data-block-image-upload="1" style="display:none;"></label>' +
        '<button type="button" class="remove-btn remove-block-btn" data-remove-block="1" style="margin-left:12px;">REMOVE BLOCK</button>' +
      '</div>';
    }
    return '<div class="block-properties">' +
      '<p class="hint uc" style="margin-bottom:8px;">TEXT BLOCK</p>' +
      '<textarea data-block-text="1" placeholder="Slide text&hellip;" rows="3">'+escapeHtml(b.text||'')+'</textarea>' +
      '<div class="block-controls-row">' +
        '<span class="align-group">' +
          ['left','center','right'].map(function(a){ return '<button type="button" class="align-btn'+(b.align===a?' active':'')+'" data-block-align="'+a+'">'+a.toUpperCase()+'</button>'; }).join('') +
        '</span>' +
        '<select data-block-size="1">' + BLOCK_SIZES.map(function(s){ return '<option value="'+s+'"'+(b.size===s?' selected':'')+'>'+s.toUpperCase()+'</option>'; }).join('') + '</select>' +
        '<button type="button" class="icon-tool-btn'+(b.bold?' active':'')+'" data-block-bold="1"><span>BOLD</span></button>' +
        '<button type="button" class="remove-btn remove-block-btn" data-remove-block="1">REMOVE BLOCK</button>' +
      '</div>' +
    '</div>';
  }

  function renderSermonSlidesList(){
    const holder = document.getElementById('sermonSlidesList');
    const countEl = document.getElementById('slideCount');
    if(countEl) countEl.textContent = sermonEditSlides.length + ' slide' + (sermonEditSlides.length===1?'':'s');
    if(!holder) return;
    if(!sermonEditSlides.length){
      holder.innerHTML = '<p class="sections-empty">No slides yet &mdash; add one below.</p>';
      return;
    }
    holder.innerHTML = sermonEditSlides.map(function(sl, i){
      const selectedBlock = (sermonEditSelectedBlock && sermonEditSelectedBlock.slideIdx === i) ? sl.blocks[sermonEditSelectedBlock.blockIdx] : null;
      return '<div class="detect-card">' +
        '<div class="detect-head">' +
          '<span class="detect-head-left"><span class="pill">SLIDE '+(i+1)+'</span></span>' +
          '<span class="setlist-controls">' +
            '<button type="button" class="icon-btn-sm" data-slide-up="'+i+'" '+(i===0?'disabled':'')+' aria-label="Move slide up">&uarr;</button>' +
            '<button type="button" class="icon-btn-sm" data-slide-down="'+i+'" '+(i===sermonEditSlides.length-1?'disabled':'')+' aria-label="Move slide down">&darr;</button>' +
            '<button type="button" class="remove-btn" data-remove-slide="'+i+'" aria-label="Remove slide">&times;</button>' +
          '</span>' +
        '</div>' +
        renderSlideCanvasEditable(sl, i) +
        '<div class="slide-builder-toolbar">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-add-block="heading" data-slide-idx="'+i+'">ADD HEADING</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-add-block="body" data-slide-idx="'+i+'">ADD TEXT</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-add-block="bullets" data-slide-idx="'+i+'">ADD BULLET LIST</button>' +
          '<label class="btn btn-ghost btn-sm" style="cursor:pointer;">ADD IMAGE<input type="file" accept="image/*" data-add-image="'+i+'" style="display:none;"></label>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-toggle-verse-row="'+i+'">ADD VERSE (KJV)</button>' +
        '</div>' +
        (sermonEditVerseRowOpenIdx === i ?
          ('<div class="verse-insert-row">' +
            '<input type="text" data-verse-ref-input="'+i+'" placeholder="e.g. Hebrews 6:19 or Psalm 23:1-6">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-insert-verse="'+i+'">INSERT</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-cancel-verse-row="'+i+'">CANCEL</button>' +
          '</div>') : '') +
        '<div class="slide-bg-row"><span class="hint" style="margin-right:2px;">BACKGROUND</span>' +
          SLIDE_BACKGROUNDS.map(function(bgOpt){
            const active = sl.background && sl.background.type==='color' && sl.background.color===bgOpt.key;
            return '<button type="button" class="bg-swatch bg-swatch-'+bgOpt.key+(active?' active':'')+'" data-bg-swatch="'+bgOpt.key+'" data-slide-idx="'+i+'" title="'+bgOpt.label+'" aria-label="'+bgOpt.label+' background"></button>';
          }).join('') +
          '<label class="bg-swatch bg-swatch-image-upload" title="Custom image background">+<input type="file" accept="image/*" data-bg-image="'+i+'" style="display:none;"></label>' +
        '</div>' +
        (selectedBlock ? renderBlockPropertiesPanel(selectedBlock) : '') +
      '</div>';
    }).join('');

    document.querySelectorAll('[data-slide-up]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-slide-up');
        if(i<=0) return;
        const tmp = sermonEditSlides[i-1]; sermonEditSlides[i-1] = sermonEditSlides[i]; sermonEditSlides[i] = tmp;
        sermonEditSelectedBlock = null;
        renderSermonSlidesList();
      });
    });
    document.querySelectorAll('[data-slide-down]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-slide-down');
        if(i>=sermonEditSlides.length-1) return;
        const tmp = sermonEditSlides[i+1]; sermonEditSlides[i+1] = sermonEditSlides[i]; sermonEditSlides[i] = tmp;
        sermonEditSelectedBlock = null;
        renderSermonSlidesList();
      });
    });
    document.querySelectorAll('[data-remove-slide]').forEach(function(btn){
      btn.addEventListener('click', function(){
        sermonEditSlides.splice(+btn.getAttribute('data-remove-slide'), 1);
        sermonEditSelectedBlock = null;
        renderSermonSlidesList();
      });
    });
    document.querySelectorAll('[data-add-block]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-slide-idx');
        const blocks = sermonEditSlides[i].blocks;
        blocks.push(newTextBlock(btn.getAttribute('data-add-block')));
        sermonEditSelectedBlock = { slideIdx: i, blockIdx: blocks.length-1 };
        renderSermonSlidesList();
      });
    });
    document.querySelectorAll('[data-add-image]').forEach(function(input){
      input.addEventListener('change', async function(){
        const i = +input.getAttribute('data-add-image');
        const file = input.files && input.files[0];
        if(!file) return;
        if(!state.user){ showToast('Sign in first.'); return; }
        showToast('Uploading image&hellip;');
        try{
          const result = await uploadMediaFile(file, state.user.uid, 'image', function(){});
          const blocks = sermonEditSlides[i].blocks;
          blocks.push(Object.assign(newImageBlock(), { url: result.url, storagePath: result.storagePath }));
          sermonEditSelectedBlock = { slideIdx: i, blockIdx: blocks.length-1 };
          renderSermonSlidesList();
        }catch(e){
          showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why.' + describeError(e));
        }
      });
    });
    document.querySelectorAll('[data-toggle-verse-row]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-toggle-verse-row');
        sermonEditVerseRowOpenIdx = (sermonEditVerseRowOpenIdx === i) ? null : i;
        renderSermonSlidesList();
      });
    });
    document.querySelectorAll('[data-cancel-verse-row]').forEach(function(btn){
      btn.addEventListener('click', function(){ sermonEditVerseRowOpenIdx = null; renderSermonSlidesList(); });
    });
    document.querySelectorAll('[data-insert-verse]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-insert-verse');
        if(!kjvData){
          showToast('Still loading the KJV text&hellip; try again in a moment.');
          loadKjvData();
          return;
        }
        const input = document.querySelector('[data-verse-ref-input="'+i+'"]');
        const found = parseVerseRef((input && input.value) || '');
        if(!found){
          showToast('Couldn&rsquo;t find that reference. Try &ldquo;Book Chapter:Verse&rdquo; or a range like &ldquo;Book Chapter:Verse-Verse&rdquo;, e.g. John 3:16 or Psalm 23:1-6.');
          return;
        }
        const blocks = sermonEditSlides[i].blocks;
        blocks.push(Object.assign(newTextBlock('verse'), { text: '“'+found.text+'”' }));
        const verseBlockIdx = blocks.length-1;
        blocks.push(Object.assign(newTextBlock('body'), { text: '— '+found.refLabel, y:80, h:12, size:'sm' }));
        sermonEditVerseRowOpenIdx = null;
        sermonEditSelectedBlock = { slideIdx: i, blockIdx: verseBlockIdx };
        renderSermonSlidesList();
        showToast('Verse inserted from KJV.');
      });
    });
    document.querySelectorAll('[data-bg-swatch]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-slide-idx');
        sermonEditSlides[i].background = { type:'color', color: btn.getAttribute('data-bg-swatch') };
        renderSermonSlidesList();
      });
    });
    document.querySelectorAll('[data-bg-image]').forEach(function(input){
      input.addEventListener('change', async function(){
        const i = +input.getAttribute('data-bg-image');
        const file = input.files && input.files[0];
        if(!file) return;
        if(!state.user){ showToast('Sign in first.'); return; }
        showToast('Uploading background image&hellip;');
        try{
          const result = await uploadMediaFile(file, state.user.uid, 'image', function(){});
          sermonEditSlides[i].background = { type:'image', url: result.url, storagePath: result.storagePath };
          renderSermonSlidesList();
        }catch(e){
          showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why.' + describeError(e));
        }
      });
    });

    // Properties panel for whichever block is currently selected (if any).
    const textArea = document.querySelector('[data-block-text]');
    if(textArea) textArea.addEventListener('input', function(){ patchSelectedBlockText(textArea.value); });
    document.querySelectorAll('[data-block-align]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const b = selectedBlockRef(); if(!b) return;
        b.align = btn.getAttribute('data-block-align');
        renderSermonSlidesList();
      });
    });
    const sizeSel = document.querySelector('[data-block-size]');
    if(sizeSel) sizeSel.addEventListener('change', function(){
      const b = selectedBlockRef(); if(!b) return;
      b.size = sizeSel.value;
      renderSermonSlidesList();
    });
    const boldBtn = document.querySelector('[data-block-bold]');
    if(boldBtn) boldBtn.addEventListener('click', function(){
      const b = selectedBlockRef(); if(!b) return;
      b.bold = !b.bold;
      renderSermonSlidesList();
    });
    document.querySelectorAll('[data-remove-block]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!sermonEditSelectedBlock) return;
        sermonEditSlides[sermonEditSelectedBlock.slideIdx].blocks.splice(sermonEditSelectedBlock.blockIdx, 1);
        sermonEditSelectedBlock = null;
        renderSermonSlidesList();
      });
    });
    const blockImgInput = document.querySelector('[data-block-image-upload]');
    if(blockImgInput) blockImgInput.addEventListener('change', async function(){
      const file = blockImgInput.files && blockImgInput.files[0];
      const b = selectedBlockRef();
      if(!file || !b) return;
      if(!state.user){ showToast('Sign in first.'); return; }
      showToast('Uploading image&hellip;');
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'image', function(){});
        b.url = result.url; b.storagePath = result.storagePath;
        renderSermonSlidesList();
      }catch(e){
        showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why.' + describeError(e));
      }
    });
  }

  async function saveSermonFlow(){
    if(!state.user){ showToast('Sign in first so this sermon is attributed to you.'); return; }
    const title = (document.getElementById('sermonTitleInput').value || '').trim();
    if(!title){ showToast('Type a sermon title first.'); return; }
    const speaker = (document.getElementById('sermonSpeakerInput').value || '').trim();
    const slides = sermonEditSlides.map(function(sl){
      return {
        id: sl.id,
        background: sl.background || { type:'color', color:'default' },
        blocks: (sl.blocks||[]).map(function(b){
          const clean = { id:b.id, type:b.type, x:b.x, y:b.y, w:b.w, h:b.h };
          if(b.type === 'image'){ clean.url = b.url||''; clean.storagePath = b.storagePath||''; }
          else { clean.text = (b.text||'').trim(); clean.align = b.align||'center'; clean.size = b.size||'md'; clean.bold = !!b.bold; }
          return clean;
        }).filter(function(b){ return b.type==='image' ? !!b.url : !!b.text; })
        // Drop a block that ended up entirely empty (added by hand, never filled in) --
        // same "don't save something with nothing on it" reasoning the old
        // template renderer applied per-slide; here it applies per-block.
      };
    }).filter(function(sl){
      // Drop a slide that ended up with zero real blocks.
      return sl.blocks.length > 0;
    });
    if(!slides.length){ showToast('Add at least one slide with something on it.'); return; }

    const btn = document.getElementById('saveSermonBtn');
    if(btn) btn.disabled = true;
    try{
      if(sermonEditId){
        await updateSermon(sermonEditId, { title: title, speaker: speaker, slides: slides });
        showToast('Sermon updated.');
      } else {
        const newId = await createSermon({
          title: title, speaker: speaker, slides: slides,
          createdByUid: state.user.uid, createdByName: (state.profile && state.profile.displayName) || 'Someone'
        });
        sermonEditId = newId;
        showToast('Sermon saved.');
      }
      state.view = sermonEditReturnView;
      render(); window.scrollTo(0,0);
    }catch(e){
      showToast('Couldn&rsquo;t save that sermon &mdash; try again.');
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  /* ============ WORSHIP SESSIONS: views ============ */
  let setupIsPublic = true;
  // Kept in sync on every keystroke (not just read at submit time) so that
  // toggling Public/Private -- which re-renders this whole form -- never
  // discards what the person already typed. Same pattern as the Add Song
  // section builder's live sync, and the same bug class it fixed.
  let setupDraft = null;

  // Setlist prep: lets a host queue up songs before the service even starts,
  // so they can just tap through them live instead of searching every time.
  // Stored as an ordered array of song ids -- both here (pre-service, local
  // to this draft) and later on the room itself (mid-service, synced live).
  let setupSetlist = [];
  let setupSetlistQuery = '';

  function setlistSearchResults(query, excludeIds){
    const q = query.trim().toLowerCase();
    return state.library.filter(function(s){
      if(excludeIds.includes(s.id)) return false;
      if(!q) return true;
      return s.title.toLowerCase().includes(q) || String(s.number).includes(q) ||
        (s.tags||[]).join(' ').toLowerCase().includes(q) ||
        (s.themes||[]).map(themeLabel).join(' ').toLowerCase().includes(q);
    });
  }

  // ids -> ordered <li> markup with up/down/remove controls. `prefix` keeps
  // the pre-service builder's controls (data-setlist-*) and the mid-service
  // editor's controls (data-room-setlist-*) from colliding when both this
  // and renderSetlistAddResults could theoretically render into the same
  // page (they never do today, but this is what makes it safe either way).
  function renderSetlistItems(ids, prefix){
    if(!ids.length) return '<p class="hint">No songs queued yet &mdash; search below to add some.</p>';
    return '<ul class="setlist-items">' + ids.map(function(id, i){
      const s = state.library.find(function(x){ return x.id===id; });
      const title = s ? s.title : '(song removed from hymnal)';
      return '<li class="setlist-item">' +
        '<span class="setlist-num">'+(i+1)+'</span><span class="setlist-title">'+escapeHtml(title)+'</span>' +
        '<span class="setlist-controls">' +
          '<button type="button" class="icon-btn-sm" data-'+prefix+'-up="'+i+'" '+(i===0?'disabled':'')+' aria-label="Move up">&uarr;</button>' +
          '<button type="button" class="icon-btn-sm" data-'+prefix+'-down="'+i+'" '+(i===ids.length-1?'disabled':'')+' aria-label="Move down">&darr;</button>' +
          '<button type="button" class="icon-btn-sm" data-'+prefix+'-remove="'+i+'" aria-label="Remove">&times;</button>' +
        '</span>' +
      '</li>';
    }).join('') + '</ul>';
  }

  function renderSetlistAddResults(query, excludeIds, prefix){
    const results = setlistSearchResults(query, excludeIds);
    if(!results.length) return '<p class="hint">'+(query.trim() ? 'No matching songs.' : 'Every song is already queued.')+'</p>';
    return '<ul class="hymn-list">' + results.slice(0,8).map(function(s){
      return '<li><div class="hymn-card"><button class="hymn-card-main" data-'+prefix+'-add="'+s.id+'">' +
        '<span class="hymn-num">'+s.number+'</span><span class="hymn-meta"><p class="hymn-title">'+escapeHtml(s.title)+'</p></span>' +
        '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>' +
      '</button></div></li>';
    }).join('') + '</ul>';
  }

  function renderSessionSetup(){
    if(!setupDraft){
      // A fresh setupDraft means this is the start of a new "Host a Service"
      // flow (not a re-render mid-flow) -- reset the visibility toggle here
      // too, so a private room chosen last time doesn't silently carry over
      // and block the next session's creation with a "set a password" toast.
      setupIsPublic = true;
      setupSetlist = [];
      setupSetlistQuery = '';
      setupDraft = {
        name:'Sunday Service',
        hostName: (state.profile && state.profile.displayName) || '',
        churchName: (state.profile && state.profile.churchName) || '',
        password:''
      };
    }
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="setupBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="session-card">' +
        '<h3>Host a Worship Service</h3>' +
        '<p>Create a live session &mdash; everyone who joins will see whatever song and section you&rsquo;re on, updated as you move through the service.</p>' +
        '<div class="field"><label for="roomNameInput">SERVICE NAME</label><input type="text" id="roomNameInput" placeholder="e.g. Sunday Morning Worship" value="'+escapeAttr(setupDraft.name)+'"></div>' +
        '<div class="field"><label for="hostNameInput">YOUR NAME</label><input type="text" id="hostNameInput" placeholder="e.g. Pastor Jared" value="'+escapeAttr(setupDraft.hostName)+'"></div>' +
        '<div class="field"><label for="setupChurchInput">CHURCH NAME</label><input type="text" id="setupChurchInput" placeholder="e.g. Cedar Grove Baptist Church" value="'+escapeAttr(setupDraft.churchName)+'"></div>' +
        '<p class="control-label uc" style="margin:18px 0 8px;">Room Visibility</p>' +
        '<div class="toggle-row">' +
          '<button type="button" class="'+(setupIsPublic?'active':'')+'" id="publicToggleBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg>PUBLIC ROOM</button>' +
          '<button type="button" class="'+(!setupIsPublic?'active':'')+'" id="privateToggleBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('flag')+'</svg>PRIVATE ROOM</button>' +
        '</div>' +
        (setupIsPublic ?
          '<p class="hint">Anyone can find and join this room from the public list &mdash; no code needed.</p>' :
          '<div class="field"><label for="setupPasswordInput">SET A PASSWORD</label><input type="text" id="setupPasswordInput" placeholder="e.g. grace2026" value="'+escapeAttr(setupDraft.password)+'"></div><p class="hint">Share the room code and this password with your congregation.</p>'
        ) +
        '<button class="btn btn-primary btn-lg btn-block" id="createRoomBtn" style="margin-top:18px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>CREATE ROOM &amp; START HOSTING</button>' +
      '</div>' +
      '<div class="session-card">' +
        '<h3>Prep Your Setlist <span style="text-transform:none;font-weight:400;">(optional)</span></h3>' +
        '<p>Queue up songs ahead of time so you can just tap through them during the service instead of searching every time. You can still search for anything else once you&rsquo;re live.</p>' +
        renderSetlistItems(setupSetlist, 'setlist') +
        '<div class="search-box" style="margin:14px 0 10px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
          '<input type="text" id="setlistSearch" placeholder="Search songs to add&hellip;" value="'+escapeAttr(setupSetlistQuery)+'" aria-label="Search songs to add to setlist"></div>' +
        '<div id="setlistAddResults">' + renderSetlistAddResults(setupSetlistQuery, setupSetlist, 'setlist') + '</div>' +
      '</div>';

    document.getElementById('setupBackBtn').addEventListener('click', function(){ setupDraft = null; state.view='host-hub'; render(); window.scrollTo(0,0); });
    document.getElementById('publicToggleBtn').addEventListener('click', function(){ setupIsPublic = true; render(); });
    document.getElementById('privateToggleBtn').addEventListener('click', function(){ setupIsPublic = false; render(); });
    document.getElementById('createRoomBtn').addEventListener('click', submitCreateRoom);

    document.getElementById('roomNameInput').addEventListener('input', function(e){ setupDraft.name = e.target.value; });
    document.getElementById('hostNameInput').addEventListener('input', function(e){ setupDraft.hostName = e.target.value; });
    document.getElementById('setupChurchInput').addEventListener('input', function(e){ setupDraft.churchName = e.target.value; });
    const pwEl = document.getElementById('setupPasswordInput');
    if(pwEl) pwEl.addEventListener('input', function(e){ setupDraft.password = e.target.value; });

    attachSetupSetlistHandlers();
  }

  function attachSetupSetlistHandlers(){
    document.querySelectorAll('[data-setlist-up]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-setlist-up');
        [setupSetlist[i-1], setupSetlist[i]] = [setupSetlist[i], setupSetlist[i-1]];
        render();
      });
    });
    document.querySelectorAll('[data-setlist-down]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-setlist-down');
        [setupSetlist[i], setupSetlist[i+1]] = [setupSetlist[i+1], setupSetlist[i]];
        render();
      });
    });
    document.querySelectorAll('[data-setlist-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        setupSetlist.splice(+btn.getAttribute('data-setlist-remove'), 1);
        render();
      });
    });
    document.querySelectorAll('[data-setlist-add]').forEach(function(btn){
      btn.addEventListener('click', function(){
        setupSetlist.push(btn.getAttribute('data-setlist-add'));
        setupSetlistQuery = '';
        render();
      });
    });
    const searchEl = document.getElementById('setlistSearch');
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      searchEl.addEventListener('input', function(e){
        setupSetlistQuery = e.target.value;
        const holder = document.getElementById('setlistAddResults');
        if(holder) holder.innerHTML = renderSetlistAddResults(setupSetlistQuery, setupSetlist, 'setlist');
        document.querySelectorAll('[data-setlist-add]').forEach(function(btn){
          btn.addEventListener('click', function(){
            setupSetlist.push(btn.getAttribute('data-setlist-add'));
            setupSetlistQuery = '';
            render();
          });
        });
      });
    }
  }

  async function submitCreateRoom(){
    if(!state.user){ showToast('Sign in first so this session can be attributed to you.'); return; }
    const name = (setupDraft.name||'').trim() || 'Sunday Service';
    const hostName = (setupDraft.hostName||'').trim() || 'Worship Leader';
    const churchName = (setupDraft.churchName||'').trim();
    const password = !setupIsPublic ? (setupDraft.password||'').trim() : '';
    if(!setupIsPublic && !password){ showToast('Set a password for a private room, or switch to public.'); return; }

    const createBtn = document.getElementById('createRoomBtn');
    if(createBtn) createBtn.disabled = true;
    try{
      const code = await createRoom({
        name: name, hostUid: state.user.uid, hostName: hostName, churchName: churchName,
        isPublic: setupIsPublic, password: password, setlist: setupSetlist.slice()
      });
      state.activeRoomCode = code;
      state.isHost = true;
      state.isCoHost = false;
      safeSessionSet('cv:activeRoomCode', code);
      safeSessionSet('cv:isHost', '1');
      safeSessionRemove('cv:isCoHost');
      startMySermonsWatch(); startSharedSermonsWatch(); // so the host's "pick a sermon to present" list (own + shared) is ready as soon as they land on session-host
      startMyMediaWatch(); startSharedMediaWatch(); // same, for the MEDIA tab's picker
      startDirectoryWatch(); // powers the owner-only "Manage Hosts" panel's account search -- see renderHostManagePanel()
      // Save the (possibly edited) name/church back to the profile too, so they're
      // prefilled next time -- but only if they changed something meaningful.
      if(hostName && hostName !== state.profile?.displayName || (churchName && churchName !== state.profile?.churchName)){
        saveProfile(state.user.uid, { displayName: hostName, churchName: churchName }).catch(function(){});
      }
      hostPickerOpen = false; hostConfirmEnd = false; hostPickerQuery = ''; hostSermonPickerQuery = ''; hostMediaPickerQuery = '';
      hostSermonPickerOpen = false; hostVersePickerOpen = false; hostVerseRefInput = '';
      hostVerseMode = 'browse'; hostVerseBrowseBook = null; hostVerseBrowseChapter = null; hostVerseMultiSelect = []; hostVerseSelectMode = false;
      hostSetlistEditorOpen = false; hostContentTab = null; hostPreview = null; hostMediaPickerOpen = false; hostMediaUploadOpen = false;
      setupDraft = null; setupSetlist = []; setupSetlistQuery = '';
      state.view = 'session-host';
      watchActiveRoom(code);
      watchChat(code, 'everyone');
      render(); window.scrollTo(0,0);
    }catch(e){
      showToast('Couldn&rsquo;t start a session &mdash; if you&rsquo;re not on the worship team&rsquo;s editor list yet, ask to be added.');
    }finally{
      if(createBtn) createBtn.disabled = false;
    }
  }

  let hostPickerOpen = false;
  let hostSermonPickerOpen = false; // mirrors hostPickerOpen, for the "PRESENT A SERMON" picker
  let hostMediaPickerOpen = false; // Media/AVP [2026-09-06] -- mirrors hostSermonPickerOpen, for the "PRESENT MEDIA" picker
  let hostMediaUploadOpen = false; // In-session upload [2026-09-06] -- the MEDIA picker's own "+ UPLOAD NEW" toggle, reveals the same segmented row + renderMediaAddPanel() the Media Library screen uses
  let hostConfirmEnd = false;
  let hostPickerQuery = '';
  // Search for Sermon/Media pickers [2026-09-16] -- Jared: "check the whole
  // features and functions... less clicks/scrolls." The SONGS picker has
  // always had a search box (hostPickerQuery, above); SERMON and MEDIA
  // never got the same treatment and only ever showed a flat scrolling
  // list, which turns into real scrolling once a church has more than a
  // handful of sermons or media items on file -- these two mirror
  // hostPickerQuery/hostPickerResults()/attachHostPickerHandlers() exactly
  // (see renderSermonPicker()/renderMediaPicker() and their attach
  // functions below).
  let hostSermonPickerQuery = '';
  let hostMediaPickerQuery = '';
  let hostSetlistEditorOpen = false;
  let hostSetlistQuery = '';
  // Tab-highlight fix [2026-09-06] -- Jared: "when I toggle here, the red
  // highlight does not move from one option to another unless [you] put it
  // live." The SONGS/SERMON/BIBLE segmented control used to derive its
  // active/highlighted tab straight from the ROOM's actual live content
  // type (content.type) -- so tapping SERMON when no sermon had ever been
  // made live yet correctly opened the sermon picker, but the highlight
  // stayed on SONGS since nothing had actually gone live. hostContentTab is
  // a separate, purely-local "which tab am I looking at" selection: it
  // moves the instant you tap a tab, independent of whether that tab's
  // content is actually live yet. null means "not chosen this room visit
  // yet" -- renderSessionHost() defaults it from the room's real live
  // content the first time it's read. This never affects what the
  // congregation/projector actually sees (still driven by
  // room.currentContentType); it only controls which tab reads as
  // selected and which panel (picker vs. setlist) shows on the host's own
  // screen.
  let hostContentTab = null;
  // Co-hosting [2026-09-05]: mirrors hostSermonPickerOpen/hostPickerQuery's
  // pattern exactly, for the owner-only "Manage Hosts" panel (see
  // renderHostManagePanel()/attachHostManageHandlers()).
  let hostManageOpen = false;
  let hostManageQuery = '';
  // Livestream link [2026-09-24] -- Jared: "it's enough for us to just have
  // the option to share the link via chat. like a chat message that remains
  // at the top so joiners can open them." room.livestreamUrl is a single
  // plain URL (host's own FB/YouTube Live link, set/cleared from this
  // panel), rendered as a pinned banner at the top of renderChatSection()
  // (shared by both the host's floating chat panel and the congregant's
  // inline chat -- see that function) rather than an actual chat message,
  // since a real message would just scroll away like any other one. Same
  // toggle-panel convention as hostManageOpen/hostManageQuery above.
  let hostStreamLinkOpen = false;
  let hostStreamLinkInput = '';
  // Ad hoc Bible verse presenting [2026-09-04] -- Jared: "add an ability for
  // the host to present bible verses at will." Distinct from a verse baked
  // into a prepared sermon slide (a 'verse'-preset text block inserted via
  // the presentation builder's ADD VERSE (KJV) button, above): this is a
  // third, independent content source a host can switch
  // to mid-service without having built anything ahead of time, mirroring
  // hostSermonPickerOpen/hostPickerQuery's pattern one level simpler (a
  // single reference input + live KJV lookup instead of a searchable list).
  let hostVersePickerOpen = false;
  let hostVerseRefInput = '';
  // Easier Bible-verse picking [2026-09-06] -- Jared: "give it an easier
  // interface apart from searching, give it an option to pick from a set of
  // books, chapters, and verses. and when searching, give suggestions."
  // hostVerseMode toggles the picker between BROWSE (tap through books ->
  // chapters -> verses, mirroring the standalone Bible tab's own
  // book/chapter drill-down -- see renderBibleBody()/bibleChapterNumbers()/
  // bibleVerseEntries() above, reused as-is) and SEARCH (the original typed-
  // reference field, now also surfacing book-name and matching-verse
  // suggestions as you type -- see renderVerseSearchBody()). Browse position
  // (book/chapter) is its own local state, deliberately separate from the
  // standalone Bible tab's bibleBook/bibleChapter so browsing here to look
  // something up never disturbs where a host left off on the actual Bible
  // screen, and vice versa.
  // Multi-verse selection [2026-09-15] -- Jared: "the presenter can pick
  // verses by hand, search, and move from one verse to another freely or
  // even pick multiple verses by clicking ctrl+click." Ctrl/Cmd-click on a
  // verse row in BROWSE mode (see the delegated click handler below) toggles
  // it into this list instead of presenting it immediately, so a host can
  // build up a passage from verses that aren't necessarily contiguous (or
  // even in the same chapter/book) before presenting them together as one
  // slide -- see presentSelectedVerses() below. A plain (non-modified) tap
  // still presents that single verse right away, unchanged.
  let hostVerseMultiSelect = []; // [{book, chapter, verse, text}], click order
  // Redesign [2026-09-15] -- Jared, after the Ctrl/Cmd-click version still
  // felt broken: "still hard to pick multiple verses. I'd have to click on
  // it, then ctrl+click again" -- then, unprompted, the exact fix: "what if
  // we just add a function to pick multiple verses and then a checkbox
  // appears before the verses." Ctrl/Cmd-click was always the wrong
  // interaction for this app to lean on: it requires a physical modifier
  // key, which touch/mobile has no way to hold at all -- and Jared hosts
  // from his phone (see v37/v38/v40's mobile-only bugs). hostVerseSelectMode
  // replaces it outright: an explicit toggle turns "tap a verse = present it
  // immediately" into "tap a verse = check it off," with a real checkbox
  // rendered before each verse row so there's no modifier key, and no
  // guessing, involved at all -- works identically on a phone or a desktop.
  let hostVerseSelectMode = false;
  let hostVerseMode = 'browse';
  let hostVerseBrowseBook = null;
  let hostVerseBrowseChapter = null;
  // Host-screen reorganization [2026-09-04] -- Jared: "the presenter
  // controls screen is a little crowded... organize it so it's more user
  // friendly." Chat is now a floating widget (see hostChatOpen's use in
  // renderSessionHost()) toggled from its own bottom-right FAB rather than
  // living inline in the scrolling page at all. Not reset on a new/resumed
  // hosting session for the same reason presenterSplitView isn't: a host
  // who opened it generally wants it to stay open.
  let hostChatOpen = false;
  // Round 2 of the same reorganization [2026-09-04] -- Jared: "put the
  // 'now live' section as a non moving part... I still find it hard to
  // navigate because there's a lot of scrolling." hostNowLiveExpanded
  // controls the fixed bottom preview bar (see renderPreviewBar()):
  // collapsed shows one compact status row + PREV/NEXT, expanded grows it
  // upward to also show the actual lyric/verse/point text and the
  // section-jump chips -- either way it never scrolls with the rest of
  // the page, so the single most-repeated action (see what's live, advance
  // it) is always on screen. hostCodeVisible hides the room code behind a
  // SHOW/HIDE toggle -- Jared: "put it in a toggle... where it's not
  // always visible" -- since it's only read once (to share it), not
  // needed on screen for the rest of the service. Neither resets on a
  // new/resumed session, same reasoning as presenterSplitView/hostChatOpen.
  let hostNowLiveExpanded = false;
  let hostCodeVisible = false;
  // Presenter/Projector split-screen toggle -- see renderSessionHost()'s
  // presenterToolbar and .host-split-grid in styles.css. Reset when a new
  // hosting session actually starts (createSession/resumeAsHost, wherever
  // state.view first becomes 'session-host') isn't done deliberately: a
  // host who toggled it on generally wants it to stay on across song
  // changes for the rest of that service. [2026-09-04] Also now survives an
  // actual page reload -- Jared's "recently shown"/tab-resume asks were all
  // about not repeating the same setup, and losing this specific toggle on
  // every refresh was the same flavor of annoyance. It's a per-DEVICE
  // preference, not a room-synced one (two hosts resuming the same room
  // from different devices might reasonably want different layouts), so
  // this lives in localStorage (safeGet/safeSet, already used for other
  // small device-local prefs) rather than on the room doc.
  const SPLIT_VIEW_KEY = 'iworship:local:splitView';

  // Projector text size [2026-09-24] -- Jared: "for the font size of the
  // projector mode, make it larger or add an option to increase the size
  // in the controls." fitStageLines() (further down) auto-SHRINKS text to
  // keep it from overflowing the screen, but its ceiling was fixed at
  // 67px -- there was never a way to ask for text bigger than that, only
  // to let it shrink less. This is a multiplier applied to that ceiling
  // (and floor) instead. Same per-device localStorage reasoning as
  // SPLIT_VIEW_KEY just above -- EXCEPT this one also needs to reach a
  // separate tab: the Projector view is deliberately "chrome-less and
  // read-only... no chat, no controls" (see renderSessionProjector()'s own
  // comment) and usually sits on a second monitor/actual projector, so the
  // +/- buttons live on the HOST's controls instead (presenterToolbar,
  // below) and reach an already-open Projector tab live via the 'storage'
  // event, the same way any other same-origin tab finds out localStorage
  // changed in a DIFFERENT tab (a tab never gets a 'storage' event for its
  // own writes, only for ones made elsewhere -- which is exactly what's
  // wanted here: the Host tab sets hostStageFontScale directly, the
  // Projector tab picks up the change through this listener).
  const STAGE_FONT_SCALE_KEY = 'iworship:local:stageFontScale';
  const STAGE_FONT_SCALE_MIN = 0.8, STAGE_FONT_SCALE_MAX = 1.8, STAGE_FONT_SCALE_STEP = 0.15;
  let hostStageFontScale = parseFloat(safeGet(STAGE_FONT_SCALE_KEY, '1')) || 1;
  function setStageFontScale(next){
    hostStageFontScale = Math.max(STAGE_FONT_SCALE_MIN, Math.min(STAGE_FONT_SCALE_MAX, next));
    safeSet(STAGE_FONT_SCALE_KEY, String(hostStageFontScale));
    if(state.view === 'session-projector') fitStageLines();
    render();
  }
  window.addEventListener('storage', function(e){
    if(e.key !== STAGE_FONT_SCALE_KEY) return;
    hostStageFontScale = parseFloat(e.newValue) || 1;
    if(state.view === 'session-projector') fitStageLines();
  });
  let presenterSplitView = safeGet(SPLIT_VIEW_KEY, '0') === '1';

  // Resizable PREVIEW/LIVE squares [2026-09-16] -- Jared, on the split-
  // screen PREVIEW/LIVE columns: "what if we just set the text to a
  // certain size, and just give the user an option to resize the squares
  // so they don't have to scroll up and down." Before this, .host-stage-
  // col had no fixed height at all -- it just grew to fit whatever content
  // was in it (see styles.css), so a long passage (a multi-verse Bible
  // selection, in particular) made the whole PAGE tall enough that seeing
  // the rest of the controls meant scrolling past it. hostStageColHeight
  // (null until the host actually drags a square) is the box's own pinned
  // height in px; once set, .host-stage-col gets that height as an inline
  // style plus CSS `resize:vertical; overflow:auto` (styles.css) instead
  // of growing indefinitely -- long content scrolls INSIDE the square, not
  // the page, and the native resize handle is exactly the "option to
  // resize" asked for. Same per-device localStorage pattern as
  // SPLIT_VIEW_KEY just above -- a comfortable box size on one host's
  // laptop isn't necessarily what a co-host on a phone wants.
  const STAGE_COL_HEIGHT_KEY = 'iworship:local:stageColHeight';
  let hostStageColHeight = parseInt(safeGet(STAGE_COL_HEIGHT_KEY, ''), 10) || null;
  // Set up once (see attachStageColResize() below) and just re-pointed at
  // whichever .host-stage-col elements exist after each render, rather than
  // recreated every time -- ResizeObserver instances aren't free, and every
  // renderSessionHost() call re-attaches handlers the same way its other
  // attachXHandlers() helpers do.
  let stageColResizeObserver = null;

  // The live setlist queue -- tap any song to jump straight to it (no
  // searching needed for anything prepped ahead of time). "Edit" reveals
  // the same add/reorder/remove controls as the pre-service builder, but
  // writing straight to the room itself via updateRoom(), so every open
  // screen (host or viewer) reflects an edit immediately, same as any other
  // room change.
  function renderSetlistSection(room){
    const ids = room.setlist || [];
    return '<div class="session-card" style="margin-top:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:'+(ids.length||hostSetlistEditorOpen?'10px':'0')+';">' +
        '<h3 style="margin:0;">Setlist</h3>' +
        '<button type="button" class="switch-account" id="toggleSetlistEditBtn" style="margin:0;">'+(hostSetlistEditorOpen?'DONE EDITING':'EDIT SETLIST')+'</button>' +
      '</div>' +
      (!hostSetlistEditorOpen ?
        (ids.length ? ('<ul class="setlist-items">' + ids.map(function(id){
          const s = state.library.find(function(x){ return x.id===id; });
          const isCurrent = id === room.currentSongId;
          return '<li class="setlist-item'+(isCurrent?' setlist-current':'')+'"><button type="button" class="setlist-tap" data-setlist-tap="'+id+'">' +
            (isCurrent ? '<span class="live-dot" style="margin-right:8px;"></span>' : '') +
            '<span class="setlist-title">'+escapeHtml(s ? s.title : '(removed)')+'</span>' +
          '</button></li>';
        }).join('') + '</ul>') : '')
        :
        (renderSetlistItems(ids, 'room-setlist') +
          '<div class="search-box" style="margin:14px 0 10px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
            '<input type="text" id="roomSetlistSearch" placeholder="Search songs to add&hellip;" value="'+escapeAttr(hostSetlistQuery)+'" aria-label="Search songs to add to setlist"></div>' +
          '<div id="roomSetlistAddResults">' + renderSetlistAddResults(hostSetlistQuery, ids, 'room-setlist') + '</div>'
        )
      ) +
    '</div>';
  }

  function attachSetlistSectionHandlers(room){
    const toggleBtn = document.getElementById('toggleSetlistEditBtn');
    if(toggleBtn) toggleBtn.addEventListener('click', function(){ hostSetlistEditorOpen = !hostSetlistEditorOpen; hostSetlistQuery=''; render(); });
    document.querySelectorAll('[data-setlist-tap]').forEach(function(btn){
      btn.addEventListener('click', function(){ chooseSong(btn.getAttribute('data-setlist-tap')); });
    });
    function patchSetlist(newIds){
      if(!canControlRoom(state.room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
      updateRoom(state.activeRoomCode, { setlist: newIds }).catch(function(){ showToast('Could not update the setlist. Try again.'); });
    }
    document.querySelectorAll('[data-room-setlist-up]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-room-setlist-up');
        const ids = (room.setlist||[]).slice();
        [ids[i-1], ids[i]] = [ids[i], ids[i-1]];
        patchSetlist(ids);
      });
    });
    document.querySelectorAll('[data-room-setlist-down]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const i = +btn.getAttribute('data-room-setlist-down');
        const ids = (room.setlist||[]).slice();
        [ids[i], ids[i+1]] = [ids[i+1], ids[i]];
        patchSetlist(ids);
      });
    });
    document.querySelectorAll('[data-room-setlist-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const ids = (room.setlist||[]).slice();
        ids.splice(+btn.getAttribute('data-room-setlist-remove'), 1);
        patchSetlist(ids);
      });
    });
    document.querySelectorAll('[data-room-setlist-add]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const ids = (room.setlist||[]).concat([btn.getAttribute('data-room-setlist-add')]);
        hostSetlistQuery = '';
        patchSetlist(ids);
      });
    });
    const searchEl = document.getElementById('roomSetlistSearch');
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      searchEl.addEventListener('input', function(e){
        hostSetlistQuery = e.target.value;
        const holder = document.getElementById('roomSetlistAddResults');
        if(holder) holder.innerHTML = renderSetlistAddResults(hostSetlistQuery, room.setlist||[], 'room-setlist');
        document.querySelectorAll('[data-room-setlist-add]').forEach(function(btn){
          btn.addEventListener('click', function(){
            const ids = (room.setlist||[]).concat([btn.getAttribute('data-room-setlist-add')]);
            hostSetlistQuery = '';
            patchSetlist(ids);
          });
        });
      });
    }
  }

  // [2026-09-10] Jared: "add a title slide for all the songs." Rather than
  // storing a real section on every song (which would mean migrating the
  // whole library, and a "Title" section sitting in song.sections could
  // then be edited or deleted by mistake like any real verse/chorus), the
  // title slide is synthesized on the fly, ONLY at presentation time --
  // song.sections itself (what the song editor reads/writes, and what a
  // library card's "N sections" count shows) is completely untouched.
  // sectionIndex 0 is now always this synthetic title slide; sectionIndex
  // 1..N map to song.sections[0..N-1] exactly as they always have. Every
  // place that turns a song + sectionIndex into an actual displayed
  // section (or needs the total count/list for bounds-checking or a jump
  // list) reads through this helper instead of song.sections directly.
  function titleSlideSection(song){
    return {
      type: 'title',
      label: song.key ? ('KEY OF ' + song.key) : '',
      lines: [song.title]
    };
  }
  function songSectionsForPresenting(song){
    return song ? [titleSlideSection(song)].concat(song.sections) : [];
  }

  // Resolves whatever a room is CURRENTLY showing -- a song section, a
  // sermon slide, or an ad hoc Bible verse -- into one shape every render
  // function below can branch on, instead of each of the four (host/
  // congregant/projector/split-preview) re-deriving song/section,
  // sermon/slide, or verse lookups its own way. `currentContentType`
  // absent or 'song' both mean "song" (older rooms created before this
  // feature never got the new field, and should keep working exactly as
  // before).
  function resolveRoomContent(room){
    if(!room) return { type:'none' };
    if(room.currentContentType === 'sermon'){
      const sermon = (state.viewSermon && state.viewSermon.id === room.currentSermonId) ? state.viewSermon : null;
      const slides = sermon ? (sermon.slides || []) : [];
      const idx = slides.length ? Math.min(Math.max(room.currentSlideIndex||0, 0), slides.length-1) : 0;
      return { type:'sermon', sermon: sermon, slides: slides, slideIndex: idx, slide: slides[idx] || null };
    }
    // Ad hoc Bible verse [2026-09-04] -- Jared: "add an ability for the
    // host to present bible verses at will." Deliberately its own
    // `currentContentType`, not a one-slide fake sermon -- a presented
    // verse has no sermon doc, no id, no slide array to page through, and
    // disguising it as one would make renderSessionHost()'s SERMON tab
    // (sermon picker, multi-slide nav, "SWITCH BACK TO SONGS" wording)
    // apply to something that isn't a sermon. The single verse still
    // reuses sermonSlideLineParts()/sermonLinesAsCardHtml()/
    // sermonLinesAsStageHtml() below for the actual text styling, via
    // verseAsSlide() building a plain {template:'verse', ...} object --
    // those functions never cared where a slide came from.
    if(room.currentContentType === 'verse'){
      // currentVerseSegments [2026-09-15] -- see presentSelectedVerses()'s
      // own comment; carries the small-superscript-verse-number rendering
      // through to every LIVE viewer (congregation projector, participant
      // stage view, musician chart), not just the host's own local preview.
      return { type:'verse', verseRef: room.currentVerseRef || '', verseText: room.currentVerseText || '', verseSegments: room.currentVerseSegments || null };
    }
    // Media/AVP [2026-09-06] -- see findMediaById()'s comment just below for
    // why `media` comes from state.viewMedia (the live-watched doc) here,
    // not a find() over state.myMedia/state.sharedMedia the way a STAGED
    // media item does in resolvePreviewContent(). `slideIndex` only matters
    // for a 'slideshow' item; every other type ignores it.
    if(room.currentContentType === 'media'){
      const media = (state.viewMedia && state.viewMedia.id === room.currentMediaId) ? state.viewMedia : null;
      const slides = (media && media.type==='slideshow') ? (media.slides||[]) : [];
      const idx = slides.length ? Math.min(Math.max(room.currentMediaSlideIndex||0, 0), slides.length-1) : 0;
      return { type:'media', media: media, slides: slides, slideIndex: idx,
        mediaPlaying: !!room.mediaPlaying, mediaClockStartedAtMs: room.mediaClockStartedAtMs||0, mediaClockBaseOffsetSec: room.mediaClockBaseOffsetSec||0 };
    }
    const song = room.currentSongId ? state.library.find(function(s){ return s.id===room.currentSongId; }) : null;
    return { type:'song', song: song, section: song ? songSectionsForPresenting(song)[room.currentSectionIndex] : null, sectionIndex: room.currentSectionIndex };
  }
  // Stage overrides [2026-09-24] -- Jared: "I also don't see the background
  // logo, black, or option to add background." A quick cutaway the host
  // can flip on/off during a live session (BLACK/LOGO/DEFAULT BG buttons in
  // the presenter toolbar, see renderSessionHost()) without touching
  // whatever song/sermon/verse/media is actually selected underneath --
  // turning it back off (room.stageOverride back to null/absent) instantly
  // reveals that same content exactly where it was, the same way a
  // physical "blackout"/"logo" button on a video switcher works.
  //
  // Deliberately a SEPARATE function from resolveRoomContent() above,
  // rather than a branch added to the top of it, because resolveRoomContent()
  // is also the source of truth for things that must NEVER be blanked out
  // by an override: resolvePreviewContent()'s "nothing staged yet" fallback
  // and ensurePreviewFromLive() both need the REAL underlying selection to
  // seed the host's own staging draft (a black screen has no song/sermon/
  // verse to stage from), and renderSessionChart() (the musician's own
  // chord-chart link) must keep showing the real chart throughout a
  // blackout/logo cutaway -- musicians still need to see what they're
  // playing even when the audience-facing screen is intentionally blank.
  // Only the actual audience-facing surfaces -- the host's own LIVE column,
  // the ?stage= projector, a congregant's in-app live view, and the
  // projector's own keyboard-advance shortcut -- call this wrapper instead
  // of resolveRoomContent() directly.
  function resolveLiveDisplayContent(room){
    if(room && room.stageOverride){
      return { type:'stage-override', mode: room.stageOverride };
    }
    return resolveRoomContent(room);
  }
  // Media/AVP [2026-09-06] -- exact mirror of findSermonById() just below,
  // for a STAGED (not-yet-live) media item.
  function findMediaById(id){
    if(!id) return null;
    return state.myMedia.find(function(m){ return m.id===id; }) ||
      state.sharedMedia.find(function(m){ return m.id===id; }) || null;
  }
  // Looks a sermon up by id across BOTH the host's own sermons and ones
  // shared with them (state.mySermons/state.sharedSermons -- both already
  // hold full sermon docs, slides included, same lists renderSermonPicker()
  // renders from). Used by resolvePreviewContent()/changeSermonSlide()
  // below for a STAGED (not-yet-live) sermon, which state.viewSermon can't
  // help with -- that one only ever tracks whichever sermon is actually
  // live (see ensureViewSermonWatch()), not whatever a host might be
  // previewing ahead of pressing GO LIVE.
  function findSermonById(id){
    if(!id) return null;
    return state.mySermons.find(function(s){ return s.id===id; }) ||
      state.sharedSermons.find(function(s){ return s.id===id; }) || null;
  }
  // Preview/Go Live [2026-09-06] -- Jared: "I think it's better if we have a
  // preview and a live view, then if the host is good with the preview, he
  // can [click] on go live." Before this, every host action (pick a song,
  // tap next/prev, jump to a section) wrote straight to the room doc and
  // was instantly visible to the whole congregation. hostPreview is a
  // purely LOCAL (never synced to Firestore) draft of what the host is
  // currently staging -- null means "nothing staged, preview mirrors
  // live"; once set, it holds exactly the fields that would need to go
  // onto the room doc to actually present it. Deliberately per-device, not
  // per-room: only whoever currently holds control (canControlRoom()) is
  // driving anyway, and their own in-progress draft shouldn't appear on
  // anyone else's screen (including another co-host's) until they
  // actually publish it.
  let hostPreview = null;
  // Mirrors resolveRoomContent()'s exact return shape (same 'type'/'song'/
  // 'section'/'sectionIndex'/'sermon'/'slide'/'slideIndex'/'verseRef'/
  // 'verseText' fields) so every renderer that already knows how to draw a
  // content object -- renderStageSlide(), sermonLinesAsCardHtml(), etc. --
  // works completely unchanged on either a live or a staged one; only
  // which object gets passed in differs.
  function resolvePreviewContent(room){
    if(!hostPreview) return resolveRoomContent(room); // nothing staged -- preview mirrors live
    const p = hostPreview;
    if(p.type === 'sermon'){
      const sermon = findSermonById(p.sermonId);
      const slides = sermon ? (sermon.slides || []) : [];
      const idx = slides.length ? Math.min(Math.max(p.slideIndex||0, 0), slides.length-1) : 0;
      return { type:'sermon', sermon: sermon, slides: slides, slideIndex: idx, slide: slides[idx] || null };
    }
    if(p.type === 'verse'){
      return { type:'verse', verseRef: p.verseRef || '', verseText: p.verseText || '', verseSegments: p.verseSegments || null };
    }
    // Media/AVP [2026-09-06]: a STAGED media item's slideIndex/playback
    // fields aren't on the room doc yet (nothing's live), so this branch
    // always reads 0/not-playing for those -- they only ever matter once
    // GO LIVE actually publishes hostPreview onto the room (see goLive()).
    if(p.type === 'media'){
      const media = findMediaById(p.mediaId);
      const slides = (media && media.type==='slideshow') ? (media.slides||[]) : [];
      const idx = slides.length ? Math.min(Math.max(p.slideIndex||0, 0), slides.length-1) : 0;
      return { type:'media', media: media, slides: slides, slideIndex: idx, mediaPlaying:false, mediaClockStartedAtMs:0, mediaClockBaseOffsetSec:0 };
    }
    const song = p.songId ? state.library.find(function(s){ return s.id===p.songId; }) : null;
    return { type:'song', song: song, section: song ? songSectionsForPresenting(song)[p.sectionIndex] : null, sectionIndex: p.sectionIndex };
  }
  // First touch of PREV/NEXT/jump on a fresh session (hostPreview still
  // null) starts the draft as a copy of whatever's actually live right now
  // -- so nudging "next section" when nothing's been explicitly picked yet
  // continues from where the congregation already is, instead of from
  // nothing.
  function ensurePreviewFromLive(room){
    if(hostPreview || !room) return;
    const c = resolveRoomContent(room);
    if(c.type === 'sermon' && c.sermon) hostPreview = { type:'sermon', sermonId: c.sermon.id, slideIndex: c.slideIndex||0 };
    else if(c.type === 'verse' && c.verseText) hostPreview = { type:'verse', verseRef: c.verseRef, verseText: c.verseText, verseSegments: c.verseSegments || null };
    else if(c.type === 'media' && c.media) hostPreview = { type:'media', mediaId: c.media.id, slideIndex: c.slideIndex||0 };
    else if(c.type === 'song' && c.song) hostPreview = { type:'song', songId: c.song.id, sectionIndex: room.currentSectionIndex||0 };
  }
  // Whether the staged preview actually differs from what's already live --
  // gates the GO LIVE button (nothing to publish otherwise) and is also the
  // signal renderPreviewBar() uses to show its "not live yet" indicator.
  function previewIsDirty(previewContent, liveContent){
    if(previewContent.type !== liveContent.type) return previewContent.type !== 'none' || liveContent.type !== 'none';
    if(previewContent.type === 'song'){
      return !previewContent.song || !liveContent.song || previewContent.song.id !== liveContent.song.id || previewContent.sectionIndex !== liveContent.sectionIndex;
    }
    if(previewContent.type === 'sermon'){
      return !previewContent.sermon || !liveContent.sermon || previewContent.sermon.id !== liveContent.sermon.id || previewContent.slideIndex !== liveContent.slideIndex;
    }
    if(previewContent.type === 'verse') return previewContent.verseRef !== liveContent.verseRef;
    if(previewContent.type === 'media'){
      return !previewContent.media || !liveContent.media || previewContent.media.id !== liveContent.media.id ||
        (previewContent.media.type==='slideshow' && previewContent.slideIndex !== liveContent.slideIndex);
    }
    return false;
  }
  // Publishes the staged preview to the room doc -- the one and only place
  // that actually makes something visible to the congregation now that
  // picking/nav stage into hostPreview instead of writing straight through.
  // "Recently shown" bookkeeping (pushRecentId()/pushRecentVerse()) moves
  // here too, from the old chooseSong()/presentSermon()/presentVerse() --
  // it should reflect what's actually been shown, not merely staged and
  // maybe abandoned.
  function goLive(){
    const room = state.room;
    if(!room || !canControlRoom(room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    if(!hostPreview) return; // nothing staged -- see previewIsDirty(), the button is disabled/hidden already
    let patch;
    if(hostPreview.type === 'sermon'){
      patch = { currentContentType:'sermon', currentSermonId: hostPreview.sermonId, currentSlideIndex: hostPreview.slideIndex||0,
        recentSermonIds: pushRecentId(room.recentSermonIds, hostPreview.sermonId) };
    } else if(hostPreview.type === 'verse'){
      // currentVerseSegments [2026-09-15]: explicit `|| null`, not left
      // undefined, so presenting a plain single verse (which never sets
      // verseSegments on hostPreview) correctly CLEARS any segments array
      // left over from a previous multi-verse presentation -- Firestore
      // update()/set() reject an actual `undefined` value outright, and a
      // stale array would otherwise make an unrelated later single verse
      // render with leftover superscript numbers that don't belong to it.
      patch = { currentContentType:'verse', currentVerseRef: hostPreview.verseRef, currentVerseText: hostPreview.verseText,
        currentVerseSegments: hostPreview.verseSegments || null,
        recentVerses: pushRecentVerse(room.recentVerses, hostPreview.verseRef, hostPreview.verseText) };
    } else if(hostPreview.type === 'media'){
      // Media/AVP [2026-09-06]: a 'video' item always (re)starts its
      // synced clock from 0 the moment it goes live -- see the Room shape
      // note in interface.md for why mediaClockStartedAtMs is a plain
      // client Date.now() epoch rather than serverTimestamp(): that
      // resolves asynchronously (reads back as null until the server
      // acks it), which would leave every viewer's syncStageMediaVideo()
      // with nothing to compute against for one round-trip -- a plain
      // client timestamp is available to every watcher (including this
      // same host's own split-screen mirror) the instant the snapshot
      // arrives, at the cost of a little clock-skew imprecision this
      // feature's tolerance (a hymn/worship video, not broadcast sync)
      // doesn't need to be perfect about.
      const media = findMediaById(hostPreview.mediaId);
      patch = { currentContentType:'media', currentMediaId: hostPreview.mediaId, currentMediaSlideIndex: hostPreview.slideIndex||0,
        mediaPlaying: !!(media && media.type==='video'), mediaClockStartedAtMs: Date.now(), mediaClockBaseOffsetSec: 0,
        recentMediaIds: pushRecentId(room.recentMediaIds, hostPreview.mediaId) };
    } else if(hostPreview.type === 'song'){
      patch = { currentContentType:'song', currentSongId: hostPreview.songId, currentSectionIndex: hostPreview.sectionIndex||0,
        recentSongIds: pushRecentId(room.recentSongIds, hostPreview.songId) };
    } else return;
    const wentLiveSongId = hostPreview.type === 'song' ? hostPreview.songId : null;
    updateRoom(state.activeRoomCode, patch)
      .then(function(){
        showToast('You&rsquo;re live.');
        // Song usage tracking [2026-09-24] -- see recordSongUsage()'s own
        // comment (data/firestore-data-layer.js) for the full design. Fired
        // only once the room write actually succeeds, and only for an
        // actual GO LIVE publish (not staging/PREV/NEXT within the same
        // song) -- best-effort, never blocks or errors out the go-live
        // toast if it fails.
        if(wentLiveSongId) recordSongUsage(wentLiveSongId).catch(function(){});
      })
      .catch(function(){ showToast('Could not update the session. Try again.'); });
  }
  function verseAsSlide(ref, text, segments){
    return { template:'verse', heading:'', verseRef: ref, verseText: text, verseSegments: segments || null };
  }

  // Turns one sermon slide into a flat list of {text, emphasis} lines,
  // shared by the two markup formatters below -- keeps the actual per-
  // template wording in exactly one place regardless of which of the two
  // very different-looking contexts (a host/congregant .slide-card, or a
  // big chrome-less .stage-lines projector) ends up displaying it.
  function sermonSlideLineParts(slide){
    if(!slide) return [{text:'This slide is empty.', emphasis:'soft'}];
    if(slide.template === 'title'){
      const parts = [{text: slide.heading || '(untitled)', emphasis:'strong'}];
      if(slide.subtitle) parts.push({text: slide.subtitle, emphasis:'soft'});
      return parts;
    }
    if(slide.template === 'point'){
      const parts = [];
      if(slide.heading) parts.push({text: slide.heading, emphasis:'strong'});
      (slide.points||[]).forEach(function(p){ parts.push({text: '• ' + p, emphasis:null}); });
      if(!parts.length) parts.push({text:'(no points yet)', emphasis:'soft'});
      return parts;
    }
    // verse
    const parts = [];
    if(slide.heading) parts.push({text: slide.heading, emphasis:'strong'});
    if(slide.verseSegments && slide.verseSegments.length){
      // Small-superscript verse numbers [2026-09-15] -- Jared: "when
      // presenting multiple verses, the verse number is the same font size
      // as the letters, that should just be a small number at the upper
      // left part of the first word." Built as pre-escaped `html` (a new
      // part field, checked by sermonLinesAsCardHtml()/
      // sermonLinesAsStageHtml() below) rather than a plain `text` that
      // gets escapeHtml()'d as one opaque string -- each segment's OWN
      // text needs its own escaping, with the verse number rendered ahead
      // of it via the exact same `.bible-verse-num` styling (small,
      // superscript, wine-colored) the normal Bible reading view already
      // uses for this, via renderBible() above -- not a one-off look
      // invented just for this screen.
      const inner = slide.verseSegments.map(function(seg){
        return '<span class="bible-verse-num">'+escapeHtml(String(seg.verse))+'</span>'+escapeHtml(seg.text);
      }).join(' ');
      parts.push({html: '“' + inner + '”', emphasis:'italic'});
    } else {
      parts.push({text: '“' + (slide.verseText||'(no verse text yet)') + '”', emphasis:'italic'});
    }
    if(slide.verseRef) parts.push({text: '— ' + slide.verseRef, emphasis:'soft'});
    return parts;
  }
  function emphasisStyle(emphasis){
    return emphasis==='strong' ? 'font-weight:700;' : emphasis==='italic' ? 'font-style:italic;' : emphasis==='soft' ? 'opacity:.75;' : '';
  }
  // For .slide-card contexts (host controls + congregant view) -- same
  // .lyric-line class a song's lines already use there.
  function sermonLinesAsCardHtml(slide){
    return sermonSlideLineParts(slide).map(function(p){
      const style = emphasisStyle(p.emphasis);
      // p.html [2026-09-15]: pre-escaped markup (currently just the small-
      // superscript multi-verse-number case above) -- inserted as-is,
      // never re-escaped, unlike every other part's plain p.text.
      const body = p.html != null ? p.html : escapeHtml(p.text);
      return '<p class="lyric-line"'+(style?(' style="'+style+'"'):'')+'>'+body+'</p>';
    }).join('');
  }
  // For .stage-lines contexts (Presenter/Projector + split-screen preview)
  // -- bare <p> tags, matching how a song's lines already render there
  // (see the CSS comment on .stage-lines p in styles.css).
  function sermonLinesAsStageHtml(slide){
    return sermonSlideLineParts(slide).map(function(p){
      const style = emphasisStyle(p.emphasis);
      const body = p.html != null ? p.html : escapeHtml(p.text);
      return '<p'+(style?(' style="'+style+'"'):'')+'>'+body+'</p>';
    }).join('');
  }

  // ---- Presentation builder [2026-09-08]: blocks-based slide rendering ----
  // A blocks-based slide (see isBlocksSlide()/migrateLegacySlideToBlocks(),
  // above) renders as one fixed-size canvas containing independently
  // positioned/sized blocks -- every block's x/y/w/h is stored as a
  // PERCENTAGE of the slide, so this renders identically (same relative
  // layout) whether it ends up small inside a .slide-card or full-bleed on
  // a projector. `variant` only changes the outer wrapper's own sizing:
  //   'card'  -- a normal-flow, fixed 16:9 box (host preview bar, congregant
  //              slide-card, chart view -- all already wrap this in their
  //              own '<div class="slide-card" style="padding:0;...">').
  //   'stage' -- position:absolute; inset:0, filling the nearest positioned
  //              ancestor (.stage-view/.host-stage-col), the exact same
  //              containing-block convention .stage-media-frame already
  //              established for Media/AVP content (see that class's own
  //              comment in styles.css).
  //   'edit'  -- like 'card', plus the interactive affordances (selection
  //              outline, resize handle, data-block-idx targeting) --
  //              see renderSlideCanvasEditable() below, the only caller.
  function blockTextInnerHtml(text){
    return escapeHtml(text||'').split('\n').map(function(line){ return '<p>'+(line?line:'&nbsp;')+'</p>'; }).join('');
  }
  // opts: { attrs, extraClass, handle } -- all editor-only extras; a plain
  // read-only render call passes none of them.
  function renderSlideBlock(b, opts){
    opts = opts || {};
    const pos = 'left:'+b.x+'%;top:'+b.y+'%;width:'+b.w+'%;height:'+b.h+'%;';
    const baseClass = b.type==='image' ? 'slide-block slide-block-image'
      : ('slide-block slide-block-text block-align-'+(b.align||'center')+' block-size-'+(b.size||'md')+(b.bold?' block-bold':''));
    const cls = baseClass + (opts.extraClass ? (' '+opts.extraClass) : '');
    const attrs = opts.attrs || '';
    const content = b.type==='image'
      ? (b.url ? '<img src="'+escapeAttr(b.url)+'" alt="">' : '<span class="slide-block-empty">Image</span>')
      : blockTextInnerHtml(b.text);
    return '<div class="'+cls+'"'+attrs+' style="'+pos+'">'+content+(opts.handle||'')+'</div>';
  }
  function renderSlideCanvas(slide, variant){
    const bg = slide.background || { type:'color', color:'default' };
    const bgStyle = bg.type === 'color' ? ('background:'+slideBgCssValue(bg.color)+';') : '';
    const dark = bg.type === 'image' ? true : slideBgMeta(bg.type==='color'?bg.color:'default').dark;
    return '<div class="slide-canvas slide-canvas-'+variant+(dark?' slide-canvas-dark':'')+'" style="'+bgStyle+'">' +
      (bg.type === 'image' && bg.url ? '<img class="slide-canvas-bg-img" src="'+escapeAttr(bg.url)+'" alt="">' : '') +
      (slide.blocks||[]).map(function(b){ return renderSlideBlock(b); }).join('') +
    '</div>';
  }
  // Interactive twin of renderSlideCanvas(), used only inside the Sermons
  // editor (renderSermonSlidesList() below). Adds data-block-idx to every
  // block (so the pointerdown delegation in wireSlideCanvasInteractions()
  // can identify what was clicked), a selection outline + resize handle on
  // whichever block sermonEditSelectedBlock currently names, and
  // data-canvas-slide-idx on the canvas itself (so a click on empty canvas
  // space, not on a block, can be told apart from a click on a block).
  function renderSlideCanvasEditable(slide, slideIdx){
    const bg = slide.background || { type:'color', color:'default' };
    const bgStyle = bg.type === 'color' ? ('background:'+slideBgCssValue(bg.color)+';') : '';
    const dark = bg.type === 'image' ? true : slideBgMeta(bg.type==='color'?bg.color:'default').dark;
    return '<div class="slide-canvas slide-canvas-edit'+(dark?' slide-canvas-dark':'')+'" data-canvas-slide-idx="'+slideIdx+'" style="'+bgStyle+'">' +
      (bg.type === 'image' && bg.url ? '<img class="slide-canvas-bg-img" src="'+escapeAttr(bg.url)+'" alt="">' : '') +
      (slide.blocks||[]).map(function(b, bi){
        const selected = !!(sermonEditSelectedBlock && sermonEditSelectedBlock.slideIdx===slideIdx && sermonEditSelectedBlock.blockIdx===bi);
        return renderSlideBlock(b, {
          attrs: ' data-block-idx="'+bi+'"',
          extraClass: selected ? 'slide-block-selected' : '',
          handle: selected ? '<span class="slide-block-handle" data-resize-handle="1"></span>' : ''
        });
      }).join('') +
    '</div>';
  }

  // "Recently shown" quick-lists [2026-09-04] -- Jared: "add [a recently
  // presented quick list] ... so we can lessen repetitive work." Each
  // content type keeps its own short, most-recent-first, deduped history
  // directly on the room doc (recentSongIds/recentSermonIds/recentVerses),
  // capped at RECENT_CAP entries -- small enough to live on the room
  // document itself rather than a subcollection, and it rides along with
  // every other live-synced room field for free (no new watch, no new
  // firestore.rules entry: room updates have no field allowlist, same
  // reasoning as every other room-doc addition this session). Bumping an
  // already-present entry back to the front (rather than leaving a stale
  // second copy further down) is why this is a filter-then-unshift, not a
  // plain push.
  const RECENT_CAP = 5;
  function pushRecentId(list, id){
    const next = (list || []).filter(function(x){ return x !== id; });
    next.unshift(id);
    return next.slice(0, RECENT_CAP);
  }
  function pushRecentVerse(list, ref, text){
    const next = (list || []).filter(function(v){ return v.ref !== ref; });
    next.unshift({ ref: ref, text: text });
    return next.slice(0, RECENT_CAP);
  }
  // Recent-verse chip -> jump the BROWSE view to that verse's own chapter
  // [2026-09-16] -- Jared: "when clickin on recent verses viewed, make it
  // also go to the same chapter where the verse was." Before this, tapping
  // a RECENTLY SHOWN chip re-presented that verse but left hostVerseBrowse-
  // Book/Chapter wherever they already were, so the picker underneath kept
  // showing an unrelated book/chapter instead of the one the recent verse
  // actually came from -- no help if the host wants to pick a nearby verse
  // next. `ref` here is whatever pushRecentVerse() stored, which can be a
  // single verse ("Genesis 1:1"), a range ("Genesis 1:1-3"), or a combined
  // multi-verse/multi-book passage from presentSelectedVerses() ("Genesis
  // 1:1, 3" or "Genesis 1:1, 3 &middot; Exodus 20:3") -- this only needs
  // the FIRST group's book/chapter (splitting on the same " &middot; "
  // presentSelectedVerses() joins groups with), not the exact verse list,
  // so one loose regex covers all three shapes; parseVerseRef() next door
  // can't be reused as-is since it requires the whole string to match one
  // single verse/range and rejects a comma list or a second group.
  function recentVerseBrowseLocation(ref){
    if(!kjvData) return null;
    const firstGroup = ref.split(' · ')[0]; // matches presentSelectedVerses()'s ' &middot; ' join
    const m = firstGroup.trim().match(/^(.+?)\s+(\d+):/);
    if(!m) return null;
    const bookInput = m[1].trim().toLowerCase();
    const book = kjvData.books.find(function(b){ return b.toLowerCase() === bookInput; });
    if(!book) return null;
    return { book: book, chapter: Number(m[2]) };
  }

  // Preview/Go Live [2026-09-06]: picking a sermon/verse now stages it into
  // hostPreview instead of writing straight to the room -- see hostPreview's
  // own declaration (near resolvePreviewContent(), above) for the full
  // reasoning. Nothing is visible to the congregation until GO LIVE.
  function presentSermon(sermonId){
    hostSermonPickerOpen = false; hostSermonPickerQuery = '';
    if(!canControlRoom(state.room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    hostPreview = { type:'sermon', sermonId: sermonId, slideIndex: 0 };
    render();
  }
  function presentVerse(ref, text){
    // Fix [2026-09-15]: Jared: "the bible in host room disappears when you
    // go live with one verse. It should still be fully interactive where
    // the presenter can pick verses by hand, search, and move from one
    // verse to another freely." This used to close the picker (like
    // presentSermon()/presentMedia() do) the instant a verse was staged --
    // fine for sermon/media, where PREV/NEXT in the Now Live bar covers
    // moving within the one thing you picked, but Bible verses aren't a
    // fixed ordered sequence, so closing left the BIBLE tab showing
    // literally nothing (no picker, and no setlist either, since a verse
    // isn't a song) until the host noticed they had to click the BIBLE tab
    // again just to bring the picker back. Leaving it open lets them tap
    // straight on to the next verse, search again, or browse a different
    // chapter, with no extra click.
    if(!canControlRoom(state.room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    hostPreview = { type:'verse', verseRef: ref, verseText: text };
    render();
  }
  // Verse-list scroll position [2026-09-16, hardened 2026-09-17] -- Jared:
  // "when picking verses from the list of verses, it scrolls back to the
  // top which is annoying." Because the verse picker deliberately stays
  // open across a selection (see presentVerse()'s own comment), a host
  // scrolled down into a long chapter to find one verse then wants to act
  // on the NEXT nearby one too -- whether that's presenting it, or (in
  // "SELECT MULTIPLE VERSES" mode) checking its box -- but both of those
  // still rebuild the verse list (`.lyric-sheet`, see
  // renderVersePickerBody()) as a brand-new element every time, and a
  // brand-new element's scrollTop always starts at 0. That's invisible for
  // SONGS/SERMON/MEDIA -- picking one of those closes its own picker
  // entirely (presentSermon()/presentMedia()/chooseSong()), so there's
  // nothing left on screen to lose the scroll position of -- but here it
  // silently threw the host back to the top of the chapter after every
  // single tap. `fn` does whatever state change/re-render the caller
  // needs; this wraps it with a capture-before/restore-after of whichever
  // `.lyric-sheet` is on screen, AND (2026-09-17) of the whole page's own
  // scroll position. Only used from the two same-list interactions below
  // -- NOT from the RECENTLY SHOWN chips (which deliberately jump to a
  // *different* chapter's list first, where restoring an old, unrelated
  // scroll position would be wrong, not helpful) or the search box's
  // PRESENT button.
  //
  // Hardened [2026-09-17] -- Jared, after the first cut of this fix
  // shipped: "nope. still happening" -- specifically on mobile (his
  // installed Android app), tapping a verse to present it. A Playwright
  // repro built to match that exact report (real mobile viewport + touch
  // input, a long chapter scrolled deep, present a verse) could NOT
  // reproduce the jump -- both `.lyric-sheet`'s own scrollTop and
  // `window.scrollY` came back unchanged every time in that environment.
  // The strong suspect that leaves: `presentVerse()` (unlike the
  // select-mode checkbox path) goes through the full app `render()`,
  // which replaces the ENTIRE session-host view's markup, not just this
  // picker's -- and on a REAL touchscreen (not a synthetic Playwright
  // tap), the tapped button can receive real browser focus, and some
  // mobile browsers apply their own "scroll the newly-focused/point-of-
  // interaction element into view" adjustment on a LATER paint tick, after
  // this function's own synchronous restore already ran -- silently
  // undoing it a moment later in a way no synchronous-only test could ever
  // catch. Rather than keep chasing the exact mechanism blind (no way to
  // attach a debugger to Jared's phone from here), this defends against
  // that whole class of "something restores scroll late" cause: it now
  // also captures/restores `window.scrollY` (not just the internal list),
  // and re-asserts BOTH a moment later via a doubled requestAnimationFrame
  // -- after the browser's own post-tap scroll adjustment, whatever it
  // is, has had its turn -- so a late native scroll can't quietly win.
  function withPreservedVerseListScroll(fn){
    const listEl = document.querySelector('.lyric-sheet');
    const listScroll = listEl ? listEl.scrollTop : 0;
    const pageScroll = window.scrollY;
    function reassert(){
      if(listScroll){
        const restored = document.querySelector('.lyric-sheet');
        if(restored && restored.scrollTop !== listScroll) restored.scrollTop = listScroll;
      }
      if(pageScroll && window.scrollY !== pageScroll){
        window.scrollTo(0, pageScroll);
      }
    }
    fn();
    reassert();
    requestAnimationFrame(function(){
      reassert();
      requestAnimationFrame(reassert);
    });
  }
  // Same page-scroll defense as withPreservedVerseListScroll() just above,
  // minus the internal-list part -- for the other three ways to present a
  // verse and trigger the same full render(), where there's no shared list
  // left on screen afterward to also restore (SEARCH mode's PRESENT THIS
  // VERSE closes/changes what's shown; a RECENTLY SHOWN chip deliberately
  // jumps BROWSE to a different chapter; PRESENT SELECTED exits select
  // mode entirely) but the whole PAGE's own scroll position should still
  // never involuntarily move just because one of these was tapped.
  function withPreservedPageScroll(fn){
    const pageScroll = window.scrollY;
    function reassert(){
      if(pageScroll && window.scrollY !== pageScroll) window.scrollTo(0, pageScroll);
    }
    fn();
    reassert();
    requestAnimationFrame(function(){
      reassert();
      requestAnimationFrame(reassert);
    });
  }
  // Combines every verse in hostVerseMultiSelect (in click order) into one
  // staged verse slide -- e.g. Ctrl-clicking John 3:16 then John 3:18 stages
  // a single slide headed "John 3:16, 18" with both verses' text, rather
  // than presenting them one at a time. Verses from different chapters/books
  // are grouped and labeled by their own reference so the combined heading
  // still reads sensibly (e.g. "Genesis 1:1, 3 &middot; Exodus 20:3").
  function presentSelectedVerses(){
    if(!hostVerseMultiSelect.length) return;
    if(!canControlRoom(state.room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    const groups = []; // [{book, chapter, verses:[{verse,text}]}]
    hostVerseMultiSelect.forEach(function(sel){
      let g = groups.find(function(x){ return x.book===sel.book && x.chapter===sel.chapter; });
      if(!g){ g = { book: sel.book, chapter: sel.chapter, verses: [] }; groups.push(g); }
      g.verses.push({ verse: sel.verse, text: sel.text });
    });
    groups.forEach(function(g){ g.verses.sort(function(a,b){ return a.verse - b.verse; }); });
    const refLabel = groups.map(function(g){
      return g.book+' '+g.chapter+':'+g.verses.map(function(v){ return v.verse; }).join(', ');
    }).join(' · ');
    const text = groups.map(function(g){
      return g.verses.map(function(v){ return v.verse+' '+v.text; }).join(' ');
    }).join(' ');
    // verseSegments [2026-09-15] -- Jared: "when presenting multiple
    // verses, the verse number is the same font size as the letters, that
    // should just be a small number at the upper left part of the first
    // word." `text` above stays as a plain flat string (recentVerses'
    // quick-repick list, and anything else that only ever needed plain
    // text, keep working unchanged) -- verseSegments is the SAME content
    // as an ordered list of {verse, text} instead, so
    // sermonSlideLineParts()/sermonLinesAsCardHtml()/sermonLinesAsStageHtml()
    // below can render each verse's number as a small superscript (the
    // exact .bible-verse-num styling the normal Bible reading view already
    // uses) ahead of that verse's own text, rather than as a same-size
    // digit baked into one opaque string. A single verse presented via
    // presentVerse() (not this multi-select path) never sets this field at
    // all, matching Jared's report being specific to "multiple verses" --
    // a lone verse's reference is already shown separately as its heading,
    // never inline in the body text.
    const segments = [];
    groups.forEach(function(g){ g.verses.forEach(function(v){ segments.push({ verse: v.verse, text: v.text }); }); });
    hostPreview = { type:'verse', verseRef: refLabel, verseText: text, verseSegments: segments };
    hostVerseMultiSelect = []; hostVerseSelectMode = false;
    render();
  }
  function toggleVerseMultiSelect(book, chapter, verse, text){
    const i = hostVerseMultiSelect.findIndex(function(s){ return s.book===book && s.chapter===chapter && s.verse===verse; });
    if(i === -1) hostVerseMultiSelect.push({ book: book, chapter: chapter, verse: verse, text: text });
    else hostVerseMultiSelect.splice(i, 1);
  }
  // Media/AVP [2026-09-06]: exact mirror of presentSermon() above.
  function presentMedia(mediaId){
    hostMediaPickerOpen = false; hostMediaUploadOpen = false; hostMediaPickerQuery = '';
    if(!canControlRoom(state.room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    hostPreview = { type:'media', mediaId: mediaId, slideIndex: 0 };
    render();
  }
  // Advances the STAGED preview, not what's live -- see hostPreview. Starts
  // the draft from whatever's currently live on first touch (see
  // ensurePreviewFromLive()) so "next slide" continues from where the
  // congregation already is rather than from nothing.
  function changeSermonSlide(delta){
    const room = state.room;
    if(!room || !canControlRoom(room)) return; // buttons are already disabled for this case -- see renderPreviewBar()
    ensurePreviewFromLive(room);
    if(!hostPreview || hostPreview.type !== 'sermon') return;
    const sermon = findSermonById(hostPreview.sermonId);
    const slides = sermon ? (sermon.slides || []) : [];
    const next = (hostPreview.slideIndex||0) + delta;
    if(next < 0 || next >= slides.length) return;
    hostPreview.slideIndex = next;
    render();
  }
  function jumpToSermonSlide(i){
    const room = state.room;
    if(!canControlRoom(room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    ensurePreviewFromLive(room);
    if(!hostPreview || hostPreview.type !== 'sermon') return;
    hostPreview.slideIndex = i;
    render();
  }
  // Direct LIVE advance, used ONLY by the projector view's own space/arrow
  // keyboard shortcut (see its keydown listener, below) -- a person
  // standing at the projector/second monitor pressing a clicker wants an
  // immediate change on the screen in front of them, not a staged draft
  // they'd then have to find a GO LIVE button for. These are the exact
  // bodies changeSermonSlide()/changeSection() used to have, before the
  // 2026-09-06 preview/go-live rework retargeted those two at hostPreview
  // instead -- kept here, unchanged, so the projector's own shortcut still
  // behaves exactly as it always has.
  function advanceLiveSermonSlide(delta){
    const room = state.room;
    if(!room || room.currentContentType !== 'sermon') return;
    if(!canControlRoom(room)) return;
    const slides = (state.viewSermon && state.viewSermon.id===room.currentSermonId) ? (state.viewSermon.slides||[]) : [];
    const next = (room.currentSlideIndex||0) + delta;
    if(next < 0 || next >= slides.length) return;
    updateRoom(state.activeRoomCode, { currentSlideIndex: next })
      .catch(function(){ showToast('Could not update the session. Try again.'); });
  }

  // Media/AVP [2026-09-06] -- changeMediaSlide()/jumpToMediaSlide() mirror
  // changeSermonSlide()/jumpToSermonSlide() exactly (staged, via hostPreview);
  // advanceLiveMediaSlide() mirrors advanceLiveSermonSlide() exactly (direct
  // live write, for the projector's own keyboard shortcut). All three only
  // ever apply to a 'slideshow' media item -- an image/video/embed has
  // nothing to page through.
  function changeMediaSlide(delta){
    const room = state.room;
    if(!room || !canControlRoom(room)) return;
    ensurePreviewFromLive(room);
    if(!hostPreview || hostPreview.type !== 'media') return;
    const media = findMediaById(hostPreview.mediaId);
    if(!media || media.type !== 'slideshow') return;
    const slides = media.slides || [];
    const next = (hostPreview.slideIndex||0) + delta;
    if(next < 0 || next >= slides.length) return;
    hostPreview.slideIndex = next;
    render();
  }
  function jumpToMediaSlide(i){
    const room = state.room;
    if(!canControlRoom(room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    ensurePreviewFromLive(room);
    if(!hostPreview || hostPreview.type !== 'media') return;
    hostPreview.slideIndex = i;
    render();
  }
  function advanceLiveMediaSlide(delta){
    const room = state.room;
    if(!room || room.currentContentType !== 'media') return;
    if(!canControlRoom(room)) return;
    const media = state.viewMedia;
    if(!media || media.id !== room.currentMediaId || media.type !== 'slideshow') return;
    const slides = media.slides || [];
    const next = (room.currentMediaSlideIndex||0) + delta;
    if(next < 0 || next >= slides.length) return;
    updateRoom(state.activeRoomCode, { currentMediaSlideIndex: next })
      .catch(function(){ showToast('Could not update the session. Try again.'); });
  }

  // Media/AVP [2026-09-06] -- video transport. Deliberately DIRECT live
  // writes, not staged through hostPreview like everything else on this
  // screen: once a video is already live, PLAY/PAUSE/RESTART control the
  // thing that's already showing, not "which thing to show next" -- the
  // same reasoning advanceLiveSection()/advanceLiveSermonSlide() established
  // for the projector's own shortcut, just reachable from the host's own
  // controls too (any current controller, not just someone standing at the
  // projector). See the Room shape note in interface.md for the
  // mediaClockStartedAtMs/mediaClockBaseOffsetSec clock these three
  // maintain, and syncStageMediaVideo() for how every viewer's <video>
  // element actually follows it.
  function currentMediaClockSeconds(room){
    if(!room || !room.mediaClockStartedAtMs) return room ? (room.mediaClockBaseOffsetSec||0) : 0;
    const base = room.mediaClockBaseOffsetSec||0;
    return room.mediaPlaying ? base + Math.max(0, (Date.now() - room.mediaClockStartedAtMs) / 1000) : base;
  }
  function mediaPlayPause(){
    const room = state.room;
    if(!room || room.currentContentType !== 'media' || !canControlRoom(room)) return;
    const nowPlaying = !!room.mediaPlaying;
    const atSec = currentMediaClockSeconds(room);
    updateRoom(state.activeRoomCode, { mediaPlaying: !nowPlaying, mediaClockStartedAtMs: Date.now(), mediaClockBaseOffsetSec: atSec })
      .catch(function(){ showToast('Could not update the session. Try again.'); });
  }
  function mediaRestart(){
    const room = state.room;
    if(!room || room.currentContentType !== 'media' || !canControlRoom(room)) return;
    updateRoom(state.activeRoomCode, { mediaPlaying: true, mediaClockStartedAtMs: Date.now(), mediaClockBaseOffsetSec: 0 })
      .catch(function(){ showToast('Could not update the session. Try again.'); });
  }

  // Includes both the host's own sermons AND any shared with them
  // (state.sharedSermons -- see startSharedSermonsWatch()) so a "friend
  // pastor or the AVP team" (Jared's own examples) can actually present
  // something a sermon's original owner shared with them, not just view
  // it -- presentSermon() below just patches the room by id, with no
  // ownership check, the same way choosing a song from the public hymnal
  // never checks who added it.
  // Search for SERMON/MEDIA pickers [2026-09-16] -- see hostSermonPickerQuery's
  // own declaration for why these exist now. `all` here is the same
  // mine-then-shared combined list renderSermonPicker() already builds --
  // passed in rather than rebuilt, so filtering never drifts out of sync
  // with what's actually shown.
  function sermonPickerResults(all){
    const q = hostSermonPickerQuery.trim().toLowerCase();
    if(!q) return all;
    return all.filter(function(entry){ return entry.s.title.toLowerCase().includes(q); });
  }
  function renderSermonPickerList(results){
    return '<ul class="hymn-list">' + (results.length ? results.map(function(entry){
      const s = entry.s;
      const n = (s.slides||[]).length;
      return '<li><div class="hymn-card"><button class="hymn-card-main" data-present-sermon="'+s.id+'">' +
        '<span class="hymn-meta"><p class="hymn-title">'+escapeHtml(s.title)+'</p><p class="hint" style="margin:2px 0 0;">'+n+' slide'+(n===1?'':'s')+(entry.shared?(' &middot; shared by '+escapeHtml(s.createdByName||'someone')):'')+'</p></span>' +
        '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('chevron')+'</svg>' +
      '</button></div></li>';
    }).join('') : '<li class="sections-empty">No sermons match &ldquo;'+escapeHtml(hostSermonPickerQuery)+'&rdquo;.</li>') + '</ul>';
  }
  function renderSermonPicker(){
    const mine = state.mySermons.map(function(s){ return { s: s, shared: false }; });
    const shared = state.sharedSermons.map(function(s){ return { s: s, shared: true }; });
    const all = mine.concat(shared);
    // "Recently shown" chips (see pushRecentId()/presentSermon()) -- looked
    // up against `all` so a shared sermon someone else added mid-service
    // still resolves; a recent id that's since become unavailable (removed
    // share, deleted sermon) is just silently skipped.
    const room = state.room;
    const recentIds = (room && room.recentSermonIds) || [];
    const recentSermons = recentIds.map(function(id){
      const found = all.find(function(entry){ return entry.s.id === id; });
      return found ? found.s : null;
    }).filter(Boolean);
    return '<div class="session-card">' +
      '<p class="control-label uc" style="margin-bottom:10px;">Pick a Sermon to Present</p>' +
      (recentSermons.length ?
        ('<p class="hint" style="margin:0 0 8px;">RECENTLY SHOWN</p>' +
          '<div class="now-live-jump-row" style="margin-bottom:14px;">' +
            recentSermons.map(function(s){ return '<button type="button" class="section-jump" data-present-sermon="'+s.id+'">'+escapeHtml(s.title)+'</button>'; }).join('') +
          '</div>') : '') +
      // Search box [2026-09-16] -- only worth showing once there's a real
      // list to search through; a fresh church with one or two sermons on
      // file doesn't need it cluttering the picker.
      (all.length > 5 ?
        ('<div class="search-box" style="margin-bottom:14px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
          '<input type="text" id="hostSermonPickerSearch" placeholder="Search sermons by title&hellip;" value="'+escapeAttr(hostSermonPickerQuery)+'" aria-label="Search sermons to present"></div>') : '') +
      (all.length ? renderSermonPickerList(sermonPickerResults(all)) : '<p class="hint">You haven&rsquo;t built or been shared any sermons yet.</p>') +
      '<button type="button" class="switch-account" id="buildSermonFromHostBtn" style="margin-top:12px;">+ BUILD A NEW SERMON</button>' +
    '</div>';
  }
  function attachPresentSermonButtons(){
    document.querySelectorAll('[data-present-sermon]').forEach(function(btn){
      btn.addEventListener('click', function(){ presentSermon(btn.getAttribute('data-present-sermon')); });
    });
  }
  function attachSermonPickerHandlers(){
    attachPresentSermonButtons();
    const searchEl = document.getElementById('hostSermonPickerSearch');
    // Same one-time-wire + scoped-list-swap pattern as
    // attachHostPickerHandlers()'s hostPickerSearch, above -- re-attaching a
    // second 'input' listener on every keystroke's list swap would make
    // each future keystroke fire N times.
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      const rebuild = debounce(function(){
        const mine = state.mySermons.map(function(s){ return { s: s, shared: false }; });
        const shared = state.sharedSermons.map(function(s){ return { s: s, shared: true }; });
        const ul = searchEl.closest('.session-card').querySelector('ul.hymn-list');
        if(ul) ul.outerHTML = renderSermonPickerList(sermonPickerResults(mine.concat(shared)));
        attachPresentSermonButtons();
      }, 160);
      searchEl.addEventListener('input', function(e){
        hostSermonPickerQuery = e.target.value;
        rebuild();
      });
    }
  }

  // Media/AVP [2026-09-06] -- small shared helper: a type-appropriate icon
  // + one-line meta string for a media item, reused by renderMediaPicker()
  // just below, the Media Library list, and renderPreviewBar()'s media
  // branch, so all three describe a given item identically.
  function mediaTypeIcon(m){
    if(!m) return 'image';
    if(m.type==='video') return 'video';
    if(m.type==='slideshow') return 'layers';
    if(m.type==='embed') return 'link';
    return 'image';
  }
  function mediaTypeMeta(m){
    if(!m) return '';
    if(m.type==='video') return 'Video';
    if(m.type==='slideshow') return (m.slides||[]).length + ' slide' + ((m.slides||[]).length===1?'':'s');
    if(m.type==='embed') return (m.embedProvider||'Embed') + ' link';
    return 'Image';
  }

  // Search for the MEDIA picker [2026-09-16] -- exact mirror of
  // sermonPickerResults()/renderSermonPickerList() above, for media.
  function mediaPickerResults(all){
    const q = hostMediaPickerQuery.trim().toLowerCase();
    if(!q) return all;
    return all.filter(function(entry){ return entry.m.title.toLowerCase().includes(q); });
  }
  function renderMediaPickerList(results){
    return '<ul class="hymn-list">' + (results.length ? results.map(function(entry){
      const m = entry.m;
      return '<li><div class="hymn-card"><button class="hymn-card-main" data-present-media="'+m.id+'">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;flex:none;color:var(--ink-soft);">'+icon(mediaTypeIcon(m))+'</svg>' +
        '<span class="hymn-meta"><p class="hymn-title">'+escapeHtml(m.title)+'</p><p class="hint" style="margin:2px 0 0;">'+mediaTypeMeta(m)+(entry.shared?(' &middot; shared by '+escapeHtml(m.createdByName||'someone')):'')+'</p></span>' +
        '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('chevron')+'</svg>' +
      '</button></div></li>';
    }).join('') : '<li class="sections-empty">No media match &ldquo;'+escapeHtml(hostMediaPickerQuery)+'&rdquo;.</li>') + '</ul>';
  }
  // Exact mirror of renderSermonPicker() above, for media -- see
  // findMediaById()/presentMedia() for the staging side.
  function renderMediaPicker(){
    const mine = state.myMedia.map(function(m){ return { m: m, shared: false }; });
    const shared = state.sharedMedia.map(function(m){ return { m: m, shared: true }; });
    const all = mine.concat(shared);
    const room = state.room;
    const recentIds = (room && room.recentMediaIds) || [];
    const recentMedia = recentIds.map(function(id){
      const found = all.find(function(entry){ return entry.m.id === id; });
      return found ? found.m : null;
    }).filter(Boolean);
    return '<div class="session-card">' +
      '<p class="control-label uc" style="margin-bottom:10px;">Pick Media to Present</p>' +
      (recentMedia.length ?
        ('<p class="hint" style="margin:0 0 8px;">RECENTLY SHOWN</p>' +
          '<div class="now-live-jump-row" style="margin-bottom:14px;">' +
            recentMedia.map(function(m){ return '<button type="button" class="section-jump" data-present-media="'+m.id+'">'+escapeHtml(m.title)+'</button>'; }).join('') +
          '</div>') : '') +
      (all.length > 5 ?
        ('<div class="search-box" style="margin-bottom:14px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
          '<input type="text" id="hostMediaPickerSearch" placeholder="Search media by title&hellip;" value="'+escapeAttr(hostMediaPickerQuery)+'" aria-label="Search media to present"></div>') : '') +
      (all.length ? renderMediaPickerList(mediaPickerResults(all)) : '<p class="hint">You haven&rsquo;t uploaded or been shared any media yet.</p>') +
      '<div style="display:flex;flex-wrap:wrap;gap:4px 18px;">' +
        '<button type="button" class="switch-account" id="openMediaLibraryFromHostBtn" style="margin-top:12px;">+ OPEN MEDIA LIBRARY</button>' +
        // In-session upload [2026-09-06] -- Jared: "there should be an option
        // to upload during and within the session." Reveals the exact same
        // segmented row + renderMediaAddPanel() the Media Library screen
        // uses (see renderMediaAddSegmentedRow()) without leaving this tab.
        '<button type="button" class="switch-account" id="hostMediaUploadToggleBtn" style="margin-top:12px;">'+(hostMediaUploadOpen?'CANCEL UPLOAD':'+ UPLOAD NEW')+'</button>' +
      '</div>' +
      (hostMediaUploadOpen ? (renderMediaAddSegmentedRow() + renderMediaAddPanel()) : '') +
    '</div>';
  }
  function attachPresentMediaButtons(){
    document.querySelectorAll('[data-present-media]').forEach(function(btn){
      btn.addEventListener('click', function(){ presentMedia(btn.getAttribute('data-present-media')); });
    });
  }
  function attachMediaPickerSearchHandlers(){
    attachPresentMediaButtons();
    const searchEl = document.getElementById('hostMediaPickerSearch');
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      const rebuild = debounce(function(){
        const mine = state.myMedia.map(function(m){ return { m: m, shared: false }; });
        const shared = state.sharedMedia.map(function(m){ return { m: m, shared: true }; });
        const ul = searchEl.closest('.session-card').querySelector('ul.hymn-list');
        if(ul) ul.outerHTML = renderMediaPickerList(mediaPickerResults(mine.concat(shared)));
        attachPresentMediaButtons();
      }, 160);
      searchEl.addEventListener('input', function(e){
        hostMediaPickerQuery = e.target.value;
        rebuild();
      });
    }
  }

  // Mirrors renderSermonPicker() above, but a lookup/browse rather than a
  // list -- reuses parseVerseRef()/kjvData/bibleChapterNumbers()/
  // bibleVerseEntries()/bibleSearch(), the same KJV lookup and drill-down
  // logic the standalone Bible tab (renderBible()/renderBibleBody() above)
  // and the sermon-slide "Bible Verse Slide" editor already use. loadKjvData()
  // is triggered from the OPEN button below rather than on every render,
  // same reasoning as openSermonEditor()'s call to it. Also shows a
  // "RECENTLY SHOWN" row of one-tap chips (room.recentVerses, see
  // pushRecentVerse()/presentVerse()) above everything else, for whatever
  // verses this room already presented earlier in the service.
  //
  // Easier interface [2026-09-06] -- Jared: "give it an easier interface
  // apart from searching, give it an option to pick from a set of books,
  // chapters, and verses. and when searching, give suggestions." Below the
  // RECENTLY SHOWN row, a small BROWSE/SEARCH toggle (hostVerseMode) picks
  // between the new book -> chapter -> verse drill-down
  // (renderVerseBrowseBody(), tap a verse to present it immediately, no
  // typing at all) and the original typed-reference field, which now also
  // surfaces suggestions as you type when it isn't yet a full valid
  // reference (renderVerseSearchBody()) -- matching book names to
  // autocomplete into, and matching verse TEXT (via bibleSearch(), the same
  // whole-Bible substring search the Bible tab's own search box uses) so a
  // remembered phrase still finds the verse without knowing its reference.
  function renderVersePicker(){
    if(!kjvData){
      return '<div class="session-card"><p class="control-label uc" style="margin-bottom:10px;">Present a Bible Verse</p>' +
        '<p class="hint">'+(kjvLoading ? 'Loading the KJV text&hellip;' : 'Couldn&rsquo;t load the Bible text. Please try again.')+'</p></div>';
    }
    const room = state.room;
    const recentVerses = (room && room.recentVerses) || [];
    return '<div class="session-card">' +
      '<p class="control-label uc" style="margin-bottom:10px;">Present a Bible Verse</p>' +
      (recentVerses.length ?
        ('<p class="hint" style="margin:0 0 8px;">RECENTLY SHOWN</p>' +
          '<div class="now-live-jump-row" style="margin-bottom:14px;">' +
            recentVerses.map(function(v, idx){ return '<button type="button" class="section-jump" data-recent-verse-idx="'+idx+'">'+escapeHtml(v.ref)+'</button>'; }).join('') +
          '</div>') : '') +
      '<div class="content-segmented" style="margin-bottom:14px;">' +
        '<button type="button" class="segment-btn'+(hostVerseMode!=='search'?' active':'')+'" id="verseModeBrowseBtn">BROWSE</button>' +
        '<button type="button" class="segment-btn'+(hostVerseMode==='search'?' active':'')+'" id="verseModeSearchBtn">SEARCH</button>' +
      '</div>' +
      '<div id="verseModeBody">' + renderVersePickerBody() + '</div>' +
    '</div>';
  }

  function renderVersePickerBody(){
    return hostVerseMode === 'search' ? renderVerseSearchBody() : renderVerseBrowseBody();
  }

  // Book -> chapter -> verse drill-down. Deliberately its own hostVerseBrowse*
  // local state rather than reusing the standalone Bible tab's bibleBook/
  // bibleChapter -- see hostVerseMode's comment above for why.
  function renderVerseBrowseBody(){
    if(hostVerseBrowseBook && hostVerseBrowseChapter){
      const verses = bibleVerseEntries(hostVerseBrowseBook, hostVerseBrowseChapter);
      const chapters = bibleChapterNumbers(hostVerseBrowseBook);
      const idx = chapters.indexOf(hostVerseBrowseChapter);
      const prevCh = idx > 0 ? chapters[idx-1] : null;
      const nextCh = idx < chapters.length-1 ? chapters[idx+1] : null;
      // Redesign [2026-09-15] -- see hostVerseSelectMode's own comment
      // above. SELECT MULTIPLE VERSES toggles select mode on/off; while on,
      // every row gets a real checkbox (.verse-checkbox in styles.css) and
      // tapping ANYWHERE on the row just checks it off instead of
      // presenting it -- no modifier key, works identically on a phone.
      // Turning select mode back off does NOT clear an existing selection
      // (so an accidental tap on the toggle doesn't lose picks); the
      // "N selected / PRESENT SELECTED / Clear" row shows any time there's
      // a selection, in or out of select mode, so a host can flip back into
      // select mode to add more, or just present what they already have.
      return '<p class="bible-crumb">' +
          '<button type="button" class="link-btn" data-verse-browse-all-books="1">All books</button> &rsaquo; ' +
          '<button type="button" class="link-btn" data-verse-browse-book="'+escapeAttr(hostVerseBrowseBook)+'">'+escapeHtml(hostVerseBrowseBook)+'</button> &rsaquo; Chapter '+hostVerseBrowseChapter +
        '</p>' +
        '<div class="now-live-jump-row" style="margin-bottom:8px;align-items:center;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-ghost" id="verseSelectModeToggleBtn" style="padding:8px 14px;">'+(hostVerseSelectMode?'DONE SELECTING':'SELECT MULTIPLE VERSES')+'</button>' +
          (hostVerseMultiSelect.length ? (
            '<span class="hint" style="margin:0 6px;">'+hostVerseMultiSelect.length+' selected</span>' +
            '<button type="button" class="btn btn-primary" id="presentSelectedVersesBtn" style="padding:8px 14px;">PRESENT SELECTED</button>' +
            '<button type="button" class="link-btn" id="clearVerseSelectionBtn" style="margin-left:10px;">Clear</button>'
          ) : '') +
        '</div>' +
        (hostVerseSelectMode ? '<p class="hint" style="margin:0 0 8px;">Tap the checkbox to select a verse, then PRESENT SELECTED when ready.</p>'
          : (hostVerseMultiSelect.length ? '' : '<p class="hint" style="margin:0 0 8px;">Tap a verse to present it, or SELECT MULTIPLE VERSES to build a passage.</p>')) +
        '<div class="lyric-sheet" style="max-height:280px;overflow-y:auto;">' + verses.map(function(v){
          const selected = hostVerseMultiSelect.some(function(s){ return s.book===hostVerseBrowseBook && s.chapter===hostVerseBrowseChapter && s.verse===v.verse; });
          return '<button type="button" class="bible-search-result'+(selected?' bible-search-result-selected':'')+'" data-present-browse-verse="'+v.verse+'">' +
            '<span class="hymn-title" style="font-size:.95rem;display:flex;align-items:center;">' +
              (hostVerseSelectMode ? '<span class="verse-checkbox'+(selected?' checked':'')+'" aria-hidden="true"></span>' : '') +
              escapeHtml(hostVerseBrowseBook)+' '+hostVerseBrowseChapter+':'+v.verse+
            '</span>' +
            '<p class="hint">'+escapeHtml(cleanVerseText(v.text))+'</p>' +
          '</button>';
        }).join('') + '</div>' +
        '<div class="slide-nav" style="margin-top:12px;">' +
          '<button type="button" class="btn btn-ghost" data-browse-chapter-nav="'+(prevCh||'')+'" '+(prevCh?'':'disabled')+'>&larr; '+(prevCh?('CHAPTER '+prevCh):'PREV')+'</button>' +
          '<button type="button" class="btn btn-ghost" data-browse-chapter-nav="'+(nextCh||'')+'" '+(nextCh?'':'disabled')+'>'+(nextCh?('CHAPTER '+nextCh):'NEXT')+' &rarr;</button>' +
        '</div>';
    }
    if(hostVerseBrowseBook){
      const chapters = bibleChapterNumbers(hostVerseBrowseBook);
      return '<p class="bible-crumb"><button type="button" class="link-btn" data-verse-browse-all-books="1">All books</button> &rsaquo; '+escapeHtml(hostVerseBrowseBook)+' &mdash; choose a chapter</p>' +
        '<div class="filter-row">' + chapters.map(function(c){
          return '<button type="button" class="chip" data-verse-browse-chapter="'+c+'">'+c+'</button>';
        }).join('') + '</div>';
    }
    const otBooks = kjvData.books.slice(0, 39);
    const ntBooks = kjvData.books.slice(39);
    function bookChips(list){
      return '<div class="filter-row">' + list.map(function(b){
        return '<button type="button" class="chip" data-verse-browse-book="'+escapeAttr(b)+'">'+escapeHtml(b)+'</button>';
      }).join('') + '</div>';
    }
    return '<p class="hint" style="margin:0 0 8px;">OLD TESTAMENT</p>' + bookChips(otBooks) +
      '<p class="hint" style="margin:14px 0 8px;">NEW TESTAMENT</p>' + bookChips(ntBooks);
  }

  // Typed-reference search, now with live suggestions once there's typed
  // text that isn't yet a full "Book Chapter:Verse" match -- book-name
  // matches (tap to autocomplete "Book " into the field) and, once there's
  // enough text to be worth a scan, matching verse TEXT via bibleSearch()
  // (tap a result to present that verse directly, same as browse mode).
  function renderVerseSearchBody(){
    const raw = hostVerseRefInput;
    const found = raw.trim() ? parseVerseRef(raw) : null;
    let suggestionsHtml = '';
    if(raw.trim() && !found){
      const q = raw.trim().toLowerCase();
      const bookMatches = kjvData.books.filter(function(b){ return b.toLowerCase().indexOf(q) !== -1; }).slice(0, 8);
      if(bookMatches.length){
        suggestionsHtml += '<p class="hint" style="margin:10px 0 6px;">DID YOU MEAN&hellip;</p>' +
          '<div class="filter-row">' + bookMatches.map(function(b){
            return '<button type="button" class="chip" data-verse-suggest-book="'+escapeAttr(b)+'">'+escapeHtml(b)+'</button>';
          }).join('') + '</div>';
      }
      if(q.length >= 3){
        const textMatches = bibleSearch(raw).slice(0, 6);
        if(textMatches.length){
          suggestionsHtml += '<p class="hint" style="margin:14px 0 6px;">MATCHING VERSES</p>' +
            textMatches.map(function(r){
              return '<button type="button" class="bible-search-result" data-suggest-verse-book="'+escapeAttr(r.book)+'" data-suggest-verse-chapter="'+r.chapter+'" data-suggest-verse-verse="'+r.verse+'">' +
                '<span class="hymn-title" style="font-size:.95rem;">'+escapeHtml(r.book)+' '+r.chapter+':'+r.verse+'</span>' +
                '<p class="hint">'+escapeHtml(r.text)+'</p>' +
              '</button>';
            }).join('');
        }
      }
    }
    return '<div class="field"><label for="hostVerseRefInput">REFERENCE, OR A WORD/PHRASE TO SEARCH</label>' +
        '<input type="text" id="hostVerseRefInput" placeholder="e.g. John 3:16, Psalm 23:1-6, or &ldquo;faith&rdquo;" value="'+escapeAttr(raw)+'"></div>' +
      (raw.trim() ?
        (found ?
          ('<div class="verse-block" style="margin-top:6px;"><p class="section-label uc">'+escapeHtml(found.refLabel)+'</p>' +
            '<p class="lyric-line">'+escapeHtml(found.text)+'</p></div>' +
            '<button type="button" class="btn btn-primary btn-block" id="presentVerseBtn" style="margin-top:12px;">PRESENT THIS VERSE</button>')
          : (suggestionsHtml || '<p class="hint" style="margin-top:6px;">No matches yet &mdash; try a book name, &ldquo;Book Chapter:Verse&rdquo;, or a word/phrase.</p>'))
        : '') +
    '';
  }

  function attachVersePickerHandlers(){
    const input = document.getElementById('hostVerseRefInput');
    if(input) input.addEventListener('input', function(e){
      hostVerseRefInput = e.target.value;
      // Patch just the search body in place, then rebind -- same
      // never-steal-focus-mid-keystroke reasoning as renderBible()'s
      // #bibleBody patch and hostPickerSearch's live-filter pattern.
      const body = document.getElementById('verseModeBody');
      if(body){
        body.innerHTML = renderVersePickerBody();
        attachVersePickerHandlers();
        const rebound = document.getElementById('hostVerseRefInput');
        if(rebound){
          rebound.focus();
          rebound.setSelectionRange(rebound.value.length, rebound.value.length);
        }
      }
    });
    const presentBtn = document.getElementById('presentVerseBtn');
    if(presentBtn) presentBtn.addEventListener('click', function(){
      const found = parseVerseRef(hostVerseRefInput);
      if(found) withPreservedPageScroll(function(){ presentVerse(found.refLabel, found.text); });
    });
    document.querySelectorAll('[data-recent-verse-idx]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const room = state.room;
        const v = room && room.recentVerses && room.recentVerses[+btn.getAttribute('data-recent-verse-idx')];
        if(!v) return;
        // [2026-09-16] jump BROWSE to this verse's own chapter -- see
        // recentVerseBrowseLocation()'s own comment. A ref this app
        // can't parse back into a book/chapter (shouldn't happen, but
        // cheaper to just leave the browse view where it was than to
        // guess) is a silent no-op here, same as before this fix.
        const loc = recentVerseBrowseLocation(v.ref);
        if(loc){ hostVerseBrowseBook = loc.book; hostVerseBrowseChapter = loc.chapter; hostVerseMode = 'browse'; }
        withPreservedPageScroll(function(){ presentVerse(v.ref, v.text); });
      });
    });
    const presentSelectedBtn = document.getElementById('presentSelectedVersesBtn');
    if(presentSelectedBtn) presentSelectedBtn.addEventListener('click', function(){ withPreservedPageScroll(presentSelectedVerses); });
    const clearSelectionBtn = document.getElementById('clearVerseSelectionBtn');
    if(clearSelectionBtn) clearSelectionBtn.addEventListener('click', function(){
      hostVerseMultiSelect = []; hostVerseSelectMode = false;
      const body = document.getElementById('verseModeBody');
      if(body){ body.innerHTML = renderVersePickerBody(); attachVersePickerHandlers(); }
    });
    const browseBtn = document.getElementById('verseModeBrowseBtn');
    if(browseBtn) browseBtn.addEventListener('click', function(){
      hostVerseMode = 'browse';
      const body = document.getElementById('verseModeBody');
      const panel = browseBtn.closest('.session-card');
      if(panel){ panel.outerHTML = renderVersePicker(); attachVersePickerHandlers(); }
      else if(body){ body.innerHTML = renderVersePickerBody(); attachVersePickerHandlers(); }
    });
    const searchBtn = document.getElementById('verseModeSearchBtn');
    if(searchBtn) searchBtn.addEventListener('click', function(){
      hostVerseMode = 'search';
      const panel = searchBtn.closest('.session-card');
      if(panel){ panel.outerHTML = renderVersePicker(); attachVersePickerHandlers(); }
      const rebound = document.getElementById('hostVerseRefInput');
      if(rebound){ rebound.focus(); }
    });
    // Event delegation for the browse drill-down and search suggestions --
    // bound ONCE per real #verseModeBody element (dataset.wired guard,
    // [2026-09-15 lag/multi-select fix] -- see below), not per-button,
    // since the browse body's contents change shape (books -> chapters ->
    // verses) on every tap.
    //
    // Bug [2026-09-15] -- Jared: "It lags and it's difficult to pick
    // multiple verses." Every single interaction inside this picker
    // (typing a search ref, drilling into a book/chapter, presenting a
    // verse, and especially a Ctrl/Cmd-click multi-select toggle) re-runs
    // `body.innerHTML = renderVersePickerBody(); attachVersePickerHandlers();`
    // on this SAME #verseModeBody element -- `innerHTML` replaces its
    // CHILDREN, not the element itself, so this comment's own `addEventListener`
    // call below, with no wired guard, was piling one more duplicate click
    // listener onto that one persistent element every single time. Before
    // v41 (when presentVerse() closed the picker on every present) this
    // never had a chance to compound; v41 deliberately kept the picker
    // open across many interactions in a row, which is exactly what
    // exposed it. Concretely: click 1 fires 1 listener (1 toggle call,
    // attaches a 2nd); click 2 fires BOTH (2 toggle calls -- ON then OFF,
    // netting zero change, which is exactly "difficult to pick multiple
    // verses" -- every other click on a verse looked like it silently did
    // nothing); click 3 fires 3 (nets one flip, attaches a 4th); and so on,
    // with each fire also doing a full render+reattach, so the lag compounds
    // right alongside the miscounted toggles. Fixed the same way this exact
    // bug class was already fixed once before in this file (see bug #4 in
    // architecture-and-decisions.md, "Duplicate event-listener risk") --
    // a `dataset.wired` guard, so this listener attaches exactly once per
    // real element. A genuinely NEW #verseModeBody (built via
    // `panel.outerHTML = renderVersePicker()` when switching BROWSE/SEARCH
    // mode) has no `dataset.wired` yet, so it still gets its own listener
    // correctly.
    const body = document.getElementById('verseModeBody');
    if(body && !body.dataset.wired){
    body.dataset.wired = '1';
    body.addEventListener('click', function(e){
      const allBooksBtn = e.target.closest('[data-verse-browse-all-books]');
      if(allBooksBtn){ hostVerseBrowseBook = null; hostVerseBrowseChapter = null; body.innerHTML = renderVersePickerBody(); attachVersePickerHandlers(); return; }
      const bookBtn = e.target.closest('[data-verse-browse-book]');
      if(bookBtn){ hostVerseBrowseBook = bookBtn.getAttribute('data-verse-browse-book'); hostVerseBrowseChapter = null; body.innerHTML = renderVersePickerBody(); attachVersePickerHandlers(); return; }
      const chBtn = e.target.closest('[data-verse-browse-chapter]');
      if(chBtn){ hostVerseBrowseChapter = Number(chBtn.getAttribute('data-verse-browse-chapter')); body.innerHTML = renderVersePickerBody(); attachVersePickerHandlers(); return; }
      const navBtn = e.target.closest('[data-browse-chapter-nav]:not([disabled])');
      if(navBtn){ hostVerseBrowseChapter = Number(navBtn.getAttribute('data-browse-chapter-nav')); body.innerHTML = renderVersePickerBody(); attachVersePickerHandlers(); return; }
      // Redesign [2026-09-15] -- replaces the old Ctrl/Cmd-click check
      // (see hostVerseSelectMode's own comment): SELECT MULTIPLE VERSES
      // toggles this on/off instead, so multi-select needs no modifier key
      // and works the same on a phone as a desktop.
      const selectModeToggleBtn = e.target.closest('#verseSelectModeToggleBtn');
      if(selectModeToggleBtn){
        hostVerseSelectMode = !hostVerseSelectMode;
        body.innerHTML = renderVersePickerBody();
        attachVersePickerHandlers();
        return;
      }
      const verseBtn = e.target.closest('[data-present-browse-verse]');
      if(verseBtn){
        const entry = bibleVerseEntries(hostVerseBrowseBook, hostVerseBrowseChapter).find(function(v){ return v.verse === Number(verseBtn.getAttribute('data-present-browse-verse')); });
        if(!entry) return;
        const cleanText = cleanVerseText(entry.text);
        if(hostVerseSelectMode){
          // Multi-select [2026-09-15]: build a passage instead of presenting
          // immediately -- see toggleVerseMultiSelect()/presentSelectedVerses().
          withPreservedVerseListScroll(function(){
            toggleVerseMultiSelect(hostVerseBrowseBook, hostVerseBrowseChapter, entry.verse, cleanText);
            body.innerHTML = renderVersePickerBody();
            attachVersePickerHandlers();
          });
          return;
        }
        withPreservedVerseListScroll(function(){
          presentVerse(hostVerseBrowseBook+' '+hostVerseBrowseChapter+':'+entry.verse, cleanText);
        });
        return;
      }
      const suggestBookBtn = e.target.closest('[data-verse-suggest-book]');
      if(suggestBookBtn){
        hostVerseRefInput = suggestBookBtn.getAttribute('data-verse-suggest-book') + ' ';
        body.innerHTML = renderVersePickerBody();
        attachVersePickerHandlers();
        const rebound = document.getElementById('hostVerseRefInput');
        if(rebound){ rebound.focus(); rebound.setSelectionRange(rebound.value.length, rebound.value.length); }
        return;
      }
      const suggestVerseBtn = e.target.closest('[data-suggest-verse-book]');
      if(suggestVerseBtn){
        const b = suggestVerseBtn.getAttribute('data-suggest-verse-book');
        const c = Number(suggestVerseBtn.getAttribute('data-suggest-verse-chapter'));
        const v = Number(suggestVerseBtn.getAttribute('data-suggest-verse-verse'));
        const entry = bibleVerseEntries(b, c).find(function(x){ return x.verse === v; });
        if(entry) presentVerse(b+' '+c+':'+v, cleanVerseText(entry.text));
        return;
      }
    });
    }
  }

  // Fixed "Now Live" bar [reorganized 2026-09-04, round 2] -- Jared: "put
  // the 'now live' section as a non moving part somewhere... I still find
  // it hard to navigate because there's a lot of scrolling." Everything a
  // host needs to see-what's-live and advance it lives here now, pinned to
  // the bottom of the viewport (see hostNowLiveExpanded's comment above),
  // instead of inline in the scrolling page -- mirrors the "mini player"
  // pattern common to music/video apps (Spotify, Apple Music, YouTube's
  // sticky player): a compact always-visible status + PREV/NEXT row, with
  // a chevron that grows it upward to reveal the full lyric/verse/point
  // text and the quick section-jump chips. One function covers all three
  // content types so there's a single PREV/NEXT pair of ids/handlers
  // rather than three parallel ones (prevSectionBtn/prevSlideBtn/...).
  // Next-up preview [2026-09-04] -- Jared: "a host glances ahead before
  // advancing." Verses never have a "next" (a presented verse is always
  // just the one passage), so this only ever returns something for a song
  // section or a sermon slide, and only when there IS one more to come.
  function nextItemLabel(content, isSermon, isVerse){
    if(isVerse) return null;
    if(isSermon){
      if(!content.slide) return null;
      const nextIdx = content.slideIndex + 1;
      if(nextIdx >= content.slides.length) return null;
      return (nextIdx+1) + '. ' + slideShortLabel(content.slides[nextIdx], nextIdx);
    }
    // Media/AVP [2026-09-06]: only a 'slideshow' has a "next slide" at all --
    // an image/video/embed is presented as a single, whole thing.
    if(content.type === 'media'){
      if(!content.media || content.media.type !== 'slideshow') return null;
      const nextIdx = content.slideIndex + 1;
      if(nextIdx >= content.slides.length) return null;
      return 'Slide ' + (nextIdx+1);
    }
    if(!content.song) return null;
    const sections = songSectionsForPresenting(content.song);
    const nextIdx = content.sectionIndex + 1;
    if(nextIdx >= sections.length) return null;
    return sections[nextIdx].label;
  }

  // Short, single-line summary of a content object for the read-only LIVE
  // readout inside renderPreviewBar() -- deliberately much plainer than the
  // interactive statusText built below (no nav, no jump chips, just "here's
  // what the congregation is actually looking at right now").
  function liveStatusSummary(content){
    // Stage overrides [2026-09-24]: a plain-language readout so the "LIVE
    // NOW" line never falsely reads "Nothing presented yet" while the
    // screen is actually just cut away to black/the logo/the default bg --
    // see resolveLiveDisplayContent()'s comment.
    if(content.type === 'stage-override') return content.mode==='black' ? 'Black screen' : content.mode==='logo' ? 'Logo screen' : 'Default background';
    if(content.type === 'sermon') return content.slide ? ((content.sermon?escapeHtml(content.sermon.title)+' &middot; ':'')+'Slide '+(content.slideIndex+1)+' of '+content.slides.length) : 'Nothing presented yet';
    if(content.type === 'verse') return content.verseText ? escapeHtml(content.verseRef) : 'Nothing presented yet';
    if(content.type === 'media') return content.media ? (escapeHtml(content.media.title)+(content.media.type==='slideshow'?(' &middot; Slide '+(content.slideIndex+1)+' of '+content.slides.length):'')) : 'Nothing presented yet';
    return content.song ? (escapeHtml(content.song.title)+' &middot; Section '+(content.sectionIndex+1)+' of '+songSectionsForPresenting(content.song).length) : 'Nothing presented yet';
  }

  // Preview/Go Live [2026-09-06] -- Jared: "I think it's better if we have a
  // preview and a live view, then if the host is good with the preview, he
  // can [click] on go live." This fixed bottom bar used to double as BOTH
  // the display of what's live AND the controls that changed it instantly
  // -- tapping PREV/NEXT or a jump chip went out to the whole congregation
  // immediately. It's now the STAGING area instead: everything interactive
  // here (statusText, PREV/NEXT, the expanded slide-card, the jump chips)
  // reads and writes `previewContent`/hostPreview, not the room -- nothing
  // the congregation sees changes until GO LIVE is tapped (or double-Enter
  // on a keyboard, see the keydown listener near the projector's own
  // shortcut). `liveContent` is only ever read here, for the small
  // read-only "LIVE NOW" line in the expanded body, so a host always has a
  // one-glance answer to "wait, what's actually showing right now" without
  // needing split screen open. `dirty` (see previewIsDirty()) gates the GO
  // LIVE button -- nothing to publish when the preview already matches what's live.
  function renderPreviewBar(previewContent, isPreviewSermon, isPreviewVerse, isPreviewMedia, room, hideSlidePreview, iHaveControl, liveContent, dirty){
    const content = previewContent, isSermon = isPreviewSermon, isVerse = isPreviewVerse, isMedia = isPreviewMedia;
    let typeIcon = 'book', statusText, canPrev = false, canNext = false, expandedBody = '';
    if(isSermon){
      typeIcon = 'mic';
      if(content.slide){
        statusText = (content.sermon ? escapeHtml(content.sermon.title)+' &middot; ' : '') + 'Slide '+(content.slideIndex+1)+' of '+content.slides.length;
        canPrev = iHaveControl && content.slideIndex > 0;
        canNext = iHaveControl && content.slideIndex < content.slides.length - 1;
        expandedBody =
          (hideSlidePreview ? '' : ('<div class="slide-card"'+(isBlocksSlide(content.slide)?' style="padding:0;overflow:hidden;"':'')+'>' + (isBlocksSlide(content.slide) ? renderSlideCanvas(content.slide,'card') : sermonLinesAsCardHtml(content.slide)) + '</div>')) +
          '<div class="now-live-jump-row">' +
            content.slides.map(function(sl,i){
              return '<button class="section-jump '+(i===content.slideIndex?'active':'')+'" data-jump-slide="'+i+'">'+(i+1)+'. '+slideShortLabel(sl, i)+'</button>';
            }).join('') +
          '</div>' +
          (nextItemLabel(content, isSermon, isVerse) ? ('<p class="hint" style="text-align:center;margin:2px 0 10px;">Up next: <strong>'+escapeHtml(nextItemLabel(content, isSermon, isVerse))+'</strong></p>') : '') +
          '<p style="text-align:center;"><button type="button" class="switch-account" id="backToSongsBtn">SWITCH BACK TO SONGS</button></p>';
      } else {
        statusText = 'Pick a sermon above to begin presenting';
      }
    } else if(isVerse){
      typeIcon = 'tag';
      if(content.verseText){
        statusText = escapeHtml(content.verseRef);
        expandedBody =
          (hideSlidePreview ? '' : ('<div class="slide-card">' + sermonLinesAsCardHtml(verseAsSlide(content.verseRef, content.verseText, content.verseSegments)) + '</div>')) +
          '<p style="text-align:center;"><button type="button" class="switch-account" id="backToSongsBtn">SWITCH BACK TO SONGS</button></p>';
      } else {
        statusText = 'Look up a verse above to begin presenting';
      }
    } else if(isMedia){
      typeIcon = mediaTypeIcon(content.media);
      if(content.media){
        statusText = escapeHtml(content.media.title) + (content.media.type==='slideshow' ? (' &middot; Slide '+(content.slideIndex+1)+' of '+content.slides.length) : '');
        if(content.media.type==='slideshow'){
          canPrev = iHaveControl && content.slideIndex > 0;
          canNext = iHaveControl && content.slideIndex < content.slides.length - 1;
        }
        const preview = hideSlidePreview ? '' : (
          content.media.type==='image' ? ('<div class="slide-card" style="padding:0;overflow:hidden;"><img src="'+escapeAttr(content.media.url)+'" style="display:block;width:100%;max-height:220px;object-fit:contain;background:#000;" alt=""></div>') :
          content.media.type==='slideshow' ? ('<div class="slide-card" style="padding:0;overflow:hidden;"><img src="'+escapeAttr((content.slides[content.slideIndex]||{}).url||'')+'" style="display:block;width:100%;max-height:220px;object-fit:contain;background:#000;" alt=""></div>') :
          content.media.type==='video' ? ('<div class="slide-card" style="text-align:center;"><p class="hint" style="margin:0;">VIDEO &mdash; '+escapeHtml(content.media.title)+'</p></div>') :
          ('<div class="slide-card" style="text-align:center;"><p class="hint" style="margin:0;">'+escapeHtml(content.media.embedProvider||'EMBED')+' &mdash; slide navigation happens inside the embed itself once live.</p></div>')
        );
        expandedBody = preview +
          (content.media.type==='slideshow' ? (
            '<div class="now-live-jump-row">' +
              content.slides.map(function(sl,i){ return '<button class="section-jump '+(i===content.slideIndex?'active':'')+'" data-jump-media-slide="'+i+'">'+(i+1)+'</button>'; }).join('') +
            '</div>'
          ) : '') +
          (nextItemLabel(content, isSermon, isVerse) ? ('<p class="hint" style="text-align:center;margin:2px 0 10px;">Up next: <strong>'+escapeHtml(nextItemLabel(content, isSermon, isVerse))+'</strong></p>') : '') +
          '<p style="text-align:center;"><button type="button" class="switch-account" id="backToSongsBtn">SWITCH BACK TO SONGS</button></p>';
      } else {
        statusText = 'Pick media above to begin presenting';
      }
    } else {
      if(content.song){
        const presentSections = songSectionsForPresenting(content.song);
        statusText = escapeHtml(content.song.title)+' &middot; Section '+(content.sectionIndex+1)+' of '+presentSections.length;
        canPrev = iHaveControl && content.sectionIndex > 0;
        canNext = iHaveControl && content.sectionIndex < presentSections.length - 1;
        expandedBody =
          (hideSlidePreview ? '' : (
            '<div class="slide-card">' +
              '<p class="section-label uc type-'+content.section.type+'">'+content.section.label+'</p>' +
              content.section.lines.map(function(l){ return '<p class="lyric-line">'+escapeHtml(l.replace(/\[[^\]]*\]/g,''))+'</p>'; }).join('') +
            '</div>'
          )) +
          '<div class="now-live-jump-row">' +
            presentSections.map(function(sec,i){
              return '<button class="section-jump '+(i===content.sectionIndex?'active':'')+'" data-jump="'+i+'">'+(sec.type==='title'?'TITLE':sec.label)+'</button>';
            }).join('') +
          '</div>' +
          (nextItemLabel(content, isSermon, isVerse) ? ('<p class="hint" style="text-align:center;margin:10px 0 0;">Up next: <strong>'+escapeHtml(nextItemLabel(content, isSermon, isVerse))+'</strong></p>') : '');
      } else {
        statusText = 'Choose a song, sermon, or verse below to begin';
      }
    }
    const showNav = (!isSermon && !isVerse && !isMedia && content.song) || (isSermon && content.slide) || (isMedia && content.media && content.media.type==='slideshow');
    const canExpand = !!expandedBody;
    // Media/AVP [2026-09-06]: video transport (PLAY/PAUSE/RESTART) controls
    // the thing that's actually LIVE right now, not the staged preview above
    // -- see mediaPlayPause()/mediaRestart()'s own comment for why these are
    // direct room writes rather than routed through hostPreview/GO LIVE.
    // Only shown once a video is genuinely live (liveContent, not content).
    const liveIsVideo = liveContent.type==='media' && liveContent.media && liveContent.media.type==='video';
    return '<div class="now-live-bar" id="nowLiveBar">' +
      // Controls-panel indicator [2026-09-07]: see .now-live-bar-label's own
      // comment in styles.css for why this exists -- always visible (not
      // gated on hostNowLiveExpanded), since the collapsed strip is the one
      // most often on screen.
      '<div class="now-live-bar-label">Your Controls &mdash; staged here, not yet visible to the room</div>' +
      // Presenter keyboard shortcuts [2026-09-08] -- Jared: "add other
      // keyboard shortcuts for other buttons in the presenter controls.
      // Indicate them as well in the interface." One line naming every
      // shortcut this screen answers to, right under the label above that
      // already exists for the same "make it unmistakable this is an
      // interactive panel" reason -- see the individual keydown listeners
      // below for what each key actually does, and .shortcuts-legend in
      // styles.css for why this is hidden on touch-only devices.
      '<div class="shortcuts-legend">' +
        '<kbd>&larr;</kbd><kbd>&rarr;</kbd> stage &nbsp;&middot;&nbsp; ' +
        '<kbd>Space</kbd><kbd>Space</kbd> or <kbd>Enter</kbd><kbd>Enter</kbd> go live &nbsp;&middot;&nbsp; ' +
        '<kbd>1</kbd>&ndash;<kbd>4</kbd> switch tabs &nbsp;&middot;&nbsp; ' +
        '<kbd>P</kbd>rojector &nbsp;&middot;&nbsp; <kbd>F</kbd>ullscreen projector &nbsp;&middot;&nbsp; <kbd>S</kbd>plit screen &nbsp;&middot;&nbsp; <kbd>C</kbd>hat' +
        (isRoomOwner(room) ? ' &nbsp;&middot;&nbsp; <kbd>H</kbd>osts' : '') +
        ' &nbsp;&middot;&nbsp; chart <kbd>L</kbd>ink' +
      '</div>' +
      (hostNowLiveExpanded && canExpand ? ('<div class="now-live-expanded-body">' +
        '<p class="hint live-readout"><span class="live-dot"></span>LIVE NOW: '+liveStatusSummary(liveContent)+
          (liveIsVideo && iHaveControl ? (
            '<span style="margin-left:10px;display:inline-flex;gap:6px;vertical-align:middle;">' +
              '<button type="button" class="icon-btn-sm" id="mediaPlayPauseBtn" aria-label="'+(liveContent.mediaPlaying?'Pause':'Play')+'" style="width:auto;padding:0 8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">'+icon(liveContent.mediaPlaying?'pause':'play')+'</svg></button>' +
              '<button type="button" class="icon-btn-sm" id="mediaRestartBtn" aria-label="Restart from the beginning" style="width:auto;padding:0 8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">'+icon('restart')+'</svg></button>' +
            '</span>'
          ) : '') +
        '</p>' +
        expandedBody + '</div>') : '') +
      '<div class="now-live-row">' +
        (canExpand ?
          ('<button type="button" class="now-live-expand-toggle" id="nowLiveExpandToggle" aria-label="'+(hostNowLiveExpanded?'Collapse preview panel':'Expand preview panel')+'">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate('+(hostNowLiveExpanded?'-90':'90')+'deg);">'+icon('chevron')+'</svg>' +
          '</button>') : '') +
        // Double-click to GO LIVE [2026-09-07] -- Jared: "add an option to
        // do double click as well for going live aside from double enter."
        // Wired on this status area specifically (see the dblclick listener
        // near the other preview-bar handlers) rather than the whole bar,
        // so it can never fire from a double-click on PREV/NEXT/GO LIVE
        // itself, which already have their own single-click actions.
        '<div class="now-live-status" id="nowLiveStatusRow" title="Double-click to go live (or double-tap Enter or Space on a keyboard)">' +
          (dirty ? '<span class="preview-tag">PREVIEW</span>' : '') +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon(typeIcon)+'</svg><span>'+statusText+'</span>' +
        '</div>' +
        (showNav ? (
          '<button type="button" class="now-live-nav-btn" id="nowLivePrevBtn" aria-label="Previous" '+(canPrev?'':'disabled')+'><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg></button>' +
          '<button type="button" class="now-live-nav-btn primary" id="nowLiveNextBtn" aria-label="Next" '+(canNext?'':'disabled')+'><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('chevron')+'</svg></button>'
        ) : '') +
        (iHaveControl ? (
          '<button type="button" class="go-live-btn" id="goLiveBtn" aria-label="Go live with the preview above" '+(dirty?'':'disabled')+'><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('bolt')+'</svg><span>GO LIVE</span></button>'
        ) : '') +
      '</div>' +
    '</div>';
  }

  // Co-hosting [2026-09-05] -- Jared: "hosts can assign other hosts to their
  // session and grant controls to one person at a time." Room-doc additions:
  // coHostUids (the owner-managed roster) and controllerUid (which ONE of
  // {hostUid, ...coHostUids} is actually driving right now -- see
  // isRoomOwner()/canControlRoom() up near hasFullAccess(), createRoom()'s
  // defaults, and firestore.rules' rooms/{code} update rule for how
  // controllerUid is protected from being rewritten by anyone but the
  // owner). This whole panel mirrors renderSermonSharePanel()/
  // renderSermonShareResults()/bindSermonShareButtons() up above almost
  // exactly -- same state.directory search-by-name/church/uid, same
  // setlist-items list markup -- just granting session-control instead of
  // sermon read access, and with a second action (GIVE CONTROL) per row.
  function controllerDisplayName(room){
    if(!room) return 'Someone else';
    const uid = room.controllerUid || room.hostUid;
    if(uid === room.hostUid) return room.hostName || 'The host';
    const person = state.directory.find(function(d){ return d.uid===uid; });
    return person ? (person.displayName || '(no name set)') : 'Another host';
  }
  function renderHostManageResults(room, query){
    const raw = query.trim();
    if(!raw) return '';
    const q = raw.toLowerCase();
    const coHosts = room.coHostUids || [];
    const matches = state.directory.filter(function(u){
      if(u.uid === room.hostUid || coHosts.includes(u.uid)) return false; // already listed above
      return u.uid === raw || (u.displayName||'').toLowerCase().includes(q) || (u.churchName||'').toLowerCase().includes(q);
    }).slice(0,8);
    if(!matches.length) return '<p class="hint">No matching accounts &mdash; try their exact Account ID.</p>';
    return '<ul class="setlist-items">' + matches.map(function(u){
      return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(u.displayName||'(no name set)')+
        (u.churchName ? ' <span class="hint">&middot; '+escapeHtml(u.churchName)+'</span>' : '') + '</span>' +
        '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-add-cohost="'+escapeAttr(u.uid)+'" aria-label="Add as co-host" style="width:auto;padding:0 8px;">ADD</button></span></li>';
    }).join('') + '</ul>';
  }
  function renderHostManagePanel(room){
    const coHosts = room.coHostUids || [];
    const controllerUid = room.controllerUid || room.hostUid;
    return '<div class="session-card">' +
      '<p class="control-label uc" style="margin-bottom:10px;">Manage Hosts</p>' +
      '<p class="hint" style="margin:0 0 14px;">Add anyone signed in as a co-host, then hand them control to run the presentation -- only one person drives at a time.</p>' +
      '<ul class="setlist-items">' +
        '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(room.hostName||'You')+' <span class="hint">&middot; Owner</span></span>' +
          '<span class="setlist-controls">' +
            (controllerUid === room.hostUid ?
              '<span class="hint uc">HAS CONTROL</span>' :
              '<button type="button" class="icon-btn-sm" data-give-control="'+escapeAttr(room.hostUid)+'" style="width:auto;padding:0 8px;">TAKE BACK CONTROL</button>') +
          '</span></li>' +
        coHosts.map(function(uid){
          const person = state.directory.find(function(d){ return d.uid===uid; });
          const name = person ? (person.displayName||'(no name set)') : uid;
          return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(name)+
              (person && person.churchName ? ' <span class="hint">&middot; '+escapeHtml(person.churchName)+'</span>' : '') + '</span>' +
            '<span class="setlist-controls">' +
              (controllerUid === uid ?
                '<span class="hint uc">HAS CONTROL</span>' :
                '<button type="button" class="icon-btn-sm" data-give-control="'+escapeAttr(uid)+'" style="width:auto;padding:0 8px;">GIVE CONTROL</button>') +
              '<button type="button" class="icon-btn-sm" data-remove-cohost="'+escapeAttr(uid)+'" aria-label="Remove co-host" style="width:auto;padding:0 8px;">&times;</button>' +
            '</span></li>';
        }).join('') +
      '</ul>' +
      '<div class="field" style="margin-top:10px;"><label for="hostManageSearch">ADD A CO-HOST &mdash; FIND BY ACCOUNT ID, NAME, OR CHURCH</label>' +
        '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="hostManageSearch" placeholder="Search&hellip;" value="'+escapeAttr(hostManageQuery)+'" autocomplete="off"></div>' +
      '</div>' +
      '<div id="hostManageResults">' + renderHostManageResults(room, hostManageQuery) + '</div>' +
    '</div>';
  }
  function attachHostManageHandlers(){
    // Defensive -- the panel these buttons live in is only ever rendered
    // for the owner (see renderSessionHost()'s iAmOwner check), and
    // firestore.rules would reject any of these writes from anyone else
    // anyway. This just avoids wiring dead buttons for a co-host who
    // somehow ended up with hostManageOpen set.
    if(!isRoomOwner(state.room)) return;
    function giveControl(uid){
      updateRoom(state.activeRoomCode, { controllerUid: uid })
        .then(function(){ showToast('Control handed off.'); })
        .catch(function(){ showToast('Could not update control. Try again.'); });
    }
    document.querySelectorAll('[data-give-control]').forEach(function(btn){
      btn.addEventListener('click', function(){ giveControl(btn.getAttribute('data-give-control')); });
    });
    document.querySelectorAll('[data-add-cohost]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const uid = btn.getAttribute('data-add-cohost');
        const room = state.room;
        if(!room) return;
        const next = (room.coHostUids||[]).filter(function(x){ return x!==uid; }).concat([uid]);
        btn.disabled = true;
        updateRoom(state.activeRoomCode, { coHostUids: next })
          .then(function(){ showToast('Added as co-host.'); })
          .catch(function(){ showToast('Could not add that co-host. Try again.'); });
      });
    });
    document.querySelectorAll('[data-remove-cohost]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const uid = btn.getAttribute('data-remove-cohost');
        const room = state.room;
        if(!room) return;
        const next = (room.coHostUids||[]).filter(function(x){ return x!==uid; });
        // If the person being removed currently holds control, control
        // reverts to the owner -- a co-host who's been taken off the roster
        // shouldn't keep driving the presentation.
        const patch = { coHostUids: next };
        if(room.controllerUid === uid) patch.controllerUid = room.hostUid;
        updateRoom(state.activeRoomCode, patch)
          .then(function(){ showToast('Removed.'); })
          .catch(function(){ showToast('Could not remove that co-host. Try again.'); });
      });
    });
    const searchEl = document.getElementById('hostManageSearch');
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      searchEl.addEventListener('input', function(e){
        hostManageQuery = e.target.value;
        const holder = document.getElementById('hostManageResults');
        const room = state.room;
        if(holder && room) holder.innerHTML = renderHostManageResults(room, hostManageQuery);
        document.querySelectorAll('[data-add-cohost]').forEach(function(btn){
          btn.addEventListener('click', function(){
            const uid = btn.getAttribute('data-add-cohost');
            const r = state.room;
            if(!r) return;
            const next = (r.coHostUids||[]).filter(function(x){ return x!==uid; }).concat([uid]);
            btn.disabled = true;
            updateRoom(state.activeRoomCode, { coHostUids: next })
              .then(function(){ showToast('Added as co-host.'); })
              .catch(function(){ showToast('Could not add that co-host. Try again.'); });
          });
        });
      });
    }
  }

  // Livestream link [2026-09-24] -- see hostStreamLinkOpen's own comment
  // above. Deliberately not gated to the room owner the way Manage Hosts
  // is (renderHostManagePanel()) -- whoever currently has control
  // (iHaveControl, same gate the stage-override buttons use) can set or
  // clear it, since a co-host running AVP is exactly the kind of person
  // who'd need to paste this in mid-service.
  function renderStreamLinkPanel(room){
    const current = room.livestreamUrl || '';
    return '<div class="session-card">' +
      '<p class="control-label uc" style="margin-bottom:10px;">Livestream Link</p>' +
      '<p class="hint" style="margin:0 0 14px;">Paste your church&rsquo;s Facebook or YouTube Live link. It shows as a pinned banner at the top of chat so joiners can find and open it.</p>' +
      (current ? ('<p class="hint" style="margin:0 0 10px;word-break:break-all;">Currently set: '+escapeHtml(current)+'</p>') : '') +
      '<div class="field"><label for="streamLinkInput">LIVESTREAM URL</label>' +
        '<input type="url" id="streamLinkInput" placeholder="https://facebook.com/yourchurch/live" value="'+escapeAttr(hostStreamLinkInput)+'" autocomplete="off"></div>' +
      '<div style="display:flex;gap:10px;margin-top:10px;">' +
        '<button type="button" class="btn btn-primary" id="streamLinkSaveBtn" style="flex:1;">SAVE</button>' +
        (current ? '<button type="button" class="btn btn-ghost" id="streamLinkClearBtn" style="flex:1;">CLEAR</button>' : '') +
      '</div>' +
    '</div>';
  }
  function attachStreamLinkHandlers(){
    const input = document.getElementById('streamLinkInput');
    if(input) input.addEventListener('input', function(e){ hostStreamLinkInput = e.target.value; });
    const saveBtn = document.getElementById('streamLinkSaveBtn');
    if(saveBtn) saveBtn.addEventListener('click', function(){
      const room = state.room;
      if(!room || !canControlRoom(room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
      const url = hostStreamLinkInput.trim();
      if(!url){ showToast('Paste a link first.'); return; }
      updateRoom(state.activeRoomCode, { livestreamUrl: url })
        .then(function(){ showToast('Livestream link pinned to chat.'); hostStreamLinkInput = ''; render(); })
        .catch(function(){ showToast('Could not save that link. Try again.'); });
    });
    const clearBtn = document.getElementById('streamLinkClearBtn');
    if(clearBtn) clearBtn.addEventListener('click', function(){
      const room = state.room;
      if(!room || !canControlRoom(room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
      updateRoom(state.activeRoomCode, { livestreamUrl: null })
        .then(function(){ showToast('Livestream link removed.'); render(); })
        .catch(function(){ showToast('Could not remove that link. Try again.'); });
    });
  }

  // Join QR code [2026-09-24] -- Jared: "QR code: that's a yes for me,
  // make that work please." Encodes the exact same '?join=<code>' deep
  // link goToJoinScreenWithCode()/the startup routing block already
  // handle (same URL shape as the '?stage='/'?chart=' links just above),
  // so this needed zero backend or routing changes -- scanning it just
  // opens the app straight into the join flow with the code pre-filled.
  // Uses the vendored qrcode-generator library (see content/qrcode.js).
  // Error-correction level 'M' (default used by most QR generators) and
  // typeNumber 0 (auto-picks the smallest size that fits the data) keep
  // this readable at the small size it'll usually be shown/printed at.
  // Wrapped in a plain white card so it stays scannable in dark theme.
  function renderJoinQrSvg(code){
    const url = window.location.origin + window.location.pathname + '?join=' + encodeURIComponent(code);
    try {
      const qr = qrcodeGen(0, 'M');
      qr.addData(url);
      qr.make();
      const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      return '<div class="join-qr-wrap"><div class="join-qr-card">'+svg+'</div><p class="join-qr-caption">Scan to join</p></div>';
    } catch(e) {
      return ''; // never let a QR-generation hiccup break the room-code screen
    }
  }

  function renderSessionHost(){
    const code = state.activeRoomCode;
    const room = state.room;
    if(!room){
      main.innerHTML = '<p style="text-align:center;color:var(--ink-soft);padding:60px 20px;">'+(state.roomLoading ? 'Connecting&hellip;' : 'Session not found.')+'</p>';
      return;
    }
    const content = resolveLiveDisplayContent(room); // TRUE LIVE content (or a stage override) -- what the congregation/projector currently sees
    const isSermon = content.type === 'sermon';
    const isVerse = content.type === 'verse';
    const isMedia = content.type === 'media';
    // Preview/Go Live [2026-09-06] -- see resolvePreviewContent()/goLive()
    // above. previewContent is what the host is actively staging (mirrors
    // live, `content` above, until they pick/nav something); previewDirty
    // says whether it's actually diverged from live yet, gating the GO LIVE
    // button (see renderPreviewBar()).
    const previewContent = resolvePreviewContent(room);
    const isPreviewSermon = previewContent.type === 'sermon';
    const isPreviewVerse = previewContent.type === 'verse';
    const isPreviewMedia = previewContent.type === 'media';
    // hostPreview null (nothing staged at all) always means "not dirty" --
    // previewIsDirty() alone can't tell that case apart from a genuinely
    // empty live+preview (e.g. a fresh room with nothing presented yet,
    // where content.song/previewContent.song are BOTH null but every field
    // still technically "differs" by its own naive check).
    const previewDirty = hostPreview !== null && previewIsDirty(previewContent, content);
    // Tab-highlight fix [2026-09-06] -- see hostContentTab's declaration
    // above. uiIsSermon/uiIsVerse/uiIsMedia drive the segmented control's
    // highlight and which panel (picker vs. setlist) shows; isSermon/
    // isVerse/isMedia (just above) still drive everything about what's
    // actually LIVE (the split-screen stage mirror, the LIVE readout) --
    // those two only match once a tab's content has actually gone live via
    // GO LIVE.
    if(hostContentTab === null) hostContentTab = isSermon ? 'sermon' : (isVerse ? 'verse' : (isMedia ? 'media' : 'song'));
    const uiIsSermon = hostContentTab === 'sermon';
    const uiIsVerse = hostContentTab === 'verse';
    const uiIsMedia = hostContentTab === 'media';
    // Co-hosting [2026-09-05] -- see isRoomOwner()/canControlRoom() above.
    // iAmOwner gates roster management (add/remove co-hosts, reassign
    // control) and ending the session outright; iHaveControl gates actually
    // running the presentation (picking/advancing content), and is true for
    // the owner too whenever they haven't handed control away.
    const iAmOwner = isRoomOwner(room);
    const iHaveControl = canControlRoom(room);
    if(!iAmOwner && hostManageOpen) hostManageOpen = false; // defensive -- only the owner's toolbar button can open this

    // Content-source picker [2026-09-04, reorganized 2026-09-04] -- "with
    // the songs broadcast as well" (Jared) means a host switches between
    // presenting a song, a sermon, or an ad hoc Bible verse from the same
    // screen, not separate hosting flows. Picking a song (chooseSong())
    // always switches back to 'song' content type too, so tapping SONGS is
    // a reliable way back even without the dedicated "SWITCH BACK TO SONGS"
    // link below. Rendered as one connected segmented control (a single
    // mutually-exclusive picker, per the standard iOS/Android tab-bar
    // pattern) rather than three same-weight full-size buttons. What's
    // actually live no longer needs echoing here at all -- the fixed Now
    // Live bar (see renderPreviewBar() above) always shows it.
    const pickerRow =
      '<div class="content-segmented">' +
        '<button class="segment-btn'+(!uiIsSermon && !uiIsVerse && !uiIsMedia?' active':'')+'" id="pickSongBtn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg><span>SONGS</span><kbd class="kbd-hint">1</kbd>' +
        '</button>' +
        '<button class="segment-btn'+(uiIsSermon?' active':'')+'" id="pickSermonBtn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('mic')+'</svg><span>SERMON</span><kbd class="kbd-hint">2</kbd>' +
        '</button>' +
        '<button class="segment-btn'+(uiIsVerse?' active':'')+'" id="pickVerseBtn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('tag')+'</svg><span>BIBLE</span><kbd class="kbd-hint">3</kbd>' +
        '</button>' +
        '<button class="segment-btn'+(uiIsMedia?' active':'')+'" id="pickMediaBtn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('image')+'</svg><span>MEDIA</span><kbd class="kbd-hint">4</kbd>' +
        '</button>' +
      '</div>';

    // Everything in the normal SCROLLING page -- built as its own string so
    // it can be wrapped in the split-screen two-column grid without
    // duplicating any of it. The live preview/nav and chat both moved out
    // of here entirely (see renderPreviewBar() and the chat FAB/panel in
    // main.innerHTML below) -- this is now just "pick what to present" plus
    // the setlist and End Session.
    const controlsHtml =
      (hostManageOpen ? renderHostManagePanel(room) : '') +
      (hostStreamLinkOpen ? renderStreamLinkPanel(room) : '') +
      (!iHaveControl ?
        ('<div class="session-card" style="border-color:var(--ink-soft);">' +
          '<p class="control-label uc" style="margin-bottom:6px;">Watch-only for now</p>' +
          '<p class="hint" style="margin:0;">'+escapeHtml(controllerDisplayName(room))+' currently has control of this session &mdash; the owner can hand it to you from Manage Hosts.</p>' +
        '</div>') : '') +
      pickerRow +
      (hostPickerOpen ? renderHostPicker() : '') +
      (hostSermonPickerOpen ? renderSermonPicker() : '') +
      (hostVersePickerOpen ? renderVersePicker() : '') +
      (hostMediaPickerOpen ? renderMediaPicker() : '') +
      (!uiIsSermon && !uiIsVerse && !uiIsMedia ? renderSetlistSection(room) : '') +

      (!iAmOwner ? '' : (hostConfirmEnd ?
        ('<div class="confirm-row"><span>End this session for everyone?</span>' +
          '<button class="btn btn-primary" id="confirmEndBtn">YES, END SESSION</button>' +
          '<button class="btn btn-ghost" id="cancelEndBtn">CANCEL</button></div>')
        : '<button class="btn btn-ghost btn-block" id="endSessionBtn" style="margin-top:28px;">END SESSION</button>'));

    // Presenter toolbar [2026-09-04, reorganized 2026-09-04 x2]: secondary,
    // less-frequently-tapped tools -- a compact icon-first row (Zoom/Meet-
    // style control bar). PROJECTOR VIEW opens a new tab/window at
    // ?stage=<code> (see the startup-routing block near the bottom of this
    // file, just above the final render() call) meant for a second
    // monitor/projector; SPLIT SCREEN toggles an in-page two-column layout
    // (falls back to stacked on narrow viewports -- see .host-split-grid in
    // styles.css). CHAT was removed from here (round 2 of the reorg) now
    // that it's a floating widget with its own always-visible FAB -- see
    // main.innerHTML below. COPY MUSICIAN CHART LINK (2026-09-04) is meant
    // to be handed to OTHER people -- band members on their own devices/
    // stands -- so it copies to the clipboard rather than opening a tab
    // here, same pattern as the sermon share panel's "COPY LINK". Whether
    // it actually shows chords once opened depends on the person who opens
    // it having Play Mode access on their OWN account (see
    // renderSessionChart()) -- this button doesn't and can't grant that, it
    // just hands out the link.
    const presenterToolbar =
      '<div class="presenter-toolbar">' +
        '<button type="button" class="icon-tool-btn" id="openStageBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('monitor')+'</svg><span>PROJECTOR</span><kbd class="icon-tool-kbd">P</kbd></button>' +
        '<button type="button" class="icon-tool-btn'+(presenterSplitView?' active':'')+'" id="toggleSplitBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon(presenterSplitView?'compress':'expand')+'</svg><span>'+(presenterSplitView?'EXIT SPLIT':'SPLIT SCREEN')+'</span><kbd class="icon-tool-kbd">S</kbd></button>' +
        // Projector text size -- see hostStageFontScale's own comment
        // (near SPLIT_VIEW_KEY). Not a toggle like its neighbors, so it's
        // its own small control rather than an icon-tool-btn: a live
        // percentage readout plus -/+ steppers, clamped at
        // STAGE_FONT_SCALE_MIN/MAX (so the buttons visibly stop doing
        // anything rather than just silently capping).
        '<div class="icon-tool-btn stage-font-control" aria-label="Projector text size">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('monitor')+'</svg>' +
          '<span>TEXT SIZE</span>' +
          '<span class="stage-font-steppers">' +
            '<button type="button" class="stage-font-step-btn" id="stageFontDownBtn" aria-label="Decrease projector text size" title="Decrease projector text size">&minus;</button>' +
            '<span class="stage-font-pct">'+Math.round(hostStageFontScale*100)+'%</span>' +
            '<button type="button" class="stage-font-step-btn" id="stageFontUpBtn" aria-label="Increase projector text size" title="Increase projector text size">&plus;</button>' +
          '</span>' +
        '</div>' +
        '<button type="button" class="icon-tool-btn" id="copyChartLinkBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('tag')+'</svg><span>CHART LINK</span><kbd class="icon-tool-kbd">L</kbd></button>' +
        // Livestream link [2026-09-24] -- see hostStreamLinkOpen's own
        // comment above. Gated to iHaveControl, same as the stage-override
        // buttons just below -- setting/clearing this is a live-session
        // control, not a roster-management action like HOSTS.
        (iHaveControl ? ('<button type="button" class="icon-tool-btn'+(hostStreamLinkOpen?' active':'')+'" id="streamLinkBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('link')+'</svg><span>STREAM LINK</span><kbd class="icon-tool-kbd">K</kbd></button>') : '') +
        // Stage overrides [2026-09-24] -- Jared: "I also don't see the
        // background logo, black, or option to add background." Three
        // toggle buttons, same on/off-by-clicking-again convention as
        // SPLIT SCREEN above: tapping an inactive one writes that mode to
        // room.stageOverride (instantly cutting away from whatever's live,
        // see resolveRoomContent()'s comment), tapping the already-active
        // one clears it back to null (instantly back to normal live
        // content) -- see the data-stage-override click handler below.
        // Gated to iHaveControl, same as every other room-writing action on
        // this screen (goLive(), changeSection(), etc.) -- a watch-only
        // co-host shouldn't be able to blackout the screen out from under
        // whoever actually has control.
        (iHaveControl ? (
          '<button type="button" class="icon-tool-btn'+(room.stageOverride==='black'?' active':'')+'" id="stageBlackBtn" data-stage-override="black"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('blackout')+'</svg><span>BLACK</span><kbd class="icon-tool-kbd">B</kbd></button>' +
          '<button type="button" class="icon-tool-btn'+(room.stageOverride==='logo'?' active':'')+'" id="stageLogoOverrideBtn" data-stage-override="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('image')+'</svg><span>LOGO</span><kbd class="icon-tool-kbd">G</kbd></button>' +
          '<button type="button" class="icon-tool-btn'+(room.stageOverride==='default-bg'?' active':'')+'" id="stageDefaultBgBtn" data-stage-override="default-bg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('layers')+'</svg><span>DEFAULT BG</span><kbd class="icon-tool-kbd">D</kbd></button>'
        ) : '') +
        // Co-hosting [2026-09-05]: owner-only -- manages coHostUids and
        // hands controllerUid to whichever one of them should be presenting
        // right now (see renderHostManagePanel()).
        (iAmOwner ? ('<button type="button" class="icon-tool-btn'+(hostManageOpen?' active':'')+'" id="manageHostsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('users')+'</svg><span>HOSTS</span><kbd class="icon-tool-kbd">H</kbd></button>') : '') +
      '</div>';

    // Resizable squares [2026-09-16]: an explicit inline height once the
    // host has dragged a square at least once (see hostStageColHeight's own
    // comment above) -- applied to BOTH columns identically so PREVIEW and
    // LIVE always stay the same size as each other, matching how they're
    // always shown side by side. Before the first drag this is '' and
    // .host-stage-col just falls back to its CSS min-height/grow-to-fit
    // default, unchanged from before this feature existed.
    const stageColStyle = hostStageColHeight ? (' style="height:'+hostStageColHeight+'px;"') : '';

    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="hostBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<span class="live-badge"><span class="live-dot"></span>'+(iAmOwner?'YOU ARE HOSTING':'YOU ARE CO-HOSTING')+'</span>' +
      // Co-hosting [2026-09-05]: a quick "who's actually driving" readout,
      // shown to owner and co-hosts alike -- the owner sees it as
      // confirmation of who they handed control to, a co-host sees it as the
      // reason their own controls are (or aren't) live right now.
      ((room.coHostUids||[]).length ? ('<p style="text-align:center;color:var(--ink-soft);margin:8px 0 0;font-size:.85rem;">'+(iHaveControl?'You have control.':(escapeHtml(controllerDisplayName(room))+' has control.'))+'</p>') : '') +
      '<p style="text-align:center;margin:14px 0 0;"><button type="button" class="switch-account" id="codeToggleBtn">'+(hostCodeVisible?'HIDE ROOM CODE':'SHOW ROOM CODE')+'</button></p>' +
      (hostCodeVisible ?
        ('<div class="code-display" style="margin-top:8px;">' +
          '<p class="code-label uc">'+(room.isPublic?'PUBLIC ROOM CODE':'PRIVATE ROOM CODE')+'</p>' +
          '<p class="code">'+code+'</p>' +
          renderJoinQrSvg(code) +
        '</div>') : '') +
      '<p style="text-align:center;color:var(--ink-soft);margin-bottom:0;">'+escapeHtml(room.name)+(room.churchName?' &middot; '+escapeHtml(room.churchName):'')+'</p>' +
      presenterToolbar +
      '<div style="margin-top:20px;padding-bottom:calc(var(--now-live-bar-h, 90px) + 24px);">' +
        (presenterSplitView ?
          ('<div class="host-split-grid">' +
            '<div class="host-controls-col">'+controlsHtml+'</div>' +
            // Preview alongside live [2026-09-08]: Jared: "can you add a
            // preview screen alongside the live view?" Split screen used to
            // show only a single read-only LIVE mirror here; the staged
            // draft was only ever visible as a line of status text (plus a
            // small slide-card, suppressed while split view is on -- see
            // renderPreviewBar()'s `hideSlidePreview` param) inside the fixed
            // preview bar below. Now a PREVIEW column (`previewContent` --
            // resolvePreviewContent(), the staged draft) renders alongside
            // the existing LIVE column (`content` -- resolveRoomContent(),
            // unaffected by hostPreview), the same Program/Preview
            // dual-monitor convention ProPresenter/vMix use -- this also
            // means the preview bar's own slide-card staying suppressed in
            // split view (unchanged) is more correct than ever, since this
            // PREVIEW column is a bigger, clearer version of the exact same
            // thing. `renderStageSlide()` takes a `trackKey` so its fade-in
            // tracking treats these two calls as independent streams rather
            // than clobbering each other's "did the content actually change"
            // signature (see that function's own comment). Both share the
            // `.host-stage-col` class (so the 900px-narrow stacking rule in
            // styles.css picks up both automatically), with `.host-preview-
            // col` only adding the distinct badge color. No nav row on
            // either column -- advancing the draft still happens via the
            // preview bar's PREV/NEXT + GO LIVE below, not by editing either
            // stage directly.
            '<div class="host-stage-col host-preview-col"'+stageColStyle+'><span class="preview-badge" style="margin-bottom:16px;"><span class="preview-badge-dot"></span>PREVIEW</span>'+renderStageSlide(previewContent, 'preview')+'</div>' +
            '<div class="host-stage-col"'+stageColStyle+'><span class="live-badge" style="margin-bottom:16px;"><span class="live-dot"></span>LIVE</span>'+renderStageSlide(content, 'live')+'</div>' +
          '</div>')
          : controlsHtml) +
      '</div>' +

      // Fixed preview bar -- always rendered, position:fixed lifts it out of
      // this normal flow regardless of where it sits in the markup. Rebuilt
      // 2026-09-06 as the PREVIEW/staging surface (see renderPreviewBar()'s
      // own comment) rather than a live display -- what's actually live now
      // only shows here as a small read-only line in the expanded body, plus
      // the split-screen stage column above when that's toggled on.
      // Redundant-label fix [2026-09-05], still true here: the split-screen
      // stage column already shows the current section/slide's label and
      // full lyrics, so the preview bar's own slide-card is suppressed while
      // split view is on to avoid showing it twice.
      renderPreviewBar(previewContent, isPreviewSermon, isPreviewVerse, isPreviewMedia, room, presenterSplitView, iHaveControl, content, previewDirty) +

      // Floating chat [reorganized 2026-09-04 x2] -- Jared: "the chat can
      // just be a floating chat at the bottom right." A round FAB (the
      // common Intercom/Crisp/Drift "chat widget" pattern) toggles a small
      // overlay panel; renderChatSection() itself is untouched (still
      // shared with the congregant view's inline chat) -- only where its
      // output lands changed.
      '<button type="button" class="chat-fab" id="chatFabBtn" aria-label="'+(hostChatOpen?'Close chat':'Open chat')+' (shortcut: C)" title="'+(hostChatOpen?'Close chat':'Open chat')+' (shortcut: C)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('chat')+'</svg></button>' +
      (hostChatOpen ?
        ('<div class="chat-floating-panel" id="chatFloatingPanel">' +
          '<div class="chat-floating-header"><span>Chat</span><button type="button" class="chat-floating-close" id="chatFloatingCloseBtn" aria-label="Close chat">&times;</button></div>' +
          renderChatSection() +
        '</div>') : '');

    document.getElementById('hostBackBtn').addEventListener('click', function(){ state.view='list'; render(); window.scrollTo(0,0); });
    document.getElementById('codeToggleBtn').addEventListener('click', function(){ hostCodeVisible = !hostCodeVisible; render(); });
    // Resume-on-tab-tap [2026-09-04, retargeted at the PREVIEW 2026-09-06]:
    // Jared: "make it happen that way so we can lessen repetitive work."
    // Since GO LIVE (see goLive()/renderPreviewBar() above) is now the only
    // thing that actually changes what the congregation sees, these three
    // tabs no longer touch the room doc at all -- they only switch the
    // local hostContentTab (for the segmented control's highlight) and
    // which picker panel shows. "Resume" now happens for free: hostPreview
    // is a single, persistent draft that's untouched by simply looking at a
    // different tab, so tapping back to SONGS after browsing SERMON/BIBLE
    // (without ever picking/presenting anything there) naturally still
    // shows whatever song/section was staged before. Only actually PICKING
    // a different item (chooseSong()/presentSermon()/presentVerse()) starts
    // a fresh draft for that item.
    document.getElementById('pickSongBtn').addEventListener('click', function(){
      hostSermonPickerOpen = false; hostVersePickerOpen = false; hostVerseMultiSelect = []; hostVerseSelectMode = false; hostMediaPickerOpen = false; hostMediaUploadOpen = false; hostPickerOpen = !hostPickerOpen;
      hostContentTab = 'song'; // tab-highlight fix [2026-09-06]
      hostSetlistEditorOpen = false; // setlist-default-view fix [2026-09-06]
      render();
    });
    document.getElementById('pickSermonBtn').addEventListener('click', function(){
      hostPickerOpen = false; hostVersePickerOpen = false; hostVerseMultiSelect = []; hostVerseSelectMode = false; hostMediaPickerOpen = false; hostMediaUploadOpen = false; hostSermonPickerOpen = !hostSermonPickerOpen;
      hostContentTab = 'sermon'; // tab-highlight fix [2026-09-06]
      hostSetlistEditorOpen = false; // setlist-default-view fix [2026-09-06]
      render();
    });
    document.getElementById('pickVerseBtn').addEventListener('click', function(){
      hostPickerOpen = false; hostSermonPickerOpen = false; hostMediaPickerOpen = false; hostMediaUploadOpen = false;
      hostVersePickerOpen = !hostVersePickerOpen;
      hostContentTab = 'verse'; // tab-highlight fix [2026-09-06]
      hostSetlistEditorOpen = false; // setlist-default-view fix [2026-09-06]
      if(hostVersePickerOpen) loadKjvData();
      render();
    });
    // Media/AVP [2026-09-06]: exact mirror of the SERMON tab handler above.
    document.getElementById('pickMediaBtn').addEventListener('click', function(){
      hostPickerOpen = false; hostSermonPickerOpen = false; hostVersePickerOpen = false; hostVerseMultiSelect = []; hostVerseSelectMode = false;
      hostMediaPickerOpen = !hostMediaPickerOpen;
      hostMediaUploadOpen = false; // in-session upload [2026-09-06]: always start collapsed on a fresh open of this tab
      hostContentTab = 'media';
      hostSetlistEditorOpen = false;
      render();
    });
    // Search boxes [2026-09-16] -- these two also (re-)wire every
    // [data-present-sermon]/[data-present-media] button, same as
    // attachHostPickerHandlers() does for [data-pick-id] above.
    attachSermonPickerHandlers();
    attachMediaPickerSearchHandlers();
    const openMediaLibraryBtn = document.getElementById('openMediaLibraryFromHostBtn');
    if(openMediaLibraryBtn) openMediaLibraryBtn.addEventListener('click', function(){ openMediaLibrary('session-host'); });
    // In-session upload [2026-09-06]: toggles the MEDIA picker's own upload
    // panel open/closed, then (guarded, see attachMediaLibraryHandlers()'
    // own comment) wires up the shared upload-panel handlers -- same
    // finishUpload()/uploadMediaFile() flow the Media Library screen uses.
    const hostMediaUploadToggleBtn = document.getElementById('hostMediaUploadToggleBtn');
    if(hostMediaUploadToggleBtn) hostMediaUploadToggleBtn.addEventListener('click', function(){
      hostMediaUploadOpen = !hostMediaUploadOpen;
      mediaAddMode = null; mediaAddTitle = ''; mediaAddEmbedUrl = ''; mediaUploadStatus = '';
      render();
    });
    attachMediaLibraryHandlers();
    const buildSermonBtn = document.getElementById('buildSermonFromHostBtn');
    if(buildSermonBtn) buildSermonBtn.addEventListener('click', function(){ openSermonEditor(null, 'session-host'); });
    const backToSongsBtn = document.getElementById('backToSongsBtn');
    if(backToSongsBtn) backToSongsBtn.addEventListener('click', function(){
      // Preview/Go Live [2026-09-06]: a pure local tab-switch now (see the
      // three tab handlers just above) -- no longer writes to the room.
      hostContentTab = 'song'; hostSetlistEditorOpen = false;
      render();
    });
    const goLiveBtn = document.getElementById('goLiveBtn');
    if(goLiveBtn) goLiveBtn.addEventListener('click', goLive);
    attachVersePickerHandlers();
    document.getElementById('openStageBtn').addEventListener('click', function(){
      const url = window.location.origin + window.location.pathname + '?stage=' + encodeURIComponent(code);
      window.open(url, '_blank');
    });
    document.getElementById('toggleSplitBtn').addEventListener('click', function(){
      presenterSplitView = !presenterSplitView;
      safeSet(SPLIT_VIEW_KEY, presenterSplitView ? '1' : '0');
      render();
    });
    document.getElementById('stageFontDownBtn').addEventListener('click', function(){
      setStageFontScale(hostStageFontScale - STAGE_FONT_SCALE_STEP);
    });
    document.getElementById('stageFontUpBtn').addEventListener('click', function(){
      setStageFontScale(hostStageFontScale + STAGE_FONT_SCALE_STEP);
    });
    attachStageColResize();
    document.getElementById('copyChartLinkBtn').addEventListener('click', function(){
      const link = window.location.origin + window.location.pathname + '?chart=' + encodeURIComponent(code);
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(link).then(function(){ showToast('Musician chart link copied.'); }).catch(function(){ showToast(link); });
      } else { showToast(link); }
    });
    // Stage overrides [2026-09-24] -- see the presenterToolbar markup's own
    // comment just above for the toggle-on/toggle-off design. A direct,
    // instant room write (not staged through hostPreview/GO LIVE) -- same
    // "controls what's already showing" reasoning mediaPlayPause() uses.
    document.querySelectorAll('[data-stage-override]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!canControlRoom(room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
        const mode = btn.getAttribute('data-stage-override');
        const next = (room.stageOverride === mode) ? null : mode;
        updateRoom(state.activeRoomCode, { stageOverride: next }).catch(function(){ showToast('Could not update the session. Try again.'); });
      });
    });
    const manageHostsBtn = document.getElementById('manageHostsBtn');
    if(manageHostsBtn) manageHostsBtn.addEventListener('click', function(){ hostManageOpen = !hostManageOpen; hostManageQuery = ''; render(); });
    const streamLinkBtn = document.getElementById('streamLinkBtn');
    if(streamLinkBtn) streamLinkBtn.addEventListener('click', function(){ hostStreamLinkOpen = !hostStreamLinkOpen; render(); });
    attachStreamLinkHandlers();
    document.getElementById('chatFabBtn').addEventListener('click', function(){ hostChatOpen = !hostChatOpen; render(); });
    const chatCloseBtn = document.getElementById('chatFloatingCloseBtn');
    if(chatCloseBtn) chatCloseBtn.addEventListener('click', function(){ hostChatOpen = false; render(); });
    attachHostPickerHandlers();
    attachSetlistSectionHandlers(room);
    attachHostManageHandlers();
    attachChatHandlers(code);

    const nowLiveToggle = document.getElementById('nowLiveExpandToggle');
    if(nowLiveToggle) nowLiveToggle.addEventListener('click', function(){ hostNowLiveExpanded = !hostNowLiveExpanded; render(); });
    const nowLivePrev = document.getElementById('nowLivePrevBtn');
    const nowLiveNext = document.getElementById('nowLiveNextBtn');
    // Preview/Go Live [2026-09-06]: these buttons now live inside the
    // PREVIEW bar (renderPreviewBar()), so which function to call has to
    // branch on isPreviewSermon (what's STAGED), not isSermon (what's
    // actually live) -- using the live type here would silently no-op
    // whenever the two differ, since changeSermonSlide()/changeSection()
    // each bail out if hostPreview's type doesn't match.
    if(nowLivePrev) nowLivePrev.addEventListener('click', function(){ if(isPreviewSermon) changeSermonSlide(-1); else if(isPreviewMedia) changeMediaSlide(-1); else changeSection(-1); });
    if(nowLiveNext) nowLiveNext.addEventListener('click', function(){ if(isPreviewSermon) changeSermonSlide(1); else if(isPreviewMedia) changeMediaSlide(1); else changeSection(1); });
    // Double-click to GO LIVE [2026-09-07] -- the mouse/touch equivalent of
    // the double-Enter keyboard shortcut (see that listener's own comment,
    // near the projector's keydown shortcut below). previewDirty is already
    // computed once per render, above -- reuse it rather than recomputing.
    const nowLiveStatusRow = document.getElementById('nowLiveStatusRow');
    if(nowLiveStatusRow) nowLiveStatusRow.addEventListener('dblclick', function(){ if(previewDirty) goLive(); });
    document.querySelectorAll('[data-jump]').forEach(function(btn){
      btn.addEventListener('click', function(){ jumpToSection(+btn.getAttribute('data-jump')); });
    });
    document.querySelectorAll('[data-jump-slide]').forEach(function(btn){
      btn.addEventListener('click', function(){ jumpToSermonSlide(+btn.getAttribute('data-jump-slide')); });
    });
    document.querySelectorAll('[data-jump-media-slide]').forEach(function(btn){
      btn.addEventListener('click', function(){ jumpToMediaSlide(+btn.getAttribute('data-jump-media-slide')); });
    });
    // Media/AVP [2026-09-06]: video transport -- see mediaPlayPause()/
    // mediaRestart()'s own comment for why these are direct live writes.
    const mediaPlayPauseBtn = document.getElementById('mediaPlayPauseBtn');
    if(mediaPlayPauseBtn) mediaPlayPauseBtn.addEventListener('click', mediaPlayPause);
    const mediaRestartBtn = document.getElementById('mediaRestartBtn');
    if(mediaRestartBtn) mediaRestartBtn.addEventListener('click', mediaRestart);

    const endBtn = document.getElementById('endSessionBtn');
    if(endBtn) endBtn.addEventListener('click', function(){ hostConfirmEnd = true; render(); });
    const confirmEnd = document.getElementById('confirmEndBtn');
    if(confirmEnd) confirmEnd.addEventListener('click', endSession);
    const cancelEnd = document.getElementById('cancelEndBtn');
    if(cancelEnd) cancelEnd.addEventListener('click', function(){ hostConfirmEnd=false; render(); });

    // Keeps the floating chat FAB/panel (and the scrollable content's own
    // bottom padding above) clear of the Now Live bar regardless of its
    // actual height, which varies with content length and expand state --
    // same reasoning/pattern as fitStageLines()'s --stage-font-size custom
    // property elsewhere in this file. Falls back to the CSS defaults
    // (see .chat-fab/.chat-floating-panel/the padding-bottom above) before
    // this runs.
    const bar = document.getElementById('nowLiveBar');
    if(bar) document.documentElement.style.setProperty('--now-live-bar-h', bar.offsetHeight + 'px');

    // Media/AVP [2026-09-06]: the split-screen stage column's own <video>
    // (if `content` is a live 'video' item) needs the same clock-sync pass
    // the projector view gets -- see syncStageMediaVideo()'s own comment.
    if(presenterSplitView) syncStageMediaVideo(content, room);

    // First-run tour [2026-09-24] -- see showTourOverlay()'s own comment.
    // Shown once, the first time this device actually reaches the Host
    // Session screen (any room, not just a brand new host's very first
    // one) -- separate from the general Home-screen tour above.
    maybeShowHostTour();
  }

  function hostPickerResults(){
    const q = hostPickerQuery.trim().toLowerCase();
    if(!q) return state.library;
    return state.library.filter(function(s){
      return s.title.toLowerCase().includes(q) || String(s.number).includes(q) ||
        (s.tags||[]).join(' ').toLowerCase().includes(q) ||
        (s.themes||[]).map(themeLabel).join(' ').toLowerCase().includes(q);
    });
  }

  function renderHostPickerList(results){
    return '<ul class="hymn-list">' + (results.length ? results.map(function(s){
      return '<li><div class="hymn-card"><button class="hymn-card-main" data-pick-id="'+s.id+'">' +
        '<span class="hymn-num">'+s.number+'</span><span class="hymn-meta"><p class="hymn-title">'+s.title+'</p></span>' +
        '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon('chevron')+'</svg>' +
      '</button></div></li>';
    }).join('') : '<li class="sections-empty">No songs match &ldquo;'+escapeHtml(hostPickerQuery)+'&rdquo;.</li>') + '</ul>';
  }

  function renderHostPicker(){
    // "Recently shown" chips (see pushRecentId()/chooseSong()) -- mostly
    // useful for a song sung ad hoc outside the prepared setlist (the
    // setlist itself already gives one-tap access to anything planned
    // ahead of time, so this is about the songs that AREN'T in it).
    const room = state.room;
    const recentIds = (room && room.recentSongIds) || [];
    const recentSongs = recentIds.map(function(id){
      return state.library.find(function(s){ return s.id === id; });
    }).filter(Boolean);
    // Back to Setlist [2026-09-16] -- Jared: "instead of just going back to
    // recently shown, also give an option here to go back to setlist."
    // Tapping SONGS again (pickSongBtn, above) already toggles this whole
    // picker closed, which is what reveals renderSetlistSection() below it
    // -- but that's not obvious from inside the picker itself, and with a
    // few hundred songs in the full library list underneath, scrolling back
    // up to that same tab button isn't a quick way back either. This is the
    // exact same close (hostPickerOpen = false), just offered as an
    // explicit link right where a host is already looking.
    return '<div class="session-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
        '<p class="control-label uc" style="margin:0;">Pick a Song</p>' +
        '<button type="button" class="link-btn" id="backToSetlistBtn">&lsaquo; Back to Setlist</button>' +
      '</div>' +
      (recentSongs.length ?
        ('<p class="hint" style="margin:0 0 8px;">RECENTLY SHOWN</p>' +
          '<div class="now-live-jump-row" style="margin-bottom:14px;">' +
            recentSongs.map(function(s){ return '<button type="button" class="section-jump" data-pick-id="'+s.id+'">'+escapeHtml(s.title)+'</button>'; }).join('') +
          '</div>') : '') +
      '<div class="search-box" style="margin-bottom:14px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="hostPickerSearch" placeholder="Search by title, number, tag, or theme&hellip;" value="'+escapeAttr(hostPickerQuery)+'" aria-label="Search songs to pick"></div>' +
      renderHostPickerList(hostPickerResults()) +
    '</div>';
  }

  function attachPickButtons(){
    document.querySelectorAll('[data-pick-id]').forEach(function(btn){
      btn.addEventListener('click', function(){ chooseSong(btn.getAttribute('data-pick-id')); });
    });
  }

  function attachHostPickerHandlers(){
    attachPickButtons();
    const backToSetlistBtn = document.getElementById('backToSetlistBtn');
    if(backToSetlistBtn) backToSetlistBtn.addEventListener('click', function(){ hostPickerOpen = false; render(); });
    const searchEl = document.getElementById('hostPickerSearch');
    // Only wire the search box's own input listener once per render() call --
    // this function re-runs after every keystroke's list swap below, and
    // re-attaching a second 'input' listener to the same, still-in-the-DOM
    // input each time would make every future keystroke fire N times.
    if(searchEl && !searchEl.dataset.wired){
      searchEl.dataset.wired = '1';
      // Debounced [2026-09-16] -- see debounce()'s own comment above: this
      // picker doubles as a full-library browser (an empty query shows
      // every song, same as the main Hymnal search), so its result list
      // isn't capped the way the setlist add-search's is -- exactly the
      // same "hundreds of cards rebuilt per keystroke" cost, just measured
      // here directly (see /tmp/v45/perf-check-bigLib.cjs's own numbers).
      const rebuild = debounce(function(){
        const ul = searchEl.closest('.session-card').querySelector('ul.hymn-list');
        if(ul) ul.outerHTML = renderHostPickerList(hostPickerResults());
        attachPickButtons();
      }, 160);
      searchEl.addEventListener('input', function(e){
        hostPickerQuery = e.target.value;
        rebuild();
      });
    }
  }

  // Preview/Go Live [2026-09-06]: stages into hostPreview instead of writing
  // straight to the room -- see hostPreview's own declaration, above.
  // Picking a song always switches the PREVIEW's type back to 'song' too,
  // even if a sermon/verse was staged -- picking from the SONGS picker is a
  // reliable way back on its own, without needing "SWITCH BACK TO SONGS"
  // first. Nothing changes for the congregation until GO LIVE.
  function chooseSong(songId){
    hostPickerOpen = false; hostPickerQuery = '';
    if(!canControlRoom(state.room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    hostPreview = { type:'song', songId: songId, sectionIndex: 0 };
    render();
  }

  // Advances the STAGED preview, not what's live -- see changeSermonSlide()
  // just above for the same pattern and full reasoning.
  function changeSection(delta){
    const room = state.room;
    if(!room || !canControlRoom(room)) return; // buttons are already disabled for this case -- see renderPreviewBar()
    ensurePreviewFromLive(room);
    if(!hostPreview || hostPreview.type !== 'song') return;
    const song = state.library.find(function(s){ return s.id===hostPreview.songId; });
    if(!song) return;
    const next = hostPreview.sectionIndex + delta;
    if(next < 0 || next >= songSectionsForPresenting(song).length) return;
    hostPreview.sectionIndex = next;
    render();
  }

  function jumpToSection(i){
    const room = state.room;
    if(!canControlRoom(room)){ showToast('You don&rsquo;t have control of this session right now.'); return; }
    ensurePreviewFromLive(room);
    if(!hostPreview || hostPreview.type !== 'song') return;
    hostPreview.sectionIndex = i;
    render();
  }

  // Direct LIVE advance, used ONLY by the projector view's own keyboard
  // shortcut -- see advanceLiveSermonSlide()'s comment above for the full
  // reasoning; this is changeSection()'s exact pre-2026-09-06 body.
  function advanceLiveSection(delta){
    const room = state.room;
    if(!room) return;
    if(!canControlRoom(room)) return;
    const song = state.library.find(function(s){ return s.id===room.currentSongId; });
    if(!song) return;
    const next = room.currentSectionIndex + delta;
    if(next < 0 || next >= songSectionsForPresenting(song).length) return;
    updateRoom(state.activeRoomCode, { currentSectionIndex: next })
      .catch(function(){ showToast('Could not update the session. Try again.'); });
  }

  async function endSession(){
    // Co-hosting [2026-09-05]: ending a session outright is deliberately
    // owner-only, unlike the content controls (chooseSong/presentSermon/
    // etc.) which any current controller can use -- a co-host who's been
    // handed the mic for a moment shouldn't also be able to shut the whole
    // service down for everyone. The button itself is only ever rendered
    // for the owner (see the controlsHtml/iAmOwner branch in
    // renderSessionHost()), so this is a defensive backstop, not the
    // primary gate.
    if(!isRoomOwner(state.room)){ showToast('Only the session owner can end this session.'); return; }
    const code = state.activeRoomCode;
    hostConfirmEnd = false;
    try{ await endRoom(code); }catch(e){ /* the watchRoom subscription will surface any lasting problem */ }
    stopRoomWatch();
    stopChatWatch();
    stopViewSermonWatch();
    stopViewMediaWatch();
    stopDirectoryWatch();
    state.activeRoomCode = null; state.isHost = false; state.isCoHost = false; state.room = null;
    safeSessionRemove('cv:activeRoomCode'); safeSessionRemove('cv:isHost'); safeSessionRemove('cv:isCoHost');
    showToast('Session ended.');
    state.view = 'list';
    render(); window.scrollTo(0,0);
  }

  function renderSessionJoin(){
    const rooms = state.publicRooms || [];

    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="joinBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="session-card">' +
        '<h3>Join a Live Session</h3>' +
        '<p>Enter the room code your Pastor or Worship Leader shared, or pick a public room below.</p>' +
        '<div class="field"><label for="joinCodeInput">ROOM CODE</label><input type="text" id="joinCodeInput" placeholder="e.g. G7K4" maxlength="8" style="text-transform:uppercase;letter-spacing:.2em;"></div>' +
        '<div class="field" id="joinPasswordField" style="display:none;"><label for="joinPasswordInput">PASSWORD</label><input type="text" id="joinPasswordInput"></div>' +
        '<button class="btn btn-primary btn-lg btn-block" id="joinCodeBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>JOIN WITH CODE</button>' +
      '</div>' +
      '<div class="section-heading"><h2 class="uc">Public Rooms</h2></div>' +
      (rooms.length ?
        rooms.map(function(r){
          return '<div class="room-list-card"><div class="room-list-meta"><p class="room-name">'+escapeHtml(r.name)+'</p>' +
            '<p class="room-sub">'+escapeHtml(r.hostName)+(r.churchName?' &middot; '+escapeHtml(r.churchName):'')+'</p></div>' +
            '<button class="btn btn-primary" data-join-code="'+r.code+'">JOIN</button></div>';
        }).join('')
        : '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg><p>No public rooms are live right now. Ask your host for a room code, or check back soon.</p></div>');

    document.getElementById('joinBackBtn').addEventListener('click', function(){ stopPublicRoomsWatch(); state.view='host-hub'; render(); window.scrollTo(0,0); });
    document.getElementById('joinCodeBtn').addEventListener('click', function(){
      const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
      if(!code){ showToast('Type a room code first.'); return; }
      const pw = document.getElementById('joinPasswordInput');
      attemptJoin(code, pw ? pw.value : '');
    });
    document.querySelectorAll('[data-join-code]').forEach(function(btn){
      btn.addEventListener('click', function(){ attemptJoin(btn.getAttribute('data-join-code'), ''); });
    });
  }

  function renderMySessions(){
    const rooms = hostRoomsList;

    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="mySessionsBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="section-heading"><h2 class="uc">My Sessions</h2></div>' +
      '<p class="hint" style="margin-bottom:18px;">Every session you&rsquo;ve hosted, including any still live from another device or a tab you closed by accident. Reopen one to keep hosting it from here, or end it to clean up &mdash; no need to go into the Firebase console.</p>' +
      (rooms.length ? rooms.map(function(r){
        const isLive = state.activeRoomCode === r.code && state.isHost;
        const confirming = mySessionsConfirmCode === r.code;
        return '<div class="room-list-card">' +
          '<div class="room-list-meta">' +
            '<p class="room-name">'+escapeHtml(r.name)+(isLive ? ' <span class="live-badge" style="margin-left:8px;vertical-align:middle;"><span class="live-dot"></span>LIVE NOW</span>' : '')+'</p>' +
            '<p class="room-sub">Code '+r.code+(r.churchName ? ' &middot; '+escapeHtml(r.churchName) : '')+' &middot; last active '+timeAgo(toMillis(r.updatedAt))+'</p>' +
          '</div>' +
          (confirming ?
            ('<div class="confirm-row"><span>End this session?</span>' +
              '<button class="btn btn-primary" data-confirm-end="'+r.code+'">YES, END</button>' +
              '<button class="btn btn-ghost" data-cancel-end="'+r.code+'">CANCEL</button></div>')
            : ('<div class="add-section-row" style="margin-bottom:0;">' +
                (isLive ?
                  '<button class="btn btn-primary" data-resume-code="'+r.code+'" style="flex:1 1 auto;">CONTINUE HOSTING</button>'
                  : '<button class="btn btn-primary" data-resume-code="'+r.code+'" style="flex:1 1 auto;">RESUME HOSTING</button>') +
                '<button class="btn btn-ghost" data-ask-end="'+r.code+'">END</button>' +
              '</div>')
          ) +
        '</div>';
      }).join('') : '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon('mic')+'</svg><p>You haven&rsquo;t hosted any sessions yet.</p></div>') +

      // Co-hosting [2026-09-05]: rooms someone ELSE owns, where they've
      // assigned this account as a co-host (see renderHostManagePanel()) --
      // a separate section since these aren't rooms this account can end or
      // manage the roster of, only open and (once handed control) run.
      (coHostRoomsList.length ? (
        '<div class="section-heading" style="margin-top:28px;"><h2 class="uc">Co-Hosting</h2></div>' +
        '<p class="hint" style="margin-bottom:18px;">Sessions someone else owns, where they&rsquo;ve added you as a co-host.</p>' +
        coHostRoomsList.map(function(r){
          const isLive = state.activeRoomCode === r.code && state.isCoHost;
          const iHaveControl = r.controllerUid === (state.user && state.user.uid);
          return '<div class="room-list-card">' +
            '<div class="room-list-meta">' +
              '<p class="room-name">'+escapeHtml(r.name)+(isLive ? ' <span class="live-badge" style="margin-left:8px;vertical-align:middle;"><span class="live-dot"></span>LIVE NOW</span>' : '')+'</p>' +
              '<p class="room-sub">Hosted by '+escapeHtml(r.hostName||'')+(r.churchName ? ' &middot; '+escapeHtml(r.churchName) : '')+' &middot; '+(iHaveControl?'you have control':'watch only for now')+'</p>' +
            '</div>' +
            '<button class="btn btn-primary" data-join-cohost="'+r.code+'">'+(isLive?'CONTINUE':'OPEN')+'</button>' +
          '</div>';
        }).join('')
      ) : '');

    document.getElementById('mySessionsBackBtn').addEventListener('click', function(){
      stopHostRoomsWatch(); stopCoHostRoomsWatch(); state.view='host-hub'; render(); window.scrollTo(0,0);
    });
    document.querySelectorAll('[data-join-cohost]').forEach(function(btn){
      btn.addEventListener('click', function(){ joinAsCoHost(btn.getAttribute('data-join-cohost')); });
    });
    document.querySelectorAll('[data-ask-end]').forEach(function(btn){
      btn.addEventListener('click', function(){ mySessionsConfirmCode = btn.getAttribute('data-ask-end'); render(); });
    });
    document.querySelectorAll('[data-cancel-end]').forEach(function(btn){
      btn.addEventListener('click', function(){ mySessionsConfirmCode = null; render(); });
    });
    document.querySelectorAll('[data-confirm-end]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const code = btn.getAttribute('data-confirm-end');
        btn.disabled = true;
        try{ await endRoom(code); showToast('Session ended.'); }
        catch(e){ showToast('Couldn&rsquo;t end that session &mdash; check your connection and try again.'); }
        mySessionsConfirmCode = null;
        render();
      });
    });
    document.querySelectorAll('[data-resume-code]').forEach(function(btn){
      btn.addEventListener('click', function(){ resumeAsHost(btn.getAttribute('data-resume-code')); });
    });
  }

  // Host session recovery [2026-09-04] -- Jared: "let's say a host
  // accidentally closes his app or web... Or let's say he's moving to a
  // different device. Please make the current active rooms still
  // accessible for the host." Until now the ONLY way to become a room's
  // host was submitCreateRoom() (create-only) -- there was no re-entry
  // path, so a closed tab or a new device meant the room was still live
  // (other viewers stayed connected) but unreachable by its own host.
  // watchHostRooms() already scopes "My Sessions" to rooms this uid
  // created, and Firestore's room-update rule is keyed on
  // resource.data.hostUid == request.auth.uid, so any room reachable from
  // that list is already provably this person's to resume -- no password
  // prompt needed (unlike attemptJoin(), which is for people who AREN'T
  // the host). This mirrors submitCreateRoom()'s post-creation state setup
  // (session-storage keys, watchActiveRoom/watchChat, the sermon watches)
  // rather than inventing a second setup path that could drift out of sync
  // with it.
  function resumeAsHost(code){
    stopHostRoomsWatch();
    hostPickerOpen = false; hostSermonPickerOpen = false; hostVersePickerOpen = false;
    hostConfirmEnd = false; hostPickerQuery = ''; hostSermonPickerQuery = ''; hostMediaPickerQuery = ''; hostVerseRefInput = '';
    hostVerseMode = 'browse'; hostVerseBrowseBook = null; hostVerseBrowseChapter = null; hostVerseMultiSelect = []; hostVerseSelectMode = false;
    hostManageOpen = false; hostManageQuery = ''; hostStreamLinkOpen = false; hostStreamLinkInput = '';
    hostSetlistEditorOpen = false; hostContentTab = null; hostPreview = null; hostMediaPickerOpen = false; hostMediaUploadOpen = false;
    state.activeRoomCode = code;
    state.isHost = true;
    state.isCoHost = false;
    safeSessionSet('cv:activeRoomCode', code);
    safeSessionSet('cv:isHost', '1');
    safeSessionRemove('cv:isCoHost');
    startMySermonsWatch(); startSharedSermonsWatch();
    startMyMediaWatch(); startSharedMediaWatch();
    startDirectoryWatch();
    state.view = 'session-host';
    watchActiveRoom(code);
    watchChat(code, 'everyone');
    render(); window.scrollTo(0,0);
  }

  // Co-hosting [2026-09-05]: the co-host's equivalent of resumeAsHost() just
  // above -- the differences are exactly the ones that matter: isCoHost
  // (not isHost) is what's set, and no startDirectoryWatch() (only the
  // room's owner manages the coHostUids roster -- see
  // renderHostManagePanel() -- a co-host never needs state.directory).
  // Reaching session-host at all this way requires being listed in
  // coHostUids, same trust boundary watchCoHostRooms()/"My Sessions" already
  // establish -- renderSessionHost() itself then does the actual per-action
  // gating from room.hostUid/controllerUid via canControlRoom()/
  // isRoomOwner(), same as it would for the owner using resumeAsHost().
  function joinAsCoHost(code){
    stopCoHostRoomsWatch();
    hostPickerOpen = false; hostSermonPickerOpen = false; hostVersePickerOpen = false;
    hostConfirmEnd = false; hostPickerQuery = ''; hostSermonPickerQuery = ''; hostMediaPickerQuery = ''; hostVerseRefInput = '';
    hostVerseMode = 'browse'; hostVerseBrowseBook = null; hostVerseBrowseChapter = null; hostVerseMultiSelect = []; hostVerseSelectMode = false;
    hostManageOpen = false; hostManageQuery = ''; hostStreamLinkOpen = false; hostStreamLinkInput = '';
    hostSetlistEditorOpen = false; hostContentTab = null; hostPreview = null; hostMediaPickerOpen = false; hostMediaUploadOpen = false;
    state.activeRoomCode = code;
    state.isHost = false;
    state.isCoHost = true;
    safeSessionSet('cv:activeRoomCode', code);
    safeSessionRemove('cv:isHost');
    safeSessionSet('cv:isCoHost', '1');
    startMySermonsWatch(); startSharedSermonsWatch();
    startMyMediaWatch(); startSharedMediaWatch();
    state.view = 'session-host';
    watchActiveRoom(code);
    watchChat(code, 'everyone');
    render(); window.scrollTo(0,0);
  }

  // Pulled out of attemptJoin() [2026-09-17] -- see the two callers of
  // goToJoinScreenWithCode() just below for why.
  function joinSessionAsViewer(code){
    stopPublicRoomsWatch();
    state.activeRoomCode = code;
    state.isHost = false;
    safeSessionSet('cv:activeRoomCode', code);
    safeSessionRemove('cv:isHost');
    state.view = 'session-view';
    watchActiveRoom(code);
    watchChat(code, 'everyone');
    render(); window.scrollTo(0,0);
  }

  async function attemptJoin(code, password){
    const joinBtn = document.getElementById('joinCodeBtn');
    if(joinBtn) joinBtn.disabled = true;
    try{
      const ok = await checkRoomPassword(code, password);
      if(!ok){
        const pf = document.getElementById('joinPasswordField');
        if(pf) pf.style.display = '';
        showToast(password ? 'That password isn&rsquo;t right &mdash; try again.' : 'This is a private room, or that code doesn&rsquo;t exist &mdash; check the code and enter the password.');
        return;
      }
      joinSessionAsViewer(code);
    }catch(e){
      showToast('Could not reach that session. Check your connection and try again.');
    }finally{
      if(joinBtn) joinBtn.disabled = false;
    }
  }

  // Lands on the JOIN A SESSION screen with a code already filled in and
  // immediately attempts to join it -- shared by a session_live
  // notification tap (renderNotifications() above) and a "?join=<code>"
  // deep link (startup routing, near the end of this file). Deliberately
  // goes through the SAME attemptJoin(code, '') a public-room-list row's
  // JOIN button already uses (see the `[data-join-code]` handler in
  // renderSessionJoin()) rather than jumping straight to
  // joinSessionAsViewer(): both of these new callers hand this function a
  // code typed into a URL or read off a notification doc, neither of which
  // is something this app should simply trust is still a public room by
  // the time it's tapped -- checkRoomPassword('') inside attemptJoin is
  // what actually confirms that, and correctly falls back to showing the
  // password field (with the code already filled in, so nothing typed is
  // lost) if the room turns out to be private or gone.
  function goToJoinScreenWithCode(code){
    state.view = 'session-join';
    render(); window.scrollTo(0,0);
    startPublicRoomsWatch();
    const input = document.getElementById('joinCodeInput');
    if(input) input.value = code;
    attemptJoin(code, '');
  }

  function renderSessionView(){
    const code = state.activeRoomCode;
    const room = state.room;
    if(!room){
      main.innerHTML = '<p style="text-align:center;color:var(--ink-soft);padding:60px 20px;">'+(state.roomLoading ? 'Connecting&hellip;' : 'This session isn&rsquo;t available.')+'</p>';
      return;
    }
    const content = resolveLiveDisplayContent(room);

    main.innerHTML =
      '<span class="live-badge"><span class="live-dot"></span>LIVE</span>' +
      '<p style="text-align:center;color:var(--ink-soft);margin:14px 0 4px;">'+escapeHtml(room.name)+'</p>' +
      '<p style="text-align:center;color:var(--ink-soft);margin:0 0 18px;font-size:.9rem;">'+escapeHtml(room.hostName)+(room.churchName?' &middot; '+escapeHtml(room.churchName):'')+'</p>' +
      // Stage overrides [2026-09-24] -- see resolveLiveDisplayContent()'s
      // comment: a congregant's own in-app view follows the same BLACK/
      // LOGO/DEFAULT BG cutaway as the big screen, since most churches
      // want phones dark too during a prayer/offering moment, not just the
      // projector.
      (content.type==='stage-override' ? (
        content.mode==='logo' ? (
          presenterLogoUrl() ?
            '<div class="slide-card" style="padding:0;overflow:hidden;background:#000;"><img src="'+escapeAttr(presenterLogoUrl().url)+'" style="display:block;width:100%;max-height:60vh;object-fit:contain;" alt=""></div>' :
            '<div class="slide-card"><p class="lyric-line" style="color:var(--ink-soft);">No presentation logo uploaded yet.</p></div>'
        ) : content.mode==='default-bg' ? (
          presenterStageBg() ?
            '<div class="slide-card" style="padding:0;overflow:hidden;"><img src="'+escapeAttr(presenterStageBg().url)+'" style="display:block;width:100%;max-height:60vh;object-fit:cover;" alt=""></div>' :
            '<div class="slide-card"><p class="lyric-line" style="color:var(--ink-soft);">No presentation background uploaded yet.</p></div>'
        ) : (
          '<div class="slide-card" style="background:#000;min-height:160px;"></div>'
        )
      ) : content.type==='sermon' ? (
        content.slide ? (
          '<div class="slide-card"'+(isBlocksSlide(content.slide)?' style="padding:0;overflow:hidden;"':'')+'>' + (isBlocksSlide(content.slide) ? renderSlideCanvas(content.slide,'card') : sermonLinesAsCardHtml(content.slide)) + '</div>' +
          '<p class="slide-progress">'+(content.sermon?escapeHtml(content.sermon.title)+' &middot; ':'')+'Slide '+(content.slideIndex+1)+' of '+content.slides.length+'</p>'
        ) : '<div class="slide-card"><p class="lyric-line" style="color:var(--ink-soft);">Waiting for the host to choose a sermon&hellip;</p></div>'
      ) : content.type==='verse' ? (
        content.verseText ? (
          '<div class="slide-card">' + sermonLinesAsCardHtml(verseAsSlide(content.verseRef, content.verseText, content.verseSegments)) + '</div>' +
          '<p class="slide-progress">SCRIPTURE</p>'
        ) : '<div class="slide-card"><p class="lyric-line" style="color:var(--ink-soft);">Waiting for the host to present a verse&hellip;</p></div>'
      ) : content.type==='media' ? (
        // Media/AVP [2026-09-06]: a congregant's own phone shows media
        // inline too, but with NO playback-sync attempt for video -- native
        // <video controls> is opt-in playback on their own connection, not
        // kept in lockstep with the stage screen (see interface.md's
        // "Deliberately not built" note on why that's out of scope).
        !content.media ? '<div class="slide-card"><p class="lyric-line" style="color:var(--ink-soft);">Waiting for the host to choose media&hellip;</p></div>' :
        content.media.type === 'video' ? (
          '<div class="slide-card" style="padding:0;overflow:hidden;"><video src="'+escapeAttr(content.media.url)+'" controls playsinline muted style="display:block;width:100%;max-height:60vh;"></video></div>' +
          '<p class="slide-progress">'+escapeHtml(content.media.title)+'</p>'
        ) : content.media.type === 'embed' ? (
          '<div class="slide-card" style="padding:0;overflow:hidden;"><iframe src="'+escapeAttr(content.media.embedUrl||'')+'" style="display:block;width:100%;height:50vh;border:0;" allowfullscreen></iframe></div>' +
          '<p class="slide-progress">'+escapeHtml(content.media.title)+'</p>'
        ) : (
          '<div class="slide-card" style="padding:0;overflow:hidden;"><img src="'+escapeAttr(content.media.type==='slideshow' ? ((content.slides[content.slideIndex]||{}).url||'') : content.media.url)+'" style="display:block;width:100%;max-height:60vh;object-fit:contain;background:#000;" alt=""></div>' +
          '<p class="slide-progress">'+escapeHtml(content.media.title)+(content.media.type==='slideshow'?(' &middot; Slide '+(content.slideIndex+1)+' of '+content.slides.length):'')+'</p>'
        )
      ) : (
        content.song ? (
          '<div class="slide-card">' +
            '<p class="section-label uc type-'+content.section.type+'">'+content.section.label+'</p>' +
            content.section.lines.map(function(l){ return '<p class="lyric-line">'+escapeHtml(l.replace(/\[[^\]]*\]/g,''))+'</p>'; }).join('') +
          '</div>' +
          '<p class="slide-progress">'+content.song.title+' &middot; Section '+(room.currentSectionIndex+1)+' of '+songSectionsForPresenting(content.song).length+'</p>'
        ) : '<div class="slide-card"><p class="lyric-line" style="color:var(--ink-soft);">Waiting for the host to choose a song&hellip;</p></div>'
      )) +

      renderChatSection() +

      '<button class="btn btn-ghost btn-block" id="leaveSessionBtn" style="margin-top:24px;">LEAVE SESSION</button>';

    attachChatHandlers(code);

    document.getElementById('leaveSessionBtn').addEventListener('click', function(){
      stopRoomWatch();
      stopChatWatch();
      stopViewSermonWatch();
      stopViewMediaWatch();
      state.activeRoomCode = null; state.isHost = false; state.room = null;
      safeSessionRemove('cv:activeRoomCode'); safeSessionRemove('cv:isHost');
      state.view = 'list';
      render(); window.scrollTo(0,0);
    });
  }

  // Presenter/Projector ("stage") view -- see the deep-link comment above
  // and renderSessionHost()'s "PROJECTOR VIEW"/"SPLIT SCREEN" buttons below.
  // Deliberately chrome-less and read-only: no chat, no controls, nothing
  // but the current slide in as large a type as the viewport allows -- this
  // is meant to be looked at from across a room, not interacted with. Works
  // for a song OR a sermon slide -- renderStageSlide() below branches once.
  function renderSessionProjector(){
    const room = state.room;
    if(!room){
      main.innerHTML = '<div class="stage-view"><p class="stage-waiting">'+(state.roomLoading ? 'Connecting&hellip;' : 'This session isn&rsquo;t available.')+'</p></div>';
      return;
    }
    const isFull = stagePresentationMode;
    const projectorContent = resolveLiveDisplayContent(room);
    main.innerHTML =
      '<div class="stage-view">' +
        '<button type="button" class="stage-fullscreen-btn" id="stageFullscreenBtn" aria-label="'+(isFull?'Exit full screen':'Enter full screen, hide the header')+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+icon(isFull?'compress':'expand')+'</svg></button>' +
        '<button type="button" class="stage-exit-btn" id="stageExitBtn" aria-label="Exit projector view">&times;</button>' +
        renderStageSlide(projectorContent, 'projector') +
      '</div>';
    const exitBtn = document.getElementById('stageExitBtn');
    if(exitBtn) exitBtn.addEventListener('click', function(){
      // window.close() only actually closes a tab the page itself opened
      // (true here, via window.open() from the host screen) -- if it's a
      // no-op for some reason, closing the tab/window by hand works fine.
      window.close();
    });
    const fsBtn = document.getElementById('stageFullscreenBtn');
    if(fsBtn) fsBtn.addEventListener('click', toggleStagePresentationMode);
    fitStageLines();
    syncStageMediaVideo(projectorContent, room); // Media/AVP [2026-09-06] -- see its own comment
  }

  // Presentation mode [2026-09-04] -- Jared: "add an option for the share
  // screen itself to be full screen and not show the head bar or any
  // interface." Two things happen together, tracked by one flag
  // (stagePresentationMode) rather than by asking the browser: iWorship's
  // own header/footer chrome is hidden via a body-level class (see
  // styles.css's "body.stage-hide-chrome" rule), and the browser's real
  // Fullscreen API is requested best-effort so the address bar/tabs go
  // away too. The two are deliberately decoupled -- requestFullscreen()
  // can be refused outright (iOS Safari doesn't support it at all; some
  // embedded/kiosk contexts block it by policy) or the person can exit
  // real fullscreen their own way (Escape key) without meaning to leave
  // presentation mode -- so the flag, not document.fullscreenElement, is
  // what the button/render actually key off of; the fullscreenchange
  // listener below only steps in to turn presentation mode BACK off when
  // fullscreen was exited out from under it, so the header doesn't stay
  // hidden with no way back short of editing the URL.
  let stagePresentationMode = false;
  function toggleStagePresentationMode(){
    stagePresentationMode = !stagePresentationMode;
    document.body.classList.toggle('stage-hide-chrome', stagePresentationMode);
    if(stagePresentationMode){
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if(req) req.call(el).catch(function(){ /* refused -- header-hide above still applies on its own */ });
    } else if(document.fullscreenElement && document.exitFullscreen){
      document.exitFullscreen().catch(function(){});
    }
    if(state.view === 'session-projector') renderSessionProjector();
  }
  document.addEventListener('fullscreenchange', function(){
    if(!document.fullscreenElement && stagePresentationMode){
      stagePresentationMode = false;
      document.body.classList.remove('stage-hide-chrome');
      if(state.view === 'session-projector') renderSessionProjector();
    }
  });

  // Auto-fit [2026-09-04] -- Jared, after trying it live: "text does not
  // autofit the page. It's too big." .stage-lines p's font-size (see
  // styles.css) is a clamp() that only scales with viewport WIDTH, not
  // the number of lines on the current slide/section or the viewport's
  // HEIGHT -- so a long verse, or a short/small browser window, could
  // overflow past what's visible without scrolling, which defeats the
  // point of something meant to be read at a glance from across a room.
  // This shrinks .stage-lines' font-size (an inline override sitting on
  // top of the CSS clamp default, which supplies the starting/ceiling
  // size) just enough that the CURRENT content actually fits within the
  // stage view's own height, down to a legible floor -- never grows past
  // the CSS default, only ever shrinks when needed. Measures via
  // getBoundingClientRect() top-of-label to bottom-of-footer rather than
  // summing individual element heights, so it doesn't need to know
  // exactly which margins/gaps exist between them.
  function fitStageLines(){
    const stageView = document.querySelector('.stage-view');
    if(!stageView) return;
    const linesEl = stageView.querySelector('.stage-lines');
    if(!linesEl) return; // "waiting for the host..." state has no lines to fit
    const first = stageView.querySelector('.stage-label') || linesEl;
    const last = stageView.querySelector('.stage-footer') || linesEl;
    // Budget against stageView.clientHeight, not window.innerHeight --
    // window.innerHeight ignores the real header/footer chrome around the
    // stage view (in the default, non-presentation-mode state), which used
    // to make this budget too generous and let text overflow anyway.
    // clientHeight is now safe to use for this because styles.css makes
    // .stage-view a flex item that fills exactly the space `main` actually
    // has left (`flex:1 1 auto; min-height:0`) instead of an independent
    // `min-height:100vh` floor -- so it's a fixed number set by the layout,
    // not a "moving target" that grows to match whatever font-size we last
    // tried.
    const cs = getComputedStyle(stageView);
    const budget = stageView.clientHeight - (parseFloat(cs.paddingTop)||0) - (parseFloat(cs.paddingBottom)||0);
    // 67/18 are the un-scaled ceiling/floor (67 matches .stage-lines p's
    // clamp() upper bound, 4.2rem @ 16px root); hostStageFontScale (see its
    // own comment above, near SPLIT_VIEW_KEY) is the host's "make it
    // bigger" preference on top of that -- scaling MIN_PX too, not just
    // MAX_PX, so asking for bigger text doesn't get undercut by the OLD
    // floor on a long passage that still needs to shrink to fit.
    const MAX_PX = Math.round(67 * hostStageFontScale), MIN_PX = Math.round(18 * hostStageFontScale), STEP = 2;
    // Setting the --stage-font-size custom property here, not
    // linesEl.style.fontSize -- the actual text lives in the `.stage-lines
    // p` children below this div, which read their size from that property
    // (see styles.css). A plain inline font-size on this wrapper would just
    // sit there unused: those children have their own font-size rule, which
    // always wins over whatever a parent's inline style would otherwise
    // hand down through inheritance.
    linesEl.style.setProperty('--stage-font-size', MAX_PX + 'px');
    let fontPx = MAX_PX;
    let guard = Math.ceil((MAX_PX - MIN_PX) / STEP) + 2;
    while(guard-- > 0){
      const used = last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
      if(used <= budget || fontPx <= MIN_PX) break;
      fontPx = Math.max(MIN_PX, fontPx - STEP);
      linesEl.style.setProperty('--stage-font-size', fontPx + 'px');
    }
  }
  // Re-fit on resize (the projector tab can get dragged to a different-
  // sized monitor, or the window resized) -- debounced, and only does
  // anything while the stage view is actually the one on screen.
  let stageFitResizeTimer = null;
  window.addEventListener('resize', function(){
    clearTimeout(stageFitResizeTimer);
    stageFitResizeTimer = setTimeout(function(){
      if(state.view === 'session-projector') fitStageLines();
    }, 120);
  });

  // Resizable PREVIEW/LIVE squares [2026-09-16] -- see hostStageColHeight's
  // own comment (near presenterSplitView) for the "why". This is the other
  // half: watching the two .host-stage-col elements (rendered fresh on
  // every renderSessionHost() call, hence re-attached every time, same as
  // attachHostPickerHandlers() and friends) for the browser's OWN native
  // `resize:vertical` drag handle (styles.css) actually changing one of
  // them, then remembering that size and keeping the other square matched.
  // Deliberately reads back the element's actual rendered (border-box)
  // height via offsetHeight rather than the ResizeObserver entry's own
  // contentRect -- contentRect is always content-box, but the inline style
  // this writes back is a plain CSS `height` (border-box, since the app's
  // global `*{box-sizing:border-box}` reset applies here too) -- mixing the
  // two would have shaved the padding off the box a little more on every
  // single drag tick.
  function attachStageColResize(){
    if(typeof ResizeObserver === 'undefined') return; // very old browser -- squares just keep growing to fit, exactly like before this feature
    const cols = document.querySelectorAll('.host-stage-col');
    if(stageColResizeObserver) stageColResizeObserver.disconnect();
    if(!cols.length) return; // split view isn't on right now -- nothing to watch

    // Reachable resize handle [2026-09-16]: styles.css's own max-height on
    // .host-stage-col can only assume the WORST case (this column pinned
    // right at its sticky top:20px offset) -- but before the host has
    // scrolled down at all, it can just as easily be sitting much lower in
    // normal page flow (e.g. right under the room-code/room-name/toolbar
    // rows above it), which leaves LESS clear room above the fixed "YOUR
    // CONTROLS" bar, not more. Left alone, a square tall enough to reach
    // that bar hides its own bottom-right corner -- and the resize handle
    // riding along with it -- underneath that fixed overlay, exactly what
    // broke the very first version of this feature's own test. Measuring
    // the column's actual current top (now that the browser has laid it
    // out) and the bar's actual current height fixes that precisely,
    // instead of guessing from a flat vh number. Safe to compute once here
    // rather than track on every scroll event: scrolling down only ever
    // moves this sticky column UP the screen as it settles into its
    // pinned position, which frees up MORE room below it, never less, so
    // a bound taken at attach time stays a safe (if slightly conservative
    // once scrolled) cap for the rest of this render's lifetime.
    const nowLiveBarEl = document.getElementById('nowLiveBar');
    const nowLiveBarH = nowLiveBarEl ? nowLiveBarEl.offsetHeight : 90;
    cols.forEach(function(col){
      const top = col.getBoundingClientRect().top;
      const safeMax = Math.max(220, Math.floor(window.innerHeight - top - nowLiveBarH - 24));
      col.style.maxHeight = safeMax + 'px';
    });

    // ResizeObserver fires once immediately for every element right when
    // observe() is called, reporting its size as-is -- that first callback
    // is just a snapshot, not a drag, and this function gets called fresh
    // after EVERY render (song/verse/sermon changes included, not just
    // split-view toggling), so treating it as a real resize would wrongly
    // "pin" the square to whatever a brand new song/verse happened to
    // measure at, the very first time it's shown. Ignoring exactly one
    // batch per attach -- but not any batch after that -- still catches a
    // real drag: dragging the native handle fires MANY callbacks in a row
    // on the same observer instance (this one isn't replaced mid-drag
    // unless something else re-renders the whole page in the middle of it).
    let ignoredInitialBatch = false;
    stageColResizeObserver = new ResizeObserver(function(entries){
      if(!ignoredInitialBatch){ ignoredInitialBatch = true; return; }
      entries.forEach(function(entry){
        const h = Math.round(entry.target.offsetHeight);
        if(!h || h === hostStageColHeight) return;
        hostStageColHeight = h;
        safeSet(STAGE_COL_HEIGHT_KEY, String(h));
        cols.forEach(function(col){
          if(col !== entry.target) col.style.height = h + 'px';
        });
      });
    });
    cols.forEach(function(col){ stageColResizeObserver.observe(col); });
  }

  // Projector keyboard shortcuts [2026-09-04] -- Jared: "a host who wants
  // to control from the same screen as the display." Space/Right Arrow
  // advances, Left Arrow goes back -- exactly the Prev/Next actions the
  // host's own controls screen already has (changeSermonSlide()/
  // changeSection()), just reachable from the projector tab itself now.
  // Deliberately gated on the CURRENTLY SIGNED-IN account in THIS tab
  // being the room's own host (room.hostUid === state.user.uid) -- the
  // projector route sets state.isHost = false unconditionally (see the
  // startup-routing block below) since ?stage= is meant to be openable
  // read-only by anyone with the code, so canControlRoom() (owner OR
  // whoever currently holds controllerUid -- see the co-hosting comments
  // near isRoomOwner()/canControlRoom() up near hasFullAccess()) is the
  // actual safety check here, same reasoning RESUME HOSTING/resumeAsHost()
  // uses -- widened [2026-09-05] so a co-host who's been handed control can
  // also drive from a projector tab they opened, not just the room's owner.
  // Without this gate, a congregant who opened the same link on their own
  // device could hijack what's showing for the whole room -- exactly what
  // the original "projector tab is meant to be look-only" design comment
  // was guarding against; this only widens WHO can drive it, not whether
  // driving it should be checked at all. A single always-on listener
  // (rather than wiring/unwiring per render) mirrors the resize listener
  // just above -- cheap to check and skip on every keypress that isn't
  // relevant. Mirrors the exact same isSermon/isVerse/showNav gating the
  // Now Live bar's own Prev/Next buttons use, so a keypress can never
  // advance something whose nav buttons wouldn't even be showing (e.g. a
  // presented verse, which has nothing to advance through).
  document.addEventListener('keydown', function(e){
    if(state.view !== 'session-projector') return;
    if(e.key !== ' ' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const room = state.room;
    if(!canControlRoom(room)) return;
    // Stage overrides [2026-09-24]: resolveLiveDisplayContent(), not
    // resolveRoomContent() -- while blacked out/showing the logo/default
    // bg, content.song/content.slide below are all undefined, so showNav
    // stays false and Space/arrow keys correctly do nothing (nothing
    // visible to advance through).
    const content = resolveLiveDisplayContent(room);
    const isSermon = content.type === 'sermon';
    const isVerse = content.type === 'verse';
    // Media/AVP [2026-09-06] -- a live 'slideshow' pages through content.slides
    // exactly like a sermon's slide array (same advance-by-delta shape); a
    // live 'video' has no slides at all, so Space toggles PLAY/PAUSE instead
    // of trying to "advance" anything -- same "controls what's already
    // showing" reasoning mediaPlayPause()'s own comment gives for why
    // transport is a direct live write, not staged through hostPreview.
    const isMedia = content.type === 'media';
    const isMediaSlideshow = isMedia && content.media && content.media.type === 'slideshow';
    const isMediaVideo = isMedia && content.media && content.media.type === 'video';
    if(isMediaVideo && e.key === ' '){
      e.preventDefault();
      mediaPlayPause();
      return;
    }
    const showNav = (!isSermon && !isVerse && !isMedia && content.song) ||
      (isSermon && content.slide) || (isMediaSlideshow && content.slides.length > 0);
    if(!showNav) return;
    e.preventDefault();
    const delta = e.key === 'ArrowLeft' ? -1 : 1;
    // Preview/Go Live [2026-09-06]: deliberately advanceLiveSermonSlide()/
    // advanceLiveMediaSlide()/advanceLiveSection() here, NOT changeSermonSlide()/
    // changeSection() -- those stage into the host's own local preview draft
    // (see hostPreview), which wouldn't do anything visible on the projector
    // screen someone's standing in front of pressing space/arrows on. See
    // advanceLiveSermonSlide()'s own comment for the full reasoning.
    if(isSermon) advanceLiveSermonSlide(delta);
    else if(isMediaSlideshow) advanceLiveMediaSlide(delta);
    else advanceLiveSection(delta);
  });

  // Full-screen shortcut for projector mode [2026-09-24] -- Jared: "add a
  // shortcut in projector mode where presenters can just click F and the
  // projector goes full screen, and click escape to get out of full
  // screen." Keyboard mirror of the on-screen stage-fullscreen-btn button
  // (toggleStagePresentationMode(), see its own comment above) -- F toggles
  // the exact same presentation-mode flag the button does, so whoever's
  // standing at the projector laptop doesn't have to hunt for the small
  // expand icon in the corner. Deliberately NOT gated on canControlRoom()
  // like the space/arrow shortcut just above -- unlike advancing what's
  // showing, going full screen changes nothing about the room, only how
  // THIS tab displays it, so anyone who opened the projector link can use
  // it, same as the on-screen button itself (also ungated). Escape gets its
  // own explicit handler rather than relying only on the browser's native
  // "Escape exits real fullscreen" behavior plus the fullscreenchange
  // listener above: on a device where requestFullscreen() was refused or
  // unsupported (iOS Safari, some kiosk setups -- see
  // toggleStagePresentationMode()'s own comment), the browser was never
  // actually in real fullscreen, so there's no native fullscreen-exit for
  // Escape to trigger, and the header/footer-hiding chrome would otherwise
  // be stuck on with no way back short of editing the URL. Calling
  // toggleStagePresentationMode() here is a harmless no-op layered on top
  // of the native path when real fullscreen IS active -- the flag only
  // flips once, and exitFullscreen() on an element that's already exiting
  // just resolves/rejects quietly.
  document.addEventListener('keydown', function(e){
    if(state.view !== 'session-projector') return;
    if(e.metaKey || e.ctrlKey || e.altKey) return;
    if(e.repeat) return;
    const key = e.key;
    if(key !== 'f' && key !== 'F' && key !== 'Escape') return;
    if(key === 'Escape' && !stagePresentationMode) return; // nothing to exit
    e.preventDefault();
    toggleStagePresentationMode();
  });

  // Cross-window relay for the F shortcut above [2026-09-24 fix] -- Jared
  // tested the shortcut and it didn't do anything. Root cause: OPEN
  // PROJECTOR (openStageBtn, just above) launches the projector as a
  // SEPARATE browser window/tab (window.open()), which a presenter
  // normally drags out to the actual TV/projector output and then never
  // clicks into again -- they keep driving the service from the Host
  // Controls window/tab. A keydown listener only ever fires in whichever
  // window currently has keyboard focus, and that's the Controls window,
  // not the projector one, so the F handler just above (correctly scoped
  // to state.view==='session-projector') never saw the keypress at all.
  // Fix: let the Controls window relay the keypress to the projector
  // window instead of requiring a click into it first, via
  // BroadcastChannel -- same-origin, same-browser, no Firestore/backend
  // involved at all, so this carries none of the persistent-cache history
  // discussed elsewhere in this file. Keyed by room code (not just "any
  // projector window") so a device with more than one session's windows
  // open at once can't cross-toggle each other's projector. Gated on
  // canControlRoom(), same reasoning as the stage-override/stream-link
  // shortcuts above -- this affects what the whole room's projector output
  // is doing, not just this one tab. Once the projector window actually
  // goes full screen (assuming requestFullscreen() isn't refused), the OS
  // brings it to the foreground on its own, so a follow-up Escape press
  // lands on the now-focused projector window and is handled by the
  // listener just above -- no relay needed for exiting.
  const PROJECTOR_FULLSCREEN_CHANNEL = 'iworship:projector-fullscreen';
  const projectorFullscreenChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(PROJECTOR_FULLSCREEN_CHANNEL) : null;
  if(projectorFullscreenChannel){
    projectorFullscreenChannel.onmessage = function(e){
      if(state.view !== 'session-projector') return;
      if(!e.data || e.data.code !== state.activeRoomCode) return;
      toggleStagePresentationMode();
    };
  }
  document.addEventListener('keydown', function(e){
    if(state.view !== 'session-host') return;
    if(e.metaKey || e.ctrlKey || e.altKey) return;
    if(e.repeat) return;
    if(e.key !== 'f' && e.key !== 'F') return;
    const t = e.target;
    const tag = t && t.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    const room = state.room;
    if(!room || !canControlRoom(room)) return;
    if(!projectorFullscreenChannel || !state.activeRoomCode) return;
    e.preventDefault();
    projectorFullscreenChannel.postMessage({ code: state.activeRoomCode });
  });

  // Preview/Go Live [2026-09-06] -- Jared: "...he can [...] double enter in
  // the keyboard for PC." A double-Enter within DOUBLE_ENTER_WINDOW_MS
  // publishes the host's staged preview (see goLive()), mirroring the
  // GO LIVE button for anyone on a physical keyboard who'd rather not reach
  // for the mouse/trackpad. Scoped to state.view==='session-host' (single
  // always-on listener, same pattern as the projector shortcut just above)
  // and skips typing contexts (search boxes, the verse reference field,
  // etc.) so it can never hijack an ordinary Enter keypress there.
  const DOUBLE_ENTER_WINDOW_MS = 600;
  let lastEnterPressAt = 0;
  document.addEventListener('keydown', function(e){
    if(state.view !== 'session-host') return;
    if(e.key !== 'Enter') return;
    const t = e.target;
    const tag = t && t.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    const now = Date.now();
    const isDoublePress = (now - lastEnterPressAt) < DOUBLE_ENTER_WINDOW_MS;
    lastEnterPressAt = now;
    if(!isDoublePress) return;
    e.preventDefault();
    lastEnterPressAt = 0; // consume both presses -- a third quick Enter shouldn't fire a second GO LIVE
    goLive();
  });

  // Double-Space to go live [2026-09-08] -- Jared: "add double space short
  // cut as well for going live, it seems intuitive." Exact mirror of the
  // double-Enter listener just above (own press-tracking variable/window,
  // same typing-context guard, same "consume both presses" reset) -- kept
  // as its own separate listener rather than folding into that one so each
  // key's double-press timing stays completely independent (pressing Enter
  // once then Space once within the window should never combine into a
  // false double-press of either). Safe to bind bare Space here with no
  // e.repeat guard needed beyond the existing double-press gate: this is
  // state.view==='session-host', not session-projector -- Space has no
  // OTHER meaning on this screen (the projector's own Space shortcut, just
  // above, advances LIVE content directly and is a completely different
  // view).
  // [2026-09-08 fix] -- Jared: "annoying when you click space space, the
  // page scrolls down, can you remove that?" / "I mean remove the
  // scrolling down not the shortcut." Unlike Enter, a bare Space press has
  // a browser-native default action here (scroll the viewport down) --
  // and that default fires on the FIRST press, before this code can know
  // a second press is coming, so preventDefault() only on the confirmed
  // double-press (the old behavior) was too late to stop it. Fix:
  // preventDefault() on every qualifying Space press, not just the
  // confirmed double. The one case that must still get native Space
  // behavior is a focused button/link (Space should activate it, not be
  // swallowed globally) -- guard that out first, before doing anything
  // else, same as the INPUT/TEXTAREA guard below.
  const DOUBLE_SPACE_WINDOW_MS = 600;
  let lastSpacePressAt = 0;
  document.addEventListener('keydown', function(e){
    if(state.view !== 'session-host') return;
    if(e.key !== ' ') return;
    const t = e.target;
    const tag = t && t.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    if(tag === 'BUTTON' || tag === 'A' || (t && t.getAttribute && t.getAttribute('role') === 'button')) return; // let a focused control natively activate on Space
    e.preventDefault(); // stop the page-scroll default on every qualifying press, not just a confirmed double
    const now = Date.now();
    const isDoublePress = (now - lastSpacePressAt) < DOUBLE_SPACE_WINDOW_MS;
    lastSpacePressAt = now;
    if(!isDoublePress) return;
    lastSpacePressAt = 0; // consume both presses -- a third quick Space shouldn't fire a second GO LIVE
    goLive();
  });

  // Staging keyboard shortcuts on the Host Session screen [2026-09-07] --
  // Jared: "can you add keyboard shortcuts here, like arrow keys." Left/
  // Right on the CONTROLS screen advances the STAGED preview (PREV/NEXT's
  // own actions -- changeSermonSlide()/changeMediaSlide()/changeSection()),
  // deliberately NOT the direct-live advanceLiveSermonSlide()/etc. the
  // projector's own arrow-key shortcut above uses -- that pair is for
  // someone standing at the projector wanting an immediate change on the
  // screen in front of them; this pair is for a host at a keyboard doing
  // the exact same thing PREV/NEXT already do, one step at a time, before
  // GO LIVE (or double-Enter/double-click, both just above) actually
  // publishes it. Which staging function to call is resolved fresh off
  // resolvePreviewContent() rather than passed in, since this listener is
  // a single always-on one (same pattern as the other two keydown
  // listeners here) with no render-time closure over the current preview
  // type; each staging function already no-ops safely if hostPreview isn't
  // its own type or there's nothing to navigate, so guessing wrong here is
  // harmless. Skips typing contexts, same guard the double-Enter listener
  // just above uses, so it never hijacks arrow-key text-cursor movement in
  // the verse-reference field or a search box.
  document.addEventListener('keydown', function(e){
    if(state.view !== 'session-host') return;
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const t = e.target;
    const tag = t && t.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    const room = state.room;
    if(!room || !canControlRoom(room)) return;
    const preview = resolvePreviewContent(room);
    const showNav = (preview.type === 'sermon' && preview.slide) ||
      (preview.type === 'media' && preview.media && preview.media.type === 'slideshow' && preview.slides.length > 0) ||
      (preview.type === 'song' && preview.song);
    if(!showNav) return;
    e.preventDefault();
    const delta = e.key === 'ArrowLeft' ? -1 : 1;
    if(preview.type === 'sermon') changeSermonSlide(delta);
    else if(preview.type === 'media') changeMediaSlide(delta);
    else changeSection(delta);
  });

  // Presenter toolbar keyboard shortcuts [2026-09-08] -- Jared, right after
  // double-Space above: "let's add other keyboard shortcuts for other
  // buttons in the presenter controls. Indicate them as well in the
  // interface" (see the new .kbd-hint/.icon-tool-kbd badges on the buttons
  // themselves and the .shortcuts-legend line under "Your Controls", both
  // in renderPreviewBar()/the pickerRow/presenterToolbar markup above).
  // One key per button that didn't already have a shortcut: 1-4 match the
  // SONGS/SERMON/BIBLE/MEDIA segmented tabs in on-screen order; the letters
  // are first-letter mnemonics for PROJECTOR/SPLIT SCREEN/CHAT/HOSTS, plus
  // L for chart Link (the one button whose mnemonic letter was already
  // taken by "L" having no other claim -- "copy the muSician chart Link"
  // doesn't mnemonic cleanly any other way). Deliberately calls each
  // button's own .click() rather than duplicating its handler's logic here
  // -- unlike goLive()/changeSection()/etc. above, none of these seven
  // buttons' actions are backed by a standalone named function (they're
  // small inline closures set up where each button is wired, a few
  // screens up), so simulating the actual click is what guarantees this
  // can never drift out of sync with what clicking the button by hand
  // does. Every button here is a plain non-destructive toggle/open/copy
  // action -- END SESSION and BACK were deliberately left out of this
  // list, exactly because they're NOT: a stray keypress accidentally
  // ending a live service or navigating away mid-service would be a much
  // worse mistake than a stray keypress toggling split screen.
  document.addEventListener('keydown', function(e){
    if(state.view !== 'session-host') return;
    // Never hijack a browser/OS shortcut that happens to share one of
    // these keys (Cmd/Ctrl+1 switches browser tabs, Cmd+S saves the page,
    // Cmd+P prints, Ctrl+H opens history, etc.) -- only a BARE keypress
    // (no modifier) is one of ours.
    if(e.metaKey || e.ctrlKey || e.altKey) return;
    if(e.repeat) return; // holding a key down shouldn't rapid-fire a toggle
    const t = e.target;
    const tag = t && t.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    const idByKey = {
      '1':'pickSongBtn', '2':'pickSermonBtn', '3':'pickVerseBtn', '4':'pickMediaBtn',
      'p':'openStageBtn', 's':'toggleSplitBtn', 'c':'chatFabBtn', 'h':'manageHostsBtn',
      'l':'copyChartLinkBtn',
      // Stage overrides [2026-09-24]: 'b'lack, lo'g'o, 'd'efault bg -- 'l'
      // was already taken by chart Link, so LOGO's mnemonic letter had to
      // move one letter in rather than collide.
      'b':'stageBlackBtn', 'g':'stageLogoOverrideBtn', 'd':'stageDefaultBgBtn',
      // Livestream link [2026-09-24]: 'l' was already chart Link, so this
      // uses 'k' (lin'k') instead, same "move one letter in" precedent as
      // LOGO above.
      'k':'streamLinkBtn'
    };
    const id = idByKey[e.key.toLowerCase()];
    if(!id) return;
    const btn = document.getElementById(id);
    if(!btn) return; // e.g. 'h' with no manageHostsBtn rendered -- only the room owner gets that button at all
    e.preventDefault();
    btn.click();
  });

  // Musician chart view [2026-09-04] -- Jared: "what if when the presenter
  // is sharing, the musicians that join can see the chords as well instead
  // of just the lyrics." Deliberately NOT another mode of the stage/
  // projector view above: that view shows one big slide at a time because
  // it's meant to be read from across a room, chrome-less and full-bleed.
  // A musician following along wants the opposite -- the WHOLE song at
  // once (so they can see what's coming, not just what's on screen right
  // now) on their own device, normal app chrome, scrollable -- so this
  // reuses the ordinary in-app page shell (see the `main-full-bleed`/
  // `stage-page` toggles in render(), which this view deliberately does
  // NOT opt into) and the exact same `.lyric-sheet.play`/`.chord`/
  // renderChordLyricLine() styling and transpose logic that Play Mode uses
  // for a single song (renderDetail(), above) -- just live-synced to
  // whichever song the host has up, with the section they're currently on
  // highlighted rather than isolated.
  let chartTransposeSteps = 0;
  function renderChartGate(title, body){
    return '<div class="chart-gate">' +
      '<p class="chart-gate-title">'+escapeHtml(title)+'</p>' +
      '<p class="chart-gate-body">'+body+'</p>' +
      '<a class="btn btn-primary" href="'+escapeAttr(window.location.origin + window.location.pathname)+'">OPEN IWORSHIP</a>' +
    '</div>';
  }
  function renderSessionChart(){
    const room = state.room;
    if(!room){
      main.innerHTML = '<div class="chart-gate"><p class="chart-gate-title">'+(state.roomLoading ? 'Connecting&hellip;' : 'This session isn&rsquo;t available.')+'</p></div>';
      return;
    }
    // Gated by the VIEWER's own account, not anything room-specific -- the
    // same canUsePlayMode() check that already gates chords everywhere
    // else (renderDetail()'s Play Mode). Chord data was already
    // public-readable in the song doc before this feature existed; this
    // only decides who the UI shows it to, so no firestore.rules change
    // is needed. watchAuth's first callback hasn't necessarily fired yet
    // on a cold page load (see the comment near watchAuth() below), so
    // this naturally re-renders into the right state once state.user/
    // state.profile actually resolve, rather than needing its own loading
    // flag.
    if(!state.user){
      main.innerHTML = renderChartGate(
        'Sign in to see the chord chart',
        'This link shows chords, not just lyrics. Sign in with your musician, music director, or premium account, then reopen this link.'
      );
      return;
    }
    if(!canUsePlayMode()){
      main.innerHTML = renderChartGate(
        'Musician access needed',
        'Chord charts are part of Play Mode &mdash; available to Musicians, Music Directors, Editors, and Premium accounts. Ask your church Admin for access, or see Plans &amp; Pricing.'
      );
      return;
    }
    const content = resolveRoomContent(room);
    let bodyHtml;
    if(content.type === 'sermon'){
      bodyHtml = content.slide ?
        ('<p class="chart-note">This session is currently showing a sermon &mdash; no chords apply.</p>' +
          '<div class="verse-block"><p class="section-label uc">SERMON</p>' + (isBlocksSlide(content.slide) ? renderSlideCanvas(content.slide,'card') : sermonLinesAsStageHtml(content.slide)) + '</div>')
        : '<p class="stage-waiting">Waiting for the host to choose a sermon&hellip;</p>';
    } else if(content.type === 'verse'){
      bodyHtml = content.verseText ?
        ('<p class="chart-note">This session is currently showing a Bible verse &mdash; no chords apply.</p>' +
          '<div class="verse-block"><p class="section-label uc">SCRIPTURE</p>' + sermonLinesAsStageHtml(verseAsSlide(content.verseRef, content.verseText, content.verseSegments)) + '</div>')
        : '<p class="stage-waiting">Waiting for the host to present a verse&hellip;</p>';
    } else if(!content.song){
      bodyHtml = '<p class="stage-waiting">Waiting for the host to choose a song&hellip;</p>';
    } else {
      const song = content.song;
      const activeIdx = room.currentSectionIndex;
      // [2026-09-10] songSectionsForPresenting() prepends the synthetic
      // title slide (see its own comment) -- using the raw song.sections
      // array here instead would make activeIdx off by one against it, so
      // this musician chart would highlight the wrong section as "NOW"
      // whenever the title slide is actually live.
      bodyHtml =
        '<div class="control-bar" style="margin-bottom:22px;">' +
          '<div class="control-group"><span class="control-label uc">Key</span><div class="stepper">' +
            '<button id="chartKeyDown" aria-label="Transpose down a half step">&minus;</button>' +
            '<span class="val">'+transposeKeyLabel(song.key, chartTransposeSteps)+'</span>' +
            '<button id="chartKeyUp" aria-label="Transpose up a half step">+</button></div></div>' +
        '</div>' +
        songSectionsForPresenting(song).map(function(sec, i){
          return '<div class="verse-block '+sec.type+(i===activeIdx?' chart-active-section':'')+'">' +
            '<p class="section-label uc type-'+sec.type+'">'+(sec.type==='title'?'TITLE':sec.label)+(i===activeIdx?' <span class="live-badge chart-now-badge"><span class="live-dot"></span>NOW</span>':'')+'</p>' +
            sec.lines.map(function(l){ return '<p class="lyric-line">'+renderChordLyricLine(l, chartTransposeSteps)+'</p>'; }).join('') +
          '</div>';
        }).join('') +
        '<p class="capo-note">Transposing here only changes what you see &mdash; it doesn&rsquo;t affect the congregation&rsquo;s display or anyone else&rsquo;s chart.</p>';
    }
    main.innerHTML =
      '<span class="live-badge"><span class="live-dot"></span>MUSICIAN CHART</span>' +
      '<p style="text-align:center;color:var(--ink-soft);margin:12px 0 0;">'+escapeHtml(room.name)+(room.churchName?' &middot; '+escapeHtml(room.churchName):'')+'</p>' +
      '<div class="lyric-sheet play" style="margin-top:20px;">' + bodyHtml + '</div>';
    const kd = document.getElementById('chartKeyDown'), ku = document.getElementById('chartKeyUp');
    if(kd) kd.addEventListener('click', function(){ chartTransposeSteps -= 1; renderSessionChart(); });
    if(ku) ku.addEventListener('click', function(){ chartTransposeSteps += 1; renderSessionChart(); });
  }

  // Read-only preview of the exact same live slide, styled big and clean --
  // shared by renderSessionProjector() above (full chrome-less screen) and
  // renderSessionHost()'s in-page "split screen" toggle (one column among
  // the host's controls). Takes the already-resolved content (see
  // resolveRoomContent() above) rather than a room/song/section triple, so
  // it works the same whether the room is currently showing a song section
  // or a sermon slide.
  // Chords [2026-09-05] -- Jared: "I told you to remove the chords from the
  // share screen, it should only be an option when musicians join the
  // session on their phones." This supersedes the earlier per-viewer
  // canUsePlayMode() gating (see git history) -- chords are now NEVER
  // rendered here, for anyone, on either call site (the shared ?stage=
  // projector screen or the host's own split-screen preview column). The
  // only place chords still appear is the separate ?chart= musician chart
  // route (renderSessionChart() above), which a musician opens on their
  // own phone/device and which is unaffected by this function.
  // Fade transition [2026-09-06] -- Jared: "can we add a quick fade
  // transition to any change in the live view?" Both call sites (the
  // shared ?stage= projector and the split-screen host stage column) fully
  // rebuild their markup on every render(), including ones that have
  // nothing to do with the slide itself (a chat message, a co-host change,
  // the split/expand toggles) -- so simply CSS-animating every render would
  // replay the fade constantly, not just on an actual content change.
  // lastStageSignatures tracks the previous call's content identity (which
  // song/section, which sermon/slide, which verse) so the fade-in class is
  // only applied when it actually differs from last time. Each browser tab
  // (the projector page, vs. the host's own page) has its own separate copy
  // of this whole module, so there's no cross-talk between them. Keyed by
  // `trackKey` (see renderStageSlide()) rather than a single scalar since
  // the preview-alongside-live split view [2026-09-08] calls this twice per
  // render -- once for the staged PREVIEW column, once for the read-only
  // LIVE column -- and those two streams change independently of each
  // other; a single shared signature would falsely fade (or fail to fade)
  // whichever column's call happened to run second.
  let lastStageSignatures = {};
  function stageContentSignature(content){
    if(content.type === 'stage-override') return 'stage-override:'+content.mode;
    if(content.type === 'sermon') return 'sermon:'+(content.sermon?content.sermon.id:'')+':'+content.slideIndex;
    if(content.type === 'verse') return 'verse:'+content.verseRef;
    if(content.type === 'song') return 'song:'+(content.song?content.song.id:'')+':'+content.sectionIndex;
    // Media/AVP [2026-09-06]: deliberately excludes mediaPlaying/the clock
    // fields -- a play/pause/restart shouldn't replay the fade-in (see
    // renderStageSlide()'s media branch + syncStageMediaVideo(), which
    // handle a video's own play-state changes without recreating the
    // element's fade wrapper).
    if(content.type === 'media') return 'media:'+(content.media?content.media.id:'')+':'+content.slideIndex;
    return 'none';
  }
  function renderStageSlide(content, trackKey){
    const key = trackKey || 'default';
    const sig = stageContentSignature(content);
    const fadeClass = (sig !== lastStageSignatures[key]) ? ' stage-fade-in' : '';
    lastStageSignatures[key] = sig;
    // Default Presentation Background, applied here -- see
    // presenterStageBg()'s own comment above for the full design. Only
    // song lyrics and an OLD, not-yet-migrated legacy sermon slide (no
    // background concept of its own) ever use this fallback; a blocks-based
    // sermon slide always has its OWN background field (defaulted to this
    // same image at creation time by newSermonSlide(), but freely
    // overridable per slide afterward), so it's deliberately excluded here
    // to avoid two different code paths fighting over the same slide.
    const stageBg = presenterStageBg();
    let inner;
    if(content.type === 'sermon'){
      // Presentation builder [2026-09-08]: a blocks-based slide is fully
      // custom-authored (its own background, its own text/image placement)
      // so it renders chromeless -- no fixed "SERMON" label or sermon-title
      // footer layered on top, the same reasoning Media/AVP content is
      // chromeless (see the 'media' branch below). An old, not-yet-migrated
      // legacy slide keeps the original labeled/footed treatment untouched.
      inner = !content.slide ? '<p class="stage-waiting">Waiting for the host to choose a sermon&hellip;</p>' :
        (isBlocksSlide(content.slide) ? renderSlideCanvas(content.slide, 'stage') :
          ('<p class="stage-label uc">SERMON</p>' +
          '<div class="stage-lines">' + sermonLinesAsStageHtml(content.slide) + '</div>' +
          (content.sermon ? '<p class="stage-footer">'+escapeHtml(content.sermon.title)+'</p>' : '')));
    } else if(content.type === 'verse'){
      inner = !content.verseText ? '<p class="stage-waiting">Waiting for the host to present a verse&hellip;</p>' :
        ('<p class="stage-label uc">SCRIPTURE</p>' +
        '<div class="stage-lines">' + sermonLinesAsStageHtml(verseAsSlide(content.verseRef, content.verseText, content.verseSegments)) + '</div>');
    } else if(content.type === 'stage-override'){
      // Stage overrides [2026-09-24] -- see resolveRoomContent()'s comment.
      // Deliberately chromeless (no stage-label/stage-footer), same
      // reasoning as the 'media' branch just below -- these are meant to
      // fill the whole screen, not read as a lyric slide.
      if(content.mode === 'logo'){
        const logo = presenterLogoUrl();
        inner = logo ?
          '<div class="stage-media-frame"><img class="stage-media-img" src="'+escapeAttr(logo.url)+'" alt=""></div>' :
          '<p class="stage-waiting">No presentation logo uploaded yet &mdash; add one in Settings.</p>';
      } else if(content.mode === 'default-bg'){
        inner = stageBg ?
          '<div class="stage-media-frame stage-bg-only-frame"><img class="stage-media-img" src="'+escapeAttr(stageBg.url)+'" alt=""></div>' :
          '<p class="stage-waiting">No presentation background uploaded yet &mdash; add one in Settings.</p>';
      } else {
        // 'black' (also the fallback for any unrecognized value) -- a
        // plain black frame, .stage-media-frame's own background:#000.
        inner = '<div class="stage-media-frame"></div>';
      }
    } else if(content.type === 'media'){
      // Media/AVP [2026-09-06] -- deliberately chromeless (no stage-label/
      // stage-footer) for image/slideshow/video/embed: these are meant to
      // fill the screen the way an imported presentation or video would in
      // EasyWorship/ProPresenter, not read as a lyric slide. See
      // syncStageMediaVideo() just below for how a 'video' element's actual
      // playback follows the room's synced clock once this markup lands in
      // the DOM.
      if(!content.media){
        inner = '<p class="stage-waiting">Waiting for the host to choose media&hellip;</p>';
      } else if(content.media.type === 'image'){
        inner = '<div class="stage-media-frame"><img class="stage-media-img" src="'+escapeAttr(content.media.url)+'" alt=""></div>';
      } else if(content.media.type === 'slideshow'){
        const slide = content.slides[content.slideIndex];
        inner = '<div class="stage-media-frame"><img class="stage-media-img" src="'+escapeAttr(slide?slide.url:'')+'" alt=""></div>';
      } else if(content.media.type === 'video'){
        inner = '<div class="stage-media-frame">' +
          '<video class="stage-media-video" src="'+escapeAttr(content.media.url)+'" muted playsinline></video>' +
          '<button type="button" class="stage-media-unmute" id="stageMediaUnmuteBtn" aria-label="Unmute"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('volumeMute')+'</svg></button>' +
        '</div>';
      } else {
        // 'embed' -- slide navigation happens inside this iframe itself,
        // using whichever controls the provider renders (see
        // interface.md's "embed" note).
        inner = '<div class="stage-media-frame"><iframe class="stage-media-embed" src="'+escapeAttr(content.media.embedUrl||'')+'" allow="autoplay; fullscreen" allowfullscreen></iframe></div>';
      }
    } else if(!content.song){
      inner = '<p class="stage-waiting">Waiting for the host to choose a song&hellip;</p>';
    } else {
      inner = '<p class="stage-label uc type-'+content.section.type+'">'+content.section.label+'</p>' +
        '<div class="stage-lines type-'+content.section.type+'">' + content.section.lines.map(function(l){
          return '<p>'+escapeHtml(l.replace(/\[[^\]]*\]/g,''))+'</p>';
        }).join('') + '</div>' +
        // [2026-09-10] the song title already IS the big line on the title
        // slide itself (see songSectionsForPresenting()) -- repeating it a
        // second time in the small footer directly underneath would just
        // look like a typo/duplicate, so it's the one section type that
        // skips this footer.
        (content.section.type === 'title' ? '' : '<p class="stage-footer">'+escapeHtml(content.song.title)+'</p>');
    }
    const usesStageBg = !!stageBg && (
      content.type === 'song' ||
      (content.type === 'sermon' && content.slide && !isBlocksSlide(content.slide))
    );
    return usesStageBg ?
      ('<div class="stage-slide-body'+fadeClass+' stage-slide-body-custom-bg">' +
        '<img class="stage-slide-bg-img" src="'+escapeAttr(stageBg.url)+'" alt="">' +
        '<div class="stage-slide-inner">' + inner + '</div>' +
      '</div>') :
      ('<div class="stage-slide-body'+fadeClass+'">' + inner + '</div>');
  }

  // Media/AVP [2026-09-06] -- makes the `.stage-media-video` element
  // renderStageSlide() just wrote actually follow the room's synced
  // playback clock (see the Room shape note in interface.md and
  // mediaPlayPause()/mediaRestart()). Called after every render that might
  // have (re)painted a stage view showing a live video -- the projector
  // view, and the split-screen host stage column. No-ops instantly if
  // there's no `<video>` on screen right now (every other content type, or
  // 'video' content but split-screen not toggled on).
  //
  // Browser autoplay policy note: the element is always rendered `muted`,
  // which every browser allows to autoplay with no user gesture required --
  // the UNMUTE button layered on top (see renderStageSlide()) is what a
  // browser's autoplay policy actually requires a real click/tap for on
  // whichever specific tab/device someone wants sound from (the projector
  // laptop, most likely) -- there is no way around that requirement from
  // JS, so this app doesn't try to auto-unmute.
  function syncStageMediaVideo(content, room){
    const el = document.querySelector('.stage-media-video');
    if(!el || content.type !== 'media' || !content.media || content.media.type !== 'video') return;
    const wantSec = currentMediaClockSeconds(room);
    if(Math.abs((el.currentTime||0) - wantSec) > 0.75) el.currentTime = wantSec;
    if(content.mediaPlaying){
      if(el.paused) el.play().catch(function(){ /* needs a user gesture on this tab -- the unmute button doubles as one once tapped */ });
    } else if(!el.paused){
      el.pause();
    }
    const unmuteBtn = document.getElementById('stageMediaUnmuteBtn');
    if(unmuteBtn && !unmuteBtn.dataset.wired){
      unmuteBtn.dataset.wired = '1';
      unmuteBtn.addEventListener('click', function(){
        el.muted = !el.muted;
        unmuteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon(el.muted?'volumeMute':'volumeOn')+'</svg>';
        if(!el.muted) el.play().catch(function(){});
      });
    }
  }

  /* ============ FELLOWSHIP [2026-09-08] ============
     Jared: "create something like a social media in here as well...
     a profile complete with their own social details... post anything...
     plain text, videos, images... a bio... profile pics... DMs...
     group chats... maybe like add 'favorite hymnals'." Confirmed
     cross-church (no data walls, same as the hymnal) and confirmed to
     include block/report from day one. See src/data/interface.md's
     "FELLOWSHIP" section for the data shapes and firestore.rules for the
     real enforcement -- everything below is UI only; every write still
     goes through the same data-layer functions (createPost/sendDmMessage/
     etc.) that both data layers implement identically. */

  // ---- shared helpers -------------------------------------------------
  // Looks a uid up in the directory (name/church/photo/bio/favorites --
  // see watchDirectory()'s comment for why these specific fields are
  // public). Returns null if that person hasn't set a display name yet
  // (same "effectively unsearchable" case watchDirectory()/its rules
  // comment already describes) or isn't loaded yet.
  function directoryEntry(uid){ return state.directory.find(function(d){ return d.uid === uid; }) || null; }
  function personLabel(uid){
    const d = directoryEntry(uid);
    return d ? (escapeHtml(d.displayName||'(no name set)') + (d.churchName ? ' <span class="hint">&middot; '+escapeHtml(d.churchName)+'</span>' : '')) : '<span class="hint">(unknown)</span>';
  }
  function personAvatar(uid, size){
    let d = directoryEntry(uid);
    // [Bug found 2026-09-09, fixed v32] the header's OWN avatar (see the
    // topbar/menu-button render calls to personAvatar(state.user.uid, ...))
    // was going blank/initial-only on every reload, then reappearing only
    // after visiting My Profile or another screen that happens to call
    // startDirectoryWatch(). Root cause: this function reads the person's
    // photo from state.directory (via directoryEntry()), but
    // startDirectoryWatch() is only started from specific view-open
    // handlers (Sermons, Messages, My Profile, Admin, etc.) -- see its
    // definition and comment -- NOT unconditionally at sign-in like the
    // other "app-wide the moment someone signs in" watches just above it.
    // So right after a reload, state.directory is still empty until the
    // user happens to open one of those views.
    //
    // state.profile, by contrast, IS populated immediately and reliably on
    // every sign-in/reload via watchProfile() (see watchAuth() above) --
    // it's the actual source of truth the directory entry is only a
    // denormalized mirror of. So for the signed-in user's OWN avatar
    // specifically, fall back to state.profile whenever the directory
    // entry isn't loaded yet (or hasn't picked up a photo yet). This only
    // affects uid === state.user.uid -- other people's avatars are
    // unchanged and still depend on the directory watch as before.
    if(state.user && uid === state.user.uid && state.profile && (!d || !d.photoURL)){
      d = { photoURL: state.profile.photoURL || (d && d.photoURL) || null, displayName: (d && d.displayName) || state.profile.displayName || '' };
    }
    const px = size || 40;
    if(d && d.photoURL) return '<img class="avatar-circle" src="'+escapeAttr(d.photoURL)+'" alt="" style="width:'+px+'px;height:'+px+'px;">';
    const initial = d && d.displayName ? d.displayName.trim().charAt(0).toUpperCase() : '?';
    return '<span class="avatar-fallback" style="width:'+px+'px;height:'+px+'px;font-size:'+Math.round(px*0.42)+'px;">'+escapeHtml(initial)+'</span>';
  }
  function isBlockedByMe(uid){ return !!(state.profile && (state.profile.blockedUids||[]).includes(uid)); }
  // Fellowship posts/messages reuse the existing timeAgo(ms)/toMillis(ts)
  // pair (declared up near the AUTH/PROFILE section) rather than defining
  // a second one -- postAge() is just that pairing under one name, since
  // every Fellowship createdAt is a Firestore Timestamp (real backend) or
  // a plain epoch number (demo mode), exactly what toMillis() already
  // normalizes for every other timestamp in this file.
  function postAge(ts){ return timeAgo(toMillis(ts)); }

  // ---- social redesign helpers [2026-09-09] ------------------------------
  // Engagement counts: usingDemoMode computes them fresh from the local
  // layer's flat likes/comments/posts arrays every render (see
  // local-data-layer.js's likeCountFor/commentCountFor/repostCountFor);
  // the real Firestore layer instead keeps them as denormalized fields
  // directly on the post/short doc (see that file's increment() calls) --
  // either way, the CALLER (renderFeedPostCard/renderShortCard) never needs
  // to know which, it just calls these.
  function itemLikeCount(kind, item){ return usingDemoMode ? likeCountFor(kind, item.id) : (item.likeCount||0); }
  function itemCommentCount(kind, item){ return usingDemoMode ? commentCountFor(kind, item.id) : (item.commentCount||0); }
  function postRepostCount(p){ return usingDemoMode ? repostCountFor(p.id) : (p.repostCount||0); }
  function isLikedByMe(kind, itemId){ return state.myLikedKeys.has(kind+':'+itemId); }
  function isSavedByMe(kind, itemId){ return state.mySavedKeys.has(kind+':'+itemId); }
  function isFollowingUid(uid){ return state.myFollowing.has(uid); }
  function followerCountOf(uid){ const d = directoryEntry(uid); return (d && d.followerCount) || 0; }
  function followingCountOf(uid){ const d = directoryEntry(uid); return (d && d.followingCount) || 0; }

  // Fires a notification into recipientUid's inbox -- a thin wrapper so
  // every action site (like/comment/follow/repost) calls ONE function
  // instead of each remembering the createNotification() shape by hand.
  // Silently swallows a failure (a notification is a nice-to-have, never
  // something worth blocking or erroring the actual action over -- same
  // "best effort" tolerance this app already gives e.g. deleteMediaFile()).
  function notify(recipientUid, payload){
    if(!state.user || recipientUid === state.user.uid) return;
    createNotification(recipientUid, { actorUid: state.user.uid, actorName: currentDisplayName() || 'Someone', ...payload }).catch(function(){ /* best effort */ });
  }

  // Diagnostic-error-surfacing helper [2026-09-09, v25] -- a real Firestore
  // permission/network failure from any of the cross-account social actions
  // just below used to disappear into a generic "try again" toast with no
  // way to tell WHY from a phone with no devtools open. This appends the
  // underlying error's code (e.g. "permission-denied", "unavailable") right
  // onto the toast text, and always logs the full error to the console too,
  // so a real failure is actually diagnosable instead of a dead end.
  function describeError(e){
    console.error(e);
    // [2026-09-09, v27] v25's version only appended something when the
    // error had a `.code` (true for most Firebase SDK errors) -- but not
    // every failure does (a plain network error, a thrown string, a CORS
    // failure surfaced by the browser rather than the SDK), and when it
    // didn't, this silently returned '' -- making the toast look EXACTLY
    // like the old undiagnosed one, with no visible sign anything had
    // changed. Now falls back to `.message`, then a plain string
    // conversion, so there's always SOMETHING to read off the screen.
    if(!e) return '';
    const detail = e.code || e.message || String(e);
    return detail ? ' (' + detail + ')' : '';
  }

  async function toggleLike(kind, itemId, recipientUid){
    if(!state.user) { showToast('Sign in to like this.'); return; }
    const key = kind+':'+itemId;
    try{
      if(state.myLikedKeys.has(key)){ await unlikeItem(kind, itemId, state.user.uid); }
      else {
        await likeItem(kind, itemId, state.user.uid);
        notify(recipientUid, { type:'like', kind: kind, itemId: itemId });
      }
    }catch(e){ showToast('Couldn&rsquo;t update that &mdash; try again.' + describeError(e)); }
  }
  async function toggleSaveItem(kind, itemId){
    if(!state.user) { showToast('Sign in to save this.'); return; }
    try{ await toggleSave(state.user.uid, kind, itemId); }
    catch(e){ showToast('Couldn&rsquo;t update that &mdash; try again.' + describeError(e)); }
  }
  async function toggleFollow(targetUid){
    if(!state.user){ showToast('Sign in to follow people.'); return; }
    if(targetUid === state.user.uid) return;
    try{
      if(state.myFollowing.has(targetUid)){ await unfollowUser(state.user.uid, targetUid); showToast('Unfollowed.'); }
      else { await followUser(state.user.uid, targetUid); notify(targetUid, { type:'follow' }); showToast('Following.'); }
    }catch(e){ showToast('Couldn&rsquo;t update that &mdash; try again.' + describeError(e)); }
  }
  async function doRepost(post){
    if(!state.user){ showToast('Sign in to repost.'); return; }
    try{
      await repostPost(state.user.uid, currentDisplayName() || 'Someone', post);
      notify(post.authorUid, { type:'repost', kind:'posts', itemId: post.id });
      showToast('Reposted to your profile.');
    }catch(e){ showToast('Couldn&rsquo;t repost &mdash; try again.' + describeError(e)); }
    render();
  }

  // ---- feed watch -------------------------------------------------------
  // (unsubFeedPosts itself is declared earlier, up by unsubDirectory --
  // see the comment there.)
  function stopFeedPostsWatch(){ if(unsubFeedPosts){ unsubFeedPosts(); unsubFeedPosts = null; } }
  function startFeedPostsWatch(){
    stopFeedPostsWatch();
    unsubFeedPosts = watchFeedPosts(function(posts){
      state.feedPosts = posts;
      // 'landing' [2026-09-10] -- the home hub's compact Fellowship preview
      // (see renderLanding()) reads state.feedPosts too now.
      if(state.view === 'fellowship' || state.view === 'landing') render();
    });
  }
  // Home hub [2026-09-10] -- the landing page's Fellowship preview needs
  // state.feedPosts/state.directory live, same as the full Fellowship feed
  // does, but landing is reached from dozens of places (sign-out, every
  // BACK button, app boot) rather than one single "navigate here" click
  // handler -- so rather than start the watch at every one of those call
  // sites, renderLanding() below calls this once per app session (guarded
  // by the flag) the first time it actually renders while signed in.
  // (landingSocialWatchesStarted itself is declared earlier, up by the
  // other landing-related `let`s -- see the comment there.)
  function ensureLandingSocialWatchesStarted(){
    if(landingSocialWatchesStarted || !state.user) return;
    landingSocialWatchesStarted = true;
    startFeedPostsWatch();
    startDirectoryWatch();
  }

  // ---- a single profile's posts (profile-view screen) -------------------
  let unsubViewProfilePosts = null;
  function stopViewProfilePostsWatch(){ if(unsubViewProfilePosts){ unsubViewProfilePosts(); unsubViewProfilePosts = null; } }
  function startViewProfilePostsWatch(uid){
    stopViewProfilePostsWatch();
    unsubViewProfilePosts = watchUserPosts(uid, function(posts){
      state.viewProfilePosts = posts;
      if(state.view === 'profile-view') render();
    });
  }

  // ---- DM threads (inbox) + one open thread's messages -------------------
  let unsubMyDmThreads = null;
  function stopMyDmThreadsWatch(){ if(unsubMyDmThreads){ unsubMyDmThreads(); unsubMyDmThreads = null; } }
  function startMyDmThreadsWatch(){
    stopMyDmThreadsWatch();
    if(!state.user) return;
    // [v36] Was gated to render() only while inside a Messages view --
    // now app-wide (called from startSocialWatches() too) so the topbar
    // Messages badge/dropdown stay live from any screen, same as the
    // notifications watch just above it.
    unsubMyDmThreads = watchMyDmThreads(state.user.uid, function(threads){
      state.myDmThreads = threads;
      render();
    });
  }
  let unsubDmMessages = null;
  function stopDmMessagesWatch(){ if(unsubDmMessages){ unsubDmMessages(); unsubDmMessages = null; } }
  function startDmMessagesWatch(threadId){
    stopDmMessagesWatch();
    unsubDmMessages = watchDmMessages(threadId, function(messages){
      state.activeDmMessages = messages;
      if(state.view !== 'dm-thread') return;
      // Patch #threadScrollBody in place rather than a full render() -- see
      // watchChat()'s "patch the message list in place" comment above (the
      // in-session chat) for the original rationale, and openChatDock()'s
      // matching fix for the same bug in the floating dock: this watcher
      // fires again the instant your OWN just-sent message round-trips back
      // through Firestore/the local layer, and a full render() would tear
      // down and rebuild #dmComposerInput from scratch, silently dropping
      // focus and needing another click to type the next message. Jared:
      // "when I type in messages and click enter and try to type again, I
      // can't because I have to click on the chat box again" [2026-09-14].
      const el = document.getElementById('threadScrollBody');
      if(el){ el.innerHTML = renderDmMessagesHtml(messages, state.user.uid); el.scrollTop = el.scrollHeight; }
      else { render(); scrollThreadToBottom(); }
    });
  }

  // ---- group chats (inbox) + one open group's messages -------------------
  let unsubMyGroupChats = null;
  function stopMyGroupChatsWatch(){ if(unsubMyGroupChats){ unsubMyGroupChats(); unsubMyGroupChats = null; } }
  function startMyGroupChatsWatch(){
    stopMyGroupChatsWatch();
    if(!state.user) return;
    // [v36] Same app-wide change as startMyDmThreadsWatch() above.
    unsubMyGroupChats = watchMyGroupChats(state.user.uid, function(groups){
      state.myGroupChats = groups;
      render();
    });
  }
  let unsubGroupChat = null;
  function stopGroupChatWatch(){ if(unsubGroupChat){ unsubGroupChat(); unsubGroupChat = null; } }
  let unsubGroupMessages = null;
  function stopGroupMessagesWatch(){ if(unsubGroupMessages){ unsubGroupMessages(); unsubGroupMessages = null; } }
  function startGroupChatThreadWatch(groupId){
    stopGroupChatWatch(); stopGroupMessagesWatch();
    unsubGroupChat = watchGroupChat(groupId, function(group){
      state.activeGroupChat = group;
      if(!group && state.view === 'group-chat-thread'){
        // Group was deleted, or this account was removed from it elsewhere.
        showToast('This group chat is no longer available.');
        closeGroupChatThread();
        return;
      }
      if(state.view === 'group-chat-thread') render();
    });
    unsubGroupMessages = watchGroupChatMessages(groupId, function(messages){
      state.activeGroupMessages = messages;
      if(state.view !== 'group-chat-thread') return;
      // Same patch-in-place fix as startDmMessagesWatch() just above, for
      // the identical reason -- see that function's comment.
      const el = document.getElementById('threadScrollBody');
      if(el){ el.innerHTML = renderGroupMessagesHtml(messages, state.user.uid); el.scrollTop = el.scrollHeight; }
      else { render(); scrollThreadToBottom(); }
    });
  }

  // ---- Admin: pending reports queue --------------------------------------
  let unsubPendingReports = null;
  function stopPendingReportsWatch(){ if(unsubPendingReports){ unsubPendingReports(); unsubPendingReports = null; } }
  function startPendingReportsWatch(){
    stopPendingReportsWatch();
    unsubPendingReports = watchPendingReports(function(reports){
      state.pendingReports = reports;
      if(state.view === 'admin') render();
    });
  }

  // ---- Shorts feed [2026-09-09] -------------------------------------------
  let unsubShortsFeed = null;
  function stopShortsFeedWatch(){ if(unsubShortsFeed){ unsubShortsFeed(); unsubShortsFeed = null; } }
  function startShortsFeedWatch(){
    stopShortsFeedWatch();
    unsubShortsFeed = watchShortsFeed(function(shorts){
      state.shortsFeed = shorts;
      if(state.view === 'shorts') render();
    });
  }

  // ---- Stories (feed's story bar + the full-screen viewer) ---------------
  let unsubActiveStories = null;
  function stopActiveStoriesWatch(){ if(unsubActiveStories){ unsubActiveStories(); unsubActiveStories = null; } }
  function startActiveStoriesWatch(){
    stopActiveStoriesWatch();
    unsubActiveStories = watchActiveStories(function(stories){
      state.activeStories = stories;
      if(state.view === 'fellowship' || storyViewerAuthorUid !== null) render();
    });
  }

  // ---- One comment thread open at a time, app-wide, mirrors the existing
  // "one confirm-row/report box open at a time" convention (feedReportOpenId
  // etc. below) rather than one live subscription per post on screen. ------
  let commentsOpenKind = null, commentsOpenItemId = null;
  let commentsList = [];
  let commentComposerText = '';
  let unsubComments = null;
  function stopCommentsWatch(){ if(unsubComments){ unsubComments(); unsubComments = null; } }
  function closeComments(){ stopCommentsWatch(); commentsOpenKind = null; commentsOpenItemId = null; commentsList = []; commentComposerText = ''; }
  function openComments(kind, itemId){
    if(commentsOpenKind === kind && commentsOpenItemId === itemId){ closeComments(); render(); return; }
    stopCommentsWatch();
    commentsOpenKind = kind; commentsOpenItemId = itemId; commentComposerText = '';
    unsubComments = watchComments(kind, itemId, function(list){ commentsList = list; render(); });
    render();
  }

  function scrollThreadToBottom(){
    // Runs after render() has already redrawn the thread body -- a plain
    // rAF is enough since render() is synchronous DOM replacement, not
    // async, so the new nodes already exist by the next frame.
    requestAnimationFrame(function(){
      const el = document.getElementById('threadScrollBody');
      if(el) el.scrollTop = el.scrollHeight;
    });
  }

  // ---- navigation entry points -------------------------------------------
  function openFellowshipFeed(){
    postComposerText = ''; postComposerMediaResult = null; postComposerUploadBusy = false; postComposerUploadStatus = '';
    postDeleteConfirmId = null; feedReportOpenId = null; feedReportReason = '';
    closeComments();
    startFeedPostsWatch(); startDirectoryWatch(); startActiveStoriesWatch();
    state.view = 'fellowship'; render(); window.scrollTo(0,0);
  }
  function openProfileEdit(){
    if(!state.user){ showToast('Sign in first to set up your profile.'); return; }
    profileEditBio = (state.profile && state.profile.bio) || '';
    profileEditName = (state.profile && state.profile.displayName) || '';
    profileEditChurch = (state.profile && state.profile.churchName) || '';
    profileEditPhotoBusy = false; profileEditPhotoStatus = '';
    startDirectoryWatch(); // resolves blocked-account ids to names, see renderProfileEdit()'s Blocked Accounts section
    deleteExpiredStoriesFor(state.user.uid).catch(function(){ /* best effort, see local/firestore layer comment */ });
    state.view = 'profile-edit'; render(); window.scrollTo(0,0);
  }
  function openShortsFeed(){
    shortsComposerCaption = ''; shortsComposerVideoResult = null; shortsComposerUploadBusy = false; shortsComposerUploadStatus = '';
    shortsComposerOpen = false; shortDeleteConfirmId = null;
    closeComments();
    startShortsFeedWatch(); startDirectoryWatch();
    state.view = 'shorts'; render(); window.scrollTo(0,0);
  }
  function openExplore(){
    exploreSearchQuery = '';
    startFeedPostsWatch(); startDirectoryWatch(); startMyFollowingWatchIfNeeded();
    state.view = 'explore'; render(); window.scrollTo(0,0);
  }
  function startMyFollowingWatchIfNeeded(){
    // startSocialWatches() (called once from watchAuth()) already covers
    // this for the whole session -- this is just a defensive no-op guard
    // in case Explore is ever reachable before that first fires.
    if(state.user && !unsubMyFollowing) startSocialWatches(state.user.uid);
  }
  function openNotifications(){
    if(!state.user){ showToast('Sign in first.'); return; }
    startDirectoryWatch();
    state.view = 'notifications'; render(); window.scrollTo(0,0);
    // Mark everything currently unread as read a beat after opening, so the
    // person actually sees which ones were new (matching how a real inbox
    // shows unread state briefly before clearing it) rather than the badge
    // vanishing the instant the screen opens.
    const unreadIds = state.notifications.filter(function(n){ return !n.read; }).map(function(n){ return n.id; });
    if(unreadIds.length && state.user){
      setTimeout(function(){ markAllNotificationsRead(state.user.uid, unreadIds).catch(function(){ /* best effort */ }); }, 1200);
    }
  }
  function openProfileView(uid){
    state.viewProfileUid = uid;
    profileBlockConfirmUid = null; profileReportOpenUid = null; profileReportReason = '';
    startViewProfilePostsWatch(uid); startDirectoryWatch();
    state.view = 'profile-view'; render(); window.scrollTo(0,0);
  }
  function closeProfileView(){
    stopViewProfilePostsWatch();
    closeComments();
    state.viewProfileUid = null;
  }
  function openMessages(){
    if(!state.user){ showToast('Sign in first to send messages.'); return; }
    dmNewThreadQuery = ''; groupChatCreateOpen = false; groupChatCreateName = ''; groupChatCreateMemberQuery = ''; groupChatCreateSelectedUids = [];
    startMyDmThreadsWatch(); startMyGroupChatsWatch(); startDirectoryWatch();
    state.view = 'messages'; render(); window.scrollTo(0,0);
  }
  async function openDmThread(otherUid){
    if(!state.user) return;
    if(isBlockedByMe(otherUid)){ showToast('You&rsquo;ve blocked this person -- unblock them from their profile to message them again.'); return; }
    const meName = currentDisplayName() || 'Someone';
    const meD = directoryEntry(state.user.uid);
    let threadId;
    try{
      threadId = await ensureDmThread(state.user.uid, otherUid,
        { [state.user.uid]: meName, [otherUid]: (directoryEntry(otherUid)||{}).displayName || 'Someone' },
        { [state.user.uid]: (meD||{}).photoURL || null, [otherUid]: (directoryEntry(otherUid)||{}).photoURL || null });
    }catch(e){
      showToast('Couldn&rsquo;t start that conversation &mdash; try again.' + describeError(e));
      return;
    }
    dmComposerText = '';
    state.activeDmThreadId = threadId;
    // Unread badge fix [2026-09-24] -- Jared: "even though I've checked
    // the message... they still indicate the number." openChatDock() (the
    // small floating popup) already stamped readAt the moment a thread
    // opened there, but THIS function -- the one the full Messages hub
    // screen's own thread list actually calls (see the data-open-dm click
    // handler) -- never did, so opening a thread from the main Messages
    // screen (rather than the dock) left it permanently "unread" no matter
    // how many times it was actually read. Exact mirror of openChatDock()'s
    // own call.
    markDmThreadRead(threadId, state.user.uid).catch(function(){});
    startDmMessagesWatch(threadId);
    state.view = 'dm-thread'; render(); window.scrollTo(0,0);
  }
  function closeDmThread(){
    stopDmMessagesWatch();
    state.activeDmThreadId = null; state.activeDmMessages = [];
    state.view = 'messages'; render(); window.scrollTo(0,0);
  }
  function openGroupChatThread(groupId){
    groupChatComposerText = ''; groupChatManageOpen = false; groupLeaveConfirm = false;
    state.activeGroupChatId = groupId;
    // Unread badge fix [2026-09-24] -- see openDmThread()'s exact same fix
    // just above; same gap, same cause (the full Messages hub's own
    // group-chat list calls this function directly, not openChatDock()).
    if(state.user) markGroupChatRead(groupId, state.user.uid).catch(function(){});
    startGroupChatThreadWatch(groupId);
    state.view = 'group-chat-thread'; render(); window.scrollTo(0,0);
  }
  function closeGroupChatThread(){
    stopGroupChatWatch(); stopGroupMessagesWatch();
    state.activeGroupChatId = null; state.activeGroupChat = null; state.activeGroupMessages = [];
    state.view = 'messages'; render(); window.scrollTo(0,0);
  }

  // Reload-resume dispatch [2026-09-24] -- the auth-dependent half of
  // RESUMABLE_VIEWS (up by HOST_VIEWS/MORE_VIEWS/FELLOWSHIP_VIEWS -- see
  // that const's own comment for the full three-bucket mechanism and why
  // 'admin'/'media-library' aren't in here). Called exactly once, from
  // watchAuth()'s first-user-available callback, right alongside the
  // ?dm=/?profile= notification deep links it shares that same
  // "state.user isn't ready yet at a fresh page load" timing gap with.
  // Reuses each view's REAL navigation entry point (openMessages(),
  // openProfileView(uid), etc.) rather than just poking state.view
  // directly, so every guard/watcher those already have runs exactly the
  // same as a person tapping there themselves -- a stale/deleted id (a DM
  // thread or group chat that got deleted, a profile that no longer
  // exists) degrades exactly the way opening that screen normally would,
  // not a special case invented here.
  function restoreLastViewIfNeeded(target){
    if(!target || !target.view || !state.user) return;
    switch(target.view){
      case 'sermons':
        startMySermonsWatch(); startSharedSermonsWatch(); startDirectoryWatch();
        state.view = 'sermons'; render(); window.scrollTo(0,0);
        break;
      case 'fellowship': openFellowshipFeed(); break;
      case 'shorts': openShortsFeed(); break;
      case 'explore': openExplore(); break;
      case 'notifications': openNotifications(); break;
      case 'messages': openMessages(); break;
      case 'profile-edit': openProfileEdit(); break;
      case 'my-sessions':
        startHostRoomsWatch(); startCoHostRoomsWatch();
        state.view = 'my-sessions'; render(); window.scrollTo(0,0);
        break;
      case 'dm-thread':
        if(!target.id) break;
        startMyDmThreadsWatch();
        state.activeDmThreadId = target.id;
        startDmMessagesWatch(target.id);
        state.view = 'dm-thread'; render(); window.scrollTo(0,0);
        break;
      case 'group-chat-thread':
        if(!target.id) break;
        startMyGroupChatsWatch();
        openGroupChatThread(target.id);
        break;
      case 'profile-view':
        if(target.id) openProfileView(target.id);
        break;
    }
  }

  // ---- block / report (shared everywhere a person or a post shows up) ---
  async function toggleBlockUser(uid){
    if(!state.user || uid === state.user.uid) return;
    const current = (state.profile && state.profile.blockedUids) || [];
    const next = current.includes(uid) ? current.filter(function(x){return x!==uid;}) : current.concat([uid]);
    await saveProfile(state.user.uid, { blockedUids: next });
    profileBlockConfirmUid = null;
    showToast(current.includes(uid) ? 'Unblocked.' : 'Blocked &mdash; they won&rsquo;t be able to DM you, and you won&rsquo;t see each other&rsquo;s posts.');
  }
  async function submitReportFor(targetType, targetId, reason){
    if(!state.user) return;
    const r = (reason||'').trim();
    if(!r){ showToast('Say a little about why you&rsquo;re reporting this.'); return; }
    try{
      await submitReport({ reportedByUid: state.user.uid, targetType: targetType, targetId: targetId, reason: r.slice(0,500) });
      showToast('Reported to the Admin team for review. Thank you.');
    }catch(e){ showToast('Couldn&rsquo;t submit that report -- try again.'); }
  }

  // ---- post composer + feed ----------------------------------------------
  let postComposerText = '';
  let postComposerMediaResult = null; // {kind:'image'|'video', url, storagePath} once an upload finishes, staged until POST is pressed
  let postComposerUploadBusy = false;
  // POST A DEVOTIONAL [2026-09-24] -- Jared: "add a feature for us to post
  // devotionals through the fellowship page as well" (alongside the
  // automatic daily one -- see dailyDevotionalNotify in functions/
  // index.js). Admin/editor-only (see renderPostComposer()'s gate below),
  // opens inline in the composer rather than a separate screen -- today's
  // devotional is always exactly what's on offer (no picking an arbitrary
  // past/future day), so there's nothing here that needs more room than a
  // small expanding panel.
  let devotionalPickerOpen = false;
  let devotionalPickerWhich = 'am'; // 'am' or 'pm' -- which of today's two readings is staged
  let postComposerUploadStatus = '';
  let postDeleteConfirmId = null;
  let feedReportOpenId = null;
  let feedReportReason = '';

  // ---- social-redesign UI state [2026-09-09] -----------------------------
  let shortsComposerOpen = false;
  let shortsComposerCaption = '';
  let shortsComposerVideoResult = null; // {url, storagePath} once an upload finishes
  let shortsComposerUploadBusy = false;
  let shortsComposerUploadStatus = '';
  let shortDeleteConfirmId = null;
  let exploreSearchQuery = '';
  let storyViewerAuthorUid = null; // whose story ring the full-screen viewer is currently open on, or null
  let storyViewerStoryIndex = 0;    // which of that author's stories (newest-first) is showing
  let storyComposerBusy = false;
  let storyComposerStatus = '';

  // ---- Fellowship sub-nav [2026-09-09] -- Jared: "it'll be like another
  // interface all on its own in the same app." A small tab row (not a
  // second hamburger, not a bottom tab bar -- the hamburger already owns
  // WHICH interface you're in; this is just movement WITHIN Fellowship)
  // shown at the top of every Fellowship-interface screen.
  function renderFellowshipSubnav(active){
    const tabs = [
      { key:'fellowship', label:'FEED', fn:'openFellowshipFeed' },
      { key:'shorts', label:'SHORTS', fn:'openShortsFeed' },
      { key:'explore', label:'EXPLORE', fn:'openExplore' },
      { key:'messages', label:'MESSAGES', fn:'openMessages' }
    ];
    return '<div class="fellowship-subnav">' + tabs.map(function(t){
      return '<button type="button" class="fellowship-subnav-tab'+(active===t.key?' active':'')+'" data-subnav="'+t.fn+'">'+t.label+'</button>';
    }).join('') + '</div>';
  }
  function attachFellowshipSubnavHandlers(){
    document.querySelectorAll('[data-subnav]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const fn = btn.getAttribute('data-subnav');
        if(fn==='openFellowshipFeed') openFellowshipFeed();
        else if(fn==='openShortsFeed') openShortsFeed();
        else if(fn==='openExplore') openExplore();
        else if(fn==='openMessages') openMessages();
      });
    });
  }

  // ---- Stories: the horizontal ring bar (feed) + the full-screen viewer -
  function storiesGroupedByAuthor(){
    const byAuthor = new Map();
    state.activeStories.forEach(function(s){
      if(!byAuthor.has(s.authorUid)) byAuthor.set(s.authorUid, []);
      byAuthor.get(s.authorUid).push(s);
    });
    // Each author's own stories, newest-first (already the watch's sort).
    return Array.from(byAuthor.entries()).map(function(entry){ return { authorUid: entry[0], stories: entry[1] }; });
  }
  // [2026-09-10] Jared: "it's good if there was a preview of the story of
  // your friends like in facebook" -- before this, every ring showed the
  // person's PROFILE avatar (personAvatar()), never a hint of what their
  // story actually contains. Facebook/Instagram's ring shows a crop of the
  // actual story media itself. A paused/muted <video> without a poster
  // still paints its first frame once loaded, so it works as a thumbnail
  // exactly like an <img> does -- no separate thumbnail-generation step
  // needed for video stories.
  function storyRingThumb(story, size){
    const px = size || 56;
    if(!story) return null;
    if(story.mediaKind === 'video'){
      return '<video class="story-ring-thumb" src="'+escapeAttr(story.mediaUrl)+'" muted playsinline style="width:'+px+'px;height:'+px+'px;"></video>';
    }
    return '<img class="story-ring-thumb" src="'+escapeAttr(story.mediaUrl)+'" alt="" style="width:'+px+'px;height:'+px+'px;">';
  }
  function renderStoryBar(){
    if(!state.user) return '';
    const groups = storiesGroupedByAuthor();
    const myGroup = groups.find(function(g){ return g.authorUid === state.user.uid; });
    const myLatest = myGroup ? myGroup.stories[0] : null;
    return '<div class="story-bar">' +
      '<div class="story-ring story-ring-add" id="storyAddBtn">' +
        '<span class="story-ring-avatar story-ring-avatar-add">' +
          (myLatest ? storyRingThumb(myLatest, 56) : personAvatar(state.user.uid, 56)) +
          '<span class="story-add-plus">+</span>' +
        '</span>' +
        '<span class="story-ring-label">Your Story</span>' +
      '</div>' +
      groups.map(function(g){
        const d = directoryEntry(g.authorUid);
        return '<button type="button" class="story-ring" data-open-story="'+escapeAttr(g.authorUid)+'">' +
          '<span class="story-ring-avatar">' + storyRingThumb(g.stories[0], 56) + '</span>' +
          '<span class="story-ring-label">' + (d ? escapeHtml((d.displayName||'').split(' ')[0] || 'Someone') : 'Someone') + '</span>' +
        '</button>';
      }).join('') +
    '</div>';
  }
  function attachStoryBarHandlers(){
    const addBtn = document.getElementById('storyAddBtn');
    if(addBtn) addBtn.addEventListener('click', function(){ document.getElementById('storyFileInput').click(); });
    const fileInput = document.getElementById('storyFileInput');
    if(fileInput) fileInput.addEventListener('change', async function(){
      const file = fileInput.files && fileInput.files[0];
      if(!file || !state.user) return;
      const kind = file.type && file.type.indexOf('video') === 0 ? 'video' : 'image';
      storyComposerBusy = true; storyComposerStatus = 'Uploading your story... 0%'; render();
      try{
        const result = await uploadMediaFile(file, state.user.uid, kind, function(pct){ storyComposerStatus = 'Uploading your story... '+pct+'%'; });
        await createStory({
          authorUid: state.user.uid, authorName: currentDisplayName() || 'Someone',
          mediaUrl: result.url, mediaKind: kind, mediaStoragePath: result.storagePath
        });
        showToast('Story posted -- visible for 24 hours.');
      }catch(e){ showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why. Try again once it is.' + describeError(e)); }
      storyComposerBusy = false; storyComposerStatus = ''; render();
    });
    document.querySelectorAll('[data-open-story]').forEach(function(btn){
      btn.addEventListener('click', function(){ openStoryViewer(btn.getAttribute('data-open-story')); });
    });
  }
  function openStoryViewer(authorUid){
    const groups = storiesGroupedByAuthor();
    if(!groups.some(function(g){ return g.authorUid === authorUid; })) return;
    storyViewerAuthorUid = authorUid; storyViewerStoryIndex = 0;
    renderStoryViewer();
    document.getElementById('storyViewerOverlay').hidden = false;
  }
  function closeStoryViewer(){
    storyViewerAuthorUid = null; storyViewerStoryIndex = 0;
    document.getElementById('storyViewerOverlay').hidden = true;
  }
  function storyViewerAdvance(delta){
    const group = storiesGroupedByAuthor().find(function(g){ return g.authorUid === storyViewerAuthorUid; });
    if(!group){ closeStoryViewer(); return; }
    const next = storyViewerStoryIndex + delta;
    if(next < 0) { closeStoryViewer(); return; }
    if(next >= group.stories.length){ closeStoryViewer(); return; }
    storyViewerStoryIndex = next;
    renderStoryViewer();
  }
  function renderStoryViewer(){
    const body = document.getElementById('storyViewerBody');
    if(!body || storyViewerAuthorUid === null) return;
    const group = storiesGroupedByAuthor().find(function(g){ return g.authorUid === storyViewerAuthorUid; });
    if(!group){ closeStoryViewer(); return; }
    const story = group.stories[storyViewerStoryIndex];
    const d = directoryEntry(storyViewerAuthorUid);
    const isMine = state.user && storyViewerAuthorUid === state.user.uid;
    body.innerHTML =
      '<div class="story-viewer-progress">' + group.stories.map(function(_, i){
        return '<span class="story-viewer-progress-seg'+(i<=storyViewerStoryIndex?' filled':'')+'"></span>';
      }).join('') + '</div>' +
      '<div class="story-viewer-header">' +
        personAvatar(storyViewerAuthorUid, 32) +
        '<span>' + (d ? escapeHtml(d.displayName||'Someone') : 'Someone') + '</span>' +
        '<span class="hint" style="color:inherit;opacity:.75;">&middot; ' + postAge(story.createdAt) + '</span>' +
        // [Bug found 2026-09-10] the old DELETE button was a full text label
        // crammed into .icon-btn-sm's fixed 30x30px box (built for a single
        // glyph like the close X next to it), so "DELETE" just overflowed
        // and visually collided with the close button beside it -- exactly
        // what Jared's screenshot showed. Fixed by replacing it with a
        // small (kebab) menu button that opens a one-item dropdown instead
        // of showing the label directly -- also leaves room to add more
        // per-story actions later without repeating this same overflow.
        (isMine ? (
          '<div class="story-menu-wrap" style="margin-left:auto;position:relative;">' +
            '<button type="button" class="icon-btn-sm" id="storyMenuBtn" aria-label="Story options">&#8942;</button>' +
            '<div class="story-menu-dropdown" id="storyMenuDropdown" hidden>' +
              '<button type="button" class="story-menu-item" id="storyDeleteBtn">Delete Story</button>' +
            '</div>' +
          '</div>'
        ) : '') +
        '<button type="button" class="icon-btn-sm" id="storyViewerCloseBtn" style="margin-left:'+(isMine?'8px':'auto')+';">&times;</button>' +
      '</div>' +
      '<div class="story-viewer-media">' +
        (story.mediaKind === 'video' ?
          ('<video src="'+escapeAttr(story.mediaUrl)+'" autoplay muted playsinline controls></video>') :
          ('<img src="'+escapeAttr(story.mediaUrl)+'" alt="">')) +
      '</div>' +
      '<button type="button" class="story-viewer-tap story-viewer-tap-prev" id="storyPrevBtn" aria-label="Previous story"></button>' +
      '<button type="button" class="story-viewer-tap story-viewer-tap-next" id="storyNextBtn" aria-label="Next story"></button>';
    document.getElementById('storyViewerCloseBtn').addEventListener('click', closeStoryViewer);
    document.getElementById('storyPrevBtn').addEventListener('click', function(){ storyViewerAdvance(-1); });
    document.getElementById('storyNextBtn').addEventListener('click', function(){ storyViewerAdvance(1); });
    const menuBtn = document.getElementById('storyMenuBtn');
    const menuDropdown = document.getElementById('storyMenuDropdown');
    if(menuBtn && menuDropdown){
      menuBtn.addEventListener('click', function(e){
        e.stopPropagation();
        menuDropdown.hidden = !menuDropdown.hidden;
      });
      // Close on an outside tap so it doesn't stay open once someone taps
      // elsewhere on the story (the prev/next tap zones would otherwise
      // advance the story with the menu still open on top of it).
      document.addEventListener('click', function outsideClose(e){
        if(!menuDropdown.contains(e.target) && e.target !== menuBtn){
          menuDropdown.hidden = true;
          document.removeEventListener('click', outsideClose);
        }
      });
    }
    const delBtn = document.getElementById('storyDeleteBtn');
    if(delBtn) delBtn.addEventListener('click', async function(){
      if(menuDropdown) menuDropdown.hidden = true;
      try{ await deleteStory(story.id); showToast('Story deleted.'); }catch(e){ showToast('Couldn&rsquo;t delete &mdash; try again.'); }
      storyViewerAdvance(1);
    });
  }

  // POST A DEVOTIONAL's expanding panel -- MORNING/EVENING toggle (today
  // only -- see devotionalPickerOpen's own comment) + a preview of
  // whichever one is selected + the actual post button. Kept separate from
  // renderPostComposer() itself just to keep that function's own return
  // statement readable.
  function renderDevotionalPickerPanel(){
    if(!devotionalsData) return '<p class="hint" style="margin-top:10px;">Loading today&rsquo;s devotional&hellip;</p>';
    const entry = todaysDevotionalEntry(devotionalPickerWhich);
    if(!entry) return '<p class="hint" style="margin-top:10px;">No devotional found for today &mdash; nothing to post.</p>';
    return '<div class="session-card" style="margin-top:10px;background:var(--surface-2);">' +
      '<div style="display:flex;gap:8px;">' +
        '<button type="button" class="btn '+(devotionalPickerWhich==='am'?'btn-primary':'btn-ghost')+'" data-devotional-which="am" style="padding:6px 14px;">MORNING</button>' +
        '<button type="button" class="btn '+(devotionalPickerWhich==='pm'?'btn-primary':'btn-ghost')+'" data-devotional-which="pm" style="padding:6px 14px;">EVENING</button>' +
      '</div>' +
      '<p style="font-weight:700;margin-top:10px;">'+escapeHtml(entry.title||'')+(entry.ref?(' &mdash; '+escapeHtml(entry.ref)):'')+'</p>' +
      '<p style="white-space:pre-wrap;margin-top:6px;max-height:180px;overflow:auto;">'+escapeHtml(entry.text||'')+'</p>' +
      '<button class="btn btn-primary" id="postDevotionalBtn" style="margin-top:10px;">POST THIS DEVOTIONAL</button>' +
    '</div>';
  }

  function renderPostComposer(){
    const media = postComposerMediaResult;
    // Admin/editor-only -- see devotionalPickerOpen's own comment above.
    // Preloaded here (no-ops once loaded/loading) rather than only on tap,
    // so the panel usually has data the instant it's opened instead of a
    // "loading" flash.
    const canPostDevotional = state.isEditor || hasFullAccess();
    if(canPostDevotional) loadDevotionalsData();
    return '<div class="session-card">' +
      '<div style="display:flex;gap:10px;">' +
        personAvatar(state.user.uid, 40) +
        '<textarea id="postComposerInput" class="feed-composer-textarea" placeholder="Share something with the fellowship&hellip;" rows="3" style="flex:1;resize:vertical;" '+(postComposerUploadBusy?'disabled':'')+'>'+escapeHtml(postComposerText)+'</textarea>' +
      '</div>' +
      (media ? ('<div style="margin-top:10px;">' +
          (media.kind==='image' ? ('<img src="'+escapeAttr(media.url)+'" alt="" style="max-width:220px;max-height:220px;border-radius:10px;display:block;">') :
            ('<video src="'+escapeAttr(media.url)+'" style="max-width:260px;max-height:220px;border-radius:10px;display:block;" controls></video>')) +
          '<button type="button" class="switch-account" id="postRemoveMediaBtn" style="margin-top:6px;">REMOVE</button>' +
        '</div>') : '') +
      (postComposerUploadStatus ? ('<p class="hint" id="postUploadStatusText" style="margin-top:8px;">'+escapeHtml(postComposerUploadStatus)+'</p>') : '') +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap;">' +
        '<label class="switch-account" style="cursor:pointer;'+(postComposerUploadBusy||media?'opacity:.4;pointer-events:none;':'')+'">+ PHOTO<input type="file" id="postImageInput" accept="image/*" style="display:none;" '+(postComposerUploadBusy||media?'disabled':'')+'></label>' +
        '<label class="switch-account" style="cursor:pointer;'+(postComposerUploadBusy||media?'opacity:.4;pointer-events:none;':'')+'">+ VIDEO<input type="file" id="postVideoInput" accept="video/*" style="display:none;" '+(postComposerUploadBusy||media?'disabled':'')+'></label>' +
        (canPostDevotional ? ('<button type="button" class="switch-account" id="toggleDevotionalPickerBtn" style="cursor:pointer;">'+(devotionalPickerOpen?'&minus; DEVOTIONAL':'+ DEVOTIONAL')+'</button>') : '') +
        '<button class="btn btn-primary" id="postSubmitBtn" style="margin-left:auto;" '+(postComposerUploadBusy?'disabled':'')+'>POST</button>' +
      '</div>' +
      (canPostDevotional && devotionalPickerOpen ? renderDevotionalPickerPanel() : '') +
    '</div>';
  }

  function renderPostMediaBlock(mediaUrl, mediaKind){
    if(!mediaUrl) return '';
    return '<div style="margin-top:8px;">' + (mediaKind==='video' ?
      ('<video src="'+escapeAttr(mediaUrl)+'" style="max-width:100%;max-height:360px;border-radius:10px;" controls></video>') :
      ('<img src="'+escapeAttr(mediaUrl)+'" alt="" style="max-width:100%;max-height:360px;border-radius:10px;">')) + '</div>';
  }

  // A repost shows a small quoted-post box under the reposter's own
  // (usually empty) text -- the ORIGINAL author's name/text/media, snapshot
  // at repost time (see repostPost() in both data layers) rather than a
  // live reference, so it still displays correctly even if the original is
  // later deleted.
  function renderRepostQuote(repostOf){
    if(!repostOf) return '';
    const d = directoryEntry(repostOf.authorUid);
    return '<div class="repost-quote">' +
      '<p style="font-weight:700;">' + (d ? escapeHtml(d.displayName||'(no name set)') : escapeHtml(repostOf.authorName||'Someone')) + '</p>' +
      (repostOf.text ? ('<p style="white-space:pre-wrap;margin-top:2px;">'+escapeHtml(repostOf.text)+'</p>') : '') +
      renderPostMediaBlock(repostOf.mediaUrl, repostOf.mediaKind) +
    '</div>';
  }

  // Like/comment/repost/save action bar -- shared by the main feed, a
  // profile's Posts list, and Explore's trending list (every place a post
  // card shows up), same "one shared component" reasoning as
  // renderFeedPostCard itself being reused across all three.
  function renderActionBar(kind, item, recipientUid){
    const liked = isLikedByMe(kind, item.id);
    const saved = isSavedByMe(kind, item.id);
    const likeN = itemLikeCount(kind, item);
    const commentN = itemCommentCount(kind, item);
    const repostN = kind==='posts' ? postRepostCount(item) : 0;
    return '<div class="post-action-bar">' +
      '<button type="button" class="post-action-btn'+(liked?' active':'')+'" data-like-item data-kind="'+kind+'" data-item-id="'+escapeAttr(item.id)+'" data-recipient="'+escapeAttr(recipientUid)+'">' +
        '<svg viewBox="0 0 24 24" fill="'+(liked?'currentColor':'none')+'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+icon('heart')+'</svg>' +
        (likeN ? ' '+likeN : '') +
      '</button>' +
      '<button type="button" class="post-action-btn" data-toggle-comments data-kind="'+kind+'" data-item-id="'+escapeAttr(item.id)+'">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+icon('chat')+'</svg>' +
        (commentN ? ' '+commentN : '') +
      '</button>' +
      (kind==='posts' ? (
        '<button type="button" class="post-action-btn" data-repost-post="'+escapeAttr(item.id)+'">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>' +
          (repostN ? ' '+repostN : '') +
        '</button>'
      ) : '') +
      '<button type="button" class="post-action-btn'+(saved?' active':'')+'" data-save-item data-kind="'+kind+'" data-item-id="'+escapeAttr(item.id)+'" style="margin-left:auto;">' +
        '<svg viewBox="0 0 24 24" fill="'+(saved?'currentColor':'none')+'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>' +
      '</button>' +
    '</div>';
  }

  function renderCommentThread(kind, itemId){
    if(commentsOpenKind !== kind || commentsOpenItemId !== itemId) return '';
    return '<div class="comment-thread">' +
      (commentsList.length ? commentsList.map(function(c){
        const d = directoryEntry(c.authorUid);
        const canDelete = state.user && (c.authorUid === state.user.uid || hasFullAccess());
        return '<div class="comment-row">' + personAvatar(c.authorUid, 28) +
          '<div style="flex:1;min-width:0;"><p><strong>'+(d?escapeHtml(d.displayName||'(no name set)'):escapeHtml(c.authorName||'Someone'))+'</strong> <span class="hint">&middot; '+postAge(c.createdAt)+'</span></p>' +
          '<p style="white-space:pre-wrap;">'+escapeHtml(c.text)+'</p></div>' +
          (canDelete ? ('<button type="button" class="icon-btn-sm" data-delete-comment="'+c.id+'" data-kind="'+kind+'" data-item-id="'+escapeAttr(itemId)+'" aria-label="Delete comment">&times;</button>') : '') +
        '</div>';
      }).join('') : '<p class="hint" style="padding:8px 0;">No comments yet.</p>') +
      (state.user ? (
        '<div class="comment-composer">' +
          '<textarea id="commentComposerInput" rows="1" placeholder="Write a comment&hellip;">'+escapeHtml(commentComposerText)+'</textarea>' +
          '<button type="button" class="btn btn-primary btn-sm" id="commentSubmitBtn" data-kind="'+kind+'" data-item-id="'+escapeAttr(itemId)+'">SEND</button>' +
        '</div>'
      ) : '<p class="hint">Sign in to comment.</p>') +
    '</div>';
  }

  function renderFeedPostCard(p){
    const isMine = state.user && p.authorUid === state.user.uid;
    const confirmingDelete = postDeleteConfirmId === p.id;
    const reporting = feedReportOpenId === p.id;
    // Devotional posts [2026-09-24] -- see DEVOTIONAL_BOT_UID's own comment
    // above. isBotDevotional is the ONE automatic post/day (functions/
    // index.js); any OTHER devotional (posted by a real admin/editor via
    // POST A DEVOTIONAL) keeps the normal clickable avatar/name -- only the
    // header treatment differs for the bot, everything else (the title/ref
    // badge line, action bar, comments) is the same either way.
    const isDevotional = p.kind === 'devotional';
    const isBotDevotional = isDevotional && p.authorUid === DEVOTIONAL_BOT_UID;
    const headerName = isBotDevotional ? 'Daily Devotional' :
      (directoryEntry(p.authorUid) ? (directoryEntry(p.authorUid).displayName||'(no name set)') : (p.authorName||'Someone'));
    return '<div class="room-list-card" style="flex-direction:column;align-items:stretch;">' +
      '<div style="display:flex;gap:10px;align-items:flex-start;">' +
        (isBotDevotional ?
          ('<span class="devotional-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+icon('book')+'</svg></span>') :
          ('<button type="button" data-open-profile="'+escapeAttr(p.authorUid)+'" style="border:none;background:none;padding:0;cursor:pointer;">'+personAvatar(p.authorUid,40)+'</button>')) +
        '<div style="flex:1;min-width:0;">' +
          '<p>' + (isBotDevotional ?
            ('<span style="font-weight:700;">'+escapeHtml(headerName)+'</span>') :
            ('<button type="button" class="link-btn" data-open-profile="'+escapeAttr(p.authorUid)+'" style="font-weight:700;">'+escapeHtml(headerName)+'</button>')) +
            ' <span class="hint">&middot; '+postAge(p.createdAt)+(p.repostOf?' &middot; reposted':'')+'</span></p>' +
          (isDevotional ? ('<p class="devotional-tag">DAILY DEVOTIONAL'+((p.devotionalTitle||p.devotionalRef) ?
            (' &middot; '+escapeHtml(p.devotionalTitle||'')+(p.devotionalRef?(' ('+escapeHtml(p.devotionalRef)+')'):'')) : '')+'</p>') : '') +
          (p.text ? ('<p style="white-space:pre-wrap;margin-top:4px;">'+escapeHtml(p.text)+'</p>') : '') +
          renderPostMediaBlock(p.mediaUrl, p.mediaKind) +
          renderRepostQuote(p.repostOf) +
        '</div>' +
      '</div>' +
      renderActionBar('posts', p, p.authorUid) +
      renderCommentThread('posts', p.id) +
      (confirmingDelete ?
        ('<div class="confirm-row" style="margin-top:10px;"><span>Delete this post?</span>' +
          '<button class="btn btn-primary" data-confirm-delete-post="'+p.id+'">YES, DELETE</button>' +
          '<button class="btn btn-ghost" data-cancel-delete-post="'+p.id+'">CANCEL</button></div>')
        : ('<div style="display:flex;gap:14px;margin-top:10px;">' +
            (isMine || (isBotDevotional && hasFullAccess()) ?
              '<button type="button" class="switch-account" data-ask-delete-post="'+p.id+'">DELETE</button>' :
              '<button type="button" class="switch-account" data-report-post="'+p.id+'">'+(reporting?'CANCEL':'REPORT')+'</button>') +
          '</div>')) +
      (reporting ? ('<div class="field" style="margin-top:8px;"><label for="reportReasonInput-'+p.id+'">WHY ARE YOU REPORTING THIS?</label>' +
          '<textarea id="reportReasonInput-'+p.id+'" data-report-reason-input="'+p.id+'" rows="2">'+escapeHtml(feedReportReason)+'</textarea></div>' +
          '<button class="btn btn-primary" data-submit-report-post="'+p.id+'">SUBMIT REPORT</button>') : '') +
    '</div>';
  }

  // Shared handler wiring for every screen that renders renderFeedPostCard
  // (the feed, a profile's Posts list, Explore's trending list) -- like/
  // comment/repost/save + the comment composer + delete-comment, none of
  // which existed before this pass, so unlike delete/report (already
  // duplicated per-screen before this redesign) these are wired in ONE
  // place and called from all three.
  function attachFeedActionHandlers(){
    document.querySelectorAll('[data-like-item]').forEach(function(btn){
      btn.addEventListener('click', function(){
        toggleLike(btn.getAttribute('data-kind'), btn.getAttribute('data-item-id'), btn.getAttribute('data-recipient'));
      });
    });
    document.querySelectorAll('[data-save-item]').forEach(function(btn){
      btn.addEventListener('click', function(){
        toggleSaveItem(btn.getAttribute('data-kind'), btn.getAttribute('data-item-id'));
      });
    });
    document.querySelectorAll('[data-toggle-comments]').forEach(function(btn){
      btn.addEventListener('click', function(){
        openComments(btn.getAttribute('data-kind'), btn.getAttribute('data-item-id'));
      });
    });
    document.querySelectorAll('[data-repost-post]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!state.user){ showToast('Sign in to repost.'); return; }
        const id = btn.getAttribute('data-repost-post');
        const post = state.feedPosts.find(function(x){ return x.id===id; }) ||
          state.viewProfilePosts.find(function(x){ return x.id===id; });
        if(post) doRepost(post);
      });
    });
    const commentInput = document.getElementById('commentComposerInput');
    if(commentInput) commentInput.addEventListener('input', function(){ commentComposerText = commentInput.value; });
    const commentSubmitBtn = document.getElementById('commentSubmitBtn');
    if(commentSubmitBtn) commentSubmitBtn.addEventListener('click', async function(){
      const text = commentComposerText.trim();
      if(!text){ return; }
      const kind = commentSubmitBtn.getAttribute('data-kind'), itemId = commentSubmitBtn.getAttribute('data-item-id');
      commentSubmitBtn.disabled = true;
      try{
        await addComment(kind, itemId, { authorUid: state.user.uid, authorName: currentDisplayName() || 'Someone', text: text.slice(0,1000) });
        const item = (kind==='posts' ? state.feedPosts : state.shortsFeed).find(function(x){ return x.id===itemId; });
        if(item) notify(item.authorUid, { type:'comment', kind: kind, itemId: itemId });
        commentComposerText = '';
      }catch(e){ showToast('Couldn&rsquo;t post that comment &mdash; try again.'); }
      commentSubmitBtn.disabled = false; render();
    });
    document.querySelectorAll('[data-delete-comment]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        try{ await deleteComment(btn.getAttribute('data-delete-comment'), btn.getAttribute('data-kind'), btn.getAttribute('data-item-id')); }
        catch(e){ showToast('Couldn&rsquo;t delete &mdash; try again.'); }
      });
    });
  }

  // A slim, rail-sized version of a post -- name + truncated text + like
  // count, no actions -- for the desktop right rail's Trending panel (see
  // below). renderFeedPostCard() itself is a full interactive card (like/
  // comment/repost/save, a comment thread, delete/report) and is much too
  // tall to repeat several times in a 300px-wide column; this is display-
  // only and clicking it opens the author's profile, same as tapping their
  // name anywhere else in the app does.
  function renderTrendingRailRow(p){
    const name = directoryEntry(p.authorUid) ? (directoryEntry(p.authorUid).displayName || '(no name set)') : (p.authorName || 'Someone');
    const snippet = (p.text || '').trim();
    const truncated = snippet.length > 88 ? (snippet.slice(0, 88).trim() + '…') : snippet;
    return '<button type="button" class="fellowship-rail-trending-row" data-open-profile="'+escapeAttr(p.authorUid)+'">' +
      '<p style="font-weight:700;">'+escapeHtml(name)+'</p>' +
      (truncated ? ('<p>'+escapeHtml(truncated)+'</p>') : (p.mediaKind ? ('<p>Shared a '+escapeHtml(p.mediaKind)+'.</p>') : '')) +
      '<p class="hint">&hearts; '+itemLikeCount('posts', p)+'</p>' +
    '</button>';
  }

  // Desktop right rail [2026-09-10] -- Jared: "look at Facebook's PC
  // interface... what if you do it like that?" Facebook's own desktop feed
  // keeps a right-hand column of suggestions/trending alongside the main
  // feed; this is the same idea, reusing the exact data Explore already
  // computes (trendingPosts()/suggestedPeople(), see their own comments
  // above) rather than a new query. Hidden below styles.css's own
  // .fellowship-rail breakpoint -- on a phone or a narrower desktop window
  // this whole panel just doesn't render into the DOM at all below that
  // width... actually it does render (cheap enough either way) but CSS
  // hides it, matching how the rest of this app's responsive rules work.
  function renderFellowshipRail(){
    const trending = trendingPosts().slice(0, 5);
    const suggestions = suggestedPeople().slice(0, 5);
    return '<aside class="fellowship-rail">' +
      (suggestions.length ? (
        '<div class="fellowship-rail-card"><h3 class="uc">Suggested People</h3>' + suggestions.map(renderPersonRow).join('') + '</div>'
      ) : '') +
      '<div class="fellowship-rail-card"><h3 class="uc">Trending</h3>' +
        (trending.length ? trending.map(renderTrendingRailRow).join('') : '<p class="hint">Nothing trending yet.</p>') +
      '</div>' +
    '</aside>';
  }

  function renderFellowshipFeed(){
    const visiblePosts = state.feedPosts.filter(function(p){ return !isBlockedByMe(p.authorUid); });
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="fellowshipBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      renderFellowshipSubnav('fellowship') +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Fellowship</p>' +
        '<p class="landing-sub">One shared feed, cross-church &mdash; just like the hymnal.</p>' +
      '</div>' +
      '<div class="fellowship-layout">' +
        '<div class="fellowship-main-col">' +
          renderStoryBar() +
          (storyComposerBusy ? ('<p class="hint" style="text-align:center;">'+escapeHtml(storyComposerStatus)+'</p>') : '') +
          '<input type="file" id="storyFileInput" accept="image/*,video/*" style="display:none;">' +
          renderPostComposer() +
          (visiblePosts.length ? visiblePosts.map(renderFeedPostCard).join('') :
            '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon('heart')+'</svg><p>No posts yet &mdash; be the first to share something.</p></div>') +
        '</div>' +
        renderFellowshipRail() +
      '</div>';

    document.getElementById('fellowshipBackBtn').addEventListener('click', function(){
      stopFeedPostsWatch(); stopActiveStoriesWatch(); closeComments();
      state.view = 'landing'; render(); window.scrollTo(0,0);
    });
    attachFellowshipSubnavHandlers();
    attachStoryBarHandlers();
    attachFeedActionHandlers();
    document.querySelectorAll('[data-open-profile]').forEach(function(btn){
      btn.addEventListener('click', function(){ openProfileView(btn.getAttribute('data-open-profile')); });
    });
    // The desktop right rail's Suggested People panel reuses renderPersonRow()
    // (see renderFellowshipRail() above), which includes a FOLLOW button --
    // wired the same way Explore already wires its own copy of these rows.
    document.querySelectorAll('[data-follow-uid]').forEach(function(btn){
      btn.addEventListener('click', function(){ toggleFollow(btn.getAttribute('data-follow-uid')); });
    });
    const textarea = document.getElementById('postComposerInput');
    if(textarea) textarea.addEventListener('input', function(){ postComposerText = textarea.value; });
    const removeMediaBtn = document.getElementById('postRemoveMediaBtn');
    if(removeMediaBtn) removeMediaBtn.addEventListener('click', function(){ postComposerMediaResult = null; render(); });

    const imageInput = document.getElementById('postImageInput');
    if(imageInput) imageInput.addEventListener('change', async function(){
      const file = imageInput.files && imageInput.files[0];
      if(!file) return;
      postComposerUploadBusy = true; postComposerUploadStatus = 'Uploading... 0%'; render();
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'image', function(pct){
          postComposerUploadStatus = 'Uploading... ' + pct + '%';
          const statusEl = document.getElementById('postUploadStatusText');
          if(statusEl) statusEl.textContent = postComposerUploadStatus;
        });
        postComposerMediaResult = { kind:'image', url: result.url, storagePath: result.storagePath };
      }catch(e){
        showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why. Try again once it is.' + describeError(e));
      }
      postComposerUploadBusy = false; postComposerUploadStatus = ''; render();
    });
    const videoInput = document.getElementById('postVideoInput');
    if(videoInput) videoInput.addEventListener('change', async function(){
      const file = videoInput.files && videoInput.files[0];
      if(!file) return;
      postComposerUploadBusy = true; postComposerUploadStatus = 'Uploading... 0%'; render();
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'video', function(pct){
          postComposerUploadStatus = 'Uploading... ' + pct + '%';
          const statusEl = document.getElementById('postUploadStatusText');
          if(statusEl) statusEl.textContent = postComposerUploadStatus;
        });
        postComposerMediaResult = { kind:'video', url: result.url, storagePath: result.storagePath };
      }catch(e){
        showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why. Try again once it is.' + describeError(e));
      }
      postComposerUploadBusy = false; postComposerUploadStatus = ''; render();
    });
    const submitBtn = document.getElementById('postSubmitBtn');
    if(submitBtn) submitBtn.addEventListener('click', async function(){
      const text = postComposerText.trim();
      const media = postComposerMediaResult;
      if(!text && !media){ showToast('Write something or attach a photo/video first.'); return; }
      submitBtn.disabled = true;
      try{
        await createPost({
          authorUid: state.user.uid, authorName: currentDisplayName() || 'Someone',
          text: text,
          mediaUrl: media ? media.url : null, mediaKind: media ? media.kind : null,
          mediaStoragePath: media ? media.storagePath : null
        });
        postComposerText = ''; postComposerMediaResult = null;
        showToast('Posted.');
      }catch(e){ showToast('Couldn&rsquo;t post &mdash; try again.'); submitBtn.disabled = false; }
      render();
    });
    const toggleDevotionalPickerBtn = document.getElementById('toggleDevotionalPickerBtn');
    if(toggleDevotionalPickerBtn) toggleDevotionalPickerBtn.addEventListener('click', function(){
      devotionalPickerOpen = !devotionalPickerOpen;
      if(devotionalPickerOpen) loadDevotionalsData();
      render();
    });
    document.querySelectorAll('[data-devotional-which]').forEach(function(btn){
      btn.addEventListener('click', function(){ devotionalPickerWhich = btn.getAttribute('data-devotional-which'); render(); });
    });
    const postDevotionalBtn = document.getElementById('postDevotionalBtn');
    if(postDevotionalBtn) postDevotionalBtn.addEventListener('click', async function(){
      const entry = todaysDevotionalEntry(devotionalPickerWhich);
      if(!entry) return;
      postDevotionalBtn.disabled = true;
      try{
        // firestore.rules caps every post's `text` at 2000 chars (see its
        // posts/{postId} create rule) -- most Morning and Evening entries
        // are well under that, but this is a hard cap enforced server-side
        // regardless, so truncate defensively rather than let an unusually
        // long entry get silently rejected by the rule.
        const bodyText = (entry.text || '').length > 1900 ? (entry.text.slice(0, 1900).trim() + '…') : (entry.text || '');
        await createPost({
          authorUid: state.user.uid, authorName: currentDisplayName() || 'Someone',
          kind: 'devotional',
          devotionalTitle: entry.title || '', devotionalRef: entry.ref || '',
          text: bodyText,
          mediaUrl: null, mediaKind: null, mediaStoragePath: null
        });
        devotionalPickerOpen = false;
        showToast('Devotional posted.');
      }catch(e){ showToast('Couldn&rsquo;t post &mdash; try again.'); postDevotionalBtn.disabled = false; }
      render();
    });
    document.querySelectorAll('[data-ask-delete-post]').forEach(function(btn){
      btn.addEventListener('click', function(){ postDeleteConfirmId = btn.getAttribute('data-ask-delete-post'); render(); });
    });
    document.querySelectorAll('[data-cancel-delete-post]').forEach(function(btn){
      btn.addEventListener('click', function(){ postDeleteConfirmId = null; render(); });
    });
    document.querySelectorAll('[data-confirm-delete-post]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-confirm-delete-post');
        const post = state.feedPosts.find(function(p){ return p.id===id; });
        try{ await deletePost(id, post); showToast('Deleted.'); }catch(e){ showToast('Couldn&rsquo;t delete &mdash; try again.'); }
        postDeleteConfirmId = null; render();
      });
    });
    document.querySelectorAll('[data-report-post]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-report-post');
        feedReportOpenId = (feedReportOpenId === id) ? null : id; feedReportReason = '';
        render();
      });
    });
    document.querySelectorAll('[data-report-reason-input]').forEach(function(el){
      el.addEventListener('input', function(){ feedReportReason = el.value; });
    });
    document.querySelectorAll('[data-submit-report-post]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-submit-report-post');
        await submitReportFor('post', id, feedReportReason);
        feedReportOpenId = null; feedReportReason = ''; render();
      });
    });
  }

  // ---- profile edit (My Profile) -----------------------------------------
  let profileEditBio = '';
  let profileEditPhotoBusy = false;
  let profileEditPhotoStatus = '';
  // [Bug found 2026-09-10, fixed v30] Jared: "how do I fix my name then"
  // -- turned out there was genuinely no way to. The ONLY place that ever
  // wrote displayName/churchName was the landing page's one-time "Almost
  // There" gate, and needsProfileSetup (see renderLanding()) goes false
  // the instant a name IS set -- so once you're past it, that card never
  // shows again, for anyone, ever. Combined with the hamburger menu always
  // being reachable regardless of that gate (nothing actually blocks
  // navigating straight into My Profile/Messages/Explore without ever
  // seeing it), it was entirely possible to reach Fellowship with no name
  // set at all and then have no path back to set one -- exactly what
  // happened to Jared's friend, and exactly why nobody could search for
  // that account by name even after v29's directory self-heal (a name
  // that was never saved anywhere has nothing to self-heal FROM). Fixed by
  // adding real name/church fields here, reusing saveProfile() the same
  // way BIO already does -- so a name can be set for the first time, or
  // changed later, from the one screen that's always reachable.
  let profileEditName = '';
  let profileEditChurch = '';

  function renderProfileEdit(){
    const p = state.profile || {};
    const favIds = p.favorites || [];
    const blockedUids = p.blockedUids || [];
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="profileEditBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">My Profile</p>' +
        '<p class="landing-sub">This is what other people in Fellowship see when they tap your name.</p>' +
      '</div>' +
      '<div class="session-card" style="text-align:center;">' +
        '<div style="display:flex;justify-content:center;margin-bottom:10px;">'+personAvatar(state.user.uid, 84)+'</div>' +
        '<label class="switch-account" style="cursor:pointer;'+(profileEditPhotoBusy?'opacity:.4;pointer-events:none;':'')+'">'+(p.photoURL?'CHANGE PHOTO':'ADD A PHOTO')+'<input type="file" id="profilePhotoInput" accept="image/*" style="display:none;" '+(profileEditPhotoBusy?'disabled':'')+'></label>' +
        (profileEditPhotoStatus ? ('<p class="hint" id="profilePhotoStatusText">'+escapeHtml(profileEditPhotoStatus)+'</p>') : '') +
      '</div>' +
      '<div class="session-card">' +
        '<div class="field"><label for="profileNameInput">YOUR NAME</label>' +
          '<input type="text" id="profileNameInput" maxlength="200" placeholder="e.g. Jared" value="'+escapeAttr(profileEditName)+'"></div>' +
        '<div class="field"><label for="profileChurchInput">YOUR CHURCH&rsquo;S NAME <span style="text-transform:none;font-weight:400;">(optional)</span></label>' +
          '<input type="text" id="profileChurchInput" maxlength="200" placeholder="e.g. Cedar Grove Baptist Church" value="'+escapeAttr(profileEditChurch)+'"></div>' +
        '<button class="btn btn-primary" id="profileNameSaveBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SAVE NAME</button>' +
      '</div>' +
      '<div class="session-card">' +
        '<div class="field"><label for="profileBioInput">BIO</label>' +
          '<textarea id="profileBioInput" rows="4" maxlength="500" placeholder="A little about you&hellip;">'+escapeHtml(profileEditBio)+'</textarea></div>' +
        '<button class="btn btn-primary" id="profileBioSaveBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('check')+'</svg>SAVE BIO</button>' +
      '</div>' +
      '<div class="session-card">' +
        '<h3>Favorite Hymns</h3>' +
        (favIds.length ? ('<p class="hint">Shown on your profile for anyone to see &mdash; '+favIds.length+' favorite'+(favIds.length===1?'':'s')+'.</p>') :
          '<p class="hint">Heart a hymn from the hymnal and it&rsquo;ll show up here on your profile.</p>') +
      '</div>' +
      // Blocked Accounts [2026-09-08] -- once someone's blocked, their
      // posts/DMs/group-invite search all hide them everywhere else in the
      // app (by design), which means without a list like this there'd be
      // no way back to their profile to ever unblock them again.
      (blockedUids.length ? (
        '<div class="session-card">' +
          '<h3>Blocked Accounts</h3>' +
          '<ul class="setlist-items">' + blockedUids.map(function(uid){
            const d = directoryEntry(uid);
            return '<li class="setlist-item"><span class="setlist-title">'+(d?escapeHtml(d.displayName||'(no name set)'):('id: '+escapeHtml(uid)))+'</span>' +
              '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-unblock-uid="'+escapeAttr(uid)+'" aria-label="Unblock" style="width:auto;padding:0 8px;">UNBLOCK</button></span></li>';
          }).join('') + '</ul>' +
        '</div>'
      ) : '');

    document.getElementById('profileEditBackBtn').addEventListener('click', function(){
      state.view = 'landing'; render(); window.scrollTo(0,0);
    });
    document.querySelectorAll('[data-unblock-uid]').forEach(function(btn){
      btn.addEventListener('click', function(){ toggleBlockUser(btn.getAttribute('data-unblock-uid')); render(); });
    });
    const nameInput = document.getElementById('profileNameInput');
    if(nameInput) nameInput.addEventListener('input', function(){ profileEditName = nameInput.value; });
    const churchInput = document.getElementById('profileChurchInput');
    if(churchInput) churchInput.addEventListener('input', function(){ profileEditChurch = churchInput.value; });
    const nameSaveBtn = document.getElementById('profileNameSaveBtn');
    if(nameSaveBtn) nameSaveBtn.addEventListener('click', async function(){
      const val = profileEditName.trim();
      if(!val){ showToast('Type a name first.'); return; }
      nameSaveBtn.disabled = true;
      try{ await saveProfile(state.user.uid, { displayName: val, churchName: profileEditChurch.trim() }); showToast('Saved.'); }
      catch(e){ showToast('Couldn&rsquo;t save &mdash; try again.' + describeError(e)); }
      nameSaveBtn.disabled = false;
    });
    const bioInput = document.getElementById('profileBioInput');
    if(bioInput) bioInput.addEventListener('input', function(){ profileEditBio = bioInput.value; });
    const bioSaveBtn = document.getElementById('profileBioSaveBtn');
    if(bioSaveBtn) bioSaveBtn.addEventListener('click', async function(){
      bioSaveBtn.disabled = true;
      try{ await saveProfile(state.user.uid, { bio: profileEditBio.trim() }); showToast('Saved.'); }
      catch(e){ showToast('Couldn&rsquo;t save &mdash; try again.'); }
      bioSaveBtn.disabled = false;
    });
    const photoInput = document.getElementById('profilePhotoInput');
    if(photoInput) photoInput.addEventListener('change', async function(){
      const file = photoInput.files && photoInput.files[0];
      if(!file) return;
      profileEditPhotoBusy = true; profileEditPhotoStatus = 'Uploading... 0%'; render();
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'image', function(pct){
          profileEditPhotoStatus = 'Uploading... ' + pct + '%';
          const statusEl = document.getElementById('profilePhotoStatusText');
          if(statusEl) statusEl.textContent = profileEditPhotoStatus;
        });
        await saveProfile(state.user.uid, { photoURL: result.url, photoStoragePath: result.storagePath });
        showToast('Photo updated.');
      }catch(e){
        showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why. Try again once it is.' + describeError(e));
      }
      profileEditPhotoBusy = false; profileEditPhotoStatus = ''; render();
    });
  }

  // ---- viewing someone else's profile ------------------------------------
  let profileBlockConfirmUid = null;
  let profileReportOpenUid = null;
  let profileReportReason = '';

  function renderProfileView(){
    const uid = state.viewProfileUid;
    const d = directoryEntry(uid);
    const isMe = state.user && uid === state.user.uid;
    const blocked = isBlockedByMe(uid);
    const favIds = (d && d.favorites) || [];
    const favSongs = favIds.map(function(id){ return state.library.find(function(s){ return s.id===id; }); }).filter(Boolean);
    const confirmingBlock = profileBlockConfirmUid === uid;
    const reporting = profileReportOpenUid === uid;
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="profileViewBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="session-card" style="text-align:center;">' +
        '<div style="display:flex;justify-content:center;margin-bottom:10px;">'+personAvatar(uid, 84)+'</div>' +
        '<h3>'+(d ? escapeHtml(d.displayName||'(no name set)') : 'Unknown Account')+'</h3>' +
        (d && d.churchName ? '<p class="hint">'+escapeHtml(d.churchName)+'</p>' : '') +
        // Follower/following counts [2026-09-09, social redesign] --
        // Facebook/Instagram-style, public, always shown (even to a
        // signed-out viewer or on your own profile) since they're already
        // wide-open-readable directory fields.
        '<p class="hint" style="margin-top:6px;"><strong>'+followerCountOf(uid)+'</strong> follower'+(followerCountOf(uid)===1?'':'s')+' &middot; <strong>'+followingCountOf(uid)+'</strong> following</p>' +
        (d && d.bio ? '<p style="white-space:pre-wrap;margin-top:10px;">'+escapeHtml(d.bio)+'</p>' : '') +
        (!isMe && state.user ? (
          '<div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap;">' +
            '<button class="btn '+(isFollowingUid(uid)?'btn-ghost':'btn-primary')+'" id="profileFollowBtn">'+(isFollowingUid(uid)?'FOLLOWING':'FOLLOW')+'</button>' +
            '<button class="btn btn-primary" id="profileDmBtn">MESSAGE</button>' +
            (confirmingBlock ?
              ('<span class="confirm-row"><span>'+(blocked?'Unblock':'Block')+' this person?</span>' +
                '<button class="btn btn-primary" id="profileBlockConfirmBtn">YES, '+(blocked?'UNBLOCK':'BLOCK')+'</button>' +
                '<button class="btn btn-ghost" id="profileBlockCancelBtn">CANCEL</button></span>') :
              ('<button class="btn btn-ghost" id="profileBlockAskBtn">'+(blocked?'UNBLOCK':'BLOCK')+'</button>')) +
            '<button class="btn btn-ghost" id="profileReportAskBtn">'+(reporting?'CANCEL':'REPORT')+'</button>' +
          '</div>'
        ) : '') +
        (reporting ? ('<div class="field" style="margin-top:12px;text-align:left;"><label for="profileReportReasonInput">WHY ARE YOU REPORTING THIS PROFILE?</label>' +
            '<textarea id="profileReportReasonInput" rows="2">'+escapeHtml(profileReportReason)+'</textarea></div>' +
            '<button class="btn btn-primary" id="profileReportSubmitBtn">SUBMIT REPORT</button>') : '') +
      '</div>' +
      (favSongs.length ? (
        '<div class="section-heading" style="margin-top:20px;"><h2 class="uc">Favorite Hymns</h2></div>' +
        '<ul class="setlist-items">' + favSongs.map(function(s){
          return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(s.title)+'</span></li>';
        }).join('') + '</ul>'
      ) : '') +
      (blocked ? '<p class="hint" style="margin-top:20px;">You&rsquo;ve blocked this person, so their posts are hidden from you.</p> ' : (
        '<div class="section-heading" style="margin-top:20px;"><h2 class="uc">Posts</h2></div>' +
        (state.viewProfilePosts.length ? state.viewProfilePosts.map(renderFeedPostCard).join('') :
          '<p class="hint">No posts yet.</p>')
      ));

    document.getElementById('profileViewBackBtn').addEventListener('click', function(){
      closeProfileView();
      state.view = 'fellowship'; render(); window.scrollTo(0,0);
    });
    document.querySelectorAll('[data-open-profile]').forEach(function(btn){
      btn.addEventListener('click', function(){ openProfileView(btn.getAttribute('data-open-profile')); });
    });
    const dmBtn = document.getElementById('profileDmBtn');
    if(dmBtn) dmBtn.addEventListener('click', function(){ openDmThread(uid); });
    const followBtn = document.getElementById('profileFollowBtn');
    if(followBtn) followBtn.addEventListener('click', function(){ toggleFollow(uid); });
    const blockAskBtn = document.getElementById('profileBlockAskBtn');
    if(blockAskBtn) blockAskBtn.addEventListener('click', function(){ profileBlockConfirmUid = uid; render(); });
    const blockCancelBtn = document.getElementById('profileBlockCancelBtn');
    if(blockCancelBtn) blockCancelBtn.addEventListener('click', function(){ profileBlockConfirmUid = null; render(); });
    const blockConfirmBtn = document.getElementById('profileBlockConfirmBtn');
    if(blockConfirmBtn) blockConfirmBtn.addEventListener('click', function(){ toggleBlockUser(uid); render(); });
    const reportAskBtn = document.getElementById('profileReportAskBtn');
    if(reportAskBtn) reportAskBtn.addEventListener('click', function(){
      profileReportOpenUid = (profileReportOpenUid === uid) ? null : uid; profileReportReason = ''; render();
    });
    const reportReasonInput = document.getElementById('profileReportReasonInput');
    if(reportReasonInput) reportReasonInput.addEventListener('input', function(){ profileReportReason = reportReasonInput.value; });
    const reportSubmitBtn = document.getElementById('profileReportSubmitBtn');
    if(reportSubmitBtn) reportSubmitBtn.addEventListener('click', async function(){
      await submitReportFor('profile', uid, profileReportReason);
      profileReportOpenUid = null; profileReportReason = ''; render();
    });
    // Delete/report-post handlers reused from the feed for any post cards
    // rendered above (renderFeedPostCard's data-* hooks are identical).
    document.querySelectorAll('[data-ask-delete-post]').forEach(function(btn){
      btn.addEventListener('click', function(){ postDeleteConfirmId = btn.getAttribute('data-ask-delete-post'); render(); });
    });
    document.querySelectorAll('[data-cancel-delete-post]').forEach(function(btn){
      btn.addEventListener('click', function(){ postDeleteConfirmId = null; render(); });
    });
    document.querySelectorAll('[data-confirm-delete-post]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-confirm-delete-post');
        const post = state.viewProfilePosts.find(function(p){ return p.id===id; });
        try{ await deletePost(id, post); showToast('Deleted.'); }catch(e){ showToast('Couldn&rsquo;t delete &mdash; try again.'); }
        postDeleteConfirmId = null; render();
      });
    });
    document.querySelectorAll('[data-report-post]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const id = btn.getAttribute('data-report-post');
        feedReportOpenId = (feedReportOpenId === id) ? null : id; feedReportReason = '';
        render();
      });
    });
    document.querySelectorAll('[data-report-reason-input]').forEach(function(el){
      el.addEventListener('input', function(){ feedReportReason = el.value; });
    });
    document.querySelectorAll('[data-submit-report-post]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-submit-report-post');
        await submitReportFor('post', id, feedReportReason);
        feedReportOpenId = null; feedReportReason = ''; render();
      });
    });
    attachFeedActionHandlers();
  }

  // ---- Shorts feed [2026-09-09] -- Jared: "add options to upload shorts
  // videos, as well, and a feed for shorts." Answer to "how should it
  // behave": "if [full-screen vertical swipe + autoplay] is doable, go; if
  // not, [a tap-to-play grid]." Full vertical swipe+autoplay turned out to
  // be reliably buildable with plain CSS scroll-snap (scroll-snap-type:y
  // mandatory on the container, scroll-snap-align:start on each card) plus
  // an IntersectionObserver to play/pause whichever video is on screen --
  // no gesture library needed -- so that's what shipped, inside a tall
  // self-contained scroll region rather than hijacking the whole page's
  // scroll (keeps the existing BACK button/subnav on-screen the whole
  // time, and doesn't touch the main-full-bleed mechanism the Presenter/
  // Projector view already owns for a different reason). ---------------
  let shortsIntersectionObserver = null;
  function setupShortsAutoplay(){
    if(shortsIntersectionObserver) shortsIntersectionObserver.disconnect();
    const container = document.getElementById('shortsFeedContainer');
    if(!container) return;
    shortsIntersectionObserver = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        const video = entry.target;
        if(entry.isIntersecting && entry.intersectionRatio > 0.6){ video.play().catch(function(){ /* autoplay may need a user gesture first -- fine, the tap-to-play controls are still there */ }); }
        else { video.pause(); }
      });
    }, { root: container, threshold: [0, 0.6, 1] });
    container.querySelectorAll('video').forEach(function(v){ shortsIntersectionObserver.observe(v); });
  }

  function renderShortsComposer(){
    const media = shortsComposerVideoResult;
    return '<div class="session-card">' +
      (media ? ('<video src="'+escapeAttr(media.url)+'" style="max-width:100%;max-height:280px;border-radius:10px;display:block;margin-bottom:10px;" controls></video>') :
        ('<label class="switch-account" style="cursor:pointer;'+(shortsComposerUploadBusy?'opacity:.4;pointer-events:none;':'')+'">+ CHOOSE A VIDEO<input type="file" id="shortVideoInput" accept="video/*" style="display:none;" '+(shortsComposerUploadBusy?'disabled':'')+'></label>')) +
      (shortsComposerUploadStatus ? ('<p class="hint" id="shortUploadStatusText">'+escapeHtml(shortsComposerUploadStatus)+'</p>') : '') +
      '<div class="field" style="margin-top:10px;"><label for="shortCaptionInput">CAPTION</label><textarea id="shortCaptionInput" rows="2" maxlength="500" placeholder="Say something about it&hellip;">'+escapeHtml(shortsComposerCaption)+'</textarea></div>' +
      '<div style="display:flex;gap:10px;margin-top:10px;">' +
        '<button class="btn btn-primary" id="shortSubmitBtn" '+(media?'':'disabled')+'>POST SHORT</button>' +
        '<button class="btn btn-ghost" id="shortCancelBtn">CANCEL</button>' +
      '</div>' +
    '</div>';
  }

  function renderShortCard(s){
    const isMine = state.user && s.authorUid === state.user.uid;
    const confirmingDelete = shortDeleteConfirmId === s.id;
    const d = directoryEntry(s.authorUid);
    return '<div class="short-card">' +
      '<video src="'+escapeAttr(s.videoUrl)+'" loop muted playsinline controls></video>' +
      '<div class="short-overlay">' +
        '<div class="short-overlay-author">' +
          '<button type="button" data-open-profile="'+escapeAttr(s.authorUid)+'" style="border:none;background:none;padding:0;cursor:pointer;">'+personAvatar(s.authorUid,36)+'</button>' +
          '<button type="button" class="link-btn" data-open-profile="'+escapeAttr(s.authorUid)+'" style="color:#fff;font-weight:700;">'+(d?escapeHtml(d.displayName||'(no name set)'):escapeHtml(s.authorName||'Someone'))+'</button>' +
        '</div>' +
        (s.caption ? ('<p class="short-caption">'+escapeHtml(s.caption)+'</p>') : '') +
        renderActionBar('shorts', s, s.authorUid) +
        (isMine ? (confirmingDelete ?
          ('<div class="confirm-row"><span>Delete this short?</span><button class="btn btn-primary" data-confirm-delete-short="'+s.id+'">YES, DELETE</button><button class="btn btn-ghost" data-cancel-delete-short="'+s.id+'">CANCEL</button></div>') :
          ('<button type="button" class="switch-account" style="color:#fff;" data-ask-delete-short="'+s.id+'">DELETE</button>')) : '') +
        renderCommentThread('shorts', s.id) +
      '</div>' +
    '</div>';
  }

  function renderShortsFeed(){
    const visible = state.shortsFeed.filter(function(s){ return !isBlockedByMe(s.authorUid); });
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="shortsBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      renderFellowshipSubnav('shorts') +
      '<div class="landing-hero"><p class="display landing-greeting">Shorts</p><p class="landing-sub">Short vertical videos &mdash; swipe up for the next one.</p></div>' +
      (state.user ? ('<div style="text-align:center;margin-bottom:16px;"><button class="btn btn-primary" id="shortsUploadToggleBtn">'+(shortsComposerOpen?'CANCEL':'+ UPLOAD A SHORT')+'</button></div>') : '') +
      (shortsComposerOpen ? renderShortsComposer() : '') +
      (visible.length ?
        ('<div class="shorts-feed" id="shortsFeedContainer">' + visible.map(renderShortCard).join('') + '</div>') :
        '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon('video')+'</svg><p>No Shorts yet &mdash; be the first to post one.</p></div>');

    document.getElementById('shortsBackBtn').addEventListener('click', function(){
      stopShortsFeedWatch(); closeComments();
      if(shortsIntersectionObserver){ shortsIntersectionObserver.disconnect(); shortsIntersectionObserver = null; }
      state.view = 'landing'; render(); window.scrollTo(0,0);
    });
    attachFellowshipSubnavHandlers();
    attachFeedActionHandlers();
    document.querySelectorAll('[data-open-profile]').forEach(function(btn){
      btn.addEventListener('click', function(){ openProfileView(btn.getAttribute('data-open-profile')); });
    });
    const uploadToggleBtn = document.getElementById('shortsUploadToggleBtn');
    if(uploadToggleBtn) uploadToggleBtn.addEventListener('click', function(){ shortsComposerOpen = !shortsComposerOpen; render(); });
    const cancelBtn = document.getElementById('shortCancelBtn');
    if(cancelBtn) cancelBtn.addEventListener('click', function(){ shortsComposerOpen = false; shortsComposerVideoResult = null; shortsComposerCaption = ''; render(); });
    const captionInput = document.getElementById('shortCaptionInput');
    if(captionInput) captionInput.addEventListener('input', function(){ shortsComposerCaption = captionInput.value; });
    const videoInput = document.getElementById('shortVideoInput');
    if(videoInput) videoInput.addEventListener('change', async function(){
      const file = videoInput.files && videoInput.files[0];
      if(!file) return;
      shortsComposerUploadBusy = true; shortsComposerUploadStatus = 'Uploading... 0%'; render();
      try{
        const result = await uploadMediaFile(file, state.user.uid, 'video', function(pct){ shortsComposerUploadStatus = 'Uploading... '+pct+'%'; });
        shortsComposerVideoResult = { url: result.url, storagePath: result.storagePath };
      }catch(e){ showToast('Upload failed &mdash; if Cloud Storage/Blaze billing isn&rsquo;t set up yet, that&rsquo;s why. Try again once it is.' + describeError(e)); }
      shortsComposerUploadBusy = false; shortsComposerUploadStatus = ''; render();
    });
    const submitBtn = document.getElementById('shortSubmitBtn');
    if(submitBtn) submitBtn.addEventListener('click', async function(){
      const media = shortsComposerVideoResult;
      if(!media) return;
      submitBtn.disabled = true;
      try{
        await createShort({
          authorUid: state.user.uid, authorName: currentDisplayName() || 'Someone',
          videoUrl: media.url, videoStoragePath: media.storagePath, caption: shortsComposerCaption.trim().slice(0,500)
        });
        shortsComposerOpen = false; shortsComposerVideoResult = null; shortsComposerCaption = '';
        showToast('Short posted.');
      }catch(e){ showToast('Couldn&rsquo;t post &mdash; try again.'); }
      submitBtn.disabled = false; render();
    });
    document.querySelectorAll('[data-ask-delete-short]').forEach(function(btn){
      btn.addEventListener('click', function(){ shortDeleteConfirmId = btn.getAttribute('data-ask-delete-short'); render(); });
    });
    document.querySelectorAll('[data-cancel-delete-short]').forEach(function(btn){
      btn.addEventListener('click', function(){ shortDeleteConfirmId = null; render(); });
    });
    document.querySelectorAll('[data-confirm-delete-short]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        const id = btn.getAttribute('data-confirm-delete-short');
        const short = state.shortsFeed.find(function(x){ return x.id===id; });
        try{ await deleteShort(id, short); showToast('Deleted.'); }catch(e){ showToast('Couldn&rsquo;t delete &mdash; try again.'); }
        shortDeleteConfirmId = null; render();
      });
    });
    setupShortsAutoplay();
  }

  // ---- Explore / Discover + People Search [2026-09-09] -- Jared: "add a
  // feature where people can search for people and interact just like
  // facebook," plus the separately-requested Explore/Discover page.
  // Consolidated into one screen: a people-search box (reusing state.
  // directory, the same client-filtered search every other "find someone"
  // box in this app already uses) with FOLLOW/MESSAGE/VIEW on each result,
  // suggested people (directory entries you don't already follow), and a
  // trending-posts rail (re-sorts the SAME feed data already loaded by
  // watchFeedPosts by like count instead of recency -- see the comment on
  // this in firestore-data-layer.js for why that beats a dedicated query).
  function trendingPosts(){
    const cutoff = Date.now() - 14*24*60*60*1000;
    return state.feedPosts
      .filter(function(p){ return !isBlockedByMe(p.authorUid) && toMillis(p.createdAt) > cutoff; })
      .slice()
      .sort(function(a,b){ return itemLikeCount('posts',b) - itemLikeCount('posts',a); })
      .slice(0, 10);
  }
  function suggestedPeople(){
    if(!state.user) return [];
    return state.directory
      .filter(function(d){ return d.uid !== state.user.uid && !isFollowingUid(d.uid); })
      .slice(0, 12);
  }
  function searchedPeople(){
    const q = exploreSearchQuery.trim().toLowerCase();
    if(!q) return [];
    return state.directory.filter(function(d){
      return d.uid !== (state.user && state.user.uid) &&
        ((d.displayName||'').toLowerCase().indexOf(q) !== -1 || (d.churchName||'').toLowerCase().indexOf(q) !== -1);
    }).slice(0, 30);
  }
  function renderPersonRow(d){
    return '<div class="person-row">' +
      '<button type="button" data-open-profile="'+escapeAttr(d.uid)+'" style="border:none;background:none;padding:0;cursor:pointer;">'+personAvatar(d.uid,44)+'</button>' +
      '<div style="flex:1;min-width:0;">' +
        '<button type="button" class="link-btn" data-open-profile="'+escapeAttr(d.uid)+'" style="font-weight:700;">'+escapeHtml(d.displayName||'(no name set)')+'</button>' +
        (d.churchName ? ('<p class="hint">'+escapeHtml(d.churchName)+'</p>') : '') +
      '</div>' +
      (state.user && d.uid !== state.user.uid ? ('<button type="button" class="btn btn-sm '+(isFollowingUid(d.uid)?'btn-ghost':'btn-primary')+'" data-follow-uid="'+escapeAttr(d.uid)+'">'+(isFollowingUid(d.uid)?'FOLLOWING':'FOLLOW')+'</button>') : '') +
    '</div>';
  }
  function renderExplore(){
    const results = searchedPeople();
    const suggestions = suggestedPeople();
    const trending = trendingPosts();
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="exploreBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      renderFellowshipSubnav('explore') +
      '<div class="landing-hero"><p class="display landing-greeting">Explore</p><p class="landing-sub">Search for people, find who to follow, and see what&rsquo;s trending &mdash; cross-church.</p></div>' +
      '<div class="field"><label for="peopleSearchInput">SEARCH FOR PEOPLE (NAME OR CHURCH)</label><input type="text" id="peopleSearchInput" placeholder="e.g. Jared, or Cedar Grove Baptist" value="'+escapeAttr(exploreSearchQuery)+'"></div>' +
      (exploreSearchQuery.trim() ? (
        '<div class="section-heading"><h2 class="uc">Results</h2></div>' +
        (results.length ? results.map(renderPersonRow).join('') : '<p class="hint">No one found.</p>')
      ) : (
        (suggestions.length ? ('<div class="section-heading"><h2 class="uc">Suggested People</h2></div>' + suggestions.map(renderPersonRow).join('')) : '') +
        '<div class="section-heading" style="margin-top:20px;"><h2 class="uc">Trending Posts</h2></div>' +
        (trending.length ? trending.map(renderFeedPostCard).join('') : '<p class="hint">Nothing trending yet.</p>')
      ));

    document.getElementById('exploreBackBtn').addEventListener('click', function(){
      stopFeedPostsWatch(); closeComments();
      state.view = 'landing'; render(); window.scrollTo(0,0);
    });
    attachFellowshipSubnavHandlers();
    attachFeedActionHandlers();
    document.querySelectorAll('[data-open-profile]').forEach(function(btn){
      btn.addEventListener('click', function(){ openProfileView(btn.getAttribute('data-open-profile')); });
    });
    document.querySelectorAll('[data-follow-uid]').forEach(function(btn){
      btn.addEventListener('click', function(){ toggleFollow(btn.getAttribute('data-follow-uid')); });
    });
    const searchInput = document.getElementById('peopleSearchInput');
    if(searchInput) searchInput.addEventListener('input', function(){ exploreSearchQuery = searchInput.value; render(); searchInput.focus(); searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length); });
  }

  // ---- Notifications [2026-09-09] ----------------------------------------
  function notificationText(n){
    const who = escapeHtml(n.actorName || 'Someone');
    if(n.type === 'like') return who + ' liked your ' + (n.kind === 'shorts' ? 'short' : 'post') + '.';
    if(n.type === 'comment') return who + ' commented on your ' + (n.kind === 'shorts' ? 'short' : 'post') + '.';
    if(n.type === 'repost') return who + ' reposted your post.';
    if(n.type === 'follow') return who + ' started following you.';
    if(n.type === 'message') return who + ' sent you a message.';
    // 'session_live' [2026-09-17] -- written server-side by
    // onNewSessionNotify (functions/index.js) when this person follows the
    // host or shares their church; n.churchName is only ever set for the
    // church-match case (see that function's comment), so the wording
    // matches whichever reason actually applies.
    if(n.type === 'session_live') return who + (n.churchName ? (' at '+escapeHtml(n.churchName)) : '') + ' just started a worship session'+(n.roomName ? (': '+escapeHtml(n.roomName)) : '')+'.';
    return who + ' interacted with your Fellowship activity.';
  }
  function renderNotifications(){
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="notifBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero"><p class="display landing-greeting">Notifications</p></div>' +
      (state.notifications.length ? state.notifications.map(function(n){
        return '<div class="notif-row'+(n.read?'':' notif-row-unread')+'" data-notif-id="'+escapeAttr(n.id)+'" data-open-notif-actor="'+escapeAttr(n.actorUid)+'" data-open-notif-type="'+escapeAttr(n.type||'')+'" data-open-notif-room="'+escapeAttr(n.roomCode||'')+'">' +
          personAvatar(n.actorUid, 40) +
          '<div style="flex:1;min-width:0;"><p>'+notificationText(n)+'</p><p class="hint">'+postAge(n.createdAt)+'</p></div>' +
        '</div>';
      }).join('') : '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icon('heart')+'</svg><p>No notifications yet.</p></div>');

    document.getElementById('notifBackBtn').addEventListener('click', function(){
      state.view = 'landing'; render(); window.scrollTo(0,0);
    });
    document.querySelectorAll('[data-open-notif-actor]').forEach(function(row){
      row.addEventListener('click', function(){
        const id = row.getAttribute('data-notif-id');
        const actorUid = row.getAttribute('data-open-notif-actor');
        const type = row.getAttribute('data-open-notif-type');
        // Unread badge fix [2026-09-24] -- see renderNotifDropdown()'s
        // matching fix for the full story: nothing marked an individual
        // notification read on click before this, anywhere -- only the
        // delayed mark-ALL-read this screen's own openNotifications() kicks
        // off. Marking it here too means it's reliably read the instant
        // it's actually opened, not just eventually.
        if(id && state.user) markNotificationRead(state.user.uid, id).catch(function(){});
        // A message notification opens straight into the conversation (the
        // thing it's actually about); a session_live notification [2026-09-
        // 17] joins that room the same way, since what it's "about" is the
        // session itself, not the host's profile -- same reasoning, new
        // type. Everything else (like/comment/follow/repost) still opens
        // the actor's profile.
        if(type === 'message'){ openDmThread(actorUid); }
        else if(type === 'session_live'){
          const code = row.getAttribute('data-open-notif-room');
          if(code) goToJoinScreenWithCode(code);
        }
        else { openProfileView(actorUid); }
      });
    });
  }

  // ---- Messages hub (DMs + Group Chats) ----------------------------------
  let dmNewThreadQuery = '';
  let dmComposerText = '';
  let groupChatCreateOpen = false;
  let groupChatCreateName = '';
  let groupChatCreateMemberQuery = '';
  let groupChatCreateSelectedUids = [];
  let groupChatComposerText = '';
  let groupChatManageOpen = false;
  let groupLeaveConfirm = false;

  function renderNewDmResults(query){
    const q = query.trim().toLowerCase();
    if(!q) return '';
    const matches = state.directory.filter(function(u){
      return u.uid !== state.user.uid && !isBlockedByMe(u.uid) &&
        ((u.displayName||'').toLowerCase().includes(q) || (u.churchName||'').toLowerCase().includes(q));
    }).slice(0,8);
    if(!matches.length) return '<p class="hint">No matching accounts.</p>';
    return '<ul class="setlist-items">' + matches.map(function(u){
      return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(u.displayName||'(no name set)')+
        (u.churchName ? ' <span class="hint">&middot; '+escapeHtml(u.churchName)+'</span>' : '') + '</span>' +
        '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-start-dm="'+escapeAttr(u.uid)+'" aria-label="Message" style="width:auto;padding:0 8px;">MESSAGE</button></span></li>';
    }).join('') + '</ul>';
  }

  function renderGroupCreateMemberResults(query){
    const q = query.trim().toLowerCase();
    if(!q) return '';
    const matches = state.directory.filter(function(u){
      return u.uid !== state.user.uid && !groupChatCreateSelectedUids.includes(u.uid) && !isBlockedByMe(u.uid) &&
        ((u.displayName||'').toLowerCase().includes(q) || (u.churchName||'').toLowerCase().includes(q));
    }).slice(0,8);
    if(!matches.length) return '<p class="hint">No matching accounts.</p>';
    return '<ul class="setlist-items">' + matches.map(function(u){
      return '<li class="setlist-item"><span class="setlist-title">'+escapeHtml(u.displayName||'(no name set)')+
        (u.churchName ? ' <span class="hint">&middot; '+escapeHtml(u.churchName)+'</span>' : '') + '</span>' +
        '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-add-group-member="'+escapeAttr(u.uid)+'" aria-label="Add" style="width:auto;padding:0 8px;">ADD</button></span></li>';
    }).join('') + '</ul>';
  }

  function renderGroupCreatePanel(){
    return '<div class="session-card">' +
      '<div class="field"><label for="groupNameInput">GROUP NAME</label><input type="text" id="groupNameInput" placeholder="e.g. Youth Group, Choir" value="'+escapeAttr(groupChatCreateName)+'"></div>' +
      (groupChatCreateSelectedUids.length ? ('<p class="control-label uc" style="margin-bottom:8px;">Members</p><ul class="setlist-items">' +
        groupChatCreateSelectedUids.map(function(uid){
          const d = directoryEntry(uid);
          return '<li class="setlist-item"><span class="setlist-title">'+(d?escapeHtml(d.displayName||'(no name set)'):escapeHtml(uid))+'</span>' +
            '<span class="setlist-controls"><button type="button" class="icon-btn-sm" data-remove-group-member="'+escapeAttr(uid)+'" aria-label="Remove">&times;</button></span></li>';
        }).join('') + '</ul>') : '') +
      '<div class="field"><label for="groupMemberSearch">ADD PEOPLE BY NAME OR CHURCH</label>' +
        '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
        '<input type="text" id="groupMemberSearch" placeholder="Search&hellip;" value="'+escapeAttr(groupChatCreateMemberQuery)+'" autocomplete="off"></div></div>' +
      '<div id="groupMemberResults">' + renderGroupCreateMemberResults(groupChatCreateMemberQuery) + '</div>' +
      '<div style="display:flex;gap:10px;margin-top:14px;">' +
        '<button class="btn btn-primary" id="groupCreateSaveBtn">CREATE GROUP</button>' +
        '<button class="btn btn-ghost" id="groupCreateCancelBtn">CANCEL</button>' +
      '</div>' +
    '</div>';
  }

  function renderMessages(){
    const dmTab = state.messagesTab === 'dms';
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="messagesBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero">' +
        '<p class="display landing-greeting">Messages</p>' +
      '</div>' +
      '<div class="content-segmented" style="margin-bottom:14px;">' +
        '<button class="segment-btn'+(dmTab?' active':'')+'" id="messagesTabDmsBtn"><span>DIRECT MESSAGES</span></button>' +
        '<button class="segment-btn'+(!dmTab?' active':'')+'" id="messagesTabGroupsBtn"><span>GROUP CHATS</span></button>' +
      '</div>' +
      (dmTab ? (
        '<div class="field"><label for="dmNewSearch">START A NEW CONVERSATION</label>' +
          '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+icon('search')+'</svg>' +
          '<input type="text" id="dmNewSearch" placeholder="Search by name or church&hellip;" value="'+escapeAttr(dmNewThreadQuery)+'" autocomplete="off"></div></div>' +
        '<div id="dmNewResults">' + renderNewDmResults(dmNewThreadQuery) + '</div>' +
        '<div class="section-heading" style="margin-top:16px;"><h2 class="uc">Conversations</h2></div>' +
        (state.myDmThreads.length ? state.myDmThreads.filter(function(t){
            const other = (t.participantUids||[]).find(function(u){ return u!==state.user.uid; });
            return other && !isBlockedByMe(other);
          }).map(function(t){
            const other = (t.participantUids||[]).find(function(u){ return u!==state.user.uid; });
            const d = directoryEntry(other);
            return '<div class="room-list-card" data-open-dm="'+escapeAttr(other)+'" style="cursor:pointer;">' +
              '<div class="room-list-meta" style="display:flex;align-items:center;gap:10px;flex:1;">' +
                personAvatar(other, 40) +
                '<span><p class="room-name">'+(d?escapeHtml(d.displayName||'(no name set)'):'(unknown)')+'</p>' +
                (t.lastMessageText ? '<p class="room-sub">'+escapeHtml(t.lastMessageText.slice(0,80))+'</p>' : '') +
                '</span>' +
              '</div>' +
            '</div>';
          }).join('') : '<p class="hint">No conversations yet &mdash; search for someone above.</p>')
      ) : (
        (groupChatCreateOpen ? renderGroupCreatePanel() :
          '<button class="btn btn-ghost btn-block" id="groupCreateOpenBtn" style="margin-bottom:14px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('plus')+'</svg>NEW GROUP CHAT</button>') +
        (state.myGroupChats.length ? state.myGroupChats.map(function(g){
            return '<div class="room-list-card" data-open-group="'+escapeAttr(g.id)+'" style="cursor:pointer;">' +
              '<div class="room-list-meta" style="display:flex;align-items:center;gap:10px;flex:1;">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;flex:none;color:var(--ink-soft);">'+icon('mic')+'</svg>' +
                '<span><p class="room-name">'+escapeHtml(g.name||'Untitled Group')+'</p>' +
                '<p class="room-sub">'+(g.memberUids||[]).length+' members'+(g.lastMessageText?(' &middot; '+escapeHtml(g.lastMessageText.slice(0,60))):'')+'</p></span>' +
              '</div>' +
            '</div>';
          }).join('') : (groupChatCreateOpen ? '' : '<p class="hint">No group chats yet.</p>'))
      ));

    document.getElementById('messagesBackBtn').addEventListener('click', function(){
      stopMyDmThreadsWatch(); stopMyGroupChatsWatch();
      state.view = 'landing'; render(); window.scrollTo(0,0);
    });
    document.getElementById('messagesTabDmsBtn').addEventListener('click', function(){ state.messagesTab = 'dms'; render(); });
    document.getElementById('messagesTabGroupsBtn').addEventListener('click', function(){ state.messagesTab = 'groups'; render(); });

    const dmSearch = document.getElementById('dmNewSearch');
    if(dmSearch) dmSearch.addEventListener('input', function(){
      dmNewThreadQuery = dmSearch.value;
      const holder = document.getElementById('dmNewResults');
      if(holder){ holder.innerHTML = renderNewDmResults(dmNewThreadQuery); wireDmStartButtons(); }
    });
    function wireDmStartButtons(){
      document.querySelectorAll('[data-start-dm]').forEach(function(btn){
        btn.addEventListener('click', function(){ openDmThread(btn.getAttribute('data-start-dm')); });
      });
    }
    wireDmStartButtons();
    document.querySelectorAll('[data-open-dm]').forEach(function(card){
      card.addEventListener('click', function(){ openDmThread(card.getAttribute('data-open-dm')); });
    });
    document.querySelectorAll('[data-open-group]').forEach(function(card){
      card.addEventListener('click', function(){ openGroupChatThread(card.getAttribute('data-open-group')); });
    });

    const groupOpenBtn = document.getElementById('groupCreateOpenBtn');
    if(groupOpenBtn) groupOpenBtn.addEventListener('click', function(){
      groupChatCreateOpen = true; groupChatCreateName = ''; groupChatCreateMemberQuery = ''; groupChatCreateSelectedUids = [];
      render();
    });
    const groupCancelBtn = document.getElementById('groupCreateCancelBtn');
    if(groupCancelBtn) groupCancelBtn.addEventListener('click', function(){ groupChatCreateOpen = false; render(); });
    const groupNameInput = document.getElementById('groupNameInput');
    if(groupNameInput) groupNameInput.addEventListener('input', function(){ groupChatCreateName = groupNameInput.value; });
    const groupMemberSearch = document.getElementById('groupMemberSearch');
    if(groupMemberSearch) groupMemberSearch.addEventListener('input', function(){
      groupChatCreateMemberQuery = groupMemberSearch.value;
      const holder = document.getElementById('groupMemberResults');
      if(holder){ holder.innerHTML = renderGroupCreateMemberResults(groupChatCreateMemberQuery); wireAddMemberButtons(); }
    });
    function wireAddMemberButtons(){
      document.querySelectorAll('[data-add-group-member]').forEach(function(btn){
        btn.addEventListener('click', function(){
          groupChatCreateSelectedUids.push(btn.getAttribute('data-add-group-member'));
          groupChatCreateMemberQuery = '';
          render();
        });
      });
    }
    wireAddMemberButtons();
    document.querySelectorAll('[data-remove-group-member]').forEach(function(btn){
      btn.addEventListener('click', function(){
        groupChatCreateSelectedUids = groupChatCreateSelectedUids.filter(function(u){ return u!==btn.getAttribute('data-remove-group-member'); });
        render();
      });
    });
    const groupSaveBtn = document.getElementById('groupCreateSaveBtn');
    if(groupSaveBtn) groupSaveBtn.addEventListener('click', async function(){
      const name = groupChatCreateName.trim();
      if(!name){ showToast('Give the group a name first.'); return; }
      if(!groupChatCreateSelectedUids.length){ showToast('Add at least one other person first.'); return; }
      groupSaveBtn.disabled = true;
      try{
        const groupId = await createGroupChat({
          name: name, ownerUid: state.user.uid,
          memberUids: [state.user.uid].concat(groupChatCreateSelectedUids)
        });
        groupChatCreateOpen = false;
        showToast('Group created.');
        openGroupChatThread(groupId);
      }catch(e){ showToast('Couldn&rsquo;t create that group &mdash; try again.'); groupSaveBtn.disabled = false; }
    });
  }

  // ---- one DM thread -------------------------------------------------------
  // Shared between renderDmThread()'s own initial render and
  // startDmMessagesWatch()'s patch-in-place update below.
  function renderDmMessagesHtml(messages, uid){
    return messages.length ? messages.map(function(m){
      const mine = m.senderUid === uid;
      return '<div class="msg-row '+(mine?'msg-row-mine':'msg-row-theirs')+'">' +
        '<div class="msg-bubble '+(mine?'msg-bubble-mine':'msg-bubble-theirs')+'">'+escapeHtml(m.text||'')+'</div>' +
        '<p class="hint" style="margin-top:2px;">'+postAge(m.createdAt)+'</p>' +
      '</div>';
    }).join('') : '<p class="hint" style="text-align:center;">Say hello&hellip;</p>';
  }
  function renderDmThread(){
    const threadId = state.activeDmThreadId;
    const thread = state.myDmThreads.find(function(t){ return t.id === threadId; });
    const other = thread ? (thread.participantUids||[]).find(function(u){ return u!==state.user.uid; }) : null;
    const d = other ? directoryEntry(other) : null;
    const blocked = other && isBlockedByMe(other);
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="dmBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero" style="padding-bottom:10px;">' +
        '<p class="display landing-greeting" style="display:flex;align-items:center;gap:10px;justify-content:center;">' +
          (other ? personAvatar(other, 34) : '') + (d ? escapeHtml(d.displayName||'(no name set)') : 'Conversation') +
        '</p>' +
        (other ? '<p style="text-align:center;"><button type="button" class="link-btn" data-open-profile="'+escapeAttr(other)+'">VIEW PROFILE</button></p>' : '') +
      '</div>' +
      '<div id="threadScrollBody" class="thread-scroll-body">' + renderDmMessagesHtml(state.activeDmMessages, state.user.uid) + '</div>' +
      (blocked ? '<p class="hint" style="margin-top:10px;">You&rsquo;ve blocked this person, so you can&rsquo;t message each other.</p>' : (
        '<div class="thread-composer-row">' +
          '<input type="text" id="dmComposerInput" placeholder="Message&hellip;" value="'+escapeAttr(dmComposerText)+'">' +
          '<button class="btn btn-primary" id="dmSendBtn">SEND</button>' +
        '</div>'
      ));

    document.getElementById('dmBackBtn').addEventListener('click', closeDmThread);
    const profileLink = document.querySelector('[data-open-profile]');
    if(profileLink) profileLink.addEventListener('click', function(){ openProfileView(other); });
    const input = document.getElementById('dmComposerInput');
    if(input){
      input.addEventListener('input', function(){ dmComposerText = input.value; });
      input.addEventListener('keydown', function(e){ if(e.key==='Enter') sendCurrentDm(); });
    }
    const sendBtn = document.getElementById('dmSendBtn');
    if(sendBtn) sendBtn.addEventListener('click', sendCurrentDm);
    async function sendCurrentDm(){
      const text = dmComposerText.trim();
      if(!text || !threadId) return;
      dmComposerText = '';
      const inputEl = document.getElementById('dmComposerInput');
      if(inputEl) inputEl.value = '';
      try{
        await sendDmMessage(threadId, { senderUid: state.user.uid, text: text });
        // [2026-09-10, v31] Jared: "message came through but no notifs came
        // through" -- DM sends never called notify() at all, unlike likes/
        // comments/follows/reposts. This was a disclosed v1 scope decision
        // ("Deliberately not built"), not a bug, but Jared's asked for it
        // enough times now that it's worth just building -- reuses the
        // exact same notify()/notificationText() plumbing every other
        // notification type already goes through, no new infrastructure.
        if(other) notify(other, { type:'message', threadId: threadId });
      }
      catch(e){ showToast('Couldn&rsquo;t send &mdash; try again.'); }
    }
  }

  // ---- one group chat thread ----------------------------------------------
  // Shared between renderGroupChatThread()'s own initial render and
  // startGroupChatThreadWatch()'s patch-in-place update below.
  function renderGroupMessagesHtml(messages, uid){
    return messages.length ? messages.map(function(m){
      const mine = m.senderUid === uid;
      const d = directoryEntry(m.senderUid);
      return '<div class="msg-row '+(mine?'msg-row-mine':'msg-row-theirs')+'">' +
        (!mine ? '<p class="hint" style="margin-bottom:2px;">'+(d?escapeHtml(d.displayName||'(no name set)'):'Someone')+'</p>' : '') +
        '<div class="msg-bubble '+(mine?'msg-bubble-mine':'msg-bubble-theirs')+'">'+escapeHtml(m.text||'')+'</div>' +
        '<p class="hint" style="margin-top:2px;">'+postAge(m.createdAt)+'</p>' +
      '</div>';
    }).join('') : '<p class="hint" style="text-align:center;">No messages yet&hellip;</p>';
  }
  function renderGroupChatThread(){
    const group = state.activeGroupChat;
    const isOwner = group && state.user && group.ownerUid === state.user.uid;
    main.innerHTML =
      '<div class="back-row"><button class="back-btn" id="groupBackBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'+icon('back')+'</svg>BACK</button></div>' +
      '<div class="landing-hero" style="padding-bottom:10px;">' +
        '<p class="display landing-greeting">'+(group?escapeHtml(group.name||'Group Chat'):'Group Chat')+'</p>' +
        '<p style="text-align:center;"><button type="button" class="link-btn" id="groupManageToggleBtn">'+(group?(group.memberUids||[]).length:0)+' MEMBERS</button></p>' +
      '</div>' +
      (groupChatManageOpen && group ? (
        '<div class="session-card">' +
          '<ul class="setlist-items">' + (group.memberUids||[]).map(function(uid){
            const d = directoryEntry(uid);
            return '<li class="setlist-item"><span class="setlist-title">'+(d?escapeHtml(d.displayName||'(no name set)'):escapeHtml(uid))+(uid===group.ownerUid?' <span class="hint">&middot; owner</span>':'')+'</span></li>';
          }).join('') + '</ul>' +
          (groupLeaveConfirm ?
            ('<div class="confirm-row"><span>Leave this group?</span>' +
              '<button class="btn btn-primary" id="groupLeaveConfirmBtn">YES, LEAVE</button>' +
              '<button class="btn btn-ghost" id="groupLeaveCancelBtn">CANCEL</button></div>') :
            ('<button class="btn btn-ghost" id="groupLeaveAskBtn" style="margin-top:10px;">'+(isOwner?'DELETE GROUP':'LEAVE GROUP')+'</button>')) +
        '</div>'
      ) : '') +
      '<div id="threadScrollBody" class="thread-scroll-body">' + renderGroupMessagesHtml(state.activeGroupMessages, state.user.uid) + '</div>' +
      '<div class="thread-composer-row">' +
        '<input type="text" id="groupComposerInput" placeholder="Message&hellip;" value="'+escapeAttr(groupChatComposerText)+'">' +
        '<button class="btn btn-primary" id="groupSendBtn">SEND</button>' +
      '</div>';

    document.getElementById('groupBackBtn').addEventListener('click', closeGroupChatThread);
    document.getElementById('groupManageToggleBtn').addEventListener('click', function(){ groupChatManageOpen = !groupChatManageOpen; groupLeaveConfirm = false; render(); });
    const leaveAskBtn = document.getElementById('groupLeaveAskBtn');
    if(leaveAskBtn) leaveAskBtn.addEventListener('click', function(){ groupLeaveConfirm = true; render(); });
    const leaveCancelBtn = document.getElementById('groupLeaveCancelBtn');
    if(leaveCancelBtn) leaveCancelBtn.addEventListener('click', function(){ groupLeaveConfirm = false; render(); });
    const leaveConfirmBtn = document.getElementById('groupLeaveConfirmBtn');
    if(leaveConfirmBtn) leaveConfirmBtn.addEventListener('click', async function(){
      try{
        if(isOwner){
          // The owner can't just self-remove via the member-only carve-out
          // (firestore.rules' groupChats update rule only lets a NON-owner
          // remove themselves that way) -- and leaving an owner-less group
          // behind would mean no one could ever rename/manage/delete it
          // again. Simplest safe story: the owner leaving deletes the
          // whole group for everyone, which is exactly what "DELETE GROUP"
          // told them would happen.
          await deleteGroupChat(state.activeGroupChatId);
        } else {
          await updateGroupChat(state.activeGroupChatId, { memberUids: (group.memberUids||[]).filter(function(u){ return u!==state.user.uid; }) });
        }
        showToast(isOwner ? 'Group deleted.' : 'Left the group.');
        closeGroupChatThread();
      }catch(e){ showToast('Couldn&rsquo;t finish that &mdash; try again.'); }
    });
    const input = document.getElementById('groupComposerInput');
    if(input){
      input.addEventListener('input', function(){ groupChatComposerText = input.value; });
      input.addEventListener('keydown', function(e){ if(e.key==='Enter') sendCurrentGroupMsg(); });
    }
    const sendBtn = document.getElementById('groupSendBtn');
    if(sendBtn) sendBtn.addEventListener('click', sendCurrentGroupMsg);
    async function sendCurrentGroupMsg(){
      const text = groupChatComposerText.trim();
      const groupId = state.activeGroupChatId;
      if(!text || !groupId) return;
      groupChatComposerText = '';
      const inputEl = document.getElementById('groupComposerInput');
      if(inputEl) inputEl.value = '';
      try{ await sendGroupChatMessage(groupId, { senderUid: state.user.uid, text: text }); }
      catch(e){ showToast('Couldn&rsquo;t send &mdash; try again.'); }
    }
  }

  function showToast(msg){
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').innerHTML = msg;
    t.classList.add('show');
    clearTimeout(showToast._h);
    showToast._h = setTimeout(function(){ t.classList.remove('show'); }, 3200);
    // Tap-to-dismiss [2026-09-15] -- Jared: "the Live now pop up takes too
    // long to go away and it blocks the bottom view especially in mobile.
    // give an option to tap it and it goes away." (See styles.css's own
    // .toast comment for the OTHER half of this fix -- lifting it above
    // the "Your Controls" bar while hosting, so it doesn't sit ON TOP of
    // the controls in the first place.) Wired once, guarded by
    // dataset.wired on this always-in-the-DOM element -- see bug #4 in
    // architecture-and-decisions.md ("Duplicate event-listener risk") and
    // this exact fix just applied again a moment ago to the verse
    // picker's own body listener; #toast never gets rebuilt/replaced, so
    // a wired guard here is what stops every showToast() call from
    // piling on one more duplicate click listener.
    if(!t.dataset.wired){
      t.dataset.wired = '1';
      t.addEventListener('click', function(){
        clearTimeout(showToast._h);
        t.classList.remove('show');
      });
    }
  }

  // App update banner [2026-09-10, v29, removed v31, restored v32] -- see
  // the startup block near the end of this file (where registerSW() is
  // called) for the full back-and-forth. Built as one-off direct DOM (not
  // part of the reactive render() HTML) since it has to survive across
  // renders/view changes untouched once shown, and is deliberately
  // persistent -- no auto-hide timer like showToast() -- since it needs
  // an actual click, not just a passing notice.
  let updateBannerShown = false;
  function showUpdateBanner(updateSW){
    if(updateBannerShown) return;
    updateBannerShown = true;
    const bar = document.createElement('div');
    bar.className = 'update-banner';
    bar.id = 'appUpdateBanner';
    bar.innerHTML =
      '<span>A new version of iWorship is ready.</span>' +
      '<button type="button" class="update-banner-btn update-banner-btn-primary" id="appUpdateNowBtn">UPDATE NOW</button>' +
      '<button type="button" class="update-banner-btn update-banner-btn-secondary" id="appUpdateLaterBtn">LATER</button>';
    document.body.appendChild(bar);
    document.getElementById('appUpdateNowBtn').addEventListener('click', function(){ updateSW(true); });
    document.getElementById('appUpdateLaterBtn').addEventListener('click', function(){
      bar.remove();
      // The new version is already downloaded and waiting regardless --
      // dismissing just means it takes over next time the app is closed
      // and reopened fresh, instead of right now. Allow the banner to
      // reappear if this same long-running tab somehow sees yet another
      // update after this one.
      updateBannerShown = false;
    });
  }

  // Offline banner [2026-09-24] -- Jared: "Offline resilience, I'd love
  // that," for spotty PH church wifi. IMPORTANT CONTEXT for whoever touches
  // this next: `firestore-data-layer.js` deliberately runs on
  // `memoryLocalCache()`, NOT a persistent IndexedDB cache -- see
  // architecture-and-decisions.md's "the iworship-ph account reset..."
  // section. A persistent cache was tried and rolled back after it caused a
  // real, repeatable production bug (a cold-IndexedDB race that stranded
  // real accounts on the profile-setup screen after "Clear site data").
  // That trade-off is a deliberate, hard-won decision -- this feature does
  // NOT reintroduce persistent caching. What it adds instead is purely
  // informational: `memoryLocalCache()` already gives the app "full
  // resilience to in-session connection drops" (the SDK's own listener
  // reconnect logic keeps working, and pending writes queue in memory and
  // flush once the connection returns) -- what was missing is that nothing
  // ever told the person any of that was happening, so a spotty-wifi drop
  // just looked like the app silently hanging. This banner is that missing
  // signal: `navigator.onLine`/the browser's online/offline events (see the
  // startup block below) drive it, no new Firestore-layer code at all.
  // Mirrors showUpdateBanner()'s own one-off-DOM-element pattern exactly
  // (survives across render() calls untouched) but with no buttons -- it's
  // just a status readout, dismissed automatically the moment connectivity
  // returns, never by the person.
  let offlineBannerShown = false;
  function showOfflineBanner(){
    if(offlineBannerShown) return;
    offlineBannerShown = true;
    const bar = document.createElement('div');
    bar.className = 'update-banner offline-banner';
    bar.id = 'appOfflineBanner';
    bar.innerHTML = '<span>You&rsquo;re offline &mdash; iWorship will keep working and catch up once your connection is back.</span>';
    document.body.appendChild(bar);
  }
  function hideOfflineBanner(){
    offlineBannerShown = false;
    const bar = document.getElementById('appOfflineBanner');
    if(bar) bar.remove();
  }

  // First-run tour [2026-09-24] -- Jared: "I'd love the first run tour as
  // well, not just for hosts, but also for new users." Two independent
  // tours: a GENERAL one for every new person (shown once, the first time
  // Home/landing renders) and a HOST one (shown once, the first time
  // someone actually reaches the Host Session screen). Deliberately built
  // as a simple full-screen step-through card, NOT a spotlight/coach-mark
  // anchored to specific on-screen elements -- an anchored tour needs live
  // layout measurement (getBoundingClientRect on real rendered elements) to
  // position correctly across every screen size, which isn't something
  // this environment can visually verify before shipping; a centered modal
  // carries none of that risk while still covering the same ground. Same
  // one-off-DOM-element pattern as showUpdateBanner()/showOfflineBanner()
  // above (appended straight to document.body, independent of render()'s
  // reactive HTML, so it survives across re-renders untouched), gated by a
  // per-device localStorage flag rather than a synced profile field --
  // seeing it once on THIS device is enough, and this avoids a new
  // Firestore field/rules for something this low-stakes.
  const TOUR_STEPS_GENERAL = [
    { icon:'book', title:'Welcome to iWorship', body:'Your church&rsquo;s home for hymns, live worship sessions, the Bible, and your community &mdash; all in one place. Here&rsquo;s a quick look around.' },
    { icon:'search', title:'Browse &amp; Search the Hymnal', body:'Search by title, or browse by topic from the hymnal list. Tap any hymn to read the full lyrics, or switch to Play Mode for chords.' },
    { icon:'heart', title:'Favorites &amp; Themes', body:'Tap the heart on any hymn to save it to your Favorites. Browse by Theme to find songs for a particular mood or occasion.' },
    { icon:'book', title:'Bible &amp; Devotionals', body:'The full King James Bible and a daily devotional are both one tap away from Home &mdash; step through any day, or jump straight to today.' },
    { icon:'users', title:'Join a Live Session', body:'When your church is hosting a live worship session, join with the room code (or scan the host&rsquo;s QR code) to follow along in real time.' }
  ];
  const TOUR_STEPS_HOST = [
    { icon:'monitor', title:'You&rsquo;re Hosting', body:'This screen drives what your congregation sees live. Pick a song, sermon, Bible verse, or media clip from the tabs above, then stage it before it goes out.' },
    { icon:'bolt', title:'Preview, Then Go Live', body:'Whatever you stage here only YOU see, in the PREVIEW column &mdash; tap GO LIVE (or double-tap Space/Enter) when you&rsquo;re ready for the congregation to see it too.' },
    { icon:'link', title:'Room Code &amp; QR', body:'Share your room code, or let people scan the QR code under SHOW ROOM CODE, to join instantly &mdash; no typing needed.' },
    { icon:'chat', title:'Chat &amp; Livestream Link', body:'The chat bubble opens a floating chat with your congregation. Paste your Facebook/YouTube Live link from STREAM LINK in the toolbar and it&rsquo;ll pin to the top of chat for everyone to find.' }
  ];
  function showTourOverlay(steps, storageKey){
    if(document.getElementById('appTourOverlay')) return; // one tour overlay on screen at a time
    if(safeGet(storageKey, null)) return; // already seen on this device
    safeSet(storageKey, '1');
    let idx = 0;
    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.id = 'appTourOverlay';
    function close(){ overlay.remove(); }
    function paint(){
      const s = steps[idx];
      const isLast = idx === steps.length - 1;
      overlay.innerHTML =
        '<div class="tour-card">' +
          '<button type="button" class="tour-close-btn" id="tourCloseBtn" aria-label="Skip this tour">&times;</button>' +
          '<svg class="tour-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+icon(s.icon)+'</svg>' +
          '<h3>'+s.title+'</h3>' +
          '<p>'+s.body+'</p>' +
          '<div class="tour-dots">' + steps.map(function(_, i){ return '<span class="tour-dot'+(i===idx?' active':'')+'"></span>'; }).join('') + '</div>' +
          '<div class="tour-actions">' +
            (idx>0 ? '<button type="button" class="btn btn-ghost" id="tourBackBtn">BACK</button>' : '<button type="button" class="btn btn-ghost" id="tourSkipBtn">SKIP</button>') +
            '<button type="button" class="btn btn-primary" id="tourNextBtn">'+(isLast?'GOT IT':'NEXT')+'</button>' +
          '</div>' +
        '</div>';
      document.getElementById('tourCloseBtn').addEventListener('click', close);
      const backBtn = document.getElementById('tourBackBtn');
      if(backBtn) backBtn.addEventListener('click', function(){ idx = Math.max(0, idx-1); paint(); });
      const skipBtn = document.getElementById('tourSkipBtn');
      if(skipBtn) skipBtn.addEventListener('click', close);
      document.getElementById('tourNextBtn').addEventListener('click', function(){
        if(isLast){ close(); return; }
        idx++; paint();
      });
    }
    document.body.appendChild(overlay);
    paint();
  }
  function maybeShowWelcomeTour(){ showTourOverlay(TOUR_STEPS_GENERAL, 'cv:sawWelcomeTour'); }
  function maybeShowHostTour(){ showTourOverlay(TOUR_STEPS_HOST, 'cv:sawHostTour'); }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

  // Startup routing: deep links + session-resume [2026-09-04, moved here
  // from near the top of the file] -- deliberately the LAST thing that
  // runs before the initial render() call below, not the first. Each of
  // watchActiveRoom()/watchSermon()'s underlying watch functions can fire
  // their very first callback SYNCHRONOUSLY, before even returning (see
  // local-data-layer.js/firestore-data-layer.js's watchRoom/watchSermon --
  // demo mode always does this; a Firestore listener can too, serving from
  // local cache), and that callback calls render(). If any of this ran
  // near the TOP of the file instead, that synchronous render() could
  // execute before a `let` declared further down (closure state for
  // whichever view it's routing into) had been initialized -- a temporal-
  // dead-zone crash on the very first page load. That exact bug hit TWO
  // views independently before this got moved (stagePresentationMode for
  // ?stage=, presenterSplitView for the plain host-resume-on-refresh
  // case -- the second one is a genuine "reopen the tab while hosting"
  // crash that had nothing to do with today's chart feature; testing the
  // new COPY MUSICIAN CHART LINK button on a resumed host screen is what
  // surfaced it). Rather than keep discovering and relocating one more
  // `let` every time a new view gets added, this whole block now runs
  // last -- after every closure variable in the file has already been
  // declared -- so a synchronous first render(), whatever view it's for,
  // always finds everything it needs.
  const stageCode = new URLSearchParams(window.location.search).get('stage');
  // Musician chart ("?chart=<code>") deep link [2026-09-04] -- Jared: "what
  // if when the presenter is sharing, the musicians that join can see the
  // chords as well instead of just the lyrics." Unlike ?stage= (host-only,
  // never shared publicly), this link IS meant to be handed to other
  // people -- band members on their own devices -- so it copies the
  // ?sermon= link's shape: a plain URL param the host copies from a button
  // (see renderSessionHost()'s "COPY MUSICIAN CHART LINK"), read-only, and
  // never persisted to sessionStorage. It shares ?stage='s "read-only,
  // watch the room live" mechanics, but renders renderSessionChart()
  // instead: the FULL song with chords (not just whichever single section
  // is currently showing), so a musician can see what's coming, with the
  // section the host is actually on highlighted. Access is gated by
  // whoever opens the link having their OWN account's Play Mode access
  // (canUsePlayMode()) -- the same paid-role check that already gates
  // chords everywhere else in the app -- not by anything room-specific,
  // since chord data was already public-readable in the song doc before
  // this feature existed; this only decides who the UI shows it to.
  const chartCode = new URLSearchParams(window.location.search).get('chart');
  // Shared-sermon ("?sermon=<id>") deep link [2026-09-04] -- Jared's "add
  // an option to share the link as well" ask. Unlike ?stage= above, this
  // link IS meant to be sent to someone else (see the "COPY LINK" button
  // in renderSermonSharePanel()) -- opening it shows a small read-only
  // preview and, once signed in, a one-tap way to add the sermon to their
  // own list (renderSharedSermonLink() above), rather than immediately
  // presenting anything. Takes priority over the plain session-resume
  // just below (same "the URL you actually opened wins" reasoning as
  // ?stage=) but stageCode still wins over both if somehow both are ever
  // present.
  const sermonLinkId = new URLSearchParams(window.location.search).get('sermon');
  // Session-live push deep link ("?join=<code>") [2026-09-17] -- the OS
  // notification behind a session_live push (see functions/index.js's
  // onNewSessionNotify and src/sw.js's notificationclick handler) opens
  // this instead of a bare "/" so tapping it lands straight on joining that
  // session, not just the app's front door. Goes through
  // goToJoinScreenWithCode() -- the same password-checked path a public-
  // room-list row's JOIN button already uses -- rather than assuming the
  // room is still public/still exists by the time this loads.
  const joinCode = new URLSearchParams(window.location.search).get('join');
  // Devotional-post push deep link ("?devotional=1") [2026-09-24] -- see
  // dailyDevotionalNotify in functions/index.js and src/sw.js's
  // notificationclick handler. Unlike ?dm=/?profile= just below, the
  // Devotionals section works fine signed out (see renderDevotionals()),
  // so this can navigate immediately here rather than waiting for
  // watchAuth() the way those two have to.
  const devotionalDeepLink = new URLSearchParams(window.location.search).get('devotional');
  // Like/comment/repost/follow/message push deep links ("?profile=<uid>" /
  // "?dm=<uid>") [2026-09-24, Jared: "notifs are finally working!...but
  // when I click/tap them, they don't open what the notif is about"] --
  // mirrors renderNotifDropdown()'s own in-app row-click branching (near
  // the top of this file) so tapping the OS notification lands on the same
  // place tapping the in-app notification row already does. Unlike every
  // other deep link on this page, these two need a signed-in user (to open
  // a DM thread or load directory data for a profile view), which
  // state.user still isn't yet at this exact point in a fresh page load --
  // stashed here and actually acted on from watchAuth()'s first-user-
  // available callback instead (see notifDeepLinkHandled's own comment).
  const dmDeepLinkUid = new URLSearchParams(window.location.search).get('dm');
  const profileDeepLinkUid = new URLSearchParams(window.location.search).get('profile');
  if(dmDeepLinkUid) state.pendingDmUid = dmDeepLinkUid;
  else if(profileDeepLinkUid) state.pendingProfileUid = profileDeepLinkUid;
  if(stageCode){
    state.activeRoomCode = stageCode.toUpperCase();
    state.isHost = false;
    state.view = 'session-projector';
    watchActiveRoom(state.activeRoomCode);
  } else if(chartCode){
    state.activeRoomCode = chartCode.toUpperCase();
    state.isHost = false;
    state.view = 'session-chart';
    watchActiveRoom(state.activeRoomCode);
  } else if(sermonLinkId){
    state.sharedSermonLinkId = sermonLinkId;
    state.view = 'shared-sermon-link';
    watchSermon(sermonLinkId, function(sermon){
      state.sharedSermonLinkData = sermon;
      if(state.view === 'shared-sermon-link') render();
    });
  } else if(joinCode){
    goToJoinScreenWithCode(joinCode.trim().toUpperCase());
  } else if(devotionalDeepLink){
    state.view = 'devotionals';
  } else if(state.activeRoomCode){
    // Resume straight into a session on load if this device was mid-session
    // (e.g. a page refresh, or the person re-opened the tab).
    state.view = (state.isHost || state.isCoHost) ? 'session-host' : 'session-view';
    watchActiveRoom(state.activeRoomCode);
    watchChat(state.activeRoomCode, 'everyone');
  } else if(!dmDeepLinkUid && !profileDeepLinkUid){
    // Reload-resume, last resort [2026-09-24, Jared: "when I refresh a
    // page somewhere, it goes back to the landing page, I need it to go
    // to where it left off"] -- only reached once every more-specific
    // route above (a real deep link, or resuming a live hosted session)
    // has had first say. cv:lastView is written on every render() (see
    // persistLastViewForResume(), up by render() itself) for the
    // whitelisted, stable views in RESUMABLE_VIEWS (up by HOST_VIEWS) --
    // see that const's own comment for why a mid-edit form isn't one of
    // them, and for the three-bucket split this dispatches into: a
    // no-dependency view (bible/devotionals/plans/list/settings/host-hub)
    // is restored right here, immediately; 'detail' needs state.library
    // loaded first, so it's handed to watchSongs() instead (just below);
    // and everything else needs a signed-in state.user, so it's handed to
    // watchAuth() instead (further up), the exact same timing gap
    // ?dm=/?profile= just above already have to deal with.
    const lastView = safeSessionGetJSON('cv:lastView', null);
    if(lastView && lastView.view && Object.prototype.hasOwnProperty.call(RESUMABLE_VIEWS, lastView.view)){
      if(RESUME_NO_DEPENDENCY.includes(lastView.view)){
        state.view = lastView.view;
      } else {
        state.pendingResumeView = lastView;
      }
    }
  }

  // PWA update prompt [2026-09-10, v29, removed v31, restored v32] -- the
  // full back-and-forth, kept here so the next person doesn't re-litigate
  // it: v29 built a persistent banner (UPDATE NOW/LATER) because Jared
  // asked for a "deployment detector" that "asks for their permission to
  // restart the app and update." After hitting repeated deploy/cache
  // confusion while testing v29/v30 (which turned out to be a stale
  // Netlify deploy, not this mechanism at all), his ask flipped to "build
  // somethng that doesnt need a refresh bro. Just updates on its own" --
  // v31 made it fully silent (onNeedRefresh called updateSW(true)
  // immediately, no prompt). Once that shipped, the ask flipped back:
  // "make sure the prompt comes about updating" -- so v32 restores the
  // v29 banner behavior exactly. onNeedRefresh only ever fires once a new
  // version has FULLY finished downloading in the background -- clicking
  // UPDATE NOW (updateSW(true)) tells the waiting worker to take over and
  // reloads the page; dismissing (LATER) loses nothing, the update just
  // takes over naturally the next time the app is closed and reopened
  // fresh. registerType stays 'prompt' in vite.config.js (a new service
  // worker installs and WAITS rather than taking over on its own).
  if('serviceWorker' in navigator){
    import('virtual:pwa-register').then(function(mod){
      const updateSW = mod.registerSW({
        onNeedRefresh: function(){ showUpdateBanner(updateSW); },
        onRegisterError: function(err){ console.error('Service worker registration failed', err); }
      });
    }).catch(function(err){ console.error('PWA update check unavailable', err); });
  }

  // Offline banner wiring [2026-09-24] -- see showOfflineBanner()'s own
  // comment above for the full design/trade-off context. A plain, always-on
  // listener pair (not per-view, not torn down) since connectivity can
  // drop or return on any screen at any time.
  window.addEventListener('online', hideOfflineBanner);
  window.addEventListener('offline', showOfflineBanner);
  if(typeof navigator !== 'undefined' && navigator.onLine === false) showOfflineBanner();

  render();

  // Cache preloader [2026-09-15] -- Jared: "the app is very slow on my
  // phone. it takes a while for everything to pull up. I think you need to
  // set up a cache preloader so everything doesn't hve to load from
  // scatch." The Bible's KJV text (src/content/kjv.json, ~4.3MB) is the
  // single biggest thing in the whole app, and it's deliberately its own
  // lazy chunk (see loadKjvData(), vite.config.js's globIgnores, and
  // sw.js's own comment) so opening the app the other 90% of the time --
  // songs, sessions, sermons -- never has to pay for it. That's still the
  // right call, but it means the FIRST time someone actually taps Bible in
  // a given session (or the first time ever, before the service worker has
  // it cached), they sit and wait for a 4.3MB download before anything
  // shows. Warming it in the background, once, while the browser is
  // otherwise idle right after startup, means it's usually already sitting
  // in the service worker's cache (loadKjvData()'s own import(), a normal
  // dynamic import of an asset the SW precaching rule matches) by the time
  // anyone actually opens Bible -- "preloaded" in the literal sense Jared
  // asked for, not just a figure of speech.
  //
  // Deliberately conservative about when to do this: requestIdleCallback
  // (falling back to a plain timeout on Safari, which has never implemented
  // it) means it only runs once the main thread is truly free, never
  // competing with the startup work above for CPU or bandwidth; and
  // navigator.connection.saveData / a 2G-class effectiveType (present on
  // Chrome/Android, not Safari) skips it entirely on a connection where
  // silently pulling 4.3MB in the background would be a worse tradeoff than
  // just paying that cost on demand.
  (function preloadKjvWhenIdle(){
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(conn && (conn.saveData || /^(slow-2g|2g)$/.test(conn.effectiveType || ''))) return;
    const schedule = window.requestIdleCallback || function(fn){ return setTimeout(fn, 2500); };
    schedule(function(){ loadKjvData(); }, { timeout: 8000 });
  })();
