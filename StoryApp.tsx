import React, { useEffect, useState } from 'react';
import Button from './components/Button';
import Input from './components/Input';
import { fetchModels } from './services/openRouterService';
import { getDirectorMemories, getPrivateMemories, getVisibleMemories } from './services/memoryGraphService';
import { createInitialStoryAppState, runTurn } from './services/storyEngineService';
import { ActorRole, ActorState, OpenRouterModel, SceneEvent, StoryAppState, TurnPlan } from './storyTypes';

const PROFILE_LIST_KEY = 'multi_ai_story_profiles';
const PROFILE_SAVE_PREFIX = 'multi_ai_story_save_';

const roleLabel: Record<ActorRole, string> = {
  gm: 'GM',
  npc: 'NPC',
  player: 'PLAYER',
  director: 'DIRECTOR',
};

const roleTheme: Record<ActorRole, string> = {
  gm: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  npc: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  player: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100',
  director: 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100',
};

function createActor(role: ActorRole = 'npc'): ActorState {
  const timestamp = Date.now();
  return {
    id: `${role}-${timestamp}`,
    name: role === 'npc' ? '新角色' : role === 'player' ? '新主角' : '新主持',
    role,
    tagline: '待補充角色定位',
    description: '請在右側補充這名角色的設定、動機與口吻。',
    publicBio: '其他角色可見的第一印象。',
    privateNotes: '只有此角色知道的心理與盤算。',
    goals: ['建立存在感'],
    secrets: [],
    voice: '簡潔、穩定',
    status: '待入場',
    relationships: {},
    isActiveInScene: true,
    isPlayerControlled: role === 'player',
    modelConfig: {
      model: '',
      temperature: 0.7,
      systemPrompt:
        role === 'gm'
          ? 'You are a story GM. Frame the scene clearly and maintain continuity.'
          : 'You are an in-character story agent. Speak only for yourself and preserve your agenda.',
      tools: [],
    },
  };
}

function parseListInput(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatListInput(value: string[]): string {
  return value.join('\n');
}

function SceneEventCard({ event }: { event: SceneEvent }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.3em] ${roleTheme[event.actorRole]}`}>
            {roleLabel[event.actorRole]}
          </span>
          <span className="text-sm font-semibold text-white">{event.actorName}</span>
        </div>
        <span className="text-xs text-slate-500">T{event.turn}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{event.content}</div>
    </div>
  );
}

function MemoryList({
  title,
  entries,
  emptyLabel,
}: {
  title: string;
  entries: { id: string; title: string; content: string; scope?: string }[];
  emptyLabel: string;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">{title}</div>
      <div className="space-y-3">
        {entries.length === 0 && <div className="text-sm text-slate-500">{emptyLabel}</div>}
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-white/6 bg-white/[0.03] p-3">
            <div className="text-sm font-semibold text-slate-100">{entry.title}</div>
            <div className="mt-1 text-sm leading-6 text-slate-300">{entry.content}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActorEditor({
  actor,
  onUpdate,
}: {
  actor: ActorState;
  onUpdate: (actor: ActorState) => void;
}) {
  return (
    <div className="space-y-4">
      <Input
        label="角色名稱"
        value={actor.name}
        onChange={(event) => onUpdate({ ...actor, name: event.target.value })}
      />
      <Input
        label="角色定位"
        value={actor.tagline}
        onChange={(event) => onUpdate({ ...actor, tagline: event.target.value })}
      />
      <Input
        label="口吻"
        value={actor.voice}
        onChange={(event) => onUpdate({ ...actor, voice: event.target.value })}
      />
      <Input
        label="狀態"
        value={actor.status}
        onChange={(event) => onUpdate({ ...actor, status: event.target.value })}
      />
      <label className="block text-sm font-medium text-rpg-muted">
        公開描述
        <textarea
          className="mt-1 h-24 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
          value={actor.publicBio}
          onChange={(event) => onUpdate({ ...actor, publicBio: event.target.value })}
        />
      </label>
      <label className="block text-sm font-medium text-rpg-muted">
        私密筆記
        <textarea
          className="mt-1 h-24 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
          value={actor.privateNotes}
          onChange={(event) => onUpdate({ ...actor, privateNotes: event.target.value })}
        />
      </label>
      <label className="block text-sm font-medium text-rpg-muted">
        目標清單
        <textarea
          className="mt-1 h-24 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
          value={formatListInput(actor.goals)}
          onChange={(event) => onUpdate({ ...actor, goals: parseListInput(event.target.value) })}
        />
      </label>
      <label className="block text-sm font-medium text-rpg-muted">
        秘密清單
        <textarea
          className="mt-1 h-24 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
          value={formatListInput(actor.secrets)}
          onChange={(event) => onUpdate({ ...actor, secrets: parseListInput(event.target.value) })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-rpg-muted">
          溫度
          <input
            type="number"
            min="0"
            max="1.2"
            step="0.05"
            className="mt-1 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
            value={actor.modelConfig.temperature}
            onChange={(event) =>
              onUpdate({
                ...actor,
                modelConfig: { ...actor.modelConfig, temperature: Number(event.target.value) || 0.7 },
              })
            }
          />
        </label>
        <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={actor.isActiveInScene}
            onChange={(event) => onUpdate({ ...actor, isActiveInScene: event.target.checked })}
          />
          場上活躍
        </label>
      </div>
      <label className="block text-sm font-medium text-rpg-muted">
        Agent System Prompt
        <textarea
          className="mt-1 h-32 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 font-mono text-sm text-rpg-text outline-none focus:border-cyan-400"
          value={actor.modelConfig.systemPrompt}
          onChange={(event) =>
            onUpdate({
              ...actor,
              modelConfig: { ...actor.modelConfig, systemPrompt: event.target.value },
            })
          }
        />
      </label>
    </div>
  );
}

const StoryApp: React.FC = () => {
  const [state, setState] = useState<StoryAppState>(createInitialStoryAppState());
  const [composerValue, setComposerValue] = useState('');
  const [lastTurnPlan, setLastTurnPlan] = useState<TurnPlan | null>(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    const storedProfiles = localStorage.getItem(PROFILE_LIST_KEY);
    const profiles = storedProfiles ? (JSON.parse(storedProfiles) as string[]) : ['default'];

    if (!storedProfiles) {
      localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(profiles));
    }

    const firstProfile = profiles[0];
    const saveRaw = localStorage.getItem(`${PROFILE_SAVE_PREFIX}${firstProfile}`);
    const initialState = saveRaw ? ({ ...createInitialStoryAppState(), ...JSON.parse(saveRaw) } as StoryAppState) : createInitialStoryAppState();

    setState({
      ...initialState,
      availableProfiles: profiles,
      userProfile: firstProfile,
    });
    setIsBootstrapped(true);
  }, []);

  useEffect(() => {
    if (!isBootstrapped || !state.userProfile) {
      return;
    }

    localStorage.setItem(`${PROFILE_SAVE_PREFIX}${state.userProfile}`, JSON.stringify(state));
  }, [isBootstrapped, state]);

  const selectedActor = state.actors.find((actor) => actor.id === state.selectedActorId) || state.actors[0];
  const publicSceneLog = state.campaign.sceneLog.filter((event) => event.visibility === 'public');
  const visibleMemories = selectedActor ? getVisibleMemories(state.memoryGraph, selectedActor.id) : [];
  const privateMemories = selectedActor ? getPrivateMemories(state.memoryGraph, selectedActor.id) : [];
  const directorMemories = getDirectorMemories(state.memoryGraph);

  const updateState = (updater: (current: StoryAppState) => StoryAppState) => {
    setState((current) => updater(current));
  };

  const handleFetchModels = async () => {
    if (!state.apiKey.trim()) {
      setState((current) => ({ ...current, error: '請先輸入 OpenRouter API Key。' }));
      return;
    }

    updateState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const models = await fetchModels(state.apiKey);
      updateState((current) => ({
        ...current,
        models,
        selectedModel: current.selectedModel || models[0]?.id || '',
        isLoading: false,
      }));
    } catch (error: any) {
      updateState((current) => ({
        ...current,
        isLoading: false,
        error: error?.message || String(error),
      }));
    }
  };

  const handleRunTurn = async () => {
    if (!composerValue.trim()) {
      return;
    }

    updateState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const result = await runTurn({
        apiKey: state.apiKey,
        selectedModel: state.selectedModel,
        appMode: state.appMode,
        selectedActorId: state.selectedActorId,
        userInput: composerValue,
        campaign: state.campaign,
        actors: state.actors,
        director: state.director,
        memoryGraph: state.memoryGraph,
      });

      updateState((current) => ({
        ...current,
        campaign: result.campaign,
        actors: result.actors,
        director: result.director,
        memoryGraph: result.memoryGraph,
        directorLog: [
          {
            role: 'assistant',
            content:
              current.appMode === 'director'
                ? `導演介入完成：${result.turnPlan.directorIntent || '無'}`
                : `角色行動已送出：${result.turnPlan.userIntent}`,
          },
          ...current.directorLog,
        ].slice(0, 12),
        isLoading: false,
      }));
      setLastTurnPlan(result.turnPlan);
      setComposerValue('');
    } catch (error: any) {
      updateState((current) => ({
        ...current,
        isLoading: false,
        error: error?.message || String(error),
      }));
    }
  };

  const handleProfileChange = (profile: string) => {
    const saveRaw = localStorage.getItem(`${PROFILE_SAVE_PREFIX}${profile}`);
    const loaded = saveRaw ? ({ ...createInitialStoryAppState(), ...JSON.parse(saveRaw) } as StoryAppState) : createInitialStoryAppState();
    setState({
      ...loaded,
      userProfile: profile,
      availableProfiles: state.availableProfiles,
    });
    setLastTurnPlan(null);
    setComposerValue('');
  };

  const handleCreateProfile = () => {
    const profileName = `campaign-${state.availableProfiles.length + 1}`;
    const profiles = [...state.availableProfiles, profileName];
    localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(profiles));
    setState((current) => ({
      ...createInitialStoryAppState(),
      availableProfiles: profiles,
      userProfile: profileName,
      apiKey: current.apiKey,
      selectedModel: current.selectedModel,
      models: current.models,
    }));
    setLastTurnPlan(null);
    setComposerValue('');
  };

  const handleDeleteProfile = () => {
    if (!state.userProfile || state.availableProfiles.length <= 1) {
      return;
    }

    const remaining = state.availableProfiles.filter((profile) => profile !== state.userProfile);
    localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(remaining));
    localStorage.removeItem(`${PROFILE_SAVE_PREFIX}${state.userProfile}`);
    const nextProfile = remaining[0];
    const saveRaw = localStorage.getItem(`${PROFILE_SAVE_PREFIX}${nextProfile}`);
    const loaded = saveRaw ? ({ ...createInitialStoryAppState(), ...JSON.parse(saveRaw) } as StoryAppState) : createInitialStoryAppState();
    setState({
      ...loaded,
      userProfile: nextProfile,
      availableProfiles: remaining,
      apiKey: state.apiKey,
      selectedModel: state.selectedModel,
      models: state.models,
    });
  };

  const handleActorUpdate = (actor: ActorState) => {
    updateState((current) => ({
      ...current,
      actors: current.actors.map((candidate) => (candidate.id === actor.id ? actor : candidate)),
      campaign: {
        ...current.campaign,
        activeActorIds: current.actors
          .map((candidate) => (candidate.id === actor.id ? actor : candidate))
          .filter((candidate) => candidate.isActiveInScene)
          .map((candidate) => candidate.id),
      },
    }));
  };

  const handleAddActor = (role: ActorRole) => {
    const actor = createActor(role);
    updateState((current) => ({
      ...current,
      actors: [...current.actors, actor],
      selectedActorId: actor.id,
      campaign: {
        ...current.campaign,
        activeActorIds: [...current.campaign.activeActorIds, actor.id],
      },
    }));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#15304a_0%,#09111f_42%,#05080f_100%)] text-rpg-text">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 lg:px-6">
        <header className="mb-4 rounded-[32px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.45)] backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.45em] text-cyan-300/80">Multi-Agent Story Theatre</div>
              <h1 className="mt-2 text-3xl font-semibold text-white">多 AI 劇場引擎原型</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                你可以切換成角色進場，或切成導演視角在幕後操盤。每個 actor 都有獨立設定、獨立 prompt 與獨立私有記憶。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-300">
                當前 Profile: <span className="font-semibold text-white">{state.userProfile}</span>
              </div>
              <Button variant={state.appMode === 'player' ? 'primary' : 'secondary'} onClick={() => updateState((current) => ({ ...current, appMode: 'player' }))}>
                Player Mode
              </Button>
              <Button variant={state.appMode === 'director' ? 'primary' : 'secondary'} onClick={() => updateState((current) => ({ ...current, appMode: 'director' }))}>
                Director Mode
              </Button>
              <Button variant="ghost" onClick={() => updateState((current) => ({ ...current, showSettings: !current.showSettings }))}>
                {state.showSettings ? '收起設定' : '展開設定'}
              </Button>
            </div>
          </div>

          {state.showSettings && (
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-4">
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Session Settings</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="OpenRouter API Key"
                    type="password"
                    value={state.apiKey}
                    onChange={(event) => updateState((current) => ({ ...current, apiKey: event.target.value }))}
                  />
                  <label className="block text-sm font-medium text-rpg-muted">
                    Default Model
                    {state.models.length > 0 ? (
                      <select
                        className="mt-1 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
                        value={state.selectedModel}
                        onChange={(event) => updateState((current) => ({ ...current, selectedModel: event.target.value }))}
                      >
                        <option value="">選擇模型</option>
                        {state.models.map((model: OpenRouterModel) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="mt-1 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
                        value={state.selectedModel}
                        onChange={(event) => updateState((current) => ({ ...current, selectedModel: event.target.value }))}
                        placeholder="例如 openai/gpt-4.1-mini"
                      />
                    )}
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button onClick={handleFetchModels} isLoading={state.isLoading}>
                    讀取模型
                  </Button>
                  <Button variant="secondary" onClick={handleCreateProfile}>
                    新增 Campaign
                  </Button>
                  <Button variant="danger" onClick={handleDeleteProfile}>
                    刪除目前 Campaign
                  </Button>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-4">
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Profiles</div>
                <div className="flex flex-wrap gap-2">
                  {state.availableProfiles.map((profile) => (
                    <button
                      key={profile}
                      onClick={() => handleProfileChange(profile)}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        profile === state.userProfile
                          ? 'border-cyan-400/40 bg-cyan-500/10 text-white'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20'
                      }`}
                    >
                      {profile}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </header>

        {state.error && (
          <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {state.error}
          </div>
        )}

        <div className="grid flex-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
          <aside className="space-y-4">
            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Scene</div>
              <Input
                label="世界名稱"
                value={state.campaign.world.name}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    campaign: {
                      ...current.campaign,
                      world: { ...current.campaign.world, name: event.target.value },
                    },
                  }))
                }
              />
              <label className="mt-3 block text-sm font-medium text-rpg-muted">
                場景描述
                <textarea
                  className="mt-1 h-28 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
                  value={state.campaign.currentScene}
                  onChange={(event) =>
                    updateState((current) => ({
                      ...current,
                      campaign: { ...current.campaign, currentScene: event.target.value },
                    }))
                  }
                />
              </label>
              <label className="mt-3 block text-sm font-medium text-rpg-muted">
                世界基調
                <textarea
                  className="mt-1 h-28 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
                  value={state.campaign.world.description}
                  onChange={(event) =>
                    updateState((current) => ({
                      ...current,
                      campaign: {
                        ...current.campaign,
                        world: { ...current.campaign.world, description: event.target.value },
                      },
                    }))
                  }
                />
              </label>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Cast</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleAddActor('npc')}>
                    + NPC
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleAddActor('player')}>
                    + Player
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {state.actors.map((actor) => (
                  <button
                    key={actor.id}
                    onClick={() => updateState((current) => ({ ...current, selectedActorId: actor.id }))}
                    className={`w-full rounded-3xl border p-4 text-left transition ${
                      actor.id === state.selectedActorId
                        ? 'border-cyan-400/40 bg-cyan-500/10'
                        : 'border-white/8 bg-slate-950/60 hover:border-white/20'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.3em] ${roleTheme[actor.role]}`}>
                        {roleLabel[actor.role]}
                      </span>
                      <span className="text-xs text-slate-500">{actor.isActiveInScene ? 'In Scene' : 'Off Scene'}</span>
                    </div>
                    <div className="text-sm font-semibold text-white">{actor.name}</div>
                    <div className="mt-1 text-sm text-slate-300">{actor.tagline}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Director Console</div>
              <label className="block text-sm font-medium text-rpg-muted">
                幕後目標
                <textarea
                  className="mt-1 h-24 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
                  value={formatListInput(state.director.goals)}
                  onChange={(event) =>
                    updateState((current) => ({
                      ...current,
                      director: { ...current.director, goals: parseListInput(event.target.value) },
                    }))
                  }
                />
              </label>
              <label className="mt-3 block text-sm font-medium text-rpg-muted">
                Guardrails
                <textarea
                  className="mt-1 h-24 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
                  value={formatListInput(state.director.guardrails)}
                  onChange={(event) =>
                    updateState((current) => ({
                      ...current,
                      director: { ...current.director, guardrails: parseListInput(event.target.value) },
                    }))
                  }
                />
              </label>
            </section>
          </aside>

          <main className="flex min-h-[70vh] flex-col rounded-[32px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.45)] backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Story Flow</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Turn {state.campaign.turn} · {state.campaign.currentArc}
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-300">
                視角角色: <span className="font-semibold text-white">{selectedActor?.name}</span>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {publicSceneLog.map((event) => (
                <SceneEventCard key={event.id} event={event} />
              ))}
            </div>

            <div className="mt-4 rounded-[28px] border border-white/10 bg-slate-950/75 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
                {state.appMode === 'director' ? 'Director Input' : 'Player Action'}
              </div>
              <textarea
                className="h-28 w-full rounded-[24px] border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400"
                placeholder={
                  state.appMode === 'director'
                    ? '例如：讓官方勢力提前施壓，但不要直接揭露真正黑幕。'
                    : `以 ${selectedActor?.name || '目前角色'} 的身份輸入你的行動或台詞。`
                }
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-400">
                  {state.appMode === 'director'
                    ? '導演指令只會進入導演記憶，不會直接暴露給角色。'
                    : '玩家輸入會先作為公開場景事件，再交由 GM 與 NPC 依序回應。'}
                </div>
                <Button onClick={handleRunTurn} isLoading={state.isLoading}>
                  執行新回合
                </Button>
              </div>
            </div>
          </main>

          <aside className="space-y-4">
            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Actor Editor</div>
              {selectedActor && <ActorEditor actor={selectedActor} onUpdate={handleActorUpdate} />}
            </section>

            <MemoryList title="Visible Memory" entries={visibleMemories} emptyLabel="目前沒有可見記憶。" />
            <MemoryList title="Private Memory" entries={privateMemories} emptyLabel="目前沒有私有記憶。" />

            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Turn Plan</div>
              {lastTurnPlan ? (
                <div className="space-y-3 text-sm text-slate-300">
                  <div>Initiator: {lastTurnPlan.initiatingActorId || 'Director'}</div>
                  <div>Speaker Order: {lastTurnPlan.speakerOrder.join(' -> ')}</div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
                    {lastTurnPlan.notes.map((note, index) => (
                      <div key={`${note}-${index}`} className="leading-6">
                        {note}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">執行一個回合後，這裡會顯示 orchestrator 的排程結果。</div>
              )}
            </section>

            <MemoryList title="Director Memory" entries={directorMemories} emptyLabel="目前沒有導演記憶。" />
          </aside>
        </div>
      </div>
    </div>
  );
};

export default StoryApp;
