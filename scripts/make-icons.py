#!/usr/bin/env python3
"""One-off generator for the PWA icon PNGs (192x192, 512x512).
Draws a simplified version of the app's open-hymnal-book mark on the
wine/ivory palette used throughout the app (see vite.config.js theme_color /
background_color). Run once: `python3 scripts/make-icons.py`.
"""
from PIL import Image, ImageDraw
import math

WINE = (107, 18, 32, 255)      # #6B1220
IVORY = (246, 239, 221, 255)   # #F6EFDD
GOLD = (196, 149, 62, 255)     # accent

def draw_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background: rounded square, wine field. Maskable icons need a safe-zone
    # margin (content within the inner ~80%) so Android doesn't crop the mark.
    pad = int(size * 0.0) if not maskable else int(size * 0.0)
    radius = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=WINE)

    # Open book mark, ivory strokes, centered.
    cx, cy = size / 2, size / 2 + size * 0.02
    book_w = size * (0.62 if not maskable else 0.46)
    book_h = book_w * 0.64
    spine_x = cx
    top_y = cy - book_h / 2
    bot_y = cy + book_h / 2
    stroke = max(2, int(size * 0.028))

    # Left page (a gentle curve approximated with an arc-ish polyline)
    left_pts = []
    right_pts = []
    steps = 24
    for i in range(steps + 1):
        t = i / steps
        # curve outward then back, like a page falling open
        bulge = math.sin(t * math.pi) * (book_w * 0.30)
        y = top_y + t * book_h
        left_pts.append((spine_x - bulge - book_w * 0.06, y))
        right_pts.append((spine_x + bulge + book_w * 0.06, y))

    d.line(left_pts, fill=IVORY, width=stroke, joint="curve")
    d.line(right_pts, fill=IVORY, width=stroke, joint="curve")
    d.line([(spine_x, top_y), (spine_x, bot_y)], fill=IVORY, width=stroke)

    # A small gold accent: a five-pointed note/star above the spine to hint
    # "hymnal" without needing legible text at small sizes.
    star_r = size * 0.045
    star_cy = top_y - size * 0.06
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        r = star_r if i % 2 == 0 else star_r * 0.42
        pts.append((spine_x + r * math.cos(ang), star_cy + r * math.sin(ang)))
    d.polygon(pts, fill=GOLD)

    return img

for size in (192, 512):
    icon = draw_icon(size)
    icon.save(f"public/icons/icon-{size}.png")
    print(f"wrote public/icons/icon-{size}.png")

# Maskable variant (512 only, used by some Android launchers) with more
# background margin so the mark survives circular/rounded-square cropping.
maskable = draw_icon(512, maskable=True)
maskable.save("public/icons/icon-512-maskable.png")
print("wrote public/icons/icon-512-maskable.png")
