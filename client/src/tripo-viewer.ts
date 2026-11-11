import {
  AnimationMixer, Box3, DirectionalLight, Group, HemisphereLight, InstancedMesh,
  Line, Material, Mesh, PerspectiveCamera, Points, Scene, Sphere,
  WebGLRenderer, type AnimationAction, type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { disposeGltf } from './game/model3d/gltf-asset';

const stage = document.querySelector<HTMLDivElement>('#stage')!;
const frontAxis = document.querySelector<HTMLSelectElement>('#front-axis')!;
const clipSelect = document.querySelector<HTMLSelectElement>('#clip')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;

function modelMetrics(model: Object3D) {
  let meshes = 0;
  let triangles = 0;
  const materials = new Set<Material>();
  model.traverse(object => {
    if (!(object instanceof Mesh || object instanceof Line || object instanceof Points)) return;
    for (const material of [object.material].flat()) materials.add(material);
    if (!(object instanceof Mesh)) return;
    meshes++;
    const geometry = object.geometry;
    const available = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    const { start, count } = geometry.drawRange;
    const drawn = Math.max(0, Math.min(available - start, count));
    triangles += Math.floor(drawn / 3) * (object instanceof InstancedMesh ? object.count : 1);
  });
  return { meshes, triangles, materials: materials.size };
}

function createViewer(gltf: GLTF, signal: AbortSignal) {
  const bounds = new Box3().setFromObject(gltf.scene).getBoundingSphere(new Sphere());
  if (!Number.isFinite(bounds.radius) || bounds.radius <= 0) throw new Error('模型没有可预览的尺寸。');

  // Keep the imported scene transforms intact so clip tracks remain relative to their original root.
  const model = new Group();
  model.scale.setScalar(1 / bounds.radius);
  model.position.copy(bounds.center).multiplyScalar(-1 / bounds.radius);
  model.add(gltf.scene);

  const scene = new Scene();
  const key = new DirectionalLight(0xffffff, 3);
  key.position.set(3, 5, 4);
  const fill = new DirectionalLight(0xe0ebff, 1.5);
  fill.position.set(-3, 2, -4);
  scene.add(model, new HemisphereLight(0xffffff, 0xb1bcc1, 2.4), key, fill);

  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  stage.prepend(canvas);
  const camera = new PerspectiveCamera(38, 1, 0.01, 100);
  camera.position.z = 4;
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  const mixer = gltf.animations.length ? new AnimationMixer(gltf.scene) : undefined;
  let action: AnimationAction | undefined;
  let playing = false;
  let suspended = document.hidden;
  let contextLost = false;
  let frame: number | undefined;
  let previousTime: number | undefined;
  let distance = 4;
  let previousWidth = 0;
  let previousHeight = 0;
  let previousDpr = 0;

  function render(time: number) {
    frame = undefined;
    if (playing) {
      if (previousTime !== undefined) mixer?.update(Math.min((time - previousTime) / 1000, 0.05));
      previousTime = time;
    }
    renderer.render(scene, camera);
    if (playing) requestRender();
  }

  function requestRender() {
    if (frame === undefined && !suspended && !contextLost && !signal.aborted) frame = requestAnimationFrame(render);
  }

  function pauseRendering() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    previousTime = undefined;
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = stage;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === previousWidth && height === previousHeight && dpr === previousDpr) {
      requestRender();
      return;
    }
    previousWidth = width;
    previousHeight = height;
    previousDpr = dpr;
    renderer.setDrawingBufferSize(width, height, dpr);
    camera.aspect = width / height;
    const verticalHalfFov = camera.fov * Math.PI / 360;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
    const nextDistance = 1.12 / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
    camera.position.multiplyScalar(nextDistance / distance);
    distance = nextDistance;
    controls.minDistance = Math.max(1.25, distance * 0.3);
    controls.maxDistance = distance * 3;
    camera.far = Math.max(100, controls.maxDistance + 2);
    camera.updateProjectionMatrix();
    controls.update();
    requestRender();
  }

  function view(offset: number) {
    const angle = (Number(frontAxis.value) + offset) * Math.PI / 180;
    camera.position.set(Math.sin(angle) * distance, 0, Math.cos(angle) * distance);
    controls.update();
    requestRender();
  }

  function startClip() {
    const clip = gltf.animations[Number(clipSelect.value)];
    if (!mixer || !clip) return;
    action ??= mixer.clipAction(clip);
    action.paused = false;
    action.play();
    playing = true;
    previousTime = undefined;
    playButton.textContent = '暂停';
    requestRender();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  controls.addEventListener('change', requestRender);
  window.addEventListener('resize', resize, { signal });
  canvas.addEventListener('webglcontextlost', () => {
    contextLost = true;
    pauseRendering();
  }, { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    requestRender();
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    suspended = document.hidden;
    if (suspended) pauseRendering();
    else requestRender();
  }, { signal });
  window.addEventListener('pagehide', () => {
    suspended = true;
    pauseRendering();
  }, { signal });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    suspended = document.hidden;
    resize();
  }, { signal });
  resize();
  view(0);

  return {
    view, resize, pauseRendering,
    changeClip() {
      action?.stop();
      action = undefined;
      if (playing) startClip();
      else requestRender();
    },
    toggleAnimation() {
      if (playing && action) {
        playing = false;
        action.paused = true;
        previousTime = undefined;
        playButton.textContent = '播放';
      } else startClip();
    },
    dispose() {
      pauseRendering();
      observer.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      mixer?.stopAllAction();
      mixer?.uncacheRoot(gltf.scene);
      disposeGltf(gltf);
      renderer.dispose();
      canvas.remove();
    },
  };
}

// This module is loaded only after the fixed model file has arrived.
export async function mountTripoViewer(data: ArrayBuffer, assetDirectory: string, signal: AbortSignal) {
  const gltf = await new GLTFLoader().parseAsync(data, assetDirectory);
  const mounting = new AbortController();
  const mountSignal = AbortSignal.any([signal, mounting.signal]);
  let ownedByViewer = false;
  let mounted = false;
  try {
    if (signal.aborted) return;
    const metrics = { ...modelMetrics(gltf.scene), animations: gltf.animations.length };
    if (metrics.triangles === 0) throw new Error('GLB 中没有可预览的三角网格。');
    const viewer = createViewer(gltf, mountSignal);
    ownedByViewer = true;
    mountSignal.addEventListener('abort', () => viewer.dispose(), { once: true });

    const viewControls = document.querySelector<HTMLFieldSetElement>('#view-controls')!;
    for (const button of viewControls.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      button.addEventListener('click', () => viewer.view(Number(button.dataset.view)), { signal: mountSignal });
    }
    frontAxis.addEventListener('change', () => viewer.view(0), { signal: mountSignal });
    clipSelect.addEventListener('change', () => viewer.changeClip(), { signal: mountSignal });
    playButton.addEventListener('click', () => viewer.toggleAnimation(), { signal: mountSignal });
    for (const [name, value] of Object.entries(metrics)) {
      document.getElementById(name)!.textContent = value.toLocaleString('zh-CN');
    }
    const clips = gltf.animations;
    document.getElementById('motion')!.textContent = clips.length ? '可播放 GLB 自带动画' : '静态试样 · GLB 无动画';
    clipSelect.replaceChildren(...clips.map((clip, index) => new Option(clip.name || `片段 ${index + 1}`, String(index))));
    document.getElementById('animation-controls')!.hidden = clips.length === 0;
    viewControls.disabled = false;
    mounted = true;
  } finally {
    if (!mounted) mounting.abort();
    if (!ownedByViewer) disposeGltf(gltf);
  }
}
