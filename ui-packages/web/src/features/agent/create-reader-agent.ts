import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AgentConfig } from '@gamma-reader/server/agent-contract'
import { createAgent } from '../../core/agent/runtime'
import { createVisionAnalyzer } from '../../core/agent/vision'
import { markdownText } from '../../core/document-text'
import { maximumTextPreviewBytes, type StoredFileMetadata } from '../../core/files'
import { getStoredFile, listStoredFiles } from '../../data/file-store'
import { createDocumentTools, type DocumentAccess } from './document-tools'
import { createImageTools } from './image-tools'
import type { LocalTools } from './local-tools'
import { createPdfRuntime, type PdfRuntime } from './pdf/runtime'
import { createPdfTools } from './pdf/tools'
import { createSkillTools, type SkillDefinition, skillCatalog } from './skills'
import { systemPrompt } from './system-prompt'
import { openTextSource } from './text-source'
import { LocalToolError } from './tool-types'
import { createReaderTools } from './tools'

const getReadability = (file: StoredFileMetadata) => {
  if (file.previewKind === 'pdf') return { textReadable: true }
  if (file.previewKind !== 'markdown' && file.previewKind !== 'text')
    return { textReadable: false, reason: 'Text reading is not supported for this format yet.' }
  if (file.size > maximumTextPreviewBytes)
    return { textReadable: false, reason: 'Text reading is limited to files of 5 MiB or less.' }
  return { textReadable: true }
}

export const createReaderDocumentAccess = (pdf: PdfRuntime): DocumentAccess => ({
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
  config: Extract<AgentConfig, { enabled: true }>,
  local: LocalTools,
  session: { id: string; messages: readonly AgentMessage[] },
) => {
  const pdf = createPdfRuntime(getStoredFile)
  const documents = createDocumentTools(createReaderDocumentAccess(pdf))
  const analyze = config.visionModelId
    ? createVisionAnalyzer({ ...config, visionModelId: config.visionModelId })
    : undefined
  const agent = createAgent(
    config,
    {
      systemPrompt: `${systemPrompt}\n\n${skillCatalog(skills)}`,
      tools: [
        ...createReaderTools(local, documents),
        ...(analyze ? createImageTools(getStoredFile, analyze) : []),
        ...createPdfTools(pdf, analyze),
        ...createSkillTools(skills),
      ],
    },
    session,
  )
  agent.subscribe(async event => {
    if (event.type === 'agent_end') await pdf.dispose()
  })
  return agent
}
