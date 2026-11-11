import { CanvasSource, Sprite, Texture, type Container } from 'pixi.js';
import { Box3, DirectionalLight, Group, HemisphereLight, Mesh, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { ActorState } from '../../../shared/types';
import { disposeGltf } from './model3d/gltf-asset';
import { TRIPO_WARRIOR_DIRECTORY, TRIPO_WARRIOR_MODEL, TRIPO_WARRIOR_TIMEOUT_MS } from '../tripo-warrior-asset';

const size = 192;
const elevation = 35 * Math.PI / 180;
const sinElevation = Math.sin(elevation);
const cosElevation = Math.cos(elevation);
const yawTolerance = 0.002;

function releaseResources(...releases: (() => void)[]) {
  for (const release of releases) {
    try { release(); }
    catch (error) { console.warn('Could not release a Tripo warrior resource', error); }
  }
}

export interface TripoWarriorView {
  state: ActorState;
  root: Container;
  rig: { root: Container; height: number };
  direction: number;
  tripoWarrior3D: boolean;
}

function frameModel(model: Group) {
  const vertices: Vector3[] = [];
  const bounds = new Box3();
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; positions && i < positions.count; i++) {
      const vertex = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      vertices.push(vertex);
      bounds.expandByPoint(vertex);
    }
  });
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error('Tripo warrior has no measurable mesh.');

  // Use the soles instead of the full horizontal bounds, which include the sword.
  const soles = new Box3();
  for (const vertex of vertices) if (vertex.y <= bounds.min.y + height * 0.01) soles.expandByPoint(vertex);
  const origin = soles.getCenter(new Vector3());
  origin.y = bounds.min.y;

  let radius = 0;
  let lower = 0;
  let upper = 0;
  let topAtEveryYaw = 0;
  const points = vertices.map(vertex => {
    vertex.sub(origin).divideScalar(height);
    const r = Math.hypot(vertex.x, vertex.z);
    const up = vertex.y * cosElevation;
    const tilt = r * sinElevation;
    radius = Math.max(radius, r);
    lower = Math.min(lower, up - tilt);
    upper = Math.max(upper, up + tilt);
    topAtEveryYaw = Math.max(topAtEveryYaw, up - tilt);
    return { x: vertex.x * sinElevation, z: vertex.z * sinElevation, up, maxUp: up + tilt };
  });
  if (!Number.isFinite(radius) || topAtEveryYaw <= 0) throw new Error('Tripo warrior has invalid projection bounds.');

  const span = Math.max(radius * 2, upper - lower) * 1.08;
  const top = (upper + lower + span) / 2;
  // These are the only vertices that can reach the highest projected point at any heading.
  const crown = points.filter(point => point.maxUp >= topAtEveryYaw);
  return { origin, height, span, top, crown };
}

// Camera-right is +X. A horizontal +Z step projects down by sin(elevation).
// The source faces +X, which rotates toward -Z for positive Y rotation.
function warriorYaw(direction: number) {
  return Math.atan2(-Math.sin(direction) / sinElevation, Math.cos(direction));
}

export class TripoWarrior3D {
  private readonly scene = new Scene();
  private readonly heading = new Group();
  private readonly camera: OrthographicCamera;
  private readonly source: CanvasSource;
  private readonly texture: Texture;
  private readonly sprite: Sprite;
  private attachment?: { id: string; rig: Container; visible: boolean };
  private yaw = 0;
  private projectedHeight = 1;
  private frames = 0;
  private draws = 0;
  private triangles = 0;
  private contextLost = false;
  private destroyed = false;

  static async create(signal: AbortSignal) {
    signal.throwIfAborted();
    const request = AbortSignal.any([signal, AbortSignal.timeout(TRIPO_WARRIOR_TIMEOUT_MS)]);
    const response = await fetch(TRIPO_WARRIOR_MODEL, { signal: request });
    if (!response.ok) throw new Error(`Tripo warrior model request failed (HTTP ${response.status}).`);
    const data = await response.arrayBuffer();
    request.throwIfAborted();
    const gltf = await new GLTFLoader().parseAsync(data, TRIPO_WARRIOR_DIRECTORY);
    let renderer: WebGLRenderer | undefined;
    try {
      signal.throwIfAborted();
      const frame = frameModel(gltf.scene);
      renderer = new WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
      return new TripoWarrior3D(gltf, renderer, frame, signal);
    } catch (error) {
      releaseResources(() => disposeGltf(gltf), () => renderer?.dispose(), () => renderer?.forceContextLoss());
      throw error;
    }
  }

  private constructor(private readonly gltf: GLTF, private readonly renderer: WebGLRenderer,
    private readonly frame: ReturnType<typeof frameModel>, private readonly signal: AbortSignal) {
    const { origin, height, span, top } = frame;
    const aligned = new Group();
    aligned.position.copy(origin).multiplyScalar(-1 / height);
    aligned.scale.setScalar(1 / height);
    aligned.add(gltf.scene);
    this.heading.add(aligned);
    this.camera = new OrthographicCamera(-span / 2, span / 2, top, top - span, 0.05, 20);
    this.camera.position.set(0, sinElevation * 5, cosElevation * 5);
    this.camera.lookAt(0, 0, 0);

    const key = new DirectionalLight(0xffffff, 3);
    key.position.set(3, 5, 4);
    const fill = new DirectionalLight(0xe0ebff, 1.5);
    fill.position.set(-3, 2, -4);
    this.scene.add(this.heading, new HemisphereLight(0xffffff, 0xb1bcc1, 2.4), key, fill);

    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    let source: CanvasSource | undefined, texture: Texture | undefined, sprite: Sprite | undefined;
    try {
      this.source = source = new CanvasSource({ resource: renderer.domElement, transparent: true, resolution: 1,
        alphaMode: 'premultiply-alpha-on-upload', autoGenerateMipmaps: false, label: 'Live Tripo warrior canvas' });
      this.texture = texture = new Texture({ source, label: 'Live Tripo warrior texture' });
      this.sprite = sprite = new Sprite({ texture, eventMode: 'none', label: 'Live Tripo warrior' });
      sprite.anchor.set(0.5, top / span);
      renderer.domElement.addEventListener('webglcontextlost', this.loseContext);
      signal.addEventListener('abort', this.abort, { once: true });
    } catch (error) {
      releaseResources(() => signal.removeEventListener('abort', this.abort),
        () => renderer.domElement.removeEventListener('webglcontextlost', this.loseContext),
        () => sprite?.destroy(), () => texture?.destroy(false), () => source?.destroy());
      throw error;
    }
  }

  get stats() {
    return { active: !!this.attachment, frames: this.frames, draws: this.draws, triangles: this.triangles, contextLost: this.contextLost };
  }

  update(view: TripoWarriorView | undefined, delta: number) {
    if (this.destroyed) return;
    if (this.contextLost) throw new Error('Tripo warrior WebGL context was lost.');
    if (!view?.tripoWarrior3D || view.root.destroyed || view.rig.root.parent !== view.root) {
      this.clear();
      return;
    }
    const rig = view.rig.root;
    const direction = Number.isFinite(view.direction) ? view.direction : Math.PI / 2;
    const target = warriorYaw(direction);
    const difference = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    const turning = Math.abs(difference) > yawTolerance;
    const dead = view.state.action === 'dead';
    if (this.attachment?.rig !== rig || this.attachment.id !== view.state.id) {
      this.clear();
      if (!this.frames || turning) this.draw(target);
      this.sprite.zIndex = rig.zIndex;
      view.root.addChildAt(this.sprite, view.root.getChildIndex(rig) + 1);
      this.attachment = { id: view.state.id, rig, visible: rig.visible };
      rig.visible = false;
    } else if (!dead && turning && Number.isFinite(delta) && delta > 0) {
      const dt = Math.min(delta, 50) / 1000;
      const step = Math.sign(difference) * Math.min(Math.abs(difference) * (1 - Math.exp(-dt * 19)), dt * 13);
      this.draw(Math.abs(difference - step) <= yawTolerance ? target : this.yaw + step);
    }
    this.sprite.scale.set(view.rig.height / this.projectedHeight);
    this.sprite.alpha = rig.alpha * (dead ? 0.56 : 1);
  }

  private draw(yaw: number) {
    this.heading.rotation.y = yaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let top = 0;
    for (const point of this.frame.crown) top = Math.max(top, point.up + point.x * sin - point.z * cos);
    this.projectedHeight = top * size / this.frame.span;
    this.renderer.render(this.scene, this.camera);
    this.source.update();
    this.yaw = yaw;
    this.frames++;
    this.draws = this.renderer.info.render.calls;
    this.triangles = this.renderer.info.render.triangles;
  }

  release(id: string) {
    if (this.attachment?.id === id) this.clear();
  }

  clear() {
    const attached = this.attachment;
    if (!attached) return;
    this.attachment = undefined;
    try { this.sprite.removeFromParent(); }
    finally { if (!attached.rig.destroyed) attached.rig.visible = attached.visible; }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    releaseResources(() => this.clear(),
      () => this.signal.removeEventListener('abort', this.abort),
      () => this.renderer.domElement.removeEventListener('webglcontextlost', this.loseContext),
      () => this.sprite.destroy(), () => this.texture.destroy(false), () => this.source.destroy(),
      () => disposeGltf(this.gltf), () => this.renderer.dispose(), () => this.renderer.forceContextLoss());
  }

  private readonly abort = () => this.destroy();

  private readonly loseContext = () => {
    this.contextLost = true;
    this.clear();
  };
}
