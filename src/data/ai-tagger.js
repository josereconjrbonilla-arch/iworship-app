// Client side of AI theme tagging. Talks only to the small Cloudflare Worker
// described in ai-config.js -- never to the AI provider directly -- and
// treats its response as untrusted input: every theme key that comes back
// is checked against the app's own THEMES list before use, so a bad or
// stale response from the Worker can never inject something the theme
// picker/filter chips don't understand.
import { THEMES } from '../content/themes.js';
import { AI_TAG_ENDPOINT, AI_TAG_SHARED_SECRET, aiTaggingConfigured } from '../ai-config.js';

export { aiTaggingConfigured };

const VALID_THEME_KEYS = THEMES.map((t) => t.key);
const REQUEST_TIMEOUT_MS = 20000;

// Plain-text lyrics for the AI to read -- strips [Chord] markers and section
// labels, since neither helps it judge theme and both cost tokens.
function lyricsFromSections(sections) {
  return (sections || [])
    .map((sec) => (sec.lines || []).join('\n'))
    .join('\n\n')
    .replace(/\[[^\]]*\]/g, '');
}

// Returns a Promise<string[]> of 1-3 theme keys (already validated against
// THEMES), or throws with a message safe to show in a toast. Callers decide
// what to do with the result -- pre-check chips in a picker, or save
// straight to a song doc for the bulk "AI-Tag Untagged Songs" flow.
export async function suggestThemes(title, sections) {
  if (!aiTaggingConfigured) {
    throw new Error('AI tagging isn’t set up yet — see README.md → "Setting up AI theme tagging".');
  }
  const lyrics = lyricsFromSections(sections);
  if (!lyrics.trim()) {
    throw new Error('Add some lyrics first — there’s nothing for the AI to read yet.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(AI_TAG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-iworship-secret': AI_TAG_SHARED_SECRET
      },
      body: JSON.stringify({
        title: title || '',
        lyrics: lyrics.slice(0, 6000), // plenty for a hymn; keeps the request small
        themeOptions: THEMES // {key, label} pairs, so the Worker's prompt can list them by label
      }),
      signal: controller.signal
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('AI tagging timed out — try again in a moment.');
    throw new Error('Couldn’t reach the AI tagging service — check your connection.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('AI tagging service rejected the request — check AI_TAG_SHARED_SECRET matches the Worker.');
    }
    throw new Error('AI tagging service returned an error (HTTP ' + res.status + ').');
  }

  let data;
  try { data = await res.json(); }
  catch (e) { throw new Error('AI tagging service returned an unexpected response.'); }

  const themes = Array.isArray(data.themes) ? data.themes : [];
  const valid = themes.filter((t) => VALID_THEME_KEYS.includes(t));
  if (!valid.length) throw new Error('The AI couldn’t confidently match a theme for this song.');
  return valid.slice(0, 3);
}
