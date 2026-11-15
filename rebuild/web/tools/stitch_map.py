# 把九块重画好的地图拼成一整张遗迹之岛。
# 相邻两块有一条重叠带，在重叠带里做“渐隐渐显”（一块慢慢淡出、另一块慢慢淡入），接缝就不扎眼。
# 用法: python web\tools\stitch_map.py
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V4 = os.path.join(ROOT, 'art-src', 'v4')
OUT = os.path.join(ROOT, 'client', 'assets', 'map')
S = 3.84  # 原图 1 像素 = 新图 3.84 像素

meta = json.load(open(os.path.join(V4, 'tiles.json'), encoding='utf-8'))
W0, H0 = meta['size']
W, H = round(W0 * S), round(H0 * S)
acc = np.zeros((H, W, 3), np.float64)
wsum = np.zeros((H, W, 1), np.float64)

def ramp(n, lo, hi, feather):
    # 一块图横向（或纵向）的“话语权”：贴着整张图外沿的一侧不淡出，贴着邻居的一侧慢慢淡出
    w = np.ones(n)
    f = min(feather, n // 2)
    r = (np.arange(f) + 0.5) / f
    if lo: w[:f] = r
    if hi: w[-f:] = r[::-1]
    return w

for name, (x0, y0, x1, y1) in meta['boxes'].items():
    fn = os.path.join(V4, 'new-%s.png' % name)
    if not os.path.exists(fn):
        print('缺', name); continue
    px0, py0, px1, py1 = round(x0 * S), round(y0 * S), round(x1 * S), round(y1 * S)
    im = Image.open(fn).convert('RGB').resize((px1 - px0, py1 - py0), Image.LANCZOS)
    a = np.asarray(im, np.float64)
    fx, fy = round(99 * S), round(101 * S)
    wx = ramp(px1 - px0, x0 > 0, x1 < W0, fx)
    wy = ramp(py1 - py0, y0 > 0, y1 < H0, fy)
    w = (wy[:, None] * wx[None, :])[:, :, None] ** 2  # 平方一下，过渡更干脆，重影更少
    acc[py0:py1, px0:px1] += a * w
    wsum[py0:py1, px0:px1] += w

full = Image.fromarray(np.clip(acc / np.maximum(wsum, 1e-6), 0, 255).astype(np.uint8))
os.makedirs(OUT, exist_ok=True)
full.save(os.path.join(OUT, 'island.webp'), quality=88, method=4)
full.resize((752, 449), Image.LANCZOS).save(os.path.join(OUT, 'island-mini.jpg'), quality=88)
# 对比图：上原作、下重画，给人眼把关
src = Image.open(os.path.join(ROOT, '..', 'resources', 'images', '地图与场景', '用户提供', '原件', '网盘资料', '地图', '遗迹之岛.jpg')).convert('RGB')
cw = 1500; ch = round(cw * H0 / W0)
cmp_ = Image.new('RGB', (cw, ch * 2 + 10), 'white')
cmp_.paste(src.resize((cw, ch), Image.LANCZOS), (0, 0))
cmp_.paste(full.resize((cw, ch), Image.LANCZOS), (0, ch + 10))
cmp_.save(os.path.join(V4, '_compare-island.jpg'), quality=85)
print('整图', full.size)
