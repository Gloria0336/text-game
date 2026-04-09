import {
  ActorState,
  CampaignState,
  MemoryEntry,
  MemoryGraphState,
  RelationshipEdge,
  SceneEvent,
  VisibilityScope,
} from '../storyCoreTypes';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function scopeAllowsActorAccess(
  scope: VisibilityScope,
  actorId: string,
  ownerActorId?: string,
  visibleToActorIds?: string[],
  hiddenFromActorIds?: string[]
): boolean {
  if (hiddenFromActorIds?.includes(actorId)) {
    return false;
  }

  if (visibleToActorIds?.includes(actorId)) {
    return true;
  }

  if (scope === 'public') {
    return true;
  }

  if (scope === 'private') {
    return ownerActorId === actorId;
  }

  return false;
}

function scopeAllowsDirectorAccess(scope: VisibilityScope): boolean {
  return scope === 'public' || scope === 'private' || scope === 'director';
}

export function appendMemory(
  graph: MemoryGraphState,
  entry: Omit<MemoryEntry, 'id'>
): MemoryGraphState {
  return {
    entries: [...graph.entries, { ...entry, id: makeId('memory') }],
  };
}

export function createMemoryFromSceneEvent(
  event: SceneEvent,
  scope: VisibilityScope,
  category: MemoryEntry['category'],
  ownerActorId?: string
): Omit<MemoryEntry, 'id'> {
  return {
    scope,
    category,
    ownerActorId,
    sourceEventId: event.id,
    visibleToActorIds: event.visibleToActorIds,
    hiddenFromActorIds: event.hiddenFromActorIds,
    title: `${event.actorName} @ T${event.turn}`,
    content: event.content,
    tags: [event.actorRole, event.kind],
    createdAtTurn: event.turn,
    updatedAtTurn: event.turn,
  };
}

export function ingestSceneEvents(
  graph: MemoryGraphState,
  actors: ActorState[],
  events: SceneEvent[]
): MemoryGraphState {
  let nextGraph = graph;

  for (const event of events) {
    if (event.visibility === 'public') {
      nextGraph = appendMemory(nextGraph, createMemoryFromSceneEvent(event, 'public', 'scene'));
    }

    if (event.visibility === 'director') {
      nextGraph = appendMemory(nextGraph, createMemoryFromSceneEvent(event, 'director', 'director'));
    }

    const actor = actors.find((candidate) => candidate.id === event.actorId);
    if (actor && actor.role !== 'gm' && actor.role !== 'director') {
      nextGraph = appendMemory(
        nextGraph,
        createMemoryFromSceneEvent(event, 'private', 'scene', actor.id)
      );
    }
  }

  return nextGraph;
}

export function ingestRelationshipGraph(
  graph: MemoryGraphState,
  relationships: RelationshipEdge[],
  turn: number
): MemoryGraphState {
  const relationshipEntries = relationships.map((edge) => ({
    scope: edge.visibility,
    category: 'relationship' as const,
    ownerActorId: edge.visibility === 'private' ? edge.sourceActorId : undefined,
    title: `${edge.sourceActorId} -> ${edge.targetActorId}`,
    content: `${edge.label} (${edge.intensity}/5): ${edge.summary}`,
    tags: ['relationship', edge.sourceActorId, edge.targetActorId],
    createdAtTurn: turn,
    updatedAtTurn: turn,
  }));

  return {
    entries: [
      ...graph.entries.filter((entry) => entry.category !== 'relationship'),
      ...relationshipEntries.map((entry) => ({ ...entry, id: makeId('relationship') })),
    ],
  };
}

export function getVisibleMemories(graph: MemoryGraphState, actorId: string): MemoryEntry[] {
  return graph.entries.filter((entry) =>
    scopeAllowsActorAccess(
      entry.scope,
      actorId,
      entry.ownerActorId,
      entry.visibleToActorIds,
      entry.hiddenFromActorIds
    )
  );
}

export function getPrivateMemories(graph: MemoryGraphState, actorId: string): MemoryEntry[] {
  return graph.entries.filter(
    (entry) =>
      entry.scope === 'private' &&
      scopeAllowsActorAccess(
        entry.scope,
        actorId,
        entry.ownerActorId,
        entry.visibleToActorIds,
        entry.hiddenFromActorIds
      )
  );
}

export function getDirectorMemories(graph: MemoryGraphState): MemoryEntry[] {
  return graph.entries.filter((entry) => scopeAllowsDirectorAccess(entry.scope));
}

export function getVisibleSceneEvents(
  events: SceneEvent[],
  actorId: string
): SceneEvent[] {
  return events.filter((event) =>
    scopeAllowsActorAccess(
      event.visibility,
      actorId,
      event.actorId,
      event.visibleToActorIds,
      event.hiddenFromActorIds
    )
  );
}

export function summarizeMemories(entries: MemoryEntry[], limit = 8): string {
  return entries
    .slice(-limit)
    .map((entry) => `- [${entry.category}/${entry.scope}] ${entry.title}: ${entry.content}`)
    .join('\n');
}

export function summarizeVisibilityForActor(
  graph: MemoryGraphState,
  campaign: CampaignState,
  actorId: string
): {
  publicCount: number;
  privateCount: number;
  directedCount: number;
  visibleEventCount: number;
} {
  const visibleMemories = getVisibleMemories(graph, actorId);
  return {
    publicCount: visibleMemories.filter((entry) => entry.scope === 'public').length,
    privateCount: visibleMemories.filter((entry) => entry.scope === 'private').length,
    directedCount: visibleMemories.filter(
      (entry) => entry.visibleToActorIds?.includes(actorId) && entry.scope !== 'private'
    ).length,
    visibleEventCount: getVisibleSceneEvents(campaign.sceneLog, actorId).length,
  };
}
