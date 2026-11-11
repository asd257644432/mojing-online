import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Rig } from './rigs';

const path = '/assets/monsters/mushroom-rig.png';
const cellSize = 512;

const mushroomParts = {
  cap: [0,0,62,141,504,408],
  stemFront: [1,0,135,164,389,429],
  stemBack: [2,0,122,163,370,428],
  armLeft: [0,1,171,171,350,391],
  armRight: [1,1,177,174,358,384],
  boot: [2,1,124,189,369,384],
} as const;

type MushroomPart = keyof typeof mushroomParts;

function attachJoint(parent: Container, x: number, y: number) {
  const joint = new Container({x,y});
  parent.addChild(joint);
  return joint;
}

export class MushroomRigAtlas {
  private readonly parts = new Map<MushroomPart,Texture>();

  static async load() {
    const texture = await Assets.load<Texture>(path);
    if (texture.width !== cellSize*3 || texture.height !== cellSize*2) {
      throw new Error(`Mushroom atlas must be ${cellSize*3}×${cellSize*2}`);
    }
    return new MushroomRigAtlas(texture);
  }

  private constructor(sheet: Texture) {
    for (const name of Object.keys(mushroomParts) as MushroomPart[]) {
      const [column,row,left,top,right,bottom] = mushroomParts[name];
      const frame = new Rectangle(column*cellSize+left-3,row*cellSize+top-3,right-left+6,bottom-top+6);
      this.parts.set(name,new Texture({source:sheet.source,frame,label:`mushroom-${name}`}));
    }
  }

  private attachPart(parent: Container, part: MushroomPart, x: number, y: number, width: number, height: number) {
    const texture = this.parts.get(part)!;
    const sprite = new Sprite(texture);
    sprite.anchor.set(x,y);
    sprite.scale.set(width/texture.width,height/texture.height);
    parent.addChild(sprite);
    return sprite;
  }

  create(elite: boolean): Rig {
    const scale = elite ? 1.38 : 1;
    const root = new Container({label:'mushroom-textured-rig'});
    root.scale.set(scale);
    const body = attachJoint(root,0,0);
    body.sortableChildren = true;
    const chest = attachJoint(body,0,-8);
    chest.zIndex = 2;
    chest.sortableChildren = true;
    const front = this.attachPart(chest,'stemFront',.5,.92,19,19);
    const back = this.attachPart(chest,'stemBack',.5,.92,19,19);
    back.visible = false;
    const neck = attachJoint(chest,0,-13);
    neck.zIndex = 4;
    this.attachPart(neck,'cap',.49,.81,39.5,23.8);
    const feet = [-1,1].map(side => {
      const ankle = attachJoint(body,side*5.3,-6.9);
      const boot = this.attachPart(ankle,'boot',.53,.12,10.9,7.9);
      boot.scale.x *= side;
      return {side,ankle};
    });
    const arms = [-1,1].map(side => {
      const shoulder = attachJoint(chest,side*6.7,-10);
      this.attachPart(shoulder,side < 0 ? 'armLeft' : 'armRight',side < 0 ? .68 : .32,.23,11.7,13.7);
      return {side,shoulder};
    });
    let lastTime: number | undefined;
    let pace = 0;
    let gait = 0;
    let facing = -1;

    return {
      root, height:41*scale,
      animate({time,moving,direction,action,actionTime}) {
        const delta = lastTime === undefined ? 1/60 : Math.min(.06,Math.max(0,time-lastTime));
        lastTime = time;
        const heading = (Math.round(direction/(Math.PI/4))+8)%8;
        const angle = heading*Math.PI/4;
        const facingX = Math.cos(angle);
        const sideOn = heading === 0 || heading === 4;
        const side = heading === 0 || heading === 1 || heading === 7 ? 1 : -1;
        if (heading !== facing) {
          facing = heading;
          const rear = heading >= 5;
          front.visible = !rear;
          back.visible = rear;
          arms[0].shoulder.zIndex = sideOn || rear ? -1 : 1;
          arms[1].shoulder.zIndex = rear ? -1 : 1;
        }
        const attacking = action === 'attack' || action === 'cast';
        const attack = attacking ? Math.sin(Math.min(1,actionTime/390)*Math.PI) : 0;
        const fall = action === 'dead' ? Math.min(1,actionTime/300) : 0;
        pace += ((moving && !attacking && !fall ? 1 : 0)-pace)*(1-Math.exp(-delta*15));
        gait += delta*11.3;
        const step = Math.sin(gait)*pace;
        const bounce = Math.abs(step)*3.7;
        const breath = Math.sin(time*3.4)*.48;
        body.x = facingX*attack*5;
        body.y = -bounce+fall*5+Math.sin(angle)*attack*3;
        body.scale.set(side*(sideOn ? .83 : 1)*(1+fall*.06),1-fall*.45);
        body.rotation = facingX*attack*.27+side*fall*.92;
        body.alpha = 1-fall*.42;
        chest.y = -8-bounce*.22+breath+attack*1.6;
        neck.rotation = -step*.085+Math.abs(facingX)*attack*.18;
        neck.scale.set(1+attack*.09,1-attack*.12);
        for (const {side:footSide,ankle} of feet) {
          ankle.y = -6.9-Math.max(0,step*footSide)*2.5;
          ankle.rotation = step*footSide*.37;
        }
        for (const {side:armSide,shoulder} of arms) {
          shoulder.rotation = armSide*(.13+step*.26-attack*.48);
        }
      },
    };
  }

  destroy() {
    for (const texture of this.parts.values()) texture.destroy(false);
    this.parts.clear();
  }
}
