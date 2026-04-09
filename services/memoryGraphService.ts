import { ActorState, MemoryEntry, MemoryGraphState, SceneEvent, VisibilityScope } from '../storyTypes';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function appendMemory(
  graph: MemoryGraphState,
  entry: Omit<MemoryEntry, 'id'>
): MemoryGraphState {
  return {
    entries: [...graph.entries, { ...entry, id: makeId('memory') }],
  };
}

export function upsertMemoryFromEvent(
  graph: MemoryGraphState,
  event: SceneEvent,
  scope: VisibilityScope,
  ownerActorId?: string
): MemoryGraphState {
  const existing = graph.entries.find((entry) => entry.sourceEventId === event.id && entry.scope === scope);
  if (existing) {
    return {
      entries: graph.entries.map((entry) =>
        entry.id === existing.id
          ? {
              ...entry,
              title: event.actorName,
              content: event.content,
              updatedAtTurn: event.turn,
            }
          : entry
      ),
    };
  }

  return appendMemory(graph, {
    scope,
    ownerActorId,
    sourceEventId: event.id,
    title: `${event.actorName} @ T${event.turn}`,
    content: event.content,
    tags: [event.actorRole, event.kind],
    createdAtTurn: event.turn,
    updatedAtTurn: event.turn,
  });
}

export function ingestSceneEvents(
  graph: MemoryGraphState,
  actors: ActorState[],
  events: SceneEvent[]
): MemoryGraphState {
  let nextGraph = graph;

  for (const event of events) {
    if (event.visibility === 'public') {
      nextGraph = upsertMemoryFromEvent(nextGraph, event, 'public');
    }

    if (event.visibility === 'director') {
      nextGraph = upsertMemoryFromEvent(nextGraph, event, 'director');
    }

    const actor = actors.find((candidate) => candidate.id === event.actorId);
    if (actor && actor.role !== 'gm') {
      nextGraph = appendMemory(nextGraph, {
        scope: 'private',
        ownerActorId: actor.id,
        sourceEventId: event.id,
        title: `${actor.name} 的回合記錄`,
        content: event.content,
        tags: ['self', actor.role],
        createdAtTurn: event.turn,
        updatedAtTurn: event.turn,
      });
    }
  }

  return nextGraph;
}

export function getVisibleMemories(graph: MemoryGraphState, actorId: string): MemoryEntry[] {
  return graph.entries.filter(
    (entry) => entry.scope === 'public' || (entry.scope === 'private' && entry.ownerActorId === actorId)
  );
}

export function getDirectorMemories(graph: MemoryGraphState): MemoryEntry[] {
  return graph.entries.filter((entry) => entry.scope === 'public' || entry.scope === 'director');
}

export function getPrivateMemories(graph: MemoryGraphState, actorId: string): MemoryEntry[] {
  return graph.entries.filter((entry) => entry.scope === 'private' && entry.ownerActorId === actorId);
}

export function summarizeMemories(entries: MemoryEntry[], limit = 6): string {
  return entries
    .slice(-limit)
    .map((entry) => `- ${entry.title}: ${entry.content}`)
    .join('\n');
}
