# Writing in Gamma Reader

Choose the format that serves the reader's request. These are built-in capabilities; no external editor is needed.

| Format | What the reader sees |
| --- | --- |
| Chat | Markdown, tables, math and fenced `mermaid` diagrams |
| `.md` | The same, plus library images, wiki links and embeds |
| `.lab.md` | A note with executable Scheme, Clojure, Python and TypeScript cells |
| `.p5.js` | A p5 sketch; Gamma Reader supplies p5 and the HTML host. Write JavaScript only, usually `setup()` and `draw()`. A plain `.js` file is source code, not a sketch. |
| `.html` | A sandboxed page with HTML, CSS and JavaScript |
| `.svg` / `.csv` | An editable image / data table |

Markdown accepts `$…$` and `$$…$$` math. Raw HTML is skipped. Library images use paths relative to the note, or `/` from the library root; external images are not loaded. Use the links skill for wiki links and sized embeds. Chat has no library images, wiki links, embeds or executable cells.

## Labs

A cell is a closed, top-level fence such as `typescript run`; plain language fences only display code. New cells need no id: the reader adds one. Preserve existing ids when editing.

Cells run in Workers, without the page DOM or access to workspace files; include the data they need. Scheme, Clojure and Python share definitions within each language's session. TypeScript runs each cell in its own async function: use `await $import('ramda')`, not static imports. Built-in aliases are `ramda`, `remeda`, `lodash`, `date-fns`, `zod` and `immer`. Python loads supported Pyodide packages from imports. Clojure uses Scittle; mentioning `emmy.` loads Emmy.

The last value is displayed. For TypeScript outputs, use an explicit `return`: a bare expression ending in `;` produces no value. Return an object such as `return { toLatex: () => 'E=mc^2' }` for a formula, or one with `toHtml()` for HTML. Python supports DataFrame tables, Matplotlib figures and `_repr_latex_`; Scheme and Clojure provide `(latex "TeX")`. HTML output is sanitized, without executable scripts. Results are temporary, not saved in the note.

After writing or editing runnable cells, open the lab if needed and use `run_active_lab_cells`; fix failures before claiming success. When output is requested, verify the returned output, not just succeeded status; no output means the displayed result is unverified. Use `read_active_lab_cells` for existing results. Image outputs are not visible to you through these tools.

## Pages and sketches

HTML and p5 run in sandboxed frames, without access to Gamma Reader's files or state. HTML can use library images in `<img src="…">`; local script, stylesheet and data files are not resolved from the library.

Draft changes to p5/HTML require the reader's **Run changes** button to update the preview. You have no tool to run these previews or inspect their runtime errors. Opening a file is not execution verification. Markdown, SVG and CSV previews follow draft edits directly.
