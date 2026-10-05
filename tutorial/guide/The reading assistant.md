# The reading assistant

The panel on the right is an assistant that reads what you read. It can search and read the documents in this project, look at images and pages, run Lab cells, and write notes. It answers in the language you ask in, and says where its answer comes from: a file and a page or line.

## Ask

Type in **Ask about what you are reading** and press **Enter**; **Shift+Enter** starts a new line. The assistant sees which document is open and which part is on screen, so *this paragraph* and *the chart on this page* mean what you would expect.

With [[The art of noticing.pdf]] open, try:

> What is the central idea, and which passage best supports it?

## Compare sources

The assistant reads every file in the project, not only the open one. It reads a spreadsheet by sheet and cell, so you can ask about a number the way you would point at it. Open [[Field notes.docx]] and [[Observation log.xlsx]], then ask:

> Which species turned up on only one morning, and does the note's count of species match the log?

Neither file answers that on its own.

## Conversations

Each conversation keeps its own history, model and reasoning effort. After the first answer, the assistant names the conversation in a few words.

- **New conversation** (**+**) starts afresh; so does typing `/clear`. Type `/` for the list of commands.
- **Conversation history** lists earlier conversations. Each has **Rename** and **Delete** under its **…** button. A name you give is kept.
- Conversations belong to a project: the assistant in one project does not see another's files.

## While it answers

You can keep typing. A message sent during an answer waits in **Queued messages** and reaches the assistant at its next step; **×** removes it. **Escape** stops the answer and sends what is queued at once.

The line under the message box shows how full the model's context is and how many tokens the conversation has used. Hover over it for the details.

## Attach files

Choose the paperclip, drop files onto the panel, or paste. Up to 10 files per message, each up to 200 MiB. Attachments are kept in the project, under **Attachments** in Files, so the assistant can read them again later.

## Let it write

The assistant writes only when you ask. It can:

- **Write a note** in this project, such as a summary: *Summarize what the log shows about the quiet morning and save it as Reading notes.md.*
- **Edit the open document.** Its edits go into your draft, the same as typing in **Source**; nothing is kept until you choose **Save**.
- **Move or rename files** to tidy a project.
- **Name a passage** so it can be linked: *Name the paragraph about names in Links and embeds, so I can link to it.* See [[Links and embeds#Name a passage]].

What it writes stays in this browser. Use **Save as…** or **Save files to folder** to take a copy to your computer.

## Run a Lab

With a Lab open, the assistant can run its cells and read the results, as if you had chosen **Run**. Open [[Seven mornings]] and ask:

> Run the cells, then tell me which morning had the biggest drop and by how much.

When it writes code into a Lab, it runs it and fixes what fails before telling you it works.

## Search the web

The globe button under the message box is **Search the web**. Turn it on for a conversation, and the assistant can search and cite links; turn it off, and it cannot reach the web at all. The button appears only when the Gamma Reader you use offers web search.

## Save from a link

Give the assistant a link and ask it to save what is there:

> Save https://arxiv.org/abs/1706.03762 into papers.

A PDF, an image, an arXiv paper or a GitHub file is saved as it is. A web page is saved as Markdown, headed with where and when it came from; that needs **Search the web** on. It never replaces a file that already exists. To bring in a whole GitHub folder, use **Add from URL…** in Files.

## Models

**Chat model**, under the message box, chooses who answers. **Reasoning effort**, when the model offers it, trades speed for thought. Both are kept per conversation.

**Add your own model…**, at the end of **Chat model**, connects a provider with your own key. [[Your data and models#Your own model]] explains what changes when you do.

## Try it

1. Ask the question under **Compare sources**, then ask a follow-up while it answers.
2. Ask it to save a summary of this chapter as `Assistant notes.md`, and open the file it writes.
3. Open [[Explore a wave]] and ask it to add a TypeScript cell that prints the samples for a frequency of 3, and to run it.
