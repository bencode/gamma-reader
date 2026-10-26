import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installReadableStreamAsyncIteration } from './polyfill/readable-stream-async-iteration'
import { App } from './shell/app'
import './styles.css'

installReadableStreamAsyncIteration()

// A file dropped where nothing takes it would otherwise open in the tab and replace the app.
const keepFileDrops = (event: DragEvent) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
}
window.addEventListener('dragover', keepFileDrops)
window.addEventListener('drop', keepFileDrops)

const root = document.getElementById('root')
if (!root) throw new Error('The application root is missing.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
