# pptx-converter

A tiny, self-hosted Cloud Run service that turns an uploaded `.pptx` file
into one PNG image per slide -- the piece that lets iWorship's Devotionals
... no wait, this is the Media Library's PowerPoint-upload feature (see
"UPLOAD A POWERPOINT (.PPTX)" under Media Library -> ADD MEDIA -> SLIDESHOW)
accept a real PowerPoint file directly, instead of requiring you to export
it to images yourself first.

## Why this exists, and why it's a separate service from `functions/`

Turning a `.pptx` into images for real (not an approximation) needs an
actual Office-document rendering engine -- there's no way to do this in
plain JavaScript. The two usual options are a paid third-party conversion
API, or Google's own Drive/Slides APIs -- both were looked at and set
aside: a paid API means an ongoing per-conversion cost and a new account
to manage, and Google's route needs an app-verification review (and, until
that's done, a connection that silently expires every 7 days) since it
touches Drive/Slides scopes. This route avoids both: it's LibreOffice
(the same free, open-source office suite this exact kind of conversion has
used for years) running headless inside a container, in a Cloud Run
service that lives in the SAME `iworship-ph` Google Cloud project as
everything else -- no new account, no API key, no verification, and
(per Cloud Run's own always-free monthly tier) no real cost for a single
church's normal usage.

It has to be its OWN Cloud Run service, not folded into `functions/`,
because Cloud Functions' normal deploy path can't install a system package
like LibreOffice -- it only bundles your JS + npm dependencies. Cloud Run
deploys an actual container image instead, which CAN have LibreOffice (and
`poppler-utils`, for the PDF->PNG step) installed via a normal Dockerfile.
The existing `dailyDevotionalNotify`-style Cloud Functions still do
everything else; `functions/index.js`'s new `convertPptxToSlideshow`
callable is just a thin bridge that receives the upload from the app,
calls THIS service to do the actual conversion, and writes the result to
Firestore/Storage same as every other media upload.

## How it works

One route: `POST /convert`, raw `.pptx` bytes as the request body (no
multipart form -- keeps both this server and the Cloud Function calling it
simple). It:

1. Writes the bytes to a temp file.
2. Runs `soffice --headless --convert-to pdf` (LibreOffice) to turn it
   into a single PDF -- this is the part that actually understands
   PowerPoint's real layout/fonts/images, not a guess at the file format.
3. Runs `pdftoppm -png -r 150` (`poppler-utils`) to split that PDF into
   one PNG per page/slide, at a resolution sharp enough for a real
   projector.
4. Responds with `{ "slides": ["<base64 PNG>", "<base64 PNG>", ...] }`,
   in order.
5. Cleans up every temp file it made, success or failure.

`GET /` is a plain health check (`200 ok`) -- Cloud Run pings this to know
the container started correctly; it's not used by the app itself.

Deliberately NOT built for public traffic: deployed with
`--no-allow-unauthenticated` (see DEPLOY.md), so only something holding a
valid Google-signed identity token for THIS project can call it at all --
in practice, only the `convertPptxToSlideshow` Cloud Function itself,
using its own built-in service identity. There's no API key or secret to
manage for this because of that -- it's Google Cloud's own
service-to-service authentication, the same mechanism (just the reverse
direction) Cloud Functions already uses to call Firestore/Storage.

`--concurrency=1` on purpose: LibreOffice's headless mode isn't safe to
run two conversions at once inside the same process. Cloud Run scales by
starting MORE container instances if two conversions land at the same
moment, rather than running them concurrently inside one -- a real
tradeoff (a few seconds slower under rare simultaneous use) in exchange
for never producing a corrupted conversion, which is the right side of
that tradeoff for how rarely two people will upload a deck at literally
the same second.

## One-time setup

See DEPLOY.md in this same folder for the exact commands to run once,
from Git Bash, to get this live.
