export type SampleDocument = {
  id: string
  name: string
  content: string
}

export const samples: SampleDocument[] = [
  {
    id: 'getting-started',
    name: 'Getting started.md',
    content: `# A little room to read

Welcome to Gamma Reader. Start with a document, follow a question, and bring in more material as you go.

This is your reading space. There is no folder to organize before you begin.

## Start with what interests you

The files on the left are ready to explore. Open **The art of noticing** for a short article, or **Reading notes** for a different way to organize your thoughts.

Each document opens in its own tab. Move between them without losing your place. Closing a tab leaves the document in Files, ready to open again.

> You do not need to know where a reading session will lead before you start it.

## Follow a question

Write a question in the reading assistant. Try asking for an example, comparing two ideas, or explaining a difficult passage.

The assistant can check which document you are reading, search your files, and read the passages it needs. Text reading currently supports Markdown, plain text, and PDFs with extractable text.

When you send a question, your messages and any file content the assistant reads are sent through the Gamma Reader server to the model provider. Importing or opening a file alone does not send its contents to the model.

## Make space for the page

Drag the divider beside a panel to make it wider or narrower. You can also focus a divider and use the arrow keys.

Hide the Files panel when you want to concentrate. Close the reading assistant when you just want to read. Your open tabs, conversation, and draft question stay here when you bring the panels back.

## Bring your own material

Choose **Add files** in the Files panel and select one or several documents. Gamma Reader copies them into storage owned by this browser, so you can close the original files and return later.

Importing files stores them locally in this browser. Removing a file from this list deletes the browser copy and leaves the original file on your computer unchanged.

| What you can try now | What comes later |
| --- | --- |
| Add local files as you need them | Save reading records |
| Read Markdown, text, PDF, HTML, and images | Use Word documents as AI context |
| Ask questions about your reading | Edit and connect reading notes |
| Resize and hide panels | Export a workspace for another browser |

## A note about saving

Your files, open tabs, tab order, conversations, and draft questions are remembered in this browser. The address points to the document you are reading. Your panel widths are also remembered, including when you hide a panel and bring it back.

Browser drafts and explicit saving to a local folder will arrive in a later iteration. Original documents will remain unchanged.

## Try a small experiment

1. Open **The art of noticing** from Files.
2. Ask the assistant to explain the main idea of the current document.
3. Follow up with a question about a passage that catches your attention.
4. Return to this tab. Your conversation is still in the assistant.

There is no required order. Begin wherever your curiosity takes you.
`,
  },
  {
    id: 'art-of-noticing',
    name: 'The art of noticing.md',
    content: `# The art of noticing

A familiar walk can feel entirely different when you decide to notice just one thing: the light on the windows, the sounds between passing cars, or the plants growing through cracks in the pavement.

The street has not changed. Your attention has.

## Attention is a choice

We often speak of attention as something we have or lose. It can be more useful to think of it as something we place. A question gives it somewhere to land.

Reading works in much the same way. Before opening a page, try asking a small question: *What is the writer trying to explain?* Or, *Which part of this connects to something I already know?*

A question does not have to be clever to be useful. It only has to give you a reason to stay with a sentence a little longer.

> Understanding often begins with noticing what you do not yet understand.

## Two ways to move through a text

Sometimes we read to find a specific answer. Sometimes we read to discover a question worth asking. These are different activities, and both are valuable.

| Reading to find | Reading to explore |
| --- | --- |
| Begin with a specific question | Begin with curiosity |
| Look for relevant passages | Notice surprising passages |
| Stop when you have an answer | Pause when a new question appears |

The useful skill is not choosing one forever. It is recognizing which kind of reading the moment calls for.

## Leave a small trace

A note is not a miniature version of everything you read. It is a trace of an encounter between the text and your thinking.

A useful note might contain:

- One sentence that surprised you.
- A connection to another document.
- A question you cannot answer yet.
- A small example in your own words.

These traces give a later reading somewhere to begin. They also make it easier to notice how your understanding has changed.

## Return before you conclude

The first explanation that makes sense is not always the explanation that helps most. Return to the passage after reading a little further. Does it mean the same thing now?

Try placing two passages side by side in your notes. They may agree, they may conflict, or one may supply the missing example for the other.

You do not need to resolve the difference immediately. Sometimes a useful reading session ends with a more precise question.

## One thing to try

Choose a paragraph above and write a single question about it. Then choose another paragraph that might help answer that question.

Keep the two excerpts together. The relationship between them may be more interesting than either passage alone.

---

*Written for Gamma Reader.*
`,
  },
  {
    id: 'reading-notes',
    name: 'Reading notes.md',
    content: `# Notes that help you think

A short note you return to is more useful than a long summary you never open again.

## A simple structure

For each idea, try keeping three things together:

1. **Source** — where the idea came from.
2. **Observation** — what you noticed.
3. **Question** — what you want to understand next.

## An example

**Source:** The art of noticing, “Attention is a choice”

**Observation:** A question changes what we notice in a document.

**Question:** Can a narrow question also make us miss something important?

> A good note keeps the conversation open.

## Plain text is enough

You do not need a complicated system. A small Markdown template can work well:

~~~markdown
## An idea worth returning to

Source:
Excerpt:

What I think:
What I am unsure about:
~~~

## Connect, rather than collect

- Put related excerpts together.
- Name a disagreement instead of hiding it.
- Use your own examples.
- Leave room to change your mind.

## Keep the source close

When you quote a sentence, keep its document name beside it. That small habit lets you check the surrounding context later.

You can name a document in your question to help the reading assistant find the passage you mean, even if its reading tab is closed.

You can discuss this document with the assistant. Editing notes and saving them will come later.
`,
  },
]
