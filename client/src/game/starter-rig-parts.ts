import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';

type Pixel = readonly [x: number, y: number];
export type StarterPart = {
  bounds: readonly [left: number, top: number, right: number, bottom: number];
  pivot: Pixel;
  width: number;
} & ({ height: number } | { tip: Pixel });

const size = 1254;
const padding = 3;

export class StarterRigParts<Key extends string> {
  private readonly textures = new Map<Key, Texture>();

  static async load<Key extends string>(path: string, label: string, specs: Record<Key, StarterPart>, columns: 1 | 3 | 4 = 3) {
    const sheet = await Assets.load<Texture>(path);
    if (sheet.width !== size || sheet.height !== size) throw new Error(`${label} atlas must be ${size}×${size}`);
    return new StarterRigParts(sheet, label, specs, columns);
  }

  private constructor(sheet: Texture, private readonly label: string, private readonly specs: Record<Key, StarterPart>, columns: 1 | 3 | 4) {
    const edge = (index: number) => Math.round(index * size / columns);
    for (const [key, { bounds: [left, top, right, bottom] }] of Object.entries(specs) as [Key, StarterPart][]) {
      const col = Math.floor(left * columns / size), row = Math.floor(top * columns / size);
      const x = Math.max(edge(col), left - padding), y = Math.max(edge(row), top - padding);
      const frame = new Rectangle(x, y, Math.min(edge(col + 1), right + padding) - x, Math.min(edge(row + 1), bottom + padding) - y);
      this.textures.set(key, new Texture({ source: sheet.source, frame, label: `${label}:${key}` }));
    }
  }

  get available() {
    return this.textures.size > 0;
  }

  joint(parent: Container, label: string, x = 0, y = 0) {
    return parent.addChild(new Container({ label: `${this.label}:${label}`, x, y }));
  }

  piece(parent: Container, key: Key, side = 1) {
    const texture = this.textures.get(key)!;
    const spec = this.specs[key];
    const { bounds: [left, top, right, bottom], pivot: [px, py], width } = spec;
    const sprite = new Sprite({ texture, label: `${this.label}:${key}${side < 0 ? '-mirror' : ''}` });
    sprite.anchor.set((px - texture.frame.x) / texture.width, (py - texture.frame.y) / texture.height);
    sprite.scale.set(side * width / (right - left), 'height' in spec ? spec.height / (bottom - top) : 1);
    return parent.addChild(sprite);
  }

  link(parent: Container, key: Key, side: number, x: number, y: number) {
    const spec = this.specs[key];
    if (!('tip' in spec)) throw new Error(`Missing joint tip for ${this.label}:${key}`);
    const sprite = this.piece(parent, key, side);
    const dx = (spec.tip[0] - spec.pivot[0]) * sprite.scale.x;
    const dy = Math.sqrt(x * x + y * y - dx * dx);
    sprite.scale.y = dy / (spec.tip[1] - spec.pivot[1]);
    sprite.rotation = Math.atan2(dx, dy) - Math.atan2(x, y);
    return sprite;
  }

  offset(key: Key, sprite: Sprite, [x, y]: Pixel) {
    const [px, py] = this.specs[key].pivot;
    return { x: (x - px) * sprite.scale.x, y: (y - py) * sprite.scale.y };
  }

  destroy() {
    for (const texture of this.textures.values()) texture.destroy(false);
    this.textures.clear();
  }
}

export const mixStarterPose = (from: number, to: number, ratio: number) => from + (to - from) * ratio;

export function easeStarterPose(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function turnStarterViews(front: Sprite, back: Sprite, rear: number) {
  front.alpha = Math.min(1, (1 - rear) * 2);
  back.alpha = Math.min(1, rear * 2);
  front.visible = front.alpha > 0;
  back.visible = back.alpha > 0;
}
