import { generateCompletion } from './openRouterService';
import {
  ActorState,
  CampaignState,
  DirectorState,
  MemoryEntry,
  SceneEvent,
  SceneEventKind,
  TurnPlan,
} from '../storyTypes';
import { summarizeMemories } from './memoryGraphService';

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
    return `第 ${turnPlan.turn} 回合展開。${campaign.currentScene} 現在被新的動作擾動：${turnPlan.userIntent || '角色們暫時按兵不動'}。`;
  }

  const firstGoal = actor.goals[0] || '觀察局勢';
  return `${actor.name} 以${actor.voice}的口吻回應，繼續朝「${firstGoal}」前進，同時警戒場上的新變化。`;
}

function buildSystemPrompt(input: GenerateActorSceneEventInput): string {
  const { actor, campaign, director, actors } = input;
  const castSummary = actors
    .map((candidate) => `${candidate.name} (${candidate.role}): ${candidate.tagline}`)
    .join('\n');
  const memories = summarizeMemories(input.visibleMemories);

  return [
    actor.modelConfig.systemPrompt,
    `Current world: ${campaign.world.name}`,
    `Current scene: ${campaign.currentScene}`,
    `Current arc: ${campaign.currentArc}`,
    `Actor voice: ${actor.voice}`,
    `Actor goals: ${actor.goals.join(' | ') || 'Keep the story moving'}`,
    `Actor secrets: ${actor.secrets.join(' | ') || 'None currently surfaced'}`,
    `Actor status: ${actor.status}`,
    `Cast:\n${castSummary}`,
    `Visible memories:\n${memories || '- None yet'}`,
    `Director pacing goals: ${director.goals.join(' | ')}`,
    `Director guardrails: ${director.guardrails.join(' | ')}`,
    'Keep the response to 2-4 sentences. Stay in-character and do not speak for the whole cast.',
  ].join('\n\n');
}

function buildUserPrompt(input: GenerateActorSceneEventInput): string {
  const { turnPlan, recentEvents, actor } = input;
  const recentText = recentEvents
    .slice(-4)
    .map((event) => `${event.actorName}: ${event.content}`)
    .join('\n');

  return [
    `Turn: ${turnPlan.turn}`,
    `User intent: ${turnPlan.userIntent || 'No direct player move this turn.'}`,
    `Director intent: ${turnPlan.directorIntent || 'No private director intervention.'}`,
    `Speaker order: ${turnPlan.speakerOrder.join(' -> ')}`,
    `Recent scene beats:\n${recentText || '- Scene is just starting.'}`,
    `Write ${actor.name}'s next beat for the scene.`,
  ].join('\n\n');
}

export async function generateActorSceneEvent(
  input: GenerateActorSceneEventInput
): Promise<SceneEvent> {
  const kind: SceneEventKind = input.actor.role === 'gm' ? 'gm_narration' : 'actor_dialogue';
  const model = input.actor.modelConfig.model || input.fallbackModel;

  if (!input.apiKey || !model) {
    return makeSceneEvent(input.actor, input.turnPlan.turn, kind, buildFallbackLine(input.actor, input.campaign, input.turnPlan));
  }

  try {
    const systemPrompt = buildSystemPrompt(input);
    const userPrompt = buildUserPrompt(input);
    const { content } = await generateCompletion(
      input.apiKey,
      model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
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
    console.warn(`[AgentService] Falling back for ${input.actor.name}:`, error);
    return makeSceneEvent(input.actor, input.turnPlan.turn, kind, buildFallbackLine(input.actor, input.campaign, input.turnPlan));
  }
}
