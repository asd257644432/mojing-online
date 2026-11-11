import { RenderContainer, type WebGLRenderer } from 'pixi.js';
import type { Point } from '../../../shared/types';
import { prepareParticles, type ParticleContext, type ParticleEffect, type ParticleHandle, type ParticleKind, type ParticleRuntime } from './particle-runtime';

const scales: Record<ParticleKind, number> = { cure: 8, melee: 8 };
const maxActive = 24;

export class ParticleEffects {
  readonly root: RenderContainer;
  private readonly active: ParticleHandle[] = [];
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer, private readonly runtime: ParticleRuntime,
    private readonly context: ParticleContext, private readonly effects: Record<ParticleKind, ParticleEffect>,
    private readonly failed: () => void) {
    this.root = new RenderContainer({ eventMode: 'none', render: () => this.draw() });
    renderer.canvas.addEventListener('webglcontextlost', this.contextLost);
  }

  static async create(renderer: WebGLRenderer, alive: () => boolean, failed: () => void) {
    const { runtime, effects: data, loadResource } = await prepareParticles();
    if (!alive() || renderer.gl.isContextLost()) return;
    const context = runtime.createContext();
    const loaded: ParticleEffect[] = [];
    try {
      context.init(renderer.gl, { instanceMaxCount: 4096, squareMaxCount: 2048, enablePremultipliedAlpha: true });
      context.setResourceLoader(loadResource);
      let loadError = '';
      const onError = (reason: string, path: string) => { loadError = `${reason}: ${path}`; };
      const load = (buffer: ArrayBuffer) => {
        const effect = context.loadEffect(buffer, 1, undefined, onError);
        loaded.push(effect);
        return effect;
      };
      const effects = { cure: load(data.cure), melee: load(data.melee) };
      if (loadError || !effects.cure.isLoaded || !effects.melee.isLoaded) throw new Error(loadError || 'Effect dependencies did not load');
      return new ParticleEffects(renderer, runtime, context, effects, failed);
    } catch (error) {
      for (const effect of loaded) {
        try { context.releaseEffect(effect); } catch { /* Still release the owning context. */ }
      }
      try { runtime.releaseContext(context); } catch { /* Preserve the initialization error. */ }
      throw error;
    } finally {
      // Initialization runs outside a render pass; redraw will bind Pixi's target/state normally.
      renderer.resetState();
    }
  }

  get count() { return this.active.length; }

  play(kind: ParticleKind, at: Point) {
    if (this.disposed || this.renderer.gl.isContextLost()) return false;
    try {
      this.prune();
      if (this.active.length >= maxActive) this.active.shift()!.stop();
      const handle = this.context.play(this.effects[kind], at.x, -at.y + 18, 0);
      if (!handle) return false;
      handle.setScale(scales[kind], scales[kind], scales[kind]);
      this.active.push(handle);
      return true;
    } catch (error) { this.disable(error); return false; }
  }

  tick(ms: number) {
    if (this.disposed || !this.active.length || ms <= 0 || !Number.isFinite(ms)) return;
    try {
      this.context.update(Math.min(ms, 50) * 60 / 1000);
      this.prune();
    } catch (error) { this.disable(error); }
  }

  private prune() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (!this.active[i].exists) this.active.splice(i, 1);
    }
  }

  private draw() {
    if (this.disposed || !this.active.length || this.renderer.gl.isContextLost()) return;
    const { width, height } = this.renderer.screen;
    const { a, d, tx, ty } = this.root.worldTransform;
    const cx = (width / 2 - tx) / a;
    const cy = -(height / 2 - ty) / d;
    // Keep the runtime's GL restoration. Pixi's resetState is not safe in the middle of its pass.
    const gl = this.renderer.gl;
    const rgb = gl.getParameter(gl.BLEND_EQUATION_RGB) as number;
    const alpha = gl.getParameter(gl.BLEND_EQUATION_ALPHA) as number;
    try {
      this.context.setProjectionOrthographic(width / a, height / d, 1, 2000);
      this.context.setCameraLookAt(cx, cy, 1000, cx, cy, 0, 0, 1, 0);
      this.context.draw();
    }
    catch (error) { this.disable(error); }
    finally { gl.blendEquationSeparate(rgb, alpha); }
  }

  clear() {
    if (this.disposed) return;
    try {
      this.context.stopAll();
      // 1.80.8 queues stops until a full native update; do not carry an old zone into its next draw.
      if (this.active.length && !this.renderer.gl.isContextLost()) this.context.update(1);
      this.active.length = 0;
    } catch (error) { this.disable(error); }
  }

  private readonly contextLost = () => {
    this.destroy();
    this.failed();
  };

  private disable(error: unknown) {
    this.destroy();
    this.failed();
    console.warn('Combat particles disabled after a runtime failure', error);
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.canvas.removeEventListener('webglcontextlost', this.contextLost);
    // A failed WASM module may also reject cleanup calls. Always detach from Pixi and input.
    try { this.context.stopAll(); } catch { /* Continue releasing independent owned resources. */ }
    for (const effect of Object.values(this.effects)) {
      try { this.context.releaseEffect(effect); } catch { /* Continue releasing the other pinned effect. */ }
    }
    try { this.runtime.releaseContext(this.context); }
    catch { /* An aborted WASM module cannot service further release calls. */ }
    this.active.length = 0;
    this.root.destroy();
  }
}
