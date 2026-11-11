export class FootContact {
  x = 0;
  y = 0;
  lift = 0;
  fromX = 0;
  fromY = 0;
  goalX = 0;
  goalY = 0;
  elapsed = Infinity;

  constructor(public neutralX: number, public neutralY: number) {
    this.place(neutralX, neutralY);
  }

  place(x: number, y: number) {
    // Also rebase swing endpoints when the fixed-length leg reaches its limit.
    const dx = x - this.x, dy = y - this.y;
    this.x = x;
    this.y = y;
    this.fromX += dx;
    this.fromY += dy;
    this.goalX += dx;
    this.goalY += dy;
  }
}

interface FootfallTiming {
  stepSpacing: number;
  swingDistance: number;
  stepLead: number;
  liftHeight: number;
}

/** Contact order is supplied by the rig. Planted points remain fixed in screen axes. */
export class FootfallGait {
  private nextFoot = 0;
  private untilStep = 0;

  constructor(private readonly contacts: readonly FootContact[], private readonly timing: FootfallTiming) {}

  advance(travelX: number, travelY: number, dt: number, enabled: boolean) {
    const { stepSpacing, swingDistance, stepLead, liftHeight } = this.timing;
    let distance = Math.hypot(travelX, travelY);
    const corrected = distance > Math.max(12, dt * 260);
    if (corrected) {
      travelX = 0;
      travelY = 0;
      distance = 0;
    }
    const walking = enabled && dt > 0 && distance / dt > 3;
    const forwardX = walking ? travelX / distance : 0;
    const forwardY = walking ? travelY / distance : 0;
    const blend = 1 - Math.exp(-dt * 13);

    for (const foot of this.contacts) {
      foot.place(foot.x - travelX, foot.y - travelY);
      if (foot.elapsed >= swingDistance) continue;
      foot.elapsed = Math.min(swingDistance, foot.elapsed + (walking ? distance : dt * swingDistance / .135));
      if (walking) {
        const ahead = stepLead + swingDistance - foot.elapsed;
        foot.goalX += (foot.neutralX + forwardX * ahead - foot.goalX) * blend;
        foot.goalY += (foot.neutralY + forwardY * ahead - foot.goalY) * blend;
      }
      const t = foot.elapsed / swingDistance;
      const smooth = t * t * (3 - 2 * t);
      foot.x = foot.fromX + (foot.goalX - foot.fromX) * smooth;
      foot.y = foot.fromY + (foot.goalY - foot.fromY) * smooth;
      foot.lift = t < 1 ? liftHeight * Math.sin(t * Math.PI) ** 1.4 : 0;
    }

    if (!walking) {
      // Settle or turn in place one foot at a time; planted feet must not slide.
      if (enabled && !corrected && dt > 0 && !this.contacts.some(foot => foot.elapsed < swingDistance)) {
        for (let offset = 0; offset < this.contacts.length; offset++) {
          const index = (this.nextFoot + offset) % this.contacts.length;
          const foot = this.contacts[index];
          if (Math.hypot(foot.x-foot.neutralX,foot.y-foot.neutralY) <= .65) continue;
          foot.elapsed = 0;
          foot.fromX = foot.x;
          foot.fromY = foot.y;
          foot.goalX = foot.neutralX;
          foot.goalY = foot.neutralY;
          this.nextFoot = (index + 1) % this.contacts.length;
          break;
        }
      }
      return 0;
    }
    this.untilStep -= distance;
    if (this.untilStep > 0) return distance;
    const foot = this.contacts[this.nextFoot];
    foot.elapsed = 0;
    foot.fromX = foot.x;
    foot.fromY = foot.y;
    foot.goalX = foot.neutralX + forwardX * (stepLead + swingDistance);
    foot.goalY = foot.neutralY + forwardY * (stepLead + swingDistance);
    this.nextFoot = (this.nextFoot + 1) % this.contacts.length;
    this.untilStep = stepSpacing + Math.max(-stepSpacing / 2, this.untilStep);
    return distance;
  }
}
