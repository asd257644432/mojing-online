import { Sprite, Texture } from 'pixi.js';
import { WILD_FOREST } from '../../../shared/wild-forest';
import type { MapDef, Point } from '../../../shared/types';
import { ChunkedGround } from './chunked-ground';
import { intersects, ocean, outline, oval, paintBeach, paintGrass, paintWall, scatter, trail, type Box, type LandscapePath } from './landscape-paint';

const roadTones = [[36, '#3d623866'], [18, '#7882468c'], [0, '#968756'], [-18, '#aa9765'], [-43, '#c4ab7763']] as const;
const grovePatches = WILD_FOREST.groves.map(grove => ({ ...grove, bounds: {
  left: grove.x - grove.radius, top: grove.y - grove.radius, right: grove.x + grove.radius, bottom: grove.y + grove.radius,
} }));

function combinedOutline(contours: Point[][]) {
  const path = new Path2D();
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const regions = contours.map(points => outline(points, true));
  for (const region of regions) {
    path.addPath(region.path);
    bounds.left = Math.min(bounds.left, region.bounds.left);
    bounds.top = Math.min(bounds.top, region.bounds.top);
    bounds.right = Math.max(bounds.right, region.bounds.right);
    bounds.bottom = Math.max(bounds.bottom, region.bounds.bottom);
  }
  return { path, bounds, regionBounds: regions.map(region => region.bounds) };
}

function paintForestFloor(ctx: CanvasRenderingContext2D, box: Box) {
  const nearby = grovePatches.filter(grove => intersects(box, grove.bounds));
  for (const grove of nearby) {
    const wash = ctx.createRadialGradient(grove.x, grove.y, 0, grove.x, grove.y, grove.radius);
    wash.addColorStop(0, grove.kind === 'slender' ? '#365c3d87' : grove.kind === 'twisted' ? '#5b573979' : '#3f6b3b75');
    wash.addColorStop(.62, '#456d3c4b');
    wash.addColorStop(1, '#37563b00');
    ctx.fillStyle = wash;
    ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  }
  scatter(box, 36, 12, 0x7d201, (x, y, random) => {
    if (random() < .52 || !nearby.some(grove => Math.hypot(grove.x - x, grove.y - y) < grove.radius)) return;
    oval(ctx, x, y, 2 + random() * 4, .8 + random() * 1.7, random() > .57 ? '#b0a86c69' : '#354e3549');
  });
}

function paintPool(ctx: CanvasRenderingContext2D, box: Box, pool: LandscapePath) {
  if (!intersects(box, pool.bounds, 37)) return;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const [width, color] of [[59, '#385a42b0'], [37, '#6c8254'], [17, '#99a080']] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke(pool.path);
  }
  ctx.clip(pool.path);
  const water = ctx.createLinearGradient(pool.bounds.left, pool.bounds.top, pool.bounds.right, pool.bounds.bottom);
  water.addColorStop(0, '#497f72');
  water.addColorStop(.45, '#58978a');
  water.addColorStop(1, '#386b68');
  ctx.fillStyle = water;
  ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#a0c6a17d';
  ctx.stroke(pool.path);
  scatter(box, 42, 24, 0x14e80, (x, y, random) => {
    oval(ctx, x, y, 11 + random() * 14, .7 + random() * 1.2, random() > .45 ? '#a9d3bb67' : '#477c7763');
  });
  ctx.restore();
}

function paintDeck(ctx: CanvasRenderingContext2D, box: Box, deck: LandscapePath) {
  if (!intersects(box, deck.bounds, 6)) return;
  const { left, right, top, bottom } = deck.bounds;
  ctx.save();
  ctx.fillStyle = '#654c36';
  ctx.fill(deck.path);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#4c4033';
  ctx.stroke(deck.path);
  ctx.clip(deck.path);
  for (let x = left + 4, index = 0; x < right; x += 23, index++) {
    ctx.fillStyle = index % 3 === 0 ? '#a78a59' : index % 3 === 1 ? '#b39969' : '#95764f';
    ctx.fillRect(x, top + 4, Math.min(21, right - x), bottom - top - 8);
    ctx.fillStyle = '#d8b98073';
    ctx.fillRect(x + 3, top + 11, 1.5, bottom - top - 23);
    for (const y of [top + 17, bottom - 17]) oval(ctx, x + 13, y, 2.1, 1.6, '#574638');
  }
  ctx.restore();
}

export class WildForestGround extends ChunkedGround {
  private readonly shore = combinedOutline(WILD_FOREST.shore);
  private readonly pool = outline(WILD_FOREST.pool, true);
  private readonly deck = outline(WILD_FOREST.bridge.deck, true);
  private readonly roads = WILD_FOREST.roads.map(({ points, width }) => ({ ...trail(points), width }));
  private readonly cliffs = WILD_FOREST.cliffs.map(points => outline(points, true));

  constructor(map: MapDef) { super(map, 'wild-forest chunks'); }

  protected paintTile(left: number, top: number) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(512, this.map.width - left);
    canvas.height = Math.min(512, this.map.height - top);
    const box = { left, top, right: left + canvas.width, bottom: top + canvas.height };
    const ctx = canvas.getContext('2d')!;
    ctx.translate(-left, -top);
    ocean(ctx, box, this.shore, this.map.height);
    if (this.shore.regionBounds.some(bounds => intersects(box, bounds))) {
      ctx.save();
      ctx.clip(this.shore.path);
      paintGrass(ctx, box, this.map, ['#5d974b', '#74aa50', '#87b552', '#639648']);
      paintForestFloor(ctx, box);
      paintBeach(ctx, box, this.shore, .78);
      ctx.lineCap = ctx.lineJoin = 'round';
      for (const road of this.roads) {
        if (!intersects(box, road.bounds, road.width / 2 + 25)) continue;
        for (const [extra, color] of roadTones) {
          ctx.lineWidth = road.width + extra;
          ctx.strokeStyle = color;
          ctx.stroke(road.path);
        }
        ctx.lineWidth = road.width - 20;
        scatter(box, 39, 10, 0x80f26, (x, y, random) => {
          if (random() < .6 || !ctx.isPointInStroke(road.path, x - left, y - top)) return;
          oval(ctx, x, y, 1 + random() * 3, .7 + random(), '#5a634256');
        });
      }
      ctx.restore();
    }
    this.cliffs.forEach((cliff, index) => paintWall(ctx, box, cliff, index));
    paintPool(ctx, box, this.pool);
    paintDeck(ctx, box, this.deck);
    return new Sprite({ texture: Texture.from(canvas, true), x: left, y: top, eventMode: 'none' });
  }
}
