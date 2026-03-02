/**
 * vectorWorker.ts — Web Worker for embedding generation.
 *
 * Runs @huggingface/transformers in a separate thread so the main UI
 * is never blocked by model loading or inference.
 *
 * Supports two message types:
 *   - 'init'   : Pre-warm the model (optional, will lazy-init otherwise)
 *   - 'embed'  : Generate embeddings for an array of texts
 *   - 'search' : Embed a query and return Top-K cosine similarity results
 */

import { pipeline, FeatureExtractionPipeline } from '@huggingface/transformers';
import { cosineSimilarity } from './vectorStore';
import type { VectorEntry, RAGResult } from '../types';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let embedder: FeatureExtractionPipeline | null = null;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
    if (embedder) return embedder;
    if (!initPromise) {
        initPromise = pipeline('feature-extraction', MODEL_ID, {
            // @ts-ignore — dtype option
            dtype: 'fp32',
        }).then(model => {
            embedder = model as FeatureExtractionPipeline;
            console.info('[RAG Worker] Model loaded:', MODEL_ID);
            return embedder;
        });
    }
    return initPromise;
}

/** Extract a flat number[] from the model output tensor. */
async function embed(texts: string[]): Promise<number[][]> {
    const model = await getEmbedder();
    const results: number[][] = [];
    for (const text of texts) {
        const output = await model(text, { pooling: 'mean', normalize: true });
        // output.data is a Float32Array (flattened); output.dims tells us shape
        const vec = Array.from(output.data as Float32Array);
        results.push(vec);
    }
    return results;
}

// --- Worker Message Handler ---

export interface WorkerRequest {
    type: 'init' | 'embed' | 'search';
    requestId: string;
    payload?: {
        texts?: string[];
        queryText?: string;
        entries?: VectorEntry[];
        topK?: number;
    };
}

export interface WorkerResponse {
    requestId: string;
    type: 'init_done' | 'embed_done' | 'search_done' | 'error';
    vectors?: number[][];
    results?: RAGResult[];
    error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const { type, requestId, payload } = e.data;

    try {
        switch (type) {
            case 'init': {
                await getEmbedder();
                (self as any).postMessage({ requestId, type: 'init_done' } as WorkerResponse);
                break;
            }

            case 'embed': {
                const texts = payload?.texts ?? [];
                if (texts.length === 0) {
                    (self as any).postMessage({ requestId, type: 'embed_done', vectors: [] } as WorkerResponse);
                    break;
                }
                const vectors = await embed(texts);
                (self as any).postMessage({ requestId, type: 'embed_done', vectors } as WorkerResponse);
                break;
            }

            case 'search': {
                const queryText = payload?.queryText ?? '';
                const entries = payload?.entries ?? [];
                const topK = payload?.topK ?? 5;

                if (!queryText || entries.length === 0) {
                    (self as any).postMessage({ requestId, type: 'search_done', results: [] } as WorkerResponse);
                    break;
                }

                const [queryVector] = await embed([queryText]);
                const scored: RAGResult[] = entries
                    .map(v => ({
                        text: v.text,
                        score: cosineSimilarity(queryVector, v.vector),
                        metadata: v.metadata,
                    }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, topK);

                (self as any).postMessage({ requestId, type: 'search_done', results: scored } as WorkerResponse);
                break;
            }
        }
    } catch (err: any) {
        console.error('[RAG Worker] Error:', err);
        (self as any).postMessage({
            requestId,
            type: 'error',
            error: err?.message ?? String(err),
        } as WorkerResponse);
    }
};
