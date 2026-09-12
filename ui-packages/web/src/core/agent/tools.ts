import type { AgentTool } from '@earendil-works/pi-agent-core'
import { type Static, type TSchema, Type } from 'typebox'
import type { LocalTools } from '../local-tools'
import type { ImageAnalyzer } from './vision'

const cursor = Type.Optional(
  Type.String({ description: 'Opaque cursor from next. Copy it unchanged.' }),
)
const fileId = Type.String({ description: 'File ID returned by list, search or get_reader_state.' })
const range = Type.Object({
  unit: Type.Union([Type.Literal('line'), Type.Literal('page')]),
  start: Type.Integer({ minimum: 1 }),
  end: Type.Integer({ minimum: 1 }),
})

const bind = <P extends TSchema>(
  name: string,
  description: string,
  parameters: P,
  execute: (input: Static<P>, signal?: AbortSignal) => unknown | Promise<unknown>,
): AgentTool<P, undefined> => ({
  name,
  label: name,
  description,
  parameters,
  executionMode: 'sequential',
  execute: async (_id, input, signal) => {
    signal?.throwIfAborted()
    const result = await execute(input, signal)
    signal?.throwIfAborted()
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: undefined }
  },
})

export const createReaderTools = (local: LocalTools, analyzeImage?: ImageAnalyzer) => {
  const tools = [
    bind(
      'list',
      'List local files and whether their text is readable. Follow next to continue.',
      Type.Object({ name: Type.Optional(Type.String()), cursor }),
      local.list,
    ),
    bind(
      'search',
      'Find literal text, ignoring case and whitespace differences. Search one file or all files. Results include excerpts and one-based inclusive ranges for read. Follow next to continue; issues report unreadable files.',
      Type.Object({ query: Type.String({ minLength: 1 }), fileId: Type.Optional(fileId), cursor }),
      local.search,
    ),
    bind(
      'read',
      'Read file text using an optional one-based inclusive line or PDF page range. Markdown lines refer to extracted readable text, not Markdown source. Follow next unchanged for remaining content.',
      Type.Object({ fileId, range: Type.Optional(range), cursor }),
      local.read,
    ),
    bind(
      'get_reader_state',
      'Get open tabs, the active file and visible text anchors at the time of this call. A null viewport means visible text is unavailable. Search anchors to locate a readable range.',
      Type.Object({}),
      () => local.get_reader_state(),
    ),
  ]
  return analyzeImage
    ? [
        ...tools,
        bind(
          'analyze_image',
          'Analyze one local image with a vision model. Provide a focused question when possible; omit it for a general description and transcription.',
          Type.Object({
            fileId,
            question: Type.Optional(Type.String({ maxLength: 2000 })),
          }),
          analyzeImage,
        ),
      ]
    : tools
}
