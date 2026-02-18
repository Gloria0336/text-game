
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

export interface CharacterStats {
  name: string;
  race: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  // skillPoints removed
  attributes: Record<string, number>; 
  skills: string[]; // List of learned skill names
  // potentialSkills removed
  inventory: string[];
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
  // showSkillTree removed
  showStyleEditor: boolean; 
  isGameStarted: boolean; 
  
  // Game Data
  world: WorldSetting;
  character: CharacterStats;
  
  // Chat Histories
  gmMessages: Message[]; 
  messages: Message[];   
  
  summary: string; 
  turnCount: number;
  isLoading: boolean;
  error: string | null;
}

export const DEFAULT_CHARACTER: CharacterStats = {
  name: "未定",
  race: "未知",
  class: "冒險者",
  level: 1,
  hp: 100,
  maxHp: 100,
  mp: 50,
  maxMp: 50,
  attributes: {},
  skills: [],
  inventory: [],
  statusEffects: [],
  background: "尚未設定"
};

export const DEFAULT_WORLD: WorldSetting = {
  name: "未定世界",
  description: "等待被創造的空白畫布。",
  promptMix: ""
};
