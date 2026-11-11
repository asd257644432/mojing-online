import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { pointPassable } from '../../../shared/navigation';
import type { MapDef, Point } from '../../../shared/types';
import { islandTrails } from './island-ground';
import type { ForestFocus } from './wild-forest-scenery';

const atlasPath = '/assets/scenery/island-props.png';
const atlasSize = 1254;
const cellSize = 418;
const bounds = {
  cottage:[43,39,400,402], stall:[440,35,803,405], canopy:[854,80,1223,392],
  tree:[38,445,407,808], palm:[473,450,768,807], ruin:[843,445,1218,809],
  fence:[59,904,372,1193], rock:[464,927,794,1151], flowers:[889,932,1193,1157],
} as const;

type Kind = keyof typeof bounds;
type Placement = [kind: Kind, x: number, y: number, height: number, flip?: boolean];
type Range = readonly [left: number, top: number, right: number, bottom: number];
interface IslandProp { node: Container; bounds: Range; coversActors: boolean; }
const coverKinds = new Set<Kind>(['tree', 'palm', 'cottage', 'stall', 'canopy', 'ruin']);
const bucketSize = 512;
const viewMargin = 128;
const maxFocusHalfWidth = 28;
const maxFocusHalfHeight = 32;

// Building and ruin ground footprints are mirrored in the authoritative island layout.
const buildings: Placement[] = [
  ['cottage',1225,1795,190],['cottage',1390,1550,182,true],['cottage',1930,1665,198],
  ['cottage',1195,2000,186,true],['cottage',2160,1035,184],
  ['stall',1814,1665,110],['stall',2010,1785,105,true],['canopy',1545,1775,105],['canopy',2155,1820,114,true],
  ['ruin',3066,2128,271],['ruin',3895,1122,246,true],
];

const groves = [
  ['tree',960,1460,209,10],['tree',1260,1130,220,11],['tree',1470,630,230,10],['tree',2010,505,205,10],
  ['tree',1100,2200,215,12],['tree',1530,2240,175,9],['palm',2250,2430,178,8],['palm',2670,2490,172,9],
  ['palm',2590,720,188,10],['palm',2900,1175,151,9],['palm',3050,665,165,7],['tree',3260,860,182,9],
  ['tree',3550,905,160,9],['tree',3380,1370,197,12],['tree',3890,1550,197,12],['tree',3830,1890,234,12],
  ['tree',2870,1790,199,11],['tree',3180,2370,169,9],['tree',3600,2290,185,8],['palm',4250,1260,167,10],
  ['palm',4420,916,163,8],['palm',4320,1750,134,7],['tree',2420,1570,210,12],['tree',2190,1415,137,8],
] as const;

// The two breaks line up with the southwest approach and the village lane.
const villageFence = [[1270,2048,1492,1979],[1564,1957,1697,1914],[1793,1883,1949,1835]] as const;

function fenceSegments() {
  const segments: Graphics[] = [];
  for (const [x,y,endX,endY] of villageFence) {
    const dx = endX-x;
    const dy = endY-y;
    const count = Math.round(Math.hypot(dx,dy)/36);
    for (let index=0;index<count;index++) {
      const groundX = x+dx*index/count;
      const groundY = y+dy*index/count;
      const railX = dx/count;
      const railY = dy/count;
      const fence = new Graphics({label:'island:village-fence',x:groundX,y:groundY});
      fence.moveTo(0,1).lineTo(railX,railY+1).stroke({color:0x3e672d,width:3,alpha:.32})
        .moveTo(0,-9).lineTo(railX,railY-9).stroke({color:0x855d3d,width:6,cap:'round'})
        .moveTo(0,-10).lineTo(railX,railY-10).stroke({color:0xc09360,width:3.6,cap:'round'})
        .moveTo(0,0).lineTo(0,-15).stroke({color:0x795037,width:5,cap:'round'})
        .moveTo(-.8,-3).lineTo(-.8,-14.5).stroke({color:0xd1a36d,width:1.9,cap:'round'})
        .circle(-.5,-10,1.15).fill(0x6d503a);
      if (index === count-1) {
        fence.moveTo(railX,railY).lineTo(railX,railY-15).stroke({color:0x795037,width:5,cap:'round'})
          .moveTo(railX-.8,railY-3).lineTo(railX-.8,railY-14.5).stroke({color:0xd1a36d,width:1.9,cap:'round'});
      }
      fence.zIndex = groundY+railY*.5;
      fence.eventMode = 'none';
      segments.push(fence);
    }
  }
  return segments;
}

function rng(seed: number) {
  return () => {
    seed = Math.imul(seed,1664525) + 1013904223 | 0;
    return (seed >>> 0) / 0x100000000;
  };
}

function nearTrail(point: Point, distance: number) {
  return islandTrails.some(trail => trail.some((a,index) => {
    const b = trail[index+1];
    if (!b) return false;
    const dx = b.x-a.x;
    const dy = b.y-a.y;
    const ratio = Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(point.x-a.x-dx*ratio,point.y-a.y-dy*ratio) < distance;
  }));
}

function positions(map: MapDef): Placement[] {
  const result: Placement[] = [...buildings];
  const random = rng(0x9478e1d);
  const clear = (point: Point) => pointPassable(map,point) &&
    !map.npcs.some(npc => Math.hypot(point.x-npc.x,point.y-npc.y) < 89) &&
    !map.portals.some(portal => Math.hypot(point.x-portal.x,point.y-portal.y) < portal.radius) &&
    !map.monsters.some(pack => Math.hypot(point.x-pack.x,point.y-pack.y) < Math.max(44,pack.radius*.75));
  const trees: Point[] = [];
  for (const [kind,originX,originY,radius,count] of groves) {
    let placed = 0;
    for (let attempt = 0; placed < count && attempt < count*6; attempt++) {
      const angle = random()*2*Math.PI;
      const r = Math.sqrt(random())*radius;
      const point = {x:Math.round(originX+Math.cos(angle)*r),y:Math.round(originY+Math.sin(angle)*r*.7)};
      if (!clear(point) || nearTrail(point,86) || trees.some(tree => Math.hypot(tree.x-point.x,tree.y-point.y) < 67)) continue;
      result.push([kind,point.x,point.y,Math.round(143+random()*30),random()>.52]);
      trees.push(point);
      placed++;
    }
  }
  for (const [x,y,amount,dx,dy,flip] of [[1706,805,10,28,-12,0],[1883,994,9,27,-12,1],[2016,1050,7,27,-10,0]]) {
    for (let i=0;i<amount;i++) result.push(['fence',x+dx*i,y+dy*i,34+i%3,!!flip]);
  }
  for (let i=0;i<155;i++) {
    const point = {x:Math.round(480+random()*4000),y:Math.round(370+random()*2240)};
    if (!clear(point) || nearTrail(point,33)) continue;
    const rock = i % 4 === 0;
    result.push([rock?'rock':'flowers',point.x,point.y,Math.round(rock?34+random()*22:18+random()*12),random()>.48]);
  }
  return result;
}

export class IslandScenery {
  private readonly objects: Container[] = [];
  private readonly textures: Texture[] = [];
  private readonly buckets = new Map<string, IslandProp[]>();
  private readonly covered = new Set<IslandProp>();
  private readonly fading = new Set<IslandProp>();
  private visible = new Set<IslandProp>();
  private view?: Range;
  private disposed = false;

  constructor(map: MapDef, private readonly layer: Container) {
    for (const fence of fenceSegments()) this.index(fence, false);
    void Assets.load<Texture>(atlasPath).then(source => {
      if (this.disposed) return;
      if (source.width !== atlasSize || source.height !== atlasSize) throw new Error('Unexpected island scenery atlas dimensions');
      const frames = new Map<Kind,Texture>();
      for (const [kind,[x,y,x2,y2]] of Object.entries(bounds) as [Kind,(typeof bounds)[Kind]][]) {
        const column = Math.floor(x/cellSize);
        const row = Math.floor(y/cellSize);
        const left = Math.max(column*cellSize,x-3);
        const top = Math.max(row*cellSize,y-3);
        const right = Math.min((column+1)*cellSize,x2+3);
        const bottom = Math.min((row+1)*cellSize,y2+3);
        const texture = new Texture({source:source.source,frame:new Rectangle(left,top,right-left,bottom-top),label:`island:${kind}`});
        frames.set(kind,texture);
        this.textures.push(texture);
      }
      for (const [kind,x,y,height,flip] of positions(map)) {
        const sprite = new Sprite({texture:frames.get(kind)!,label:`island:${kind}`,x,y});
        sprite.anchor.set(.5,.96);
        const scale = height/sprite.texture.height;
        sprite.scale.set(flip ? -scale : scale,scale);
        if (kind === 'tree' || kind === 'palm') sprite.rotation = Math.sin(x*17+y*23)*.024;
        // Give equal-footpoint canopies a stable foreground order, including late attachments.
        sprite.zIndex = y+(coverKinds.has(kind) ? .01 : 0);
        sprite.eventMode = 'none';
        this.index(sprite, coverKinds.has(kind));
      }
      this.syncVisible();
    }).catch(error=>{ if (!this.disposed) console.warn('Could not load island scenery',error); });
  }

  private index(node: Container, coversActors: boolean) {
    // The detached node's Pixi bounds include its anchor, scale, rotation and world position.
    const { minX, minY, maxX, maxY } = node.getBounds();
    const prop: IslandProp = { node, coversActors, bounds: [minX,minY,maxX,maxY] };
    this.objects.push(node);
    // A torso that overlaps the edge of a canopy can be centered in its neighbor bucket.
    const padX = coversActors ? maxFocusHalfWidth : 0;
    const padY = coversActors ? maxFocusHalfHeight : 0;
    for (let y=Math.floor((minY-padY)/bucketSize);y<=Math.floor((maxY+padY)/bucketSize);y++) {
      for (let x=Math.floor((minX-padX)/bucketSize);x<=Math.floor((maxX+padX)/bucketSize);x++) {
        const key = `${x}:${y}`;
        const bucket = this.buckets.get(key);
        if (bucket) bucket.push(prop);
        else this.buckets.set(key,[prop]);
      }
    }
  }

  updateView(origin: Point, width: number, height: number) {
    if (this.disposed) return;
    const left = Math.floor((origin.x-viewMargin)/bucketSize), top = Math.floor((origin.y-viewMargin)/bucketSize);
    const right = Math.floor((origin.x+width+viewMargin)/bucketSize), bottom = Math.floor((origin.y+height+viewMargin)/bucketSize);
    if (this.view?.[0]===left && this.view[1]===top && this.view[2]===right && this.view[3]===bottom) return;
    this.view = [left,top,right,bottom];
    this.syncVisible();
  }

  private syncVisible() {
    if (!this.view) return;
    const [left,top,right,bottom] = this.view;
    const visible = new Set<IslandProp>();
    for (let y=top;y<=bottom;y++) for (let x=left;x<=right;x++) {
      const bucket = this.buckets.get(`${x}:${y}`);
      if (bucket) for (const prop of bucket) visible.add(prop);
    }
    for (const prop of this.visible) if (!visible.has(prop)) {
      prop.node.removeFromParent();
      prop.node.alpha = 1;
      this.fading.delete(prop);
    }
    for (const prop of visible) if (!this.visible.has(prop)) this.layer.addChild(prop.node);
    this.visible = visible;
  }

  private sampleCover(focus: ForestFocus) {
    const x = focus.x, y = focus.y-focus.height*.55;
    const bucket = this.buckets.get(`${Math.floor(x/bucketSize)}:${Math.floor(y/bucketSize)}`);
    if (!bucket) return;
    const halfWidth = Math.min(maxFocusHalfWidth,focus.height*.4);
    const halfHeight = Math.min(maxFocusHalfHeight,focus.height*.35);
    for (const prop of bucket) {
      if (!prop.coversActors || prop.node.zIndex<=focus.depth || !this.visible.has(prop)) continue;
      const [left,top,right,bottom] = prop.bounds;
      if (x+halfWidth>=left && x-halfWidth<=right && y+halfHeight>=top && y-halfHeight<=bottom) this.covered.add(prop);
    }
  }

  updateOcclusion(player: ForestFocus, target: ForestFocus | undefined, deltaMs: number) {
    if (this.disposed) return;
    this.covered.clear();
    this.sampleCover(player);
    if (target && Math.hypot(target.x-player.x,target.y-player.y)<=300) this.sampleCover(target);
    for (const prop of this.covered) this.fading.add(prop);
    if (!this.fading.size) return;
    const blend = 1-Math.exp(-Math.max(0,deltaMs)/90);
    for (const prop of this.fading) {
      const goal = this.covered.has(prop) ? .22 : 1;
      prop.node.alpha += (goal-prop.node.alpha)*blend;
      if (goal===1 && prop.node.alpha>.998) {
        prop.node.alpha = 1;
        this.fading.delete(prop);
      }
    }
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const object of this.objects) object.destroy();
    for (const texture of this.textures) texture.destroy(false);
    this.objects.length = 0;
    this.textures.length = 0;
    this.buckets.clear();
    this.visible.clear();
    this.covered.clear();
    this.fading.clear();
  }
}
