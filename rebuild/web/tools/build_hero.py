# -*- coding: utf-8 -*-
"""把“整个人”的动作表（斜俯视角、头和身体画在一起）切成游戏用的图集。
图集：行=动作帧，列=5 个朝向（正面、左前、左侧、左后、背面；朝右的三个方向游戏里照镜子）。
每个小人按“头的大小”统一缩放、按“头的位置”左右对齐、按“脚底”上下对齐，这样换帧时人不会抖。
用法: python web/tools/build_hero.py
"""
import json, os
import numpy as np
from PIL import Image
from build_chars import cut_white, blobs, inscribed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'v4')
OUT = os.path.join(ROOT, 'client', 'assets', 'char')
os.makedirs(OUT, exist_ok=True)

CELL = 360      # 每格边长（要装得下伸出去的武器）
FOOT_Y = 320    # 脚底在格子里的高度
HEAD_R = 40     # 头（连头发）统一缩放到这个半径


def build(name, sheets):
    frames, order = {}, []
    for fn, rows, names in sheets:
        im = cut_white(Image.open(os.path.join(SRC, fn)).convert('RGBA'), holes=True)
        grid = blobs(im, rows, 5)
        sps = {(r, c): im.crop(grid[r][c]) for r in range(rows) for c in range(5)}
        circ = {k: inscribed(np.asarray(v)[:, :, 3] > 128) for k, v in sps.items()}
        k = HEAD_R / float(np.median([c[2] for c in circ.values()]))   # 一张表用同一个缩放
        for r in range(rows):
            order.append(names[r])
            for c in range(5):
                frames[(names[r], c)] = (sps[(r, c)], circ[(r, c)], k)
    atlas = Image.new('RGBA', (CELL * 5, CELL * len(order)))
    meta = {'cell': CELL, 'foot': [CELL // 2, FOOT_Y], 'frames': order, 'head': {}, 'whole': True}
    for ri, fname in enumerate(order):
        heads = []
        for c in range(5):
            sp, (hx, hy, hr), k = frames[(fname, c)]
            w, h = max(1, round(sp.width * k)), max(1, round(sp.height * k))
            sp2 = sp.resize((w, h), Image.LANCZOS)
            ox, oy = round(CELL / 2 - hx * k), FOOT_Y - h
            tile = Image.new('RGBA', (CELL, CELL)); tile.paste(sp2, (ox, oy), sp2)
            atlas.paste(tile, (c * CELL, ri * CELL))
            heads.append([round(hx * k + ox, 1), round(hy * k + oy, 1)])
        meta['head'][fname] = heads
    atlas.save(os.path.join(OUT, name + '.png'), optimize=True)
    pv = Image.new('RGBA', atlas.size, (120, 180, 70, 255)); pv.alpha_composite(atlas)
    pv.convert('RGB').resize((atlas.width // 2, atlas.height // 2), Image.LANCZOS).save(os.path.join(SRC, '_preview-' + name + '.jpg'), quality=88)
    return meta


if __name__ == '__main__':
    p = os.path.join(OUT, 'chars.json')
    meta = {'headR': HEAD_R, 'bodies': {}, 'heads': {}}
    meta['bodies']['hero-m-l1'] = build('hero-m-l1', [
        ('hero-m-l1-idle.png', 1, ['idle']),
        ('hero-m-l1-walk.png', 2, ['walkA', 'walkB']),
        ('hero-m-l1-attack.png', 2, ['atkUp', 'atkDown']),
        ('hero-m-l1-hold-staff.png', 3, ['idle_staff', 'walkA_staff', 'walkB_staff']),   # 手里拿着法杖站和走
    ] + [
        ('hero-m-l1-atk-%s.png' % w, 2, ['atkUp_' + w, 'atkDown_' + w])   # 各职业武器的出招：盗贼匕首、法师法杖、游侠弓、祭司权杖、商人锤
        for w in ['dagger', 'staff', 'bow', 'scepter', 'hammer']
    ])
    # 角色面板里那个正面站着的大图（不是斜俯视）
    d = cut_white(Image.open(os.path.join(SRC, 'doll-m-l1.png')).convert('RGBA'))
    d = d.crop(d.getbbox()); d = d.resize((round(d.width * 460 / d.height), 460), Image.LANCZOS); d.save(os.path.join(OUT, 'doll-m-l1.png'), optimize=True)
    json.dump(meta, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('ok', meta['bodies']['hero-m-l1']['frames'])
