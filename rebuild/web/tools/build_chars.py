# -*- coding: utf-8 -*-
"""把画好的“光头身体动作表”和“头部表”切成游戏能用的小图。
身体：每套衣服一张图集（行=动作帧，列=5 个朝向 S,SE,E,NE,N；左边三个朝向在游戏里镜像）。
头  ：每种发型一张图集（一行 5 个朝向，发色照原作固定）。
用法: python web/tools/build_chars.py
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from PIL import ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'v3')
OUT = os.path.join(ROOT, 'client', 'assets', 'char')
os.makedirs(OUT, exist_ok=True)

CELL = 224          # 每格边长
FOOT_Y = 204        # 脚底在格子里的高度
HEAD_R = 30         # 光头半径统一缩放到这个像素数
HAIR_K = 1.2        # 带头发的头比光头大多少（调这个数可让头整体变大变小）
DIRS = ['S', 'SE', 'E', 'NE', 'N']


def cut_white(im, holes=False):
    """从四边“灌水”，把连着边的白底变透明。"""
    if im.mode == 'RGBA' and np.asarray(im)[:, :, 3].min() < 10:
        return im           # 画出来就已经是透明底，直接用
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    white = (a.min(axis=2) > 236) & ((a.max(axis=2) - a.min(axis=2)) < 14)
    h, w = white.shape
    pad = np.full((h + 2, w + 2), 255, np.uint8)
    pad[1:-1, 1:-1] = np.where(white, 255, 0)
    m = Image.fromarray(pad).copy()
    ImageDraw.floodfill(m, (0, 0), 128)
    bg = np.asarray(m)[1:-1, 1:-1] == 128
    if holes:               # 被胳膊、武器围住的白底灌不到水：凡是成片（宽过 5 像素）的纯白也算底
        rest = Image.fromarray(np.where(white & ~bg, 255, 0).astype(np.uint8))
        big = np.asarray(rest.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(9))) > 0
        bg = bg | (big & white)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6)))
    return Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), 'RGBA')


def split(count, n):
    """把一维“每列有多少像素”的序列切成 n 段：在每条等分线附近找最空的位置下刀。"""
    idx = np.where(count > 0)[0]
    lo, hi = idx[0], idx[-1] + 1
    step = (hi - lo) / n
    cuts = [lo]
    for k in range(1, n):
        c = lo + step * k
        a, b = int(c - step * 0.3), int(c + step * 0.3)
        win = count[a:b].astype(np.float32) + np.abs(np.arange(a, b) - c) * 0.01
        cuts.append(a + int(np.argmin(win)))
    cuts.append(hi)
    return [(cuts[i], cuts[i + 1]) for i in range(n)]


def blobs(im, rows, cols):
    al = np.asarray(im)[:, :, 3] > 40
    grid = []
    for y0, y1 in split(al.sum(axis=1), rows):
        row = []
        for x0, x1 in split(al[y0:y1].sum(axis=0), cols):
            sub = al[y0:y1, x0:x1]
            ys = np.where(sub.any(axis=1))[0]; xs = np.where(sub.any(axis=0))[0]
            row.append((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1))
        grid.append(row)
    return grid


def inscribed(m):
    """最大内切圆：一圈圈往里“削皮”，最后剩下的那点就是圆心，削了几圈就是半径。"""
    m = np.pad(m.astype(bool), 1)
    best, n = None, 0
    while m.any():
        ys, xs = np.where(m)
        best = (float(xs.mean()) - 1, float(ys.mean()) - 1); n += 1
        e = m.copy()
        e[1:] &= m[:-1]; e[:-1] &= m[1:]; e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
        if n % 2 == 0:
            e[1:, 1:] &= m[:-1, :-1]; e[:-1, :-1] &= m[1:, 1:]; e[1:, :-1] &= m[:-1, 1:]; e[:-1, 1:] &= m[1:, :-1]
        m = e
    return best[0], best[1], float(n) * 0.9


def skin_mask(rgba):
    a = np.asarray(rgba).astype(np.int16)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    return (al > 128) & (r > 190) & (r - g > 18) & (r - g < 95) & (g - b > 8) & (g - b < 90) & (b > 90)


def head_circle(sprite):
    """光头是画面上半部分最大的一块肤色圆。"""
    return inscribed(np.asarray(sprite)[:, :, 3] > 128)   # Q 版小人身上最大的一团就是头


def build_body(name, sheets):
    """sheets: [(文件, 行数, [帧名...])]"""
    frames = {}
    for fn, rows, names in sheets:
        im = cut_white(Image.open(os.path.join(SRC, fn)))
        grid = blobs(im, rows, 5)
        for r in range(rows):
            for c in range(5):
                x0, y0, x1, y1 = grid[r][c]
                frames[(names[r], c)] = im.crop((x0, y0, x1, y1))
    order = []
    for fname in dict.fromkeys(k[0] for k in frames):
        order.append(fname)
    atlas = Image.new('RGBA', (CELL * 5, CELL * len(order)))
    meta = {'cell': CELL, 'foot': [CELL // 2, FOOT_Y], 'dirs': DIRS, 'frames': order, 'head': {}}
    for ri, fname in enumerate(order):
        heads = []
        for c in range(5):
            sp = frames[(fname, c)]
            hx, hy, hr = head_circle(sp)
            k = HEAD_R / hr
            w, h = max(1, round(sp.width * k)), max(1, round(sp.height * k))
            sp2 = sp.resize((w, h), Image.LANCZOS)
            hx, hy = hx * k, hy * k
            # 横向：身体重心（下半身）对齐格子中线；纵向：脚底对齐
            al = np.asarray(sp2)[:, :, 3] > 60
            low = al[int(h * 0.72):, :]
            xs = np.where(low.any(axis=0))[0]
            cx = (xs.min() + xs.max()) / 2 if len(xs) else w / 2
            ox = round(CELL / 2 - cx)
            oy = FOOT_Y - h
            atlas.alpha_composite(sp2, (c * CELL + max(0, ox), ri * CELL + max(0, oy))) if ox >= 0 and oy >= 0 else atlas.paste(sp2, (c * CELL + ox, ri * CELL + oy), sp2)
            heads.append([round(hx + ox, 1), round(hy + oy, 1)])
        meta['head'][fname] = heads
    atlas.save(os.path.join(OUT, name + '.png'), optimize=True)
    return meta


def build_head(name, fn):
    """头部表：一行 5 个朝向，发色照原作不再染色。"""
    im = cut_white(Image.open(os.path.join(SRC, fn)))
    grid = blobs(im, 1, 5)
    HC = 128
    sheet = Image.new('RGBA', (HC * 5, HC))
    sps = [im.crop(b) for b in grid[0]]
    circ = [inscribed(np.asarray(sp)[:, :, 3] > 128) for sp in sps]
    k = HEAD_R * HAIR_K / (sum(c[2] for c in circ) / 5)
    anchors = []
    for c, sp in enumerate(sps):
        w, h = round(sp.width * k), round(sp.height * k)
        sp2 = sp.resize((w, h), Image.LANCZOS)
        cx, cy = circ[c][0] * k, circ[c][1] * k
        ox, oy = round(HC / 2 - cx), round(HC * 0.6 - cy)
        sheet.paste(sp2, (c * HC + ox, oy), sp2)
        anchors.append([round(cx + ox, 1), round(cy + oy, 1)])
    sheet.save(os.path.join(OUT, name + '.png'), optimize=True)
    return {'cell': HC, 'center': anchors}


if __name__ == '__main__':
    meta = {'headR': HEAD_R, 'bodies': {}, 'heads': {}}
    meta['bodies']['warrior-m-l1'] = build_body('warrior-m-l1', [
        ('warrior-m-l1-idle.png', 1, ['idle']),
        ('warrior-m-l1-walk.png', 2, ['walkA', 'walkB']),
        ('warrior-m-l1-attack.png', 2, ['atkUp', 'atkDown']),
    ])
    meta['heads']['m-fashion'] = build_head('m-fashion', 'head-m-fashion.png')
    json.dump(meta, open(os.path.join(OUT, 'chars.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # 预览：把头按锚点叠到身体上，方便肉眼检查
    b = Image.open(os.path.join(OUT, 'warrior-m-l1.png'))
    head = Image.open(os.path.join(OUT, 'm-fashion.png'))
    bm, hm = meta['bodies']['warrior-m-l1'], meta['heads']['m-fashion']
    pv = Image.new('RGBA', b.size, (120, 180, 70, 255))
    pv.alpha_composite(b)
    HC = hm['cell']
    for ri, fname in enumerate(bm['frames']):
        for c in range(5):
            hx, hy = bm['head'][fname][c]
            cx, cy = hm['center'][c]
            tile = head.crop((c * HC, 0, (c + 1) * HC, HC))
            x, y = round(c * CELL + hx - cx), round(ri * CELL + hy - cy)
            pv.paste(tile, (x, y), tile)
    pv.convert('RGB').save(os.path.join(SRC, '_preview.jpg'), quality=90)
    print('ok', b.size, list(bm['frames']))
