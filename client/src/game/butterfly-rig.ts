import { Assets, Container, Matrix, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Rig } from './rigs';

type Part = 'head' | 'thorax' | 'abdomen' | 'foreWing' | 'hindWing' | 'foreWingUnderside' | 'hindWingUnderside' | 'antenna' | 'leg';
type Region = readonly [left:number,top:number,right:number,bottom:number,pivotX:number,pivotY:number,width:number,height:number];

const atlasPath = '/assets/monsters/butterfly-rig.png';
const atlasSize = 1254;
const framePadding = 4;
const regions:Record<Part,Region> = {
  head:[135,159,282,276,265,245,5.8,5],
  thorax:[519,130,707,307,613,222,8,6],
  abdomen:[886,98,1161,338,914,128,10.7,9.3],
  foreWing:[43,456,384,783,51,771,25,18],
  hindWing:[457,493,766,764,470,512,17,13],
  foreWingUnderside:[872,459,1214,788,880,777,25,18],
  hindWingUnderside:[46,899,358,1171,59,914,17,13],
  antenna:[513,920,760,1145,525,1133,5.5,5.5],
  leg:[906,900,1127,1159,919,913,4,5],
};

interface Cutout {
  texture: Texture;
  anchorX: number;
  anchorY: number;
  scaleX: number;
  scaleY: number;
}

const tau = Math.PI*2;
const clamp = (value:number,min:number,max:number) => Math.max(min,Math.min(max,value));

function ease(value:number,start:number,end:number) {
  const progress = clamp((value-start)/(end-start),0,1);
  return progress*progress*(3-2*progress);
}

export class ButterflyRigAtlas {
  private readonly pieces: Record<Part,Cutout>;
  private disposed = false;

  static async load() {
    const sheet = await Assets.load<Texture>(atlasPath);
    if (sheet.width!==atlasSize || sheet.height!==atlasSize) throw new Error(`Butterfly atlas must be ${atlasSize}×${atlasSize}`);
    return new ButterflyRigAtlas(sheet);
  }

  private constructor(sheet:Texture) {
    this.pieces = Object.fromEntries(Object.entries(regions).map(([part,[left,top,right,bottom,px,py,width,height]])=>{
      const frame = new Rectangle(left-framePadding,top-framePadding,right-left+framePadding*2,bottom-top+framePadding*2);
      const texture = new Texture({source:sheet.source,frame,label:`butterfly:${part}`});
      return [part,{texture,anchorX:(px-frame.x)/frame.width,anchorY:(py-frame.y)/frame.height,
        scaleX:width/(right-left),scaleY:height/(bottom-top)}];
    })) as Record<Part,Cutout>;
  }

  create(definitionId?:string) {
    if (!this.disposed && definitionId==='butterfly') return createButterflyRig(this.pieces);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const {texture} of Object.values(this.pieces)) texture.destroy(false);
  }
}

function createButterflyRig(art:Record<Part,Cutout>):Rig {
  const root = new Container({label:'butterfly-articulated-rig'});
  const flight = new Container({label:'butterfly:flight',y:-12,sortableChildren:true});
  root.addChild(flight);

  function piece(parent:Container,part:Part) {
    const {texture,anchorX,anchorY,scaleX,scaleY} = art[part];
    const sprite = new Sprite({texture,label:`butterfly:${part}`});
    sprite.anchor.set(anchorX,anchorY);
    sprite.scale.set(scaleX,scaleY);
    parent.addChild(sprite);
    return sprite;
  }

  const thorax = piece(flight,'thorax');
  const abdomenJoint = new Container({label:'butterfly:abdomen-joint'});
  flight.addChild(abdomenJoint);
  const abdomen = piece(abdomenJoint,'abdomen');
  // The painted abdomen tapers down and right from its pivot. Align it to the rear axis.
  abdomen.scale.x *= -1;
  abdomen.rotation = Math.atan2(200*art.abdomen.scaleY,221*art.abdomen.scaleX);
  const headJoint = new Container({label:'butterfly:neck'});
  flight.addChild(headJoint);
  const head = piece(headJoint,'head');
  const headReverse = piece(headJoint,'head');
  headReverse.label = 'butterfly:head-reverse';
  head.scale.x *= -1;
  const antennae = ([-1,1] as const).map(side=>({side,sprite:piece(headJoint,'antenna')}));
  const wings = ([-1,1] as const).flatMap(side=>[true,false].map(hind=>{
    const hinge = new Container({label:`butterfly:${hind ? 'hind' : 'fore'}-hinge`});
    flight.addChild(hinge);
    const top = piece(hinge,hind ? 'hindWing' : 'foreWing');
    const underside = piece(hinge,hind ? 'hindWingUnderside' : 'foreWingUnderside');
    return {side,hind,hinge,top,underside,projection:new Matrix()};
  }));
  const legs = ([-1,1] as const).flatMap(side=>[-1,0,1].map(pair=>({side,pair,sprite:piece(flight,'leg')})));
  const bodyProjection = new Matrix();

  let yaw: number | undefined;
  let lastTime: number | undefined;
  let beat = 0;
  let pace = 0;
  let hitAge = Infinity;
  let hitDirection = 0;

  return {
    root,
    height:46,
    hitHalfWidth:26,
    reactToHit(direction,age) {
      if (age>=220 || age>hitAge) return;
      hitAge = age;
      hitDirection = direction;
    },
    animate({time,moving,direction,action,actionTime}) {
      const step = lastTime===undefined ? 1/60 : clamp(time-lastTime,0,.06);
      if (lastTime===undefined) beat = (time*4.4*tau)%tau;
      lastTime = time;
      const settle = 1-Math.exp(-step*13);
      const dead = action==='dead';
      yaw ??= direction;
      const turn = dead ? 0 : Math.atan2(Math.sin(direction-yaw),Math.cos(direction-yaw));
      yaw += turn*settle;
      const forward = Math.cos(yaw), depth = Math.sin(yaw);
      const profile = Math.abs(forward);

      const attacking = action==='attack' || action==='cast';
      const fallen = dead ? ease(actionTime,0,410) : 0;
      const airborne = 1-fallen;
      pace += ((moving && !attacking && !dead ? 1 : 0)-pace)*settle;
      beat = (beat+step*tau*(4.4+pace*1.7)*airborne)%tau;
      hitAge += step*1000;
      const impact = Math.sin(Math.min(1,hitAge/220)*Math.PI)*(1-ease(hitAge,40,220))*airborne;
      const windup = attacking ? ease(actionTime,0,83)*(1-ease(actionTime,93,157)) : 0;
      const lunge = attacking ? ease(actionTime,92,155)*(1-ease(actionTime,172,340)) : 0;
      const glide = Math.sin(time*4.2)*1.2+Math.sin(time*2.1+.8)*.55;
      const shove = lunge*8-windup*2.7;
      flight.position.set(forward*shove+Math.cos(hitDirection)*impact*4.4,
        -(12+pace*2.5+windup*3)*airborne-fallen*4.2+glide*airborne+depth*shove*.64+Math.sin(hitDirection)*impact*3.2);
      flight.rotation = clamp(turn,-.6,.6)*pace*.15+forward*(lunge*.19-windup*.14+fallen*.36+impact*.17);
      flight.alpha = 1-fallen*.24;

      const bodyAngle = Math.atan2(depth*.42,forward);
      const bodyWidth = .34+profile*.66;
      thorax.scale.x = art.thorax.scaleX*bodyWidth;
      thorax.rotation = depth*.12;
      abdomenJoint.position.set(-forward*3.4,-depth*2.1+.6);
      abdomenJoint.rotation = bodyAngle+forward*(Math.sin(beat)*.035*airborne+lunge*.15-fallen*.14);
      abdomenJoint.scale.x = bodyWidth;
      abdomenJoint.zIndex = depth>.05 ? -1 : 1;
      headJoint.position.set(forward*4.8,depth*2.75-.5);
      headJoint.scale.x = .4+profile*.6;
      headJoint.rotation = depth*.12;
      headJoint.zIndex = depth>.05 ? 1 : -1;
      // Blend two upright views at front/back headings instead of inverting the skull.
      head.alpha = ease(forward,-.22,.22);
      headReverse.alpha = 1-head.alpha;
      for (const {side,sprite} of antennae) {
        sprite.position.set(forward*2+side*1.1,-2.8);
        sprite.rotation = side*.23+forward*(pace*.22*airborne+lunge*.35)+Math.sin(beat+side)*.07*airborne;
        sprite.scale.x = art.antenna.scaleX*side;
      }
      for (const {side,pair,sprite} of legs) {
        const curl = pair*.17+pace*.32*airborne+fallen*.6+Math.sin(beat+pair*.45)*.06*airborne;
        sprite.setFromMatrix(bodyProjection.set(-art.leg.scaleX*forward,-art.leg.scaleX*depth*.42,
          Math.sin(curl)*art.leg.scaleY,Math.cos(curl)*art.leg.scaleY,
          forward*pair*1.8-depth*side*1.2,1.9+(depth*pair*1.8+forward*side*1.2)*.61));
        sprite.zIndex = forward*side<0 ? -2 : 2;
      }

      // Project each hinge's lateral and length axes into screen space. The near wing
      // changes with the actor's heading, while folding changes its actual projected span.
      const groundDepth = .61-fallen*.33;
      for (const {side,hind,hinge,top,underside,projection} of wings) {
        const stroke = (.29+Math.sin(beat+side*.16-(hind ? .43 : 0))*.58)*airborne+fallen*.11+windup*.20-lunge*.17;
        const spread = Math.cos(stroke);
        const rise = Math.sin(stroke)*.84;
        const station = hind ? -3.2 : 1;
        const lateral = 1.6*side;
        const wingDepth = forward*side;
        hinge.setFromMatrix(projection.set(
          -depth*side*spread,wingDepth*groundDepth*spread-rise,
          -forward,-depth*groundDepth,
          forward*station-depth*lateral,groundDepth*(depth*station+forward*lateral)-.65,
        ));
        const reverse = 1-ease(groundDepth*spread-rise*wingDepth,-.12,.12);
        top.visible = reverse<1;
        top.alpha = 1-reverse;
        underside.visible = reverse>0;
        underside.alpha = reverse;
        hinge.zIndex = (wingDepth<0 ? -3 : 3)+(hind ? 0 : .2);
        hinge.alpha = .88+.08*wingDepth;
      }
    },
  };
}
