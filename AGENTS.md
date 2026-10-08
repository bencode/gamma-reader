# Gamma Reader

Run `pnpm check` (Biome, TypeScript, unit and integration tests) before proposing a change. The README covers running, deploying and the server contracts.

## Packages

| Package | Role |
| --- | --- |
| `ui-packages/web` | The browser app |
| `web-packages/server` | Hono server: model proxy, quota, web search, source sync |
| `ui-packages/code-lab` | Independent React code cells, with a playground in `ui-packages/code-lab-playground` |
| `packages/links` | Wiki-link parsing and the link graph |
| `packages/shared` | Types shared by web and server; types only, no runtime code |

Web and server never import each other's code. A contract both sides use belongs in `packages/shared`.

## Layers in `ui-packages/web/src`

| Directory | Holds | May import |
| --- | --- | --- |
| `utils/` | Pure helpers that know nothing of this app | nothing in the project |
| `formats/` | File format parsing and conversion: CSV, docx, xlsx, Markdown | `utils` |
| `core/` | Stable system mechanisms and shared contracts: file, project and conversation models, reading state, import rules, the agent framework (`core/agent`), the model runtime (`core/models`) | `utils`, `formats` |
| `data/` | IndexedDB persistence and network downloads | `utils`, `formats`, `core` |
| `components/` | Generic UI | `utils`, `formats`, `core` |
| `features/<name>/` | One feature each, such as the reading assistant (`features/assistant`), memory, reader, resources | everything above |
| `shell/` | Composes the app | everything |

```text
utils ← formats ← core ← data ← features ← shell
                    ↖ components ↙
```

- Imports point down the table only. Features may use one another, but never in a cycle.
- Put a module in `core/` only when it is a mechanism or contract the app as a whole stands on. Code that serves one feature lives in that feature's folder; a helper with no app knowledge goes in `utils/`.
- Known exceptions still to be resolved: some features import the workspace context from `shell/`, and `features/resources` and `features/projects` import each other.
