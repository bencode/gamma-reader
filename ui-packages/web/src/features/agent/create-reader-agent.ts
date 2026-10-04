import { Agent, type AgentMessage, type AgentState } from '@earendil-works/pi-agent-core'
import { markdownText } from '../../core/document-text'
import {
  maximumTextPreviewBytes,
  type PreviewKind,
  type StoredFileMetadata,
} from '../../core/files'
import { getStoredFile, listStoredFiles } from '../../data/file-store'
import { createDocumentTools, type DocumentAccess } from './document-tools'
import { createDocxRuntime, type DocxRuntime } from './docx/runtime'
import { createImageTools } from './image-tools'
import type { LocalTools } from './local-tools'
import {
  apiKeyFor,
  type ModelRuntime,
  models,
  proxyRequestOptions,
  visionModelFor,
} from './model-runtime'
import { createPdfRuntime, type PdfRuntime } from './pdf/runtime'
import { createPdfTools } from './pdf/tools'
import { createSkillTools, type SkillDefinition, skillCatalog } from './skills'
import { systemPrompt } from './system-prompt'
import { openTextSource } from './text-source'
import { LocalToolError } from './tool-types'
import { createReaderTools } from './tools'
import { createVisionAnalyzer } from './vision'
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

const skills: SkillDefinition[] = [
  {
    name: 'pdf',
    description:
      'Read and understand PDFs using outlines, text search, page reading and visual analysis. Includes guidance for large documents and scanned pages.',
    load: async () => (await import('./pdf/SKILL.md?raw')).default,
  },
  {
    name: 'spreadsheet',
    description:
      'Read and understand spreadsheets by sheet and A1 range, with guidance on locating values, merged and empty cells, and formulas.',
    load: async () => (await import('./xlsx/SKILL.md?raw')).default,
  },
  {
    name: 'links',
    description:
      'Follow and write links between notes: pages, sections and named blocks, what links to them and what they link to, and the link syntax to use.',
    load: async () => (await import('./links/SKILL.md?raw')).default,
  },
]

// Pi keeps the system prompt and tool declarations at the head of the transcript. Each agent
// rebuilds them from the current prompt and tools, so only the conversation is shown and stored.
export const conversationMessages = (agent: Agent) =>
  agent.state.messages.filter(message => message.role !== 'system')

export const createReaderAgent = (
  runtime: ModelRuntime,
  local: LocalTools,
  session: { id: string; messages: readonly AgentMessage[] } & Pick<
    AgentState,
    'model' | 'thinkingLevel'
  >,
) => {
  const pdf = createPdfRuntime(getStoredFile)
  const docx = createDocxRuntime()
  const xlsx = createXlsxRuntime(getStoredFile)
  const documents = createDocumentTools(createReaderDocumentAccess(pdf, docx, xlsx))
  const vision = visionModelFor(runtime, session.model)
  const analyze = vision ? createVisionAnalyzer(vision) : undefined
  const agent = new Agent({
    sessionId: session.id,
    toolExecution: 'sequential',
    steeringMode: 'all',
    initialState: {
      model: session.model,
      thinkingLevel: session.thinkingLevel,
      messages: [...session.messages],
      systemPrompt: `${systemPrompt}\n\n${skillCatalog(skills)}`,
      tools: [
        ...createReaderTools(local, documents),
        ...(analyze ? createImageTools(getStoredFile, analyze) : []),
        ...createPdfTools(pdf, analyze),
        ...createXlsxTools(xlsx),
        ...createSkillTools(skills),
      ],
    },
    streamFn: (model, context, options) => {
      // A run stopped during a tool still asks for one more reply; pi-ai would report that
      // request as an error, so end it here and let the agent record the run as stopped.
      options?.signal?.throwIfAborted()
      return models.streamSimple(model, context, {
        ...options,
        ...proxyRequestOptions,
        apiKey: apiKeyFor(model),
      })
    },
  })
  agent.subscribe(async event => {
    if (event.type !== 'agent_end') return
    docx.dispose()
    xlsx.dispose()
    await pdf.dispose()
  })
  return agent
}
