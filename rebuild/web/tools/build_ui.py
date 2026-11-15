# -*- coding: utf-8 -*-
"""把照原作描出来的界面小图切成一张张透明底图标。用法: python web/tools/build_ui.py"""
import os
from PIL import Image
from build_chars import cut_white, blobs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'v4')
OUT = os.path.join(ROOT, 'client', 'assets', 'ui')
os.makedirs(OUT, exist_ok=True)


def row(fn, names, size):
    im = cut_white(Image.open(os.path.join(SRC, fn)).convert('RGBA'))
    for name, box in zip(names, blobs(im, 1, len(names))[0]):
        sp = im.crop(box)
        k = size / max(sp.size)
        sp = sp.resize((round(sp.width * k), round(sp.height * k)), Image.LANCZOS)
        t = Image.new('RGBA', (size, size))
        t.paste(sp, ((size - sp.width) // 2, size - sp.height), sp)   # 底边对齐，字好排在下面
        t.save(os.path.join(OUT, name + '.png'), optimize=True)
    print('ok', fn, len(names))


if __name__ == '__main__':
    row('ui-menu.png', ['menu-char', 'menu-bag', 'menu-skill', 'menu-quest', 'menu-friend', 'menu-guild', 'menu-nation', 'menu-mall'], 96)
