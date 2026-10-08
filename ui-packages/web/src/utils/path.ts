export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export const containsControlCharacter = (value: string) =>
  Array.from(value).some(character => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
  })
