import type { PlayerClassRigProfile } from './player-class-rig';
import type { StarterPart } from './starter-rig-parts';

type Pixel = readonly [number, number];

function part(bounds: StarterPart['bounds'], pivot: Pixel, width: number, height: number): StarterPart {
  return { bounds, pivot, width, height };
}

function bone(bounds: StarterPart['bounds'], pivot: Pixel, tip: Pixel, width: number): StarterPart {
  return { bounds, pivot, tip, width };
}

export const rogueRigProfiles = {
  rogueMale: {
    style: 'rogue', path: '/assets/characters/rogue-male-rig.png', label: 'player-rogue-male',
    armLengths: [8.3, 8.6], hipSpread: 4.4, height: 71, hitHalfWidth: 20,
    front: { neck: [782, 62], shoulders: [[690, 113], [879, 113]], waist: [781, 267] },
    rear: { neck: [1091, 60], shoulders: [[999, 110], [1187, 110]], waist: [1091, 267], accessory: [1091, 267] },
    weaponTip: [172, 964],
    cutouts: {
      frontHead: part([28, 26, 307, 308], [165, 299], 28, 31),
      backHead: part([348, 26, 609, 307], [474, 299], 28, 31),
      frontTorso: part([674, 51, 896, 291], [781, 267], 21, 21),
      backTorso: part([982, 50, 1203, 289], [1091, 267], 21, 21),
      leftUpperArm: bone([85, 353, 218, 606], [164, 378], [152, 590], 7.8),
      rightUpperArm: bone([411, 354, 546, 605], [470, 378], [479, 590], 7.8),
      leftForearm: bone([712, 349, 835, 602], [792, 367], [770, 558], 7.2),
      rightForearm: bone([1046, 349, 1168, 603], [1089, 370], [1120, 560], 7.2),
      leftThigh: bone([80, 656, 235, 912], [157, 679], [155, 895], 7.7),
      rightThigh: bone([393, 658, 546, 911], [469, 680], [468, 896], 7.7),
      leftShin: bone([676, 646, 852, 920], [786, 671], [755, 914], 8.0),
      rightShin: bone([1029, 647, 1202, 919], [1092, 674], [1124, 913], 8.0),
      weapon: part([119, 961, 191, 1235], [163, 1193], 9, 24),
      frontSkirt: part([346, 1019, 593, 1176], [470, 1030], 21, 8),
      backSkirt: part([661, 1018, 906, 1178], [783, 1030], 21, 8),
      accessory: part([1024, 1039, 1172, 1163], [1094, 1047], 7, 6),
    },
  },
  rogueFemale: {
    style: 'rogue', path: '/assets/characters/rogue-female-rig.png', label: 'player-rogue-female',
    armLengths: [8.3, 8.6], hipSpread: 4.2, height: 71, hitHalfWidth: 20,
    front: { neck: [780, 72], shoulders: [[694, 142], [869, 144]], waist: [780, 270] },
    rear: { neck: [1095, 73], shoulders: [[1007, 143], [1181, 144]], waist: [1095, 266], accessory: [1095, 266] },
    weaponTip: [191, 959],
    cutouts: {
      frontHead: part([77, 26, 272, 288], [176, 274], 28, 32),
      backHead: part([363, 22, 562, 284], [472, 272], 28, 32),
      frontTorso: part([671, 55, 891, 292], [780, 270], 21, 20.6),
      backTorso: part([987, 58, 1205, 284], [1095, 266], 21, 20.6),
      leftUpperArm: bone([102, 356, 243, 591], [166, 382], [154, 572], 7.8),
      rightUpperArm: bone([387, 356, 529, 592], [458, 382], [471, 575], 7.8),
      leftForearm: bone([727, 353, 832, 593], [791, 373], [770, 555], 7.2),
      rightForearm: bone([1046, 354, 1159, 604], [1085, 376], [1115, 561], 7.2),
      leftThigh: bone([86, 657, 238, 908], [156, 678], [162, 887], 7.7),
      rightThigh: bone([389, 657, 541, 908], [467, 678], [470, 888], 7.7),
      leftShin: bone([686, 656, 845, 909], [785, 675], [755, 902], 8.0),
      rightShin: bone([1035, 656, 1195, 910], [1092, 676], [1125, 902], 8.0),
      weapon: part([114, 956, 200, 1236], [158, 1190], 9, 24),
      frontSkirt: part([351, 1007, 591, 1188], [468, 1030], 21, 9),
      backSkirt: part([660, 1007, 906, 1188], [780, 1029], 21, 9),
      accessory: part([1019, 1030, 1168, 1167], [1095, 1042], 7, 6),
    },
  },
} as const satisfies Record<string, PlayerClassRigProfile>;
