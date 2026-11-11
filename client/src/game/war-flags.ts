import { Container, Graphics, Text } from 'pixi.js';
import type { Point } from '../../../shared/types';

function cloth() {
  return new Graphics().moveTo(0,0).quadraticCurveTo(12,-4,26,2).lineTo(22,8).lineTo(26,15)
    .quadraticCurveTo(13,10,0,15).closePath().fill(0xa95658).stroke({color:0xecc98d,width:1.45,join:'round'})
    .poly([11,3,16,6,13,10,8,7]).fill(0xffdb8b).circle(13,6.5,1.2).fill(0xffefb1);
}

export class WarFlags {
  readonly dropped = new Container({ label:'nation-war-dropped-flag', visible:false });
  readonly carried = new Container({ label:'nation-war-flag-holder', visible:false });
  private readonly droppedCloth = cloth();
  private readonly heldCloth = cloth();

  constructor() {
    this.dropped.addChild(new Graphics().ellipse(2,2,25,7).fill({color:0x332637,alpha:.37})
      .ellipse(0,0,21,5.5).stroke({color:0xffd28b,width:2,alpha:.85})
      .moveTo(0,-2).lineTo(0,-37).stroke({color:0x654954,width:4,cap:'round'})
      .moveTo(-.65,-4).lineTo(-.65,-39).stroke({color:0xd5a373,width:1.7,cap:'round'})
      .circle(-.4,-40,2.8).fill(0xffdea0));
    this.droppedCloth.y = -36;
    const name = new Text({text:'争夺战旗',style:{fontFamily:'PingFang SC, Microsoft YaHei, sans-serif',fontSize:12,fill:0xffe8b2,stroke:{color:0x4b3440,width:3}}});
    name.anchor.set(.5,1);
    name.position.set(6,-44);
    this.dropped.addChild(this.droppedCloth,name);
    this.carried.addChild(new Graphics().moveTo(0,2).lineTo(0,-18)
      .stroke({color:0xe8c893,width:2.1,cap:'round'}).circle(0,-19,1.9).fill(0xffe0aa));
    this.heldCloth.y = -17;
    this.heldCloth.scale.set(.69);
    this.carried.addChild(this.heldCloth);
  }

  drop(at?: Point) {
    this.dropped.visible = !!at;
    if (!at) return;
    this.dropped.position.set(at.x,at.y);
    this.dropped.zIndex = at.y;
  }

  carry(at?: Point) {
    this.carried.visible = !!at;
    if (at) this.carried.position.set(at.x,at.y);
  }

  animate(time: number) {
    const wind = Math.sin(time*.005);
    if (this.dropped.visible) this.droppedCloth.rotation = .06+wind*.07;
    if (this.carried.visible) this.heldCloth.rotation = .06+wind*.07;
  }
}
