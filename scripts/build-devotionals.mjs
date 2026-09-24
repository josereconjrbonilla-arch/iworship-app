// One-time content-build script: fetches Charles Spurgeon's "Morning and
// Evening" (1866; Spurgeon died 1892, so the underlying text is
// unambiguously public domain) from Christian Classics Ethereal Library
// (ccel.org), one page per reading, and bundles all 366 days into
// devotionals.json -- the same "ship public-domain text as a static JSON
// asset" pattern this repo already uses for the KJV Bible
// (src/content/kjv.json).
//
// RUN THIS FROM YOUR OWN MACHINE, NOT the cloud sandbox -- outbound web
// access to ccel.org is blocked there (org egress policy), only your own
// machine's normal internet works for this.
//
// STEP 1 -- sample run first (fetches just 3 pages, prints them, writes
// NOTHING to disk):
//   node scripts/build-devotionals.mjs --sample
// Paste that console output back to me -- I haven't been able to see a
// real CCEL page's actual HTML from in here (same network restriction),
// so parseDay() below is an untested best-effort guess at how to pull
// {title, ref, text} out of the page. I'll fix it up against your real
// sample before you run the full thing.
//
// STEP 2 -- once the sample looks right, the full run (fetches all
// 366 days x 2 readings = 732 pages, a few minutes with the polite delay
// below, and writes BOTH copies this app needs):
//   node scripts/build-devotionals.mjs --all
// Writes src/content/devotionals.json (the client's lazy-loaded copy) AND
// functions/devotionals.json (the Cloud Function's own copy -- deploying
// functions only ships what's inside functions/, so the client copy alone
// wouldn't be reachable from dailyDevotionalNotify). Both are identical
// content, just two destinations.
//
// Safe to re-run either mode any number of times -- every page it fetches
// is cached under .devotional-cache/ (gitignored -- see .gitignore), so a
// re-run after I tweak parseDay() reparses from the cached HTML instead of
// hitting ccel.org again for pages it already has. Delete that folder if
// you ever want a truly fresh fetch.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

const CACHE_DIR = '.devotional-cache';
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR);

// Feb 29 is included -- CCEL's own table of contents lists a page for it,
// and it's only ever used here as a lookup key (never real date math), so
// fetching/storing it is harmless even in a year that doesn't need it.
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function pad2(n) { return String(n).padStart(2, '0'); }

async function fetchDay(mm, dd, ampm) {
  const key = `${pad2(mm)}${pad2(dd)}${ampm}`;
  const cachePath = `${CACHE_DIR}/${key}.html`;
  if (existsSync(cachePath)) return readFileSync(cachePath, 'utf8');
  const url = `https://ccel.org/ccel/spurgeon/morneve.d${pad2(mm)}${pad2(dd)}${ampm}.html`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; iWorship-app one-time content build)' }
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const html = await res.text();
  writeFileSync(cachePath, html);
  return html;
}

// Strip HTML down to plain visible text. CCEL's pages are old/simple
// static markup, so this generic tag-stripping approach should hold up
// fine without pulling in a real HTML parser dependency -- parseDay()
// below works off the plain text this produces.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Verified against a real sample run (2026-09-24, September 24 AM/PM +
// January 1 AM/PM). CCEL's page chrome (site title, Theme/Font/Text Size/
// Bible Version/footnote controls, etc.) always ends with a nav line
// containing "Go To Evening Reading" (on an AM page) or "Go To Morning
// Reading" (on a PM page) -- everything real starts right after that.
// From there: the FIRST line is the quoted KJV verse itself (in curly
// quotes); the SECOND line is the scripture reference glued directly to
// Spurgeon's commentary with no separator in the plain-text extraction
// (e.g. "Ezra 8:22 A convoy on many accounts..." -- they're adjacent
// inline elements inside the same source paragraph), which a regex below
// splits apart. There's no separate "title" on the page itself, so title
// is just set to "Morning"/"Evening" -- matches devotionals.json's
// existing {title, ref, text} shape (see src/app.js) with no app-side
// changes needed.
//
// [Bug found 2026-09-24, from Jared's screenshot] The trailing site chrome
// below the actual reading -- the "« Prev Morning, September 24 Next »"
// nav bar, and CCEL's logged-out "Please login or register to save
// highlights and make annotations." annotation-tool prompt, plus two
// leftover widget-config words ("VIEWNAME is" / "workSection") from that
// same annotation tool's markup -- was leaking into `text` on some days.
// The original BOILERPLATE_STARTS list only trimmed a line that STARTS
// WITH one of those phrases, which missed the actual failure mode: on the
// page that leaked, that chrome had no line break of its own and was
// glued directly onto the end of Spurgeon's last commentary sentence
// (same "no separator between adjacent inline elements" quirk noted above
// for the reference line), so no line in the whole page ever started with
// "« prev" etc. -- it was sitting mid-line. trimTrailingJunk() below fixes
// this properly: it searches for these markers as a SUBSTRING anywhere in
// the full joined body text (not just at a line's start) and cuts
// everything from the first match onward, so a glued-on trailing marker
// is caught exactly the same as one on its own line.
const TRAILING_JUNK_PATTERNS = [
  /«\s*prev/i,
  /next\s*»/i,
  /please\s+login\s+or\s+register/i,
  /save\s+highlights\s+and\s+make\s+annotations/i,
  /\bviewname\s+is\b/i,
  /\bworksection\b/i,
  /table of contents/i,
  /copyright/i,
  /this document/i,
  /produced by/i,
  /about ccel/i,
  /ccel home/i,
  /valid html/i,
  /powered by/i
];
function trimTrailingJunk(str) {
  let cut = str.length;
  for (const re of TRAILING_JUNK_PATTERNS) {
    const m = str.match(re);
    if (m && m.index < cut) cut = m.index;
  }
  return str.slice(0, cut).trim();
}

function parseDay(pageText, ampm) {
  const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);

  const navMarker = ampm === 'am' ? 'go to evening reading' : 'go to morning reading';
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(navMarker)) { start = i + 1; break; }
  }

  // Trailing site chrome (footer nav/copyright, if any) below the actual
  // reading -- trimmed wherever one of these first appears as the START of
  // a line. This whole-line pass runs first and is still useful (it can
  // drop entire boilerplate lines before they even reach the join below);
  // trimTrailingJunk() afterwards is the real safety net for the "no line
  // break, glued onto the previous line" case described above.
  const BOILERPLATE_STARTS = [
    'table of contents', 'copyright', 'this document', 'produced by',
    'about ccel', 'ccel home', '« prev', 'next »', 'valid html', 'powered by',
    'go to evening reading', 'go to morning reading', 'please login'
  ];
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (BOILERPLATE_STARTS.some((b) => low.startsWith(b))) { end = i; break; }
  }
  const body = lines.slice(start, end);

  const verseLine = body[0] || '';
  const verseText = verseLine.replace(/^[“"]+/, '').replace(/[”"]+\s*$/, '').trim();

  // Reference pattern: an optional leading number (1-3, for "1 Kings"/"2
  // Corinthians"/etc.), 1-4 words (letters and apostrophes, for "Song of
  // Solomon"/"Solomon's Song"), then chapter:verse (optionally a verse
  // range, and tolerating a chapter-only single-number reference for a
  // one-chapter book like Jude).
  const rest = trimTrailingJunk(body.slice(1).join('\n').trim());
  const refMatch = rest.match(/^((?:[1-3]\s)?[A-Za-z']+(?:\s[A-Za-z']+){0,3}\s\d{1,3}(?::\d{1,3})?(?:-\d{1,3})?)\s(.+)$/s);
  const ref = refMatch ? refMatch[1].trim() : '';
  const commentary = refMatch ? trimTrailingJunk(refMatch[2].trim()) : rest;

  // The devotional's `text` is the quoted verse followed by Spurgeon's
  // commentary -- matches how the physical book presents each entry
  // (verse, then reflection), rather than just the commentary alone.
  const text = commentary ? (verseText + '\n\n' + commentary) : verseText;

  return { title: ampm === 'am' ? 'Morning' : 'Evening', ref, text, raw: lines.join('\n') };
}

async function main() {
  const mode = process.argv.includes('--all') ? 'all' : 'sample';
  const targets = [];
  if (mode === 'sample') {
    targets.push([1, 1, 'am'], [1, 1, 'pm'], [9, 24, 'am']);
  } else {
    for (let mm = 1; mm <= 12; mm++) {
      for (let dd = 1; dd <= MONTH_DAYS[mm - 1]; dd++) {
        targets.push([mm, dd, 'am'], [mm, dd, 'pm']);
      }
    }
  }

  const out = {};
  let i = 0;
  let failures = 0;
  for (const [mm, dd, ampm] of targets) {
    i++;
    const key = `${pad2(mm)}${pad2(dd)}`;
    try {
      const html = await fetchDay(mm, dd, ampm);
      const parsed = parseDay(htmlToText(html), ampm);
      if (mode === 'sample') {
        console.log(`\n===== ${key} ${ampm} =====`);
        console.log('--- parsed title ---'); console.log(parsed.title);
        console.log('--- parsed ref ---'); console.log(parsed.ref);
        console.log('--- parsed text (in full) ---'); console.log(parsed.text);
        console.log('===== end ' + key + ' ' + ampm + ' =====\n');
      } else {
        out[key] = out[key] || {};
        out[key][ampm] = { title: parsed.title, ref: parsed.ref, text: parsed.text };
        if (i % 50 === 0) console.log(`  ...${i}/${targets.length}`);
        await new Promise((r) => setTimeout(r, 250)); // polite delay -- one-time build, no reason to hammer ccel.org
      }
    } catch (e) {
      failures++;
      console.error(`FAILED ${key} ${ampm}:`, e.message);
    }
  }

  if (mode === 'all') {
    const json = JSON.stringify(out);
    writeFileSync('src/content/devotionals.json', json);
    writeFileSync('functions/devotionals.json', json);
    console.log(`\nWrote src/content/devotionals.json and functions/devotionals.json (${Object.keys(out).length} days, ${failures} failed fetches).`);
    if (failures) console.log('Some days failed to fetch -- re-run the same command; already-succeeded days are cached and won’t be re-fetched, only the missing ones will retry.');
  } else {
    console.log('\nSample run done -- paste the output above back to me so I can check the title/ref/text split looks right, then run --all.');
  }
}

main().catch((e) => { console.error('Build failed:', e); process.exit(1); });
