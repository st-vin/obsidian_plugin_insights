export interface OllamaOptions {
	baseUrl: string;
	model: string;
}

export class OllamaClient {
	private baseUrl: string;
	private model: string;

	constructor(opts: OllamaOptions) {
		this.baseUrl = opts.baseUrl.replace(/\/?$/, '');
		this.model = opts.model;
	}

	async embed(texts: string[]): Promise<number[][]> {
		const embeddings: number[][] = [];
		for (const text of texts) {
			try {
				const res = await fetch(`${this.baseUrl}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: this.model, prompt: text }),
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = await res.json();
				if (Array.isArray(data?.data)) {
					// OpenAI-like shape: { data: [{ embedding }] }
					const vec = data.data[0]?.embedding as number[] | undefined;
					if (!vec) throw new Error('Missing embedding');
					embeddings.push(vec);
				} else if (Array.isArray(data?.embedding)) {
					// Ollama typical shape: { embedding: number[] }
					embeddings.push(data.embedding as number[]);
				} else if (Array.isArray(data?.embeddings)) {
					embeddings.push(data.embeddings[0] as number[]);
				} else {
					throw new Error('Unrecognized embeddings response');
				}
			} catch (e) {
				throw e;
			}
		}
		return embeddings;
	}
}