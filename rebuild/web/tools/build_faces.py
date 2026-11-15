# 把正面头像表（2 行 × 4 列：男 0-3、女 0-3）切成八张 160×160 的小图，供左上角头像和“更换形象”窗口用
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_chars import cut_white, blobs
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'client', 'assets', 'face')
os.makedirs(OUT, exist_ok=True)
S = 160
im = cut_white(Image.open(os.path.join(ROOT, 'art-src', 'v4', 'faces.png')).convert('RGBA'))
grid = blobs(im, 2, 4)
prev = Image.new('RGB', (4 * S, 2 * S), (70, 50, 110))
for r, sex in enumerate('mf'):
    for c in range(4):
        s = im.crop(grid[r][c]); k = (S - 8) / max(s.width, s.height)
        s = s.resize((max(1, round(s.width * k)), max(1, round(s.height * k))), Image.LANCZOS)
        t = Image.new('RGBA', (S, S), (0, 0, 0, 0)); t.alpha_composite(s, ((S - s.width) // 2, S - s.height))
        t.save(os.path.join(OUT, '%s%d.png' % (sex, c)))
        prev.paste(t, (c * S, r * S), t)
prev.save(os.path.join(ROOT, 'art-src', 'v4', '_preview-faces.jpg'), quality=88)
print('ok')
