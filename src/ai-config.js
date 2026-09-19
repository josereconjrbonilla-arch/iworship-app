// ---------------------------------------------------------------------------
// AI-powered theme tagging (optional) — lets the app suggest topical themes
// (Salvation, Heaven, Grace, etc.) for a song by reading its lyrics with a
// real AI model, both for songs as they're added and, via the "AI-Tag
// Untagged Songs" button on the hymnal list, for songs already in the
// library that don't have themes yet.
//
// This calls a small server-side function you host yourself (a Cloudflare
// Worker), never the AI provider directly from the browser — that keeps
// your API key out of the public JS bundle. See README.md →
// "Setting up AI theme tagging" for exact click-by-click setup steps
// (Cloudflare account, the Worker code to paste in, your Anthropic API key,
// and the two values below).
//
// Until AI_TAG_ENDPOINT is filled in, aiTaggingConfigured is false and every
// "Suggest with AI" / "AI-Tag Untagged Songs" control in the app hides
// itself automatically — nothing breaks, themes just stay fully manual
// (exactly how the app worked before this file existed).
// ---------------------------------------------------------------------------
export const AI_TAG_ENDPOINT = 'REPLACE_ME'; // e.g. 'https://iworship-ai-tagger.your-name.workers.dev'
export const AI_TAG_SHARED_SECRET = 'REPLACE_ME'; // must match the Worker's SHARED_SECRET env var

export const aiTaggingConfigured =
  typeof AI_TAG_ENDPOINT === 'string' && !AI_TAG_ENDPOINT.includes('REPLACE_ME') &&
  typeof AI_TAG_SHARED_SECRET === 'string' && !AI_TAG_SHARED_SECRET.includes('REPLACE_ME');
