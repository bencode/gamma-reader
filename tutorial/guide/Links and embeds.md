# Links and embeds

Notes link to each other by name with double brackets, as in many note-taking apps. A link can point at a note, a section, a single passage or a page of a PDF, and an embed shows what it points at in place.

## Link syntax

| Write | Leads to |
| --- | --- |
| `[[Labs]]` | The note named Labs |
| `[[Labs#Run a cell]]` | The section *Run a cell* in Labs |
| `[[Links and embeds#^names]]` | The passage named `names` in this note |
| `[[Labs\|the Labs chapter]]` | Labs, shown as *the Labs chapter* |
| `[[The art of noticing.pdf#page=2]]` | Page 2 of that PDF |
| `#[[birds]]` | A tag: the page named birds |

Here they are, live: [[Labs]], [[Labs#Run a cell]], [[Links and embeds#^names]], [[Labs|the Labs chapter]], [[The art of noticing.pdf#page=2]], #[[birds]].

Links inside code, like the table above, stay text.

## How names are matched

A note's name is its file name without `.md` or `.lab.md`, so `examples/Explore a wave.lab.md` is [[Explore a wave]]. Other files keep their whole name, extension included, like [[Orbit.p5.js]]. Folders do not matter, and neither does case. Moving a note to another folder keeps every link to it working. ^names

A name can also come from a `name:` line in the note's frontmatter.

When several notes share a name, a link to it asks which one you mean. While the library is still being indexed, links say so and wait.

## Name a passage

Write `^` and a name at the end of a paragraph or heading to name it, as the paragraph above does with `^names`. Names use letters, digits and hyphens. A name at the end of a heading covers its whole section. At the end of a list item, it covers the item and the items under it.

A table, code block or quote takes its name from a line of its own, `^name`, just after it.

The name is hidden when the note is read. You can also ask the assistant to name a passage for you, as [[The reading assistant#Let it write]] explains.

## Links to notes that do not exist yet

[[A note you have not written]] has no note behind it. Choosing it opens a page tab, *Page: A note you have not written*, which lists every note that links to that name. Write the note later and the same links lead to it. A tag like #[[birds]] works the same way: its page lists everything tagged with it.

## Links back

At the end of a note, a list shows every note that links to it, with the line each link stands on. Scroll to the end of this chapter: [[Start here]] and other chapters appear there. Choose a line to go to it.

## Embeds

Put `!` before a link, alone in its own paragraph, and the reader shows what it points at, under a title that opens the original.

A passage, by its name:

![[Links and embeds#^names]]

A section of another note:

![[Reading documents#CSV]]

An image, 320 pixels wide:

![[How Gamma Reader works.svg|320]]

A whole note works the same way: `![[Labs]]`. A note embedded inside another embed shows **Expand** instead, so a long chain costs only what you open; past five levels an embed stays a link. A note that would embed itself says *Circular embed* instead of repeating.

Sketches and HTML pages can be embedded too, with a size: [[Interactive pages]] shows how.

## Try it

1. Choose [[A note you have not written]]. Then ask the assistant: *Write a short note named "A note you have not written.md" about what this chapter covers.* Choose the link again: it now opens the note.
2. Open **Source**, add `^my-line` to the end of any paragraph here, and **Save**. Then link to it from another note with `[[Links and embeds#^my-line]]`.
3. Embed a section of a chapter in a note of your own: `![[Files and projects#Find a file]]`.
