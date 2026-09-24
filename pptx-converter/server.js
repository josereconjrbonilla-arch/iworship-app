// pptx-converter -- see README.md in this folder for the full "why".
// Deliberately plain Node with zero npm dependencies (only built-in
// modules) -- there's nothing here complex enough to need a framework,
// and it keeps the Docker build (see Dockerfile) to exactly one step:
// install the two system packages that do the real work, copy this file,
// run it.
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 8080;
// Matches storage.rules' own cap on the media/{uid}/pptx-source/{fileId}
// path -- a request bigger than what the client was ever allowed to
// upload in the first place can only be a bug or abuse, not a real deck.
const MAX_BYTES = 100 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(new Error('File too large (over 100MB).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// The actual conversion: pptx -> pdf (LibreOffice, the one piece of this
// that genuinely understands PowerPoint's layout/fonts/images) -> one PNG
// per page (poppler-utils' pdftoppm). Everything happens in its own
// throwaway temp folder, deleted in the `finally` whether this succeeds or
// throws, so a failed conversion never leaves debris behind for the next
// request.
async function convertPptxToSlidePngs(pptxBuffer) {
  const workDir = path.join(os.tmpdir(), 'convert-' + crypto.randomUUID());
  await fs.mkdir(workDir, { recursive: true });
  const pptxPath = path.join(workDir, 'input.pptx');
  await fs.writeFile(pptxPath, pptxBuffer);

  try {
    await execFileAsync('soffice', [
      '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', workDir, pptxPath
    ], { timeout: 120000 });

    const pdfPath = path.join(workDir, 'input.pdf');
    await fs.access(pdfPath); // throws a clear error if LibreOffice silently didn't produce one (e.g. a corrupt/non-pptx upload)

    const pagePrefix = path.join(workDir, 'slide');
    await execFileAsync('pdftoppm', ['-png', '-r', '150', pdfPath, pagePrefix], { timeout: 120000 });

    // pdftoppm names output slide-1.png, slide-2.png, ... -- plain string
    // sort matches page order correctly up to 9999 slides (zero-padding
    // isn't part of its naming), comfortably more than any real deck.
    const files = (await fs.readdir(workDir))
      .filter((f) => f.startsWith('slide') && f.endsWith('.png'))
      .sort();
    if (!files.length) throw new Error('LibreOffice/pdftoppm produced no slide images.');

    const slides = [];
    for (const f of files) {
      slides.push((await fs.readFile(path.join(workDir, f))).toString('base64'));
    }
    return slides;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    // Cloud Run's own startup health check -- see README.md.
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/convert') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. POST raw .pptx bytes to /convert.' }));
    return;
  }
  try {
    const body = await readBody(req);
    if (!body.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Empty request body -- expected raw .pptx bytes.' }));
      return;
    }
    const slides = await convertPptxToSlidePngs(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ slides }));
  } catch (e) {
    console.error('convert failed:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (e && e.message) ? e.message : 'Conversion failed.' }));
  }
});

server.listen(PORT, () => console.log('pptx-converter listening on ' + PORT));
