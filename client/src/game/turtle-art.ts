import { Graphics } from 'pixi.js';
import type { RigShading } from './rigs';

export type TurtleShading = Pick<RigShading, 'shade'>;

class TurtlePart extends Graphics {
  override destroy() {
    // Each piece owns its geometry. The scene owns the shared gradient fills.
    if (!this.destroyed) super.destroy({ context: true });
  }
}

function part(label: string) {
  const graphic = new TurtlePart({ label: `island-turtle:${label}` });
  graphic.context.batchMode = 'batch';
  return graphic;
}

const greenEdge = 0x395133;
const warmEdge = 0x63382b;

export function turtleShell(shading: TurtleShading) {
  const g = part('shell');
  g.moveTo(-20, -.7).bezierCurveTo(-16, -4, 14, -4, 20, -.4)
    .bezierCurveTo(24, 6, 10, 7.4, 1, 7.4)
    .bezierCurveTo(-10, 7.4, -23, 5.4, -20, -.7).closePath()
    .fill(shading.shade(0x9a512f)).stroke({ color: warmEdge, width: .75, join: 'round' });
  g.moveTo(-20.8, -.9).bezierCurveTo(-20.5, -12.4, -12.8, -21, -.8, -21.8)
    .bezierCurveTo(9.7, -23, 19.1, -15, 21, -.9)
    .bezierCurveTo(12.8, 3.7, -12.3, 3.6, -20.8, -.9).closePath()
    .fill(shading.shade(0xdd6936)).stroke({ color: warmEdge, width: .75, join: 'round' });

  g.moveTo(-12, -16).quadraticCurveTo(-11, -8, -15.7, -1.9)
    .moveTo(-.5, -21).quadraticCurveTo(4.2, -11.7, 1.3, 1.1)
    .moveTo(11.2, -16.7).quadraticCurveTo(13.7, -9.7, 15.4, -.8)
    .moveTo(-18.6, -7.5).quadraticCurveTo(-3.6, -13, 19.4, -7.3)
    .stroke({ color: 0x953e2c, width: .45, alpha: .28, cap: 'round' });

  g.ellipse(-15.8, -5.2, 3.3, 2.45).fill(0xfad696);
  g.moveTo(-12.6, -13.6).quadraticCurveTo(-8.2, -17.7, -3.1, -15.2)
    .quadraticCurveTo(.0, -12, -4.4, -9.3).quadraticCurveTo(-9.6, -7.4, -12.5, -10.4)
    .quadraticCurveTo(-14, -11.6, -12.6, -13.6).closePath().fill(0xffe3a6);
  g.ellipse(1.9, -18.4, 4.4, 2.0).fill(0xffdfa1);
  g.moveTo(4.8, -12.3).quadraticCurveTo(8.4, -14.4, 12.0, -11.8)
    .quadraticCurveTo(14.8, -7.8, 10.3, -7.0).quadraticCurveTo(5.4, -6.7, 4.8, -12.3)
    .closePath().fill(0xfad497);
  g.ellipse(15.2, -3.7, 3.7, 2.3).fill(0xf2c386);

  g.moveTo(-15.7, -13.3).quadraticCurveTo(-11.9, -18.6, -5, -19.5)
    .stroke({ color: 0xffebbf, alpha: .75, width: 1.45, cap: 'round' });
  g.moveTo(-18.1, 1.7).quadraticCurveTo(-4.2, 6.4, 16.7, 2.5)
    .stroke({ color: 0xec9457, width: 1.25, alpha: .83, cap: 'round' });
  return g;
}

function eye(g: Graphics, x: number, y: number, size: number) {
  g.ellipse(x, y, size * 1.13, size * 1.27).fill(0x334634);
  g.ellipse(x, y, size * .85, size).fill(0x1e2820);
  g.circle(x - .32, y - .46, size * .32).fill(0xffebc7);
}

export function turtleHead(shading: TurtleShading, view: 'side' | 'front' | 'rear', mirrored = false) {
  const g = part(view === 'side' ? (mirrored ? 'head-right' : 'head-left') : `head-${view}`);
  if (view === 'side') {
    g.moveTo(3.7, .9).bezierCurveTo(5.7, -4, 1.1, -8.0, -4.4, -7.1)
      .bezierCurveTo(-8.5, -6.4, -10, -2.7, -9.0, .9)
      .bezierCurveTo(-8.0, 5.1, -1.4, 5.5, 3.7, .9).closePath()
      .fill(shading.shade(0x79a654)).stroke({ color: greenEdge, width: .85, join: 'round' });
    g.ellipse(-6.0, 1.0, 2.7, 1.5).fill({ color: 0xc4c57b, alpha: .80 });
    eye(g, -4.7, -3.9, 1.30);
    g.circle(-8.0, -.6, .41).fill(0x535c3d);
    g.moveTo(-8.2, 2.1).quadraticCurveTo(-5.9, 3.1, -4.0, 1.8)
      .stroke({ color: greenEdge, width: .62, cap: 'round' });
    if (mirrored) g.scale.x = -1;
  } else {
    g.ellipse(0, -1.3, 6.8, 6.3).fill(shading.shade(0x77a653))
      .stroke({ color: greenEdge, width: .85 });
    if (view === 'front') {
      g.ellipse(0, 1.45, 4.8, 2.7).fill({ color: 0xc4c57b, alpha: .80 });
      eye(g, -3.25, -3.55, 1.22);
      eye(g, 3.25, -3.55, 1.22);
      g.circle(-1.32, -.1, .37).circle(1.32, -.1, .37).fill(0x515e3e);
      g.moveTo(-2.6, 2.0).quadraticCurveTo(0, 3.45, 2.6, 2.0)
        .stroke({ color: greenEdge, width: .60, cap: 'round' });
    }
  }
  return g;
}

export function turtleNeck(shading: TurtleShading) {
  return part('neck').roundRect(-8.2, -2.6, 10, 5.6, 2.6)
    .fill(shading.shade(0x668846)).stroke({ color: greenEdge, width: .75 });
}

export function turtleTail(shading: TurtleShading) {
  return part('tail').moveTo(-1.5, -2.6).quadraticCurveTo(4.5, -3.4, 6.2, .45)
    .quadraticCurveTo(5.2, 3.7, -.7, 2.3).closePath()
    .fill(shading.shade(0x679249)).stroke({ color: greenEdge, width: .75, join: 'round' });
}

export function turtleLeg(shading: TurtleShading, name: string, length: number, foot: boolean, dark: boolean) {
  const g = part(name);
  const green = shading.shade(dark ? 0x547745 : 0x79a358);
  if (!foot) return g.roundRect(-2.25, -1.25, 4.5, length + 2.7, 2.2)
    .fill(green).stroke({ color: greenEdge, width: .72 });
  g.moveTo(-2.1, -1.35).quadraticCurveTo(.0, -2.2, 2.05, -.8).lineTo(2.25, length - 2.4)
    .quadraticCurveTo(4.0, length - .8, 3.1, length + .45)
    .quadraticCurveTo(0, length + 1.25, -3.1, length + .45)
    .quadraticCurveTo(-4.0, length - .8, -2.1, length - 2.35).closePath()
    .fill(green).stroke({ color: greenEdge, width: .72, join: 'round' });
  for (const x of [-1.85, 0, 1.85]) {
    g.ellipse(x, length - .32, .56, .68).fill(dark ? 0xc2c390 : 0xe3d39c);
  }
  return g;
}
