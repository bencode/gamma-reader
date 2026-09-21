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

const textReadableKinds = new Set<PreviewKind>(['markdown', 'text', 'docx'])

const getReadability = (file: StoredFileMetadata) => {
  if (file.previewKind === 'pdf') return { textReadable: true }
  if (!textReadableKinds.has(file.previewKind))
    return { textReadable: false, reason: 'Text reading is not supported for this format yet.' }
  // Word documents are converted rather than decoded, so the text budget does not apply.
  if (file.previewKind !== 'docx' && file.size > maximumTextPreviewBytes)
    return { textReadable: false, reason: 'Text reading is limited to files of 5 MiB or less.' }
  return { textReadable: true }
}

export const createReaderDocumentAccess = (
  pdf: PdfRuntime,
  docx: DocxRuntime = createDocxRuntime(),
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
]

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
  const documents = createDocumentTools(createReaderDocumentAccess(pdf, docx))
  const vision = visionModelFor(runtime, session.model)
  const analyze = vision ? createVisionAnalyzer(vision) : undefined
  const agent = new Agent({
    sessionId: session.id,
    toolExecution: 'sequential',
    initialState: {
      model: session.model,
      thinkingLevel: session.thinkingLevel,
      messages: [...session.messages],
      systemPrompt: `${systemPrompt}\n\n${skillCatalog(skills)}`,
      tools: [
        ...createReaderTools(local, documents),
        ...(analyze ? createImageTools(getStoredFile, analyze) : []),
        ...createPdfTools(pdf, analyze),
        ...createSkillTools(skills),
      ],
    },
    streamFn: (model, context, options) =>
      models.streamSimple(model, context, {
        ...options,
        ...proxyRequestOptions,
        apiKey: apiKeyFor(model),
      }),
  })
  agent.subscribe(async event => {
    if (event.type !== 'agent_end') return
    docx.dispose()
    await pdf.dispose()
  })
  return agent
}
