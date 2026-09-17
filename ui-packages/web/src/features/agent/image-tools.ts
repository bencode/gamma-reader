import { Type } from '@earendil-works/pi-ai'
import type { VisionAnalyzer } from '../../core/agent/vision'
import { prepareImage } from '../../core/image-input'
import type { getStoredFile } from '../../data/file-store'
import { bind } from './tool'
import { LocalToolError } from './tool-types'

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
        signal,
      )
      const analysis = await analyze(
        image,
        input.question?.trim() || 'Describe this image and transcribe any important visible text.',
        signal,
      )
      return { fileId: stored.metadata.id, name: stored.metadata.name, analysis }
    },
  ),
]
