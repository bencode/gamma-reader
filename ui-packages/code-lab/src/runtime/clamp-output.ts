import type { CodeLabExecutionResult, CodeLabOutput } from '../types'

// Each side keeps up to this many characters; teaching-sized output never reaches it.
const keptChars = 32_000
// A cut moves to the nearest line break when one is this close, so kept lines stay whole.
const lineSnapChars = 1_000

const countLineBreaks = (text: string): number => text.split('\n').length - 1

export const clampText = (text: string): string => {
  if (text.length <= keptChars * 2) return text

  const rawHead = text.slice(0, keptChars)
  const headBreak = rawHead.lastIndexOf('\n')
  const head = headBreak >= keptChars - lineSnapChars ? rawHead.slice(0, headBreak + 1) : rawHead

  const rawTail = text.slice(-keptChars)
  const tailBreak = rawTail.indexOf('\n')
  const tail = tailBreak >= 0 && tailBreak < lineSnapChars ? rawTail.slice(tailBreak + 1) : rawTail

  const omitted = text.slice(head.length, text.length - tail.length)
  const lines = countLineBreaks(omitted)
  const amount =
    lines > 0
      ? `${lines.toLocaleString('en-US')} lines`
      : `${omitted.length.toLocaleString('en-US')} characters`
  return `${head.endsWith('\n') ? head : `${head}\n`}… ${amount} omitted …\n${tail}`
}

const clampOutput = (output: CodeLabOutput): CodeLabOutput =>
  output.kind === 'stdout' || output.kind === 'stderr' || output.kind === 'text'
    ? { kind: output.kind, text: clampText(output.text) }
    : output

export const clampResult = (result: CodeLabExecutionResult): CodeLabExecutionResult => ({
  ...result,
  outputs: result.outputs.map(clampOutput),
})
