'use strict';
// 魔镜Online 重制版 —— 服务器（“裁判 + 档案室”）
// 零依赖：只用 Node 自带模块。运行：node web/server/server.js [端口]
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const { ITEMS, WEAPON_OF, QUESTS, IDLE, SHOP } = require('./content');

const PORT = +process.argv[2] || 8080;
const CLIENT = path.join(__dirname, '..', 'client');
const SAVE_DIR = process.env.MJ_SAVES || path.join(__dirname, '..', 'saves');
const SAVE_FILE = path.join(SAVE_DIR, 'accounts.json');
const readJ = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
const MAP = readJ('island.json'), CLASSES = {}, RULES = readJ('combat-rules.json'), F = readJ('attributes.json').formulas;
for (const c of readJ('classes.json').classes) CLASSES[c.id] = c;
const AI = RULES.monster_ai, REST = RULES.rest, RANGE = RULES.class_attack_range, MS = RULES.monster_stats;
const PLAYER_SPEED = 180, ATK_INTERVAL = 1.2, RESPAWN = 12, PER_ZONE = 7, NPC_REACH = 120, MON_REACH = 54;
const SKILL = { mp: 8, cd: 4, mult: 2.0 }; // 技能格01（暂定，无图证）

// ---------- 地面网格与寻路 ----------
const CS = MAP.cell, GW = Math.ceil(MAP.w / CS), GH = Math.ceil(MAP.h / CS);
function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const grid = new Uint8Array(GW * GH);
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  const x = gx * CS + CS / 2, y = gy * CS + CS / 2;
  let ok = inPoly(x, y, MAP.land) || inPoly(x, y, MAP.pier);
  if (ok) for (const o of MAP.obstacles) if (Math.hypot(x - o.x, y - o.y) < o.r + 10) { ok = false; break; }
  if (ok) for (const r of MAP.rects) if (x > r[0] - 10 && x < r[2] + 10 && y > r[1] - 10 && y < r[3] + 10) { ok = false; break; }
  grid[gy * GW + gx] = ok ? 1 : 0;
}
const cellOk = (gx, gy) => gx >= 0 && gy >= 0 && gx < GW && gy < GH && grid[gy * GW + gx] === 1;
const walkable = (x, y) => cellOk(Math.floor(x / CS), Math.floor(y / CS));
function nearestCell(gx, gy) {
  if (cellOk(gx, gy)) return [gx, gy];
  for (let r = 1; r < 60; r++) {
    let best = null, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (cellOk(gx + dx, gy + dy)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [gx + dx, gy + dy]; } }
    }
    if (best) return best;
  }
  return null;
}
function los(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 10);
  for (let i = 1; i <= n; i++) if (!walkable(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
  return true;
}
function findPath(x0, y0, x1, y1) {
  const s = nearestCell(Math.floor(x0 / CS), Math.floor(y0 / CS)), e = nearestCell(Math.floor(x1 / CS), Math.floor(y1 / CS));
  if (!s || !e) return [];
  const end = walkable(x1, y1) ? [x1, y1] : [e[0] * CS + CS / 2, e[1] * CS + CS / 2];
  if (walkable(x0, y0) && los(x0, y0, end[0], end[1])) return [end];
  const N = GW * GH, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const si = s[1] * GW + s[0], ei = e[1] * GW + e[0];
  const heap = []; // 小顶堆：[f, idx]
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let k = 0; for (;;) { let a = 2 * k + 1, b = a + 1, m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return t; };
  const hh = i => { const dx = Math.abs(i % GW - e[0]), dy = Math.abs(((i / GW) | 0) - e[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  g[si] = 0; push(hh(si), si);
  let found = false;
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue; closed[i] = 1;
    if (i === ei) { found = true; break; }
    const cx = i % GW, cy = (i / GW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!cellOk(nx, ny)) continue;
      if (dx && dy && (!cellOk(cx + dx, cy) || !cellOk(cx, cy + dy))) continue;
      const ni = ny * GW + nx, ng = g[i] + (dx && dy ? 1.414 : 1);
      if (ng < g[ni]) { g[ni] = ng; from[ni] = i; push(ng + hh(ni), ni); }
    }
  }
  if (!found) return [];
  let pts = [];
  for (let i = ei; i !== -1 && i !== si; i = from[i]) pts.push([(i % GW) * CS + CS / 2, ((i / GW) | 0) * CS + CS / 2]);
  pts.reverse(); pts[pts.length - 1] = end;
  // 拉直：能直线走到的中间拐点全部去掉
  const out = []; let cx = x0, cy = y0, k = 0;
  if (!walkable(x0, y0)) { out.push(pts[0]); [cx, cy] = pts[0]; k = 1; }
  while (k < pts.length) {
    let j = pts.length - 1;
    while (j > k && !los(cx, cy, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]); [cx, cy] = pts[j]; k = j + 1;
  }
  return out;
}

// ---------- 存档 ----------
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch (e) { }
// 老存档（一个名字一个角色、带密码）搬到新格式：一个账号下面挂几个角色
for (const k in accounts) { const a = accounts[k]; if (!a.chars) accounts[k] = { chars: a.char ? [Object.assign({ name: k, sex: 'm', look: 0, nation: null }, a.char)] : [] }; }
let dirty = false;
function saveAll() {
  for (const p of players.values()) accounts[p.acct].chars[p.ci] = packChar(p);
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  fs.writeFileSync(SAVE_FILE + '.tmp', JSON.stringify(accounts));
  fs.renameSync(SAVE_FILE + '.tmp', SAVE_FILE);
  dirty = false;
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const packChar = p => ({ name: p.name, sex: p.sex, look: p.look, color: p.color | 0, nation: p.nation, cls: p.cls, level: p.level, exp: p.exp, hp: p.hp, mp: p.mp, x: Math.round(p.x), y: Math.round(p.y), copper: p.copper, bag: p.bag, equip: p.equip, alloc: p.alloc, pts: p.pts, q: p.q, arrived: p.arrived });

// ---------- 世界状态 ----------
const players = new Map(); // id -> player
const monsters = new Map();
let nextId = 1, now = 0;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function spawnPoint(z) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random());
    const x = z.x + Math.cos(a) * r * z.rx, y = z.y + Math.sin(a) * r * z.ry;
    if (walkable(x, y)) return [x, y];
  }
  return [z.x, z.y];
}
for (const z of MAP.zones) for (let i = 0; i < PER_ZONE; i++) {
  const [x, y] = spawnPoint(z), L = z.level;
  const m = { id: nextId++, type: z.mon, name: z.name, level: L, exp: z.exp, zone: z, x, y, hx: x, hy: y,
    maxHp: Math.floor(MS.hp.base + MS.hp.per_level * L), atk: Math.floor(MS.atk.base + MS.atk.per_level * L), def: Math.floor(MS.def.per_level * L),
    state: 'idle', target: 0, nextAtk: 0, nextWander: rand(2, 8), wx: x, wy: y, deadAt: 0 };
  m.hp = m.maxHp; monsters.set(m.id, m);
}

function calc(p) {
  const c = CLASSES[p.cls], a = {};
  for (const k of ['str', 'agi', 'int', 'spi', 'vit']) a[k] = c.base_attributes[k] + Math.floor(c.growth_per_level[k] * (p.level - 1)) + (p.alloc[k] || 0);
  const w = ITEMS[p.equip.weapon], b = ITEMS[p.equip.body], L = p.level;
  p.attrs = a;
  p.maxHp = Math.floor(F.max_hp.base + F.max_hp.per_level * L + F.max_hp.per_vit * a.vit);
  p.maxMp = Math.floor(F.max_mp.base + F.max_mp.per_level * L + F.max_mp.per_spi * a.spi);
  p.patk = Math.floor(L + 2 * a.str) + (w ? w.atk : 0);
  p.matk = Math.floor(L + 2 * a.int) + (w ? w.atk : 0);
  p.pdef = Math.floor(0.5 * L + 0.8 * a.vit) + (b ? b.def : 0);
  p.pcrit = Math.min(F.phys_crit.cap, F.phys_crit.base + F.phys_crit.per_agi * a.agi);
  p.mcrit = Math.min(F.mag_crit.cap, F.mag_crit.base + F.mag_crit.per_spi * a.spi);
  p.hit = Math.min(F.hit.cap, F.hit.base + F.hit.per_agi * a.agi);
  p.dodge = Math.min(F.dodge.cap, F.dodge.base + F.dodge.per_agi * a.agi);
  p.range = RANGE[p.cls].range_px; p.magic = RANGE[p.cls].damage_type === 'magic';
  p.loadout = w ? w.loadout : 'unarmed';
  p.hp = Math.min(p.hp, p.maxHp); p.mp = Math.min(p.mp, p.maxMp);
}
function newChar(cls) {
  return { cls, level: 1, exp: 0, hp: 9999, mp: 9999, x: MAP.spawn[0], y: MAP.spawn[1], copper: 0, bag: {}, equip: {}, alloc: {}, pts: 0, q: { i: 0, s: 0, n: 0 }, arrived: false };
}

// ---------- 发消息 ----------
const send = (p, o) => p.ws.send(JSON.stringify(o));
const sys = (p, s) => send(p, { t: 'sys', s });
function broadcast(o) { const s = JSON.stringify(o); for (const p of players.values()) p.ws.send(s); }
function questView(p) {
  const q = QUESTS[p.q.i];
  if (!q) return null;
  const g = q.goal, v = { title: q.title, desc: q.desc, s: p.q.s };
  if (p.q.s === 0) { v.npc = q.giver; v.line = '找 ' + npcName(q.giver) + ' 接任务'; }
  else if (p.q.s === 2) { v.npc = q.turnin; v.line = '向 ' + npcName(q.turnin) + ' 交任务'; }
  else if (g.type === 'kill') { const z = MAP.zones.find(z => z.mon === g.mon); v.line = z.name + '  ' + p.q.n + ' / ' + g.count; v.pos = [z.x, z.y]; v.mon = g.mon; }
  else if (g.type === 'have') { v.line = ITEMS[g.item].name + '  ' + (p.bag[g.item] || 0) + ' / ' + g.count; v.npc = Object.keys(SHOP)[0]; }
  else if (g.type === 'portal') { v.line = '前往东北码头传送点（需 ' + MAP.portalLevel + ' 级）'; v.pos = MAP.portal; }
  return v;
}
const npcById = {}; for (const n of MAP.npcs) npcById[n.id] = n;
const npcName = id => npcById[id].name;
function sendSelf(p) {
  dirty = true;
  send(p, { t: 'self', me: { id: p.id, name: p.name, sex: p.sex, look: p.look | 0, color: p.color | 0, nation: p.nation, nationName: NATIONS[p.nation] || '无', cls: p.cls, clsName: CLASSES[p.cls].name, level: p.level, exp: p.exp, need: MAP.levels[p.level - 1],
    hp: Math.round(p.hp), maxHp: p.maxHp, mp: Math.round(p.mp), maxMp: p.maxMp, copper: p.copper, bag: p.bag, equip: p.equip, attrs: p.attrs, pts: p.pts,
    patk: p.patk, matk: p.matk, pdef: p.pdef, crit: p.magic ? p.mcrit : p.pcrit, hit: p.hit, dodge: p.dodge, magic: p.magic, range: p.range,
    dead: p.dead, quest: questView(p), skillCd: Math.max(0, p.skillAt - now), target: p.target } });
}

// ---------- 物品 / 任务 ----------
function resolveItems(p, o) {
  const r = {};
  for (const k in o || {}) r[k === '$weapon1' ? WEAPON_OF[p.cls] + '_1' : k === '$weapon2' ? WEAPON_OF[p.cls] + '_2' : k] = o[k];
  return r;
}
function addItems(p, o, quiet) {
  for (const [k, n] of Object.entries(resolveItems(p, o))) { p.bag[k] = (p.bag[k] || 0) + n; if (!quiet) sys(p, '获得 ' + ITEMS[k].name + ' ×' + n); }
  checkGoal(p);
}
function takeItems(p, o) { for (const k in o || {}) { p.bag[k] = (p.bag[k] || 0) - o[k]; if (p.bag[k] <= 0) delete p.bag[k]; } }
function checkGoal(p) {
  const q = QUESTS[p.q.i];
  if (!q || p.q.s !== 1) return;
  const g = q.goal;
  let ok = g.type === 'talk' || (g.type === 'kill' && p.q.n >= g.count) || (g.type === 'have' && (p.bag[g.item] || 0) >= g.count);
  if (ok) {
    p.q.s = 2;
    if (q.grant) addItems(p, q.grant);
    if (g.type !== 'talk') sys(p, '任务目标已完成：' + q.title);
  }
}
function gainExp(p, n) {
  p.exp += n; sys(p, '获得 ' + n + ' 经验');
  while (p.level < 150 && p.exp >= MAP.levels[p.level - 1]) {
    p.exp -= MAP.levels[p.level - 1]; p.level++; p.pts += 5; calc(p); p.hp = p.maxHp; p.mp = p.maxMp;
    broadcast({ t: 'fx', k: 'lvl', id: p.id, level: p.level, name: p.name });
  }
}
function moneyText(c) { const g = Math.floor(c / 10000), s = Math.floor(c / 100) % 100, k = c % 100; return (g ? g + '金' : '') + (s ? s + '银' : '') + k + '铜'; }
function dialogFor(p, id) {
  const q = QUESTS[p.q.i], d = { t: 'dialog', npc: id, name: npcName(id), text: IDLE[id] || '……', btns: [] };
  if (q) {
    if (p.q.s === 0 && q.giver === id) { d.text = q.offer; d.title = q.title; d.btns.push({ a: 'accept', label: '接受任务' }); }
    else if (p.q.s === 2 && q.turnin === id) { d.text = q.done; d.title = q.title; d.btns.push({ a: 'turnin', label: '完成任务' }); d.reward = rewardText(p, q); }
    else if (p.q.s === 1 && (q.giver === id || q.turnin === id)) { d.text = q.wait; d.title = q.title; }
  }
  if (SHOP[id]) d.shop = SHOP[id].map(k => ({ id: k, name: ITEMS[k].name, price: ITEMS[k].price, icon: ITEMS[k].icon, desc: ITEMS[k].desc }));
  return d;
}
function rewardText(p, q) {
  const a = [];
  if (q.exp) a.push('经验 ' + q.exp);
  if (q.copper) a.push(moneyText(q.copper));
  for (const [k, n] of Object.entries(resolveItems(p, q.items))) a.push(ITEMS[k].name + '×' + n);
  return a.join('，');
}
function nearNpc(p, id) { const n = npcById[id]; return n && dist(p, n) <= NPC_REACH + 30; }

// ---------- 处理玩家指令 ----------
const H = {
  move(p, m) {
    if (p.dead || !isFinite(m.x) || !isFinite(m.y)) return;
    p.target = 0; p.goNpc = null; p.path = findPath(p.x, p.y, +m.x, +m.y); sendSelf(p);
  },
  attack(p, m) { const mo = monsters.get(m.id); if (p.dead || !mo || mo.state === 'dead') return; p.target = mo.id; p.goNpc = null; p.repath = 0; sendSelf(p); },
  tab(p) {
    if (p.dead) return;
    let best = null, bd = 900;
    for (const mo of monsters.values()) if (mo.state !== 'dead' && mo.id !== p.target) { const d = dist(p, mo); if (d < bd) { bd = d; best = mo; } }
    if (best) H.attack(p, { id: best.id }); else sys(p, '附近没有怪物');
  },
  npc(p, m) {
    if (p.dead || !npcById[m.id]) return;
    p.target = 0; p.goNpc = m.id;
    if (nearNpc(p, m.id)) { p.path = []; p.goNpc = null; send(p, dialogFor(p, m.id)); }
    else { const n = npcById[m.id]; p.path = findPath(p.x, p.y, n.x, n.y + 70); }
  },
  quest(p, m) {
    const q = QUESTS[p.q.i];
    if (!q || !nearNpc(p, m.npc)) return;
    if (m.a === 'accept' && p.q.s === 0 && q.giver === m.npc) {
      p.q.s = 1; p.q.n = 0; sys(p, '接受任务：' + q.title);
      if (q.give) addItems(p, q.give);
      checkGoal(p);
      if (p.q.s === 2 && q.turnin === m.npc) { sendSelf(p); return send(p, dialogFor(p, m.npc)); }
    } else if (m.a === 'turnin' && p.q.s === 2 && q.turnin === m.npc) {
      takeItems(p, q.take); if (q.grant) takeItems(p, q.grant);
      sys(p, '完成任务：' + q.title);
      p.copper += q.copper || 0; if (q.copper) sys(p, '获得 ' + moneyText(q.copper));
      if (q.items) addItems(p, q.items);
      if (q.exp) gainExp(p, q.exp);
      p.q = { i: p.q.i + 1, s: 0, n: 0 };
      sendSelf(p);
      const nq = QUESTS[p.q.i];
      if (nq && nq.giver === m.npc) return send(p, dialogFor(p, m.npc));
    }
    sendSelf(p); send(p, { t: 'dialog', close: true });
  },
  buy(p, m) {
    const it = ITEMS[m.item], n = Math.max(1, Math.min(99, m.n | 0));
    if (!it || !SHOP[m.npc] || !SHOP[m.npc].includes(m.item) || !nearNpc(p, m.npc)) return;
    if (p.copper < it.price * n) return sys(p, '钱不够');
    p.copper -= it.price * n; addItems(p, { [m.item]: n }); sendSelf(p);
  },
  use(p, m) {
    const it = ITEMS[m.item];
    if (p.dead || !it || !p.bag[m.item]) return;
    if (it.slot) {
      if (it.cls && it.cls !== p.cls) return sys(p, '职业不符，无法装备');
      const old = p.equip[it.slot]; takeItems(p, { [m.item]: 1 }); p.equip[it.slot] = m.item;
      if (old) p.bag[old] = (p.bag[old] || 0) + 1;
      calc(p); sys(p, '装备了 ' + it.name);
    } else if (it.heal || it.mana) {
      if (now < p.potionAt) return;
      if (it.heal && p.hp >= p.maxHp) return sys(p, '生命已满');
      if (it.mana && p.mp >= p.maxMp) return sys(p, '法力已满');
      p.potionAt = now + 1; takeItems(p, { [m.item]: 1 });
      if (it.heal) { p.hp = Math.min(p.maxHp, p.hp + it.heal); broadcast({ t: 'fx', k: 'heal', id: p.id, v: it.heal }); }
      if (it.mana) p.mp = Math.min(p.maxMp, p.mp + it.mana);
    } else return;
    sendSelf(p);
  },
  unequip(p, m) { const k = p.equip[m.slot]; if (!k) return; delete p.equip[m.slot]; p.bag[k] = (p.bag[k] || 0) + 1; calc(p); sendSelf(p); },
  skill(p) {
    if (p.dead) return;
    const mo = monsters.get(p.target);
    if (!mo || mo.state === 'dead') return sys(p, '请先选中一个怪物');
    if (now < p.skillAt) return;
    if (p.mp < SKILL.mp) return sys(p, '法力不足');
    if (dist(p, mo) > p.range + 8) return sys(p, '距离太远');
    p.mp -= SKILL.mp; p.skillAt = now + SKILL.cd; hitMonster(p, mo, SKILL.mult, true); sendSelf(p);
  },
  // 更换形象：性别、发型、发色随时能换；换职业时把手里和包里的本职业武器换成新职业的同档武器【暂拟：原作不能换职业，这是应要求加的】
  look(p, m) {
    if (p.dead) return;
    if (m.sex === 'm' || m.sex === 'f') p.sex = m.sex;
    if (m.look >= 0 && m.look <= 3) p.look = m.look | 0;
    if (m.color >= 0 && m.color <= 5) p.color = m.color | 0;
    if (CLASSES[m.cls] && m.cls !== p.cls) {
      const a = WEAPON_OF[p.cls] + '_', b = WEAPON_OF[m.cls] + '_';
      for (const k of Object.keys(p.bag)) if (k.startsWith(a)) { const k2 = b + k.slice(a.length); p.bag[k2] = (p.bag[k2] || 0) + p.bag[k]; delete p.bag[k]; }
      if (p.equip.weapon && p.equip.weapon.startsWith(a)) p.equip.weapon = b + p.equip.weapon.slice(a.length);
      p.cls = m.cls; sys(p, '你转职成了' + CLASSES[p.cls].name);
    }
    calc(p); sendSelf(p);
  },
  // 回到选角色页面（切换角色）
  leave(p) { const w = p.ws; drop(p); w.player = null; listChars(w); },
  addpt(p, m) { if (p.pts > 0 && ['str', 'agi', 'int', 'spi', 'vit'].includes(m.a)) { p.pts--; p.alloc[m.a] = (p.alloc[m.a] || 0) + 1; calc(p); sendSelf(p); } },
  chat(p, m) { const s = String(m.s || '').slice(0, 80).trim(); if (s) broadcast({ t: 'chat', id: p.id, from: p.name, s }); },
  revive(p) { if (!p.dead) return; p.dead = false; p.x = MAP.spawn[0]; p.y = MAP.spawn[1]; p.path = []; p.hp = p.maxHp; p.mp = p.maxMp; sys(p, '你在村子里复活了'); sendSelf(p); },
};

function hitMonster(p, mo, mult, isSkill) {
  p.lastCombat = now;
  mo.target = p.id; if (mo.state !== 'chase') { mo.state = 'chase'; mo.nextAtk = now + 0.6; }
  const fx = { t: 'fx', k: 'hit', from: p.id, to: mo.id, skill: !!isSkill };
  if (Math.random() > p.hit) { fx.miss = true; return broadcast(fx); }
  let d = Math.max(1, Math.round((p.magic ? p.matk : p.patk) * rand(0.9, 1.1) * mult) - mo.def);
  if (Math.random() < (p.magic ? p.mcrit : p.pcrit)) { d *= 2; fx.crit = true; }
  fx.v = d; mo.hp -= d;
  if (mo.hp <= 0) {
    mo.hp = 0; mo.state = 'dead'; mo.deadAt = now; mo.target = 0; fx.dead = true; p.target = 0;
    const diff = p.level - mo.level, pen = RULES.exp_penalty;
    let exp = mo.exp; if (diff > pen.free_diff) exp = Math.max(pen.min_exp, Math.round(exp * Math.pow(1 - pen.per_level, diff - pen.free_diff)));
    const c = Math.round(rand(2, 5) * mo.level / 2); p.copper += c; sys(p, '获得 ' + moneyText(c));
    gainExp(p, exp);
    const q = QUESTS[p.q.i];
    if (q && p.q.s === 1 && q.goal.type === 'kill' && q.goal.mon === mo.type) { p.q.n++; checkGoal(p); }
    sendSelf(p);
  }
  broadcast(fx);
}

// ---------- 世界每一拍（每秒 20 拍） ----------
function stepToward(e, tx, ty, sp, dt) {
  const d = Math.hypot(tx - e.x, ty - e.y), s = sp * dt;
  if (d <= s) { e.x = tx; e.y = ty; return true; }
  e.x += (tx - e.x) / d * s; e.y += (ty - e.y) / d * s; return false;
}
let regenAcc = 0, snapAcc = 0, saveAcc = 0;
function tick(dt) {
  now += dt; regenAcc += dt;
  const doRegen = regenAcc >= 1; if (doRegen) regenAcc -= 1;
  for (const p of players.values()) {
    if (p.dead) continue;
    const mo = p.target && monsters.get(p.target);
    if (p.target && (!mo || mo.state === 'dead')) { p.target = 0; sendSelf(p); }
    else if (mo) {
      const d = dist(p, mo);
      if (d > p.range) { if (now >= p.repath) { p.repath = now + 0.4; p.path = findPath(p.x, p.y, mo.x, mo.y); } }
      else {
        if (d <= p.range * RULES.approach.stop_ratio || !p.path.length) p.path = [];
        if (!p.path.length && now >= p.nextAtk) { p.nextAtk = now + ATK_INTERVAL; hitMonster(p, mo, 1, false); }
      }
    }
    let left = dt;
    while (p.path.length && left > 0) {
      const [tx, ty] = p.path[0], d = Math.hypot(tx - p.x, ty - p.y), s = PLAYER_SPEED * left;
      if (d <= s) { p.x = tx; p.y = ty; p.path.shift(); left -= d / PLAYER_SPEED; } else { stepToward(p, tx, ty, PLAYER_SPEED, left); left = 0; }
    }
    p.moving = p.path.length > 0;
    if (p.goNpc && nearNpc(p, p.goNpc)) { const id = p.goNpc; p.goNpc = null; p.path = []; send(p, dialogFor(p, id)); }
    // 传送点
    if (Math.hypot(p.x - MAP.portal[0], p.y - MAP.portal[1]) < 140) {
      if (now >= (p.portalMsg || 0)) {
        p.portalMsg = now + 6;
        if (p.level >= MAP.portalLevel) { p.arrived = true; send(p, { t: 'arrive' }); }
        else sys(p, '传送点：通往沐光平原（' + MAP.portalLevel + '级可进入）');
      }
    }
    if (doRegen && now - p.lastCombat >= REST.delay_after_combat_sec && (p.hp < p.maxHp || p.mp < p.maxMp)) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * REST.hp_percent_per_sec / 100);
      p.mp = Math.min(p.maxMp, p.mp + p.maxMp * REST.mp_percent_per_sec / 100); sendSelf(p);
    }
  }
  for (const m of monsters.values()) {
    if (m.state === 'dead') {
      if (now - m.deadAt >= RESPAWN) { [m.hx, m.hy] = spawnPoint(m.zone); m.x = m.wx = m.hx; m.y = m.wy = m.hy; m.hp = m.maxHp; m.state = 'idle'; }
    } else if (m.state === 'chase') {
      const p = players.get(m.target);
      if (!p || p.dead || Math.hypot(m.x - m.hx, m.y - m.hy) > AI.aggro_range_px) { m.state = 'return'; m.target = 0; continue; }
      const d = dist(m, p);
      if (d > MON_REACH) stepToward(m, p.x, p.y, AI.chase_speed_px, dt);
      else if (now >= m.nextAtk) {
        m.nextAtk = now + AI.attack_interval_sec; p.lastCombat = now;
        const fx = { t: 'fx', k: 'mhit', from: m.id, to: p.id };
        if (Math.random() < p.dodge) fx.miss = true;
        else {
          fx.v = Math.max(1, Math.round(m.atk * rand(0.9, 1.1)) - p.pdef); p.hp -= fx.v;
          if (p.hp <= 0) { p.hp = 0; p.dead = true; p.target = 0; p.path = []; fx.dead = true; m.state = 'return'; m.target = 0; }
        }
        broadcast(fx); sendSelf(p);
      }
    } else if (m.state === 'return') {
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * AI.leash_regen_per_sec * dt);
      if (stepToward(m, m.hx, m.hy, AI.return_speed_px, dt)) { m.state = 'idle'; m.wx = m.x; m.wy = m.y; }
    } else {
      if (now >= m.nextWander) {
        m.nextWander = now + rand(2.5, 6);
        const x = m.hx + rand(-130, 130), y = m.hy + rand(-80, 80); if (walkable(x, y) && los(m.x, m.y, x, y)) { m.wx = x; m.wy = y; }
      }
      stepToward(m, m.wx, m.wy, 48, dt);
    }
  }
  snapAcc += dt;
  if (snapAcc >= 0.1 && players.size) {
    snapAcc = 0;
    broadcast({ t: 'snap',
      p: [...players.values()].map(p => [p.id, Math.round(p.x), Math.round(p.y), p.moving ? 1 : 0, p.dead ? 1 : 0, Math.round(p.hp), p.maxHp, p.level, p.name, p.loadout, p.target, p.sex, p.look | 0, p.color | 0]),
      m: [...monsters.values()].filter(m => m.state !== 'dead').map(m => [m.id, Math.round(m.x), Math.round(m.y), Math.round(m.hp), m.maxHp]) });
  }
  saveAcc += dt;
  if (saveAcc >= 20) { saveAcc = 0; if (dirty) saveAll(); }
}
let last = Date.now();
setInterval(() => { const t = Date.now(), dt = Math.min(0.2, (t - last) / 1000) * (+process.env.MJ_SPEED || 1); last = t; try { tick(dt); } catch (e) { console.error(e); } }, 50);

// ---------- 登录：账号（免密码）→ 角色列表 → 创建/选国家 → 进入 ----------
const NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,10}$/;
const NATIONS = { light: '光明帝国', wind: '飓风帝国', water: '沁水帝国', moon: '暗月帝国', earth: '烈土帝国', fire: '炙火帝国' };
const MAX_CHARS = 3; // 【暂拟】原作一个账号能建几个角色没有图证
const wsend = (ws, o) => ws.send(JSON.stringify(o));
const nameTaken = n => Object.values(accounts).some(a => a.chars.some(c => c.name === n));
const listChars = (ws) => wsend(ws, { t: 'chars', acct: ws.acct, max: MAX_CHARS, list: accounts[ws.acct].chars.map(c => ({ name: c.name, cls: c.cls, clsName: CLASSES[c.cls].name, level: c.level, sex: c.sex, look: c.look, nation: c.nation })) });
function openAcct(ws, m) {
  const a = String(m.name || '').trim();
  if (!NAME_RE.test(a)) return wsend(ws, { t: 'err', s: '账号需为 2–10 个中文、字母或数字' });
  if (!accounts[a]) { accounts[a] = { chars: [] }; dirty = true; }
  ws.acct = a; listChars(ws);
}
function checkName(ws, m) {
  const n = String(m.name || '').trim();
  if (!NAME_RE.test(n)) return wsend(ws, { t: 'check', ok: false, s: '昵称需为 2–10 个中文、字母或数字' });
  if (nameTaken(n)) return wsend(ws, { t: 'check', ok: false, s: '这个昵称已经有人用了' });
  wsend(ws, { t: 'check', ok: true, s: '昵称可以使用' });
}
function createChar(ws, m) {
  if (!ws.acct) return;
  const acc = accounts[ws.acct], n = String(m.name || '').trim();
  if (acc.chars.length >= MAX_CHARS) return wsend(ws, { t: 'err', s: '角色已经建满了' });
  if (!NAME_RE.test(n)) return wsend(ws, { t: 'err', s: '昵称需为 2–10 个中文、字母或数字' });
  if (nameTaken(n)) return wsend(ws, { t: 'err', s: '这个昵称已经有人用了' });
  if (!CLASSES[m.cls]) return wsend(ws, { t: 'err', s: '请选择职业' });
  if (!NATIONS[m.nation]) return wsend(ws, { t: 'err', s: '请选择国家' });
  acc.chars.push(Object.assign(newChar(m.cls), { name: n, sex: m.sex === 'f' ? 'f' : 'm', look: m.look | 0, nation: m.nation }));
  dirty = true;
  if (m.enter) enter(ws, { i: acc.chars.length - 1, debug: m.debug }); else listChars(ws);
}
function enter(ws, m) {
  if (!ws.acct) return;
  const acc = accounts[ws.acct], ci = m.i | 0, c = acc.chars[ci];
  if (!c) return wsend(ws, { t: 'err', s: '没有这个角色' });
  if (!c.nation) { if (!NATIONS[m.nation]) return wsend(ws, { t: 'err', s: '请选择国家' }); c.nation = m.nation; } // 选了就不能改
  for (const o of [...players.values()]) if (o.acct === ws.acct) { wsend(o.ws, { t: 'err', s: '账号在别处登录' }); o.ws.close(); drop(o); }
  const p = Object.assign({ id: nextId++, ws, acct: ws.acct, ci, path: [], target: 0, goNpc: null, dead: false, moving: false, nextAtk: 0, repath: 0, skillAt: 0, potionAt: 0, lastCombat: -99 }, JSON.parse(JSON.stringify(c)));
  if (!walkable(p.x, p.y)) { p.x = MAP.spawn[0]; p.y = MAP.spawn[1]; }
  calc(p); if (p.hp <= 0) { p.hp = p.maxHp; p.mp = p.maxMp; }
  ws.player = p; players.set(p.id, p);
  send(p, { t: 'init', id: p.id, map: { w: MAP.w, h: MAP.h, name: MAP.name, npcs: MAP.npcs, regions: MAP.regions, portal: MAP.portal, land: MAP.land, pier: MAP.pier, obstacles: MAP.obstacles, rects: MAP.rects, zones: MAP.zones.map(z => ({ mon: z.mon, name: z.name, level: z.level, x: z.x, y: z.y, rx: z.rx, ry: z.ry })) },
    items: ITEMS, monsters: [...monsters.values()].map(m => [m.id, m.type, m.name, m.level]), skill: SKILL, debugGrid: m.debug ? { cs: CS, gw: GW, gh: GH, cells: Buffer.from(grid).toString('base64') } : undefined });
  sendSelf(p);
  broadcast({ t: 'chat', sys: true, s: p.name + ' 进入了遗迹之岛' });
  console.log('[进入]', p.name, '在线', players.size);
}
// 自测和机器人用的直通车：账号名=角色名，没有就按给的职业建一个（默认炙火帝国）
function login(ws, m) {
  const name = String(m.name || '').trim();
  if (!NAME_RE.test(name)) return wsend(ws, { t: 'err', s: '名字需为 2–10 个中文、字母或数字' });
  if (!accounts[name]) accounts[name] = { chars: [] };
  ws.acct = name;
  const acc = accounts[name];
  if (!acc.chars.length) {
    if (nameTaken(name)) return wsend(ws, { t: 'err', s: '这个昵称已经有人用了' });
    acc.chars.push(Object.assign(newChar(CLASSES[m.cls] ? m.cls : 'warrior'), { name, sex: 'm', look: 0, nation: 'fire' }));
  }
  enter(ws, { i: 0, nation: 'fire', debug: m.debug });
}
const PRE = { acct: openAcct, check: checkName, create: createChar, enter, login };
function drop(p) {
  if (!players.has(p.id)) return;
  accounts[p.acct].chars[p.ci] = packChar(p); players.delete(p.id); dirty = true;
  for (const m of monsters.values()) if (m.target === p.id) { m.target = 0; m.state = 'return'; }
  broadcast({ t: 'chat', sys: true, s: p.name + ' 离开了' });
  console.log('[离开]', p.name, '在线', players.size);
  try { saveAll(); } catch (e) { console.error(e); }
}

// ---------- 网页文件服务 + 对讲线路（WebSocket） ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.normalize(path.join(CLIENT, u));
  if (!f.startsWith(CLIENT)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const tag = '"' + st.size + '-' + Math.floor(st.mtimeMs) + '"';
    if (req.headers['if-none-match'] === tag) { res.writeHead(304, { ETag: tag, 'Cache-Control': 'no-cache' }); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache', ETag: tag });
    fs.createReadStream(f).pipe(res);
  });
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) return sock.destroy();
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
    crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  sock.setNoDelay(true);
  const frame = (op, buf) => {
    const n = buf.length; let h;
    if (n < 126) h = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
    if (!sock.destroyed) sock.write(Buffer.concat([h, buf]));
  };
  const ws = { player: null, send: s => frame(1, Buffer.from(s)), close: () => { frame(8, Buffer.alloc(0)); sock.end(); } };
  let buf = Buffer.alloc(0), parts = [];
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 15, masked = buf[1] & 0x80; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) return sock.destroy();
      const need = off + (masked ? 4 : 0) + len; if (buf.length < need) return;
      const data = Buffer.from(buf.subarray(need - len, need));
      if (masked) { const k = buf.subarray(off, off + 4); for (let i = 0; i < len; i++) data[i] ^= k[i & 3]; }
      buf = buf.subarray(need);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { frame(10, data); continue; }
      if (op === 10) continue;
      parts.push(data); if (!fin) continue;
      const text = Buffer.concat(parts).toString('utf8'); parts = [];
      let m; try { m = JSON.parse(text); } catch (e) { continue; }
      try {
        if (!ws.player) { if (PRE[m.t]) PRE[m.t](ws, m); }
        else if (H[m.t]) H[m.t](ws.player, m);
      } catch (e) { console.error('指令出错', m.t, e); }
    }
  });
  const bye = () => { if (ws.player) { drop(ws.player); ws.player = null; } };
  sock.on('close', bye); sock.on('error', bye);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('魔镜Online 服务器已启动');
  console.log('  本机打开:   http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list) if (a.family === 'IPv4' && !a.internal) console.log('  同一WiFi的朋友打开: http://' + a.address + ':' + PORT);
});
process.on('SIGINT', () => { try { saveAll(); } catch (e) { } process.exit(0); });
