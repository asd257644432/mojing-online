import { Sprite, Texture } from 'pixi.js';
import { LIFE_REALM } from '../../../shared/life-realm';
import type { MapDef, Point } from '../../../shared/types';
import { ChunkedGround } from './chunked-ground';
import { intersects, outline, oval, paintGrass, scatter, trail, type Box, type LandscapePath } from './landscape-paint';

type Road = LandscapePath & { width: number };
const soilTones = [[38, '#486c4166'], [17, '#92854e9e'], [0, '#ac945e'], [-20, '#bca571'], [-49, '#cfbb8066']] as const;
const stoneTones = [[28, '#75866387'], [7, '#92977c'], [-12, '#a6aa91']] as const;
const stoneColors = ['#b4b4a1', '#a2a795', '#aeb0a1', '#c0beab', '#9ba393', '#b6b6a5'] as const;
const plaza = LIFE_REALM.landmarks.plaza;
const plazaRadii = { x: 142, y: 85 };
const plazaBounds = { left: plaza.x - plazaRadii.x, top: plaza.y - plazaRadii.y,
  right: plaza.x + plazaRadii.x, bottom: plaza.y + plazaRadii.y };

function strokeRoads(ctx: CanvasRenderingContext2D, roads: Road[], tones: readonly (readonly [number, string])[]) {
  // Paint all outer strokes before any inner strokes so shared forks blend together.
  for (const [extra, color] of tones) {
    ctx.strokeStyle = color;
    for (const { path, width } of roads) {
      ctx.lineWidth = width + extra;
      ctx.stroke(path);
    }
  }
}

function onRoad(ctx: CanvasRenderingContext2D, box: Box, roads: Road[], x: number, y: number, inset: number) {
  return roads.some(({ path, width }) => {
    ctx.lineWidth = width - inset;
    return ctx.isPointInStroke(path, x - box.left, y - box.top);
  });
}

function paintDirt(ctx: CanvasRenderingContext2D, box: Box, roads: Road[]) {
  if (!roads.length) return;
  strokeRoads(ctx, roads, soilTones);
  scatter(box, 37, 14, 0x51c90, (x, y, random) => {
    if (random() < .53 || !onRoad(ctx, box, roads, x, y, 20)) return;
    oval(ctx, x, y, 2 + random() * 4, .8 + random() * 1.6, random() > .55 ? '#d9c78c9a' : '#78674572');
  });
}

function paintFlagstone(ctx: CanvasRenderingContext2D, x: number, y: number, random: () => number) {
  const width = 11 + random() * 11, depth = 6 + random() * 7;
  const skew = (random() - .5) * 6;
  ctx.beginPath();
  ctx.moveTo(x - width * .98, y - depth * .32);
  ctx.lineTo(x - width * .52 + skew, y - depth);
  ctx.lineTo(x + width * .49 + skew, y - depth * .86);
  ctx.lineTo(x + width, y - depth * .18);
  ctx.lineTo(x + width * .54, y + depth * .72);
  ctx.lineTo(x - width * .37, y + depth);
  ctx.lineTo(x - width * .89, y + depth * .55);
  ctx.closePath();
  ctx.fillStyle = stoneColors[Math.floor(random() * stoneColors.length)];
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#5e6a5785';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - width * .88, y - depth * .27);
  ctx.lineTo(x - width * .52 + skew, y - depth + 1);
  ctx.lineTo(x + width * .46 + skew, y - depth * .79);
  ctx.strokeStyle = '#e8e5cc9c';
  ctx.stroke();
}

function paintStone(ctx: CanvasRenderingContext2D, box: Box, roads: Road[], floor: LandscapePath) {
  const nearPlaza = intersects(box, plazaBounds, 32);
  if (!roads.length && !nearPlaza) return;
  ctx.save();
  ctx.clip(floor.path);
  if (nearPlaza) {
    oval(ctx, plaza.x, plaza.y, plazaRadii.x + 17, plazaRadii.y + 14, '#75866382');
    oval(ctx, plaza.x, plaza.y, plazaRadii.x, plazaRadii.y, '#a6aa91');
  }
  strokeRoads(ctx, roads, stoneTones);
  scatter(box, 31, 25, 0x8c164, (x, y, random) => {
    if (random() < .16) return;
    const inPlaza = nearPlaza && ((x - plaza.x) / (plazaRadii.x - 12)) ** 2 + ((y - plaza.y) / (plazaRadii.y - 10)) ** 2 <= 1;
    if (inPlaza || onRoad(ctx, box, roads, x, y, 22)) paintFlagstone(ctx, x, y, random);
  });
  ctx.restore();
}

function paintBanks(ctx: CanvasRenderingContext2D, box: Box, banks: LandscapePath[], tones: readonly (readonly [number, string])[]) {
  const nearby = banks.filter(bank => intersects(box, bank.bounds, 56));
  for (const [width, color] of tones) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    for (const bank of nearby) ctx.stroke(bank.path);
  }
}

function paintWater(ctx: CanvasRenderingContext2D, box: Box, water: Path2D) {
  ctx.save();
  ctx.clip(water);
  const sheen = ctx.createLinearGradient(3820, 2100, 6990, 5570);
  sheen.addColorStop(0, '#65b7bc');
  sheen.addColorStop(.43, '#6ac2bd');
  sheen.addColorStop(.70, '#55adad');
  sheen.addColorStop(1, '#479898');
  ctx.fillStyle = sheen;
  ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  scatter(box, 47, 42, 0x742ac, (x, y, random) => {
    const width = 8 + random() * 26;
    oval(ctx, x, y, width, 1 + random() * 1.3, random() > .40 ? '#b8efe17d' : '#408e9b76');
    if (random() > .64) oval(ctx, x + width * .30, y + 5, width * .48, .7, '#ccf2d949');
  });
  ctx.restore();
}

function paintDeck(ctx: CanvasRenderingContext2D, box: Box, bridge: LandscapePath & { deck: readonly Point[] }) {
  if (!intersects(box, bridge.bounds, 3)) return;
  const [edge, , , other] = bridge.deck;
  const shade = ctx.createLinearGradient(edge.x, edge.y, other.x, other.y);
  shade.addColorStop(0, '#838c80');
  shade.addColorStop(.22, '#a6ada0');
  shade.addColorStop(.72, '#b4baad');
  shade.addColorStop(1, '#899288');
  ctx.fillStyle = shade;
  ctx.fill(bridge.path);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#6e796e';
  ctx.stroke(bridge.path);
}

export class LifeRealmGround extends ChunkedGround {
  private readonly land = outline(LIFE_REALM.walkable, true);
  private readonly floor = outline(LIFE_REALM.cityFloor, true);
  private readonly outerBanks = [...LIFE_REALM.moatShore.map(shore => outline(shore, false)), outline(LIFE_REALM.tributary, true)];
  private readonly pond = outline(LIFE_REALM.treePond.bounds, true);
  private readonly cityBanks = [...LIFE_REALM.cityShore.map(shore => outline(shore, false)), this.pond];
  private readonly decks = LIFE_REALM.bridges.map(({ deck }) => ({ deck, ...outline(deck, true) }));
  private readonly waterSections = [...LIFE_REALM.riverSections.map(section => outline(section, true)), this.pond];
  private readonly water = new Path2D();
  private readonly dirtRoads: Road[] = [];
  private readonly stoneRoads: Road[] = [];

  constructor(map: MapDef) {
    super(map, 'life-realm chunks');
    for (const section of this.waterSections) this.water.addPath(section.path);
    for (const { points, width } of LIFE_REALM.roads) {
      const roads = points.at(-1) === plaza ? this.stoneRoads : this.dirtRoads;
      roads.push({ ...trail(points), width });
    }
  }

  protected paintTile(left: number, top: number) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(512, this.map.width - left);
    canvas.height = Math.min(512, this.map.height - top);
    const box = { left, top, right: left + canvas.width, bottom: top + canvas.height };
    const ctx = canvas.getContext('2d')!;
    ctx.translate(-left, -top);
    ctx.fillStyle = '#375a36';
    ctx.fillRect(left, top, canvas.width, canvas.height);
    if (intersects(box, this.land.bounds)) {
      ctx.save();
      ctx.clip(this.land.path);
      paintGrass(ctx, box, this.map, ['#4e813e', '#639c46', '#79ad55', '#629249']);
      if (intersects(box, this.floor.bounds)) {
        ctx.fillStyle = '#a3c7673b';
        ctx.fill(this.floor.path);
      }
      ctx.lineJoin = ctx.lineCap = 'round';
      const near = (road: Road) => intersects(box, road.bounds, road.width / 2 + 33);
      paintDirt(ctx, box, this.dirtRoads.filter(near));
      paintStone(ctx, box, this.stoneRoads.filter(near), this.floor);
      paintBanks(ctx, box, this.outerBanks, [[74, '#5f754d88'], [37, '#8f9b72'], [14, '#a0b58e']]);
      paintBanks(ctx, box, this.cityBanks, [[71, '#52684c9c'], [42, '#8a9789'], [20, '#a9b3a1'], [6, '#c5c9b2']]);
      if (this.waterSections.some(section => intersects(box, section.bounds))) paintWater(ctx, box, this.water);
      for (const deck of this.decks) paintDeck(ctx, box, deck);
      ctx.restore();
    }
    return new Sprite({ texture: Texture.from(canvas, true), x: left, y: top, eventMode: 'none' });
  }
}
