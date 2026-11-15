# -*- coding: utf-8 -*-
"""把旧工程里能用的素材和数据整理进 web/ 新工程。可重复运行。
用法: python web/tools/build_assets.py [怪物图.png] [NPC图.png]
"""
import json, os, shutil, sys
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
J = lambda *p: os.path.join(ROOT, *p)
OUT = J('web', 'client', 'assets')
W, H = 6012, 3594


def load(p):
    with open(J(*p.split('/')), encoding='utf-8') as f:
        return json.load(f)


def ensure(d):
    os.makedirs(d, exist_ok=True)
    return d


def cut_sprites(src, cols, rows, names, outdir, target_h, boxes=None):
    """从白底拼图里把每个角色抠出来：从格子四边往里“灌水”，把连着边的白色变透明。"""
    im = Image.open(src).convert('RGBA')
    cw, ch = im.width // cols, im.height // rows
    for i, name in enumerate(names):
        cx, cy = i % cols, i // cols
        cell = im.crop(boxes[i] if boxes else (cx * cw, cy * ch, (cx + 1) * cw, (cy + 1) * ch))
        px = cell.load()
        w, h = cell.size
        seen = bytearray(w * h)
        dq = deque()
        for x in range(w):
            dq.append((x, 0)); dq.append((x, h - 1))
        for y in range(h):
            dq.append((0, y)); dq.append((w - 1, y))
        while dq:
            x, y = dq.popleft()
            if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
                continue
            r, g, b, a = px[x, y]
            if min(r, g, b) < 236:
                continue
            seen[y * w + x] = 1
            px[x, y] = (r, g, b, 0)
            dq.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
        # 边缘残留的浅色像素做半透明，避免白边
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                r, g, b, a = px[x, y]
                if a and min(r, g, b) > 205:
                    if any(seen[(y + dy) * w + x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        px[x, y] = (r, g, b, 90)
        box = cell.getbbox()
        cell = cell.crop(box)
        th = target_h[i] if isinstance(target_h, (list, tuple)) else target_h
        s = th / cell.height
        cell = cell.resize((max(1, round(cell.width * s)), th), Image.LANCZOS)
        cell.save(os.path.join(outdir, name + '.png'))
        print('  sprite', name, cell.size)


def main():
    ensure(OUT)
    # 1) 地图
    mp = ensure(os.path.join(OUT, 'map'))
    src = J('game', 'assets', 'maps', 'ruins-island', 'redraw-v2', 'overview.webp')
    dst = os.path.join(mp, 'island.webp')
    if not os.path.exists(dst):
        shutil.copyfile(src, dst)
    mini = os.path.join(mp, 'island-mini.jpg')
    if not os.path.exists(mini):
        Image.open(src).convert('RGB').resize((752, 449), Image.LANCZOS).save(mini, quality=88)
    shutil.copyfile(J('resources', 'images', '地图与场景', '用户提供', '原件', '网盘资料', '地图', '遗迹之岛.jpg'),
                    os.path.join(mp, 'island-worldmap.jpg'))
    # 登录画面
    lg = Image.open(J('resources', 'images', '综合截图与未分类', '用户提供', '原件', '网盘资料', '登陆', '再战江湖.jpg'))
    lg.crop((85, 0, 905, 435)).save(os.path.join(mp, 'login.jpg'), quality=92)

    # 2) 角色动作图
    ch = ensure(os.path.join(OUT, 'char'))
    cdir = J('game', 'assets', 'characters', 'redhair-v2')
    man = load('game/assets/characters/redhair-v2/manifest.json')
    anims = {}
    for a in man['animations']:
        anims[a['id']] = {'frames': a['frames'], 'fps': a['fps'], 'loop': a['loop']}
        d = os.path.join(ch, a['atlas'])
        if not os.path.exists(d):
            shutil.copyfile(os.path.join(cdir, a['atlas']), d)
    with open(os.path.join(ch, 'anims.json'), 'w', encoding='utf-8') as f:
        json.dump({'frame': man['frame_size'], 'anchor': man['anchor'], 'anims': anims}, f)

    # 3) 怪物 / NPC 抠图
    if len(sys.argv) > 1:
        cut_sprites(sys.argv[1], 2, 2, ['m_001', 'm_002', 'm_003', 'm_004'],
                    ensure(os.path.join(OUT, 'mon')), [170, 110, 100, 210],
                    boxes=[(70, 20, 545, 615), (690, 50, 1120, 530), (80, 800, 430, 1140), (455, 555, 1240, 1246)])
    if len(sys.argv) > 2:
        cut_sprites(sys.argv[2], 5, 2, ['npc_ruins_island_%02d' % i for i in range(1, 11)],
                    ensure(os.path.join(OUT, 'npc')), 150)

    # 4) 岛屿数据（服务器用）
    r = load('game/data/world/ruins-island.json')
    npcs = load('game/data/world/island-npcs.json')
    mons = {m['id']: m for m in load('game/data/monsters.json')['monsters']}
    lv = load('game/data/level-curve.json')['levels']
    uv = lambda p: [round(p[0] * W), round(p[1] * H)]
    k = W / 1002.0
    obstacles = []
    for p in r['props']:
        if p['collision_radius'] > 0:
            x, y = uv(p['uv'])
            obstacles.append({'x': x, 'y': y, 'r': round(p['collision_radius'])})
    for o in r['extra_obstacles']:
        x, y = uv(o['uv'])
        obstacles.append({'x': x, 'y': y, 'r': round(o['radius'])})
    island = {
        'id': 'ruins_island', 'name': '遗迹之岛', 'w': W, 'h': H, 'cell': 32,
        'land': [uv(p) for p in r['land_polygon']],
        'pier': [uv(p) for p in r['pier_polygon']],
        'obstacles': obstacles,
        'rects': [[round(a * k), round(b * k), round(c * k), round(d * k)] for a, b, c, d in r['building_footprints']],
        'spawn': uv(r['spawn_uv']), 'portal': uv(r['portal_uv']), 'portalLevel': r['portal_level'],
        'regions': [{'id': g['id'], 'name': g['name'], 'x': uv(g['uv'])[0], 'y': uv(g['uv'])[1]} for g in r['regions']],
        'npcs': [{'id': n['id'], 'name': n['name'], 'x': round(n['scenePixel'][0]), 'y': round(n['scenePixel'][1]),
                  'coord': n['gameCoordinate']} for n in npcs['points']],
        'zones': [{'mon': mid, 'name': mons[mid]['name'], 'level': mons[mid]['level'], 'exp': mons[mid]['exp'],
                   'x': uv(z['center'])[0], 'y': uv(z['center'])[1],
                   'rx': round(z['radius'][0] * W), 'ry': round(z['radius'][1] * H)}
                  for mid, z in r['monster_zones'].items()],
        'levels': [l['exp_to_next'] for l in lv],
    }
    sd = ensure(J('web', 'server', 'data'))
    with open(os.path.join(sd, 'island.json'), 'w', encoding='utf-8') as f:
        json.dump(island, f, ensure_ascii=False, indent=1)
    for n in ('classes', 'attributes', 'combat-rules'):
        shutil.copyfile(J('game', 'data', n + '.json'), os.path.join(sd, n + '.json'))
    print('done')


if __name__ == '__main__':
    main()
