import { useMemo } from 'react'
import handoffHtml from '../handoffs/designer-bidders-comparison.handoff.html?raw'

export default function DesignerHandoffPage() {
  const markup = useMemo(() => {
    try {
      const parsed = new window.DOMParser().parseFromString(handoffHtml, 'text/html')
      return parsed?.body?.innerHTML || handoffHtml
    } catch (_error) {
      return handoffHtml
    }
  }, [])

  return (
    <div className="stack">
      <div className="comparison-history-banner comparison-history-banner-compact" style={{ marginTop: 0 }}>
        <div className="comparison-history-banner-left">
          <span className="comparison-history-banner-icon" aria-hidden="true">✎</span>
          <div className="comparison-history-banner-content">
            <p className="comparison-history-banner-title">Designer Handoff Preview</p>
            <p className="comparison-history-banner-details">Edit `frontend/src/handoffs/designer-bidders-comparison.handoff.html` and refresh.</p>
          </div>
        </div>
      </div>
      <div dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  )
}
