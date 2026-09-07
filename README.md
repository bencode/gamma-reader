# Gamma Reader

An open-source AI reading companion for local documents.

The current iteration provides a three-panel reading workspace and a Node service
with a health endpoint. Open the application to read three built-in Markdown
examples, switch between document tabs, and collect excerpts beside a question.

The materials and assistant panels can be resized or hidden. At narrower widths,
materials open in an overlay; below 800px, the assistant also opens in an overlay.
Tab reading positions, question drafts, and excerpts survive panel changes within
the current page. Reloading resets this preview: there is no persistence yet.

Local file and folder access, PDF/HTML/image readers, Word context, AI responses,
notes editing, and saving are not connected yet. Their relevant controls are
disabled rather than reporting simulated success. No document or question is sent
to a model in this iteration.

## Development

Use Node 24 and pnpm 10.14.0.

```sh
pnpm install
pnpm dev
```

Open http://localhost:5302. Vite proxies `/api` to the Node service on port 3302
and fails if its frontend port is occupied. No model credential is required.

To override the backend port:

```sh
PORT=3303 GAMMA_BACKEND=http://127.0.0.1:3303 pnpm dev
```

Node reads `PORT` (default `3302`) and `HOST` (default `127.0.0.1`) from the
environment. `GAMMA_BACKEND` sets the development proxy target. The server does not
load `.env` files automatically.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm check
```

`check` runs Biome, TypeScript, and frontend and server behavior tests without
rewriting source. Tests use DOM interactions and temporary local files; they do
not call external services.

## Production

```sh
pnpm build
pnpm start
```

Build output lives in `ui-packages/web/dist` and `web-packages/server/dist`.
The Node service serves the frontend and API at http://localhost:3302.
Startup fails if the frontend build is missing.

Static assets resolve relative to the server module, so this also works from
another working directory:

```sh
NODE_ENV=production node /path/to/gamma-reader/web-packages/server/dist/main.js
```

Local development uses HTTP. The eventual hosted reader requires HTTPS for
browser directory access; configure TLS at the hosting layer.

## API

`GET /api/health` returns:

```json
{ "status": "ok", "service": "gamma-reader" }
```

Unknown API routes return JSON 404 responses. Unknown pages and missing assets
return 404; there is no client-side routing or HTML fallback.

## Repository

- `ui-packages/web`: React, Vite, and Tailwind CSS.
- `web-packages/server`: Hono application, Node entrypoint, and HTTP tests.

All code, comments, documentation, and application copy are in English.
