import type { PlayerClassRigProfile } from './player-class-rig';
import type { StarterPart } from './starter-rig-parts';

type Pixel = readonly [number, number];

function part(bounds: StarterPart['bounds'], pivot: Pixel, width: number, height: number): StarterPart {
  return { bounds, pivot, width, height };
}

function bone(bounds: StarterPart['bounds'], pivot: Pixel, tip: Pixel, width: number): StarterPart {
  return { bounds, pivot, tip, width };
}

export const merchantRigProfiles = {
  merchantMale: {
    style: 'merchant', path: '/assets/characters/merchant-male-rig.png', label: 'player-merchant-male',
    armLengths: [8.6, 8.8], hipSpread: 4.5, height: 73, hitHalfWidth: 22,
    front: { neck: [787, 66], shoulders: [[707, 104], [861, 104]], waist: [783, 237] },
    rear: { neck: [1099, 58], shoulders: [[1024, 99], [1178, 99]], waist: [1098, 234], accessory: [1099, 64] },
    weaponTip: [157, 1038],
    cutouts: {
      frontHead: part([30, 15, 289, 307], [162, 289], 28, 31),
      backHead: part([353, 19, 594, 298], [473, 282], 28, 31),
      frontTorso: part([683, 30, 884, 259], [783, 237], 22, 22),
      backTorso: part([1001, 29, 1198, 257], [1098, 234], 22, 22),
      leftUpperArm: bone([67, 367, 235, 591], [187, 391], [129, 552], 8.2),
      rightUpperArm: bone([397, 367, 560, 589], [444, 390], [499, 550], 8.2),
      leftForearm: bone([716, 354, 860, 609], [815, 373], [765, 551], 8),
      rightForearm: bone([1041, 361, 1178, 594], [1084, 381], [1134, 547], 8),
      leftThigh: bone([58, 658, 232, 906], [154, 684], [145, 883], 8.6),
      rightThigh: bone([394, 658, 567, 905], [472, 684], [479, 883], 8.6),
      leftShin: bone([665, 650, 862, 921], [794, 672], [756, 911], 8),
      rightShin: bone([1022, 650, 1206, 921], [1091, 672], [1118, 911], 8),
      weapon: part([61, 956, 252, 1214], [157, 1166], 18.5, 26),
      frontSkirt: part([342, 1013, 596, 1167], [470, 1041], 24, 9),
      backSkirt: part([666, 1014, 899, 1167], [783, 1039], 24, 9),
      accessory: part([1031, 1061, 1162, 1133], [1098, 1076], 12, 5),
    },
  },
  merchantFemale: {
    style: 'merchant', path: '/assets/characters/merchant-female-rig.png', label: 'player-merchant-female',
    armLengths: [8.5, 8.7], hipSpread: 4.3, height: 73, hitHalfWidth: 22,
    front: { neck: [782, 104], shoulders: [[707, 135], [843, 133]], waist: [775, 280] },
    rear: { neck: [1079, 88], shoulders: [[1011, 137], [1138, 135]], waist: [1074, 278], accessory: [1077, 94] },
    weaponTip: [159, 1045],
    cutouts: {
      frontHead: part([74, 44, 274, 306], [163, 283], 27.5, 33),
      backHead: part([374, 45, 570, 302], [472, 278], 27.5, 33),
      frontTorso: part([679, 57, 871, 311], [775, 280], 21.5, 23),
      backTorso: part([989, 59, 1160, 304], [1074, 278], 21.5, 23),
      leftUpperArm: bone([90, 375, 228, 585], [180, 403], [126, 544], 8),
      rightUpperArm: bone([397, 375, 535, 585], [443, 404], [498, 544], 8),
      leftForearm: bone([687, 365, 838, 608], [799, 386], [742, 550], 7.6),
      rightForearm: bone([1030, 364, 1161, 590], [1068, 384], [1121, 551], 7.6),
      leftThigh: bone([84, 666, 235, 889], [157, 689], [145, 864], 8),
      rightThigh: bone([397, 667, 543, 893], [469, 690], [476, 869], 8),
      leftShin: bone([686, 646, 837, 914], [772, 670], [753, 904], 7.8),
      rightShin: bone([1014, 646, 1160, 915], [1077, 670], [1090, 905], 7.8),
      weapon: part([71, 954, 249, 1226], [159, 1175], 18, 27),
      frontSkirt: part([342, 1004, 590, 1164], [469, 1032], 23, 9),
      backSkirt: part([651, 1005, 894, 1164], [773, 1032], 23, 9),
      accessory: part([1015, 1054, 1152, 1130], [1084, 1069], 12, 5),
    },
  },
} as const satisfies Record<string, PlayerClassRigProfile>;
