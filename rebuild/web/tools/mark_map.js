// 在新画的地图上重新标：怪的地盘、不能走的地方（房子、摊子、树干、遗迹、篱笆）
// 数字是照着 web/art-src/v4/_grid.jpg（带坐标格的地图）读出来的；想调就改这里再跑一遍
const fs = require('fs'), F = 'web/server/data/island.json';
const j = JSON.parse(fs.readFileSync(F, 'utf8'));
const K = 6012 / 1600, P = (x, y) => [Math.round(x * K), Math.round(y * K)];   // 格子图上的点 → 游戏里的点
const zone = { m_001: [2450, 1050, 480, 170], m_002: [3330, 1100, 500, 400], m_003: [4000, 2260, 430, 220], m_004: [4250, 1700, 430, 280] };
for (const z of j.zones) [z.x, z.y, z.rx, z.ry] = zone[z.mon];
const reg = { wheat: [2450, 1050], palms: [3330, 1100], grove: [4250, 1700], ruins: [3450, 2400] };
for (const r of j.regions) if (reg[r.id]) [r.x, r.y] = reg[r.id];
j.rects = [[1290, 1930, 1610, 2150], [1925, 1720, 2200, 1900], [2320, 1860, 2650, 2130]];   // 木屋、蓝黄摊、绿白药水摊
const ob = [], add = (x, y, r) => { const [gx, gy] = P(x, y); ob.push({ x: gx, y: gy, r }); };
for (const [x, y] of [[885,225],[940,248],[982,228],[812,275],[862,270],[910,300],[1002,298],[808,330],[860,343],[920,368],[1000,358],[760,380],[818,397],[962,397],[893,417]]) add(x, y, 26);   // 椰树干
for (const [x, y] of [[1118,390],[1078,422],[1180,445],[1020,465],[1218,485],[1078,503],[1160,503],[1118,523]]) add(x, y, 40);   // 松树
add(910, 590, 150); add(1025, 628, 55); add(885, 705, 75); add(948, 700, 75);   // 遗迹石柱、石拱
for (const [a, b, c, d] of [[470,470,520,448],[590,480,635,498],[708,538,762,555],[762,555,668,605],[332,560,545,663],[545,663,603,640]]) {   // 篱笆：一串小圆
  const len = Math.hypot(c - a, d - b) * K, n = Math.max(1, Math.round(len / 44));
  for (let i = 0; i <= n; i++) add(a + (c - a) * i / n, b + (d - b) * i / n, 14);
}
j.obstacles = ob;
fs.writeFileSync(F, JSON.stringify(j));
console.log('zones', j.zones.length, 'obstacles', ob.length);
