# Trace the 1P + product-name artwork (dark panel) into flat-colour SVG paths.
import sys, numpy as np, cv2, potrace
from PIL import Image
src, name, out = sys.argv[1], sys.argv[2], sys.argv[3]
S = 6  # upscale before tracing
a = np.asarray(Image.open(src).convert('RGB'))[:, 600:].astype(np.float32)
a = cv2.bilateralFilter(a, 7, 40, 5)
a = cv2.resize(a, None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
pal = {'bg': (18, 24, 43), 'blue': (38, 103, 142), 'orange': (237, 82, 0), 'gold': (238, 185, 11)}
keys = list(pal); P = np.array([pal[k] for k in keys], np.float32)
lab = np.argmin(((a[:, :, None, :] - P[None, None]) ** 2).sum(-1), -1)
FILL = {'blue': '#2274A5', 'orange': '#F75C03', 'gold': '#F1C40F'}
fg = lab != 0
ys, xs = np.where(fg); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
def trace(mask):
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    bm = potrace.Bitmap(~mask.astype(bool))  # potracer traces False pixels
    pl = bm.trace(turdsize=200, alphamax=1.0, opticurve=True, opttolerance=0.4)
    d = []
    for c in pl:
        f = lambda p: f'{(p.x - x0) / S:.2f},{(p.y - y0) / S:.2f}'
        d.append('M' + f(c.start_point))
        for seg in c.segments:
            d.append(('C' + f(seg.c1) + ' ' + f(seg.c2) + ' ' + f(seg.end_point)) if not seg.is_corner else ('L' + f(seg.c) + ' L' + f(seg.end_point)))
        d.append('Z')
    return ''.join(d)
W, H = (x1 - x0) / S, (y1 - y0) / S
rows = fg[y0:y1].any(1); gap = next(i for i in range(int(len(rows) * .6), len(rows)) if not rows[i])
paths = {k: trace(lab == keys.index(k)) for k in FILL}
word = trace((lab == keys.index('gold')) & (np.arange(lab.shape[0])[:, None] > y0 + gap))
mark_gold = trace((lab == keys.index('gold')) & (np.arange(lab.shape[0])[:, None] <= y0 + gap))
def svg(w, h, body, bg=None, pad=0):
    r = f'<rect x="{-pad}" y="{-pad}" width="{w + 2 * pad:.2f}" height="{h + 2 * pad:.2f}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {w + 2 * pad:.2f} {h + 2 * pad:.2f}">{r}{body}</svg>\n'
full = ''.join(f'<path fill="{FILL[k]}" fill-rule="evenodd" d="{paths[k]}"/>' for k in ('blue', 'orange')) + f'<path fill="{FILL["gold"]}" fill-rule="evenodd" d="{paths["gold"]}"/>'
open(f'{out}/firstpass-{name}-stacked.svg', 'w').write(svg(W, H, full))
open(f'{out}/firstpass-{name}-stacked-dark-card.svg', 'w').write(svg(W, H, full, '#0F172A', 40))
open(f'{out}/firstpass-{name}-stacked-light-card.svg', 'w').write(svg(W, H, full, '#F8FAFC', 40))
if name == 'vision':
    mh = gap / S
    mark = ''.join(f'<path fill="{FILL[k]}" fill-rule="evenodd" d="{paths[k]}"/>' for k in ('blue', 'orange')) + f'<path fill="{FILL["gold"]}" fill-rule="evenodd" d="{mark_gold}"/>'
    open(f'{out}/firstpass-mark.svg', 'w').write(svg(W, mh, mark))
print(name, round(W), round(H))
