import { App, Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf, addIcon } from 'obsidian';
import { DEFAULT_SETTINGS, InsightsSettings } from './types';
import { InsightsSettingTab } from './settings';
import { INSIGHTS_VIEW_TYPE, InsightsView } from './view';
import { indexAllMarkdown, search } from './indexer';
import type { IndexState } from './types';
import { Ruminator } from './ruminator';

const RIBBON_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a8 8 0 0 0-8 8v1a6 6 0 0 0 6 6h.5V22l3.5-3h.5a6 6 0 0 0 6-6V10a8 8 0 0 0-8-8Z" fill="currentColor"/></svg>`;

export default class InsightsPlugin extends Plugin {
	settings: InsightsSettings = structuredClone(DEFAULT_SETTINGS);
	private index: IndexState | null = null;
	private ruminator: Ruminator | null = null;

	async onload() {
		addIcon('insights-logo', RIBBON_SVG);
		await this.loadSettings();

		this.registerView(INSIGHTS_VIEW_TYPE, (leaf) => new InsightsView(leaf));
		this.addRibbonIcon('insights-logo', 'Open Insights', async () => this.openInsightsView());

		this.addCommand({ id: 'open-insights-view', name: 'Open Insights view', callback: () => this.openInsightsView() });
		this.addCommand({ id: 'rebuild-index', name: 'Rebuild index', callback: () => this.rebuildIndex() });
		this.addCommand({ id: 'run-rumination-now', name: 'Run rumination now', callback: async () => {
			if (!this.ruminator) return;
			const suggestions = await this.ruminator.tick(true);
			new Notice(`Ruminations: ${suggestions.length} suggestions`);
		}});

		this.addSettingTab(new InsightsSettingTab(this.app, this));

		this.registerEvent(this.app.vault.on('modify', (f) => this.onFileChange(f)));
		this.registerEvent(this.app.vault.on('create', (f) => this.onFileChange(f)));
		this.registerEvent(this.app.vault.on('delete', (f) => this.onFileChange(f)));

		if (this.settings.indexOnStartup) {
			void this.rebuildIndex();
		}

		this.refreshRuminator();
	}

	async onunload() {
		if (this.ruminator) this.ruminator.stop();
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), data || {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async openInsightsView() {
		const leaf = this.getLeaf(true);
		await leaf.setViewState({ type: INSIGHTS_VIEW_TYPE, active: true });
		const view = leaf.view as InsightsView;
		view.setHandlers({
			onSearch: async (q) => search(this.app, this.settings, this.index, q),
			onRunRumination: async () => this.ruminator ? this.ruminator.tick(true) : [],
		});
	}

	getLeaf(split: boolean): WorkspaceLeaf {
		if (this.app.workspace.getLeavesOfType(INSIGHTS_VIEW_TYPE).length > 0) {
			return this.app.workspace.getLeavesOfType(INSIGHTS_VIEW_TYPE)[0];
		}
		return this.app.workspace.getLeaf(split);
	}

	async rebuildIndex() {
		new Notice('INSIGHTS: indexing…');
		try {
			this.index = await indexAllMarkdown(this.app, this.settings);
			new Notice('INSIGHTS: index ready');
		} catch (e) {
			console.error(e);
			new Notice('INSIGHTS: index failed');
		}
	}

	private async onFileChange(f: TAbstractFile) {
		if (!this.settings.autoUpdateOnFileChange) return;
		if (!(f instanceof TFile) || f.extension !== 'md') return;
		// Debounce naive: small delay
		window.setTimeout(() => this.rebuildIndex(), 300);
	}

	refreshRuminator() {
		if (this.ruminator) this.ruminator.stop();
		this.ruminator = new Ruminator(this.app, () => this.index, this.settings, () => this.saveSettings());
		if (this.settings.rumination.enabled) this.ruminator.start();
	}
}