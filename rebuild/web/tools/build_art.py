# -*- coding: utf-8 -*-
"""把画好的怪物 / NPC / 场景物件 / 地面贴图切成游戏用的小图。
用法: python web/tools/build_art.py
"""
import os
from PIL import Image, ImageOps
import build_chars as bc

ROOT = bc.ROOT
V2 = os.path.join(ROOT, 'art-src', 'v2')
A = os.path.join(ROOT, 'client', 'assets')


def cut(fn, rows, cols, names, sub, height):
    """按 行×列 切开，每个缩到指定高度（height 可以是数字或 {名字: 高度}）。"""
    os.makedirs(os.path.join(A, sub), exist_ok=True)
    im = bc.cut_white(Image.open(os.path.join(V2, fn)))
    grid = bc.blobs(im, rows, cols)
    i = 0
    for r in range(rows):
        for c in range(cols):
            n = names[i]; i += 1
            if not n:
                continue
            sp = im.crop(grid[r][c])
            h = height[n] if isinstance(height, dict) else height
            sp = sp.resize((max(1, round(sp.width * h / sp.height)), h), Image.LANCZOS)
            sp.save(os.path.join(A, sub, n + '.png'), optimize=True)
            print(sub, n, sp.size)


# 怪物：高度按“比人矮一点 / 大蘑菇比人高”定（人物约 105 像素高）
cut('monsters.png', 1, 4, ['m_001', 'm_002', 'm_003', 'm_004'], 'mon',
    {'m_001': 180, 'm_002': 110, 'm_003': 100, 'm_004': 200})
cut('npcs.png', 2, 5, ['npc_ruins_island_%02d' % i for i in range(1, 11)], 'npc', 210)
cut('props-a.png', 2, 3, ['palm', 'pine', 'house', 'stall_potion', 'stall_fruit', 'ruin'], 'prop',
    {'palm': 420, 'pine': 400, 'house': 460, 'stall_potion': 260, 'stall_fruit': 260, 'ruin': 300})
cut('props-b.png', 2, 3, ['portal_base', 'vortex', 'fence', 'boat', 'bush', 'sign'], 'prop',
    {'portal_base': 260, 'vortex': 260, 'fence': 120, 'boat': 220, 'bush': 90, 'sign': 130})

# 地面：2×2 四种，各取中间一块，再“照镜子”拼成四联，这样铺开来接缝对得上
g = Image.open(os.path.join(V2, 'ground.png')).convert('RGB')
w, h = g.size
os.makedirs(os.path.join(A, 'map'), exist_ok=True)
for k, n in enumerate(['grass', 'sand', 'wheat', 'forest']):
    x0, y0 = (k % 2) * w // 2, (k // 2) * h // 2
    m = int(w * 0.07)
    t = g.crop((x0 + m, y0 + m, x0 + w // 2 - m, y0 + h // 2 - m)).resize((320, 320), Image.LANCZOS)
    big = Image.new('RGB', (640, 640))
    big.paste(t, (0, 0)); big.paste(ImageOps.mirror(t), (320, 0))
    big.paste(ImageOps.flip(t), (0, 320)); big.paste(ImageOps.flip(ImageOps.mirror(t)), (320, 320))
    big.save(os.path.join(A, 'map', 'g-' + n + '.jpg'), quality=88)
print('ok')
