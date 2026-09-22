// Push notifications (real, FCM) [2026-09-10, VAPID key filled in
// 2026-09-18, REPLACED 2026-09-22 for the iworship-ph rebuild, REGENERATED
// 2026-09-23] -- same REPLACE_ME-until-configured pattern as
// firebase-config.js/ai-config.js. A VAPID key is project-specific -- the
// old key was generated against the original (nam5, US) project and does
// not work against iworship-ph, so this had to be regenerated via that NEW
// project's Firebase console -> Settings -> Cloud Messaging -> Web Push
// certificates -> Generate key pair. Every push-related control in the app
// (the proactive enable-notifications banner, the Settings toggle, the
// per-type preference toggles) checks pushNotificationsConfigured and
// silently doesn't render until this is filled in.
//
// [Bug found 2026-09-23] The 2026-09-22 key above LOOKED right (matched
// what firebase-config.js/the console showed, and every other client-side
// setting -- App ID, API key + restrictions, the three required APIs --
// checked out too) but every getToken() call against it failed at Google's
// API gateway with a 401 UNAUTHENTICATED "missing required authentication
// credential", even with a valid API key AND a valid Firebase Installations
// auth token both attached to the request. That pointed at the key pair's
// own server-side registration being in a bad state rather than anything
// on the client -- regenerating it fresh (Cloud Messaging tab -> Web Push
// certificates -> the (i) menu -> Regenerate key pair) is the fix.
export const VAPID_KEY = 'BMXgaK2QLkCSzzNH0gI1s5vAvJuFVBQjCtUBg5E1F1RbXIiLuOiFukaLrvUaz-1KPy7KjBOvRGrSDzlL4-ld63Y';
export const pushNotificationsConfigured = VAPID_KEY !== 'REPLACE_ME_VAPID_KEY' && !!VAPID_KEY;
