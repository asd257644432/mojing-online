import { Container } from 'pixi.js';
import { BipedGait, bipedHipHeight, bipedSole, bipedThigh } from './biped-gait';
import { easeStarterPose as ease, mixStarterPose as mix, StarterRigParts, turnStarterViews, type StarterPart } from './starter-rig-parts';
import type { Rig, RigPose } from './rigs';

const scale = .65;
const cutouts = {
  frontHead: { bounds: [112, 111, 316, 340], pivot: [209, 323], width: 16.5 / scale, height: 15.5 / scale },
  backHead: { bounds: [520, 108, 732, 337], pivot: [626, 323], width: 16.5 / scale, height: 15.5 / scale },
  frontTorso: { bounds: [959, 77, 1119, 375], pivot: [1041, 357], width: 13.8 / scale, height: 15.5 / scale },
  backTorso: { bounds: [134, 494, 295, 792], pivot: [214, 775], width: 13.8 / scale, height: 15.5 / scale },
  ear: { bounds: [576, 475, 675, 800], pivot: [620, 779], width: 4.8 / scale, height: 17.5 / scale },
  armWithPaw: { bounds: [999, 515, 1095, 766], pivot: [1029, 540], width: 4.0 / scale, height: 10.5 / scale },
  thigh: { bounds: [154, 926, 270, 1172], pivot: [217, 950], tip: [207, 1158], width: 4.7 / scale },
  shinWithFoot: { bounds: [531, 929, 681, 1175], pivot: [640, 948], tip: [605, 1169], width: 6.3 / scale },
  tail: { bounds: [962, 979, 1118, 1128], pivot: [1038, 1054], width: 5.5 / scale, height: 5.0 / scale },
} as const satisfies Record<string, StarterPart>;
type Part = keyof typeof cutouts;
type Pixel = readonly [number, number];
type Sockets = {
  neck: Pixel;
  shoulders: readonly [Pixel, Pixel];
  ears: readonly [Pixel, Pixel];
};

const front: Sockets = { neck: [1041, 94], shoulders: [[1009, 169], [1070, 169]], ears: [[182, 128], [247, 125]] };
const rear: Sockets = { neck: [214, 510], shoulders: [[183, 585], [245, 585]], ears: [[592, 127], [666, 127]] };

export class RabbitRigAtlas {
  static async load() {
    return new RabbitRigAtlas(await StarterRigParts.load('/assets/monsters/island-rabbit-rig.png', 'island-rabbit', cutouts));
  }

  private constructor(private readonly art: StarterRigParts<Part>) {}

  create(definitionId?: string) {
    if (definitionId === 'pink-rabbit' && this.art.available) return buildRabbitRig(this.art);
  }

  destroy() { this.art.destroy(); }
}

function buildRabbitRig(art: StarterRigParts<Part>): Rig {
  const root = new Container({ label: 'pink-rabbit-articulated-rig' });
  root.scale.set(scale);
  const body = art.joint(root, 'body');
  const spread = 3.7;
  const legs = ([-1, 1] as const).map(side => {
    const name = side < 0 ? 'left' : 'right';
    const hip = art.joint(body, `hip-${name}`, side * spread, -bipedHipHeight);
    art.link(hip, 'thigh', side, side * bipedThigh.x, bipedThigh.y);
    const knee = art.joint(hip, `knee-${name}`, side * bipedThigh.x, bipedThigh.y);
    art.link(knee, 'shinWithFoot', side, side * bipedSole.x, bipedSole.y);
    art.joint(knee, `sole-${name}`, side * bipedSole.x, bipedSole.y);
    return { side, hip, knee };
  });
  const chest = art.joint(body, 'chest', 0, -bipedHipHeight);
  chest.sortableChildren = true;
  const frontTorso = art.piece(chest, 'frontTorso');
  const backTorso = art.piece(chest, 'backTorso');
  const frontNeck = art.offset('frontTorso', frontTorso, front.neck);
  const rearNeck = art.offset('backTorso', backTorso, rear.neck);
  const tailOffset = art.offset('backTorso', backTorso, [216, 715]);
  const tail = art.joint(chest, 'tail-hinge', tailOffset.x, tailOffset.y);
  art.piece(tail, 'tail');

  const head = art.joint(chest, 'neck', frontNeck.x, frontNeck.y);
  head.zIndex = 3;
  const frontHead = art.piece(head, 'frontHead');
  const backHead = art.piece(head, 'backHead');
  const ears = ([-1, 1] as const).map((side, index) => {
    const frontBase = art.offset('frontHead', frontHead, front.ears[index]);
    const rearBase = art.offset('backHead', backHead, rear.ears[index]);
    const base = art.joint(head, `ear-hinge-${index}`, frontBase.x, frontBase.y);
    head.setChildIndex(base, index);
    art.piece(base, 'ear', side);
    return { side, base, frontBase, rearBase };
  });
  const arms = ([-1, 1] as const).map((side, index) => {
    const frontBase = art.offset('frontTorso', frontTorso, front.shoulders[index]);
    const rearBase = art.offset('backTorso', backTorso, rear.shoulders[index]);
    const shoulder = art.joint(chest, `shoulder-${index}`, frontBase.x, frontBase.y);
    art.piece(shoulder, 'armWithPaw', side);
    return { side, shoulder, frontBase, rearBase };
  });

  const gait = new BipedGait();
  gait.advance(0, 0, 0, 1, spread, false);
  let lastTime: number | undefined;
  let yaw: number | undefined;
  let crouch = 0, hop = 0;
  let hitAge = Infinity, hitDirection = 0;

  function pose({ time, direction, action, actionTime, travelX = 0, travelY = 0, deltaSeconds }: RigPose) {
    const dt = Math.min(.06, Math.max(0, deltaSeconds ?? (lastTime === undefined ? 1 / 60 : time - lastTime)));
    lastTime = time;
    yaw ??= direction;
    const dead = action === 'dead';
    const turn = Math.atan2(Math.sin(direction - yaw), Math.cos(direction - yaw));
    const blend = 1 - Math.exp(-dt * 17);
    if (!dead) yaw += turn * blend;
    const forward = Math.cos(yaw), depth = Math.sin(yaw);
    const back = ease((-depth - .06) / .58);
    turnStarterViews(frontTorso, backTorso, back);
    turnStarterViews(frontHead, backHead, back);

    const attacking = action === 'attack' || action === 'cast';
    const actionBlend = 1 - Math.exp(-dt * 31);
    crouch = mix(crouch, attacking ? ease(actionTime / 66) * (1 - ease((actionTime - 78) / 60)) : 0, actionBlend);
    hop = mix(hop, attacking ? ease((actionTime - 80) / 72) * (1 - ease((actionTime - 160) / 133)) : 0, actionBlend);
    const fallen = dead ? ease(actionTime / 390) : 0;
    const alive = 1 - fallen;
    hitAge += dt * 1000;
    const hit = Math.sin(Math.PI * Math.min(1, hitAge / 165)) * alive;
    const attackHop = hop * alive;
    const attackCrouch = crouch * alive;

    body.scale.x = 1 - Math.abs(forward) * .12;
    const step = gait.advance(travelX / scale, travelY / scale, dt, blend, spread * body.scale.x,
      !dead && !attacking && hitAge >= 80, true) * alive;
    const breath = Math.sin(time * 3.1) * alive;
    const lean = forward * (attackHop * .13 - attackCrouch * .07) + Math.cos(hitDirection) * hit * .055;
    body.y = gait.plant(legs, body.scale.x, lean, 1.2 + attackCrouch * 2 - Math.abs(step) * .65 - breath * .19, true)
      - attackHop * 7 + fallen * 4;
    body.rotation = lean + fallen * (forward > 0 ? 1 : -1) * 1.35;
    body.alpha = 1 - fallen * .48;

    chest.x = forward * (attackHop * 1.9 - attackCrouch) + Math.cos(hitDirection) * hit * 1.5;
    chest.rotation = -step * .045 + forward * attackHop * .07;
    head.position.set(mix(frontNeck.x, rearNeck.x, back), mix(frontNeck.y, rearNeck.y, back));
    head.rotation = forward * .115 - chest.rotation * .52 - attackHop * .08;
    for (const { side, base, frontBase, rearBase } of ears) {
      base.position.set(mix(frontBase.x, rearBase.x, back), mix(frontBase.y, rearBase.y, back));
      base.rotation = side * (.09 + Math.sin(time * 3.8 + side) * .027 * alive)
        + turn * blend * .20 - step * .14 - attackHop * .33 + hit * .22 + fallen * side * .29;
    }
    for (const { side, shoulder, frontBase, rearBase } of arms) {
      shoulder.position.set(mix(frontBase.x, rearBase.x, back), mix(frontBase.y, rearBase.y, back));
      shoulder.rotation = side * (-.08 + step * .34 - attackCrouch * .24 + attackHop * .62);
      shoulder.zIndex = side * forward > .12 ? -1 : 1;
    }
    tail.alpha = back;
    tail.zIndex = back > .5 ? 2 : -2;
    tail.rotation = -step * .20 + breath * .045 - attackHop * .22;
  }

  pose({ time: 0, direction: Math.PI / 2, moving: false, action: 'idle', actionTime: 0 });
  yaw = undefined;
  lastTime = undefined;
  return {
    root, height: 55, hitHalfWidth: 14, animate: pose,
    reactToHit(direction, age) {
      if (age >= 165) return;
      hitAge = age;
      hitDirection = direction;
    },
  };
}
