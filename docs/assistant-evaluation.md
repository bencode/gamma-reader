# Assistant prompt evaluations

`pnpm check` validates tool and UI behavior without a model. `eval:assistant` asks a real model through the local backend and checks the resulting files, draft edits, tool calls and cell outputs. A mocked model reply cannot establish whether a prompt works.

## Run

Start a backend with the usual `.env` model credentials, a separate quota database and enough allowance for repeated trials:

```sh
PORT=3402 GAMMA_DATA_DIR=/tmp/gamma-reader-eval GAMMA_DAILY_TOKENS=20000000 pnpm --filter @gamma-reader/server dev
```

In another terminal:

```sh
GAMMA_EVAL_PROVIDER=deepseek GAMMA_EVAL_MODEL=deepseek-flash GAMMA_EVAL_OUT=/tmp/reader-deepseek.jsonl pnpm --filter @gamma-reader/web eval:assistant
GAMMA_EVAL_PROVIDER=zai-coding-cn GAMMA_EVAL_MODEL=glm-5.3 GAMMA_EVAL_OUT=/tmp/reader-glm.jsonl pnpm --filter @gamma-reader/web eval:assistant
```

Each scenario runs three times by default. `GAMMA_EVAL_RUNS=1` is a smoke run; `GAMMA_EVAL_BACKEND` changes the backend address. Without a model override, the backend's default model is used. An unavailable override fails instead of silently selecting another model. Use Vitest's `-t` option to rerun one scenario.

These commands send the app's prompts, tool definitions and synthetic fixtures to the configured provider and consume model tokens. They use no personal documents. JSONL output appends every trial's model, status, elapsed time, tokens, tool arguments and transcript; keep it outside the repository. `error` denotes an incomplete model request or an aborted run and invalidates that trial; `fail` denotes an observable behavior failure. Each trial has a three-minute timeout and a sixteen-turn limit.

## What is checked

[scenarios.ts](../ui-packages/web/src/features/assistant/eval/scenarios.ts) defines fixed requests and assertions for:

- Native p5 files, runnable Labs and their displayed results, unsaved draft edits, and typeset Lab output.
- Interactive HTML, valid SVG, CSV quoting, chat Mermaid syntax and sized sketch embeds.
- Physical PDF page selection for a scan, spreadsheet cell coordinates and empty cells, backlinks and continuation after an empty search batch.

Assertions inspect outcomes, not prompt wording or an exact tool-call sequence. A model can choose another valid approach. Do not require `read_skill` merely to prove it was called: whether the task succeeded is what matters.

The workspace fixture uses actual IndexedDB storage, source tools, link parsing/graph traversal, Lab parsing and TypeScript execution. It simulates opening tabs and normalizing cell ids. Lab assertions require successful results matching the final draft. PDF and vision responses are synthetic; spreadsheet range selection uses production tools over synthetic worksheet data. Document parsing and rendering are tested separately by `pnpm check`. This evaluation does not run p5/HTML in a browser or judge visual quality. Python, Scheme and Clojure execution are outside this dataset.

## Compare a change

Keep scenarios and assertions identical between the baseline and candidate. Run both models against each version, with the same repetition count and separate output files. Compare failures by scenario, not only the overall score; also inspect the saved transcripts for unsupported claims. Provider failures and quota exhaustion are not evidence about prompt quality.

For a new regression, first reproduce it with an outcome-based assertion, then change the smallest relevant instruction. If an assertion rejects a valid alternative, fix the assertion and rerun the baseline. Multiple passing trials provide regression evidence for this dataset, not a guarantee for every request or model.

Prompt responsibilities:

- `system-prompt.ts`: role, capability discovery, source grounding and workspace write/draft boundaries.
- Skills: task-specific product conventions that the model cannot infer from general knowledge.
- Tool descriptions and schemas: invocation and result contracts.

Keep a fact in one place unless it must be available before a skill is loaded. Avoid adding generic writing advice or instructions already guaranteed by the runtime.
