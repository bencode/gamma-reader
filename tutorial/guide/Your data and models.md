# Your data and models

This chapter explains what stays in your browser, what a connected source holds, and what goes to a model.

![[How Gamma Reader works.svg]]

## Where your files live

Files, attachments and conversations are stored in this browser's IndexedDB, one database per project, in every mode. A connected folder or repository also holds document files. **Memory** notes live in the browser too, in one database for all projects. Tabs, reading positions and your model keys use local storage. Unsaved **Source** drafts and Lab state live only in the open page.

Browser storage belongs to this site and this browser profile. Clearing the site's data, or using a private window, loses it. To keep document copies, follow [[Files and projects#Keep copies and remove files]]. **View storage**, in the project menu, shows how much space a project takes.

With a writable source, source Save writes documents back without backing up conversations. Follow [[Files and projects#Keeping a project in step with a source]] for the steps.

## What leaves the browser

- **Source sync and Save.** Sync downloads documents. Source Save sends file changes and deletion requests back; a push-enabled clone commits and pushes them.
- **Questions to the assistant.** On the shared allowance, messages, read passages and viewed images go through Gamma Reader's model proxy to the provider. The proxy stores neither files nor conversations.
- **Your own model.** With a key of your own, the browser talks to the provider directly. Nothing about that conversation reaches Gamma Reader's server.
- **Memory.** When memory is on, notes the assistant recalls, and the ones it keeps in mind for every conversation, go to the model with your messages.
- **Web search.** When **Search the web** is on, the assistant's search queries go through Gamma Reader's server to the search service, whichever model you use.
- **Code.** Lab languages download their runtimes and packages, and code you run can reach the web like any web page.

Reading, editing and running code work without the assistant.

## The shared allowance

Server-provided models have a daily allowance per network, including on local servers. When it runs out, the assistant says so:

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
2. Follow [[Files and projects#Keep copies and remove files]] to keep document copies on your computer.
