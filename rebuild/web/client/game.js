'use strict';
// 魔镜Online 重制版 —— 网页端（“电视机 + 遥控器”）：只负责画画面、把你的操作告诉服务器
const $ = id => document.getElementById(id);
const cv = $('cv'), g = cv.getContext('2d');
const DEBUG = /[?&]debug=1/.test(location.search);
const CLASS_LIST = [['warrior', '战士', '近战·皮糙肉厚'], ['rogue', '盗贼', '近战·出手灵巧'], ['ranger', '游侠', '远程·弓箭'], ['mage', '法师', '远程·魔法'], ['priest', '祭司', '远程·神术'], ['merchant', '商人', '远程·锤子']];
const DIR_COL = [2, 1, 0, 1, 2, 3, 4, 3], DIR_FLIP = [1, 1, 0, 0, 0, 0, 0, 1]; // 角度(东=0,顺时针转) → 图集第几列 / 要不要照镜子（图里人物朝左，朝右的三个方向用镜像）
const PS = 0.4; // 人物缩放：屏幕上约 105 像素高
const BODY = 'hero-m-l1'; // 样品阶段：所有人先用男「时尚型」发型 + 新手衣（整个人画在一起，斜俯视角）
// 各职业出招用哪一套图（剑士/空手用默认那套）
const ATK_SFX = { dagger: '_dagger', staff: '_staff', bow: '_bow', scepter: '_scepter', hammer: '_hammer' };
// 形象（发型）名：女的四个都有创角截图为证；男的只有“时尚型”有图，其余三个头像是【暂拟】
const LOOK_NAME = { m: ['时尚型', '潇洒型', '文酷型', '形象四'], f: ['文静型', '淑女型', '活泼型', '时尚型'] };
const HUES = [null, 275, 215, 355, 120, 320], HUE_NAME = ['原', '紫', '蓝', '红', '绿', '粉'], HUE_CSS = ['#b98a5a', '#9a4ae0', '#3a7af0', '#e03a4a', '#3ac04a', '#f05ac0'];
const FACE_HUE = { m0: null, m1: 275, m2: 200, m3: 5, f0: 275, f1: null, f2: 5, f3: 205 }; // 每个头像本来的发色（小人身上的头发跟着染）
const hueOf = (sex, look, color) => color ? HUES[color] : FACE_HUE[(sex || 'm') + (look | 0)];
const AUTO = (/[?&]auto=([^&]+)/.exec(location.search) || [])[1]; // 自测用：?auto=名字,密码,职业 直接进游戏

// ---------- 图片 ----------
const imgs = {};
function img(src) { let i = imgs[src]; if (!i) { i = imgs[src] = new Image(); i.src = 'assets/' + src + '?v=2'; } return i; }
const ready = i => i.complete && i.naturalWidth > 0;
let CH = null;
fetch('assets/char/chars.json?v=2').then(r => r.json()).then(j => CH = j);

// ---------- 状态 ----------
let ws = null, me = null, myId = 0, MAPI = null, ITEMS = {}, SKILL = null, dbg = null;
const players = new Map(), mons = new Map();
const floats = [], shots = [];
let cam = { x: 0, y: 0 }, mouse = { x: 0, y: 0 }, hover = null, clickMark = null, skillReadyAt = 0, tNow = 0;
const send = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

// ---------- 登录 → 选角色 → 创建角色 → 选国家 ----------
// 国家：[代号, 国名, 徽章字, 卡上地域, 介绍]（介绍取自官方世界观稿；徽章字只有“火”有截图为证，其余【暂拟】）
const NATIONS = [
  ['light', '光明帝国', '光', '沐光平原', '光明帝国信仰爱与勇气，由神之后裔建立并世代守护。格兰特王朝时达到鼎盛，国王诏令天下勇士，以光之神力拯救世界。温暖善良、光明强大。'],
  ['wind', '飓风帝国', '风', '风之谷', '飓风帝国是风之元素主神亚都尼斯沉睡之地，主神的叹息化作终年不息的巨风。博洛斯王朝以宽容治国，先知辈出，是平和安详、宽容自由的国度。'],
  ['water', '沁水帝国', '水', '雪原', '沁水帝国是六国中最稳固、最美丽的国家。兰蒂斯王朝掌握着世界三分之一的财富，人民富足，智略家云集。稳固睿智、聪明柔顺。'],
  ['moon', '暗月帝国', '暗', '死亡沼泽', '暗月帝国神秘而悠久。哈德伦萨王朝凌厉冷酷，信奉胜者为王、强者为尊，亦正亦邪。神秘冷酷、凌厉黑暗。'],
  ['earth', '烈土帝国', '土', '绿洲', '烈土帝国的地幔下埋葬着无数远古巨神的怨灵，地震频发，民生贫苦。泰雅尔王朝压制着灾难，古神的元素之力上渗，使这里成为修炼圣地。勇士三千，八百烈土！'],
  ['fire', '炙火帝国', '火', '荒芜之地', '火之元素主神奥斯顿以残躯塑造了炙火帝国。这里民风热血，神权与王权都归于强者，炙烈炎卡王朝将它推向顶峰。狂暴不羁、桀骜不逊。'],
];
const NAT = Object.fromEntries(NATIONS.map(n => [n[0], n]));
const CLS_BTN = [['warrior', '战'], ['rogue', '盗'], ['mage', '法'], ['ranger', '弓'], ['priest', '祭'], ['merchant', '商']];
const CLS_NAME = Object.fromEntries(CLASS_LIST.map(c => [c[0], c[1]]));
const CLS_DESC = {
  warrior: '拥有最强大的物理攻击以及物理防御力，手持利剑的战士若将狂热之力和守护之名融会贯通，以近身格斗为主的团队主力职业。',
  rogue: '他隐匿在每个人的身边，毫不留情的给予敌人最为致命的打击！拥有最高的暴击率和闪避率，使得几乎没人可以捉到他，永远在黑暗中给予敌人最为致命的打击。',
  mage: '法师掌握着毁灭性的元素魔法，能在远处倾泻火焰与雷电。身体脆弱，却拥有团队中最强的群体杀伤力。（原作介绍文字暂缺，此段暂拟）',
  ranger: '游侠是极具杀伤性的射手，是团队中强力的输出者，后期其宠物的能力亦不可轻视，可以轻易消灭敌人于千里之外。',
  priest: '祭司是治疗和保护的大师，他们可以治愈自己的友军，甚至可以复活已经倒下的战友。优秀的治疗能力和不凡的攻击力，使得祭司在团队中都占有重要地位。',
  merchant: '强大的商人不仅拥有最强健的体魄，还精于经商、交易、合成、制作、陷阱，战斗的同时还可以给予队友弹药上的支持，国战必不可少的职业。',
};
const artOf = (cls, sex) => 'assets/login/p-' + (cls === 'priest' && sex === 'f' ? 'priest-f' : cls) + '.png';
let acct = '', charList = [], maxChars = 3, pickSlot = 0, nc = null, pickNation = 'light', pendingEnter = null, wantNext = false;
const page = id => { for (const p of document.querySelectorAll('#login .pg')) p.classList.toggle('hidden', p.id !== id); lgMsg(''); };
const lgMsg = s => { for (const e of document.querySelectorAll('.lgmsg')) e.textContent = s; };
function connect(first) {
  if (ws && ws.readyState === 1) return send(first);
  lgMsg('连接中…');
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => send(first);
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  ws.onclose = () => { if (me) { $('hud').classList.add('hidden'); me = null; players.clear(); } $('login').classList.remove('hidden'); page('pg-acct'); lgMsg('与服务器的连接断开了，请重新进入'); ws = null; };
}
$('lg-name').value = localStorage.mjAcct || localStorage.mjName || '';
const doLogin = () => { const n = $('lg-name').value.trim(); if (!n) return lgMsg('请输入账号'); connect({ t: 'acct', name: n }); };
$('lg-go').onclick = doLogin;
$('lg-name').onkeydown = e => { if (e.key === 'Enter') doLogin(); };

// —— 选角色 ——
function showChars() {
  const box = $('slots'); box.innerHTML = '';
  if (pickSlot >= charList.length) pickSlot = 0;
  for (let i = 0; i < maxChars; i++) {
    const c = charList[i], d = document.createElement('div');
    d.className = 'slotc' + (c ? '' : ' empty') + (c && i === pickSlot ? ' on' : '');
    d.innerHTML = c ? '<img src="' + artOf(c.cls, c.sex) + '"><b>' + esc(c.name) + '</b><span>' + c.level + '级 ' + c.clsName + '</span><span>' + (c.nation ? NAT[c.nation][1] : '尚未选择国家') + '</span>'
      : '<em>＋</em><b>创建角色</b>';
    d.onclick = () => { if (c) { pickSlot = i; showChars(); } else openCreate(); };
    d.ondblclick = () => { if (c) enterChar(); };
    box.appendChild(d);
  }
  $('ch-go').textContent = charList.length ? '进入游戏' : '创建角色';
}
function enterChar() {
  const c = charList[pickSlot]; if (!c) return openCreate();
  if (!c.nation) { pendingEnter = pickSlot; return openNation(); } // 老角色还没选过国家
  send({ t: 'enter', i: pickSlot, debug: DEBUG });
}
$('ch-go').onclick = enterChar;
$('ch-back').onclick = () => page('pg-acct');

// —— 创建角色 ——
function openCreate() {
  nc = { sex: 'm', cls: 'warrior', look: 0 }; pendingEnter = null; $('cr-name').value = '';
  page('pg-create'); showCreate();
}
function showCreate() {
  for (const b of document.querySelectorAll('#cr-form .sx')) b.classList.toggle('on', b.dataset.sex === nc.sex);
  for (const b of $('cr-cls').children) b.classList.toggle('on', b.dataset.cls === nc.cls);
  $('cr-art').src = artOf(nc.cls, nc.sex);
  $('cr-desc').querySelector('h4').textContent = CLS_NAME[nc.cls];
  $('cr-desc').querySelector('p').textContent = CLS_DESC[nc.cls];
}
for (const [id, ch] of CLS_BTN) { const b = document.createElement('button'); b.textContent = ch; b.dataset.cls = id; b.title = CLS_NAME[id]; b.onclick = () => { nc.cls = id; showCreate(); }; $('cr-cls').appendChild(b); }
for (const b of document.querySelectorAll('#cr-form .sx')) b.onclick = () => { nc.sex = b.dataset.sex; showCreate(); };
for (const id of ['pre-l', 'pre-r', 'cr-adv']) $(id).onclick = () => lgMsg(id === 'cr-adv' ? '高级形象就是右边的大图' : '预览图先只有这一张');
for (const [id, d] of [['lk-l', 3], ['lk-r', 1]]) $(id).onclick = () => { nc.look = (nc.look + d) % 4; lgMsg('形象：' + LOOK_NAME[nc.sex][nc.look] + '（进游戏后点左上角头像还能再换）'); };
$('cr-check').onclick = () => { wantNext = false; send({ t: 'check', name: $('cr-name').value.trim() }); };
$('cr-go').onclick = () => { wantNext = true; send({ t: 'check', name: $('cr-name').value.trim() }); };
$('cr-name').onkeydown = e => { if (e.key === 'Enter') $('cr-go').onclick(); };
$('cr-back').onclick = () => { page('pg-chars'); showChars(); };

// —— 选择国家 ——
function openNation() { page('pg-nation'); showNation(); }
function showNation() {
  for (const d of $('na-cards').children) d.classList.toggle('on', d.dataset.n === pickNation);
  const n = NAT[pickNation]; $('na-desc').querySelector('h4').textContent = n[1]; $('na-desc').querySelector('p').textContent = n[4];
}
for (const n of NATIONS) { const d = document.createElement('div'); d.className = 'nac'; d.dataset.n = n[0]; d.innerHTML = '<img src="assets/login/n-' + n[0] + '.jpg"><b>' + n[1] + '</b>'; d.onclick = () => { pickNation = n[0]; showNation(); }; $('na-cards').appendChild(d); }
$('na-go').onclick = () => {
  if (pendingEnter != null) return send({ t: 'enter', i: pendingEnter, nation: pickNation, debug: DEBUG });
  send({ t: 'create', name: $('cr-name').value.trim(), sex: nc.sex, cls: nc.cls, look: nc.look, nation: pickNation, enter: true, debug: DEBUG });
};
$('na-back').onclick = () => { if (pendingEnter != null) { page('pg-chars'); showChars(); } else { page('pg-create'); showCreate(); } };

// ---------- 收到服务器消息 ----------
function onMsg(m) {
  switch (m.t) {
    case 'err': lgMsg(m.s); break;
    case 'chars': if (me) { me = null; players.clear(); faceKey = ''; $('hud').classList.add('hidden'); $('login').classList.remove('hidden'); for (const w of document.querySelectorAll('.win')) w.classList.add('hidden'); }
      acct = m.acct; localStorage.mjAcct = acct; charList = m.list; maxChars = m.max; page('pg-chars'); showChars(); break;
    case 'check': lgMsg(m.s); if (m.ok && wantNext) openNation(); wantNext = false; break;
    case 'init':
      myId = m.id; MAPI = m.map; ITEMS = m.items; SKILL = m.skill;
      mons.clear(); for (const [id, type, name, level] of m.monsters) mons.set(id, { id, type, name, level, x: 0, y: 0, rx: 0, ry: 0, hp: 1, maxHp: 1, alive: false, fade: 0, flash: 0, face: 1 });
      if (m.debugGrid) { const b = atob(m.debugGrid.cells); dbg = Object.assign({ a: Uint8Array.from(b, c => c.charCodeAt(0)) }, m.debugGrid); }
      $('login').classList.add('hidden'); $('hud').classList.remove('hidden'); $('mmname').textContent = MAPI.name || '遗迹之岛';
      break;
    case 'self': me = m.me; skillReadyAt = tNow + me.skillCd; refreshHud(); break;
    case 'snap': onSnap(m); break;
    case 'fx': onFx(m); break;
    case 'sys': logLine(m.s); break;
    case 'chat': chatLine(m); break;
    case 'dialog': m.close ? closeWin('dialog') : showDialog(m); break;
    case 'arrive': $('arrive').classList.remove('hidden'); break;
  }
}
function onSnap(s) {
  const seen = new Set();
  for (const [id, x, y, moving, dead, hp, maxHp, level, name, loadout, target, sex, look, color] of s.p) {
    seen.add(id);
    let p = players.get(id);
    if (!p) { p = { id, rx: x, ry: y, dir: 2, atkT: 0, deadT: 0 }; players.set(id, p); }
    if (dead && !p.dead) p.deadT = 0;
    Object.assign(p, { x, y, moving, dead, hp, maxHp, level, name, loadout, target, sex, look, color });
  }
  for (const id of players.keys()) if (!seen.has(id)) players.delete(id);
  const live = new Set();
  for (const [id, x, y, hp, maxHp] of s.m) {
    const m = mons.get(id); if (!m) continue; live.add(id);
    if (!m.alive) { m.rx = x; m.ry = y; m.alive = true; m.fade = 0; }
    if (m.alive && (x !== m.x || y !== m.y)) { m.mv = tNow; if (x !== m.x) m.face = x > m.x ? 1 : -1; m.back = y < m.y - 1 ? 1 : y > m.y + 1 ? 0 : m.back || 0; }
    m.x = x; m.y = y; m.hp = hp; m.maxHp = maxHp;
  }
  for (const m of mons.values()) if (m.alive && !live.has(m.id)) { m.alive = false; m.fade = 0.6; }
}
function onFx(f) {
  if (f.k === 'hit') {
    const p = players.get(f.from), m = mons.get(f.to); if (!p || !m) return;
    p.atkT = 0.6; p.dir = dirOf(m.rx - p.rx, m.ry - p.ry);
    const ranged = !!{ bow: 1, staff: 1, scepter: 1, hammer: 1 }[p.loadout]; // 只有远程职业才飞出弹道；拿剑、匕首、空手的一律贴身砍
    const land = () => { m.flash = 0.15; floatText(m.rx, m.ry - 90, f.miss ? 'miss' : '-' + f.v, f.miss ? '#fff' : f.crit ? '#ffe100' : f.skill ? '#ff9d2e' : '#ff4a3a', f.crit); };
    if (ranged) shots.push({ x0: p.rx, y0: p.ry - 60, to: m, t: 0, d: 0.18, col: p.loadout === 'bow' ? '#f5e6b0' : f.skill ? '#ff9d2e' : '#8fd3ff', land }); else setTimeout(land, 250);
  } else if (f.k === 'mhit') {
    const m = mons.get(f.from), p = players.get(f.to); if (!p) return;
    if (m) { m.lunge = 0.25; m.face = p.rx > m.rx ? 1 : -1; }
    floatText(p.rx, p.ry - 110, f.miss ? 'miss' : '-' + f.v, f.miss ? '#fff' : '#d9d9ff');
  } else if (f.k === 'lvl') {
    const p = players.get(f.id); if (p) { p.lvlT = 1.6; floatText(p.rx, p.ry - 130, 'LEVEL UP!', '#ffe100', true); }
    const d = document.createElement('div'); d.innerHTML = '恭喜玩家 <em>' + esc(f.name) + '</em> 升到 <em>' + f.level + '</em> 级'; $('banner').innerHTML = ''; $('banner').appendChild(d);
  } else if (f.k === 'heal') { const p = players.get(f.id); if (p) floatText(p.rx, p.ry - 110, '+' + f.v, '#6dff6d'); }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function floatText(x, y, s, col, big) { floats.push({ x: x + (Math.random() - .5) * 30, y, s, col, big, t: 0 }); }
function logLine(s) { const d = document.createElement('div'); d.textContent = s; const L = $('log'); L.appendChild(d); while (L.children.length > 7) L.firstChild.remove(); setTimeout(() => d.remove(), 7000); }
function chatLine(m) {
  const d = document.createElement('div');
  if (m.sys) { d.className = 's'; d.textContent = '【系统】' + m.s; } else d.innerHTML = '<b>' + esc(m.from) + '：</b>' + esc(m.s);
  const L = $('chatlog'); L.appendChild(d); while (L.children.length > 30) L.firstChild.remove();
  const p = players.get(m.id); if (p && !m.sys) { p.say = m.s; p.sayT = 4; }
}
const dirOf = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
const money = c => { const G = Math.floor(c / 10000), S = Math.floor(c / 100) % 100, K = c % 100; return (G ? G + '金 ' : '') + (S ? S + '银 ' : '') + K + '铜'; };

// ---------- HUD ----------
function refreshHud() {
  const pct = (a, b) => Math.max(0, Math.min(100, a / b * 100)) + '%';
  $('pname').textContent = me.name; { const nb = $('nbadge'), n = NAT[me.nation]; nb.textContent = n ? n[2] : '无'; nb.className = 'badge b1 n-' + (me.nation || 'none'); nb.title = n ? n[1] : '国家'; } $('plevel').textContent = me.level;
  $('hpbar').style.width = pct(me.hp, me.maxHp); $('hptext').textContent = me.hp + ' / ' + me.maxHp;
  $('mpbar').style.width = pct(me.mp, me.maxMp); $('mptext').textContent = me.mp + ' / ' + me.maxMp;
  $('expbar').style.width = pct(me.exp, me.need); $('exptext').textContent = me.exp + ' / ' + me.need;
  $('dead').classList.toggle('hidden', !me.dead);
  const q = me.quest, T = $('tracker');
  T.innerHTML = q ? '<div class="t">[主线] ' + esc(q.title) + (q.s === 0 ? '（可接）' : q.s === 2 ? '（可交）' : '') + '</div><div class="l">' + esc(q.line) + '</div>' : '<div class="t">新手任务已全部完成</div>';
  T.onclick = goQuest;
  drawSkillbar();
  for (const w of ['char', 'bag', 'quest']) if (!$('win-' + w).classList.contains('hidden')) RENDER[w]();
}
function goQuest() {
  const q = me && me.quest; if (!q) return;
  if (q.npc) send({ t: 'npc', id: q.npc });
  else if (q.pos) { send({ t: 'move', x: q.pos[0], y: q.pos[1] }); clickMark = { x: q.pos[0], y: q.pos[1], t: 0 }; }
}
function drawSkillbar() {
  const B = $('skillbar'); B.innerHTML = '';
  const slots = [{ icon: '⚔️', title: '技能01（暂定）：对选中的怪造成 ' + SKILL.mult + ' 倍伤害，耗蓝 ' + SKILL.mp, act: () => send({ t: 'skill' }), cd: true },
    { item: 'hp_potion' }, { item: 'mp_potion' }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}]; // 两排各 8 格，上排对应数字键 1–8
  slots.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'slot';
    const it = s.item && ITEMS[s.item], n = s.item ? (me.bag[s.item] || 0) : 0;
    if (it) { d.innerHTML = it.icon + '<span class="n">' + n + '</span>'; d.title = it.name + '：' + it.desc; if (!n) d.style.opacity = .45; d.onclick = () => send({ t: 'use', item: s.item }); }
    else if (s.act) { d.innerHTML = s.icon + '<i class="cd" id="skcd"></i>'; d.title = s.title; d.onclick = s.act; }
    else d.classList.add('empty');
    if (i < 8) d.insertAdjacentHTML('beforeend', '<span class="k">' + (i + 1) + '</span>'); B.appendChild(d);
  });
  const a = document.createElement('div'); a.className = 'slot atk'; a.textContent = '🗡️'; a.title = '普通攻击：打离你最近的怪'; a.onclick = () => send({ t: 'tab' }); B.appendChild(a); // 技能栏左边单独的一格
}
const RENDER = {
  char() {
    // 角色窗口：位置、大小、颜色都照原作截图（原窗口 366×474）量出来的
    const A = me.attrs, pc = v => v == null ? '0%' : Math.round(v * 100) + '%', nv = v => v == null ? 0 : v;
    const L = (k, v, c) => '<div class="r"><b>' + k + ':</b><span' + (c ? ' class="' + c + '"' : '') + '>' + v + '</span></div>';
    const P = (k, name, v) => '<div class="r"><b>' + name + ':</b><span>' + v + '</span>' + (me.pts > 0 ? '<button class="plus" data-a="' + k + '">+</button>' : '') + '</div>';
    // 14 个装备格：上 2、左 4、右 4、下 4（哪格放什么是照原作图标认的；目前只有武器、衣服两格真能用）
    const POS = [[32, 0, '头盔'], [105, 0, '饰品'], [0, 41, '武器', 'weapon'], [0, 82, '戒指'], [0, 125, '护腕'], [0, 166, '鞋子'],
      [137, 41, '项链'], [137, 82, '衣服', 'body'], [137, 125, '腰带'], [137, 166, '裤子'], [0, 208, '时装'], [45, 208, '袋子'], [91, 208, '袋子'], [137, 208, '翅膀']];
    let slots = '';
    for (const [x, y, nm, slot] of POS) {
      const it = slot && ITEMS[me.equip[slot]];
      slots += '<i class="es' + (it ? ' has' : '') + '" style="left:' + x + 'px;top:' + y + 'px"' + (it ? ' data-slot="' + slot + '" title="' + esc(it.name) + '（点一下卸下）"' : ' title="' + nm + '"') + '>' + (it ? it.icon : '') + '</i>';
    }
    $('win-char').querySelector('.body').innerHTML = '<div class="tabs"><span class="on">角色</span><span>翅膀</span></div><div class="pane cp"><div class="cp-l">' +
      '<div class="g1">' + L('名称', esc(me.name)) + L('称号', '无', 'o') + L('等级', me.level) + L('国家', me.nationName || '无', me.nation ? '' : 'o') + L('职业', me.clsName) + L('公会', '无', 'o') + L('荣誉', 0) + L('PK值', 0, 'red') + '</div>' +
      '<div class="g2">' + L('生命', me.hp + '/' + me.maxHp) + L('魔力', me.mp + '/' + me.maxMp) + L('经验', Math.floor(me.exp / me.need * 100) + '%') + '</div>' +
      '<div class="g3">' + L('物攻', nv(me.patk)) + L('魔攻', nv(me.matk)) + L('物防', nv(me.pdef)) + L('魔防', nv(me.mdef)) + L('命中', pc(me.hit)) + L('回避', pc(me.dodge)) + L('物理暴击', pc(me.crit)) + L('魔法暴击', pc(me.mcrit)) + '</div>' +
      '<div class="g4">' + ['灼烧', '寒冰', '混乱', '眩晕', '致盲', '中毒', '沉默', '虚弱'].map(k => L(k + '抗性', 0)).join('') + '</div>' +
      '</div><div class="cp-r"><div class="doll">' + slots + '<canvas id="cdoll" width="300" height="480" style="width:100px;height:160px"></canvas></div><div class="g5">' +
      P('str', '力量', A.str) + P('agi', '敏捷', A.agi) + P('vit', '体质', A.vit) + P('int', '智力', A.int) + P('spi', '精神', A.spi) + '</div><div class="g6">' + L('配点', me.pts) + '</div></div></div>';
    for (const e of $('win-char').querySelectorAll('.plus')) e.onclick = () => send({ t: 'addpt', a: e.dataset.a });
    for (const e of $('win-char').querySelectorAll('[data-slot]')) e.onclick = () => send({ t: 'unequip', slot: e.dataset.slot });
    const dm = img('char/doll-m-l1.png'), paintDoll = () => { // 面板里是正面站着的大图
      const cvd = $('cdoll'); if (!cvd) return; const g2 = cvd.getContext('2d', { willReadFrequently: true }), w = dm.width, h = dm.height, x0 = Math.round(150 - w / 2);
      g2.clearRect(0, 0, 300, 480); g2.drawImage(dm, x0, 470 - h);
      const hue = hueOf(me.sex, me.look, me.color); if (hue != null) { const d = g2.getImageData(0, 0, 300, 470 - h + Math.round(h * 0.42)); rehue(d.data, hue, true); g2.putImageData(d, 0, 0); }
    };
    if (ready(dm)) paintDoll(); else dm.addEventListener('load', paintDoll, { once: true });
  },
  bag() {
    // 背包窗口：照原作“我的背包”——一排页签、6×6 格、三行钱、底下一排按钮
    const B = $('win-bag').querySelector('.body');
    B.innerHTML = '<div class="tabs"><span class="on">背包1</span><span>背包2</span><span>VIP包</span><span>租用包</span><span>至尊宝库</span></div><div class="pane"><div class="grid"></div>' +
      '<div class="mrow"><b>金币:</b><span class="money"></span></div><div class="mrow"><b>绑定金币:</b><span><i class="c g"></i>0<i class="c s"></i>0<i class="c b"></i>0</span></div><div class="mrow"><b>紫晶:</b><span><i class="c p"></i>0</span></div>' +
      '<div class="brow"><button class="btn" disabled>拆分</button><button class="btn" disabled>销毁</button><button class="btn" disabled>摆摊</button><button class="btn" disabled>整理</button></div></div><div class="tip"></div>';
    const keys = Object.keys(me.bag);
    for (let i = 0; i < 36; i++) {
      const e = document.createElement('div'); e.className = 'slot'; const k = keys[i], it = ITEMS[k];
      if (it) { e.innerHTML = it.icon + '<span class="n">' + me.bag[k] + '</span>'; e.title = it.name + '：' + (it.desc || ''); e.onclick = () => send({ t: 'use', item: k }); e.onmouseenter = () => { B.querySelector('.tip').textContent = it.name + '：' + (it.desc || '') + '（点一下使用或穿上）'; }; } else e.classList.add('empty');
      B.querySelector('.grid').appendChild(e);
    }
    const cu = me.copper; B.querySelector('.money').innerHTML = '<i class="c g"></i>' + Math.floor(cu / 10000) + '<i class="c s"></i>' + Math.floor(cu / 100) % 100 + '<i class="c b"></i>' + cu % 100;
  },
  quest() {
    const q = me.quest;
    $('win-quest').querySelector('.body').innerHTML = q ? '<div class="sec">' + esc(q.title) + '</div><div class="q-desc">' + esc(q.desc) + '</div><div class="sec">目标</div><div class="q-desc" style="color:#8dff7a">' + esc(q.line) + '</div><p><button class="btn" id="qgo">自动前往</button></p>' : '<div class="q-desc">遗迹之岛的新手任务已全部完成。</div>';
    if (q) $('qgo').onclick = () => { goQuest(); closeWin('quest'); };
  },
  look() {
    // 更换形象：性别、发型、发色、职业；最下面能回去换角色
    if (!lk) lk = { sex: me.sex || 'm', look: me.look | 0, color: me.color | 0, cls: me.cls };
    const row = (t, h) => '<div class="lkrow"><b>' + t + '</b>' + h + '</div>';
    $('win-look').querySelector('.body').innerHTML =
      row('性别', [['m', '男'], ['f', '女']].map(x => '<button class="opt' + (lk.sex === x[0] ? ' on' : '') + '" data-k="sex" data-v="' + x[0] + '">' + x[1] + '</button>').join('')) +
      row('发型', [0, 1, 2, 3].map(i => '<canvas class="lkf' + (lk.look === i ? ' on' : '') + '" width="116" height="116" data-k="look" data-v="' + i + '" title="' + LOOK_NAME[lk.sex][i] + '"></canvas>').join('')) +
      row('发色', HUES.map((h, i) => '<i class="sw' + (lk.color === i ? ' on' : '') + '" style="background:' + HUE_CSS[i] + '" data-k="color" data-v="' + i + '">' + (i ? '' : '原') + '</i>').join('')) +
      row('职业', CLASS_LIST.map(c => '<button class="opt' + (lk.cls === c[0] ? ' on' : '') + '" data-k="cls" data-v="' + c[0] + '">' + c[1] + '</button>').join('')) +
      '<div class="lknote">当前：' + LOOK_NAME[lk.sex][lk.look] + ' · ' + CLS_NAME[lk.cls] + '。换职业会把本职业武器换成新职业的同档武器。</div>' +
      '<div class="lkbtns"><button class="btn" id="lk-ok">确定</button><button class="btn" id="lk-chars">切换角色</button></div>';
    for (const e of $('win-look').querySelectorAll('[data-k]')) {
      if (e.dataset.k === 'look') paintFace(e, lk.sex, +e.dataset.v, lk.color);
      e.onclick = () => { const k = e.dataset.k, v = e.dataset.v; lk[k] = k === 'look' || k === 'color' ? +v : v; RENDER.look(); };
    }
    $('lk-ok').onclick = () => { send({ t: 'look', sex: lk.sex, look: lk.look, color: lk.color, cls: lk.cls }); lk = null; closeWin('look'); };
    $('lk-chars').onclick = () => { lk = null; send({ t: 'leave' }); };
  },
  map() {
    // 大地图：铺满全屏，上面标 NPC、怪区、传送点
    const pc = (x, y) => 'left:' + (x / MAPI.w * 100) + '%;top:' + (y / MAPI.h * 100) + '%';
    $('wmarks').innerHTML =
      MAPI.zones.map(z => '<span class="wz" style="' + pc(z.x, z.y) + '">' + z.name + '（' + z.level + '级）</span>').join('') +
      MAPI.npcs.map(n => '<span class="wn" style="' + pc(n.x, n.y) + '"><i></i>' + n.name + '</span>').join('') +
      '<span class="wp" style="' + pc(MAPI.portal[0], MAPI.portal[1]) + '">传送点：通往沐光平原</span>';
  },
};
function pairWin() {
  const o = w => !$('win-' + w).classList.contains('hidden'), both = o('char') && o('bag'), a = $('win-char'), b = $('win-bag');
  document.body.classList.toggle('pair', both);
  a.style.height = b.style.height = ''; // 两个都开着时，量一下谁高，把两个撑成一样高
  if (both) { const h = Math.max(a.offsetHeight, b.offsetHeight) + 'px'; a.style.height = b.style.height = h; }
}
function toggleWin(w) {
  const e = $('win-' + w), hid = e.classList.toggle('hidden');
  if (!hid) { RENDER[w](); if (w === 'bag' && $('win-char').classList.contains('hidden')) { $('win-char').classList.remove('hidden'); RENDER.char(); } }
  pairWin();
}
function closeWin(w) { $('win-' + w).classList.add('hidden'); pairWin(); }
for (const b of document.querySelectorAll('#menu button')) b.onclick = () => toggleWin(b.dataset.win);
for (const x of document.querySelectorAll('.win .x')) x.onclick = () => x.closest('.win').classList.add('hidden');
$('revive').onclick = () => send({ t: 'revive' });
$('arriveok').onclick = () => $('arrive').classList.add('hidden');
$('mm').onclick = () => toggleWin('map');
// —— 背景音乐：遗迹之岛（原作配乐）。浏览器规定要你先点一下页面才许出声，所以第一次点击时才开始放 ——
const BGM = new Audio('assets/bgm/island.mp3'); BGM.loop = true; BGM.volume = 0.35;
let bgmOn = localStorage.mjBgm !== '0';
function bgmSync() { $('bgmbtn').classList.toggle('off', !bgmOn); if (me && bgmOn) BGM.play().catch(() => { }); else BGM.pause(); }
$('bgmbtn').onclick = e => { e.stopPropagation(); bgmOn = !bgmOn; localStorage.mjBgm = bgmOn ? '1' : '0'; bgmSync(); };
addEventListener('pointerdown', bgmSync); addEventListener('keydown', bgmSync); setInterval(() => { if (!me) BGM.pause(); }, 1000);
$('portrait').onclick = () => { lk = null; toggleWin('look'); };
function showDialog(d) {
  $('dname').textContent = d.name;
  let h = (d.title ? '<div class="qt">【' + esc(d.title) + '】</div>' : '') + '<div class="text">' + esc(d.text) + '</div>' + (d.reward ? '<div class="rw">奖励：' + esc(d.reward) + '</div>' : '');
  for (const b of d.btns) h += '<button class="btn" data-a="' + b.a + '">' + b.label + '</button>';
  if (d.shop) { h += '<div class="sec">商店</div>'; for (const s of d.shop) h += '<div class="shoprow"><span style="font-size:22px">' + s.icon + '</span><span class="nm">' + esc(s.name) + '<br><small style="color:#bcd3ff">' + esc(s.desc || '') + '</small></span><span class="pr">' + money(s.price) + '</span><button class="btn" data-buy="' + s.id + '" data-n="1">买1</button><button class="btn" data-buy="' + s.id + '" data-n="10">买10</button></div>'; }
  const B = $('win-dialog').querySelector('.body'); B.innerHTML = h;
  for (const b of B.querySelectorAll('[data-a]')) b.onclick = () => send({ t: 'quest', a: b.dataset.a, npc: d.npc });
  for (const b of B.querySelectorAll('[data-buy]')) b.onclick = () => send({ t: 'buy', npc: d.npc, item: b.dataset.buy, n: +b.dataset.n });
  $('win-dialog').classList.remove('hidden');
}

// ---------- 鼠标键盘 ----------
const NPC_H = 90;
function pick(wx, wy) {
  let best = null;
  for (const m of mons.values()) if (m.alive) { const h = monH(m); if (Math.abs(wx - m.rx) < Math.max(22, h * 0.4) && wy < m.ry + 10 && wy > m.ry - h) if (!best || m.ry > best.o.ry) best = { k: 'mon', o: m }; }
  if (best) return best;
  for (const n of MAPI.npcs) if (Math.abs(wx - n.x) < 32 && wy < n.y + 10 && wy > n.y - NPC_H) return { k: 'npc', o: n };
  return null;
}
const monH = m => ({ m_001: 100, m_002: 72, m_003: 62, m_004: 100 }[m.type] || 80);
cv.onmousemove = e => { mouse.x = e.clientX; mouse.y = e.clientY; };
cv.onmousedown = e => {
  if (!me || e.button !== 0) return;
  $('chatin').blur();
  const wx = e.clientX + cam.x, wy = e.clientY + cam.y, h = pick(wx, wy);
  if (h && h.k === 'mon') send({ t: 'attack', id: h.o.id });
  else if (h) send({ t: 'npc', id: h.o.id });
  else { send({ t: 'move', x: wx, y: wy }); clickMark = { x: wx, y: wy, t: 0 }; closeWin('dialog'); }
};
cv.oncontextmenu = e => e.preventDefault();
addEventListener('keydown', e => {
  if (!me) return;
  const inChat = document.activeElement === $('chatin');
  if (e.key === 'Enter') { if (inChat) { const s = $('chatin').value.trim(); if (s) send({ t: 'chat', s }); $('chatin').value = ''; $('chatin').blur(); } else $('chatin').focus(); return; }
  if (inChat) { if (e.key === 'Escape') $('chatin').blur(); return; }
  const k = e.key.toLowerCase();
  if (k === 'tab') { e.preventDefault(); send({ t: 'tab' }); }
  else if (k === '1') send({ t: 'skill' });
  else if (k === '2') send({ t: 'use', item: 'hp_potion' });
  else if (k === '3') send({ t: 'use', item: 'mp_potion' });
  else if (k === 'c') toggleWin('char'); else if (k === 'b') toggleWin('bag'); else if (k === 'q') toggleWin('quest'); else if (k === 'm') toggleWin('map');
  else if (k === 'escape') for (const w of document.querySelectorAll('.win')) w.classList.add('hidden');
});

// ---------- 画面 ----------
let DPR = 1;
function resize() { DPR = Math.max(1, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * DPR); cv.height = Math.round(innerHeight * DPR); }
addEventListener('resize', resize); resize();
function outline(s, x, y, col, size, bold) {
  g.font = (bold ? 'bold ' : '') + (size || 13) + 'px "Microsoft YaHei",sans-serif'; g.textAlign = 'center';
  x = Math.round(x); y = Math.round(y); g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y);
}
function shadow(x, y, r) { g.fillStyle = '#0005'; g.beginPath(); g.ellipse(x, y, r, r * 0.42, 0, 0, 6.283); g.fill(); }
function hpBar(x, y, w, f) { g.fillStyle = '#000a'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, 7); g.fillStyle = '#e02a1c'; g.fillRect(x - w / 2, y, w * Math.max(0, f), 5); }
function drawPlayer(p, dt) {
  const x = p.rx - cam.x, y = p.ry - cam.y;
  shadow(x, y, 20);
  const B = CH && CH.bodies[BODY], raw = img('char/' + BODY + '.png');
  if (B && ready(raw)) {
    const bi = bodyImg(hueOf(p.sex, p.look, p.color)), sfx = ATK_SFX[p.loadout] || '';
    let fr = 'idle';
    if (p.dead) p.deadT += dt;
    else if (p.atkT > 0) fr = p.atkT > 0.38 ? 'atkUp' + sfx : p.atkT > 0.08 ? 'atkDown' + sfx : 'idle';
    else if (p.moving) fr = ['walkA', 'idle', 'walkB', 'idle'][Math.floor(tNow * 4.5) % 4]; // 人物动作故意做成低帧率，保留老游戏的味道
    if (B.frames.includes(fr + '_' + p.loadout)) fr += '_' + p.loadout; // 手里有武器就换成“拿着武器”的那套站和走（先只画了法杖）
    const col = DIR_COL[p.dir], row = B.frames.indexOf(fr), c = B.cell;
    g.save(); g.translate(x, y);
    if (p.dead) { const k = Math.min(1, p.deadT / 0.35); g.translate(0, -8 * k); g.rotate(-1.45 * k); g.globalAlpha = 0.85; }
    g.scale(DIR_FLIP[p.dir] ? -PS : PS, PS);
    g.drawImage(bi, col * c, row * c, c, c, -B.foot[0], -B.foot[1], c, c);
    g.restore();
  } else { g.fillStyle = '#e88'; g.fillRect(x - 12, y - 90, 24, 90); }
  if (p.lvlT > 0) { g.strokeStyle = 'rgba(255,225,0,' + p.lvlT / 1.6 + ')'; g.lineWidth = 4; g.beginPath(); g.ellipse(x, y, 24 + (1.6 - p.lvlT) * 60, (24 + (1.6 - p.lvlT) * 60) * .42, 0, 0, 6.283); g.stroke(); }
  outline(p.name, x, y - 118, '#fff', 12, true);
  if (p.id !== myId) hpBar(x, y - 113, 44, p.hp / p.maxHp);
  if (p.sayT > 0) {
    g.font = '13px "Microsoft YaHei",sans-serif'; const w = Math.min(220, g.measureText(p.say).width) + 16;
    g.fillStyle = '#fffd'; g.beginPath(); g.roundRect(x - w / 2, y - 160, w, 24, 8); g.fill(); g.fillStyle = '#222'; g.textAlign = 'center'; g.fillText(p.say, x, y - 143, 220);
  }
}
function drawMon(m) {
  const x = m.rx - cam.x, im = img('mon/' + m.type + '.png'), h = monH(m);
  let y = m.ry - cam.y, a = m.alive ? 1 : m.fade / 0.6;
  if (a <= 0) return;
  const sel = me.target === m.id;
  if (sel) { g.strokeStyle = '#ff3b2b'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, h * 0.36, h * 0.15, 0, 0, 6.283); g.stroke(); }
  shadow(x, y, h * 0.28);
  g.save(); g.globalAlpha = a;
  const walking = m.alive && tNow - (m.mv || -9) < 0.3, step = walking && Math.floor(tNow * 5 + m.id) % 2, bob = step ? -5 : 0, lg = m.lunge > 0 ? Math.sin(m.lunge / 0.25 * Math.PI) * 14 * m.face : 0;
  if (ready(im)) {
    const S = h * 200 / 170;   // 图集一格 200，怪身最高 170，脚底在 190
    g.translate(x + lg, y + bob); g.scale(-m.face, 1);
    if (!m.alive) g.rotate((1 - a) * 1.2);
    if (m.flash > 0) g.filter = 'brightness(2.2)';
    g.drawImage(im, ((m.back ? 2 : 0) + (step ? 1 : 0)) * 200, 0, 200, 200, -S / 2, -S * 0.95, S, S);
  } else { g.fillStyle = '#c55'; g.fillRect(x - 20, y - h, 40, h); }
  g.restore();
  if (m.alive) { outline(m.name, x, y - h - 8, sel ? '#ff8a7a' : hover === m ? '#fff' : '#9dff8a', 12); if (sel || m.hp < m.maxHp) hpBar(x, y - h - 4, 44, m.hp / m.maxHp); }
}
function drawNpc(n) {
  const x = n.x - cam.x, y = n.y - cam.y, im = img('npc/' + n.id + '.png');
  shadow(x, y, 20);
  if (ready(im)) { const h = NPC_H, w = im.width * h / im.height; g.drawImage(im, x - w / 2, y - h, w, h); }
  outline(n.name, x, y - NPC_H - 8, '#ffe27a', 12, true);
  const q = me.quest;
  if (q && q.npc === n.id && (q.s === 0 || q.s === 2)) outline(q.s === 0 ? '!' : '?', x, y - NPC_H - 24 + Math.sin(tNow * 4) * 4, '#ffd800', 30, true);
}
// ---------- 场景：整张地图是照原作世界地图重画的一张大图，直接铺在脚下 ----------
const MAPIMG = img('map/island.webp'), MINIIMG = img('map/island-mini.jpg');
const MZ = +((/[?&]mz=([\d.]+)/.exec(location.search) || [])[1] || 0);
function drawGround(W, H) {
  g.fillStyle = '#0a3f96'; g.fillRect(0, 0, W, H); // 图外面补一圈深海色
  if (MZ && ready(MAPIMG)) { // 临时试看：?mz=倍数 只把地图放大（人不变），?px=1 关掉柔化
    g.save(); g.imageSmoothingEnabled = !/[?&]px=1/.test(location.search); g.translate(W / 2, H / 2); g.scale(MZ, MZ); const AT = (/[?&]at=(\d+),(\d+)/.exec(location.search) || []); if (AT[1]) g.translate(-AT[1], -AT[2]); else g.translate(-cam.x - W / 2, -cam.y - H / 2);
    g.drawImage(MAPIMG, 0, 0, MAPI.w, MAPI.h); g.restore(); return;
  }
  if (ready(MAPIMG)) {
    const k = MAPIMG.width / MAPI.w; // 图上 1 像素 = 游戏里 1/k 步
    const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y), ex = Math.min(MAPI.w, cam.x + W), ey = Math.min(MAPI.h, cam.y + H);
    if (ex > sx && ey > sy) g.drawImage(MAPIMG, sx * k, sy * k, (ex - sx) * k, (ey - sy) * k, sx - cam.x, sy - cam.y, ex - sx, ey - sy);
  }
  // 传送点：码头上的金色光圈
  const px = MAPI.portal[0] - cam.x, py = MAPI.portal[1] - cam.y, r = 70 + Math.sin(tNow * 3) * 5;
  g.strokeStyle = 'rgba(255,238,60,.9)'; g.lineWidth = 6; g.beginPath(); g.ellipse(px, py, r, r * .45, 0, 0, 6.283); g.stroke();
  g.strokeStyle = 'rgba(255,250,170,.7)'; g.lineWidth = 3; g.beginPath(); g.ellipse(px, py, r * .55, r * .25, 0, 0, 6.283); g.stroke();
  outline('传送点：通往沐光平原', px, py - 60, '#ffb347', 14, true);
}
function frame(ts) {
  requestAnimationFrame(frame);
  const t = ts / 1000, dt = Math.min(0.1, t - tNow); tNow = t;
  const W = cv.width / DPR, H = cv.height / DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!me || !MAPI) return;
  const k = Math.min(1, dt * 12);
  for (const p of players.values()) {
    const dx = p.x - p.rx, dy = p.y - p.ry;
    if (Math.hypot(dx, dy) > 400) { p.rx = p.x; p.ry = p.y; } else { if (p.moving && Math.hypot(dx, dy) > 3 && !(p.atkT > 0)) p.dir = dirOf(dx, dy); p.rx += dx * k; p.ry += dy * k; }
    if (p.atkT > 0) p.atkT -= dt; if (p.lvlT > 0) p.lvlT -= dt; if (p.sayT > 0) p.sayT -= dt;
  }
  for (const m of mons.values()) {
    if (m.alive) { m.rx += (m.x - m.rx) * k; m.ry += (m.y - m.ry) * k; } else if (m.fade > 0) m.fade -= dt;
    if (m.flash > 0) m.flash -= dt; if (m.lunge > 0) m.lunge -= dt;
  }
  const my = players.get(myId); if (!my) return;
  cam.x = Math.round(my.rx - W / 2); cam.y = Math.round(my.ry - H / 2); // 玩家恒居画面正中
  drawGround(W, H);
  if (dbg) {
    g.fillStyle = 'rgba(255,0,0,.28)'; const cs = dbg.cs;
    for (let gy = Math.max(0, Math.floor(cam.y / cs)); gy < Math.min(dbg.gh, (cam.y + H) / cs); gy++) for (let gx = Math.max(0, Math.floor(cam.x / cs)); gx < Math.min(dbg.gw, (cam.x + W) / cs); gx++) if (!dbg.a[gy * dbg.gw + gx]) g.fillRect(gx * cs - cam.x, gy * cs - cam.y, cs - 1, cs - 1);
  }
  // 传送点
  if (clickMark) { clickMark.t += dt; const a = 1 - clickMark.t / 0.5; if (a <= 0) clickMark = null; else { g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = 2; g.beginPath(); g.ellipse(clickMark.x - cam.x, clickMark.y - cam.y, 8 + clickMark.t * 50, (8 + clickMark.t * 50) * .42, 0, 0, 6.283); g.stroke(); } }
  // 鼠标悬停
  const h = pick(mouse.x + cam.x, mouse.y + cam.y); hover = h ? h.o : null; cv.style.cursor = h ? 'pointer' : 'default';
  // 按“谁站得靠下谁后画”排序
  // 按“谁站得靠下谁后画”排序
  const list = [];
  if (!MZ) for (const n of MAPI.npcs) list.push([n.y, 0, n]);
  for (const m of mons.values()) if (m.alive || m.fade > 0) list.push([m.ry, 1, m]);
  for (const p of players.values()) list.push([p.ry, 2, p]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [y, kind, o] of list) {
    if (y - cam.y < -80 || y - cam.y > H + 200) continue;
    kind === 0 ? drawNpc(o) : kind === 1 ? drawMon(o) : drawPlayer(o, dt);
  }
  // 远程弹道
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.t += dt; const f = Math.min(1, s.t / s.d), x = s.x0 + (s.to.rx - s.x0) * f - cam.x, y = s.y0 + (s.to.ry - 50 - s.y0) * f - cam.y;
    g.fillStyle = s.col; g.shadowColor = s.col; g.shadowBlur = 12; g.beginPath(); g.arc(x, y, 6, 0, 6.283); g.fill(); g.shadowBlur = 0;
    if (f >= 1) { s.land(); shots.splice(i, 1); }
  }
  // 伤害飘字
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; if (f.t > 1) { floats.splice(i, 1); continue; }
    g.globalAlpha = f.t < .7 ? 1 : (1 - f.t) / .3; outline(f.s, f.x - cam.x, f.y - cam.y - f.t * 50, f.col, f.big ? 26 : 19, true); g.globalAlpha = 1;
  }
  // 目标框
  const tg = me.target && mons.get(me.target);
  $('targetbox').classList.toggle('hidden', !tg);
  if (tg) { drawTFace(tg); $('tname').textContent = tg.name; $('tlevel').textContent = tg.level; $('thpbar').style.width = Math.max(0, tg.hp / tg.maxHp * 100) + '%'; $('thptext').textContent = tg.hp + ' / ' + tg.maxHp; }
  const cd = $('skcd'); if (cd) cd.style.height = Math.max(0, (skillReadyAt - tNow) / SKILL.cd * 100) + '%';
  drawMini(my); drawFace(my);
  if (!$('win-map').classList.contains('hidden')) { $('wme').style.left = my.rx / MAPI.w * 100 + '%'; $('wme').style.top = my.ry / MAPI.h * 100 + '%'; }
}
const mmc = $('mm').getContext('2d');
function drawMini(my) {
  const S = 170, z = 0.155, c = mmc; // 小地图：1 像素 ≈ 6.5 步（数字越大看得越近）
  c.fillStyle = '#0a3f96'; c.fillRect(0, 0, S, S);
  if (ready(MAPIMG)) c.drawImage(MAPIMG, S / 2 - my.rx * z, S / 2 - my.ry * z, MAPI.w * z, MAPI.h * z);
  const dot = (x, y, col, r) => { const px = (x - my.rx) * z + S / 2, py = (y - my.ry) * z + S / 2; if (px < 0 || py < 0 || px > S || py > S) return; c.fillStyle = col; c.beginPath(); c.arc(px, py, r, 0, 6.283); c.fill(); };
  for (const m of mons.values()) if (m.alive) dot(m.rx, m.ry, '#ff4a3a', 2);
  for (const n of MAPI.npcs) dot(n.x, n.y, '#ffe100', 3);
  dot(MAPI.portal[0], MAPI.portal[1], '#c77dff', 4);
  for (const p of players.values()) if (p.id !== myId) dot(p.rx, p.ry, '#5aa8ff', 3);
  c.strokeStyle = '#000'; c.lineWidth = 1; dot(my.rx, my.ry, '#fff', 4); c.stroke();
  $('mmcoord').textContent = Math.round(my.rx / 74.98) + ' , ' + Math.round(my.ry / 37.48);
}
let tfaceOf = '';
function drawTFace(m) {
  const im = img('mon/' + m.type + '.png'); if (tfaceOf === m.type || !ready(im)) return; tfaceOf = m.type;
  const c = $('tface').getContext('2d'); c.clearRect(0, 0, 52, 52); c.drawImage(im, 30, 20, 140, 140, 2, 2, 48, 48);
}
for (const b of document.querySelectorAll('#hud [data-todo]')) b.onclick = () => logLine('“' + b.dataset.todo + '”还没做，先放个位置');
$('mmbtn').onclick = () => toggleWin('map');
// —— 染发：只改“色相”（红橙黄绿…那一圈上的位置），明暗不动，所以头发的光影还在 ——
// hairOnly=true 用在小人身上：只染头附近、原本是鲜橙色的点，免得把皮肤和木头武器染了
function rehue(d, hue, hairOnly) {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), c = mx - Math.min(r, gg, b);
    if (mx < 0.16 || c === 0) continue;
    const s = c / mx; let h = (mx === r ? ((gg - b) / c + 6) % 6 : mx === gg ? (b - r) / c + 2 : (r - gg) / c + 4) * 60;
    const skinHue = h > 10 && h < 50;
    if (hairOnly ? !((h < 48 || h > 345) && s >= 0.62) : !(s >= 0.62 || (s >= 0.3 && !skinHue))) continue;
    const C = mx * s, hh = hue / 60, x = C * (1 - Math.abs(hh % 2 - 1)), m = mx - C, k = Math.floor(hh) % 6;
    const q = [[C, x, 0], [x, C, 0], [0, C, x], [0, x, C], [x, 0, C], [C, 0, x]][k];
    d[i] = (q[0] + m) * 255; d[i + 1] = (q[1] + m) * 255; d[i + 2] = (q[2] + m) * 255;
  }
}
const tintCache = {};
function bodyImg(hue) {
  const bi = img('char/' + BODY + '.png');
  if (hue == null) return bi;
  let c = tintCache[hue]; if (c) return c;
  const B = CH.bodies[BODY]; c = tintCache[hue] = document.createElement('canvas'); c.width = bi.naturalWidth; c.height = bi.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bi, 0, 0);
  B.frames.forEach((f, r) => B.head[f].forEach((h, col) => {
    const x0 = Math.max(0, Math.round(col * B.cell + h[0] - 80)), y0 = Math.max(0, Math.round(r * B.cell + h[1] - 105));
    const d = x.getImageData(x0, y0, 160, 170); rehue(d.data, hue, true); x.putImageData(d, x0, y0);
  }));
  return c;
}
let lk = null, faceKey = '';
function paintFace(cv, sex, look, color) {
  const im = img('face/' + (sex || 'm') + (look | 0) + '.png');
  if (!ready(im)) { im.addEventListener('load', () => paintFace(cv, sex, look, color), { once: true }); return false; }
  const c = cv.getContext('2d', { willReadFrequently: true }), S = cv.width; c.clearRect(0, 0, S, S); c.drawImage(im, S * 0.04, S * 0.08, S * 0.92, S * 0.92);
  if (color) { const d = c.getImageData(0, 0, S, S); rehue(d.data, HUES[color], false); c.putImageData(d, 0, 0); }
  return true;
}
function drawFace() {
  if (!me) return;
  const k = me.sex + me.look + '/' + me.color; if (k === faceKey) return;
  const cv = $('pface'); if (cv.width !== 172) cv.width = cv.height = 172;
  if (paintFace(cv, me.sex, me.look, me.color)) faceKey = k;
}
if (AUTO) { const a = decodeURIComponent(AUTO).split(','); connect({ t: 'login', name: a[0], cls: a[2] || 'warrior', debug: DEBUG }); }
requestAnimationFrame(frame);

$('chatclear').onclick = () => { $('chatlog').innerHTML = ''; };
