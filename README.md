# Gamma Reader

A browser-native, local-first workspace for reading, experimenting, and creating with AI, powered by [pi](https://github.com/earendil-works/pi).

[Try Gamma Reader](https://reader.upivot.io). Your documents stay in your browser, and there is no account to create.

[![Gamma Reader with an executable Markdown article, local files, and the reading assistant](.github/assets/reader.png)](https://reader.upivot.io)

## Features

The app opens on a Tutorial project that shows every feature in use; its chapters are also readable here, in [`tutorial/`](tutorial/Start%20here.md).

- **Read** PDF, Word, Excel, CSV, Markdown, HTML, images and source code in tabs, each with the controls its format allows. See [Reading documents](tutorial/guide/Reading%20documents.md).
- **Write** Markdown with formulas, diagrams and images, and save it in the browser. See [Writing in Markdown](tutorial/guide/Writing%20in%20Markdown.md).
- **Link notes** by name with `[[…]]`, see what links back, and embed one note, section or passage in another. See [Links and embeds](tutorial/guide/Links%20and%20embeds.md).
- **Run code** in Labs, Markdown with Scheme, Clojure, Python and TypeScript cells, and embed p5 sketches and HTML pages at any size. See [Labs](tutorial/guide/Labs.md) and [Interactive pages](tutorial/guide/Interactive%20pages.md).
- **Ask the assistant** about what you read: it searches and reads your files, compares sources, runs Lab cells, searches the web when allowed, and writes notes. Its agent loop runs in the browser. See [The reading assistant](tutorial/guide/The%20reading%20assistant.md).
- **Organise** files in projects, bring in folders and links, and keep a project in step with a source. See [Files and projects](tutorial/guide/Files%20and%20projects.md).
- **Keep your files local.** Documents are stored in the browser and never uploaded to an application server. See [Your data and models](tutorial/guide/Your%20data%20and%20models.md).

## Three ways to use it

| Way | Files live in | Changes go back |
| --- | --- | --- |
| [The online reader](https://reader.upivot.io) | This browser's IndexedDB | They stay in this browser |
| A server following a repository | A clone the server keeps pulling, copied into each browser | Not yet; the server only brings files in |
| A working tree on your machine | A git checkout on disk, copied into the browser | **Save** writes them to the folder; you review and commit with git |

The online reader needs nothing installed. A working tree needs Node 24 and git, and one command run in it:

```sh
npx @lesscap/gamma-reader                                # the current folder, at http://127.0.0.1:3302
npx @lesscap/gamma-reader ~/notes --exclude tmp,output   # or name one; --help lists the options
```

The project is named after the folder. Chat uses `GLM_API_KEY` or `DEEPSEEK_API_KEY` from the environment, or a model added in the reader. A server following a repository is a deployment of its own and must sit behind a sign-in; see [Sync from a repository](docs/sync-from-repository.md).

## Local-first by design

Files are copied into IndexedDB, and previewing, parsing, searching and the pi agent loop all run in the browser. AI inference runs at the model provider: on the shared allowance through a small Node proxy that holds the credentials and keeps no files or conversations, and with a reader's own key straight from the browser. When a reader turns on web search, the agent's queries go through this server to Tavily. See [Self-hosting](docs/self-hosting.md) for the allowance and what the proxy records.

![Browser storage, local tools, and the two routes to a model provider](tutorial/examples/How%20Gamma%20Reader%20works.svg)

## Run from a checkout

To work on the reader itself, use Node 24 and pnpm 10.14.0.

```sh
corepack enable
pnpm install
pnpm dev
```

Open [http://localhost:5302](http://localhost:5302). Reading, editing, and experiments work without keys; chat needs `GLM_API_KEY`, `DEEPSEEK_API_KEY`, or both in an untracked root `.env`, or a reader's own model. To read a working tree with the code as it is, name it when starting:

```sh
GAMMA_SOURCE_NAME=notes GAMMA_SOURCE_WORKTREE=$HOME/notes pnpm dev
```

[Self-hosting](docs/self-hosting.md) lists every variable and covers deploying with Docker and releasing a version.

## Development

```sh
pnpm check
pnpm build
```

`check` runs Biome, TypeScript, and package tests without rewriting source. Tests do not call external model services. [`AGENTS.md`](AGENTS.md) describes the packages and how the web source is layered.

The independent React Code Lab package lives in `ui-packages/code-lab`. Run its standalone examples with `pnpm --filter @gamma-reader/code-lab-playground dev`.

[`tutorial/`](tutorial/) ships with each deployment and is served at `/api/tutorial`, listed afresh on each request. Every reader has a Tutorial project kept in step with it: a first visit opens it, and after a deployment that changes the folder, the project offers **Update**. To write for it, edit the folder and run `pnpm dev`; the open Tutorial offers the change at once. Add a section to [`What's new.md`](tutorial/What's%20new.md) when a release adds a feature.

## License

[MIT](LICENSE)
