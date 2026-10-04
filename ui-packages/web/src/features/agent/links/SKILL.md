# Links between notes

Use this guidance when a question is about how notes connect: what links to a page or block, what a note links to, which notes share a topic, or how to write a link.

## The graph

- Notes link with `[[Page]]`, `[[Page|label]]`, `[[Page#Heading]]` and `[[Page#^name]]`. `![[...]]` embeds the target and `#[[Page]]` tags with it. A bare `#word` is plain text, not a tag. Links inside code are not links.
- Nodes are pages, sections and blocks:
  - A page is a Markdown note (named by its frontmatter `name:`, else its file name without `.md` or `.lab.md`), any other file by its full name such as `paper.pdf`, or a virtual page that is only linked to and has no file.
  - A section is a heading and everything under it until the next heading at its level or above: `Page#Heading`.
  - A block is a paragraph, list item (with the items under it) or heading named by ` ^name` at the end of its line: `Page#^name`. A table, code block or quote is named by `^name` on a line of its own after it, separated by a blank line.
- Names are matched without regard to case and never by path, so a file can move without breaking links. A name two files share is ambiguous; pass fileId to choose one.
- Edges are links. Each starts at a line of a note, inside the innermost named block around it, and points at a node, sometimes at a PDF page (`[[paper.pdf#page=12]]`).

## Query it

- find_nodes locates nodes by name. get_node looks inside one. get_links follows its links: `in` for what points to it, `out` for what it points to.
- Every node in a result is written as a link names it. Pass it straight to the next call to walk the graph: for what notes about a topic also discuss, take get_links in on the topic, then get_links out on each from.node.
- Links into a page include links to its sections and blocks; ask for the block itself when only those matter.
- The index covers saved files. Unsaved drafts are not in it, and while indexing is still running a result says so with indexing.
- line is a line of Markdown source. read counts lines of extracted text, which differ. To show the passage, search for the link's context and read the range search returns.

## Write a link

- Link to a page by its name. Before linking to a block or section, check with get_node that it exists, and use the node it lists.
- To link to a passage that has no name yet, add ` ^name` at the end of its paragraph in the current source with edit_active_source. Use letters, digits and hyphens, unique in that note, and describe the content, such as `^retrieval-first`.
- Prefer `[[Page]]` over a path: links by name keep working when files move.
