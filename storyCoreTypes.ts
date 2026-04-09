export type AppMode = 'player' | 'director';
export type ActorRole = 'gm' | 'npc' | 'player' | 'director';
export type VisibilityScope = 'public' | 'private' | 'director';
export type MemoryCategory =
  | 'scene'
  | 'story_state'
  | 'lore'
  | 'chronicle'
  | 'director'
  | 'relationship';
export type SceneEventKind =
  | 'user_action'
  | 'director_note'
  | 'gm_narration'
  | 'actor_dialogue'
  | 'scene_update'
  | 'system';

export interface OpenRouterModel {
  id: string;
  name: string;
}

export interface WorldSetting {
  id?: string;
  name: string;
  description: string;
  promptMix: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ActorModelConfig {
  model: string;
  temperature: number;
  systemPrompt: string;
  tools: string[];
}

export interface ActorState {
  id: string;
  name: string;
  role: ActorRole;
  tagline: string;
  description: string;
  publicBio: string;
  privateNotes: string;
  goals: string[];
  secrets: string[];
  voice: string;
  status: string;
  knowledgeStyle: string;
  isActiveInScene: boolean;
  isPlayerControlled: boolean;
  modelConfig: ActorModelConfig;
}

export interface RelationshipEdge {
  id: string;
  sourceActorId: string;
  targetActorId: string;
  label: string;
  summary: string;
  intensity: number;
  visibility: VisibilityScope;
  lastUpdatedTurn: number;
}

export interface VisibilityRule {
  id: string;
  label: string;
  description: string;
  appliesTo: 'scene' | 'memory' | 'relationship';
  scope: VisibilityScope;
}

export interface SceneEvent {
  id: string;
  turn: number;
  actorId: string;
  actorName: string;
  actorRole: ActorRole;
  visibility: VisibilityScope;
  visibleToActorIds?: string[];
  hiddenFromActorIds?: string[];
  kind: SceneEventKind;
  content: string;
  timestamp: number;
}

export interface MemoryEntry {
  id: string;
  scope: VisibilityScope;
  category: MemoryCategory;
  ownerActorId?: string;
  sourceEventId?: string;
  visibleToActorIds?: string[];
  hiddenFromActorIds?: string[];
  title: string;
  content: string;
  tags: string[];
  createdAtTurn: number;
  updatedAtTurn: number;
}

export interface MemoryGraphState {
  entries: MemoryEntry[];
}

export interface DirectorState {
  id: string;
  name: string;
  mode: 'observer' | 'intervening';
  goals: string[];
  guardrails: string[];
  hiddenAgenda: string;
  recentCommands: string[];
}

export interface ChronicleEntry {
  turn: number;
  event: string;
}

export interface CampaignState {
  world: WorldSetting;
  currentScene: string;
  currentArc: string;
  rules: string[];
  visibilityRules: VisibilityRule[];
  relationshipGraph: RelationshipEdge[];
  turn: number;
  activeActorIds: string[];
  sceneLog: SceneEvent[];
  chronicle: ChronicleEntry[];
}

export interface TurnPlan {
  turn: number;
  initiatingActorId?: string;
  userIntent: string;
  directorIntent?: string;
  speakerOrder: string[];
  notes: string[];
  visibilityNotes: string[];
}

export interface StoryAppState {
  apiKey: string;
  selectedModel: string;
  models: OpenRouterModel[];
  appMode: AppMode;
  showSettings: boolean;
  isLoading: boolean;
  error: string | null;
  userProfile: string | null;
  availableProfiles: string[];
  selectedActorId: string;
  campaign: CampaignState;
  actors: ActorState[];
  director: DirectorState;
  memoryGraph: MemoryGraphState;
  directorLog: Message[];
  migrationNotes: string[];
}

export interface LegacyWorldSetting {
  name?: string;
  description?: string;
  promptMix?: string;
}

export interface LegacyCharacter {
  name?: string;
  race?: string;
  class?: string;
  level?: number;
  stateDescription?: string;
  background?: string;
}

export interface LegacyStoryState {
  activeThreads?: string;
  npcStates?: string;
  plantedPayoffs?: string;
  arcPosition?: string;
  pcShift?: string;
}

export interface LegacyLoreEntry {
  id?: string;
  category?: 'npc' | 'world' | 'payoff' | 'rule' | 'hidden_plot';
  title?: string;
  content?: string;
  lockedAt?: number;
}

export interface LegacyMessage {
  role?: 'system' | 'user' | 'assistant';
  content?: string;
}

export interface LegacyChronicleEntry {
  turn?: number;
  event?: string;
}

export interface LegacyGameState {
  apiKey?: string;
  selectedModel?: string;
  world?: LegacyWorldSetting;
  character?: LegacyCharacter;
  messages?: LegacyMessage[];
  gmMessages?: LegacyMessage[];
  storyState?: LegacyStoryState;
  loreBook?: LegacyLoreEntry[];
  chronicle?: LegacyChronicleEntry[];
  turnCount?: number;
}

export interface LegacySaveEnvelope {
  timestamp?: string;
  gameState?: LegacyGameState;
}

export const DEFAULT_WORLD: WorldSetting = {
  id: 'ember-harbor',
  name: '灰燼港',
  description:
    '一座被鹽霧、流言市場與派系政治包圍的港口城市。每個街區都藏著籌碼，每段合作都帶著代價。',
  promptMix:
    '黑色奇幻、層層陰謀、角色驅動劇情、超自然流言、政治張力。',
};

export const DEFAULT_ACTORS: ActorState[] = [
  {
    id: 'gm',
    name: '場景主持',
    role: 'gm',
    tagline: '掌控節奏與場景推進',
    description: '負責推進場景、框定後果，並維持整個群像的連貫性。',
    publicBio: '塑造壓力、節奏與環境回應的敘事主持者。',
    privateNotes: '逐步升高派系衝突，並讓每個角色保持鮮明差異。',
    goals: ['維持場景動能', '製造派系對撞壓力'],
    secrets: ['港口下層的封存倉庫把多個派系牽在一起'],
    voice: '沉穩、帶畫面感、隱隱帶著威脅',
    status: '掌握全局',
    knowledgeStyle: '知道公開世界狀態與隱藏的劇本結構',
    isActiveInScene: true,
    isPlayerControlled: false,
    modelConfig: {
      model: '',
      temperature: 0.7,
      systemPrompt:
        'You are the GM of a multi-agent story simulation. Move the scene, preserve continuity, and react to player and director interventions without taking control away from the cast.',
      tools: [],
    },
  },
  {
    id: 'player-1',
    name: '林霧',
    role: 'player',
    tagline: '帶著家族戒指與未竟疑問的旅人',
    description: '作為主要視角角色，他為了失蹤船隊與家族祕密來到港口。',
    publicBio: '直覺敏銳、姿態安靜，卻對港務紀錄過度關心的外來者。',
    privateNotes: '不信任官方管道，願意用利益交換情報。',
    goals: ['查明失蹤船隊', '保住家族名聲'],
    secrets: ['家族戒指內圈藏著一條航線'],
    voice: '克制、觀察細膩、偶爾尖銳',
    status: '剛踏進港口',
    knowledgeStyle: '知道自己的過去與部分線索，但不掌握派系真相',
    isActiveInScene: true,
    isPlayerControlled: true,
    modelConfig: {
      model: '',
      temperature: 0.6,
      systemPrompt:
        'You play a lead character in a story scene. Preserve your voice, goals, and secrets. Do not narrate for other actors.',
      tools: [],
    },
  },
  {
    id: 'npc-mara',
    name: '瑪拉',
    role: 'npc',
    tagline: '黑市情報販子',
    description: '擅長半真半假地交易訊息，在真正出手前會先測試新人。',
    publicBio: '穿梭於碼頭工人、走私客與流言市場之間的情報掮客。',
    privateNotes: '其實正替地下反抗者尋找同一批封存貨物。',
    goals: ['試探主角', '把不確定性變成籌碼'],
    secrets: ['她知道封存倉庫裡並不是空的'],
    voice: '輕挑、警醒、帶點刺探',
    status: '率先接近新來者',
    knowledgeStyle: '熟悉黑市與暗路，但不知道整體陰謀全貌',
    isActiveInScene: true,
    isPlayerControlled: false,
    modelConfig: {
      model: '',
      temperature: 0.85,
      systemPrompt:
        'You are an NPC in a shared story simulation. Speak only from your own perspective and reveal secrets gradually.',
      tools: [],
    },
  },
  {
    id: 'npc-vale',
    name: '維爾',
    role: 'npc',
    tagline: '代表官方壓力的港務監察官',
    description: '表面有禮，骨子裡精於算計，擅長把試探偽裝成流程。',
    publicBio: '掌管許可、貨單與各種政治性拖延的監察官。',
    privateNotes: '知道上層正利用船隊案進行一場安靜的清洗。',
    goals: ['維持秩序', '測試主角會站在哪一邊'],
    secrets: ['他正在掩蓋一份有問題的靠港紀錄'],
    voice: '精準、克制、安靜卻有壓迫感',
    status: '密切觀察新來者',
    knowledgeStyle: '掌握官方紀錄與部分掩蓋行動，但不知道地下勢力全部動向',
    isActiveInScene: true,
    isPlayerControlled: false,
    modelConfig: {
      model: '',
      temperature: 0.55,
      systemPrompt:
        'You are a restrained but strategic NPC. Keep your speech compact, intelligent, and agenda-driven.',
      tools: [],
    },
  },
];

export const DEFAULT_RELATIONSHIPS: RelationshipEdge[] = [
  {
    id: 'rel-player-mara',
    sourceActorId: 'player-1',
    targetActorId: 'npc-mara',
    label: '謹慎盟友',
    summary: '林霧認為瑪拉有用，但也非常危險。',
    intensity: 2,
    visibility: 'public',
    lastUpdatedTurn: 0,
  },
  {
    id: 'rel-mara-player',
    sourceActorId: 'npc-mara',
    targetActorId: 'player-1',
    label: '可利用對象',
    summary: '瑪拉覺得林霧可能成為籌碼，也可能成為合作對象。',
    intensity: 2,
    visibility: 'private',
    lastUpdatedTurn: 0,
  },
  {
    id: 'rel-player-vale',
    sourceActorId: 'player-1',
    targetActorId: 'npc-vale',
    label: '難辨的權威',
    summary: '林霧不信任維爾，但又需要他的通行權。',
    intensity: 1,
    visibility: 'public',
    lastUpdatedTurn: 0,
  },
  {
    id: 'rel-vale-player',
    sourceActorId: 'npc-vale',
    targetActorId: 'player-1',
    label: '潛在線人',
    summary: '維爾正在測試林霧是否能被施壓或拉攏。',
    intensity: 2,
    visibility: 'private',
    lastUpdatedTurn: 0,
  },
  {
    id: 'rel-mara-vale',
    sourceActorId: 'npc-mara',
    targetActorId: 'npc-vale',
    label: '彼此猜疑',
    summary: '瑪拉把維爾視為危險又礙事的官僚障礙。',
    intensity: 3,
    visibility: 'public',
    lastUpdatedTurn: 0,
  },
  {
    id: 'rel-vale-mara',
    sourceActorId: 'npc-vale',
    targetActorId: 'npc-mara',
    label: '麻煩源頭',
    summary: '維爾認為瑪拉會擾亂局勢，但仍值得監控。',
    intensity: 3,
    visibility: 'private',
    lastUpdatedTurn: 0,
  },
];

export const DEFAULT_VISIBILITY_RULES: VisibilityRule[] = [
  {
    id: 'vr-public-events',
    label: '公開場景事件',
    description: '主持敘述與明確宣告的角色行動，預設會成為全體可見資訊，除非被特別隱藏。',
    appliesTo: 'scene',
    scope: 'public',
  },
  {
    id: 'vr-private-memory',
    label: '角色私有記憶',
    description: '每個角色都會保留自己的私有回顧與秘密資訊。',
    appliesTo: 'memory',
    scope: 'private',
  },
  {
    id: 'vr-director-overlay',
    label: '導演全域視角',
    description: '導演模式能查看所有層級的資訊，而角色只能看到被允許的部分。',
    appliesTo: 'memory',
    scope: 'director',
  },
  {
    id: 'vr-relationship-visibility',
    label: '關係可見性',
    description: '角色關係可以是公開、僅來源角色可見，或只有導演能看見。',
    appliesTo: 'relationship',
    scope: 'private',
  },
];

export const DEFAULT_DIRECTOR: DirectorState = {
  id: 'director',
  name: '幕後導演',
  mode: 'observer',
  goals: ['控制節奏', '注入更尖銳的衝突', '維持每個角色的獨特性'],
  guardrails: ['不要把角色口吻混在一起', '不要一次揭露所有秘密'],
  hiddenAgenda: '讓失蹤船隊之謎逐步推向派系戰爭。',
  recentCommands: [],
};

export const DEFAULT_CAMPAIGN: CampaignState = {
  world: DEFAULT_WORLD,
  currentScene:
    '冰冷的海霧壓在港口上。林霧才剛踏進灰燼港，黑市與官方都已經注意到他的存在。',
  currentArc: '序章',
  rules: [
    '每回合由主持先回應，再由場上活躍角色依序接話。',
    '角色只能對自己目前能感知到的資訊作出反應。',
    '導演指令可以影響節奏與壓力，但不能直接改寫角色人格。',
  ],
  visibilityRules: DEFAULT_VISIBILITY_RULES,
  relationshipGraph: DEFAULT_RELATIONSHIPS,
  turn: 0,
  activeActorIds: DEFAULT_ACTORS.filter((actor) => actor.isActiveInScene).map((actor) => actor.id),
  sceneLog: [
    {
      id: 'bootstrap-scene',
      turn: 0,
      actorId: 'gm',
      actorName: '場景主持',
      actorRole: 'gm',
      visibility: 'public',
      kind: 'gm_narration',
      content:
        '港口的霧壓得很低。灰燼港不會歡迎陌生人，它只會先估量他們值多少。',
      timestamp: Date.now(),
    },
  ],
  chronicle: [
    {
      turn: 0,
      event: '故事在灰燼港揭開序幕。主角一抵達，就同時落入黑市與官方的觀察範圍。',
    },
  ],
};

export const DEFAULT_MEMORY_GRAPH: MemoryGraphState = {
  entries: [
    {
      id: 'memory-public-opening',
      scope: 'public',
      category: 'scene',
      title: '開場場景',
      content: '灰燼港以政治張力、低垂海霧與多方勢力審視新來者的氛圍揭幕。',
      tags: ['world', 'opening'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
    {
      id: 'memory-director-intent',
      scope: 'director',
      category: 'director',
      title: '導演目標',
      content: '序章要把主角拉進黑市與官方權力之間的夾縫。',
      tags: ['director', 'pace'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
    {
      id: 'memory-player-secret',
      scope: 'private',
      category: 'lore',
      ownerActorId: 'player-1',
      title: '戒指的祕密',
      content: '林霧知道家族戒指裡藏著一條與失蹤船隊有關的航線。',
      tags: ['secret', 'player'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
    {
      id: 'memory-mara-secret',
      scope: 'private',
      category: 'lore',
      ownerActorId: 'npc-mara',
      title: '瑪拉的祕密',
      content: '瑪拉正在尋找一批與地下反抗者接頭有關的隱藏貨物。',
      tags: ['secret', 'npc'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
    {
      id: 'memory-vale-secret',
      scope: 'private',
      category: 'lore',
      ownerActorId: 'npc-vale',
      title: '維爾的祕密',
      content: '維爾正在協助掩蓋一份與失蹤船隊有關、已經出問題的靠港紀錄。',
      tags: ['secret', 'npc'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
  ],
};
