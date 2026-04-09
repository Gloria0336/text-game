import { ActorState, RelationshipEdge, VisibilityScope } from '../storyCoreTypes';

function makeRelationshipId(sourceActorId: string, targetActorId: string): string {
  return `rel-${sourceActorId}-${targetActorId}`;
}

export function getRelationshipEdge(
  edges: RelationshipEdge[],
  sourceActorId: string,
  targetActorId: string
): RelationshipEdge | undefined {
  return edges.find(
    (edge) => edge.sourceActorId === sourceActorId && edge.targetActorId === targetActorId
  );
}

export function getRelationshipEdgesForActor(
  edges: RelationshipEdge[],
  actorId: string
): RelationshipEdge[] {
  return edges.filter((edge) => edge.sourceActorId === actorId);
}

export function upsertRelationshipEdge(
  edges: RelationshipEdge[],
  input: {
    sourceActorId: string;
    targetActorId: string;
    label: string;
    summary: string;
    intensity: number;
    visibility: VisibilityScope;
    lastUpdatedTurn: number;
  }
): RelationshipEdge[] {
  const existing = getRelationshipEdge(edges, input.sourceActorId, input.targetActorId);
  const nextEdge: RelationshipEdge = existing
    ? {
        ...existing,
        ...input,
      }
    : {
        id: makeRelationshipId(input.sourceActorId, input.targetActorId),
        ...input,
      };

  const filtered = edges.filter(
    (edge) => !(edge.sourceActorId === input.sourceActorId && edge.targetActorId === input.targetActorId)
  );
  return [...filtered, nextEdge];
}

export function describeRelationships(
  edges: RelationshipEdge[],
  actorId: string,
  actors: ActorState[],
  includePrivate = false
): string {
  return edges
    .filter(
      (edge) =>
        edge.sourceActorId === actorId && (includePrivate || edge.visibility === 'public')
    )
    .map((edge) => {
      const target = actors.find((actor) => actor.id === edge.targetActorId);
      return `${target?.name || edge.targetActorId}: ${edge.label} (${edge.intensity}/5) - ${edge.summary}`;
    })
    .join('\n');
}
