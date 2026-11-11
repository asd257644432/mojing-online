import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { LIFE_REALM } from '../../../shared/life-realm';
import { pointPassable } from '../../../shared/navigation';
import type { MapDef, Point } from '../../../shared/types';
import type { ForestFocus } from './wild-forest-scenery';

type Kind = 'lifeTree' | 'dais' | 'rootArch' | 'stall' | 'sign' | 'tree' | 'rock' | 'graves' | 'planter';
type Frame = readonly [left: number, top: number, right: number, bottom: number, footX: number, footY: number];
type Bounds = readonly [left: number, top: number, right: number, bottom: number];
interface Prop extends Point { kind: Kind; height: number; flip?: boolean; }
interface Art { texture: Texture; footX: number; footY: number; height: number; }

const atlasPath = '/assets/scenery/life-realm-props.png';
const atlasSize = 1254;
const atlasCell = atlasSize / 3;
const frames: Record<Kind, Frame> = {
  lifeTree: [88, 70, 377, 370, 238, 360], dais: [485, 147, 765, 326, 629, 315],
  rootArch: [872, 108, 1163, 346, 1020, 335], stall: [101, 494, 360, 744, 232, 730],
  sign: [513, 508, 737, 731, 625, 719], tree: [884, 480, 1156, 749, 1028, 735],
  rock: [100, 915, 360, 1103, 234, 1092], graves: [493, 894, 754, 1109, 625, 1097],
  planter: [882, 916, 1151, 1100, 1018, 1085],
};
const bucketSize = 512;
const viewMargin = 128;

const at = (x: number, y: number): Point => ({ x: LIFE_REALM.width * x, y: LIFE_REALM.height * y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const coverKinds = new Set<Kind>(['lifeTree', 'tree', 'rootArch', 'stall']);
const groves = [
  [.250,.325],[.310,.258],[.336,.168],[.408,.168],[.550,.120],[.628,.124],[.691,.172],
  [.768,.208],[.799,.321],[.819,.442],[.806,.571],[.789,.704],[.749,.802],[.653,.839],
  [.574,.859],[.435,.819],[.364,.775],[.286,.731],[.247,.614],[.226,.485],
] as const;

const roadSections = [...LIFE_REALM.roads, ...LIFE_REALM.bridges.map(({ start, end, deck }) => ({
  points: [start, end], width: distance(deck[0], deck[3]),
}))].flatMap(({ width, points }) => points.slice(1).map((end, index) => {
  const start = points[index];
  const dx = end.x - start.x, dy = end.y - start.y;
  return { start, dx, dy, lengthSquared: dx * dx + dy * dy, radius: width / 2 };
}));

function nearRoad(point: Point, clearance: number) {
  return roadSections.some(({ start, dx, dy, lengthSquared, radius }) => {
    const x = point.x - start.x, y = point.y - start.y;
    const t = Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared));
    return Math.hypot(x - dx * t, y - dy * t) < radius + clearance;
  });
}

function ornaments(map: MapDef): Prop[] {
  const { landmarks, npcPositions, treePond } = LIFE_REALM;
  const shift = (point: Point, x: number, y: number) => ({ x: point.x + x, y: point.y + y });
  const fixed: Prop[] = [
    { ...treePond.treeFoot, kind: 'lifeTree', height: 650 },
    { ...shift(landmarks.lifeTree, -62, 98), kind: 'dais', height: 68 },
    { ...shift(npcPositions['life-shop'], -161, 25), kind: 'stall', height: 96 },
    { ...shift(npcPositions['life-auction'], -99, 66), kind: 'stall', height: 102, flip: true },
    { ...shift(npcPositions['chamber-merchant'], 145, -89), kind: 'stall', height: 98 },
    { ...shift(npcPositions['life-shop'], -117, 91), kind: 'sign', height: 61 },
    { ...shift(npcPositions['life-auction'], 110, 84), kind: 'planter', height: 46 },
    { ...shift(npcPositions['chamber-merchant'], 101, -43), kind: 'planter', height: 47 },
    { ...shift(landmarks.cemetery, 45, -120), kind: 'graves', height: 79 },
    { ...shift(landmarks.cemetery, 182, -166), kind: 'graves', height: 70, flip: true },
    { ...shift(landmarks.cemetery, 231, -47), kind: 'graves', height: 81 },
    { ...at(.408,.316), kind: 'rootArch', height: 181 },
    { ...at(.697,.696), kind: 'rootArch', height: 172, flip: true },
  ];
  const props = fixed.filter(prop => pointPassable(map, prop) || prop.kind === 'dais' || prop.kind === 'lifeTree');
  const safe = (point: Point, clearance: number) => pointPassable(map, point) && !nearRoad(point, clearance) &&
    !map.portals.some(portal => distance(point, portal) < portal.radius + clearance + 66) &&
    !map.npcs.some(npc => distance(point, npc) < clearance + 90) &&
    !map.monsters.some(pack => distance(point, pack) < pack.radius + clearance + 58) &&
    !fixed.some(prop => distance(point, prop) < clearance + 95);
  let seed = 0x71e1f;
  const random = () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 0x100000000;
  };
  for (const [x, y] of groves) {
    const center = at(x, y);
    const grove: Prop[] = [];
    for (let attempt = 0; attempt < 42 && grove.length < 6; attempt++) {
      const angle = random() * Math.PI * 2;
      const radius = 365 * Math.sqrt(random());
      const point = shift(center, Math.cos(angle) * radius, Math.sin(angle) * radius * .79);
      if (!safe(point, 80) || grove.some(tree => distance(point, tree) < 115)) continue;
      grove.push({ ...point, kind: 'tree', height: 148 + 70 * random(), flip: random() < .5 });
    }
    props.push(...grove);
  }
  for (let i = 0; i < 120; i++) {
    const point = at(.17 + random() * .70, .10 + random() * .82);
    if (distance(point, landmarks.lifeTree) < 1450 || !safe(point, 32)) continue;
    props.push({ ...point, kind: 'rock', height: 30 + random() * 28, flip: random() < .5 });
  }
  return props;
}

function silhouette(prop: Prop) {
  const g = new Graphics({ label: `life-realm:loading-${prop.kind}`, eventMode: 'none' });
  const tree = prop.kind === 'tree' || prop.kind === 'lifeTree';
  g.ellipse(0, 2, tree ? 47 : 38, 8).fill({ color: 0x394c32, alpha: .25 });
  if (tree) {
    g.moveTo(-32, 3).quadraticCurveTo(-4, -9, -12, -56).lineTo(8, -65)
      .quadraticCurveTo(5, -26, 27, 3).lineTo(8, 0).lineTo(-12, 4).closePath().fill(0x75695a);
    for (const [x, y, r] of [[-22, -63, 24], [17, -66, 29], [-9, -82, 28], [19, -84, 24]]) {
      g.ellipse(x, y, r, r * .62).fill(0x63874c).stroke({ color: 0x4a6944, width: 1.8 });
      g.ellipse(x - 4, y - 7, r * .63, r * .34).fill({ color: 0x95a960, alpha: .66 });
    }
  } else if (prop.kind === 'stall') {
    g.rect(-30, -59, 7, 58).rect(24, -57, 7, 57).fill(0x7a6047);
    g.poly([-43, -57, -29, -91, 30, -91, 43, -57]).fill(0x72994d).stroke({ color: 0x5b7046, width: 2 });
    for (const x of [-28, -8, 12]) g.poly([x, -59, x + 8, -89, x + 17, -89, x + 13, -59]).fill(0xe5cb75);
    g.poly([-31, -27, 31, -27, 38, -17, -38, -17]).fill(0xaa885d);
  } else if (prop.kind === 'rootArch') {
    g.moveTo(-48, 1).quadraticCurveTo(-42, -88, -5, -92).quadraticCurveTo(39, -98, 47, 1)
      .lineTo(29, 0).quadraticCurveTo(23, -72, -3, -70).quadraticCurveTo(-28, -68, -30, 0)
      .closePath().fill(0x79664f).stroke({ color: 0x595242, width: 2 });
    g.ellipse(-10, -82, 28, 9).fill(0x74914c);
  } else {
    const stone = prop.kind === 'sign' ? 0x8e7051 : 0x868777;
    g.poly([-34, -4, -23, -44, 21, -44, 34, -4, 13, 4, -13, 4]).fill(stone)
      .stroke({ color: 0x5e675b, width: 2 });
    g.poly([-23, -44, 21, -44, 26, -27, -28, -27]).fill(0xa6a18d);
  }
  const scale = prop.height / (tree ? 101 : prop.kind === 'stall' || prop.kind === 'rootArch' ? 93 : 44);
  g.scale.set(prop.flip ? -scale : scale, scale);
  return g;
}

function bridgeRails() {
  const nodes: Graphics[] = [];
  for (const { id, deck: [a, b, c, d] } of LIFE_REALM.bridges) {
    for (const [start, end, opposite] of [[a,b,d],[d,c,a]]) {
      const length = distance(start, end);
      const width = distance(start, opposite);
      const outside = { x: 4 * (start.x - opposite.x) / width, y: 4 * (start.y - opposite.y) / width };
      const bays = Math.ceil(length / 70);
      const span = { x: (end.x - start.x) / bays, y: (end.y - start.y) / bays };
      for (let index = 0; index < bays; index++) {
        const x = start.x + outside.x + span.x * index;
        const y = start.y + outside.y + span.y * index;
        const g = new Graphics({ label: `life-realm:bridge-rail-${id}`, x, y, zIndex: y + span.y / 2, eventMode: 'none' });
        for (const rise of [11, 27]) {
          g.moveTo(0, -rise).lineTo(span.x, span.y - rise).stroke({ color: 0x584838, width: 6.5, cap: 'round' });
          g.moveTo(0, -rise - 2).lineTo(span.x, span.y - rise - 2).stroke({ color: 0xbca27a, width: 2.1, cap: 'round' });
        }
        const post = (px: number, py: number) => {
          g.moveTo(px, py + 1).lineTo(px, py - 34).stroke({ color: 0x795e45, width: 8, cap: 'round' });
          g.moveTo(px - 2, py).lineTo(px - 2, py - 32).stroke({ color: 0xa99468, width: 2.5, cap: 'round' });
        };
        post(0, 0);
        if (index === bays - 1) post(span.x, span.y);
        nodes.push(g);
      }
    }
  }
  return nodes;
}

type Pond = typeof LIFE_REALM.treePond;

function pondLeaves({ bounds, center, fallFoot }: Pond) {
  const g = new Graphics({ label: 'life-realm:pond-lilies', x: center.x, y: center.y, zIndex: fallFoot.y - 3, eventMode: 'none' });
  const area = bounds.reduce((extent, point) => ({ x: Math.max(extent.x, Math.abs(point.x - center.x)), y: Math.max(extent.y, Math.abs(point.y - center.y)) }), { x: 0, y: 0 });
  for (const [x, y, size, flower] of [[-.47,.36,1.2,1],[-.63,.12,.84,0],[-.33,.48,.7,0],[.53,.24,1.05,1],[.62,.02,.82,0],[.31,.42,.76,0]]) {
    const px = x * area.x, py = y * area.y;
    const w = 16 * size, h = 7 * size;
    g.ellipse(px, py + 2, w + 3, h + 2).fill({ color: 0x0e7085, alpha: .33 });
    g.moveTo(px + 1, py).lineTo(px + w, py - 2)
      .bezierCurveTo(px + w * .8, py - h * 1.4, px - w, py - h * 1.3, px - w, py)
      .bezierCurveTo(px - w, py + h * 1.2, px + w * .9, py + h * 1.4, px + w, py + 2)
      .closePath().fill(0x739348).stroke({ color: 0x557b43, width: 1.2 });
    g.moveTo(px, py).lineTo(px - w * .65, py - h * .28).stroke({ color: 0xa8b75e, width: 1.4 });
    if (flower) {
      for (const offset of [-4, 0, 4]) g.ellipse(px + offset, py - 5 + Math.abs(offset) * .32, 2.8, 5.5).fill(0xf0c9cb);
      g.ellipse(px, py - 3, 3, 2.3).fill(0xf5df91);
    }
  }
  return g;
}

class TreeCascade {
  readonly root: Container;
  private readonly streaks: Graphics[] = [];
  private readonly spray: Graphics[] = [];
  private readonly dx: number;
  private readonly dy: number;
  private readonly angle: number;
  private readonly width: number;
  private elapsed = 0;

  constructor({ fallTop, fallFoot, fallWidth: width }: Pond) {
    this.dx = fallFoot.x - fallTop.x;
    this.dy = fallFoot.y - fallTop.y;
    this.angle = -Math.atan2(this.dx, this.dy);
    this.width = width;
    this.root = new Container({ label: 'life-realm:tree-waterfall', x: fallTop.x, y: fallTop.y, zIndex: fallFoot.y + 1, eventMode: 'none' });
    const bed = new Graphics({ eventMode: 'none' });
    const ribbon = (g: Graphics, fraction: number, color: number, alpha: number) => {
      const half = width * fraction / 2;
      g.moveTo(-half * .78, 0).quadraticCurveTo(this.dx * .57 - half * .78, this.dy * .53, this.dx - half, this.dy)
        .quadraticCurveTo(this.dx, this.dy + 11 * fraction, this.dx + half, this.dy)
        .quadraticCurveTo(this.dx * .57 + half * .78, this.dy * .53, half * .78, 0)
        .quadraticCurveTo(0, -5 * fraction, -half * .78, 0).closePath().fill({ color, alpha });
    };
    ribbon(bed, 1.12, 0x276783, .72);
    ribbon(bed, 1, 0x55b8d2, .84);
    ribbon(bed, .68, 0x9ce5ed, .59);
    ribbon(bed, .34, 0xc7f5f4, .46);
    const foam = new Graphics({ eventMode: 'none' });
    foam.ellipse(this.dx, this.dy + 3, width * .76, 16).fill({ color: 0x9ae1e9, alpha: .55 });
    foam.ellipse(this.dx + 4, this.dy + 2, width * .60, 8).fill({ color: 0xd6f4ef, alpha: .64 });
    for (const scale of [.72, 1.02]) foam.ellipse(this.dx, this.dy + 10, width * scale, scale * 20)
      .stroke({ color: 0xc4f2f0, width: 1.5, alpha: .52 });
    this.root.addChild(bed);
    for (let i = 0; i < 12; i++) {
      const streak = new Graphics({ label: 'life-realm:water-streak', eventMode: 'none' });
      streak.moveTo(0, 0).lineTo(0, 30 + i % 4 * 8).stroke({ color: i % 3 ? 0xe0ffff : 0x41b5d0, width: i % 3 ? 1.6 : 3.2, cap: 'round' });
      this.streaks.push(streak);
      this.root.addChild(streak);
    }
    this.root.addChild(foam);
    for (let i = 0; i < 14; i++) {
      const drop = new Graphics({ label: 'life-realm:water-drop', eventMode: 'none' });
      drop.circle(0, 0, 1.6 + i % 3 * .68).fill(0xe2fcf8);
      this.spray.push(drop);
      this.root.addChild(drop);
    }
    this.update(0);
  }

  update(deltaMs: number) {
    this.elapsed += Math.min(60, Math.max(0, deltaMs));
    const phase = this.elapsed;
    for (const [index, streak] of this.streaks.entries()) {
      const progress = (phase / (450 + index % 3 * 90) + index * .137) % 1;
      const across = (((index * 7) % 11) / 10 - .5) * this.width * (.67 + progress * .25);
      streak.position.set(this.dx * progress + across, this.dy * progress);
      streak.rotation = this.angle;
      streak.scale.y = Math.min(1, (1 - progress) * this.dy / 56);
      streak.alpha = Math.sin(Math.PI * progress) * .76;
    }
    for (const [index, drop] of this.spray.entries()) {
      const progress = (phase / (490 + index % 4 * 45) + index * .179) % 1;
      const lateral = (index / (this.spray.length - 1) - .5) * this.width;
      drop.position.set(this.dx + lateral * (.56 + 1.08 * progress), this.dy + 7 * progress - Math.sin(Math.PI * progress) * (13 + index % 5 * 5));
      drop.alpha = (1 - progress) * .85;
    }
  }
}

export class LifeRealmScenery {
  private readonly nodes: Container[] = [];
  private readonly textures: Texture[] = [];
  private readonly buckets = new Map<string, Container[]>();
  private readonly cover = new Map<Container, Bounds>();
  private readonly covered = new Set<Container>();
  private readonly fading = new Set<Container>();
  private readonly cascade: TreeCascade;
  private visible = new Set<Container>();
  private view?: Bounds;
  private disposed = false;

  constructor(map: MapDef, private readonly world: Container) {
    const { treePond } = LIFE_REALM;
    this.cascade = new TreeCascade(treePond);
    this.place(pondLeaves(treePond));
    this.place(this.cascade.root, true);
    for (const rail of bridgeRails()) this.place(rail);
    const placements = ornaments(map).map(prop => {
      const node = new Container({ label: `life-realm:prop-${prop.kind}`, x: prop.x, y: prop.y, zIndex: prop.y, eventMode: 'none' });
      node.addChild(silhouette(prop));
      this.place(node, coverKinds.has(prop.kind));
      return { node, prop };
    });
    void this.loadArt(placements);
  }

  private async loadArt(placements: { node: Container; prop: Prop }[]) {
    const art = new Map<Kind, Art>();
    try {
      const sheet = await Assets.load<Texture>(atlasPath);
      if (this.disposed) return;
      if (sheet.width !== atlasSize || sheet.height !== atlasSize) throw new Error('Unexpected Life Realm scenery atlas dimensions');
      for (const [kind, [left, top, right, bottom, footX, footY]] of Object.entries(frames) as [Kind, Frame][]) {
        const column = Math.floor(footX / atlasCell), row = Math.floor(footY / atlasCell);
        const x = Math.max(column * atlasCell, left - 3), y = Math.max(row * atlasCell, top - 3);
        const x2 = Math.min((column + 1) * atlasCell, right + 3), y2 = Math.min((row + 1) * atlasCell, bottom + 3);
        const frame = new Rectangle(x, y, x2 - x, y2 - y);
        const texture = new Texture({ source: sheet.source, frame, label: `life-realm:${kind}` });
        this.textures.push(texture);
        art.set(kind, { texture, footX: (footX - x) / frame.width, footY: (footY - y) / frame.height, height: footY - top });
      }
    } catch (error) {
      if (!this.disposed) console.warn('Could not load Life Realm scenery atlas', error);
      return;
    }
    for (const { prop, node } of placements) {
      const crop = art.get(prop.kind)!;
      const sprite = new Sprite({ label: `life-realm:${prop.kind}`, texture: crop.texture, eventMode: 'none' });
      const scale = prop.height / crop.height;
      sprite.anchor.set(crop.footX, crop.footY);
      sprite.scale.set(prop.flip ? -scale : scale, scale);
      for (const child of node.removeChildren()) child.destroy();
      node.addChild(sprite);
    }
    // The atlas can extend farther than the temporary silhouettes.
    this.buckets.clear();
    for (const node of this.nodes) this.index(node, this.cover.has(node));
    this.syncVisible();
  }

  private place(node: Container, coversActors = false) {
    this.nodes.push(node);
    this.index(node, coversActors);
  }

  private index(node: Container, coversActors: boolean) {
    const local = node.getLocalBounds();
    const left = node.x + local.minX, right = node.x + local.maxX;
    const top = node.y + local.minY, bottom = node.y + local.maxY;
    if (coversActors) this.cover.set(node, [left, top, right, bottom]);
    for (let y = Math.floor(top / bucketSize); y <= Math.floor(bottom / bucketSize); y++) {
      for (let x = Math.floor(left / bucketSize); x <= Math.floor(right / bucketSize); x++) {
        const key = `${x}:${y}`;
        const bucket = this.buckets.get(key);
        if (bucket) bucket.push(node);
        else this.buckets.set(key, [node]);
      }
    }
  }

  updateView(origin: Point, width: number, height: number) {
    if (this.disposed) return;
    const left = Math.floor((origin.x - viewMargin) / bucketSize), top = Math.floor((origin.y - viewMargin) / bucketSize);
    const right = Math.floor((origin.x + width + viewMargin) / bucketSize), bottom = Math.floor((origin.y + height + viewMargin) / bucketSize);
    if (this.view?.[0] === left && this.view[1] === top && this.view[2] === right && this.view[3] === bottom) return;
    this.view = [left, top, right, bottom];
    this.syncVisible();
  }

  private syncVisible() {
    if (!this.view) return;
    const [left, top, right, bottom] = this.view;
    const visible = new Set<Container>();
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const bucket = this.buckets.get(`${x}:${y}`);
      if (bucket) for (const node of bucket) visible.add(node);
    }
    for (const node of this.visible) if (!visible.has(node)) {
      node.removeFromParent();
      node.alpha = 1;
      this.fading.delete(node);
    }
    for (const node of visible) if (!this.visible.has(node)) this.world.addChild(node);
    this.visible = visible;
  }

  private sampleCover(focus: ForestFocus) {
    const x = focus.x, y = focus.y - focus.height * .55;
    const bucket = this.buckets.get(`${Math.floor(x / bucketSize)}:${Math.floor(y / bucketSize)}`);
    if (!bucket) return;
    for (const node of bucket) {
      const bounds = this.cover.get(node);
      if (bounds && node.parent === this.world && node.zIndex > focus.depth &&
          x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3]) this.covered.add(node);
    }
  }

  updateOcclusion(player: ForestFocus, target: ForestFocus | undefined, deltaMs: number) {
    if (this.disposed) return;
    if (this.cascade.root.parent === this.world) this.cascade.update(deltaMs);
    this.covered.clear();
    this.sampleCover(player);
    if (target && distance(player, target) <= 300) this.sampleCover(target);
    for (const node of this.covered) this.fading.add(node);
    const blend = 1 - Math.exp(-Math.max(0, deltaMs) / 90);
    for (const node of this.fading) {
      const goal = this.covered.has(node) ? .20 : 1;
      node.alpha += (goal - node.alpha) * blend;
      if (goal === 1 && node.alpha > .998) {
        node.alpha = 1;
        this.fading.delete(node);
      }
    }
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const node of this.nodes) node.destroy({ children: true });
    for (const texture of this.textures) texture.destroy(false);
    this.nodes.length = 0;
    this.textures.length = 0;
    this.visible.clear();
    this.buckets.clear();
    this.cover.clear();
    this.covered.clear();
    this.fading.clear();
  }
}
