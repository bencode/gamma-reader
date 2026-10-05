# Labs

A Lab is a Markdown file whose name ends in `.lab.md`. Its code blocks marked `run` become cells you can run in place, in Scheme, Clojure, Python or TypeScript. The text around them reads like any other note.

This chapter is an ordinary note, so its code blocks only show what to write. The two Labs in `examples` are where you run things: [[Explore a wave]] uses TypeScript and Python, and [[Seven mornings]] uses Scheme and Clojure.

## Write a cell

A cell is a fenced code block whose first line names a language, then `run`, then an optional `id`:

````markdown
```python run id=average
counts = [12, 17, 9, 5, 21, 14, 11]
sum(counts) / len(counts)
```
````

The id may use letters, digits, `_` and `-`; one is added when you leave it out. A cell cannot sit inside a list or a quote, and its fence must be closed. When something is wrong, the cell says what.

## Run a cell

Choose **Run** on a cell, or press ⌘Enter on a Mac and Ctrl+Enter elsewhere while editing it. **Stop** ends a long run. The cell shows its state, from *Starting* and *Running* to *Completed* or *Failed*, and its output below.

- **Cells share a language's session.** A Python cell can use a variable from an earlier Python cell, once that cell has run. Each language has its own session.
- **Edit and run again.** Editing a cell marks its output *Code changed · Run again*. Edits go into the same draft as **Source**; **Save** keeps them.
- **Stopping clears the session** for that language, so run the earlier cells again before the later ones.
- **Output is not saved** in the file, and long output keeps its first and last 32,000 characters.
- **Cells cannot read your files.** Code runs in a sandbox, so a cell carries the data it needs.

## Languages

| Language | First run | Notes |
| --- | --- | --- |
| Scheme | Instant | Built into the page |
| TypeScript | Instant | Can import `ramda`, `remeda`, `lodash`, `date-fns`, `zod` and `immer` by name |
| Python | Downloads Python, then the packages a cell imports | `numpy`, `matplotlib`, `sympy` and `pandas` work; a figure is shown as an image and a table as a table |
| Clojure | Downloads the Clojure runtime | Mention `emmy.` in a cell to load [Emmy](https://github.com/mentat-collective/emmy), a computer algebra system |

Downloads need an internet connection. Once a language has started, its next runs in the same visit are quick.

## Formulas as output

When a cell's last value is a formula, it is typeset instead of printed:

| Language | Return |
| --- | --- |
| Python | A value with `_repr_latex_`, such as a SymPy expression: `diff(x*sin(x), x)` |
| TypeScript | An object with `toLatex()` returning TeX |
| Scheme | `(latex "e^{i\\pi} + 1 = 0")` |
| Clojure | `(latex "e^{i\\pi} + 1 = 0")` |

Only the last value counts: anything printed stays text. With Emmy, Clojure can work out a formula and typeset it:

```clojure
(require '[emmy.env :as e])
(latex (e/->TeX ((e/D (fn [x] (e/* x (e/sin x)))) 'x)))
```

## With the assistant

The assistant can read a Lab, edit its cells in the draft, run them in your session, and read the results. Open a Lab and ask, for example: *Add a Python cell that plots the seven counts as a bar chart, run it, and fix it if it fails.* You see each run as it happens, and nothing is saved until you choose **Save**. More in [[The reading assistant#Run a Lab]].

## Try it

1. Open [[Seven mornings]] and run both cells. Change a count and run them again.
2. In [[Explore a wave]], add a cell at the end with **Source**:

   ```scheme
   (apply + '(12 17 9 5 21 14 11))
   ```

   Write `run` after `scheme` on its first line, and run it.
3. Add a Clojure cell with the two Emmy lines above. The first run downloads Emmy.
