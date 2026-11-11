import { Container, FillGradient, Graphics } from 'pixi.js';
import type { ActorState, ClassId } from '../../../shared/types';
import type { WeaponAppearance } from '../../../shared/appearance';
import { showPlayerWeapon } from './player-weapon-rig';
import { isBeeDefinition, type BeeRigAtlas } from './bee-rig';
import type { ButterflyRigAtlas } from './butterfly-rig';
import type { ElderRigAtlas } from './elder-rig';
import type { MushroomRigAtlas } from './monster-atlas';
import type { RangerRigAtlas } from './textured-rig';
import { isRodentDefinition, type RodentRigAtlas } from './rodent-rig';
import type { SmithRigAtlas } from './smith-rig';
import { isPuppetDefinition, type PuppetRigAtlas } from './puppet-rig';
import { shortPlayerActionRelease, type PlayerClassRigAtlas } from './player-class-rig';
import type { RabbitRigAtlas } from './rabbit-rig';
import type { ScarecrowRigAtlas } from './scarecrow-rig';
import { isTreeDemonDefinition, type TreeDemonRigAtlas } from './tree-demon-rig';
import { createTurtleRig } from './turtle-rig';
import { townNpcAtlasFor, type TownNpcRigAtlas } from './town-npc-rig';

const ink = 0x352536;
const skin = 0xffd7ac;
const gold = 0xe8b466;
const cream = 0xffedc0;
const classes: Record<ClassId, [number, number, number, number]> = {
  warrior: [0xb34e50, 0x4c485a, 0xe3b57a, 0x59312d],
  rogue: [0x7370a1, 0x423452, 0xeeb970, 0x332846],
  ranger: [0x77a565, 0x354951, 0xecca78, 0x885036],
  mage: [0x687fc1, 0x413d75, 0x86dce2, 0x4d496e],
  priest: [0xeddcb8, 0x80629b, 0xffc478, 0x8b566b],
  merchant: [0xc77643, 0x563852, 0xffc97b, 0x6c4631],
};
const nations = { water: 0x75dce7, fire: 0xf88e6b, earth: 0xc8b17d };

function outlined(graphic: Graphics, fill: number | FillGradient, edge = ink, width = 1.15) {
  // Pixi 8.22 retains unused non-batch gradient bindings after WebGL renderer disposal.
  if (fill instanceof FillGradient) graphic.context.batchMode = 'batch';
  return graphic.fill(fill).stroke({ color: edge, width, join: 'round', cap: 'round' });
}

function mix(a: number, b: number, amount: number) {
  let color = 0;
  for (const shift of [0, 8, 16]) {
    const left = (a >> shift) & 255;
    const right = (b >> shift) & 255;
    color |= Math.round(left + (right - left) * amount) << shift;
  }
  return color;
}

export class RigShading {
  private readonly fills = new Map<number, FillGradient>();

  shade(color: number) {
    const existing = this.fills.get(color);
    if (existing) return existing;
    // Pixi 8.22 scales the local gradient origin by textureSize; zero avoids clamping the whole shape to its first color.
    const fill = new FillGradient({ type:'linear', start:{x:0,y:0}, end:{x:.87,y:.75}, textureSpace:'local', textureSize:32,
      colorStops:[{offset:0,color:mix(color,0xffe8be,0.55)}, {offset:0.31,color:mix(color,0xffe8be,0.21)},
        {offset:0.6,color}, {offset:0.86,color:mix(color,0x483449,0.43)}, {offset:1,color:mix(color,0x483449,0.18)}] });
    this.fills.set(color,fill);
    return fill;
  }

  destroy() {
    for (const fill of this.fills.values()) fill.destroy();
    this.fills.clear();
  }
}

function shape(draw: (graphic: Graphics) => void) {
  const graphic = new Graphics();
  draw(graphic);
  return graphic;
}

function joint(parent: Container, x: number, y: number) {
  const child = new Container({ x, y });
  parent.addChild(child);
  return child;
}

export interface RigPose {
  time: number;
  moving: boolean;
  direction: number;
  action: ActorState['action'];
  actionTime: number;
  /** Actual rendered displacement, in world units, for planted-foot animation. */
  travelX?: number;
  travelY?: number;
  deltaSeconds?: number;
}

export interface Rig {
  root: Container;
  height: number;
  hitHalfWidth?: number;
  animate(pose: RigPose, state: ActorState): void;
  reactToHit?(direction: number, age: number): void;
}

export interface RigAtlases {
  warriorMale?: PlayerClassRigAtlas;
  warriorFemale?: PlayerClassRigAtlas;
  mageMale?: PlayerClassRigAtlas;
  mageFemale?: PlayerClassRigAtlas;
  rogueMale?: PlayerClassRigAtlas;
  rogueFemale?: PlayerClassRigAtlas;
  priestMale?: PlayerClassRigAtlas;
  priestFemale?: PlayerClassRigAtlas;
  merchantMale?: PlayerClassRigAtlas;
  merchantFemale?: PlayerClassRigAtlas;
  islandRabbit?: RabbitRigAtlas;
  islandScarecrow?: ScarecrowRigAtlas;
  puppet?: PuppetRigAtlas;
  treeDemon?: TreeDemonRigAtlas;
  rodent?: RodentRigAtlas;
  smith?: SmithRigAtlas;
  bee?: BeeRigAtlas;
  butterfly?: ButterflyRigAtlas;
  townNpc?: TownNpcRigAtlas;
  capitalMerchant?: TownNpcRigAtlas;
  villageFather?: TownNpcRigAtlas;
  villageSusan?: TownNpcRigAtlas;
  elder?: ElderRigAtlas;
  ranger?: RangerRigAtlas;
  mushroom?: MushroomRigAtlas;
}

function drawWeapon(classId: ClassId, appearance?: WeaponAppearance) {
  return shape(g => {
    if (classId === 'warrior' && (appearance === 'warrior-starter-sword' || appearance === 'warrior-steel-sword')) {
      const steel = appearance === 'warrior-steel-sword';
      const length = steel ? 28 : 21, width = steel ? 3.3 : 2;
      outlined(g.poly([-width, -3, -width, -length + 5, 0, -length, width, -length + 5, width, -3]), 0xbac7d0, 0x59616b, .7);
      g.poly([0, -length + 1, width - .6, -length + 5, width - .6, -3, 0, -3]).fill(0xeaf0ef);
      outlined(g.roundRect(-1.1, -2, 2.2, 7, .6), steel ? 0x586778 : 0x765343, 0x493a34, .6);
      outlined(g.roundRect(steel ? -5 : -3.8, -3.5, steel ? 10 : 7.6, 1.8, .6), steel ? 0xa08a67 : 0x9fa7ac, 0x5e594f, .6);
      g.circle(0, 5.5, 1.5).fill(0x9d875f);
    } else if (classId === 'ranger') {
      g.moveTo(-4, 13).quadraticCurveTo(10, -3, 7, -15).quadraticCurveTo(5, -19, 8, -21)
        .stroke({ color: 0x7a422e, width: 4, cap: 'round' });
      g.moveTo(-4, 13).quadraticCurveTo(10, -3, 7, -15).quadraticCurveTo(5, -19, 8, -21)
        .stroke({ color: gold, width: 1.5, cap: 'round' });
      g.moveTo(-4, 13).lineTo(8, -21).stroke({ color: cream, width: 0.8 });
      g.circle(7, -5, 2.7).fill(0x5a793d);
    } else if (classId === 'mage' || classId === 'priest') {
      const jewel = classId === 'mage' ? 0x9ce7fa : 0xffcb83;
      g.moveTo(-4, 14).lineTo(5, -24).stroke({ color: ink, width: 4, cap: 'round' });
      g.moveTo(-4, 14).lineTo(5, -24).stroke({ color: gold, width: 2.2, cap: 'round' });
      outlined(g.moveTo(5, -36).lineTo(12, -28).lineTo(5, -20).lineTo(-2, -28).closePath(), jewel, 0x725e8b);
      g.poly([5,-35, 7,-27, 5,-22, 1,-29]).fill(cream);
      g.circle(5, -37, 2).fill(cream);
    } else if (classId === 'merchant') {
      g.moveTo(-6, 13).lineTo(7, -18).stroke({ color: ink, width: 4, cap: 'round' });
      g.moveTo(-6, 13).lineTo(7, -18).stroke({ color: 0xc28d52, width: 2 });
      outlined(g.roundRect(-1, -25, 18, 12, 3), 0x8a7e96);
      outlined(g.roundRect(1, -23, 14, 6, 2), gold, 0x583a48, 0.8);
      g.circle(8, -20, 2).fill(cream);
    } else {
      const tip = classId === 'warrior' ? -35 : -22;
      outlined(g.poly([-2,1, 0,11, -3,14, -6,11, -4,0]), 0x725063);
      outlined(g.poly([-3,-3, 1,tip + 4, 7,tip, 9,tip + 9, 3,0]), 0xbbd6eb);
      g.poly([1,-2, 7,tip + 1, 7,tip + 7, 3,-2]).fill(0xf1f9ed);
      outlined(g.roundRect(-8, -4, 15, 4, 2), gold);
      g.circle(-1, -2, 1.6).fill(0xdd6777);
    }
  });
}

type HumanColors = [number, number, number, number];
const specialClothes: Record<string, HumanColors> = {
  'island-chief':[0xb48781,0x765770,0xeccc90,0xd2c7b3],
  'island-wells':[0x749087,0x5c6576,0xc9c89b,0xd3c7b4],
  'island-susan':[0xe49c9c,0x99606d,0xf4d8ab,0x723a39],
  'island-father':[0x787f65,0x4c544b,0xceb782,0x634135],
};

function createHuman(state: ActorState, feminine: boolean, shading: RigShading): Rig {
  const classId = state.classId ?? 'priest';
  const warrior = state.kind === 'player' && classId === 'warrior';
  const [cloth, dark, trim, hair] = specialClothes[state.id] ?? classes[classId];
  const elder = state.id === 'island-chief' || state.id === 'island-wells' || state.name.includes('老人');
  const father = state.id === 'island-father';
  const susan = state.id === 'island-susan';
  const shopkeeper = state.kind === 'npc' && classId === 'merchant';
  const accent = state.nation ? nations[state.nation] : trim;
  const clothTone = shading.shade(cloth);
  const darkTone = shading.shade(dark);
  const trimTone = shading.shade(trim);
  const hairTone = shading.shade(hair);
  const skinTone = shading.shade(father ? 0xe6ae81 : skin);
  const root = new Container();
  const body = joint(root, 0, 0);
  body.sortableChildren = true;
  const wings = joint(body, 0, -27);
  wings.zIndex = -4;
  for (const sign of [-1, 1]) {
    const wing = shape(g => {
      const color = state.wings === 'demon' ? 0xbd7184 : state.wings === 'elf' ? 0x9fd391 : 0xffecd4;
      outlined(g.moveTo(3, 3).bezierCurveTo(10, -21, 32, -32, 34, -16)
        .lineTo(30, -14).lineTo(34, -10).lineTo(25, -7).lineTo(28, -4)
        .lineTo(18, 0).lineTo(19, 3).lineTo(7, 8).closePath(), color, 0x715578);
      g.moveTo(8, 4).quadraticCurveTo(17, -11, 28, -17)
        .moveTo(13, 0).lineTo(27, -8).stroke({ color: cream, width: 1.4, alpha: 0.8 });
    });
    wing.scale.x = sign;
    wings.addChild(wing);
  }
  const mount = shape(g => {
    outlined(g.moveTo(-35, 0).quadraticCurveTo(0, -18, 35, -2).lineTo(29, 10)
      .quadraticCurveTo(-2, 2, -34, 12).closePath(), 0x84365b, 0x4a344d, 1.8);
    outlined(g.poly([-24,1, 0,-8, 22,-2, 0,5]), 0xc66c72, gold, 1.3);
    g.poly([-8,-1, 0,-5, 9,-2, 0,2]).fill(0xe8bd80);
    for (const x of [-30, -23, 23, 30]) {
      g.moveTo(x, 7).lineTo(x - 2, 13).stroke({ color: gold, width: 1.8, cap: 'round' });
    }
  });
  root.addChildAt(mount, 0);
  const cape = shape(g => {
    outlined(g.moveTo(-7,-34).quadraticCurveTo(-15,-19,-19,-5).quadraticCurveTo(-5,-9,15,-4)
      .quadraticCurveTo(11,-21,9,-34).closePath(), darkTone, 0x493745, 0.9);
    g.moveTo(-13,-9).quadraticCurveTo(-7,-20,-7,-30).moveTo(9,-12).lineTo(4,-28)
      .stroke({ color: cloth, width: 1.5, alpha: 0.8 });
  });
  cape.zIndex = -3;
  body.addChild(cape);
  const legs = [-1, 1].map(sign => {
    const hip = joint(body, sign * 6, -16);
    hip.zIndex = -1;
    hip.addChild(shape(g => {
      outlined(g.roundRect(-5, -1, 10, 13, 4), darkTone, 0x493745, 0.9);
      g.moveTo(-3,2).quadraticCurveTo(0,4,-2,8).stroke({color:cloth,width:1.3,alpha:0.6});
    }));
    const boot = joint(hip, 0, 9);
    boot.addChild(shape(g => {
      outlined(g.moveTo(-5,-3).lineTo(4,-3).lineTo(5,2).quadraticCurveTo(11,8,4,8)
        .lineTo(-4,8).quadraticCurveTo(-7,5,-5,-3).closePath(), shading.shade(0x654b51), 0x41323e, 0.85);
      g.roundRect(-4, -2, 8, 2.3, 1).fill(trim).moveTo(-4,6).lineTo(5,6).stroke({ color: 0x201e31, width: 1.4 });
      g.moveTo(-2,3).quadraticCurveTo(3,1,6,4).stroke({color:0xd5987d,width:0.8,alpha:0.55});
    }));
    return { hip, boot };
  });
  let heldWeapon: Container | undefined;
  const alternativeWeapons: { key: string; sprite: Container }[] = [];
  const arms = [-1, 1].map(sign => {
    const shoulder = joint(body, sign * (father ? 15 : 12), -34);
    shoulder.addChild(shape(g => {
      outlined(g.roundRect(-5, -3, 10, 13, 4), clothTone, 0x483845, 0.9);
      g.moveTo(-4,-0.4).quadraticCurveTo(0,-4,4,-0.4).stroke({color:trim,width:2.1,alpha:0.9});
      g.moveTo(-3,3).quadraticCurveTo(1,0,3,3).stroke({color:trim,width:1,alpha:0.45});
    }));
    const elbow = joint(shoulder, 0, 8);
    elbow.addChild(shape(g => {
      outlined(g.roundRect(-4, -2, 8, 9, 2.5), susan ? clothTone : darkTone, 0x503c4b, 0.9);
      g.roundRect(-4, 3, 8, 2, 1).fill(trim);
      outlined(g.ellipse(0, 9, 4, 3.9), skinTone, 0x8c5860, 0.8);
      g.moveTo(1,8).lineTo(1.8,10).stroke({color:0xbb796a,width:0.65,alpha:0.7});
    }));
    if (sign === 1 && (state.kind !== 'npc' || elder || classId === 'mage')) {
      const weapon = drawWeapon(classId);
      weapon.label = 'player:weapon';
      weapon.position.set(2, 8);
      weapon.rotation = 0.25;
      elbow.addChild(weapon);
      heldWeapon = weapon;
      if (warrior) {
        for (const key of ['warrior-starter-sword', 'warrior-steel-sword'] as const) {
          const sprite = drawWeapon(classId, key);
          sprite.label = `player:weapon:${key}`;
          sprite.position.copyFrom(weapon.position);
          sprite.rotation = weapon.rotation;
          elbow.addChild(sprite);
          alternativeWeapons.push({ key, sprite });
        }
      }
    }
    return { shoulder, elbow };
  });
  if (heldWeapon) showPlayerWeapon(heldWeapon, alternativeWeapons, state.weaponAppearance);
  const torso = joint(body, 0, -31);
  torso.zIndex = 2;
  torso.scale.x = father ? 1.23 : shopkeeper ? 1.13 : 1;
  torso.addChild(shape(g => {
    const hem = susan ? 18 : 15;
    outlined(g.moveTo(-11,-8).quadraticCurveTo(0,-13,11,-8).quadraticCurveTo(10,2,12,7).lineTo(hem,15)
      .quadraticCurveTo(0,20,-hem,15).lineTo(-12,7).quadraticCurveTo(-10,2,-11,-8).closePath(), clothTone, 0x503a46, 0.95);
    g.moveTo(-11,-5).quadraticCurveTo(-5,-10,-1,-5).lineTo(-5,13).lineTo(-11,12).closePath()
      .fill({ color: 0xfff5d7, alpha: 0.28 });
    g.moveTo(1,-5).quadraticCurveTo(5,-9,11,-6).lineTo(12,12).lineTo(2,14).closePath()
      .fill({ color: dark, alpha: 0.47 });
    outlined(g.poly([-8,-9, 0,-3, 8,-9, 5,-3, 0,2, -5,-3]), trimTone, 0x664553, 0.7);
    g.circle(0, -1, 2).fill(accent);
    outlined(g.roundRect(-11, 6, 22, 4.5, 2), darkTone, 0x49384a, 0.7);
    outlined(g.roundRect(-3, 6, 6, 5, 1), gold, 0x78545a, 0.7);
    g.moveTo(-12,14).quadraticCurveTo(0,17,12,14).stroke({ color: trim, width: 1.3 });
    g.moveTo(-6,11).quadraticCurveTo(-7,13,-8,15).moveTo(6,11).quadraticCurveTo(8,13,9,15)
      .stroke({color:dark,width:0.9,alpha:0.55});
    if (shopkeeper) {
      outlined(g.roundRect(6,7,11,10,3),shading.shade(0x92583d),0x563b40,0.8);
      g.roundRect(8,8,7,2,1).fill(gold).circle(12,11,1).fill(cream);
    }
    if (susan) g.poly([0,7,7,12,1,11,-5,14,-6,10]).fill(trimTone);
  }));
  const head = joint(body, 0, -44);
  head.zIndex = 4;
  if (feminine) {
    head.addChild(shape(g => {
      outlined(g.moveTo(-11,-12).quadraticCurveTo(-24,-14,-21,8).lineTo(-12,16).lineTo(-10,2)
        .lineTo(12,2).lineTo(12,15).quadraticCurveTo(24,9,21,-8).closePath(), hairTone, 0x513b46, 0.85);
      g.moveTo(-17,-5).quadraticCurveTo(-20,4,-16,10).moveTo(17,-5).lineTo(17,9)
        .stroke({ color: 0xce9b85, width: 1.3, alpha: 0.55 });
    }));
  }
  head.addChild(shape(g => {
    outlined(g.ellipse(-13.5, -0.5, 4, 5), 0xf2b18a, 0x8c5860, 0.9);
    outlined(g.ellipse(13.5, -0.5, 4, 5), 0xf2b18a, 0x8c5860, 0.9);
    outlined(g.moveTo(-14,-8).quadraticCurveTo(0,-20,14,-8).lineTo(13,3).quadraticCurveTo(11,13,0,13)
      .quadraticCurveTo(-11,13,-13,4).closePath(), skinTone, 0x986664, 0.95);
    g.moveTo(-10,-3).quadraticCurveTo(-7,-10,4,-10).stroke({color:0xffeaca,width:1.6,alpha:0.65,cap:'round'});
    g.moveTo(8,4).quadraticCurveTo(7,8,3,10).stroke({color:0xc77f6e,width:1.5,alpha:0.56,cap:'round'});
    g.ellipse(-6, 6, 4.2, 1.7).fill({ color: 0xf28e89, alpha: 0.65 });
    g.ellipse(7, 6, 4.2, 1.7).fill({ color: 0xf28e89, alpha: 0.65 });
  }));
  if (elder) {
    head.addChild(shape(g => {
      outlined(g.moveTo(-12,4).quadraticCurveTo(-9,8,-5,6).lineTo(5,6).quadraticCurveTo(11,8,13,3)
        .quadraticCurveTo(13,16,5,19).lineTo(1,23).lineTo(-2,19).quadraticCurveTo(-13,16,-12,4).closePath(), shading.shade(0xe9dcca), 0x927d82, 1.1);
      g.moveTo(-8,10).quadraticCurveTo(-5,16,-1,17).moveTo(6,10).lineTo(3,16).stroke({color:0xb9a59e,width:1.2});
    }));
  }
  const face = joint(head, 0, 0);
  face.addChild(shape(g => {
    g.context.batchMode = 'batch';
    for (const x of [-5.5, 5.5]) {
      g.ellipse(x, 1, 3.35, 4.4).fill(0xfffaf3);
      g.ellipse(x + 0.6, 1.3, 2.4, 3.6).fill(shading.shade(susan ? 0x82515d : 0x68536a));
      g.ellipse(x + 0.8, 2.6, 1.6, 1.8).fill(susan ? 0xbe7881 : 0xa2748f);
      g.circle(x, -0.5, 1.05).fill(0xffffff);
      g.moveTo(x - 3, -0.8).quadraticCurveTo(x, -5, x + 3, -0.6).stroke({ color: 0x453044, width: 1.1 });
    }
    if (father) {
      g.moveTo(-5,7).quadraticCurveTo(-3,3,1,6).quadraticCurveTo(4,3,7,7).quadraticCurveTo(4,10,1,8)
        .quadraticCurveTo(-3,10,-5,7).closePath().fill(hairTone);
    } else if (!elder) g.moveTo(-1.9, 7).quadraticCurveTo(0, 8.6, 2.1, 6.9).stroke({ color: 0xaf625c, width: 0.85 });
    g.circle(1, 4.8, 0.65).fill(0xe6a280);
  }));
  const fringe = shape(g => {
    outlined(g.moveTo(-16,3).quadraticCurveTo(-21,-7,-15,-13).lineTo(-10,-17).lineTo(-12,-21)
      .lineTo(-2,-18).lineTo(4,-22).lineTo(7,-18).quadraticCurveTo(20,-17,17,1).lineTo(13,-3)
      .lineTo(10,-8).lineTo(4,-3).lineTo(2,-9).lineTo(-6,-3).lineTo(-5,-10).lineTo(-11,-4)
      .lineTo(-14,2).closePath(), hairTone, 0x503b47, 0.95);
    g.moveTo(-12,-11).quadraticCurveTo(-5,-17,2,-15).moveTo(3,-15).quadraticCurveTo(11,-17,14,-11)
      .stroke({ color: 0xf3c6a2, alpha: 0.45, width: 2, cap: 'round' });
    if (shopkeeper) {
      outlined(g.moveTo(-21,-11).quadraticCurveTo(-18,-16,-12,-16).lineTo(-8,-23).quadraticCurveTo(0,-29,10,-23)
        .lineTo(15,-17).quadraticCurveTo(23,-16,21,-10).quadraticCurveTo(2,-5,-21,-11).closePath(), shading.shade(0x8d6144), 0x5b4342, 0.95);
      g.moveTo(-13,-16).quadraticCurveTo(1,-11,15,-16).stroke({color:gold,width:2});
      g.roundRect(-1,-17,5,4,0.7).fill(cream).roundRect(0,-16,3,2,0.5).fill(0x81644d);
    } else if (!susan && !father && (classId === 'priest' || classId === 'mage')) {
      outlined(g.poly([-13,-13, -8,-21, 0,-18, 8,-21, 13,-13, 0,-12]), clothTone, 0x674052, 0.8);
      g.moveTo(-11,-14).lineTo(0,-13).lineTo(11,-14).stroke({ color: trim, width: 1.5 });
      g.poly([0,-19, 2,-16, 0,-13, -2,-16]).fill(accent);
    }
    if (feminine) {
      g.circle(-14, -9, 3.5).fill(trim).circle(-14, -9, 1.5).fill(accent);
    }
    if (susan) {
      outlined(g.poly([-14,-11,-21,-16,-21,-7,-14,-8,-7,-5,-8,-14]),shading.shade(0xd98d96),0x784e5b,0.75);
      g.circle(-14,-10,2).fill(cream);
    }
  });
  head.addChild(fringe);
  const back = shape(g => {
    outlined(g.moveTo(-14,5).quadraticCurveTo(-23,-14,-4,-20).quadraticCurveTo(19,-24,17,-1)
      .lineTo(13,7).lineTo(7,8).lineTo(5,10).lineTo(-4,9).lineTo(-8,10).closePath(), hairTone, 0x513b46, 0.95);
    g.moveTo(-14,-8).quadraticCurveTo(-5,-19,8,-15).moveTo(11,-12).lineTo(13,-4)
      .stroke({ color: 0xf1b18f, width: 2, alpha: 0.46, cap: 'round' });
    g.roundRect(-7, 5, 14, 3, 1.5).fill(trim);
  });
  head.addChild(back);

  return {
    root,
    height: 68,
    animate({ time, moving, direction, action, actionTime }, actor) {
      if (heldWeapon) showPlayerWeapon(heldWeapon, alternativeWeapons, actor.weaponAppearance);
      const facing = Math.round(direction / (Math.PI / 4));
      const sideways = Math.sin(facing * Math.PI / 4);
      const forward = Math.cos(facing * Math.PI / 4);
      const rear = sideways < -0.2;
      const swing = moving ? Math.sin(time * 13) : 0;
      let attack = 0;
      if (action === 'attack') {
        attack = warrior ? shortPlayerActionRelease(actionTime) : Math.sin(Math.min(1, actionTime / 370) * Math.PI);
      }
      const cast = action === 'cast' ? Math.sin(Math.min(1, actionTime / 530) * Math.PI) : 0;
      const dead = action === 'dead';
      const fallen = dead ? Math.min(1, actionTime / 340) : 0;
      const breathe = Math.sin(time * 3);
      mount.visible = !!actor.mounted && !dead;
      mount.y = 2 + breathe * 2;
      mount.rotation = swing * 0.06;
      wings.visible = !!actor.wings && !dead;
      wings.scale.x = 1 + breathe * 0.16;
      wings.rotation = swing * 0.05;
      body.scale.x = (forward < -0.15 ? -1 : 1) * (0.8 + Math.abs(sideways) * 0.2) * (father ? 1.08 : 1);
      body.y = (actor.mounted ? -11 : 0) - Math.abs(swing) * 2 - breathe * 0.85 - fallen * 6;
      body.rotation = fallen * 1.36 + forward * (swing * 0.035 + attack * 0.16);
      body.alpha = 1 - fallen * 0.48;
      cape.rotation = swing * 0.15 + attack * 0.25;
      head.x = Math.abs(forward) * 2.9;
      head.rotation = swing * 0.05 - attack * 0.13;
      face.x = Math.abs(forward) * 4.5;
      face.scale.x = 0.6 + Math.abs(sideways) * 0.4;
      face.visible = !rear;
      back.visible = rear;
      fringe.visible = !rear;
      arms[0].shoulder.zIndex = forward > 0.4 ? 0 : 3;
      arms[1].shoulder.zIndex = forward > 0.4 ? 3 : 1;
      for (const [i, { hip, boot }] of legs.entries()) {
        hip.rotation = swing * (i ? 0.45 : -0.45);
        boot.rotation = Math.max(0, swing * (i ? -0.5 : 0.5));
      }
      arms[0].shoulder.rotation = swing * 0.33 + cast * 1.13 - 0.1;
      arms[1].shoulder.rotation = -swing * 0.42 - attack * 1.85 - cast * 0.95 + 0.12;
      arms[0].elbow.rotation = -cast * 0.56;
      arms[1].elbow.rotation = 0.13 - attack * 0.72;
    },
  };
}

const beastColors = {
  slime: [0x72bb89, 0x367866, 0xc8efaf], rabbit: [0xe9d6d9, 0x917491, 0xffeee1],
  boar: [0xa67562, 0x68424c, 0xe8a577], wolf: [0x8299a7, 0x485a6c, 0xbdccd2],
  spider: [0x8a6a9b, 0x503c66, 0xb58eae], skeleton: [0xdad7b3, 0x625e72, 0xffedd1],
  golem: [0x9e957f, 0x625e6e, 0x83dfce], dragon: [0xc56b57, 0x773853, 0xeba76e],
  wisp: [0x95c9dc, 0x537fa6, 0xf7e9ed],
};

function isIslandMushroom(state: ActorState) {
  return state.name === '嗜血蘑菇' || state.name === '小蘑菇';
}

function createIslandBeast(state: ActorState): Rig | undefined {
  const type = state.name === '稻草人' ? 'straw' : isIslandMushroom(state) ? 'mushroom' : undefined;
  if (!type) return;
  const root = new Container();
  const scale = state.boss ? 1.25 : 1;
  root.scale.set(scale);
  const body = joint(root,0,0);
  const legs = [-1, 1].map(side => {
    const leg = joint(body, side*8,-10);
    leg.addChild(shape(g => {
      if (type === 'straw') outlined(g.roundRect(-3,0,6,11,2), 0x9a6249, 0x634741);
      else outlined(g.ellipse(side*5,6,8,5), 0xf5cdaf, 0x665750);
    }));
    return leg;
  });
  const upper = joint(body,0,type === 'straw' ? -25 : -15);
  const arms = [-1, 1].map(side => {
    const arm = joint(upper,side*9,1);
    arm.addChild(shape(g => {
      const color = type === 'straw' ? 0xf1c274 : 0xf5cfac;
      outlined(g.moveTo(0,-3).quadraticCurveTo(side*14,-9,side*18,-3).lineTo(side*15,4)
        .lineTo(side*12,4).lineTo(side*10,1).lineTo(0,4).closePath(),color,0x715252);
      g.moveTo(side*10,-2).lineTo(side*15,-3).stroke({color:0xffdf9c,width:1.4});
    }));
    return arm;
  });
  const head = joint(upper, 0, type === 'straw' ? -17 : -3);
  if (type === 'straw') {
    upper.addChildAt(shape(g => {
      outlined(g.poly([-10,-5,10,-5,12,13,0,17,-12,13]), 0xa68864, 0x6d5445);
      g.poly([-10,-3,3,-3,-4,13,-10,11]).fill(0xc7a071);
      g.moveTo(-8,5).lineTo(8,5).moveTo(-8,8).lineTo(8,8).stroke({color:0x6c5544,width:1.25});
      g.moveTo(-5,1).lineTo(-1,4).moveTo(1,1).lineTo(5,4).stroke({color:cream,width:1.25});
    }),2);
    head.addChild(shape(g => {
      outlined(g.ellipse(0,2,13,12),0xf1c687,0x9c6855);
      outlined(g.moveTo(-20,-4).quadraticCurveTo(-14,-9,-10,-9).lineTo(-8,-18).quadraticCurveTo(0,-25,10,-18)
        .lineTo(13,-8).quadraticCurveTo(23,-6,20,-2).quadraticCurveTo(0,5,-20,-4).closePath(),0xba844d,0x7b5347,1.25);
      g.ellipse(-2,-16,7,2.3).fill(0xe5ad62).moveTo(-10,-8).quadraticCurveTo(0,-5,12,-8).stroke({color:0xe1b573,width:2.2});
      g.circle(-5,4,2.3).fill(0x60464a).circle(5,4,2.3).fill(0x60464a);
      g.moveTo(-4,9).quadraticCurveTo(1,13,6,8).stroke({color:0x85514d,width:1.4});
    }));
  } else {
    head.addChild(shape(g => {
      outlined(g.moveTo(-11,1).quadraticCurveTo(-15,14,-10,18).quadraticCurveTo(0,24,12,18)
        .quadraticCurveTo(18,11,12,0).closePath(),0xefc1a4,0x97696b);
      g.ellipse(-5,8,4.3,4.6).fill(cream).ellipse(6,8,4.3,4.6).fill(cream);
      g.circle(-4,8,2.4).fill(0x783b50).circle(6,8,2.4).fill(0x783b50);
      g.moveTo(-3,14).quadraticCurveTo(1,17,5,13).stroke({color:0xa2555f,width:1.3});
      outlined(g.moveTo(-26,1).quadraticCurveTo(-30,-9,-16,-23).quadraticCurveTo(-4,-35,11,-26)
        .quadraticCurveTo(23,-25,28,-9).quadraticCurveTo(35,1,17,4).quadraticCurveTo(0,8,-26,1).closePath(),0xac475c,0x692f4b,1.6);
      g.ellipse(-8,-21,9,4).fill(0xde897c).ellipse(12,-19,4,4).fill(0xffd3a4).ellipse(-13,-12,5,3).fill(0xffd3a4);
      g.moveTo(-22,-2).quadraticCurveTo(0,6,23,-1).stroke({color:0xefa089,width:2.3,alpha:0.78});
    }));
  }
  return {
    root, height:(type === 'straw' ? 65 : 52)*scale,
    animate({time,moving,direction,action,actionTime}) {
      const walk = Math.sin(time*(moving ? 12 : 3));
      const attack = action === 'attack' ? Math.sin(Math.min(1,actionTime/380)*Math.PI) : 0;
      const fallen = action === 'dead' ? Math.min(1,actionTime/360) : 0;
      body.scale.x = Math.cos(direction) < -0.15 ? -1 : 1;
      body.alpha = 1 - fallen*0.63;
      body.rotation = fallen*1.23;
      upper.y = (type === 'straw' ? -25 : -15) - Math.abs(walk)*(moving ? 2.8 : 0.7);
      upper.rotation = walk*(moving ? 0.055 : 0.028)+attack*0.18;
      head.rotation = -walk*0.075-attack*0.22;
      for (let i=0;i<2;i++) {
        legs[i].rotation = moving ? walk*(i ? 0.44 : -0.44) : 0;
        arms[i].rotation = walk*(moving ? 0.24 : 0.04)*(i ? 1 : -1)-attack*(i ? 1.05 : -0.24);
      }
    },
  };
}

function createBeast(state: ActorState): Rig {
  const model = state.model ?? 'slime';
  const [base, shade, highlight] = beastColors[model];
  const root = new Container();
  const body = joint(root, 0, -5);
  const legs = new Container();
  body.addChild(legs);
  const blob = model === 'slime' || model === 'wisp';
  const tall = model === 'skeleton' || model === 'golem';
  const scale = state.boss ? 1.34 : state.kind === 'pet' ? 0.83 : 1;
  root.scale.set(scale);
  const appendages: Container[] = [];
  if (!blob) {
    const count = model === 'spider' ? 8 : tall || model === 'rabbit' ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const side = i < count / 2 ? -1 : 1;
      const leg = joint(legs, side * (8 + i % (count / 2) * 3), -6 - (i % 2) * 3);
      leg.addChild(shape(g => {
        const long = model === 'spider' ? 12 : 7;
        outlined(g.moveTo(-3,-2).quadraticCurveTo(side * 4,-7,side * long,-4)
          .lineTo(side * (long + 3),5).lineTo(side * (long - 2),6).lineTo(side * (long - 4),0)
          .lineTo(-2,4).closePath(), shade);
        g.circle(side * (long - 3), -2, 1.6).fill(highlight);
      }));
      appendages.push(leg);
    }
  }
  const tail = shape(g => {
    if (model === 'wolf' || model === 'dragon' || model === 'boar') {
      outlined(g.moveTo(-11,-18).quadraticCurveTo(-28,-15,-31,-27).quadraticCurveTo(-24,-25,-13,-21)
        .lineTo(-9,-21).closePath(), shade);
      g.moveTo(-29,-26).lineTo(-22,-24).stroke({ color: highlight, width: 1.2, cap: 'round' });
    }
  });
  body.addChild(tail);
  body.addChild(shape(g => {
    if (model === 'slime') {
      outlined(g.moveTo(-22,-5).quadraticCurveTo(-27,-11,-18,-17).quadraticCurveTo(-16,-25,-9,-24)
        .quadraticCurveTo(-2,-30,3,-24).quadraticCurveTo(18,-25,22,-14).quadraticCurveTo(32,-2,17,0)
        .quadraticCurveTo(0,5,-22,-5).closePath(), base, shade, 1.5);
      g.ellipse(-8,-18,9,4).fill({color: highlight, alpha: 0.75}).ellipse(14,-9,3,4).fill(0xa1dfb3);
      g.ellipse(-16,-6,5,2.4).fill(shade).ellipse(13,-2,5,1.6).fill(shade);
    } else if (model === 'wisp') {
      g.ellipse(0,-13,26,24).fill({ color: 0xa4d5ff, alpha: 0.15 });
      outlined(g.moveTo(-17,-9).quadraticCurveTo(-30,-26,-13,-29).lineTo(-11,-21)
        .quadraticCurveTo(1,-29,-2,-39).quadraticCurveTo(15,-35,14,-22).lineTo(21,-27)
        .quadraticCurveTo(29,-6,13,-3).lineTo(2,4).quadraticCurveTo(1,-3,-17,-9).closePath(), base, shade);
      g.ellipse(0,-12,11,10).fill({ color: highlight, alpha: 0.66 });
    } else if (tall) {
      outlined(g.moveTo(-15,-25).lineTo(-10,-36).lineTo(12,-35).lineTo(17,-26)
        .lineTo(14,-12).lineTo(7,-5).lineTo(-7,-5).lineTo(-14,-13).closePath(), shade);
      for (const x of [-10, 0, 10]) {
        outlined(g.roundRect(x - 5,-27,10,17,3),base,shade);
        g.moveTo(x-3,-24).lineTo(x+2,-24).stroke({color:highlight,width:1.6});
      }
      g.poly([-5,-23, 0,-29, 6,-23, 1,-15]).fill(highlight);
    } else {
      outlined(g.ellipse(-4, -16, model === 'rabbit' ? 14 : 22, 13), base, shade, 1.3);
      g.ellipse(-7,-21,13,5).fill({color: highlight,alpha: 0.65});
      g.ellipse(-9,-9,10,4).fill({color: shade,alpha: 0.38});
    }
  }));
  const headY = tall ? -37 : blob ? -14 : -20;
  const head = joint(body, tall || blob ? 0 : 10, headY);
  head.addChild(shape(g => {
    if (model === 'rabbit') {
      for (const [x, slant] of [[-6, -6], [4, 3]]) {
        outlined(g.moveTo(x-3,-4).quadraticCurveTo(x+slant-6,-22,x+slant,-27)
          .quadraticCurveTo(x+slant+8,-20,x+4,-3).closePath(), base, shade);
        g.moveTo(x,-7).quadraticCurveTo(x+slant,-18,x+slant,-21).stroke({ color: 0xef9eb2, width: 3, cap: 'round' });
      }
    }
    if (model === 'wolf' || model === 'boar' || model === 'dragon') {
      outlined(g.poly([-14,-3, -17,-19, -4,-13, 7,-12, 12,-21, 16,-13, 12,-1]), shade);
      g.poly([-14,-11, -12,-17, -7,-11, 8,-11, 12,-16, 13,-9]).fill(highlight);
    }
    if (!blob) {
      outlined(g.moveTo(-14,-7).quadraticCurveTo(-11,-16,4,-13).quadraticCurveTo(15,-13,16,-4)
        .quadraticCurveTo(22,0,16,7).quadraticCurveTo(1,12,-12,4).closePath(), base, shade, 1.3);
      g.moveTo(-8,-7).quadraticCurveTo(1,-13,9,-8).stroke({ color: highlight, width: 2.5, cap: 'round' });
    }
    if (model === 'dragon') {
      outlined(g.moveTo(-11,-4).quadraticCurveTo(-23,-24,-28,-13).lineTo(-36,-19)
        .lineTo(-32,-5).lineTo(-24,-6).lineTo(-24,1).closePath(), 0xba6678, shade);
      g.moveTo(-29,-12).lineTo(-17,-4).moveTo(-23,-12).lineTo(-16,-5).stroke({color:highlight,width:1.05});
    }
    for (const x of [-5, 5]) {
      g.ellipse(x, -1, 3, 3.5).fill(0xfff0cf).ellipse(x+0.7,-0.5,2,2.6).fill(0x412c49).circle(x, -1.8, 0.75).fill(0xffffff);
    }
    if (model === 'boar') {
      outlined(g.ellipse(10,4,7,4.5), 0xd38d87, shade);
      g.circle(8,4,1.2).fill(shade).circle(13,4,1.2).fill(shade);
      outlined(g.moveTo(6,6).quadraticCurveTo(5,10,2,4).quadraticCurveTo(0,11,7,11).closePath(), cream, shade, 0.65);
    } else {
      g.moveTo(-2,5).quadraticCurveTo(1,8,4,4).stroke({color:shade,width:1.25,cap:'round'});
    }
    if (model === 'golem') {
      g.moveTo(8,-12).lineTo(3,-7).lineTo(7,-4).lineTo(2,1).stroke({color:shade,width:1.05});
    }
  }));
  const height = (tall ? 60 : model === 'rabbit' || model === 'dragon' ? 58 : 40) * scale;
  return {
    root,
    height,
    animate({ time, direction, moving, action, actionTime }) {
      const pace = Math.sin(time * (moving ? 13 : 4));
      const lunge = action === 'attack' || action === 'cast' ? Math.sin(Math.min(1, actionTime / 430) * Math.PI) : 0;
      const fallen = action === 'dead' ? Math.min(1, actionTime / 330) : 0;
      body.x = Math.cos(direction) * lunge * 6;
      body.y = -5 - (model === 'wisp' ? 8 + pace * 4 : moving ? Math.abs(pace) * 4 : pace * 0.8);
      body.scale.x = (Math.cos(direction) < 0 ? -1 : 1) * (1 + lunge * 0.14);
      body.scale.y = 1 + (blob ? pace * 0.06 : 0) - fallen * 0.53;
      body.rotation = lunge * 0.13 + fallen * 0.62;
      body.alpha = 1 - fallen * 0.66;
      head.rotation = pace * 0.08 - lunge * 0.22;
      tail.rotation = pace * 0.08;
      for (const [index, leg] of appendages.entries()) leg.rotation = pace * (index % 2 ? 0.46 : -0.46) * (moving ? 1 : 0.2);
    },
  };
}

export function rigAtlasFor(state: ActorState, feminine: boolean): keyof RigAtlases | undefined {
  if (state.kind === 'player' || state.kind === 'npc') {
    if (state.kind === 'npc') {
      if (state.id === 'island-chief' || state.id === 'island-wells') return 'elder';
      const townNpc = townNpcAtlasFor(state.id);
      if (townNpc) return townNpc;
      if (state.id === 'muguang-forge') return 'smith';
    }
    if (state.kind === 'player' && !state.wings && !state.mounted) {
      if (state.classId === 'warrior') return feminine ? 'warriorFemale' : 'warriorMale';
      if (state.classId === 'mage') return feminine ? 'mageFemale' : 'mageMale';
      if (state.classId === 'rogue') return feminine ? 'rogueFemale' : 'rogueMale';
      if (state.classId === 'priest') return feminine ? 'priestFemale' : 'priestMale';
      if (state.classId === 'merchant') return feminine ? 'merchantFemale' : 'merchantMale';
    }
    if (state.classId === 'ranger' && !feminine && !state.wings && !state.mounted) return 'ranger';
    return;
  }
  if (state.kind === 'monster') {
    if (state.definitionId === 'pink-rabbit') return 'islandRabbit';
    if (state.definitionId === 'scarecrow') return 'islandScarecrow';
    if (state.definitionId && isPuppetDefinition(state.definitionId)) return 'puppet';
    if (state.definitionId && isTreeDemonDefinition(state.definitionId)) return 'treeDemon';
    if (state.definitionId === 'butterfly') return 'butterfly';
    if (state.definitionId && isRodentDefinition(state.definitionId)) return 'rodent';
    if (state.definitionId && isBeeDefinition(state.definitionId)) return 'bee';
  }
  if (isIslandMushroom(state)) return 'mushroom';
}

export function createRig(state: ActorState, feminine: boolean, shading: RigShading, atlases: RigAtlases): Rig {
  const kind = rigAtlasFor(state, feminine);
  let rig: Rig | undefined;
  switch (kind) {
    case 'warriorMale':
    case 'warriorFemale':
    case 'mageMale':
    case 'mageFemale':
    case 'rogueMale':
    case 'rogueFemale':
    case 'priestMale':
    case 'priestFemale':
    case 'merchantMale':
    case 'merchantFemale': rig = atlases[kind]?.create(state); break;
    case 'islandRabbit': rig = atlases.islandRabbit?.create(state.definitionId); break;
    case 'islandScarecrow': rig = atlases.islandScarecrow?.create(state.definitionId); break;
    case 'puppet': rig = atlases.puppet?.create(state.definitionId); break;
    case 'treeDemon': rig = atlases.treeDemon?.create(state.definitionId); break;
    case 'elder': rig = atlases.elder?.create(); break;
    case 'townNpc':
    case 'villageFather':
    case 'villageSusan':
    case 'capitalMerchant': rig = atlases[kind]?.create(state.id); break;
    case 'smith': rig = atlases.smith?.create(state.id); break;
    case 'rodent': rig = atlases.rodent?.create(state.definitionId); break;
    case 'ranger': rig = atlases.ranger?.create(state); break;
    case 'bee': rig = atlases.bee?.create(state.definitionId); break;
    case 'butterfly': rig = atlases.butterfly?.create(state.definitionId); break;
    case 'mushroom': rig = atlases.mushroom?.create(!!state.boss); break;
  }
  if (rig) return rig;
  if (state.kind === 'player' || state.kind === 'npc') return createHuman(state, feminine, shading);
  if (state.kind === 'monster' && state.definitionId === 'stink-turtle') return createTurtleRig(shading);
  return createIslandBeast(state) ?? createBeast(state);
}
