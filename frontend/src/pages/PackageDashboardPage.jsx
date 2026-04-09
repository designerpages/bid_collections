import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import ComparisonPage from './ComparisonPage'
import lockIcon from '../assets/bidders-icons/lock.svg'
import linkIcon from '../assets/bidders-icons/link.svg'
import emailIcon from '../assets/bidders-icons/email.svg'
import reopenIcon from '../assets/bidders-icons/reopen.svg'
import plusBidderIcon from '../assets/bidders-icons/plus-bidder.svg'
import {
  activateSpecItemComponentRequirement,
  API_BASE_URL,
  approveSpecItemRequirement,
  clearCurrentAwardApprovals,
  clearBidPackageAward,
  clearAwardRows,
  createSpecItemApprovalComponent,
  createInvite,
  createBidPackagePostAwardUpload,
  deactivateSpecItemComponentRequirement,
  bidPackagePostAwardUploadsBundleUrl,
  deleteSpecItemApprovalComponent,
  deleteBidPackagePostAwardUpload,
  updateBidPackagePostAwardUpload,
  deactivateSpecItem,
  deleteInvite,
  disableInvite,
  enableInvite,
  markSpecItemRequirementNeedsFix,
  reactivateSpecItem,
  unapproveSpecItemRequirement,
  deleteBidPackage,
  fetchBidPackageDashboard,
  fetchBidPackages,
  fetchInviteHistory,
  recloseInviteBid,
  reopenInviteBid,
  updateBidPackage,
  updateSpecItemApprovalComponent,
  updateInvitePassword
} from '../lib/api'
import {
  buildInvitePayloadFromVendor,
  buildVendorDirectory,
  createLocalVendorRecord,
  findVendorByEmail,
  loadCustomVendorRecords,
  storeCustomVendorRecords
} from '../lib/vendorDirectory'

const GENERAL_PRICING_FIELDS = [
  { key: 'delivery_amount', label: 'Shipping' },
  { key: 'install_amount', label: 'Install' },
  { key: 'escalation_amount', label: 'Escalation' },
  { key: 'contingency_amount', label: 'Contingency' },
  { key: 'sales_tax_amount', label: 'Sales Tax' }
]
const EDIT_GENERAL_FIELD_ORDER = [
  'sales_tax_amount',
  'delivery_amount',
  'install_amount',
  'escalation_amount',
  'contingency_amount'
]
const DASHBOARD_SELECTED_PACKAGE_KEY = 'bid_collections.dashboard.selected_bid_package_id'
const DASHBOARD_LOADED_PACKAGE_KEY = 'bid_collections.dashboard.loaded_bid_package_id'
const DASHBOARD_LINE_ITEMS_VIEW_KEY_PREFIX = 'bid_collections.dashboard.line_items_view.'
const DASHBOARD_SKIP_TO_APPROVALS_KEY_PREFIX = 'bid_collections.dashboard.skip_to_approvals.'
const DASHBOARD_PACKAGE_SETTINGS_KEY_PREFIX = 'bid_collections.dashboard.package_settings.'
const DASHBOARD_SNAPSHOT_KEY_PREFIX = 'bid_collections.dashboard.snapshot.'
const COMPARISON_STATE_KEY_PREFIX = 'bid_collections.comparison.state.'

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function winnerStatusMeta(winnerStatus) {
  if (winnerStatus === 'sole_winner') return { label: 'Sole Winner', toneClass: 'status-tone-awarded' }
  if (winnerStatus === 'partial_winner') return { label: 'Partial Winner', toneClass: 'status-tone-awarded' }
  return null
}

function statusMeta(status) {
  if (status === 'submitted') return { label: 'Submitted', toneClass: 'state-good' }
  if (status === 'in_progress') return { label: 'In Progress', toneClass: 'state-warn' }
  if (status === 'not_started') return { label: 'No Activity', toneClass: 'state-bad' }
  return { label: 'No Activity', toneClass: 'state-bad' }
}

function accessMeta(accessState) {
  if (accessState === 'disabled') return { label: 'Disabled', toneClass: 'state-bad' }
  return { label: 'Enabled', toneClass: 'state-good' }
}

function formatTimestamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatShortDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function formatCompactDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const day = date.toLocaleDateString('en-CA')
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${day} ${time}`
}

function formatHistoryDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function compactHistoryMoney(value) {
  const n = numberOrNull(value)
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function normalizeFileToken(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildDownloadFileName({ codeTag, fileName, requirementLabel, includeRequirementTag, includeCodeTag }) {
  const base = String(fileName || 'download')
  const normalizedCode = includeCodeTag ? normalizeFileToken(codeTag) : ''
  const normalizedRequirement = includeRequirementTag ? normalizeFileToken(requirementLabel) : ''
  const dotIndex = base.lastIndexOf('.')
  const name = dotIndex > 0 ? base.slice(0, dotIndex) : base
  const ext = dotIndex > 0 ? base.slice(dotIndex) : ''
  const parts = [normalizedCode, normalizedRequirement, name].filter(Boolean)
  if (parts.length === 0) return base
  return `${parts.join('_')}${ext}`
}

function fileNameWithRequirementTag(fileName, requirementLabel, codeTag, includeRequirementTag, includeCodeTag) {
  return buildDownloadFileName({
    codeTag,
    fileName,
    requirementLabel,
    includeRequirementTag,
    includeCodeTag
  })
}

function vendorDisplayName(value, email) {
  if (email) return String(email).trim()
  if (!value) return '—'
  const parts = String(value).split(' - ')
  return parts[0]?.trim() || String(value)
}

function numberOrNull(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function money(value) {
  const n = numberOrNull(value)
  return n == null ? '—' : `$${usdFormatter.format(n)}`
}

function compactMoney(value) {
  const n = numberOrNull(value)
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${Number((n / 1_000_000).toFixed(1))}MM`
  if (abs >= 1_000) return `$${Number((n / 1_000).toFixed(1))}K`
  return `$${n.toFixed(2)}`
}

function proposedTotalLabel(row) {
  const minTotal = numberOrNull(row?.min_total_amount)
  const maxTotal = numberOrNull(row?.max_total_amount)
  if (minTotal != null && maxTotal != null) {
    const minLabel = compactMoney(minTotal)
    const maxLabel = compactMoney(maxTotal)
    if (Math.abs(maxTotal - minTotal) < 0.005 || minLabel === maxLabel) return minLabel
    return `${minLabel}-${maxLabel}`
  }

  return compactMoney(row?.latest_total_amount)
}

function totalDisplayMeta(row, { showAwardedTotals = false } = {}) {
  const proposedLabel = proposedTotalLabel(row)
  if (!showAwardedTotals || Number(row?.awarded_row_count || 0) <= 0) {
    return { primary: proposedLabel, secondary: null }
  }

  const awardedAmount = numberOrNull(row?.awarded_total_amount)
  const fallbackAwardedAmount = numberOrNull(row?.awarded_amount_snapshot)
  const awardedLabel = compactMoney(awardedAmount != null ? awardedAmount : fallbackAwardedAmount)
  return {
    primary: `${awardedLabel} / ${proposedLabel}`,
    secondary: 'Awarded / Proposed'
  }
}

function normalizeCustomQuestions(value) {
  return Array.isArray(value)
    ? value.filter((question) => String(question?.id || '').trim() && String(question?.label || '').trim())
    : []
}

function loadStoredValue(key) {
  try {
    return window.localStorage.getItem(key) || ''
  } catch (_error) {
    return ''
  }
}

function storeValue(key, value) {
  try {
    if (value) window.localStorage.setItem(key, String(value))
    else window.localStorage.removeItem(key)
  } catch (_error) {
    // no-op when localStorage is unavailable
  }
}

function lineItemsViewStorageKey(bidPackageId) {
  return `${DASHBOARD_LINE_ITEMS_VIEW_KEY_PREFIX}${bidPackageId}`
}

function approvalsOnlyStorageKey(bidPackageId) {
  return `${DASHBOARD_SKIP_TO_APPROVALS_KEY_PREFIX}${bidPackageId}`
}

function packageSettingsStorageKey(bidPackageId) {
  return `${DASHBOARD_PACKAGE_SETTINGS_KEY_PREFIX}${bidPackageId}`
}

function loadCachedPackageSettings(bidPackageId) {
  if (!bidPackageId) return null
  try {
    const raw = window.localStorage.getItem(packageSettingsStorageKey(bidPackageId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_error) {
    return null
  }
}

function storeCachedPackageSettings(bidPackageId, settings) {
  if (!bidPackageId) return
  try {
    if (settings && typeof settings === 'object') {
      window.localStorage.setItem(packageSettingsStorageKey(bidPackageId), JSON.stringify(settings))
    } else {
      window.localStorage.removeItem(packageSettingsStorageKey(bidPackageId))
    }
  } catch (_error) {
    // ignore storage failures
  }
}

function dashboardSnapshotStorageKey(bidPackageId) {
  return `${DASHBOARD_SNAPSHOT_KEY_PREFIX}${bidPackageId}`
}

function comparisonStateStorageKey(bidPackageId) {
  return `${COMPARISON_STATE_KEY_PREFIX}${bidPackageId}`
}

function loadStoredComparisonExcludedIds(bidPackageId) {
  if (!bidPackageId) return []
  try {
    const raw = window.localStorage.getItem(comparisonStateStorageKey(bidPackageId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.excludedSpecItemIds) ? parsed.excludedSpecItemIds.map((id) => String(id)) : []
  } catch (_error) {
    return []
  }
}

function loadCachedDashboardSnapshot(bidPackageId) {
  if (!bidPackageId) return null
  try {
    const raw = window.localStorage.getItem(dashboardSnapshotStorageKey(bidPackageId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_error) {
    return null
  }
}

function storeCachedDashboardSnapshot(bidPackageId, snapshot) {
  if (!bidPackageId) return
  try {
    if (snapshot && typeof snapshot === 'object') {
      window.localStorage.setItem(dashboardSnapshotStorageKey(bidPackageId), JSON.stringify(snapshot))
    } else {
      window.localStorage.removeItem(dashboardSnapshotStorageKey(bidPackageId))
    }
  } catch (_error) {
    // ignore storage failures
  }
}

function loadLineItemsViewPreferences(bidPackageId) {
  const defaults = { showProductColumn: true, showBrandColumn: true, showQtyColumn: true }
  if (!bidPackageId) return defaults
  try {
    const raw = window.localStorage.getItem(lineItemsViewStorageKey(bidPackageId))
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      showProductColumn: typeof parsed?.showProductColumn === 'boolean' ? parsed.showProductColumn : defaults.showProductColumn,
      showBrandColumn: typeof parsed?.showBrandColumn === 'boolean' ? parsed.showBrandColumn : defaults.showBrandColumn,
      showQtyColumn: typeof parsed?.showQtyColumn === 'boolean' ? parsed.showQtyColumn : defaults.showQtyColumn
    }
  } catch (_error) {
    return defaults
  }
}

function storeLineItemsViewPreferences(bidPackageId, prefs) {
  if (!bidPackageId) return
  try {
    window.localStorage.setItem(lineItemsViewStorageKey(bidPackageId), JSON.stringify({
      showProductColumn: Boolean(prefs?.showProductColumn),
      showBrandColumn: Boolean(prefs?.showBrandColumn),
      showQtyColumn: Boolean(prefs?.showQtyColumn)
    }))
  } catch (_error) {
    // no-op when localStorage is unavailable
  }
}

export default function PackageDashboardPage() {
  const navigate = useNavigate()
  const { bidPackageId: routeBidPackageId = '' } = useParams()
  const normalizedRouteBidPackageId = routeBidPackageId ? String(routeBidPackageId) : ''
  const initialBidPackageId = normalizedRouteBidPackageId || loadStoredValue(DASHBOARD_SELECTED_PACKAGE_KEY)
  const initialCachedPackageSettings = loadCachedPackageSettings(initialBidPackageId)
  const initialDashboardSnapshot = loadCachedDashboardSnapshot(initialBidPackageId)
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState(() => (
    initialBidPackageId
  ))
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [restoredLoadedBidPackageId, setRestoredLoadedBidPackageId] = useState(() => loadStoredValue(DASHBOARD_LOADED_PACKAGE_KEY))
  const [rows, setRows] = useState(() => Array.isArray(initialDashboardSnapshot?.rows) ? initialDashboardSnapshot.rows : [])
  const [specItems, setSpecItems] = useState(() => Array.isArray(initialDashboardSnapshot?.specItems) ? initialDashboardSnapshot.specItems : [])
  const [requiredApprovalColumns, setRequiredApprovalColumns] = useState(() => Array.isArray(initialDashboardSnapshot?.requiredApprovalColumns) ? initialDashboardSnapshot.requiredApprovalColumns : [])
  const [currentAwardedBidId, setCurrentAwardedBidId] = useState(() => initialDashboardSnapshot?.currentAwardedBidId ?? null)
  const [generalUploads, setGeneralUploads] = useState(() => Array.isArray(initialDashboardSnapshot?.generalUploads) ? initialDashboardSnapshot.generalUploads : [])
  const [dashboardResolvedPackageId, setDashboardResolvedPackageId] = useState(() => (
    initialDashboardSnapshot && initialBidPackageId ? String(initialBidPackageId) : ''
  ))
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [excludedAwardRowIds, setExcludedAwardRowIds] = useState(() => loadStoredComparisonExcludedIds(initialBidPackageId))
  const [copiedInviteId, setCopiedInviteId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyData, setHistoryData] = useState(null)
  const [historyView, setHistoryView] = useState(null)
  const [historyInviteId, setHistoryInviteId] = useState(null)
  const [activeLineItemFilesModal, setActiveLineItemFilesModal] = useState(null)
  const [lineItemUploadFile, setLineItemUploadFile] = useState(null)
  const [lineItemUploadRequirementKey, setLineItemUploadRequirementKey] = useState('')
  const [lineItemFilterRequirementKey, setLineItemFilterRequirementKey] = useState('all')
  const [lineItemDownloadIncludeTag, setLineItemDownloadIncludeTag] = useState(false)
  const [lineItemDownloadIncludeCode, setLineItemDownloadIncludeCode] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const toastTimeoutRef = useRef(null)
  const [lineItemBulkDownloading, setLineItemBulkDownloading] = useState(false)
  const [lineItemSavingTagUploadId, setLineItemSavingTagUploadId] = useState(null)
  const [clearAwardModal, setClearAwardModal] = useState(null)
  const [clearBidderAwardsModal, setClearBidderAwardsModal] = useState(null)
  const [bidderQuestionsModal, setBidderQuestionsModal] = useState(null)
  const [deleteBidderModal, setDeleteBidderModal] = useState(null)
  const [editingPasswordInviteId, setEditingPasswordInviteId] = useState(null)
  const [passwordEditDraft, setPasswordEditDraft] = useState('')
  const [savingPasswordInviteId, setSavingPasswordInviteId] = useState(null)
  const [loadedPackageSettings, setLoadedPackageSettings] = useState(() => initialCachedPackageSettings)
  const [packageNameDraft, setPackageNameDraft] = useState('')
  const [visibilityDraft, setVisibilityDraft] = useState('private')
  const [instructionsDraft, setInstructionsDraft] = useState('')
  const [activeGeneralFieldsDraft, setActiveGeneralFieldsDraft] = useState(GENERAL_PRICING_FIELDS.map((field) => field.key))
  const [customQuestionsDraft, setCustomQuestionsDraft] = useState([])
  const [editingBidPackage, setEditingBidPackage] = useState(false)
  const [showProductColumn, setShowProductColumn] = useState(true)
  const [showBrandColumn, setShowBrandColumn] = useState(true)
  const [showQtyColumn, setShowQtyColumn] = useState(true)
  const [lineItemsSort, setLineItemsSort] = useState('code_tag')
  const [lineItemsPendingSnapshot, setLineItemsPendingSnapshot] = useState({})
  const [lineItemsPage, setLineItemsPage] = useState(1)
  const [lineItemsPerPage, setLineItemsPerPage] = useState(50)
  const [comparisonVisibleInviteIds, setComparisonVisibleInviteIds] = useState([])
  const [biddersSort, setBiddersSort] = useState('created')
  const [showAllAwardedBidders, setShowAllAwardedBidders] = useState(false)
  const [liveAwardSummary, setLiveAwardSummary] = useState(null)
  const [comparisonReloadToken, setComparisonReloadToken] = useState(0)
  const [bidderStatusBusyInviteId, setBidderStatusBusyInviteId] = useState(null)
  const [approvalsOnlyMode, setApprovalsOnlyMode] = useState(() => (
    initialBidPackageId &&
    !initialCachedPackageSettings?.awarded_bid_id &&
    Array.isArray(initialDashboardSnapshot?.rows) &&
    initialDashboardSnapshot.rows.length > 0 &&
    loadStoredValue(approvalsOnlyStorageKey(initialBidPackageId)) === '1'
  ))

  const [selectedVendorKey, setSelectedVendorKey] = useState('')
  const [customVendorRecords, setCustomVendorRecords] = useState(() => loadCustomVendorRecords())
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false)
  const [showCreateVendorPanel, setShowCreateVendorPanel] = useState(false)
  const [createVendorStep, setCreateVendorStep] = useState('email')
  const [createVendorDraft, setCreateVendorDraft] = useState({
    email: '',
    name: '',
    phone: '',
    inviteToHub: true
  })
  const [invitePassword, setInvitePassword] = useState('')
  const [showAddBidderForm, setShowAddBidderForm] = useState(false)
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false)
  const vendorPickerRef = useRef(null)

  const loadBidPackages = async (preserveSelectedId = true) => {
    setLoadingPackages(true)
    try {
      const data = await fetchBidPackages()
      const list = data.bid_packages || []
      setBidPackages(list)

      if (list.length === 0) {
        setSelectedBidPackageId('')
        setLoadedBidPackageId('')
        setRestoredLoadedBidPackageId('')
        setRows([])
        setSpecItems([])
        setLoadedPackageSettings(null)
        setRequiredApprovalColumns([])
        setCurrentAwardedBidId(null)
        setGeneralUploads([])
        storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, '')
        storeValue(DASHBOARD_LOADED_PACKAGE_KEY, '')
        storeCachedDashboardSnapshot(initialBidPackageId, null)
        return
      }

      const preferredId = normalizedRouteBidPackageId || selectedBidPackageId || loadStoredValue(DASHBOARD_SELECTED_PACKAGE_KEY)
      const routePackageExists = normalizedRouteBidPackageId
        ? list.some((item) => String(item.id) === String(normalizedRouteBidPackageId))
        : false

      if (preserveSelectedId) {
        const hasSelected = preferredId && list.some((item) => String(item.id) === String(preferredId))
        if (hasSelected) {
          if (String(selectedBidPackageId) !== String(preferredId)) {
            setSelectedBidPackageId(String(preferredId))
          }
          return
        }
      }

      if (normalizedRouteBidPackageId && !routePackageExists) {
        setStatusMessage('Bid package not found.')
        navigate('/package', { replace: true })
        return
      }

      const fallbackId = String(list[0].id)
      setSelectedBidPackageId(fallbackId)
      storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, fallbackId)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoadingPackages(false)
    }
  }

  useEffect(() => {
    loadBidPackages(false)
  }, [])

  useEffect(() => {
    if (!normalizedRouteBidPackageId) return
    if (String(selectedBidPackageId) === normalizedRouteBidPackageId) return
    setSelectedBidPackageId(normalizedRouteBidPackageId)
  }, [normalizedRouteBidPackageId, selectedBidPackageId])

  useEffect(() => {
    if (!normalizedRouteBidPackageId) return
    if (String(loadedBidPackageId) === normalizedRouteBidPackageId) return
    loadDashboard({ bidPackageId: normalizedRouteBidPackageId, silent: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedRouteBidPackageId, loadedBidPackageId])

  const activePackageId = normalizedRouteBidPackageId || selectedBidPackageId || loadedBidPackageId
  const loadedPackageLabel = useMemo(() => {
    if (!activePackageId) return ''
    const match = bidPackages.find((item) => String(item.id) === String(activePackageId))
    if (!match) return normalizedRouteBidPackageId ? '' : `Bid Package ID: ${activePackageId}`
    const projectName = match.project_name || 'Unknown Project'
    const projectId = match.project_id ?? '—'
    return `${match.name} in ${projectName} (Bid Package ID: ${match.id}, Project ID: ${projectId})`
  }, [activePackageId, bidPackages, normalizedRouteBidPackageId])
  const loadedPackageRecord = useMemo(
    () => bidPackages.find((item) => String(item.id) === String(activePackageId)) || null,
    [activePackageId, bidPackages]
  )
  const packageHeaderTitle = useMemo(() => {
    const packageName = loadedPackageRecord?.name || loadedPackageSettings?.name || ''
    if (packageName) return packageName
    if (normalizedRouteBidPackageId) return ''
    return loadedPackageLabel || 'Bid Package'
  }, [loadedPackageLabel, loadedPackageRecord, loadedPackageSettings, normalizedRouteBidPackageId])

  const loadDashboard = async ({ closeEdit = true, bidPackageId = '', silent = false } = {}) => {
    const targetBidPackageId = String(bidPackageId || selectedBidPackageId || '')
    if (!targetBidPackageId) return

    if (!silent) setLoading(true)
    setSelectedBidPackageId(targetBidPackageId)
    if (String(loadedBidPackageId || '') !== targetBidPackageId) {
      const cachedSnapshot = loadCachedDashboardSnapshot(targetBidPackageId)
      setRows(Array.isArray(cachedSnapshot?.rows) ? cachedSnapshot.rows : [])
      setSpecItems(Array.isArray(cachedSnapshot?.specItems) ? cachedSnapshot.specItems : [])
      setRequiredApprovalColumns(Array.isArray(cachedSnapshot?.requiredApprovalColumns) ? cachedSnapshot.requiredApprovalColumns : [])
      setCurrentAwardedBidId(cachedSnapshot?.currentAwardedBidId ?? null)
      setGeneralUploads(Array.isArray(cachedSnapshot?.generalUploads) ? cachedSnapshot.generalUploads : [])
      setLoadedPackageSettings(loadCachedPackageSettings(targetBidPackageId))
      setExcludedAwardRowIds(loadStoredComparisonExcludedIds(targetBidPackageId))
      setDashboardResolvedPackageId(cachedSnapshot ? targetBidPackageId : '')
    }
    try {
      const data = await fetchBidPackageDashboard(targetBidPackageId)
      const viewPrefs = loadLineItemsViewPreferences(targetBidPackageId)
      const invites = data.invites || []
      const activeSpecItems = data.spec_items || []
      const bidPackage = data.bid_package || null
      setRows(invites)
      setSpecItems(activeSpecItems)
      setLineItemsPage(1)
      setRequiredApprovalColumns(data.required_approval_columns || [])
      setCurrentAwardedBidId(data.current_awarded_bid_id ?? null)
      setGeneralUploads(data.general_uploads || [])
      setLoadedPackageSettings(bidPackage)
      storeCachedPackageSettings(targetBidPackageId, bidPackage)
      storeCachedDashboardSnapshot(targetBidPackageId, {
        rows: invites,
        specItems: activeSpecItems,
        requiredApprovalColumns: data.required_approval_columns || [],
        currentAwardedBidId: data.current_awarded_bid_id ?? null,
        generalUploads: data.general_uploads || []
      })
      setPackageNameDraft(bidPackage?.name || '')
      setVisibilityDraft(bidPackage?.visibility || 'private')
      setInstructionsDraft(bidPackage?.instructions || '')
      setActiveGeneralFieldsDraft(bidPackage?.active_general_fields || GENERAL_PRICING_FIELDS.map((field) => field.key))
      setCustomQuestionsDraft(normalizeCustomQuestions(bidPackage?.custom_questions))
      setShowProductColumn(viewPrefs.showProductColumn)
      setShowBrandColumn(viewPrefs.showBrandColumn)
      setShowQtyColumn(viewPrefs.showQtyColumn)
      if (closeEdit) setEditingBidPackage(false)
      setLoadedBidPackageId(targetBidPackageId)
      setDashboardResolvedPackageId(targetBidPackageId)
      storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, targetBidPackageId)
      storeValue(DASHBOARD_LOADED_PACKAGE_KEY, targetBidPackageId)
      setRestoredLoadedBidPackageId(targetBidPackageId)
      setExcludedAwardRowIds(loadStoredComparisonExcludedIds(targetBidPackageId))
      setShowAllAwardedBidders(false)
      setHistoryView(null)
      setHistoryInviteId(null)
      const isApprovalsOnlyStored = loadStoredValue(approvalsOnlyStorageKey(targetBidPackageId)) === '1'
      setApprovalsOnlyMode(
        (bidPackage?.package_award_status || 'not_awarded') !== 'fully_awarded' &&
        invites.length > 0 &&
        isApprovalsOnlyStored
      )
      setStatusMessage('')
    } catch (error) {
      setStatusMessage(error.message)
      setRows([])
      setSpecItems([])
      setRequiredApprovalColumns([])
      setCurrentAwardedBidId(null)
      setGeneralUploads([])
      setDashboardResolvedPackageId(targetBidPackageId)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const addInvite = async () => {
    const invitePayload = buildInvitePayloadFromVendor(selectedVendorRecord)
    if (!loadedBidPackageId || !invitePayload.dealerName || !invitePassword) return

    setLoading(true)
    try {
      if (loadedBidPackageId) {
        storeValue(approvalsOnlyStorageKey(loadedBidPackageId), '')
      }
      setApprovalsOnlyMode(false)
      await createInvite({
        bidPackageId: loadedBidPackageId,
        dealerName: invitePayload.dealerName,
        dealerEmail: invitePayload.dealerEmail,
        password: invitePassword
      })
      setSelectedVendorKey('')
      setInvitePassword('')
      setShowAddBidderForm(false)
      setStatusMessage('')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const vendorOptions = useMemo(() => buildVendorDirectory(customVendorRecords), [customVendorRecords])

  useEffect(() => {
    storeCustomVendorRecords(customVendorRecords)
  }, [customVendorRecords])

  const onVendorChange = (value) => {
    setSelectedVendorKey(value)
    setVendorPickerOpen(false)
    setShowCreateVendorPanel(false)
  }

  const selectedVendorOption = vendorOptions.find((option) => option.key === selectedVendorKey) || null
  const selectedVendorRecord = selectedVendorOption || null

  const createVendorAndSelect = () => {
    const email = String(createVendorDraft.email || '').trim()
    const name = String(createVendorDraft.name || '').trim()
    const phone = String(createVendorDraft.phone || '').trim()
    if (!email) {
      setStatusMessage('Vendor email is required.')
      return
    }

    const normalizedEmail = email.toLowerCase()
    const vendorRecord = createLocalVendorRecord({
      email: normalizedEmail,
      name,
      phone,
      inviteToHub: createVendorDraft.inviteToHub
    })

    setCustomVendorRecords((prev) => {
      const withoutMatch = prev.filter((item) => item.id !== vendorRecord.id)
      return [vendorRecord, ...withoutMatch]
    })
    setSelectedVendorKey(vendorRecord.key)
    setShowCreateVendorPanel(false)
    setCreateVendorStep('email')
    setVendorPickerOpen(false)
    setCreateVendorDraft({
      email: '',
      name: '',
      phone: '',
      inviteToHub: true
    })
  }

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!(event.target instanceof Element)) return
      if (vendorPickerRef.current?.contains(event.target)) return
      setVendorPickerOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const copyInviteLink = async (row) => {
    const absoluteUrl = `${window.location.origin}${row.invite_url}`
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      setCopiedInviteId(row.invite_id)
      setStatusMessage('Invite link copied.')
      setTimeout(() => setCopiedInviteId(null), 1200)
    } catch (_error) {
      setStatusMessage('Unable to copy link in this browser.')
    }
  }

  const copyPublicUrl = async () => {
    const relativeUrl = loadedPackageSettings?.public_url
    if (!relativeUrl) return
    const absoluteUrl = `${window.location.origin}${relativeUrl}`
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      setCopiedPublicUrl(true)
      setTimeout(() => setCopiedPublicUrl(false), 1200)
      setToastMessage('Public URL copied.')
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = setTimeout(() => setToastMessage(''), 2600)
    } catch (_error) {
      setStatusMessage('Unable to copy URL in this browser.')
    }
  }

  const emailInvite = (row) => {
    const to = row.dealer_email || ''
    const subject = `Bid Invitation: ${loadedPackageLabel || 'Bid Package'}`
    const absoluteUrl = `${window.location.origin}${row.invite_url}`
    const knownPassword = row.invite_password || ''
    if (!knownPassword) {
      setStatusMessage('No password found for this invite. Use the password edit icon first.')
      return
    }
    const passwordLine = `Password: ${knownPassword}`
    const body = [
      `Hi ${row.dealer_name || 'there'},`,
      '',
      'You are invited to submit pricing for this bid package.',
      '',
      `Bid Link: ${absoluteUrl}`,
      passwordLine,
      '',
      'Please use the link above to unlock and submit your bid.',
      '',
      'Thank you.'
    ].join('\n')

    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
  }

  const editInvitePassword = async (row, nextPassword) => {
    if (!loadedBidPackageId) return
    const inviteId = row.invite_id
    const newPassword = String(nextPassword ?? '').trim()
    if (!newPassword) {
      setStatusMessage('Password cannot be blank.')
      return
    }

    setLoading(true)
    setSavingPasswordInviteId(inviteId)
    setStatusMessage('Updating password...')
    try {
      await updateInvitePassword({
        bidPackageId: loadedBidPackageId,
        inviteId,
        password: newPassword
      })
      setStatusMessage('Password updated.')
      setRows((prev) =>
        prev.map((invite) => (
          invite.invite_id === inviteId ? { ...invite, invite_password: newPassword } : invite
        ))
      )
      setEditingPasswordInviteId((prev) => (prev === inviteId ? null : prev))
      setPasswordEditDraft('')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
      setSavingPasswordInviteId(null)
    }
  }

  const openHistory = async (inviteId) => {
    if (!loadedBidPackageId) return
    if (historyOpen && String(historyInviteId) === String(inviteId)) {
      setHistoryOpen(false)
      return
    }

    setHistoryInviteId(inviteId)
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryData(null)
    try {
      const data = await fetchInviteHistory({ bidPackageId: loadedBidPackageId, inviteId })
      setHistoryData(data)
    } catch (error) {
      setStatusMessage(error.message)
      setHistoryOpen(false)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (!historyOpen) return

    const handlePointerDown = (event) => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest('.bidder-history-popover') || event.target.closest('.bidder-version-trigger')) return
      setHistoryOpen(false)
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') setHistoryOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [historyOpen])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  const enterHistoryView = (version) => {
    const submittedAt = version?.submitted_at ? new Date(version.submitted_at) : null
    const isValidDate = submittedAt && !Number.isNaN(submittedAt.getTime())
    setHistoryView({
      bidderId: Number(historyInviteId) || 0,
      version: Number(version?.version_number) || 0,
      dealerName: vendorDisplayName(String(historyData?.dealer_name || 'Unknown Vendor'), historyData?.dealer_email),
      dealerEmail: historyData?.dealer_email || '',
      date: isValidDate ? submittedAt.toLocaleDateString() : '—',
      time: isValidDate ? submittedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'
    })
    setHistoryOpen(false)
  }

  const reopenBid = async (inviteId) => {
    if (!loadedBidPackageId) return

    setBidderStatusBusyInviteId(String(inviteId))
    try {
      await reopenInviteBid({ bidPackageId: loadedBidPackageId, inviteId, reason: '' })
      await loadDashboard({ silent: true })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setBidderStatusBusyInviteId(null)
    }
  }

  const recloseBid = async (row) => {
    if (!loadedBidPackageId) return

    setBidderStatusBusyInviteId(String(row.invite_id))
    try {
      await recloseInviteBid({ bidPackageId: loadedBidPackageId, inviteId: row.invite_id })
      await loadDashboard({ silent: true })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setBidderStatusBusyInviteId(null)
    }
  }

  const removeBidPackage = async () => {
    if (!selectedBidPackageId) return

    const selectedPackage = bidPackages.find((pkg) => String(pkg.id) === String(selectedBidPackageId))
    const label = selectedPackage
      ? `${selectedPackage.name} in ${selectedPackage.project_name || 'Unknown Project'} (Bid Package ID: ${selectedPackage.id}, Project ID: ${selectedPackage.project_id ?? '—'})`
      : `Bid Package ID: ${selectedBidPackageId}`
    const confirmed = window.confirm(`Delete bid package ${label}?\n\nThis permanently removes its invites, bids, and line items.`)
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting bid package...')
    try {
      await deleteBidPackage(selectedBidPackageId)
      setStatusMessage('Bid package deleted.')
      setLoadedBidPackageId((prev) => (String(prev) === String(selectedBidPackageId) ? '' : prev))
      if (String(loadedBidPackageId) === String(selectedBidPackageId)) {
        setRows([])
        setSpecItems([])
      }
      await loadBidPackages(false)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const saveBidPackageSettings = async () => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Saving bid package settings...')
    try {
      await updateBidPackage({
        bidPackageId: loadedBidPackageId,
        name: packageNameDraft.trim(),
        visibility: visibilityDraft,
        activeGeneralFields: activeGeneralFieldsDraft,
        instructions: instructionsDraft,
        customQuestions: customQuestionsDraft
      })
      setStatusMessage('Bid package settings saved.')
      await loadBidPackages(false)
      await loadDashboard()
      setEditingBidPackage(false)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const removeSpecItem = async (item) => {
    if (!loadedBidPackageId) return

    const confirmed = window.confirm(
      `Deactivate ${item.code_tag || item.id} in this bid package?\n\nThis hides it from bidder and comparison views.`
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deactivating line item in bid package...')
    try {
      await deactivateSpecItem({ bidPackageId: loadedBidPackageId, specItemId: item.id })
      setStatusMessage('Line item deactivated in bid package.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const reactivateItem = async (item) => {
    if (!loadedBidPackageId) return

    setLoading(true)
    setStatusMessage('Re-activating line item...')
    try {
      await reactivateSpecItem({ bidPackageId: loadedBidPackageId, specItemId: item.id })
      setStatusMessage('Line item re-activated.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const approveRequirement = async (item, requirementKey, componentId = null) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    try {
      await approveSpecItemRequirement({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        requirementKey,
        componentId
      })
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const unapproveRequirement = async (item, requirementKey, actionType = 'unapproved', componentId = null) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    try {
      await unapproveSpecItemRequirement({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        requirementKey,
        componentId,
        actionType
      })
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const markRequirementNeedsFix = async (item, requirementKey, componentId = null) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    try {
      await markSpecItemRequirementNeedsFix({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        requirementKey,
        componentId
      })
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const createApprovalComponent = async (item) => {
    if (!loadedBidPackageId) return
    try {
      const result = await createSpecItemApprovalComponent({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id
      })
      const createdComponent = result?.component
      if (createdComponent && createdComponent.id != null) {
        setSpecItems((prev) => prev.map((specItem) => {
          if (String(specItem.id) !== String(item.id)) return specItem
          const current = Array.isArray(specItem.approval_components) ? specItem.approval_components : []
          if (current.some((component) => String(component.id) === String(createdComponent.id))) {
            return specItem
          }
          const nextComponents = [...current, createdComponent].sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0))
          return {
            ...specItem,
            approval_components: nextComponents
          }
        }))
      }
      await loadDashboard({ closeEdit: false, silent: true })
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const renameApprovalComponent = async (item, componentId, label) => {
    if (!loadedBidPackageId) return
    const trimmed = String(label || '').trim()
    if (!trimmed) {
      setStatusMessage('Sub-row label cannot be blank.')
      return
    }
    setLoading(true)
    setStatusMessage('Saving sub-row label...')
    try {
      await updateSpecItemApprovalComponent({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        componentId,
        label: trimmed
      })
      setStatusMessage('Sub-row label saved.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const removeApprovalComponent = async (item, componentId) => {
    if (!loadedBidPackageId) return
    try {
      await deleteSpecItemApprovalComponent({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        componentId
      })
      setSpecItems((prev) => prev.map((specItem) => {
        if (String(specItem.id) !== String(item.id)) return specItem
        const current = Array.isArray(specItem.approval_components) ? specItem.approval_components : []
        return {
          ...specItem,
          approval_components: current.filter((component) => String(component.id) !== String(componentId))
        }
      }))
      await loadDashboard({ closeEdit: false, silent: true })
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const activateApprovalComponentRequirement = async (item, componentId, requirementKey) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Activating sub-row approval...')
    try {
      await activateSpecItemComponentRequirement({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        componentId,
        requirementKey
      })
      setStatusMessage('Sub-row approval activated.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const deactivateApprovalComponentRequirement = async (item, componentId, requirementKey) => {
    if (!loadedBidPackageId) return
    try {
      await deactivateSpecItemComponentRequirement({
        bidPackageId: loadedBidPackageId,
        specItemId: item.id,
        componentId,
        requirementKey
      })
      await loadDashboard({ closeEdit: false, silent: true })
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const uploadLineItemFile = async (file) => {
    if (!loadedBidPackageId || !activeLineItemFilesModal?.specItemId || !file) return
    setLoading(true)
    setStatusMessage('Uploading file...')
    try {
      const result = await createBidPackagePostAwardUpload(loadedBidPackageId, {
        file,
        fileName: file.name,
        specItemId: activeLineItemFilesModal.specItemId,
        requirementKey: lineItemUploadRequirementKey || undefined
      })
      const upload = result?.upload
      if (upload) {
        setActiveLineItemFilesModal((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            uploads: [upload, ...(prev.uploads || [])]
          }
        })
      }
      setLineItemUploadFile(null)
      setLineItemUploadRequirementKey('')
      setStatusMessage('File uploaded.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const downloadSingleLineItemFile = async (upload) => {
    if (!upload?.download_url) return
    const requirementLabel = upload.requirement_key ? (activeModalRequirementLabelByKey[upload.requirement_key] || upload.requirement_key) : ''
    const targetFileName = fileNameWithRequirementTag(
      upload.file_name || 'download',
      requirementLabel,
      activeLineItemFilesModal?.codeTag || '',
      lineItemDownloadIncludeTag,
      lineItemDownloadIncludeCode
    )

    const response = await fetch(`${API_BASE_URL}${upload.download_url}`, { credentials: 'include' })
    if (!response.ok) throw new Error(`Download failed (${response.status})`)
    const blob = await response.blob()
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = targetFileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(objectUrl)
  }

  const downloadAllLineItemFiles = async () => {
    const downloadableUploads = filteredActiveModalUploads.filter((upload) => Boolean(upload?.download_url))
    if (downloadableUploads.length === 0) return

    setLineItemBulkDownloading(true)
    try {
      const url = bidPackagePostAwardUploadsBundleUrl(loadedBidPackageId, {
        uploadIds: downloadableUploads.map((upload) => upload.id),
        includeTag: lineItemDownloadIncludeTag,
        includeCode: lineItemDownloadIncludeCode
      })
      window.open(url, '_blank', 'noopener,noreferrer')
      setStatusMessage(`Preparing ZIP for ${downloadableUploads.length} file${downloadableUploads.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setStatusMessage(error.message || 'Unable to download all files.')
    } finally {
      setLineItemBulkDownloading(false)
    }
  }

  const deleteLineItemFile = async (upload) => {
    if (!loadedBidPackageId || !upload?.id) return
    if (upload?.uploader_role !== 'designer') return
    const confirmed = window.confirm('Delete this designer-uploaded file?')
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting file...')
    try {
      await deleteBidPackagePostAwardUpload(loadedBidPackageId, upload.id)
      setActiveLineItemFilesModal((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          uploads: (prev.uploads || []).filter((item) => item.id !== upload.id)
        }
      })
      setStatusMessage('File deleted.')
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const updateLineItemUploadRequirement = async (upload, requirementKey) => {
    if (!loadedBidPackageId || !upload?.id) return
    setLineItemSavingTagUploadId(upload.id)
    try {
      const result = await updateBidPackagePostAwardUpload(loadedBidPackageId, upload.id, { requirementKey })
      const updatedUpload = result?.upload
      setActiveLineItemFilesModal((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          uploads: (prev.uploads || []).map((item) => (
            item.id === upload.id
              ? { ...item, ...(updatedUpload || {}), requirement_key: (updatedUpload?.requirement_key ?? requirementKey) || null }
              : item
          ))
        }
      })
      setStatusMessage('File tag updated.')
    } catch (error) {
      setStatusMessage(error.message || 'Unable to update requirement tag.')
    } finally {
      setLineItemSavingTagUploadId(null)
    }
  }

  const clearApprovalsForCurrentVendor = async () => {
    if (!loadedBidPackageId || !postAwardActive) return
    const confirmed = window.confirm(
      'Clear all approval cells for the currently awarded vendor?\n\nThis will not affect approvals for other vendors.'
    )
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Clearing current vendor approvals...')
    try {
      const result = await clearCurrentAwardApprovals({ bidPackageId: loadedBidPackageId })
      setStatusMessage(`Cleared ${result.deleted_count || 0} approvals for current vendor.`)
      await loadDashboard({ closeEdit: false })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const disableBidder = async (inviteId) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Disabling bidder...')
    try {
      await disableInvite({ bidPackageId: loadedBidPackageId, inviteId })
      setStatusMessage('Bidder disabled.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const enableBidder = async (inviteId) => {
    if (!loadedBidPackageId) return
    setLoading(true)
    setStatusMessage('Enabling bidder...')
    try {
      await enableInvite({ bidPackageId: loadedBidPackageId, inviteId })
      setStatusMessage('Bidder enabled.')
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteBidderRow = async (row) => {
    if (!loadedBidPackageId) return

    setLoading(true)
    setStatusMessage('Deleting bidder and bid...')
    try {
      await deleteInvite({ bidPackageId: loadedBidPackageId, inviteId: row.invite_id })
      setStatusMessage('Bidder and bid deleted.')
      setDeleteBidderModal(null)
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const openClearAwardModal = (row) => {
    if (!loadedBidPackageId || !postAwardActive) return
    setClearAwardModal({
      dealerName: vendorDisplayName(row?.dealer_name, row?.dealer_email)
    })
  }

  const clearAwardForPackage = async () => {
    if (!loadedBidPackageId || !postAwardActive) return

    setLoading(true)
    setStatusMessage('Removing award...')
    try {
      await clearBidPackageAward({ bidPackageId: loadedBidPackageId })
      setStatusMessage('Award removed.')
      setClearAwardModal(null)
      await loadDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const clearBidderAwardRows = async (row) => {
    if (!loadedBidPackageId || !row?.bid_id || Number(row.awarded_row_count || 0) <= 0) return

    const dealerName = vendorDisplayName(row?.dealer_name, row?.dealer_email)
    const selectedSpecItemIds = (specItems || [])
      .filter((item) => String(item.awarded_bid_id || '') === String(row.bid_id))
      .map((item) => item.id)
    setClearBidderAwardsModal({
      bidId: row.bid_id,
      dealerName,
      rowCount: selectedSpecItemIds.length,
      selectedSpecItemIds
    })
  }

  const confirmClearBidderAwardRows = async () => {
    if (!loadedBidPackageId || !clearBidderAwardsModal?.bidId) return

    const dealerName = clearBidderAwardsModal.dealerName
    const bidderBidId = clearBidderAwardsModal.bidId
    const selectedSpecItemIds = Array.isArray(clearBidderAwardsModal.selectedSpecItemIds)
      ? clearBidderAwardsModal.selectedSpecItemIds
      : []
    const rowCount = selectedSpecItemIds.length
    if (rowCount === 0) {
      setStatusMessage('Select at least one awarded row to remove.')
      return
    }

    setLoading(true)
    setStatusMessage(`Removing awarded rows from ${dealerName}...`)
    try {
      const result = await clearAwardRows({ bidPackageId: loadedBidPackageId, specItemIds: selectedSpecItemIds })
      const clearedIdSet = new Set(selectedSpecItemIds.map((id) => String(id)))
      setSpecItems((prev) => prev.map((item) => (
        clearedIdSet.has(String(item.id))
          ? { ...item, awarded_bid_id: null, awarded_invite_id: null }
          : item
      )))
      setRows((prev) => prev.map((row) => {
        if (String(row.bid_id || '') !== String(bidderBidId)) return row
        const nextAwardedRowCount = Math.max(0, Number(row.awarded_row_count || 0) - rowCount)
        const nextWinnerStatus = nextAwardedRowCount === 0
          ? null
          : nextAwardedRowCount >= Math.max(1, Number(result?.eligible_row_count || 0))
            ? 'sole_winner'
            : 'partial_winner'
        return {
          ...row,
          awarded_row_count: nextAwardedRowCount,
          awarded_total_amount: null,
          winner_status: nextWinnerStatus
        }
      }))
      setLoadedPackageSettings((prev) => (
        prev
          ? {
              ...prev,
              awarded_bid_id: result?.awarded_bid_id ?? null,
              awarded_at: result?.awarded_at ?? null,
              package_award_status: result?.package_award_status || prev.package_award_status,
              awarded_row_count: Number(result?.awarded_row_count || 0),
              eligible_row_count: Number(result?.eligible_row_count || prev.eligible_row_count || 0),
              award_winner_scope: result?.award_winner_scope || prev.award_winner_scope
            }
          : prev
      ))
      setLiveAwardSummary({
        packageAwardStatus: result?.package_award_status || 'not_awarded',
        awardedRowCount: Number(result?.awarded_row_count || 0),
        eligibleRowCount: Number(result?.eligible_row_count || 0),
        awardWinnerScope: result?.award_winner_scope || 'none'
      })
      setComparisonReloadToken((prev) => prev + 1)
      setStatusMessage(`Removed ${rowCount} awarded row${rowCount === 1 ? '' : 's'} from ${dealerName}.`)
      setClearBidderAwardsModal(null)
      await loadDashboard({ closeEdit: false, silent: true })
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const enableApprovalsOnlyMode = () => {
    if (!loadedBidPackageId) return
    storeValue(approvalsOnlyStorageKey(loadedBidPackageId), '1')
    setApprovalsOnlyMode(true)
  }

  const disableApprovalsOnlyMode = () => {
    if (!loadedBidPackageId) return
    storeValue(approvalsOnlyStorageKey(loadedBidPackageId), '')
    setApprovalsOnlyMode(false)
  }

  const inviteBiddersFromApprovals = () => {
    disableApprovalsOnlyMode()
    setShowAddBidderForm(false)
  }

  useEffect(() => {
    if (!selectedBidPackageId) return
    storeValue(DASHBOARD_SELECTED_PACKAGE_KEY, selectedBidPackageId)
  }, [selectedBidPackageId])

  useEffect(() => {
    if (!activePackageId) return
    const cachedSnapshot = loadCachedDashboardSnapshot(activePackageId)
    if (cachedSnapshot && String(loadedBidPackageId || '') !== String(activePackageId)) {
      setRows(Array.isArray(cachedSnapshot.rows) ? cachedSnapshot.rows : [])
      setSpecItems(Array.isArray(cachedSnapshot.specItems) ? cachedSnapshot.specItems : [])
      setRequiredApprovalColumns(Array.isArray(cachedSnapshot.requiredApprovalColumns) ? cachedSnapshot.requiredApprovalColumns : [])
      setCurrentAwardedBidId(cachedSnapshot.currentAwardedBidId ?? null)
      setGeneralUploads(Array.isArray(cachedSnapshot.generalUploads) ? cachedSnapshot.generalUploads : [])
    }
    const cached = loadCachedPackageSettings(activePackageId)
    if (!cached) return
    if (String(loadedBidPackageId || '') === String(activePackageId) && loadedPackageSettings) return
    setLoadedPackageSettings(cached)
  }, [activePackageId, loadedBidPackageId, loadedPackageSettings])

  useEffect(() => {
    if (!activePackageId) return
    const cached = loadCachedPackageSettings(activePackageId)
    const cachedSnapshot = loadCachedDashboardSnapshot(activePackageId)
    const hasCachedBidders = Array.isArray(cachedSnapshot?.rows) && cachedSnapshot.rows.length > 0
    const storedApprovalsOnly = loadStoredValue(approvalsOnlyStorageKey(activePackageId)) === '1'
    if (cached?.awarded_bid_id) {
      if (approvalsOnlyMode) setApprovalsOnlyMode(false)
      return
    }
    setApprovalsOnlyMode(storedApprovalsOnly && hasCachedBidders)
  }, [activePackageId])

  useEffect(() => {
    if (!loadedBidPackageId) return
    storeLineItemsViewPreferences(String(loadedBidPackageId), {
      showProductColumn,
      showBrandColumn,
      showQtyColumn
    })
  }, [loadedBidPackageId, showProductColumn, showBrandColumn, showQtyColumn])

  useEffect(() => {
    if (!restoredLoadedBidPackageId) return
    if (normalizedRouteBidPackageId) return
    if (loadedBidPackageId) return
    if (!selectedBidPackageId) return
    if (String(selectedBidPackageId) !== String(restoredLoadedBidPackageId)) return
    if (loadingPackages) return

    loadDashboard({ silent: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredLoadedBidPackageId, normalizedRouteBidPackageId, selectedBidPackageId, loadingPackages, loadedBidPackageId])

  const packageAwardStatus = loadedPackageSettings?.package_award_status || 'not_awarded'
  const awardWinnerScope = loadedPackageSettings?.award_winner_scope || 'none'
  const excludedAwardRowIdSet = useMemo(
    () => new Set((excludedAwardRowIds || []).map((id) => String(id))),
    [excludedAwardRowIds]
  )
  const inScopeSpecItems = useMemo(
    () => (specItems || []).filter((item) => !excludedAwardRowIdSet.has(String(item.id))),
    [specItems, excludedAwardRowIdSet]
  )
  const inScopeEligibleRowCount = inScopeSpecItems.length
  const inScopeAwardedItems = useMemo(
    () => inScopeSpecItems.filter((item) => item.awarded_bid_id != null),
    [inScopeSpecItems]
  )
  const inScopeAwardedRowCount = inScopeAwardedItems.length
  const inScopeAwardCountsByBidId = useMemo(
    () => inScopeAwardedItems.reduce((acc, item) => {
      const key = String(item.awarded_bid_id)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    [inScopeAwardedItems]
  )
  const inScopeWinnerBidIds = Object.keys(inScopeAwardCountsByBidId)
  const localPackageAwardStatus = inScopeEligibleRowCount === 0
    ? 'not_awarded'
    : inScopeAwardedRowCount === 0
      ? 'not_awarded'
      : inScopeAwardedRowCount >= inScopeEligibleRowCount
        ? 'fully_awarded'
        : 'partially_awarded'
  const localAwardWinnerScope = inScopeWinnerBidIds.length === 0
    ? 'none'
    : inScopeAwardedRowCount >= inScopeEligibleRowCount && inScopeWinnerBidIds.length === 1
      ? 'single_winner'
      : inScopeWinnerBidIds.length > 1
        ? 'multiple_winners'
        : 'single_winner'
  const effectivePackageAwardStatus = liveAwardSummary?.packageAwardStatus || localPackageAwardStatus
  const effectiveAwardWinnerScope = liveAwardSummary?.awardWinnerScope || localAwardWinnerScope
  const rowAwardingActive = localPackageAwardStatus !== 'not_awarded'
  const packageFullyAwarded = effectivePackageAwardStatus === 'fully_awarded'
  const soleWinnerActive = effectiveAwardWinnerScope === 'single_winner' && packageFullyAwarded
  const postAwardActive = Boolean(loadedPackageSettings?.awarded_bid_id)
  const approvalTrackingActive = Boolean(packageFullyAwarded || approvalsOnlyMode)
  const currentResolvedPackageId = normalizedRouteBidPackageId || selectedBidPackageId || loadedBidPackageId
  const dashboardResolvedForActivePackage = Boolean(
    currentResolvedPackageId &&
    String(dashboardResolvedPackageId || '') === String(currentResolvedPackageId)
  )
  const showEmptyBiddersState = !approvalTrackingActive && !approvalsOnlyMode && dashboardResolvedForActivePackage && rows.length === 0
  const visibilityIsPublic = loadedPackageSettings?.visibility === 'public' && Boolean(loadedPackageSettings?.public_url)
  const visibleInviteRows = useMemo(() => {
    if (!rowAwardingActive || showAllAwardedBidders) return rows
    if (soleWinnerActive) return rows.filter((row) => Number(row.awarded_row_count || 0) > 0)
    if (!packageFullyAwarded) return rows
    return rows.filter((row) => Number(row.awarded_row_count || 0) > 0)
  }, [rows, rowAwardingActive, soleWinnerActive, packageFullyAwarded, showAllAwardedBidders])
  const sortedInviteRows = useMemo(() => {
    const list = [...visibleInviteRows]
    const indexByInviteId = new Map(visibleInviteRows.map((row, index) => [String(row.invite_id), index]))
    const createdOrderSort = (a, b) => {
      const ai = indexByInviteId.get(String(a.invite_id)) ?? 0
      const bi = indexByInviteId.get(String(b.invite_id)) ?? 0
      return ai - bi
    }
    const bidderTotalForSort = (row) => {
      const minTotal = numberOrNull(row.min_total_amount)
      if (minTotal != null) return minTotal
      return numberOrNull(row.latest_total_amount)
    }
    const statusRankForSort = (row) => {
      if (row.status === 'submitted') return 0
      if (row.status === 'in_progress') return 1
      if (row.status === 'not_started') return 2
      return 3
    }

    if (biddersSort === 'vendor_asc') {
      return list.sort((a, b) => (
        String(vendorDisplayName(a.dealer_name, a.dealer_email)).localeCompare(String(vendorDisplayName(b.dealer_name, b.dealer_email)), undefined, { sensitivity: 'base' })
      ))
    }
    if (biddersSort === 'status') {
      return list.sort((a, b) => {
        const rankCmp = statusRankForSort(a) - statusRankForSort(b)
        if (rankCmp !== 0) return rankCmp
        return createdOrderSort(a, b)
      })
    }
    if (biddersSort === 'total_low_high') {
      return list.sort((a, b) => {
        const av = bidderTotalForSort(a)
        const bv = bidderTotalForSort(b)
        if (av == null && bv == null) return createdOrderSort(a, b)
        if (av == null) return 1
        if (bv == null) return -1
        if (av !== bv) return av - bv
        return createdOrderSort(a, b)
      })
    }
    if (biddersSort === 'total_high_low') {
      return list.sort((a, b) => {
        const av = bidderTotalForSort(a)
        const bv = bidderTotalForSort(b)
        if (av == null && bv == null) return createdOrderSort(a, b)
        if (av == null) return 1
        if (bv == null) return -1
        if (av !== bv) return bv - av
        return createdOrderSort(a, b)
      })
    }

    return list.sort(createdOrderSort)
  }, [visibleInviteRows, biddersSort])
  const comparisonVisibleInviteIdSet = useMemo(
    () => new Set((comparisonVisibleInviteIds || []).map((id) => String(id))),
    [comparisonVisibleInviteIds]
  )
  useEffect(() => {
    if (approvalTrackingActive) {
      setComparisonVisibleInviteIds([])
      return
    }

    const inviteIds = sortedInviteRows.map((row) => row.invite_id)
    setComparisonVisibleInviteIds((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return inviteIds
      const prevSet = new Set(prev.map((id) => String(id)))
      const retained = inviteIds.filter((id) => prevSet.has(String(id)))
      const added = inviteIds.filter((id) => !prevSet.has(String(id)))
      const merged = [...retained, ...added]
      return merged.length > 0 ? merged : inviteIds
    })
  }, [sortedInviteRows, approvalTrackingActive, loadedBidPackageId])
  const lineItemsActionColumnCount = approvalTrackingActive ? 0 : 1
  const lineItemsBaseColumnCount = 1 + (showProductColumn ? 1 : 0) + (showBrandColumn ? 1 : 0) + (showQtyColumn ? 1 : 0) + lineItemsActionColumnCount
  const lineItemsExtraColumnCount = approvalTrackingActive ? (requiredApprovalColumns.length + 1) : 0
  const normalizedLineItemsPerPage = Number.isFinite(Number(lineItemsPerPage)) ? Number(lineItemsPerPage) : 50
  const pendingApprovalsCount = (item) => (item.required_approvals || []).reduce((count, requirement) => (
    requirement.applies && !requirement.approved ? count + 1 : count
  ), 0)
  const buildPendingSnapshot = (items) => (items || []).reduce((acc, item) => {
    acc[item.id] = pendingApprovalsCount(item)
    return acc
  }, {})
  const refreshLineItemsSort = () => setLineItemsPendingSnapshot(buildPendingSnapshot(specItems))
  const sortedSpecItems = useMemo(() => {
    const list = [...(approvalTrackingActive ? inScopeSpecItems : specItems)]
    const codeTagSort = (a, b) => String(a.code_tag || '').localeCompare(String(b.code_tag || ''), undefined, { numeric: true, sensitivity: 'base' })
    const snapshotPendingFor = (item) => (
      Object.prototype.hasOwnProperty.call(lineItemsPendingSnapshot, item.id)
        ? lineItemsPendingSnapshot[item.id]
        : pendingApprovalsCount(item)
    )

    if (!approvalTrackingActive || lineItemsSort === 'code_tag') {
      return list.sort(codeTagSort)
    }

    if (lineItemsSort === 'pending_desc') {
      return list.sort((a, b) => {
        const cmp = snapshotPendingFor(b) - snapshotPendingFor(a)
        return cmp !== 0 ? cmp : codeTagSort(a, b)
      })
    }

    if (lineItemsSort === 'pending_asc') {
      return list.sort((a, b) => {
        const cmp = snapshotPendingFor(a) - snapshotPendingFor(b)
        return cmp !== 0 ? cmp : codeTagSort(a, b)
      })
    }

    return list.sort(codeTagSort)
  }, [specItems, inScopeSpecItems, approvalTrackingActive, lineItemsSort, lineItemsPendingSnapshot])
  const totalLineItemsPages = Math.max(Math.ceil(sortedSpecItems.length / normalizedLineItemsPerPage), 1)
  const lineItemsRangeStart = sortedSpecItems.length === 0 ? 0 : ((lineItemsPage - 1) * normalizedLineItemsPerPage) + 1
  const lineItemsRangeEnd = Math.min(lineItemsPage * normalizedLineItemsPerPage, sortedSpecItems.length)
  const lineItemsSectionTitle = loadedBidPackageId
    ? `Line Items (${lineItemsRangeStart}-${lineItemsRangeEnd} of ${sortedSpecItems.length})`
    : 'Line Items In Package'
  const biddersSectionTitle = `Bidders (${visibleInviteRows.length})`
  const clearBidderAwardItems = useMemo(() => {
    if (!clearBidderAwardsModal?.bidId) return []
    return (specItems || [])
      .filter((item) => String(item.awarded_bid_id || '') === String(clearBidderAwardsModal.bidId))
      .map((item) => ({
        id: item.id,
        codeTag: item.code_tag || '—',
        productName: item.product_name || 'Untitled item',
        brandName: item.brand_name || '',
        quantity: item.quantity,
        uom: item.uom || ''
      }))
  }, [clearBidderAwardsModal, specItems])

  useEffect(() => {
    if (!clearBidderAwardsModal) return
    const availableIds = clearBidderAwardItems.map((item) => String(item.id))
    const currentIds = Array.isArray(clearBidderAwardsModal.selectedSpecItemIds)
      ? clearBidderAwardsModal.selectedSpecItemIds
      : []
    const nextSelected = currentIds.filter((id, index, arr) => (
      availableIds.includes(String(id)) && arr.findIndex((entry) => String(entry) === String(id)) === index
    ))
    if (
      nextSelected.length === currentIds.length &&
      Number(clearBidderAwardsModal.rowCount || 0) === nextSelected.length
    ) return
    setClearBidderAwardsModal((prev) => (
      prev
        ? {
            ...prev,
            selectedSpecItemIds: nextSelected,
            rowCount: nextSelected.length
          }
        : prev
    ))
  }, [clearBidderAwardsModal, clearBidderAwardItems])
  const renderVendorPicker = () => (
    <div className="vendor-picker" ref={vendorPickerRef}>
      <button
        type="button"
        className={`bidder-add-head-input bidder-add-head-select vendor-picker-trigger ${vendorPickerOpen ? 'is-open' : ''}`.trim()}
        onClick={() => {
          setVendorPickerOpen((prev) => !prev)
          setShowCreateVendorPanel(false)
        }}
        disabled={loading}
      >
        <span className={`vendor-picker-trigger-label ${selectedVendorOption ? 'has-value' : ''}`.trim()}>
          {selectedVendorOption ? (selectedVendorOption.email || selectedVendorOption.companyName) : 'Select Vendor'}
        </span>
      </button>
      {vendorPickerOpen ? (
        <div className="vendor-picker-panel">
          <button
            type="button"
            className="vendor-picker-create-btn"
            onClick={() => {
              setShowCreateVendorPanel(true)
              setCreateVendorStep('email')
              setVendorPickerOpen(false)
            }}
          >
            [+] Create New Vendor
          </button>
          <div className="vendor-picker-options">
            {vendorOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className="vendor-picker-option"
                onClick={() => onVendorChange(option.key)}
              >
                <span className="vendor-picker-option-primary">{option.email || option.companyName}</span>
                <span className="vendor-picker-option-secondary">
                  {option.contactName || option.email}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )

  const renderCreateVendorPanel = () => (
    <div className={`vendor-create-panel ${createVendorStep === 'full' ? 'is-full' : 'is-email-step'}`.trim()}>
      <div className="vendor-create-title">Create Vendor</div>
      {createVendorStep === 'email' ? (
        <div className="vendor-create-email-row">
          <input
            className="bidder-add-head-input vendor-create-input"
            type="email"
            value={createVendorDraft.email}
            placeholder="Add vendor email"
            onChange={(event) => setCreateVendorDraft((prev) => ({ ...prev, email: event.target.value }))}
          />
          <button
            type="button"
            className="btn vendor-create-next-btn"
            onClick={() => {
              const email = String(createVendorDraft.email || '').trim()
              if (!email) {
                setStatusMessage('Vendor email is required.')
                return
              }
              const normalizedEmail = email.toLowerCase()
              const existingOption = findVendorByEmail(vendorOptions, normalizedEmail)
              if (existingOption) {
                setSelectedVendorKey(existingOption.key)
                setShowCreateVendorPanel(false)
                setCreateVendorStep('email')
                setVendorPickerOpen(false)
                setCreateVendorDraft({
                  email: '',
                  name: '',
                  phone: '',
                  inviteToHub: true
                })
                setStatusMessage('Vendor email already exists. Loaded existing vendor.')
                return
              }
              setCreateVendorStep('full')
            }}
          >
            NEXT
          </button>
        </div>
      ) : (
        <>
          <div className="vendor-create-grid">
            <label>
              <span>Email</span>
              <input
                className="bidder-add-head-input vendor-create-input"
                type="email"
                value={createVendorDraft.email}
                placeholder="vendoremail@gmail.com"
                onChange={(event) => setCreateVendorDraft((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
            <label>
              <span>Name</span>
              <input
                className="bidder-add-head-input vendor-create-input"
                type="text"
                value={createVendorDraft.name}
                placeholder="Sean Penn"
                onChange={(event) => setCreateVendorDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                className="bidder-add-head-input vendor-create-input"
                type="text"
                value={createVendorDraft.phone}
                placeholder="123 1234 4221"
                onChange={(event) => setCreateVendorDraft((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
          </div>
          <div className="vendor-create-actions">
            <label className="vendor-create-toggle">
              <input
                type="checkbox"
                checked={createVendorDraft.inviteToHub}
                onChange={(event) => setCreateVendorDraft((prev) => ({ ...prev, inviteToHub: event.target.checked }))}
              />
              <span>Invite to Vendor Hub</span>
            </label>
            <button
              type="button"
              className="btn vendor-create-submit-btn"
              onClick={createVendorAndSelect}
            >
              CREATE VENDOR & ADD
            </button>
          </div>
        </>
      )}
    </div>
  )
  const requiredApprovalsBySpecItem = useMemo(
    () => Object.fromEntries(
      (specItems || []).map((item) => [String(item.id), item.required_approvals || []])
    ),
    [specItems]
  )
  const approvalComponentsBySpecItem = useMemo(
    () => Object.fromEntries(
      (specItems || []).map((item) => [String(item.id), item.approval_components || []])
    ),
    [specItems]
  )
  const initialComparisonRows = useMemo(() => (
    (specItems || []).map((item) => ({
      spec_item_id: item.id,
      sku: item.code_tag,
      product_name: item.product_name,
      manufacturer: item.brand_name,
      quantity: item.quantity,
      uom: item.uom,
      active: item.active,
      awarded_bid_id: item.awarded_bid_id,
      awarded_invite_id: item.awarded_invite_id,
      dealers: []
    }))
  ), [specItems])
  const lineItemUploadsBySpecItem = useMemo(
    () => Object.fromEntries(
      (specItems || []).map((item) => [String(item.id), item.uploads || []])
    ),
    [specItems]
  )
  const activeModalRequirementOptions = useMemo(() => (
    Array.isArray(activeLineItemFilesModal?.requirements)
      ? activeLineItemFilesModal.requirements
      : []
  ), [activeLineItemFilesModal])
  const activeModalRequirementLabelByKey = useMemo(() => (
    Object.fromEntries(activeModalRequirementOptions.map((option) => [option.key, option.label]))
  ), [activeModalRequirementOptions])
  const activeModalRetagOptions = useMemo(() => {
    const options = [...activeModalRequirementOptions]
    const seen = new Set(options.map((option) => String(option.key)))
    const uploads = Array.isArray(activeLineItemFilesModal?.uploads) ? activeLineItemFilesModal.uploads : []
    uploads.forEach((upload) => {
      const key = String(upload?.requirement_key || '').trim()
      if (!key || seen.has(key)) return
      seen.add(key)
      options.push({ key, label: activeModalRequirementLabelByKey[key] || key })
    })
    return options
  }, [activeLineItemFilesModal, activeModalRequirementLabelByKey, activeModalRequirementOptions])
  const filteredActiveModalUploads = useMemo(() => {
    const uploads = Array.isArray(activeLineItemFilesModal?.uploads) ? activeLineItemFilesModal.uploads : []
    if (lineItemFilterRequirementKey === 'all') return uploads
    if (lineItemFilterRequirementKey === 'untagged') return uploads.filter((upload) => !upload.requirement_key)
    return uploads.filter((upload) => String(upload.requirement_key || '') === String(lineItemFilterRequirementKey))
  }, [activeLineItemFilesModal, lineItemFilterRequirementKey])
  const noFilesInActiveModal = filteredActiveModalUploads.length === 0
  const paginatedSpecItems = sortedSpecItems.slice(
    (lineItemsPage - 1) * normalizedLineItemsPerPage,
    lineItemsPage * normalizedLineItemsPerPage
  )

  useEffect(() => {
    if (lineItemsPage > totalLineItemsPages) {
      setLineItemsPage(totalLineItemsPages)
    }
    if (lineItemsPage < 1) {
      setLineItemsPage(1)
    }
  }, [lineItemsPage, totalLineItemsPages])

  useEffect(() => {
    if (!approvalTrackingActive) {
      if (lineItemsSort !== 'code_tag') setLineItemsSort('code_tag')
      if (Object.keys(lineItemsPendingSnapshot).length > 0) setLineItemsPendingSnapshot({})
      return
    }
    if (showAddBidderForm) setShowAddBidderForm(false)
  }, [approvalTrackingActive, showAddBidderForm, lineItemsSort, lineItemsPendingSnapshot])

  useEffect(() => {
    if (!approvalTrackingActive) return
    if (lineItemsSort === 'code_tag') return
    setLineItemsPendingSnapshot(buildPendingSnapshot(specItems))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedBidPackageId, lineItemsSort, approvalTrackingActive])

  const packageCustomQuestions = useMemo(
    () => normalizeCustomQuestions(loadedPackageSettings?.custom_questions || loadedPackageRecord?.custom_questions || []),
    [loadedPackageRecord, loadedPackageSettings]
  )

  return (
    <div className="stack">
      <SectionCard className="section-card-flat package-detail-header-card">
        <button
          type="button"
          className="all-packages-back-link"
          onClick={() => navigate('/package')}
        >
          ‹ All Packages
        </button>
        <div className="package-detail-title-row">
          {visibilityIsPublic ? (
            <button
              type="button"
              className="package-visibility-icon-btn"
              onClick={copyPublicUrl}
              disabled={loading}
              title={copiedPublicUrl ? 'Copied public URL' : 'Copy public URL'}
              aria-label={copiedPublicUrl ? 'Public URL copied' : 'Copy public URL'}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          ) : (
            <span className="package-visibility-icon-static" aria-label="Private package" title="Private package">
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 13L13 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          )}
          <h1 className="package-detail-title">{packageHeaderTitle}</h1>
        </div>
        {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
      </SectionCard>

      {!(approvalsOnlyMode && !approvalTrackingActive) ? (
      <SectionCard className="section-card-flat bidders-flat">
        <div style={{ maxWidth: '985px' }}>
          <div className="bidders-head-row">
            <h2>{biddersSectionTitle}</h2>
            {!approvalTrackingActive && !approvalsOnlyMode && !showEmptyBiddersState ? (
              <div className="bidders-head-actions">
                <label className="bidders-sort-control">
                  <span className="bidders-sort-label">Sort By</span>
                  <select
                    className="bidders-sort-select"
                    value={biddersSort}
                    onChange={(event) => setBiddersSort(event.target.value)}
                    disabled={loading}
                  >
                    <option value="created">Created</option>
                    <option value="vendor_asc">Vendor Name</option>
                    <option value="total_low_high">Ascending</option>
                    <option value="total_high_low">Descending</option>
                  </select>
                </label>
              </div>
            ) : null}
            {!approvalTrackingActive && approvalsOnlyMode ? (
              <div className="bidders-head-actions">
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Approvals-only mode</span>
              </div>
            ) : null}
          </div>
          <table className="table data-table bidders-table">
            <thead>
              <tr>
                <th style={{ width: '200px' }} className="data-table-col-head">Vendor</th>
                <th style={{ width: '110px' }} className="data-table-col-head">Status</th>
                <th style={{ width: '110px' }} className="data-table-col-head">Questions</th>
                <th style={{ width: '240px' }} className="data-table-col-head">Bid Snapshot</th>
                <th style={{ width: '160px' }} className="data-table-col-head">Total</th>
                <th style={{ width: '60px', textAlign: 'right' }} className="data-table-col-head"></th>
              </tr>
            </thead>
            <tbody>
              {sortedInviteRows.map((row) => {
                const inScopeAwardedRowCountForBid = row.bid_id != null ? Number(inScopeAwardCountsByBidId[String(row.bid_id)] || 0) : 0
                const hasResolvedInScopeAwards = inScopeAwardedRowCount > 0
                const localWinnerStatus = inScopeAwardedRowCountForBid === 0
                  ? null
                  : inScopeEligibleRowCount > 0 && inScopeAwardedRowCountForBid === inScopeEligibleRowCount
                    ? 'sole_winner'
                    : 'partial_winner'
                const winnerMeta = winnerStatusMeta(localWinnerStatus)
                const isLoser = packageFullyAwarded && hasResolvedInScopeAwards && inScopeAwardedRowCountForBid === 0
                const isWinnerRow = inScopeAwardedRowCountForBid > 0
                const isNotStarted = row.status === 'not_started'
                const completionPct = Math.max(0, Math.min(100, Number(row.completion_pct ?? 0)))
                const isFullyComplete = completionPct >= 100
                const totalDisplay = totalDisplayMeta(row, { showAwardedTotals: rowAwardingActive })
                const isComparisonVisible = comparisonVisibleInviteIdSet.has(String(row.invite_id))
                const questionResponses = packageCustomQuestions.map((question) => {
                  const response = row.custom_question_responses?.[question.id]
                  return {
                    id: question.id,
                    label: question.label,
                    value: String(response || '').trim()
                  }
                })
                const answeredQuestionCount = questionResponses.filter((entry) => entry.value).length
                return (
                  <tr key={row.invite_id} className={isNotStarted ? 'bidder-row-muted' : ''}>
                    <td className="bidder-vendor-cell">
                      <div className="bidder-vendor-topline">
                        <span className="bidder-controls">
                          {!approvalTrackingActive ? (
                            <input
                              type="checkbox"
                              className="comparison-visibility-checkbox"
                              checked={isComparisonVisible}
                              onChange={(event) => {
                                const checked = event.target.checked
                                setComparisonVisibleInviteIds((prev) => {
                                  const current = Array.isArray(prev) ? prev : []
                                  if (checked) {
                                    return current.some((id) => String(id) === String(row.invite_id))
                                      ? current
                                      : [...current, row.invite_id]
                                  }
                                  const next = current.filter((id) => String(id) !== String(row.invite_id))
                                  return next
                                })
                              }}
                              disabled={loading}
                              title="Show/hide bidder in comparison table"
                              aria-label="Show/hide bidder in comparison table"
                            />
                          ) : null}
                          <button
                            type="button"
                            className="access-dot-btn"
                            onClick={() => {
                              if (row.access_state === 'enabled') disableBidder(row.invite_id)
                              else enableBidder(row.invite_id)
                            }}
                            disabled={loading}
                            title={row.access_state === 'enabled' ? 'Click to disable bidder access' : 'Click to enable bidder access'}
                            aria-label={row.access_state === 'enabled' ? 'Disable bidder access' : 'Enable bidder access'}
                            style={{ background: row.access_state === 'enabled' ? '#10b981' : '#ef4444' }}
                          />
                        </span>
                        <span className="bidder-vendor-name">{vendorDisplayName(row.dealer_name, row.dealer_email)}</span>
                      </div>
                      <div className="bidder-password-line">
                        <span className="bidder-controls-spacer" />
                        <span className="bidder-password-label">Password:</span>
                        {editingPasswordInviteId === row.invite_id ? (
                          <input
                            className="password-inline-input"
                            type="text"
                            value={passwordEditDraft}
                            onChange={(event) => setPasswordEditDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                editInvitePassword(row, passwordEditDraft)
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                setEditingPasswordInviteId(null)
                                setPasswordEditDraft('')
                              }
                            }}
                            autoFocus
                            disabled={savingPasswordInviteId === row.invite_id}
                          />
                        ) : (
                          <button
                            className="btn bidder-password-chip"
                            title="Click to change password"
                            onClick={() => {
                              setEditingPasswordInviteId(row.invite_id)
                              setPasswordEditDraft(row.invite_password || '')
                            }}
                            disabled={loading}
                          >
                            {row.invite_password || '—'}
                          </button>
                        )}
                        <button
                          className="btn bidder-inline-icon-btn"
                          title="Copy access link"
                          onClick={() => copyInviteLink(row)}
                          disabled={loading}
                        >
                          <img src={linkIcon} alt="" aria-hidden="true" />
                        </button>
                        <button
                          className="btn bidder-inline-icon-btn"
                          title="Email invitation"
                          onClick={() => emailInvite(row)}
                          disabled={loading}
                        >
                          <img src={emailIcon} alt="" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    <td className="bidder-status-column">
                      {isWinnerRow ? (
                        <div className="bidder-status-cell bidder-status-cell-awarded">
                          <span className="bidder-status-chip-awarded">{winnerMeta?.label || 'Sole Winner'}</span>
                          <button
                            type="button"
                            className="bidder-status-unaward-btn"
                            title={`Remove ${inScopeAwardedRowCountForBid || 0} awarded row${Number(inScopeAwardedRowCountForBid || 0) === 1 ? '' : 's'}`}
                            onClick={() => clearBidderAwardRows(row)}
                            disabled={loading}
                            aria-label={`Remove awarded rows for ${vendorDisplayName(row.dealer_name, row.dealer_email)}`}
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                      {!isWinnerRow && isLoser ? (
                        <div className="bidder-status-cell bidder-status-cell-awarded">
                          <span className="bidder-status-chip-lost">Lost</span>
                        </div>
                      ) : null}
                      {!isWinnerRow && !isLoser && row.status === 'submitted' ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-submitted">Submitted</span>
                          <button
                            type="button"
                            className="bidder-status-action"
                            title={row.can_reopen ? 'Click to reopen bid' : (row.reopen_block_reason || 'Cannot reopen this bid')}
                            onClick={() => {
                              if (!row.can_reopen) return
                              reopenBid(row.invite_id)
                            }}
                            disabled={loading || !row.can_reopen || bidderStatusBusyInviteId === String(row.invite_id)}
                          >
                            <img src={reopenIcon} alt="" aria-hidden="true" />
                            <span>Re-open</span>
                          </button>
                        </div>
                      ) : null}
                      {!approvalTrackingActive && row.status === 'in_progress' && row.current_version > 0 ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-warning">In progress</span>
                          <button
                            type="button"
                            className="bidder-status-action bidder-status-action-lock"
                            title="Click to lock bid"
                            onClick={() => recloseBid(row)}
                            disabled={loading || bidderStatusBusyInviteId === String(row.invite_id)}
                          >
                            <img src={lockIcon} alt="" aria-hidden="true" />
                            <span>Lock</span>
                          </button>
                        </div>
                      ) : null}
                      {!approvalTrackingActive && row.status === 'in_progress' && row.current_version === 0 ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-warning">In progress</span>
                        </div>
                      ) : null}
                      {!approvalTrackingActive && row.status === 'not_started' ? (
                        <div className="bidder-status-cell">
                          <span className="bidder-status-main status-tone-neutral">No Activity</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="bidder-questions-column">
                      {packageCustomQuestions.length > 0 ? (
                        <div className="bidder-questions-cell">
                          <span className="bidder-questions-count">
                            {`${answeredQuestionCount}/${packageCustomQuestions.length}`}
                          </span>
                          <button
                            type="button"
                            className="btn bidder-questions-view-btn"
                            title="View question responses"
                            onClick={() => {
                              setBidderQuestionsModal({
                                dealerName: vendorDisplayName(row.dealer_name, row.dealer_email),
                                answeredCount: answeredQuestionCount,
                                totalCount: packageCustomQuestions.length,
                                responses: questionResponses
                              })
                            }}
                            disabled={loading}
                            aria-label="View bidder question responses"
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                              <path
                                d="M8 2.1c-3.3 0-6 2.1-6 4.8 0 1.5.8 2.9 2.2 3.8l-.4 2.4 2.5-1.3c.5.1 1 .1 1.7.1 3.3 0 6-2.1 6-4.8s-2.7-5-6-5Z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path d="M5.3 6.9h5.4M5.3 8.9h3.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="bidder-questions-empty">—</span>
                      )}
                    </td>
                    <td className="bidder-snapshot-cell">
                      {isNotStarted ? (
                        <span className="bidder-snapshot-empty">Not Started</span>
                      ) : (
                        <>
                          <div className="bidder-progress-track">
                            <div
                              className={`bidder-progress-fill ${isFullyComplete ? 'is-complete' : 'is-active'}`}
                              style={{ width: `${Math.max(0, Math.min(100, Number(row.completion_pct ?? 0)))}%` }}
                            />
                          </div>
                          <div className="bidder-snapshot-meta">
                            <span className={isFullyComplete ? 'bidder-snapshot-pill is-complete' : 'bidder-snapshot-pill is-active'}>
                              {`${Math.round(completionPct)}% complete`}
                            </span>
                            {(row.bod_skipped_pct ?? 0) > 0 ? (
                              <span className="bidder-snapshot-pill is-skipped">
                                {`${Math.round(row.bod_skipped_pct ?? 0)}% BoD skipped`}
                              </span>
                            ) : null}
                          </div>
                          <div className="bidder-snapshot-breakdown">
                            {`${row.bod_only_count ?? 0} BoD • ${row.mixed_line_count ?? 0} BoD-Sub • ${row.sub_only_count ?? 0} Sub`}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="bidder-total-column">
                      <div className="bidder-total-main">
                        {totalDisplay.primary}
                      </div>
                      {totalDisplay.secondary ? <div className="bidder-total-subline">{totalDisplay.secondary}</div> : null}
                      {!isNotStarted && (row.submitted_at || row.last_saved_at) ? (
                        <div className="bidder-version-cell">
                          <div className="bidder-version-line">
                            <span className="bidder-version-date">
                              {formatCompactDateTime(row.submitted_at || row.last_saved_at)}
                            </span>
                            <button
                              type="button"
                              className="mini-link-btn bidder-total-sub bidder-version-trigger"
                              style={{ marginTop: 0 }}
                              onClick={() => openHistory(row.invite_id)}
                              disabled={loading}
                              title="View bid version history"
                              aria-expanded={historyOpen && String(historyInviteId) === String(row.invite_id)}
                            >
                              {`v${row.current_version || 0}`}
                            </button>
                          </div>
                          {historyOpen && String(historyInviteId) === String(row.invite_id) ? (
                            <div className="bidder-history-popover" role="dialog" aria-label="Bid Version History">
                              <div className="history-modal-head">
                                <h2>Bid Version History</h2>
                              </div>
                              {historyLoading ? <p className="text-muted">Loading history...</p> : null}
                              {!historyLoading && historyData ? (
                                <div className="history-version-list">
                                  {(historyData.versions || []).map((version) => {
                                    const isCurrent = Number(version.version_number) === Number(historyData.current_version)
                                    const itemCount = Number.isFinite(Number(version.line_items_count))
                                      ? Number(version.line_items_count)
                                        : Array.isArray(version.line_items)
                                        ? version.line_items.length
                                        : 0
                                    if (isCurrent) {
                                      return (
                                        <div key={version.id} className="history-version-item is-current">
                                          <div className="history-version-grid">
                                            <div className="history-version-top">
                                              <div className="history-version-label-wrap">
                                                <span className="history-version-label">v{version.version_number}</span>
                                                <span className="history-version-current-pill">Current</span>
                                              </div>
                                            </div>
                                            <div className="history-version-left">
                                              <div className="history-version-date">{formatHistoryDateTime(version.submitted_at)}</div>
                                              <div className="history-version-items">{`${itemCount} items`}</div>
                                            </div>
                                            <span className="history-version-total">{compactHistoryMoney(version.total_amount)}</span>
                                          </div>
                                      </div>
                                    )
                                  }

                                  return (
                                      <button
                                        key={version.id}
                                        type="button"
                                        className="history-version-item is-clickable"
                                        onClick={() => enterHistoryView(version)}
                                      >
                                        <div className="history-version-grid">
                                          <div className="history-version-top">
                                            <div className="history-version-label-wrap">
                                              <span className="history-version-label">v{version.version_number}</span>
                                            </div>
                                          </div>
                                          <div className="history-version-left">
                                            <div className="history-version-date">{formatHistoryDateTime(version.submitted_at)}</div>
                                            <div className="history-version-items">{`${itemCount} items`}</div>
                                          </div>
                                          <span className="history-version-total">{compactHistoryMoney(version.total_amount)}</span>
                                        </div>
                                      </button>
                                    )
                                  })}
                                  {(historyData.versions || []).length === 0 ? (
                                    <p className="text-muted">No submitted versions yet.</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="bidder-delete-cell">
                      <button
                        className="btn bidder-delete-action"
                        title="Remove bidder"
                        onClick={() => setDeleteBidderModal(row)}
                        disabled={loading}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
              {sortedInviteRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`text-muted ${showEmptyBiddersState ? 'bidders-empty-copy' : ''}`.trim()}>
                    {approvalTrackingActive
                      ? 'No awarded bidder found.'
                      : showEmptyBiddersState
                        ? 'No bidders yet. Add your first bidder using the module below or skip to approvals if you outsource project bidding.'
                        : 'No invite rows loaded yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className={`action-row bidders-footer-actions ${showEmptyBiddersState ? 'bidders-footer-empty' : ''}`.trim()}>
          {(soleWinnerActive || packageFullyAwarded) && rows.some((row) => Number(row.awarded_row_count || 0) === 0) ? (
            <button
              className="btn btn-primary"
              onClick={() => setShowAllAwardedBidders((prev) => !prev)}
              disabled={!loadedBidPackageId || loading}
            >
              {showAllAwardedBidders ? 'Show Winners Only' : 'Show All'}
            </button>
          ) : null}
          {!approvalTrackingActive && !approvalsOnlyMode && showAddBidderForm ? (
            <div className="bidder-add-head-inline">
              <button
                className="btn bidder-add-cancel-btn"
                type="button"
                onClick={() => {
                  setShowAddBidderForm(false)
                  setShowCreateVendorPanel(false)
                  setCreateVendorStep('email')
                }}
                disabled={loading}
                title="Cancel"
              >
                ✕
              </button>
              {renderVendorPicker()}
              <input
                className="bidder-add-head-input bidder-add-head-password"
                type="text"
                value={invitePassword}
                onChange={(event) => setInvitePassword(event.target.value)}
                placeholder="Set Invite Password"
              />
              <button
                className="btn bidder-add-submit-btn"
                onClick={addInvite}
                disabled={loading || !selectedVendorRecord || !invitePassword || !loadedBidPackageId}
                title="Add bidder"
              >
                +
              </button>
            </div>
          ) : null}
          {!approvalTrackingActive && !showAddBidderForm && !showEmptyBiddersState ? (
            <button
              className="btn bidder-add-link-btn"
              onClick={() => {
                setShowAddBidderForm(true)
                setShowCreateVendorPanel(false)
                setCreateVendorStep('email')
              }}
              disabled={!loadedBidPackageId || loading || approvalsOnlyMode}
            >
              <img src={plusBidderIcon} alt="" aria-hidden="true" />
              <span>Bidder</span>
            </button>
          ) : null}
          {showEmptyBiddersState ? (
            <>
              <div className="bidder-add-head-inline bidders-empty-inline">
                {renderVendorPicker()}
                <input
                  className="bidder-add-head-input bidder-add-head-password"
                  type="text"
                  value={invitePassword}
                  onChange={(event) => setInvitePassword(event.target.value)}
                  placeholder="Password"
                  disabled={loading}
                />
                <button
                  className="btn bidder-add-submit-btn"
                  onClick={addInvite}
                  disabled={loading || !selectedVendorRecord || !invitePassword || !loadedBidPackageId}
                  title="Add bidder"
                  aria-label="Add bidder"
                >
                  +
                </button>
              </div>
              {showCreateVendorPanel ? renderCreateVendorPanel() : null}
              <button
                className="btn bidders-empty-skip-btn"
                onClick={enableApprovalsOnlyMode}
                disabled={!currentResolvedPackageId || loading}
              >
                <span>Skip to approvals</span>
                <span className="bidders-empty-skip-icon" aria-hidden="true">➜</span>
              </button>
            </>
          ) : null}
        </div>
        {!approvalTrackingActive && !approvalsOnlyMode && showAddBidderForm && showCreateVendorPanel ? (
          <div className="bidder-create-vendor-row">
            {renderCreateVendorPanel()}
          </div>
        ) : null}
        {showEmptyBiddersState && showCreateVendorPanel ? (
          <div className="bidder-create-vendor-row">
            {renderCreateVendorPanel()}
          </div>
        ) : null}
      </SectionCard>
      ) : null}
      {activePackageId ? (
        <>
          {historyView ? (
            <div className="comparison-history-banner">
              <div className="comparison-history-banner-left">
                <span className="comparison-history-banner-icon" aria-hidden="true">⚠</span>
                <div className="comparison-history-banner-content">
                  <p className="comparison-history-banner-title">Viewing Historical Bid</p>
                  <p className="comparison-history-banner-details">
                    {`${vendorDisplayName(historyView.dealerName, historyView.dealerEmail)} - Version ${historyView.version} (${historyView.date} at ${historyView.time}) `}
                    <span className="comparison-history-banner-warning">You cannot award a bid while in history mode.</span>
                  </p>
                </div>
              </div>
              <button type="button" className="btn comparison-history-exit-btn" onClick={() => setHistoryView(null)}>
                Exit History View
              </button>
            </div>
          ) : null}
          <ComparisonPage
            embedded
            bidPackageId={activePackageId}
            initialRows={approvalTrackingActive ? initialComparisonRows : []}
            allowItemManagement={!approvalTrackingActive}
            awardedWorkspace={approvalTrackingActive}
            requiredApprovalColumns={approvalTrackingActive ? requiredApprovalColumns : []}
            requiredApprovalsBySpecItem={approvalTrackingActive ? requiredApprovalsBySpecItem : {}}
            approvalComponentsBySpecItem={approvalTrackingActive ? approvalComponentsBySpecItem : {}}
            lineItemUploadsBySpecItem={approvalTrackingActive ? lineItemUploadsBySpecItem : {}}
            onApproveRequirement={approvalTrackingActive ? ({ specItemId, requirementKey, componentId }) => approveRequirement({ id: specItemId }, requirementKey, componentId) : null}
            onUnapproveRequirement={approvalTrackingActive ? ({ specItemId, requirementKey, actionType, componentId }) => unapproveRequirement({ id: specItemId }, requirementKey, actionType, componentId) : null}
            onNeedsFixRequirement={approvalTrackingActive ? ({ specItemId, requirementKey, componentId }) => markRequirementNeedsFix({ id: specItemId }, requirementKey, componentId) : null}
            onCreateApprovalComponent={approvalTrackingActive ? ({ specItemId }) => createApprovalComponent({ id: specItemId }) : null}
            onRenameApprovalComponent={approvalTrackingActive ? ({ specItemId, componentId, label }) => renameApprovalComponent({ id: specItemId }, componentId, label) : null}
            onDeleteApprovalComponent={approvalTrackingActive ? ({ specItemId, componentId }) => removeApprovalComponent({ id: specItemId }, componentId) : null}
            onActivateComponentRequirement={approvalTrackingActive ? ({ specItemId, componentId, requirementKey }) => activateApprovalComponentRequirement({ id: specItemId }, componentId, requirementKey) : null}
            onDeactivateComponentRequirement={approvalTrackingActive ? ({ specItemId, componentId, requirementKey }) => deactivateApprovalComponentRequirement({ id: specItemId }, componentId, requirementKey) : null}
            onOpenLineItemFiles={approvalTrackingActive ? ({ specItemId, codeTag, productName, brandName, uploads = [] }) => {
              setLineItemUploadFile(null)
              setLineItemUploadRequirementKey('')
              setLineItemFilterRequirementKey('all')
              setLineItemDownloadIncludeTag(false)
              setLineItemDownloadIncludeCode(false)
              const applicableRequirements = (requiredApprovalsBySpecItem[String(specItemId)] || [])
                .filter((requirement) => requirement.applies)
                .map((requirement) => ({ key: requirement.key, label: requirement.label }))
              setActiveLineItemFilesModal({
                specItemId: specItemId || null,
                codeTag: codeTag || '—',
                productName: productName || '—',
                brandName: brandName || '',
                uploads,
                requirements: applicableRequirements
              })
            } : null}
            onAwardChanged={async () => {
              await loadDashboard({ closeEdit: false })
            }}
            onExcludedRowsChanged={setExcludedAwardRowIds}
            onAwardSummaryChanged={setLiveAwardSummary}
            reloadToken={comparisonReloadToken}
            forcedVisibleDealerIds={approvalTrackingActive ? null : comparisonVisibleInviteIds}
            historyView={historyView}
            onExitHistoryView={() => setHistoryView(null)}
            lineItemsHeaderActionLabel={!approvalTrackingActive && approvalsOnlyMode ? 'Invite Bidders' : ''}
            onLineItemsHeaderAction={!approvalTrackingActive && approvalsOnlyMode ? inviteBiddersFromApprovals : null}
            lineItemsHeaderActionDisabled={!activePackageId || loading}
          />
        </>
      ) : (
        <SectionCard title="Line Item Comparison">
          <p className="text-muted">Load a bid package to view comparison.</p>
        </SectionCard>
      )}

      {activeLineItemFilesModal ? (
        <div className="modal-backdrop" onClick={() => {
          setActiveLineItemFilesModal(null)
          setLineItemUploadFile(null)
          setLineItemUploadRequirementKey('')
          setLineItemFilterRequirementKey('all')
          setLineItemDownloadIncludeTag(false)
          setLineItemDownloadIncludeCode(false)
        }}>
          <div className={`modal-card file-room-modal-card ${noFilesInActiveModal ? 'is-empty' : ''}`.trim()} onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <h2>{activeLineItemFilesModal.codeTag}</h2>
              <button
                className="btn designer-file-room-close-btn"
                onClick={() => {
                  setActiveLineItemFilesModal(null)
                  setLineItemUploadFile(null)
                  setLineItemUploadRequirementKey('')
                  setLineItemFilterRequirementKey('all')
                  setLineItemDownloadIncludeTag(false)
                  setLineItemDownloadIncludeCode(false)
                }}
              >
                ✕
              </button>
            </div>
            <p className="text-muted file-room-subtitle" style={{ marginTop: 0 }}>
              {activeLineItemFilesModal.brandName
                ? `${activeLineItemFilesModal.productName} by ${activeLineItemFilesModal.brandName}`
                : activeLineItemFilesModal.productName}
            </p>
            <div className={`designer-file-room-dropzone ${noFilesInActiveModal ? 'is-empty' : ''}`.trim()}>
              <div className="designer-file-room-upload-icon">⇪</div>
              <div className={`designer-file-room-drop-copy ${noFilesInActiveModal ? 'is-empty' : ''}`.trim()}>
                Drag &amp; drop files here or click to{' '}
                <label className="designer-file-room-browse-link">
                  browse
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    disabled={loading}
                    onChange={async (event) => {
                      const file = event.target.files?.[0] || null
                      setLineItemUploadFile(file)
                      if (file) await uploadLineItemFile(file)
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
            {!noFilesInActiveModal ? (
              <>
                <div className="designer-file-room-top-row">
                  <div className="designer-file-room-files-count">{`${filteredActiveModalUploads.length} File${filteredActiveModalUploads.length === 1 ? '' : 's'}`}</div>
                  <div className="designer-file-room-filter-row">
                    <span>Filter</span>
                    <select
                      value={lineItemFilterRequirementKey}
                      onChange={(event) => setLineItemFilterRequirementKey(event.target.value)}
                    >
                      <option value="all">All Files</option>
                      <option value="untagged">Untagged</option>
                      {activeModalRequirementOptions.map((option) => (
                        <option key={`filter-requirement-${option.key}`} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="designer-file-room-bulk-actions">
                  <div className="designer-file-room-download-options">
                    <span className="designer-file-room-filenames-label">Filenames:</span>
                    <label className="checkbox-row designer-file-room-download-toggle">
                      <input
                        type="checkbox"
                        checked={lineItemDownloadIncludeCode}
                        onChange={(event) => setLineItemDownloadIncludeCode(event.target.checked)}
                      />
                      Include code/tag
                    </label>
                    <label className="checkbox-row designer-file-room-download-toggle">
                      <input
                        type="checkbox"
                        checked={lineItemDownloadIncludeTag}
                        onChange={(event) => setLineItemDownloadIncludeTag(event.target.checked)}
                      />
                      Include Requirement type
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn designer-file-room-download-all-btn"
                    onClick={downloadAllLineItemFiles}
                    disabled={lineItemBulkDownloading || filteredActiveModalUploads.filter((upload) => Boolean(upload?.download_url)).length === 0}
                  >
                    {lineItemBulkDownloading ? 'Downloading…' : 'Download All'}
                  </button>
                </div>
              </>
            ) : null}
            {!noFilesInActiveModal ? (
              <div className="designer-file-room-list">
                {filteredActiveModalUploads.map((upload) => (
                  <div key={`line-item-modal-upload-${upload.id}`} className="designer-file-room-item">
                    <div className="designer-file-room-item-icon">📄</div>
                    <div className="designer-file-room-item-main">
                      <div className="designer-file-room-item-name">
                        {upload.file_name || '—'}
                      </div>
                      <div className="designer-file-room-item-meta">
                        {[formatFileSize(upload.byte_size), upload.uploaded_by || upload.uploader_role || '—', formatShortDate(upload.uploaded_at)].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <div className="designer-file-room-item-actions">
                      {activeModalRetagOptions.length > 0 ? (
                        <select
                          className="designer-file-room-item-tag-select"
                          value={upload.requirement_key || ''}
                          onChange={(event) => updateLineItemUploadRequirement(upload, event.target.value)}
                          disabled={loading || lineItemSavingTagUploadId === upload.id}
                          title="Requirement tag"
                        >
                          <option value="">No tag</option>
                          {activeModalRetagOptions.map((option) => (
                            <option key={`upload-item-tag-${upload.id}-${option.key}`} value={option.key}>{option.label}</option>
                          ))}
                        </select>
                      ) : null}
                      {upload.download_url ? (
                        <button
                          type="button"
                          className="btn designer-file-room-icon-btn"
                          onClick={async () => {
                            try {
                              await downloadSingleLineItemFile(upload)
                            } catch (error) {
                              setStatusMessage(error.message || 'Unable to download file.')
                            }
                          }}
                          title="Download"
                        >
                          ↻
                        </button>
                      ) : null}
                      {upload.uploader_role === 'designer' ? (
                        <button
                          className="btn designer-file-room-icon-btn danger"
                          onClick={() => deleteLineItemFile(upload)}
                          disabled={loading}
                          title="Delete"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {noFilesInActiveModal ? (
              <div className="designer-file-room-list">
                <div className={`designer-file-room-empty text-muted ${noFilesInActiveModal ? 'is-empty' : ''}`.trim()}>No files uploaded yet.</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {clearAwardModal ? (
        <div className="modal-backdrop" onClick={() => setClearAwardModal(null)}>
          <div className="modal-card award-modal-card award-modal-card-remove" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="award-modal-close-dot"
              onClick={() => setClearAwardModal(null)}
              disabled={loading}
              aria-label="Close remove award modal"
            >
              ×
            </button>
            <h3>Remove award</h3>
            <p className="award-modal-remove-copy">
              Removing this award will return the package to bidding mode.
            </p>
            <button type="button" className="btn award-modal-remove-btn" onClick={clearAwardForPackage} disabled={loading}>
              Remove Award
            </button>
          </div>
        </div>
      ) : null}

      {bidderQuestionsModal ? (
        <div className="modal-backdrop" onClick={() => setBidderQuestionsModal(null)}>
          <div className="modal-card bidder-questions-modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="bidder-questions-modal-close"
              onClick={() => setBidderQuestionsModal(null)}
              aria-label="Close question responses modal"
            >
              ×
            </button>
            <h3>Question Responses</h3>
            <p className="bidder-questions-modal-subtitle">
              {`${bidderQuestionsModal.dealerName} • ${bidderQuestionsModal.answeredCount} of ${bidderQuestionsModal.totalCount}`}
            </p>
            <div className="bidder-questions-modal-list">
              {(bidderQuestionsModal.responses || []).map((entry) => (
                <div key={`bidder-question-${entry.id}`} className="bidder-questions-modal-item">
                  <div className="bidder-questions-modal-label">{entry.label}</div>
                  <div className="bidder-questions-modal-value">{entry.value || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {clearBidderAwardsModal ? (
        <div className="modal-backdrop" onClick={() => setClearBidderAwardsModal(null)}>
          <div className="modal-card award-modal-card award-modal-card-remove" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="award-modal-close-dot"
              onClick={() => setClearBidderAwardsModal(null)}
              disabled={loading}
              aria-label="Close remove bidder awards modal"
            >
              ×
            </button>
            <h3>Remove awarded rows</h3>
            <p className="award-modal-remove-copy">
              {`Choose which row${clearBidderAwardItems.length === 1 ? '' : 's'} to remove from ${clearBidderAwardsModal.dealerName}.`}
            </p>
            <div className="award-modal-remove-toolbar">
              <button
                type="button"
                className="btn award-modal-remove-toggle"
                onClick={() => {
                  const allSelected = clearBidderAwardItems.length > 0
                    && Number(clearBidderAwardsModal.rowCount || 0) === clearBidderAwardItems.length
                  setClearBidderAwardsModal((prev) => (
                    prev
                      ? {
                          ...prev,
                          selectedSpecItemIds: allSelected ? [] : clearBidderAwardItems.map((item) => item.id),
                          rowCount: allSelected ? 0 : clearBidderAwardItems.length
                        }
                      : prev
                  ))
                }}
                disabled={loading || clearBidderAwardItems.length === 0}
              >
                <span
                  className={`award-modal-remove-toggle-check ${clearBidderAwardItems.length > 0
                  && Number(clearBidderAwardsModal.rowCount || 0) === clearBidderAwardItems.length
                    ? 'is-checked'
                    : ''}`.trim()}
                  aria-hidden="true"
                />
                <span>
                  {clearBidderAwardItems.length > 0
                  && Number(clearBidderAwardsModal.rowCount || 0) === clearBidderAwardItems.length
                    ? 'Deselect All'
                    : 'Select All'}
                </span>
              </button>
              <span className="award-modal-remove-count">
                {`${clearBidderAwardsModal.rowCount || 0} Selected`}
              </span>
            </div>
            <div className="award-modal-remove-list">
              {clearBidderAwardItems.map((item) => {
                const checked = clearBidderAwardsModal.selectedSpecItemIds?.some((id) => String(id) === String(item.id))
                const quantityLabel = item.quantity ? `${item.quantity}${item.uom ? ` ${item.uom}` : ''}` : '—'
                return (
                  <label key={`clear-award-item-${item.id}`} className="award-modal-remove-item">
                    <input
                      type="checkbox"
                      checked={Boolean(checked)}
                      onChange={(event) => {
                        const nextChecked = event.target.checked
                        setClearBidderAwardsModal((prev) => {
                          if (!prev) return prev
                          const current = Array.isArray(prev.selectedSpecItemIds) ? prev.selectedSpecItemIds : []
                          const nextSelected = nextChecked
                            ? (current.some((id) => String(id) === String(item.id)) ? current : [...current, item.id])
                            : current.filter((id) => String(id) !== String(item.id))
                          return {
                            ...prev,
                            selectedSpecItemIds: nextSelected,
                            rowCount: nextSelected.length
                          }
                        })
                      }}
                      disabled={loading}
                    />
                    <span className="award-modal-remove-item-body">
                      <span className="award-modal-remove-item-line">
                        <span className="award-modal-remove-item-details">
                          <span className="award-modal-remove-item-title">{item.codeTag}</span>
                          <span className="award-modal-remove-item-meta">
                            {item.productName}
                            {item.brandName ? ` - ${item.brandName}` : ''}
                          </span>
                        </span>
                        <span className="award-modal-remove-item-qty">{quantityLabel}</span>
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            <button
              type="button"
              className="btn award-modal-remove-btn"
              onClick={confirmClearBidderAwardRows}
              disabled={loading || Number(clearBidderAwardsModal.rowCount || 0) === 0}
            >
              {`Remove ${clearBidderAwardsModal.rowCount || 0} Awarded Row${Number(clearBidderAwardsModal.rowCount || 0) === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : null}

      {deleteBidderModal ? (
        <div className="modal-backdrop" onClick={() => setDeleteBidderModal(null)}>
          <div className="modal-card bidder-delete-modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="bidder-delete-modal-close"
              onClick={() => setDeleteBidderModal(null)}
              aria-label="Close delete modal"
            >
              ×
            </button>
            <h3>Delete Bid and Bidder</h3>
            <p className="bidder-delete-modal-copy">
              Are you sure you want to delete this bid and bidder?
              <br />
              This action cannot be reverted.
            </p>
            <button
              type="button"
              className="btn bidder-delete-modal-confirm"
              onClick={() => deleteBidderRow(deleteBidderModal)}
              disabled={loading}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
      {toastMessage ? <div className="floating-toast">{toastMessage}</div> : null}

    </div>
  )
}
