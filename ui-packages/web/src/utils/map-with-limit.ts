// A few downloads at a time keeps a large set from opening hundreds of connections at once.
export const mapWithLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
) => {
  const results: R[] = []
  let next = 0
  const work = async () => {
    for (let index = next++; index < items.length; index = next++)
      results[index] = await map(items[index] as T)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work))
  return results
}
