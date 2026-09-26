// One-time transform: OSIS XML (Ang Dating Biblia, 1905, public domain) ->
// src/content/tagalog-bible.json, in the exact same {books, text} shape as
// src/content/kjv.json, keyed by the SAME English book names/order as KJV
// (so existing Bible-navigation code that keys off book name / chapter /
// verse number works unmodified for either translation) plus a
// `bookNamesTagalog` map for displaying localized book names in the UI.
//
// Source: https://github.com/seven1m/open-bibles  tgl-tagalog.osis.xml
// Rights (from the file's own OSIS header): "This Bible is now Public Domain."
// Philippines Bible Society, 1905. See claude/architecture-and-decisions.md
// for the full licensing writeup.
//
// Usage: node scripts/build-tagalog-bible.mjs /path/to/tgl-tagalog.osis.xml

import fs from 'fs';

const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Usage: node scripts/build-tagalog-bible.mjs <path-to-osis-xml>');
  process.exit(1);
}
const xml = fs.readFileSync(srcPath, 'utf8');

// Same 66-book canonical order/names as src/content/kjv.json's `books` array,
// paired with the OSIS book IDs this file uses, and a Tagalog display name.
const BOOKS = [
  ['Genesis', 'Gen', 'Genesis'],
  ['Exodus', 'Exod', 'Exodo'],
  ['Leviticus', 'Lev', 'Levitico'],
  ['Numbers', 'Num', 'Mga Bilang'],
  ['Deuteronomy', 'Deut', 'Deuteronomio'],
  ['Joshua', 'Josh', 'Josue'],
  ['Judges', 'Judg', 'Mga Hukom'],
  ['Ruth', 'Ruth', 'Ruth'],
  ['1 Samuel', '1Sam', '1 Samuel'],
  ['2 Samuel', '2Sam', '2 Samuel'],
  ['1 Kings', '1Kgs', '1 Mga Hari'],
  ['2 Kings', '2Kgs', '2 Mga Hari'],
  ['1 Chronicles', '1Chr', '1 Mga Cronica'],
  ['2 Chronicles', '2Chr', '2 Mga Cronica'],
  ['Ezra', 'Ezra', 'Ezra'],
  ['Nehemiah', 'Neh', 'Nehemias'],
  ['Esther', 'Esth', 'Esther'],
  ['Job', 'Job', 'Job'],
  ['Psalms', 'Ps', 'Mga Awit'],
  ['Proverbs', 'Prov', 'Mga Kawikaan'],
  ['Ecclesiastes', 'Eccl', 'Mangangaral'],
  ["Solomon's Song", 'Song', 'Awit ni Solomon'],
  ['Isaiah', 'Isa', 'Isaias'],
  ['Jeremiah', 'Jer', 'Jeremias'],
  ['Lamentations', 'Lam', 'Mga Panaghoy'],
  ['Ezekiel', 'Ezek', 'Ezekiel'],
  ['Daniel', 'Dan', 'Daniel'],
  ['Hosea', 'Hos', 'Oseas'],
  ['Joel', 'Joel', 'Joel'],
  ['Amos', 'Amos', 'Amos'],
  ['Obadiah', 'Obad', 'Abdias'],
  ['Jonah', 'Jonah', 'Jonas'],
  ['Micah', 'Mic', 'Mikas'],
  ['Nahum', 'Nah', 'Nahum'],
  ['Habakkuk', 'Hab', 'Habacuc'],
  ['Zephaniah', 'Zeph', 'Sofonias'],
  ['Haggai', 'Hag', 'Hagai'],
  ['Zechariah', 'Zech', 'Zacarias'],
  ['Malachi', 'Mal', 'Malaquias'],
  ['Matthew', 'Matt', 'Mateo'],
  ['Mark', 'Mark', 'Marcos'],
  ['Luke', 'Luke', 'Lucas'],
  ['John', 'John', 'Juan'],
  ['Acts', 'Acts', 'Mga Gawa'],
  ['Romans', 'Rom', 'Mga Taga-Roma'],
  ['1 Corinthians', '1Cor', '1 Mga Taga-Corinto'],
  ['2 Corinthians', '2Cor', '2 Mga Taga-Corinto'],
  ['Galatians', 'Gal', 'Mga Taga-Galacia'],
  ['Ephesians', 'Eph', 'Mga Taga-Efeso'],
  ['Philippians', 'Phil', 'Mga Taga-Filipos'],
  ['Colossians', 'Col', 'Mga Taga-Colosas'],
  ['1 Thessalonians', '1Thess', '1 Mga Taga-Tesalonica'],
  ['2 Thessalonians', '2Thess', '2 Mga Taga-Tesalonica'],
  ['1 Timothy', '1Tim', '1 Kay Timoteo'],
  ['2 Timothy', '2Tim', '2 Kay Timoteo'],
  ['Titus', 'Titus', 'Kay Tito'],
  ['Philemon', 'Phlm', 'Kay Filemon'],
  ['Hebrews', 'Heb', 'Mga Hebreo'],
  ['James', 'Jas', 'Santiago'],
  ['1 Peter', '1Pet', '1 Pedro'],
  ['2 Peter', '2Pet', '2 Pedro'],
  ['1 John', '1John', '1 Juan'],
  ['2 John', '2John', '2 Juan'],
  ['3 John', '3John', '3 Juan'],
  ['Jude', 'Jude', 'Judas'],
  ['Revelation', 'Rev', 'Apocalipsis'],
];

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull every <verse osisID='Book.Chap.Verse'>text</verse> (verses never
// nest other elements in this file, confirmed by spot-checking the source).
const verseRe = /<verse osisID='([^'.]+)\.(\d+)\.(\d+)'>([\s\S]*?)<\/verse>/g;
const text = {};
const bookNamesTagalog = {};
const byOsisId = new Map(BOOKS.map(([en, osis, tl]) => [osis, [en, tl]]));

let m;
let count = 0;
const missingBooks = new Set();
while ((m = verseRe.exec(xml))) {
  const [, osisId, chap, verse, raw] = m;
  const pair = byOsisId.get(osisId);
  if (!pair) { missingBooks.add(osisId); continue; }
  const [enName, tlName] = pair;
  if (!text[enName]) text[enName] = {};
  if (!text[enName][chap]) text[enName][chap] = {};
  text[enName][chap][verse] = decodeEntities(raw);
  bookNamesTagalog[enName] = tlName;
  count++;
}

if (missingBooks.size) {
  console.warn('WARNING: unmapped OSIS book ids found (skipped):', [...missingBooks]);
}

const books = BOOKS.map(([en]) => en);
const missingFromText = books.filter((b) => !text[b]);
if (missingFromText.length) {
  console.warn('WARNING: books with zero verses parsed:', missingFromText);
}

const out = {
  books, // identical order/names to kjv.json's `books`, for shared navigation code
  bookNamesTagalog, // English name -> Tagalog display name, for the language switcher's UI
  text,
  meta: {
    title: 'Ang Dating Biblia (1905)',
    language: 'tl',
    rights: 'Public Domain',
    source: 'Philippines Bible Society, 1905; digitized text via https://github.com/seven1m/open-bibles (tgl-tagalog.osis.xml)',
  },
};

fs.writeFileSync('src/content/tagalog-bible.json', JSON.stringify(out));
console.log(`Parsed ${count} verses across ${Object.keys(text).length} books.`);
console.log('Wrote src/content/tagalog-bible.json');
