import { Type } from '@earendil-works/pi-ai'
import { bind, LocalToolError, Metered } from '../../core/agent/tool'
import { prepareImage, readerImagePixels } from '../../core/image-input'
import type { getStoredFile } from '../../data/file-store'
import type { VisionAnalyzer } from './vision'

export const createImageTools = (loadFile: typeof getStoredFile, analyze: VisionAnalyzer) => [
  bind(
    'analyze_image',
    'Analyze one local image with a vision model. Provide a focused question when possible; omit it for a general description and transcription.',
    Type.Object({
      fileId: Type.String(),
      question: Type.Optional(Type.String({ maxLength: 2000 })),
    }),
    async (input, signal) => {
      const stored = await loadFile(input.fileId)
      if (!stored)
        throw new LocalToolError('File removed or not found. Run list to choose an available file.')
      if (stored.metadata.previewKind !== 'image')
        throw new LocalToolError('This file is not an image. Use read for readable document text.')
      const image = await prepareImage(
        stored.blob,
        stored.blob.type || stored.metadata.mediaType,
        readerImagePixels,
        signal,
      )
      const { analysis, usage } = await analyze(
        image,
        input.question?.trim() || 'Describe this image and transcribe any important visible text.',
        signal,
      )
      return new Metered(
        { fileId: stored.metadata.id, path: stored.metadata.path, analysis },
        usage,
      )
    },
  ),
]
