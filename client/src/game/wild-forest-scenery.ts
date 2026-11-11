import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { pointPassable } from '../../../shared/navigation';
import { WILD_FOREST } from '../../../shared/wild-forest';
import type { MapDef, Point } from '../../../shared/types';

type Kind = 'broadleaf' | 'slender' | 'twisted' | 'mossRock' | 'standingStone' | 'rootArch' | 'ruin' | 'camp' | 'fern';
type Frame = readonly [left: number, top: number, right: number, bottom: number, footX: number, footY: number];
type Range = readonly [left: number, top: number, right: number, bottom: number];
interface Ornament extends Point { kind: Kind; height: number; flip?: boolean; }
interface Art { texture: Texture; anchorX: number; anchorY: number; scale: number; }
export interface ForestFocus extends Point { height: number; depth: number; }

const atlasPath = '/assets/scenery/wild-forest-props.png';
const atlasSize = 1254;
const atlasCell = atlasSize / 3;
const framePadding = 3;
const frames: Record<Kind, Frame> = {
  broadleaf: [16, 12, 411, 405, 219, 389], slender: [480, 21, 774, 401, 628, 386],
  twisted: [865, 25, 1222, 398, 1057, 378], mossRock: [47, 512, 384, 750, 216, 736],
  standingStone: [507, 459, 740, 773, 628, 755], rootArch: [837, 438, 1233, 766, 1040, 749],
  ruin: [38, 863, 382, 1213, 207, 1176], camp: [434, 884, 786, 1175, 612, 1151],
  fern: [836, 872, 1236, 1191, 1037, 1175],
};
const cell = 512;
const margin = 128;

function rng(seed: number) {
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 0x100000000;
  };
}

const roadSections = WILD_FOREST.roads.flatMap(({ width, points }) => points.slice(1).map((end, index) => {
  const start = points[index];
  const dx = end.x - start.x, dy = end.y - start.y;
  return { start, dx, dy, lengthSquared: dx * dx + dy * dy, halfWidth: width / 2 };
}));

function nearRoad(point: Point, clearance: number) {
  return roadSections.some(({ start, dx, dy, lengthSquared, halfWidth }) => {
    const x = point.x - start.x, y = point.y - start.y;
    const t = Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared));
    return Math.hypot(x - t * dx, y - t * dy) < halfWidth + clearance;
  });
}

function ornaments(map: MapDef): Ornament[] {
  const { landmarks } = WILD_FOREST;
  const fixed: Ornament[] = [
    { ...landmarks.islandRuin, kind: 'ruin', height: 148 },
    { ...landmarks.camp, kind: 'camp', height: 113 },
    { ...landmarks.treeHeart, kind: 'twisted', height: 266 },
    { x: landmarks.northGate.x - 153, y: landmarks.northGate.y + 37, kind: 'standingStone', height: 98 },
    { ...landmarks.rootArch, kind: 'rootArch', height: 134 },
  ];
  const plants = [...fixed];
  const random = rng(0x6b01c42);
  const safe = (point: Point, clearance: number) => pointPassable(map, point) && !nearRoad(point, clearance) &&
    !map.npcs.some(npc => Math.hypot(npc.x - point.x, npc.y - point.y) < clearance + 95) &&
    !map.portals.some(portal => Math.hypot(portal.x - point.x, portal.y - point.y) < clearance + portal.radius + 65) &&
    !map.monsters.some(pack => Math.hypot(pack.x - point.x, pack.y - point.y) < clearance + Math.min(pack.radius, 115)) &&
    !fixed.some(prop => Math.hypot(prop.x - point.x, prop.y - point.y) < clearance + 100);
  const spacing = 93;
  const planted = new Map<string, Point[]>();
  for (const grove of WILD_FOREST.groves) {
    let placed = 0;
    for (let attempt = 0; placed < grove.count && attempt < grove.count * 8; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * grove.radius;
      const point = { x: grove.x + Math.cos(angle) * distance, y: grove.y + Math.sin(angle) * distance * .74 };
      if (!safe(point, 72)) continue;
      const col = Math.floor(point.x / spacing), row = Math.floor(point.y / spacing);
      let crowded = false;
      for (let y = row - 1; y <= row + 1 && !crowded; y++) for (let x = col - 1; x <= col + 1 && !crowded; x++) {
        crowded = planted.get(`${x}:${y}`)?.some(tree => Math.hypot(tree.x - point.x, tree.y - point.y) < spacing) ?? false;
      }
      if (crowded) continue;
      const key = `${col}:${row}`;
      const group = planted.get(key);
      if (group) group.push(point);
      else planted.set(key, [point]);
      plants.push({ ...point, kind: grove.kind, height: 146 + random() * 76, flip: random() > .48 });
      placed++;
    }
  }
  for (let index = 0; index < 150; index++) {
    const point = { x: map.width * (.15 + random() * .76), y: map.height * (.13 + random() * .75) };
    if (!safe(point, 28)) continue;
    const rock = index % 5 === 0;
    plants.push({ ...point, kind: rock ? 'mossRock' : 'fern', height: rock ? 36 + random() * 27 : 21 + random() * 21, flip: random() > .5 });
  }
  return plants;
}

function marker(at: Point, theme: 'rift' | 'snow' | 'wood') {
  const root = new Graphics({ label: `wild-forest:${theme}-gate`, x: at.x, y: at.y, eventMode: 'none' });
  root.zIndex = at.y - 12;
  const stone = theme === 'snow' ? 0x839b9b : theme === 'rift' ? 0x8d8f85 : 0x77634e;
  const trim = theme === 'snow' ? 0xc7dbd2 : theme === 'rift' ? 0xbeb9a3 : 0xb59b71;
  const width = theme === 'rift' ? 69 : 51;
  for (const side of [-1, 1]) {
    const x = side * width;
    root.ellipse(x + 4, 2, 25, 8).fill({ color: 0x2d4437, alpha: .30 });
    root.poly([x - 15, -2, x - 9, -59, x + 10, -62, x + 17, -2, x + 4, 6]).fill(stone).stroke({ color: 0x505d52, width: 2 });
    root.poly([x - 15, -2, x - 9, -59, x - 3, -60, x - 2, 3]).fill(trim);
    for (const y of [-14, -29, -45]) root.moveTo(x - 9, y).lineTo(x + 11, y - 3).stroke({ color: 0x536259, width: 1.6 });
    root.circle(x, -37, theme === 'rift' ? 4 : 2.4).fill(theme === 'rift' ? 0xa5c4bb : 0xd4c999);
  }
  root.moveTo(-width - 12, -55).quadraticCurveTo(-width + 18, -94, 0, -99)
    .quadraticCurveTo(width - 18, -94, width + 12, -55).lineTo(width - 3, -51)
    .quadraticCurveTo(width - 17, -79, 0, -86).quadraticCurveTo(-width + 17, -79, -width + 3, -51)
    .closePath().fill(stone).stroke({ color: trim, width: 3 });
  return root;
}

function rail(a: Point, b: Point) {
  const root = new Graphics({ label: 'wild-forest:bridge-rail', x: a.x, y: a.y, eventMode: 'none' });
  const span = b.x - a.x;
  root.zIndex = a.y + 1;
  for (const y of [-10, -23]) {
    root.moveTo(0, y).lineTo(span, y).stroke({ color: 0x584735, width: 7, cap: 'round' });
    root.moveTo(1, y - 2).lineTo(span - 1, y - 2).stroke({ color: 0xa18354, width: 2.5, cap: 'round' });
  }
  for (let x = 2; x < span; x += 43) {
    root.moveTo(x, 3).lineTo(x, -28).stroke({ color: 0x725538, width: 8, cap: 'round' });
    root.moveTo(x - 2, 0).lineTo(x - 2, -26).stroke({ color: 0xb49a69, width: 2, cap: 'round' });
  }
  return root;
}

function silhouette(prop: Ornament) {
  const root = new Graphics({ label: `wild-forest:${prop.kind}`, eventMode: 'none' });
  const tree = prop.kind === 'broadleaf' || prop.kind === 'slender' || prop.kind === 'twisted';
  const color = prop.kind === 'slender' ? 0x526f4b : prop.kind === 'twisted' ? 0x74724b : 0x75905a;
  root.ellipse(5, 1, tree ? 36 : 27, tree ? 11 : 8).fill({ color: 0x314739, alpha: .28 });
  if (tree) {
    root.moveTo(-11, 2).quadraticCurveTo(3, -21, -7, -48).lineTo(5, -66)
      .quadraticCurveTo(5, -23, 14, 1).lineTo(5, 5).closePath().fill(0x6e5844);
    const narrow = prop.kind === 'slender' ? .65 : 1;
    for (const [x, y, width] of [[-23, -62, 24], [19, -62, 25], [-8, -79, 30], [15, -82, 23]]) {
      root.ellipse(x * narrow, y, width * narrow, width * .6).fill(color).stroke({ color: 0x546c4a, width: 2 });
      root.ellipse((x - 5) * narrow, y - 5, width * .63 * narrow, width * .30).fill({ color: 0xb1ae6c, alpha: .52 });
    }
  } else if (prop.kind === 'fern') {
    for (const x of [-22, -14, -5, 7, 20]) root.moveTo(0, 0).quadraticCurveTo(x * .6, -18, x, -30)
      .stroke({ color: 0x6c8949, width: 5, cap: 'round' });
  } else if (prop.kind === 'camp') {
    root.poly([-38, -3, -3, -56, 32, -8, 14, 4]).fill(0x947753).stroke({ color: 0x635444, width: 2 });
    root.poly([-3, -56, 37, -50, 63, -14, 32, -8]).fill(0xb39970).stroke({ color: 0x6f5e4a, width: 2 });
    root.poly([-5, -40, -19, -2, 12, -1]).fill(0x514c40);
  } else {
    const tall = prop.kind !== 'mossRock';
    const y = tall ? -72 : -23;
    root.poly([-26, -3, -17, y + 10, 2, y, 18, y + 10, 29, -2, 8, 5]).fill(0x77877b)
      .stroke({ color: 0x50665b, width: 2 });
    root.poly([-17, y + 10, 2, y, 18, y + 10, 12, y + 21, -8, y + 20]).fill(0xa8a890);
    root.ellipse(-10, -4, 12, 3).fill(0x5d794b);
  }
  const scale = prop.height / (tree ? 103 : prop.kind === 'fern' ? 30 : prop.kind === 'camp' ? 56 : prop.kind === 'mossRock' ? 23 : 72);
  root.scale.set(prop.flip ? -scale : scale, scale);
  return root;
}

export class WildForestScenery {
  private readonly nodes: Container[] = [];
  private readonly textures: Texture[] = [];
  private readonly buckets = new Map<string, Container[]>();
  private readonly treeBounds = new Map<Container, Range>();
  private readonly fading = new Set<Container>();
  private visible = new Set<Container>();
  private range?: Range;
  private viewportKey = '';
  private disposed = false;

  constructor(map: MapDef, private readonly world: Container) {
    const { landmarks, bridge } = WILD_FOREST;
    this.place(marker(landmarks.rift, 'rift'));
    this.place(marker(landmarks.northGate, 'snow'));
    this.place(marker(landmarks.eastGate, 'wood'));
    this.place(marker(landmarks.southGate, 'wood'));
    this.place(rail(bridge.deck[0], bridge.deck[1]));
    this.place(rail(bridge.deck[3], bridge.deck[2]));
    const placements = ornaments(map).map(prop => {
      const node = new Container({ label: `wild-forest:prop-${prop.kind}`, x: prop.x, y: prop.y, zIndex: prop.y, eventMode: 'none' });
      node.addChild(silhouette(prop));
      this.place(node);
      return { prop, node };
    });
    void this.loadArt(placements);
  }

  private async loadArt(placements: { prop: Ornament; node: Container }[]) {
    const art = new Map<Kind, Art>();
    try {
      const sheet = await Assets.load<Texture>(atlasPath);
      if (this.disposed) return;
      if (sheet.width !== atlasSize || sheet.height !== atlasSize) throw new Error('Unexpected Wild Forest scenery atlas dimensions');
      for (const [kind, [left, top, right, bottom, footX, footY]] of Object.entries(frames) as [Kind, Frame][]) {
        const column = Math.floor(footX / atlasCell), row = Math.floor(footY / atlasCell);
        const x = Math.max(column * atlasCell, left - framePadding), y = Math.max(row * atlasCell, top - framePadding);
        const x2 = Math.min((column + 1) * atlasCell, right + framePadding);
        const y2 = Math.min((row + 1) * atlasCell, bottom + framePadding);
        const frame = new Rectangle(x, y, x2 - x, y2 - y);
        const texture = new Texture({ source: sheet.source, frame, label: `wild-forest:${kind}` });
        this.textures.push(texture);
        art.set(kind, { texture, anchorX: (footX - frame.x) / frame.width, anchorY: (footY - frame.y) / frame.height, scale: 1 / (footY - top) });
      }
    } catch (error) {
      if (this.disposed) return;
      console.warn('Could not load Wild Forest scenery atlas', error);
      return;
    }
    for (const { prop, node } of placements) {
      const cutout = art.get(prop.kind)!;
      const sprite = new Sprite({ texture: cutout.texture, label: `wild-forest:${prop.kind}`, eventMode: 'none' });
      sprite.anchor.set(cutout.anchorX, cutout.anchorY);
      const scale = cutout.scale * prop.height;
      sprite.scale.set(prop.flip ? -scale : scale, scale);
      for (const child of node.removeChildren()) child.destroy({ children: true });
      node.addChild(sprite);
    }
    // Re-index once because the painted canopy bounds differ from the loading silhouettes.
    this.buckets.clear();
    for (const node of this.nodes) this.index(node);
    this.syncVisible();
  }

  private place(node: Container) {
    this.nodes.push(node);
    this.index(node);
  }

  private index(node: Container) {
    const local = node.getLocalBounds();
    const bounds = { minX: node.x + local.minX, maxX: node.x + local.maxX,
      minY: node.y + local.minY, maxY: node.y + local.maxY };
    if (['broadleaf', 'slender', 'twisted'].some(kind => node.label === `wild-forest:prop-${kind}`)) {
      this.treeBounds.set(node, [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]);
    }
    for (let y = Math.floor(bounds.minY / cell); y <= Math.floor(bounds.maxY / cell); y++) {
      for (let x = Math.floor(bounds.minX / cell); x <= Math.floor(bounds.maxX / cell); x++) {
        const key = `${x}:${y}`;
        const group = this.buckets.get(key);
        if (group) group.push(node);
        else this.buckets.set(key, [node]);
      }
    }
  }

  updateView(origin: Point, width: number, height: number) {
    if (this.disposed) return;
    const range: Range = [Math.floor((origin.x - margin) / cell), Math.floor((origin.y - margin) / cell),
      Math.floor((origin.x + width + margin) / cell), Math.floor((origin.y + height + margin) / cell)];
    const key = range.join(':');
    if (key === this.viewportKey) return;
    this.viewportKey = key;
    this.range = range;
    this.syncVisible();
  }

  updateOcclusion(player: ForestFocus, target: ForestFocus | undefined, deltaMs: number) {
    if (this.disposed) return;
    const covered = new Set<Container>();
    const sample = (focus: ForestFocus) => {
      const x = focus.x, y = focus.y - focus.height * .55;
      const candidates = this.buckets.get(`${Math.floor(x / cell)}:${Math.floor(y / cell)}`);
      if (!candidates) return;
      for (const node of candidates) {
        const bounds = this.treeBounds.get(node);
        if (node.parent === this.world && node.zIndex > focus.depth && bounds &&
          x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3]) covered.add(node);
      }
    };
    sample(player);
    if (target && Math.hypot(target.x - player.x, target.y - player.y) <= 300) sample(target);
    for (const node of covered) this.fading.add(node);
    const blend = 1 - Math.exp(-Math.max(0, deltaMs) / 90);
    for (const node of this.fading) {
      const goal = covered.has(node) ? .22 : 1;
      node.alpha += (goal - node.alpha) * blend;
      if (goal === 1 && node.alpha > .998) { node.alpha = 1; this.fading.delete(node); }
    }
  }

  private syncVisible() {
    if (!this.range) return;
    const [left, top, right, bottom] = this.range;
    const visible = new Set<Container>();
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const group = this.buckets.get(`${x}:${y}`);
      if (group) for (const node of group) visible.add(node);
    }
    for (const node of this.visible) if (!visible.has(node)) {
      node.removeFromParent();
      node.alpha = 1;
      this.fading.delete(node);
    }
    for (const node of visible) if (!this.visible.has(node)) this.world.addChild(node);
    this.visible = visible;
  }

  destroy() {
    this.disposed = true;
    for (const node of this.nodes) node.destroy({ children: true });
    for (const texture of this.textures) texture.destroy(false);
    this.nodes.length = 0;
    this.textures.length = 0;
    this.visible.clear();
    this.buckets.clear();
    this.treeBounds.clear();
    this.fading.clear();
  }
}
