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
} from '../storyTypes';
import { generateActorSceneEvent } from './agentService';
import { appendMemory, getVisibleMemories, ingestSceneEvents } from './memoryGraphService';

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

function dedupeSpeakerOrder(ids: string[]): string[] {
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

function pickAiSpeakers(actors: ActorState[], selectedActorId: string): string[] {
  const gm = actors.find((actor) => actor.role === 'gm');
  const nonHumanCast = actors
    .filter((actor) => actor.isActiveInScene && !actor.isPlayerControlled && actor.id !== gm?.id)
    .map((actor) => actor.id)
    .slice(0, 2);
  const selectedActor = actors.find((actor) => actor.id === selectedActorId);

  return dedupeSpeakerOrder([
    gm?.id || '',
    ...(selectedActor && !selectedActor.isPlayerControlled ? [selectedActor.id] : []),
    ...nonHumanCast,
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
    memoryGraph: DEFAULT_MEMORY_GRAPH,
    directorLog: [
      {
        role: 'assistant',
        content: '多 AI 劇場引擎已就緒。你可以作為角色進場，或切換成幕後導演操控節奏。',
      },
    ],
  };
}

export function buildTurnPlan(input: RunTurnInput): TurnPlan {
  const notes = [
    input.appMode === 'director' ? 'Director is intervening this turn.' : 'Human player is acting from a character slot.',
    'Speaker order is sequential to preserve tone and continuity.',
    'Shared and private memories are filtered per actor before generation.',
  ];

  return {
    turn: input.campaign.turn + 1,
    initiatingActorId: input.appMode === 'player' ? input.selectedActorId : undefined,
    userIntent: input.appMode === 'player' ? input.userInput : '',
    directorIntent: input.appMode === 'director' ? input.userInput : undefined,
    speakerOrder: pickAiSpeakers(input.actors, input.selectedActorId),
    notes,
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
  const publicEvents = events.filter((event) => event.visibility === 'public');
  return publicEvents
    .map((event) => `${event.actorName}：${event.content}`)
    .join(' ')
    .slice(0, 240);
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
    const event = await generateActorSceneEvent({
      apiKey: input.apiKey,
      fallbackModel: input.selectedModel,
      actor,
      actors,
      campaign: input.campaign,
      director: input.director,
      turnPlan,
      recentEvents: [...input.campaign.sceneLog.slice(-4), ...emittedEvents],
      visibleMemories,
    });
    emittedEvents.push(event);
  }

  let nextMemoryGraph = ingestSceneEvents(input.memoryGraph, actors, emittedEvents);
  if (directorEvent) {
    nextMemoryGraph = appendMemory(nextMemoryGraph, {
      scope: 'director',
      title: `導演指令 T${turnPlan.turn}`,
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
        event: summarizeTurn(emittedEvents) || `第 ${turnPlan.turn} 回合推進。`,
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
    memoryGraph: nextMemoryGraph,
    turnPlan,
    emittedEvents,
  };
}
