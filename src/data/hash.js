// Rooms store a SHA-256 hash of the password, never the password itself, using
// the browser's built-in Web Crypto API (no extra dependency). This is meant to
// keep a curious person from casually reading a private room's password out of
// the data store — not bank-grade security. See README.md → "Worship Sessions"
// for the honest threat model.
export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
