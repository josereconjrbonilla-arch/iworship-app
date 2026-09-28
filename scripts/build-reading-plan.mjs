// One-time content-build script: generates src/content/reading-plan.json, a
// 365-day "read straight through the Bible" schedule. No network access
// needed (unlike build-devotionals.mjs/build-tagalog-bible.mjs) -- this just
// reshapes data already bundled in src/content/kjv.json (Genesis 1 through
// Revelation 22, 1189 chapters total across the 66 canonical books) into
// evenly-paced daily reading chunks.
//
// Deliberately LANGUAGE-AGNOSTIC: each day is a list of {book, chapter}
// refs (book = the same 66 English key names kjv.json and
// tagalog-bible.json both use -- see tagalog-bible.json's own header
// comment on byte-for-byte chapter parity between the two). The app reads
// whichever translation's data the reader currently has selected
// (activeBibleData() in app.js) using these same refs, so this ONE
// generated plan works for both KJV and Tagalog with no separate content --
// exactly what "Available in either KJV or Tagalog" needs.
//
// Pacing: 1189 chapters / 365 days doesn't divide evenly (365*3 = 1095,
// leaving 94 days that need a 4th chapter). Rather than front-load all 94
// "long" days at the start of the year, this spreads them evenly across
// all 365 days using the standard "distribute N items into K bins as
// evenly as possible" formula (day i gets floor((i+1)*N/K) -
// floor(i*N/K) items) -- the same idea as a Bresenham line, just applied
// to a calendar instead of a raster line.
//
// Safe to re-run any time kjv.json changes (it won't -- the KJV text is
// fixed public-domain content) -- deterministic output, no caching needed.
//
// Run with:  node scripts/build-reading-plan.mjs

import { writeFileSync } from 'fs';
import kjv from '../src/content/kjv.json' with { type: 'json' };

const TOTAL_DAYS = 365;

// Flatten every (book, chapter) in canonical order.
const allRefs = [];
for (const book of kjv.books) {
  const chapterNumbers = Object.keys(kjv.text[book])
    .map(Number)
    .sort((a, b) => a - b);
  for (const chapter of chapterNumbers) {
    allRefs.push({ book, chapter });
  }
}

const total = allRefs.length;
const plan = [];
let cursor = 0;
for (let day = 0; day < TOTAL_DAYS; day++) {
  const endCount = Math.floor(((day + 1) * total) / TOTAL_DAYS);
  const dayRefs = allRefs.slice(cursor, endCount);
  cursor = endCount;
  plan.push(dayRefs);
}

if (cursor !== total) {
  throw new Error(`Allocation mismatch: used ${cursor} of ${total} chapters`);
}

writeFileSync(
  new URL('../src/content/reading-plan.json', import.meta.url),
  JSON.stringify({ days: plan }),
);

console.log(`Wrote ${TOTAL_DAYS}-day reading plan covering all ${total} chapters.`);
console.log('Day 1:', JSON.stringify(plan[0]));
console.log('Day 365:', JSON.stringify(plan[364]));
const counts = plan.map((d) => d.length);
console.log('Chapters/day range:', Math.min(...counts), '-', Math.max(...counts));
