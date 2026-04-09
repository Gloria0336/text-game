export type AppMode = 'player' | 'director';
export type ActorRole = 'gm' | 'npc' | 'player' | 'director';
export type VisibilityScope = 'public' | 'private' | 'director';
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
  relationships: Record<string, string>;
  isActiveInScene: boolean;
  isPlayerControlled: boolean;
  modelConfig: ActorModelConfig;
}

export interface SceneEvent {
  id: string;
  turn: number;
  actorId: string;
  actorName: string;
  actorRole: ActorRole;
  visibility: VisibilityScope;
  kind: SceneEventKind;
  content: string;
  timestamp: number;
}

export interface MemoryEntry {
  id: string;
  scope: VisibilityScope;
  ownerActorId?: string;
  sourceEventId?: string;
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
}

export const DEFAULT_WORLD: WorldSetting = {
  id: 'ember-harbor',
  name: '灰燼港',
  description:
    '一座被海霧、商會與謠言包圍的港口都市。每條街都藏著祕密，每個派系都想借新來者達成目的。',
  promptMix:
    'Noir fantasy, layered intrigue, character-driven drama, supernatural rumors, political tension.',
};

export const DEFAULT_ACTORS: ActorState[] = [
  {
    id: 'gm',
    name: '旁白總管',
    role: 'gm',
    tagline: '控制節奏與場景的總管',
    description: '負責定義場景、推動事件、平衡角色出場順序。',
    publicBio: '故事的主持者，帶出世界回應與節奏。',
    privateNotes: '優先推動派系衝突與角色秘密逐步揭露。',
    goals: ['維持場景張力', '讓角色目標互相碰撞'],
    secrets: ['港口下層有被封存的異常貨物'],
    voice: '冷靜、精煉、帶一點威脅感',
    status: '掌控全局',
    relationships: {},
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
    tagline: '帶著家徽戒指來到港口的旅人',
    description: '主角兼視角角色，對失蹤船隊與家族往事有執念。',
    publicBio: '外來旅人，表面冷靜，實際上對港口局勢高度敏感。',
    privateNotes: '不信任官方，願意私下交易來換情報。',
    goals: ['查出失蹤船隊真相', '保住家族名聲'],
    secrets: ['知道家徽戒指內藏有舊船圖'],
    voice: '克制、觀察細膩、偶爾鋒利',
    status: '初入港口',
    relationships: {
      'npc-mara': '暫時合作的情報販子',
      'npc-vale': '看不透的港務局監察官',
    },
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
    description: '消息靈通，喜歡用半真半假的情報測試別人。',
    publicBio: '在碼頭與黑市間穿梭的情報商。',
    privateNotes: '其實在幫地下反抗者追查同一批貨。',
    goals: ['試探主角', '換取更大的交易籌碼'],
    secrets: ['她知道封存倉庫並非空倉'],
    voice: '輕佻、機警、帶著戲謔',
    status: '主動接觸新來者',
    relationships: {
      'player-1': '可以利用，也可能成為盟友',
      'npc-vale': '彼此厭惡但互相需要',
    },
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
    tagline: '港務局監察官',
    description: '外表客氣，實則代表官方壓力與秩序。',
    publicBio: '負責監管碼頭與入港審查的監察官。',
    privateNotes: '他知道城主顧問正在利用失蹤船隊案做政治清洗。',
    goals: ['保住秩序', '試探主角站在哪一邊'],
    secrets: ['有意隱瞞某份靠港紀錄'],
    voice: '禮貌、精準、壓迫感穩定',
    status: '密切觀察局勢',
    relationships: {
      'player-1': '可能成為線人，也可能成為威脅',
      'npc-mara': '黑市的不穩定變數',
    },
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

export const DEFAULT_DIRECTOR: DirectorState = {
  id: 'director',
  name: '幕後導演',
  mode: 'observer',
  goals: ['控制節奏', '插入更有戲的衝突', '保留角色獨立性'],
  guardrails: ['不要讓角色口吻混在一起', '不要一次揭露所有秘密'],
  hiddenAgenda: '把失蹤船隊案慢慢推向派系戰。',
  recentCommands: [],
};

export const DEFAULT_CAMPAIGN: CampaignState = {
  world: DEFAULT_WORLD,
  currentScene: '港口的霧夜，主角第一次踏進灰燼港。',
  currentArc: '序章',
  rules: [
    '每回合由 GM 先回應，再由場上活躍角色依序發言。',
    '角色只能使用自己可見的資訊。',
    '導演指令會影響節奏，但不會直接覆寫角色人格。',
  ],
  turn: 0,
  activeActorIds: DEFAULT_ACTORS.filter((actor) => actor.isActiveInScene).map((actor) => actor.id),
  sceneLog: [
    {
      id: 'bootstrap-scene',
      turn: 0,
      actorId: 'gm',
      actorName: '旁白總管',
      actorRole: 'gm',
      visibility: 'public',
      kind: 'gm_narration',
      content:
        '海霧壓低了港口的天際線。灰燼港今晚沒有歡迎你，只有各種視線在衡量你值多少情報、多少麻煩、多少利用價值。',
      timestamp: Date.now(),
    },
  ],
  chronicle: [
    {
      turn: 0,
      event: '灰燼港的故事開始，主角進入港口，兩位關鍵 NPC 已在場邊觀察。',
    },
  ],
};

export const DEFAULT_MEMORY_GRAPH: MemoryGraphState = {
  entries: [
    {
      id: 'memory-bootstrap-public',
      scope: 'public',
      title: '世界開場',
      content: '灰燼港是一座被霧、派系與祕密籠罩的港口都市。',
      tags: ['world', 'opening'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
    {
      id: 'memory-bootstrap-director',
      scope: 'director',
      title: '導演意圖',
      content: '序章要讓主角同時被黑市與官方拉扯。',
      tags: ['director', 'pace'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
    {
      id: 'memory-player-private',
      scope: 'private',
      ownerActorId: 'player-1',
      title: '主角秘密',
      content: '林霧知道家徽戒指內側藏著一張舊船圖，但尚未告知他人。',
      tags: ['secret', 'player'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
    {
      id: 'memory-mara-private',
      scope: 'private',
      ownerActorId: 'npc-mara',
      title: '瑪拉的底牌',
      content: '瑪拉真正想找的是封存倉庫中的異常貨物。',
      tags: ['secret', 'npc'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
    {
      id: 'memory-vale-private',
      scope: 'private',
      ownerActorId: 'npc-vale',
      title: '維爾的壓力',
      content: '維爾正在替上層遮掩靠港紀錄中的漏洞。',
      tags: ['secret', 'npc'],
      createdAtTurn: 0,
      updatedAtTurn: 0,
    },
  ],
};
