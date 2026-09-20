# Gamma Reader

A browser-native, local-first workspace for reading, experimenting, and creating with AI — powered by [pi](https://github.com/earendil-works/pi).

[Try Gamma Reader](https://reader.upivot.io) — no account, desktop app, or personal API key required.

[![Gamma Reader with an executable Markdown article, local files, and the reading assistant](.github/assets/reader.png)](https://reader.upivot.io)

## Read. Experiment. Create.

**Read** local documents in tabs. Ask the assistant to find a passage, explain an image, or compare sources. Keep separate conversations for different questions.

**Experiment** inside `.lab.md` articles with runnable Scheme, Clojure, Python, and TypeScript cells, or explore interactive `.p5.js` sketches. Edit the code and run it yourself; language runtimes load on demand.

**Create** notes, diagrams, and experiments with the agent, or edit text files in the Source panel. Save your work in the browser and export it to your computer.

A Lab is ordinary Markdown with executable fences:

````markdown
```python run id=hello
print("Hello from the browser")
```
````

New workspaces include **Start here.md**, a PDF, a wave Lab, an orbit sketch, and an architecture diagram. Follow the examples, then add your own files with **+**. Existing workspaces keep their files unchanged.

## Local-first by design

Files are copied directly into IndexedDB. Built-in document previewing, parsing, and searching happen in the browser, so adding a large document does not require a file upload to the application server. The pi agent loop and document tools also run in the browser.

AI inference runs at the model provider: questions, conversation context, and text or images supplied by tools pass through a small Node proxy. The server holds model credentials but has no file library or conversation database. Code runtimes may download dependencies and executed code can make network requests.

![Browser storage, local tools, and the model proxy data boundary](ui-packages/web/src/assets/samples/how-gamma-reader-works.svg)

Files, attachments, and conversations persist in **IndexedDB**; tabs and the last active file use **localStorage**. Unsaved Source drafts and code execution state stay in memory. **Save** (⌘/Ctrl+S) saves a Source draft to the browser; **Save as…** and folder export write saved copies to your computer. Lab outputs are not included in the exported Markdown.

Browser storage belongs to this site and browser profile. Export work you want to keep beyond it. Removing a file deletes only the browser copy, leaving your original unchanged.

## Document support

| Format | Experience | Agent support |
| --- | --- | --- |
| PDF | Outline, page navigation, progress, zoom, and pan | Search and read extracted text; no OCR |
| Markdown | Math, Mermaid, outline, local images, and editable Source | Search, read, and edit source drafts |
| `.lab.md` | Markdown with editable code cells and Run controls | Read and edit source; execution stays user-controlled |
| `.p5.js` | Interactive sketches, Source, and Run changes | Read and edit source |
| HTML | Sandboxed preview and editable Source | Active source tools; no text search |
| Images / SVG | Image preview and zoom; SVG also has editable Source | Vision analysis; SVG active source tools |
| UTF-8 text | Text preview and editable Source | Search, read, and edit source |
| Other formats, including Word | Stored in Files | No preview or text reading yet |

Limits: 200 MiB per file, 1 GiB per browser library (including attachments), and 5 MiB for text preview and reading. Available storage also depends on the browser's quota and device space. Python and Clojure require runtime downloads on first use. Folder export requires desktop Chrome or Edge; individual files can also be downloaded.

## Run locally

Use Node 24 and pnpm 10.14.0.

```sh
corepack enable
pnpm install
pnpm dev
```

Create an untracked root `.env` with `GLM_API_KEY`, `DEEPSEEK_API_KEY`, or both. The Node server loads this file for local development and `pnpm start`; existing process environment variables take precedence. Open [http://localhost:5302](http://localhost:5302). Reading, editing, and experiments work without keys; chat requires at least one configured provider.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GLM_API_KEY` | Unset | Server-side credential for Z.AI Coding CN |
| `DEEPSEEK_API_KEY` | Unset | Server-side credential for DeepSeek |
| `PORT` | `3302` | Node service port |
| `HOST` | `127.0.0.1` | Node service host |
| `GAMMA_BACKEND` | `http://127.0.0.1:3302` | Vite proxy target |
| `GAMMA_DAILY_TOKENS` | `1000000` | Tokens one network may spend per day |
| `GAMMA_DATA_DIR` | `data` | Directory holding the usage database |
| `GAMMA_TRUST_PROXY` | Unset | Set to `1` when a reverse proxy sets `X-Forwarded-For` |

Configure enabled providers, chat models, the default chat model, and the independent vision model in [`providers.json`](web-packages/server/src/model-proxy/providers.json). Credentials stay in the environment; the JSON references their variable names. Model names, supported thinking levels, upstream API addresses, and request mappings come from pi's native provider definitions. There are no model environment overrides or application-defined effort lists.

The initial configuration enables GLM-5.3 / GLM-5.2 and DeepSeek V4 Flash / V4 Pro, with GLM-5.3 as the default and GLM-5.3-Flash for vision. Providers without a key are omitted from the selector. If the default provider is unavailable, the first available model in configuration order is used. If the vision provider is unavailable, text chat remains usable without vision tools.

Model choices and thinking levels persist with each conversation. Thinking levels are normalized with pi's `clampThinkingLevel`; new conversations start from pi Agent's `off` level, normalized for the selected model. For example, GLM-5.3 starts at `low`, while DeepSeek starts at `off`.

## Chat limits

The server holds the model credentials, so it also caps what they can spend. Fetching `/api/agent/config` sets a signed, HTTP-only cookie, and the chat routes refuse requests without it. Pointing an OpenAI-compatible client at the proxy address therefore does not work; anyone determined enough can still read the cookie first, which is why a limit backs it up rather than replaces it.

Each network gets `GAMMA_DAILY_TOKENS` tokens per day, counted from the usage the provider reports on its final response chunk, and resets at 00:00 UTC. Requests over the limit are refused with `429` and the reader sees the reason in the conversation. A network is identified by its address, so people behind one office or campus connection share a single allowance. Counts live in a SQLite file under `GAMMA_DATA_DIR`, which also keeps the cookie signing secret so a restart does not sign readers out; days older than a week are dropped at startup.

Set `GAMMA_TRUST_PROXY=1` only when a reverse proxy sets `X-Forwarded-For`, as `compose.production.yml` assumes: the last entry of that header is then treated as the caller. Without a proxy in front, leave it unset so the header cannot be forged.

`packages/shared` exports only the public configuration types. UI and Server import these types independently; neither package imports the other. The browser requests `/api/agent/config` and sends pi-generated requests through `/api/agent/providers/:provider/chat/completions` (or the provider's `/vision/chat/completions` route). The server injects the corresponding credential.

## Production

Create an untracked `.env` containing either or both provider keys, then run:

```sh
docker compose -f compose.production.yml up -d --build --wait
```

The container serves the web app and Node proxy on port `3302` and exposes `/api/health`.

The `quota` volume holds the usage database; removing it resets every allowance and signs readers out. JSON configuration ships with the server build; rebuild and restart after changing it. Deploy the frontend and server together, and refresh already-open pages after this update because the chat proxy routes have changed. Saved conversations remain compatible.

## Development

```sh
pnpm check
pnpm build
```

`check` runs Biome, TypeScript, and package tests without rewriting source. Tests do not call external model services.

The independent React Code Lab package lives in `ui-packages/code-lab`. Run its standalone examples with `pnpm --filter @gamma-reader/code-lab-playground dev`.

## License

[MIT](LICENSE)
