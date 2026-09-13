# Welcome to Gamma Reader

Open local documents in a browser workspace with no desktop application to install and no file upload step.

## Try it

1. Open **How Gamma Reader works.svg** to see the browser and server architecture.
2. Open **The art of noticing.pdf** and ask the assistant for its main idea.
3. Add your own documents with **+** in Files.

## What stays local

Your files are copied directly into IndexedDB. Previewing, PDF parsing, searching, tabs, drafts, attachments, and conversation history all work in this browser.

Adding or opening a file does not upload it to Gamma Reader's server. This makes large documents available after a fast local copy instead of a network transfer.

When you ask the assistant, your question and any passages or images needed for the answer pass through a thin LLM proxy to the configured model. The server has no file library or conversation database.
