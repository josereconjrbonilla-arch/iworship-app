# pptx-converter -- see README.md in this folder. LibreOffice does the
# real pptx->pdf conversion; poppler-utils' pdftoppm splits that PDF into
# one PNG per slide. Both are plain apt packages -- this is the whole
# reason this piece can't just be a normal Cloud Function (no way to
# install a system package there), and the whole reason it CAN be this
# simple as a Cloud Run container.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice \
      poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.js ./

# Cloud Run sets PORT itself at runtime (usually 8080) -- this default just
# covers running the container locally/manually.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
