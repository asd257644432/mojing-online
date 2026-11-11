import { Container, Graphics, Text } from 'pixi.js';
import type { ResourceNode, Snapshot } from '../../../shared/types';

const font = 'PingFang SC, Microsoft YaHei, sans-serif';
const ink = 0x53514b;

function shadow(g: Graphics, width: number) {
  g.ellipse(3, 2, width, 7).fill({ color: 0x263631, alpha: .24 });
  g.ellipse(0, 1, width * .68, 4).fill({ color: 0x263631, alpha: .17 });
}

function drawWood(base: Graphics, living: Graphics) {
  shadow(base, 24);
  base.moveTo(-17,0).quadraticCurveTo(-12,-3,-12,-13).lineTo(11,-16).quadraticCurveTo(13,-5,20,1)
    .lineTo(10,1).lineTo(6,5).lineTo(0,3).lineTo(-8,4).lineTo(-11,1).closePath()
    .fill(0x8e6b4e).stroke({ color: 0x5d5345, width: 1.4 });
  base.moveTo(-12,-10).quadraticCurveTo(0,-5,12,-12).lineTo(9,-3).lineTo(5,2).lineTo(-1,1).closePath().fill(0xb28256);
  base.ellipse(0,-14,14,6.6).fill(0xd9a96b).stroke({color:0x795e4b,width:1.3});
  base.ellipse(1,-14,10.4,4.4).stroke({color:0xac7954,width:1.1});
  base.ellipse(1.8,-14,6.3,2.5).stroke({color:0xc08657,width:.8});
  base.moveTo(-9,-8).lineTo(-12,0).moveTo(5,-9).lineTo(3,2).moveTo(10,-6).lineTo(13,1)
    .stroke({color:0x6d5648,width:1.25,cap:'round'});
  living.ellipse(-12,1,6.5,2.4).fill(0x7c9655).ellipse(14,1,6,2.7).fill(0x9aac5d);
  living.moveTo(12,-2).quadraticCurveTo(14,-8,16,-11).moveTo(-13,-1).lineTo(-17,-7)
    .stroke({color:0x648555,width:1.5,cap:'round'});
  living.moveTo(14,-7).quadraticCurveTo(17,-13,21,-12).quadraticCurveTo(20,-8,14,-7).closePath().fill(0xc5cf79);
  living.moveTo(-14,-3).quadraticCurveTo(-21,-5,-21,-8).quadraticCurveTo(-15,-9,-14,-3).closePath().fill(0xb2c76f);
}

function drawOre(base: Graphics, living: Graphics, metal: boolean) {
  shadow(base, 23);
  base.poly([-20,-3,-16,-11,-7,-16,6,-14,18,-11,24,-3,13,5,-8,4]).fill(0x777a72).stroke({color:ink,width:1.3});
  base.poly([-16,-11,-7,-16,6,-14,18,-11,7,-6,-10,-6]).fill(0x999c8b);
  base.poly([7,-6,18,-11,24,-3,13,5,5,4]).fill(0x656e6e);
  base.moveTo(-14,-4).lineTo(-5,-1).lineTo(2,-2).moveTo(12,-7).lineTo(10,-2).stroke({color:0x52605e,width:1.2});
  if (metal) {
    for (const [x,y] of [[-10,-8],[-2,-12],[7,-6],[16,-8],[5,0]]) {
      living.poly([x-4,y+2,x-2,y-3,x+3,y-4,x+4,y,x+1,y+3]).fill(0xb69163).stroke({color:0x806d57,width:0.7});
      living.moveTo(x-2,y-2).lineTo(x+2,y-3).stroke({color:0xe3c88d,width:1.1});
    }
  } else {
    for (const [x,y,width] of [[-10,-23,6],[3,-37,9],[14,-21,5]]) {
      living.poly([x-width,-5,x-width,y+8,x,y,x+width,y+9,x+width,-6])
        .fill(0x83b8cb).stroke({color:0x526c8e,width:1.15});
      living.poly([x,y,x+width,y+9,x+width,-6,x+1,-4]).fill(0x6397b0);
      living.poly([x-width,y+8,x,y,x+1,y+12]).fill(0xe0f0da);
      living.moveTo(x-1,y+11).lineTo(x,-8).stroke({color:0xafdecf,width:1.3,alpha:.82});
    }
  }
}

function drawPlants(base: Graphics, living: Graphics, fiber: boolean) {
  shadow(base, 19);
  base.ellipse(0,-1,13,4).fill(0x877b55).stroke({color:0x696a50,width:1});
  for (const [index, x] of [-13,-7,0,7,13].entries()) {
    const y = index % 2 ? -19 : -13;
    const foot = x * .24;
    base.moveTo(foot,0).quadraticCurveTo(foot,-3,foot*1.4,-6).stroke({color:0x6a7950,width:1.5,cap:'round'});
    living.moveTo(foot,0).quadraticCurveTo(x*.85,-6,x,y).stroke({color:0x618451,width:1.4,cap:'round'});
    living.moveTo(x*.6,-5).quadraticCurveTo(x+2,-13,x+6,-12).quadraticCurveTo(x+5,-7,x*.6,-5).closePath().fill(0x99ad5f);
    living.moveTo(x*.7,-7).quadraticCurveTo(x-4,-13,x-5,-13).quadraticCurveTo(x-5,-9,x*.7,-7).closePath().fill(0x788f52);
    living.ellipse(x,y,fiber?3:2.7,fiber?3.5:2.1).fill(fiber?0xe6d8ac:0xe4bd81);
    living.circle(x-1,y-1,1).fill(0xffedc1);
  }
}

function caption(text: string, size: number, color: number, y: number) {
  const label = new Text({ text, style: { fontFamily:font, fontSize:size, fill:color, stroke:{color:0x302e31,width:3} } });
  label.anchor.set(.5,1);
  label.y = y;
  return label;
}

export class ResourceView {
  readonly root: Container;
  private readonly art = new Container();
  private readonly living = new Graphics();
  private readonly status = caption('',10,0xffdda1,-41);
  private readonly progress = new Container({ y:-38 });
  private readonly fill = new Graphics().roundRect(0,1,38,3,1.3).fill(0xeac16d);
  private mode?: 'available' | 'depleted' | 'gathering';

  constructor(private node: ResourceNode) {
    this.root = new Container({ label:`resource:${node.id}`, x:node.x, y:node.y });
    this.root.zIndex = node.y;
    const base = new Graphics();
    if (node.kind === 'wood') drawWood(base,this.living);
    else if (node.kind === 'crystal' || node.kind === 'metal') drawOre(base,this.living,node.kind === 'metal');
    else drawPlants(base,this.living,node.kind === 'fiber');
    this.art.addChild(base,this.living);
    const name = caption(node.name,11,0xf2e2ba,-23);
    if (node.kind === 'crystal') name.y = -39;
    this.status.y = name.y - 16;
    this.progress.y = name.y - 16;
    const track = new Graphics().roundRect(-20,0,40,5,2).fill({color:0x302637,alpha:.82})
      .stroke({color:0xc9a574,width:.8});
    this.fill.x = -19;
    this.progress.addChild(track,this.fill);
    this.root.addChild(this.art,name,this.status,this.progress);
  }

  update(node: ResourceNode, serverTime: number, gathering: Snapshot['gathering']) {
    this.node = node;
    this.root.position.set(node.x,node.y);
    this.root.zIndex = node.y;
    const ownGathering = gathering?.nodeId === node.id;
    const mode = ownGathering ? 'gathering' : node.availableAt > serverTime ? 'depleted' : 'available';
    if (mode !== this.mode) {
      this.mode = mode;
      this.art.alpha = mode === 'depleted' ? .65 : 1;
      this.living.visible = mode !== 'depleted';
      this.status.visible = mode !== 'available';
      this.status.text = mode === 'gathering' ? '采集中…' : '已枯竭';
      this.progress.visible = mode === 'gathering';
      this.root.cursor = mode === 'depleted' ? 'not-allowed' : 'pointer';
    }
    if (ownGathering) this.tick(serverTime,gathering.endsAt);
  }

  tick(serverTime: number, endsAt: number) {
    const amount = Math.max(0,Math.min(1,1 - (endsAt - serverTime) / Math.max(1,this.node.duration)));
    this.fill.scale.x = amount;
  }
}
