// API subset verified against the pinned 1.80.8 distribution (not the newer web runtime).
export interface ParticleHandle {
  readonly exists: boolean;
  stop(): void;
  setScale(x: number, y: number, z: number): void;
}
export interface ParticleEffect { readonly isLoaded: boolean; }
type ResourceLoader = (path: string, loaded: (image: HTMLImageElement) => void, failed: (reason: string, path: string) => void) => void;
export interface ParticleContext {
  init(gl: WebGLRenderingContext | WebGL2RenderingContext, settings: object): void;
  loadEffect(data: ArrayBuffer, scale: number, loaded?: () => void, failed?: (reason: string, path: string) => void): ParticleEffect;
  releaseEffect(effect: ParticleEffect): void;
  play(effect: ParticleEffect, x: number, y: number, z: number): ParticleHandle | null;
  stopAll(): void;
  update(frames: number): void;
  draw(): void;
  setProjectionOrthographic(width: number, height: number, near: number, far: number): void;
  setCameraLookAt(x: number, y: number, z: number, tx: number, ty: number, tz: number, ux: number, uy: number, uz: number): void;
  setResourceLoader(loader: ResourceLoader): void;
}
export interface ParticleRuntime {
  initRuntime(path: string, ready: () => void, failed: () => void): void;
  createContext(): ParticleContext;
  releaseContext(context: ParticleContext): void;
}
export type ParticleKind = 'cure' | 'melee';
const vendor = '/vendor/effekseer-1.80.8';
const assets = '/assets/effects/tktk01';
let prepared: Promise<{ runtime: ParticleRuntime; effects: Record<ParticleKind, ArrayBuffer>; loadResource: ResourceLoader }> | undefined;

async function fetchAsset(path: string) {
  const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Effect asset ${response.status}: ${path}`);
  return response;
}

async function loadImage(path: string) {
  const url = URL.createObjectURL(await (await fetchAsset(path)).blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

function loadRuntime(): Promise<ParticleRuntime> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error('Effect runtime timed out')), 15000);
    let settled = false;
    function finish(error?: Error, runtime?: ParticleRuntime) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.onload = script.onerror = null;
      script.remove();
      if (error) reject(error);
      else resolve(runtime!);
    }
    script.src = `${vendor}/effekseer.js`;
    script.onerror = () => finish(new Error('Effect runtime script unavailable'));
    script.onload = () => {
      try {
        const runtime = (window as Window & { effekseer?: ParticleRuntime }).effekseer;
        if (!runtime) throw new Error('Effect runtime did not initialize');
        runtime.initRuntime(`${vendor}/effekseer.wasm`, () => finish(undefined, runtime),
          () => finish(new Error('Effect WebAssembly unavailable')));
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    };
    document.head.appendChild(script);
  });
}

export function prepareParticles() {
  // Exactly two effects and their two shared images per page. No native context exists during I/O.
  return prepared ??= Promise.all([
    loadRuntime(),
    fetchAsset(`${assets}/Cure4.efk`).then(response => response.arrayBuffer()),
    fetchAsset(`${assets}/Blow6.efk`).then(response => response.arrayBuffer()),
    loadImage(`${assets}/Texture/Particle01.png`),
    loadImage(`${assets}/Texture/Particle02.png`),
  ]).then(([runtime, cure, melee, particle1, particle2]) => {
    const images = new Map([['Texture/Particle01.png', particle1], ['Texture/Particle02.png', particle2]]);
    // 1.80.8's loader is global. Only synchronous, already-decoded dependencies enter native code.
    const loadResource: ResourceLoader = (path, loaded, failed) => {
      const image = images.get(path.replaceAll('\\', '/'));
      if (image) loaded(image);
      else failed?.('Unlisted effect dependency', path);
    };
    return { runtime, effects: { cure, melee }, loadResource };
  });
}
