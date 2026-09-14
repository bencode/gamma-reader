export const isP5SourceName = (name: string) => name.toLowerCase().endsWith('.p5.js')

export const prepareP5SourceFile = (file: File) =>
  isP5SourceName(file.name) && !file.type.startsWith('text/')
    ? new File([file], file.name, {
        type: 'text/javascript',
        lastModified: file.lastModified,
      })
    : file
