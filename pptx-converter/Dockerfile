# pptx-converter -- see README.md in this folder. LibreOffice does the
# real pptx->pdf conversion; poppler-utils' pdftoppm splits that PDF into
# one PNG per slide. Both are plain apt packages -- this is the whole
# reason this piece can't just be a normal Cloud Function (no way to
# install a system package there), and the whole reason it CAN be this
# simple as a Cloud Run container.
FROM node:22-slim

# fonts-crosextra-carlito/-caladea [2026-09-24, Jared: "the image conversion
# destroyed the powerpoint formatting"] -- root cause: his deck used
# Calibri/Cambria (Microsoft's own default Office fonts, proprietary --
# can't legally bundle the real files), which this container didn't have,
# so LibreOffice silently substituted a font with different letter widths,
# throwing off text-box sizing and causing titles/subtitles to overlap.
# Carlito and Caladea are Google/Red-Hat-made, openly licensed, METRIC-
# COMPATIBLE drop-ins for Calibri/Cambria respectively (same letter widths
# and line heights, just a slightly different look) -- LibreOffice already
# has Calibri->Carlito and Cambria->Caladea built into its own font-
# substitution table, so simply having these installed is enough; no
# server.js or config change needed. This is the same fix LibreOffice
# itself recommends for exactly this "opening an Office file without MS's
# fonts" situation.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice \
      poppler-utils \
      fonts-crosextra-carlito \
      fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.js ./

# Cloud Run sets PORT itself at runtime (usually 8080) -- this default just
# covers running the container locally/manually.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
