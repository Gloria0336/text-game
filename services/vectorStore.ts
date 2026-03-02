import { openDB, IDBPDatabase } from 'idb';
import { VectorEntry, RAGResult } from '../types';

// --- Constants ---
const DB_NAME = 'rpg-vector-store';
const STORE_NAME = 'vectors';
const DB_VERSION = 1;

// --- DB Lifecycle ---

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('by-turn', 'metadata.turn');
                    store.createIndex('by-source', 'metadata.source');
                }
            },
        });
    }
    return dbPromise;
}

// --- CRUD ---

export async function upsertVectors(entries: VectorEntry[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    for (const entry of entries) {
        await tx.store.put(entry);
    }
    await tx.done;
}

export async function getAllVectors(): Promise<VectorEntry[]> {
    const db = await getDB();
    return db.getAll(STORE_NAME);
}

export async function getVectorCount(): Promise<number> {
    const db = await getDB();
    return db.count(STORE_NAME);
}

export async function clearAllVectors(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.clear();
    await tx.done;
}

// --- Math ---

export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

export function searchTopK(
    queryVector: number[],
    vectors: VectorEntry[],
    k: number
): RAGResult[] {
    const scored = vectors.map(v => ({
        text: v.text,
        score: cosineSimilarity(queryVector, v.vector),
        metadata: v.metadata,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
}
