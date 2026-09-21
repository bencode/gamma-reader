import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installReadableStreamAsyncIteration } from './polyfill/readable-stream-async-iteration'
import { App } from './shell/app'
import './styles.css'

installReadableStreamAsyncIteration()

const root = document.getElementById('root')
if (!root) throw new Error('The application root is missing.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
