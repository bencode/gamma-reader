import type { Api, Model } from '@earendil-works/pi-ai'

/**
 * Which of a provider's models can be asked about an image. pi states this for
 * the providers it ships; a reader-supplied endpoint states nothing, so models
 * synthesised for one claim image input and the reader names the right one.
 */
export const visionCandidates = (models: readonly Model<Api>[]) =>
  models.filter(model => model.input.includes('image'))
