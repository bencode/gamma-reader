# Your data and models

Gamma Reader has no accounts and keeps no copy of your files. This chapter says what stays in your browser, what is sent elsewhere, and how to use a model of your own.

![[How Gamma Reader works.svg]]

## Where your files live

Your files, attachments and conversations are stored in this browser, one database for each project. Open tabs, reading positions and any model keys you add are kept in the browser's local storage. Unsaved **Source** drafts and the state of Lab cells live only in the open page.

Browser storage belongs to this site and this browser profile. Clearing the site's data, or using a private window, loses it. To keep a copy, use **Save as…** on a file or **Save files to folder** for a whole project. **View storage**, in the project menu, shows how much space a project takes.

## What leaves the browser

- **Questions to the assistant.** On the shared allowance, your messages, the passages the assistant reads and any images it looks at go to the model provider through Gamma Reader's server. The server passes them on; it keeps no files and no conversations.
- **Your own model.** With a key of your own, the browser talks to the provider directly. Nothing about that conversation reaches Gamma Reader's server.
- **Web search.** When **Search the web** is on, the assistant's search queries go through Gamma Reader's server to the search service, whichever model you use.
- **Code.** Lab languages download their runtimes and packages, and code you run can reach the web like any web page.

Reading, editing and running code work without the assistant.

## The shared allowance

The models offered by default share a daily allowance for each network. When it runs out, the assistant says so:

- *The daily chat limit for this network is used up. It resets at 00:00 UTC.*
- *Gamma Reader has used up the shared allowance for today. It resets at 00:00 UTC, and a model key of your own is not affected.*

People on one office or campus connection share one allowance.

## Your own model

Open **Chat model** under the message box and choose **Add your own model…**:

1. Pick a **Provider**, such as DeepSeek, OpenAI or OpenRouter, or *Another OpenAI-compatible service…* with its own **Address**.
2. Paste your **API key** and choose **Check key**.
3. Tick the **Models** you want, and pick a **Model for images** if the provider has one.
4. Choose **Save**.

Your models appear in **Chat model** marked *(your key)*. They are not counted against the shared allowance. The key is kept in this browser and is never sent to Gamma Reader.

## Try it

1. Open the **Tutorial** menu and choose **View storage**.
2. Choose **Save files to folder** to keep a copy of this project on your computer.
