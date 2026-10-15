# Splash image: logo kept inside the circle Android 12+ shows (2/3 of the image width).
import sys
from PIL import Image
logo = Image.open(sys.argv[1]).convert('RGBA'); logo = logo.crop(logo.getbbox())
N = 1024; d = N * 2 / 3 * 0.94
w, h = logo.size; k = d / (w * w + h * h) ** .5
im = logo.resize((round(w * k), round(h * k)), Image.LANCZOS)
c = Image.new('RGBA', (N, N), (0, 0, 0, 0)); c.alpha_composite(im, ((N - im.width) // 2, (N - im.height) // 2))
c.save(sys.argv[2], optimize=True)
