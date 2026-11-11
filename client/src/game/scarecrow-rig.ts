import { Container } from 'pixi.js';
import { FootContact, FootfallGait } from './footfall-gait';
import { easeStarterPose as ease, mixStarterPose as mix, StarterRigParts, turnStarterViews, type StarterPart } from './starter-rig-parts';
import type { Rig, RigPose } from './rigs';

const cutouts = {
  frontHead: { bounds: [162, 169, 269, 284], pivot: [217, 273], width: 7.2, height: 7.3 },
  backHead: { bounds: [573, 169, 680, 287], pivot: [627, 276], width: 7.2, height: 7.3 },
  hat: { bounds: [878, 49, 1209, 386], pivot: [1040, 326], width: 29, height: 28 },
  frontTorso: { bounds: [103, 498, 332, 780], pivot: [217, 752], width: 19.2, height: 23.5 },
  backTorso: { bounds: [515, 499, 739, 777], pivot: [627, 750], width: 19.2, height: 23.5 },
  upperArm: { bounds: [998, 492, 1087, 759], pivot: [1027, 519], tip: [1049, 735], width: 4.5 },
  forearmHand: { bounds: [151, 926, 249, 1182], pivot: [221, 949], tip: [192, 1150], width: 4.9 },
  pole: { bounds: [606, 870, 649, 1212], pivot: [627, 1207], width: 3.0, height: 14.2 },
  straw: { bounds: [974, 994, 1100, 1120], pivot: [1039, 1059], width: 6.8, height: 6.0 },
} as const satisfies Record<string, StarterPart>;
type Part = keyof typeof cutouts;
type Pixel = readonly [number, number];
type Sockets = { neck: Pixel; shoulders: readonly [Pixel, Pixel]; hat: Pixel };

const front: Sockets = { neck: [217, 519], shoulders: [[127, 580], [311, 581]], hat: [217, 187] };
const rear: Sockets = { neck: [627, 520], shoulders: [[540, 583], [713, 582]], hat: [627, 188] };

export class ScarecrowRigAtlas {
  static async load() {
    return new ScarecrowRigAtlas(await StarterRigParts.load('/assets/monsters/island-scarecrow-rig.png', 'island-scarecrow', cutouts));
  }

  private constructor(private readonly art: StarterRigParts<Part>) {}

  create(definitionId?: string) {
    if (definitionId === 'scarecrow' && this.art.available) return buildScarecrowRig(this.art);
  }

  destroy() { this.art.destroy(); }
}

function buildScarecrowRig(art: StarterRigParts<Part>): Rig {
  const root = new Container({ label: 'scarecrow-articulated-rig' });
  const pole = art.joint(root, 'pole-foot');
  const poleSprite = art.piece(pole, 'pole');
  const top = art.offset('pole', poleSprite, [627, 890]);
  const chest = art.joint(pole, 'chest', top.x, top.y);
  chest.sortableChildren = true;
  const frontTorso = art.piece(chest, 'frontTorso');
  const backTorso = art.piece(chest, 'backTorso');
  const frontNeck = art.offset('frontTorso', frontTorso, front.neck);
  const rearNeck = art.offset('backTorso', backTorso, rear.neck);
  const strawAt = art.offset('backTorso', backTorso, [652, 752]);
  const straw = art.joint(chest, 'straw-hinge', strawAt.x, strawAt.y);
  art.piece(straw, 'straw');
  straw.zIndex = -2;

  const head = art.joint(chest, 'neck', frontNeck.x, frontNeck.y);
  head.zIndex = 3;
  const frontHead = art.piece(head, 'frontHead');
  const backHead = art.piece(head, 'backHead');
  const frontHat = art.offset('frontHead', frontHead, front.hat);
  const rearHat = art.offset('backHead', backHead, rear.hat);
  const hat = art.joint(head, 'hat-hinge', frontHat.x, frontHat.y);
  art.piece(hat, 'hat');

  const arms = ([-1, 1] as const).map((side, index) => {
    const frontBase = art.offset('frontTorso', frontTorso, front.shoulders[index]);
    const rearBase = art.offset('backTorso', backTorso, rear.shoulders[index]);
    const shoulder = art.joint(chest, `shoulder-${index}`, frontBase.x, frontBase.y);
    const elbow = art.joint(shoulder, `elbow-${index}`, 0, 10.3);
    art.link(shoulder, 'upperArm', side, elbow.x, elbow.y);
    shoulder.setChildIndex(elbow, shoulder.children.length - 1);
    art.link(elbow, 'forearmHand', side, 0, 11.4);
    art.joint(elbow, `arm-end-${index}`, 0, 11.4);
    return { side, shoulder, elbow, frontBase, rearBase };
  });
  const contact = new FootContact(0, 0);
  const gait = new FootfallGait([contact], { stepSpacing: 17, swingDistance: 10, stepLead: 4.2, liftHeight: 5.0 });
  let lastTime: number | undefined;
  let yaw: number | undefined;
  let windup = 0, sweep = 0;
  let hitAge = Infinity, hitDirection = 0;

  function pose({ time, direction, action, actionTime, travelX = 0, travelY = 0, deltaSeconds }: RigPose) {
    const dt = Math.min(.06, Math.max(0, deltaSeconds ?? (lastTime === undefined ? 1 / 60 : time - lastTime)));
    lastTime = time;
    yaw ??= direction;
    const dead = action === 'dead';
    const turn = Math.atan2(Math.sin(direction - yaw), Math.cos(direction - yaw));
    const blend = 1 - Math.exp(-dt * 15);
    if (!dead) yaw += turn * blend;
    const forward = Math.cos(yaw), depth = Math.sin(yaw);
    const back = ease((-depth - .05) / .58);
    turnStarterViews(frontTorso, backTorso, back);
    turnStarterViews(frontHead, backHead, back);

    const attacking = action === 'attack' || action === 'cast';
    const actionBlend = 1 - Math.exp(-dt * 26);
    windup = mix(windup, attacking ? ease(actionTime / 90) * (1 - ease((actionTime - 98) / 60)) : 0, actionBlend);
    sweep = mix(sweep, attacking ? ease((actionTime - 96) / 82) * (1 - ease((actionTime - 189) / 140)) : 0, actionBlend);
    const fallen = dead ? ease(actionTime / 440) : 0;
    const alive = 1 - fallen;
    hitAge += dt * 1000;
    const hit = Math.sin(Math.PI * Math.min(1, hitAge / 195)) * alive;
    gait.advance(travelX, travelY, dt, !attacking && !dead && hitAge >= 84);
    const idle = Math.sin(time * 2.8) * alive;

    pole.position.set(contact.x, contact.y - contact.lift * alive);
    pole.rotation = forward * ((contact.lift * .024 - windup * .11 + sweep * .14) * alive)
      + idle * .022 + Math.cos(hitDirection) * hit * .080 + fallen * (forward > 0 ? 1 : -1) * 1.43;
    pole.alpha = 1 - fallen * .48;
    chest.rotation = -pole.rotation * .19 * alive + forward * sweep * alive * .11;
    chest.scale.x = 1 - Math.abs(forward) * .13;
    head.position.set(mix(frontNeck.x, rearNeck.x, back), mix(frontNeck.y, rearNeck.y, back));
    head.rotation = forward * .062 - chest.rotation * .34;
    hat.position.set(mix(frontHat.x, rearHat.x, back), mix(frontHat.y, rearHat.y, back));
    hat.rotation = -pole.rotation * .32 * alive - idle * .035 - hit * .12;
    straw.rotation = idle * .13 + contact.lift * .035;

    for (const { side, shoulder, elbow, frontBase, rearBase } of arms) {
      shoulder.position.set(mix(frontBase.x, rearBase.x, back), mix(frontBase.y, rearBase.y, back));
      const near = side * forward < .1;
      shoulder.zIndex = near ? 1 : -1;
      const strikeShare = ease((.24 - side * forward) / .48);
      shoulder.rotation = side * (-1.30 + idle * .033 + fallen * .38
        + mix(-windup * .14 + sweep * .22, windup * .64 - sweep * .47, strikeShare) * alive);
      elbow.rotation = side * (.18 + contact.lift * .035 + mix(sweep * .2, windup * .68 - sweep * .39, strikeShare) * alive);
    }
  }

  pose({ time: 0, direction: Math.PI / 2, moving: false, action: 'idle', actionTime: 0 });
  yaw = undefined;
  lastTime = undefined;
  return {
    root, height: 60, hitHalfWidth: 27, animate: pose,
    reactToHit(direction, age) {
      if (age >= 195) return;
      hitAge = age;
      hitDirection = direction;
    },
  };
}
