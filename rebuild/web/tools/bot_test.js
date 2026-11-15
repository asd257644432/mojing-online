'use strict';
// 机器人试玩：自动从 1 级跑完全部新手任务，检查流程能不能走通。
// 用法：先用 MJ_SPEED=8 开一个测试服（端口 8099），再 node web/tools/bot_test.js 8099 warrior
const port = process.argv[2] || 8099, cls = process.argv[3] || 'warrior';
const name = 'bot' + cls.slice(0, 3) + Math.floor(Math.random() * 9000 + 1000);
const ws = new WebSocket('ws://localhost:' + port);
const send = o => ws.send(JSON.stringify(o));
let myId = 0, pos = [0, 0], me = null, lastLine = '', deaths = 0, t0 = Date.now(), pendingDialog = null, done = false, lastAct = 0;
const log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
ws.onopen = () => send({ t: 'login', name, create: true, cls });
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.t === 'err') { log('错误', m.s); process.exit(1); }
  if (m.t === 'self') {
    me = m.me;
    const q = me.quest, line = q ? q.title + ' | s=' + q.s + ' | ' + q.line : '全部完成';
    if (line !== lastLine) { lastLine = line; log('Lv' + me.level, 'HP' + me.hp + '/' + me.maxHp, money(me.copper), '→', line); }
  }
  if (m.t === 'init') myId = m.id;
  if (m.t === 'snap') { const p = m.p.find(p => p[0] === myId); if (p) pos = [p[1], p[2]]; }
  if (m.t === 'dialog' && !m.close) pendingDialog = m;
  if (m.t === 'arrive' && !done) { done = true; log('★ 抵达传送点，流程走通。等级', me.level, '死亡次数', deaths, '背包', JSON.stringify(me.bag)); setTimeout(() => process.exit(0), 300); }
};
const money = c => c + '铜';
setInterval(() => {
  if (!me || done) return;
  if (me.dead) { deaths++; log('死亡，回城复活'); send({ t: 'revive' }); return; }
  if (me.hp < me.maxHp * 0.45 && me.bag.hp_potion) send({ t: 'use', item: 'hp_potion' });
  for (const k in me.bag) { const it = k.startsWith('w_') || k.startsWith('cloth'); if (it) send({ t: 'use', item: k }); }
  if (me.pts > 0) send({ t: 'addpt', a: me.magic ? 'int' : 'str' });
  const q = me.quest; if (!q) return;
  if (pendingDialog) {
    const d = pendingDialog; pendingDialog = null;
    if (d.btns.length) return send({ t: 'quest', a: d.btns[0].a, npc: d.npc });
    if (d.shop && q.s === 1 && /围巾/.test(q.line)) return send({ t: 'buy', npc: d.npc, item: 'scarf', n: 1 });
  }
  const now = Date.now();
  if (q.mon && q.s === 1) { const far = Math.hypot(pos[0] - q.pos[0], pos[1] - q.pos[1]) > 300; if (far && !me.target) { if (now - lastAct > 1500) { lastAct = now; send({ t: 'move', x: q.pos[0], y: q.pos[1] }); } } else if (!me.target) send({ t: 'tab' }); else send({ t: 'skill' }); return; }
  if (now - lastAct < 1500) return; lastAct = now;
  if (q.npc) send({ t: 'npc', id: q.npc });
  else if (q.pos) send({ t: 'move', x: q.pos[0], y: q.pos[1] });
}, 150);
setTimeout(() => { log('✗ 超时，卡在：', lastLine); process.exit(2); }, 240000);
