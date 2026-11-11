import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Point } from '../../../shared/types';
import type { Rig } from './rigs';

type Pixel = readonly [x: number, y: number];
type PartSpec = {
  bounds: readonly [left: number, top: number, right: number, bottom: number];
  pivot: Pixel;
} & ({ size: Pixel } | { tip: Pixel; length: number; axis: 'down' | 'right' });

const atlasPath = '/assets/monsters/rodent-rig.png';
const viewsPath = '/assets/monsters/rodent-views.png';
const atlasSize = 1254;
const framePadding = 3;

// The nine pieces are a reconstruction. Original field mouse art has not been recovered.
const parts = {
  head: { bounds: [34, 57, 376, 369], pivot: [332, 306], size: [18, 16] },
  headFront: { bounds: [81, 399, 588, 877], pivot: [338, 859], size: [16, 15.1] },
  headBack: { bounds: [684, 399, 1174, 880], pivot: [931, 862], size: [16, 15.7] },
  body: { bounds: [431, 88, 823, 350], pivot: [625, 230], size: [34, 19] },
  jaw: { bounds: [928, 158, 1171, 302], pivot: [1135, 208], size: [9, 5.4] },
  foreUpper: { bounds: [129, 475, 311, 786], pivot: [227, 496], tip: [184, 758], length: 7.1, axis: 'down' },
  forePaw: { bounds: [528, 507, 701, 771], pivot: [650, 523], tip: [570, 752], length: 8.2, axis: 'down' },
  hindUpper: { bounds: [929, 457, 1164, 802], pivot: [1035, 485], tip: [1030, 770], length: 7.3, axis: 'down' },
  hindPaw: { bounds: [112, 921, 331, 1192], pivot: [246, 940], tip: [183, 1165], length: 8.4, axis: 'down' },
  tailBase: { bounds: [450, 1002, 798, 1097], pivot: [464, 1037], tip: [778, 1060], length: 11.0, axis: 'right' },
  tailTip: { bounds: [878, 1006, 1203, 1084], pivot: [893, 1061], tip: [1184, 1022], length: 10.0, axis: 'right' },
} as const satisfies Record<string, PartSpec>;

type Part = keyof typeof parts;
interface Cutout {
  texture: Texture;
  anchorX: number;
  anchorY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

function cutout(sheet: Texture, part: Part, spec: PartSpec): Cutout {
  const [left, top, right, bottom] = spec.bounds;
  const frame = new Rectangle(left - framePadding, top - framePadding,
    right - left + framePadding * 2, bottom - top + framePadding * 2);
  const [px, py] = spec.pivot;
  const texture = new Texture({ source: sheet.source, frame, label: `rodent:${part}` });
  const anchorX = (px - frame.x) / frame.width;
  const anchorY = (py - frame.y) / frame.height;
  if ('tip' in spec) {
    const dx = spec.tip[0] - px, dy = spec.tip[1] - py;
    const scale = spec.length / Math.hypot(dx, dy);
    const rotation = spec.axis === 'down' ? Math.atan2(dx, dy) : -Math.atan2(dy, dx);
    return { texture, anchorX, anchorY, scaleX: scale, scaleY: scale, rotation };
  }
  return { texture, anchorX, anchorY, scaleX: spec.size[0] / (right - left), scaleY: spec.size[1] / (bottom - top), rotation: 0 };
}

// The archive distinguishes these rodents by name; relative sizes are reconstructed.
const rodentHeights = { 'field-mouse': 34, 'mouse-king': 46, 'life-giant-rat': 52, 'life-giant-rat-mage': 52,
  'life-giant-rat-elite': 64, 'life-rat-emperor': 78 } as const;
export function isRodentDefinition(id: string): id is keyof typeof rodentHeights {
  return Object.hasOwn(rodentHeights, id);
}

export class RodentRigAtlas {
  private readonly art: Record<Part, Cutout>;
  private disposed = false;

  static async load() {
    const [sheet, views] = await Promise.all([Assets.load<Texture>(atlasPath), Assets.load<Texture>(viewsPath)]);
    if ([sheet, views].some(image => image.width !== atlasSize || image.height !== atlasSize)) {
      throw new Error(`Rodent atlases must be ${atlasSize}×${atlasSize}`);
    }
    return new RodentRigAtlas(sheet, views);
  }

  private constructor(sheet: Texture, views: Texture) {
    const keys = Object.keys(parts) as Part[];
    this.art = Object.fromEntries(keys.map(key => [key,
      cutout(key === 'headFront' || key === 'headBack' ? views : sheet, key, parts[key])])) as Record<Part, Cutout>;
  }

  create(definitionId?: string): Rig | undefined {
    if (!this.disposed && definitionId && isRodentDefinition(definitionId)) return createRodentRig(this.art, rodentHeights[definitionId] / 34);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const { texture } of Object.values(this.art)) texture.destroy(false);
  }
}

const tau = Math.PI * 2;
const stride = 15.6;
const stance = .6;
const cycleDistance = stride / stance;

function ease(value: number, start: number, end: number) {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function joint(parent: Container, name: string) {
  const child = new Container({ label: `rodent:${name}` });
  parent.addChild(child);
  return child;
}

function placeLink(joint: Container, from: Point, to: Point, length: number) {
  const dx = to.x - from.x, dy = to.y - from.y;
  joint.position.copyFrom(from);
  joint.rotation = Math.atan2(-dx, dy);
  joint.scale.y = Math.hypot(dx, dy) / length;
}

function createRodentRig(art: Record<Part, Cutout>, scale: number): Rig {
  const root = new Container({ label: 'field-mouse-articulated-rig', sortableChildren: true });
  root.scale.set(scale);

  function piece(parent: Container, part: Part) {
    const { texture, anchorX, anchorY, scaleX, scaleY, rotation } = art[part];
    const sprite = new Sprite({ texture, label: `rodent:${part}` });
    sprite.anchor.set(anchorX, anchorY);
    sprite.scale.set(scaleX, scaleY);
    sprite.rotation = rotation;
    parent.addChild(sprite);
    return sprite;
  }

  const tail = joint(root, 'tail');
  piece(tail, 'tailBase');
  const tailEnd = joint(tail, 'tail-tip');
  tailEnd.x = parts.tailBase.length;
  piece(tailEnd, 'tailTip');

  const body = joint(root, 'trunk');
  const bodyViews = [1, -1].map(sign => {
    const view = joint(body, sign === 1 ? 'trunk-left' : 'trunk-right');
    view.scale.x = sign;
    piece(view, 'body');
    return view;
  });

  const head = joint(root, 'neck');
  const headViews = [1, -1].map(sign => {
    const view = joint(head, sign === 1 ? 'head-left' : 'head-right');
    view.scale.x = sign;
    const jaw = joint(view, 'jaw-hinge');
    jaw.position.set((235 - parts.head.pivot[0]) * art.head.scaleX, (313 - parts.head.pivot[1]) * art.head.scaleY);
    piece(jaw, 'jaw');
    piece(view, 'head');
    return { view, jaw };
  });
  const headFront = piece(head, 'headFront');
  const headBack = piece(head, 'headBack');

  // Convert measured left-facing torso sockets to a forward/height coordinate system.
  const mount = (x: number, y: number) => ({
    station: (parts.body.pivot[0] - x) * art.body.scaleX, offsetY: (y - parts.body.pivot[1]) * art.body.scaleY,
  });
  const neckSocket = mount(451, 205);
  const tailSocket = mount(809, 231);
  const foreNear = mount(505, 290), foreFar = mount(510, 245);
  const hindNear = mount(725, 300), hindFar = mount(728, 245);
  const legs = ([-1, 1] as const).flatMap(side => [true, false].map(fore => {
    const name = `${fore ? 'fore' : 'hind'}-${side < 0 ? 'a' : 'b'}`;
    const upper = joint(root, `${name}-upper`);
    const lower = joint(root, `${name}-paw`);
    const upperPart = fore ? 'foreUpper' : 'hindUpper';
    const lowerPart = fore ? 'forePaw' : 'hindPaw';
    piece(upper, upperPart);
    const leftPaw = piece(lower, lowerPart);
    const rightPaw = joint(lower, `${name}-paw-reverse`);
    rightPaw.scale.x = -1;
    piece(rightPaw, lowerPart);
    const near = fore ? foreNear : hindNear, far = fore ? foreFar : hindFar;
    return { upper, lower, leftPaw, rightPaw, side, fore,
      station: (near.station + far.station) / 2, shoulderY: (near.offsetY + far.offsetY) / 2,
      lateralY: (near.offsetY - far.offsetY) / 2,
      upperLength: parts[upperPart].length, lowerLength: parts[lowerPart].length,
      offset: fore === (side < 0) ? 0 : .5,
      footX: 0, footY: 0, anchorX: 0, anchorY: 0, goalX: 0, goalY: 0 };
  }));

  let previousTime: number | undefined;
  let yaw: number | undefined;
  let phase = 0;
  let gaitWeight = 0;
  let wasWalking = false;
  let hitAge = Infinity;
  let hitDirection = 0;

  const rig: Rig = {
    root,
    height: 34 * scale,
    hitHalfWidth: 29 * scale,
    reactToHit(direction, age) {
      if (age >= 235 || age > hitAge) return;
      hitDirection = direction;
      hitAge = age;
    },
    animate({ time, direction, moving, action, actionTime, travelX, travelY, deltaSeconds }) {
      const firstFrame = previousTime === undefined;
      const elapsed = deltaSeconds ?? (previousTime === undefined ? 1 / 60 : time - previousTime);
      const dt = Math.min(.05, Math.max(0, elapsed));
      if (previousTime === undefined) phase = ((time * 2.1 % 1) + 1) % 1;
      previousTime = time;
      const dead = action === 'dead';
      const attacking = action === 'attack' || action === 'cast';
      const dx = (travelX ?? 0) / scale, dy = (travelY ?? 0) / scale;
      const distance = Math.hypot(dx, dy);
      const walking = moving && !dead && !attacking && distance > .015 && distance <= Math.max(14, dt * 330);
      const previousPhase = phase;
      if (walking) phase = (phase + distance / cycleDistance) % 1;
      gaitWeight += ((walking ? 1 : 0) - gaitWeight) * (1 - Math.exp(-dt * (walking ? 24 : 18)));

      yaw ??= direction;
      const turn = Math.atan2(Math.sin(direction - yaw), Math.cos(direction - yaw));
      if (!dead) yaw += turn * (1 - Math.exp(-dt * 16));
      const forward = Math.cos(yaw), depth = Math.sin(yaw);
      const profile = Math.abs(forward);
      const right = ease(forward, -.30, .30);

      const fallen = dead ? ease(actionTime, 0, 470) : 0;
      const alive = 1 - fallen;
      const weight = gaitWeight * alive;
      hitAge += dt * 1000;
      const impact = Math.sin(Math.min(hitAge / 235, 1) * Math.PI) * (1 - ease(hitAge, 30, 235)) * alive;
      const recoilX = Math.cos(hitDirection) * impact * 3.9;
      const recoilY = Math.sin(hitDirection) * impact * 3.0;
      const draw = attacking ? ease(actionTime, 0, 85) * (1 - ease(actionTime, 92, 150)) : 0;
      const bite = attacking ? ease(actionTime, 95, 167) * (1 - ease(actionTime, 185, 360)) : 0;
      const open = attacking ? ease(actionTime, 30, 120) * (1 - ease(actionTime, 142, 203)) : 0;
      const bodyTravel = bite * 3.6 - draw * 2.0 + Math.sin(phase * tau) * weight * .5;
      const bob = Math.sin(phase * tau * 2) * weight * .7 + Math.sin(time * 3.1) * .24 * (1 - weight);
      const bodyHeight = (12.2 + bob + draw * .8 - bite * .5) * alive + 3.3 * fallen;
      const pitch = (bite * .14 - draw * .10 + Math.sin(phase * tau) * weight * .045) * alive + .40 * fallen;

      root.alpha = 1 - fallen * .29;
      body.position.set(forward * bodyTravel + recoilX, depth * bodyTravel - bodyHeight + recoilY);
      body.rotation = -forward * pitch + depth * .075 * alive;
      body.scale.set(.55 + profile * .45, 1 - fallen * .26);
      bodyViews[0].alpha = 1 - right;
      bodyViews[1].alpha = right;

      const sinPitch = Math.sin(body.rotation), cosPitch = Math.cos(body.rotation);
      const headReach = bite * 2.4 - draw * .9;
      const neckX = forward * neckSocket.station;
      const neckY = depth * neckSocket.station * .55 + neckSocket.offsetY * body.scale.y;
      head.position.set(body.x + neckX * cosPitch - neckY * sinPitch + forward * headReach,
        body.y + neckX * sinPitch + neckY * cosPitch + depth * headReach * .55 + fallen * 1.8);
      head.rotation = body.rotation * .7 + forward * (bite * .14 - draw * .16 + impact * .12 - fallen * .26);
      head.zIndex = depth < -.45 ? -1 : 1;
      const frontal = 1 - ease(profile, .25, .75);
      headViews[0].view.alpha = (1 - right) * (1 - frontal);
      headViews[1].view.alpha = right * (1 - frontal);
      for (const { view, jaw } of headViews) {
        const sign = Math.sign(view.scale.x);
        view.scale.x = sign * (.56 + profile * .44);
        view.x = sign * frontal * 6.5;
        jaw.rotation = -open * .48 - fallen * .12;
      }
      headFront.alpha = depth >= 0 ? frontal : 0;
      headBack.alpha = depth < 0 ? frontal : 0;

      const tailX = forward * (tailSocket.station + .8);
      const tailY = depth * tailSocket.station * .55 + tailSocket.offsetY * body.scale.y;
      tail.position.set(body.x + tailX * cosPitch - tailY * sinPitch,
        body.y + tailX * sinPitch + tailY * cosPitch - fallen * 1.4);
      tail.rotation = Math.atan2(-depth * .57, -forward) + Math.sin(time * 4.4 - phase * tau) * (.10 + weight * .14) * alive;
      tail.scale.x = .58 + profile * .42;
      tail.zIndex = depth < -.25 ? 1 : -3;
      tailEnd.rotation = Math.sin(time * 4.4 - phase * tau - .85) * (.16 + weight * .23) * alive + fallen * .22;

      for (const leg of legs) {
        const step = (phase + leg.offset) % 1;
        const from = (previousPhase + leg.offset) % 1;
        const swing = Math.max(0, (step - stance) / (1 - stance));
        const swingBlend = swing * swing * (3 - 2 * swing);
        const footHeight = Math.sin(Math.PI * swing) ** 2 * 3.5 * weight;
        const hipForward = bodyTravel;
        const hipHeight = Math.max(1, bodyHeight + pitch * leg.station - leg.shoulderY * body.scale.y);
        const sideX = -depth * leg.side * 4.4;
        const sideY = forward * leg.side * leg.lateralY;
        const baseX = forward * leg.station + sideX;
        const baseY = depth * leg.station * .59 + sideY;
        if (walking) {
          const moveX = dx / distance, moveY = dy / distance;
          if (!wasWalking) {
            leg.anchorX = firstFrame ? baseX : leg.footX - dx;
            leg.anchorY = firstFrame ? baseY : leg.footY - dy;
            leg.goalX = leg.anchorX;
            leg.goalY = leg.anchorY;
          } else if (step < from) {
            leg.anchorX = leg.goalX - dx;
            leg.anchorY = leg.goalY - dy;
          } else {
            leg.anchorX -= dx;
            leg.anchorY -= dy;
          }
          const ahead = stride / 2 + (1 - step) * cycleDistance;
          const goalX = baseX + moveX * ahead, goalY = baseY + moveY * ahead;
          if (wasWalking && from <= stance && step > stance) {
            leg.goalX = goalX;
            leg.goalY = goalY;
          } else if (wasWalking && step > stance) {
            const blend = 1 - Math.exp(-dt * 16);
            leg.goalX += (goalX - (leg.goalX - dx)) * blend - dx;
            leg.goalY += (goalY - (leg.goalY - dy)) * blend - dy;
          }
          leg.footX = leg.anchorX + (leg.goalX - leg.anchorX) * swingBlend;
          leg.footY = leg.anchorY + (leg.goalY - leg.anchorY) * swingBlend;
        } else {
          const blend = firstFrame ? 1 : 1 - Math.exp(-dt * 18);
          leg.footX += (baseX - leg.footX) * blend;
          leg.footY += (baseY - leg.footY) * blend;
        }
        const hip = { x: baseX + forward * hipForward + recoilX, y: baseY + depth * hipForward - hipHeight + recoilY };
        const paw = { x: leg.footX, y: leg.footY - footHeight };
        // An abrupt turn can carry the shoulder beyond a planted paw's reach.
        // Release that contact at the reach boundary instead of stretching a leg.
        const reach = (leg.upperLength + leg.lowerLength) * 1.04;
        const wantedSpan = Math.hypot(paw.x - hip.x, paw.y - hip.y);
        const reachableSpan = Math.max(Math.abs(leg.upperLength - leg.lowerLength) + .03, Math.min(reach, wantedSpan));
        if (wantedSpan !== reachableSpan) {
          const axisX = wantedSpan > .001 ? (paw.x - hip.x) / wantedSpan : 0;
          const axisY = wantedSpan > .001 ? (paw.y - hip.y) / wantedSpan : 1;
          const shiftX = hip.x + axisX * reachableSpan - paw.x;
          const shiftY = hip.y + axisY * reachableSpan - paw.y;
          paw.x += shiftX;
          paw.y += shiftY;
          leg.footX += shiftX;
          leg.footY += shiftY;
          leg.anchorX += shiftX;
          leg.anchorY += shiftY;
          leg.goalX += shiftX;
          leg.goalY += shiftY;
        }
        const legX = paw.x - hip.x, legY = paw.y - hip.y;
        const span = Math.max(.001, Math.hypot(legX, legY));
        const along = (leg.upperLength ** 2 - leg.lowerLength ** 2 + span ** 2) / (2 * span);
        const bend = Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2)) * (leg.fore ? -1 : 1) * forward;
        const knee = { x: hip.x + (legX * along + legY * bend) / span, y: hip.y + (legY * along - legX * bend) / span };
        placeLink(leg.upper, hip, knee, leg.upperLength);
        placeLink(leg.lower, knee, paw, leg.lowerLength);
        leg.upper.scale.x = .76 + profile * .15;
        leg.lower.scale.x = .68 + profile * .18;
        leg.leftPaw.alpha = 1 - right;
        leg.rightPaw.alpha = right;
        const apparentDepth = sideY + depth * leg.station * .20;
        const near = apparentDepth > 0;
        leg.upper.zIndex = near ? 2 : -2;
        leg.lower.zIndex = near ? 3 : -1;
        leg.upper.alpha = leg.lower.alpha = .78 + ease(apparentDepth, -1.2, 1.2) * .22;
      }
      wasWalking = walking;
    },
  };
  return rig;
}
