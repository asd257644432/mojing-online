import type { Container } from 'pixi.js';
import type { WeaponAppearance } from '../../../shared/appearance';
import { StarterRigParts } from './starter-rig-parts';

export const playerWeaponParts = {
  'warrior-starter-sword': {
    bounds: [207, 177, 430, 1153], pivot: [317, 1004], width: 8.5, height: 27,
    tip: [317, 182],
  },
  'warrior-steel-sword': {
    bounds: [786, 50, 1083, 1158], pivot: [934, 1005], width: 12.5, height: 35,
    tip: [934, 54],
  },
} as const;

export function showPlayerWeapon(weapon: Container, alternatives: readonly { key: string; sprite: Container }[], appearance?: WeaponAppearance) {
  let replacement = false;
  for (const { key, sprite } of alternatives) {
    sprite.visible = appearance === key;
    replacement ||= sprite.visible;
  }
  weapon.visible = appearance !== '' && !replacement;
}

/** Cutouts share the sheet source while each loaded atlas owns its framed textures. */
export class PlayerWeaponAtlas {
  static async load() {
    return new PlayerWeaponAtlas(await StarterRigParts.load('/assets/characters/warrior-weapons.png', 'player-weapon', playerWeaponParts, 1));
  }

  private constructor(private readonly art: StarterRigParts<keyof typeof playerWeaponParts>) {}

  create(parent: Container) {
    return (Object.keys(playerWeaponParts) as (keyof typeof playerWeaponParts)[]).map(key => {
      const sprite = this.art.piece(parent, key);
      const tip = this.art.offset(key, sprite, playerWeaponParts[key].tip);
      sprite.rotation = -Math.PI / 2 - Math.atan2(tip.y, tip.x);
      sprite.visible = false;
      return { key, sprite };
    });
  }

  destroy() { this.art.destroy(); }
}
