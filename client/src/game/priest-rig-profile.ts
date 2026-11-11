import type { PlayerClassRigProfile } from './player-class-rig';
import type { StarterPart } from './starter-rig-parts';

type Pixel = readonly [number, number];

function part(bounds: StarterPart['bounds'], pivot: Pixel, width: number, height: number): StarterPart {
  return { bounds, pivot, width, height };
}

function bone(bounds: StarterPart['bounds'], pivot: Pixel, tip: Pixel, width: number): StarterPart {
  return { bounds, pivot, tip, width };
}

export const priestRigProfiles = {
  priestMale: {
    style: 'priest', path: '/assets/characters/priest-male-rig.png', label: 'player-priest-male',
    armLengths: [8.3, 8.6], hipSpread: 4.35, height: 73, hitHalfWidth: 20,
    front: { neck: [786, 52], shoulders: [[694, 104], [872, 104]], waist: [782, 281] },
    rear: { neck: [1098, 53], shoulders: [[1008, 111], [1185, 111]], waist: [1098, 278], accessory: [1098, 80] },
    weaponTip: [158, 1043],
    cutouts: {
      frontHead: part([63, 37, 264, 281], [162, 260], 28, 34),
      backHead: part([373, 37, 569, 284], [471, 266], 28, 34),
      frontTorso: part([672, 13, 892, 306], [782, 281], 22, 22),
      backTorso: part([990, 13, 1204, 301], [1098, 278], 22, 22),
      leftUpperArm: bone([59, 346, 230, 611], [179, 370], [117, 580], 8.2),
      rightUpperArm: bone([397, 346, 572, 611], [444, 370], [510, 580], 8.2),
      leftForearm: bone([704, 329, 838, 626], [790, 349], [760, 567], 7.8),
      rightForearm: bone([1038, 328, 1177, 618], [1093, 348], [1127, 568], 7.8),
      leftThigh: bone([82, 638, 222, 925], [150, 665], [147, 904], 7.6),
      rightThigh: bone([402, 638, 545, 925], [471, 665], [480, 904], 7.6),
      leftShin: bone([690, 644, 837, 927], [782, 669], [751, 920], 7.4),
      rightShin: bone([1041, 644, 1180, 928], [1090, 669], [1118, 921], 7.4),
      weapon: part([88, 961, 224, 1241], [156, 1200], 12, 27),
      frontSkirt: part([349, 963, 593, 1240], [470, 978], 25.5, 15.5),
      backSkirt: part([666, 963, 905, 1236], [784, 978], 25.5, 15.5),
      accessory: part([986, 1049, 1210, 1141], [1098, 1068], 15, 6.5),
    },
  },
  priestFemale: {
    style: 'priest', path: '/assets/characters/priest-female-rig.png', label: 'player-priest-female',
    armLengths: [8.3, 8.6], hipSpread: 4.2, height: 73, hitHalfWidth: 20,
    front: { neck: [783, 66], shoulders: [[700, 119], [876, 119]], waist: [784, 269] },
    rear: { neck: [1099, 65], shoulders: [[1009, 120], [1186, 120]], waist: [1098, 267], accessory: [1098, 91] },
    weaponTip: [158, 1041],
    cutouts: {
      frontHead: part([41, 9, 275, 305], [158, 264], 28, 35),
      backHead: part([359, 9, 584, 304], [474, 264], 28, 35),
      frontTorso: part([679, 36, 896, 293], [784, 269], 21.5, 21.6),
      backTorso: part([988, 33, 1209, 292], [1098, 267], 21.5, 21.6),
      leftUpperArm: bone([72, 342, 235, 598], [183, 365], [119, 568], 8.0),
      rightUpperArm: bone([392, 341, 554, 598], [445, 365], [491, 570], 8.0),
      leftForearm: bone([707, 342, 851, 594], [807, 362], [751, 532], 7.6),
      rightForearm: bone([1031, 343, 1176, 588], [1074, 363], [1137, 529], 7.6),
      leftThigh: bone([86, 645, 226, 917], [158, 667], [144, 895], 7.5),
      rightThigh: bone([402, 645, 542, 916], [470, 667], [490, 895], 7.5),
      leftShin: bone([674, 649, 840, 902], [790, 671], [749, 896], 7.2),
      rightShin: bone([1041, 650, 1208, 902], [1090, 671], [1126, 896], 7.2),
      weapon: part([98, 956, 216, 1240], [157, 1198], 12, 27),
      frontSkirt: part([344, 952, 595, 1242], [470, 968], 25.5, 15.5),
      backSkirt: part([662, 952, 911, 1240], [785, 969], 25.5, 15.5),
      accessory: part([972, 1055, 1224, 1156], [1098, 1076], 15, 6.5),
    },
  },
} as const satisfies Record<string, PlayerClassRigProfile>;
