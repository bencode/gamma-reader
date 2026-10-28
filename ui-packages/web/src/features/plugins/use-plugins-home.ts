import { useEffect, useState } from 'react'
import { loadModelConfig } from '../../core/models/model-config'

// The plugin app's address, for a link to it: undefined until the configuration arrives, and
// where the deployment names no plugin app.
export const usePluginsHome = () => {
  const [home, setHome] = useState<string>()
  useEffect(() => {
    const controller = new AbortController()
    loadModelConfig(controller.signal)
      .then(config => setHome(config.enabled ? config.plugins : undefined))
      .catch(cause => {
        if (!controller.signal.aborted) console.error('Unable to read the plugin app', cause)
      })
    return () => controller.abort()
  }, [])
  return home
}
