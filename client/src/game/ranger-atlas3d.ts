import { CanvasSource, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { DirectionalLight, HemisphereLight, MathUtils, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { ActorState, Point } from '../../../shared/types';
import { RangerMotion, type RangerMode } from './model3d/motion';
import type { QuaterniusMotion } from './model3d/quaternius-motion';
import { createRangerModel, disposeModel } from './model3d/ranger-model';

const size = 128;
const columns = 2;
const capacity = 4;
const interval = 1000/60;
const elevation = MathUtils.degToRad(35);
const halfSpan = 1.88;
const pixelsPerUnit = size/(halfSpan*2);
const targetCycleRate = 1.4;
const normalTravel = 190;
const referenceStride = .65;
const gameStrideInModelUnits = normalTravel/targetCycleRate/pixelsPerUnit;
const strideCompression = gameStrideInModelUnits/referenceStride;

export type Ranger3DMode = 'procedural' | 'ual';

export interface RangerView3D {
  state: ActorState;
  root: Container;
  rig: {root:Container};
  direction: number;
  speed: number;
  ranger3D: boolean;
}

interface Slot {
  sprite: Sprite;
  texture: Texture;
  motion?: RangerMotion;
  source?: QuaterniusMotion;
  view?: RangerView3D;
  yaw: number;
  shotAt: number;
  shotDirection: number;
  shotCast?: boolean;
}

interface Candidate {
  view: RangerView3D;
  priority: number;
}

export function rangerYaw(direction:number) {
  return Math.atan2(Math.cos(direction),Math.sin(direction)/Math.sin(elevation));
}

export function rangerWalkSpeed(speed:number,yaw:number) {
  const projected = Math.hypot(Math.sin(yaw),Math.cos(yaw)*Math.sin(elevation));
  return MathUtils.clamp(speed/(pixelsPerUnit*projected*strideCompression),0,1.45);
}

export class RangerAtlas3D {
  private readonly renderer = new WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:true,
    preserveDrawingBuffer:true,powerPreference:'high-performance'});
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-halfSpan,halfSpan,halfSpan,-halfSpan,.05,20);
  private readonly rig = createRangerModel();
  private readonly source: CanvasSource;
  private readonly slots: Slot[];
  private readonly assigned = new Map<string,Slot>();
  private readonly candidates: Candidate[] = [];
  private elapsed = interval;
  private motionElapsed = 0;
  private contextLost = false;
  private frame = 0;
  private cpuMs = 0;
  private draws = 0;

  static async create(mode:Ranger3DMode) {
    const factory = mode==='ual'
      ? await import('./model3d/quaternius-motion').then(module=>module.QuaterniusMotion.loadFactory())
      : undefined;
    return new RangerAtlas3D(mode,factory);
  }

  private constructor(readonly mode:Ranger3DMode,private readonly createSource?:()=>QuaterniusMotion) {
    const rows = capacity/columns;
    const {renderer,camera,scene} = this;
    renderer.setSize(size*columns,size*rows,false);
    renderer.setClearColor(0x000000,0);
    renderer.setScissorTest(true);
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.domElement.addEventListener('webglcontextlost',this.loseContext);
    renderer.domElement.addEventListener('webglcontextrestored',this.restoreContext);
    camera.position.set(0,.91+Math.sin(elevation)*5,Math.cos(elevation)*5);
    camera.lookAt(0,.91,0);
    camera.updateMatrixWorld(true);
    const foot = new Vector3().project(camera);
    const footY = (.5-foot.y*.5)*size;
    const sun = new DirectionalLight(0xffe9c9,1.65);
    sun.position.set(-2.8,4.1,5);
    const bounce = new DirectionalLight(0xc3deff,.75);
    bounce.position.set(2.5,1.2,3.6);
    scene.add(this.rig.display,new HemisphereLight(0xfff4da,0xb8ba99,2.25),sun,bounce);
    this.source = new CanvasSource({resource:renderer.domElement,transparent:true,resolution:1,
      alphaMode:'premultiply-alpha-on-upload',autoGenerateMipmaps:false,label:'Live 3D ranger atlas'});
    this.slots = Array.from({length:capacity},(_,i)=>{
      const frame = new Rectangle(i%columns*size+1,Math.floor(i/columns)*size+1,size-2,size-2);
      const texture = new Texture({source:this.source,frame,label:`Ranger model slot ${i+1}`});
      const sprite = new Sprite({texture,visible:false,eventMode:'none',label:'Live 3D ranger'});
      sprite.anchor.set(.5,(footY-1)/(size-2));
      return {sprite,texture,yaw:0,shotAt:-Infinity,shotDirection:0};
    });
  }

  get stats() {
    return {mode:this.mode,slots:this.assigned.size,capacity,frames:this.frame,draws:this.draws,cpuMs:Number(this.cpuMs.toFixed(2))};
  }

  update(actors:Iterable<RangerView3D>,selfId:string,origin:Point,width:number,height:number,clock:number,delta:number) {
    if (this.contextLost) return;
    this.elapsed += delta;
    this.motionElapsed += delta;
    if (this.elapsed+.2<interval) return;
    this.elapsed = Math.max(0,this.elapsed-interval)%interval;
    const dt = Math.min(.075,Math.max(.001,this.motionElapsed/1000));
    this.motionElapsed = 0;
    const candidates = this.candidates;
    candidates.length = 0;
    const centerX = origin.x+width*.5, centerY = origin.y+height*.5;
    for (const view of actors) {
      if (!view.ranger3D) continue;
      const {x,y} = view.root;
      const id = view.state.id;
      if (id!==selfId && (x<origin.x-24 || x>origin.x+width+24 || y<origin.y-18 || y>origin.y+height+74)) continue;
      const priority = id===selfId ? -Infinity : Math.hypot(x-centerX,y-centerY)-(this.assigned.has(id) ? 32 : 0);
      candidates.push({view,priority});
    }
    candidates.sort((a,b)=>a.priority-b.priority);
    if (candidates.length>capacity) candidates.length = capacity;
    for (const id of this.assigned.keys()) {
      if (!candidates.some(({view})=>view.state.id===id)) this.release(id);
    }
    for (const {view} of candidates) {
      if (!this.assigned.has(view.state.id)) this.assign(view);
    }
    if (!this.assigned.size) return;

    const started = performance.now();
    this.renderer.info.reset();
    for (const [index,slot] of this.slots.entries()) {
      if (!slot.view) continue;
      this.draw(slot,index,clock,dt);
    }
    this.source.update();
    this.draws = this.renderer.info.render.calls;
    const ms = performance.now()-started;
    this.cpuMs = this.frame===0 ? ms : this.cpuMs*.89+ms*.11;
    this.frame++;
  }

  private assign(view:RangerView3D) {
    const slot = this.slots.find(item=>!item.view)!;
    slot.view = view;
    slot.motion = new RangerMotion(this.rig);
    slot.source = this.createSource?.();
    slot.shotAt = -Infinity;
    slot.yaw = rangerYaw(view.direction);
    view.root.addChildAt(slot.sprite,view.root.getChildIndex(view.rig.root)+1);
    this.assigned.set(view.state.id,slot);
  }

  private draw(slot:Slot,index:number,clock:number,delta:number) {
    const {view,motion,source} = slot;
    if (!view || !motion) return;
    const {state} = view;
    if ((state.action==='attack' || state.action==='cast') && slot.shotAt!==state.actionAt) {
      slot.shotAt = state.actionAt;
      slot.shotCast = state.action === 'cast';
    }
    const dead = state.action==='dead';
    const shotSpeed = slot.shotCast ? 216/281 : 1;
    const shooting = (state.action==='attack' || state.action==='cast') && clock-slot.shotAt<365/shotSpeed;
    if (shooting) slot.shotDirection = state.direction;
    const mode:RangerMode = dead ? 'dead' : shooting ? 'draw' : view.speed>8 || state.action==='walk' ? 'walk' : 'idle';
    const age = Math.max(0,clock-(shooting ? slot.shotAt : state.actionAt))/1000;
    const heading = rangerYaw(shooting ? slot.shotDirection : view.direction);
    const difference = MathUtils.euclideanModulo(heading-slot.yaw+Math.PI,Math.PI*2)-Math.PI;
    slot.yaw += MathUtils.clamp(difference*(1-Math.exp(-delta*19)),-13*delta,13*delta);
    // The model's side-on bow draw points 1.27 radians left of its chest.
    const shotAge = age*shotSpeed;
    const stance = shooting ? MathUtils.smoothstep(shotAge,0,.16)*(1-MathUtils.smoothstep(shotAge,.245,.365)) : 0;
    this.rig.display.rotation.y = slot.yaw+stance*1.27;
    const speed = rangerWalkSpeed(view.speed,slot.yaw);
    source?.update(delta,mode,speed,true);
    motion.update(delta,mode,shooting ? shotAge*3.96 : age,speed,source?.pose);
    this.rig.bow.visible = state.weaponAppearance !== '';
    this.rig.arrow.visible = false;

    const x = index%columns*size;
    const y = (capacity/columns-1-Math.floor(index/columns))*size;
    this.renderer.setViewport(x,y,size,size);
    this.renderer.setScissor(x,y,size,size);
    this.renderer.clear(true,true,false);
    this.renderer.render(this.scene,this.camera);
    view.rig.root.visible = false;
    slot.sprite.visible = true;
  }

  release(id:string) {
    const slot = this.assigned.get(id);
    if (!slot) return;
    if (slot.view && !slot.view.rig.root.destroyed) slot.view.rig.root.visible = true;
    slot.sprite.visible = false;
    slot.sprite.removeFromParent();
    slot.source?.dispose();
    slot.view = slot.motion = slot.source = undefined;
    this.assigned.delete(id);
  }

  clear() {
    for (const id of this.assigned.keys()) this.release(id);
    this.candidates.length = 0;
  }

  destroy() {
    this.clear();
    const {renderer} = this;
    renderer.domElement.removeEventListener('webglcontextlost',this.loseContext);
    renderer.domElement.removeEventListener('webglcontextrestored',this.restoreContext);
    for (const {sprite,texture} of this.slots) {
      sprite.destroy();
      texture.destroy(false);
    }
    this.source.destroy();
    disposeModel(this.rig.display);
    renderer.dispose();
    renderer.forceContextLoss();
  }

  private loseContext = () => {
    this.contextLost = true;
    this.clear();
  };

  private restoreContext = () => {
    this.contextLost = false;
    this.elapsed = interval;
    this.renderer.setClearColor(0x000000,0);
    this.renderer.setScissorTest(true);
  };
}
