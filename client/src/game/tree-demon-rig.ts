import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { BipedGait, bipedHipHeight, bipedSole, bipedThigh } from './biped-gait';
import type { Rig, RigPose } from './rigs';

type Pixel = readonly [x: number, y: number];
type Cutout = {
  bounds: readonly [left: number, top: number, right: number, bottom: number];
  pivot: Pixel;
  width: number;
} & ({ height: number } | { tip: Pixel });

const atlasPath = '/assets/monsters/tree-demon-rig.png';
const atlasSize = 1254;
const atlasCell = atlasSize / 3;
const padding = 3;
const regions = {
  frontTrunk: { bounds: [119, 88, 317, 358], pivot: [217, 315], width: 29, height: 30 },
  rearTrunk: { bounds: [523, 90, 732, 362], pivot: [625, 315], width: 29, height: 30 },
  canopy: { bounds: [853, 48, 1224, 368], pivot: [1037, 355], width: 60, height: 48 },
  upperBranch: { bounds: [136, 492, 291, 757], pivot: [242, 515], tip: [201, 732], width: 8.4 },
  lowerBranch: { bounds: [527, 496, 692, 761], pivot: [648, 516], tip: [598, 701], width: 8.4 },
  thigh: { bounds: [956, 488, 1127, 753], pivot: [1052, 514], tip: [1041, 734], width: 9.7 },
  rootFoot: { bounds: [122, 914, 303, 1153], pivot: [249, 934], tip: [204, 1136], width: 12.5 },
  sprig: { bounds: [527, 934, 731, 1137], pivot: [633, 1120], width: 14, height: 15 },
  crownCluster: { bounds: [901, 927, 1191, 1147], pivot: [1045, 1123], width: 22, height: 16 },
} as const satisfies Record<string, Cutout>;

type Part = keyof typeof regions;
type Limb = 'upperBranch' | 'lowerBranch' | 'thigh' | 'rootFoot';
const neckPixels = [[214, 113], [625, 111]] as const;
const shoulders = [[[154, 207], [281, 207]], [[550, 206], [705, 206]]] as const;
const hipPixels = [[154, 334], [276, 334]] as const;
const sides = [-1, 1] as const;
const origin = { x: 0, y: 0 };
const mix = (from: number, to: number, ratio: number) => from + (to - from) * ratio;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function ease(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function joint(parent: Container, label: string, x = 0, y = 0) {
  return parent.addChild(new Container({ label: `tree-demon:${label}`, x, y }));
}

function paintedOffset(sprite: Sprite, part: Part, [x, y]: Pixel) {
  const [px, py] = regions[part].pivot;
  return { x: (x - px) * sprite.scale.x, y: (y - py) * sprite.scale.y };
}

export function isTreeDemonDefinition(id: string): id is 'tree-demon' {
  return id === 'tree-demon';
}

export class TreeDemonRigAtlas {
  private readonly textures = new Map<Part, Texture>();

  static async load() {
    const sheet = await Assets.load<Texture>(atlasPath);
    if (sheet.width !== atlasSize || sheet.height !== atlasSize) throw new Error(`Tree demon atlas must be ${atlasSize}×${atlasSize}`);
    return new TreeDemonRigAtlas(sheet);
  }

  private constructor(sheet: Texture) {
    for (const [part, { bounds: [left, top, right, bottom] }] of Object.entries(regions) as [Part, Cutout][]) {
      const col = Math.floor(left / atlasCell) * atlasCell, row = Math.floor(top / atlasCell) * atlasCell;
      const x = Math.max(col, left - padding), y = Math.max(row, top - padding);
      const frame = new Rectangle(x, y, Math.min(col + atlasCell, right + padding) - x, Math.min(row + atlasCell, bottom + padding) - y);
      this.textures.set(part, new Texture({ source: sheet.source, frame, label: `tree-demon:${part}` }));
    }
  }

  private piece(parent: Container, part: Part, mirror = false) {
    const texture = this.textures.get(part)!;
    const cutout = regions[part];
    const { bounds: [left, top, right, bottom], pivot: [px, py], width } = cutout;
    const sprite = new Sprite({ texture, label: `tree-demon:${part}${mirror ? '-mirror' : ''}` });
    sprite.anchor.set((px - texture.frame.x) / texture.width, (py - texture.frame.y) / texture.height);
    sprite.scale.set((mirror ? -1 : 1) * width / (right - left), 'height' in cutout ? cutout.height / (bottom - top) : 1);
    return parent.addChild(sprite);
  }

  private limb(parent: Container, part: Limb, side: number, x: number, y: number) {
    const sprite = this.piece(parent, part, side < 0);
    const { pivot, tip } = regions[part];
    const dx = (tip[0] - pivot[0]) * sprite.scale.x;
    const dy = Math.sqrt(x * x + y * y - dx * dx);
    sprite.scale.y = dy / (tip[1] - pivot[1]);
    sprite.rotation = Math.atan2(dx, dy) - Math.atan2(x, y);
  }

  create(definitionId?: string): Rig | undefined {
    if (!definitionId || !isTreeDemonDefinition(definitionId) || !this.textures.size) return;
    const root = new Container({ label: 'tree-demon-articulated-rig' });
    const body = joint(root, 'body');
    const trunk = joint(body, 'trunk');
    trunk.sortableChildren = true;
    const front = this.piece(trunk, 'frontTrunk');
    const rear = this.piece(trunk, 'rearTrunk');
    const hips = hipPixels.map(pixel => paintedOffset(front, 'frontTrunk', pixel));
    const spread = (hips[1].x - hips[0].x) / 2;
    trunk.position.set(-(hips[0].x + hips[1].x) / 2, -bipedHipHeight - hips[0].y);
    // Keep the thigh roots under the trunk's lower edge.
    const legs = sides.map((side, index) => {
      const name = side < 0 ? 'left' : 'right';
      const hip = joint(body, `${name}-hip`, trunk.x + hips[index].x, -bipedHipHeight);
      body.setChildIndex(hip, index);
      const knee = joint(hip, `${name}-knee`, side * bipedThigh.x, bipedThigh.y);
      this.limb(hip, 'thigh', side, knee.x, knee.y);
      const sole = joint(knee, `${name}-sole`, side * bipedSole.x, bipedSole.y);
      this.limb(knee, 'rootFoot', side, sole.x, sole.y);
      return { side, hip, knee, sole };
    });
    const gait = new BipedGait();
    gait.advance(0, 0, 0, 1, spread, false);

    const arms = sides.map((side, index) => {
      const name = side < 0 ? 'left' : 'right';
      const from = paintedOffset(front, 'frontTrunk', shoulders[0][index]);
      const to = paintedOffset(rear, 'rearTrunk', shoulders[1][index]);
      const shoulder = joint(trunk, `${name}-shoulder`, from.x, from.y);
      const elbow = joint(shoulder, `${name}-elbow`, side * 1.9, 9.5);
      this.limb(shoulder, 'upperBranch', side, elbow.x, elbow.y);
      const tip = joint(elbow, `${name}-branch-tip`, side * 1.7, 8.8);
      this.limb(elbow, 'lowerBranch', side, tip.x, tip.y);
      return { side, shoulder, elbow, from, to };
    });

    const neckFront = paintedOffset(front, 'frontTrunk', neckPixels[0]);
    const neckRear = paintedOffset(rear, 'rearTrunk', neckPixels[1]);
    const crown = joint(trunk, 'crown', neckFront.x, neckFront.y);
    crown.zIndex = 3;
    this.piece(crown, 'canopy');
    const sprig = joint(crown, 'sprig-joint', -20, -23);
    this.piece(sprig, 'sprig', true);
    const cluster = joint(crown, 'crown-cluster-joint', 18, -26);
    this.piece(cluster, 'crownCluster');

    let yaw = Math.PI / 2;
    let facing = 1;
    let lastTime: number | undefined;
    let windup = 0, strike = 0;
    let hitAge = Infinity, hitDirection = 0;
    let fall: { lean: number; crown: number; sprig: number; cluster: number } | undefined;

    // Motion timings and secondary foliage are reconstructions of the documented tree silhouette.
    function pose({ time, direction, action, actionTime, travelX = 0, travelY = 0, deltaSeconds }: RigPose) {
      const dt = clamp(deltaSeconds ?? (lastTime === undefined ? 1 / 60 : time - lastTime), 0, .06);
      lastTime = time;
      if (action === 'dead') {
        if (!fall) {
          const left = root.toLocal(origin, legs[0].sole), right = root.toLocal(origin, legs[1].sole);
          const brace = left.y > right.y ? 0 : 1;
          body.pivot.copyFrom(body.toLocal(origin, legs[brace].sole));
          body.position.copyFrom(brace === 0 ? left : right);
          fall = { lean: body.rotation, crown: crown.rotation, sprig: sprig.rotation, cluster: cluster.rotation };
        }
        const tilt = ease(actionTime / 590);
        const impact = ease((actionTime - 365) / 160) * (1 - ease((actionTime - 525) / 180));
        body.rotation = fall.lean + facing * (tilt * 1.49 - impact * .037);
        body.alpha = 1 - ease((actionTime - 450) / 520) * .48;
        crown.rotation = fall.crown - facing * tilt * .13 + impact * .16;
        sprig.rotation = fall.sprig + impact * .25;
        cluster.rotation = fall.cluster - impact * .18;
        return;
      }
      if (fall) {
        fall = undefined;
        body.pivot.set(0);
        body.position.set(0);
        body.alpha = 1;
      }

      const turn = 1 - Math.exp(-dt * 12);
      yaw += Math.atan2(Math.sin(direction - yaw), Math.cos(direction - yaw)) * turn;
      const horizontal = Math.cos(yaw), depth = Math.sin(yaw);
      if (Math.abs(horizontal) > .23) facing = Math.sign(horizontal);
      const back = ease((-depth - .05) / .56);
      front.alpha = Math.min(1, (1 - back) * 2);
      rear.alpha = Math.min(1, back * 2);
      front.visible = front.alpha > 0;
      rear.visible = rear.alpha > 0;

      const attacking = action === 'attack' || action === 'cast';
      const settle = 1 - Math.exp(-dt * 24);
      windup = mix(windup, attacking ? ease(actionTime / 116) * (1 - ease((actionTime - 96) / 99)) : 0, settle);
      strike = mix(strike, attacking ? ease((actionTime - 102) / 97) * (1 - ease((actionTime - 208) / 201)) : 0, settle);
      hitAge += dt * 1000;
      const hit = Math.sin(Math.PI * Math.min(1, hitAge / 196));
      const recoil = Math.cos(hitDirection) * hit;
      body.scale.x = 1.03 - Math.abs(horizontal) * .13;
      const step = gait.advance(travelX, travelY, dt, turn, spread * body.scale.x, !attacking && hitAge >= 85, true);
      const sway = Math.sin(time * 2.3);
      const lean = horizontal * (strike * .083 - windup * .053) + recoil * .058 + step * .026;
      body.y = gait.plant(legs, body.scale.x, lean, 1.15 - Math.abs(step) * .44 - sway * .20, true);
      body.rotation = lean;

      for (const { side, shoulder, elbow, from, to } of arms) {
        shoulder.position.set(mix(from.x, to.x, back), mix(from.y, to.y, back));
        shoulder.rotation = side * (step * .32 + windup * .58 - strike * .46) - horizontal * strike * .75 + recoil * .14;
        elbow.rotation = side * (.14 - windup * .73 + strike * .44) - horizontal * strike * .32;
        shoulder.zIndex = side === facing ? 1 : -1;
      }
      crown.position.set(mix(neckFront.x, neckRear.x, back), mix(neckFront.y, neckRear.y, back));
      crown.rotation = sway * .031 - step * .075 - lean * .56 + horizontal * windup * .13;
      sprig.rotation = -.17 + Math.sin(time * 3.7 - .6) * .049 - step * .13 + recoil * .12;
      cluster.rotation = .10 + Math.sin(time * 3.1 - 1.2) * .041 - step * .11 - horizontal * strike * .13;
    }

    pose({ time: 0, direction: Math.PI / 2, moving: false, action: 'idle', actionTime: 0 });
    return {
      root, height: 89, hitHalfWidth: 36, animate: pose,
      reactToHit(direction, age) {
        if (age >= 196) return;
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
