import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { MapDef, Point, PropDef } from '../../../shared/types';
import { IslandGround } from './island-ground';
import { IslandScenery } from './island-scenery';
import { WindGround } from './wind-ground';
import { WindScenery } from './wind-scenery';
import { MuguangGround } from './muguang-ground';
import { MuguangScenery } from './muguang-scenery';
import { WildForestGround } from './wild-forest-ground';
import { WildForestScenery, type ForestFocus } from './wild-forest-scenery';
import { LifeRealmGround } from './life-realm-ground';
import { LifeRealmScenery } from './life-realm-scenery';

const palettes: Record<MapDef['theme'], [string, string, string, string, string]> = {
  meadow: ['#86ad59', '#4d794a', '#b8c971', '#c9a676', '#62978c'],
  forest: ['#59885e', '#34594e', '#86a973', '#9d896d', '#436b6b'],
  snow: ['#adc5c6', '#768fa2', '#e8e7dc', '#bdbbad', '#6195a9'],
  desert: ['#c3a36b', '#8c7159', '#dbc484', '#debd82', '#76a69c'],
  swamp: ['#6c8461', '#435c54', '#a5a478', '#9d8562', '#526f6f'],
  astral: ['#77749b', '#424b72', '#a997ba', '#a494b8', '#659bb6'],
  volcano: ['#806259', '#4d4147', '#b0876a', '#a28b72', '#c66a48'],
};

function seed(source: string) {
  let value = 5381;
  for (const char of source) value = Math.imul(value, 31) + char.charCodeAt(0) | 0;
  return () => {
    value = Math.imul(1664525, value) + 1013904223 | 0;
    return (value >>> 0) / 0x100000000;
  };
}

function ellipse(context: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
  context.fillStyle = color;
  context.fill();
}

function makeGround(map: MapDef) {
  const canvas = document.createElement('canvas');
  const rasterScale = Math.min(1, 2500 / Math.max(map.width, map.height));
  canvas.width = Math.ceil(map.width * rasterScale);
  canvas.height = Math.ceil(map.height * rasterScale);
  const context = canvas.getContext('2d');
  if (!context) return Texture.WHITE;
  context.scale(rasterScale, rasterScale);
  const [ground, low, high, trail, water] = palettes[map.theme];
  const random = seed(map.id);
  const { width, height, spawn } = map;
  context.fillStyle = ground;
  context.fillRect(0, 0, width, height);
  for (let i = 0; i < 130; i++) {
    const x = random() * width;
    const y = random() * height;
    const radius = 70 + random() * 255;
    const blend = context.createRadialGradient(x, y, 0, x, y, radius);
    const color = i % 2 ? low : high;
    blend.addColorStop(0, color + (i % 3 ? '83' : '42'));
    blend.addColorStop(1, color + '00');
    context.fillStyle = blend;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const edge = context.createLinearGradient(0, 0, 0, height);
  edge.addColorStop(0, low + '63');
  edge.addColorStop(0.24, low + '00');
  edge.addColorStop(0.78, low + '00');
  edge.addColorStop(1, low + '72');
  context.fillStyle = edge;
  context.fillRect(0, 0, width, height);
  if (map.theme === 'swamp') {
    for (let i = 0; i < 11; i++) {
      const x = random() * width;
      const y = random() * height;
      const radius = 18 + random() * 60;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 180) continue;
      ellipse(context, x, y, radius, radius * 0.45, low + 'aa');
      ellipse(context, x + 2, y - 4, radius * 0.91, radius * 0.33, water);
    }
  }
  const roads = [
    ...map.portals.map(portal => ({ x: portal.x, y: portal.y })),
    ...map.npcs.slice(0, 3).map(npc => ({ x: npc.x, y: npc.y })),
  ];
  for (const [index, endpoint] of roads.entries()) {
    const bend = index % 2 ? 50 : -75;
    context.beginPath();
    context.moveTo(spawn.x, spawn.y);
    context.bezierCurveTo(spawn.x + bend, (spawn.y + endpoint.y) / 2, endpoint.x - bend, endpoint.y, endpoint.x, endpoint.y);
    context.lineCap = 'round';
    context.strokeStyle = low + '40';
    context.lineWidth = 75;
    context.stroke();
    context.strokeStyle = trail + 'ad';
    context.lineWidth = 55;
    context.stroke();
    context.strokeStyle = high + '39';
    context.lineWidth = 32;
    context.stroke();
  }
  for (let i = 0; i < 9500; i++) {
    const x = random() * width;
    const y = random() * height;
    const size = 0.4 + random() * 2;
    if (i < 630) {
      const color = i % 4 ? low : high;
      context.strokeStyle = color + '72';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x - 3, y);
      context.quadraticCurveTo(x - 4, y - 4, x - 7, y - 6);
      context.moveTo(x, y);
      context.quadraticCurveTo(x + 2, y - 8, x + 6, y - 11);
      context.moveTo(x + 2, y);
      context.lineTo(x + 7, y - 5);
      context.stroke();
      if (map.theme === 'meadow' && i % 7 === 0) ellipse(context, x + 6, y - 11, 1.9, 1.4, i % 2 ? '#f8d98e' : '#edaaa7');
    } else {
      ellipse(context, x, y, size, size * 0.56, (i % 3 ? low : high) + '35');
    }
  }
  return Texture.from(canvas, true);
}

function tintedShadow(g: Graphics, x: number, y: number, w: number, h: number) {
  g.ellipse(x, y, w, h).fill({color: 0x27333a, alpha: 0.22});
  g.ellipse(x - 2, y - 1, w * 0.73, h * 0.7).fill({color: 0x283439, alpha: 0.19});
}

function drawTree(g: Graphics, prop: PropDef, map: MapDef) {
  const random = seed(prop.id);
  const palm = prop.kind === 'palm';
  const pink = map.theme === 'meadow' && random() > 0.33;
  const trunk = palm ? 0x8a6651 : 0x704b48;
  tintedShadow(g, 12, 5, 40, 13);
  g.moveTo(-13,3).quadraticCurveTo(-5,-5,-8,-20).quadraticCurveTo(-13,-43,-3,-68)
    .lineTo(8,-69).quadraticCurveTo(4,-41,9,-22).quadraticCurveTo(11,-1,22,6)
    .lineTo(7,4).lineTo(-1,7).lineTo(-8,5).closePath().fill(trunk).stroke({color:0x4d413e,width:1.6});
  g.moveTo(-7,1).quadraticCurveTo(2,-10,-3,-27).quadraticCurveTo(-9,-48,1,-59)
    .stroke({color:0xb88062,width:2.8,cap:'round'});
  if (palm) {
    for (let i = 0; i < 8; i++) {
      const sign = i < 4 ? -1 : 1;
      const x = sign * (26 + random() * 26);
      const y = -87 + random() * 43;
      g.moveTo(1,-71).quadraticCurveTo(x*0.7,y-25,x,y).quadraticCurveTo(x*0.6,y-11,1,-67)
        .closePath().fill(i % 2 ? 0x63945c : 0x7da764).stroke({color:0x496a53,width:1.1});
    }
    g.circle(0,-68,5).fill(0x9b745b);
    return;
  }
  for (const x of [-27, 23]) {
    g.moveTo(0,-22).quadraticCurveTo(x * 0.27,-53,x,-67)
      .stroke({color:trunk,width:6,cap:'round'});
  }
  const tones = pink ? [0x9b657b,0xc07a89,0xdd9c9d,0xeab1a9,0xf2c3af] : [0x405c53,0x5e795a,0x7b9862,0x9cab6a,0xb6bd7a];
  const snow = map.theme === 'snow';
  for (let i = 0; i < 17; i++) {
    const x = (random() - 0.5) * 75;
    const y = -51 - random() * 48 + Math.abs(x) * 0.25;
    const size = 14 + random() * 16;
    const tone = snow ? [0x637f86,0x8ba1a0,0xb4c9c0,0xd4ded2,0xe4e9db] : tones;
    g.ellipse(x, y, size, size * 0.7).fill(tone[i < 5 ? 0 : i < 10 ? 1 : i % 3 + 2]);
    g.ellipse(x - 4, y - 4, size * 0.57, size * 0.26).fill({color:tone[4],alpha:0.24});
  }
  for (let i = 0; i < 33; i++) {
    const x = (random() - 0.5) * 86;
    const y = -56 - random() * 44 + Math.abs(x) * 0.24;
    g.ellipse(x,y,1.7 + random() * 2,1.1).fill({color:tones[4],alpha:0.62});
  }
}

function drawBuilding(g: Graphics, prop: PropDef) {
  const ruin = prop.kind === 'ruin';
  tintedShadow(g, 9, 6, 59, 22);
  g.poly([-47,-14, -13,9, 51,-7, 17,-33]).fill(0xa99c83).stroke({color:0x726f63,width:2});
  if (ruin) {
    g.poly([-43,-16,-43,-48,-35,-55,-33,-45,-25,-49,-21,-40,-21,-7]).fill(0xaaa897).stroke({color:0x5f6e64,width:2});
    g.poly([9,-11,9,-59,18,-63,28,-56,28,-4]).fill(0x9c9b84).stroke({color:0x626b60,width:2});
    for (const y of [-49,-39,-27,-16]) g.moveTo(10,y).lineTo(28,y+3).stroke({color:0x6f7365,width:1});
    g.ellipse(-32,-43,8,3).fill(0x74864f).ellipse(20,-59,8,3).fill(0x74864f);
    return;
  }
  g.poly([-44,-17,-44,-51,-5,-66,-5,1]).fill(0xc29f7b).stroke({color:0x5e5050,width:2});
  g.poly([-5,1,-5,-58,43,-49,43,-13]).fill(0xe0ba8b).stroke({color:0x5e5050,width:2});
  g.poly([-54,-49,-18,-95,17,-80,-1,-43]).fill(0x945860).stroke({color:0x654355,width:2.4});
  g.poly([-18,-95,19,-86,54,-48,-1,-43]).fill(0xb87470).stroke({color:0x664452,width:2.4});
  for (let i=0;i<6;i++) {
    g.moveTo(-13+i*5,-89).quadraticCurveTo(-4+i*6,-63,5+i*8,-47).stroke({color:0xe29c84,width:1.4,alpha:0.73});
  }
  g.roundRect(5,-32,17,30,3).fill(0x775854).stroke({color:0x60484e,width:1.5});
  g.roundRect(28,-37,10,10,1).fill(0xffd190).stroke({color:0x6d5358,width:1.5});
  g.moveTo(33,-37).lineTo(33,-28).moveTo(28,-32).lineTo(38,-32).stroke({color:0x8d625d,width:0.8});
  g.circle(18,-16,1.5).fill(0xe3b980);
}

function drawProp(prop: PropDef, map: MapDef) {
  const g = new Graphics();
  g.position.set(prop.x,prop.y);
  g.scale.set(prop.scale ?? 1);
  g.zIndex = prop.y;
  const kind = prop.kind;
  if (kind === 'tree' || kind === 'palm') drawTree(g, prop, map);
  else if (kind === 'house' || kind === 'ruin') drawBuilding(g, prop);
  else if (kind === 'fountain') {
    tintedShadow(g,4,2,42,14);
    g.ellipse(0,-10,39,18).fill(0x819585).stroke({color:0x526b6a,width:2});
    g.ellipse(0,-14,33,14).fill(0x6db2ae).stroke({color:0xc1c8a7,width:2});
    g.ellipse(0,-18,11,5).fill(0x91c6b8);
    g.moveTo(-21,-13).quadraticCurveTo(0,-18,22,-12).moveTo(-12,-18).quadraticCurveTo(0,-22,13,-17).stroke({color:0xcedbba,width:1.5});
    g.moveTo(-5,-16).quadraticCurveTo(-8,-40,0,-43).quadraticCurveTo(8,-36,5,-16).stroke({color:0xaadcd7,width:2.5});
  } else if (kind === 'banner') {
    tintedShadow(g,2,0,18,6);
    g.moveTo(-5,-1).lineTo(-5,-54).stroke({color:0x634749,width:4,cap:'round'});
    g.poly([-4,-52,22,-53,17,-39,24,-29,-4,-31]).fill(0x9e665e).stroke({color:0xd9b587,width:1.5});
    g.poly([7,-47,13,-42,8,-36,4,-42]).fill(0xf0c980);
  } else if (kind === 'crystal') {
    tintedShadow(g,3,1,25,10);
    for (const [x,y] of [[-12,-17],[2,-34],[12,-20]]) {
      g.poly([x-7,-2,x-6,y+9,x,y,x+8,y+10,x+8,-2]).fill(0x719fc0).stroke({color:0x495b86,width:1});
      g.poly([x,y,x+8,y+10,x+8,-2,x+2,1]).fill(0x9dd9dc);
    }
  } else if (kind === 'rock') {
    tintedShadow(g,3,2,26,11);
    g.poly([-21,1,-17,-14,-7,-24,10,-23,22,-14,26,-4,14,3]).fill(0x777c76).stroke({color:0x535c59,width:1.4});
    g.poly([-17,-14,-7,-24,10,-23,20,-14,2,-11,-9,-13]).fill(0xa5a394);
    g.moveTo(-11,-10).lineTo(-5,-3).lineTo(9,-4).stroke({color:0x939779,width:2.5});
    g.ellipse(5,-19,7,2.8).fill(0x889661);
  } else {
    const mushroom = kind === 'mushroom';
    for (const [index, x] of [-9, 0, 9].entries()) {
      const y = -5 - (index % 2) * 4;
      g.moveTo(x+2,2).quadraticCurveTo(x+3,-2,x,y).stroke({color:mushroom?0xe2c3a0:0x4e7659,width:2,cap:'round'});
      g.ellipse(x,y,mushroom?5:3,mushroom?3.6:2.6).fill(index % 2 ? 0xeda0a3 : 0xebc57f);
      g.circle(x-1,y-0.7,0.85).fill(0xffeac2);
    }
  }
  return g;
}

export class Terrain {
  readonly base = new Container();
  private readonly ground?: Sprite;
  private readonly scenery: Graphics[] = [];
  private readonly islandGround?: IslandGround;
  private readonly islandScenery?: IslandScenery;
  private readonly windGround?: WindGround;
  private readonly windScenery?: WindScenery;
  private readonly muguangGround?: MuguangGround;
  private readonly muguangScenery?: MuguangScenery;
  private readonly wildForestGround?: WildForestGround;
  private readonly wildForestScenery?: WildForestScenery;
  private readonly lifeRealmGround?: LifeRealmGround;
  private readonly lifeRealmScenery?: LifeRealmScenery;
  private disposed = false;

  constructor(map: MapDef, worldObjects: Container) {
    if (map.id === 'life-realm') {
      this.lifeRealmGround = new LifeRealmGround(map);
      this.lifeRealmScenery = new LifeRealmScenery(map,worldObjects);
      this.base.addChild(this.lifeRealmGround.root);
      return;
    }
    if (map.id === 'muguang-city') {
      this.muguangGround = new MuguangGround(map);
      this.muguangScenery = new MuguangScenery(map,worldObjects);
      this.base.addChild(this.muguangGround.root);
      return;
    }
    if (map.id === 'wild-forest') {
      this.wildForestGround = new WildForestGround(map);
      this.wildForestScenery = new WildForestScenery(map,worldObjects);
      this.base.addChild(this.wildForestGround.root);
      return;
    }
    if (map.id === 'ruins-island') {
      this.islandGround = new IslandGround(map);
      this.islandScenery = new IslandScenery(map,worldObjects);
      this.base.addChild(this.islandGround.root);
      return;
    }
    if (map.id === 'wind-valley') {
      this.windGround = new WindGround(map);
      this.base.addChild(this.windGround.root);
      this.windScenery = new WindScenery(map,worldObjects,this.base);
      return;
    }
    const image = map.background;
    const ground = this.ground = new Sprite(makeGround(map));
    ground.width = map.width;
    ground.height = map.height;
    this.base.addChild(ground);
    this.scenery = map.props.map(prop => drawProp(prop,map));
    for (const prop of this.scenery) worldObjects.addChild(prop);
    if (image) void Assets.load<Texture>(image).then(texture => {
      if (this.disposed) return;
      const art = new Sprite(texture);
      art.width = map.width;
      art.height = map.height;
      this.base.addChild(art);
      ground.visible = false;
      for (const [index, prop] of map.props.entries()) {
        const edge = prop.x < map.width * 0.1 || prop.x > map.width * 0.9 || prop.y < map.height * 0.13 || prop.y > map.height * 0.88;
        this.scenery[index].visible = edge && (prop.kind === 'tree' || prop.kind === 'palm' || prop.kind === 'rock');
      }
    }).catch(error => console.warn('Could not load map background', image, error));
  }

  updateView(origin: Point, width: number, height: number) {
    this.islandGround?.updateView(origin,width,height);
    this.islandScenery?.updateView(origin,width,height);
    this.windGround?.updateView(origin,width,height);
    this.windScenery?.updateView(origin,width,height);
    this.muguangGround?.updateView(origin,width,height);
    this.muguangScenery?.updateView(origin,width,height);
    this.wildForestGround?.updateView(origin,width,height);
    this.wildForestScenery?.updateView(origin,width,height);
    this.lifeRealmGround?.updateView(origin,width,height);
    this.lifeRealmScenery?.updateView(origin,width,height);
  }

  updateOcclusion(player: ForestFocus, target: ForestFocus | undefined, deltaMs: number) {
    this.islandScenery?.updateOcclusion(player,target,deltaMs);
    this.wildForestScenery?.updateOcclusion(player,target,deltaMs);
    this.lifeRealmScenery?.updateOcclusion(player,target,deltaMs);
  }

  destroy() {
    this.disposed = true;
    this.islandScenery?.destroy();
    this.islandGround?.destroy();
    this.windScenery?.destroy();
    this.windGround?.destroy();
    this.muguangScenery?.destroy();
    this.muguangGround?.destroy();
    this.wildForestScenery?.destroy();
    this.wildForestGround?.destroy();
    this.lifeRealmScenery?.destroy();
    this.lifeRealmGround?.destroy();
    for (const prop of this.scenery) prop.destroy();
    const texture = this.ground?.texture;
    this.base.destroy({ children: true });
    if (texture && texture !== Texture.WHITE) texture.destroy(true);
  }
}

export function makePortal(name: string, radius: number) {
  const root = new Container();
  const pad = new Graphics();
  const ring = Math.min(Math.max(radius * 0.7, 24), 42);
  tintedShadow(pad,0,3,ring + 3,ring * 0.46);
  pad.ellipse(0,0,ring,ring * 0.44).fill({color:0x4a6073,alpha:0.7}).stroke({color:0xc8baa1,width:2.1});
  pad.ellipse(0,-2,ring - 5,ring * 0.35).stroke({color:0xc4eee8,width:1.5,alpha:0.86});
  const runes = new Graphics();
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2;
    const x = Math.cos(angle) * (ring - 3);
    const y = Math.sin(angle) * ring * 0.35 - 2;
    runes.circle(x,y,i % 3 ? 1.3 : 2.2).fill(i % 3 ? 0x9ddedc : 0xf6deb0);
  }
  const glow = new Graphics().moveTo(-16,-2).quadraticCurveTo(-23,-38,0,-61)
    .quadraticCurveTo(23,-38,16,-2).quadraticCurveTo(0,10,-16,-2).closePath()
    .fill({color:0x9af7e9,alpha:0.17}).stroke({color:0xe6ffec,alpha:0.65,width:1.4});
  const label = new Text({text:name,style:{fontFamily:'PingFang SC, Microsoft YaHei, sans-serif',fontSize:12,fill:0xffedbd,stroke:{color:0x3a444b,width:3}}});
  label.anchor.set(0.5,1);
  label.y = -40;
  root.addChild(pad, runes, glow, label);
  return { root, glow, runes };
}
