import { App, Notice, TFile } from 'obsidian';
import { tokenize } from './tokenize';
import { OllamaClient } from './embeddings';
import type { InsightsSettings, IndexState, SparseVector, SearchResult, DocumentMeta } from './types';

const SENTIMENT_LEXICON: Record<string, number> = {
	good: 1, great: 1, excellent: 1, happy: 1, love: 1, positive: 1, success: 1, win: 1,
	bad: -1, poor: -1, terrible: -1, sad: -1, hate: -1, negative: -1, fail: -1, loss: -1
};

export function simpleSentiment(tokens: string[]): number {
	let score = 0;
	for (const t of tokens) {
		if (t in SENTIMENT_LEXICON) score += SENTIMENT_LEXICON[t];
	}
	// clamp to [-1,1]
	if (score > 0) return Math.min(1, score / 5);
	if (score < 0) return Math.max(-1, score / 5);
	return 0;
}

function computeWordCount(tokens: string[]): number {
	return tokens.length;
}

function vectorDot(a: SparseVector, b: SparseVector): number {
	let sum = 0;
	const [shorter, longer] = Object.keys(a).length < Object.keys(b).length ? [a, b] : [b, a];
	for (const k in shorter) {
		const av = shorter[k];
		const bv = longer[k];
		if (bv !== undefined) sum += av * bv;
	}
	return sum;
}

function vectorNorm(a: SparseVector): number {
	let sum = 0;
	for (const k in a) sum += a[k] * a[k];
	return Math.sqrt(sum);
}

export function cosineSparse(a: SparseVector, b: SparseVector): number {
	const denom = vectorNorm(a) * vectorNorm(b);
	if (denom === 0) return 0;
	return vectorDot(a, b) / denom;
}

export function cosineDense(a: number[], b: number[]): number {
	let dot = 0, an = 0, bn = 0;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		dot += a[i] * b[i];
		an += a[i] * a[i];
		bn += b[i] * b[i];
	}
	const denom = Math.sqrt(an) * Math.sqrt(bn);
	if (denom === 0) return 0;
	return dot / denom;
}

export function recencyWeight(mtimeMs: number, halfLifeDays: number, nowMs: number): number {
	if (halfLifeDays <= 0) return 1;
	const msPerDay = 24 * 60 * 60 * 1000;
	const ageDays = Math.max(0, (nowMs - mtimeMs) / msPerDay);
	return Math.pow(0.5, ageDays / halfLifeDays);
}

export function buildExcerpt(content: string, queryTokens: string[]): string {
	const lines = content.split(/\n+/);
	for (const line of lines) {
		const lower = line.toLowerCase();
		for (const t of queryTokens) {
			if (t && lower.includes(t)) return line.trim().slice(0, 240);
		}
	}
	return (lines[0] || '').trim().slice(0, 240);
}

export function readHead(content: string, maxChars = 1200): string {
	const lines = content.split(/\n+/);
	const head = lines.slice(0, 40).join('\n');
	return head.slice(0, maxChars);
}

function firstH1OrBasename(file: TFile, content: string): string {
	const m = content.match(/^#\s+(.+)$/m);
	if (m) return m[1].trim();
	return file.basename;
}

function getTagsFromCache(app: App, file: TFile): string[] {
	const cache = app.metadataCache.getFileCache(file);
	const tags = new Set<string>();
	if (cache?.tags) {
		for (const t of cache.tags) if (t.tag) tags.add(t.tag.replace(/^#/, ''));
	}
	if (cache?.frontmatter) {
		const fm = cache.frontmatter as Record<string, unknown>;
		const fmTags = fm['tags'];
		if (Array.isArray(fmTags)) fmTags.forEach((x) => typeof x === 'string' && tags.add(x.replace(/^#/, '')));
		else if (typeof fmTags === 'string') fmTags.split(',').forEach((x) => tags.add(x.trim().replace(/^#/, '')));
	}
	return Array.from(tags);
}

export async function indexAllMarkdown(app: App, settings: InsightsSettings): Promise<IndexState> {
	const files = app.vault.getMarkdownFiles();
	const documents: Record<string, DocumentMeta> = {};
	const termDocFreq: Record<string, number> = {};
	const docTermCounts: Record<string, Record<string, number>> = {};
	const docVectors: Record<string, SparseVector> = {};
	const invertedIndex: Record<string, string[]> = {};

	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		const tokens = tokenize(content);
		const counts: Record<string, number> = {};
		for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
		docTermCounts[file.path] = counts;
		for (const t in counts) termDocFreq[t] = (termDocFreq[t] || 0) + 1;
		const meta: DocumentMeta = {
			path: file.path,
			title: firstH1OrBasename(file, content),
			mtimeMs: file.stat.mtime,
			wordCount: computeWordCount(tokens),
			sentiment: simpleSentiment(tokens),
			tags: getTagsFromCache(app, file),
		};
		documents[file.path] = meta;
	}

	const N = files.length || 1;
	const vocabularyIdf: Record<string, number> = {};
	for (const term in termDocFreq) {
		const df = termDocFreq[term];
		vocabularyIdf[term] = Math.log(N / (1 + df));
	}

	for (const path in docTermCounts) {
		const counts = docTermCounts[path];
		const vec: SparseVector = {};
		let maxTf = 1;
		for (const t in counts) if (counts[t] > maxTf) maxTf = counts[t];
		for (const t in counts) {
			const tf = 0.5 + 0.5 * (counts[t] / maxTf);
			const idf = vocabularyIdf[t] || 0;
			vec[t] = tf * idf;
			(invertedIndex[t] ||= []).push(path);
		}
		docVectors[path] = vec;
	}

	let denseVectors: Record<string, number[]> | undefined;
	if (settings.embeddingProvider === 'ollama') {
		try {
			const client = new OllamaClient({ baseUrl: settings.ollama.baseUrl, model: settings.ollama.model });
			denseVectors = {};
			for (const file of files) {
				const content = await app.vault.cachedRead(file);
				const head = `${documents[file.path].title}\n\n${readHead(content)}`;
				const [vec] = await client.embed([head]);
				if (Array.isArray(vec)) denseVectors[file.path] = vec;
			}
		} catch (e) {
			new Notice('Ollama embeddings failed. Falling back to TF-IDF.');
			denseVectors = undefined;
		}
	}

	return { documents, vocabularyIdf, docVectors, invertedIndex, denseVectors };
}

export async function search(app: App, settings: InsightsSettings, index: IndexState | null, query: string): Promise<SearchResult[]> {
	if (!index) return [];
	const { documents, vocabularyIdf, docVectors, denseVectors } = index;
	const nowMs = Date.now();
	const contentTokens = tokenize(query);
	if (contentTokens.length === 0) return [];

	// Query TF-IDF vector
	const qCounts: Record<string, number> = {};
	for (const t of contentTokens) qCounts[t] = (qCounts[t] || 0) + 1;
	let qVec: SparseVector = {};
	let maxTf = 1;
	for (const t in qCounts) if (qCounts[t] > maxTf) maxTf = qCounts[t];
	for (const t in qCounts) {
		const tf = 0.5 + 0.5 * (qCounts[t] / maxTf);
		const idf = vocabularyIdf[t] || 0;
		qVec[t] = tf * idf;
	}

	const results: SearchResult[] = [];
	if (settings.embeddingProvider === 'ollama' && denseVectors) {
		try {
			// Dense query vector via Ollama
			const client = new OllamaClient({ baseUrl: settings.ollama.baseUrl, model: settings.ollama.model });
			const [qDense] = await client.embed([query]);
			for (const path in documents) {
				const dDense = denseVectors[path];
				if (!dDense) continue;
				const sim = cosineDense(qDense, dDense);
				const rec = recencyWeight(documents[path].mtimeMs, settings.recencyHalfLifeDays, nowMs);
				const sent = 1 + 0.1 * (documents[path].sentiment || 0);
				const score = Math.max(0, sim) * rec * sent;
				results.push({
					path,
					title: documents[path].title,
					excerpt: documents[path].title,
					similarity: sim,
					recencyBoost: rec,
					sentimentBoost: sent,
					score,
				});
			}
		} catch (e) {
			// fall back to TF-IDF below
		}
	}

	if (results.length === 0) {
		// TF-IDF search
		for (const path in documents) {
			const sim = cosineSparse(qVec, docVectors[path] || {});
			if (sim <= 0) continue;
			const rec = recencyWeight(documents[path].mtimeMs, settings.recencyHalfLifeDays, nowMs);
			const sent = 1 + 0.1 * (documents[path].sentiment || 0);
			results.push({
				path,
				title: documents[path].title,
				excerpt: documents[path].title,
				similarity: sim,
				recencyBoost: rec,
				sentimentBoost: sent,
				score: sim * rec * sent,
			});
		}
	}

	// Fill excerpts by reading file heads lazily
	const topK = results.sort((a, b) => b.score - a.score).slice(0, settings.maxSearchResults);
	for (const r of topK) {
		try {
			const file = app.vault.getAbstractFileByPath(r.path);
			if (file instanceof TFile) {
				const content = await app.vault.cachedRead(file);
				r.excerpt = buildExcerpt(content, contentTokens);
			}
		} catch {}
	}
	return topK;
}