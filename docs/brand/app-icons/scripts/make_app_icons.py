# App icons from the vector logo renders (transparent PNGs of the traced SVGs).
import sys
from PIL import Image
logo_png, mark_png, out = sys.argv[1:4]
NAVY = (15, 23, 42, 255)  # Deep Navy #0F172A, matches app.json background colours
logo, mark = Image.open(logo_png).convert('RGBA'), Image.open(mark_png).convert('RGBA')
logo, mark = logo.crop(logo.getbbox()), mark.crop(mark.getbbox())
def place(img, size, box, bg):
    w, h = img.size; s = min(box[0] / w, box[1] / h)
    im = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
    c = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    c.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2)); return c
def diag(img, d): w, h = img.size; k = d / (w * w + h * h) ** .5; return w * k, h * k
place(logo, 1024, (760, 760), NAVY).convert('RGB').save(f'{out}/icon.png', optimize=True)
place(logo, 1024, diag(logo, 1024 * 64 / 108), None).save(f'{out}/adaptive-icon.png', optimize=True)  # Android safe circle
place(logo, 512, (480, 480), None).save(f'{out}/splash-icon.png', optimize=True)
place(mark, 48, (44, 44), NAVY).convert('RGB').save(f'{out}/favicon.png', optimize=True)
