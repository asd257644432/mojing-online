import { BeeRigAtlas } from './bee-rig';
import { ButterflyRigAtlas } from './butterfly-rig';
import { ElderRigAtlas } from './elder-rig';
import { MushroomRigAtlas } from './monster-atlas';
import type { RigAtlases } from './rigs';
import { RangerRigAtlas } from './textured-rig';
import { TownNpcRigAtlas } from './town-npc-rig';
import { RodentRigAtlas } from './rodent-rig';
import { SmithRigAtlas } from './smith-rig';
import { PuppetRigAtlas } from './puppet-rig';
import { PlayerClassRigAtlas, playerClassRigProfiles } from './player-class-rig';
import { priestRigProfiles } from './priest-rig-profile';
import { merchantRigProfiles } from './merchant-rig-profile';
import { rogueRigProfiles } from './rogue-rig-profile';
import { RabbitRigAtlas } from './rabbit-rig';
import { ScarecrowRigAtlas } from './scarecrow-rig';
import { TreeDemonRigAtlas } from './tree-demon-rig';

export type RigAtlasKey = keyof RigAtlases;
type RigAtlasInstances = Required<RigAtlases>;
export type RigAtlasLoaders = {
  [Key in RigAtlasKey]: () => Promise<RigAtlasInstances[Key]>;
};

const defaultLoaders: RigAtlasLoaders = {
  warriorMale: () => PlayerClassRigAtlas.load(playerClassRigProfiles.warriorMale),
  warriorFemale: () => PlayerClassRigAtlas.load(playerClassRigProfiles.warriorFemale),
  mageMale: () => PlayerClassRigAtlas.load(playerClassRigProfiles.mageMale),
  mageFemale: () => PlayerClassRigAtlas.load(playerClassRigProfiles.mageFemale),
  rogueMale: () => PlayerClassRigAtlas.load(rogueRigProfiles.rogueMale),
  rogueFemale: () => PlayerClassRigAtlas.load(rogueRigProfiles.rogueFemale),
  priestMale: () => PlayerClassRigAtlas.load(priestRigProfiles.priestMale),
  priestFemale: () => PlayerClassRigAtlas.load(priestRigProfiles.priestFemale),
  merchantMale: () => PlayerClassRigAtlas.load(merchantRigProfiles.merchantMale),
  merchantFemale: () => PlayerClassRigAtlas.load(merchantRigProfiles.merchantFemale),
  islandRabbit: () => RabbitRigAtlas.load(),
  islandScarecrow: () => ScarecrowRigAtlas.load(),
  puppet: () => PuppetRigAtlas.load(),
  treeDemon: () => TreeDemonRigAtlas.load(),
  rodent: () => RodentRigAtlas.load(),
  smith: () => SmithRigAtlas.load(),
  ranger: () => RangerRigAtlas.load(),
  mushroom: () => MushroomRigAtlas.load(),
  elder: () => ElderRigAtlas.load(),
  bee: () => BeeRigAtlas.load(),
  butterfly: () => ButterflyRigAtlas.load(),
  townNpc: () => TownNpcRigAtlas.load(),
  capitalMerchant: () => TownNpcRigAtlas.load('capitalMerchant'),
  villageFather: () => TownNpcRigAtlas.load('villageFather'),
  villageSusan: () => TownNpcRigAtlas.load('villageSusan'),
};

export class RigAssets {
  readonly atlases: RigAtlases = {};
  private readonly requests = new Map<RigAtlasKey, Promise<void>>();
  private onReady?: (key: RigAtlasKey) => void;

  constructor(
    onReady: (key: RigAtlasKey) => void,
    private readonly loaders: RigAtlasLoaders = defaultLoaders,
  ) {
    this.onReady = onReady;
  }

  request<Key extends RigAtlasKey>(key: Key): Promise<void> {
    if (!this.onReady) return Promise.resolve();
    const existing = this.requests.get(key);
    if (existing) return existing;

    const request = Promise.resolve().then(async () => {
      if (!this.onReady) return;

      let atlas: RigAtlasInstances[Key];
      try {
        atlas = await this.loaders[key]();
      } catch (error) {
        console.warn(`Unable to load the ${key} rig atlas. Using the fallback rig.`, error);
        return;
      }

      const onReady = this.onReady;
      if (!onReady) {
        atlas.destroy();
        return;
      }
      this.atlases[key] = atlas;
      onReady(key);
    });
    this.requests.set(key, request);
    return request;
  }

  destroy() {
    if (!this.onReady) return;
    // A pending loader can outlive the scene that supplied this callback.
    this.onReady = undefined;
    this.requests.clear();
    for (const key of Object.keys(this.atlases) as RigAtlasKey[]) {
      const atlas = this.atlases[key];
      delete this.atlases[key];
      atlas?.destroy();
    }
  }
}
