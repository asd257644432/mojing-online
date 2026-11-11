import { Application, Container, Graphics, Text } from 'pixi.js';
import { CombatEffects } from './game/effects';
import { FrameTimings } from './game/frame-timings';

const host = document.querySelector<HTMLElement>('#stage')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const loop = document.querySelector<HTMLInputElement>('#loop')!;
const paused = document.querySelector<HTMLInputElement>('#pause')!;
const zoom = document.querySelector<HTMLSelectElement>('#zoom')!;
const app = new Application();
await app.init({ resizeTo: host, backgroundColor: 0x344839, antialias: true, preference: 'webgl',
  resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true });
host.appendChild(app.canvas);
const world = new Container();
app.stage.addChild(world);
const ground = new Graphics();
for (let x = 0; x <= 1200; x += 40) ground.moveTo(x, 0).lineTo(x, 800);
for (let y = 0; y <= 800; y += 40) ground.moveTo(0, y).lineTo(1200, y);
ground.stroke({ color: 0x79896d, alpha: 0.25, width: 1 });
const points = [{ x: 280, y: 235 }, { x: 560, y: 235 }];
for (const point of points) ground.ellipse(point.x, point.y, 18, 6).fill(0xb4c38a);
world.addChild(ground);
let effects = new CombatEffects();
world.addChild(effects.root);
const overlay = new Container();
overlay.addChild(new Graphics().rect(195, 241, 450, 6).fill(0x90b7c5));
for (const [i, text] of ['Cure4 · 治疗', 'Blow6 · 近战命中'].entries()) {
  const label = new Text({ text, style: { fontSize: 16, fill: 0xf7efda } });
  label.position.set(points[i].x - 60, 290);
  overlay.addChild(label);
}
world.addChild(overlay);
let state = 'loading';
const initialize = () => effects.init(app.renderer, value => { state = value; });
void initialize();
let serial = 0;
function play(kind: 'heal' | 'damage', at = points[kind === 'heal' ? 0 : 1]) {
  effects.add({ id: `preview-${++serial}`, at: Date.now(), kind, actorId: 'preview',
    amount: kind === 'heal' ? 35 : 17, impact: kind === 'damage' ? 'melee' : undefined }, at);
}
document.querySelector('#cure')!.addEventListener('click', () => play('heal'));
document.querySelector('#melee')!.addEventListener('click', () => play('damage'));
document.querySelector('#crowd')!.addEventListener('click', () => {
  for (let i = 0; i < 24; i++) play(i % 2 ? 'damage' : 'heal', { x: 100 + i % 8 * 95, y: 110 + Math.floor(i / 8) * 120 });
});
document.querySelector('#clear')!.addEventListener('click', () => { loop.checked = false; effects.clear(); });
document.querySelector('#reset')!.addEventListener('click', () => {
  effects.destroy();
  effects.root.destroy({ children: true });
  effects = new CombatEffects();
  world.addChildAt(effects.root, 1);
  void initialize();
});
const timings = new FrameTimings();
let untilLoop = 0;
let untilStatus = 0;
app.ticker.add(ticker => {
  world.scale.set(Number(zoom.value));
  world.position.set((app.screen.width - 840 * world.scale.x) / 2, 30);
  const ms = ticker.deltaMS;
  timings.record(ticker.elapsedMS);
  if (!paused.checked && loop.checked && (untilLoop -= ms) <= 0) {
    play('heal'); play('damage'); untilLoop = 1500;
  }
  if (!paused.checked) effects.tick(ms, Date.now());
  if ((untilStatus -= ms) <= 0) {
    const frame = timings.summary();
    status.textContent = `${state} · ${effects.particleCount} 活动效果 · P95 ${frame.p95?.toFixed(1)} ms`;
    untilStatus = 250;
  }
});
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  effects.destroy();
  app.destroy(true, { children: true });
});
