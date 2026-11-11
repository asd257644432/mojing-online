import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Rig } from './rigs';

const atlasPath = '/assets/characters/town-smith.png';
const atlasSize = 1254;
const padding = 3;
const thighLength = 11.1, shinLength = 11.3;
const upperArmLength = 10.8, forearmLength = 11.3;

type Pixel = readonly [x: number, y: number];
type Cutout = {
  bounds: readonly [left: number, top: number, right: number, bottom: number];
  pivot: Pixel;
  width: number;
} & ({ height: number } | { tip: Pixel; length: number });

const cutouts = {
  head: { bounds: [83, 21, 389, 394], pivot: [247, 372], width: 24.4, height: 21.4 },
  torso: { bounds: [473, 16, 779, 411], pivot: [624, 387], width: 30.2, height: 29.0 },
  upperArm: { bounds: [948, 26, 1154, 395], pivot: [1052, 65], tip: [1033, 363], width: 10.3, length: upperArmLength },
  forearm: { bounds: [120, 445, 315, 814], pivot: [240, 470], tip: [173, 781], width: 9.1, length: forearmLength },
  hand: { bounds: [476, 480, 749, 771], pivot: [690, 516], width: 7.2, height: 7.0 },
  thigh: { bounds: [909, 443, 1182, 819], pivot: [1055, 475], tip: [1006, 784], width: 10.8, length: thighLength },
  shin: { bounds: [131, 860, 308, 1235], pivot: [211, 888], tip: [213, 1204], width: 9.2, length: shinLength },
  shoe: { bounds: [444, 922, 792, 1198], pivot: [682, 969], width: 13.0, height: 8.0 },
  hammer: { bounds: [945, 866, 1148, 1236], pivot: [1041, 1115], width: 14.4, height: 26.4 },
} as const satisfies Record<string, Cutout>;

type Part = keyof typeof cutouts;
const collar: Pixel = [628, 60];
const farShoulder: Pixel = [512, 95];
const nearShoulder: Pixel = [733, 104];
const handleGrip: Pixel = [579, 679];
const hammerHead: Pixel = [1040, 920];
const soleY = 1172;

function spriteOffset(sprite: Sprite, part: Part, [x, y]: Pixel) {
  const [px, py] = cutouts[part].pivot;
  return { x: (x - px) * sprite.scale.x, y: (y - py) * sprite.scale.y };
}

function joint(parent: Container, label: string, x = 0, y = 0) {
  const child = new Container({ label: `smith:${label}`, x, y });
  parent.addChild(child);
  return child;
}

function ease(t: number) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

interface Chain {
  root: Container;
  bend: Container;
  upper: number;
  lower: number;
  side: -1 | 1;
}

function aim({ root, bend, upper, lower, side }: Chain, x: number, y: number) {
  const dx = x - root.x, dy = y - root.y;
  const reach = Math.max(Math.abs(upper - lower) + .001, Math.min(upper + lower - .001, Math.hypot(dx, dy)));
  const rootAngle = Math.acos((upper ** 2 + reach ** 2 - lower ** 2) / (2 * upper * reach));
  const jointAngle = Math.acos((upper ** 2 + lower ** 2 - reach ** 2) / (2 * upper * lower));
  root.rotation = Math.atan2(-dx, dy) + side * rootAngle;
  bend.rotation = side * (jointAngle - Math.PI);
}

export class SmithRigAtlas {
  private readonly textures = new Map<Part, Texture>();

  static async load() {
    const sheet = await Assets.load<Texture>(atlasPath);
    if (sheet.width !== atlasSize || sheet.height !== atlasSize) throw new Error(`Smith atlas must be ${atlasSize}×${atlasSize}`);
    return new SmithRigAtlas(sheet);
  }

  private constructor(sheet: Texture) {
    for (const [part, { bounds: [left, top, right, bottom] }] of Object.entries(cutouts) as [Part, Cutout][]) {
      const frame = new Rectangle(left - padding, top - padding, right - left + 2 * padding, bottom - top + 2 * padding);
      this.textures.set(part, new Texture({ source: sheet.source, frame, label: `smith:${part}` }));
    }
  }

  private piece(parent: Container, part: Part, far = false) {
    const texture = this.textures.get(part)!;
    const cutout = cutouts[part];
    const [px, py] = cutout.pivot;
    const sprite = new Sprite({ texture, label: `smith:${far ? 'far-' : ''}${part}` });
    sprite.anchor.set((px - texture.frame.x) / texture.width, (py - texture.frame.y) / texture.height);
    const width = cutout.width * (far ? (part === 'shoe' ? .92 : -.91) : 1);
    const sx = width / texture.width;
    if ('tip' in cutout) {
      // Point the measured joint-to-joint vector down the length of its bone.
      const dx = (cutout.tip[0] - px) * sx;
      const dy = Math.sqrt(cutout.length ** 2 - dx ** 2);
      sprite.scale.set(sx, dy / (cutout.tip[1] - py));
      sprite.rotation = Math.atan2(dx, dy);
    } else sprite.scale.set(sx, cutout.height / texture.height);
    if (far) sprite.tint = 0xdcd1c7;
    parent.addChild(sprite);
    return sprite;
  }

  create(id: string): Rig | undefined {
    if (id !== 'muguang-forge' || !this.textures.size) return;
    const root = new Container({ label: 'smith-articulated-rig' });
    const leg = (far: boolean) => {
      const side = far ? 'far' : 'near';
      const hip = joint(root, `${side}-hip`);
      this.piece(hip, 'thigh', far);
      const knee = joint(hip, `${side}-knee`, 0, thighLength);
      this.piece(knee, 'shin', far);
      const ankle = joint(root, `${side}-ankle`, far ? -7.4 : 7.8);
      const boot = this.piece(ankle, 'shoe', far);
      ankle.y = (cutouts.shoe.pivot[1] - soleY) * boot.scale.y - (far ? 1.2 : 0);
      const chain: Chain = { root: hip, bend: knee, upper: thighLength, lower: shinLength, side: 1 };
      return { chain, ankle, x: far ? -6.2 : 6.2, y: far ? -.7 : .15 };
    };
    const legs = [leg(true), leg(false)];

    const chest = joint(root, 'chest');
    const torso = this.piece(chest, 'torso');
    const arm = (far: boolean) => {
      const side = far ? 'far' : 'near';
      const pivot = spriteOffset(torso, 'torso', far ? farShoulder : nearShoulder);
      const shoulder = joint(chest, `${side}-shoulder`, pivot.x, pivot.y);
      this.piece(shoulder, 'upperArm', far);
      const elbow = joint(shoulder, `${side}-elbow`, 0, upperArmLength);
      this.piece(elbow, 'forearm', far);
      const wrist = joint(elbow, `${side}-wrist`, 0, forearmLength);
      const tool = far ? undefined : this.piece(wrist, 'hammer');
      const hand = this.piece(wrist, 'hand', far);
      const grip = spriteOffset(hand, 'hand', handleGrip);
      // Align the diagonal painted wrist-to-grip vector before mounting the hammer.
      hand.rotation = Math.atan2(grip.x, grip.y);
      if (tool) {
        const head = spriteOffset(tool, 'hammer', hammerHead);
        tool.position.set(0, Math.hypot(grip.x, grip.y));
        tool.rotation = Math.atan2(-head.x, -head.y);
      }
      const chain: Chain = { root: shoulder, bend: elbow, upper: upperArmLength, lower: forearmLength, side: far ? 1 : -1 };
      return { chain, wrist };
    };
    const farArm = arm(true);
    chest.setChildIndex(farArm.chain.root, 0);
    const nearArm = arm(false);
    const neckPoint = spriteOffset(torso, 'torso', collar);
    const neck = joint(chest, 'neck', neckPoint.x, neckPoint.y);
    this.piece(neck, 'head');

    function pose(time: number) {
      const breath = Math.sin(time * 2.1);
      const shift = Math.sin(time * .86 + .38);
      const cycle = time % 15;
      const inspect = ease((cycle - 7.8) / 1.05) * (1 - ease((cycle - 10.55) / 1.23));
      const glance = ease((cycle - 8.4) / .8) * (1 - ease((cycle - 10.4) / .88));
      chest.position.set(shift * .95 - inspect * .45, -24.8 - breath * .42 + inspect * .28);
      chest.rotation = shift * .024 - inspect * .028;
      neck.rotation = -chest.rotation * .5 + breath * .012 - glance * .145;

      aim(farArm.chain, -13.3 + inspect * 3.1, -1.8 - inspect * 1.5 + breath * .2);
      farArm.wrist.rotation = .12 - farArm.chain.root.rotation - farArm.chain.bend.rotation;
      aim(nearArm.chain, 13.8 - inspect * 17.2 + shift * .38, -1.65 - inspect * 16.8 + breath * .22);
      const toolTilt = .31 - inspect * .61 + glance * Math.sin((cycle - 8.7) * 3.4) * .13;
      nearArm.wrist.rotation = toolTilt - nearArm.chain.root.rotation - nearArm.chain.bend.rotation;

      const cos = Math.cos(chest.rotation), sin = Math.sin(chest.rotation);
      for (const { chain, ankle, x, y } of legs) {
        chain.root.position.set(chest.x + x * cos - y * sin, chest.y + x * sin + y * cos);
        aim(chain, ankle.x, ankle.y);
      }
    }

    pose(0);
    return { root, height: 70, hitHalfWidth: 29, animate({ time }) { pose(time); } };
  }

  destroy() {
    for (const texture of this.textures.values()) texture.destroy(false);
    this.textures.clear();
  }
}
