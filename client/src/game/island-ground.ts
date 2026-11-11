import { Sprite, Texture } from 'pixi.js';
import type { MapDef, Point } from '../../../shared/types';
import { ChunkedGround } from './chunked-ground';
import { intersects, outline } from './landscape-paint';

const tileSize = 512;
const dirtLayers = [
  ['#b3af7560',100],['#c1b48369',91],['#cbb98980',83],
  ['#d3c2949a',75],['#d8c99cbd',66],['#dacda360',54],['#ded1a72b',41],
] as const;
const grassShades = ['#3e792946','#4e84295f','#98bd5270','#c0cf6985'];
export const islandTrails: ReadonlyArray<ReadonlyArray<Point>> = [
  [{x:1750,y:2092},{x:1744,y:1817},{x:1750,y:1750},{x:1790,y:1450},{x:1834,y:1160},{x:1900,y:900}],
  [{x:1900,y:900},{x:2206,y:1028},{x:2532,y:1050},{x:2850,y:1000},{x:3110,y:1130},{x:3452,y:1304},{x:3600,y:1500}],
  [{x:3600,y:1500},{x:3520,y:1720},{x:3380,y:1950},{x:3178,y:2157},{x:3050,y:2190}],
  [{x:3050,y:2190},{x:2710,y:2210},{x:2370,y:2170},{x:2110,y:2070},{x:1750,y:2092}],
  [{x:3600,y:1500},{x:3740,y:1200},{x:3975,y:970},{x:4180,y:756},{x:4484,y:553},{x:4617,y:475}],
  [{x:1750,y:1750},{x:1635,y:1784},{x:1510,y:1830},{x:1306,y:1867}],
  [{x:1750,y:1750},{x:1884,y:1763},{x:2010,y:1853},{x:2072,y:1835}],
  [{x:2110,y:2070},{x:2045,y:2264},{x:2050,y:2460}],
];

function tracePolygon(points: ReadonlyArray<Point>) {
  const path = new Path2D();
  path.moveTo(points[0].x,points[0].y);
  for (const point of points.slice(1)) path.lineTo(point.x,point.y);
  path.closePath();
  return path;
}

function traceTrails() {
  return islandTrails.map(trail => {
    const path = new Path2D();
    path.moveTo(trail[0].x,trail[0].y);
    for (let i = 1; i < trail.length - 1; i++) {
      const point = trail[i];
      const next = trail[i+1];
      path.quadraticCurveTo(point.x,point.y,(point.x+next.x)/2,(point.y+next.y)/2);
    }
    path.lineTo(trail.at(-1)!.x,trail.at(-1)!.y);
    return { path, bounds: outline(trail, false).bounds };
  });
}

function seed(x: number, y: number, salt: number) {
  let value = Math.imul(x,15485863) ^ Math.imul(y,32452843) ^ salt;
  return () => {
    value = Math.imul(value,1664525) + 1013904223 | 0;
    return (value >>> 0) / 0x100000000;
  };
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
  ctx.beginPath();
  ctx.ellipse(x,y,width,height,0,0,2*Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function scatter(x: number, y: number, width: number, height: number, cell: number, salt: number,
  draw: (x:number,y:number,random:()=>number)=>void) {
  for (let gy = Math.floor(y / cell); gy <= Math.floor((y + height) / cell); gy++) {
    for (let gx = Math.floor(x / cell); gx <= Math.floor((x + width) / cell); gx++) {
      const random = seed(gx,gy,salt);
      draw((gx+random())*cell,(gy+random())*cell,random);
    }
  }
}

function paintFarmland(ctx: CanvasRenderingContext2D) {
  const fields = [
    [{x:1687,y:801},{x:1835,y:731},{x:1981,y:786},{x:1804,y:866}],
    [{x:1837,y:884},{x:2004,y:807},{x:2121,y:856},{x:1975,y:938}],
    [{x:1911,y:968},{x:2123,y:885},{x:2218,y:926},{x:2044,y:1028}],
  ];
  for (const [index,points] of fields.entries()) {
    const field = tracePolygon(points);
    ctx.fillStyle = ['#b0935f','#bda36b','#a78f60'][index];
    ctx.fill(field);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#837451';
    ctx.stroke(field);
    ctx.save();
    ctx.clip(field);
    for (let row = 0; row < 25; row++) {
      const x = 1610+row*27;
      ctx.beginPath();
      ctx.moveTo(x,1070);
      ctx.lineTo(x+420,697);
      ctx.strokeStyle = row % 2 ? '#90794e' : '#ceb87a';
      ctx.lineWidth = row % 2 ? 6 : 4;
      ctx.stroke();
    }
    scatter(1665,725,573,323,15,index+71,(x,y,random)=>{
      if (random() < .21) return;
      ellipse(ctx,x,y,1+random()*2.2,1,'#d4bd80');
      if (random() > .65) ellipse(ctx,x,y-2,1.2,2.6,'#e4c680');
    });
    ctx.restore();
  }
}

function paintPlaza(ctx: CanvasRenderingContext2D) {
  ellipse(ctx,1652,1725,122,66,'#a19771');
  ellipse(ctx,1652,1721,114,61,'#b1a889');
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(1652,1721,109,58,0,0,Math.PI*2);
  ctx.clip();
  for (let row = -5; row <= 5; row++) {
    for (let column = -8; column <= 8; column++) {
      const random = seed(column,row,31);
      const x = 1652+column*21+(row%2)*10.5;
      const y = 1721+row*9;
      ctx.fillStyle = ['#baae8f','#c0b195','#aaa487','#b2aa90'][Math.floor(random()*4)];
      ctx.fillRect(x,y,19.8,8);
    }
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(1652,1721,111,60,0,0,Math.PI*2);
  ctx.strokeStyle = '#c5b89b';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function paintDock(ctx: CanvasRenderingContext2D) {
  const dock = tracePolygon([{x:4476,y:495},{x:4800,y:429},{x:4843,y:510},{x:4512,y:589}]);
  ctx.fillStyle = '#766452';
  ctx.fill(dock);
  ctx.strokeStyle = '#5b5650';
  ctx.lineWidth = 7;
  ctx.stroke(dock);
  ctx.save();
  ctx.clip(dock);
  for (let column = 0; column < 27; column++) {
    const x = 4450 + column * 16;
    ctx.beginPath();
    ctx.moveTo(x,402);
    ctx.lineTo(x+74,605);
    ctx.strokeStyle = ['#a98a65','#bc9c70','#9d805e','#ad8d65'][column%4];
    ctx.lineWidth = 13;
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#d1b88b';
  ctx.lineWidth = 2;
  ctx.stroke(dock);
}

export class IslandGround extends ChunkedGround {
  private readonly coast: Path2D;
  private readonly trails = traceTrails();

  constructor(map: MapDef) {
    super(map,'ruins-island chunks');
    this.coast = tracePolygon(map.walkable?.length ? map.walkable : [
      {x:0,y:0},{x:map.width,y:0},{x:map.width,y:map.height},{x:0,y:map.height},
    ]);
  }

  protected paintTile(x: number, y: number) {
    const canvas = document.createElement('canvas');
    const width = Math.min(tileSize,this.map.width-x);
    const height = Math.min(tileSize,this.map.height-y);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(-x,-y);
    const ocean = ctx.createLinearGradient(0,0,this.map.width,this.map.height);
    ocean.addColorStop(0,'#477e97');
    ocean.addColorStop(.45,'#629fa8');
    ocean.addColorStop(1,'#4f889b');
    ctx.fillStyle = ocean;
    ctx.fillRect(x,y,width,height);
    scatter(x-41,y-18,width+82,height+36,31,181,(px,py,random)=>{
      const wave = 8+random()*21;
      ellipse(ctx,px,py,wave,1+random()*2,'#c2ded03a');
      if (random() > .54) ellipse(ctx,px+12,py+7,wave*.75,1.1,'#395f7438');
    });
    ctx.lineJoin = 'round';
    ctx.lineWidth = 81;
    ctx.strokeStyle = '#82b4af';
    ctx.stroke(this.coast);
    ctx.lineWidth = 46;
    ctx.strokeStyle = '#a1c7b6';
    ctx.stroke(this.coast);
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#d7dfb9';
    ctx.stroke(this.coast);

    const land = ctx.createLinearGradient(0,0,this.map.width,this.map.height);
    land.addColorStop(0,'#80b848');
    land.addColorStop(.44,'#78ad40');
    land.addColorStop(1,'#649b3c');
    ctx.fillStyle = land;
    ctx.fill(this.coast);
    ctx.save();
    ctx.clip(this.coast);
    scatter(x-204,y-204,width+408,height+408,133,263,(px,py,random)=>{
      const radius = 69+random()*116;
      const wash = ctx.createRadialGradient(px,py,6,px,py,radius);
      wash.addColorStop(0,random()>.42?'#b8c55a65':'#3b7c2a57');
      wash.addColorStop(1,'#74a74400');
      ctx.fillStyle = wash;
      ctx.fillRect(px-radius,py-radius,radius*2,radius*2);
    });
    scatter(x-47,y-30,width+94,height+60,48,313,(px,py,random)=>{
      if (random() < .34) return;
      const spread = 13+random()*27;
      const density = 5+random()*13;
      ctx.beginPath();
      for (let i=0;i<density;i++) {
        const bx = px+(random()-.5)*spread*2;
        const by = py+(random()-.5)*spread*.75;
        const height = 1.6+random()*5.2;
        ctx.moveTo(bx,by);
        ctx.quadraticCurveTo(bx-.8,by-height*.65,bx-2.6,by-height);
        ctx.moveTo(bx+.7,by-.4);
        ctx.quadraticCurveTo(bx+2.6,by-height*.65,bx+3.9,by-height*.9);
      }
      ctx.lineWidth = 1.15;
      ctx.strokeStyle = grassShades[Math.floor(random()*grassShades.length)];
      ctx.stroke();
    });
    ctx.lineWidth = 179;
    ctx.strokeStyle = '#cec18a';
    ctx.stroke(this.coast);
    ctx.lineWidth = 115;
    ctx.strokeStyle = '#d9c79a';
    ctx.stroke(this.coast);
    ctx.lineWidth = 22;
    ctx.strokeStyle = '#ddcfaa';
    ctx.stroke(this.coast);
    const tile = { left:x, right:x+width, top:y, bottom:y+height };
    const nearby = this.trails.filter(trail => intersects(tile,trail.bounds,55));
    if (nearby.length) {
      const path = new Path2D();
      for (const trail of nearby) path.addPath(trail.path);
      ctx.lineCap = 'round';
      for (const [stroke,width] of dirtLayers) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke(path);
      }
      ctx.lineWidth = 65;
      scatter(x-15,y-10,width+30,height+20,21,195,(px,py,random)=>{
        if (!ctx.isPointInStroke(path,px-x,py-y) || random()<.39) return;
        ellipse(ctx,px,py,1.2+random()*3.7,.7+random()*.9,random()>.55?'#e1d3ae70':'#9f8d5a51');
      });
    }
    if (x < 2240 && x + tileSize > 1640 && y < 1050 && y + tileSize > 700) paintFarmland(ctx);
    if (x < 1780 && x + tileSize > 1520 && y < 1795 && y + tileSize > 1650) paintPlaza(ctx);
    if (x < 3230 && x + tileSize > 2890 && y < 2240 && y + tileSize > 2030) {
      ellipse(ctx,3066,2120,115,69,'#a29c7f');
      ellipse(ctx,3066,2120,101,57,'#bcb499');
      ellipse(ctx,3066,2120,86,45,'#aca68e');
    }
    ctx.restore();
    if (x < 4850 && x + tileSize > 4440 && y < 610 && y + tileSize > 390) paintDock(ctx);
    return new Sprite({texture:Texture.from(canvas,true),x,y});
  }

}
