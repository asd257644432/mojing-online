import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Rig } from './rigs';

const atlasSize = 1254;
const padding = 3;
const upperLeg = 11.0;
const lowerLeg = 10.8;
const upperArm = 9.0;
const lowerArm = 8.4;

type Pixel = readonly [x: number, y: number];
interface PartFrame {
  bounds: readonly [left: number, top: number, right: number, bottom: number];
  pivot: Pixel;
  width: number;
}
type SizedCutout = PartFrame & { height: number };
type Cutout = SizedCutout | (PartFrame & { tip: Pixel; length: number });

const townCutouts = {
  head: { bounds: [27, 24, 384, 401], pivot: [223, 390], width: 20.4, height: 20.2 },
  torso: { bounds: [493, 14, 756, 410], pivot: [619, 388], width: 23.2, height: 27.0 },
  upperArm: { bounds: [947, 24, 1144, 405], pivot: [1036, 67], tip: [1042, 386], width: 7.9, length: upperArm },
  forearm: { bounds: [134, 437, 289, 819], pivot: [216, 461], tip: [185, 800], width: 6.0, length: lowerArm },
  hand: { bounds: [494, 440, 731, 817], pivot: [641, 463], width: 4.7, height: 6.3 },
  thigh: { bounds: [937, 433, 1161, 821], pivot: [1048, 459], tip: [1020, 798], width: 8.7, length: upperLeg },
  shin: { bounds: [127, 851, 297, 1240], pivot: [202, 880], tip: [214, 1213], width: 7.6, length: lowerLeg },
  shoe: { bounds: [434, 933, 804, 1172], pivot: [710, 967], width: 11.1, height: 6.8 },
  satchel: { bounds: [919, 921, 1187, 1183], pivot: [1053, 1054], width: 8.4, height: 9.0 },
} as const satisfies Record<string, Cutout>;

type Part = keyof typeof townCutouts;

const capitalCutouts = {
  head: { bounds: [89, 77, 341, 370], pivot: [210, 352], width: 20.4, height: 21 },
  torso: { bounds: [492, 60, 751, 390], pivot: [623, 353], width: 24, height: 33.2 },
  upperArm: { bounds: [965, 84, 1124, 375], pivot: [1025, 120], tip: [1058, 355], width: 7.9, length: upperArm },
  forearm: { bounds: [145, 490, 287, 782], pivot: [221, 510], tip: [190, 754], width: 6, length: lowerArm },
  hand: { bounds: [525, 513, 701, 754], pivot: [646, 554], width: 4.7, height: 6.3 },
  thigh: { bounds: [944, 466, 1129, 806], pivot: [1053, 500], tip: [1034, 776], width: 8.7, length: upperLeg },
  shin: { bounds: [149, 873, 290, 1200], pivot: [212, 902], tip: [219, 1174], width: 7.6, length: lowerLeg },
  shoe: { bounds: [481, 938, 761, 1150], pivot: [674, 976], width: 11.1, height: 6.8 },
  satchel: { bounds: [948, 947, 1157, 1149], pivot: [1059, 1016], width: 7.6, height: 7.4 },
} as const satisfies Record<Part, Cutout>;

const fatherCutouts = {
  head: { bounds: [88, 70, 354, 377], pivot: [214, 362], width: 21.2, height: 22.2 },
  torso: { bounds: [494, 53, 757, 390], pivot: [623, 355], width: 24, height: 32 },
  upperArm: { bounds: [961, 78, 1126, 382], pivot: [1028, 112], tip: [1058, 360], width: 7.9, length: upperArm },
  forearm: { bounds: [141, 486, 288, 794], pivot: [222, 509], tip: [187, 770], width: 6, length: lowerArm },
  hand: { bounds: [522, 527, 690, 763], pivot: [642, 550], width: 4.7, height: 6.3 },
  thigh: { bounds: [937, 459, 1128, 813], pivot: [1052, 494], tip: [1039, 784], width: 8.7, length: upperLeg },
  shin: { bounds: [143, 868, 296, 1208], pivot: [210, 899], tip: [220, 1183], width: 7.6, length: lowerLeg },
  shoe: { bounds: [469, 930, 758, 1156], pivot: [675, 966], width: 11.1, height: 6.8 },
  satchel: { bounds: [938, 946, 1157, 1154], pivot: [1049, 1010], width: 7.6, height: 7.4 },
} as const satisfies Record<Part, Cutout>;

const susanCutouts = {
  // The neck sits above the ends of her braids.
  head: { bounds: [82, 71, 334, 407], pivot: [190, 356], width: 21.2, height: 25.4 },
  torso: { bounds: [505, 43, 741, 412], pivot: [622, 280], width: 24.5, height: 40 },
  upperArm: { bounds: [957, 87, 1125, 365], pivot: [1022, 117], tip: [1047, 346], width: 7.2, length: upperArm },
  forearm: { bounds: [139, 483, 281, 785], pivot: [225, 507], tip: [179, 760], width: 5.8, length: lowerArm },
  hand: { bounds: [526, 520, 692, 773], pivot: [648, 545], width: 4.5, height: 6.1 },
  thigh: { bounds: [955, 461, 1128, 795], pivot: [1051, 490], tip: [1038, 766], width: 7.4, length: upperLeg },
  shin: { bounds: [152, 869, 273, 1193], pivot: [212, 899], tip: [221, 1170], width: 6.7, length: lowerLeg },
  shoe: { bounds: [472, 937, 750, 1162], pivot: [672, 970], width: 10.2, height: 6.5 },
  satchel: { bounds: [940, 944, 1120, 1170], pivot: [1038, 987], width: 6.9, height: 8.1 },
} as const satisfies Record<Part, Cutout>;

function paintedOffset(cutout: SizedCutout, [x, y]: Pixel): Pixel {
  const [left, top, right, bottom] = cutout.bounds;
  const [pivotX, pivotY] = cutout.pivot;
  return [(x - pivotX) * (cutout.width / (right - left + padding * 2)),
    (y - pivotY) * (cutout.height / (bottom - top + padding * 2))];
}

const atlasSpecs = {
  townNpc: {
    path: '/assets/characters/town-merchant.png', cutouts: townCutouts, height: 68,
    collar: [623, 41], shoulders: [[-8.2, -20.5], [8, -21]], soleY: 1148,
  },
  capitalMerchant: {
    path: '/assets/characters/capital-merchant.png', cutouts: capitalCutouts, height: 70,
    collar: [628, 98], shoulders: [paintedOffset(capitalCutouts.torso, [530, 117]), paintedOffset(capitalCutouts.torso, [704, 117])],
    soleY: 1148,
  },
  villageFather: {
    path: '/assets/characters/village-father.png', cutouts: fatherCutouts, height: 71,
    collar: [626, 91], shoulders: [paintedOffset(fatherCutouts.torso, [531, 111]), paintedOffset(fatherCutouts.torso, [706, 114])],
    soleY: 1154,
  },
  villageSusan: {
    path: '/assets/characters/village-susan.png', cutouts: susanCutouts, height: 68,
    collar: [625, 79], shoulders: [paintedOffset(susanCutouts.torso, [555, 100]), paintedOffset(susanCutouts.torso, [685, 101])],
    soleY: 1160,
  },
} as const;
type TownNpcAtlasKey = keyof typeof atlasSpecs;

const townNpcProfiles = {
  'island-shop': { atlas: 'townNpc', facing: 1, greetingOffset: 0.8 },
  'muguang-shop': { atlas: 'townNpc', facing: -1, greetingOffset: 3.9 },
  'wind-keeper': { atlas: 'townNpc', facing: 1, greetingOffset: 6.2 },
  // The historical shop scene provides merchant clothing. The auctioneer shares the reconstruction.
  'life-shop': { atlas: 'capitalMerchant', facing: 1, greetingOffset: 2.1 },
  'life-auction': { atlas: 'capitalMerchant', facing: -1, greetingOffset: 5.4 },
  'island-father': { atlas: 'villageFather', facing: -1, greetingOffset: 4.7 },
  'island-susan': { atlas: 'villageSusan', facing: 1, greetingOffset: 6.8 },
} as const satisfies Record<string, { atlas: TownNpcAtlasKey; facing: number; greetingOffset: number }>;

function townNpcProfile(id: string) {
  return Object.hasOwn(townNpcProfiles, id) ? townNpcProfiles[id as keyof typeof townNpcProfiles] : undefined;
}

export function townNpcAtlasFor(id: string) {
  return townNpcProfile(id)?.atlas;
}

function joint(parent: Container, name: string, x = 0, y = 0) {
  const child = new Container({ label: `town-npc:${name}`, x, y });
  parent.addChild(child);
  return child;
}

function smoothstep(t: number) {
  const unit = Math.min(1, Math.max(0, t));
  return unit * unit * (3 - 2 * unit);
}

function plantLeg(hip: Container, knee: Container, shoe: Container, x: number, y: number) {
  hip.position.set(x, y);
  const dx = shoe.x - x;
  const dy = shoe.y - y;
  const span = Math.hypot(dx, dy);
  // Intersect the hip and ankle circles so the knee can bend toward the toes.
  const along = (upperLeg * upperLeg - lowerLeg * lowerLeg + span * span) / (2 * span);
  const bend = Math.sqrt(Math.max(0, upperLeg * upperLeg - along * along));
  const kneeX = (dx * along - dy * bend) / span;
  const kneeY = (dy * along + dx * bend) / span;
  hip.rotation = Math.atan2(-kneeX, kneeY);
  knee.rotation = Math.atan2(kneeX - dx, dy - kneeY) - hip.rotation;
}

export class TownNpcRigAtlas {
  private readonly textures = new Map<Part, Texture>();

  static async load(key: TownNpcAtlasKey = 'townNpc') {
    const sheet = await Assets.load<Texture>(atlasSpecs[key].path);
    if (sheet.width !== atlasSize || sheet.height !== atlasSize) {
      throw new Error(`Town NPC atlas must be ${atlasSize}×${atlasSize}`);
    }
    return new TownNpcRigAtlas(sheet, key);
  }

  private constructor(sheet: Texture, private readonly key: TownNpcAtlasKey) {
    for (const [part, { bounds: [left, top, right, bottom] }] of Object.entries(atlasSpecs[key].cutouts) as [Part, Cutout][]) {
      const frame = new Rectangle(left - padding, top - padding, right - left + padding * 2, bottom - top + padding * 2);
      const texture = new Texture({ source: sheet.source, frame, label: `town-npc:${part}` });
      this.textures.set(part, texture);
    }
  }

  private piece(parent: Container, part: Part, far = false) {
    const texture = this.textures.get(part)!;
    const cutout = atlasSpecs[this.key].cutouts[part];
    const [pivotX, pivotY] = cutout.pivot;
    const sprite = new Sprite({ texture, label: `town-npc:${far ? 'far-' : ''}${part}` });
    sprite.anchor.set((pivotX - texture.frame.x) / texture.width, (pivotY - texture.frame.y) / texture.height);
    const side = far && part !== 'shoe' ? -1 : 1;
    const scaleX = side * (far ? .9 : 1) * cutout.width / texture.width;
    if ('tip' in cutout) {
      // Align the measured joint-to-joint line with the vertical bone, including mirrored limbs.
      const dx = (cutout.tip[0] - pivotX) * scaleX;
      const dy = Math.sqrt(cutout.length ** 2 - dx ** 2);
      sprite.scale.set(scaleX, dy / (cutout.tip[1] - pivotY));
      sprite.rotation = Math.atan2(dx, dy);
    } else {
      sprite.scale.set(scaleX, cutout.height / texture.height);
    }
    if (far) sprite.tint = 0xded2c9;
    parent.addChild(sprite);
    return sprite;
  }

  create(id: string): Rig | undefined {
    const profile = townNpcProfile(id);
    if (profile?.atlas !== this.key || !this.textures.size) return;
    const { facing, greetingOffset } = profile;
    const { cutouts, collar, shoulders, height, soleY } = atlasSpecs[this.key];
    const root = new Container({ label: 'town-npc-articulated-rig' });
    root.scale.x = facing;

    const legs = [true, false].map(far => {
      const side = far ? 'far' : 'near';
      const hip = joint(root, `${side}-hip`);
      this.piece(hip, 'thigh', far);
      const knee = joint(hip, `${side}-knee`, 0, upperLeg);
      this.piece(knee, 'shin', far);
      const shoe = joint(root, `${side}-ankle`, far ? -5.7 : 6.4);
      const boot = this.piece(shoe, 'shoe', far);
      shoe.y = (cutouts.shoe.pivot[1] - soleY) * boot.scale.y - (far ? 1.3 : 0);
      return { hip, knee, shoe, x: far ? -4.8 : 4.8, y: far ? -.65 : .1 };
    });

    const chest = joint(root, 'chest', 0, -24.9);
    const arm = (far: boolean) => {
      const side = far ? 'far' : 'near';
      const [x, y] = shoulders[far ? 0 : 1];
      const shoulder = joint(chest, `${side}-shoulder`, x, y);
      this.piece(shoulder, 'upperArm', far);
      const elbow = joint(shoulder, `${side}-elbow`, 0, upperArm);
      this.piece(elbow, 'forearm', far);
      const wrist = joint(elbow, `${side}-wrist`, 0, lowerArm);
      this.piece(wrist, 'hand', far);
      return { shoulder, elbow, wrist };
    };
    const farArm = arm(true);
    const torso = this.piece(chest, 'torso');
    const satchel = this.piece(chest, 'satchel');
    satchel.position.set(8.3, -6.7);
    const nearArm = arm(false);
    const neck = joint(chest, 'neck', (collar[0] - cutouts.torso.pivot[0]) * torso.scale.x,
      (collar[1] - cutouts.torso.pivot[1]) * torso.scale.y + .65);
    this.piece(neck, 'head');

    function pose(time: number, direction: number) {
      const horizontal = Math.cos(direction);
      if (Math.abs(horizontal) > .28) root.scale.x = horizontal < 0 ? 1 : -1;

      const breath = Math.sin(time * 2.2);
      const sway = Math.sin(time * 1.05 + .4);
      const greeting = (time + greetingOffset) % 14 - 5.6;
      const wave = smoothstep(greeting / .46) * (1 - smoothstep((greeting - 1.24) / .56));
      chest.position.set(sway * .8, -24.9 - breath * .34);
      chest.rotation = sway * .024 + wave * .032;
      neck.rotation = -chest.rotation * .48 + Math.sin(time * 1.3) * .022 - wave * .063;
      satchel.rotation = -sway * .034;

      farArm.shoulder.rotation = .13 + breath * .021;
      farArm.elbow.rotation = .14 + sway * .025;
      nearArm.shoulder.rotation = -.12 - sway * .027 - wave * .99;
      nearArm.elbow.rotation = -.12 - breath * .022 - wave * 1.72;
      nearArm.wrist.rotation = wave * (-.12 + Math.sin(greeting * 15) * .24);

      for (const leg of legs) plantLeg(leg.hip, leg.knee, leg.shoe, chest.x + leg.x, chest.y + leg.y);
    }

    pose(0, Math.PI / 2);
    return {
      root,
      height,
      animate({ time, direction }) {
        pose(time, direction);
      },
    };
  }

  destroy() {
    for (const texture of this.textures.values()) texture.destroy(false);
    this.textures.clear();
  }
}
