# Gamma Reader

A browser-native, local-first AI reading workspace for documents.

[Try Gamma Reader](https://reader.upivot.io) - no account or personal API key required.

<p align="center">
  <img src="ui-packages/web/src/assets/samples/how-gamma-reader-works.svg" alt="Documents are copied into browser storage for reading and local agent tools. Questions and the content used to answer them are sent through the Gamma Reader server to the configured model." width="960" />
</p>

## Highlights

- Open the hosted web app directly, with no desktop application to install.
- Copy documents into this browser's IndexedDB storage without uploading them to the application server.
- Preview, parse, and search large documents locally, avoiding an initial network transfer.
- Use a thin Node server that only proxies reading-assistant requests to the configured model provider; it has no file library or conversation database.
- Read Markdown with math, Mermaid diagrams, and syntax highlighting.
- Navigate PDFs with outlines, direct page entry, a progress slider, zoom, and fit controls.
- Preview sandboxed HTML and common image formats, including SVG.
- Ask an agent that can inspect the current reading state, list files, search, read, analyze images, and write new text files.
- Keep multiple conversations with their own message history and attachments.

## Local-first, precisely

Gamma Reader copies imported files directly into IndexedDB storage owned by the current browser. Previewing, PDF parsing, text extraction, and search run in the browser. Large documents do not wait for an application-server upload before they can be opened.

Removing a file deletes that browser copy and leaves the original file on your computer unchanged.

| Action | Leaves the browser |
| --- | --- |
| Add or open a document | No |
| Preview, parse, or search a document | No |
| Store files, tabs, drafts, and conversations | No |
| Ask the assistant | The conversation and any file content read or analyzed for the answer are sent through the Gamma Reader server to the configured model provider. |

The Node service is an LLM proxy for credentials and streaming model requests. It does not store a server-side file library or conversation database. The hosted reader is configured by its operator, so people using it do not need to create an account or provide a model key.

## Document support

| Format | Preview | Agent support |
| --- | --- | --- |
| Markdown | Rendered with math, Mermaid, and syntax highlighting | Search and read |
| UTF-8 text | Text preview for files up to 5 MiB | Search and read |
| PDF | Outline, page navigation, progress, zoom, and fit controls | Extracted text; OCR is not available |
| HTML | Sandboxed preview | Text reading is not available yet |
| Images, including SVG | Image preview and zoom | Vision analysis |
| Word and other formats | Stored in Files without a preview | Reading is not available yet |

Each file may use up to 50 MiB. The browser library may use up to 500 MiB.

## Run locally

Use Node 24 and pnpm 10.14.0.

```sh
corepack enable
pnpm install
GLM_API_KEY=your-key pnpm dev
```

Open [http://localhost:5302](http://localhost:5302). Vite proxies `/api` to the Node service on port `3302`.

The server reads configuration from the process environment and does not load `.env` files automatically:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GLM_API_KEY` | Required for chat | Server-side model credential |
| `GLM_MODEL` | `glm-5.3` | Main reading model |
| `GLM_VISION_MODEL` | `glm-5.3-flash` | Image analysis model |
| `PORT` | `3302` | Node service port |
| `HOST` | `127.0.0.1` | Node service host |
| `GAMMA_BACKEND` | `http://127.0.0.1:3302` | Vite development proxy target |

The document reader still works when `GLM_API_KEY` is absent; chat reports that it is unavailable.

## Production

Docker Compose builds the frontend and server into one image. Create an untracked `.env` containing `GLM_API_KEY`, then run:

```sh
docker compose -f compose.production.yml up -d --build --wait
```

The service listens on container port `3302` and includes a health check at `GET /api/health`. Put TLS and the public hostname at the reverse proxy.

For a production build without Docker:

```sh
pnpm build
pnpm start
```

## Architecture

```text
Browser
  React + Vite + Tailwind CSS
  IndexedDB
    files          document metadata
    contents       document Blob data
    conversations  conversation state
    messages       message history
  Local preview, PDF parsing, search, and reader tools
  pi agent runtime

Node server
  Hono application and static frontend hosting
  Stateless GLM-compatible model proxy
  No document or conversation storage
```

Document routes use `/files/:documentId`. The route identifies a file stored in the current browser and is not a shareable file URL.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm check
pnpm build
```

`check` runs Biome, TypeScript, and frontend and server behavior tests without rewriting source. Tests do not call external model services.
