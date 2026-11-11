import { gameDayStart } from '../../../shared/calendar';
import type { QuestDef, Snapshot } from '../../../shared/types';
import { canAcceptQuest, currentQuestProgress } from '../../../shared/quests';

export type QuestMarker = 'active' | 'available' | 'ready';
const priority: Record<QuestMarker, number> = { active: 1, available: 2, ready: 3 };
type QuestPlayer = Pick<Snapshot['self'], 'id' | 'level' | 'quests'>;

// Objective counts do not change the marker until the server changes the quest status.
export function questMarkerSignature(player: QuestPlayer, time: number): string {
  return JSON.stringify([player.id, player.level, gameDayStart(time),
    player.quests.map(quest => [quest.id, quest.status, quest.completedAt])]);
}

export function questMarkers(definitions: readonly QuestDef[], player: QuestPlayer, time: number): Map<string, QuestMarker> {
  const progressById = new Map(player.quests.map(progress => [progress.id, progress]));
  const markers = new Map<string, QuestMarker>();
  for (const quest of definitions) {
    const progress = currentQuestProgress(quest, progressById.get(quest.id), time);
    if (progress?.status === 'complete') continue;
    if (!progress && !canAcceptQuest(quest, player.level, quest.requires ? progressById.get(quest.requires) : undefined)) continue;
    const mark = progress?.status ?? 'available';
    const npcId = progress ? quest.turnIn : quest.npc;
    const previous = markers.get(npcId);
    if (!previous || priority[mark] > priority[previous]) markers.set(npcId, mark);
  }
  return markers;
}
