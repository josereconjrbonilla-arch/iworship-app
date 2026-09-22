export const firebaseConfig = {
  apiKey: 'AIzaSyBGcfKyjzmxbvYNpauGCBYRrO1_0W8GI1E',
  authDomain: 'iworship-ph.firebaseapp.com',
  projectId: 'iworship-ph',
  storageBucket: 'iworship-ph.firebasestorage.app',
  messagingSenderId: '631611273053',
  appId: '1:631611273053:web:0a0121576e61c59d8702b4'
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (v) => typeof v === 'string' && !v.includes('REPLACE_ME')
);
