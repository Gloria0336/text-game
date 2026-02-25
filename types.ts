
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

// --- NEW: Structured Story State (replaces summary string) ---
export interface StoryState {
  activeThreads: string;
  npcStates: string;
  plantedPayoffs: string;
  worldLock: string;
  arcPosition: string;
  pcShift: string;
}

// --- NEW: Lore Book Entry (L2 permanent memory) ---
export type LoreCategory = 'npc' | 'world' | 'payoff' | 'rule';

export interface LoreEntry {
  id: string;
  category: LoreCategory;
  title: string;
  content: string;
  lockedAt: number; // turnCount when this entry was written
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
  plantedPayoffs: '世界觀建立中',
  worldLock: '尚未鎖定',
  arcPosition: '開端',
  pcShift: '初始狀態',
};
