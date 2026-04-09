import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import {
  createBidPackage,
  dpFetchProjectBidPackages,
  dpResolveContext,
  DP_INTEGRATION_ENABLED,
  fetchBidPackages,
  fetchProjects,
  importRowsToBidPackage,
  previewBidPackage
} from '../lib/api'

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

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Unable to read selected file'))
    reader.readAsText(file)
  })
}

export default function ImportPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentStep = searchParams.get('step') === '2' ? '2' : '1'

  const [importMode, setImportMode] = useState('create_new')
  const [step2View, setStep2View] = useState('existing')

  const [packageName, setPackageName] = useState('')
  const [projects, setProjects] = useState([])
  const [bidPackages, setBidPackages] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedExistingPackageId, setSelectedExistingPackageId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)

  const [selectedFile, setSelectedFile] = useState(null)
  const [csvContent, setCsvContent] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [instructions, setInstructions] = useState('')
  const [activeGeneralFields, setActiveGeneralFields] = useState([])
  const [customQuestions, setCustomQuestions] = useState([])

  const [previewResult, setPreviewResult] = useState(null)
  const [previewErrors, setPreviewErrors] = useState([])
  const [createResult, setCreateResult] = useState(null)

  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      setLoadingProjects(true)
      try {
        if (DP_INTEGRATION_ENABLED) {
          const urlParams = new URLSearchParams(window.location.search || '')
          const firmId = urlParams.get('firm_id')
          const projectName = urlParams.get('project_name')
          const projectNumber = urlParams.get('project_number')

          if (!firmId || !projectName) {
            throw new Error('Missing firm_id and/or project_name in URL parameters for DP integration mode')
          }

          const resolved = await dpResolveContext({ firmId, projectName, projectNumber })
          const projectList = Array.isArray(resolved) ? resolved : []
          setProjects(projectList)
          if (projectList.length > 0) {
            const dpProjectId = String(projectList[0].project_id)
            setSelectedProjectId(dpProjectId)
            const packageData = await dpFetchProjectBidPackages({ projectId: dpProjectId })
            setBidPackages(packageData.bid_packages || [])
          } else {
            setBidPackages([])
          }
        } else {
          const [projectData, packageData] = await Promise.all([fetchProjects(), fetchBidPackages()])
          const projectList = projectData.projects || []
          const packageList = packageData.bid_packages || []

          setProjects(projectList)
          setBidPackages(packageList)

          if (projectList.length > 0) {
            setSelectedProjectId(String(projectList[0].id))
          }
        }
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setLoadingProjects(false)
      }
    }

    loadData()
  }, [])

  const filteredExistingPackages = useMemo(
    () => {
      if (DP_INTEGRATION_ENABLED) return bidPackages
      return bidPackages.filter((pkg) => String(pkg.project_id) === String(selectedProjectId))
    },
    [bidPackages, selectedProjectId]
  )

  useEffect(() => {
    if (importMode !== 'add_existing') return

    if (!filteredExistingPackages.length) {
      setSelectedExistingPackageId('')
      return
    }

    if (!filteredExistingPackages.some((pkg) => String(pkg.id) === String(selectedExistingPackageId))) {
      setSelectedExistingPackageId(String(filteredExistingPackages[0].id))
    }
  }, [filteredExistingPackages, importMode, selectedExistingPackageId])

  const canPreview = useMemo(() => csvContent && selectedProjectId, [csvContent, selectedProjectId])
  const canProceedToStep2 = useMemo(
    () => Boolean(previewResult?.valid && previewResult?.row_count > 0),
    [previewResult]
  )
  const canCreate = useMemo(
    () => importMode === 'create_new' && canPreview && previewResult?.valid && packageName && selectedProjectId,
    [canPreview, importMode, previewResult, packageName, selectedProjectId]
  )
  const canAddToExisting = useMemo(
    () => importMode === 'add_existing' && canPreview && previewResult?.valid && selectedExistingPackageId,
    [canPreview, importMode, previewResult, selectedExistingPackageId]
  )

  const handleFilePick = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setCreateResult(null)
    setPreviewResult(null)
    setPreviewErrors([])
    setStatusMessage('Reading CSV...')

    try {
      const content = await readFileText(file)
      setCsvContent(content)
      setStatusMessage('CSV loaded. Ready to preview.')
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const handlePreview = async () => {
    if (!canPreview) return

    setLoading(true)
    setStatusMessage('Previewing import...')
    setCreateResult(null)

    try {
      const result = await previewBidPackage({
        projectId: selectedProjectId,
        csvContent,
        sourceProfile: 'designer_pages'
      })
      setPreviewResult(result)
      setPreviewErrors([])
      setStatusMessage(`Preview ready: ${result.row_count} rows.`)
    } catch (error) {
      const message = error.message || 'Preview failed'
      setStatusMessage(message)
      setPreviewErrors(error.details?.errors || [message])

      setPreviewResult({ valid: false, row_count: 0, source_profile: 'designer_pages', sample_rows: [] })
    } finally {
      setLoading(false)
    }
  }

  const handleModeChange = (mode) => {
    setImportMode(mode)
    setCreateResult(null)
    setStatusMessage('')
  }

  const goToStep = (step) => {
    if (step === '2') {
      setSearchParams({ step: '2' })
      return
    }

    setSearchParams({})
  }

  const handleGoToStep2 = () => {
    if (!canProceedToStep2) return
    setStep2View('existing')
    handleModeChange('add_existing')
    goToStep('2')
  }

  const handleCreatePackage = async () => {
    if (!canCreate || !selectedFile) return

    setLoading(true)
    setStatusMessage('Creating bid package...')

    try {
      const result = await createBidPackage({
        projectId: selectedProjectId,
        name: packageName,
        sourceFilename: selectedFile.name,
        csvContent,
        sourceProfile: 'designer_pages',
        visibility,
        activeGeneralFields,
        instructions,
        customQuestions: customQuestions.filter((question) => String(question.label || '').trim())
      })
      setCreateResult(result)
      setStatusMessage(`Bid package ${result.bid_package.id} created with ${result.imported_items_count} items.`)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToExistingPackage = async () => {
    if (!canAddToExisting || !selectedFile) return

    setLoading(true)
    setStatusMessage('Adding rows to existing bid package...')

    try {
      const result = await importRowsToBidPackage({
        bidPackageId: selectedExistingPackageId,
        sourceFilename: selectedFile.name,
        csvContent,
        sourceProfile: 'designer_pages'
      })
      setCreateResult(result)
      setStatusMessage(`Added ${result.imported_items_count} items to package #${result.bid_package.id}.`)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stack">
      {currentStep === '1' ? (
        <div className="import-step-shell">
          <SectionCard className="section-card-flat">
            <div className="import-step2-modal">
              <h3 className="import-step2-title">Import Specs to Bid Package</h3>

              <label className="dropzone">
                <input type="file" accept=".csv,text/csv" onChange={handleFilePick} style={{ display: 'none' }} />
                {selectedFile ? `Selected: ${selectedFile.name}` : 'Choose CSV file'}
              </label>

              <div className="action-row" style={{ marginBottom: '0.75rem' }}>
                <button className="btn" onClick={handlePreview} disabled={!canPreview || loading}>Preview Products</button>
                <button className="btn btn-primary" onClick={handleGoToStep2} disabled={!canProceedToStep2 || loading}>
                  Next
                </button>
              </div>

              {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
              {previewErrors.length > 0 ? (
                <div className="error-box">
                  <strong>Validation Errors</strong>
                  <ul>
                    {previewErrors.slice(0, 25).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Preview Rows">
            <table className="table">
              <thead>
                <tr>
                  <th>Code/Tag</th>
                  <th>Product</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th>Qty/UOM</th>
                </tr>
              </thead>
              <tbody>
                {(previewResult?.sample_rows || []).map((row, index) => (
                  <tr key={`${row.spec_item_id || row.sku || 'row'}-${index}`}>
                    <td>{row.sku || '—'}</td>
                    <td>{row.product_name || '—'}</td>
                    <td>{row.manufacturer || '—'}</td>
                    <td>{row.category || '—'}</td>
                    <td>
                      {row.quantity || '—'} {row.uom || ''}
                    </td>
                  </tr>
                ))}
                {(previewResult?.sample_rows || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted">Run preview to view parsed rows.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </SectionCard>
        </div>
      ) : (
        <div className="import-step-shell">
          <SectionCard className="section-card-flat">
            {!canProceedToStep2 ? (
              <>
                <p className="text-muted">No preview is available yet. Go back to Step 1 and preview products first.</p>
                <div className="action-row">
                  <button type="button" className="btn" onClick={() => goToStep('1')}>Back to Step 1</button>
                </div>
              </>
            ) : (
              <>
                <div className="import-step2-modal">
                <button
                  type="button"
                  className="import-step2-close"
                  onClick={() => goToStep('1')}
                  aria-label="Close and go back"
                >
                  ×
                </button>

                {step2View === 'existing' ? (
                  <>
                    <h3 className="import-step2-title">Add to Bid Package</h3>

                    <div className="form-grid import-step2-form-grid">
                      <label>
                        Add to existing Bid Package
                        <select
                          value={selectedExistingPackageId}
                          onChange={(event) => setSelectedExistingPackageId(event.target.value)}
                          disabled={!selectedProjectId || filteredExistingPackages.length === 0}
                        >
                          {filteredExistingPackages.length === 0 ? <option value="">No bid packages for this project</option> : null}
                          {filteredExistingPackages.map((pkg) => (
                            <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <p className="import-step2-switch-copy">
                      Or{' '}
                      <button
                        type="button"
                        className="import-step2-switch"
                        onClick={() => {
                          setStep2View('create_new')
                          handleModeChange('create_new')
                        }}
                      >
                        Create New Bid Package
                      </button>
                    </p>

                    <div className="action-row import-step2-actions">
                      <button className="btn btn-primary import-step2-primary" onClick={handleAddToExistingPackage} disabled={!canAddToExisting || loading}>
                        Add to Bid Package
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="import-step2-title">Create New Bid Package</h3>
                    <p className="text-muted import-step2-subtitle">
                      We&apos;ll create a bid package based on the <strong>{previewResult?.row_count || 0} specs</strong> you&apos;ve selected in this project.
                    </p>

                    <div className="form-grid import-step2-form-grid import-step2-create-top-fields">
                      <label>
                        Package Name
                        <input value={packageName} onChange={(event) => setPackageName(event.target.value)} placeholder="e.g. BlueBird HQ - Phase 1 Bid" />
                      </label>
                      <label className="import-private-switch">
                        <span>Private</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={visibility === 'private'}
                          className={`import-private-switch-toggle ${visibility === 'private' ? 'is-on' : ''}`}
                          onClick={() => setVisibility((prev) => (prev === 'private' ? 'public' : 'private'))}
                        >
                          <span className="import-private-switch-thumb" />
                        </button>
                      </label>
                    </div>

                    <div className="import-step2-pricing-group">
                      <p className="text-muted import-step2-pricing-title" style={{ margin: 0 }}>General Pricing Fields</p>
                      <div className="checkbox-grid import-step2-checkbox-grid">
                        {GENERAL_PRICING_FIELDS.map((field) => (
                          <label key={field.key} className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={activeGeneralFields.includes(field.key)}
                              onChange={(event) => {
                                setActiveGeneralFields((prev) => {
                                  if (event.target.checked) return [...prev, field.key]
                                  return prev.filter((key) => key !== field.key)
                                })
                              }}
                            />
                            {field.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="form-grid import-step2-form-grid">
                      <label>
                        Instructions
                        <textarea
                          value={instructions}
                          onChange={(event) => setInstructions(event.target.value)}
                          rows={3}
                          placeholder="Optional bidder instructions..."
                        />
                      </label>
                    </div>

                    <div className="import-step2-pricing-group">
                      <div className="package-list-custom-head">
                        <p className="text-muted import-step2-pricing-title" style={{ margin: 0 }}>Custom Questions</p>
                      </div>
                      {customQuestions.length === 0 ? (
                        <p className="text-muted" style={{ marginTop: '0.45rem' }}>Add package-level bidder questions such as purchasing network or contract vehicle.</p>
                      ) : (
                        <div className="package-questions-editor">
                          {customQuestions.map((question, index) => (
                            <div key={question.id} className="package-question-editor-row">
                              <span className="package-question-editor-index">{index + 1}</span>
                              <input
                                type="text"
                                value={question.label}
                                placeholder="What purchasing network are you utilizing?"
                                onChange={(event) => {
                                  const nextLabel = event.target.value
                                  setCustomQuestions((prev) => prev.map((entry) => (
                                    entry.id === question.id ? { ...entry, label: nextLabel } : entry
                                  )))
                                }}
                              />
                              <button
                                type="button"
                                className="package-question-editor-remove"
                                onClick={() => setCustomQuestions((prev) => prev.filter((entry) => entry.id !== question.id))}
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
                        onClick={() => setCustomQuestions((prev) => [...prev, createQuestionDraft()])}
                        disabled={loading}
                      >
                        + Add Question
                      </button>
                    </div>

                    <div className="action-row import-step2-actions">
                      <button className="btn btn-primary import-step2-primary" onClick={handleCreatePackage} disabled={!canCreate || loading}>
                        Create Bid Package
                      </button>
                    </div>
                  </>
                )}
                </div>

                {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
                {createResult ? (
                  <p className="text-muted">Updated Package #{createResult.bid_package.id}</p>
                ) : null}
              </>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  )
}
