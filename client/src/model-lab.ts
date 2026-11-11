import {
  Box3, CircleGeometry, Color, DirectionalLight, GridHelper, HemisphereLight, MathUtils, Mesh,
  MeshStandardMaterial, OrthographicCamera, PCFShadowMap, Scene, SkeletonHelper, Vector3, WebGLRenderer,
} from 'three';
import { RangerMotion, rangerModes, type RangerMode } from './game/model3d/motion';
import type { QuaterniusMotion } from './game/model3d/quaternius-motion';
import { createRangerModel, disposeModel } from './game/model3d/ranger-model';

function select<T extends HTMLElement>(selector:string) {
  return document.querySelector<T>(selector)!;
}

function openLab(host:HTMLElement) {
  const scene = new Scene();
  scene.background = new Color(0x344541);
  const renderer = new WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute('aria-label','游侠立体模型');
  host.prepend(renderer.domElement);

  const camera = new OrthographicCamera(-2,2,2,-2,.05,36);
  const center = new Vector3(0,1.06,0);
  const distance = 7;

  const hemisphere = new HemisphereLight(0xffecd0,0x5e726b,1.75);
  const key = new DirectionalLight(0xffe2b3,2.28);
  key.position.set(-3.4,6,4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -3.4;
  key.shadow.camera.right = key.shadow.camera.top = 3.4;
  key.shadow.normalBias = .009;
  key.shadow.bias = -.00025;
  const rim = new DirectionalLight(0xc1e4d0,1.05);
  rim.position.set(1.5,2.8,-3);
  scene.add(hemisphere,key,rim);

  const floor = new Mesh(new CircleGeometry(2.35,80),new MeshStandardMaterial({color:0x526448,roughness:.96}));
  floor.rotation.x = -Math.PI/2;
  floor.position.y = .004;
  floor.receiveShadow = true;
  const gridStep = .32;
  const grid = new GridHelper(gridStep*16,16,0x7e8f76,0x7e8f76);
  grid.position.y = .005;
  grid.visible = false;
  scene.add(floor,grid);
  const rig = createRangerModel();
  const standingHeight = new Box3().setFromObject(rig.display,true).getSize(new Vector3()).y;
  const motion = new RangerMotion(rig);
  scene.add(rig.display);
  const skeleton = new SkeletonHelper(rig.model);
  skeleton.visible = false;
  scene.add(skeleton);

  const status = select<HTMLOutputElement>('#metrics');
  const heading = select<HTMLInputElement>('#heading');
  const spin = select<HTMLInputElement>('#spin');
  const gameSize = select<HTMLInputElement>('#game-size');
  const bones = select<HTMLInputElement>('#bones');
  const speed = select<HTMLInputElement>('#speed');
  const speedValue = select<HTMLOutputElement>('#speed-value');
  const reference = select<HTMLInputElement>('#reference-motion');
  const motionStatus = select<HTMLOutputElement>('#motion-status');
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-mode]')];
  let mode:RangerMode = 'idle';
  let turn = MathUtils.degToRad(25), target = turn;
  let age = 0;
  let previous = 0;
  let lastDrag: number | undefined;
  let source:QuaterniusMotion | undefined;
  let closed = false;
  const loadReference = async () => {
    if (!reference.checked || source) return;
    reference.disabled = true;
    motionStatus.value = '正在载入动作';
    try {
      const {QuaterniusMotion} = await import('./game/model3d/quaternius-motion');
      const loaded = await QuaterniusMotion.load();
      if (closed) loaded.dispose();
      else {
        source = loaded;
        motionStatus.value = '对照仅用于待机与行走 · CC0';
      }
    } catch (error) {
      motionStatus.value = error instanceof Error ? error.message : '无法载入动作对照';
      reference.checked = false;
    } finally {
      reference.disabled = false;
    }
  };
  const setMode = (next:RangerMode) => {
    mode = next;
    age = 0;
    for (const button of buttons) button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  };
  const chooseHeading = (degrees:number) => {
    spin.checked = false;
    target = MathUtils.degToRad(degrees);
    heading.value = String(degrees);
  };
  const params = new URLSearchParams(location.search);
  const requested = params.get('mode');
  if (rangerModes.includes(requested as RangerMode)) setMode(requested as RangerMode);
  if (params.get('size')==='game') gameSize.checked = true;
  if (params.get('motion')==='ual') {
    reference.checked = true;
    void loadReference();
  }
  for (const button of buttons) button.addEventListener('click',()=>setMode(button.dataset.mode as RangerMode));
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-heading]')) {
    button.addEventListener('click',()=>chooseHeading(Number(button.dataset.heading)));
  }
  heading.addEventListener('input',()=>chooseHeading(Number(heading.value)));
  speed.addEventListener('input',()=>{speedValue.value = speed.valueAsNumber.toFixed(2);});
  reference.addEventListener('change',()=>{void loadReference();});
  host.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    host.setPointerCapture(event.pointerId);
    spin.checked = false;
    lastDrag = event.clientX;
  });
  host.addEventListener('pointermove',event=>{
    if (lastDrag===undefined) return;
    target += (event.clientX-lastDrag)*.011;
    lastDrag = event.clientX;
    heading.value = String(MathUtils.euclideanModulo(MathUtils.radToDeg(target)+180,360)-180);
  });
  host.addEventListener('lostpointercapture',()=>{lastDrag=undefined;});
  bones.addEventListener('input',()=>{skeleton.visible=bones.checked;});
  const resize = () => {
    const width = Math.max(1,host.clientWidth), height = Math.max(1,host.clientHeight);
    renderer.setSize(width,height,false);
    const elevation = MathUtils.degToRad(gameSize.checked ? 35 : 21);
    camera.position.set(0,center.y+Math.sin(elevation)*distance,Math.cos(elevation)*distance);
    camera.lookAt(center);
    const halfHeight = gameSize.checked ? standingHeight*Math.cos(elevation)*height/140 : 1.57;
    camera.left = -halfHeight*width/height;
    camera.right = halfHeight*width/height;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  gameSize.addEventListener('input',resize);
  resize();
  renderer.setAnimationLoop(now=>{
    const delta = previous ? Math.min(.05,(now-previous)/1000) : 1/60;
    previous = now;
    age += delta;
    if (spin.checked) {
      target += delta*.55;
      heading.value = String(MathUtils.euclideanModulo(MathUtils.radToDeg(target)+180,360)-180);
    }
    const difference = MathUtils.euclideanModulo(target-turn+Math.PI,Math.PI*2)-Math.PI;
    const turnRate = MathUtils.clamp(difference*8,-2.45,2.45);
    turn += turnRate*delta;
    rig.display.rotation.y = turn;
    source?.update(delta,mode,speed.valueAsNumber,reference.checked);
    motion.update(delta,mode,age,speed.valueAsNumber,source?.pose);
    const travel = motion.groundTravel;
    grid.visible = mode==='walk' || gameSize.checked;
    grid.position.x = -MathUtils.euclideanModulo(travel.x*rig.display.scale.x,gridStep);
    grid.position.z = -MathUtils.euclideanModulo(travel.y*rig.display.scale.z,gridStep);
    renderer.render(scene,camera);
  });
  status.value = `${rig.skeleton.bones.length} 根骨骼 · ${(rig.body.geometry.index!.count/3).toLocaleString()} 个蒙皮三角面`;
  window.addEventListener('pagehide',event=>{
    if (event.persisted) return;
    closed = true;
    observer.disconnect();
    renderer.setAnimationLoop(null);
    source?.dispose();
    disposeModel(rig.display);
    floor.geometry.dispose();
    floor.material.dispose();
    grid.dispose();
    skeleton.dispose();
    renderer.dispose();
  },{once:true});
}

const host = select<HTMLElement>('#stage');
try {
  openLab(host);
} catch(error) {
  const message = document.createElement('p');
  message.id = 'error';
  message.textContent = error instanceof Error ? error.message : '无法初始化三维预览';
  host.append(message);
  select<HTMLOutputElement>('#metrics').remove();
}
