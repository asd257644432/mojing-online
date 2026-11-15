# 把 NPC 表（2 行 × 5 列，顺序 = NPC 01–10）切成十张小图，脚底对齐、统一身高
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_chars import cut_white, blobs
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'v4', 'npcs.png')
OUT = os.path.join(ROOT, 'client', 'assets', 'npc')
H = 210
im = cut_white(Image.open(SRC).convert('RGBA'))
grid = blobs(im, 2, 5)
prev = Image.new('RGB', (5 * 220, 2 * 230), (90, 150, 70))
i = 0
for r in range(2):
    for c in range(5):
        i += 1
        s = im.crop(grid[r][c]); k = H / s.height
        s = s.resize((max(1, round(s.width * k)), H), Image.LANCZOS)
        s.save(os.path.join(OUT, 'npc_ruins_island_%02d.png' % i))
        prev.paste(s, (c * 220 + (220 - s.width) // 2, r * 230 + 10), s)
prev.save(os.path.join(ROOT, 'art-src', 'v4', '_preview-npcs.jpg'), quality=88)
print('ok', i)
