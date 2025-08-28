import { App, PluginSettingTab, Setting } from 'obsidian';
import type { InsightsSettings } from './types';
import type InsightsPlugin from './main';

export class InsightsSettingTab extends PluginSettingTab {
	plugin: InsightsPlugin;

	constructor(app: App, plugin: InsightsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'INSIGHTS – SUBCONSCIOUS AI' });

		new Setting(containerEl)
			.setName('Embedding provider')
			.setDesc("Local TF-IDF doesn't use network. Ollama is local-only if installed.")
			.addDropdown((d) =>
				d
					.addOption('tfidf-local', 'TF-IDF (local)')
					.addOption('ollama', 'Ollama (dense)')
					.addOption('openai', 'OpenAI (reserved)')
					.setValue(this.plugin.settings.embeddingProvider)
					.onChange(async (v) => {
						this.plugin.settings.embeddingProvider = v as any;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Index on startup')
			.addToggle((t) => t.setValue(this.plugin.settings.indexOnStartup).onChange(async (v) => {
				this.plugin.settings.indexOnStartup = v;
				await this.plugin.saveSettings();
			}))
			.addExtraButton((b) => b.setIcon('refresh-ccw').setTooltip('Rebuild index').onClick(() => this.plugin.rebuildIndex()));

		new Setting(containerEl)
			.setName('Auto-update on file change')
			.addToggle((t) => t.setValue(this.plugin.settings.autoUpdateOnFileChange).onChange(async (v) => {
				this.plugin.settings.autoUpdateOnFileChange = v;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Recency half-life (days)')
			.addText((t) => t.setPlaceholder('30').setValue(String(this.plugin.settings.recencyHalfLifeDays)).onChange(async (v) => {
				const n = Number(v);
				if (!Number.isNaN(n) && n >= 0) {
					this.plugin.settings.recencyHalfLifeDays = n;
					await this.plugin.saveSettings();
				}
			}));

		new Setting(containerEl)
			.setName('Max search results')
			.addText((t) => t.setPlaceholder('20').setValue(String(this.plugin.settings.maxSearchResults)).onChange(async (v) => {
				const n = Number(v);
				if (!Number.isNaN(n) && n > 0) {
					this.plugin.settings.maxSearchResults = n;
					await this.plugin.saveSettings();
				}
			}));

		containerEl.createEl('h3', { text: 'Ollama' });
		new Setting(containerEl)
			.setName('Base URL')
			.addText((t) => t.setPlaceholder('http://localhost:11434').setValue(this.plugin.settings.ollama.baseUrl).onChange(async (v) => {
				this.plugin.settings.ollama.baseUrl = v || 'http://localhost:11434';
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
			.setName('Model name')
			.addText((t) => t.setPlaceholder('nomic-embed-text').setValue(this.plugin.settings.ollama.model).onChange(async (v) => {
				this.plugin.settings.ollama.model = v || 'nomic-embed-text';
				await this.plugin.saveSettings();
			}));

		containerEl.createEl('h3', { text: 'Rumination' });
		new Setting(containerEl)
			.setName('Enable rumination')
			.addToggle((t) => t.setValue(this.plugin.settings.rumination.enabled).onChange(async (v) => {
				this.plugin.settings.rumination.enabled = v;
				await this.plugin.saveSettings();
				this.plugin.refreshRuminator();
			}));
		new Setting(containerEl)
			.setName('Interval (minutes)')
			.addText((t) => t.setPlaceholder('30').setValue(String(this.plugin.settings.rumination.intervalMinutes)).onChange(async (v) => {
				const n = Number(v);
				if (!Number.isNaN(n) && n > 0) {
					this.plugin.settings.rumination.intervalMinutes = n;
					await this.plugin.saveSettings();
					this.plugin.refreshRuminator();
				}
			}));
		new Setting(containerEl)
			.setName('Min cosine similarity')
			.addText((t) => t.setPlaceholder('0.25').setValue(String(this.plugin.settings.rumination.minSimilarity)).onChange(async (v) => {
				const n = Number(v);
				if (!Number.isNaN(n) && n >= 0) {
					this.plugin.settings.rumination.minSimilarity = n;
					await this.plugin.saveSettings();
				}
			}));
		new Setting(containerEl)
			.setName('Use link graph weighting')
			.addToggle((t) => t.setValue(this.plugin.settings.rumination.useLinkGraphWeighting).onChange(async (v) => {
				this.plugin.settings.rumination.useLinkGraphWeighting = v;
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
			.setName('Write digest note')
			.addToggle((t) => t.setValue(this.plugin.settings.rumination.writeDigest).onChange(async (v) => {
				this.plugin.settings.rumination.writeDigest = v;
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
			.setName('Digest note path')
			.addText((t) => t.setPlaceholder('INSIGHTS Digest.md').setValue(this.plugin.settings.rumination.digestNotePath).onChange(async (v) => {
				this.plugin.settings.rumination.digestNotePath = v || 'INSIGHTS Digest.md';
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
			.setName('Novelty weight (0–1)')
			.addText((t) => t.setPlaceholder('0.4').setValue(String(this.plugin.settings.rumination.noveltyWeight)).onChange(async (v) => {
				const n = Number(v);
				if (!Number.isNaN(n) && n >= 0 && n <= 1) {
					this.plugin.settings.rumination.noveltyWeight = n;
					await this.plugin.saveSettings();
				}
			}));
		new Setting(containerEl)
			.setName('Focus tags (comma-separated)')
			.addText((t) => t.setPlaceholder('research, project-x').setValue(this.plugin.settings.rumination.focusTags).onChange(async (v) => {
				this.plugin.settings.rumination.focusTags = v;
				await this.plugin.saveSettings();
			}));
		new Setting(containerEl)
			.setName('Allowed start hour (0–23)')
			.addText((t) => t.setPlaceholder('8').setValue(String(this.plugin.settings.rumination.allowedStartHour)).onChange(async (v) => {
				const n = Number(v);
				if (!Number.isNaN(n) && n >= 0 && n <= 23) {
					this.plugin.settings.rumination.allowedStartHour = n;
					await this.plugin.saveSettings();
				}
			}));
		new Setting(containerEl)
			.setName('Allowed end hour (0–23)')
			.addText((t) => t.setPlaceholder('22').setValue(String(this.plugin.settings.rumination.allowedEndHour)).onChange(async (v) => {
				const n = Number(v);
				if (!Number.isNaN(n) && n >= 0 && n <= 23) {
					this.plugin.settings.rumination.allowedEndHour = n;
					await this.plugin.saveSettings();
				}
			}));
		new Setting(containerEl)
			.setName('Max repeats per pair')
			.addText((t) => t.setPlaceholder('3').setValue(String(this.plugin.settings.rumination.maxRepeatsPerPair)).onChange(async (v) => {
				const n = Number(v);
				if (!Number.isNaN(n) && n >= 0) {
					this.plugin.settings.rumination.maxRepeatsPerPair = n;
					await this.plugin.saveSettings();
				}
			}));
		new Setting(containerEl)
			.setName('Bridge summary sentence')
			.addToggle((t) => t.setValue(this.plugin.settings.rumination.bridgeSummary).onChange(async (v) => {
				this.plugin.settings.rumination.bridgeSummary = v;
				await this.plugin.saveSettings();
			}));
	}
}