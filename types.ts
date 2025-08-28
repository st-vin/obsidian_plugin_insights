import type { TFile } from "obsidian";

export type EmbeddingProvider = 'tfidf-local' | 'ollama' | 'openai';

export interface OllamaSettings {
	baseUrl: string;
	model: string;
}

export interface RuminationStateEntry {
	count: number;
	lastShownMs: number;
}

export interface RuminationState {
	seenPairs: Record<string, RuminationStateEntry>;
}

export interface RuminationSettings {
	enabled: boolean;
	intervalMinutes: number;
	minSimilarity: number;
	useLinkGraphWeighting: boolean;
	writeDigest: boolean;
	digestNotePath: string;
	noveltyWeight: number; // 0..1
	focusTags: string; // comma-separated
	allowedStartHour: number; // 0..23
	allowedEndHour: number; // 0..23, wraps midnight OK
	maxRepeatsPerPair: number;
	bridgeSummary: boolean;
}

export interface InsightsSettings {
	embeddingProvider: EmbeddingProvider;
	indexOnStartup: boolean;
	autoUpdateOnFileChange: boolean;
	recencyHalfLifeDays: number;
	maxSearchResults: number;
	ollama: OllamaSettings;
	rumination: RuminationSettings;
	ruminationState: RuminationState;
}

export const DEFAULT_SETTINGS: InsightsSettings = {
	embeddingProvider: 'tfidf-local',
	indexOnStartup: true,
	autoUpdateOnFileChange: true,
	recencyHalfLifeDays: 30,
	maxSearchResults: 20,
	ollama: {
		baseUrl: 'http://localhost:11434',
		model: 'nomic-embed-text',
	},
	rumination: {
		enabled: true,
		intervalMinutes: 30,
		minSimilarity: 0.25,
		useLinkGraphWeighting: true,
		writeDigest: false,
		digestNotePath: 'INSIGHTS Digest.md',
		noveltyWeight: 0.4,
		focusTags: '',
		allowedStartHour: 8,
		allowedEndHour: 22,
		maxRepeatsPerPair: 3,
		bridgeSummary: true,
	},
	ruminationState: {
		seenPairs: {},
	},
};

export interface DocumentMeta {
	path: string;
	title: string;
	mtimeMs: number;
	wordCount: number;
	sentiment: number; // [-1,1]
	tags: string[];
}

export type SparseVector = Record<string, number>;

export interface IndexState {
	documents: Record<string, DocumentMeta>; // key: path
	vocabularyIdf: Record<string, number>; // token -> idf
	docVectors: Record<string, SparseVector>; // path -> tfidf
	invertedIndex: Record<string, string[]>; // token -> list of paths
	denseVectors?: Record<string, number[]>; // optional if Ollama
}

export interface SearchResult {
	path: string;
	title: string;
	excerpt: string;
	similarity: number;
	recencyBoost: number;
	sentimentBoost: number;
	score: number;
}

export interface RuminationSuggestion {
	aPath: string;
	bPath: string;
	aTitle: string;
	bTitle: string;
	score: number;
	similarity: number;
	linkAffinity: number;
	noveltyBoost: number;
	sharedTokens: string[];
	bridge?: string;
}

export interface RunRuminationOptions {
	force?: boolean;
}

export type PersistSettings = () => Promise<void>;