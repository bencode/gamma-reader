# Plugins

A plugin app gives the reading assistant tools for another service. The reader user connects the service on the plugin app's own page. In the reader, each connected plugin then shows a switch below the chat input, beside web search. While the switch is on, that conversation's assistant has the plugin's tools. The tools run on the plugin app; the reader only forwards the calls.

## Configuration

Set `GAMMA_PLUGINS_URL` to the plugin app's address. The reader then lists **Plugins** in the project menu, linking to that address, and asks the app which plugins this browser has connected. Without the variable, no plugin appears anywhere.

Name only an app you trust. Its tool descriptions reach the model as they are, and its tool results enter the conversation.

## Protocol

The reader calls the app from the browser with `credentials: 'include'`, so the app recognises the user by its own cookie. Two requirements follow:

- **CORS:** the app answers with `Access-Control-Allow-Origin` set to the reader's origin, not `*`, and with `Access-Control-Allow-Credentials: true`.
- **Same site:** the app and the reader share a site, such as `reader.example.com` and `plugins.example.com`. Browsers withhold a cookie the app sets with `SameSite=Lax` from a reader on another site.

### Manifest

`GET <url>/manifest` returns the plugins this browser has connected; a plugin not connected is absent.

```ts
type PluginManifest = {
  plugins: {
    name: string // /^[a-z][a-z0-9-]*$/
    title: string // the switch's accessible name
    icon: string // absolute http(s) URL of an image
    tools: {
      name: string // `${name}_…`, so it cannot shadow the reader's own tools
      description: string
      parameters: object // JSON Schema of an object
    }[]
  }[]
}
```

The reader drops a plugin or tool that does not fit this shape.

### Tool calls

`POST <url>/<plugin>/tools/<tool>` with `Content-Type: application/json` and the tool's arguments as the body.

- **2xx:** a JSON body, handed to the model as the tool's result.
- **Any other status:** `{ "error": { "message": "…" } }`. The message is handed to the model as the tool's error, so write it for the user to read, such as how to reconnect.

The reader asks for the manifest again whenever its tab becomes visible. A plugin connected or disconnected in another tab therefore appears or disappears when the reader user comes back. A reply already running keeps the tools it started with.
