import { Code2, Eye, Pause, Play, RotateCcw } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createP5FrameDocument,
  isP5FrameEvent,
  type P5FrameCommand,
  p5FrameChannel,
} from './frame-document'
import styles from './style.module.scss'

const p5RuntimeUrl = new URL('../../../node_modules/p5/lib/p5.min.js', import.meta.url).href

const P5SourceView = lazy(() =>
  import('./source-view').then(module => ({ default: module.P5SourceView })),
)

export type P5ReaderProps = {
  name: string
  source: string
  active: boolean
}

type ViewMode = 'preview' | 'source'
type RuntimeState = 'loading' | 'ready' | 'error'

export const P5Reader = ({ name, source, active }: P5ReaderProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const sourceScrollPosition = useRef(0)
  const [mode, setMode] = useState<ViewMode>('preview')
  const [runId, setRunId] = useState(() => crypto.randomUUID())
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('loading')
  const [userPaused, setUserPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const frameDocument = useMemo(
    () => createP5FrameDocument({ runtimeUrl: p5RuntimeUrl, runId, source }),
    [runId, source],
  )

  const send = useCallback(
    (type: P5FrameCommand['type']) => {
      iframeRef.current?.contentWindow?.postMessage({ channel: p5FrameChannel, runId, type }, '*')
    },
    [runId],
  )

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeRef.current?.contentWindow || !isP5FrameEvent(event.data)) return
      if (event.data.runId !== runId) return
      if (event.data.type === 'error') {
        setError(event.data.message)
        setRuntimeState('error')
        return
      }
      setError(null)
      if (!active) send('suspend')
      else if (userPaused) send('pause')
      setRuntimeState('ready')
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [active, runId, send, userPaused])

  useEffect(() => {
    if (mode !== 'preview') return
    if (runtimeState !== 'ready') return
    send(active ? 'restore' : 'suspend')
    return () => send('suspend')
  }, [active, mode, runtimeState, send])

  useEffect(() => {
    if (mode === 'preview' && runtimeState === 'loading') send('status')
  }, [mode, runtimeState, send])

  const restart = () => {
    setError(null)
    setUserPaused(false)
    setRuntimeState('loading')
    setRunId(crypto.randomUUID())
  }

  return (
    <div className={`reader-content ${styles.reader}`}>
      <div className={`preview-toolbar ${styles.toolbar}`} role="toolbar" aria-label="p5 controls">
        <span className={styles.modeControls}>
          <button
            type="button"
            className={mode === 'preview' ? styles.activeControl : undefined}
            aria-pressed={mode === 'preview'}
            onClick={() => {
              if (mode === 'source') restart()
              setMode('preview')
            }}
          >
            <Eye size={14} />
            Preview
          </button>
          <button
            type="button"
            className={mode === 'source' ? styles.activeControl : undefined}
            aria-pressed={mode === 'source'}
            onClick={() => setMode('source')}
          >
            <Code2 size={14} />
            Source
          </button>
        </span>
        {mode === 'preview' && (
          <span className={styles.runtimeControls}>
            <button
              type="button"
              disabled={runtimeState !== 'ready'}
              aria-label={userPaused ? 'Resume sketch' : 'Pause sketch'}
              title={userPaused ? 'Resume sketch' : 'Pause sketch'}
              onClick={() => {
                send(userPaused ? 'resume' : 'pause')
                setUserPaused(paused => !paused)
              }}
            >
              {userPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              type="button"
              aria-label="Restart sketch"
              title="Restart sketch"
              onClick={restart}
            >
              <RotateCcw size={14} />
            </button>
          </span>
        )}
      </div>
      <div className={styles.stage}>
        {mode === 'source' ? (
          <Suspense fallback={<div className="preview-state">Opening source…</div>}>
            <P5SourceView source={source} name={name} scrollPosition={sourceScrollPosition} />
          </Suspense>
        ) : (
          <>
            <iframe
              key={runId}
              ref={iframeRef}
              className={styles.frame}
              title={`${name} p5 preview`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={frameDocument}
              onLoad={() => send('status')}
            />
            {runtimeState === 'loading' && (
              <div className={styles.loading} role="status">
                Starting sketch…
              </div>
            )}
            {error && (
              <div className={styles.error} role="alert">
                <strong>Sketch error</strong>
                <span>{error}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
