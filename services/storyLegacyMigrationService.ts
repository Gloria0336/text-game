import {
  ActorState,
  DEFAULT_ACTORS,
  DEFAULT_CAMPAIGN,
  DEFAULT_DIRECTOR,
  DEFAULT_MEMORY_GRAPH,
  LegacyCharacter,
  LegacyGameState,
  LegacyLoreEntry,
  LegacySaveEnvelope,
  LegacyStoryState,
  StoryAppState,
} from '../storyCoreTypes';
import { appendMemory, ingestRelationshipGraph } from './storyMemoryService';

const LEGACY_PROFILE_LIST_KEY = 'rpg_profiles';
const LEGACY_SAVE_PREFIX = 'rpg_save_';

function createMigratedPlayerActor(character: LegacyCharacter | undefined, selectedModel: string): ActorState {
  const base = DEFAULT_ACTORS.find((actor) => actor.id === 'player-1')!;
  const name = character?.name?.trim() || base.name;
  const roleClass = [character?.race, character?.class].filter(Boolean).join(' ');

  return {
    ...base,
    name,
    tagline: roleClass || base.tagline,
    description: character?.background || base.description,
    publicBio: character?.stateDescription || base.publicBio,
    privateNotes: character?.background || base.privateNotes,
    status: character?.stateDescription || base.status,
    modelConfig: {
      ...base.modelConfig,
      model: selectedModel,
    },
  };
}

function createActorsFromLegacyLore(
  loreBook: LegacyLoreEntry[] | undefined,
  selectedModel: string
): ActorState[] {
  const defaultNpcTemplates = DEFAULT_ACTORS.filter((actor) => actor.role === 'npc');
  const npcLore = (loreBook || []).filter((entry) => entry.category === 'npc' && entry.title && entry.content);

  if (npcLore.length === 0) {
    return defaultNpcTemplates.map((actor) => ({
      ...actor,
      modelConfig: {
        ...actor.modelConfig,
        model: selectedModel,
      },
    }));
  }

  return npcLore.slice(0, 4).map((entry, index) => {
    const template = defaultNpcTemplates[index % defaultNpcTemplates.length];
    return {
      ...template,
      id: `legacy-npc-${index + 1}`,
      name: entry.title || template.name,
      tagline: '自舊版傳說條目匯入',
      description: entry.content || template.description,
      publicBio: entry.content || template.publicBio,
      privateNotes: entry.content || template.privateNotes,
      modelConfig: {
        ...template.modelConfig,
        model: selectedModel,
      },
    };
  });
}

function migrateStoryStateEntries(
  state: LegacyStoryState | undefined,
  turn: number,
  playerActorId: string
) {
  if (!state) {
    return DEFAULT_MEMORY_GRAPH;
  }

  let graph = DEFAULT_MEMORY_GRAPH;
  const publicFields = [
    ['Active Threads', state.activeThreads],
    ['NPC States', state.npcStates],
    ['Planted Payoffs', state.plantedPayoffs],
    ['Arc Position', state.arcPosition],
  ] as const;

  for (const [title, content] of publicFields) {
    if (!content) {
      continue;
    }

    graph = appendMemory(graph, {
      scope: 'public',
      category: 'story_state',
      title,
      content,
      tags: ['legacy', 'story-state'],
      createdAtTurn: turn,
      updatedAtTurn: turn,
    });
  }

  if (state.pcShift) {
    graph = appendMemory(graph, {
      scope: 'private',
      category: 'story_state',
      ownerActorId: playerActorId,
      title: 'Player Shift',
      content: state.pcShift,
      tags: ['legacy', 'player-shift'],
      createdAtTurn: turn,
      updatedAtTurn: turn,
    });
  }

  return graph;
}

function migrateLoreEntries(
  loreBook: LegacyLoreEntry[] | undefined,
  turn: number,
  graph: StoryAppState['memoryGraph']
) {
  let nextGraph = graph;

  for (const entry of loreBook || []) {
    if (!entry.title || !entry.content) {
      continue;
    }

    nextGraph = appendMemory(nextGraph, {
      scope: entry.category === 'hidden_plot' ? 'director' : 'public',
      category: 'lore',
      title: entry.title,
      content: entry.content,
      tags: ['legacy', entry.category || 'lore'],
      createdAtTurn: entry.lockedAt || turn,
      updatedAtTurn: entry.lockedAt || turn,
    });
  }

  return nextGraph;
}

function migrateSceneLog(legacy: LegacyGameState, playerActorName: string) {
  const messages = legacy.messages || [];
  return messages
    .filter((message) => message.content)
    .map((message, index) => ({
      id: `legacy-scene-${index}`,
      turn: index + 1,
      actorId: message.role === 'user' ? 'player-1' : 'gm',
      actorName: message.role === 'user' ? playerActorName : 'Scene Master',
      actorRole: message.role === 'user' ? ('player' as const) : ('gm' as const),
      visibility: 'public' as const,
      kind: message.role === 'user' ? ('user_action' as const) : ('gm_narration' as const),
      content: message.content || '',
      timestamp: Date.now() + index,
    }));
}

function migrateChronicleEntries(legacy: LegacyGameState) {
  return (legacy.chronicle || [])
    .filter((entry) => entry.event)
    .map((entry, index) => ({
      turn: entry.turn ?? index + 1,
      event: entry.event || '',
    }));
}

function migrateChronicleMemories(
  legacy: LegacyGameState,
  graph: StoryAppState['memoryGraph']
) {
  let nextGraph = graph;
  for (const entry of legacy.chronicle || []) {
    if (!entry.event) {
      continue;
    }
    nextGraph = appendMemory(nextGraph, {
      scope: 'public',
      category: 'chronicle',
      title: `Chronicle T${entry.turn ?? 0}`,
      content: entry.event,
      tags: ['legacy', 'chronicle'],
      createdAtTurn: entry.turn ?? 0,
      updatedAtTurn: entry.turn ?? 0,
    });
  }
  return nextGraph;
}

export function migrateLegacySave(
  rawSave: string,
  profileName: string
): StoryAppState | null {
  let parsed: LegacySaveEnvelope | LegacyGameState;

  try {
    parsed = JSON.parse(rawSave) as LegacySaveEnvelope | LegacyGameState;
  } catch {
    return null;
  }

  const legacy = 'gameState' in parsed ? parsed.gameState : parsed;
  if (!legacy) {
    return null;
  }

  const selectedModel = legacy.selectedModel || '';
  const playerActor = createMigratedPlayerActor(legacy.character, selectedModel);
  const npcs = createActorsFromLegacyLore(legacy.loreBook, selectedModel);
  const actors = [
    {
      ...DEFAULT_ACTORS.find((actor) => actor.role === 'gm')!,
      modelConfig: {
        ...DEFAULT_ACTORS.find((actor) => actor.role === 'gm')!.modelConfig,
        model: selectedModel,
      },
    },
    playerActor,
    ...npcs,
  ];
  const importedSceneLog = migrateSceneLog(legacy, playerActor.name);
  const turn = legacy.turnCount || importedSceneLog.length || 0;
  let memoryGraph = migrateStoryStateEntries(legacy.storyState, turn, playerActor.id);
  memoryGraph = migrateLoreEntries(legacy.loreBook, turn, memoryGraph);
  memoryGraph = migrateChronicleMemories(legacy, memoryGraph);
  memoryGraph = ingestRelationshipGraph(memoryGraph, DEFAULT_CAMPAIGN.relationshipGraph, turn);

  const migrationNotes = [
    `已匯入舊版檔案「${profileName}」。`,
    '舊版 StoryState 已轉換為故事狀態記憶。',
    '舊版 LoreBook 條目已搬移為公開或導演記憶。',
  ];

  return {
    apiKey: legacy.apiKey || '',
    selectedModel,
    models: [],
    appMode: 'player',
    showSettings: true,
    isLoading: false,
    error: null,
    userProfile: `舊檔-${profileName}`,
    availableProfiles: [],
    selectedActorId: playerActor.id,
    campaign: {
      ...DEFAULT_CAMPAIGN,
      world: {
        name: legacy.world?.name || DEFAULT_CAMPAIGN.world.name,
        description: legacy.world?.description || DEFAULT_CAMPAIGN.world.description,
        promptMix: legacy.world?.promptMix || DEFAULT_CAMPAIGN.world.promptMix,
      },
      currentScene:
        importedSceneLog[importedSceneLog.length - 1]?.content || DEFAULT_CAMPAIGN.currentScene,
      currentArc: legacy.storyState?.arcPosition || DEFAULT_CAMPAIGN.currentArc,
      turn,
      activeActorIds: actors.filter((actor) => actor.isActiveInScene).map((actor) => actor.id),
      sceneLog:
        importedSceneLog.length > 0 ? importedSceneLog : DEFAULT_CAMPAIGN.sceneLog,
      chronicle:
        migrateChronicleEntries(legacy).length > 0
          ? migrateChronicleEntries(legacy)
          : DEFAULT_CAMPAIGN.chronicle,
    },
    actors,
    director: DEFAULT_DIRECTOR,
    memoryGraph,
    directorLog:
      legacy.gmMessages
        ?.filter((message) => message.content)
        .map((message) => ({
          role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: message.content || '',
        })) || [],
    migrationNotes,
  };
}

export function importLegacyProfiles(storage: Storage): string[] {
  const legacyProfilesRaw = storage.getItem(LEGACY_PROFILE_LIST_KEY);
  if (!legacyProfilesRaw) {
    return [];
  }

  try {
    const profiles = JSON.parse(legacyProfilesRaw) as string[];
    return profiles.filter(Boolean);
  } catch {
    return [];
  }
}

export function getLegacySave(storage: Storage, profileName: string): string | null {
  return storage.getItem(`${LEGACY_SAVE_PREFIX}${profileName}`);
}
