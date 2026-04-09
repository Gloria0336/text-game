import React, { useEffect, useState } from 'react';
import Button from './components/Button';
import Input from './components/Input';
import { fetchModels } from './services/openRouterService';
import { getLegacySave, importLegacyProfiles, migrateLegacySave } from './services/storyLegacyMigrationService';
import { getDirectorMemories, getPrivateMemories, getVisibleMemories, getVisibleSceneEvents, ingestRelationshipGraph, summarizeVisibilityForActor } from './services/storyMemoryService';
import { createInitialStoryAppState, runTurn } from './services/storyOrchestratorService';
import { getRelationshipEdge, getRelationshipEdgesForActor, upsertRelationshipEdge } from './services/storyRelationshipService';
import { ActorRole, ActorState, OpenRouterModel, RelationshipEdge, SceneEvent, StoryAppState, TurnPlan, VisibilityScope } from './storyCoreTypes';

const PROFILE_LIST_KEY = 'multi_ai_story_profiles_v2';
const PROFILE_SAVE_PREFIX = 'multi_ai_story_save_v2_';

const roleLabel: Record<ActorRole, string> = { gm: '主持', npc: '角色', player: '玩家', director: '導演' };
const roleTheme: Record<ActorRole, string> = {
  gm: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  npc: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  player: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100',
  director: 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100',
};

function parseListInput(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function formatListInput(value: string[]): string {
  return value.join('\n');
}

function createActor(role: ActorRole, selectedModel: string): ActorState {
  const stamp = Date.now();
  return {
    id: `${role}-${stamp}`,
    name: role === 'player' ? '新主角' : role === 'gm' ? '新主持' : '新角色',
    role,
    tagline: '請定義角色定位',
    description: '補上動機、壓力來源與在戲中的功能。',
    publicBio: '其他角色可見的第一印象。',
    privateNotes: '只有這名角色知道的筆記。',
    goals: ['建立存在感'],
    secrets: [],
    voice: '口吻鮮明、容易辨識',
    status: '等待進場',
    knowledgeStyle: '只能看見公開與明確授權的資訊。',
    isActiveInScene: true,
    isPlayerControlled: role === 'player',
    modelConfig: {
      model: selectedModel,
      temperature: 0.7,
      systemPrompt: role === 'gm'
        ? 'You are a story GM. Frame the scene clearly and maintain continuity.'
        : 'You are an in-character story agent. Speak only for yourself and preserve your agenda.',
      tools: [],
    },
  };
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/65 p-4 shadow-[0_18px_55px_rgba(2,6,23,0.35)]">
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">{title}</div>
      {children}
    </section>
  );
}

function MemoryList({ title, entries, emptyLabel }: { title: string; entries: { id: string; title: string; content: string; scope?: string; category?: string }[]; emptyLabel: string }) {
  return (
    <Panel title={title}>
      <div className="space-y-3">
        {entries.length === 0 && <div className="text-sm text-slate-500">{emptyLabel}</div>}
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-100">{entry.title}</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{[entry.scope, entry.category].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-300">{entry.content}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SceneEventCard({ event }: { event: SceneEvent }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.3em] ${roleTheme[event.actorRole]}`}>{roleLabel[event.actorRole]}</span>
          <span className="text-sm font-semibold text-white">{event.actorName}</span>
        </div>
        <span className="text-xs text-slate-500">T{event.turn}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{event.content}</div>
    </div>
  );
}

const StoryTheaterApp: React.FC = () => {
  const [state, setState] = useState<StoryAppState>(createInitialStoryAppState());
  const [composerValue, setComposerValue] = useState('');
  const [lastTurnPlan, setLastTurnPlan] = useState<TurnPlan | null>(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    let profiles: string[] = [];
    const stored = localStorage.getItem(PROFILE_LIST_KEY);
    if (stored) {
      profiles = JSON.parse(stored) as string[];
    } else {
      const legacyProfiles = importLegacyProfiles(localStorage);
      for (const legacyProfile of legacyProfiles) {
        const raw = getLegacySave(localStorage, legacyProfile);
        if (!raw) continue;
        const migrated = migrateLegacySave(raw, legacyProfile);
        if (!migrated) continue;
        const profileName = migrated.userProfile || `legacy-${legacyProfile}`;
        localStorage.setItem(`${PROFILE_SAVE_PREFIX}${profileName}`, JSON.stringify(migrated));
        profiles.push(profileName);
      }
      if (profiles.length === 0) profiles = ['預設'];
      localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(profiles));
    }

    const firstProfile = profiles[0] || '預設';
    const saveRaw = localStorage.getItem(`${PROFILE_SAVE_PREFIX}${firstProfile}`);
    const initialState = saveRaw ? ({ ...createInitialStoryAppState(), ...JSON.parse(saveRaw) } as StoryAppState) : createInitialStoryAppState();
    setState({ ...initialState, userProfile: firstProfile, availableProfiles: profiles });
    setIsBootstrapped(true);
  }, []);

  useEffect(() => {
    if (isBootstrapped && state.userProfile) {
      localStorage.setItem(`${PROFILE_SAVE_PREFIX}${state.userProfile}`, JSON.stringify(state));
    }
  }, [isBootstrapped, state]);

  const selectedActor = state.actors.find((actor) => actor.id === state.selectedActorId) || state.actors[0];
  const publicSceneLog = state.campaign.sceneLog.filter((event) => event.visibility === 'public');
  const visibleMemories = selectedActor ? getVisibleMemories(state.memoryGraph, selectedActor.id) : [];
  const privateMemories = selectedActor ? getPrivateMemories(state.memoryGraph, selectedActor.id) : [];
  const visibleSceneSlice = selectedActor ? getVisibleSceneEvents(state.campaign.sceneLog, selectedActor.id) : [];
  const directorMemories = getDirectorMemories(state.memoryGraph);
  const visibilitySummary = selectedActor ? summarizeVisibilityForActor(state.memoryGraph, state.campaign, selectedActor.id) : { publicCount: 0, privateCount: 0, directedCount: 0, visibleEventCount: 0 };
  const relationshipEdges = selectedActor ? getRelationshipEdgesForActor(state.campaign.relationshipGraph, selectedActor.id) : [];

  const updateState = (updater: (current: StoryAppState) => StoryAppState) => setState((current) => updater(current));

  const handleFetchModels = async () => {
    if (!state.apiKey.trim()) {
      updateState((current) => ({ ...current, error: '請先輸入 OpenRouter API Key。' }));
      return;
    }
    updateState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const models = await fetchModels(state.apiKey);
      updateState((current) => ({ ...current, models, selectedModel: current.selectedModel || models[0]?.id || '', isLoading: false }));
    } catch (error: any) {
      updateState((current) => ({ ...current, isLoading: false, error: error?.message || String(error) }));
    }
  };

  const handleRunTurn = async () => {
    if (!composerValue.trim()) return;
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
        directorLog: [{ role: 'assistant', content: current.appMode === 'director' ? `導演指令已套用：${result.turnPlan.directorIntent || '無'}` : `玩家行動已執行：${result.turnPlan.userIntent}` }, ...current.directorLog].slice(0, 12),
        isLoading: false,
      }));
      setLastTurnPlan(result.turnPlan);
      setComposerValue('');
    } catch (error: any) {
      updateState((current) => ({ ...current, isLoading: false, error: error?.message || String(error) }));
    }
  };

  const handleProfileChange = (profile: string) => {
    const raw = localStorage.getItem(`${PROFILE_SAVE_PREFIX}${profile}`);
    const loaded = raw ? ({ ...createInitialStoryAppState(), ...JSON.parse(raw) } as StoryAppState) : createInitialStoryAppState();
    setState({ ...loaded, userProfile: profile, availableProfiles: state.availableProfiles });
    setLastTurnPlan(null);
    setComposerValue('');
  };

  const handleCreateProfile = () => {
    const profileName = `劇本-${state.availableProfiles.length + 1}`;
    const profiles = [...state.availableProfiles, profileName];
    localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(profiles));
    setState((current) => ({ ...createInitialStoryAppState(), availableProfiles: profiles, userProfile: profileName, apiKey: current.apiKey, selectedModel: current.selectedModel, models: current.models }));
  };

  const handleDeleteProfile = () => {
    if (!state.userProfile || state.availableProfiles.length <= 1) return;
    const remaining = state.availableProfiles.filter((profile) => profile !== state.userProfile);
    localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(remaining));
    localStorage.removeItem(`${PROFILE_SAVE_PREFIX}${state.userProfile}`);
    const nextProfile = remaining[0];
    const raw = localStorage.getItem(`${PROFILE_SAVE_PREFIX}${nextProfile}`);
    const loaded = raw ? ({ ...createInitialStoryAppState(), ...JSON.parse(raw) } as StoryAppState) : createInitialStoryAppState();
    setState({ ...loaded, userProfile: nextProfile, availableProfiles: remaining, apiKey: state.apiKey, selectedModel: state.selectedModel, models: state.models });
    setLastTurnPlan(null);
    setComposerValue('');
  };

  const handleActorUpdate = (actor: ActorState) => {
    updateState((current) => {
      const nextActors = current.actors.map((candidate) => candidate.id === actor.id ? actor : candidate);
      return { ...current, actors: nextActors, campaign: { ...current.campaign, activeActorIds: nextActors.filter((candidate) => candidate.isActiveInScene).map((candidate) => candidate.id) } };
    });
  };

  const handleAddActor = (role: ActorRole) => {
    const actor = createActor(role, state.selectedModel);
    updateState((current) => ({ ...current, actors: [...current.actors, actor], selectedActorId: actor.id, campaign: { ...current.campaign, activeActorIds: [...current.campaign.activeActorIds, actor.id] } }));
  };

  const handleRelationshipChange = (targetActorId: string, field: 'label' | 'summary' | 'intensity' | 'visibility', value: string | number) => {
    if (!selectedActor) return;
    updateState((current) => {
      const currentEdge = getRelationshipEdge(current.campaign.relationshipGraph, selectedActor.id, targetActorId);
      const base = currentEdge || { sourceActorId: selectedActor.id, targetActorId, label: '未定義', summary: '', intensity: 1, visibility: 'private' as VisibilityScope, lastUpdatedTurn: current.campaign.turn };
      const nextRelationshipGraph = upsertRelationshipEdge(current.campaign.relationshipGraph, { ...base, [field]: value, lastUpdatedTurn: current.campaign.turn });
      return { ...current, campaign: { ...current.campaign, relationshipGraph: nextRelationshipGraph }, memoryGraph: ingestRelationshipGraph(current.memoryGraph, nextRelationshipGraph, current.campaign.turn) };
    });
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#17334f_0%,#09111f_45%,#05080f_100%)] text-rpg-text">
      <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
        <header className="mb-4 rounded-[32px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.45em] text-cyan-300/80">多 AI 劇場引擎</div>
              <h1 className="mt-2 text-3xl font-semibold text-white">角色關係網與可見資訊控制</h1>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-300">這版會顯示每個角色真正看得見的事件與記憶，也會把舊系統的 StoryState、LoreBook、Chronicle 與 RP 記錄遷入新的記憶圖譜。</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-300">目前檔案：<span className="font-semibold text-white">{state.userProfile}</span></div>
              <Button variant={state.appMode === 'player' ? 'primary' : 'secondary'} onClick={() => updateState((current) => ({ ...current, appMode: 'player' }))}>玩家模式</Button>
              <Button variant={state.appMode === 'director' ? 'primary' : 'secondary'} onClick={() => updateState((current) => ({ ...current, appMode: 'director' }))}>導演模式</Button>
            </div>
          </div>
        </header>

        {state.error && <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{state.error}</div>}
        {state.migrationNotes.length > 0 && <MemoryList title="遷移說明" entries={state.migrationNotes.map((note, index) => ({ id: `${index}`, title: `遷移項目 ${index + 1}`, content: note }))} emptyLabel="目前沒有遷移說明。" />}

        <div className="mb-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <Panel title="會話設定">
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="OpenRouter API Key" type="password" value={state.apiKey} onChange={(event) => updateState((current) => ({ ...current, apiKey: event.target.value }))} />
              <label className="block text-sm font-medium text-rpg-muted">
                預設模型
                {state.models.length > 0 ? (
                  <select className="mt-1 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" value={state.selectedModel} onChange={(event) => updateState((current) => ({ ...current, selectedModel: event.target.value }))}>
                    <option value="">選擇模型</option>
                    {state.models.map((model: OpenRouterModel) => <option key={model.id} value={model.id}>{model.name}</option>)}
                  </select>
                ) : (
                  <input className="mt-1 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" value={state.selectedModel} onChange={(event) => updateState((current) => ({ ...current, selectedModel: event.target.value }))} placeholder="例如：openai/gpt-4.1-mini" />
                )}
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={handleFetchModels} isLoading={state.isLoading}>讀取模型</Button>
              <Button variant="secondary" onClick={handleCreateProfile}>新增劇本</Button>
              <Button variant="danger" onClick={handleDeleteProfile}>刪除劇本</Button>
            </div>
          </Panel>

          <Panel title="檔案列表">
            <div className="flex flex-wrap gap-2">
              {state.availableProfiles.map((profile) => (
                <button key={profile} onClick={() => handleProfileChange(profile)} className={`rounded-full border px-4 py-2 text-sm transition ${profile === state.userProfile ? 'border-cyan-400/40 bg-cyan-500/10 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20'}`}>
                  {profile}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_420px] xl:min-h-[calc(100vh-14rem)]">
          <aside className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <Panel title="場景設定">
              <Input label="世界名稱" value={state.campaign.world.name} onChange={(event) => updateState((current) => ({ ...current, campaign: { ...current.campaign, world: { ...current.campaign.world, name: event.target.value } } }))} />
              <label className="mt-3 block text-sm font-medium text-rpg-muted">
                當前場景
                <textarea className="mt-1 h-28 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" value={state.campaign.currentScene} onChange={(event) => updateState((current) => ({ ...current, campaign: { ...current.campaign, currentScene: event.target.value } }))} />
              </label>
              <label className="mt-3 block text-sm font-medium text-rpg-muted">
                世界描述
                <textarea className="mt-1 h-28 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" value={state.campaign.world.description} onChange={(event) => updateState((current) => ({ ...current, campaign: { ...current.campaign, world: { ...current.campaign.world, description: event.target.value } } }))} />
              </label>
            </Panel>

            <Panel title="角色列表">
              <div className="mb-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => handleAddActor('npc')}>+ 角色</Button>
                <Button size="sm" variant="ghost" onClick={() => handleAddActor('player')}>+ 玩家角色</Button>
              </div>
              <div className="space-y-3">
                {state.actors.map((actor) => (
                  <button key={actor.id} onClick={() => updateState((current) => ({ ...current, selectedActorId: actor.id }))} className={`w-full rounded-3xl border p-4 text-left transition ${actor.id === state.selectedActorId ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-white/8 bg-slate-950/60 hover:border-white/20'}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.3em] ${roleTheme[actor.role]}`}>{roleLabel[actor.role]}</span>
                      <span className="text-xs text-slate-500">{actor.isActiveInScene ? '場上' : '場外'}</span>
                    </div>
                    <div className="text-sm font-semibold text-white">{actor.name}</div>
                    <div className="mt-1 text-sm text-slate-300">{actor.tagline}</div>
                  </button>
                ))}
              </div>
            </Panel>

            <MemoryList title="可見性規則" entries={state.campaign.visibilityRules.map((rule) => ({ id: rule.id, title: rule.label, content: `${rule.description} [${rule.appliesTo}/${rule.scope}]` }))} emptyLabel="目前沒有可見性規則。" />
          </aside>

          <main className="flex flex-col rounded-[32px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur xl:min-h-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">故事流程</div>
                <div className="mt-1 text-lg font-semibold text-white">第 {state.campaign.turn} 回合 · {state.campaign.currentArc}</div>
              </div>
              <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-slate-300">焦點角色：<span className="font-semibold text-white">{selectedActor?.name}</span></div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {publicSceneLog.map((event) => <SceneEventCard key={event.id} event={event} />)}
            </div>

            <div className="mt-4 rounded-[28px] border border-white/10 bg-slate-950/75 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">{state.appMode === 'director' ? '導演輸入' : '玩家行動'}</div>
              <textarea className="h-28 w-full rounded-[24px] border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" placeholder={state.appMode === 'director' ? '例如：讓官方壓力升高，但暫時不要揭露核心陰謀。' : `請以 ${selectedActor?.name || '目前焦點角色'} 的身份輸入下一步行動或台詞。`} value={composerValue} onChange={(event) => setComposerValue(event.target.value)} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-400">{state.appMode === 'director' ? '導演輸入只會進入導演記憶，不應直接洩漏給角色可見資訊。' : '玩家輸入會先成為公開場景事件，再由主持與 NPC 依序回應。'}</div>
                <Button onClick={handleRunTurn} isLoading={state.isLoading}>執行回合</Button>
              </div>
            </div>
          </main>

          <aside className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <Panel title="角色編輯器">
              {selectedActor && (
                <div className="space-y-4">
                  <Input label="角色名稱" value={selectedActor.name} onChange={(event) => handleActorUpdate({ ...selectedActor, name: event.target.value })} />
                  <Input label="角色定位" value={selectedActor.tagline} onChange={(event) => handleActorUpdate({ ...selectedActor, tagline: event.target.value })} />
                  <Input label="口吻" value={selectedActor.voice} onChange={(event) => handleActorUpdate({ ...selectedActor, voice: event.target.value })} />
                  <Input label="狀態" value={selectedActor.status} onChange={(event) => handleActorUpdate({ ...selectedActor, status: event.target.value })} />
                  <label className="block text-sm font-medium text-rpg-muted">目標<textarea className="mt-1 h-20 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" value={formatListInput(selectedActor.goals)} onChange={(event) => handleActorUpdate({ ...selectedActor, goals: parseListInput(event.target.value) })} /></label>
                  <label className="block text-sm font-medium text-rpg-muted">秘密<textarea className="mt-1 h-20 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" value={formatListInput(selectedActor.secrets)} onChange={(event) => handleActorUpdate({ ...selectedActor, secrets: parseListInput(event.target.value) })} /></label>
                  <label className="block text-sm font-medium text-rpg-muted">系統提示<textarea className="mt-1 h-28 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 font-mono text-sm text-rpg-text outline-none focus:border-cyan-400" value={selectedActor.modelConfig.systemPrompt} onChange={(event) => handleActorUpdate({ ...selectedActor, modelConfig: { ...selectedActor.modelConfig, systemPrompt: event.target.value } })} /></label>
                </div>
              )}
            </Panel>
            {selectedActor && (
              <Panel title="角色關係網">
                <div className="space-y-3">
                  {state.actors.filter((actor) => actor.id !== selectedActor.id).map((peer) => {
                    const edge = getRelationshipEdge(state.campaign.relationshipGraph, selectedActor.id, peer.id) || { sourceActorId: selectedActor.id, targetActorId: peer.id, label: '未定義', summary: '', intensity: 1, visibility: 'private' as VisibilityScope, lastUpdatedTurn: state.campaign.turn };
                    return (
                      <div key={peer.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="mb-2 text-sm font-semibold text-white">{peer.name}</div>
                        <Input label="關係標籤" value={edge.label} onChange={(event) => handleRelationshipChange(peer.id, 'label', event.target.value)} />
                        <label className="mt-3 block text-sm font-medium text-rpg-muted">關係摘要<textarea className="mt-1 h-20 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" value={edge.summary} onChange={(event) => handleRelationshipChange(peer.id, 'summary', event.target.value)} /></label>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <label className="block text-sm font-medium text-rpg-muted">可見性<select className="mt-1 w-full rounded-2xl border border-rpg-700 bg-rpg-800 px-4 py-3 text-rpg-text outline-none focus:border-cyan-400" value={edge.visibility} onChange={(event) => handleRelationshipChange(peer.id, 'visibility', event.target.value)}><option value="public">公開</option><option value="private">私有</option><option value="director">導演</option></select></label>
                          <label className="block text-sm font-medium text-rpg-muted">強度<input type="range" min="1" max="5" step="1" className="mt-4 w-full accent-cyan-400" value={edge.intensity} onChange={(event) => handleRelationshipChange(peer.id, 'intensity', Number(event.target.value))} /></label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}
            <Panel title="可見資訊摘要">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"><div className="text-xs uppercase tracking-[0.25em] text-slate-500">公開記憶</div><div className="mt-2 text-2xl font-semibold text-white">{visibilitySummary.publicCount}</div></div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"><div className="text-xs uppercase tracking-[0.25em] text-slate-500">私有記憶</div><div className="mt-2 text-2xl font-semibold text-white">{visibilitySummary.privateCount}</div></div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"><div className="text-xs uppercase tracking-[0.25em] text-slate-500">定向共享</div><div className="mt-2 text-2xl font-semibold text-white">{visibilitySummary.directedCount}</div></div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"><div className="text-xs uppercase tracking-[0.25em] text-slate-500">可見事件</div><div className="mt-2 text-2xl font-semibold text-white">{visibilitySummary.visibleEventCount}</div></div>
              </div>
            </Panel>
            <MemoryList title="可見記憶" entries={visibleMemories} emptyLabel="目前沒有可見記憶。" />
            <MemoryList title="私有記憶" entries={privateMemories} emptyLabel="目前沒有私有記憶。" />
            <MemoryList title="可見場景切片" entries={visibleSceneSlice.map((event) => ({ id: event.id, title: `${event.actorName} · 第 ${event.turn} 回合`, content: event.content, scope: event.visibility, category: event.kind }))} emptyLabel="目前沒有可見事件。" />
            <MemoryList title="導演記憶" entries={directorMemories} emptyLabel="目前沒有導演專用記憶。" />
            {relationshipEdges.length > 0 && <MemoryList title="關係快照" entries={relationshipEdges.map((edge) => ({ id: edge.id, title: edge.label, content: `${edge.summary}（${edge.visibility}，${edge.intensity}/5）` }))} emptyLabel="目前沒有關係資料。" />}
            <MemoryList title="回合計畫" entries={lastTurnPlan ? [{ id: 'plan', title: `發言順序：${lastTurnPlan.speakerOrder.join(' → ')}`, content: [...lastTurnPlan.notes, ...lastTurnPlan.visibilityNotes].join(' ') }] : []} emptyLabel="執行一個回合後，這裡會顯示編排說明。" />
          </aside>
        </div>
      </div>
    </div>
  );
};

export default StoryTheaterApp;
