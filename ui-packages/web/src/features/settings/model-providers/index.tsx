import { useEffect, useId, useState } from 'react'
import { ConfirmationDialog } from '../../../components/confirmation-dialog'
import {
  catalog,
  catalogEntry,
  customProviderId,
  customProviderKey,
} from '../../../core/byok/catalog'
import { type DiscoveryFailure, listModels } from '../../../core/byok/discover'
import { removeUserProvider, saveUserProvider, useUserProviders } from '../../../core/byok/store'
import styles from './style.module.scss'

const failureText: Record<DiscoveryFailure, string> = {
  key: 'That key was not accepted by this service.',
  endpoint: 'That address does not answer like an OpenAI-compatible API.',
  // The one failure a reader cannot diagnose alone: the request never reached
  // them, and the browser reports nothing beyond "it failed".
  blocked: 'That address does not allow browsers to reach it directly (no CORS headers).',
  unreachable: 'Could not reach that address.',
  unknown: 'That service could not be asked for its models.',
}

const preselectLimit = 10

type Draft = {
  provider: string
  apiKey: string
  baseUrl: string
  label: string
  models: string[]
  visionModel: string
}

const emptyDraft: Draft = {
  provider: catalog[0]?.id ?? customProviderId,
  apiKey: '',
  baseUrl: '',
  label: '',
  models: [],
  visionModel: '',
}

/** All a chosen model is asked for here; a full pi model would be a pretence. */
type OfferedModel = { id: string; name: string; input: readonly string[] }

type Phase =
  | { step: 'editing' }
  | { step: 'checking' }
  | { step: 'failed'; reason: DiscoveryFailure }
  | { step: 'choosing'; offered: readonly OfferedModel[] }

export const ModelProviderDialog = ({ onClose }: { onClose: () => void }) => {
  const configured = useUserProviders()
  const [draft, setDraft] = useState(emptyDraft)
  const [phase, setPhase] = useState<Phase>({ step: 'editing' })
  const [search, setSearch] = useState('')
  const [presets, setPresets] = useState<Map<string, { name: string; baseUrl: string }>>(new Map())
  const fieldId = useId()
  const custom = draft.provider === customProviderId

  // pi states each vendor's name and address, so neither is repeated here. They
  // arrive with the provider module, which is why this is a load rather than a
  // lookup.
  useEffect(() => {
    let live = true
    Promise.all(
      catalog.map(async entry => {
        const provider = await entry.load()
        return [entry.id, { name: provider.name, baseUrl: provider.baseUrl ?? '' }] as const
      }),
    )
      .then(loaded => {
        if (!live) return
        const byId = new Map(loaded)
        setPresets(byId)
        // Whoever is selected by now, not whoever was first: a reader can pick
        // a vendor before this resolves.
        setDraft(current =>
          current.baseUrl
            ? current
            : { ...current, baseUrl: byId.get(current.provider)?.baseUrl ?? '' },
        )
      })
      .catch((cause: unknown) => {
        // The form still works typed out by hand, so this degrades rather than
        // blocks — but silently would leave a blank Address looking like a bug.
        console.error('Unable to load the built-in model providers', cause)
      })
    return () => {
      live = false
    }
  }, [])

  const offer = (models: readonly OfferedModel[]) => {
    setPhase({ step: 'choosing', offered: models })
    setDraft(current => ({
      ...current,
      // A list short enough to read at a glance is not worth making anyone tick
      // through; a list of hundreds has to be narrowed before it is useful.
      models: models.length <= preselectLimit ? models.map(model => model.id) : [],
    }))
  }

  const check = async () => {
    setPhase({ step: 'checking' })
    try {
      const preset = custom ? undefined : catalogEntry(draft.provider)
      if (!custom && !preset) return setPhase({ step: 'failed', reason: 'endpoint' })
      // One request both proves the key and, for an endpoint pi does not know,
      // reports what it offers.
      const found = await listModels(draft.baseUrl, draft.apiKey)
      if (!found.ok) return setPhase({ step: 'failed', reason: found.reason })
      offer(
        preset
          ? (await preset.load()).getModels()
          : found.models.map(id => ({ id, name: id, input: ['text', 'image'] })),
      )
    } catch (cause) {
      // Leaving the phase on `checking` would disable the form for good.
      console.error('Could not reach that model provider', cause)
      setPhase({ step: 'failed', reason: 'unknown' })
    }
  }

  const save = () => {
    saveUserProvider({
      id: custom ? customProviderKey(draft.label.trim()) : draft.provider,
      apiKey: draft.apiKey.trim(),
      models: draft.models,
      ...(draft.visionModel ? { visionModel: draft.visionModel } : {}),
      ...(custom
        ? { baseUrl: draft.baseUrl.trim(), label: draft.label.trim() }
        : // Only when it differs from what pi states, so a preset left alone
          // keeps following pi if that address ever changes.
          draft.baseUrl.trim() !== presets.get(draft.provider)?.baseUrl
          ? { baseUrl: draft.baseUrl.trim() }
          : {}),
    })
    setDraft(emptyDraft)
    setPhase({ step: 'editing' })
  }

  const offered = phase.step === 'choosing' ? phase.offered : []
  const matching = offered.filter(model =>
    `${model.id} ${model.name}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const chosen = offered.filter(model => draft.models.includes(model.id))
  const visionOptions = chosen.filter(model => model.input.includes('image'))

  return (
    <ConfirmationDialog label="Model providers" onCancel={onClose} className={styles.shell}>
      <div className={styles.dialog}>
        <header className={styles.header}>
          <h2>Your models</h2>
          <p className={styles.note}>
            Keys are kept in this browser and are never sent to Gamma Reader. Models you add here
            run on your own key and are not counted against the free allowance.
          </p>
        </header>

        {configured.length > 0 && (
          <ul className={styles.configured}>
            {configured.map(provider => (
              <li key={provider.id}>
                <span className={styles.name}>
                  {provider.label || presets.get(provider.id)?.name || provider.id}
                </span>
                <span className={styles.count}>{provider.models.length} models</span>
                <button type="button" onClick={() => removeUserProvider(provider.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <fieldset className={styles.form} disabled={phase.step === 'checking'}>
          <legend>Add a provider</legend>

          <label htmlFor={`${fieldId}-provider`}>Provider</label>
          <select
            id={`${fieldId}-provider`}
            value={draft.provider}
            onChange={event => {
              const chosen = event.target.value
              setDraft({
                ...emptyDraft,
                provider: chosen,
                baseUrl: presets.get(chosen)?.baseUrl ?? '',
              })
              setPhase({ step: 'editing' })
            }}
          >
            {catalog.map(entry => (
              <option key={entry.id} value={entry.id}>
                {presets.get(entry.id)?.name ?? entry.id}
              </option>
            ))}
            <option value={customProviderId}>Another OpenAI-compatible service…</option>
          </select>

          {custom && (
            <>
              <label htmlFor={`${fieldId}-label`}>Name</label>
              <input
                id={`${fieldId}-label`}
                value={draft.label}
                placeholder="What to call it"
                onChange={event => setDraft({ ...draft, label: event.target.value })}
              />
            </>
          )}

          <label htmlFor={`${fieldId}-url`}>Address</label>
          <input
            id={`${fieldId}-url`}
            value={draft.baseUrl}
            placeholder="https://example.com/v1"
            inputMode="url"
            onChange={event => setDraft({ ...draft, baseUrl: event.target.value })}
          />

          <label htmlFor={`${fieldId}-key`}>API key</label>
          <input
            id={`${fieldId}-key`}
            type="password"
            value={draft.apiKey}
            autoComplete="off"
            onChange={event => setDraft({ ...draft, apiKey: event.target.value })}
          />

          {phase.step === 'failed' && (
            <p className={styles.failure} role="alert">
              {failureText[phase.reason]}
            </p>
          )}

          {phase.step === 'choosing' && (
            <>
              <label htmlFor={`${fieldId}-search`}>Models</label>
              <input
                id={`${fieldId}-search`}
                type="search"
                value={search}
                placeholder={`Search ${offered.length} models`}
                onChange={event => setSearch(event.target.value)}
              />
              <ul className={styles.models}>
                {matching.map(model => (
                  <li key={model.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.models.includes(model.id)}
                        onChange={event =>
                          setDraft({
                            ...draft,
                            models: event.target.checked
                              ? [...draft.models, model.id]
                              : draft.models.filter(id => id !== model.id),
                            visionModel:
                              !event.target.checked && draft.visionModel === model.id
                                ? ''
                                : draft.visionModel,
                          })
                        }
                      />
                      {model.name}
                    </label>
                  </li>
                ))}
              </ul>

              <label htmlFor={`${fieldId}-vision`}>Model for images</label>
              <select
                id={`${fieldId}-vision`}
                value={draft.visionModel}
                onChange={event => setDraft({ ...draft, visionModel: event.target.value })}
              >
                <option value="">None — image questions stay unavailable</option>
                {visionOptions.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className={styles.actions}>
            <button type="button" onClick={onClose}>
              Close
            </button>
            {phase.step === 'choosing' ? (
              <button type="button" onClick={save} disabled={draft.models.length === 0}>
                Save
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void check()}
                disabled={
                  !draft.apiKey.trim() || !draft.baseUrl.trim() || (custom && !draft.label.trim())
                }
              >
                {phase.step === 'checking' ? 'Checking…' : 'Check key'}
              </button>
            )}
          </div>
        </fieldset>
      </div>
    </ConfirmationDialog>
  )
}
