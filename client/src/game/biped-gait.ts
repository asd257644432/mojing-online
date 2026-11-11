import type { Container } from 'pixi.js';

export const bipedHipHeight = 18.4;
export const bipedThigh = { x: .9, y: 8.2 } as const;
export const bipedSole = { x: .25, y: 10.05 } as const;
const upperLength = Math.hypot(bipedThigh.x, bipedThigh.y);
const lowerLength = Math.hypot(bipedSole.x, bipedSole.y);
const reach = upperLength + lowerLength - .14;
const support = .24;

interface Leg { side: number; hip: Container; knee: Container; }

const mix = (from: number, to: number, ratio: number) => from + (to - from) * ratio;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function plantLeg({ hip, knee, side }: Leg, x: number, y: number) {
  const length = Math.hypot(x, y);
  const distance = clamp(length, lowerLength - upperLength + .14, reach);
  const aim = Math.atan2(y, x);
  const bend = Math.acos(clamp((upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance), -1, 1));
  const kneeAngle = aim + bend;
  hip.rotation = kneeAngle - Math.atan2(bipedThigh.y, side * bipedThigh.x);
  const lowerAngle = Math.atan2(Math.sin(aim) * distance - Math.sin(kneeAngle) * upperLength,
    Math.cos(aim) * distance - Math.cos(kneeAngle) * upperLength);
  knee.rotation = lowerAngle - hip.rotation - Math.atan2(bipedSole.y, side * bipedSole.x);
  return distance === length ? undefined : distance;
}

export class BipedGait {
  // Tracks stay in screen axes, even when the presented body mirrors.
  private readonly feet = ([-1, 1] as const).map(side => ({ side, x: side * 5, y: 0, groundY: 0, anchorX: 0, anchorY: 0, goalX: 0, goalY: 0,
    swingStart: support, liftStart: 0 }));
  private phase = support / 2;
  private stride = 0;
  private strideLength = 0;
  private walking = false;

  advance(travelX: number, travelY: number, elapsed: number, blend: number, spread: number, enabled: boolean, holdStoppedFeet = false) {
    const distance = Math.hypot(travelX, travelY);
    const speed = elapsed > 0 ? distance / elapsed : 0;
    const walking = enabled && speed > 3 && distance <= Math.max(14, elapsed * 330);
    this.stride = mix(this.stride, walking ? clamp(speed / 125, .20, 1) : 0, blend);
    if (walking) {
      const forwardX = travelX / distance, forwardY = travelY / distance;
      const wantedLength = (32 + 32 * Math.min(1, speed / 190)) * (1 - .34 * Math.abs(forwardY));
      this.strideLength = this.walking ? mix(this.strideLength, wantedLength, blend) : wantedLength;
      if (!this.walking) this.phase = support / 2;
      const nextPhase = holdStoppedFeet && !this.walking ? this.phase : (this.phase + distance / this.strideLength) % 1;
      const lead = this.strideLength * support / 2;
      for (let index = 0; index < this.feet.length; index++) {
        const foot = this.feet[index];
        const from = (this.phase + index * .5) % 1, to = (nextPhase + index * .5) % 1;
        const neutralX = foot.side * spread;
        if (!this.walking) {
          const behind = holdStoppedFeet ? 0 : lead - from * this.strideLength;
          foot.anchorX = foot.x + forwardX * behind;
          foot.anchorY = (holdStoppedFeet ? foot.groundY : foot.y) + forwardY * behind;
          // Restart the airborne half-cycle from its actual stopped contact, not a preset phase pose.
          foot.swingStart = holdStoppedFeet ? Math.max(support, from) : support;
          foot.liftStart = holdStoppedFeet ? foot.groundY - foot.y : 0;
        }
        if (to < from) {
          foot.anchorX = foot.goalX - travelX;
          foot.anchorY = foot.goalY - travelY;
          foot.swingStart = support;
          foot.liftStart = 0;
        } else {
          foot.anchorX -= travelX;
          foot.anchorY -= travelY;
        }
        const swing = clamp((to - foot.swingStart) / (1 - foot.swingStart), 0, 1);
        if (this.walking && to <= support) foot.liftStart *= 1 - blend;
        const smooth = swing * swing * (3 - 2 * swing);
        const ahead = lead + (1 - to) * this.strideLength;
        const goalX = neutralX + forwardX * ahead, goalY = forwardY * ahead;
        // Retarget the swing in world space so reversing leaves the airborne foot continuous.
        if (!this.walking || (from <= support && to > support)) {
          foot.goalX = goalX;
          foot.goalY = goalY;
        } else if (to > support) {
          foot.goalX = mix(foot.goalX - travelX, goalX, blend);
          foot.goalY = mix(foot.goalY - travelY, goalY, blend);
        }
        foot.x = mix(foot.anchorX, foot.goalX, smooth);
        foot.groundY = mix(foot.anchorY, foot.goalY, smooth);
        foot.y = foot.groundY - 5.2 * this.stride * Math.sin(Math.PI * swing) ** 1.25 - foot.liftStart * (1 - smooth);
      }
      this.phase = nextPhase;
    } else {
      for (const foot of this.feet) {
        // Finish lowering an airborne foot without dragging a planted foot to neutral.
        if (holdStoppedFeet && distance <= Math.max(14, elapsed * 330)) {
          foot.x -= travelX;
          foot.y -= travelY;
          foot.groundY -= travelY;
        }
        if (!holdStoppedFeet) foot.x = mix(foot.x, foot.side * spread, blend);
        foot.y = mix(foot.y, holdStoppedFeet ? foot.groundY : 0, blend);
      }
    }
    this.walking = walking;
    return Math.sin(this.phase * 2 * Math.PI) * this.stride;
  }

  plant(legs: readonly Leg[], scaleX: number, lean: number, bodyY: number, releaseUnreachable = false) {
    const cosine = Math.cos(lean), sine = Math.sin(lean);
    const mirrored = scaleX < 0;
    // Lower the pelvis only as much as the fixed-length legs need to reach both feet.
    for (let index = 0; index < legs.length; index++) {
      const { hip } = legs[index];
      const foot = this.feet[mirrored ? 1 - index : index];
      const x = foot.x / scaleX - hip.x;
      let needed = -hip.y + foot.y - Math.sqrt(Math.max(0, (reach - .22) ** 2 - x * x));
      if (releaseUnreachable) {
        // Include torso lean when finding the pelvis height that reaches a fixed contact.
        const a = (cosine * foot.x + sine * foot.y) / scaleX - hip.x;
        const b = -sine * foot.x + cosine * foot.y - hip.y;
        const u = sine / scaleX, v = cosine, squared = u * u + v * v;
        const projection = a * u + b * v;
        const discriminant = projection * projection - squared * (a * a + b * b - (reach - .22) ** 2);
        if (discriminant >= 0) needed = (projection - Math.sqrt(discriminant)) / squared;
      }
      bodyY = Math.max(bodyY, Math.min(9.4, needed));
    }
    for (let index = 0; index < legs.length; index++) {
      const leg = legs[index];
      const foot = this.feet[mirrored ? 1 - index : index];
      const relativeY = foot.y - bodyY;
      const x = (cosine * foot.x + sine * relativeY) / scaleX - leg.hip.x;
      const y = -sine * foot.x + cosine * relativeY - leg.hip.y;
      const clampedReach = plantLeg(leg, x, y);
      if (releaseUnreachable && clampedReach !== undefined) {
        // When turning away from an out-of-reach contact, rebase its swing on the solved foot.
        const aim = Math.atan2(y, x);
        const localX = (leg.hip.x + Math.cos(aim) * clampedReach) * scaleX;
        const localY = leg.hip.y + Math.sin(aim) * clampedReach;
        const placedX = cosine * localX - sine * localY;
        const placedY = sine * localX + cosine * localY + bodyY;
        const shiftX = placedX - foot.x, shiftY = placedY - foot.y;
        foot.anchorX += shiftX;
        foot.anchorY += shiftY;
        foot.goalX += shiftX;
        foot.goalY += shiftY;
        foot.x = placedX;
        foot.y = placedY;
        foot.groundY += shiftY;
      }
    }
    return bodyY;
  }
}
