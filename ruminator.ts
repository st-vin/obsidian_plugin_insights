import { App, Notice, TFile } from 'obsidian';
import type { IndexState, InsightsSettings, RuminationSuggestion, PersistSettings } from './types';
import { cosineSparse } from './indexer';

function withinAllowedHours(start: number, end: number, now = new Date()): boolean {
	const h = now.getHours();
	if (start === end) return true;
	if (start < end) return h >= start && h < end;
	return h >= start || h < end; // wrap midnight
}

function pairKey(a: string, b: string): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
	if (a.size === 0 && b.size === 0) return 0;
	let inter = 0;
	for (const v of a) if (b.has(v)) inter++;
	const union = a.size + b.size - inter;
	return union === 0 ? 0 : inter / union;
}

function topSharedTokens(a: Record<string, number>, b: Record<string, number>, k = 5): string[] {
	const shared: Array<[string, number]> = [];
	for (const t in a) if (b[t] !== undefined) shared.push([t, (a[t] + b[t])]);
	shared.sort((x, y) => y[1] - x[1]);
	return shared.slice(0, k).map(([t]) => t);
}

export class Ruminator {
	private app: App;
	private getIndex: () => IndexState | null;
	private settings: InsightsSettings;
	private persist: PersistSettings;
	private timer: number | null = null;

	constructor(app: App, getIndex: () => IndexState | null, settings: InsightsSettings, persist: PersistSettings) {
		this.app = app;
		this.getIndex = getIndex;
		this.settings = settings;
		this.persist = persist;
	}

	updateSettings(settings: InsightsSettings) {
		this.settings = settings;
		this.stop();
		if (this.settings.rumination.enabled) this.start();
	}

	start() {
		this.stop();
		if (!this.settings.rumination.enabled) return;
		const intervalMs = Math.max(1, this.settings.rumination.intervalMinutes) * 60_000;
		this.timer = window.setInterval(() => this.tick().catch(() => {}), intervalMs);
	}

	stop() {
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	}

	async tick(force = false): Promise<RuminationSuggestion[]> {
		if (!force && !withinAllowedHours(this.settings.rumination.allowedStartHour, this.settings.rumination.allowedEndHour)) {
			return [];
		}
		const index = this.getIndex();
		if (!index) return [];
		const suggestions = this.computeSuggestions(index);
		if (this.settings.rumination.writeDigest && suggestions.length > 0) {
			await this.writeDigestNote(suggestions);
		}
		return suggestions;
	}

	private computeSuggestions(index: IndexState): RuminationSuggestion[] {
		const minSim = this.settings.rumination.minSimilarity;
		const useLinkGraph = this.settings.rumination.useLinkGraphWeighting;
		const focusTags = new Set(
			this.settings.rumination.focusTags
				.split(',')
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean)
		);
		const docs = Object.keys(index.documents);
		const docVectors = index.docVectors;
		const neighbors: Record<string, Set<string>> = this.buildNeighborSets();

		const now = Date.now();
		const items: RuminationSuggestion[] = [];
		for (let i = 0; i < docs.length; i++) {
			for (let j = i + 1; j < docs.length; j++) {
				const a = docs[i];
				const b = docs[j];
				const sim = cosineSparse(docVectors[a] || {}, docVectors[b] || {});
				if (sim < minSim) continue;

				if (focusTags.size > 0) {
					const aTags = new Set(index.documents[a].tags.map((t) => t.toLowerCase()));
					const bTags = new Set(index.documents[b].tags.map((t) => t.toLowerCase()));
					const hasFocus = [...focusTags].some((t) => aTags.has(t) || bTags.has(t));
					if (!hasFocus) continue;
				}

				const linkAff = useLinkGraph ? jaccard(neighbors[a] || new Set(), neighbors[b] || new Set()) : 0;
				const noveltyEntry = this.settings.ruminationState.seenPairs[pairKey(a, b)];
				const repeats = noveltyEntry?.count ?? 0;
				if (repeats >= this.settings.rumination.maxRepeatsPerPair) continue;
				const noveltyBoost = this.settings.rumination.noveltyWeight * (1 / (1 + repeats));
				const score = sim * (1 + linkAff) * (1 + noveltyBoost);
				const sharedTokens = topSharedTokens(docVectors[a] || {}, docVectors[b] || {}, 5);
				let bridge: string | undefined;
				if (this.settings.rumination.bridgeSummary && sharedTokens.length) {
					bridge = `${index.documents[a].title} and ${index.documents[b].title} connect via ${sharedTokens.slice(0, 3).join(', ')}.`;
				}

				items.push({
					aPath: a,
					bPath: b,
					aTitle: index.documents[a].title,
					bTitle: index.documents[b].title,
					score,
					similarity: sim,
					linkAffinity: linkAff,
					noveltyBoost,
					sharedTokens,
					bridge,
				});
			}
		}

		items.sort((x, y) => y.score - x.score);

		// Update memory (top few only to avoid flooding)
		const top = items.slice(0, 10);
		for (const s of top) {
			const key = pairKey(s.aPath, s.bPath);
			const entry = this.settings.ruminationState.seenPairs[key] || { count: 0, lastShownMs: 0 };
			entry.count += 1;
			entry.lastShownMs = now;
			this.settings.ruminationState.seenPairs[key] = entry;
		}
		void this.persist();
		return top;
	}

	private buildNeighborSets(): Record<string, Set<string>> {
		const resolved = this.app.metadataCache.resolvedLinks;
		const neighbors: Record<string, Set<string>> = {};
		for (const from in resolved) {
			const targets = Object.keys(resolved[from] || {});
			neighbors[from] ||= new Set<string>();
			for (const t of targets) neighbors[from].add(t);
		}
		return neighbors;
	}

	private async writeDigestNote(suggestions: RuminationSuggestion[]) {
		const path = this.settings.rumination.digestNotePath || 'INSIGHTS Digest.md';
		let file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			file = await this.app.vault.create(path, `# INSIGHTS Digest\n`);
		}
		if (!(file instanceof TFile)) return;
		const lines: string[] = [];
		const now = new Date();
		lines.push(`\n## ${now.toLocaleString()}\n`);
		for (const s of suggestions) {
			lines.push(`- ${s.aTitle} ⇄ ${s.bTitle} (score: ${s.score.toFixed(3)}, sim: ${s.similarity.toFixed(3)}, link: ${s.linkAffinity.toFixed(3)})`);
			if (s.bridge) lines.push(`  - ${s.bridge}`);
		}
		await this.app.vault.append(file, lines.join('\n'));
		new Notice('INSIGHTS digest updated');
	}
}