import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import { deleteBidPackage, fetchBidPackages, updateBidPackage } from '../lib/api'

const GENERAL_PRICING_FIELDS = [
  { key: 'delivery_amount', label: 'Shipping' },
  { key: 'install_amount', label: 'Install' },
  { key: 'escalation_amount', label: 'Escalation' },
  { key: 'contingency_amount', label: 'Contingency' },
  { key: 'sales_tax_amount', label: 'Sales Tax' }
]

function createQuestionDraft() {
  return {
    id: `question_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: ''
  }
}

function formatCreatedDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function packageStatusLabel(pkg) {
  if (pkg?.package_award_status === 'fully_awarded') return 'Fully Awarded'
  if (pkg?.package_award_status === 'partially_awarded') return 'Partially Awarded'
  return 'Not Awarded'
}

function packageDisplayName(pkg) {
  const packageName = String(pkg?.name || '').trim()
  return packageName || 'Untitled Bid Package'
}

function EyeGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function EyeOffGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 13L13 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function packageStatusTone(pkg) {
  return pkg?.package_award_status === 'not_awarded' ? 'is-progress' : 'is-awarded'
}

export default function PackageListPage() {
  const navigate = useNavigate()
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [deleteModalPackage, setDeleteModalPackage] = useState(null)
  const [draft, setDraft] = useState({
    name: '',
    visibility: 'private',
    instructions: '',
    activeGeneralFields: GENERAL_PRICING_FIELDS.map((f) => f.key),
    customQuestions: []
  })

  const loadPackages = async () => {
    setLoading(true)
    try {
      const payload = await fetchBidPackages()
      setPackages(payload.bid_packages || [])
      setStatusMessage('')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPackages()
  }, [])

  const startEdit = (pkg) => {
    setEditingId(pkg.id)
    setDraft({
      name: pkg.name || '',
      visibility: pkg.visibility || 'private',
      instructions: pkg.instructions || '',
      activeGeneralFields: pkg.active_general_fields || GENERAL_PRICING_FIELDS.map((f) => f.key),
      customQuestions: pkg.custom_questions || []
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setLoading(true)
    setStatusMessage('Saving package...')
    try {
      await updateBidPackage({
        bidPackageId: editingId,
        name: draft.name.trim(),
        visibility: draft.visibility,
        instructions: draft.instructions,
        activeGeneralFields: draft.activeGeneralFields,
        customQuestions: (draft.customQuestions || []).filter((question) => String(question.label || '').trim())
      })
      setEditingId(null)
      await loadPackages()
    } catch (error) {
      setStatusMessage(error.message)
      setLoading(false)
    }
  }

  const removePackage = async (pkg) => {
    if (!pkg?.id) return
    setLoading(true)
    setStatusMessage('Deleting package...')
    try {
      await deleteBidPackage(pkg.id)
      if (editingId === pkg.id) setEditingId(null)
      setDeleteModalPackage(null)
      await loadPackages()
    } catch (error) {
      setStatusMessage(error.message)
      setLoading(false)
    }
  }

  const copyPublicPackageUrl = async (pkg) => {
    const relativeUrl = pkg?.public_url
    if (!relativeUrl) return
    const absoluteUrl = `${window.location.origin}${relativeUrl}`
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      setStatusMessage(`Public URL copied for "${packageDisplayName(pkg)}".`)
    } catch (_error) {
      setStatusMessage('Unable to copy URL in this browser.')
    }
  }

  return (
    <div className="stack">
      <SectionCard className="section-card-flat bidders-flat">
        <div className="package-list-header">
          <h2>Bid Packages</h2>
          <p className="text-muted">These are the bid packages for your project.</p>
        </div>

        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}

        <div className="package-list-grid">
          {packages.map((pkg) => (
            <div key={pkg.id} className="package-list-card package-list-card-compact">
              <div className="package-list-card-row">
                <div className="package-list-left">
                  <div className="package-list-card-meta">
                    <span className={`package-status-dot ${packageStatusTone(pkg)}`} />
                    <span className={`package-status-label ${packageStatusTone(pkg)}`}>{packageStatusLabel(pkg)}</span>
                  </div>
                  <div className="package-list-title-wrap">
                    {pkg.visibility === 'public' ? (
                      <button
                        type="button"
                        className="package-visibility-btn"
                        onClick={() => copyPublicPackageUrl(pkg)}
                        title="Copy public URL"
                        aria-label={`Copy public URL for ${packageDisplayName(pkg)}`}
                      >
                        <EyeGlyph />
                      </button>
                    ) : (
                      <span className="package-visibility-indicator" title="Private package" aria-label="Private package">
                        <EyeOffGlyph />
                      </span>
                    )}
                    <div className="package-list-card-title">{packageDisplayName(pkg)}</div>
                  </div>
                </div>
                <div className="package-list-right">
                  <div className="package-list-card-subline">
                    {`Created on ${formatCreatedDate(pkg.created_at || pkg.imported_at)} • ${pkg.spec_item_count ?? 0} Specs • ${pkg.invite_count ?? 0} Bidders`}
                  </div>
                  <div className="package-list-card-actions">
                    <button
                      className="btn package-list-edit-btn"
                      onClick={() => startEdit(pkg)}
                      disabled={loading || editingId === pkg.id}
                      title="Edit package"
                      aria-label={`Edit ${packageDisplayName(pkg)}`}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path d="M2.4 11.5v2.1h2.1l7-7-2.1-2.1-7 7Zm1.1 1v-.6l5.9-5.9.6.6-5.9 5.9h-.6Zm8.7-6.6 1.1-1.1c.2-.2.2-.5 0-.7l-1.2-1.2c-.2-.2-.5-.2-.7 0L10.3 4l1.9 1.9Z" fill="currentColor" />
                      </svg>
                    </button>
                    <button
                      className="btn btn-primary package-list-view-btn"
                      onClick={() => navigate(`/package/${pkg.id}`)}
                      disabled={loading || editingId === pkg.id}
                    >
                      View
                    </button>
                  </div>
                </div>
              </div>

              {editingId === pkg.id ? (
                <div className="package-list-edit-grid">
                  <label>
                    Package Name
                    <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
                  </label>
                  <label>
                    Visibility
                    <select value={draft.visibility} onChange={(event) => setDraft((prev) => ({ ...prev, visibility: event.target.value }))}>
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                  <label className="package-list-edit-span">
                    Instructions
                    <textarea
                      value={draft.instructions}
                      rows={2}
                      onChange={(event) => setDraft((prev) => ({ ...prev, instructions: event.target.value }))}
                    />
                  </label>
                  <div className="package-list-general-fields package-list-edit-span">
                    <p>General Pricing Fields</p>
                    <div className="package-list-general-fields-row">
                      {GENERAL_PRICING_FIELDS.map((field) => (
                        <label key={field.key} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={draft.activeGeneralFields.includes(field.key)}
                            onChange={(event) => {
                              setDraft((prev) => {
                                if (event.target.checked) {
                                  if (prev.activeGeneralFields.includes(field.key)) return prev
                                  return { ...prev, activeGeneralFields: [...prev.activeGeneralFields, field.key] }
                                }
                                return {
                                  ...prev,
                                  activeGeneralFields: prev.activeGeneralFields.filter((key) => key !== field.key)
                                }
                              })
                            }}
                          />
                          {field.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="package-list-general-fields package-list-edit-span">
                    <div className="package-list-custom-head">
                      <p>Custom Questions</p>
                    </div>
                    {!(draft.customQuestions || []).length ? null : (
                      <div className="package-questions-editor">
                        {(draft.customQuestions || []).map((question, index) => (
                          <div key={question.id || index} className="package-question-editor-row">
                            <span className="package-question-editor-index">{index + 1}</span>
                            <input
                              type="text"
                              value={question.label || ''}
                              placeholder="What purchasing network are you utilizing?"
                              onChange={(event) => setDraft((prev) => ({
                                ...prev,
                                customQuestions: (prev.customQuestions || []).map((entry, entryIndex) => (
                                  (entry.id || entryIndex) === (question.id || index)
                                    ? { ...entry, label: event.target.value }
                                    : entry
                                ))
                              }))}
                            />
                            <button
                              type="button"
                              className="package-question-editor-remove"
                              onClick={() => setDraft((prev) => ({
                                ...prev,
                                customQuestions: (prev.customQuestions || []).filter((entry, entryIndex) => (
                                  (entry.id || entryIndex) !== (question.id || index)
                                ))
                              }))}
                              disabled={loading}
                              aria-label={`Remove question ${index + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="package-question-add-link"
                      onClick={() => setDraft((prev) => ({
                        ...prev,
                        customQuestions: [...(prev.customQuestions || []), createQuestionDraft()]
                      }))}
                      disabled={loading}
                    >
                      + Add Question
                    </button>
                  </div>
                  <div className="action-row package-list-edit-actions">
                    <button className="btn btn-primary" onClick={saveEdit} disabled={loading || !draft.name.trim()}>Save Changes</button>
                    <button className="btn" onClick={() => setEditingId(null)} disabled={loading}>Cancel</button>
                    <button className="btn btn-danger package-list-delete-btn" onClick={() => setDeleteModalPackage(pkg)} disabled={loading}>Delete Bid Package</button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {packages.length === 0 ? <p className="text-muted">No bid packages yet.</p> : null}
        </div>
      </SectionCard>

      {deleteModalPackage ? (
        <div className="modal-backdrop" onClick={() => setDeleteModalPackage(null)}>
          <div className="modal-card package-delete-modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="package-delete-modal-close"
              onClick={() => setDeleteModalPackage(null)}
              aria-label="Close delete modal"
            >
              ×
            </button>
            <h3>Delete Bid Package</h3>
            <p className="package-delete-modal-copy">
              Are you sure you want to delete this bid package?
              <br />
              This action cannot be reverted.
            </p>
            <button
              type="button"
              className="btn package-delete-modal-confirm"
              onClick={() => removePackage(deleteModalPackage)}
              disabled={loading}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
