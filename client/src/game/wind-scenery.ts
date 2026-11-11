import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { pointPassable } from '../../../shared/navigation';
import type { MapDef, Point } from '../../../shared/types';
import { WIND_VALLEY } from '../../../shared/wind-valley';

const foliagePath = '/assets/scenery/island-props.png';
const landmarksPath = '/assets/scenery/wind-props.png';
const foliageFrames = {
  tree:[38,445,407,808],
  flowers:[889,932,1193,1157],
} as const;
const landmarkFrames = {
  mill:[30,80,378,561],
  cliff:[388,185,829,500],
  cave:[830,200,1254,522],
  boat:[10,685,393,1160],
  dock:[440,681,758,1162],
  rock:[822,777,1254,1096],
} as const;
const millFoot = {x:205,y:536};
const millSpindle = {x:203,y:302};
const caveFoot = {x:1040,y:496};

type Foliage = keyof typeof foliageFrames | 'rock';
const groves = [
  [895,1748,160,7],[1750,1580,190,10],[2460,1575,178,8],[3315,1690,245,12],
  [1320,2490,231,10],[2110,3270,230,11],[915,3350,212,8],[2815,3560,211,11],
  [2975,2170,230,10],[3720,2250,200,9],[4230,1780,167,7],[4840,1560,229,12],
  [6340,1800,182,8],[6630,2500,210,11],[6390,3030,204,8],[5680,3230,195,10],
  [3890,3360,230,9],[3310,4270,212,9],[5185,4140,240,11],[6120,3710,210,10],
] as const;

function random(seed:number) {
  return () => {
    seed = Math.imul(seed,1664525)+1013904223|0;
    return (seed>>>0)/0x100000000;
  };
}

function inField(point:Point,vertices:readonly Point[]) {
  let inside = false;
  for (let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
    const a = vertices[i], b = vertices[j];
    if ((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
  }
  return inside;
}

function besideRoad(point:Point,padding:number) {
  return WIND_VALLEY.roads.some(({points,width})=>points.some((a,index)=>{
    const b = points[index+1];
    if (!b) return false;
    const dx = b.x-a.x, dy = b.y-a.y;
    const t = Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy)<width*.5+padding;
  }));
}

function placeFoliage(map:MapDef) {
  const rng = random(0x59ea147);
  const output: {kind:Foliage;x:number;y:number;height:number;flip:boolean}[] = [];
  const safe = (point:Point,padding:number) => pointPassable(map,point) &&
    !besideRoad(point,padding) &&
    !WIND_VALLEY.fields.some(field=>inField(point,field)) &&
    !map.npcs.some(npc=>Math.hypot(point.x-npc.x,point.y-npc.y)<88) &&
    !map.portals.some(portal=>Math.hypot(point.x-portal.x,point.y-portal.y)<portal.radius+padding);
  const treePoints:Point[] = [];
  for (const [x,y,radius,count] of groves) {
    let planted = 0;
    for (let attempt=0;attempt<count*6 && planted<count;attempt++) {
      const angle = rng()*Math.PI*2, length = Math.sqrt(rng())*radius;
      const point = {x:Math.round(x+Math.cos(angle)*length),y:Math.round(y+Math.sin(angle)*length*.7)};
      if (!safe(point,56) || treePoints.some(tree=>Math.hypot(point.x-tree.x,point.y-tree.y)<77) ||
        map.monsters.some(pack=>Math.hypot(point.x-pack.x,point.y-pack.y)<Math.min(120,pack.radius*.66))) continue;
      treePoints.push(point);
      output.push({kind:'tree',...point,height:142+rng()*46,flip:rng()>.53});
      planted++;
    }
  }
  for (let i=0;i<200;i++) {
    const point = {x:Math.round(540+rng()*6550),y:Math.round(1390+rng()*3590)};
    if (!safe(point,16)) continue;
    const rock = i%4===0;
    output.push({kind:rock?'rock':'flowers',...point,height:rock?32+rng()*25:16+rng()*12,flip:rng()>.50});
  }
  return output;
}

function windmillRotor() {
  const axis = new Container({label:'wind:mill-rotor-axis'});
  axis.scale.x = .86;
  const spin = new Container({label:'wind:mill-rotor'});
  for (let i=0;i<4;i++) {
    const blade = new Graphics();
    blade.rotation = i*Math.PI/2;
    blade.moveTo(0,9).lineTo(0,-96).stroke({color:0x6a4b37,width:6,cap:'round'})
      .poly([-4,-23,-8,-91,20,-91,23,-28])
      .fill(0xd9c8a0).stroke({color:0x8d6749,width:2.1,join:'round'})
      .poly([-4,-27,-8,-91,5,-92,9,-29]).fill(0xecdbb6)
      .moveTo(-4,-31).lineTo(-8,-91).moveTo(9,-28).lineTo(6,-90)
      .moveTo(-7,-70).lineTo(21,-68).moveTo(-5,-50).lineTo(22,-48)
      .stroke({color:0xaa865e,width:1.25,alpha:.77});
    spin.addChild(blade);
  }
  const hub = new Graphics().circle(0,0,9.8).fill(0x916847).stroke({color:0x684a38,width:2})
    .circle(-1,-1,4.2).fill(0xc7a170);
  axis.addChild(spin,hub);
  return {axis,spin};
}

function cliffFaces(map:MapDef) {
  const rows: {x:number;y:number;height:number;flip:boolean}[] = [];
  const rng = random(0x37650);
  const {cave} = WIND_VALLEY.landmarks;
  for (let x=450;x<6900;x+=170+Math.round(rng()*43)) {
    if (Math.abs(x-cave.x)<190) continue;
    let y = 810;
    while (y<1680 && !pointPassable(map,{x,y})) y+=15;
    if (y>=1680) continue;
    rows.push({x,y:y-27,height:275+rng()*65,flip:rng()>.51});
  }
  for (const side of ['west','east'] as const) {
    for (let y=1470;y<3650;y+=150+Math.round(rng()*35)) {
      let x = side==='west' ? 1300 : 6000;
      const direction = side==='west' ? -1 : 1;
      while (x>150 && x<map.width-150 && pointPassable(map,{x,y})) x+=direction*15;
      if (pointPassable(map,{x,y})) continue;
      rows.push({x:x+direction*175,y,height:285+rng()*45,flip:side==='west'});
    }
  }
  return rows;
}

type Frame = readonly [left:number,top:number,right:number,bottom:number];

export class WindScenery {
  private readonly objects: Container[] = [];
  private readonly textures: Texture[] = [];
  private readonly placements: { object:Container; layer:Container; left:number; top:number; right:number; bottom:number }[] = [];
  private viewportKey = '';
  private readonly spin: Container;
  private readonly boat: Container;
  private readonly boatY: number;
  private disposed = false;

  constructor(map:MapDef,world:Container,base:Container) {
    const {windmill,cave,dock} = WIND_VALLEY.landmarks;
    const rotor = windmillRotor();
    this.spin = rotor.spin;
    const mill = this.place(world,windmill,windmill.y,'wind:mill');
    rotor.axis.visible = false;
    mill.addChild(rotor.axis);
    const entrance = this.place(world,{x:cave.x,y:cave.y-15},cave.y-15,'wind:cave');
    const pier = this.place(base,{x:dock.x+17,y:dock.y+231},dock.y,'wind:dock');
    this.boatY = dock.y+223;
    this.boat = this.place(world,{x:dock.x+188,y:this.boatY},this.boatY,'wind:boat');

    void Promise.all([Assets.load<Texture>(landmarksPath),Assets.load<Texture>(foliagePath)]).then(([landmarks,foliage])=>{
      if (this.disposed) return;
      if ([landmarks,foliage].some(sheet=>sheet.width!==1254 || sheet.height!==1254)) {
        throw new Error('Unexpected wind valley scenery atlas dimensions');
      }
      const millTexture = this.crop(landmarks,landmarkFrames.mill,'mill');
      const millArt = this.sprite(millTexture,246,.50,.95,'mill-tower');
      millArt.anchor.set((millFoot.x-landmarkFrames.mill[0])/millTexture.width,(millFoot.y-landmarkFrames.mill[1])/millTexture.height);
      const scale = 246/millTexture.height;
      rotor.axis.position.set((millSpindle.x-millFoot.x)*scale,(millSpindle.y-millFoot.y)*scale);
      mill.addChildAt(millArt,0);
      rotor.axis.visible = true;

      const caveTexture = this.crop(landmarks,landmarkFrames.cave,'cave');
      entrance.addChild(this.sprite(caveTexture,250,(caveFoot.x-landmarkFrames.cave[0])/caveTexture.width,
        (caveFoot.y-landmarkFrames.cave[1])/caveTexture.height,'cave-mouth'));
      const pierArt = this.sprite(this.crop(landmarks,landmarkFrames.dock,'dock'),314,.5,.99,'dock-deck');
      pierArt.width = 170;
      pier.addChild(pierArt);
      this.boat.addChild(this.sprite(this.crop(landmarks,landmarkFrames.boat,'boat'),247,.51,.94,'dock-boat'));

      const wallTexture = this.crop(landmarks,landmarkFrames.cliff,'cliff');
      for (const row of cliffFaces(map)) {
        this.placeSprite(world,wallTexture,row.x,row.y,row.height,row.flip,'north-cliff',.987);
      }
      const frames:Record<Foliage,Texture> = {
        tree:this.crop(foliage,foliageFrames.tree,'tree'),
        flowers:this.crop(foliage,foliageFrames.flowers,'flowers'),
        rock:this.crop(landmarks,landmarkFrames.rock,'rock'),
      };
      for (const {kind,x,y,height,flip} of placeFoliage(map)) {
        const sprite = this.placeSprite(world,frames[kind],x,y,height,flip,kind);
        if (kind==='tree') sprite.rotation = Math.sin(x*11+y*17)*.022;
      }
      for (const object of this.objects) {
        const bounds = object.getLocalBounds();
        const layer = object.parent!;
        const x1 = bounds.minX*object.scale.x, x2 = bounds.maxX*object.scale.x;
        const y1 = bounds.minY*object.scale.y, y2 = bounds.maxY*object.scale.y;
        this.placements.push({object,layer,left:object.x+Math.min(x1,x2),right:object.x+Math.max(x1,x2),
          top:object.y+Math.min(y1,y2),bottom:object.y+Math.max(y1,y2)});
        layer.removeChild(object);
      }
      this.viewportKey = '';
    }).catch(error=>console.warn('Could not load wind valley scenery',error));
  }

  private crop(sheet:Texture,[left,top,right,bottom]:Frame,kind:string) {
    const texture = new Texture({source:sheet.source,frame:new Rectangle(left,top,right-left,bottom-top),label:`wind:${kind}`});
    this.textures.push(texture);
    return texture;
  }

  private sprite(texture:Texture,height:number,ax:number,ay:number,label:string) {
    const sprite = new Sprite({texture,label:`wind:${label}`,eventMode:'none'});
    sprite.anchor.set(ax,ay);
    sprite.scale.set(height/texture.height);
    return sprite;
  }

  private placeSprite(layer:Container,texture:Texture,x:number,y:number,height:number,flip:boolean,label:string,anchorY=.96) {
    const sprite = this.sprite(texture,height,.50,anchorY,label);
    sprite.position.set(x,y);
    if (flip) sprite.scale.x *= -1;
    sprite.zIndex = y;
    this.objects.push(sprite);
    layer.addChild(sprite);
    return sprite;
  }

  private place(layer:Container,point:Point,depth:number,label:string) {
    const root = new Container({x:point.x,y:point.y,label,eventMode:'none'});
    root.zIndex = depth;
    this.objects.push(root);
    layer.addChild(root);
    return root;
  }

  updateView(origin:Point,width:number,height:number) {
    const left = Math.floor(origin.x/256)*256-256, top = Math.floor(origin.y/256)*256-256;
    const right = Math.ceil((origin.x+width)/256)*256+256, bottom = Math.ceil((origin.y+height)/256)*256+256;
    const key = `${left}:${top}:${right}:${bottom}`;
    if (key!==this.viewportKey) {
      this.viewportKey = key;
      for (const placement of this.placements) {
        const {object,layer} = placement;
        const visible = placement.right>=left && placement.left<=right && placement.bottom>=top && placement.top<=bottom;
        if (visible && !object.parent) layer.addChild(object);
        else if (!visible && object.parent) layer.removeChild(object);
      }
    }
    const time = performance.now()/1000;
    const visible = ({x,y}:Point) => x>=origin.x-230 && x<=origin.x+width+230 &&
      y>=origin.y-60 && y<=origin.y+height+260;
    if (visible(WIND_VALLEY.landmarks.windmill)) this.spin.rotation = (time*.43)%(Math.PI*2);
    if (visible(this.boat.position)) this.boat.y = this.boatY+Math.sin(time*1.26)*2.4;
  }

  destroy() {
    this.disposed = true;
    for (const object of this.objects) object.destroy({children:true});
    for (const texture of this.textures) texture.destroy(false);
    this.objects.length = 0;
    this.textures.length = 0;
    this.placements.length = 0;
  }
}
