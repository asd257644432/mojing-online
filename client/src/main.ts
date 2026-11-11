import './style.css';
import { CLASSES, MAPS, NATIONS, QUESTS, SKILLS, xpForLevel } from '../../shared/content';
import type { ActorState, AuctionListing, ClassId, Command, Mail, NationId, NpcDef, PlayerRecord, ServerMessage, Snapshot } from '../../shared/types';
import { GameScene } from './game/GameScene';
import { api, characters, Connection, session } from './network';
import { GameAudio } from './audio';
import { coins, escapeHtml as e, icon } from './ui/icons';
import { panelTitles, renderPanel, renderQuestTracker, nationWarSummary, type PanelId } from './ui/panels';
import { questDestination, npcDestination } from './ui/routes';
import { Travel } from './ui/travel';
import { displayCoordinates } from '../../shared/map-layout';
import { MUGUANG_PLAIN } from '../../shared/muguang-plain';
import { WILD_FOREST } from '../../shared/wild-forest';
import { LIFE_REALM } from '../../shared/life-realm';
import { mailCommand } from './ui/commands';
import { resolveTerritory } from '../../shared/world-regions';
import { panelSignature as getPanelSignature, captureForms, restoreForms, replaceContentKeepingFocus } from './ui/panel-state';
import { activeSkill, defaultAttackTarget, hotbarDrop, hotbarDropSelector, hotbarView, numberedHotbarBinding, renderHotbar } from './ui/hotbar';
import { AutoCombatState } from './ui/auto-combat';
import { stunCountdown, stunServerTime, syncStunClock, type StunClock } from './ui/stun';

const app=document.querySelector<HTMLDivElement>('#app')!;
const audio=new GameAudio();
audio.onMusicChange=updateAudioSettings;
let scene:GameScene|undefined, connection:Connection|undefined, snapshot:Snapshot|undefined;
let stunClock:StunClock|undefined;
let selfStunActor:ActorState|undefined, targetHudActor:ActorState|undefined;
let selected:string|null=null, currentPanel:PanelId|null=null, currentNpc:NpcDef|undefined;
let auctions:AuctionListing[]=[], mail:Mail[]=[], panelSignature='';
const autoCombat=new AutoCombatState();
let mailNextCursor:string|undefined;
const pendingForms=new Map<string,string>();
const panelDrafts=new Map<PanelId,ReturnType<typeof captureForms>>();
const listVersions={mail:0,auction:0};
let timer:ReturnType<typeof setInterval>|undefined;
let entryTimeout:ReturnType<typeof setTimeout>|undefined;
const chats:ServerMessage[]=[];
const seenEvents=new Set<string>();
let chosenClass:ClassId='warrior', chosenNation:NationId='water';
const travel=new Travel(command=>connection?.send(command));

function toast(text:string,error=false) {
  const host=document.querySelector('#toasts');
  if (!host) return;
  const previous=host.lastElementChild;
  if(previous?.textContent===text&&previous.classList.contains('error')===error&&!previous.classList.contains('invitation'))return;
  const div=document.createElement('div');
  div.className=`toast ${error?'error':''}`;div.textContent=text;host.append(div);
  setTimeout(()=>div.remove(),4500);
  if(error)audio.play('error');
}
function updateAudioSettings() {
  const music=document.querySelector<HTMLButtonElement>('[data-action="music"]');
  if(music)music.textContent=audio.musicEnabled?'关闭背景音乐':'开启背景音乐';
  const sound=document.querySelector<HTMLButtonElement>('[data-action="sound"]');
  if(sound)sound.textContent=audio.enabled?'关闭音效':'开启音效';
  setText('music-status',audio.musicStatus);
}
function updateTripoSettings() {
  const trial=scene?.getTripoWarriorStatus();
  if(!trial)return;
  const button=document.querySelector<HTMLButtonElement>('[data-action="tripo-model"]');
  if(button){
    const text=trial.enabled?'关闭 Tripo 战士试样':'开启 Tripo 战士试样';
    if(button.textContent!==text)button.textContent=text;
  }
  const description=!trial.enabled?'为当前角色试用原作参考的男战士模型。':
    trial.state==='unavailable'?'试样加载失败，可关闭后重新开启。':
    !trial.applicable?'试样适用于男性战士，骑乘或展开翅膀时显示原有外观。':
    trial.state==='loading'?'正在加载战士试样，游戏仍可正常操作。':
    trial.active?'战士试样已启用。':'正在准备战士试样。';
  setText('tripo-trial-status',description);
  const badge=document.getElementById('tripo-trial-badge');
  if(badge){
    badge.hidden=!trial.enabled;
    const text=trial.active?'Tripo 试样 · 静态':trial.state==='unavailable'?'Tripo 试样 · 加载失败':
      !trial.applicable?'Tripo 试样 · 当前角色不适用':'Tripo 试样 · 加载中';
    if(badge.textContent!==text)badge.textContent=text;
  }
}

function send(cmd:Command) {
  const warp=cmd.type==='use'&&snapshot?.self.inventory.some(item=>item.uid===cmd.uid&&['return-scroll','random-scroll'].includes(item.itemId));
  const interrupts=['move','stop','attack','interact','teleport','magicHouse','revive','gather','auto','loot'].includes(cmd.type)||cmd.type==='nationWar'&&cmd.action==='pickup'||warp;
  if(interrupts){
    travel.cancel(cmd.type!=='stop');
    if(cmd.type!=='move')scene?.cancelPrediction();
  }
  return connection?.send(cmd)??false;
}
function perform(cmd:Command) {
  if(cmd.type==='attack'&&selected!==cmd.targetId){
    selected=cmd.targetId;
    updateTarget();
  }
  send(cmd);
}
function currentTarget():ActorState|undefined { return snapshot?.actors.find(a=>a.id===selected); }
function startDefaultAttack() {
  if(!snapshot || snapshot.self.hp <= 0)return;
  const target=defaultAttackTarget(snapshot,selected);
  if(!target){toast('附近没有可攻击的目标');return;}
  if(target.id!==selected)scene?.select(target.id);
  perform({type:'attack',targetId:target.id,useDefault:true});
}
function cast(skillId:string) {
  if(!snapshot)return;
  const skill=activeSkill(skillId);
  if(!skill)return;
  if(skill.kind==='craft'){openPanel('craft');return;}
  const friendly=['heal','buff','craft','revive'].includes(skill.kind);
  let target=currentTarget();
  if(!friendly&&(!target||target.hp<=0||!['monster','player'].includes(target.kind))){
    target=snapshot.actors.filter(a=>a.kind==='monster'&&a.hp>0).sort((a,b)=>distance(a)-distance(b))[0];
    if(target)scene?.select(target.id);
  }
  if(!friendly&&!target){toast('附近没有可攻击的目标');return;}
  const targetId=friendly?(target?.kind==='player'?target.id:snapshot.self.id):target!.id;
  perform({type:'attack',targetId,skillId});
}
function distance(point:{x:number;y:number}):number { return snapshot?Math.hypot(point.x-snapshot.self.x,point.y-snapshot.self.y):Infinity; }

function navigate(mapId:string,point?:{x:number;y:number;name?:string;npcId?:string}): boolean {
  if(!snapshot)return false;
  if(!connection?.connected){toast('连接尚未恢复，请稍后再寻路。',true);return false;}
  scene?.cancelPrediction();
  const territoryNation=resolveTerritory(mapId,snapshot.territoryNation??snapshot.self.territoryNation,snapshot.self.nation);
  if(!travel.start({mapId,point,territoryNation},snapshot)){toast(`${MAPS[mapId]?.name??mapId}：目前没有可通行路线，请检查等级与副本条件。`);return false;}
  if(mapId!==snapshot.mapId)toast(`前往${point?.name??MAPS[mapId]?.name??mapId} · 点击地面或按 Esc 可取消寻路`);
  else if(!point)toast(`当前位于${MAPS[mapId]?.name??mapId}`);
  return true;
}

async function showLobby() {
  clearTimeout(entryTimeout);
  audio.setMap();
  travel.cancel();
  mail=[];mailNextCursor=undefined;auctions=[];chats.length=0;currentNpc=undefined;pendingForms.clear();panelDrafts.clear();
  clearInterval(timer);connection?.close();scene?.destroy();scene=undefined;connection=undefined;snapshot=undefined;currentPanel=null;seenEvents.clear();
  stunClock=undefined;selfStunActor=undefined;targetHudActor=undefined;
  let roster:PlayerRecord[]=[];
  if(session.token){try{roster=await characters();}catch{session.clear();}}
  app.innerHTML=`<main class="lobby"><div class="lobby-shade"></div><header class="lobby-header"><span class="small-brand">MIRROR ONLINE</span><span>三国重临 · 本地世界</span></header><section class="lobby-content"><div class="game-logo"><span class="logo-crystal">✦</span><h1>魔镜<span>Online</span></h1><p>镜之彼端，冒险再启</p></div><div class="entry-card"><div class="entry-tabs"><button class="active" data-lobby-tab="play">进入世界</button><button data-lobby-tab="login">账户登录</button><button data-lobby-tab="register">注册账户</button></div><div id="entry-body"></div></div><p class="lobby-caption">遗迹之岛 · 沐光平原 · 生命之境<br>六种职业，三个国度，一段重新开始的旅程。</p></section><footer class="lobby-footer"><span class="server-light"></span><span id="server-health">正在连接本地服务器…</span><span>Chrome · WebGL · 真实多人世界</span></footer><div id="toasts" aria-live="polite"></div></main>`;
  const body=document.querySelector('#entry-body')!;
  function playForm(){
    body.innerHTML=roster.length?`<h2>欢迎回来</h2><div class="roster">${roster.map(p=>`<button data-enter="${e(p.id)}" class="roster-card"><span style="color:${CLASSES[p.classId].color}">${icon(CLASSES[p.classId].weapon)}</span><div><strong>${e(p.name)}</strong><small>Lv.${p.level} ${e(CLASSES[p.classId].name)} · ${e(NATIONS[p.nation].name)}</small></div><b>进入 →</b></button>`).join('')}</div><button class="quiet-btn" data-new-character>创建新角色</button>`:createCharacterForm();
    bindCreateForm();
  }
  function authForm(mode:'login'|'register'){
    body.innerHTML=`<form id="auth-form"><h2>${mode==='login'?'再次踏上旅程':'建立你的冒险档案'}</h2><label>账户名<input name="username" autocomplete="username" minlength="3" maxlength="32" placeholder="3–32 位字母、数字或下划线" required></label><label>密码<input name="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" minlength="8" maxlength="128" placeholder="至少 8 位" required></label><button class="enter-btn" type="submit">${mode==='login'?'登录':'注册并继续'} <span>→</span></button><p class="form-error" role="alert"></p></form>`;
    body.querySelector('form')!.addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget as HTMLFormElement;const data=new FormData(form);const btn=form.querySelector('button')!;btn.disabled=true;
      try{const result=await api<{token:string}>(`/auth/${mode}`,{username:data.get('username'),password:data.get('password')});session.token=result.token;roster=await characters();selectTab('play');}catch(err){form.querySelector('.form-error')!.textContent=(err as Error).message;}finally{btn.disabled=false;}
    });
  }
  function selectTab(tab:string){document.querySelectorAll('[data-lobby-tab]').forEach(el=>el.classList.toggle('active',(el as HTMLElement).dataset.lobbyTab===tab));if(tab==='play')playForm();else authForm(tab as 'login'|'register');}
  function bindCreateForm(){
    body.querySelectorAll<HTMLElement>('[data-enter]').forEach(el=>el.onclick=()=>{audio.unlock();void enterWorld(el.dataset.enter!);});
    body.querySelector<HTMLElement>('[data-new-character]')?.addEventListener('click',()=>{body.innerHTML=createCharacterForm();bindCreateForm();});
    body.querySelectorAll<HTMLElement>('[data-class]').forEach(el=>el.onclick=()=>{chosenClass=el.dataset.class as ClassId;body.querySelectorAll('[data-class]').forEach(b=>b.classList.toggle('selected',b===el));const cls=CLASSES[chosenClass];body.querySelector('#class-description')!.textContent=cls.description;});
    body.querySelectorAll<HTMLElement>('[data-nation]').forEach(el=>el.onclick=()=>{chosenNation=el.dataset.nation as NationId;body.querySelectorAll('[data-nation]').forEach(b=>b.classList.toggle('selected',b===el));});
    body.querySelector<HTMLFormElement>('#create-character')?.addEventListener('submit',async event=>{
      event.preventDefault();audio.unlock();const form=event.currentTarget as HTMLFormElement;const data=new FormData(form);const btn=form.querySelector<HTMLButtonElement>('[type=submit]')!;btn.disabled=true;btn.textContent='正在打开镜之门…';
      try{
        if(!session.token){const auth=await api<{token:string}>('/auth/guest',{});session.token=auth.token;}
        const result=await api<{character:PlayerRecord}>('/characters',{name:data.get('name'),classId:chosenClass,nation:chosenNation,gender:data.get('gender')});
        if(!form.isConnected)return;
        await enterWorld(result.character.id);
      }catch(err){form.querySelector('.form-error')!.textContent=(err as Error).message;btn.disabled=false;btn.innerHTML='启程 <span>→</span>';}
    });
  }
  document.querySelectorAll<HTMLElement>('[data-lobby-tab]').forEach(el=>el.onclick=()=>selectTab(el.dataset.lobbyTab!));
  playForm();
  try{await api('/health');const el=document.querySelector('#server-health');if(el)el.textContent='镜之大陆 · 服务器在线';}catch{const el=document.querySelector('#server-health');if(el)el.textContent='服务器未连接，请运行 npm run dev';}
}
function createCharacterForm():string {
  return `<form id="create-character"><div class="form-heading"><h2>创造你的角色</h2><small>从遗迹之岛出发</small></div><div class="class-picker">${Object.values(CLASSES).map(cls=>`<button type="button" class="class-choice ${cls.id===chosenClass?'selected':''}" data-class="${cls.id}" style="--class-color:${cls.color}">${icon(cls.weapon)}<strong>${e(cls.name)}</strong></button>`).join('')}</div><p id="class-description">${e(CLASSES[chosenClass].description)}</p><label class="field-title">选择国度</label><div class="nation-picker">${Object.values(NATIONS).map(n=>`<button type="button" data-nation="${n.id}" class="${n.id===chosenNation?'selected':''}" style="--nation-color:${n.color}">${icon('flag')}${e(n.name)}</button>`).join('')}</div><div class="name-row"><input name="name" placeholder="为你的旅人命名" required minlength="2" maxlength="12" autocomplete="off" aria-label="角色名"><select name="gender" aria-label="角色性别"><option value="male">男</option><option value="female">女</option></select></div><button class="enter-btn" type="submit">启程 <span>→</span></button><p class="form-error" role="alert"></p><p class="guest-note">直接启程会创建本地冒险档案。已有账户可切换到登录。</p></form>`;
}

async function enterWorld(characterId:string) {
  if(scene)return;
  const startedAt=performance.now();
  app.innerHTML=`<main class="game-shell"><div id="world"></div><div class="world-vignette"></div><div id="hud"><div class="player-hud"><button class="portrait" data-panel="character" aria-label="角色属性">${icon('helmet')}<span id="player-level">1</span></button><div class="vitals"><div class="name-line"><strong id="player-name">旅人</strong><button class="recharge-link" data-panel="cash">充值</button></div><div class="meter hp"><i id="hp-fill"></i><span>HP <b id="hp-value">—</b></span></div><div class="meter mp"><i id="mp-fill"></i><span>MP <b id="mp-value">—</b></span></div><div class="meter xp"><i id="xp-fill"></i><span>EXP <b id="xp-value">—</b></span></div><small id="player-class"></small><small id="player-stun" class="stun-countdown"></small></div></div><div id="target-hud" class="target-hud hidden"><div id="target-details"></div><small id="target-stun" class="stun-countdown"></small></div><div class="minimap-hud"><div class="map-title" id="map-title">遗迹之岛</div><button class="minimap" data-panel="map" aria-label="打开世界地图"><canvas id="minimap-canvas" width="148" height="148"></canvas><span class="compass">N</span></button><div id="map-coordinates">0, 0</div><div class="map-actions"><button data-panel="mail" title="信箱">${icon('mail')}</button><button data-panel="pet" title="宠物与飞行器">${icon('paw')}</button><button data-panel="magic" title="魔法屋">${icon('home')}</button><button data-panel="settings" title="设置与帮助">${icon('settings')}</button></div></div><div id="quest-tracker" class="quest-tracker"></div><div id="party-hud" class="party-hud"></div><div id="activity-hud" class="activity-hud"></div><div id="war-hud" class="war-hud hidden"></div><div class="region-toast" id="region-toast"></div><div class="bottom-hud"><section class="chat-box"><div class="chat-tabs">${[['world','世界'],['nearby','附近'],['party','组队'],['nation','国家'],['guild','公会']].map(([id,name])=>`<button data-channel="${id}" class="${id==='world'?'active':''}">${name}</button>`).join('')}<button id="chat-collapse" title="收起聊天">−</button></div><div id="chat-messages" role="log" aria-live="polite"></div><form id="chat-form"><span id="chat-channel-label">世界</span><input name="message" maxlength="200" autocomplete="off" placeholder="按 Enter 聊天…" aria-label="聊天内容"><button aria-label="发送">↵</button></form></section><div class="action-deck"><div class="combat-controls"><button id="auto-button" title="自动战斗 Z">自动</button><span id="combat-hint">点击地面移动 · 点击目标攻击</span><button data-action="loot" title="拾取 F">拾取</button></div><div class="hotbar" id="hotbar"></div></div><nav class="game-menu">${([['character','helmet','角色'],['bag','bag','包裹'],['skills','book','技能'],['quests','scroll','任务'],['social','people','好友'],['guild','shield','公会'],['nation','flag','国家']] as const).map(([id,art,name])=>`<button data-panel="${id}">${icon(art)}<span>${name}</span></button>`).join('')}</nav></div><div class="status-strip"><span id="connection-status">连接中…</span><span id="performance">—</span><span id="tripo-trial-badge" hidden></span><span id="wallet"></span></div></div><div id="panel-host"></div><div id="death-overlay" class="hidden"></div><div id="toasts" aria-live="polite"></div><div id="loading-curtain"><div class="loading-crystal">✦</div><h2>正在进入镜之大陆</h2><p>连接服务器，加载场景…</p></div></main>`;
  bindGameUI();
  const curtain=document.querySelector<HTMLElement>('#loading-curtain');
  let failed=false;
  let enteringConnection:Connection|undefined;
  const failEntry=(error:unknown)=>{
    if(scene!==entering||!curtain?.isConnected||failed)return;
    failed=true;
    audio.setMap();
    clearTimeout(entryTimeout);
    clearInterval(timer);
    enteringConnection?.close();
    stunClock=undefined;
    updateStunHud();
    entering.destroy();
    const heading=curtain.querySelector('h2');if(heading)heading.textContent='场景加载失败';
    const message=curtain.querySelector('p');if(message)message.textContent=error instanceof Error?error.message:'请重新进入世界。';
    const back=document.createElement('button');back.className='game-btn';back.textContent='返回角色列表';
    back.onclick=()=>void showLobby();curtain.append(back);
  };
  const entering=new GameScene(document.querySelector('#world')!,perform,id=>{selected=id;updateTarget();},{
    startedAt,presented:()=>{if(scene===entering&&!failed){clearTimeout(entryTimeout);curtain?.remove();}},failed:failEntry,
  });
  scene=entering;
  entryTimeout=setTimeout(()=>failEntry(new Error('连接或场景加载超时，请重新进入世界。')),15000);
  try{await entering.init();}catch(err){failEntry(err);return;}
  if(scene!==entering||failed)return;
  connection=enteringConnection=new Connection(characterId,message=>{if(scene===entering&&!failed)receive(message);},(online,text,permanent)=>{if(scene!==entering)return;if(permanent)failEntry(new Error(text));if(!online){stunClock=undefined;updateStunHud();travel.cancel();autoCombat.reset();updateAutoButton();releaseForms();document.querySelectorAll('.quest-invitation').forEach(node=>node.remove());}const el=document.querySelector('#connection-status');if(el){el.textContent=text;el.classList.toggle('offline',!online);}});
  connection.connect();
  timer=setInterval(()=>{if(!snapshot)return;updateCooldowns();updateStunHud();updatePerformance(snapshot.online);},150);
}

function updatePerformance(online:number){
  updateTripoSettings();
  const element=document.querySelector<HTMLElement>('#performance'),metrics=scene?.getMetrics();
  if(!element||!metrics)return;
  element.textContent=`${metrics.fps} FPS · ${connection?.latency??0} ms · 在线 ${online}`;
  const ms=(time:number|undefined)=>time?.toFixed(1)??'';
  const {samples,p50,p95,max}=metrics.frames;
  element.dataset.frameSamples=String(samples);
  element.dataset.frameP50Ms=ms(p50);
  element.dataset.frameP95Ms=ms(p95);
  element.dataset.frameMaxMs=ms(max);
  element.dataset.coldMs=ms(metrics.coldMs);
  element.dataset.firstSubmitGapMs=ms(metrics.firstSubmitGapMs);
  element.dataset.frameZone=metrics.zone??'';
  element.title=[
    metrics.coldMs===undefined?'':`首次场景提交 ${ms(metrics.coldMs)} ms`,
    samples?`前台最近 ${samples} 帧 · 中位 ${ms(p50)} ms · P95 ${ms(p95)} ms · 最长 ${ms(max)} ms`:'',
  ].filter(Boolean).join('\n');
}

function receive(message:ServerMessage) {
  if(message.type==='snapshot'){
    const previous=snapshot;
    const changedZone=previous?.zoneId!==message.zoneId||previous?.mapId!==message.mapId;
    snapshot=message;
    stunClock=syncStunClock(stunClock,message.time,performance.now());
    selfStunActor=message.actors.find(actor=>actor.id===message.self.id);
    if(changedZone&&previous){
      selected=null;
      scene?.select(null);
      closePanel();
    }
    audio.setMap(message.mapId);
    autoCombat.observe(message);
    updateAutoButton();
    scene?.update(message);
    updateHud();
    if(changedZone){
      const el=document.querySelector('#region-toast')!;el.textContent=regionName(message);el.classList.remove('show');requestAnimationFrame(()=>el.classList.add('show'));
    }
    travel.update(message);
    for(const event of message.events){
      if(seenEvents.has(event.id))continue;seenEvents.add(event.id);
      if(event.actorId===message.self.id||event.targetId===message.self.id){audio.play(event.kind==='level'?'level':event.kind==='heal'?'heal':'hit');}
    }
    if(seenEvents.size>600){const old=[...seenEvents].slice(0,300);old.forEach(id=>seenEvents.delete(id));}
    refreshPanel();
  } else if(message.type==='notice'){
    if(message.error){
      travel.rejectPortal(message.portalId);
      if(message.commandType==='move'&&message.moveTarget)scene?.rejectMove(message.moveTarget);
      if(message.commandType==='mail'&&message.operation==='send'||message.commandType==='auction'&&message.operation==='list')releaseForms(message.commandType);
    }
    toast(message.text,message.error);
  }
  else if(message.type==='chat'){chats.push(message);if(chats.length>100)chats.shift();renderChat();}
  else if(message.type==='interaction'){
    const previousNpcId=currentNpc?.id;
    currentNpc=MAPS[snapshot?.mapId??'']?.npcs.find(n=>n.id===message.npcId);
    if(currentNpc){
      if(currentPanel==='npc'){
        const changed=previousNpcId!==currentNpc.id;
        refreshPanel(changed);
        if(changed)document.querySelector<HTMLButtonElement>('.panel-npc .panel-header button')?.focus();
      }
      else openPanel('npc');
    }
  }else if(message.type==='partyInvite'){
    const host=document.querySelector('#toasts')!;const div=document.createElement('div');div.className='toast invitation';const label=document.createElement('span');label.textContent=`${message.name} 邀请你组队`;const btn=document.createElement('button');btn.className='game-btn';btn.textContent='接受';btn.onclick=()=>{send({type:'party',action:'accept',targetId:message.from});div.remove();};div.append(label,btn);host.append(div);setTimeout(()=>div.remove(),30000);
  }else if(message.type==='questShareInvite'){
    const host=document.querySelector('#toasts');
    const quest=QUESTS[message.questId];
    const remaining=Math.min(30000,message.expiresAt-(snapshot?.time??Date.now()));
    if(!host||!quest||remaining<=0)return;
    const div=document.createElement('div');div.className='toast invitation quest-invitation';div.dataset.inviteId=message.inviteId;
    const label=document.createElement('span');label.textContent=`${message.fromName} 邀请你接取「${quest.name}」`;
    div.append(label);
    for(const [action,text] of [['accept','接受任务'],['decline','拒绝']] as const){
      const button=document.createElement('button');button.className='game-btn';button.textContent=text;
      button.onclick=()=>{
        if(!connection?.connected){toast('连接尚未恢复，请稍后重试。',true);return;}
        div.querySelectorAll('button').forEach(button=>{button.disabled=true;});
        send({type:'questShare',action,inviteId:message.inviteId});
        setTimeout(()=>div.querySelectorAll('button').forEach(button=>{button.disabled=false;}),2000);
      };
      div.append(button);
    }
    host.append(div);setTimeout(()=>div.remove(),remaining);
  }else if(message.type==='questShareResult'){
    const invitation=[...document.querySelectorAll<HTMLElement>('.quest-invitation')].find(node=>node.dataset.inviteId===message.inviteId);
    if(message.status==='retry')invitation?.querySelectorAll('button').forEach(button=>{button.disabled=false;});
    else invitation?.remove();
  }else if(message.type==='auctions'){
    auctions=message.listings;
    listVersions.auction++;
    const clear=message.request==='list'&&completeForm('auction');
    if(currentPanel==='auction')refreshPanel(Boolean(clear),clear?'auction':undefined);
  }else if(message.type==='mail'){
    if(message.request==='claim'){
      const updated=new Map(message.messages.map(letter=>[letter.id,letter]));
      mail=mail.map(letter=>updated.get(letter.id)??letter);
    }else if(message.request!=='send'){
      const oldIds=new Set(message.cursor?mail.map(letter=>letter.id):[]);
      mail=message.cursor?[...mail,...message.messages.filter(letter=>!oldIds.has(letter.id))]:message.messages;
      mailNextCursor=message.nextCursor;
    }
    listVersions.mail++;
    const clear=message.request==='send'&&completeForm('mail');
    if(currentPanel==='mail')refreshPanel(Boolean(clear),clear?'mail':undefined);
  }
}
function setText(id:string,text:string){const el=document.getElementById(id);if(el&&el.textContent!==text)el.textContent=text;}
function regionName(state:Snapshot){
  const map = MAPS[state.mapId]?.name ?? state.mapId;
  const nation = state.territoryNation ? NATIONS[state.territoryNation].name : undefined;
  return nation && !map.startsWith(nation) ? `${nation} · ${map}` : map;
}
function fill(id:string,value:number,max:number){const el=document.getElementById(id);if(el)el.style.width=`${Math.max(0,Math.min(100,100*value/Math.max(1,max)))}%`;}
let previousBar='',previousQuests='';
function updateHud(){
  if(!snapshot)return;const s=snapshot,p=s.self;
  setText('player-name',p.name);setText('player-level',String(p.level));setText('player-class',`${CLASSES[p.classId].name} · ${NATIONS[p.nation].name}`);
  setText('hp-value',`${Math.ceil(p.hp)} / ${s.derived.maxHp}`);setText('mp-value',`${Math.ceil(p.mp)} / ${s.derived.maxMp}`);setText('xp-value',`${Math.floor(100*p.xp/xpForLevel(p.level))}%`);
  fill('hp-fill',p.hp,s.derived.maxHp);fill('mp-fill',p.mp,s.derived.maxMp);fill('xp-fill',p.xp,xpForLevel(p.level));
  const coordinates=displayCoordinates(s.mapId,p);
  setText('map-title',regionName(s));setText('map-coordinates',`${coordinates.x}, ${coordinates.y}`);setText('wallet',`${coins(p.coins)} · 紫晶 ${p.crystals}`);
  const bar=hotbarView(p);
  if(bar.signature!==previousBar){
    previousBar=bar.signature;
    document.querySelector('#hotbar')!.innerHTML=renderHotbar(bar);
  }
  const trackedQuests: PlayerRecord['quests'] = [];
  for (const progress of p.quests) {
    if (progress.status === 'complete' || !QUESTS[progress.id]) continue;
    trackedQuests.push(progress);
    if (trackedQuests.length === 5) break;
  }
  const quests=JSON.stringify([trackedQuests,p.quests.length>0,s.mapId,s.territoryNation,p.territoryNation,p.nation,p.level]);
  if (quests !== previousQuests) {
    previousQuests = quests;
    replaceContentKeepingFocus(document.querySelector<HTMLElement>('#quest-tracker')!,renderQuestTracker(s,trackedQuests));
  }
  document.querySelector('#party-hud')!.innerHTML=s.party?s.party.members.filter(m=>m.id!==p.id).map(m=>`<div><strong>${e(m.name)}</strong><span>Lv.${m.level}</span><i style="--hp:${100*m.hp/Math.max(1,m.maxHp)}%"></i></div>`).join(''):'';
  const activity=document.querySelector('#activity-hud')!;
  const gathering=s.gathering, escort=s.escort;
  activity.innerHTML=gathering?`<strong>正在采集</strong><div class="meter"><i style="width:${Math.max(0,Math.min(100,100*(1-(gathering.endsAt-s.time)/(s.resources?.find(node=>node.id===gathering.nodeId)?.duration??1800))))}%"></i><span>移动会中断采集</span></div>`:escort?`<strong>护送中 · 路程 ${Math.min(escort.stage,escort.stages)} / ${escort.stages}</strong><div class="meter hp"><i style="width:${100*escort.hp/Math.max(1,escort.maxHp)}%"></i><span>生命 ${Math.ceil(escort.hp)} / ${escort.maxHp}</span></div><small>请留在护送目标附近，保护它到达终点</small>`:'';
  activity.classList.toggle('hidden',!gathering&&!escort);
  const warHud=document.querySelector('#war-hud')!;
  warHud.classList.toggle('hidden',s.mapId!=='resource-war');
  if(s.mapId==='resource-war')warHud.textContent=nationWarSummary(s);
  updateTarget();drawMinimap();updateDeath();
}
function updateCooldowns(){
  if(!snapshot)return;
  const {cooldowns}=snapshot,now=Date.now();
  document.querySelectorAll<HTMLElement>('.hotkey[data-skill]').forEach(el=>{
    const id=el.dataset.skill!;
    const remaining=Math.max(0,(cooldowns[id]??0)-now);
    el.classList.toggle('on-cooldown',remaining>0);
    const mask=el.querySelector<HTMLElement>('.cooldown-mask')!;
    mask.style.height=`${Math.min(100,100*remaining/Math.max(1,SKILLS[id].cooldown))}%`;
    el.querySelector('.cooldown-number')!.textContent=remaining>0?(remaining/1000).toFixed(1):'';
  });
}
function updateTarget(){
  const host=document.getElementById('target-hud');if(!host)return;
  const target=targetHudActor=currentTarget();
  host.classList.toggle('hidden',!target);
  const details=document.getElementById('target-details')!;
  if(target)details.innerHTML=`<span class="target-emblem">${icon(target.kind==='monster'?'paw':'helmet')}</span><div><strong>${e(target.name)} <small>Lv.${target.level}</small></strong><div class="meter hp"><i style="width:${100*target.hp/Math.max(1,target.maxHp)}%"></i><span>${Math.ceil(target.hp)} / ${target.maxHp}</span></div></div>${target.kind==='player'?`<button class="game-btn" data-command="${e(JSON.stringify({type:'party',action:'invite',targetId:target.id}))}">组队</button>`:''}`;
  updateStunHud();
}
function updateStunHud(){
  const serverNow=stunServerTime(stunClock,performance.now());
  setText('player-stun',stunCountdown(selfStunActor,serverNow));
  setText('target-stun',stunCountdown(targetHudActor,serverNow));
}
function drawMinimap(){
  if(!snapshot)return;const canvas=document.querySelector<HTMLCanvasElement>('#minimap-canvas');const c=canvas?.getContext('2d');if(!c)return;const map=MAPS[snapshot.mapId];if(!map)return;
  const scale=130/Math.max(map.width,map.height),ox=(148-map.width*scale)/2,oy=(148-map.height*scale)/2;
  c.clearRect(0,0,148,148);c.fillStyle='#213a26';c.fillRect(0,0,148,148);c.strokeStyle='#8c985b44';c.lineWidth=1;
  for(let i=0;i<148;i+=20){c.beginPath();c.moveTo(i,0);c.lineTo(i,148);c.moveTo(0,i);c.lineTo(148,i);c.stroke();}
  c.fillStyle=map.id==='life-realm'?'#375a36':map.id==='muguang-city'?'#334c2d':map.walkable?'#407a83':'#4e6c35';c.fillRect(ox,oy,map.width*scale,map.height*scale);
  const polygon=(points:readonly {x:number;y:number}[],color:string)=>{
    if(!points.length)return;c.beginPath();c.moveTo(ox+points[0].x*scale,oy+points[0].y*scale);
    for(let i=1;i<points.length;i++)c.lineTo(ox+points[i].x*scale,oy+points[i].y*scale);
    c.closePath();c.fillStyle=color;c.fill();
  };
  if(map.id==='muguang-city')polygon(MUGUANG_PLAIN.water,'#407a83');
  if(map.walkable)polygon(map.walkable,'#4e6c35');
  if(map.id==='muguang-city'){
    polygon(MUGUANG_PLAIN.cityFloor,'#a7ad8e');polygon(MUGUANG_PLAIN.dockDeck,'#8e7551');
    for(const cliff of MUGUANG_PLAIN.cliffs)polygon(cliff,'#77765a');
  }
  if(map.id==='life-realm')polygon(LIFE_REALM.cityFloor,'#8c9d6b');
  for(const shape of map.blockedPolygons??[])polygon(shape,map.id==='life-realm'?'#407a83':'#685f46');
  if(map.id==='wild-forest'){
    polygon(WILD_FOREST.pool,'#407a83');polygon(WILD_FOREST.bridge.deck,'#8e7551');
  }
  if(map.id==='life-realm'){
    for(const bridge of LIFE_REALM.bridges)polygon(bridge.deck,'#a7ad8e');
  }
  for(const portal of map.portals){c.fillStyle='#6fe7ed';c.beginPath();c.arc(ox+portal.x*scale,oy+portal.y*scale,3,0,Math.PI*2);c.fill();}
  for(const a of snapshot.actors){c.fillStyle=a.id===snapshot.self.id?'#fff0a5':a.kind==='npc'?'#ffcf4b':a.kind==='player'?'#8ae9fa':a.kind==='monster'?'#e46f55':'#9bbfec';c.beginPath();c.arc(ox+a.x*scale,oy+a.y*scale,a.id===snapshot.self.id?4:a.kind==='npc'?2.5:1.5,0,Math.PI*2);c.fill();}
}
function updateDeath(){
  const host=document.querySelector('#death-overlay')!;if(!snapshot)return;const dead=snapshot.self.hp<=0;
  if(dead&&host.classList.contains('hidden'))host.innerHTML=`<div class="death-card"><span>✦</span><h2>灵魂仍在闪耀</h2><p>重新整装，继续未完的旅途。</p><div>${[{mode:'town',name:'免费回城',note:'返回安全区'},{mode:'silver',name:'银币复活',note:'原地恢复 30% 生命'},{mode:'gold',name:'金币复活',note:'原地恢复全部生命'}].map(o=>`<button class="game-btn" data-command="${e(JSON.stringify({type:'revive',mode:o.mode}))}">${o.name}<small>${o.note}</small></button>`).join('')}</div></div>`;
  host.classList.toggle('hidden',!dead);
}
function openPanel(id:PanelId){
  if(!snapshot)return;
  if(currentPanel===id){closePanel();return;}
  rememberDraft();
  currentPanel=id;panelSignature='';audio.play('click');
  document.querySelector('#panel-host')!.innerHTML=`<section class="game-panel panel-${id}" aria-label="${panelTitles[id]}"><header class="panel-header"><h2>${panelTitles[id]}</h2><button data-action="close" aria-label="关闭">×</button></header><div id="panel-content" class="panel-content"></div></section>`;
  refreshPanel(true);
  if(id==='skills'||id==='settings'||id==='quests'||id==='npc')document.querySelector<HTMLButtonElement>(`.panel-${id} .panel-header button`)?.focus();
  if(id==='auction')send({type:'auction',action:'browse'});if(id==='mail')send({type:'mail',action:'list'});
}
function rememberDraft(){
  const host=document.querySelector<HTMLElement>('#panel-content');
  if(host&&(currentPanel==='mail'||currentPanel==='auction'))panelDrafts.set(currentPanel,captureForms(host));
}
function closePanel(){rememberDraft();currentPanel=null;document.querySelector('#panel-host')?.replaceChildren();}
function refreshPanel(force=false,clearForm?:string){
  if(!snapshot||!currentPanel)return;
  const active=document.activeElement;
  if(!force&&active?.matches('#panel-content input, #panel-content textarea, #panel-content select, #panel-content form[data-form="hotbarBind"] button'))return;
  const context={state:snapshot,npc:currentNpc,auctions,mail,mailNextCursor};
  const signature=getPanelSignature(currentPanel,context,listVersions);
  if(!force&&signature===panelSignature)return;
  panelSignature=signature;
  const host=document.querySelector<HTMLElement>('#panel-content')!;
  const drafts=host.querySelector('form')?captureForms(host):panelDrafts.get(currentPanel)??new Map();
  if(clearForm){drafts.delete(`${clearForm}:`);panelDrafts.get(currentPanel)?.delete(`${clearForm}:`);}
  replaceContentKeepingFocus(host,renderPanel(currentPanel,context),document.querySelector<HTMLElement>('.game-panel .panel-header button'));
  restoreForms(host,drafts);
  updateFormButtons();
  if(currentPanel==='settings'){updateAudioSettings();updateTripoSettings();}
}

function formFingerprint(form:HTMLFormElement){return JSON.stringify([...new FormData(form)]);}
function updateFormButtons(){
  document.querySelectorAll<HTMLFormElement>('#panel-content form[data-form]').forEach(form=>{
    form.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.disabled=pendingForms.has(form.dataset.form!);});
  });
}
function releaseForms(commandType?:string){
  if(commandType)pendingForms.delete(commandType);else pendingForms.clear();
  updateFormButtons();
}
function completeForm(id:string){
  const form=document.querySelector<HTMLFormElement>(`#panel-content form[data-form="${id}"]`);
  const cached=panelDrafts.get(id as PanelId)?.get(`${id}:`);
  const fingerprint=form?formFingerprint(form):cached?JSON.stringify(cached):undefined;
  const unchanged=fingerprint!==undefined&&pendingForms.get(id)===fingerprint;
  if(unchanged)panelDrafts.get(id as PanelId)?.delete(`${id}:`);
  releaseForms(id);
  return unchanged;
}
let channel='world';
function renderChat(){
  const host=document.querySelector('#chat-messages');if(!host)return;const atBottom=host.scrollTop+host.clientHeight>=host.scrollHeight-30;
  host.innerHTML=chats.filter(m=>m.type==='chat').map(m=>`<div class="chat-message channel-${m.message.channel}"><b>[${({world:'世界',nearby:'附近',party:'组队',nation:'国家',guild:'公会',whisper:'私聊',system:'系统'})[m.message.channel]}] ${e(m.message.name)}</b><span>${e(m.message.text)}</span></div>`).join('');if(atBottom)host.scrollTop=host.scrollHeight;
}
function loot(){const drop=snapshot?.drops.filter(d=>distance(d)<160).sort((a,b)=>distance(a)-distance(b))[0];if(drop)send({type:'loot',dropId:drop.id});else toast('附近没有可拾取的物品');}
function updateAutoButton(){
  const button=document.querySelector<HTMLButtonElement>('#auto-button');if(!button)return;
  button.classList.toggle('active',autoCombat.active);
  button.disabled=autoCombat.pending;
  button.setAttribute('aria-pressed',String(autoCombat.active));
}
function toggleAuto(){
  if(autoCombat.pending)return;
  if(!autoCombat.request(send)){toast('连接尚未恢复，请稍后重试。',true);return;}
  updateAutoButton();
}

function bindGameUI(){
  previousBar='';previousQuests='';selected=null;channel='world';autoCombat.reset();updateAutoButton();
  app.onclick=event=>{
    const el=(event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if(el?.dataset.action==='music'){audio.toggleMusic();if(audio.musicEnabled)audio.unlock();return;}
    audio.unlock();if(!el)return;
    if(el.dataset.panel){openPanel(el.dataset.panel as PanelId);return;}
    if(el.dataset.command){try{perform(JSON.parse(el.dataset.command));}catch{toast('操作格式无效',true);}return;}
    if(el.hasAttribute('data-default-hotbar')){startDefaultAttack();return;}
    if(el.dataset.cast){cast(el.dataset.cast);return;}
    if(el.dataset.use){send({type:'use',uid:el.dataset.use});return;}
    if(el.dataset.channel){channel=el.dataset.channel;setText('chat-channel-label',el.textContent??'世界');document.querySelectorAll('[data-channel]').forEach(b=>b.classList.toggle('active',b===el));return;}
    if(el.dataset.questRoute){
      const destination=snapshot&&questDestination(snapshot,el.dataset.questRoute,el.dataset.questStep);
      if(!destination){toast('目标状态已更新，请查看任务日志。');return;}
      if(navigate(destination.mapId,destination.arrivalOnly?undefined:destination)&&currentPanel==='quests'){
        closePanel();
        if(event.detail===0)document.querySelector<HTMLButtonElement>('#quest-tracker > button')?.focus();
      }
      return;
    }
    if(el.dataset.npcRoute){const npc=npcDestination(el.dataset.npcRoute);if(npc)navigate(npc.mapId,npc);return;}
    if(el.dataset.mapFocus){navigate(el.dataset.mapFocus);return;}
    if(el.dataset.action==='close')closePanel();
    if(el.dataset.action==='loot')loot();
    if(el.dataset.action==='logout')void showLobby();
    if(el.dataset.action==='sound'){audio.toggle();updateAudioSettings();toast(audio.enabled?'音效已开启':'音效已关闭');}
    if(el.dataset.action==='tripo-model'&&scene){
      const current=scene.getTripoWarriorStatus();
      const enabled=!current.enabled;
      const url=new URL(window.location.href);
      if(enabled)url.searchParams.set('warrior3d','1');else url.searchParams.delete('warrior3d');
      window.history.replaceState(window.history.state,'',url);
      void scene.setTripoWarriorEnabled(enabled);
      updateTripoSettings();
    }
    if(el.id==='auto-button')toggleAuto();
    if(el.id==='chat-collapse')document.querySelector('.chat-box')?.classList.toggle('collapsed');
  };
  app.ondragstart=event=>{const el=(event.target as HTMLElement).closest<HTMLElement>('[draggable="true"][data-skill]');if(el)event.dataTransfer?.setData('text/plain',el.dataset.skill!);};
  app.ondragover=event=>{if((event.target as HTMLElement).closest(hotbarDropSelector))event.preventDefault();};
  app.ondrop=event=>{
    const el=(event.target as HTMLElement).closest<HTMLElement>(hotbarDropSelector);
    if(!el || !snapshot)return;
    event.preventDefault();
    const skillId=event.dataTransfer?.getData('text/plain');
    if(!skillId)return;
    const slot=el.hasAttribute('data-default-hotbar')?'default':Number(el.dataset.hotbar);
    const command=hotbarDrop(snapshot.self,slot,skillId);
    if(command)send(command);
    else if(slot==='default')toast('只能把已学的攻击技能设为默认。');
  };
  document.querySelector('#chat-form')!.addEventListener('submit',event=>{event.preventDefault();const input=document.querySelector<HTMLInputElement>('#chat-form input')!;if(input.value.trim())send({type:'chat',channel:channel as 'world',text:input.value.trim()});input.value='';input.blur();});
  document.querySelector('#panel-host')!.addEventListener('submit',event=>{
    event.preventDefault();const form=event.target as HTMLFormElement;const d=new FormData(form);const str=(name:string)=>String(d.get(name)??'');const num=(name:string)=>Number(d.get(name)??0);
    if(!connection?.connected){toast('连接尚未恢复，请稍后重试。',true);return;}
    if(form.dataset.form==='mail'&&(!str('to').trim()||!str('subject').trim())){toast('请填写收件人和邮件标题，不能只填空格。',true);return;}
    if(form.dataset.form==='mail'||form.dataset.form==='auction'){
      if(pendingForms.has(form.dataset.form))return;
      pendingForms.set(form.dataset.form,formFingerprint(form));
      updateFormButtons();
    }
    switch(form.dataset.form){
      case 'hotbarBind': {
        const command=snapshot&&numberedHotbarBinding(snapshot.self,str('slot'),str('skillId'));
        if(command)send(command);else toast('请选择已学技能和编号快捷栏。',true);
        break;
      }
      case 'socket':send({type:'forge',uid:str('uid'),materialUid:str('materialUid'),action:'socket'});break;
      case 'party':send({type:'party',action:'invite',targetId:str('name')});break;
      case 'friend':send({type:'friend',action:'add',name:str('name')});break;
      case 'questShare':send({type:'questShare',action:'send',questId:str('questId'),name:str('name')});break;
      case 'guildCreate':send({type:'guild',action:'create',name:str('name')});break;
      case 'guildJoin':send({type:'guild',action:'join',guildId:str('guildId')});break;
      case 'guildNotice':send({type:'guild',action:'notice',text:str('text')});break;
      case 'auction':send({type:'auction',action:'list',uid:str('uid'),price:num('price')});break;
      case 'mail':send(mailCommand(d));break;
    }
  });
}
window.addEventListener('keydown',event=>{
  if(!snapshot)return;const target=event.target as HTMLElement;const typing=target.matches('input,textarea,select');
  if(!event.repeat&&!typing)audio.unlock();
  if(event.code==='Escape'){if(typing)target.blur();send({type:'stop'});closePanel();selected=null;scene?.select(null);updateTarget();return;}
  if(typing)return;
  if(event.code==='KeyQ'&&event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey){
    event.preventDefault();
    document.querySelector<HTMLButtonElement>('#quest-tracker > button')?.focus();
    return;
  }
  const keyboardPanel=currentPanel==='skills'||currentPanel==='settings'||currentPanel==='quests'||currentPanel==='npc';
  const trackerButton=target.matches('#quest-tracker button');
  if(event.code==='Tab'&&(keyboardPanel||trackerButton))return;
  if(event.key==='Enter'&&(trackerButton||(keyboardPanel&&target.matches('.game-panel button'))))return;
  if(event.key==='Enter'){event.preventDefault();document.querySelector<HTMLInputElement>('#chat-form input')?.focus();return;}
  if(event.code==='Tab'){event.preventDefault();const enemies=snapshot.actors.filter(a=>a.kind==='monster'&&a.hp>0).sort((a,b)=>distance(a)-distance(b));const index=enemies.findIndex(a=>a.id===selected);selected=enemies[(index+1)%Math.max(1,enemies.length)]?.id??null;scene?.select(selected);updateTarget();return;}
  if(event.repeat)return;
  if(/^[1-8]$/.test(event.key)){const skill=snapshot.self.hotbar[Number(event.key)-1];if(skill)cast(skill);return;}
  const panel:Record<string,PanelId>={b:'bag',i:'bag',c:'character',k:'skills',q:'quests',m:'map',g:'guild',n:'nation',p:'pet',h:'settings'};
  if(panel[event.key.toLowerCase()])openPanel(panel[event.key.toLowerCase()]);
  if(event.key.toLowerCase()==='f')loot();if(event.key.toLowerCase()==='z')toggleAuto();
});
window.addEventListener('beforeunload',()=>{connection?.close();scene?.destroy();audio.destroy();});
void showLobby();
