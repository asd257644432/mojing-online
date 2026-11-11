import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Point } from '../../../shared/types';
import type { Rig } from './rigs';

type BeePart = 'thorax' | 'head' | 'headRear' | 'abdomen' | 'stinger' | 'wing' | 'hindWing' | 'leg' | 'antenna';
const atlasPath = '/assets/monsters/bee-rig.png';
const cellSize = 418;

type Region = readonly [left:number,top:number,right:number,bottom:number,pivotX:number,pivotY:number,width:number,height:number];
const regions:Record<BeePart,Region> = {
  head:[89,84,358,333,130,284,14.5,14],
  thorax:[454,70,774,345,613,211,17.5,16.5],
  abdomen:[865,73,1225,335,931,207,21,13.5],
  wing:[47,449,407,783,68,762,24,21],
  hindWing:[492,542,764,758,516,742,19,14.5],
  leg:[900,470,1171,789,936,509,7.7,10.1],
  antenna:[84,915,371,1164,111,1136,8.1,7.8],
  stinger:[466,953,791,1109,500,1034,10.4,5.2],
  headRear:[895,889,1188,1167,957,1126,16.4,16.3],
};

const sizes = {'poison-bee':1,'frenzy-bee':1.04,'guard-bee':1.13,'evil-bee-queen':1.50} as const;
type BeeDefinition = keyof typeof sizes;

export function isBeeDefinition(id:string):id is BeeDefinition {
  return Object.hasOwn(sizes,id);
}

interface Cutout {
  texture: Texture;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

interface BeeArt {
  pieces: Record<BeePart,Cutout>;
  head: Point;
  abdomen: Point;
  stinger: Point;
  hover: number;
  height: number;
  hitHalfWidth: number;
  scale: number;
}

const tau = Math.PI*2;
const clamp = (value:number,min:number,max:number) => Math.min(max,Math.max(min,value));
const mix = (from:number,to:number,t:number) => from+(to-from)*t;

function ease(value:number,start:number,end:number) {
  const t = clamp((value-start)/(end-start),0,1);
  return t*t*(3-2*t);
}

function shortestAngle(angle:number) {
  return ((angle+Math.PI)%tau+tau)%tau-Math.PI;
}

function joint(parent:Container,label:string,x=0,y=0) {
  const root = new Container({label,x,y});
  parent.addChild(root);
  return root;
}

function piece(parent:Container,cutout:Cutout,label:BeePart) {
  const sprite = new Sprite({texture:cutout.texture,label:`bee:${label}`});
  sprite.anchor.set(cutout.anchorX,cutout.anchorY);
  sprite.scale.set(cutout.width/cutout.texture.width,cutout.height/cutout.texture.height);
  parent.addChild(sprite);
  return sprite;
}

export class BeeRigAtlas {
  private readonly pieces: BeeArt['pieces'];

  static async load() {
    const sheet = await Assets.load<Texture>(atlasPath);
    if (sheet.width!==cellSize*3 || sheet.height!==cellSize*3) throw new Error('Bee atlas must be 1254×1254');
    return new BeeRigAtlas(sheet);
  }

  private constructor(sheet:Texture) {
    this.pieces = Object.fromEntries(Object.entries(regions).map(([part,[left,top,right,bottom,px,py,width,height]])=>{
      const column = Math.floor(left/cellSize), row = Math.floor(top/cellSize);
      const x = Math.max(column*cellSize,left-3), y = Math.max(row*cellSize,top-3);
      const frame = new Rectangle(x,y,Math.min((column+1)*cellSize,right+3)-x,Math.min((row+1)*cellSize,bottom+3)-y);
      const texture = new Texture({source:sheet.source,frame,label:`bee:${part}`});
      return [part,{texture,width,height,anchorX:(px-x)/frame.width,anchorY:(py-y)/frame.height}];
    })) as BeeArt['pieces'];
  }

  create(definitionId?:string) {
    if (!definitionId || !isBeeDefinition(definitionId)) return;
    return createBeeRig({pieces:this.pieces,head:{x:6.7,y:2.6},abdomen:{x:-5.3,y:-1.1},
      stinger:{x:-16,y:3.3},hover:13.5,height:49,hitHalfWidth:35,scale:sizes[definitionId]});
  }

  destroy() {
    for (const {texture} of Object.values(this.pieces)) texture.destroy(false);
  }
}

export function createBeeRig(art:BeeArt): Rig {
  const root = new Container({label:'bee-articulated-rig'});
  root.scale.set(art.scale);
  const flight = joint(root,'bee:flight',0,-art.hover);
  const body = joint(flight,'bee:body');
  body.sortableChildren = true;

  const tail = joint(body,'bee:abdomen-joint',art.abdomen.x,art.abdomen.y);
  const abdomen = piece(tail,art.pieces.abdomen,'abdomen');
  const needle = joint(tail,'bee:stinger-joint',art.stinger.x,art.stinger.y);
  const stinger = piece(needle,art.pieces.stinger,'stinger');
  const thorax = piece(body,art.pieces.thorax,'thorax');

  const neck = joint(body,'bee:head-joint',art.head.x,art.head.y);
  const head = piece(neck,art.pieces.head,'head');
  const rearHead = piece(neck,art.pieces.headRear,'headRear');
  rearHead.visible = false;
  const feelers = ([-1,1] as const).map(side=>{
    const base = joint(neck,'bee:antenna-joint',side*art.pieces.head.width*.20,-art.pieces.head.height*.38);
    const sprite = piece(base,art.pieces.antenna,'antenna');
    sprite.scale.x *= side;
    return {side,base};
  });

  const wings = ([-1,1] as const).flatMap(side=>(['wing','hindWing'] as const).map(part=>{
    const hind = part==='hindWing';
    const base = joint(body,hind ? 'bee:hind-wing-hinge' : 'bee:wing-hinge',side*2.2,-4);
    const sprite = piece(base,art.pieces[part],part);
    sprite.scale.x *= side;
    return {side,hind,base,sprite,span:sprite.scale.x,chord:sprite.scale.y};
  }));

  const legs = ([-1,1] as const).flatMap(side=>[-1,0,1].map(station=>{
    const hip = joint(body,'bee:leg-hinge');
    const sprite = piece(hip,art.pieces.leg,'leg');
    return {side,station,hip,sprite,span:sprite.scale.x};
  }));

  let facing = 1;
  let yaw: number | undefined;
  let pace = 0;
  let beat = 0;
  let lastTime: number | undefined;
  let impactAge = Infinity;
  let impactDirection = 0;

  return {
    root,
    height:art.height*art.scale,
    hitHalfWidth:art.hitHalfWidth*art.scale,
    reactToHit(direction,age) {
      if (age>260 || age>impactAge) return;
      impactDirection = direction;
      impactAge = age;
    },
    animate({time,moving,direction,action,actionTime}) {
      const delta = lastTime===undefined ? 1/60 : clamp(time-lastTime,0,.06);
      lastTime = time;
      const settle = 1-Math.exp(-delta*12);
      const turn = yaw===undefined ? 0 : shortestAngle(direction-yaw);
      yaw = yaw===undefined ? direction : yaw+turn*settle;
      const forward = Math.cos(yaw), depth = Math.sin(yaw);
      const profile = Math.abs(forward);
      if (profile>.09) facing = forward>=0 ? 1 : -1;

      const attacking = action==='attack' || action==='cast';
      const fallen = action==='dead' ? ease(actionTime,0,440) : 0;
      pace = mix(pace,moving && !attacking && action!=='dead' ? 1 : 0,settle);
      impactAge += delta*1000;
      const impact = (1-fallen)*(1-ease(impactAge,0,230))*Math.sin(Math.min(1,impactAge/230)*Math.PI);
      const coil = attacking ? ease(actionTime,0,115)*(1-ease(actionTime,132,194)) : 0;
      const jab = attacking ? ease(actionTime,124,201)*(1-ease(actionTime,222,438)) : 0;
      beat = (beat+delta*tau*(7.2+pace*2.2+coil*.8)*(1-fallen*.93))%tau;
      const lift = Math.sin(time*4.1)*(1.2+pace*.4)+Math.sin(time*2.2)*.65;
      const shove = jab*9-coil*2.7;
      const hover = mix(art.hover+pace*3.5+coil*3,5.8,fallen);
      flight.position.set(forward*shove+Math.cos(impactDirection)*impact*5,
        -hover+lift*(1-fallen)+depth*shove*.38+Math.sin(impactDirection)*impact*4);
      flight.rotation = clamp(turn,-.65,.65)*pace*.14+forward*(jab*.10-coil*.10)+facing*fallen*(.78+profile*.26);
      flight.alpha = 1-fallen*.39;
      body.rotation = Math.sin(time*3.2)*.035*(1-fallen)+forward*pace*.08+impact*.12;

      thorax.scale.x = art.pieces.thorax.width/thorax.texture.width*facing*mix(.71,1,profile);
      neck.position.set(art.head.x*forward,art.head.y+depth*3.4);
      neck.rotation = forward*(jab*.16-coil*.10)-body.rotation*.38;
      head.scale.x = art.pieces.head.width/head.texture.width*facing*mix(.87,1,profile);
      rearHead.scale.x = art.pieces.headRear.width/rearHead.texture.width*facing*mix(.87,1,profile);
      head.x = -(0.5-art.pieces.head.anchorX)*art.pieces.head.width*facing*(1-profile)*.86;
      rearHead.x = -(0.5-art.pieces.headRear.anchorX)*art.pieces.headRear.width*facing*(1-profile)*.86;
      const rear = ease(-depth,.33,.83);
      head.alpha = 1-rear;
      head.visible = rear<1;
      rearHead.alpha = rear;
      rearHead.visible = rear>0;
      neck.zIndex = depth<-.32 ? -1 : 2;
      for (const {side,base} of feelers) {
        base.position.set(head.x+facing*art.pieces.head.width*.34+side*2.2,-art.pieces.head.height*.56);
        base.rotation = side*(.17+Math.sin(time*5.6+side)*.105*(1-fallen))-forward*(pace*.15+coil*.17);
      }

      tail.position.set(art.abdomen.x*forward,art.abdomen.y-depth*6.8);
      tail.zIndex = depth<-.30 ? 1 : -1;
      tail.rotation = -facing*(pace*.05+coil*.29+jab*.82)+Math.sin(time*4.3)*.046*(1-fallen);
      abdomen.scale.x = -art.pieces.abdomen.width/abdomen.texture.width*facing*mix(.67,1,profile);
      abdomen.x = (0.5-art.pieces.abdomen.anchorX)*art.pieces.abdomen.width*facing*(1-profile)*.77;
      needle.position.set(abdomen.x+facing*art.stinger.x*mix(.67,1,profile)*(1-coil*.16),art.stinger.y+coil*1.8);
      needle.rotation = facing*(coil*.22-jab*.90);
      stinger.scale.x = -art.pieces.stinger.width/stinger.texture.width*facing*(1+jab*.17);

      for (const {side,hind,base,sprite,span,chord} of wings) {
        const phase = beat+side*.28+(hind ? -.50 : 0);
        const wave = Math.sin(phase)*(1-fallen);
        const fold = Math.abs(Math.cos(phase));
        const far = side===facing;
        base.position.set(side*mix(5.2,2.4,profile)-forward*(hind ? 4.4 : 1.6),-4.6+(far?-2:1)+(hind ? 2.2 : 0));
        base.rotation = side*(.16+wave*.40+pace*.10+fallen*.55+(hind ? .23 : 0))+forward*coil*.11;
        base.zIndex = (far ? -4 : 4)+(hind ? -.2 : 0);
        sprite.scale.set(span*mix(1,.68,fallen),chord*mix(.62+fold*.38,.62,fallen));
        sprite.alpha = far ? .74 : .91;
      }

      for (const {side,station,hip,sprite,span} of legs) {
        const far = side===facing;
        hip.position.set(station*art.pieces.thorax.width*.23*forward+side*mix(4,1.2,profile),
          5.2+station*depth*1.7+(far?-2.2:1.5));
        hip.rotation = facing*(station*.19+pace*.54+coil*.20+jab*.24+fallen*.63)
          +Math.sin(time*5.5+station*.72+side)*.11*(1-fallen);
        hip.zIndex = far ? -2 : 3;
        sprite.scale.x = -span*facing;
      }
    },
  };
}
