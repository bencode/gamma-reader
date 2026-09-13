# Gamma Reader

A browser-native, local-first AI reader powered by [pi](https://github.com/earendil-works/pi).

[Try Gamma Reader](https://reader.upivot.io) — no account, desktop app, or personal API key required.

<p align="center">
  <img src="ui-packages/web/src/assets/samples/how-gamma-reader-works.svg" alt="Documents are copied into browser storage for reading and local agent tools. Questions and the content used to answer them are sent through the Gamma Reader server to the configured model." width="960" />
</p>

## Highlights

- Run the pi agent loop and document tools directly in the browser.
- Keep files, tabs, attachments, and conversations in this browser's IndexedDB storage.
- Preview, parse, and search documents locally, including large files that never need an application-server upload.
- Ask the agent to inspect the current reading state, search and read documents, analyze images, and write notes.
- Use a small Node service that only proxies model requests and stores no file library or conversation history.

## Data boundary

Opening, previewing, parsing, searching, and storing a document stay in the browser. When you use the assistant, your question and the document text or images needed for the answer are sent through the Gamma Reader server to the configured model provider.

Removing a file deletes the browser copy and leaves the original file on your computer unchanged.

## Document support

| Format | Preview | Agent support |
| --- | --- | --- |
| Markdown | Math, Mermaid, and syntax highlighting | Search and read |
| UTF-8 text | Text preview for files up to 5 MiB | Search and read |
| PDF | Outline, page navigation, progress, zoom, and fit controls | Extracted text; no OCR |
| HTML | Sandboxed preview | Not yet readable by the agent |
| Images, including SVG | Image preview and zoom | Vision analysis |
| Word and other formats | Stored in Files without a preview | Not yet readable by the agent |

Each file may use up to 50 MiB. The browser library may use up to 500 MiB.

## Run locally

Use Node 24 and pnpm 10.14.0.

```sh
corepack enable
pnpm install
GLM_API_KEY=your-key pnpm dev
```

Open [http://localhost:5302](http://localhost:5302). The reader works without a model key, but chat is disabled.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GLM_API_KEY` | Required for chat | Server-side model credential |
| `GLM_MODEL` | `glm-5.3` | Main reading model |
| `GLM_VISION_MODEL` | `glm-5.3-flash` | Image analysis model |
| `PORT` | `3302` | Node service port |
| `HOST` | `127.0.0.1` | Node service host |
| `GAMMA_BACKEND` | `http://127.0.0.1:3302` | Vite proxy target |

## Production

Create an untracked `.env` containing `GLM_API_KEY`, then run:

```sh
docker compose -f compose.production.yml up -d --build --wait
```

The container serves the web app and Node proxy on port `3302` and exposes `/api/health`.

## Architecture

```text
Browser
  React + Vite
  pi agent runtime and local document tools
  IndexedDB: files, attachments, tabs, and conversations

Node server
  Hono static server and stateless LLM proxy
  No file library or conversation database
```

## Development

```sh
pnpm check
pnpm build
```

`check` runs Biome, TypeScript, and frontend and server tests without rewriting source. Tests do not call external model services.

## License

[MIT](LICENSE)
