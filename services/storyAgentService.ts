import { generateCompletion } from './openRouterService';
import {
  ActorState,
  CampaignState,
  DirectorState,
  MemoryEntry,
  SceneEvent,
  SceneEventKind,
  TurnPlan,
} from '../storyCoreTypes';
import { summarizeMemories } from './storyMemoryService';
import { describeRelationships } from './storyRelationshipService';

interface GenerateActorSceneEventInput {
  apiKey: string;
  fallbackModel: string;
  actor: ActorState;
  actors: ActorState[];
  campaign: CampaignState;
  director: DirectorState;
  turnPlan: TurnPlan;
  recentEvents: SceneEvent[];
  visibleMemories: MemoryEntry[];
}

function makeSceneEvent(actor: ActorState, turn: number, kind: SceneEventKind, content: string): SceneEvent {
  return {
    id: `scene-${actor.id}-${turn}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    turn,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    visibility: 'public',
    kind,
    content,
    timestamp: Date.now(),
  };
}

function buildFallbackLine(actor: ActorState, campaign: CampaignState, turnPlan: TurnPlan): string {
  if (actor.role === 'gm') {
    return `Turn ${turnPlan.turn} opens with new pressure in ${campaign.world.name}. ${turnPlan.userIntent || 'The cast hesitates for a beat.'}`;
  }

  const firstGoal = actor.goals[0] || 'keep moving';
  return `${actor.name} answers in a ${actor.voice} tone, protecting "${firstGoal}" while reacting to the latest scene pressure.`;
}

function buildSystemPrompt(input: GenerateActorSceneEventInput): string {
  const { actor, actors, campaign, director } = input;
  const castSummary = actors
    .map((candidate) => `${candidate.name} (${candidate.role}): ${candidate.tagline}`)
    .join('\n');
  const visibleRelationshipSummary = describeRelationships(
    campaign.relationshipGraph,
    actor.id,
    actors,
    true
  );

  return [
    actor.modelConfig.systemPrompt,
    `World: ${campaign.world.name}`,
    `Scene: ${campaign.currentScene}`,
    `Arc: ${campaign.currentArc}`,
    `Voice: ${actor.voice}`,
    `Status: ${actor.status}`,
    `Knowledge boundary: ${actor.knowledgeStyle}`,
    `Goals: ${actor.goals.join(' | ') || 'Keep the story moving'}`,
    `Secrets: ${actor.secrets.join(' | ') || 'None surfaced yet'}`,
    `Cast:\n${castSummary}`,
    `Relationships:\n${visibleRelationshipSummary || '- none recorded'}`,
    `Visible memories:\n${summarizeMemories(input.visibleMemories) || '- none recorded'}`,
    `Director pacing goals: ${director.goals.join(' | ')}`,
    `Director guardrails: ${director.guardrails.join(' | ')}`,
    'Write 2-4 sentences. Stay inside this actor perspective. Do not narrate what other actors secretly think.',
  ].join('\n\n');
}

function buildUserPrompt(input: GenerateActorSceneEventInput): string {
  const recentText = input.recentEvents
    .slice(-5)
    .map((event) => `${event.actorName}: ${event.content}`)
    .join('\n');

  return [
    `Turn: ${input.turnPlan.turn}`,
    `Player intent: ${input.turnPlan.userIntent || 'No direct player input this turn.'}`,
    `Director intent: ${input.turnPlan.directorIntent || 'No hidden director note this turn.'}`,
    `Speaker order: ${input.turnPlan.speakerOrder.join(' -> ')}`,
    `Recent visible scene beats:\n${recentText || '- the scene is just starting'}`,
    `Write ${input.actor.name}'s next contribution.`,
  ].join('\n\n');
}

export async function generateActorSceneEvent(
  input: GenerateActorSceneEventInput
): Promise<SceneEvent> {
  const kind: SceneEventKind = input.actor.role === 'gm' ? 'gm_narration' : 'actor_dialogue';
  const model = input.actor.modelConfig.model || input.fallbackModel;

  if (!input.apiKey || !model) {
    return makeSceneEvent(
      input.actor,
      input.turnPlan.turn,
      kind,
      buildFallbackLine(input.actor, input.campaign, input.turnPlan)
    );
  }

  try {
    const { content } = await generateCompletion(
      input.apiKey,
      model,
      [
        { role: 'system', content: buildSystemPrompt(input) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      input.actor.modelConfig.temperature
    );

    return makeSceneEvent(
      input.actor,
      input.turnPlan.turn,
      kind,
      content.trim() || buildFallbackLine(input.actor, input.campaign, input.turnPlan)
    );
  } catch (error) {
    console.warn(`[StoryAgentService] Falling back for ${input.actor.name}:`, error);
    return makeSceneEvent(
      input.actor,
      input.turnPlan.turn,
      kind,
      buildFallbackLine(input.actor, input.campaign, input.turnPlan)
    );
  }
}
