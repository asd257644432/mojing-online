'use strict';
// 游戏内容表：物品、任务、NPC 台词。
// 说明：任务“骨架”来自考据 M07-027（新浪 2010-12-24 新手评测）；
//       具体台词、数量、奖励数值均为【暂拟】，等拿到图证再替换。

const ITEMS = {
  w_sword_1:   { name: '练习木剑', slot: 'weapon', atk: 10, cls: 'warrior',  loadout: 'sword',   icon: '🗡️' },
  w_dagger_1:  { name: '练习匕首', slot: 'weapon', atk: 10, cls: 'rogue',    loadout: 'dagger',  icon: '🔪' },
  w_bow_1:     { name: '练习短弓', slot: 'weapon', atk: 10, cls: 'ranger',   loadout: 'bow',     icon: '🏹' },
  w_staff_1:   { name: '练习法杖', slot: 'weapon', atk: 10, cls: 'mage',     loadout: 'staff',   icon: '🪄' },
  w_scepter_1: { name: '练习权杖', slot: 'weapon', atk: 10, cls: 'priest',   loadout: 'scepter', icon: '🔱' },
  w_hammer_1:  { name: '练习木槌', slot: 'weapon', atk: 10, cls: 'merchant', loadout: 'hammer',  icon: '🔨' },
  w_sword_2:   { name: '历练铁剑', slot: 'weapon', atk: 18, cls: 'warrior',  loadout: 'sword',   icon: '🗡️' },
  w_dagger_2:  { name: '历练匕首', slot: 'weapon', atk: 18, cls: 'rogue',    loadout: 'dagger',  icon: '🔪' },
  w_bow_2:     { name: '历练长弓', slot: 'weapon', atk: 18, cls: 'ranger',   loadout: 'bow',     icon: '🏹' },
  w_staff_2:   { name: '历练法杖', slot: 'weapon', atk: 18, cls: 'mage',     loadout: 'staff',   icon: '🪄' },
  w_scepter_2: { name: '历练权杖', slot: 'weapon', atk: 18, cls: 'priest',   loadout: 'scepter', icon: '🔱' },
  w_hammer_2:  { name: '历练铁槌', slot: 'weapon', atk: 18, cls: 'merchant', loadout: 'hammer',  icon: '🔨' },
  cloth_1:     { name: '新手布衣', slot: 'body', def: 3, icon: '👕' },
  hp_potion:   { name: '小瓶生命药水', heal: 100, price: 20, icon: '🧪', desc: '恢复 100 点生命' },
  mp_potion:   { name: '小瓶法力药水', mana: 50, price: 20, icon: '💧', desc: '恢复 50 点法力' },
  medicine:    { name: '村长的药包', quest: true, icon: '💊', desc: '任务物品' },
  pendant:     { name: '菱形吊坠', quest: true, icon: '💠', desc: '任务物品' },
  scarf:       { name: '围巾', price: 200, quest: true, icon: '🧣', desc: '留给父亲的礼物' },
};
const WEAPON_OF = { warrior: 'w_sword', rogue: 'w_dagger', ranger: 'w_bow', mage: 'w_staff', priest: 'w_scepter', merchant: 'w_hammer' };

const N = i => 'npc_ruins_island_' + String(i).padStart(2, '0');
const NPC = { uncle: N(1), tele: N(2), chief: N(3), herald: N(4), mage: N(5), wells: N(6), shop: N(7), susan: N(8), warrior: N(9), father: N(10) };

// goal.type: talk=找人说话  kill=打怪计数  have=身上有某物品
const QUESTS = [
  { id: 'q01', title: '初到遗迹之岛', giver: NPC.father, turnin: NPC.chief, goal: { type: 'talk' },
    offer: '孩子，你长大了。这些东西你带上，去见见村长老派恩吧，他有事要托付给你。',
    wait: '村长就在村子北边，快去吧。', done: '你就是布鲁克家的孩子？来得正好，村里正缺人手。',
    desc: '带上义父给的用品，去找村长 老派恩。', give: { $weapon1: 1, cloth_1: 1, hp_potion: 10, mp_potion: 5 }, exp: 200, copper: 100 },
  { id: 'q02', title: '麦田里的稻草人', giver: NPC.chief, turnin: NPC.chief, goal: { type: 'kill', mon: 'm_001', count: 8 },
    offer: '金色麦田里的稻草人不知怎么活了过来，把庄稼糟蹋得不成样子。你去教训它们一下。',
    wait: '麦田在村子的北面，稻草人就在那儿。', done: '干得好！麦田总算清静了。',
    desc: '到金色麦田击败稻草人。', exp: 500, copper: 150, items: { hp_potion: 5 } },
  { id: 'q03', title: '送药', giver: NPC.chief, turnin: NPC.uncle, goal: { type: 'talk' },
    offer: '亚尔维斯大叔在椰林那边巡查时受了点伤，你替我把这包药送过去。',
    wait: '亚尔维斯大叔在东北方的椰林边上。', done: '是村长让你送来的？太感谢了，这下好多了。',
    desc: '把药包送给椰林边的亚尔维斯大叔。', give: { medicine: 1 }, take: { medicine: 1 }, exp: 400, copper: 100 },
  { id: 'q04', title: '捣乱的小兔子', giver: NPC.uncle, turnin: NPC.uncle, goal: { type: 'kill', mon: 'm_002', count: 8 },
    offer: '别看这些粉红小兔子可爱，就是它们把我撞伤的。帮我赶走几只吧。',
    wait: '兔子就在这片椰林里。', done: '哈哈，身手不错嘛！',
    desc: '在椰林击败兔子。', exp: 650, copper: 200, items: { hp_potion: 5, mp_potion: 5 } },
  { id: 'q05', title: '道路修复', giver: NPC.uncle, turnin: NPC.warrior, goal: { type: 'kill', mon: 'm_003', count: 10 },
    offer: '通往圣迹滩的路被小蘑菇占了，修路的人过不去。清掉它们以后，去向村里的远古战士报个信。',
    wait: '圣迹滩在岛的南边，遗迹那一带。', done: '路通了？很好。这把武器你拿去，接下来用得上。',
    desc: '清理圣迹滩的小蘑菇，然后回村找远古战士。', exp: 800, copper: 250, items: { $weapon2: 1, hp_potion: 8 } },
  { id: 'q06', title: '身世之谜', giver: NPC.warrior, turnin: NPC.wells, goal: { type: 'talk' },
    offer: '你想知道自己的身世？岛东边的守护老人威尔斯或许知道些什么。',
    wait: '守护老人威尔斯在岛的东北方。', done: '……你终于来了。关于你的身世，我确实知道一些。',
    desc: '去找守护老人 威尔斯。', exp: 300, copper: 50 },
  { id: 'q07', title: '夺回菱形吊坠', giver: NPC.wells, turnin: NPC.wells, goal: { type: 'kill', mon: 'm_004', count: 12 },
    offer: '当年和你一起被发现的，还有一枚菱形吊坠。它被东边树林里嗜血的大蘑菇夺走了，去把它拿回来。',
    wait: '大蘑菇就在这附近的树林里，小心它们。', done: '就是它……收好吧，这是你身世唯一的线索。',
    desc: '击败树林里的大蘑菇，夺回菱形吊坠。', grant: { pendant: 1 }, exp: 1000, copper: 300, items: { hp_potion: 10 } },
  { id: 'q08', title: '告别', giver: NPC.wells, turnin: NPC.susan, goal: { type: 'talk' },
    offer: '答案不在这座岛上。离开之前，去和苏珊道个别吧。',
    wait: '苏珊在村子北边。', done: '你要走了吗……我就知道会有这一天。',
    desc: '去和苏珊告别。', exp: 200, copper: 50 },
  { id: 'q09', title: '留给父亲的围巾', giver: NPC.susan, turnin: NPC.father, goal: { type: 'have', item: 'scarf', count: 1 },
    offer: '布鲁克大叔嘴上不说，心里肯定舍不得你。去药水店老板亚撒那儿买条围巾留给他吧。',
    wait: '围巾在药水店老板亚撒那里能买到。', done: '这是……给我的？傻孩子。去吧，外面的世界很大，记得回来看看。',
    desc: '在药水店老板亚撒处买一条围巾，交给义父布鲁克。', take: { scarf: 1 }, exp: 500, copper: 100 },
  { id: 'q10', title: '离开遗迹之岛', giver: NPC.father, turnin: null, goal: { type: 'portal' },
    offer: '码头在岛的东北角。到了 10 级，传送点就会为你打开，那边是沐光平原。',
    wait: '码头在岛的东北角。', done: '', desc: '达到 10 级，从东北码头的传送点前往沐光平原。', exp: 0, copper: 0 },
];

const IDLE = {
  [NPC.uncle]: '椰林里的兔子越来越多了。', [NPC.tele]: '传送服务还没准备好。', [NPC.chief]: '遗迹之岛虽小，却是个好地方。',
  [NPC.herald]: '现在还没有活动，过些日子再来吧。', [NPC.mage]: '……', [NPC.wells]: '这座岛上的遗迹，比你想的要古老。',
  [NPC.shop]: '要买点药水吗？出门在外可少不了。', [NPC.susan]: '今天天气真好。', [NPC.warrior]: '圣迹滩……那里曾经是一座神殿。',
  [NPC.father]: '照顾好自己。',
};
const SHOP = { [NPC.shop]: ['hp_potion', 'mp_potion', 'scarf'] };

module.exports = { ITEMS, WEAPON_OF, QUESTS, IDLE, SHOP, NPC };
