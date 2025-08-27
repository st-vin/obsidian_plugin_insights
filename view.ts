import { App, ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type { SearchResult, RuminationSuggestion } from './types';

export const INSIGHTS_VIEW_TYPE = 'insights-view';

export class InsightsView extends ItemView {
	private containerElRef: HTMLElement | null = null;
	private onSearch: ((q: string) => Promise<SearchResult[]>) | null = null;
	private onRunRumination: (() => Promise<RuminationSuggestion[]>) | null = null;

	getViewType(): string { return INSIGHTS_VIEW_TYPE; }
	getDisplayText(): string { return 'Insights'; }
	getIcon(): string { return 'brain-circuit'; }

	setHandlers(params: {
		onSearch: (q: string) => Promise<SearchResult[]>;
		onRunRumination: () => Promise<RuminationSuggestion[]>;
	}) {
		this.onSearch = params.onSearch;
		this.onRunRumination = params.onRunRumination;
	}

	async onOpen() {
		const container = this.contentEl;
		container.empty();
		container.addClass('insights-view');

		const searchBar = container.createDiv({ cls: 'insights-searchbar' });
		const input = searchBar.createEl('input', { type: 'text', placeholder: 'Semantic search…', cls: 'insights-input' });
		const button = searchBar.createEl('button', { text: 'Search' });
		const resultsEl = container.createDiv({ cls: 'insights-results' });

		const rumEl = container.createDiv({ cls: 'insights-ruminations' });
		rumEl.createEl('h3', { text: 'Ruminations' });
		const rumBtn = rumEl.createEl('button', { text: 'Refresh ruminations' });
		const rumList = rumEl.createDiv();

		const renderResults = (results: SearchResult[]) => {
			resultsEl.empty();
			for (const r of results) {
				const item = resultsEl.createDiv({ cls: 'insights-result' });
				item.createEl('div', { text: r.title, cls: 'insights-title' });
				item.createEl('div', { text: r.excerpt });
				item.createEl('div', { cls: 'insights-meta', text: `sim ${r.similarity.toFixed(3)} · rec ${r.recencyBoost.toFixed(3)} · sent ${r.sentimentBoost.toFixed(3)} · score ${r.score.toFixed(3)}` });
				item.onclick = () => {
					const file = this.app.vault.getAbstractFileByPath(r.path);
					if (file instanceof TFile) this.app.workspace.getLeaf(true).openFile(file);
				};
			}
		};

		const renderRuminations = (items: RuminationSuggestion[]) => {
			rumList.empty();
			for (const s of items) {
				const item = rumList.createDiv({ cls: 'insights-result' });
				item.createEl('div', { text: `${s.aTitle} ⇄ ${s.bTitle}` });
				item.createEl('div', { cls: 'insights-meta', text: `score ${s.score.toFixed(3)} · sim ${s.similarity.toFixed(3)} · link ${s.linkAffinity.toFixed(3)} · novelty ${s.noveltyBoost.toFixed(3)}` });
				if (s.bridge) item.createEl('div', { text: s.bridge });
			}
		};

		button.onclick = async () => {
			if (!this.onSearch) return;
			const q = input.value.trim();
			const res = await this.onSearch(q);
			renderResults(res);
		};

		rumBtn.onclick = async () => {
			if (!this.onRunRumination) return;
			const res = await this.onRunRumination();
			renderRuminations(res);
		};
	}

	async onClose() {
		this.contentEl.empty();
	}
}