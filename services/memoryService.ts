import { Message, StoryState, LoreEntry, LoreCategory } from '../types';
import { generateCompletion } from './openRouterService';
import { archiveExpiredLore } from './ragService';

// --- Types ---
export interface AutoSummaryInput {
    apiKey: string;
    model: string;
    recentMessages: Message[];
    currentStoryState: StoryState;
    currentLoreBook: LoreEntry[];
    turnCount: number;
}

export interface AutoSummaryResult {
    storyState: StoryState;
    loreBook: LoreEntry[];
}

// --- Helpers ---

const VALID_LORE_CATEGORIES: LoreCategory[] = ['npc', 'world', 'payoff', 'rule', 'hidden_plot'];

const storyStateToString = (s: StoryState): string =>
    `Active Threads: ${s.activeThreads}
NPC States: ${s.npcStates}
Planted Payoffs: ${s.plantedPayoffs}
Arc Position: ${s.arcPosition}
PC Shift: ${s.pcShift}`;

/** Remove lore entries that have expired based on the current turn. */
export const pruneLoreBook = (loreBook: LoreEntry[], currentTurn: number): LoreEntry[] =>
    loreBook.filter(e => !e.expireAtTurn || currentTurn < e.expireAtTurn);

/** Strip system metadata from message content for summarization. */
const cleanMessageContent = (content: string): string =>
    content
        .replace(/---UPDATE_START---[\s\S]*?---UPDATE_END---/g, '')
        .replace(/---DICE_START---[\s\S]*?---DICE_END---/g, '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/--- STRICT CURRENT STATE[\s\S]*?------------------------------------------------------/g, '')
        .trim();

/** Build the prompt text for the background summarization call. */
const buildSummaryPrompt = (input: AutoSummaryInput): string => {
    const historyText = input.recentMessages
        .map(m => {
            const cleaned = cleanMessageContent(m.content).slice(0, 400);
            return `${m.role === 'user' ? '玩家' : 'GM'}: ${cleaned}`;
        })
        .join('\n\n');

    const existingLore = input.currentLoreBook.length > 0
        ? input.currentLoreBook.map(e => `[${e.category}][${e.id}] ${e.title}：${e.content}`).join('\n')
        : '（目前典籍為空）';

    return `你是「記憶管理員」，負責維護 TRPG 遊戲的中短期記憶。你有兩個職責：

━━━ 職責 A：更新 Story State（短期記憶·最近 5 輪快照） ━━━
根據以下對話，產出最新的短期劇情快照。這代表「當下」的即時動態。

━━━ 職責 B：更新 Lore Book（中期記憶·已鎖定事件） ━━━
從對話中找出「應該被鎖定記錄」但尚未在典籍中的內容。
- 嚴禁把「世界觀背景、角色初始設定、基調氛圍」搬進典籍
- 嚴禁記錄角色當下裝備、暫時性狀態（中毒、受傷等）
- category 只能是: "npc" | "world" | "payoff" | "rule" | "hidden_plot"

【現有 Story State】
${storyStateToString(input.currentStoryState)}

【現有 Lore Book 條目】
${existingLore}

【最近對話片段（共 ${input.recentMessages.length} 則）】
${historyText}

━━━ 輸出格式（只輸出 JSON，不要任何解釋文字） ━━━
{
  "storyState": {
    "activeThreads": "當前活躍的劇情線",
    "npcStates": "重要 NPC 的即時狀態",
    "plantedPayoffs": "近期埋下或回收的伏筆",
    "arcPosition": "劇情進度位置",
    "pcShift": "角色心境或狀態轉變"
  },
  "newLoreEntries": [
    { "id": "lore_${Date.now()}_0", "category": "npc", "title": "條目標題", "content": "詳細內容", "lockedAt": ${input.turnCount} }
  ]
}

規則：
- storyState 必須完整填寫所有 5 個欄位
- newLoreEntries 若無需新增/更新，輸出空陣列 []
- 覆寫現有條目時保留相同 id，新增條目給予新 id
- 只輸出 JSON`;
};

// --- Core ---

/**
 * Runs the background auto-summary job.
 * Non-blocking — should be called with .then()/.catch(), NOT awaited in the main RP loop.
 */
export async function runAutoSummary(input: AutoSummaryInput): Promise<AutoSummaryResult> {
    const prompt = buildSummaryPrompt(input);

    const { content: raw } = await generateCompletion(
        input.apiKey,
        input.model,
        [{ role: 'user', content: prompt }],
        0.2,
        'json_object'
    );

    // --- Parse response ---
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '').trim();

    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart === -1 || objEnd === -1 || objEnd <= objStart) {
        throw new Error('[AutoSummary] Failed to extract JSON from response');
    }

    const parsed = JSON.parse(cleaned.substring(objStart, objEnd + 1));

    // Validate storyState
    const newStoryState: StoryState = {
        activeThreads: parsed.storyState?.activeThreads ?? input.currentStoryState.activeThreads,
        npcStates: parsed.storyState?.npcStates ?? input.currentStoryState.npcStates,
        plantedPayoffs: parsed.storyState?.plantedPayoffs ?? input.currentStoryState.plantedPayoffs,
        arcPosition: parsed.storyState?.arcPosition ?? input.currentStoryState.arcPosition,
        pcShift: parsed.storyState?.pcShift ?? input.currentStoryState.pcShift,
    };

    // Validate & merge lore entries
    const newLoreEntries: LoreEntry[] = Array.isArray(parsed.newLoreEntries)
        ? parsed.newLoreEntries.filter(
            (e: any) => e.id && e.title && e.content && VALID_LORE_CATEGORIES.includes(e.category)
        )
        : [];

    const mergedLore = [...input.currentLoreBook];
    for (const entry of newLoreEntries) {
        const idx = mergedLore.findIndex(e => e.id === entry.id);
        if (idx >= 0) {
            mergedLore[idx] = entry;
        } else {
            mergedLore.push(entry);
        }
    }

    // Prune expired lore entries
    const prunedLore = pruneLoreBook(mergedLore, input.turnCount);
    const expiredEntries = mergedLore.filter(e => !prunedLore.includes(e));
    const pruneCount = expiredEntries.length;

    // Archive expired entries to L3 vector store (async, non-blocking)
    if (expiredEntries.length > 0) {
        archiveExpiredLore(expiredEntries).catch(err =>
            console.warn('[AutoSummary] Failed to archive expired lore to L3:', err)
        );
    }

    console.info(
        `[AutoSummary] Complete @ turn ${input.turnCount}. ` +
        `StoryState updated. ${newLoreEntries.length} lore entries updated/added.` +
        (pruneCount > 0 ? ` ${pruneCount} expired entries pruned & archived.` : '')
    );

    return {
        storyState: newStoryState,
        loreBook: prunedLore,
    };
}
