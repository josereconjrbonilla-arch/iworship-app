// Push notifications (real, FCM) [2026-09-10, VAPID key filled in
// 2026-09-18] -- same REPLACE_ME-until-configured pattern as
// firebase-config.js/ai-config.js, now completed. Jared generated this key
// pair via Firebase console -> Settings -> Cloud Messaging -> Web
// configuration -> Web Push certificates -> Generate key pair, and sent
// back the public key string below. Every push-related control in the app
// (the proactive enable-notifications banner, the Settings toggle, the
// per-type preference toggles) checks pushNotificationsConfigured and was
// silently not rendering until this was filled in -- this is the one
// change that turns all of that on for real.
export const VAPID_KEY = 'BD2gkZClO2ukfDFJ9TCRpE5yksSUkiuIfzpy4GguLrE-kypnDWPhBw0HnrwzaC1IF4nhVVKtF5Av5cLDs2zwDBU';
export const pushNotificationsConfigured = VAPID_KEY !== 'REPLACE_ME_VAPID_KEY' && !!VAPID_KEY;
