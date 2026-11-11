import { Container, Graphics, Text, WebGLRenderer, type Renderer } from 'pixi.js';
import type { GameEvent, Point, SkillDef } from '../../../shared/types';
import { ParticleEffects } from './particle-effects';

const magicColors: Record<SkillDef['effect'], [number, number]> = {
  slash: [0xffdc95, 0xfff2bc], fire: [0xff7758, 0xffd68a], ice: [0x7ae1fa, 0xd5fdff],
  arrow: [0xb7ed8a, 0xffeeae], holy: [0xfbe399, 0xffffd2], poison: [0xb78ee3, 0xf2c4ee],
  shield: [0x8bb9f0, 0xc4f6ee], gold: [0xf5ac56, 0xffdf81],
};
const font = 'PingFang SC, Microsoft YaHei, sans-serif';

interface Effect {
  root: Container;
  age: number;
  duration: number;
  startAt?: number;
  update(ratio: number): void;
}

function burst(kind: SkillDef['effect'], critical: boolean) {
  const root = new Container();
  const [color, light] = magicColors[kind];
  const aura = new Graphics();
  const particles: { g: Graphics; x: number; y: number }[] = [];
  if (kind === 'slash') {
    aura.moveTo(-31,14).bezierCurveTo(-13,18,17,-10,29,-22).quadraticCurveTo(19,5,-10,17)
      .quadraticCurveTo(-20,22,-31,14).closePath().fill({color,alpha:0.77});
    aura.moveTo(-23,16).quadraticCurveTo(6,12,27,-20).stroke({color:light,width:2.4,cap:'round'});
  } else if (kind === 'fire') {
    for (const x of [-9,0,12]) {
      aura.moveTo(x-9,8).quadraticCurveTo(x-14,-4,x-3,-15).quadraticCurveTo(x,-19,x,-30)
        .quadraticCurveTo(x+14,-19,x+10,-5).quadraticCurveTo(x+12,8,x-9,8).closePath()
        .fill({color,alpha:0.58});
      aura.moveTo(x-4,5).quadraticCurveTo(x-7,-2,x+1,-15).quadraticCurveTo(x+8,-2,x+3,5)
        .closePath().fill({color:light,alpha:0.71});
    }
  } else if (kind === 'ice') {
    for (const [x,y] of [[-13,-12],[0,-29],[13,-15]]) {
      aura.poly([x-5,6,x-7,y+9,x,y,x+6,y+8,x+6,5]).fill({color,alpha:0.76}).stroke({color:light,width:1.2});
    }
  } else if (kind === 'shield') {
    aura.moveTo(0,-31).quadraticCurveTo(14,-22,24,-23).quadraticCurveTo(23,3,0,15)
      .quadraticCurveTo(-23,3,-24,-23).quadraticCurveTo(-14,-22,0,-31).closePath()
      .fill({color,alpha:0.24}).stroke({color:light,width:2.2,alpha:0.8});
    aura.moveTo(-8,-8).lineTo(8,-8).moveTo(0,-16).lineTo(0,1).stroke({color:light,width:2.4,cap:'round'});
  } else {
    aura.ellipse(0,5,29,10).stroke({color,width:2.1,alpha:0.7});
    aura.ellipse(0,5,21,7).stroke({color:light,width:1.4,alpha:0.86});
    aura.poly([-10,5,-4,-31,5,-35,11,5]).fill({color,alpha:0.24});
    aura.poly([0,-30,3,-15,11,-11,3,-8,0,4,-3,-8,-11,-11,-3,-15]).fill({color:light,alpha:0.91});
  }
  root.addChild(aura);
  for (let i = 0; i < (critical ? 11 : 7); i++) {
    const angle = i * 2.39996;
    const g = new Graphics().poly([0,-3,2,0,0,3,-2,0]).fill(i % 2 ? light : color);
    particles.push({g,x:Math.cos(angle)*(22 + i*2),y:Math.sin(angle)*(13 + i*2)});
    root.addChild(g);
  }
  return {
    root,
    update(ratio: number) {
      aura.scale.set((critical ? 1.2 : 0.82) + ratio * 0.5);
      aura.alpha = 1 - ratio * ratio;
      for (const {g,x,y} of particles) {
        g.position.set(x * (0.2 + ratio), y * ratio - 18 * ratio);
        g.rotation = ratio * 1.7;
        g.alpha = 1 - ratio;
      }
    },
  };
}

function arrowImpact(critical: boolean) {
  const [color, light] = magicColors.arrow;
  const root = new Graphics()
    .ellipse(0, 0, 5, 3).fill({ color, alpha: 0.46 })
    .moveTo(-10, 0).lineTo(3, 0)
    .moveTo(1, -1).lineTo(8, -5)
    .moveTo(1, 1).lineTo(7, 5)
    .stroke({ color: light, width: 1.45, cap: 'round' })
    .circle(1, 0, 1.9).fill(light);
  return {
    root,
    update(ratio: number) {
      root.scale.set((critical ? 1.15 : 0.85) + ratio * 0.25);
      root.alpha = 1 - ratio;
    },
  };
}

export class CombatEffects {
  readonly root = new Container();
  private readonly active: Effect[] = [];
  private particles?: ParticleEffects;
  private disposed = false;

  async init(renderer: Renderer, status: (value: string) => void) {
    if (!(renderer instanceof WebGLRenderer)) { status('fallback'); return; }
    status('loading');
    try {
      const particles = await ParticleEffects.create(renderer, () => !this.disposed, () => status('fallback'));
      if (this.disposed) { particles?.destroy(); return; }
      if (!particles) { status('fallback'); return; }
      this.particles = particles;
      this.root.addChildAt(particles.root, 0);
      status('ready');
    } catch (error) {
      if (!this.disposed) {
        status('fallback');
        console.warn('Could not load optional combat particles', error);
      }
    }
  }

  get particleCount() { return this.particles?.count ?? 0; }

  launch(event: GameEvent, serverTime: number) {
    const flight = event.projectile;
    if (!flight || flight.arrivesAt <= serverTime || flight.arrivesAt <= event.at) return;
    const arrow = event.effect === 'arrow';
    const [color, light] = magicColors[event.effect ?? 'holy'];
    const root = new Graphics();
    if (arrow) {
      root.moveTo(-17,0).lineTo(5,0).stroke({color:0x64464f,width:2.7,cap:'round'});
      root.moveTo(-16,-.35).lineTo(5,-.35).stroke({color,width:1.05,cap:'round'});
      root.poly([4,-3.1,11,0,4,3.1,6,0]).fill(light).stroke({color:0x766a66,width:.55});
      root.moveTo(-14,0).lineTo(-18,-3).moveTo(-14,0).lineTo(-18,3).stroke({color:light,width:1.35,cap:'round'});
    } else {
      root.ellipse(-5,0,20,6.5).fill({color,alpha:.21});
      root.moveTo(-20,0).quadraticCurveTo(-4,-7,4,-3).quadraticCurveTo(12,0,5,3)
        .quadraticCurveTo(-1,7,-20,0).closePath().fill({color,alpha:.69});
      root.ellipse(2,-.2,6,3.6).fill(light);
      root.ellipse(4,-.7,3.4,1.55).fill(0xffffea);
      root.circle(-14,3,1.2).fill(light).circle(-19,-2,.8).fill(color);
    }
    const { from,to } = flight;
    const dx = to.x - from.x;
    const dy = to.y - from.y + 12;
    const arc = arrow ? 9 : 14;
    const duration = flight.arrivesAt - event.at;
    const update = (ratio: number) => {
      const arcPhase = ratio * Math.PI;
      root.position.set(from.x + dx * ratio,from.y - 29 + dy * ratio - Math.sin(arcPhase) * arc);
      root.rotation = Math.atan2(dy - Math.cos(arcPhase) * Math.PI * arc,dx);
    };
    const age = Math.max(0,serverTime - event.at);
    update(age / duration);
    root.visible = serverTime >= event.at;
    this.enqueue({ root, age, duration, startAt:event.at, update });
  }

  add(event: GameEvent, at: Point, from?: Point) {
    const healing = event.kind === 'heal' && (event.amount ?? 0) > 0;
    const melee = event.kind === 'damage' && event.impact === 'melee' && (event.amount ?? 0) > 0;
    const particle = (healing || melee) && this.particles?.play(healing ? 'cure' : 'melee', at);
    if (!particle && (healing || melee || event.kind === 'skill' || event.effect && (event.kind === 'damage' || event.kind === 'heal'))) {
      const effectKind = healing ? 'holy' : event.effect ?? 'slash';
      const arrowHit = event.kind === 'damage' && effectKind === 'arrow';
      const effect = arrowHit ? arrowImpact(!!event.critical) : burst(effectKind, !!event.critical);
      effect.root.position.set(at.x, at.y - 18);
      if (arrowHit) effect.root.rotation = event.impactAngle ?? (from ? Math.atan2(at.y - from.y, at.x - from.x) : 0);
      if (from && effectKind === 'slash' && from.x > at.x) effect.root.scale.x = -1;
      this.enqueue({ ...effect, age: 0, duration: arrowHit ? 180 : event.kind === 'skill' ? 420 : 460 });
    }
    let text: string;
    let color: number;
    switch (event.kind) {
      case 'damage': text = `−${event.amount ?? 0}${event.critical ? '!' : ''}`; color = event.critical ? 0xffe492 : 0xffb295; break;
      case 'heal': text = `+${event.amount ?? 0}`; color = 0xb1ffad; break;
      case 'level': text = '升级！'; color = 0xffe59f; break;
      case 'loot': text = '拾取'; color = 0xc7f3d7; break;
      default: return;
    }
    const float = new Text({ text, style: {fontFamily:font,fontSize:event.critical ? 22 : 16,fontWeight:'bold',fill:color,stroke:{color:0x332739,width:4}} });
    float.anchor.set(0.5);
    float.position.set(at.x, at.y - 40);
    this.enqueue({ root: float, age: 0, duration: 840, update(ratio) {
      float.y = at.y - 40 - ratio * 40;
      float.alpha = Math.min(1, (1 - ratio) * 3);
    } });
  }

  private enqueue(effect: Effect) {
    if (this.active.length >= 80) this.active.shift()?.root.destroy({children:true});
    this.active.push(effect);
    this.root.addChild(effect.root);
  }

  tick(ms: number, serverTime: number) {
    this.particles?.tick(ms);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i];
      if (effect.startAt === undefined) effect.age += ms;
      else {
        if (serverTime < effect.startAt) continue;
        effect.root.visible = true;
        effect.age = Math.max(effect.age, serverTime - effect.startAt);
      }
      if (effect.age >= effect.duration) {
        effect.root.destroy({children:true});
        this.active.splice(i, 1);
      } else effect.update(effect.age / effect.duration);
    }
  }

  clear() {
    this.particles?.clear();
    for (const effect of this.active) effect.root.destroy({children:true});
    this.active.length = 0;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.particles?.destroy();
    this.particles = undefined;
    this.clear();
  }
}
