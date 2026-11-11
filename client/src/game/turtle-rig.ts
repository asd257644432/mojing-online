import { Container } from 'pixi.js';
import { FootContact, FootfallGait } from './footfall-gait';
import { easeStarterPose as ease, mixStarterPose as mix } from './starter-rig-parts';
import { turtleHead, turtleLeg, turtleNeck, turtleShell, turtleTail, type TurtleShading } from './turtle-art';
import type { Rig, RigPose } from './rigs';

function joint(parent: Container, label: string, x = 0, y = 0) {
  return parent.addChild(new Container({ label: `island-turtle:${label}`, x, y }));
}

export function createTurtleRig(shading: TurtleShading): Rig {
  const root = new Container({ label: 'stink-turtle-articulated-rig', sortableChildren: true });
  const body = joint(root, 'shell-body');
  body.addChild(turtleShell(shading)).scale.set(.82);
  const neck = joint(root, 'neck-hinge');
  neck.addChild(turtleNeck(shading));
  const head = joint(neck, 'head-hinge', -6.7, 0);
  const leftHead = head.addChild(turtleHead(shading, 'side'));
  const rightHead = head.addChild(turtleHead(shading, 'side', true));
  const frontHead = head.addChild(turtleHead(shading, 'front'));
  const backHead = head.addChild(turtleHead(shading, 'rear'));
  const tail = joint(root, 'tail-hinge');
  tail.addChild(turtleTail(shading));

  const legs = ([-1, 1] as const).flatMap(side => [false, true].map(fore => {
    const name = `${fore ? 'fore' : 'hind'}-${side < 0 ? 'left' : 'right'}`;
    const upper = joint(root, `hip-${name}`);
    const lower = joint(root, `knee-${name}`);
    const upperLength = fore ? 7.2 : 7.5, lowerLength = fore ? 8.3 : 8.5;
    upper.addChild(turtleLeg(shading, `upper-${name}`, upperLength, false, side < 0));
    lower.addChild(turtleLeg(shading, `foot-${name}`, lowerLength, true, side < 0));
    joint(lower, `sole-${name}`, 0, lowerLength);
    return {
      side, fore, upper, lower, upperLength, lowerLength, contact: new FootContact(0, 0),
      station: fore ? 12.4 : -12.7, offsetY: fore ? 1.0 : 1.8, lateralY: fore ? 2.2 : 2.5,
    };
  }));
  const gait = new FootfallGait(legs.map(leg => leg.contact), { stepSpacing: 6.5, swingDistance: 7, stepLead: 8, liftHeight: 3 });

  function plant(leg: typeof legs[number], x: number, y: number) {
    const { side, fore, upper, lower, upperLength, lowerLength, contact } = leg;
    const pawY = contact.y - contact.lift;
    const dx = contact.x - x, dy = pawY - y;
    const wanted = Math.hypot(dx, dy);
    const span = Math.max(Math.abs(upperLength - lowerLength) + .06, Math.min(upperLength + lowerLength - .06, wanted));
    const ax = wanted > .0001 ? dx / wanted : 0;
    const ay = wanted > .0001 ? dy / wanted : 1;
    const endX = x + ax * span, endY = y + ay * span;
    if (span !== wanted) contact.place(endX, endY + contact.lift);
    const along = (upperLength * upperLength - lowerLength * lowerLength + span * span) / (2 * span);
    const bend = Math.sqrt(Math.max(0, upperLength * upperLength - along * along)) * side * (fore ? 1 : -1);
    const kneeX = ax * along - ay * bend;
    const kneeY = ay * along + ax * bend;
    upper.position.set(x, y);
    upper.rotation = Math.atan2(-kneeX, kneeY);
    lower.position.set(x + kneeX, y + kneeY);
    lower.rotation = Math.atan2(lower.x - endX, endY - lower.y);
  }

  let yaw: number | undefined;
  let lastTime: number | undefined;
  let pull = 0, strike = 0;
  let hitAge = Infinity, hitDirection = 0;
  let phase = 0;
  let walkingWeight = 0;

  function pose({ time, direction, action, actionTime, travelX = 0, travelY = 0, deltaSeconds }: RigPose) {
    const first = lastTime === undefined;
    const dt = Math.min(.06, Math.max(0, deltaSeconds ?? (lastTime === undefined ? 1 / 60 : time - lastTime)));
    lastTime = time;
    yaw ??= direction;
    const dead = action === 'dead';
    const turn = Math.atan2(Math.sin(direction - yaw), Math.cos(direction - yaw));
    const blend = 1 - Math.exp(-dt * 14);
    // Let stationary feet take turns before rotating the hips beyond their reach.
    const turnLimit = Math.hypot(travelX,travelY) <= dt*3 ? dt : Infinity;
    if (!dead) yaw += Math.max(-turnLimit,Math.min(turnLimit,turn*blend));
    const forward = Math.cos(yaw), depth = Math.sin(yaw);
    const axial = 1 - ease((Math.abs(forward) - .25) / .54);
    leftHead.alpha = forward < 0 ? 1 - axial : 0;
    rightHead.alpha = forward >= 0 ? 1 - axial : 0;
    frontHead.alpha = depth >= 0 ? axial : 0;
    backHead.alpha = depth < 0 ? axial : 0;
    leftHead.visible = leftHead.alpha > 0;
    rightHead.visible = rightHead.alpha > 0;
    frontHead.visible = frontHead.alpha > 0;
    backHead.visible = backHead.alpha > 0;

    const attacking = action === 'attack' || action === 'cast';
    const actionBlend = 1 - Math.exp(-dt * 27);
    pull = mix(pull, attacking ? ease(actionTime / 94) * (1 - ease((actionTime - 108) / 53)) : 0, actionBlend);
    strike = mix(strike, attacking ? ease((actionTime - 95) / 72) * (1 - ease((actionTime - 182) / 142)) : 0, actionBlend);
    const fallen = dead ? ease(actionTime / 445) : 0;
    const alive = 1 - fallen;
    hitAge += dt * 1000;
    const hit = Math.sin(Math.PI * Math.min(1, hitAge / 190)) * alive;
    const mayStep = !dead && !attacking && hitAge >= 80;
    body.scale.x = .76 + Math.abs(forward) * .24;
    for (const { side, station, lateralY, contact } of legs) {
      contact.neutralX = forward * station * body.scale.x - depth * side * 4.0;
      contact.neutralY = depth * station * .56 + forward * side * lateralY;
      if (first) contact.place(contact.neutralX, contact.neutralY);
    }
    const stepped = gait.advance(travelX, travelY, dt, mayStep);
    phase = (phase + stepped / 26) % 1;
    walkingWeight = mix(walkingWeight, stepped > 0 ? 1 : 0, blend);
    const shuffle = Math.sin(phase * Math.PI * 2) * walkingWeight * alive;

    body.x = Math.cos(hitDirection) * hit * 1.8 + forward * (strike - pull) * alive * 1.0;
    body.y = -11.2 + shuffle * .64 + Math.sin(time * 2.6) * alive * .20 + fallen * 2.7;
    body.rotation = (forward * (shuffle * .031 + strike * .068 - pull * .051)
      + Math.cos(hitDirection) * hit * .045) * alive + fallen * forward * .17;
    root.alpha = 1 - fallen * .49;
    const sine = Math.sin(body.rotation), cosine = Math.cos(body.rotation);

    for (const leg of legs) {
      const { side, station, contact } = leg;
      const localY = contact.neutralY + leg.offsetY;
      plant(leg, body.x + contact.neutralX * cosine - localY * sine, body.y + contact.neutralX * sine + localY * cosine);
      const near = forward * side * leg.lateralY + depth * station * .28 > 0;
      leg.upper.zIndex = near ? 1 : -3;
      leg.lower.zIndex = near ? 2 : -2;
    }

    const headReach = (strike * 3.7 - pull * 2.9) * alive - fallen * 2.3;
    const neckX = forward * (12.4 * body.scale.x + headReach);
    const neckY = depth * (12.4 * .56 + headReach * .56) + .8;
    neck.position.set(body.x + neckX * cosine - neckY * sine, body.y + neckX * sine + neckY * cosine);
    const reachAngle = Math.atan2(depth * .49 - .28, forward);
    neck.rotation = reachAngle - Math.PI + body.rotation;
    head.rotation = -neck.rotation + forward * (.09 - strike * .17) * alive;
    head.scale.set((.86 + Math.abs(forward) * .14)*1.45,1.45);
    neck.zIndex = depth < -.25 ? -1 : 3;

    const tailX = -forward * 16.4 * body.scale.x;
    const tailY = -depth * 16.4 * .56 + 1.2;
    tail.position.set(body.x + tailX * cosine - tailY * sine, body.y + tailX * sine + tailY * cosine);
    tail.rotation = Math.atan2(-depth * .50, -forward) + shuffle * .17;
    tail.zIndex = depth < -.25 ? 3 : -1;
    tail.alpha = alive;
  }

  pose({ time: 0, direction: Math.PI, moving: false, action: 'idle', actionTime: 0 });
  yaw = undefined;
  lastTime = undefined;
  return {
    root, height: 34, hitHalfWidth: 36, animate: pose,
    reactToHit(direction, age) {
      if (age >= 190) return;
      hitAge = age;
      hitDirection = direction;
    },
  };
}
