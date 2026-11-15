# 登录图、创角背景、职业立绘、六国卡：从 web/art-src/v4 切好放进 web/client/assets
# 用法：python web\tools\build_login.py
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from build_chars import cut_white

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src', 'v4')
OUT = os.path.join(ROOT, 'client', 'assets', 'login')
os.makedirs(OUT, exist_ok=True)


def jpg(src, dst, w):
    p = os.path.join(SRC, src)
    if not os.path.exists(p):
        print('缺', src); return
    im = Image.open(p).convert('RGB')
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, dst), quality=88)
    print(dst, im.size)


def grid(src, rows, cols, names, height, white=True):
    p = os.path.join(SRC, src)
    if not os.path.exists(p):
        print('缺', src); return
    im = Image.open(p).convert('RGBA')
    cw, ch = im.width / cols, im.height / rows
    for i, n in enumerate(names):
        if not n:
            continue
        r, c = divmod(i, cols)
        cell = im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        if white:
            cell = cut_white(cell)
        box = cell.getbbox() if white else None
        if not white:
            # 国卡：白底里找出非白的矩形
            g = cell.convert('L').point(lambda v: 255 if v < 238 else 0)
            box = g.getbbox()
        cell = cell.crop(box)
        k = height / cell.height
        cell = cell.resize((round(cell.width * k), height), Image.LANCZOS)
        if white:
            cell.save(os.path.join(OUT, n + '.png'))
        else:
            cell.convert('RGB').save(os.path.join(OUT, n + '.jpg'), quality=88)
        print(n, cell.size)


jpg('login-bg.png', 'login.jpg', 1400)
jpg('create-bg.png', 'create-bg.jpg', 1400)
grid('portraits.png', 2, 3, ['p-warrior', 'p-rogue', 'p-priest-f', 'p-ranger', 'p-priest', 'p-merchant'], 460)
grid('portrait-mage.png', 1, 1, ['p-mage'], 460)
grid('nations.png', 2, 3, ['n-light', 'n-wind', 'n-water', 'n-moon', 'n-earth', 'n-fire'], 200, white=False)
