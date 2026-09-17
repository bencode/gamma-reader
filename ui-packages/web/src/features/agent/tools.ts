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
import type { createDocumentTools } from './document-tools'
import type { LocalTools } from './local-tools'
import { bind } from './tool'
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

export const createReaderTools = (
  local: LocalTools,
  documents: ReturnType<typeof createDocumentTools>,
) => {
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
      documents.list,
    ),
    bind(
      'search',
      'Find literal text, ignoring case and whitespace differences. Search one file or all files. Results include excerpts and one-based inclusive ranges for read. Follow next even when matches is empty: searching is incomplete until next is null. Issues report unreadable files.',
      Type.Object({ query: Type.String({ minLength: 1 }), fileId: Type.Optional(fileId), cursor }),
      documents.search,
    ),
    bind(
      'read',
      'Read file text using an optional one-based inclusive line or PDF page range. Markdown lines refer to extracted readable text, not Markdown source. Follow next unchanged for remaining content.',
      Type.Object({ fileId, range: Type.Optional(range), cursor }),
      documents.read,
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
  return tools
}
