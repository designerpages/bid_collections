import { createContext, useContext } from 'react'

export const DpEmbedContext = createContext(null)

export function useDpEmbedContext() {
  return useContext(DpEmbedContext)
}

/**
 * Normalize host-provided embed context (prop or window global).
 * @see docs/BID_COLLECTIONS_DP_EMBED_CONTEXT.md
 */
export function normalizeDpEmbedContext(raw) {
  if (!raw || typeof raw !== 'object') return null
  const projectId = raw.projectId != null ? String(raw.projectId).trim() : ''
  const firmId = raw.firmId != null ? String(raw.firmId).trim() : ''
  if (!projectId || !firmId) return null
  const projectName = raw.projectName != null ? String(raw.projectName) : ''
  const projectProductIds = Array.isArray(raw.projectProductIds)
    ? raw.projectProductIds.map((id) => String(id))
    : []
  return { projectId, firmId, projectName, projectProductIds }
}

export function readWindowDpBidCollectionsContext() {
  if (typeof window === 'undefined') return null
  return normalizeDpEmbedContext(window.__DP_BID_COLLECTIONS_CONTEXT__)
}
