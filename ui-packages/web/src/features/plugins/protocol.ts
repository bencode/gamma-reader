// What a plugin app's manifest lists; docs/plugins.md describes the protocol.
export type ManifestTool = {
  name: string
  description: string
  // A JSON Schema of an object, handed to the model as it is.
  parameters: Record<string, unknown>
}

export type ManifestPlugin = {
  name: string
  title: string
  icon: string
  tools: ManifestTool[]
}
