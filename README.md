# INSIGHTS – SUBCONSCIOUS AI

Local-first Obsidian plugin that emulates human-like subconscious rumination over your notes. It crawls your vault, builds TF–IDF indices (and optional local dense embeddings via Ollama), surfaces semantic search results, and periodically suggests connections between notes based on similarity and the Obsidian link graph.

## Philosophy

- Privacy-first: No network calls by default; optional dense embeddings use local Ollama only.
- Local-first: All indexing, search, and rumination happen on your machine.
- Gentle assistance: Surfacing connections with transparent signals (similarity, link affinity, novelty) and simple, understandable scoring.

## Features

- Crawl and index Markdown files: inverted index, TF–IDF vectors, sentiment heuristic, tags.
- Embeddings: default TF–IDF; optional Ollama dense vectors (e.g., `nomic-embed-text`).
- Ranking: cosine similarity + recency decay + sentiment boost.
- Semantic search view: query box, excerpts, meta scores, click to open note.
- Rumination: scheduled suggestion engine with link graph weighting, novelty bias, tag focus, allowed hours, digest note, and short bridge sentence.

## Install / Build

1. `npm i`
2. `npm run build`
3. Copy `manifest.json`, `main.js`, and `styles.css` to your vault folder: `.obsidian/plugins/insights-subconscious-ai/`
4. Enable the plugin in Obsidian and configure settings.

## Settings

- General
  - Embedding provider: `tfidf-local` (default) or `ollama`.
  - Index on startup, Auto-update on file change.
  - Recency half-life (days), Max search results.
- Ollama
  - Base URL (default `http://localhost:11434`)
  - Model (default `nomic-embed-text`)
- Rumination
  - Enable, Interval minutes, Min cosine similarity.
  - Use link graph weighting, Write digest, Digest note path.
  - Novelty weight (0–1), Focus tags.
  - Allowed start/end hour (supports wrapping midnight), Max repeats per pair.
  - Bridge summary (short local sentence like “A and B connect via X, Y”).

## Using the Insights View

- Open via command “Open Insights view” or the ribbon icon.
- Type a query and press Search.
- Result shows title, excerpt, and meta scores. Click to open.
- Ruminations section: press “Refresh ruminations” to generate suggestions now.

## Ollama (optional)

- Install Ollama and pull an embedding model, e.g.:
  - `ollama pull nomic-embed-text`
- In settings, select provider “Ollama”, confirm base URL and model.
- The plugin computes dense vectors for (title + head of file) and for queries. If any error occurs, it falls back to TF–IDF automatically.

## Architecture

- `tokenize.ts`: Markdown stripping, stop words, light lemmatization.
- `indexer.ts`: Crawl vault, compute TF–IDF, inverted index, optional dense vectors; search combining similarity with recency/sentiment boosts.
- `embeddings.ts`: Ollama client to fetch embeddings from local server.
- `ruminator.ts`: Background suggestions using cosine similarity, link graph Jaccard affinity, novelty bias, tag focus, time window, and optional digest note.
- `view.ts`: Insights view UI with search and ruminations.
- `settings.ts`: Settings tab controlling all options.
- `main.ts`: Plugin wiring, commands, file-change hooks, scheduler lifecycle.

## Troubleshooting

- Build issues: ensure Node 18+, `npm i`, then `npm run build`.
- Obsidian load: confirm files are at `.obsidian/plugins/insights-subconscious-ai/` and plugin is enabled.
- No results: ensure vault has Markdown files; try “Rebuild index”.
- Ollama errors: verify server is running at Base URL and model is available; plugin will fall back to TF–IDF.
- Digest permission: confirm the digest path is writable in the vault.

## License

MIT
