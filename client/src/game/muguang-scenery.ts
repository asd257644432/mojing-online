import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { pointPassable } from '../../../shared/navigation';
import type { MapDef, Point } from '../../../shared/types';
import { MUGUANG_PLAIN } from '../../../shared/muguang-plain';

type Wall = (typeof MUGUANG_PLAIN.walls)[number];
type Gate = (typeof MUGUANG_PLAIN.gates)[number];
type Building = (typeof MUGUANG_PLAIN.buildings)[number];
type Footprint = readonly [frontStart:Point,frontEnd:Point,backEnd:Point,backStart:Point];
type ArtKind = 'townhall' | 'warehouse' | 'forge' | 'marketStall' | 'fountain' | 'tree' | 'palm' | 'hedge' | 'signpost';
type Frame = readonly [left:number,top:number,right:number,bottom:number,footX:number,footY:number];

interface Art {
  texture: Texture;
  anchorX: number;
  anchorY: number;
  width: number;
  aboveFoot: number;
}

interface Ornament extends Point {
  kind: 'tree' | 'palm' | 'hedge';
  height: number;
  flip?: boolean;
}

const buildingArt:Partial<Record<Building['kind'],ArtKind>> = {
  hall:'townhall', warehouse:'warehouse', forge:'forge', shop:'marketStall', auction:'marketStall',
  guild:'townhall', magic:'warehouse', fountain:'fountain', board:'signpost',
};
const atlasPath = '/assets/scenery/muguang-props.png';
const atlasSize = 1254;
const framePadding = 3;
const frames:Record<ArtKind,Frame> = {
  townhall:[48,33,398,394,218,381], warehouse:[467,52,821,393,636,375],
  forge:[882,47,1220,391,1045,374], marketStall:[48,457,359,762,201,744],
  fountain:[458,460,796,763,628,741], tree:[863,447,1225,769,1044,755],
  palm:[62,828,358,1180,183,1166], hedge:[432,885,807,1114,621,1104],
  signpost:[917,824,1175,1178,1036,1164],
};
const fountainSpout = {x:629,y:530};
const groves = [
  [.190,.238,186,7,0],[.246,.290,208,8,0],[.192,.405,214,8,1],[.251,.443,225,8,0],
  [.192,.535,202,7,1],[.221,.666,204,7,1],[.299,.565,220,8,0],[.367,.636,231,9,0],
  [.286,.872,239,8,1],[.358,.895,255,9,1],[.450,.805,215,8,0],[.483,.918,234,8,1],
  [.357,.194,226,7,0],[.448,.230,260,8,0],[.527,.190,214,7,0],[.626,.203,223,9,0],
  [.713,.230,233,8,0],[.807,.256,237,9,0],[.856,.344,193,7,0],[.840,.430,206,7,0],
  [.880,.617,224,8,0],[.805,.774,233,8,0],[.701,.842,234,8,0],[.617,.799,244,9,0],
] as const;

const masonry = [0xcbb895,0xd3c19c,0xc7b390,0xdac8a0,0xcfbb96] as const;
const mortar = 0xad9b7d;
const shadedStone = 0xa8987d;
const coping = 0xe0cda5;

function along(a:Point,b:Point,t:number):Point {
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}

function face(g:Graphics,a:Point,b:Point,bottom:number,top:number,color:number) {
  g.poly([a.x,a.y-bottom,b.x,b.y-bottom,b.x,b.y-top,a.x,a.y-top]).fill(color);
}

function roof(g:Graphics,points:readonly Point[],rise:number,color:number) {
  g.poly(points.flatMap(({x,y})=>[x,y-rise])).fill(color);
}

function brickwork(g:Graphics,a:Point,b:Point,start:number,end:number,height:number) {
  face(g,a,b,0,height,mortar);
  const courseCount = Math.ceil(height/23);
  const depth = height/courseCount;
  const stride = 43;
  for (let course=0;course<courseCount;course++) {
    const offset = (course%2)*stride/2;
    const bottom = course*depth;
    for (let brick=Math.floor((start+offset)/stride);brick*stride-offset<end;brick++) {
      const left = brick*stride-offset;
      const right = left+stride;
      const from = Math.max(start,left+1.1);
      const to = Math.min(end,right-.5);
      if (to<=from) continue;
      const p = along(a,b,(from-start)/(end-start));
      const q = along(a,b,(to-start)/(end-start));
      const color = masonry[(brick*7+course*3)%masonry.length];
      face(g,p,q,bottom+1.2,bottom+depth,color);
      if (course===0 && brick%4===1) {
        const mid = along(p,q,.46);
        g.poly([p.x,p.y-2,mid.x,mid.y-1,q.x,q.y-3,mid.x,mid.y-6,p.x,p.y-4]).fill({color:0x627246,alpha:.62});
      }
    }
  }
}

function section(g:Graphics,[frontStart,frontEnd,backEnd,backStart]:Footprint,start:number,end:number,
  height:number,startCap:number,endCap:number) {
  if (startCap<height) face(g,backStart,frontStart,startCap,height,shadedStone);
  if (endCap<height) face(g,frontEnd,backEnd,endCap,height,shadedStone);
  brickwork(g,frontStart,frontEnd,start,end,height);
  roof(g,[frontStart,frontEnd,backEnd,backStart],height,coping);
  roof(g,[backStart,backEnd,along(backEnd,frontEnd,.10),along(backStart,frontStart,.10)],height,0xbdac89);
  face(g,frontStart,frontEnd,height-5,height,0xd8c49b);

  const spacing = 47;
  for (let post=Math.floor(start/spacing);post*spacing<end;post++) {
    const left = Math.max(start,post*spacing+5);
    const right = Math.min(end,post*spacing+30);
    if (right<=left) continue;
    const t0 = (left-start)/(end-start), t1 = (right-start)/(end-start);
    const a = along(frontStart,frontEnd,t0), b = along(frontStart,frontEnd,t1);
    const c = along(b,along(backStart,backEnd,t1),.43), d = along(a,along(backStart,backEnd,t0),.43);
    face(g,d,a,height,height+17,shadedStone);
    face(g,b,c,height,height+17,shadedStone);
    face(g,a,b,height,height+17,0xc9b48b);
    roof(g,[a,b,c,d],height+17,0xe7d6af);
  }
}

function wallSegments(wall:Wall,walls:readonly Wall[],gates:readonly Gate[]) {
  const length = Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
  const same = (a:Point,b:Point)=>a.x===b.x && a.y===b.y;
  const gateAt = (point:Point)=>gates.find(gate=>same(gate.start,point) || same(gate.end,point));
  const startGate = gateAt(wall.start), endGate = gateAt(wall.end);
  const joined = (point:Point)=>walls.some(other=>other!==wall && (same(other.start,point) || same(other.end,point)));
  const startJoint = joined(wall.start), endJoint = joined(wall.end);
  const pierWidth = Math.min(53,length/3);
  const startPier = startGate ? pierWidth : 0;
  const endPier = endGate ? length-pierWidth : length;
  const bayCount = Math.max(1,Math.ceil((endPier-startPier)/85));
  const cuts = Array.from({length:bayCount+1},(_,i)=>startPier+(endPier-startPier)*i/bayCount);
  if (startGate) cuts.unshift(0);
  if (endGate) cuts.push(length);

  const [a,b,c,d] = wall.footprint;
  const southSide = a.y+b.y>=c.y+d.y;
  const [frontStart,frontEnd,backEnd,backStart] = southSide ? [a,b,c,d] : [d,c,b,a];
  const output:Graphics[] = [];
  for (let index=0;index<cuts.length-1;index++) {
    const start = cuts[index], end = cuts[index+1];
    const pier = (start===0 && startGate) || (end===length && endGate);
    const height = pier ? Math.max(pier.height,wall.height+25) : wall.height;
    const first = Math.max(0,start-(index===0 ? 0 : .65))/length;
    const last = Math.min(length,end+(index===cuts.length-2 ? 0 : .65))/length;
    const quad:Footprint = [along(frontStart,frontEnd,first),along(frontStart,frontEnd,last),
      along(backStart,backEnd,last),along(backStart,backEnd,first)];
    const graphic = new Graphics({label:`muguang:${pier ? 'gate-pier' : 'wall'}:${wall.id}:${index}`,eventMode:'none'});
    graphic.zIndex = (quad[0].y+quad[1].y)/2;
    const startCap = index===0 && !startJoint ? 0 : wall.height;
    const endCap = index===cuts.length-2 && !endJoint ? 0 : wall.height;
    section(graphic,quad,first*length,last*length,height,startCap,endCap);
    output.push(graphic);
  }
  return output;
}

function dock(deck:readonly Point[]) {
  const g = new Graphics({label:'muguang:dock-deck',eventMode:'none'});
  g.zIndex = -1;
  const [a,b,c,d] = deck;
  const distance = (p:Point,q:Point)=>Math.hypot(q.x-p.x,q.y-p.y);
  const [startLeft,startRight,endRight,endLeft] = distance(a,b)<=distance(b,c) ? [a,b,c,d] : [b,c,d,a];
  const length = (distance(startLeft,endLeft)+distance(startRight,endRight))/2;
  const plankCount = Math.ceil(length/18);
  const colors = [0x9e744d,0xab8056,0xb48b5d,0xa57b54,0xb08a63] as const;
  for (let index=0;index<deck.length;index++) {
    const p = deck[index], q = deck[(index+1)%deck.length];
    face(g,p,q,-10,0,0x654b35);
  }
  roof(g,deck,0,0x7e5b40);
  for (let index=0;index<plankCount;index++) {
    const t = index/plankCount, next = (index+.95)/plankCount;
    const p = along(startLeft,endLeft,t), q = along(startRight,endRight,t);
    const r = along(startRight,endRight,next), s = along(startLeft,endLeft,next);
    roof(g,[p,q,r,s],0,colors[(index*3)%colors.length]);
    g.moveTo(p.x,p.y).lineTo(q.x,q.y).stroke({color:0xcc9f6a,alpha:.5,width:1.1});
  }
  for (const fraction of [.12,.49,.88]) {
    const left = along(startLeft,endLeft,fraction), right = along(startRight,endRight,fraction);
    for (const post of [along(left,right,.045),along(left,right,.955)]) {
      g.moveTo(post.x,post.y+12).lineTo(post.x,post.y-22).stroke({color:0x6b4931,width:10,cap:'round'})
        .moveTo(post.x-2,post.y+2).lineTo(post.x-2,post.y-19).stroke({color:0xaf8051,width:2,cap:'round'})
        .ellipse(post.x,post.y-22,5,2.8).fill(0xc59665);
    }
  }
  return g;
}

interface Placement {
  object: Container;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function makeSprite(art:Art,kind:ArtKind,height:number,width?:number) {
  const sprite = new Sprite({texture:art.texture,label:`muguang:${kind}`,eventMode:'none'});
  sprite.anchor.set(art.anchorX,art.anchorY);
  const scale = height/art.aboveFoot;
  sprite.scale.set(width===undefined ? scale : width/art.width,scale);
  return sprite;
}

function nearRoad(point:Point,padding:number) {
  return MUGUANG_PLAIN.roads.some(({width,points})=>points.some((a,index)=>{
    const b = points[index+1];
    if (!b) return false;
    const dx = b.x-a.x, dy = b.y-a.y;
    const position = Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(point.x-a.x-dx*position,point.y-a.y-dy*position)<width/2+padding;
  }));
}

function foliage(map:MapDef) {
  const points:Ornament[] = [];
  const safe = (point:Point,padding:number) => pointPassable(map,point) && !nearRoad(point,padding) &&
    !map.npcs.some(npc=>Math.hypot(npc.x-point.x,npc.y-point.y)<padding+60) &&
    !map.portals.some(portal=>Math.hypot(portal.x-point.x,portal.y-point.y)<portal.radius+padding) &&
    !map.monsters.some(pack=>Math.hypot(pack.x-point.x,pack.y-point.y)<Math.min(pack.radius,120)+padding);
  let seed = 0x1cc3a7;
  const random = () => {
    seed = Math.imul(seed,1664525)+1013904223|0;
    return (seed>>>0)/0x100000000;
  };

  for (const [cx,cy,radius,count,palms] of groves) {
    let planted = 0;
    for (let attempt=0;attempt<count*7 && planted<count;attempt++) {
      const phase = random()*Math.PI*2;
      const reach = Math.sqrt(random())*radius;
      const point = {x:cx*map.width+Math.cos(phase)*reach,y:cy*map.height+Math.sin(phase)*reach*.72};
      if (!safe(point,52) || points.some(other=>Math.hypot(other.x-point.x,other.y-point.y)<76)) continue;
      points.push({...point,kind:palms ? 'palm' : 'tree',height:137+random()*47,flip:random()>.5});
      planted++;
    }
  }
  for (const building of MUGUANG_PLAIN.buildings) {
    if (!buildingArt[building.kind] || building.kind==='fountain' || building.kind==='board') continue;
    for (const side of [-1,1]) {
      const point = {x:building.x+side*(building.width*.48+44),y:building.y+33};
      if (safe(point,20)) points.push({...point,kind:'hedge',height:31+random()*14,flip:side<0});
    }
  }
  return points;
}

export class MuguangScenery {
  private readonly placements: Placement[] = [];
  private readonly textures: Texture[] = [];
  private fountain?: { basin:Container; spray:Graphics[]; spout:Point };
  private viewportKey = '';
  private disposed = false;

  constructor(map:MapDef,private readonly world:Container) {
    for (const wall of MUGUANG_PLAIN.walls) {
      for (const segment of wallSegments(wall,MUGUANG_PLAIN.walls,MUGUANG_PLAIN.gates)) this.place(segment);
    }
    this.place(dock(MUGUANG_PLAIN.dockDeck));
    void this.loadArt(map).catch(error=>console.warn('Could not load Muguang Plain scenery',error));
  }

  private async loadArt(map:MapDef) {
    const sheet = await Assets.load<Texture>(atlasPath);
    if (this.disposed) return;
    if (sheet.width!==atlasSize || sheet.height!==atlasSize) throw new Error('Unexpected Muguang Plain scenery atlas dimensions');
    const art = Object.fromEntries(Object.entries(frames).map(([kind,[x,y,right,bottom,footX,footY]])=>{
      const left = x-framePadding, top = y-framePadding;
      const frame = new Rectangle(left,top,right-left+framePadding,bottom-top+framePadding);
      const texture = new Texture({source:sheet.source,frame,label:`muguang:${kind}`});
      this.textures.push(texture);
      return [kind,{texture,anchorX:(footX-left)/frame.width,anchorY:(footY-top)/frame.height,width:right-x,aboveFoot:footY-y}];
    })) as Record<ArtKind,Art>;

    for (const building of MUGUANG_PLAIN.buildings) {
      const kind = buildingArt[building.kind];
      if (!kind) continue;
      const depth = building.footprint.reduce((south,point)=>Math.max(south,point.y),building.y);
      const sprite = makeSprite(art[kind],kind,building.height+depth-building.y,building.width);
      sprite.position.set(building.x,depth);
      sprite.zIndex = depth;
      if (kind==='fountain') this.placeFountain(sprite);
      else this.place(sprite);
    }

    for (const {kind,x,y,height,flip} of foliage(map)) {
      const sprite = makeSprite(art[kind],kind,height);
      sprite.position.set(x,y);
      sprite.zIndex = y;
      if (flip) sprite.scale.x *= -1;
      this.place(sprite);
    }
  }

  private placeFountain(sprite:Sprite) {
    const [,,,,footX,footY] = frames.fountain;
    const basin = new Container({label:'muguang:fountain-basin',x:sprite.x,y:sprite.y,eventMode:'none'});
    basin.zIndex = sprite.zIndex;
    sprite.position.set(0);
    basin.addChild(sprite);
    const spout = {x:(fountainSpout.x-footX)*sprite.scale.x,y:(fountainSpout.y-footY)*sprite.scale.y};
    const spray = Array.from({length:9},(_,index)=>{
      const drop = new Graphics({label:'muguang:fountain-droplet',x:spout.x,y:spout.y,eventMode:'none'});
      drop.ellipse(0,0,index%3===0 ? 1.35 : .95,1.8).fill(index%3===0 ? 0xf0faff : 0xb8edfb);
      basin.addChild(drop);
      return drop;
    });
    this.fountain = {basin,spray,spout};
    this.place(basin);
  }

  private place(object:Container) {
    const bounds = object.getLocalBounds();
    const x1 = bounds.minX*object.scale.x, x2 = bounds.maxX*object.scale.x;
    const y1 = bounds.minY*object.scale.y, y2 = bounds.maxY*object.scale.y;
    this.placements.push({object,left:object.x+Math.min(x1,x2),right:object.x+Math.max(x1,x2),
      top:object.y+Math.min(y1,y2),bottom:object.y+Math.max(y1,y2)});
    this.viewportKey = '';
  }

  updateView(origin:Point,width:number,height:number) {
    if (this.disposed) return;
    const left = Math.floor(origin.x/256)*256-256, top = Math.floor(origin.y/256)*256-256;
    const right = Math.ceil((origin.x+width)/256)*256+256, bottom = Math.ceil((origin.y+height)/256)*256+256;
    const key = `${left}:${top}:${right}:${bottom}`;
    if (key!==this.viewportKey) {
      this.viewportKey = key;
      for (const {object,left:x,top:y,right:endX,bottom:endY} of this.placements) {
        const visible = endX>=left && x<=right && endY>=top && y<=bottom;
        if (visible && !object.parent) this.world.addChild(object);
        else if (!visible && object.parent) this.world.removeChild(object);
      }
    }
    if (this.fountain?.basin.parent) {
      const {spray,spout} = this.fountain;
      const time = performance.now()/1000;
      for (let index=0;index<spray.length;index++) {
        const arc = (time*.92+index/spray.length)%1;
        const spread = (index%5-2)*8;
        spray[index].position.set(spout.x+arc*spread,spout.y-56*arc*(1-arc)+arc*11);
        spray[index].alpha = .68*(1-arc);
      }
    }
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const {object} of this.placements) object.destroy({children:true});
    for (const texture of this.textures) texture.destroy(false);
    this.placements.length = 0;
    this.textures.length = 0;
    this.fountain = undefined;
  }
}
