import React from 'react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

/**
 * Host-embeddable component.
 *
 * - If your host app already has routing, prefer MemoryRouter here and let the host control URLs.
 * - If you want this to own URLs under a sub-path, use BrowserRouter with `basename`.
 */
export function BidCollectionsApp({
  router = 'memory',
  basename = '/bid_collections',
  initialPath = '/import'
} = {}) {
  if (router === 'browser') {
    return (
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    )
  }

  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  )
}

export { App }

