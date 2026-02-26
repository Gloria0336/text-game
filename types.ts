
export type ViewMode = 'GM' | 'RP';

export type Difficulty = 'Story' | 'Normal' | 'Hard' | 'Hardcore';

export interface OpenRouterModel {
  id: string;
  name: string;
}

export interface Skill {
  name: string;
  description: string;
  cost: number;
  type: 'Active' | 'Passive';
  reason?: string;
}

export interface ChronicleEntry {
  turn: number;
  event: string;
}

export interface CharacterStats {
  name: string;
  race: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attributes: Record<string, number>;
  skills: Skill[];
  statusEffects: string[];
  background: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WorldSetting {
  id?: string;
  name: string;
  description: string;
  promptMix: string;
}

// --- L1: Short-term Story State (最近 5 輪的即時動態) ---
export interface StoryState {
  activeThreads: string;  // 當前活躍劇情線
  npcStates: string;      // 重要 NPC 即時狀態
  plantedPayoffs: string; // 本輪前後埋下/回收的伏筆
  arcPosition: string;    // 劇情進度位置
  pcShift: string;        // 角色心境/狀態轉變
}

// --- L2: Lore Book Entry (中期 15-20 輪劇情大綱/伏筆/隱藏路線) ---
export type LoreCategory = 'npc' | 'world' | 'payoff' | 'rule' | 'hidden_plot';

export interface LoreEntry {
  id: string;
  category: LoreCategory;
  title: string;
  content: string;
  lockedAt: number;        // 寫入時的回合數
  expireAtTurn?: number;   // 可選：預計過期的回合數（用於標記短命的中期記憶）
}

export interface GameState {
  // Settings
  apiKey: string;
  selectedModel: string;
  models: OpenRouterModel[];
  customStyle: string;
  isStyleActive: boolean;
  isJailbreakActive: boolean;
  difficulty: Difficulty;

  // App Logic
  viewMode: ViewMode;
  showSettings: boolean;
  showStyleEditor: boolean;
  showLorebook: boolean;
  isGameStarted: boolean;

  // Game Data
  world: WorldSetting;
  character: CharacterStats;
  chronicle: ChronicleEntry[];

  // Chat Histories
  gmMessages: Message[];
  messages: Message[];

  // Memory System
  storyState: StoryState;   // L1: volatile, updated each turn (delta merge)
  loreBook: LoreEntry[];    // L2: permanent, updated every RESUMMARY_INTERVAL turns

  turnCount: number;
  isLoading: boolean;
  error: string | null;
}

export const DEFAULT_CHARACTER: CharacterStats = {
  name: '未定',
  race: '未知',
  class: '冒險者',
  level: 1,
  hp: 100,
  maxHp: 100,
  mp: 50,
  maxMp: 50,
  attributes: {},
  skills: [],
  statusEffects: [],
  background: '尚未設定',
};

export const DEFAULT_WORLD: WorldSetting = {
  name: '未定世界',
  description: '等待被創造的空白畫布。',
  promptMix: '',
};

export const DEFAULT_STORY_STATE: StoryState = {
  activeThreads: '冒險序章',
  npcStates: '無',
  plantedPayoffs: '無',
  arcPosition: '開端',
  pcShift: '初始狀態',
};
