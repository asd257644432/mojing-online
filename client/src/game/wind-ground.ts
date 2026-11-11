import { Sprite, Texture } from 'pixi.js';
import type { MapDef } from '../../../shared/types';
import { WIND_VALLEY } from '../../../shared/wind-valley';
import { ChunkedGround } from './chunked-ground';
import { intersects, ocean, outline, oval, paintBeach, paintField, paintGrass, paintWall, scatter, trail, type LandscapePath } from './landscape-paint';

const chunk = 512;
const trailEdge = [
  [46,'#a9985b24'],[29,'#b6a06948'],[16,'#c7b17d6a'],
  [6,'#d7c18d83'],[-4,'#dfca9bad'],[-18,'#dfc99563'],
] as const;

export class WindGround extends ChunkedGround {
  private readonly land: LandscapePath;
  private readonly water: LandscapePath;
  private readonly shore = outline(WIND_VALLEY.shore,false);
  private readonly roads = WIND_VALLEY.roads.map(({points,width})=>({...trail(points),width}));
  private readonly fields = WIND_VALLEY.fields.map(points=>outline(points,true));
  private readonly cliffs = WIND_VALLEY.cliffs.map(points=>outline(points,true));

  constructor(map: MapDef) {
    super(map, 'wind-valley chunks');
    this.land = outline(WIND_VALLEY.land,true);
    const points = WIND_VALLEY.shore;
    this.water = outline([{x:0,y:points[0].y},...points,{x:map.width,y:points.at(-1)!.y},
      {x:map.width,y:map.height},{x:0,y:map.height}],true);
  }

  protected paintTile(left:number,top:number) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(chunk,this.map.width-left);
    canvas.height = Math.min(chunk,this.map.height-top);
    const box = {left,top,right:left+canvas.width,bottom:top+canvas.height};
    const ctx = canvas.getContext('2d')!;
    ctx.translate(-left,-top);
    ctx.fillStyle = '#5b6948';
    ctx.fillRect(left,top,canvas.width,canvas.height);
    if (intersects(box,this.water.bounds)) {
      ctx.save();
      ctx.clip(this.water.path);
      ocean(ctx,box,this.shore,this.map.height);
      ctx.restore();
    }
    if (intersects(box,this.land.bounds)) {
      ctx.save();
      ctx.clip(this.land.path);
      paintGrass(ctx,box,this.map);
      paintBeach(ctx,box,this.shore);
      this.fields.forEach((field,index)=>paintField(ctx,box,field,index));
      ctx.lineCap = ctx.lineJoin = 'round';
      for (const road of this.roads) {
        if (!intersects(box,road.bounds,road.width*.5+30)) continue;
        for (const [expand,color] of trailEdge) {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(5,road.width+expand);
          ctx.stroke(road.path);
        }
        ctx.lineWidth = Math.max(12,road.width-20);
        scatter(box,30,9,0xb43d,(x,y,random)=>{
          if (random()>.61 || !ctx.isPointInStroke(road.path,x-left,y-top)) return;
          oval(ctx,x,y,1.2+random()*2.9,.8+random()*.7,random()>.55 ? '#eddab676' : '#9b865853');
        });
      }
      ctx.restore();
    }
    this.cliffs.forEach((wall,index)=>paintWall(ctx,box,wall,index));
    const sprite = new Sprite({texture:Texture.from(canvas,true),x:left,y:top});
    sprite.eventMode = 'none';
    return sprite;
  }
}
