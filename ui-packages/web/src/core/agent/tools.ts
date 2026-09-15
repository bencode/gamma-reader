import {
  type AgentHarnessTool,
  type AgentHarnessToolInvocation,
  type AgentTool,
  createWriteTool,
  type ExecutionToolContext,
  FileError,
  TODO_CONTEXT,
  withAbortSignal,
} from '@earendil-works/pi-agent-core'
import { type Static, type TSchema, Type } from '@earendil-works/pi-ai'
import type { LocalTools } from '../local-tools'
import type { ImageAnalyzer } from './vision'
import { createWorkspaceWriteEnv } from './workspace-write-env'

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

const bindHarnessTool = <P extends TSchema, D>(
  tool: AgentHarnessTool<ExecutionToolContext, P, D>,
  toolContext: ExecutionToolContext,
): AgentTool<TSchema, D> => ({
  name: tool.name,
  label: tool.label,
  description: tool.description,
  parameters: tool.parameters,
  executionMode: 'sequential',
  execute: async (id, args, signal, onUpdate) => {
    const invocation: AgentHarnessToolInvocation = {
      invocationId: id,
      operationId: id,
      turnId: id,
      getMemo: async () => undefined,
      setMemo: async () => undefined,
    }
    const context = signal ? withAbortSignal(signal, TODO_CONTEXT) : TODO_CONTEXT
    try {
      return await tool.execute(
        id,
        args as Static<P>,
        onUpdate ?? (() => undefined),
        toolContext,
        invocation,
        context,
      )
    } catch (cause) {
      if (cause instanceof Error && cause.cause instanceof FileError)
        throw new Error(`${cause.message} ${cause.cause.message}`, { cause })
      throw cause
    }
  },
})

export const createReaderTools = (local: LocalTools, analyzeImage?: ImageAnalyzer) => {
  const piWrite = bindHarnessTool(createWriteTool(), {
    env: createWorkspaceWriteEnv(local.writeTextFile),
  })
  const write = {
    ...piWrite,
    description:
      'Create or completely overwrite one UTF-8 text file in the browser workspace. Use a root-level file name such as notes.md; folders are not available.',
  }
  const tools = [
    bind(
      'list',
      'List workspace files and chat attachments, including whether their text is readable. Follow next to continue.',
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
    bind(
      'read_active_source',
      'Read raw source of the active editable file, including unsaved changes. Ranges are one-based inclusive lines. Follow next unchanged to continue. Returns fileId and an opaque version string for edit_active_source; pass the version unchanged.',
      Type.Object({
        range: Type.Optional(
          Type.Object({
            unit: Type.Literal('line'),
            start: Type.Integer({ minimum: 1 }),
            end: Type.Integer({ minimum: 1 }),
          }),
        ),
        cursor,
      }),
      local.read_active_source,
    ),
    bind(
      'edit_active_source',
      'Replace one unique exact oldText in the active source draft. Pass fileId and expectedVersion from read_active_source. Does not save to IndexedDB. If the active file or version changed, read again. Empty oldText is allowed only for an empty source.',
      Type.Object({
        fileId,
        expectedVersion: Type.String({ minLength: 1 }),
        oldText: Type.String(),
        newText: Type.String(),
      }),
      local.edit_active_source,
    ),
    write,
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
