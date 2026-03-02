/**
 * ragService.ts — High-level Archive / Retrieve API for L3 long-term memory.
 *
 * Wraps the Web Worker and IndexedDB vector store into simple functions
 * that the main app can call without knowing about embeddings or vectors.
 */

import { upsertVectors, getAllVectors } from './vectorStore';
import type { Message, LoreEntry, VectorEntry, RAGResult } from '../types';
import type { WorkerRequest, WorkerResponse } from './vectorWorker';

// --- Constants ---
const TOP_K = 5;
const RAG_CHAR_CAP = 2000; // Max characters injected into system prompt
const CHUNK_MAX_CHARS = 500; // Max characters per archived chunk

// --- Worker Singleton ---

let worker: Worker | null = null;
let requestCounter = 0;
const pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}>();

function getWorker(): Worker {
    if (!worker) {
        worker = new Worker(
            new URL('./vectorWorker.ts', import.meta.url),
            { type: 'module' }
        );
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const { requestId, type, vectors, results, error } = e.data;
            const pending = pendingRequests.get(requestId);
            if (!pending) return;
            pendingRequests.delete(requestId);

            if (type === 'error') {
                pending.reject(new Error(error));
            } else {
                pending.resolve({ type, vectors, results });
            }
        };
        worker.onerror = (e) => {
            console.error('[RAG Service] Worker error:', e);
        };
    }
    return worker;
}

function sendToWorker(msg: Omit<WorkerRequest, 'requestId'>): Promise<any> {
    const requestId = `rag_${++requestCounter}_${Date.now()}`;
    return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });
        getWorker().postMessage({ ...msg, requestId } as WorkerRequest);
    });
}

// --- Public API ---

/**
 * Initialize the RAG worker and pre-warm the embedding model.
 * Non-blocking — safe to call early (e.g., on App mount).
 */
export async function initRAG(): Promise<void> {
    try {
        await sendToWorker({ type: 'init' });
        console.info('[RAG] Worker initialized, model loaded.');
    } catch (err) {
        console.warn('[RAG] Worker init failed (RAG will be disabled):', err);
        throw err;
    }
}

/**
 * Check if the RAG worker has been created (does not guarantee model loaded).
 */
export function isRAGAvailable(): boolean {
    return worker !== null;
}

// --- Helpers ---

/** Strip system metadata from message content before archiving. */
function cleanForArchive(content: string): string {
    return content
        .replace(/---UPDATE_START---[\s\S]*?---UPDATE_END---/g, '')
        .replace(/---DICE_START---[\s\S]*?---DICE_END---/g, '')
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/--- STRICT CURRENT STATE[\s\S]*?------------------------------------------------------/g, '')
        .trim();
}

/** Split a long text into chunks of at most CHUNK_MAX_CHARS characters. */
function chunkText(text: string): string[] {
    if (text.length <= CHUNK_MAX_CHARS) return [text];

    const chunks: string[] = [];
    // Try to split on paragraph boundaries first
    const paragraphs = text.split(/\n{2,}/);
    let current = '';

    for (const para of paragraphs) {
        if (current.length + para.length + 2 > CHUNK_MAX_CHARS) {
            if (current) chunks.push(current.trim());
            // If a single paragraph exceeds limit, hard-split it
            if (para.length > CHUNK_MAX_CHARS) {
                for (let i = 0; i < para.length; i += CHUNK_MAX_CHARS) {
                    chunks.push(para.slice(i, i + CHUNK_MAX_CHARS));
                }
                current = '';
            } else {
                current = para;
            }
        } else {
            current += (current ? '\n\n' : '') + para;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

// --- Archive ---

/**
 * Archive old messages that have been truncated from the chat window.
 * Call this when messages exceed HISTORY_LIMIT.
 *
 * @param messages The messages that are being discarded (NOT the ones kept)
 * @param turnCount Current turn number
 */
export async function archiveMessages(
    messages: Message[],
    turnCount: number
): Promise<void> {
    // Combine consecutive same-role messages and clean
    const lines: string[] = [];
    for (const msg of messages) {
        const cleaned = cleanForArchive(msg.content);
        if (!cleaned) continue;
        const label = msg.role === 'user' ? '玩家' : 'GM';
        lines.push(`${label}: ${cleaned}`);
    }

    if (lines.length === 0) return;

    // Merge into one text block then chunk
    const fullText = lines.join('\n\n');
    const chunks = chunkText(fullText);

    try {
        // Get embeddings from worker
        const { vectors } = await sendToWorker({
            type: 'embed',
            payload: { texts: chunks },
        });

        // Build VectorEntries
        const entries: VectorEntry[] = chunks.map((text, i) => ({
            id: `msg_t${turnCount}_${i}_${Date.now()}`,
            text,
            vector: vectors[i],
            metadata: {
                turn: turnCount,
                source: 'message' as const,
                timestamp: Date.now(),
            },
        }));

        await upsertVectors(entries);
        console.info(`[RAG] Archived ${entries.length} message chunks @ turn ${turnCount}`);
    } catch (err) {
        console.warn('[RAG] Failed to archive messages:', err);
    }
}

/**
 * Archive expired lore entries so they remain searchable via RAG
 * even after being pruned from active LoreBook.
 */
export async function archiveExpiredLore(
    entries: LoreEntry[]
): Promise<void> {
    if (entries.length === 0) return;

    const texts = entries.map(e => `[${e.category}] ${e.title}：${e.content}`);

    try {
        const { vectors } = await sendToWorker({
            type: 'embed',
            payload: { texts },
        });

        const vectorEntries: VectorEntry[] = entries.map((e, i) => ({
            id: `lore_${e.id}_${Date.now()}`,
            text: texts[i],
            vector: vectors[i],
            metadata: {
                turn: e.lockedAt,
                source: 'lore' as const,
                category: e.category,
                timestamp: Date.now(),
            },
        }));

        await upsertVectors(vectorEntries);
        console.info(`[RAG] Archived ${vectorEntries.length} expired lore entries`);
    } catch (err) {
        console.warn('[RAG] Failed to archive lore:', err);
    }
}

// --- Retrieve ---

/**
 * Retrieve the most relevant long-term memories for the current context.
 * Returns a formatted string ready to inject into the system prompt.
 *
 * @param queryContext A string combining StoryState + latest player input
 * @param topK Number of results to return
 * @returns Formatted prompt section, or empty string if no results
 */
export async function retrieveRelevantMemory(
    queryContext: string,
    topK: number = TOP_K
): Promise<string> {
    try {
        const allVectors = await getAllVectors();
        if (allVectors.length === 0) return '';

        const { results } = await sendToWorker({
            type: 'search',
            payload: { queryText: queryContext, entries: allVectors, topK },
        }) as { results: RAGResult[] };

        if (!results || results.length === 0) return '';

        // Filter out low-relevance results (< 0.3 similarity score)
        const relevant = results.filter(r => r.score >= 0.3);
        if (relevant.length === 0) return '';

        // Build prompt section with char cap
        const lines: string[] = [];
        let charCount = 0;
        for (const r of relevant) {
            const line = `[回合 ${r.metadata.turn}${r.metadata.source === 'lore' ? ' · 典籍' : ''}] ${r.text}`;
            if (charCount + line.length > RAG_CHAR_CAP) break;
            lines.push(line);
            charCount += line.length;
        }

        if (lines.length === 0) return '';

        return `\n━━━ [LONG-TERM MEMORY — 長期記憶·RAG 檢索結果] ━━━
以下是從歷史記憶庫中檢索到的、與當前情境最相關的片段。
這些是「過去確實發生過的事」，但可能是很久以前的事件。
請在適當時機自然地引用這些記憶，但不要強行塞入。

${lines.join('\n')}`;
    } catch (err) {
        console.warn('[RAG] Retrieve failed (skipping L3):', err);
        return '';
    }
}
