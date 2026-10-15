import { Script } from 'node:vm'
import type { Agent } from '@earendil-works/pi-agent-core'
import { parseNote, splitSize } from '@gamma-reader/links'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { expect } from 'vitest'
import { getStoredFileContent, listStoredFiles } from '../../../data/file-store'
import { parseCsv } from '../../../formats/csv'
import { ensureLabCellIds, parseLabDocument } from '../../reader/lab-reader/document-model'
import { isP5SourceName } from '../../reader/p5-file'
import { record } from '../pagination'
import { createXlsxTools } from '../xlsx/tools'
import type { EvalWorkspace } from './workspace'

export type Call = { name: string; args: Record<string, unknown> }
export type Outcome = { workspace: EvalWorkspace; calls: Call[]; answer: string }
type Scenario = {
  name: string
  prepare: (workspace: EvalWorkspace, agent: Agent) => Promise<string>
  check: (outcome: Outcome) => void | Promise<void>
}

const labOutputs = (workspace: EvalWorkspace) => {
  const { cells } = workspace.local.read_active_lab_cells({})
  expect(cells.length).toBeGreaterThan(0)
  expect(cells.every(cell => cell.status === 'succeeded' && !cell.stale)).toBe(true)
  return cells.flatMap(cell => cell.outputs ?? [])
}

const expectTotal = (workspace: EvalWorkspace) => {
  const outputs = labOutputs(workspace)
  expect(
    outputs.some(
      output => (output.kind === 'text' || output.kind === 'stdout') && /\b42\b/.test(output.text),
    ),
  ).toBe(true)
}

const artifact = async (suffix: string) => {
  const files = (await listStoredFiles()).filter(file => file.path.toLowerCase().endsWith(suffix))
  expect(files).toHaveLength(1)
  const file = files[0]
  if (!file) throw new Error(`Missing ${suffix} artifact`)
  return (await getStoredFileContent(file.id))?.text() ?? ''
}

// Keep the production tool schema and description; only document/vision responses are fixtures.
const respond = (agent: Agent, name: string, run: (args: Record<string, unknown>) => unknown) => {
  const tool = agent.state.tools.find(tool => tool.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  tool.execute = async (_id, args) => {
    if (!record(args)) throw new Error('Expected object arguments.')
    return { content: [{ type: 'text', text: JSON.stringify(run(args)) }], details: undefined }
  }
}

export const scenarios: Scenario[] = [
  {
    name: 'p5-native-sketch',
    prepare: async () =>
      '用 p5.js 画一个沿圆周运动的小球，保存到这里让我直接打开运行。只要 p5.js 代码，不用 HTML，也不想去外部编辑器。',
    check: async ({ calls }) => {
      const file = (await listStoredFiles()).find(file => isP5SourceName(file.path))
      expect(file).toBeDefined()
      const source = await artifact('.p5.js')
      expect(() => new Script(source)).not.toThrow()
      expect(calls.some(call => call.name === 'run_active_lab_cells')).toBe(false)
    },
  },
  {
    name: 'lab-create-and-run',
    prepare: async () =>
      '保存一份可运行的 TypeScript 实验笔记，用单元格计算 [12, 17, 13] 的总和。运行确认结果，并告诉我结果。',
    check: async ({ workspace, calls, answer }) => {
      const source = workspace.source()?.content ?? (await artifact('.lab.md'))
      const lab = parseLabDocument(ensureLabCellIds(source))
      expect(lab.cells.length).toBeGreaterThan(0)
      expect(lab.blocks.every(block => !block.error)).toBe(true)
      expect(calls.some(call => call.name === 'run_active_lab_cells')).toBe(true)
      expectTotal(workspace)
      expect(answer).toContain('42')
    },
  },
  {
    name: 'lab-edit-unsaved-source',
    prepare: async workspace => {
      const fileId = await workspace.seed(
        'Sum.lab.md',
        '```typescript run\n[1, 2].reduce((a, b) => a + b, 0)\n```',
      )
      await workspace.local.open({ fileId })
      return '把当前实验单元格的数据改成 [20, 22]，运行确认总和。保留为草稿，我自己保存。'
    },
    check: async ({ workspace, calls, answer }) => {
      expect(calls.some(call => call.name === 'edit_active_source')).toBe(true)
      expect(calls.some(call => call.name === 'write')).toBe(false)
      expect(await artifact('.lab.md')).toContain('[1, 2]')
      expectTotal(workspace)
      expect(answer).toContain('42')
    },
  },
  {
    name: 'lab-typeset-output',
    prepare: async () =>
      '创建并保存一份 TypeScript 实验笔记，运行单元格，把 x^2 + y^2 = z^2 作为排版后的数学公式输出，不是打印字符串。',
    check: async ({ workspace }) => {
      await artifact('.lab.md')
      const outputs = labOutputs(workspace)
      expect(outputs.some(output => output.kind === 'latex' && output.text.length > 0)).toBe(true)
    },
  },
  {
    name: 'html-interactive-page',
    prepare: async () =>
      '创建并保存一个 HTML 页面，有按钮和计数器，每点一次加一，让我在这里打开使用。',
    check: async ({ calls }) => {
      const page = new DOMParser().parseFromString(await artifact('.html'), 'text/html')
      expect(page.querySelector('button')).not.toBeNull()
      expect(page.querySelector('script')).not.toBeNull()
      expect(calls.some(call => call.name === 'run_active_lab_cells')).toBe(false)
    },
  },
  {
    name: 'svg-editable-diagram',
    prepare: async () => '画一个有横纵坐标轴的静态示意图，保存成可编辑的 SVG 文件。',
    check: async () => {
      const svg = new DOMParser().parseFromString(await artifact('.svg'), 'image/svg+xml')
      expect(svg.querySelector('parsererror')).toBeNull()
      expect(svg.documentElement.localName).toBe('svg')
      expect(svg.querySelector('path, line, polyline')).not.toBeNull()
    },
  },
  {
    name: 'chat-mermaid-diagram',
    prepare: async () => '直接在回答里用 Mermaid 画「导入 → 阅读 → 提问」流程图，不需要保存文件。',
    check: async ({ calls, answer }) => {
      const tree = unified().use(remarkParse).parse(answer)
      const code = tree.children.find(node => node.type === 'code' && node.lang === 'mermaid')
      if (code?.type !== 'code') throw new Error('Missing Mermaid code block.')
      const { default: mermaid } = await import('mermaid')
      expect(await mermaid.parse(code.value)).toBeTruthy()
      expect(calls.some(call => call.name === 'write')).toBe(false)
    },
  },
  {
    name: 'csv-editable-table',
    prepare: async () =>
      '保存一份 CSV 表格：列为 name、comment；两行分别为 Ada / hello, world 和 Lin / ready。',
    check: async () => {
      expect(parseCsv(await artifact('.csv'))).toEqual([
        ['name', 'comment'],
        ['Ada', 'hello, world'],
        ['Lin', 'ready'],
      ])
    },
  },
  {
    name: 'sized-sketch-embed',
    prepare: async workspace => {
      await workspace.seed('Orbit.p5.js', 'function setup() { createCanvas(400, 400) }')
      return '创建一份 Markdown 笔记，把已有的 Orbit.p5.js 嵌入正文，宽度设为 480 像素。'
    },
    check: async () => {
      const note = await artifact('.md')
      const link = parseNote(note).links.find(
        link => link.embed && link.target.page === 'Orbit.p5.js',
      )
      expect(link).toBeDefined()
      expect(splitSize((link?.context ?? '').trim().slice(3, -2)).size).toEqual({ width: 480 })
    },
  },
  {
    name: 'pdf-scan-physical-page',
    prepare: async (workspace, agent) => {
      const fileId = await workspace.seed('Report.pdf', 'scanned PDF fixture')
      respond(agent, 'read', () => ({
        fileId,
        path: 'Report.pdf',
        range: null,
        content: '',
        next: null,
      }))
      respond(agent, 'pdf_info', () => ({ fileId, pageCount: 5 }))
      respond(agent, 'pdf_outline', () => ({ fileId, entries: [], next: null }))
      respond(agent, 'analyze_pdf_page', args => ({
        fileId,
        pageNumber: args.pageNumber,
        analysis: 'Printed page 12. The chart value is 73.',
      }))
      return `Report.pdf 的物理第 3 页（印刷页码 12）是扫描页。请解释图中的数值并注明来源。fileId: ${fileId}`
    },
    check: ({ calls, answer }) => {
      expect(calls.find(call => call.name === 'analyze_pdf_page')?.args.pageNumber).toBe(3)
      expect(answer).toContain('73')
      expect(calls.some(call => call.name === 'write')).toBe(false)
    },
  },
  {
    name: 'spreadsheet-cell-coordinates',
    prepare: async (workspace, agent) => {
      const fileId = await workspace.seed('Counts.xlsx', 'workbook fixture')
      const tools = createXlsxTools({
        sheets: async () => [
          {
            name: '2',
            rows: [
              ['Name', 'Count', 'Note'],
              ['Fox', 11, ''],
              ['Otter', 73, null],
            ],
          },
        ],
        dispose: () => {},
        openDocument: async () => {
          throw new Error('Use sheet_read for this fixture.')
        },
      })
      agent.state.tools = agent.state.tools.map(
        tool => tools.find(candidate => candidate.name === tool.name) ?? tool,
      )
      return `Counts.xlsx 的工作表「2」中 B3 和 C3 分别是什么？回答 JSON 对象，键为 B3 和 C3，空单元格用 null。fileId: ${fileId}`
    },
    check: ({ calls, answer }) => {
      const read = calls.find(call => call.name === 'sheet_read')
      expect(read?.args.sheet).toBe('2')
      const tree = unified().use(remarkParse).parse(answer)
      const code = tree.children.find(node => node.type === 'code')
      const result: unknown = JSON.parse(code?.type === 'code' ? code.value : answer)
      if (!record(result)) throw new Error('Expected a cell-value object.')
      expect(Object.keys(result).sort()).toEqual(['B3', 'C3'])
      // sheet_read returns cell text, so the number and its unchanged text are both valid.
      expect([73, '73']).toContain(result.B3)
      expect(result.C3).toBeNull()
    },
  },
  {
    name: 'links-follow-backlinks',
    prepare: async workspace => {
      await workspace.seed('Focus.md', '# Focus\n\nAttention.')
      await workspace.seed('Morning.md', '# Morning\n\nPractise [[Focus]].')
      await workspace.seed('Evening.md', '# Evening\n\nRest.')
      return '哪些笔记链接到了 Focus？查一下链接关系。'
    },
    check: ({ calls, answer }) => {
      expect(calls.some(call => call.name === 'get_links' && call.args.direction === 'in')).toBe(
        true,
      )
      expect(answer).toContain('Morning')
      expect(calls.some(call => call.name === 'write')).toBe(false)
    },
  },
  {
    name: 'search-empty-batch-continuation',
    prepare: async (_workspace, agent) => {
      respond(agent, 'search', args =>
        args.cursor === 'next-batch'
          ? {
              matches: [
                {
                  fileId: 'found',
                  path: 'Otter.md',
                  range: { unit: 'line', start: 1, end: 1 },
                  excerpt: 'otter',
                },
              ],
              issues: [],
              next: null,
            }
          : { matches: [], issues: [], next: { query: 'otter', cursor: 'next-batch' } },
      )
      return '搜索整个工作区，告诉我哪些文件包含 otter。'
    },
    check: ({ calls, answer }) => {
      expect(calls.some(call => call.name === 'search' && call.args.cursor === 'next-batch')).toBe(
        true,
      )
      expect(answer).toContain('Otter.md')
    },
  },
]
