import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Rig } from './rigs';

const atlasPath = '/assets/characters/village-npcs.png';
const atlasSize = 1254;
const bounds = {
  head: [46,51,231,248],
  torso: [63,344,213,267],
  arm: [115,668,129,258],
  leg: [115,980,109,233],
} as const;
type Part = keyof typeof bounds;

export class ElderRigAtlas {
  private readonly textures = new Map<Part,Texture>();

  static async load() {
    const sheet = await Assets.load<Texture>(atlasPath);
    if (sheet.width !== atlasSize || sheet.height !== atlasSize) {
      throw new Error(`Village NPC atlas must be ${atlasSize}×${atlasSize}`);
    }
    return new ElderRigAtlas(sheet);
  }

  private constructor(sheet: Texture) {
    for (const [name,[x,y,width,height]] of Object.entries(bounds) as [Part,(typeof bounds)[Part]][]) {
      this.textures.set(name,new Texture({source:sheet.source,frame:new Rectangle(x-3,y-3,width+6,height+6),label:`elder-${name}`}));
    }
  }

  private part(name: Part, x: number, y: number, width: number, height: number, pivotX: number, pivotY: number) {
    const texture = this.textures.get(name)!;
    const sprite = new Sprite({texture,x,y});
    sprite.anchor.set(pivotX,pivotY);
    sprite.scale.set(width/texture.width,height/texture.height);
    return sprite;
  }

  create(): Rig {
    const root = new Container({label:'village-elder-textured-rig'});
    const chest = new Container({y:-14.6});
    const torso = this.part('torso',0,0,24,31,.49,.92);
    const head = this.part('head',0,-25.6,30.6,33,.50,.92);
    const arms = ([-1,1] as const).map(side => {
      const arm = this.part('arm',side*9.3,-23.6,10.2,22,.54,.15);
      arm.scale.x *= -side;
      const leg = this.part('leg',side*4.8,-16.2,8.5,18.1,.51,.1);
      leg.scale.x *= -side;
      root.addChild(leg);
      return {side,arm};
    });
    chest.addChild(arms[0].arm,arms[1].arm,torso,head);
    root.addChild(chest);
    return {
      root,height:71,
      animate({time}) {
        const breath = Math.sin(time*2.45);
        chest.scale.y = 1+breath*.013;
        head.rotation = Math.sin(time*1.28+.9)*.027;
        for (const {side,arm} of arms) arm.rotation = side*(.09+Math.sin(time*2.12+side)*.034);
      },
    };
  }

  destroy() {
    for (const texture of this.textures.values()) texture.destroy(false);
    this.textures.clear();
  }
}
