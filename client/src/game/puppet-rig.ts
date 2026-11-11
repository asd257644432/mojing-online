import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { BipedGait, bipedHipHeight, bipedSole, bipedThigh } from './biped-gait';
import type { Rig, RigPose } from './rigs';

const atlasPath = '/assets/monsters/puppet-rig.png';
const atlasSize = 1254;
const cellSize = atlasSize / 3;
const padding = 3;
const upperArm = 12.0, forearm = 12.4;

type Pixel = readonly [x: number, y: number];
type Cutout = {
  bounds: readonly [left: number, top: number, right: number, bottom: number];
  pivot: Pixel;
  width: number;
  height: number;
  tip?: Pixel;
};

const cutouts = {
  headFront: { bounds: [59, 80, 363, 364], pivot: [212, 351], width: 38, height: 34.5 },
  headBack: { bounds: [479, 82, 778, 358], pivot: [625, 344], width: 37, height: 34.5 },
  torsoFront: { bounds: [937, 47, 1155, 385], pivot: [1046, 334], width: 31.5, height: 33.6 },
  torsoBack: { bounds: [99, 462, 326, 802], pivot: [212, 748], width: 31.5, height: 33.6 },
  upperArm: { bounds: [556, 479, 697, 757], pivot: [628, 502], tip: [619, 735], width: 10.8, height: 13.5 },
  forearm: { bounds: [967, 481, 1106, 772], pivot: [1044, 500], tip: [1009, 715], width: 11, height: 14.2 },
  thigh: { bounds: [134, 899, 293, 1194], pivot: [224, 925], tip: [194, 1160], width: 10.9, height: 11.5 },
  shin: { bounds: [535, 888, 702, 1203], pivot: [632, 907], tip: [601, 1186], width: 12.6, height: 12.6 },
  club: { bounds: [991, 880, 1110, 1212], pivot: [1020, 1152], tip: [1065, 927], width: 15.2, height: 30.8 },
} as const satisfies Record<string, Cutout>;

type Part = keyof typeof cutouts;
type LimbPart = 'upperArm' | 'forearm' | 'thigh' | 'shin';
const frontCollar: Pixel = [1046, 67];
const backCollar: Pixel = [214, 475];
const frontShoulders: readonly Pixel[] = [[974, 100], [1118, 99]];
const backShoulders: readonly Pixel[] = [[131, 511], [286, 508]];

interface PuppetProfile {
  scale: readonly [x: number, y: number];
  headScale: number;
  clubScale: readonly [x: number, y: number];
  attackTempo: number;
  attackWeight: number;
  height: number;
  hitHalfWidth: number;
}

// Proportions and timings are reconstruction values based on the early Mainland designs.
// The soldier's held object is obscured in W027, so its shorter club is a reconstruction.
const profiles = {
  'puppet-soldier': { scale: [.87, .91], headScale: 1.035, clubScale: [.78, .82], attackTempo: 1.16, attackWeight: .84,
    height: 72, hitHalfWidth: 28 },
  'puppet-general': { scale: [1, 1], headScale: 1, clubScale: [1, 1], attackTempo: 1, attackWeight: 1,
    height: 78, hitHalfWidth: 32 },
  'puppet-giant': { scale: [1.60, 1.46], headScale: .88, clubScale: [1.31, 1.24], attackTempo: .90, attackWeight: 1.18,
    height: 108, hitHalfWidth: 57 },
} as const satisfies Record<string, PuppetProfile>;

export function isPuppetDefinition(id: string): id is keyof typeof profiles {
  return Object.hasOwn(profiles, id);
}

function joint(parent: Container, label: string, x = 0, y = 0) {
  const node = new Container({ label: `puppet:${label}`, x, y });
  parent.addChild(node);
  return node;
}

const mix = (from: number, to: number, ratio: number) => from + (to - from) * ratio;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function ease(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function offset(sprite: Sprite, part: Part, [x, y]: Pixel) {
  const [px, py] = cutouts[part].pivot;
  return { x: (x - px) * sprite.scale.x, y: (y - py) * sprite.scale.y };
}

type Views = readonly [front: Sprite, back: Sprite];
function turnViews([front, back]: Views, rear: number) {
  // Keep the dominant view opaque during the blend.
  front.alpha = Math.min(1, (1 - rear) * 2);
  back.alpha = Math.min(1, rear * 2);
  front.visible = front.alpha > 0;
  back.visible = back.alpha > 0;
}

export class PuppetRigAtlas {
  private readonly textures = new Map<Part, Texture>();

  static async load() {
    const sheet = await Assets.load<Texture>(atlasPath);
    if (sheet.width !== atlasSize || sheet.height !== atlasSize) throw new Error(`Puppet atlas must be ${atlasSize}×${atlasSize}`);
    return new PuppetRigAtlas(sheet);
  }

  private constructor(sheet: Texture) {
    for (const [part, { bounds: [left, top, right, bottom] }] of Object.entries(cutouts) as [Part, Cutout][]) {
      const column = Math.floor(left / cellSize) * cellSize;
      const row = Math.floor(top / cellSize) * cellSize;
      const x = Math.max(column, left - padding), y = Math.max(row, top - padding);
      const frame = new Rectangle(x, y, Math.min(column + cellSize, right + padding) - x,
        Math.min(row + cellSize, bottom + padding) - y);
      this.textures.set(part, new Texture({ source: sheet.source, frame, label: `puppet:${part}` }));
    }
  }

  private piece(parent: Container, part: Part, mirror = false) {
    const cutout = cutouts[part];
    const texture = this.textures.get(part)!;
    const sprite = new Sprite({ texture, label: `puppet:${part}${mirror ? '-mirror' : ''}` });
    sprite.anchor.set((cutout.pivot[0] - texture.frame.x) / texture.width, (cutout.pivot[1] - texture.frame.y) / texture.height);
    sprite.scale.set((mirror ? -1 : 1) * cutout.width / texture.width, cutout.height / texture.height);
    parent.addChild(sprite);
    return sprite;
  }

  private views(parent: Container, front: Part, back: Part): Views {
    return [this.piece(parent, front), this.piece(parent, back)];
  }

  private limb(parent: Container, part: LimbPart, mirror: boolean, x: number, y: number) {
    const sprite = this.piece(parent, part, mirror);
    const { pivot, tip } = cutouts[part];
    const dx = (tip[0] - pivot[0]) * sprite.scale.x;
    const dy = Math.sqrt(x * x + y * y - dx * dx);
    sprite.scale.y = dy / (tip[1] - pivot[1]);
    sprite.rotation = Math.atan2(dx, dy) - Math.atan2(x, y);
  }

  create(definitionId?: string): Rig | undefined {
    if (!definitionId || !isPuppetDefinition(definitionId) || !this.textures.size) return;
    const { scale: [scaleX, scaleY], headScale, clubScale, attackTempo, attackWeight, height, hitHalfWidth } = profiles[definitionId];
    const root = new Container({ label: 'puppet-articulated-rig' });
    root.scale.set(scaleX, scaleY);
    const body = joint(root, 'body');
    body.sortableChildren = true;
    const legs = ([-1, 1] as const).map(side => {
      const name = side < 0 ? 'left' : 'right';
      const hip = joint(body, `${name}-hip`, side * 4.5, -bipedHipHeight);
      this.limb(hip, 'thigh', side < 0, side * bipedThigh.x, bipedThigh.y);
      const knee = joint(hip, `${name}-knee`, side * bipedThigh.x, bipedThigh.y);
      this.limb(knee, 'shin', side < 0, side * bipedSole.x, bipedSole.y);
      joint(knee, `sole-${name}`, side * bipedSole.x, bipedSole.y);
      return { side, hip, knee };
    });
    const gait = new BipedGait();
    const chest = joint(body, 'chest', 0, -bipedHipHeight);
    chest.sortableChildren = true;
    chest.zIndex = 2;
    const torso = this.views(chest, 'torsoFront', 'torsoBack');
    const arms = ([-1, 1] as const).map((side, index) => {
      const left = side < 0;
      const name = left ? 'left' : 'right';
      const front = offset(torso[0], 'torsoFront', frontShoulders[index]);
      const back = offset(torso[1], 'torsoBack', backShoulders[index]);
      const shoulder = joint(chest, `${name}-shoulder`, front.x, front.y);
      this.limb(shoulder, 'upperArm', left, 0, upperArm);
      const elbow = joint(shoulder, `${name}-elbow`, 0, upperArm);
      const hand = joint(elbow, `${name}-grip`, 0, forearm);
      return { shoulder, elbow, hand, left, front, back };
    });
    const [free, weapon] = arms;
    const club = this.piece(weapon.hand, 'club');
    club.scale.set(club.scale.x * clubScale[0], club.scale.y * clubScale[1]);
    const clubTip = offset(club, 'club', cutouts.club.tip);
    club.rotation = Math.atan2(-clubTip.x, -clubTip.y);
    for (const { elbow, left } of arms) this.limb(elbow, 'forearm', left, 0, forearm);

    const neck = joint(chest, 'neck');
    neck.zIndex = 4;
    const head = this.views(neck, 'headFront', 'headBack');
    for (const sprite of head) sprite.scale.set(sprite.scale.x * headScale, sprite.scale.y * headScale);
    const frontNeck = offset(torso[0], 'torsoFront', frontCollar);
    const backNeck = offset(torso[1], 'torsoBack', backCollar);
    let yaw = Math.PI / 2;
    let facingSide = -1;
    let lastTime: number | undefined;
    let preparation = 0, swing = 0;
    let hitAge = Infinity, hitDirection = 0;

    function pose({ time, direction, action, actionTime, travelX = 0, travelY = 0, deltaSeconds }: RigPose) {
      const dt = clamp(deltaSeconds ?? (lastTime === undefined ? 1 / 60 : time - lastTime), 0, .06);
      lastTime = time;
      const blend = 1 - Math.exp(-dt * 14);
      const dead = action === 'dead';
      if (!dead) yaw += Math.atan2(Math.sin(direction - yaw), Math.cos(direction - yaw)) * blend;
      const horizontal = Math.cos(yaw), depth = Math.sin(yaw);
      if (Math.abs(horizontal) > .24) facingSide = Math.sign(horizontal);
      const rear = ease((-depth - .08) / .52);
      // The painted views are frontal: project the turn continuously instead of
      // hard-mirroring the face and its asymmetric details at a yaw threshold.
      turnViews(torso, rear);
      turnViews(head, rear);

      const attacking = action === 'attack' || action === 'cast';
      const actionBlend = 1 - Math.exp(-dt * 24);
      const attackAge = actionTime * attackTempo;
      preparation = mix(preparation, attacking ? ease(attackAge / 112) * (1 - ease((attackAge - 110) / 85)) : 0, actionBlend);
      swing = mix(swing, attacking ? ease((attackAge - 96) / 103) * (1 - ease((attackAge - 216) / 215)) : 0, actionBlend);
      const fallen = dead ? ease(actionTime / 425) : 0;
      const strike = swing * (1 - fallen) * attackWeight;
      const windup = preparation * (1 - fallen) * attackWeight;
      body.scale.x = 1.07 - Math.abs(horizontal) * .14;
      // The feet are tracked in rig units. Convert world displacement before solving contacts.
      const step = gait.advance(travelX / scaleX, travelY / scaleY, dt, blend, 5 * body.scale.x,
        !attacking && !dead && hitAge >= 90, true) * (1 - fallen);
      hitAge += dt * 1000;
      const hit = dead ? 0 : Math.sin(Math.PI * Math.min(1, hitAge / 185));
      const breath = Math.sin(time * 2.7) * (1 - fallen);
      const lean = horizontal * (strike * .087 - windup * .042) + Math.cos(hitDirection) * hit * .052;
      body.y = gait.plant(legs, body.scale.x, lean, 1.26 - Math.abs(step) * .7 - breath * .24, true) + fallen * 4.6;
      body.rotation = lean + fallen * facingSide * 1.37;
      body.alpha = 1 - fallen * .53;

      chest.x = horizontal * (strike * 3.4 - windup * 1.9) + Math.cos(hitDirection) * hit * 1.9;
      chest.y = -bipedHipHeight + Math.sin(hitDirection) * hit * 1.1 + depth * (strike * 1.6 - windup * .8);
      chest.rotation = horizontal * (strike * .095 - windup * .072) - step * .058;
      neck.position.set(mix(frontNeck.x, backNeck.x, rear) + horizontal * 1.4, mix(frontNeck.y, backNeck.y, rear));
      neck.rotation = horizontal * .105 - chest.rotation * .48 + hit * .09;
      for (let index = 0; index < arms.length; index++) {
        const { front, back } = arms[index];
        arms[index].shoulder.position.set(mix(front.x, back.x, rear), mix(front.y, back.y, rear));
      }
      free.shoulder.rotation = .16 - step * .25 - windup * .24 + strike * .38;
      free.elbow.rotation = .17 + windup * .48;
      weapon.shoulder.rotation = -.17 + step * .26 + windup * .74 - strike * (horizontal * 1.12 + depth * .20);
      weapon.elbow.rotation = -.26 + windup * 1.94 - strike * (.31 + horizontal * .18);
      const clubTilt = .31 + horizontal * .18 - windup * .92 + strike * (horizontal * 1.13 + depth * .91);
      weapon.hand.rotation = clubTilt - chest.rotation - weapon.shoulder.rotation - weapon.elbow.rotation;
      free.shoulder.zIndex = horizontal < -.27 && rear < .5 ? 1 : -1;
      weapon.shoulder.zIndex = rear > .5 && strike < .12 ? -1 : 1;
    }

    pose({ time: 0, direction: Math.PI / 2, moving: false, action: 'idle', actionTime: 0 });
    return {
      root, height, hitHalfWidth, animate: pose,
      reactToHit(direction, age) {
        if (age >= 185) return;
        hitAge = age;
        hitDirection = direction;
      },
    };
  }

  destroy() {
    for (const texture of this.textures.values()) texture.destroy(false);
    this.textures.clear();
  }
}
