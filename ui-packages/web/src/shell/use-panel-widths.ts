import { useState } from 'react'

type PanelWidths = { files: number; assistant: number }

const storageKey = 'gamma-reader.panel-widths'
const defaults: PanelWidths = { files: 240, assistant: 360 }
const isWidth = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const readWidths = (): PanelWidths => {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === null) return defaults
    const value: unknown = JSON.parse(stored)
    if (
      typeof value === 'object' &&
      value !== null &&
      'files' in value &&
      isWidth(value.files) &&
      'assistant' in value &&
      isWidth(value.assistant)
    )
      return { files: value.files, assistant: value.assistant }
    throw new Error('Invalid saved panel widths')
  } catch (error) {
    console.error('Unable to restore panel widths', error)
    return defaults
  }
}

export const usePanelWidths = () => {
  const [widths, setWidths] = useState(readWidths)

  const saveWidths = (visibleWidths: Partial<PanelWidths>) => {
    const next = { ...widths, ...visibleWidths }
    setWidths(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch (error) {
      console.error('Unable to save panel widths', error)
    }
  }

  return { widths, saveWidths }
}
