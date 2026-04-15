import { useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'

/**
 * Renders children into a Shadow DOM root and injects styles there.
 * This prevents Bid Collections CSS from leaking into the host app.
 */
export default function ShadowRoot({ children, stylesText, mode = 'open' }) {
  const hostRef = useRef(null)
  const [shadowRoot, setShadowRoot] = useState(null)

  useEffect(() => {
    if (!hostRef.current) return
    const root = hostRef.current.shadowRoot || hostRef.current.attachShadow({ mode })
    setShadowRoot(root)
  }, [mode])

  const styleEl = useMemo(() => {
    if (!shadowRoot) return null
    const el = document.createElement('style')
    el.setAttribute('data-bid-collections', 'styles')
    return el
  }, [shadowRoot])

  useEffect(() => {
    if (!shadowRoot || !styleEl) return
    styleEl.textContent = stylesText || ''
    shadowRoot.appendChild(styleEl)
    return () => {
      try {
        shadowRoot.removeChild(styleEl)
      } catch (err) {
        // ignore
      }
    }
  }, [shadowRoot, styleEl, stylesText])

  return (
    <div ref={hostRef}>
      {shadowRoot ? ReactDOM.createPortal(children, shadowRoot) : null}
    </div>
  )
}

