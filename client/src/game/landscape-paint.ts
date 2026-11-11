import type { MapDef, Point } from '../../../shared/types';

export type Box = {left:number;top:number;right:number;bottom:number};
export interface LandscapePath {
  path: Path2D;
  bounds: Box;
}

function bounds(points:readonly Point[]) {
  const area:Box = {left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
  for (const {x,y} of points) {
    area.left = Math.min(area.left,x);
    area.top = Math.min(area.top,y);
    area.right = Math.max(area.right,x);
    area.bottom = Math.max(area.bottom,y);
  }
  return area;
}

export function intersects(a:Box,b:Box,margin=0) {
  return a.left<=b.right+margin && a.right>=b.left-margin && a.top<=b.bottom+margin && a.bottom>=b.top-margin;
}

export function outline(points:readonly Point[],closed:boolean): LandscapePath {
  const path = new Path2D();
  if (points.length) {
    path.moveTo(points[0].x,points[0].y);
    for (let i=1;i<points.length;i++) path.lineTo(points[i].x,points[i].y);
    if (closed) path.closePath();
  }
  return {path,bounds:bounds(points)};
}

export function trail(points:readonly Point[]) {
  const path = new Path2D();
  if (points.length) path.moveTo(points[0].x,points[0].y);
  for (let i=1;i<points.length-1;i++) {
    const a = points[i-1], b = points[i], c = points[i+1];
    const before = Math.min(.20,44/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)));
    const after = Math.min(.20,44/Math.max(1,Math.hypot(c.x-b.x,c.y-b.y)));
    path.lineTo(b.x+(a.x-b.x)*before,b.y+(a.y-b.y)*before);
    path.quadraticCurveTo(b.x,b.y,b.x+(c.x-b.x)*after,b.y+(c.y-b.y)*after);
  }
  const end = points.at(-1);
  if (end) path.lineTo(end.x,end.y);
  return {path,bounds:bounds(points)};
}

function randomCell(x:number,y:number,salt:number) {
  let seed = Math.imul(x,192486581) ^ Math.imul(y,73856093) ^ salt;
  return () => {
    seed = Math.imul(seed,1664525)+1013904223|0;
    return (seed>>>0)/0x100000000;
  };
}

export function scatter(box:Box,spacing:number,margin:number,salt:number,
  draw:(x:number,y:number,random:()=>number)=>void) {
  const right = Math.floor((box.right+margin)/spacing);
  const bottom = Math.floor((box.bottom+margin)/spacing);
  for (let row=Math.floor((box.top-margin)/spacing);row<=bottom;row++) {
    for (let col=Math.floor((box.left-margin)/spacing);col<=right;col++) {
      const random = randomCell(col,row,salt);
      draw((col+random())*spacing,(row+random())*spacing,random);
    }
  }
}

export function oval(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string) {
  ctx.beginPath();
  ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function ocean(ctx:CanvasRenderingContext2D,box:Box,shore:LandscapePath,mapHeight:number) {
  const blend = ctx.createLinearGradient(0,mapHeight*.58,0,mapHeight);
  blend.addColorStop(0,'#5f9da2');
  blend.addColorStop(.45,'#579ba6');
  blend.addColorStop(1,'#497f9e');
  ctx.fillStyle = blend;
  ctx.fillRect(box.left,box.top,box.right-box.left,box.bottom-box.top);
  scatter(box,54,50,0x5b187,(x,y,random)=>{
    const wide = 10+random()*28;
    oval(ctx,x,y,wide,1+random()*1.9,random()>.57 ? '#d4e9df54' : '#345d8241');
    if (random()>.61) oval(ctx,x+wide*.38,y+7,wide*.65,1.1,'#d4ebdc32');
  });
  if (!intersects(box,shore.bounds,170)) return;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [width,color] of [[295,'#6daeb15d'],[191,'#80bcb690'],[112,'#9bc6b2b3'],[54,'#afd1b1cf'],[12,'#e0e5b4cc']] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke(shore.path);
  }
}

export function paintGrass(ctx:CanvasRenderingContext2D,box:Box,map:MapDef,
  colors:readonly [string,string,string,string] = ['#6ca54b','#80b348','#86b347','#759f40']) {
  const green = ctx.createLinearGradient(0,0,map.width*.78,map.height);
  green.addColorStop(0,colors[0]);
  green.addColorStop(.36,colors[1]);
  green.addColorStop(.65,colors[2]);
  green.addColorStop(1,colors[3]);
  ctx.fillStyle = green;
  ctx.fillRect(box.left,box.top,box.right-box.left,box.bottom-box.top);

  scatter(box,132,225,0x829042,(x,y,random)=>{
    const radius = 89+random()*122;
    const wash = ctx.createRadialGradient(x,y,0,x,y,radius);
    wash.addColorStop(0,random()>.41 ? '#c8cb6561' : '#3c792e63');
    wash.addColorStop(1,'#88aa4900');
    ctx.fillStyle = wash;
    ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  });
  scatter(box,55,47,0x8617,(x,y,random)=>{
    if (random()<.38) return;
    const count = 6+random()*12;
    const spread = 16+random()*26;
    ctx.beginPath();
    for (let i=0;i<count;i++) {
      const bx = x+(random()-.5)*spread*2;
      const by = y+(random()-.5)*spread*.64;
      const height = 2+random()*5.8;
      ctx.moveTo(bx,by);
      ctx.quadraticCurveTo(bx+1,by-height*.57,bx-2.5,by-height);
      ctx.moveTo(bx+.3,by-.4);
      ctx.quadraticCurveTo(bx+2.6,by-height*.50,bx+4.2,by-height*.85);
    }
    ctx.strokeStyle = random()>.53 ? '#c4cf6989' : '#3b762f56';
    ctx.lineWidth = 1.15;
    ctx.stroke();
  });
  scatter(box,28,13,0x59128,(x,y,random)=>{
    if (random()>.55) oval(ctx,x,y,1+random()*2.5,.7+random()*.64,'#557e3746');
    if (random()>.94) oval(ctx,x-2,y-2,1.5,1.15,random()>.55 ? '#ede2a4ad' : '#eac77b9e');
  });
}

export function paintBeach(ctx:CanvasRenderingContext2D,box:Box,shore:LandscapePath,scale=1) {
  if (!intersects(box,shore.bounds,130*scale)) return;
  ctx.lineJoin = 'round';
  for (const [width,color] of [[198,'#d2bc726a'],[172,'#d6bf829d'],[135,'#dbc493e0'],
    [93,'#e2cda0'],[36,'#e8d5a7'],[7,'#eaf1cb']] as const) {
    ctx.lineWidth = width*scale;
    ctx.strokeStyle = color;
    ctx.stroke(shore.path);
  }
  ctx.lineWidth = 100*scale;
  scatter(box,26,7,0x309ea,(x,y,random)=>{
    if (random()<.36 || !ctx.isPointInStroke(shore.path,x-box.left,y-box.top)) return;
    oval(ctx,x,y,1+random()*3,.9,random()>.61 ? '#f0dfb4' : '#c3a57c59');
  });
}

const cropColors = [
  {soil:'#b3945d', edge:'#856d44', dark:'#a1804d', light:'#d0b269', plant:'#d5b75e', glint:'#f2ce78'},
  {soil:'#9e9658', edge:'#7d794a', dark:'#7f8149', light:'#b0ad61', plant:'#a7b158', glint:'#d7cb76'},
  {soil:'#b8a164', edge:'#92794d', dark:'#9a8852', light:'#d6bb79', plant:'#d5bd67', glint:'#eed58a'},
] as const;

export function paintField(ctx:CanvasRenderingContext2D,box:Box,area:LandscapePath,index:number) {
  if (!intersects(box,area.bounds,12)) return;
  const colors = cropColors[index%cropColors.length];
  ctx.save();
  ctx.fillStyle = colors.soil;
  ctx.fill(area.path);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#6c684052';
  ctx.stroke(area.path);
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors.edge;
  ctx.stroke(area.path);
  ctx.clip(area.path);
  const plotWidth = (area.bounds.right-area.bounds.left)/4;
  const plotHeight = (area.bounds.bottom-area.bounds.top)/2;
  for (let row=0;row<2;row++) {
    for (let col=0;col<4;col++) {
      ctx.fillStyle = cropColors[(col+2*row+index)%cropColors.length].soil;
      ctx.fillRect(area.bounds.left+col*plotWidth+3,area.bounds.top+row*plotHeight+3,plotWidth-6,plotHeight-6);
    }
  }
  const slope = index%4===2 ? -.49 : -.65;
  const frequency = index%3===1 ? 22 : 24;
  const {left,top,right,bottom} = box;
  const start = Math.floor((top-slope*left)/frequency)-2;
  const end = Math.ceil((bottom-slope*right)/frequency)+2;
  for (let i=start;i<=end;i++) {
    const origin = i*frequency+index*11;
    ctx.beginPath();
    ctx.moveTo(left-12,origin+slope*(left-12));
    ctx.lineTo(right+12,origin+slope*(right+12));
    ctx.lineWidth = 11;
    ctx.strokeStyle = colors.dark;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.light;
    ctx.stroke();
  }
  scatter(box,16,22,0x6c775+index,(x,y,random)=>{
    if (random()<.37) return;
    const row = Math.round((y-slope*x-index*11)/frequency);
    const lineY = slope*x+row*frequency+index*11;
    oval(ctx,x,lineY-3,2+random()*3,1.2,colors.plant);
    if (random()>.54) oval(ctx,x+.6,lineY-6,1.4,2.4,colors.glint);
  });
  ctx.beginPath();
  for (let col=1;col<4;col++) {
    const x = area.bounds.left+plotWidth*col;
    ctx.moveTo(x,area.bounds.top);
    ctx.lineTo(x,area.bounds.bottom);
  }
  ctx.moveTo(area.bounds.left,area.bounds.top+plotHeight);
  ctx.lineTo(area.bounds.right,area.bounds.top+plotHeight);
  ctx.strokeStyle = '#beaa76';
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.restore();
}

export function paintWall(ctx:CanvasRenderingContext2D,box:Box,wall:LandscapePath,index:number) {
  if (!intersects(box,wall.bounds,28)) return;
  const {top,bottom} = wall.bounds;
  const shade = ctx.createLinearGradient(0,top,0,Math.max(top+1,bottom));
  shade.addColorStop(0,'#68745c');
  shade.addColorStop(.35,'#8a896d');
  shade.addColorStop(.72,'#7b765f');
  shade.addColorStop(1,'#555744');
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4e573b60';
  ctx.lineWidth = 31;
  ctx.stroke(wall.path);
  ctx.fillStyle = shade;
  ctx.fill(wall.path);
  ctx.save();
  ctx.clip(wall.path);
  scatter(box,96,150,0x9c648+index,(x,y,random)=>{
    const width = 50+random()*100;
    const rise = 29+random()*72;
    ctx.beginPath();
    ctx.moveTo(x-width*.57,y-rise*.36);
    ctx.lineTo(x-width*.22,y-rise);
    ctx.lineTo(x+width*.31,y-rise*.82);
    ctx.lineTo(x+width*.53,y-rise*.30);
    ctx.lineTo(x+width*.29,y+rise*.26);
    ctx.lineTo(x-width*.28,y+rise*.52);
    ctx.closePath();
    ctx.fillStyle = random()>.42 ? '#b1aa835b' : '#494c3b57';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x-width*.57,y-rise*.36);
    ctx.lineTo(x-width*.22,y-rise);
    ctx.lineTo(x+width*.31,y-rise*.82);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#cdc19b5c';
    ctx.stroke();
    if (random()>.44) {
      oval(ctx,x-width*.19,y+rise*.22,width*.35,rise*.20,'#5b6d418a');
      oval(ctx,x-width*.25,y+rise*.18,width*.26,rise*.12,'#9aa25b63');
    }
  });
  ctx.restore();
}
