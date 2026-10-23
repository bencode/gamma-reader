import { Agent, type AgentMessage, type AgentState } from '@earendil-works/pi-agent-core'
import { needsCompaction, projectContext } from '../../core/agent/compaction'
import { type AgentDefinition, assemble, type Skill, streamFn } from '../../core/agent/definition'
import { LocalToolError } from '../../core/agent/tool'
import {
  maximumTextPreviewBytes,
  type PreviewKind,
  type StoredFileMetadata,
} from '../../core/files'
import { type ModelRuntime, visionModelFor } from '../../core/models/model-runtime'
import { getStoredFile, listStoredFiles } from '../../data/file-store'
import { markdownText } from '../../formats/markdown-text'
import { memoryAgentParts } from '../memory'
import { compactConversation } from './compaction'
import { createConversationTools } from './conversation-tools'
import { createDocumentTools, type DocumentAccess } from './document-tools'
import { createDocxRuntime, type DocxRuntime } from './docx/runtime'
import { createImageTools } from './image-tools'
import type { LocalTools } from './local-tools'
import { createPdfRuntime, type PdfRuntime } from './pdf/runtime'
import { createPdfTools } from './pdf/tools'
import { systemPrompt } from './system-prompt'
import { openTextSource } from './text-source'
import { createReaderTools } from './tools'
import { createUrlTools, type WebState } from './url-tools'
import { createVisionAnalyzer, type VisionAnalyzer } from './vision'
import { createXlsxRuntime, type XlsxRuntime } from './xlsx/runtime'
import { createXlsxTools } from './xlsx/tools'

// Converted formats read through their own runtimes; any other file is read as text when its bytes
// decode as UTF-8, so only the size of the decoded text needs a bound up front.
const convertedKinds = new Set<PreviewKind>(['pdf', 'docx', 'xlsx'])

const getReadability = (file: StoredFileMetadata) =>
  convertedKinds.has(file.previewKind) || file.size <= maximumTextPreviewBytes
    ? { textReadable: true }
    : { textReadable: false, reason: 'Text reading is limited to files of 5 MiB or less.' }

export const createReaderDocumentAccess = (
  pdf: PdfRuntime,
  docx: DocxRuntime = createDocxRuntime(),
  xlsx: XlsxRuntime = createXlsxRuntime(getStoredFile),
): DocumentAccess => ({
  listFiles: listStoredFiles,
  getReadability,
  open: async (fileId, signal) => {
    signal?.throwIfAborted()
    const stored = await getStoredFile(fileId)
    if (!stored)
      throw new LocalToolError('File removed or not found. Run list to choose an available file.')
    const { reason } = getReadability(stored.metadata)
    if (reason) throw new LocalToolError(reason)
    if (stored.metadata.previewKind === 'pdf') return pdf.openDocument(stored, signal)
    if (stored.metadata.previewKind === 'docx') return docx.openDocument(stored, signal)
    if (stored.metadata.previewKind === 'xlsx') return xlsx.openDocument(stored, signal)
    return openTextSource(
      stored.metadata,
      stored.blob,
      stored.metadata.previewKind === 'markdown' ? markdownText : undefined,
      signal,
    )
  },
})

type ReaderContext = {
  local: LocalTools
  documents: ReturnType<typeof createDocumentTools>
  pdf: PdfRuntime
  xlsx: XlsxRuntime
  analyze?: VisionAnalyzer
  web: () => WebState
  memory: ReturnType<typeof memoryAgentParts>
}

const skills: Skill<ReaderContext>[] = [
  {
    name: 'pdf',
    description:
      'Read PDFs using physical pages, embedded outlines, text and visual analysis of scans, figures and tables.',
    load: async () => (await import('./pdf/SKILL.md?raw')).default,
    tools: ({ pdf, analyze }) => createPdfTools(pdf, analyze),
  },
  {
    name: 'spreadsheet',
    description:
      'Read XLSX workbooks by sheet and A1 range, including empty cells and cached formula values.',
    load: async () => (await import('./xlsx/SKILL.md?raw')).default,
    tools: ({ xlsx }) => createXlsxTools(xlsx),
  },
  {
    name: 'links',
    description:
      'Query note relationships; write wiki links, tags, block references and sized embeds.',
    load: async () => (await import('./links/SKILL.md?raw')).default,
  },
  {
    name: 'authoring',
    description:
      'Create or edit rich notes, runnable .lab.md experiments, native p5 sketches, HTML pages, SVG images and CSV tables in Gamma Reader.',
    load: async () => (await import('./authoring/SKILL.md?raw')).default,
  },
]

const readerAgent: AgentDefinition<ReaderContext> = {
  name: 'reader',
  instructions: systemPrompt,
  tools: ({ local, documents, web, analyze, memory }) => [
    ...createReaderTools(local, documents),
    ...createUrlTools(local.saveFile, web),
    ...createConversationTools(),
    ...(analyze ? createImageTools(getStoredFile, analyze) : []),
    ...(memory?.tools ?? []),
  ],
  skills,
}

// Pi keeps the system prompt and tool declarations at the head of the transcript. Each agent
// rebuilds them from the current prompt and tools, so only the conversation is shown and stored.
export const conversationMessages = (agent: Agent) =>
  agent.state.messages.filter(message => message.role !== 'system')

// A reply that reads page after page can pass the threshold between two of its own requests. The
// summary joins the transcript before the next one; a failure leaves the reply to go on without it.
const compactBetweenTurns = async (
  agent: Agent,
  signal?: AbortSignal,
  onCompactionChange?: (compacting: boolean) => void,
) => {
  const { model } = agent.state
  if (!needsCompaction(agent.state.messages, model.contextWindow)) return undefined
  onCompactionChange?.(true)
  try {
    const message = await compactConversation(model, conversationMessages(agent), signal)
    return message && !signal?.aborted ? { messages: [message] } : undefined
  } catch (cause) {
    if (!signal?.aborted) console.error('Unable to compact the conversation between turns', cause)
    return undefined
  } finally {
    onCompactionChange?.(false)
  }
}

export const createReaderAgent = (
  runtime: ModelRuntime,
  local: LocalTools,
  session: {
    id: string
    messages: readonly AgentMessage[]
    // Read at each call, so turning web search on or off needs no new agent.
    web?: () => WebState
    onCompactionChange?: (compacting: boolean) => void
  } & Pick<AgentState, 'model' | 'thinkingLevel'>,
) => {
  const pdf = createPdfRuntime(getStoredFile)
  const docx = createDocxRuntime()
  const xlsx = createXlsxRuntime(getStoredFile)
  const documents = createDocumentTools(createReaderDocumentAccess(pdf, docx, xlsx))
  const vision = visionModelFor(runtime, session.model)
  const analyze = vision ? createVisionAnalyzer(vision) : undefined
  const memory = memoryAgentParts({ conversationId: session.id })
  const assembled = assemble(readerAgent, {
    local,
    documents,
    pdf,
    xlsx,
    analyze,
    web: session.web ?? (() => 'unavailable'),
    memory,
  })
  const agent = new Agent({
    sessionId: session.id,
    toolExecution: 'sequential',
    steeringMode: 'all',
    initialState: {
      model: session.model,
      thinkingLevel: session.thinkingLevel,
      messages: [...session.messages],
      ...assembled,
    },
    // A compacted conversation is sent as its summary and the messages it kept.
    transformContext: async messages => {
      const projected = projectContext(messages)
      return memory ? memory.transformContext(projected) : projected
    },
    prepareNextTurnWithContext: (_turn, signal) =>
      compactBetweenTurns(agent, signal, session.onCompactionChange),
    streamFn,
  })
  agent.subscribe(async event => {
    if (event.type !== 'agent_end') return
    docx.dispose()
    xlsx.dispose()
    await pdf.dispose()
  })
  return agent
}
