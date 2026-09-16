import type { Root, RootContent } from 'mdast'
import type { Plugin } from 'unified'
import { parseLabDocument } from './document-model'

export const remarkLabCells: Plugin<[], Root> = () => (tree, file) => {
  const model = parseLabDocument(String(file.value))
  const blocks = new Map(model.blocks.map(block => [block.offset, block]))
  const visit = (node: Root | RootContent) => {
    if (node.type === 'code') {
      const block = blocks.get(node.position?.start.offset ?? -1)
      if (!block) return
      node.data = {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          ...(block.error ? { dataLabError: block.error } : {}),
          ...(!block.error && block.id
            ? {
                dataLabCellId: block.id,
                className: ['no-highlight'],
              }
            : {}),
        },
      }
    }
    if ('children' in node) node.children.forEach(visit)
  }
  visit(tree)
}
