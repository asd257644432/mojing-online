import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { BipedGait, bipedHipHeight as hipHeight, bipedSole as sole, bipedThigh as thigh } from './biped-gait';
import type { Rig, RigPose } from './rigs';
import type { ActorState } from '../../../shared/types';

const path = '/assets/characters/ranger-classic-rig.png';
const atlasSize = 1254;
const cellEdge = [0, 314, 627, 941, atlasSize];
// Bounds follow the connected alpha silhouette in each cell. Leave a small UV
// margin for the antialiased edge without sampling the adjacent part.
const partBounds = {
  headFront: [48, 23, 252, 286], headBack: [358, 26, 231, 280],
  torsoFront: [685, 64, 191, 236], torsoBack: [998, 63, 194, 230],
  upperLeft: [87, 369, 163, 227], upperRight: [379, 369, 160, 227],
  foreLeft: [695, 365, 159, 239], foreRight: [1007, 365, 158, 241],
  thighLeft: [65, 652, 170, 247], thighRight: [393, 650, 171, 243],
  shinLeft: [685, 654, 151, 255], shinRight: [1027, 651, 166, 259],
  bow: [101, 952, 148, 286], quiver: [394, 953, 174, 273],
  scarf: [696, 1011, 173, 172], arrow: [964, 1054, 258, 61],
} as const;

type Part = keyof typeof partBounds;

function joint(parent: Container, x: number, y: number) {
  const container = new Container({ x, y });
  parent.addChild(container);
  return container;
}

function octant(angle: number) {
  return (Math.round(angle / (Math.PI / 4)) + 8) % 8;
}

function stretch(current: number, target: number, amount: number) {
  return current + (target - current) * amount;
}

function limit(value:number,min:number,max:number) {
  return Math.max(min,Math.min(max,value));
}

export class RangerRigAtlas {
  private readonly parts = new Map<Part, Texture>();

  static async load() {
    const sheet = await Assets.load<Texture>(path);
    if (sheet.width !== atlasSize || sheet.height !== atlasSize) {
      throw new Error(`Ranger atlas must be ${atlasSize}×${atlasSize}`);
    }
    return new RangerRigAtlas(sheet);
  }

  private constructor(sheet: Texture) {
    for (const [name, [x, y, width, height]] of Object.entries(partBounds) as [Part, (typeof partBounds)[Part]][]) {
      const column = Math.floor((x + width / 2) * 4 / atlasSize);
      const row = Math.floor((y + height / 2) * 4 / atlasSize);
      const left = Math.max(cellEdge[column], x - 3);
      const top = Math.max(cellEdge[row], y - 3);
      const right = Math.min(cellEdge[column + 1], x + width + 3);
      const bottom = Math.min(cellEdge[row + 1], y + height + 3);
      this.parts.set(name, new Texture({ source: sheet.source, frame: new Rectangle(left, top, right - left, bottom - top), label: name }));
    }
  }

  private piece(parent: Container, part: Part, anchorX: number, anchorY: number, height: number, width?: number) {
    const texture = this.parts.get(part)!;
    const sprite = new Sprite(texture);
    sprite.anchor.set(anchorX, anchorY);
    sprite.scale.set((width ?? height * texture.width / texture.height) / texture.width, height / texture.height);
    parent.addChild(sprite);
    return sprite;
  }

  create(initialState?: ActorState): Rig {
    const root = new Container({ label: 'ranger-textured-rig' });
    const body = joint(root, 0, 0);
    const chest = joint(body, 0, -hipHeight);
    chest.sortableChildren = true;
    chest.zIndex = 3;
    body.sortableChildren = true;

    const scarf = this.piece(chest, 'scarf', .50, .24, 11.5, 13.9);
    scarf.position.set(0, -16.9);
    scarf.zIndex = 2;
    const quiver = this.piece(chest, 'quiver', .49, .72, 23, 13);
    quiver.position.set(5, -9);
    quiver.rotation = -.11;
    quiver.zIndex = -3;
    const torsoFront = this.piece(chest, 'torsoFront', .48, .94, 20.3, 20);
    const torsoBack = this.piece(chest, 'torsoBack', .49, .94, 20.3, 20.7);

    const legs = ([-1, 1] as const).map(side => {
      const left = side === -1;
      const hip = joint(body, side * 4.5, -hipHeight);
      this.piece(hip, left ? 'thighLeft' : 'thighRight', left ? .58 : .42, .18, 11.6, 9.0);
      const knee = joint(hip, side * thigh.x, thigh.y);
      this.piece(knee, left ? 'shinLeft' : 'shinRight', left ? .54 : .45, .18, 12.5, 10.6);
      joint(knee,side*sole.x,sole.y).label = left ? 'ranger:sole-left' : 'ranger:sole-right';
      return { side, hip, knee };
    });
    const gait = new BipedGait();

    const arms = ([-1, 1] as const).map(side => {
      const left = side === -1;
      const shoulder = joint(chest, side * 7.3, -15.9);
      this.piece(shoulder, left ? 'upperLeft' : 'upperRight', left ? .62 : .39, .18, 11.8, 9.1);
      const elbow = joint(shoulder, side * 1.6, 8.3);
      this.piece(elbow, left ? 'foreLeft' : 'foreRight', left ? .61 : .36, .18, 12.6, 8.2);
      const hand = joint(elbow, side * 1.8, 8.6);
      return { side, shoulder, elbow, hand };
    });

    const bow = this.piece(arms[0].hand, 'bow', .28, .52, 30, 15.2);
    bow.label = 'ranger:bow';
    bow.visible = initialState?.weaponAppearance !== '';
    bow.position.set(-1.3, -.3);
    bow.rotation = -.12;
    const arrow = this.piece(arms[0].hand, 'arrow', .53, .49, 5.5, 22);
    arrow.label = 'ranger:arrow';
    arrow.position.set(-1, -1);
    arrow.visible = false;

    const neck = joint(chest, 0, -19.4);
    neck.zIndex = 4;
    const headFront = this.piece(neck, 'headFront', .48, .92, 33.5, 28.9);
    const headBack = this.piece(neck, 'headBack', .50, .92, 33.5, 28.0);
    let facing = -1;
    let yaw = 0;
    let hitAge = Infinity;
    let hitDirection = 0;
    let lastTime: number | undefined;

    function face(direction: number) {
      const rear = direction >= 5;
      const horizontal = direction === 0 || direction === 4;
      const mirror = direction === 0 || direction === 1 || direction === 7;
      headFront.visible = torsoFront.visible = !rear;
      headBack.visible = torsoBack.visible = rear;
      scarf.x = rear ? -4.2 : 0;
      scarf.zIndex = rear ? 3 : 2;
      quiver.zIndex = rear ? 2 : -3;
      arms[0].shoulder.zIndex = horizontal || rear ? -2 : 1;
      arms[1].shoulder.zIndex = rear ? -1 : 1;
      legs[0].hip.zIndex = horizontal ? -1 : 0;
      neck.x = horizontal ? -2.1 : direction % 2 === 1 ? -1.25 : 0;
      body.scale.x = mirror ? -Math.abs(body.scale.x) : Math.abs(body.scale.x);
    }

    face(2);

    return {
      root,
      height: 71,
      reactToHit(direction,age) {
        if (age>180 || age>hitAge) return;
        hitAge = age;
        hitDirection = direction;
      },
      animate({time, direction, action, actionTime,travelX=0,travelY=0,deltaSeconds}: RigPose, state?: ActorState) {
        bow.visible = (state ?? initialState)?.weaponAppearance !== '';
        const elapsed = limit(deltaSeconds ?? (lastTime===undefined ? 1/60 : time-lastTime),0,.06);
        lastTime = time;
        const blend = 1 - Math.exp(-elapsed * 14);
        const facingNow = octant(direction);
        if (facingNow !== facing) {
          facing = facingNow;
          face(facing);
        }
        const heading = Math.abs(Math.cos(facing * Math.PI / 4));
        yaw = stretch(yaw, heading, blend);
        const attacking = action === 'attack' || action === 'cast';
        const drawTime = Math.min(1, actionTime / (action === 'cast' ? 520 : 400));
        const draw = attacking ? Math.sin(drawTime * Math.PI) : 0;
        const dead = action==='dead';
        const fallen = dead ? Math.min(1, actionTime / 370) : 0;
        body.scale.x = Math.sign(body.scale.x) * 1.08 * (1 - yaw * .17);
        const step = gait.advance(travelX, travelY, elapsed, blend, 5 * Math.abs(body.scale.x),
          !attacking && !dead && hitAge >= 94) * (1 - fallen);
        hitAge += elapsed * 1000;
        const hit = dead ? 0 : Math.sin(Math.PI * Math.min(1, hitAge / 180));
        const breath = Math.sin(time*3.4)*(1-fallen);
        const lean = -draw*.06+Math.cos(hitDirection)*hit*.10;
        body.y = gait.plant(legs, body.scale.x, lean, 1.2 - Math.abs(step) * .82 - breath * .23) + fallen * 3;
        body.rotation = lean+fallen*1.39;
        body.alpha = 1 - fallen * .53;
        chest.rotation = -step * .052;
        scarf.rotation = step * .073 + breath * .022;
        quiver.rotation = -.11 + step * .07;
        neck.rotation = step * .032 - draw * .07;
        neck.scale.x = 1+yaw*.12;
        const [bowArm, drawArm] = arms;
        bowArm.shoulder.rotation = step * .18 + draw * 1.30 + .07;
        bowArm.elbow.rotation = .08 + draw * .25;
        drawArm.shoulder.rotation = -step * .21 - draw * 2.04 - .06;
        drawArm.elbow.rotation = -.06 - draw * 2.68;
        const bowArmAngle = bowArm.shoulder.rotation + bowArm.elbow.rotation;
        bow.rotation = -.12 - bowArmAngle * draw;
        arrow.rotation = Math.PI - bowArmAngle;
        arrow.visible = bow.visible && attacking && drawTime < .54 && draw > .17;
      },
    };
  }

  destroy() {
    for (const part of this.parts.values()) part.destroy();
    this.parts.clear();
  }
}
