'use strict';
// 体检：从出生点“灌水”，看每个怪区、NPC、传送点是否走得到
const fs = require('fs'), path = require('path');
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'island.json'), 'utf8'));
const CS = MAP.cell, GW = Math.ceil(MAP.w / CS), GH = Math.ceil(MAP.h / CS);
function inPoly(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const grid = new Uint8Array(GW * GH);
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  const x = gx * CS + CS / 2, y = gy * CS + CS / 2;
  let ok = inPoly(x, y, MAP.land) || inPoly(x, y, MAP.pier);
  if (ok) for (const o of MAP.obstacles) if (Math.hypot(x - o.x, y - o.y) < o.r + 10) { ok = false; break; }
  if (ok) for (const r of MAP.rects) if (x > r[0] - 10 && x < r[2] + 10 && y > r[1] - 10 && y < r[3] + 10) { ok = false; break; }
  grid[gy * GW + gx] = ok ? 1 : 0;
}
const reach = new Uint8Array(GW * GH), st = [Math.floor(MAP.spawn[1] / CS) * GW + Math.floor(MAP.spawn[0] / CS)];
reach[st[0]] = 1;
while (st.length) { const i = st.pop(), x = i % GW, y = (i / GW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const n = ny * GW + nx; if (grid[n] && !reach[n]) { reach[n] = 1; st.push(n); } } }
const at = (x, y) => { const i = Math.floor(y / CS) * GW + Math.floor(x / CS); return grid[i] ? (reach[i] ? '走得到' : '孤岛(走不到)') : '不可走'; };
console.log('出生点', MAP.spawn, at(...MAP.spawn), ' 传送点', MAP.portal, at(...MAP.portal));
for (const z of MAP.zones) {
  let ok = 0, iso = 0, bad = 0;
  for (let i = 0; i < 400; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()); const s = at(z.x + Math.cos(a) * r * z.rx, z.y + Math.sin(a) * r * z.ry); s === '走得到' ? ok++ : s[0] === '孤' ? iso++ : bad++; }
  console.log(z.mon, z.name, [z.x, z.y, z.rx, z.ry].join(','), '中心', at(z.x, z.y), '| 区内 走得到', ok / 4 + '% 孤岛', iso / 4 + '% 不可走', bad / 4 + '%');
}
for (const n of MAP.npcs) console.log(n.id, n.name, Math.round(n.x), Math.round(n.y), '脚下', at(n.x, n.y), '身前', at(n.x, n.y + 70));
