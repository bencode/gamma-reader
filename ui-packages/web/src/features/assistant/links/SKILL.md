# Links between notes

## Names and queries

A note is named by frontmatter name:, else its filename without .md or .lab.md. Other files retain their full filename, such as paper.pdf. Names ignore case and folders. A virtual page has links but no file; a shared name is ambiguous, so pass fileId to choose a file.

find_nodes locates names, get_node gives a page's files/outline or a section/block's text, and get_links follows incoming or outgoing links. Pass returned node names directly to the next tool. Incoming links to a page include its sections and blocks. To explore what linking notes discuss, follow outgoing links from their from.node values.

The graph covers saved files; indexing means it is still incomplete. Its lines refer to Markdown source, whereas read uses extracted text lines. Search the returned context to locate a read range.

## Write links and embeds in notes

| Syntax | Meaning |
| --- | --- |
| `[[Page]]`, `[[Page\|label]]` | A page, optionally relabeled |
| `[[Page#Heading]]`, `[[Page#^name]]` | A section or named block |
| `[[paper.pdf#page=12]]` | A physical PDF page |
| `#[[Page]]` | A tag; bare `#word` is plain text |
| `![[Page]]` | Embed a note, section, block, image, p5 sketch or HTML page |
| `![[Orbit.p5.js\|480]]` | Embed at 480 pixels wide |
| `![[Demo.html\|Title\|520x300]]` | Embed with a title, width and height |

Embeds must occupy their own paragraph. Images and p5 canvases keep their aspect ratio; HTML lays out inside its box. These syntaxes render in notes, not chat, and links inside code remain text.

Before linking to a section or block, verify it with get_node. To name an existing passage, use name_block with its fileId, a quote from that one passage, and a descriptive name using letters, digits and hyphens. Existing names are preserved. This changes the saved note; unsaved drafts must be saved or discarded by the reader first. Insert the returned link using edit_active_source.
