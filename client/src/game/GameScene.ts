import { Application, Container, Graphics, Rectangle, Text, UPDATE_PRIORITY, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { ITEMS, MAPS, QUESTS } from '../../../shared/content';
import { pointPassable, segmentPassable } from '../../../shared/navigation';
import type { ActorState, ClassId, Command, DropState, MapDef, NpcDef, Point, QuestDef, ResourceNode, Snapshot } from '../../../shared/types';
import { CombatEffects } from './effects';
import { FrameTimings, type FrameSummary } from './frame-timings';
import { questMarkers, questMarkerSignature, type QuestMarker } from './quest-markers';
import type { RangerAtlas3D, Ranger3DMode } from './ranger-atlas3d';
import type { TripoWarrior3D } from './tripo-warrior3d';
import { ResourceView } from './resources';
import { RigAssets, type RigAtlasKey } from './rig-assets';
import { createRig, rigAtlasFor, RigShading, type RigAtlases } from './rigs';
import { makePortal, Terrain } from './terrain';
import { WarFlags } from './war-flags';

const textFont = 'PingFang SC, Microsoft YaHei, sans-serif';
const keyAxes: Record<string, Point> = {
  w: {x:0,y:-1}, a: {x:-1,y:0}, s: {x:0,y:1}, d: {x:1,y:0},
};
const qualityColor = { common: 0xf1dab3, fine: 0xb7df95, rare: 0x97d7f3, epic: 0xe2aaf1, legendary: 0xffdb83 };
const npcClothes: Record<NpcDef['role'], ClassId> = {
  quest:'priest', shop:'merchant', forge:'warrior', auction:'merchant', warehouse:'rogue', teleport:'mage', guild:'warrior', trainer:'ranger',
};
const zoom = 1.13;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min,value));
const entryAssetBudget = 1000;

interface EntryOptions { startedAt: number; presented: () => void; failed: (error: unknown) => void; }


const viewOffset = (total: number, visible: number, coordinate: number, alignment: number) =>
  total > visible ? clamp(coordinate-visible*alignment,0,total-visible) : (total-visible)/2;

function actorFeminine(state: ActorState, self: Snapshot['self']) {
  return (state.gender ?? (state.id === self.id ? self.gender : undefined)) === 'female' ||
    state.kind === 'npc' && state.id === 'island-susan';
}

function dressedActor(state: ActorState, role?: NpcDef['role']) {
  return role ? { ...state, classId: npcClothes[role] } : state;
}

interface ActorView {
  state: ActorState;
  signature: string;
  atlas?: RigAtlasKey;
  root: Container;
  rig: ReturnType<typeof createRig>;
  shadow: Graphics;
  ring: Graphics;
  health: Graphics;
  name: Text;
  questMarker?: Text;
  direction: number;
  phase: number;
  speed: number;
  ranger3D: boolean;
  tripoWarrior3D: boolean;
}

function addLabel(text: string, color: number, size: number) {
  const label = new Text({ text, style: {fontFamily:textFont,fontSize:size,fontWeight:'600',fill:color,stroke:{color:0x342e33,width:3}} });
  label.anchor.set(0.5,1);
  return label;
}

function buildActor(state: ActorState, feminine: boolean, local: boolean, shading: RigShading, atlases: RigAtlases, role?: NpcDef['role']): ActorView {
  const root = new Container({ x:state.x, y:state.y });
  root.zIndex = state.y;
  const renderedState = dressedActor(state,role);
  const atlas = rigAtlasFor(renderedState, feminine);
  const rig = createRig(renderedState, feminine, shading, atlases);
  const shadow = new Graphics().ellipse(2,2,state.boss ? 30 : 22,8).fill({color:0x202336,alpha:0.29})
    .ellipse(1,1,state.boss ? 22 : 16,5).fill({color:0x242237,alpha:0.17});
  const ringColor = state.kind === 'monster' ? 0xe38c6a : 0xf0dc97;
  const ring = new Graphics().ellipse(0,0,22,8.5).stroke({color:ringColor,alpha:0.92,width:2.2})
    .ellipse(0,0,26,10).stroke({color:ringColor,alpha:0.35,width:1});
  ring.visible = false;
  const name = addLabel(`${state.boss ? '✦ ' : ''}${state.name}`, state.kind === 'npc' ? 0xffe1a2 : state.kind === 'monster' ? state.boss ? 0xffce9c : 0xf6c4ab : local ? 0xffebc0 : 0xc5ebcc, 12);
  const health = new Graphics();
  name.y = -rig.height - 2;
  health.y = -rig.height - 2;
  root.addChild(shadow,ring,rig.root,health,name);
  return { state, signature:actorSignature(state,feminine), atlas,root,rig,shadow,ring,health,name,
    direction:state.direction, phase:(state.x + state.y) * 0.021,speed:0,
    ranger3D:state.kind==='player' && state.classId==='ranger' && !feminine && !state.wings && !state.mounted,
    tripoWarrior3D:local && state.kind==='player' && state.classId==='warrior' && !feminine && !state.wings && !state.mounted };
}

function setQuestMarker(view: ActorView, marker?: QuestMarker) {
  if (view.state.kind !== 'npc') return;
  if (!marker) {
    if (view.questMarker) view.questMarker.visible = false;
    return;
  }
  const text = marker === 'available' ? '!' : '?';
  const color = marker === 'active' ? 0xb0b0b0 : 0xffdc80;
  if (!view.questMarker) {
    view.questMarker = addLabel(text,color,20);
    view.questMarker.y = view.name.y - 13;
    view.root.addChild(view.questMarker);
  } else {
    view.questMarker.text = text;
    view.questMarker.style.fill = color;
    view.questMarker.visible = true;
  }
}

function actorSignature(state: ActorState, feminine: boolean) {
  const mounted = state.kind === 'player' && !!state.mounted;
  return `${state.kind}/${state.classId}/${state.nation}/${state.model}/${state.definitionId}/${state.wings}/${state.boss}/${feminine}/${mounted}`;
}

function drawHealth(view: ActorView) {
  const { state, health } = view;
  health.clear();
  if (state.kind === 'npc' || state.maxHp <= 0 || state.action === 'dead') return;
  const width = state.boss ? 60 : 35;
  const amount = clamp(state.hp / state.maxHp,0,1) * (width - 2);
  health.roundRect(-width/2,-1,width,4,1.5).fill({color:0x332635,alpha:0.78});
  if (amount > 0.5) health.roundRect(-width/2+1,0,amount,2,1).fill(state.kind === 'monster' ? 0xd77965 : 0xa2c46e);
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');
}

export class GameScene {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly objects = new Container({sortableChildren:true});
  private readonly effects = new CombatEffects();
  private readonly warFlags = new WarFlags();
  private readonly shading = new RigShading();
  private readonly rigAssets = new RigAssets(key => this.refreshAtlas(key));
  private readonly actors = new Map<string, ActorView>();
  private readonly drops = new Map<string, Container>();
  private readonly resources = new Map<string, ResourceView>();
  private readonly portals: ReturnType<typeof makePortal>[] = [];
  private readonly shownEvents = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly npcRoles = new Map<string, NpcDef['role']>();
  private mapQuests: QuestDef[] = [];
  private mapQuestIds = new Set<string>();
  private questMarkerKey?: string;
  private npcQuestMarkers = new Map<string, QuestMarker>();
  private readonly moveMark = new Graphics().ellipse(0,0,12,5).stroke({color:0xffecc2,width:2})
    .ellipse(0,0,5,2.5).fill({color:0xffe1a2,alpha:0.69});
  private terrain?: Terrain;
  private map?: MapDef;
  private zoneId?: string;
  private snapshot?: Snapshot;
  private selection: string | null = null;
  private destination?: Point;
  private markerAge = 1000;
  private lastInputAt = 0;
  private dragging = false;
  private keyboardMoving = false;
  private resized?: ResizeObserver;
  private ready = false;
  private disposed = false;
  private preparingEntry = false;
  private entryBuilt = false;
  private entrySubmitQueued = false;
  private finishEntryWait?: () => void;
  private readonly frameTimings = new FrameTimings();
  private frameSummary: FrameSummary = { samples: 0 };
  private nextFrameSummary = 0;
  private measuredZone?: string;
  private skipFrameSample = false;
  private coldMs?: number;
  private firstSubmitGapMs?: number;
  private readonly createdAt = performance.now();
  private gameClockOffset = 0;
  private flagHolderId?: string;
  private ranger3D?: RangerAtlas3D;
  private nextRangerMetrics = 0;
  private tripoWarrior?: TripoWarrior3D;
  private tripoLoad?: AbortController;
  private tripoEnabled = false;
  private tripoState: 'off' | 'standby' | 'loading' | 'ready' | 'unavailable' = 'off';
  private nextTripoMetrics = 0;
  readonly camera = { x:0, y:0, zoom };

  constructor(private readonly host: HTMLElement, private readonly onCommand: (cmd:Command)=>void,
    private readonly onSelect: (id:string|null)=>void, private readonly entry?: EntryOptions) {}

  async init(): Promise<void> {
    await this.app.init({ width:Math.max(1,this.host.clientWidth), height:Math.max(1,this.host.clientHeight),
      backgroundColor:0x252736, resolution:Math.min(window.devicePixelRatio || 1,2), autoDensity:true,
      antialias:true, preference:'webgl', powerPreference:'high-performance' });
    if (this.disposed) {
      this.app.destroy(true, {children:true});
      this.rigAssets.destroy();
      return;
    }
    const canvas = this.app.canvas;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    this.host.appendChild(canvas);
    this.world.scale.set(zoom);
    this.world.addChild(this.moveMark, this.objects, this.effects.root, this.warFlags.carried);
    this.objects.addChild(this.warFlags.dropped);
    this.bindPointer(this.warFlags.dropped,new Rectangle(-25,-60,63,67),() => {
      this.destination = undefined;
      this.onCommand({type:'nationWar',action:'pickup'});
    });
    this.moveMark.visible = false;
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointerdown', this.pressGround);
    this.app.stage.on('globalpointermove', this.dragGround);
    window.addEventListener('pointerup', this.endDrag);
    window.addEventListener('pointercancel', this.endDrag);
    window.addEventListener('keydown', this.pressKey);
    window.addEventListener('keyup', this.releaseKey);
    window.addEventListener('blur', this.clearControls);
    window.addEventListener('focusin', this.onFocus);
    document.addEventListener('visibilitychange', this.resetVisibleTimings);
    this.resized = new ResizeObserver(this.resize);
    this.resized.observe(this.host);
    this.resize();
    this.app.ticker.add(this.tick);
    this.ready = true;
    if (this.snapshot) this.update(this.snapshot);
    void this.effects.init(this.app.renderer, value => { this.host.dataset.particles = value; });
    const experiment = new URLSearchParams(window.location.search).get('ranger3d');
    if (experiment==='1' || experiment==='ual') void this.initRanger3D(experiment==='ual' ? 'ual' : 'procedural');
    if (this.tripoEnabled || new URLSearchParams(window.location.search).get('warrior3d') === '1') {
      void this.setTripoWarriorEnabled(true);
    }
  }

  async setTripoWarriorEnabled(enabled: boolean): Promise<void> {
    if (this.disposed) return;
    this.tripoEnabled = enabled;
    this.tripoLoad?.abort();
    this.tripoLoad = undefined;
    this.tripoState = enabled ? 'standby' : 'off';
    this.host.dataset.warrior3d = this.tripoState;
    this.disposeTripoWarrior();
    if (!enabled || !this.ready) return;
    const player = this.snapshot ? this.actors.get(this.snapshot.self.id) : undefined;
    if (!player?.tripoWarrior3D) return;

    const pending = new AbortController();
    this.tripoLoad = pending;
    this.tripoState = 'loading';
    this.host.dataset.warrior3d = 'loading';
    try {
      const { TripoWarrior3D } = await import('./tripo-warrior3d');
      if (pending.signal.aborted || this.disposed) return;
      const current = this.snapshot ? this.actors.get(this.snapshot.self.id) : undefined;
      if (!current?.tripoWarrior3D) {
        this.tripoState = 'standby';
        this.host.dataset.warrior3d = 'standby';
        return;
      }
      const renderer = await TripoWarrior3D.create(pending.signal);
      if (pending.signal.aborted || this.disposed) {
        renderer.destroy();
        return;
      }
      this.tripoWarrior = renderer;
      this.tripoState = 'ready';
      this.host.dataset.warrior3d = 'ready';
      this.nextTripoMetrics = 0;
    } catch (error) {
      if (pending.signal.aborted || this.disposed) return;
      this.tripoState = 'unavailable';
      this.host.dataset.warrior3d = 'unavailable';
      console.warn('Could not enable the Tripo warrior trial', error);
    } finally {
      if (this.tripoLoad === pending) this.tripoLoad = undefined;
    }
  }

  getTripoWarriorStatus() {
    const view = this.snapshot ? this.actors.get(this.snapshot.self.id) : undefined;
    return { enabled:this.tripoEnabled, state:this.tripoState,
      applicable:!!view?.tripoWarrior3D, active:!!this.tripoWarrior?.stats.active };
  }

  private disposeTripoWarrior() {
    const renderer = this.tripoWarrior;
    this.tripoWarrior = undefined;
    try { renderer?.destroy(); }
    catch (error) { console.warn('Could not release the Tripo warrior trial', error); }
  }

  private async initRanger3D(mode:Ranger3DMode) {
    this.host.dataset.ranger3d = 'loading';
    try {
      const {RangerAtlas3D} = await import('./ranger-atlas3d');
      if (this.disposed) return;
      const atlas = await RangerAtlas3D.create(mode);
      if (this.disposed) atlas.destroy();
      else this.ranger3D = atlas;
    } catch (error) {
      if (this.disposed) return;
      this.host.dataset.ranger3d = 'unavailable';
      console.warn('Could not enable the 3D ranger preview',error);
    }
  }

  update(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    if(snapshot.self.hp<=0)this.cancelPrediction();
    if (!this.ready) return;
    const zone = snapshot.zoneId ?? snapshot.mapId;
    if (this.measuredZone !== zone) {
      this.measuredZone = zone;
      this.resetFrameTimings();
    }
    if (!this.entryBuilt) {
      if (!this.preparingEntry) {
        this.preparingEntry = true;
        void this.prepareEntry().catch(error => {
          if (!this.disposed) this.entry?.failed(error);
        });
      }
      return;
    }
    this.applySnapshot(snapshot);
  }

  private visibleAtlases(snapshot: Snapshot, map: MapDef) {
    const width = this.app.screen.width/zoom, height = this.app.screen.height/zoom;
    const x = viewOffset(map.width,width,snapshot.self.x,.5);
    const y = viewOffset(map.height,height,snapshot.self.y,.49);
    const keys = new Set<RigAtlasKey>();
    for (const state of snapshot.actors) {
      if (state.id !== snapshot.self.id && (state.x < x-85 || state.x > x+width+85 || state.y < y-48 || state.y > y+height+125)) continue;
      const role = state.kind === 'npc' ? map.npcs.find(npc => npc.id === state.id)?.role : undefined;
      const key = rigAtlasFor(dressedActor(state,role),actorFeminine(state,snapshot.self));
      if (key) keys.add(key);
    }
    return keys;
  }

  private async prepareEntry() {
    const attempted = new Set<RigAtlasKey>();
    const expiresAt = performance.now() + entryAssetBudget;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<true>(resolve => {
      this.finishEntryWait = () => resolve(true);
      timer = setTimeout(this.finishEntryWait,entryAssetBudget);
    });
    try {
      while (this.ready && this.snapshot) {
        const snapshot = this.snapshot;
        const map = MAPS[snapshot.mapId];
        if (!map) throw new Error('地图配置尚未加载。');
        const pending: Promise<void>[] = [];
        for (const key of this.visibleAtlases(snapshot,map)) {
          if (attempted.has(key)) continue;
          attempted.add(key);
          pending.push(this.rigAssets.request(key));
        }
        if (this.map?.id !== map.id) {
          // Let the deduplicated texture requests start before synchronous visible tile painting.
          await Promise.resolve();
          if (!this.ready) return;
          if (this.snapshot.mapId !== map.id) continue;
          this.enterMap(map);
        }
        if (!pending.length || performance.now() >= expiresAt ||
          await Promise.race([Promise.all(pending).then(() => false), expired])) break;
      }
      if (!this.ready || !this.snapshot) return;
      this.follow(this.snapshot.self,true);
      this.applySnapshot(this.snapshot);
      this.entryBuilt = true;
    } finally {
      clearTimeout(timer);
      this.finishEntryWait = undefined;
    }
  }

  private readonly presentEntry = (ticker: Ticker) => {
    this.entrySubmitQueued = false;
    if (!this.snapshot || !this.actors.has(this.snapshot.self.id)) return;
    this.coldMs = performance.now() - (this.entry?.startedAt ?? this.createdAt);
    this.firstSubmitGapMs = ticker.elapsedMS;
    this.resetFrameTimings();
    this.entry?.presented();
  };

  private applySnapshot(snapshot: Snapshot) {
    this.gameClockOffset = Date.now() - snapshot.time;
    const nextMap = MAPS[snapshot.mapId];
    const zoneId = snapshot.zoneId ?? snapshot.mapId;
    if (nextMap && this.map?.id !== nextMap.id) this.enterMap(nextMap);
    else if (this.zoneId !== undefined && this.zoneId !== zoneId) {
      this.clearZone();
      this.follow(snapshot.self,true);
    }
    this.zoneId = zoneId;
    this.updateQuestMarkers(snapshot);
    const active = new Set<string>();
    for (const state of snapshot.actors) {
      active.add(state.id);
      const local = state.id === snapshot.self.id;
      const feminine = actorFeminine(state,snapshot.self);
      const signature = actorSignature(state,feminine);
      let view = this.actors.get(state.id);
      if (view && view.signature !== signature) {
        this.ranger3D?.release(state.id);
        this.tripoWarrior?.release(state.id);
        view.root.destroy({children:true});
        view = undefined;
      }
      if (!view) {
        view = buildActor(state,feminine,local,this.shading,this.rigAssets.atlases,state.kind === 'npc' ? this.npcRoles.get(state.id) : undefined);
        setQuestMarker(view,this.npcQuestMarkers.get(state.id));
        if (!local) this.bindTarget(view);
        this.actors.set(state.id,view);
        this.objects.addChild(view.root);
        drawHealth(view);
        if (view.atlas) void this.rigAssets.request(view.atlas);
      } else {
        const healthChanged = state.hp !== view.state.hp || state.maxHp !== view.state.maxHp ||
          (state.action === 'dead') !== (view.state.action === 'dead');
        view.state = state;
        if (healthChanged) drawHealth(view);
        const changedPosition = state.x !== view.root.x || state.y !== view.root.y;
        const crossesWall = !local && changedPosition && this.map && !segmentPassable(this.map,view.root.position,state);
        if (crossesWall || Math.hypot(state.x - view.root.x,state.y - view.root.y) > 160) view.root.position.set(state.x,state.y);
      }
      view.ring.visible = state.id === this.selection && state.action !== 'dead';
    }
    for (const [id, view] of this.actors) {
      if (!active.has(id)) {
        this.ranger3D?.release(id);
        this.tripoWarrior?.release(id);
        view.root.destroy({children:true});
        this.actors.delete(id);
      }
    }
    if (this.selection && !active.has(this.selection)) this.choose(null);
    this.updateDrops(snapshot.drops);
    this.updateResources(snapshot.resources ?? [],snapshot.time,snapshot.gathering);
    const war = snapshot.mapId === 'resource-war' && snapshot.nationWar?.phase === 'flag' ? snapshot.nationWar : undefined;
    this.flagHolderId = war?.holder?.id;
    this.warFlags.drop(this.flagHolderId ? undefined : war?.flag);
    if (!this.flagHolderId) this.warFlags.carry();
    for (const event of snapshot.events) {
      if (this.shownEvents.has(event.id)) continue;
      this.shownEvents.add(event.id);
      if (event.projectile) {
        this.effects.launch(event,snapshot.time);
        continue;
      }
      if (snapshot.time - event.at > 1750) continue;
      const actor = this.actors.get(event.actorId)?.root.position;
      const targetView = event.targetId ? this.actors.get(event.targetId) : undefined;
      const target = event.targetId ? targetView?.root.position : actor;
      if (event.kind === 'damage' && targetView?.rig.reactToHit && target && targetView.state.action !== 'dead') {
        const direction = event.impactAngle ?? (actor ? Math.atan2(target.y-actor.y,target.x-actor.x) : targetView.direction+Math.PI);
        targetView.rig.reactToHit(direction,Math.max(0,snapshot.time-event.at));
      }
      const location = target ?? (event.x !== undefined && event.y !== undefined ? {x:event.x,y:event.y} : undefined);
      if (location) this.effects.add(event,{x:location.x,y:location.y},actor);
    }
    while (this.shownEvents.size > 1000) {
      const oldest = this.shownEvents.values().next().value;
      if (oldest === undefined) break;
      this.shownEvents.delete(oldest);
    }
    if (this.tripoEnabled) {
      const applicable = !!this.actors.get(snapshot.self.id)?.tripoWarrior3D;
      if (this.tripoState === 'loading' && !applicable || this.tripoState === 'standby' && applicable) {
        void this.setTripoWarriorEnabled(true);
      }
    }
    this.queueEntrySubmit(snapshot.self.id);
  }

  private updateQuestMarkers(snapshot: Snapshot) {
    if (!this.mapQuests.length) return;
    const { id, level, quests } = snapshot.self;
    const player = { id, level, quests: quests.filter(quest => this.mapQuestIds.has(quest.id)) };
    const signature = questMarkerSignature(player,snapshot.time);
    if (signature === this.questMarkerKey) return;
    this.questMarkerKey = signature;
    const next = questMarkers(this.mapQuests,player,snapshot.time);
    for (const id of new Set([...this.npcQuestMarkers.keys(), ...next.keys()])) {
      const marker = next.get(id);
      if (marker === this.npcQuestMarkers.get(id)) continue;
      const view = this.actors.get(id);
      if (view) setQuestMarker(view,marker);
    }
    this.npcQuestMarkers = next;
  }

  private queueEntrySubmit(selfId: string) {
    if (this.entrySubmitQueued || this.coldMs !== undefined || !this.actors.has(selfId)) return;
    this.entrySubmitQueued = true;
    // Pixi's Application renderer runs at UPDATE_PRIORITY.LOW.
    this.app.ticker.addOnce(this.presentEntry,this,UPDATE_PRIORITY.LOW-1);
  }

  private refreshAtlas(key: RigAtlasKey) {
    if (!this.ready || !this.snapshot) return;
    for (const [id, previous] of this.actors) {
      if (previous.atlas !== key) continue;
      const state = previous.state;
      const local = id === this.snapshot.self.id;
      const feminine = actorFeminine(state,this.snapshot.self);
      const view = buildActor(state,feminine,local,this.shading,this.rigAssets.atlases,state.kind === 'npc' ? this.npcRoles.get(id) : undefined);
      setQuestMarker(view,this.npcQuestMarkers.get(id));
      view.root.position.copyFrom(previous.root.position);
      view.root.zIndex = previous.root.zIndex;
      view.direction = previous.direction;
      view.phase = previous.phase;
      view.speed = previous.speed;
      view.ring.visible = previous.ring.visible;
      this.ranger3D?.release(id);
      this.tripoWarrior?.release(id);
      if (!local) this.bindTarget(view);
      this.objects.addChild(view.root);
      this.actors.set(id,view);
      drawHealth(view);
      previous.root.destroy({children:true});
    }
  }

  cancelPrediction() {
    this.destination = undefined;
    this.pressed.clear();
    this.keyboardMoving = false;
    this.dragging = false;
    this.markerAge = 1000;
    this.moveMark.visible = false;
  }

  rejectMove(target: Point) {
    if (this.destination?.x === target.x && this.destination.y === target.y) this.destination = undefined;
    if (this.moveMark.position.x === target.x && this.moveMark.position.y === target.y) {
      this.markerAge = 1000;
      this.moveMark.visible = false;
    }
  }

  select(id: string | null) {
    if (this.selection) {
      const old = this.actors.get(this.selection);
      if (old) old.ring.visible = false;
    }
    this.selection = id;
    const selected = id ? this.actors.get(id) : undefined;
    if (selected) selected.ring.visible = selected.state.action !== 'dead';
  }

  private resetFrameTimings() {
    this.frameTimings.reset();
    this.frameSummary = { samples: 0 };
    this.nextFrameSummary = 0;
  }

  private readonly resetVisibleTimings = () => {
    this.resetFrameTimings();
    this.skipFrameSample = true;
  };

  getMetrics() {
    const now = performance.now();
    if (now >= this.nextFrameSummary) {
      this.frameSummary = this.frameTimings.summary();
      this.nextFrameSummary = now + 600;
    }
    return { fps: this.ready ? Math.round(this.app.ticker.FPS) : 0, actors: this.actors.size,
      frames: this.frameSummary, zone: this.measuredZone, coldMs: this.coldMs, firstSubmitGapMs: this.firstSubmitGapMs };
  }

  screenToWorld(x: number, y: number): Point {
    return {x:x / this.camera.zoom + this.camera.x,y:y / this.camera.zoom + this.camera.y};
  }

  private choose(id: string | null) {
    this.select(id);
    this.onSelect(id);
  }

  private clearZone() {
    this.effects.clear();
    this.ranger3D?.clear();
    this.tripoWarrior?.clear();
    for (const actor of this.actors.values()) actor.root.destroy({children:true});
    for (const drop of this.drops.values()) drop.destroy({children:true});
    for (const resource of this.resources.values()) resource.root.destroy({children:true});
    this.actors.clear();
    this.drops.clear();
    this.resources.clear();
    this.destination = undefined;
    this.moveMark.visible = false;
    this.pressed.clear();
    this.keyboardMoving = false;
    this.endDrag();
    this.flagHolderId = undefined;
    this.warFlags.drop();
    this.warFlags.carry();
    if (this.selection) this.choose(null);
  }

  private enterMap(map: MapDef) {
    this.terrain?.destroy();
    this.clearZone();
    for (const portal of this.portals) portal.root.destroy({children:true});
    this.portals.length = 0;
    this.map = map;
    this.npcRoles.clear();
    for (const npc of map.npcs) this.npcRoles.set(npc.id,npc.role);
    this.mapQuests = Object.values(QUESTS).filter(quest => this.npcRoles.has(quest.npc) || this.npcRoles.has(quest.turnIn));
    this.mapQuestIds = new Set(this.mapQuests.flatMap(quest => quest.requires ? [quest.id, quest.requires] : [quest.id]));
    this.questMarkerKey = undefined;
    this.npcQuestMarkers.clear();
    this.terrain = new Terrain(map,this.objects);
    this.world.addChildAt(this.terrain.base,0);
    for (const portal of map.portals) {
      const view = makePortal(portal.name,portal.radius);
      view.root.position.set(portal.x,portal.y);
      view.root.zIndex = portal.y;
      this.bindPointer(view.root, new Rectangle(-42,-58,84,70), () => {
        this.destination = undefined;
        this.onCommand({type:'teleport',portalId:portal.id});
      });
      this.objects.addChild(view.root);
      this.portals.push(view);
    }
    const self = this.snapshot?.self ?? map.spawn;
    this.follow(self,true);
  }

  private bindPointer(object: Container, area: Rectangle, callback: ()=>void) {
    object.eventMode = 'static';
    object.cursor = 'pointer';
    object.hitArea = area;
    object.interactiveChildren = false;
    object.on('pointerdown', event => {
      if (event.button !== 0) return;
      event.stopPropagation();
      this.endDrag();
      callback();
    });
  }

  private bindTarget({root,state,rig}: ActorView) {
    const size = rig.hitHalfWidth ?? (state.boss ? 48 : 28);
    const height = rig.height+4;
    this.bindPointer(root,new Rectangle(-size,-height,size*2,height+8),() => {
      const current = this.actors.get(state.id)?.state;
      if (!current || current.action === 'dead') return;
      this.choose(state.id);
      this.destination = undefined;
      if (current.kind === 'monster') this.onCommand({type:'attack',targetId:current.id,useDefault:true});
      if (current.kind === 'npc') this.onCommand({type:'interact',npcId:current.id});
    });
  }

  private updateDrops(drops: DropState[]) {
    const active = new Set<string>();
    for (const drop of drops) {
      active.add(drop.id);
      if (this.drops.has(drop.id)) continue;
      const item = ITEMS[drop.itemId];
      const color = qualityColor[item?.quality] ?? qualityColor.common;
      const root = new Container({ x:drop.x,y:drop.y });
      root.zIndex = drop.y - 1;
      const glint = new Graphics().ellipse(0,1,9,3.6).fill({color:0x422f43,alpha:0.46})
        .poly([0,-14,7,-8,0,-1,-7,-8]).fill(color).stroke({color:0x694f56,width:1})
        .poly([0,-14,3,-8,0,-5,-4,-8]).fill(0xfff1bf).circle(8,-13,1.5).fill(0xfff1bf);
      const name = addLabel(item?.name ?? '掉落物',color,10);
      name.y = -15;
      root.addChild(glint,name);
      this.bindPointer(root,new Rectangle(-22,-25,44,34),() => {
        this.destination = undefined;
        this.onCommand({type:'loot',dropId:drop.id});
      });
      this.objects.addChild(root);
      this.drops.set(drop.id,root);
    }
    for (const [id,root] of this.drops) {
      if (!active.has(id)) {
        root.destroy({children:true});
        this.drops.delete(id);
      }
    }
  }

  private updateResources(resources: ResourceNode[], serverTime: number, gathering: Snapshot['gathering']) {
    const active = new Set<string>();
    for (const node of resources) {
      active.add(node.id);
      let view = this.resources.get(node.id);
      if (!view) {
        view = new ResourceView(node);
        this.bindPointer(view.root,new Rectangle(-26,-43,52,52),() => {
          if (!this.snapshot || this.snapshot.self.hp <= 0 || this.snapshot.gathering?.nodeId === node.id) return;
          this.destination = undefined;
          if (this.selection) this.choose(null);
          this.onCommand({type:'gather',nodeId:node.id});
        });
        this.objects.addChild(view.root);
        this.resources.set(node.id,view);
      }
      view.update(node,serverTime,gathering);
    }
    for (const [id,view] of this.resources) {
      if (active.has(id)) continue;
      view.root.destroy({children:true});
      this.resources.delete(id);
    }
  }

  private resize = () => {
    const width = Math.max(1,this.host.clientWidth);
    const height = Math.max(1,this.host.clientHeight);
    this.app.renderer.resize(width,height);
    this.app.stage.hitArea = new Rectangle(0,0,width,height);
    if (this.snapshot) this.follow(this.actors.get(this.snapshot.self.id)?.root.position ?? this.snapshot.self,true);
  };

  private pressGround = (event: FederatedPointerEvent) => {
    if (event.button !== 0 || this.snapshot?.self.hp === 0) return;
    if (document.activeElement instanceof HTMLElement && isTextInput(document.activeElement)) document.activeElement.blur();
    if (this.selection) this.choose(null);
    this.dragging = true;
    this.sendMove(this.screenToWorld(event.global.x,event.global.y),true);
  };

  private dragGround = (event: FederatedPointerEvent) => {
    if (!this.dragging || performance.now() - this.lastInputAt < 110) return;
    const hitArea = this.app.stage.hitArea;
    if (hitArea?.contains(event.global.x,event.global.y)) this.sendMove(this.screenToWorld(event.global.x,event.global.y),false);
  };

  private endDrag = () => { this.dragging = false; };

  private sendMove(point: Point, showMarker: boolean) {
    if (!this.map || !this.snapshot || this.snapshot.self.hp <= 0) return;
    const target = {x:Math.round(clamp(point.x,0,this.map.width)),y:Math.round(clamp(point.y,0,this.map.height))};
    this.destination = pointPassable(this.map,target) ? target : undefined;
    this.lastInputAt = performance.now();
    if (showMarker) {
      this.moveMark.position.set(target.x,target.y);
      this.markerAge = 0;
      this.moveMark.visible = true;
    }
    this.onCommand({type:'move',...target});
  }

  private pressKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!Object.hasOwn(keyAxes,key) || event.ctrlKey || event.metaKey || event.altKey || isTextInput(event.target)) return;
    event.preventDefault();
    this.pressed.add(key);
    if (!this.keyboardMoving) this.driveKeyboard();
  };

  private releaseKey = (event: KeyboardEvent) => {
    if (!this.pressed.delete(event.key.toLowerCase())) return;
    if (this.pressed.size === 0) this.clearControls();
    else this.driveKeyboard();
  };

  private onFocus = (event: FocusEvent) => { if (isTextInput(event.target)) this.clearControls(); };

  private clearControls = () => {
    this.pressed.clear();
    this.endDrag();
    if (this.keyboardMoving) {
      this.destination = undefined;
      this.onCommand({type:'stop'});
      this.keyboardMoving = false;
    }
  };

  private driveKeyboard() {
    const snapshot = this.snapshot;
    if (!snapshot || snapshot.self.hp <= 0 || !this.pressed.size) return;
    let x = 0;
    let y = 0;
    for (const key of this.pressed) { x += keyAxes[key].x; y += keyAxes[key].y; }
    const magnitude = Math.hypot(x,y);
    if (magnitude === 0) {
      if (this.keyboardMoving) {
        this.keyboardMoving = false;
        this.destination = undefined;
        this.onCommand({type:'stop'});
      }
      return;
    }
    this.keyboardMoving = true;
    const origin = this.actors.get(snapshot.self.id)?.root.position ?? snapshot.self;
    this.sendMove({x:origin.x+x*95/magnitude,y:origin.y+y*95/magnitude},false);
  }

  private animateActor(view: ActorView, snapshot: Snapshot, delta: number, elapsed: number, clock: number) {
    const { state,root } = view;
    const local = state.id === snapshot.self.id;
    const map = this.map;
    const position = root.position;
    const dx = state.x - position.x;
    const dy = state.y - position.y;
    const blend = 1 - Math.exp(-delta / (local ? 113 : 72));
    const correction = {x:position.x + dx * blend,y:position.y + dy * blend};
    let next: Point = correction;
    const target = local && state.action !== 'dead' && (state.stunnedUntil ?? 0) <= clock
      ? this.destination : undefined;
    if (target && map) {
      if (Math.hypot(target.x-state.x,target.y-state.y) < 5) this.destination = undefined;
      else {
        const toX = target.x - position.x;
        const toY = target.y - position.y;
        const length = Math.hypot(toX,toY);
        if (length > 1 && Math.hypot(dx,dy) < 38) {
          const stride = Math.min(length,snapshot.derived.speed * delta / 1000);
          const prediction = {
            x:position.x + toX/length*stride + dx * blend * 0.22,
            y:position.y + toY/length*stride + dy * blend * 0.22,
          };
          if (segmentPassable(map,position,prediction)) next = prediction;
        }
      }
    }
    // Snap to the authoritative position when a correction would cut across a coast or obstacle.
    const snapped = local && map && next === correction && (dx !== 0 || dy !== 0) && !segmentPassable(map,position,correction);
    if (snapped) next = state;
    const travelX = next.x - position.x;
    const travelY = next.y - position.y;
    position.set(next.x,next.y);
    root.zIndex = Math.round(next.y);
    const travel = Math.hypot(travelX,travelY);
    const moving = state.action !== 'dead' && (state.action === 'walk' || travel > delta * 0.016);
    if (this.ranger3D && view.ranger3D) {
      const speed = moving ? Math.min(330,travel*1000/Math.max(1,delta)) : 0;
      view.speed += (speed-view.speed)*(1-Math.exp(-delta/72));
    }
    if (state.action === 'attack' || state.action === 'cast') view.direction = state.direction;
    else if (moving && travel > 0.13) view.direction = Math.atan2(travelY,travelX);
    else if (!moving) view.direction = state.kind === 'npc' ? Math.PI / 2 : state.direction;
    view.rig.animate({time:elapsed+view.phase,moving,direction:view.direction,action:state.action,
      actionTime:Math.max(0,clock-state.actionAt),travelX:snapped ? 0 : travelX,travelY:snapped ? 0 : travelY,deltaSeconds:delta/1000},state);
    view.name.alpha = state.action === 'dead' ? 0.44 : 1;
    view.shadow.alpha = state.action === 'dead' ? 0.68 : 1;
  }

  private follow(point: Point, snap: boolean, delta = 16) {
    if (!this.map) return;
    const { width,height } = this.app.screen;
    const visibleX = width / zoom;
    const visibleY = height / zoom;
    const targetX = viewOffset(this.map.width,visibleX,point.x,.5);
    const targetY = viewOffset(this.map.height,visibleY,point.y,.49);
    const blend = snap ? 1 : 1 - Math.exp(-delta / 68);
    this.camera.x += (targetX - this.camera.x) * blend;
    this.camera.y += (targetY - this.camera.y) * blend;
    this.world.position.set(-this.camera.x * zoom,-this.camera.y * zoom);
    this.terrain?.updateView(this.camera,visibleX,visibleY);
  }

  private tick = (ticker: Ticker) => {
    if (document.visibilityState === 'visible' && this.measuredZone && this.coldMs !== undefined) {
      if (this.skipFrameSample) this.skipFrameSample = false;
      else this.frameTimings.record(ticker.elapsedMS);
    }
    const delta = Math.min(50,ticker.deltaMS);
    const elapsed = performance.now();
    const clock = Date.now() - this.gameClockOffset;
    if (this.pressed.size && elapsed - this.lastInputAt > 105) this.driveKeyboard();
    if (this.snapshot) {
      const gathering = this.snapshot.gathering;
      if (gathering) this.resources.get(gathering.nodeId)?.tick(clock,gathering.endsAt);
      for (const view of this.actors.values()) this.animateActor(view,this.snapshot,delta,elapsed/1000,clock);
      const holder = this.flagHolderId ? this.actors.get(this.flagHolderId) : undefined;
      this.warFlags.carry(holder && holder.state.action !== 'dead'
        ? {x:holder.root.x+23,y:holder.root.y-holder.rig.height-7} : undefined);
      const player = this.actors.get(this.snapshot.self.id);
      if (player) {
        this.follow(player.root.position,false,delta);
        if (this.map?.id === 'ruins-island' || this.map?.id === 'wild-forest' || this.map?.id === 'life-realm') {
          const selected = this.selection ? this.actors.get(this.selection) : undefined;
          const target = this.map.id === 'ruins-island' && (selected?.state.kind !== 'monster' || selected.state.hp <= 0)
            ? undefined : selected;
          this.terrain?.updateOcclusion(
            { x:player.root.x,y:player.root.y,height:player.rig.height,depth:player.root.zIndex },
            target ? { x:target.root.x,y:target.root.y,height:target.rig.height,depth:target.root.zIndex } : undefined,delta);
        }
      }
      this.updateRanger3D(this.snapshot.self.id,clock,elapsed,delta);
      this.updateTripoWarrior(player,elapsed,delta);
    }
    for (const [index, portal] of this.portals.entries()) {
      const pulse = Math.sin(elapsed * 0.003 + index);
      portal.glow.alpha = 0.72 + pulse * 0.24;
      portal.glow.scale.y = 0.85 + pulse * 0.12;
      portal.runes.alpha = 0.75 + pulse * 0.21;
    }
    if (this.moveMark.visible) {
      this.markerAge += delta;
      this.moveMark.alpha = Math.max(0,1-this.markerAge/560);
      this.moveMark.scale.set(0.7+this.markerAge/650);
      this.moveMark.visible = this.markerAge < 560;
    }
    this.effects.tick(delta,clock);
    this.warFlags.animate(elapsed);
  };

  private updateRanger3D(selfId:string,clock:number,elapsed:number,delta:number) {
    const atlas = this.ranger3D;
    if (!atlas) return;
    const {width,height} = this.app.screen;
    try {
      atlas.update(this.actors.values(),selfId,this.camera,width/zoom,height/zoom,clock,delta);
      if (elapsed>=this.nextRangerMetrics) {
        this.nextRangerMetrics = elapsed+500;
        this.host.dataset.ranger3d = JSON.stringify(atlas.stats);
      }
    } catch (error) {
      this.ranger3D = undefined;
      atlas.destroy();
      this.host.dataset.ranger3d = 'unavailable';
      console.warn('Could not render the 3D ranger preview',error);
    }
  }

  private updateTripoWarrior(player: ActorView | undefined, elapsed: number, delta: number) {
    const renderer = this.tripoWarrior;
    if (!renderer) return;
    try {
      renderer.update(player,delta);
      if (elapsed >= this.nextTripoMetrics) {
        this.nextTripoMetrics = elapsed + 500;
        this.host.dataset.warrior3d = JSON.stringify(renderer.stats);
      }
    } catch (error) {
      this.tripoState = 'unavailable';
      this.host.dataset.warrior3d = 'unavailable';
      this.disposeTripoWarrior();
      console.warn('Could not render the Tripo warrior trial', error);
    }
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.tripoEnabled = false;
    this.tripoLoad?.abort();
    this.tripoLoad = undefined;
    this.tripoState = 'off';
    delete this.host.dataset.warrior3d;
    this.disposeTripoWarrior();
    this.finishEntryWait?.();
    if (!this.ready) return;
    this.ready = false;
    this.resized?.disconnect();
    window.removeEventListener('pointerup',this.endDrag);
    window.removeEventListener('pointercancel',this.endDrag);
    window.removeEventListener('keydown',this.pressKey);
    window.removeEventListener('keyup',this.releaseKey);
    window.removeEventListener('blur',this.clearControls);
    window.removeEventListener('focusin',this.onFocus);
    document.removeEventListener('visibilitychange',this.resetVisibleTimings);
    this.app.ticker.remove(this.tick);
    this.app.ticker.remove(this.presentEntry,this);
    this.terrain?.destroy();
    this.ranger3D?.destroy();
    this.ranger3D = undefined;
    delete this.host.dataset.ranger3d;
    this.effects.destroy();
    delete this.host.dataset.particles;
    this.app.destroy(true,{children:true});
    this.rigAssets.destroy();
    this.shading.destroy();
    this.actors.clear();
    this.drops.clear();
    this.resources.clear();
  }

}
