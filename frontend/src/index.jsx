import React, { useMemo } from 'react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import stylesText from './styles.css?inline'
import { DpEmbedContext, normalizeDpEmbedContext, readWindowDpBidCollectionsContext } from './context/DpEmbedContext'
import ShadowRoot from './components/ShadowRoot'

function resolveDpEmbedForTree(dpEmbedContext) {
  const fromProp = normalizeDpEmbedContext(dpEmbedContext)
  if (fromProp) return fromProp
  return readWindowDpBidCollectionsContext()
}

/**
 * Host-embeddable component.
 *
 * - If your host app already has routing, prefer MemoryRouter here and let the host control URLs.
 * - If you want this to own URLs under a sub-path, use BrowserRouter with `basename`.
 * - Optional `dpEmbedContext` matches `window.__DP_BID_COLLECTIONS_CONTEXT__` (prop wins over window).
 */
export function BidCollectionsApp({
  router = 'memory',
  basename = '/bid_collections',
  initialPath = '/import',
  dpEmbedContext
} = {}) {
  const embedKey = dpEmbedContext
    ? [
        dpEmbedContext.projectId,
        dpEmbedContext.firmId,
        dpEmbedContext.projectName,
        Array.isArray(dpEmbedContext.projectProductIds)
          ? dpEmbedContext.projectProductIds.join('\u001f')
          : ''
      ].join('|')
    : '__window__'

  const resolvedEmbed = useMemo(() => resolveDpEmbedForTree(dpEmbedContext), [embedKey])

  const tree = <App />

  const routed =
    router === 'browser' ? (
      <BrowserRouter basename={basename}>{tree}</BrowserRouter>
    ) : (
      <MemoryRouter basename={basename} initialEntries={[initialPath]}>
        {tree}
      </MemoryRouter>
    )

  return (
    <ShadowRoot stylesText={stylesText}>
      <DpEmbedContext.Provider value={resolvedEmbed}>{routed}</DpEmbedContext.Provider>
    </ShadowRoot>
  )
}

export { App }
