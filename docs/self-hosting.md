# Self-hosting

The Node server holds the model credentials, caps what they spend, and serves the web app in production. This page covers its configuration, the allowance and what it records, and deploying a release.

## Configuration

The server reads the process environment, and also an untracked root `.env` for local development and `pnpm start`; existing process environment variables take precedence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GLM_API_KEY` | Unset | Server-side credential for Z.AI Coding CN |
| `DEEPSEEK_API_KEY` | Unset | Server-side credential for DeepSeek |
| `TAVILY_API_KEY` | Unset | Server-side credential for Tavily; when set, the chat offers a web search switch |
| `GAMMA_SEARCH_PROXY` | Unset | HTTP proxy for web search requests only, such as `http://172.17.0.1:1080` |
| `PORT` | `3302` | Node service port |
| `HOST` | `127.0.0.1` | Node service host |
| `GAMMA_BACKEND` | `http://127.0.0.1:3302` | Vite proxy target |
| `GAMMA_DAILY_TOKENS` | `200000` | Tokens one network may spend per day |
| `GAMMA_TOTAL_DAILY_TOKENS` | `20000000` | Tokens everyone together may spend per day |
| `GAMMA_DATA_DIR` | `data` | Directory holding the usage database |
| `GAMMA_TRUST_PROXY` | Unset | Set to `1` when a reverse proxy sets `X-Forwarded-For` |
| `GAMMA_TUTORIAL_DIR` | `tutorial/` at the repository root | The folder served as the Tutorial |
| `GAMMA_SOURCE_*` | Unset | A repository the library syncs from; see [Sync from a repository](sync-from-repository.md) |

## Chat models

Configure enabled providers, chat models, the default chat model, and the independent vision model in [`providers.json`](../web-packages/server/src/model-proxy/providers.json). Credentials stay in the environment; the JSON references their variable names. Model names, supported thinking levels, upstream API addresses, and request mappings come from pi's native provider definitions. There are no model environment overrides or application-defined effort lists.

The initial configuration enables GLM-5.3 / GLM-5.2 and DeepSeek V4 Flash / V4 Pro, with GLM-5.3 as the default and GLM-5.3-Flash for vision. Providers without a key are omitted from the selector. If the default provider is unavailable, the first available model in configuration order is used. If the vision provider is unavailable, text chat remains usable without vision tools.

Thinking levels are normalized with pi's `clampThinkingLevel`; new conversations start from pi Agent's `off` level, normalized for the selected model. For example, GLM-5.3 starts at `low`, while DeepSeek starts at `off`.

The browser requests `/api/agent/config` and sends pi-generated requests through `/api/agent/providers/:provider/chat/completions` (or the provider's `/vision/chat/completions` route). The server injects the corresponding credential.

## Daily allowance

The shared key carries a daily allowance. Each network gets `GAMMA_DAILY_TOKENS` tokens per day, counted from the usage the provider reports on its final response chunk, and resets at 00:00 UTC. Requests over the limit are refused with `429` and the reader sees the reason in the conversation. A network is identified by its address, so people behind one office or campus connection share a single allowance.

Because anyone can reach a fresh allowance from a fresh address, `GAMMA_TOTAL_DAILY_TOKENS` caps what everyone together may spend in a day. It is the figure that stays put when the addresses do not, and the two refusals are worded apart so a reader can tell their own allowance from the service's.

A reader's own model, added with **Add your own model…**, is called from the browser directly and is not counted. Keys are kept in `localStorage`, not the workspace database: Code Lab runs reader-supplied TypeScript in a same-origin worker that can reach `indexedDB`, and `localStorage` does not exist in worker scope.

## Operating the proxy

Fetching `/api/agent/config` sets a signed, HTTP-only cookie, and the chat routes refuse requests without it. Pointing an OpenAI-compatible client at the proxy address therefore does not work; anyone determined enough can still read the cookie first, which is why a limit backs it up rather than replaces it.

Two records are kept in a SQLite file under `GAMMA_DATA_DIR`, deliberately separated:

- **The day's counter** stores a salted hash of the network address against the tokens it has spent. This is what the limit reads, and it is the only record that relates to a person, so it holds **today only** — the previous day is dropped the first time a request arrives on a new one. The hash keeps the file from reading as a list of visitors, but an address is short enough to recover from a hash, so it is the short retention rather than the hash that does the protecting.
- **The request log** stores, for every charged request, its timestamp, its token count, and a grouping number that ties together the several requests one question makes. It carries no address, hashed or otherwise, and the grouping number is assigned in memory and never linked to anything, so it is kept indefinitely. Daily and monthly totals come from here.

The same file also keeps the cookie signing secret and the hashing salt, so a restart neither signs readers out nor resets anyone's allowance.

Set `GAMMA_TRUST_PROXY=1` only when a reverse proxy sets `X-Forwarded-For`, as `compose.production.yml` assumes: the last entry of that header is then treated as the caller. Without a proxy in front, leave it unset so the header cannot be forged.

To stop or restrain spending, change `GAMMA_TOTAL_DAILY_TOKENS` in `.env` and run the deploy command again; the container is recreated in seconds and the new ceiling applies at once. There is no runtime switch on purpose, since that would be one more thing to authenticate.

Two costs are bounded before a request is forwarded. A caller without the pass cookie is refused before their body is read, so an anonymous request cannot make the server buffer and parse twelve megabytes. An image is measured from its own header rather than from what the caller claims, and one covering more than four megapixels is refused with `413` — a picture the reader itself renders never comes close, since it already fits a page into four megapixels and an upload into 1.5.

## Production

Create an untracked `.env` containing either or both provider keys, then run:

```sh
docker compose -f compose.production.yml up -d --build --wait
```

The container serves the web app and Node proxy on port `3302` and exposes `/api/health`.

The project menu shows the version, such as `Gamma Reader 1.0.0 (46b53a0)`: the latest `v` tag and the commit, as `git describe` names them. A release is a tag on the commit it ships, raising the minor number when it brings new features and the patch number when it only fixes:

```sh
git tag v1.1.0 && git push origin v1.1.0
```

Pushing the tag also publishes the [`@lesscap/gamma-reader`](../web-packages/cli) package to npm at that version, which `npx @lesscap/gamma-reader` runs. The workflow needs an npm token in the repository secret `NPM_TOKEN`.

The image has no `.git`, so a deployment passes the version in, and the commit as the image tag. `git pull` does not bring a tag on a commit it already has, so fetch tags first:

```sh
git fetch --tags origin
export GAMMA_READER_TAG=$(git rev-parse --short HEAD)
export GAMMA_READER_VERSION=$(git describe --tags --long --always --match 'v[0-9]*')
docker compose -f compose.production.yml up -d --build --wait
```

A local build reads the version from the checkout.

The `quota` volume holds the usage database; removing it (`docker compose down -v`) resets every allowance, signs readers out, and discards the request log. JSON configuration ships with the server build; rebuild and restart after changing it. Deploy the frontend and server together. Saved conversations remain compatible across updates; refresh already-open pages after one.
