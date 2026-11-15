# 把“哪里能走、NPC 站哪、怪在哪”画到新地图上，核对旧数据和新图对不对得上。
# 红线=陆地边界 红圈/红框=不能走 黄点=NPC(带编号) 彩色椭圆=怪区 白点=出生点 紫点=传送点
import json, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, 'server', 'data', 'island.json'), encoding='utf-8'))
im = Image.open(os.path.join(ROOT, 'client', 'assets', 'map', 'island.webp')).convert('RGB')
k = im.width / d['w']
im = im.resize((1500, round(1500 * im.height / im.width))); k = 1500 / d['w']
g = ImageDraw.Draw(im)
P = lambda p: (p[0] * k, p[1] * k)
g.line([P(p) for p in d['land']] + [P(d['land'][0])], fill='red', width=2)
g.line([P(p) for p in d['pier']] + [P(d['pier'][0])], fill='orange', width=2)
for o in d['obstacles']:
    g.ellipse([(o['x'] - o['r']) * k, (o['y'] - o['r']) * k, (o['x'] + o['r']) * k, (o['y'] + o['r']) * k], outline='red')
for r in d['rects']:
    g.rectangle([r[0] * k, r[1] * k, r[2] * k, r[3] * k], outline='red', width=2)
for z, c in zip(d['zones'], ['yellow', 'pink', 'orange', 'purple']):
    g.ellipse([(z['x'] - z['rx']) * k, (z['y'] - z['ry']) * k, (z['x'] + z['rx']) * k, (z['y'] + z['ry']) * k], outline=c, width=3)
for n in d['npcs']:
    x, y = P((n['x'], n['y'])); g.ellipse([x - 5, y - 5, x + 5, y + 5], fill='yellow', outline='black'); g.text((x + 6, y - 6), n['id'][-2:], fill='white')
for p, c in ((d['spawn'], 'white'), (d['portal'], 'magenta')):
    x, y = P(p); g.ellipse([x - 6, y - 6, x + 6, y + 6], fill=c, outline='black')
im.save(os.path.join(ROOT, 'art-src', 'v4', '_check-overlay.jpg'), quality=85)
