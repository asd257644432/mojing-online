import { Sprite, Texture } from 'pixi.js';
import { MUGUANG_PLAIN, muguangRasterPoint } from '../../../shared/muguang-plain';
import type { MapDef, Point } from '../../../shared/types';
import { ChunkedGround } from './chunked-ground';
import { intersects, outline, oval, paintBeach, paintField, paintGrass, paintWall, scatter, trail, type Box, type LandscapePath } from './landscape-paint';

const trailEdges = [
  [44,'#63833550'],[26,'#979f425e'],[12,'#b9a05d9c'],[0,'#c6a365'],[-15,'#d6b174'],[-34,'#dfba7c5a'],
] as const;
const raster = (x:number,y:number):Point => muguangRasterPoint({x,y});
const garden = (x:number,y:number,rx:number,ry:number) => ({...raster(x,y),rx,ry});
const gardens = [garden(466,266,176,88),garden(664,282,206,86),garden(570,316,108,64),garden(561,370,150,64)];
const fieldPoints = [
  [raster(425,405),raster(481,420),raster(463,452),raster(410,436)],
  [raster(740,368),raster(799,347),raster(827,391),raster(771,414)],
];
const fountain=MUGUANG_PLAIN.buildings.find(building=>building.kind==='fountain')!;

function paintSea(ctx:CanvasRenderingContext2D,box:Box,shore:LandscapePath) {
  const color = ctx.createLinearGradient(0,0,2600,0);
  color.addColorStop(0,'#398ba6');
  color.addColorStop(.65,'#48a6af');
  color.addColorStop(1,'#74bdb2');
  ctx.fillStyle = color;
  ctx.fillRect(box.left,box.top,box.right-box.left,box.bottom-box.top);
  scatter(box,65,50,0x91cf7,(x,y,random)=>{
    const size = 12+random()*24;
    oval(ctx,x,y,size,1+random()*1.5,random()>.5 ? '#d1f3ed6c' : '#217e9a40');
  });
  if (!intersects(box,shore.bounds,160)) return;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [width,tone] of [[280,'#8ad2c684'],[180,'#9ddbd1b0'],[90,'#b9e5d8bd'],[20,'#e4efd9da']] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = tone;
    ctx.stroke(shore.path);
  }
  ctx.restore();
}

function stoneFloor(ctx:CanvasRenderingContext2D,box:Box,city:LandscapePath) {
  if (!intersects(box,city.bounds)) return;
  ctx.save();
  ctx.clip(city.path);
  ctx.fillStyle = '#a6ad9d';
  ctx.fillRect(box.left,box.top,box.right-box.left,box.bottom-box.top);
  const stones = ['#c9cebb','#d1d3c2','#bdc6b6','#c2cbbb','#d5d4bd'];
  for (let row=Math.floor(box.top/15)-1;row<=Math.ceil(box.bottom/15)+1;row++) {
    for (let column=Math.floor(box.left/48)-1;column<=Math.ceil(box.right/48)+1;column++) {
      const x=column*48+(row%2)*24,y=row*15;
      ctx.beginPath();
      ctx.moveTo(x,y-14.4);ctx.lineTo(x+23.3,y);ctx.lineTo(x,y+14.4);ctx.lineTo(x-23.3,y);ctx.closePath();
      ctx.fillStyle=stones[Math.abs(Math.imul(column,7919)^Math.imul(row,6449))%stones.length];
      ctx.fill();
      ctx.beginPath();ctx.moveTo(x-22.8,y);ctx.lineTo(x,y-14);ctx.lineTo(x+22.8,y);
      ctx.strokeStyle='#f2f1dc50';ctx.lineWidth=.7;ctx.stroke();
    }
  }
  for (const plot of gardens) {
    if (plot.x+plot.rx+10<box.left || plot.x-plot.rx-10>box.right || plot.y+plot.ry+7<box.top || plot.y-plot.ry-7>box.bottom) continue;
    oval(ctx,plot.x,plot.y,plot.rx+10,plot.ry+7,'#a6ac87');
    oval(ctx,plot.x,plot.y-1,plot.rx+5,plot.ry+3,'#eeead0');
    oval(ctx,plot.x,plot.y-2,plot.rx,plot.ry,'#518b3d');
    scatter(box,25,10,0x117b4,(x,y,random)=>{
      if (((x-plot.x)/plot.rx)**2+((y-plot.y)/plot.ry)**2>1) return;
      oval(ctx,x,y,4+random()*5,2+random()*2,'#7baa4a');
      if(random()>.7)oval(ctx,x-1,y-3,2.5,1.8,random()>.5?'#f5dbae':'#edaeb5');
    });
  }
  if (Math.abs(fountain.x-(box.left+box.right)/2)<(box.right-box.left)/2+230 &&
      Math.abs(fountain.y-(box.top+box.bottom)/2)<(box.bottom-box.top)/2+130) {
    oval(ctx,fountain.x,fountain.y,217,122,'#809a8599');
    oval(ctx,fountain.x,fountain.y-1,207,115,'#d5d6bd');
    ctx.beginPath();ctx.ellipse(fountain.x,fountain.y-1,190,102,0,0,Math.PI*2);
    ctx.strokeStyle='#82a7a2';ctx.lineWidth=7;ctx.stroke();
    ctx.beginPath();ctx.ellipse(fountain.x,fountain.y-1,174,94,0,0,Math.PI*2);
    ctx.strokeStyle='#eee8c9';ctx.lineWidth=3;ctx.stroke();
  }
  ctx.restore();
}

function foundations(ctx:CanvasRenderingContext2D,box:Box,sites:LandscapePath[]) {
  for (const site of sites) {
    if (!intersects(box,site.bounds,6)) continue;
    ctx.fillStyle='#838d77';ctx.fill(site.path);
    ctx.lineWidth=5;ctx.strokeStyle='#e5dfbe';ctx.stroke(site.path);
    ctx.lineWidth=1;ctx.strokeStyle='#67765e';ctx.stroke(site.path);
  }
}

export class MuguangGround extends ChunkedGround {
  private readonly land=outline(MUGUANG_PLAIN.land,true);
  private readonly city=outline(MUGUANG_PLAIN.cityFloor,true);
  private readonly shore=outline(MUGUANG_PLAIN.shore,false);
  private readonly rim=outline(MUGUANG_PLAIN.rim,false);
  private readonly rimEdges=MUGUANG_PLAIN.rim.slice(1).map((b,index)=>{
    const a=MUGUANG_PLAIN.rim[index];
    return {left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)};
  });
  private readonly roads=MUGUANG_PLAIN.roads.map(({points,width})=>({...trail(points),width}));
  private readonly cliffs=MUGUANG_PLAIN.cliffs.map(points=>outline(points,true));
  private readonly fields=fieldPoints.map(points=>outline(points,true));
  private readonly foundations=MUGUANG_PLAIN.buildings.filter(site=>site.footprint.length>0).map(site=>outline(site.footprint,true));
  private readonly water=outline(MUGUANG_PLAIN.water,true);

  constructor(map:MapDef) { super(map,'muguang-plain chunks'); }

  protected paintTile(left:number,top:number) {
    const canvas=document.createElement('canvas');
    canvas.width=Math.min(512,this.map.width-left);canvas.height=Math.min(512,this.map.height-top);
    const box={left,top,right:left+canvas.width,bottom:top+canvas.height};
    const ctx=canvas.getContext('2d')!;
    ctx.translate(-left,-top);
    ctx.fillStyle='#476e36';ctx.fillRect(left,top,canvas.width,canvas.height);
    if (intersects(box,this.water.bounds)) {
      ctx.save();ctx.clip(this.water.path);paintSea(ctx,box,this.shore);ctx.restore();
    }
    if (intersects(box,this.land.bounds)) {
      ctx.save();ctx.clip(this.land.path);
      paintGrass(ctx,box,this.map,['#4c923b','#5c9f3e','#67a23e','#4d8c35']);
      paintBeach(ctx,box,this.shore,5.4);
      this.fields.forEach((field,index)=>paintField(ctx,box,field,index));
      ctx.lineCap=ctx.lineJoin='round';
      for (const road of this.roads) {
        if (!intersects(box,road.bounds,road.width/2+30)) continue;
        for (const [expand,color] of trailEdges) {
          ctx.lineWidth=road.width+expand;ctx.strokeStyle=color;ctx.stroke(road.path);
        }
        ctx.lineWidth=road.width-18;
        scatter(box,32,8,0x7c8f,(x,y,random)=>{
          if (random()>.55 || !ctx.isPointInStroke(road.path,x-left,y-top)) return;
          oval(ctx,x,y,1+random()*3,.7+random(),random()>.5?'#efcf9563':'#a6804950');
        });
      }
      stoneFloor(ctx,box,this.city);
      foundations(ctx,box,this.foundations);
      ctx.restore();
    }
    if (this.rimEdges.some(edge=>intersects(box,edge,70))) {
      ctx.save();ctx.lineCap=ctx.lineJoin='round';
      for (const [width,tone] of [[100,'#426d33b0'],[56,'#6f7955'],[30,'#969571']] as const) {
        ctx.lineWidth=width;ctx.strokeStyle=tone;ctx.stroke(this.rim.path);
      }
      ctx.lineWidth=60;
      scatter(box,23,22,0x926d,(x,y,random)=>{
        if (!ctx.isPointInStroke(this.rim.path,x-left,y-top)) return;
        const size=5+random()*12;
        oval(ctx,x,y+2,size,size*.5,'#495a3e');
        oval(ctx,x,y,size,size*.45,random()>.5?'#b1ad82':'#8b9268');
      });
      ctx.restore();
    }
    this.cliffs.forEach((cliff,index)=>paintWall(ctx,box,cliff,index));
    const sprite=new Sprite({texture:Texture.from(canvas,true),x:left,y:top});
    sprite.eventMode='none';
    return sprite;
  }
}
