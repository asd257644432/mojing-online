# 把怪物表（4 行怪 × 4 列：正面站、正面跳、背面站、背面跳）切成每只怪一张小图集
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_chars import cut_white, blobs
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'v4', 'monsters.png')
OUT = os.path.join(ROOT, 'client', 'assets', 'mon')
NAMES = ['m_001', 'm_002', 'm_003', 'm_004']
CELL, FOOT, BODY = 200, 190, 170      # 格子边长、脚底高度、最高那格缩到多高
os.makedirs(OUT, exist_ok=True)
im = cut_white(Image.open(SRC).convert('RGBA'))
grid = blobs(im, 4, 4)
prev = Image.new('RGB', (CELL * 4, CELL * 4), (90, 150, 70))
for r, name in enumerate(NAMES):
    k = BODY / max(b[3] - b[1] for b in grid[r])
    sheet = Image.new('RGBA', (CELL * 4, CELL), (0, 0, 0, 0))
    for c, b in enumerate(grid[r]):
        s = im.crop(b); s = s.resize((max(1, round(s.width * k)), max(1, round(s.height * k))), Image.LANCZOS)
        sheet.alpha_composite(s, (c * CELL + (CELL - s.width) // 2, FOOT - s.height))
    sheet.save(os.path.join(OUT, name + '.png'))
    prev.paste(sheet, (0, r * CELL), sheet)
prev.save(os.path.join(ROOT, 'art-src', 'v4', '_preview-monsters.jpg'), quality=88)
print('ok', [[(b[2]-b[0], b[3]-b[1]) for b in row] for row in grid])
