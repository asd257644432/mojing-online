import { Container, type Sprite } from 'pixi.js';
import type { MapDef, Point } from '../../../shared/types';

const chunk = 512;
const prefetchInterval = 32;
interface TilePosition { col: number; row: number; key: string; }

export abstract class ChunkedGround {
  readonly root: Container;
  private readonly tiles = new Map<string,Sprite>();
  private visible = new Set<string>();
  private fringe: TilePosition[] = [];
  private viewportKey = '';
  private capacity = 0;
  private nextPrefetchAt = 0;

  constructor(protected readonly map: MapDef, label: string) {
    this.root = new Container({ label });
  }

  updateView(origin:Point,width:number,height:number) {
    if (this.root.destroyed) return;
    const maxX = Math.ceil(this.map.width/chunk)-1, maxY = Math.ceil(this.map.height/chunk)-1;
    const firstX = Math.max(0,Math.floor(origin.x/chunk));
    const firstY = Math.max(0,Math.floor(origin.y/chunk));
    const lastX = Math.min(maxX,Math.ceil((origin.x+width)/chunk)-1);
    const lastY = Math.min(maxY,Math.ceil((origin.y+height)/chunk)-1);
    const key = `${firstX}:${firstY}:${lastX}:${lastY}`;
    if (key===this.viewportKey) {
      this.prefetch();
      return;
    }
    this.viewportKey = key;

    const visible = new Set<string>();
    for (let row=firstY;row<=lastY;row++) {
      for (let col=firstX;col<=lastX;col++) {
        const key = `${col}:${row}`;
        const tile = this.tile({ col, row, key });
        if (!tile.parent) this.root.addChild(tile);
        visible.add(key);
      }
    }
    for (const key of this.visible) if (!visible.has(key)) this.tiles.get(key)?.removeFromParent();
    this.visible = visible;

    const columns = lastX-firstX+1, rows = lastY-firstY+1;
    this.capacity = visible.size + 4*(Math.max(0,columns)+Math.max(0,rows)) + 4;
    this.trim();
    this.fringe = [];
    for (let row=Math.max(0,firstY-1);row<=Math.min(maxY,lastY+1);row++) {
      for (let col=Math.max(0,firstX-1);col<=Math.min(maxX,lastX+1);col++) {
        const key = `${col}:${row}`;
        if (!this.tiles.has(key)) this.fringe.push({ col, row, key });
      }
    }
    const centerX = (firstX+lastX)/2, centerY = (firstY+lastY)/2;
    const fromCenter = ({ col, row }: TilePosition) => (col-centerX)**2 + (row-centerY)**2;
    this.fringe.sort((a,b) => fromCenter(b)-fromCenter(a));
    this.nextPrefetchAt = performance.now() + prefetchInterval;
  }

  private tile({ col, row, key }: TilePosition) {
    const cached = this.tiles.get(key);
    if (cached) this.tiles.delete(key);
    const tile = cached ?? this.paintTile(col*chunk,row*chunk);
    this.tiles.set(key,tile);
    return tile;
  }

  private prefetch() {
    if (!this.fringe.length || performance.now() < this.nextPrefetchAt) return;
    // Detached neighbors do not participate in rendering or upload before entering the viewport.
    this.tile(this.fringe.pop()!);
    this.nextPrefetchAt = performance.now() + prefetchInterval;
    this.trim();
  }

  private trim() {
    for (const [id,tile] of this.tiles) {
      if (this.tiles.size<=this.capacity) break;
      if (this.visible.has(id)) continue;
      tile.destroy({texture:true,textureSource:true});
      this.tiles.delete(id);
    }
  }

  protected abstract paintTile(left: number, top: number): Sprite;

  destroy() {
    if (this.root.destroyed) return;
    for (const tile of this.tiles.values()) tile.destroy({texture:true,textureSource:true});
    this.root.destroy();
    this.tiles.clear();
    this.visible.clear();
    this.fringe = [];
  }
}
