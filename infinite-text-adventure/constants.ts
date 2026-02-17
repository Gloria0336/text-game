import { WorldSetting } from './types';

export const WORLD_PRESETS: WorldSetting[] = [
  {
    id: 'fantasy',
    name: '經典奇幻 (Fantasy)',
    description: '劍與魔法的世界，龍與地下城的規則，充滿未知的冒險。',
    promptMix: 'Classic High Fantasy, D&D rules based logic, magic, dragons, dungeons, elves, dwarves.'
  },
  {
    id: 'scifi',
    name: '硬科幻 (Hard Sci-Fi)',
    description: '廣闊的宇宙，先進的科技，太空探索與星際衝突。',
    promptMix: 'Hard Science Fiction, space exploration, advanced physics, aliens, starships, futuristic technology.'
  },
  {
    id: 'cyberpunk',
    name: '賽博龐克 (Cyberpunk)',
    description: '高科技低生活，霓虹燈下的陰影，企業統治與駭客行動。',
    promptMix: 'Cyberpunk, high tech low life, dystopia, cybernetics, corporations, hackers, neon lights.'
  },
  {
    id: 'xianxia',
    name: '仙俠修真 (Xianxia)',
    description: '修仙問道，逆天而行，飛劍法寶，探索三千世界。',
    promptMix: 'Xianxia, Chinese Cultivation, Taoism, flying swords, immortality, sects, martial arts magic.'
  },
  {
    id: 'urban',
    name: '現代都市 (Urban)',
    description: '熟悉的現代社會，隱藏在平靜表面下的秘密與陰謀。',
    promptMix: 'Modern Urban setting, realistic, mystery, thriller, slice of life with a twist.'
  },
  {
    id: 'steampunk',
    name: '蒸氣龐克 (Steampunk)',
    description: '維多利亞時代的風格，蒸氣動力機械，齒輪與黃銅的浪漫。',
    promptMix: 'Steampunk, Victorian era, steam power, gears, brass, airships, mechanical inventions.'
  },
  {
    id: 'lovecraft',
    name: '克蘇魯神話 (Lovecraftian)',
    description: '不可名狀的恐怖，古老的邪神，理智的邊緣。',
    promptMix: 'Lovecraftian Horror, cosmic horror, insanity, ancient gods, mystery, investigation.'
  },
  {
    id: 'romance',
    name: '戀愛模擬 (Romance)',
    description: '專注於人際關係與情感發展，甜蜜與波折並存。',
    promptMix: 'Romance, emotional depth, character interactions, drama, relationships.'
  },
  {
    id: 'sliceoflife',
    name: '日常種田 (Slice of Life/Farming)',
    description: '悠閒的鄉村生活，種植作物，經營家園，享受平靜。',
    promptMix: 'Slice of Life, Farming simulation, cozy, relaxing, crafting, community.'
  },
  {
    id: 'apocalypse',
    name: '末日生存 (Post-Apocalyptic)',
    description: '文明崩塌後的世界，資源匱乏，生存是唯一的目標。',
    promptMix: 'Post-Apocalyptic, survival, zombies, ruins, scavenging, harsh environment.'
  }
];

export const INITIAL_STYLE_BOOK = `
1. 嚴格遵守世界觀設定，不要出現出戲的元素。
2. 作為Game Master (GM)，你的描述應該生動、具體，包含感官細節。
3. 戰鬥與技能檢定必須基於邏輯與角色數值，角色不能憑空獲得強大力量。
4. 若玩家嘗試不可能的行動，請給予合理的失敗結果，而非直接拒絕。
5. 對話請使用繁體中文。
`.trim();
