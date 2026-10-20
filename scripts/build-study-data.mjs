// Builds the Verse Study data (2026-10-20). Run once from the repo root:
//   node scripts/build-study-data.mjs
// Downloads public-domain / openly-licensed sources from GitHub and writes:
//   src/content/bsb.json            -- Berean Standard Bible (CC0 / public
//                                      domain since 2023-04-30), same
//                                      {books, text} shape and the same 66
//                                      English book keys as kjv.json
//   public/study/<USFM>/<ch>.json   -- one small file per chapter, fetched on
//                                      demand by the Bible reader's study panel:
//     { intro: [paragraphs],        Matthew Henry's chapter introduction
//       sections: [{from,to,title,paras}],  Matthew Henry's passage comments
//       geneva: { "<verse>": "note" },      Geneva Bible notes (1599)
//       xrefs:  { "<verse>": [[book,ch,v,toV]] } OpenBible.info cross refs
//                                      (CC-BY), top 10 by votes per verse,
//       words:  { "<verse>": [[original, translit, inContext, lemma, gloss]] }
//                                      key Greek/Hebrew words (verbs, nouns,
//                                      adjectives) from STEP Bible's TAGNT/
//                                      TAHOT (CC BY 4.0, www.STEPBible.org),
//       orig:   { "<verse>": [originalText, transliteration, langs] } the
//                                      whole verse in Greek / Hebrew / Aramaic
//                                      (STEP Bible; NA28 Greek, Leningrad Hebrew),
//       who:    { "<verse>": [entityId] } people & places named in the verse,
//       ents:   { entityId: {n, k:'p'|'l', b, lat, lon} } short bios from
//                                      Easton's Bible Dictionary (public
//                                      domain) via Theographic Bible Metadata
//                                      (CC BY-SA 4.0) }
// Sources (all fetched from raw.githubusercontent.com):
//   scrollmapper/bible_databases  formats/json/BSB.json,
//                                 sources/extras/cross_references.txt
//   samueldotj/bible-commentaries en/henry/<BOOK>/<ch>.json and
//                                 en/geneva/<BOOK>/<ch>.json (both taken from
//                                 CrossWire SWORD modules marked public domain)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const KJV = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/kjv.json'), 'utf8'));
const USFM = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];
const OSIS = ['Gen','Exod','Lev','Num','Deut','Josh','Judg','Ruth','1Sam','2Sam','1Kgs','2Kgs','1Chr','2Chr','Ezra','Neh','Esth','Job','Ps','Prov','Eccl','Song','Isa','Jer','Lam','Ezek','Dan','Hos','Joel','Amos','Obad','Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal','Matt','Mark','Luke','John','Acts','Rom','1Cor','2Cor','Gal','Eph','Phil','Col','1Thess','2Thess','1Tim','2Tim','Titus','Phlm','Heb','Jas','1Pet','2Pet','1John','2John','3John','Jude','Rev'];
const SM = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/';
const BC = 'https://raw.githubusercontent.com/samueldotj/bible-commentaries/main/';
const STEP = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/';
const STEP_FILES = ['TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt','TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt','TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt','TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt','TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt','TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt'];
const THEO = 'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/json/';
const CACHE = path.join(ROOT, '.study-cache');
fs.mkdirSync(CACHE, { recursive: true });

async function get(url, asJson){
  const key = path.join(CACHE, url.replace(/[^a-z0-9.]+/gi, '_'));
  if(fs.existsSync(key)){ const t = fs.readFileSync(key, 'utf8'); return asJson ? (t ? JSON.parse(t) : null) : t; }
  for(let attempt=0; attempt<4; attempt++){
    try{
      const r = await fetch(url);
      if(r.status === 404){ fs.writeFileSync(key, ''); return null; }
      if(!r.ok) throw new Error(r.status + ' ' + url);
      const t = await r.text();
      fs.writeFileSync(key, t);
      return asJson ? JSON.parse(t) : t;
    }catch(e){ if(attempt===3) throw e; await new Promise(function(r){ setTimeout(r, 1000*(attempt+1)); }); }
  }
}

function clean(s){ return String(s||'').replace(/\s+/g,' ').trim(); }

async function buildBsb(){
  const src = await get(SM + 'formats/json/BSB.json', true);
  if(src.books.length !== 66) throw new Error('BSB: expected 66 books');
  const out = { books: KJV.books.slice(), text: {} };
  let mismatches = 0;
  src.books.forEach(function(b, i){
    const name = KJV.books[i];
    out.text[name] = {};
    b.chapters.forEach(function(c){
      const ch = {};
      c.verses.forEach(function(v){ ch[String(v.verse)] = clean(v.text); });
      out.text[name][String(c.chapter)] = ch;
    });
    if(Object.keys(out.text[name]).length !== Object.keys(KJV.text[name]).length) mismatches++;
  });
  fs.writeFileSync(path.join(ROOT, 'src/content/bsb.json'), JSON.stringify(out));
  console.log('bsb.json written; books with a different chapter count from KJV:', mismatches);
}

// "JHN.3.1-21" -> {from:1,to:21}; "JHN.3.16" -> {from:16,to:16}; cross-chapter ranges clipped to this chapter
function rangeIn(range, ch){
  const m = range.match(/^[A-Z0-9]{3}\.(\d+)(?:\.(\d+))?(?:-(?:(\d+)\.)?(\d+))?$/);
  if(!m) return null;
  if(Number(m[1]) !== ch) return null;
  if(!m[2]) return null;
  const from = Number(m[2]);
  let to = m[4] ? Number(m[4]) : from;
  if(m[3] && Number(m[3]) !== ch) to = 999;
  return { from: from, to: to };
}

// Key original-language words per verse: "USFM.ch.v" -> [[orig,translit,ctx,lemma,gloss]]
// Aramaic words that appear in Greek letters in the New Testament
// (Talitha koum, Eloi Eloi lema sabachthani, Abba, Maranatha, Ephphatha...).
const NT_ARAMAIC = new Set(['G0005','G5008','G2891','G1682','G2241','G2982','G4518','G3134','G4469','G2188','G1042','G1115','G3126','G2786','G4552']);
async function buildWords(){
  // words: "USFM.ch.v" -> [[orig, translit, inContext, lemma, gloss, lang]]   lang: 'G' Greek, 'H' Hebrew, 'A' Aramaic
  // orig:  "USFM.ch.v" -> [fullOriginalText, fullTransliteration, langs]     langs: e.g. 'G', 'H', 'A', 'HA'
  const words = {}, full = {};
  for(const f of STEP_FILES){
    const txt = await get(STEP + encodeURIComponent(f), false);
    const greek = f.startsWith('TAGNT');
    txt.split('\n').forEach(function(line){
      const m = line.match(/^([1-3A-Z][A-Za-z0-9]{2})\.(\d+)\.(\d+)(?:\([^)]*\))?#\d+=([A-Za-z]+)\t/);
      if(!m) return;
      const v = Number(m[3]); if(!v) return; // verse 0 = psalm title
      const key = m[1].toUpperCase() + '.' + m[2] + '.' + v;
      const c = line.split('\t');
      const fv = (full[key] = full[key] || { n: [], k: [], langs: '' });
      let orig, tr, ctx, lemma, gloss, pos, lang, keep = true;
      if(greek){
        lang = 'G';
        const om = c[1].match(/^(\S+?)([,.;:·]?)\s*\(([^)]*)\)/); if(!om) return;
        // full verse: Nestle-Aland words (N), falling back to the KJV's Greek text (K) for verses NA omits
        const word = [om[1] + om[2], om[3]];
        if(/N/.test(m[4])) fv.n.push(word);
        if(/K/.test(m[4])) fv.k.push(word);
        if(!/[NK]/.test(m[4])) return;            // key words: only words in the major printed editions
        orig = om[1]; tr = om[3]; ctx = c[2].replace(/[,.;:]$/,'').trim();
        pos = (c[3].split('=')[1] || '');
        const strong = (c[3].split('=')[0] || '').replace(/[A-Za-z]$/,'');
        if(NT_ARAMAIC.has(strong)) lang = 'a';     // Aramaic word written in Greek letters
        else if(!/^(V|N|A)-/.test(pos)) keep = false;
        const dg = (c[4]||'').split('='); lemma = dg[0].split(',')[0].trim(); gloss = (dg[1]||'').trim();
      } else {
        const gram = c[5] || '';
        lang = gram.charAt(0) === 'A' ? 'A' : 'H';  // STEP marks Aramaic words with an "A" grammar prefix
        // full verse text: keep maqaf-joined words together, drop the morpheme slashes
        const w = c[1].replace(/[\/\\]/g, '');
        const t = c[2].replace(/[\/]/g, '').replace(/\./g, '').replace(/\\/g,'');
        fv.n.push([w, t.toLowerCase()]);
        const lex = (c[11]||'').match(/\{H[0-9A-Z]+=([^=}]+)=([^}]+)\}/);
        const braceIdx = (c[4]||'').split('/').findIndex(function(x){ return x.indexOf('{') >= 0; });
        const gp = (gram.slice(1).split('/')[braceIdx >= 0 ? braceIdx : 0] || '');
        if(!lex || !/^(V|Nc|A)/.test(gp)) keep = false;
        orig = c[1].replace(/[\/\\]/g,'').replace(/[׃־]/g,'').trim();
        tr = c[2].replace(/[./\\]/g,'').toLowerCase();
        ctx = c[3].replace(/\//g,'').replace(/\s+/g,' ').trim();
        if(lex){ lemma = lex[1]; gloss = lex[2].replace(/^:\s*/,'').split('»')[0].replace(/_/g,' ').trim(); }
      }
      if(fv.langs.indexOf(lang) < 0) fv.langs += lang;
      if(lang === 'a') lang = 'A';
      if(!keep) return;
      const list = (words[key] = words[key] || []);
      if(list.length >= 8 || list.some(function(w){ return w[3] === lemma; })) return;
      list.push([orig, tr, ctx, lemma, gloss, lang]);
    });
  }
  const orig = {};
  Object.keys(full).forEach(function(key){
    const fv = full[key];
    const list = fv.n.length ? fv.n : fv.k;
    if(!list.length) return;
    // Hebrew maqaf (־) joins a word to the next with no space
    function join(list){
      let text = '', tl = '';
      list.forEach(function(w, i){
        const joined = i > 0 && /־$/.test(list[i-1][0]);
        text += (i && !joined ? ' ' : '') + w[0];
        tl += (i && !joined ? ' ' : (joined ? '-' : '')) + w[1].replace(/-$/,'');
      });
      return [text.trim(), tl.replace(/\s+/g,' ').trim()];
    }
    const main = join(list);
    const langs = fv.langs.replace('a','') + (fv.langs.indexOf('a') >= 0 ? 'a' : '');
    const entry = [main[0], main[1], langs || 'G'];
    // Where the KJV's Greek (Textus Receptus) reads differently from the
    // Nestle-Aland text (e.g. 1 John 5:7), keep it too so both can be shown.
    if(fv.n.length && fv.k.length){
      const tr = join(fv.k);
      const strip = function(x){ return x.normalize('NFD').replace(/[̀-ͯ,.;:··’']/g,'').toLowerCase(); };
      if(strip(tr[0]) !== strip(main[0])) entry.push(tr[0], tr[1]);
    }
    if(!fv.n.length) entry.push('', '', 'tr-only'); // verse found only in the KJV's Greek (e.g. Acts 8:37)
    orig[key] = entry;
  });
  console.log('verses with key words:', Object.keys(words).length, '| verses with original text:', Object.keys(orig).length,
    '| Aramaic verses:', Object.keys(orig).filter(function(k){ return orig[k][2].indexOf('A') >= 0; }).length);
  return { words: words, orig: orig };
}

// People & places named in each verse, with short Easton's dictionary bios.
async function buildWho(){
  const [people, places, verses] = await Promise.all([get(THEO+'people.json', true), get(THEO+'places.json', true), get(THEO+'verses.json', true)]);
  const ents = {};
  function bio(t){
    t = String(Array.isArray(t) ? t.join(' ') : (t||'')).replace(/\uFFFD/g,' ').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim();
    if(t.length > 480){ const cut = t.slice(0,480); const dot = cut.lastIndexOf('. '); t = (dot > 200 ? cut.slice(0,dot+1) : cut) + ' \u2026'; }
    return t;
  }
  people.forEach(function(p){ const f = p.fields;
    ents[p.id] = { n: f.displayTitle || f.name, k: 'p', b: bio(f.dictionaryText) }; });
  places.forEach(function(p){ const f = p.fields;
    const lat = Number(f.latitude || f.openBibleLat), lon = Number(f.longitude || f.openBibleLong);
    ents[p.id] = { n: f.displayTitle || f.kjvName, k: 'l', b: bio(f.dictText), t: f.featureType || '', lat: isFinite(lat) && lat ? lat : null, lon: isFinite(lon) && lon ? lon : null }; });
  const osisIndex = {}; OSIS.forEach(function(o,i){ osisIndex[o]=i; });
  const who = {};
  verses.forEach(function(v){ const f = v.fields; if(!f.osisRef) return;
    const r = f.osisRef.split('.'); const bi = osisIndex[r[0]]; if(bi === undefined) return;
    const ids = (f.people||[]).concat(f.places||[]).filter(function(id){ return ents[id]; });
    if(ids.length) who[USFM[bi]+'.'+r[1]+'.'+r[2]] = ids.slice(0,12); });
  console.log('verses with people/places:', Object.keys(who).length);
  return { who: who, ents: ents };
}

async function buildChapters(){
  const W = await buildWords(); const WORDS = W.words, ORIG = W.orig;
  const WHO = await buildWho();
  // cross references, grouped by OSIS book index
  const xr = await get(SM + 'sources/extras/cross_references.txt', false);
  const osisIndex = {}; OSIS.forEach(function(o,i){ osisIndex[o]=i; });
  const xrefs = {}; // "bi.ch.v" -> [[votes,bi,ch,v,toV]]
  xr.split('\n').slice(1).forEach(function(line){
    const parts = line.split('\t'); if(parts.length < 3) return;
    const f = parts[0].split('.'); const fi = osisIndex[f[0]]; if(fi===undefined) return;
    const tParts = parts[1].split('-'); const t = tParts[0].split('.'); const ti = osisIndex[t[0]]; if(ti===undefined) return;
    let toV = null;
    if(tParts[1]){ const e = tParts[1].split('.'); if(e[0]===t[0] && e[1]===t[1]) toV = Number(e[2]); }
    const key = fi+'.'+f[1]+'.'+f[2];
    (xrefs[key] = xrefs[key] || []).push([Number(parts[2])||0, ti, Number(t[1]), Number(t[2]), toV]);
  });

  const jobs = [];
  KJV.books.forEach(function(name, bi){
    Object.keys(KJV.text[name]).forEach(function(chKey){ jobs.push([bi, Number(chKey)]); });
  });
  let done = 0, withHenry = 0;
  async function one(job){
    const bi = job[0], ch = job[1], code = USFM[bi];
    const [henry, geneva] = await Promise.all([
      get(BC + 'en/henry/' + code + '/' + ch + '.json', true),
      get(BC + 'en/geneva/' + code + '/' + ch + '.json', true)
    ]);
    const out = { intro: [], sections: [], geneva: {}, xrefs: {}, words: {}, orig: {}, who: {}, ents: {} };
    if(henry){
      withHenry++;
      henry.units.forEach(function(u){
        const paras = (u.paragraphs||[]).map(function(p){ return clean(p.text); }).filter(Boolean);
        if(u.kind === 'chapter'){ out.intro = paras; return; }
        const r = rangeIn(u.range, ch); if(!r) return;
        out.sections.push({ from: r.from, to: r.to, title: clean(u.title), paras: paras });
      });
    }
    if(geneva){
      geneva.units.forEach(function(u){
        const r = rangeIn(u.range, ch); if(!r) return;
        const txt = clean((u.paragraphs||[]).map(function(p){ return p.text; }).join(' '));
        if(!txt) return;
        for(let v=r.from; v<=Math.min(r.to, r.from+40); v++){ out.geneva[String(v)] = out.geneva[String(v)] ? out.geneva[String(v)] + ' ' + txt : txt; }
      });
    }
    Object.keys(KJV.text[KJV.books[bi]][String(ch)]).forEach(function(v){
      const list = xrefs[bi+'.'+ch+'.'+v]; if(!list) return;
      list.sort(function(a,b){ return b[0]-a[0]; });
      out.xrefs[v] = list.slice(0,10).map(function(x){ return x[4] ? [x[1],x[2],x[3],x[4]] : [x[1],x[2],x[3]]; });
    });
    Object.keys(KJV.text[KJV.books[bi]][String(ch)]).forEach(function(v){
      const w = WORDS[code+'.'+ch+'.'+v]; if(w) out.words[v] = w;
      const o = ORIG[code+'.'+ch+'.'+v]; if(o) out.orig[v] = o;
      const ids = WHO.who[code+'.'+ch+'.'+v];
      if(ids){ out.who[v] = ids; ids.forEach(function(id){ out.ents[id] = WHO.ents[id]; }); }
    });
    const dir = path.join(ROOT, 'public/study', code);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ch + '.json'), JSON.stringify(out));
    done++;
    if(done % 100 === 0) console.log(done + '/' + jobs.length);
  }
  const queue = jobs.slice();
  await Promise.all(Array.from({ length: 12 }, async function(){ while(queue.length){ await one(queue.shift()); } }));
  console.log('chapters written:', done, '| with Matthew Henry:', withHenry);
}

await buildBsb();
await buildChapters();
