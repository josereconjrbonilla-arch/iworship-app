// iWorship AI theme-tagger — Cloudflare Worker
// -----------------------------------------------------------------------
// This is the small server-side piece that lets the app suggest topical
// themes (Salvation, Heaven, Grace, etc.) for a song by reading its lyrics
// with a real AI model, without ever putting your Anthropic API key in the
// public browser bundle.
//
// SETUP — see README.md → "Setting up AI theme tagging" for the full
// click-by-click version. Short version:
//   1. workers.cloudflare.com → sign up (free, no card) → Create Worker.
//   2. Open the Worker's "Quick Edit" and paste this entire file in,
//      replacing the default template. Click "Deploy".
//   3. Worker → Settings → Variables and Secrets → add two SECRET
//      variables (not plain text variables — pick "Encrypt"):
//        ANTHROPIC_API_KEY   -- from console.anthropic.com → API Keys
//        SHARED_SECRET       -- any random string you make up yourself
//                               (this just has to match what you paste
//                               into src/ai-config.js's
//                               AI_TAG_SHARED_SECRET — think of it as a
//                               password between your app and this Worker
//                               so random strangers can't call it and run
//                               up your API bill)
//   4. Copy the Worker's URL (shown at the top of its dashboard page,
//      looks like https://iworship-ai-tagger.YOUR-NAME.workers.dev) into
//      src/ai-config.js's AI_TAG_ENDPOINT, and SHARED_SECRET into
//      AI_TAG_SHARED_SECRET in that same file. Rebuild and redeploy the
//      app (same Netlify Drop steps as always).
//   5. Optional but recommended once your Netlify site's URL is settled:
//      change ALLOWED_ORIGIN below from '*' to your exact site URL (e.g.
//      'https://your-site-name.netlify.app') so only your app's pages can
//      call this Worker — re-paste and re-deploy after editing.
// -----------------------------------------------------------------------

const ALLOWED_ORIGIN = '*'; // tighten to your exact Netlify URL once it's settled

// If Anthropic ever retires this model, pick a current small/fast one from
// https://docs.claude.com/en/docs/about-claude/models and swap it in here.
const MODEL = 'claude-haiku-4-5';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-iworship-secret'
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // Simple shared-secret check -- not bulletproof (anyone who reads the
    // app's JS bundle can see the header value), but it deters casual
    // abuse/scraping of this endpoint, same "deter casual reading, not
    // bank-grade" tradeoff already used for room passwords in the app
    // itself. Real protection is that this Worker only ever spends *your*
    // API budget, which you can cap in the Anthropic console.
    const secret = request.headers.get('x-iworship-secret');
    if (!env.SHARED_SECRET || secret !== env.SHARED_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY is not set on this Worker' }, 500);
    }

    let body;
    try { body = await request.json(); }
    catch (e) { return json({ error: 'Invalid JSON body' }, 400); }

    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '';
    const lyrics = typeof body.lyrics === 'string' ? body.lyrics.slice(0, 6000) : '';
    const themeOptions = Array.isArray(body.themeOptions) ? body.themeOptions : [];
    if (!lyrics.trim() || !themeOptions.length) {
      return json({ error: 'Missing lyrics or themeOptions' }, 400);
    }
    const themeKeys = themeOptions.map((t) => t.key).filter(Boolean);
    const themeListText = themeOptions.map((t) => '- ' + t.key + ' (' + t.label + ')').join('\n');

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        tools: [{
          name: 'pick_themes',
          description: "Choose 1 to 3 topical theme keys that best fit this hymn's overall subject.",
          input_schema: {
            type: 'object',
            properties: {
              themes: {
                type: 'array',
                items: { type: 'string', enum: themeKeys },
                minItems: 1,
                maxItems: 3
              }
            },
            required: ['themes']
          }
        }],
        tool_choice: { type: 'tool', name: 'pick_themes' },
        messages: [{
          role: 'user',
          content:
            'Song title: ' + (title || '(untitled)') + '\n\n' +
            'Lyrics:\n' + lyrics + '\n\n' +
            'Available themes:\n' + themeListText + '\n\n' +
            'Pick the 1-3 themes that best fit this hymn overall. Prefer fewer, more confident picks over listing every loosely-related theme.'
        }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => '');
      return json({ error: 'Anthropic API error (' + anthropicRes.status + ')', detail: errText.slice(0, 500) }, 502);
    }

    const data = await anthropicRes.json();
    const toolUse = (data.content || []).find((block) => block.type === 'tool_use' && block.name === 'pick_themes');
    const themes = toolUse && Array.isArray(toolUse.input?.themes) ? toolUse.input.themes : [];
    const valid = themes.filter((t) => themeKeys.includes(t));

    return json({ themes: valid });
  }
};
