import { Container } from 'pixi.js';
import type { ActorState } from '../../../shared/types';
import { BipedGait, bipedHipHeight, bipedSole, bipedThigh } from './biped-gait';
import { easeStarterPose as ease, mixStarterPose as mix, StarterRigParts, turnStarterViews, type StarterPart } from './starter-rig-parts';
import type { Rig, RigPose } from './rigs';
import { PlayerWeaponAtlas, showPlayerWeapon } from './player-weapon-rig';

export function shortPlayerActionRelease(actionTime: number) {
  return 1 - ease(actionTime / 217);
}

type Pixel = readonly [x: number, y: number];
type PlayerPart = 'frontHead' | 'backHead' | 'frontTorso' | 'backTorso'
  | 'leftUpperArm' | 'leftForearm' | 'rightUpperArm' | 'rightForearm'
  | 'leftThigh' | 'leftShin' | 'rightThigh' | 'rightShin'
  | 'weapon' | 'frontSkirt' | 'backSkirt' | 'accessory';

interface TorsoSockets {
  neck: Pixel;
  shoulders: readonly [left: Pixel, right: Pixel];
  waist: Pixel;
  accessory?: Pixel;
}

export interface PlayerClassRigProfile {
  style: 'warrior' | 'mage' | 'rogue' | 'priest' | 'merchant';
  path: string;
  label: string;
  cutouts: Record<PlayerPart, StarterPart>;
  front: TorsoSockets;
  rear: TorsoSockets;
  weaponTip: Pixel;
  armLengths: readonly [upper: number, forearm: number];
  hipSpread: number;
  height: number;
  hitHalfWidth: number;
}

function part(bounds: StarterPart['bounds'], pivot: Pixel, width: number, height: number): StarterPart {
  return { bounds, pivot, width, height };
}

function bone(bounds: StarterPart['bounds'], pivot: Pixel, tip: Pixel, width: number): StarterPart {
  return { bounds, pivot, tip, width };
}

// Pixel bounds and joint landmarks measured from the rebuilt 4×4 sheets.
export const playerClassRigProfiles = {
  warriorMale: {
    style: 'warrior', path: '/assets/characters/warrior-male-rig.png', label: 'player-warrior-male',
    armLengths: [8.3, 8.6], hipSpread: 4.7, height: 71, hitHalfWidth: 21,
    front: { neck: [785, 104], shoulders: [[704, 123], [858, 123]], waist: [784, 264] },
    rear: { neck: [1097, 103], shoulders: [[1015, 120], [1173, 120]], waist: [1097, 267] },
    weaponTip: [87, 968],
    cutouts: {
      frontHead: part([38, 7, 286, 309], [167, 300], 28.4, 33),
      backHead: part([355, 7, 598, 308], [475, 300], 28.4, 33),
      frontTorso: part([662, 79, 903, 275], [784, 264], 22.4, 21.5),
      backTorso: part([975, 81, 1218, 278], [1097, 267], 22.4, 21.5),
      leftUpperArm: bone([97, 355, 224, 595], [164, 380], [147, 574], 8.8),
      rightUpperArm: bone([404, 354, 531, 594], [465, 380], [480, 574], 8.8),
      leftForearm: bone([713, 366, 837, 612], [793, 385], [763, 570], 7.6),
      rightForearm: bone([1035, 363, 1156, 605], [1066, 378], [1103, 561], 7.6),
      leftThigh: bone([86, 675, 223, 911], [165, 698], [143, 891], 8.5),
      rightThigh: bone([398, 675, 539, 912], [454, 696], [480, 893], 8.5),
      leftShin: bone([688, 656, 836, 916], [791, 681], [752, 910], 8.8),
      rightShin: bone([1038, 664, 1163, 919], [1091, 687], [1109, 912], 8.8),
      weapon: part([82, 958, 229, 1234], [194, 1193], 14, 33),
      frontSkirt: part([364, 1039, 578, 1143], [470, 1051], 21, 6),
      backSkirt: part([675, 1039, 882, 1150], [779, 1051], 21, 6),
      accessory: part([1020, 1045, 1168, 1151], [1095, 1094], 8, 4),
    },
  },
  warriorFemale: {
    style: 'warrior', path: '/assets/characters/warrior-female-rig.png', label: 'player-warrior-female',
    armLengths: [8.3, 8.6], hipSpread: 4.5, height: 71, hitHalfWidth: 21,
    front: { neck: [789, 75], shoulders: [[702, 111], [868, 111]], waist: [788, 277] },
    rear: { neck: [1099, 69], shoulders: [[1018, 107], [1178, 109]], waist: [1099, 278] },
    weaponTip: [162, 967],
    cutouts: {
      frontHead: part([25, 26, 306, 303], [165, 294], 28.3, 31),
      backHead: part([349, 25, 615, 303], [480, 294], 28.3, 31),
      frontTorso: part([661, 45, 912, 292], [788, 277], 21.7, 20.5),
      backTorso: part([976, 49, 1223, 292], [1099, 278], 21.7, 20.5),
      leftUpperArm: bone([103, 345, 227, 600], [166, 378], [166, 577], 8.3),
      rightUpperArm: bone([406, 348, 527, 599], [466, 378], [463, 577], 8.3),
      leftForearm: bone([738, 347, 830, 607], [784, 367], [783, 561], 7.4),
      rightForearm: bone([1033, 348, 1151, 604], [1110, 368], [1086, 565], 7.4),
      leftThigh: bone([88, 657, 233, 903], [164, 681], [162, 886], 8.0),
      rightThigh: bone([402, 656, 543, 901], [471, 682], [471, 885], 8.0),
      leftShin: bone([701, 662, 843, 909], [784, 684], [770, 903], 8.2),
      rightShin: bone([1048, 664, 1163, 914], [1097, 686], [1111, 909], 8.2),
      weapon: part([123, 960, 217, 1231], [168, 1183], 14, 33),
      frontSkirt: part([348, 1006, 596, 1166], [472, 1020], 21, 9),
      backSkirt: part([662, 1005, 906, 1176], [784, 1020], 21, 9),
      accessory: part([1034, 1045, 1182, 1137], [1097, 1095], 8, 4),
    },
  },
  mageMale: {
    style: 'mage', path: '/assets/characters/mage-male-rig.png', label: 'player-mage-male',
    armLengths: [8.3, 8.6], hipSpread: 4.4, height: 71, hitHalfWidth: 19,
    front: { neck: [785, 83], shoulders: [[707, 113], [867, 115]], waist: [787, 280] },
    rear: { neck: [1098, 83], shoulders: [[1023, 112], [1177, 112]], waist: [1099, 280], accessory: [1098, 83] },
    weaponTip: [178, 956],
    cutouts: {
      frontHead: part([42, 14, 301, 301], [172, 287], 28.0, 31),
      backHead: part([349, 14, 606, 295], [473, 286], 28.0, 31),
      frontTorso: part([683, 67, 896, 294], [787, 280], 21.0, 20.6),
      backTorso: part([994, 67, 1203, 285], [1099, 280], 21.0, 20.6),
      leftUpperArm: bone([91, 355, 215, 586], [155, 378], [150, 563], 8.0),
      rightUpperArm: bone([416, 356, 538, 586], [475, 378], [478, 563], 8.0),
      leftForearm: bone([717, 363, 835, 587], [790, 382], [761, 548], 7.4),
      rightForearm: bone([1043, 364, 1174, 589], [1086, 384], [1134, 544], 7.4),
      leftThigh: bone([101, 654, 228, 912], [165, 680], [164, 894], 7.8),
      rightThigh: bone([403, 656, 532, 911], [464, 682], [466, 893], 7.8),
      leftShin: bone([685, 653, 839, 919], [789, 677], [756, 912], 8.0),
      rightShin: bone([1044, 653, 1190, 919], [1097, 680], [1125, 913], 8.0),
      weapon: part([94, 951, 230, 1231], [166, 1157], 17, 39),
      frontSkirt: part([339, 979, 594, 1215], [467, 988], 21, 17),
      backSkirt: part([649, 979, 915, 1210], [782, 988], 21, 17),
      accessory: part([991, 1049, 1197, 1153], [1094, 1055], 8, 4),
    },
  },
  mageFemale: {
    style: 'mage', path: '/assets/characters/mage-female-rig.png', label: 'player-mage-female',
    armLengths: [8.3, 8.6], hipSpread: 4.3, height: 71, hitHalfWidth: 19,
    front: { neck: [784, 57], shoulders: [[708, 96], [867, 97]], waist: [784, 278] },
    rear: { neck: [1099, 55], shoulders: [[1022, 95], [1171, 95]], waist: [1099, 276], accessory: [1099, 57] },
    weaponTip: [179, 954],
    cutouts: {
      frontHead: part([22, 19, 306, 299], [166, 287], 28.0, 31),
      backHead: part([346, 17, 614, 297], [482, 285], 28.0, 31),
      frontTorso: part([676, 38, 891, 296], [784, 278], 20.5, 20.8),
      backTorso: part([1000, 34, 1197, 285], [1099, 276], 20.5, 20.8),
      leftUpperArm: bone([103, 338, 216, 601], [160, 370], [141, 580], 8.0),
      rightUpperArm: bone([412, 338, 524, 602], [464, 369], [477, 580], 8.0),
      leftForearm: bone([709, 338, 831, 609], [793, 355], [752, 560], 7.3),
      rightForearm: bone([1054, 336, 1149, 607], [1081, 355], [1114, 570], 7.3),
      leftThigh: bone([93, 652, 222, 915], [157, 677], [151, 895], 7.7),
      rightThigh: bone([412, 649, 542, 915], [479, 675], [475, 895], 7.7),
      leftShin: bone([683, 648, 836, 922], [781, 670], [754, 914], 8.0),
      rightShin: bone([1046, 648, 1187, 923], [1091, 671], [1126, 915], 8.0),
      weapon: part([90, 948, 231, 1241], [168, 1164], 17, 39),
      frontSkirt: part([330, 986, 600, 1214], [468, 1000], 21, 12.5),
      backSkirt: part([644, 985, 920, 1221], [784, 1000], 21, 12.5),
      accessory: part([1012, 1051, 1178, 1170], [1097, 1061], 8, 4),
    },
  },
} as const satisfies Record<string, PlayerClassRigProfile>;

export class PlayerClassRigAtlas {
  static async load(profile: PlayerClassRigProfile) {
    const weapons = profile.style === 'warrior' ? PlayerWeaponAtlas.load().catch(error => {
      console.warn('Unable to load equipped sword art. Using the class weapon.', error);
      return undefined;
    }) : Promise.resolve(undefined);
    try {
      const art = await StarterRigParts.load(profile.path, profile.label, profile.cutouts, 4);
      return new PlayerClassRigAtlas(art, profile, await weapons);
    } catch (error) {
      (await weapons)?.destroy();
      throw error;
    }
  }

  private constructor(private readonly art: StarterRigParts<PlayerPart>, private readonly profile: PlayerClassRigProfile, private readonly weapons?: PlayerWeaponAtlas) {}

  create(state?: ActorState) {
    if (this.art.available) return buildPlayerClassRig(this.art, this.profile, this.weapons, state);
  }

  destroy() { this.art.destroy(); this.weapons?.destroy(); }
}

const sides = ['left', 'right'] as const;

function turnFromNeutral(target: number, neutral: number) {
  const delta = target - neutral;
  return neutral + Math.atan2(Math.sin(delta), Math.cos(delta));
}

function buildPlayerClassRig(art: StarterRigParts<PlayerPart>, profile: PlayerClassRigProfile, equipped?: PlayerWeaponAtlas, initialState?: ActorState): Rig {
  const { style, front, rear, armLengths: [upperLength, foreLength], hipSpread } = profile;
  const warrior = style === 'warrior';
  const rogue = style === 'rogue';
  const priest = style === 'priest';
  const merchant = style === 'merchant';
  const root = new Container({ label: `${profile.label}-articulated-rig` });
  const body = art.joint(root, 'body');
  const legs = sides.map((name, index) => {
    const side = index * 2 - 1;
    const hip = art.joint(body, `hip-${name}`, side * hipSpread, -bipedHipHeight);
    const thigh = art.link(hip, `${name}Thigh`, 1, side * bipedThigh.x, bipedThigh.y);
    // The priest's robe is the thigh silhouette, while both leg joints still drive the shoes.
    if (priest) thigh.visible = false;
    const knee = art.joint(hip, `knee-${name}`, side * bipedThigh.x, bipedThigh.y);
    art.link(knee, `${name}Shin`, 1, side * bipedSole.x, bipedSole.y);
    art.joint(knee, `sole-${name}`, side * bipedSole.x, bipedSole.y);
    return { side, hip, knee };
  });

  const chest = art.joint(body, 'chest', 0, -bipedHipHeight);
  chest.sortableChildren = true;
  const frontTorso = art.piece(chest, 'frontTorso');
  const backTorso = art.piece(chest, 'backTorso');
  const frontNeck = art.offset('frontTorso', frontTorso, front.neck);
  const backNeck = art.offset('backTorso', backTorso, rear.neck);
  const neck = art.joint(chest, 'neck', frontNeck.x, frontNeck.y);
  neck.zIndex = 3;
  const frontHead = art.piece(neck, 'frontHead');
  const backHead = art.piece(neck, 'backHead');

  const frontWaist = art.offset('frontTorso', frontTorso, front.waist);
  const backWaist = art.offset('backTorso', backTorso, rear.waist);
  const waist = art.joint(chest, 'waist', frontWaist.x, frontWaist.y);
  waist.zIndex = 1;
  const frontSkirt = art.piece(waist, 'frontSkirt');
  const backSkirt = art.piece(waist, 'backSkirt');
  const frontAccessory = front.accessory && art.offset('frontTorso', frontTorso, front.accessory);
  const backAccessory = rear.accessory && art.offset('backTorso', backTorso, rear.accessory);
  const accessoryFrom = frontAccessory ?? backAccessory;
  const accessoryTo = backAccessory ?? frontAccessory;
  const accessory = accessoryFrom ? art.piece(chest, 'accessory') : undefined;
  if (accessory) accessory.zIndex = priest || merchant ? .5 : 2;

  const arms = sides.map((name, index) => {
    const from = art.offset('frontTorso', frontTorso, front.shoulders[index]);
    const to = art.offset('backTorso', backTorso, rear.shoulders[index]);
    const shoulder = art.joint(chest, `shoulder-${name}`, from.x, from.y);
    art.link(shoulder, `${name}UpperArm`, 1, 0, upperLength);
    const elbow = art.joint(shoulder, `elbow-${name}`, 0, upperLength);
    art.link(elbow, `${name}Forearm`, 1, 0, foreLength);
    const palm = art.joint(elbow, `palm-${name}`, 0, foreLength);
    return { shoulder, elbow, palm, from, to };
  });
  const [freeArm, weaponArm] = arms;
  const grip = art.joint(weaponArm.palm, 'weapon-grip');
  const weapon = art.piece(grip, 'weapon');
  const tip = art.offset('weapon', weapon, profile.weaponTip);
  weapon.rotation = -Math.PI / 2 - Math.atan2(tip.y, tip.x);
  const equippedWeapons = equipped?.create(grip) ?? [];
  function showWeapon(state?: ActorState) {
    showPlayerWeapon(weapon, equippedWeapons, state?.weaponAppearance);
  }
  showWeapon(initialState);

  const gait = new BipedGait();
  gait.advance(0, 0, 0, 1, hipSpread, false);
  let lastTime: number | undefined;
  let yaw: number | undefined;
  let release = 0;
  let releaseAge = Infinity, rogueStrength = 1;
  let selfCast = false;
  let hammerStrike = false;
  let merchantActionAt: number | undefined;
  let merchantAction: ActorState['action'] | undefined;
  let aimX = 0, aimY = 1;
  let hitAge = Infinity, hitDirection = 0;
  let sneak = 0;

  function pose({ time, direction, action, actionTime, travelX = 0, travelY = 0, deltaSeconds }: RigPose, state?: ActorState) {
    const dt = Math.min(.06, Math.max(0, deltaSeconds ?? (lastTime === undefined ? 1 / 60 : time - lastTime)));
    lastTime = time;
    yaw ??= direction;
    const dead = action === 'dead';
    showWeapon(state ?? initialState);
    sneak += ((rogue && !dead && state?.stealthed ? 1 : 0) - sneak) * (1 - Math.exp(-dt * 14));
    const turn = Math.atan2(Math.sin(direction - yaw), Math.cos(direction - yaw));
    const blend = 1 - Math.exp(-dt * 17);
    if (!dead) yaw += turn * blend;
    const forward = Math.cos(yaw), depth = Math.sin(yaw);
    const back = ease((-depth - .06) / .58);
    turnStarterViews(frontTorso, backTorso, back);
    turnStarterViews(frontHead, backHead, back);
    turnStarterViews(frontSkirt, backSkirt, back);

    // These classes resolve hits on actionAt; present the release on that snapshot, then recover.
    const acting = action === 'attack' || action === 'cast';
    if (rogue || priest || merchant) {
      if (acting) {
        if (merchant) {
          const sameAction = merchantAction === action && merchantActionAt === state?.actionAt;
          releaseAge = sameAction ? releaseAge + dt * 1000 : actionTime;
          merchantAction = action;
          merchantActionAt = state?.actionAt;
        } else releaseAge = actionTime;
        if (rogue) rogueStrength = action === 'cast' ? .86 : 1;
        if (priest || merchant) selfCast = action === 'cast' && state?.selfCast === true;
        if (merchant) hammerStrike = action === 'attack';
      } else {
        releaseAge += dt * 1000;
        merchantAction = undefined;
      }
      // Keep contact readable when the first snapshot reaches a 30Hz renderer late.
      release = 1 - ease((releaseAge - (merchant ? 70 : 0)) / (rogue ? 180 : 200));
    } else release = acting ? shortPlayerActionRelease(actionTime) : release * Math.exp(-dt * 43);
    if (acting) { aimX = Math.cos(direction); aimY = Math.sin(direction); }
    const fallen = dead ? ease(actionTime / 410) : 0;
    const alive = 1 - fallen;
    hitAge += dt * 1000;
    const recoil = Math.sin(Math.PI * Math.min(1, hitAge / 166)) * alive;
    const delivered = release * alive;
    const outward = selfCast ? 0 : delivered;

    body.scale.x = 1 - Math.abs(forward) * .13;
    const step = gait.advance(travelX, travelY, dt, blend, hipSpread * body.scale.x,
      !acting && !dead && hitAge >= 81, true) * alive;
    const breath = Math.sin(time * 2.75) * alive;
    const lean = aimX * outward * (warrior ? .11 : rogue ? .085 : .056) + Math.cos(hitDirection) * recoil * .058 + forward * sneak * .075;
    body.y = gait.plant(legs, body.scale.x, lean, 1.2 - Math.abs(step) * .75 - breath * .22 + sneak * 2.4, true) + fallen * 4.2;
    body.rotation = lean + fallen * (forward >= 0 ? 1 : -1) * 1.43;
    body.alpha = 1 - fallen * .44;

    chest.x = aimX * outward * (warrior ? 3.0 : rogue ? 2.2 : 1.4) + Math.cos(hitDirection) * recoil * 1.65;
    chest.rotation = aimX * outward * .095 - step * .05;
    neck.position.set(mix(frontNeck.x, backNeck.x, back), mix(frontNeck.y, backNeck.y, back));
    neck.rotation = forward * .08 - chest.rotation * .49;
    waist.position.set(mix(frontWaist.x, backWaist.x, back), mix(frontWaist.y, backWaist.y, back));
    if (priest) {
      waist.rotation = -step * .04 + breath * .016 - forward * outward * .04 + recoil * .038;
      waist.scale.x = 1 + Math.abs(step) * .07;
    } else waist.rotation = -step * .105 + breath * .028 - forward * delivered * .11 + recoil * .057;
    if (accessory && accessoryFrom && accessoryTo) {
      accessory.position.set(mix(accessoryFrom.x, accessoryTo.x, back), mix(accessoryFrom.y, accessoryTo.y, back));
      accessory.alpha = frontAccessory ? backAccessory ? 1 : 1 - back : back;
      accessory.rotation = -step * .037 - chest.rotation * .24;
    }

    for (const { shoulder, from, to } of arms) {
      shoulder.position.set(mix(from.x, to.x, back), mix(from.y, to.y, back));
    }
    freeArm.shoulder.zIndex = forward > -.18 || selfCast && delivered > .16 ? 1.4 : -1;
    weaponArm.shoulder.zIndex = forward < .18 || delivered > .16 ? 1.5 : -1;

    let weaponTilt: number;
    if (rogue) {
      const thrust = delivered * rogueStrength;
      const theta = Math.atan2(aimY * .62, aimX);
      const elbowAngle = .24;
      const compensation = Math.atan2(foreLength * Math.sin(elbowAngle), upperLength + foreLength * Math.cos(elbowAngle));
      const aimedArm = theta - Math.PI / 2 - compensation;
      const armNeutral = -.22;
      const armBranch = armNeutral + Math.atan2(Math.sin(aimedArm - armNeutral), Math.cos(aimedArm - armNeutral));
      freeArm.shoulder.rotation = .18 - step * .24 + thrust * aimX * .28 + sneak * .18;
      freeArm.elbow.rotation = .18 + sneak * .3 - thrust * .12;
      weaponArm.shoulder.rotation = mix(armNeutral + step * .24 - sneak * .15, armBranch, thrust);
      weaponArm.elbow.rotation = mix(-.3 - sneak * .3, elbowAngle, thrust);
      const bladeNeutral = .25;
      const bladeTarget = theta + Math.PI / 2;
      const bladeBranch = bladeNeutral + Math.atan2(Math.sin(bladeTarget - bladeNeutral), Math.cos(bladeTarget - bladeNeutral));
      weaponTilt = mix(bladeNeutral + forward * .21 - sneak * .18, bladeBranch, thrust);
    } else if (merchant) {
      const aim = Math.atan2(aimY * .62, aimX);
      const hammerNeutral = .18;
      const idleHammer = hammerNeutral + forward * .14;
      const idleShoulder = -.24 + step * .23;
      const idleFree = .18 - step * .23;
      if (hammerStrike) {
        const elbow = .32;
        const compensation = Math.atan2(foreLength * Math.sin(elbow), upperLength + foreLength * Math.cos(elbow));
        const shoulder = turnFromNeutral(aim - Math.PI / 2 - compensation, -.24);
        weaponArm.shoulder.rotation = mix(idleShoulder, shoulder, delivered);
        weaponArm.elbow.rotation = mix(-.38, elbow, delivered);
        freeArm.shoulder.rotation = idleFree + delivered * aimX * .37;
        freeArm.elbow.rotation = .16 + delivered * .24;
        weaponTilt = mix(idleHammer, turnFromNeutral(aim + Math.PI / 2, hammerNeutral), delivered);
      } else {
        // Trap and support skills use the empty hand while the hammer stays in its carry pose.
        const gesture = selfCast ? -.2 : turnFromNeutral(aim - Math.PI / 2 - .35, .18);
        freeArm.shoulder.rotation = mix(idleFree, gesture, delivered);
        freeArm.elbow.rotation = mix(.16, selfCast ? -1.45 : .72, delivered);
        weaponArm.shoulder.rotation = mix(idleShoulder, .06, delivered);
        weaponArm.elbow.rotation = mix(-.38, -.60, delivered);
        weaponTilt = mix(idleHammer, .14 + forward * .14, delivered);
      }
    } else if (priest) {
      const freeNeutral = .12;
      const freeAim = Math.atan2(aimY * .62, aimX) - Math.PI / 2 - .16;
      const freeBranch = freeNeutral + Math.atan2(Math.sin(freeAim - freeNeutral), Math.cos(freeAim - freeNeutral));
      // Self-casts bring the free palm and upright staff together in front of the robe.
      freeArm.shoulder.rotation = mix(freeNeutral - step * .22, selfCast ? -.15 : freeBranch, delivered);
      freeArm.elbow.rotation = mix(.16, selfCast ? -1.62 : .32, delivered);
      weaponArm.shoulder.rotation = mix(-.14 + step * .14, selfCast ? .1 : -.26 - aimX * .4, delivered);
      weaponArm.elbow.rotation = mix(-.3, selfCast ? 1.62 : -.58 + aimX * .2, delivered);
      weaponTilt = mix(.12 + forward * .16, selfCast ? -.04 : aimX * .53 + aimY * .12, delivered);
    } else if (warrior) {
      freeArm.shoulder.rotation = .14 - step * .26 + delivered * aimX * .34;
      freeArm.elbow.rotation = .14 - delivered * .24;
      weaponArm.shoulder.rotation = -.19 + step * .26 - delivered * aimX * 1.1;
      weaponArm.elbow.rotation = -.25 - delivered * aimX * .4;
      const idleTilt = .26 + forward * .29;
      const aimedTilt = Math.atan2(aimY * .6, aimX) + Math.PI / 2;
      const sweep = Math.atan2(Math.sin(aimedTilt - .26), Math.cos(aimedTilt - .26));
      weaponTilt = mix(idleTilt, .26 + sweep, delivered);
    } else {
      const cast = delivered * (action === 'attack' ? .82 : 1);
      const armAim = Math.atan2(aimY * .6, aimX) - Math.PI / 2 - .18;
      const armSweep = Math.atan2(Math.sin(armAim - .18), Math.cos(armAim - .18));
      freeArm.shoulder.rotation = mix(.18 - step * .27, .18 + armSweep, cast);
      freeArm.elbow.rotation = mix(.12, .36, cast);
      weaponArm.shoulder.rotation = -.16 + step * .15 + delivered * .23;
      weaponArm.elbow.rotation = -.36 - delivered * .18;
      weaponTilt = .12 + forward * .20 + delivered * aimX * .42;
    }
    grip.rotation = weaponTilt - weaponArm.shoulder.rotation - weaponArm.elbow.rotation;
  }

  pose({ time: 0, direction: Math.PI / 2, moving: false, action: 'idle', actionTime: 0 });
  yaw = undefined;
  lastTime = undefined;
  return {
    root, height: profile.height, hitHalfWidth: profile.hitHalfWidth, animate: pose,
    reactToHit(direction, age) {
      if (age >= 166) return;
      hitAge = age;
      hitDirection = direction;
    },
  };
}
