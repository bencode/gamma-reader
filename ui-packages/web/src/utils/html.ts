export const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html')

// The doctype is kept as written, since it decides whether the page renders in quirks mode.
export const serializeHtml = (page: Document) =>
  (page.doctype ? `${new XMLSerializer().serializeToString(page.doctype)}\n` : '') +
  page.documentElement.outerHTML
