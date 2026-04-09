import {
  ActorState,
  AppMode,
  CampaignState,
  DEFAULT_ACTORS,
  DEFAULT_CAMPAIGN,
  DEFAULT_DIRECTOR,
  DEFAULT_MEMORY_GRAPH,
  DirectorState,
  MemoryGraphState,
  SceneEvent,
  StoryAppState,
  TurnPlan,
} from '../storyCoreTypes';
import { generateActorSceneEvent } from './storyAgentService';
import {
  appendMemory,
  getVisibleMemories,
  getVisibleSceneEvents,
  ingestRelationshipGraph,
  ingestSceneEvents,
} from './storyMemoryService';

interface RunTurnInput {
  apiKey: string;
  selectedModel: string;
  appMode: AppMode;
  selectedActorId: string;
  userInput: string;
  campaign: CampaignState;
  actors: ActorState[];
  director: DirectorState;
  memoryGraph: MemoryGraphState;
}

export interface RunTurnResult {
  campaign: CampaignState;
  actors: ActorState[];
  director: DirectorState;
  memoryGraph: MemoryGraphState;
  turnPlan: TurnPlan;
  emittedEvents: SceneEvent[];
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dedupe(ids: string[]): string[] {
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

function updateActorModels(actors: ActorState[], selectedModel: string): ActorState[] {
  return actors.map((actor) => ({
    ...actor,
    modelConfig: {
      ...actor.modelConfig,
      model: actor.modelConfig.model || selectedModel,
    },
  }));
}

function pickAiSpeakers(actors: ActorState[], selectedActorId: string): string[] {
  const gm = actors.find((actor) => actor.role === 'gm');
  const selectedActor = actors.find((actor) => actor.id === selectedActorId);
  const otherActive = actors
    .filter(
      (actor) =>
        actor.isActiveInScene &&
        !actor.isPlayerControlled &&
        actor.id !== gm?.id &&
        actor.id !== selectedActorId
    )
    .map((actor) => actor.id)
    .slice(0, 3);

  return dedupe([
    gm?.id || '',
    ...(selectedActor && !selectedActor.isPlayerControlled ? [selectedActor.id] : []),
    ...otherActive,
  ]).filter(Boolean);
}

export function createInitialStoryAppState(): StoryAppState {
  return {
    apiKey: '',
    selectedModel: '',
    models: [],
    appMode: 'player',
    showSettings: true,
    isLoading: false,
    error: null,
    userProfile: null,
    availableProfiles: [],
    selectedActorId: 'player-1',
    campaign: DEFAULT_CAMPAIGN,
    actors: DEFAULT_ACTORS,
    director: DEFAULT_DIRECTOR,
    memoryGraph: ingestRelationshipGraph(DEFAULT_MEMORY_GRAPH, DEFAULT_CAMPAIGN.relationshipGraph, 0),
    directorLog: [
      {
        role: 'assistant',
        content:
          '多 AI 劇場模式已啟動。你可以直接扮演角色，或切換到導演模式在幕後調整節奏。',
      },
    ],
    migrationNotes: [],
  };
}

export function buildTurnPlan(input: RunTurnInput): TurnPlan {
  return {
    turn: input.campaign.turn + 1,
    initiatingActorId: input.appMode === 'player' ? input.selectedActorId : undefined,
    userIntent: input.appMode === 'player' ? input.userInput : '',
    directorIntent: input.appMode === 'director' ? input.userInput : undefined,
    speakerOrder: pickAiSpeakers(input.actors, input.selectedActorId),
    notes: [
      input.appMode === 'director'
        ? '導演指令屬於私密資訊，不應直接洩漏到角色可見狀態。'
        : '玩家行動會被視為公開場景事件。',
      '每個角色只會收到自己被允許看見的事件與記憶。',
      '關係邊會影響語氣與動機，但不會把回應固定死。',
    ],
    visibilityNotes: [
      '公開場景事件：所有角色都可見。',
      '私有記憶：只有擁有者可見。',
      '導演指令與隱藏劇情記憶：僅導演模式可見。',
    ],
  };
}

function buildHumanEvent(turnPlan: TurnPlan, actors: ActorState[], selectedActorId: string): SceneEvent | null {
  const actor = actors.find((candidate) => candidate.id === selectedActorId);
  if (!actor || !turnPlan.userIntent.trim()) {
    return null;
  }

  return {
    id: makeId('human'),
    turn: turnPlan.turn,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    visibility: 'public',
    kind: 'user_action',
    content: turnPlan.userIntent.trim(),
    timestamp: Date.now(),
  };
}

function buildDirectorEvent(turnPlan: TurnPlan, director: DirectorState): SceneEvent | null {
  if (!turnPlan.directorIntent?.trim()) {
    return null;
  }

  return {
    id: makeId('director'),
    turn: turnPlan.turn,
    actorId: director.id,
    actorName: director.name,
    actorRole: 'director',
    visibility: 'director',
    kind: 'director_note',
    content: turnPlan.directorIntent.trim(),
    timestamp: Date.now(),
  };
}

function summarizeTurn(events: SceneEvent[]): string {
  return events
    .filter((event) => event.visibility === 'public')
    .map((event) => `${event.actorName}: ${event.content}`)
    .join(' ')
    .slice(0, 280);
}

export async function runTurn(input: RunTurnInput): Promise<RunTurnResult> {
  const actors = updateActorModels(input.actors, input.selectedModel);
  const turnPlan = buildTurnPlan({ ...input, actors });
  const emittedEvents: SceneEvent[] = [];

  const humanEvent = buildHumanEvent(turnPlan, actors, input.selectedActorId);
  if (humanEvent) {
    emittedEvents.push(humanEvent);
  }

  const directorEvent = buildDirectorEvent(turnPlan, input.director);
  if (directorEvent) {
    emittedEvents.push(directorEvent);
  }

  for (const speakerId of turnPlan.speakerOrder) {
    const actor = actors.find((candidate) => candidate.id === speakerId);
    if (!actor) {
      continue;
    }

    const visibleMemories = getVisibleMemories(input.memoryGraph, actor.id);
    const visibleEvents = getVisibleSceneEvents(
      [...input.campaign.sceneLog.slice(-6), ...emittedEvents],
      actor.id
    );

    const nextEvent = await generateActorSceneEvent({
      apiKey: input.apiKey,
      fallbackModel: input.selectedModel,
      actor,
      actors,
      campaign: input.campaign,
      director: input.director,
      turnPlan,
      recentEvents: visibleEvents,
      visibleMemories,
    });

    emittedEvents.push(nextEvent);
  }

  let memoryGraph = ingestSceneEvents(input.memoryGraph, actors, emittedEvents);
  memoryGraph = ingestRelationshipGraph(memoryGraph, input.campaign.relationshipGraph, turnPlan.turn);

  if (directorEvent) {
    memoryGraph = appendMemory(memoryGraph, {
      scope: 'director',
      category: 'director',
      title: `Director command @ T${turnPlan.turn}`,
      content: directorEvent.content,
      tags: ['director', 'command'],
      createdAtTurn: turnPlan.turn,
      updatedAtTurn: turnPlan.turn,
    });
  }

  const gmEvent = emittedEvents.find((event) => event.actorRole === 'gm');
  const nextCampaign: CampaignState = {
    ...input.campaign,
    turn: turnPlan.turn,
    currentScene: gmEvent?.content || input.campaign.currentScene,
    sceneLog: [...input.campaign.sceneLog, ...emittedEvents],
    chronicle: [
      ...input.campaign.chronicle,
      {
        turn: turnPlan.turn,
        event: summarizeTurn(emittedEvents) || `第 ${turnPlan.turn} 回合已推進。`,
      },
    ],
  };

  const nextDirector: DirectorState = directorEvent
    ? {
        ...input.director,
        mode: 'intervening',
        recentCommands: [directorEvent.content, ...input.director.recentCommands].slice(0, 8),
      }
    : {
        ...input.director,
        mode: 'observer',
      };

  return {
    campaign: nextCampaign,
    actors,
    director: nextDirector,
    memoryGraph,
    turnPlan,
    emittedEvents,
  };
}
