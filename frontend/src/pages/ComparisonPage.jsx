import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import ApprovalTimestampTooltip from '../components/ApprovalTimestampTooltip'
import AlertMismatchIcon from '../assets/alert-mismatch.svg'
import AddNestedIcon from '../assets/add-nested.svg'
import AddTableSubrowIcon from '../assets/add-table-subrow.svg'
import RemoveNestedIcon from '../assets/remove-nested.svg'
import EditIcon from '../assets/edit.svg'
import DeleteIcon from '../assets/delete.svg'
import FixIcon from '../assets/fix.svg'
import ArrowLeftIcon from '../assets/arrow-left.svg'
import ArrowRightIcon from '../assets/arrow-right.svg'
import ExpandIcon from '../assets/expand-icon.svg'
import OptionsIcon from '../assets/options-icon.svg'
import ResetIcon from '../assets/reset.svg'
import DownloadIcon from '../assets/vendor-bid/download-csv.svg'
import {
  API_BASE_URL,
  activateSpecItemComponentRequirement,
  awardBidRows,
  comparisonExportUrl,
  createSpecItemApprovalComponent,
  createBidPackagePostAwardUpload,
  deactivateSpecItemComponentRequirement,
  deactivateSpecItem,
  deleteSpecItemApprovalComponent,
  fetchBidPackageDashboard,
  fetchBidPackages,
  fetchComparison,
  generateComparisonAnalysis,
  updateBidPackageAwardScope,
  approveSpecItemRequirement,
  markSpecItemRequirementNeedsFix,
  unapproveSpecItemRequirement,
  updateSpecItemApprovalComponent,
  reactivateSpecItem
} from '../lib/api'

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function numberOrNull(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function money(value) {
  const n = numberOrNull(value)
  return n == null ? '—' : `$${usdFormatter.format(n)}`
}

function formatShortDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

async function downloadFile(url, fileName) {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) throw new Error(`Download failed (${response.status})`)

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName || 'file'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

function isPdfUpload(upload) {
  const name = String(upload?.file_name || '').toLowerCase()
  return name.endsWith('.pdf')
}

function pdfPreviewUrl(url) {
  const base = String(url || '')
  if (!base) return base
  const separator = base.includes('#') ? '&' : '#'
  return `${base}${separator}page=1&view=FitH&pagemode=none&toolbar=1&navpanes=0&scrollbar=1`
}

function extendedAmount(unitPrice, quantity) {
  const p = numberOrNull(unitPrice)
  const q = numberOrNull(quantity)
  if (p == null || q == null) return null
  return p * q
}

function delta(value, avg) {
  const v = numberOrNull(value)
  const a = numberOrNull(avg)
  if (v == null || a == null || a === 0) return '—'

  const pct = ((v - a) / a) * 100
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function percentAgainst(value, baseline) {
  const v = numberOrNull(value)
  const b = numberOrNull(baseline)
  if (v == null || b == null || b === 0) return null
  return ((v - b) / b) * 100
}

function percentDisplay(value) {
  const n = numberOrNull(value)
  if (n == null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

function median(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map((value) => numberOrNull(value))
    .filter((value) => value != null)
    .sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  if (nums.length % 2 === 0) return (nums[mid - 1] + nums[mid]) / 2
  return nums[mid]
}

function percentile(values, p) {
  const nums = (Array.isArray(values) ? values : [])
    .map((value) => numberOrNull(value))
    .filter((value) => value != null)
    .sort((a, b) => a - b)
  if (nums.length === 0) return null
  const clamped = Math.max(0, Math.min(1, p))
  const idx = (nums.length - 1) * clamped
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return nums[lower]
  const weight = idx - lower
  return nums[lower] * (1 - weight) + nums[upper] * weight
}

function deltaToneClass(displayValue) {
  const text = String(displayValue || '').trim()
  if (text.startsWith('+')) return 'delta-positive'
  if (text.startsWith('-')) return 'delta-negative'
  return ''
}

function dealerDisplayLabel(dealerName, dealerEmail) {
  if (dealerEmail) return String(dealerEmail).trim()
  const raw = String(dealerName || '')
  const company = raw.split(/\s[-–—]\s/, 2)[0]?.trim()
  return company || raw || 'Dealer'
}

function cellModeKey(specItemId, inviteId) {
  return `${specItemId}:${inviteId}`
}

const DEFAULT_COMPARISON_VIEW_STATE = {
  responderSort: 'lowest_bid',
  comparisonMode: 'none',
  showUnitPriceColumn: true,
  showProductColumn: true,
  showBrandColumn: true,
  showLeadTimeColumn: false,
  showDealerNotesColumn: false
}

function comparisonSnapshotStorageKey(bidPackageId) {
  return `bid_collections.comparison.snapshot.${bidPackageId}`
}

function comparisonStateStorageKey(bidPackageId) {
  return `bid_collections.comparison.state.${bidPackageId}`
}

function loadStoredComparisonSnapshot(bidPackageId) {
  if (!bidPackageId) return null
  try {
    const raw = window.localStorage.getItem(comparisonSnapshotStorageKey(bidPackageId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_error) {
    return null
  }
}

function storeComparisonSnapshot(bidPackageId, snapshot) {
  if (!bidPackageId) return
  try {
    if (snapshot && typeof snapshot === 'object') {
      window.localStorage.setItem(comparisonSnapshotStorageKey(bidPackageId), JSON.stringify(snapshot))
    } else {
      window.localStorage.removeItem(comparisonSnapshotStorageKey(bidPackageId))
    }
  } catch (_error) {
    // ignore storage failures
  }
}

function loadStoredComparisonState(bidPackageId) {
  const normalizeStoredExcludedIds = (value) => {
    const raw = Array.isArray(value) ? value : (value == null ? [] : [value])
    return Array.from(new Set(
      raw
        .flatMap((id) => String(id).split(','))
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id) && Number(id) > 0)
    ))
  }

  if (!bidPackageId) {
    return {
      dealerPriceMode: {},
      cellPriceMode: {},
      excludedSpecItemIds: [],
      ...DEFAULT_COMPARISON_VIEW_STATE
    }
  }
  try {
    const raw = window.localStorage.getItem(comparisonStateStorageKey(bidPackageId))
    if (!raw) {
      return {
        dealerPriceMode: {},
        cellPriceMode: {},
        excludedSpecItemIds: [],
        ...DEFAULT_COMPARISON_VIEW_STATE
      }
    }
    const parsed = JSON.parse(raw)
    return {
      dealerPriceMode: parsed?.dealerPriceMode && typeof parsed.dealerPriceMode === 'object' ? parsed.dealerPriceMode : {},
      cellPriceMode: parsed?.cellPriceMode && typeof parsed.cellPriceMode === 'object' ? parsed.cellPriceMode : {},
      excludedSpecItemIds: normalizeStoredExcludedIds(parsed?.excludedSpecItemIds),
      responderSort: parsed?.responderSort || DEFAULT_COMPARISON_VIEW_STATE.responderSort,
      comparisonMode: parsed?.comparisonMode || DEFAULT_COMPARISON_VIEW_STATE.comparisonMode,
      showUnitPriceColumn: typeof parsed?.showUnitPriceColumn === 'boolean' ? parsed.showUnitPriceColumn : DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn,
      showProductColumn: typeof parsed?.showProductColumn === 'boolean' ? parsed.showProductColumn : DEFAULT_COMPARISON_VIEW_STATE.showProductColumn,
      showBrandColumn: typeof parsed?.showBrandColumn === 'boolean' ? parsed.showBrandColumn : DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn,
      showLeadTimeColumn: typeof parsed?.showLeadTimeColumn === 'boolean' ? parsed.showLeadTimeColumn : DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn,
      showDealerNotesColumn: typeof parsed?.showDealerNotesColumn === 'boolean' ? parsed.showDealerNotesColumn : DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn
    }
  } catch (_error) {
    return {
      dealerPriceMode: {},
      cellPriceMode: {},
      excludedSpecItemIds: [],
      ...DEFAULT_COMPARISON_VIEW_STATE
    }
  }
}

function storeComparisonState(bidPackageId, state) {
  const normalizedExcludedIds = Array.isArray(state?.excludedSpecItemIds)
    ? Array.from(new Set(
      state.excludedSpecItemIds
        .flatMap((id) => String(id).split(','))
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id) && Number(id) > 0)
    ))
    : []
  if (!bidPackageId) return
  try {
    window.localStorage.setItem(comparisonStateStorageKey(bidPackageId), JSON.stringify({
      dealerPriceMode: state?.dealerPriceMode || {},
      cellPriceMode: state?.cellPriceMode || {},
      excludedSpecItemIds: normalizedExcludedIds,
      responderSort: state?.responderSort || DEFAULT_COMPARISON_VIEW_STATE.responderSort,
      comparisonMode: state?.comparisonMode || DEFAULT_COMPARISON_VIEW_STATE.comparisonMode,
      showUnitPriceColumn: typeof state?.showUnitPriceColumn === 'boolean' ? state.showUnitPriceColumn : DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn,
      showProductColumn: typeof state?.showProductColumn === 'boolean' ? state.showProductColumn : DEFAULT_COMPARISON_VIEW_STATE.showProductColumn,
      showBrandColumn: typeof state?.showBrandColumn === 'boolean' ? state.showBrandColumn : DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn,
      showLeadTimeColumn: typeof state?.showLeadTimeColumn === 'boolean' ? state.showLeadTimeColumn : DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn,
      showDealerNotesColumn: typeof state?.showDealerNotesColumn === 'boolean' ? state.showDealerNotesColumn : DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn
    }))
  } catch (_error) {
    // ignore storage failures
  }
}

function clearStoredComparisonState(bidPackageId) {
  if (!bidPackageId) return
  try {
    window.localStorage.removeItem(comparisonStateStorageKey(bidPackageId))
  } catch (_error) {
    // ignore storage failures
  }
}

function selectionStatusForDealer(dealer, awardedBidId) {
  if (dealer?.selection_status) return dealer.selection_status
  if (awardedBidId && dealer?.bid_id === awardedBidId) return 'awarded'
  if (awardedBidId) return 'not_selected'
  return 'pending'
}

function packageAwardStatusLabel(status) {
  if (status === 'fully_awarded') return 'Fully Awarded'
  if (status === 'partially_awarded') return 'Partially Awarded'
  return 'Not Awarded'
}

function awardWinnerScopeLabel(scope) {
  if (scope === 'multiple_winners') return 'Multiple Winners'
  if (scope === 'single_winner') return 'Single Winner'
  return 'No Winner'
}

function decodeHistoryViewFromSearchParams(searchParams) {
  const bidderIdRaw = searchParams.get('history_bidder_id')
  const versionRaw = searchParams.get('history_version')
  const dealerName = searchParams.get('history_dealer_name')
  const date = searchParams.get('history_date')
  const time = searchParams.get('history_time')
  if (!bidderIdRaw || !versionRaw || !dealerName || !date || !time) return null
  const bidderId = Number(bidderIdRaw)
  const version = Number(versionRaw)
  if (!Number.isFinite(bidderId) || !Number.isFinite(version)) return null
  return { bidderId, version, dealerName, date, time }
}

function IconCheck() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <img src={FixIcon} alt="" aria-hidden="true" className="approval-action-icon-img" />
  )
}

function IconX() {
  return (
    <img src={ResetIcon} alt="" aria-hidden="true" className="approval-action-icon-img" />
  )
}

export default function ComparisonPage({
  embedded = false,
  bidPackageId: embeddedBidPackageId = '',
  initialRows = [],
  onClose = null,
  allowItemManagement = false,
  onAwardChanged = null,
  forcedVisibleDealerIds = null,
  historyView = null,
  onExitHistoryView = null,
  awardedWorkspace = false,
  requiredApprovalColumns = [],
  requiredApprovalsBySpecItem = {},
  approvalComponentsBySpecItem = {},
  lineItemUploadsBySpecItem = {},
  onApproveRequirement = null,
  onUnapproveRequirement = null,
  onNeedsFixRequirement = null,
  onCreateApprovalComponent = null,
  onRenameApprovalComponent = null,
  onDeleteApprovalComponent = null,
  onActivateComponentRequirement = null,
  onDeactivateComponentRequirement = null,
  onOpenLineItemFiles = null,
  onExcludedRowsChanged = null,
  onAwardSummaryChanged = null,
  reloadToken = 0,
  lineItemsHeaderActionLabel = '',
  onLineItemsHeaderAction = null,
  lineItemsHeaderActionDisabled = false
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const forcedBidPackageId = embedded
    ? String(embeddedBidPackageId || '')
    : (searchParams.get('bid_package_id') || '')
  const forcedApprovalTracking = !embedded && searchParams.get('approval_tracking') === '1'
  const fullscreenApprovalSnapshot = (!embedded && location.state?.approvalTrackingSnapshot)
    ? location.state.approvalTrackingSnapshot
    : null
  const fullscreenVisibleDealerIds = (!embedded && Array.isArray(location.state?.visibleDealerIds))
    ? location.state.visibleDealerIds
    : null
  const launchedFromDashboard = Boolean(forcedBidPackageId)
  const initialComparisonSnapshot = loadStoredComparisonSnapshot(forcedBidPackageId)
  const [bidPackages, setBidPackages] = useState([])
  const [selectedBidPackageId, setSelectedBidPackageId] = useState(forcedBidPackageId)
  const [loadedBidPackageId, setLoadedBidPackageId] = useState('')
  const [data, setData] = useState(() => ({
    dealers: Array.isArray(initialComparisonSnapshot?.dealers) ? initialComparisonSnapshot.dealers : [],
    rows: Array.isArray(initialRows) && initialRows.length > 0
      ? initialRows
      : (Array.isArray(initialComparisonSnapshot?.rows) ? initialComparisonSnapshot.rows : [])
  }))
  const [visibleDealerIds, setVisibleDealerIds] = useState(() => (
    Array.isArray(initialComparisonSnapshot?.dealers)
      ? initialComparisonSnapshot.dealers.map((dealer) => dealer.invite_id)
      : []
  ))
  const [responderSort, setResponderSort] = useState('lowest_bid')
  const [comparisonMode, setComparisonMode] = useState('none')
  const [showUnitPriceColumn, setShowUnitPriceColumn] = useState(true)
  const [showProductColumn, setShowProductColumn] = useState(true)
  const [showBrandColumn, setShowBrandColumn] = useState(true)
  const [showLeadTimeColumn, setShowLeadTimeColumn] = useState(false)
  const [showDealerNotesColumn, setShowDealerNotesColumn] = useState(false)
  const [fullscreenHistoryView, setFullscreenHistoryView] = useState(() => (
    embedded ? null : decodeHistoryViewFromSearchParams(searchParams)
  ))
  const [activeSubPopoverKey, setActiveSubPopoverKey] = useState(null)
  const [activeNotePopoverKey, setActiveNotePopoverKey] = useState(null)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showViewSubmenu, setShowViewSubmenu] = useState(false)
  const [showExportSubmenu, setShowExportSubmenu] = useState(false)
  const [editingComponentKey, setEditingComponentKey] = useState(null)
  const [editingComponentLabel, setEditingComponentLabel] = useState('')
  const [dealerPriceMode, setDealerPriceMode] = useState({})
  const [cellPriceMode, setCellPriceMode] = useState({})
  const [excludedRowIds, setExcludedRowIds] = useState(() => (
    forcedBidPackageId
      ? loadStoredComparisonState(String(forcedBidPackageId)).excludedSpecItemIds || []
      : []
  ))
  const [activeGeneralFields, setActiveGeneralFields] = useState(() => (
    Array.isArray(initialComparisonSnapshot?.activeGeneralFields) && initialComparisonSnapshot.activeGeneralFields.length > 0
      ? initialComparisonSnapshot.activeGeneralFields
      : [
          'delivery_amount',
          'install_amount',
          'escalation_amount',
          'contingency_amount',
          'sales_tax_amount'
        ]
  ))
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [addingComponentSpecItemIds, setAddingComponentSpecItemIds] = useState([])
  const [deletingComponentKeys, setDeletingComponentKeys] = useState([])
  const [deactivatingComponentRequirementKeys, setDeactivatingComponentRequirementKeys] = useState([])
  const [awardSubmitting, setAwardSubmitting] = useState(false)
  const [awardConfirmModal, setAwardConfirmModal] = useState(null)
  const [activeLineItemFilesModal, setActiveLineItemFilesModal] = useState(null)
  const [activeFilePreview, setActiveFilePreview] = useState(null)
  const [lineItemUploadBusy, setLineItemUploadBusy] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [awardedBidId, setAwardedBidId] = useState(() => initialComparisonSnapshot?.awardedBidId ?? null)
  const [awardedAt, setAwardedAt] = useState(() => initialComparisonSnapshot?.awardedAt || null)
  const [packageAwardStatus, setPackageAwardStatus] = useState(() => initialComparisonSnapshot?.packageAwardStatus || 'not_awarded')
  const [awardedRowCount, setAwardedRowCount] = useState(() => initialComparisonSnapshot?.awardedRowCount || 0)
  const [eligibleRowCount, setEligibleRowCount] = useState(() => initialComparisonSnapshot?.eligibleRowCount || 0)
  const [awardWinnerScope, setAwardWinnerScope] = useState(() => initialComparisonSnapshot?.awardWinnerScope || 'none')
  const [pendingRowSelections, setPendingRowSelections] = useState({})
  const [unapproveModal, setUnapproveModal] = useState(null)
  const [unapproveSaving, setUnapproveSaving] = useState(false)
  const [analysisModal, setAnalysisModal] = useState(null)
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const [activeAnalysisPanel, setActiveAnalysisPanel] = useState(null)
  const [fullscreenRequiredApprovalColumns, setFullscreenRequiredApprovalColumns] = useState(() => (
    Array.isArray(fullscreenApprovalSnapshot?.requiredApprovalColumns)
      ? fullscreenApprovalSnapshot.requiredApprovalColumns
      : []
  ))
  const [fullscreenRequiredApprovalsBySpecItem, setFullscreenRequiredApprovalsBySpecItem] = useState(() => (
    fullscreenApprovalSnapshot?.requiredApprovalsBySpecItem && typeof fullscreenApprovalSnapshot.requiredApprovalsBySpecItem === 'object'
      ? fullscreenApprovalSnapshot.requiredApprovalsBySpecItem
      : {}
  ))
  const [fullscreenApprovalComponentsBySpecItem, setFullscreenApprovalComponentsBySpecItem] = useState(() => (
    fullscreenApprovalSnapshot?.approvalComponentsBySpecItem && typeof fullscreenApprovalSnapshot.approvalComponentsBySpecItem === 'object'
      ? fullscreenApprovalSnapshot.approvalComponentsBySpecItem
      : {}
  ))
  const [fullscreenLineItemUploadsBySpecItem, setFullscreenLineItemUploadsBySpecItem] = useState(() => (
    fullscreenApprovalSnapshot?.lineItemUploadsBySpecItem && typeof fullscreenApprovalSnapshot.lineItemUploadsBySpecItem === 'object'
      ? fullscreenApprovalSnapshot.lineItemUploadsBySpecItem
      : {}
  ))
  const [tableScrollLeft, setTableScrollLeft] = useState(0)
  const [tableScrollTop, setTableScrollTop] = useState(0)
  const includeInactiveRows = allowItemManagement
  const effectiveBidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
  const isAwardedWorkspace = Boolean(
    awardedWorkspace ||
    forcedApprovalTracking ||
    (!embedded && packageAwardStatus === 'fully_awarded')
  )
  const effectiveHistoryView = historyView || fullscreenHistoryView
  const historyModeActive = Boolean(effectiveHistoryView)
  const effectiveRequiredApprovalColumns = (requiredApprovalColumns && requiredApprovalColumns.length > 0)
    ? requiredApprovalColumns
    : fullscreenRequiredApprovalColumns
  const effectiveRequiredApprovalsBySpecItem = (requiredApprovalsBySpecItem && Object.keys(requiredApprovalsBySpecItem).length > 0)
    ? requiredApprovalsBySpecItem
    : fullscreenRequiredApprovalsBySpecItem
  const effectiveApprovalComponentsBySpecItem = (approvalComponentsBySpecItem && Object.keys(approvalComponentsBySpecItem).length > 0)
    ? approvalComponentsBySpecItem
    : fullscreenApprovalComponentsBySpecItem
  const effectiveLineItemUploadsBySpecItem = (lineItemUploadsBySpecItem && Object.keys(lineItemUploadsBySpecItem).length > 0)
    ? lineItemUploadsBySpecItem
    : fullscreenLineItemUploadsBySpecItem

  useEffect(() => {
    if (!embedded) return
    if (!Array.isArray(initialRows) || initialRows.length === 0) return
    setData((prev) => {
      if (awardedWorkspace) {
        return { ...prev, rows: initialRows }
      }
      if (Array.isArray(prev.rows) && prev.rows.length > 0) return prev
      return { ...prev, rows: initialRows }
    })
  }, [embedded, initialRows, awardedWorkspace])

  useEffect(() => {
    if (!embedded) return
    if (!loadedBidPackageId && !forcedBidPackageId) return
    if (!reloadToken) return
    reloadCurrentComparison({ silent: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, embedded, loadedBidPackageId, forcedBidPackageId])

  useEffect(() => {
    if (!fullscreenApprovalSnapshot) return
    setFullscreenRequiredApprovalColumns(
      Array.isArray(fullscreenApprovalSnapshot.requiredApprovalColumns)
        ? fullscreenApprovalSnapshot.requiredApprovalColumns
        : []
    )
    setFullscreenRequiredApprovalsBySpecItem(
      fullscreenApprovalSnapshot.requiredApprovalsBySpecItem && typeof fullscreenApprovalSnapshot.requiredApprovalsBySpecItem === 'object'
        ? fullscreenApprovalSnapshot.requiredApprovalsBySpecItem
        : {}
    )
    setFullscreenApprovalComponentsBySpecItem(
      fullscreenApprovalSnapshot.approvalComponentsBySpecItem && typeof fullscreenApprovalSnapshot.approvalComponentsBySpecItem === 'object'
        ? fullscreenApprovalSnapshot.approvalComponentsBySpecItem
        : {}
    )
    setFullscreenLineItemUploadsBySpecItem(
      fullscreenApprovalSnapshot.lineItemUploadsBySpecItem && typeof fullscreenApprovalSnapshot.lineItemUploadsBySpecItem === 'object'
        ? fullscreenApprovalSnapshot.lineItemUploadsBySpecItem
        : {}
    )
  }, [fullscreenApprovalSnapshot])
  const tableScrollRef = useRef(null)
  const tableInnerRef = useRef(null)
  const [scrollMax, setScrollMax] = useState(0)
  const [isDraggingTable, setIsDraggingTable] = useState(false)
  const dragStateRef = useRef({ active: false, startX: 0, startLeft: 0 })
  const dealerPriceModeRef = useRef(dealerPriceMode)
  const cellPriceModeRef = useRef(cellPriceMode)
  const visibleDealerIdsRef = useRef(visibleDealerIds)
  const excludedRowIdsRef = useRef(excludedRowIds)
  const responderSortRef = useRef(responderSort)
  const comparisonModeRef = useRef(comparisonMode)
  const showUnitPriceColumnRef = useRef(showUnitPriceColumn)
  const showProductColumnRef = useRef(showProductColumn)
  const showBrandColumnRef = useRef(showBrandColumn)
  const showLeadTimeColumnRef = useRef(showLeadTimeColumn)
  const showDealerNotesColumnRef = useRef(showDealerNotesColumn)

  useEffect(() => {
    dealerPriceModeRef.current = dealerPriceMode
  }, [dealerPriceMode])

  useEffect(() => {
    cellPriceModeRef.current = cellPriceMode
  }, [cellPriceMode])

  useEffect(() => {
    visibleDealerIdsRef.current = visibleDealerIds
  }, [visibleDealerIds])

  useEffect(() => {
    excludedRowIdsRef.current = excludedRowIds
  }, [excludedRowIds])

  useEffect(() => {
    responderSortRef.current = responderSort
  }, [responderSort])

  useEffect(() => {
    comparisonModeRef.current = comparisonMode
  }, [comparisonMode])

  useEffect(() => {
    showUnitPriceColumnRef.current = showUnitPriceColumn
  }, [showUnitPriceColumn])

  useEffect(() => {
    showProductColumnRef.current = showProductColumn
  }, [showProductColumn])

  useEffect(() => {
    showBrandColumnRef.current = showBrandColumn
  }, [showBrandColumn])

  useEffect(() => {
    showLeadTimeColumnRef.current = showLeadTimeColumn
  }, [showLeadTimeColumn])

  useEffect(() => {
    showDealerNotesColumnRef.current = showDealerNotesColumn
  }, [showDealerNotesColumn])

  const normalizeExcludedIds = (ids) => {
    const raw = Array.isArray(ids) ? ids : (ids == null ? [] : [ids])
    const normalized = raw
      .flatMap((id) => String(id).split(','))
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id) && Number(id) > 0)
    return Array.from(new Set(normalized))
  }

  const excludedIdsMatch = (left, right) => {
    const a = normalizeExcludedIds(left).sort()
    const b = normalizeExcludedIds(right).sort()
    if (a.length !== b.length) return false
    return a.every((value, index) => value === b[index])
  }

  const applyExcludedRowIds = (nextIds) => {
    setExcludedRowIds((prev) => {
      const resolved = typeof nextIds === 'function' ? nextIds(prev) : nextIds
      const normalized = normalizeExcludedIds(resolved)
      excludedRowIdsRef.current = normalized
      return normalized
    })
  }

  const addExcludedRowId = (id) => {
    const key = String(id)
    applyExcludedRowIds((prev) => [...prev, key])
  }

  const removeExcludedRowId = (id) => {
    const key = String(id)
    applyExcludedRowIds((prev) => prev.filter((existing) => String(existing) !== key))
  }

  const updateFullscreenRequirement = ({ specItemId, requirementKey, updates, componentId = null }) => {
    if (componentId != null) {
      setFullscreenApprovalComponentsBySpecItem((prev) => {
        const next = { ...prev }
        const current = Array.isArray(next[String(specItemId)]) ? next[String(specItemId)] : []
        next[String(specItemId)] = current.map((component) => {
          if (String(component.id) !== String(componentId)) return component
          const requirements = Array.isArray(component.required_approvals) ? component.required_approvals : []
          return {
            ...component,
            required_approvals: requirements.map((item) => (
              item.key === requirementKey
                ? { ...item, ...updates, component_id: componentId }
                : item
            ))
          }
        })
        return next
      })
      return
    }

    setFullscreenRequiredApprovalsBySpecItem((prev) => {
      const next = { ...prev }
      const current = Array.isArray(next[String(specItemId)]) ? next[String(specItemId)] : []
      next[String(specItemId)] = current.map((item) => (
        item.key === requirementKey
          ? { ...item, ...updates }
          : item
      ))
      return next
    })
  }

  const reloadFullscreenDashboard = async () => {
    if (!effectiveBidPackageId) return
    const dashboardData = await fetchBidPackageDashboard(effectiveBidPackageId)
    const specItems = Array.isArray(dashboardData?.spec_items) ? dashboardData.spec_items : []
    const approvalsBySpecItem = specItems.reduce((acc, item) => {
      if (item?.id != null) acc[String(item.id)] = Array.isArray(item.required_approvals) ? item.required_approvals : []
      return acc
    }, {})
    const componentsBySpecItem = specItems.reduce((acc, item) => {
      if (item?.id != null) acc[String(item.id)] = Array.isArray(item.approval_components) ? item.approval_components : []
      return acc
    }, {})
    const uploadsBySpecItem = specItems.reduce((acc, item) => {
      if (item?.id != null) acc[String(item.id)] = Array.isArray(item.uploads) ? item.uploads : []
      return acc
    }, {})
    setFullscreenRequiredApprovalColumns(Array.isArray(dashboardData?.required_approval_columns) ? dashboardData.required_approval_columns : [])
    setFullscreenRequiredApprovalsBySpecItem(approvalsBySpecItem)
    setFullscreenApprovalComponentsBySpecItem(componentsBySpecItem)
    setFullscreenLineItemUploadsBySpecItem(uploadsBySpecItem)
  }

  const createFullscreenApprovalComponent = async ({ specItemId }) => {
    if (!effectiveBidPackageId) return
    try {
      const result = await createSpecItemApprovalComponent({ bidPackageId: effectiveBidPackageId, specItemId })
      const createdComponent = result?.component
      if (createdComponent && createdComponent.id != null) {
        setFullscreenApprovalComponentsBySpecItem((prev) => {
          const next = { ...prev }
          const current = Array.isArray(next[String(specItemId)]) ? next[String(specItemId)] : []
          if (current.some((component) => String(component.id) === String(createdComponent.id))) {
            return prev
          }
          next[String(specItemId)] = [...current, createdComponent]
            .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0))
          return next
        })
      }
      await reloadFullscreenDashboard()
    } catch (error) {
      setStatusMessage(error.message)
    }
  }

  const renameFullscreenApprovalComponent = async ({ specItemId, componentId, label }) => {
    if (!effectiveBidPackageId) return
    setLoading(true)
    setStatusMessage('Saving sub-row label...')
    try {
      await updateSpecItemApprovalComponent({ bidPackageId: effectiveBidPackageId, specItemId, componentId, label })
      await reloadFullscreenDashboard()
      setStatusMessage('Sub-row label saved.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteFullscreenApprovalComponent = async ({ specItemId, componentId }) => {
    if (!effectiveBidPackageId) return
    setFullscreenApprovalComponentsBySpecItem((prev) => {
      const next = { ...prev }
      const current = Array.isArray(next[String(specItemId)]) ? next[String(specItemId)] : []
      next[String(specItemId)] = current.filter((component) => String(component.id) !== String(componentId))
      return next
    })
    try {
      await deleteSpecItemApprovalComponent({ bidPackageId: effectiveBidPackageId, specItemId, componentId })
      await reloadFullscreenDashboard()
    } catch (error) {
      setStatusMessage(error.message)
      await reloadFullscreenDashboard()
    }
  }

  const activateFullscreenComponentRequirement = async ({ specItemId, componentId, requirementKey }) => {
    if (!effectiveBidPackageId) return
    setLoading(true)
    setStatusMessage('Activating sub-row approval...')
    try {
      await activateSpecItemComponentRequirement({ bidPackageId: effectiveBidPackageId, specItemId, componentId, requirementKey })
      await reloadFullscreenDashboard()
      setStatusMessage('Sub-row approval activated.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const deactivateFullscreenComponentRequirement = async ({ specItemId, componentId, requirementKey }) => {
    if (!effectiveBidPackageId) return
    await deactivateSpecItemComponentRequirement({ bidPackageId: effectiveBidPackageId, specItemId, componentId, requirementKey })
    updateFullscreenRequirement({
      specItemId,
      requirementKey,
      componentId,
      updates: {
        status: 'inactive',
        approved: false,
        approved_at: null,
        approved_by: null,
        needs_fix_dates: [],
        ownership: 'inactive'
      }
    })
  }

  const startEditingComponent = (row, component) => {
    setEditingComponentKey(`${row.spec_item_id}:${component.id}`)
    setEditingComponentLabel(component.label || '')
  }

  const stopEditingComponent = () => {
    setEditingComponentKey(null)
    setEditingComponentLabel('')
  }

  const saveComponentLabel = async ({ row, component, nextLabel }) => {
    const trimmed = String(nextLabel || '').trim()
    if (!trimmed || trimmed === component.label) {
      stopEditingComponent()
      return
    }
    if (onRenameApprovalComponent) {
      await onRenameApprovalComponent({ specItemId: row.spec_item_id, componentId: component.id, label: trimmed })
    } else {
      await renameFullscreenApprovalComponent({ specItemId: row.spec_item_id, componentId: component.id, label: trimmed })
    }
    stopEditingComponent()
  }

  useEffect(() => {
    if (forcedBidPackageId) return
    const loadBidPackages = async () => {
      setLoadingPackages(true)
      try {
        const payload = await fetchBidPackages()
        const list = payload.bid_packages || []
        setBidPackages(list)
        if (list.length > 0) {
          setSelectedBidPackageId(String(list[0].id))
        }
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setLoadingPackages(false)
      }
    }

    loadBidPackages()
  }, [forcedBidPackageId])

  const loadComparisonForBidPackage = async (
    bidPackageId,
    {
      dealerPriceMode: requestedDealerPriceMode = {},
      cellPriceMode: requestedCellPriceMode = {},
      excludedSpecItemIds: requestedExcludedSpecItemIds = [],
      includeInactive: requestedIncludeInactive = false,
      responderSort: requestedResponderSort = DEFAULT_COMPARISON_VIEW_STATE.responderSort,
      comparisonMode: requestedComparisonMode = DEFAULT_COMPARISON_VIEW_STATE.comparisonMode,
      showUnitPriceColumn: requestedShowUnitPriceColumn = DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn,
      showProductColumn: requestedShowProductColumn = DEFAULT_COMPARISON_VIEW_STATE.showProductColumn,
      showBrandColumn: requestedShowBrandColumn = DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn,
      showLeadTimeColumn: requestedShowLeadTimeColumn = DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn,
      showDealerNotesColumn: requestedShowDealerNotesColumn = DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn,
      silent: requestedSilent = false
    } = {}
  ) => {
    if (!bidPackageId) return

    if (!requestedSilent) setLoading(true)

    try {
      const payload = await fetchComparison(bidPackageId, {
        dealerPriceMode: requestedDealerPriceMode,
        cellPriceMode: requestedCellPriceMode,
        excludedSpecItemIds: requestedExcludedSpecItemIds,
        includeInactive: requestedIncludeInactive
      })
      setData({ dealers: payload.dealers || [], rows: payload.rows || [] })
      setAwardedBidId(payload.awarded_bid_id ?? null)
      setAwardedAt(payload.awarded_at || null)
      setPackageAwardStatus(payload.package_award_status || 'not_awarded')
      setAwardedRowCount(Number(payload.awarded_row_count || 0))
      setEligibleRowCount(Number(payload.eligible_row_count || 0))
      setAwardWinnerScope(payload.award_winner_scope || 'none')
      setPendingRowSelections({})
      setActiveGeneralFields(payload.active_general_fields || [
        'delivery_amount',
        'install_amount',
        'escalation_amount',
        'contingency_amount',
        'sales_tax_amount'
      ])
      setVisibleDealerIds((payload.dealers || []).map((dealer) => dealer.invite_id))
      const nextExcluded = Array(payload.excluded_spec_item_ids || requestedExcludedSpecItemIds || []).map((id) => String(id))
      setExcludedRowIds(nextExcluded)
      if (
        normalizeExcludedIds(requestedExcludedSpecItemIds).length > 0 &&
        !excludedIdsMatch(requestedExcludedSpecItemIds, payload.excluded_spec_item_ids || [])
      ) {
        await updateBidPackageAwardScope({
          bidPackageId,
          excludedSpecItemIds: requestedExcludedSpecItemIds
        })
      }
      setDealerPriceMode((payload.dealers || []).reduce((acc, dealer) => {
        const requestedMode = requestedDealerPriceMode?.[dealer.invite_id] || requestedDealerPriceMode?.[String(dealer.invite_id)]
        acc[dealer.invite_id] = requestedMode === 'alt' ? 'alt' : 'bod'
        return acc
      }, {}))
      setCellPriceMode(Object.fromEntries(
        Object.entries(requestedCellPriceMode || {}).filter(([, mode]) => mode === 'alt' || mode === 'bod')
      ))
      setResponderSort(DEFAULT_COMPARISON_VIEW_STATE.responderSort)
      setComparisonMode(requestedComparisonMode || DEFAULT_COMPARISON_VIEW_STATE.comparisonMode)
      setShowUnitPriceColumn(typeof requestedShowUnitPriceColumn === 'boolean' ? requestedShowUnitPriceColumn : DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn)
      setShowProductColumn(typeof requestedShowProductColumn === 'boolean' ? requestedShowProductColumn : DEFAULT_COMPARISON_VIEW_STATE.showProductColumn)
      setShowBrandColumn(typeof requestedShowBrandColumn === 'boolean' ? requestedShowBrandColumn : DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn)
      setShowLeadTimeColumn(typeof requestedShowLeadTimeColumn === 'boolean' ? requestedShowLeadTimeColumn : DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn)
      setShowDealerNotesColumn(typeof requestedShowDealerNotesColumn === 'boolean' ? requestedShowDealerNotesColumn : DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn)
      setLoadedBidPackageId(String(bidPackageId))
      storeComparisonSnapshot(String(bidPackageId), {
        dealers: payload.dealers || [],
        rows: payload.rows || [],
        activeGeneralFields: payload.active_general_fields || [
          'delivery_amount',
          'install_amount',
          'escalation_amount',
          'contingency_amount',
          'sales_tax_amount'
        ],
        awardedBidId: payload.awarded_bid_id ?? null,
        awardedAt: payload.awarded_at || null,
        packageAwardStatus: payload.package_award_status || 'not_awarded',
        awardedRowCount: Number(payload.awarded_row_count || 0),
        eligibleRowCount: Number(payload.eligible_row_count || 0),
        awardWinnerScope: payload.award_winner_scope || 'none'
      })
      setStatusMessage('')
    } catch (error) {
      setData({ dealers: [], rows: [] })
      setAwardedBidId(null)
      setAwardedAt(null)
      setPackageAwardStatus('not_awarded')
      setAwardedRowCount(0)
      setEligibleRowCount(0)
      setAwardWinnerScope('none')
      setPendingRowSelections({})
      setStatusMessage(error.message)
    } finally {
      if (!requestedSilent) setLoading(false)
    }
  }

  useEffect(() => {
    if (!forcedBidPackageId) return
    setSelectedBidPackageId(String(forcedBidPackageId))
    const storedState = loadStoredComparisonState(String(forcedBidPackageId))
    setExcludedRowIds(Array.isArray(storedState?.excludedSpecItemIds) ? storedState.excludedSpecItemIds : [])
    if (embedded && awardedWorkspace) {
      setLoadedBidPackageId(String(forcedBidPackageId))
      return
    }
    loadComparisonForBidPackage(String(forcedBidPackageId), {
      ...storedState,
      includeInactive: includeInactiveRows,
      silent: true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedBidPackageId, includeInactiveRows])

  useEffect(() => {
    const orderedVisibleIds = Array.isArray(forcedVisibleDealerIds)
      ? forcedVisibleDealerIds
      : fullscreenVisibleDealerIds
    if (!Array.isArray(orderedVisibleIds)) return
    const available = new Set((data.dealers || []).map((dealer) => String(dealer.invite_id)))
    const normalized = orderedVisibleIds
      .map((id) => String(id))
      .filter((id) => available.has(id))
    setVisibleDealerIds(normalized.map((id) => {
      const parsed = Number(id)
      return Number.isFinite(parsed) ? parsed : id
    }))
  }, [forcedVisibleDealerIds, fullscreenVisibleDealerIds, data.dealers])

  useEffect(() => {
    if (!launchedFromDashboard || embedded) return
    if (!loadedBidPackageId) return
    if (!isAwardedWorkspace) {
      setFullscreenRequiredApprovalColumns([])
      setFullscreenRequiredApprovalsBySpecItem({})
      setFullscreenApprovalComponentsBySpecItem({})
      setFullscreenLineItemUploadsBySpecItem({})
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const dashboardData = await fetchBidPackageDashboard(loadedBidPackageId)
        if (cancelled) return
        const specItems = Array.isArray(dashboardData?.spec_items) ? dashboardData.spec_items : []
        const approvalsBySpecItem = specItems.reduce((acc, item) => {
          if (item?.id != null) {
            acc[String(item.id)] = Array.isArray(item.required_approvals) ? item.required_approvals : []
          }
          return acc
        }, {})
        const componentsBySpecItem = specItems.reduce((acc, item) => {
          if (item?.id != null) {
            acc[String(item.id)] = Array.isArray(item.approval_components) ? item.approval_components : []
          }
          return acc
        }, {})
        const uploadsBySpecItem = specItems.reduce((acc, item) => {
          if (item?.id != null) {
            acc[String(item.id)] = Array.isArray(item.uploads) ? item.uploads : []
          }
          return acc
        }, {})
        setFullscreenRequiredApprovalColumns(Array.isArray(dashboardData?.required_approval_columns) ? dashboardData.required_approval_columns : [])
        setFullscreenRequiredApprovalsBySpecItem(approvalsBySpecItem)
        setFullscreenApprovalComponentsBySpecItem(componentsBySpecItem)
        setFullscreenLineItemUploadsBySpecItem(uploadsBySpecItem)
      } catch (_error) {
        if (!cancelled) {
          setFullscreenRequiredApprovalColumns([])
          setFullscreenRequiredApprovalsBySpecItem({})
          setFullscreenApprovalComponentsBySpecItem({})
          setFullscreenLineItemUploadsBySpecItem({})
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [launchedFromDashboard, embedded, loadedBidPackageId, isAwardedWorkspace])

  const loadComparison = async () => {
    if (!selectedBidPackageId) return
    const hasInMemoryState = (
      Object.keys(dealerPriceMode).length > 0 ||
      Object.keys(cellPriceMode).length > 0 ||
      excludedRowIds.length > 0 ||
      responderSort !== DEFAULT_COMPARISON_VIEW_STATE.responderSort ||
      comparisonMode !== DEFAULT_COMPARISON_VIEW_STATE.comparisonMode ||
      showUnitPriceColumn !== DEFAULT_COMPARISON_VIEW_STATE.showUnitPriceColumn ||
      showProductColumn !== DEFAULT_COMPARISON_VIEW_STATE.showProductColumn ||
      showBrandColumn !== DEFAULT_COMPARISON_VIEW_STATE.showBrandColumn ||
      showLeadTimeColumn !== DEFAULT_COMPARISON_VIEW_STATE.showLeadTimeColumn ||
      showDealerNotesColumn !== DEFAULT_COMPARISON_VIEW_STATE.showDealerNotesColumn
    )
    const state = hasInMemoryState
      ? {
          dealerPriceMode,
          cellPriceMode,
          excludedSpecItemIds: excludedRowIds,
          responderSort,
          comparisonMode,
          showUnitPriceColumn,
          showProductColumn,
          showBrandColumn,
          showLeadTimeColumn,
          showDealerNotesColumn
        }
      : loadStoredComparisonState(String(selectedBidPackageId))
    await loadComparisonForBidPackage(selectedBidPackageId, {
      ...state,
      includeInactive: includeInactiveRows
    })
  }

  const reloadCurrentComparison = async ({ silent = false } = {}) => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
    if (!bidPackageId) return
    await loadComparisonForBidPackage(String(bidPackageId), {
      dealerPriceMode: dealerPriceModeRef.current,
      cellPriceMode: cellPriceModeRef.current,
      excludedSpecItemIds: excludedRowIdsRef.current,
      includeInactive: includeInactiveRows,
      responderSort: responderSortRef.current,
      comparisonMode: comparisonModeRef.current,
      showUnitPriceColumn: showUnitPriceColumnRef.current,
      showProductColumn: showProductColumnRef.current,
      showBrandColumn: showBrandColumnRef.current,
      showLeadTimeColumn: showLeadTimeColumnRef.current,
      showDealerNotesColumn: showDealerNotesColumnRef.current,
      silent
    })
  }

  const deactivateComparisonItem = async (row) => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
    if (!bidPackageId) return
    setLoading(true)
    setStatusMessage(`Deactivating ${row.sku || row.spec_item_id}...`)
    try {
      await deactivateSpecItem({ bidPackageId, specItemId: row.spec_item_id })
      setStatusMessage('Line item deactivated.')
      await reloadCurrentComparison()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const reactivateComparisonItem = async (row) => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
    if (!bidPackageId) return
    setLoading(true)
    setStatusMessage(`Re-activating ${row.sku || row.spec_item_id}...`)
    try {
      await reactivateSpecItem({ bidPackageId, specItemId: row.spec_item_id })
      setStatusMessage('Line item re-activated.')
      await reloadCurrentComparison()
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loadedBidPackageId) return
    reloadCurrentComparison({ silent: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedBidPackageId])

  const resetComparisonView = async () => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId
    if (!bidPackageId) return
    clearStoredComparisonState(String(bidPackageId))
    await loadComparisonForBidPackage(String(bidPackageId), {
      dealerPriceMode: {},
      cellPriceMode: {},
      excludedSpecItemIds: [],
      includeInactive: includeInactiveRows,
      ...DEFAULT_COMPARISON_VIEW_STATE
    })
  }

  const effectiveChoice = (row, cell) => {
    if (!cell) return null
    if (cell.has_bod_price && cell.has_alt_price) {
      const modeKey = cellModeKey(row.spec_item_id, cell.invite_id)
      const cellMode = cellPriceMode[modeKey]
      if (cellMode === 'alt' || cellMode === 'bod') return cellMode
      const preferred = dealerPriceMode[cell.invite_id] || 'bod'
      return preferred === 'alt' ? 'alt' : 'bod'
    }
    if (cell.has_bod_price) return 'bod'
    if (cell.has_alt_price) return 'alt'
    return null
  }

  const effectiveUnitPrice = (row, cell) => {
    if (!cell) return null
    const choice = effectiveChoice(row, cell)
    if (choice === 'bod') return cell.bod_unit_price
    if (choice === 'alt') return cell.alt_unit_price
    return cell.unit_price
  }

  const effectiveQuantity = (row, cell) => {
    const cellQuantity = numberOrNull(cell?.quantity)
    if (cellQuantity != null) return cellQuantity
    return numberOrNull(row.quantity)
  }

  const effectiveExtendedAmount = (row, cell, unitPriceValue = null) => {
    const unitPrice = unitPriceValue == null ? effectiveUnitPrice(row, cell) : unitPriceValue
    return extendedAmount(unitPrice, effectiveQuantity(row, cell))
  }

  const dynamicRowAverage = (row) => {
    const prices = (row.dealers || [])
      .map((cell) => numberOrNull(effectiveUnitPrice(row, cell)))
      .filter((value) => value != null)

    if (prices.length === 0) return null
    return prices.reduce((sum, value) => sum + value, 0) / prices.length
  }

  const dynamicRowAverageExtended = (row) => {
    const extendedValues = (row.dealers || [])
      .map((cell) => numberOrNull(effectiveExtendedAmount(row, cell)))
      .filter((value) => value != null)

    if (extendedValues.length === 0) return null
    return extendedValues.reduce((sum, value) => sum + value, 0) / extendedValues.length
  }

  const dynamicRowBest = (row) => {
    const prices = (row.dealers || [])
      .map((cell) => numberOrNull(effectiveUnitPrice(row, cell)))
      .filter((value) => value != null)
    if (prices.length === 0) return null
    return Math.min(...prices)
  }

  const excludedRowIdSet = useMemo(
    () => new Set(normalizeExcludedIds(excludedRowIds)),
    [excludedRowIds]
  )
  const rowIncluded = (row) => !excludedRowIdSet.has(String(row.spec_item_id))
  const activeRows = (data.rows || []).filter((row) => rowIncluded(row))
  const awardProgressLabel = `${awardedRowCount} / ${eligibleRowCount || 0}`

  const rowPendingBidId = (row) => pendingRowSelections[String(row.spec_item_id)] ?? null
  const rowHasPendingSelection = (row) => rowPendingBidId(row) != null
  const rowCommittedBidId = (row) => (rowHasPendingSelection(row) ? null : row.awarded_bid_id)
  const rowCommittedInviteId = (row) => (rowHasPendingSelection(row) ? null : row.awarded_invite_id)
  const rowCommittedPriceSource = (row) => (rowHasPendingSelection(row) ? null : row.awarded_price_source)

  const selectableDealerForRow = (row, dealer) => {
    if (!dealer?.bid_id) return false
    const cell = (row.dealers || []).find((entry) => entry.invite_id === dealer.invite_id)
    return numberOrNull(effectiveUnitPrice(row, cell)) != null
  }

  const updatePendingSelection = (row, dealer) => {
    if (!selectableDealerForRow(row, dealer) || historyModeActive) return
    const isCommittedDealer = row.awarded_bid_id != null && String(row.awarded_bid_id) === String(dealer.bid_id)
    if (isCommittedDealer) {
      setPendingRowSelections((prev) => {
        const next = { ...prev }
        delete next[String(row.spec_item_id)]
        return next
      })
      setPendingClearedRowIds((prev) => ({
        ...prev,
        [String(row.spec_item_id)]: true
      }))
      return
    }
    setPendingRowSelections((prev) => ({
      ...prev,
      [String(row.spec_item_id)]: dealer.bid_id
    }))
  }

  const clearPendingSelections = () => {
    setPendingRowSelections({})
  }

  const buildPendingAwardSelections = () => {
    const selections = Object.entries(pendingRowSelections).flatMap(([specItemId, bidId]) => {
      const row = (data.rows || []).find((entry) => String(entry.spec_item_id) === String(specItemId))
      if (!row) return []
      const dealer = (data.dealers || []).find((entry) => String(entry.bid_id) === String(bidId))
      if (!dealer) return []
      const cell = (row.dealers || []).find((entry) => entry.invite_id === dealer.invite_id)
      const choice = effectiveChoice(row, cell)
      const unitPrice = effectiveUnitPrice(row, cell)
      const extendedPrice = effectiveExtendedAmount(row, cell, unitPrice)
      if (unitPrice == null) return []

      return [{
        spec_item_id: row.spec_item_id,
        bid_id: dealer.bid_id,
        price_source: choice === 'alt' ? 'alt' : 'bod',
        unit_price_snapshot: unitPrice,
        extended_price_snapshot: extendedPrice
      }]
    })

    const selectionsByBidId = selections.reduce((acc, selection) => {
      const key = String(selection.bid_id)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const dealerSummaries = Object.entries(selectionsByBidId)
      .map(([bidId, rowCount]) => {
        const dealer = (data.dealers || []).find((entry) => String(entry.bid_id) === bidId)
        if (!dealer) return null
        return {
          bidId,
          rowCount,
          label: dealerDisplayLabel(dealer.dealer_name, dealer.dealer_email)
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.rowCount - a.rowCount || a.label.localeCompare(b.label))
    return {
      selections,
      dealerSummaries
    }
  }

  const openAwardConfirmation = () => {
    if (!effectiveBidPackageId) return
    const plan = buildPendingAwardSelections()
    if (plan.selections.length === 0) return
    setAwardConfirmModal(plan)
  }

  const closeAwardConfirmation = () => {
    if (awardSubmitting) return
    setAwardConfirmModal(null)
  }

  const commitPendingSelections = async (preparedSelections = null) => {
    if (!effectiveBidPackageId) return
    const selections = Array.isArray(preparedSelections) ? preparedSelections : buildPendingAwardSelections().selections
    if (selections.length === 0) return

    setAwardSubmitting(true)
    try {
      const awardResult = await awardBidRows({ bidPackageId: effectiveBidPackageId, selections })
      if (awardResult) {
        setAwardedBidId(awardResult.awarded_bid_id ?? null)
        setAwardedAt(awardResult.awarded_at || null)
        setPackageAwardStatus(awardResult.package_award_status || 'not_awarded')
        setAwardedRowCount(Number(awardResult.awarded_row_count || 0))
        setEligibleRowCount(Number(awardResult.eligible_row_count || 0))
        setAwardWinnerScope(awardResult.award_winner_scope || 'none')
      }
      await reloadCurrentComparison({ silent: true })
      if (typeof onAwardChanged === 'function') {
        await onAwardChanged()
      }
      if (awardResult) {
        setAwardedBidId(awardResult.awarded_bid_id ?? null)
        setAwardedAt(awardResult.awarded_at || null)
        setPackageAwardStatus(awardResult.package_award_status || 'not_awarded')
        setAwardedRowCount(Number(awardResult.awarded_row_count || 0))
        setEligibleRowCount(Number(awardResult.eligible_row_count || 0))
        setAwardWinnerScope(awardResult.award_winner_scope || 'none')
      }
      setAwardConfirmModal(null)
      setStatusMessage('')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setAwardSubmitting(false)
    }
  }

  const selectDealerForAllRows = (dealer) => {
    if (historyModeActive) return
    setPendingRowSelections((prev) => {
      const next = { ...prev }
      activeRows.forEach((row) => {
        if (!selectableDealerForRow(row, dealer)) return
        if (rowCommittedBidId(row) === dealer.bid_id) return
        next[String(row.spec_item_id)] = dealer.bid_id
      })
      return next
    })
  }

  const avgSubtotal = activeRows.reduce((sum, row) => {
    const value = dynamicRowAverageExtended(row)
    return value == null ? sum : sum + value
  }, 0)

  const dealerTotalsById = (data.dealers || []).reduce((acc, dealer) => {
    const summary = activeRows.reduce((memo, row) => {
      const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
      const effectivePrice = effectiveUnitPrice(row, cell)
      const value = effectiveExtendedAmount(row, cell, effectivePrice)
      if (value != null) memo.subtotal += value
      if (String(row.awarded_invite_id || '') === String(dealer.invite_id)) {
        const awardedValue = numberOrNull(row.awarded_extended_price_snapshot)
        if (awardedValue != null) memo.awardedSubtotal += awardedValue
      }
      return memo
    }, { subtotal: 0, awardedSubtotal: 0 })

    const subtotal = summary.subtotal
    const awardedSubtotal = summary.awardedSubtotal
    const delivery = numberOrNull(dealer.delivery_amount) ?? 0
    const install = numberOrNull(dealer.install_amount) ?? 0
    const escalation = numberOrNull(dealer.escalation_amount) ?? 0
    const contingency = numberOrNull(dealer.contingency_amount) ?? 0
    const salesTax = numberOrNull(dealer.sales_tax_amount) ?? 0
    const deliveryPercent = numberOrNull(dealer.delivery_percent)
    const installPercent = numberOrNull(dealer.install_percent)
    const escalationPercent = numberOrNull(dealer.escalation_percent)
    const contingencyPercent = numberOrNull(dealer.contingency_percent)
    const salesTaxPercent = numberOrNull(dealer.sales_tax_percent)
    const awardedDelivery = deliveryPercent != null ? awardedSubtotal * (deliveryPercent / 100) : delivery
    const awardedInstall = installPercent != null ? awardedSubtotal * (installPercent / 100) : install
    const awardedEscalation = escalationPercent != null ? awardedSubtotal * (escalationPercent / 100) : escalation
    const awardedContingency = contingencyPercent != null ? awardedSubtotal * (contingencyPercent / 100) : contingency
    const awardedSalesTax = salesTaxPercent != null ? awardedSubtotal * (salesTaxPercent / 100) : salesTax
    const total = subtotal +
      (activeGeneralFields.includes('delivery_amount') ? delivery : 0) +
      (activeGeneralFields.includes('install_amount') ? install : 0) +
      (activeGeneralFields.includes('escalation_amount') ? escalation : 0) +
      (activeGeneralFields.includes('contingency_amount') ? contingency : 0) +
      (activeGeneralFields.includes('sales_tax_amount') ? salesTax : 0)
    const awardedTotal = awardedSubtotal +
      (activeGeneralFields.includes('delivery_amount') ? awardedDelivery : 0) +
      (activeGeneralFields.includes('install_amount') ? awardedInstall : 0) +
      (activeGeneralFields.includes('escalation_amount') ? awardedEscalation : 0) +
      (activeGeneralFields.includes('contingency_amount') ? awardedContingency : 0) +
      (activeGeneralFields.includes('sales_tax_amount') ? awardedSalesTax : 0)
    acc[dealer.invite_id] = {
      subtotal,
      awardedSubtotal,
      delivery,
      install,
      escalation,
      contingency,
      salesTax,
      awardedDelivery,
      awardedInstall,
      awardedEscalation,
      awardedContingency,
      awardedSalesTax,
      total,
      awardedTotal
    }
    return acc
  }, {})

  useEffect(() => {
    const validKeys = new Set(
      (data.rows || []).flatMap((row) =>
        (row.dealers || [])
          .filter((cell) => cell?.has_bod_price && cell?.has_alt_price)
          .map((cell) => cellModeKey(row.spec_item_id, cell.invite_id))
      )
    )
    setCellPriceMode((prev) => Object.fromEntries(
      Object.entries(prev).filter(([key]) => validKeys.has(key))
    ))
  }, [data.rows])

  useEffect(() => {
    const knownIds = new Set((data.rows || []).map((row) => String(row.spec_item_id)))
    if (knownIds.size === 0) return
    applyExcludedRowIds((current) => current.filter((id) => knownIds.has(String(id))))
  }, [data.rows])

  useEffect(() => {
    if (!effectiveBidPackageId) return
    storeComparisonState(String(effectiveBidPackageId), {
      dealerPriceMode,
      cellPriceMode,
      excludedSpecItemIds: excludedRowIds,
      responderSort,
      comparisonMode,
      showUnitPriceColumn,
      showProductColumn,
      showBrandColumn,
      showLeadTimeColumn,
      showDealerNotesColumn
    })
  }, [
    effectiveBidPackageId,
    dealerPriceMode,
    cellPriceMode,
    excludedRowIds,
    responderSort,
    comparisonMode,
    showUnitPriceColumn,
    showProductColumn,
    showBrandColumn,
    showLeadTimeColumn,
    showDealerNotesColumn
  ])

  useEffect(() => {
    if (typeof onExcludedRowsChanged === 'function') {
      onExcludedRowsChanged(excludedRowIds.map((id) => String(id)))
    }
  }, [excludedRowIds, onExcludedRowsChanged])

  useEffect(() => {
    if (typeof onAwardSummaryChanged === 'function') {
      onAwardSummaryChanged({
        packageAwardStatus,
        awardedRowCount,
        eligibleRowCount,
        awardWinnerScope
      })
    }
  }, [packageAwardStatus, awardedRowCount, eligibleRowCount, awardWinnerScope, onAwardSummaryChanged])

  const toggleRowIncluded = async (specItemId) => {
    const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
    if (!bidPackageId) return
    const key = String(specItemId)
    const previousExcluded = Array.isArray(excludedRowIdsRef.current)
      ? [...excludedRowIdsRef.current]
      : []
    const nextExcluded = previousExcluded.some((id) => String(id) === key)
      ? previousExcluded.filter((id) => String(id) !== key)
      : [...previousExcluded, key]

    applyExcludedRowIds(nextExcluded)
    try {
      const response = await updateBidPackageAwardScope({
        bidPackageId,
        excludedSpecItemIds: nextExcluded
      })
      if (response && Array.isArray(response.excluded_spec_item_ids)) {
        applyExcludedRowIds(response.excluded_spec_item_ids)
      }
      if (response) {
        setPackageAwardStatus(response.package_award_status || 'not_awarded')
        setAwardedRowCount(Number(response.awarded_row_count || 0))
        setEligibleRowCount(Number(response.eligible_row_count || 0))
        setAwardWinnerScope(response.award_winner_scope || 'none')
      }
    } catch (error) {
      setStatusMessage(error.message)
      applyExcludedRowIds(previousExcluded)
    }
  }

  const sortedDealers = useMemo(() => {
    const sortedDealersByTotal = [...(data.dealers || [])].sort((a, b) => {
      const totalA = dealerTotalsById[a.invite_id]?.total || 0
      const totalB = dealerTotalsById[b.invite_id]?.total || 0
      return totalA - totalB
    })
    const orderedVisibleIds = Array.isArray(forcedVisibleDealerIds)
      ? forcedVisibleDealerIds
      : fullscreenVisibleDealerIds
    const availableByInviteId = new Map((data.dealers || []).map((dealer) => [String(dealer.invite_id), dealer]))
    if (!Array.isArray(orderedVisibleIds)) return sortedDealersByTotal
    const ordered = visibleDealerIds
      .map((id) => availableByInviteId.get(String(id)))
      .filter(Boolean)
    return ordered
  }, [data.dealers, dealerTotalsById, forcedVisibleDealerIds, fullscreenVisibleDealerIds, visibleDealerIds])

  const visibleDealerIdSet = useMemo(
    () => new Set((visibleDealerIds || []).map((id) => String(id))),
    [visibleDealerIds]
  )

  const visibleDealers = sortedDealers.filter((dealer) => {
    if (!visibleDealerIdSet.has(String(dealer.invite_id))) return false
    if (!isAwardedWorkspace) return true
    if (awardedBidId) return dealer.bid_id === awardedBidId
    return Number(dealer.awarded_row_count || 0) > 0
  })
  const visibleSubtotals = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.subtotal).filter((v) => Number.isFinite(v))
  const visibleDeliveries = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.delivery).filter((v) => Number.isFinite(v))
  const visibleInstalls = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.install).filter((v) => Number.isFinite(v))
  const visibleEscalations = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.escalation).filter((v) => Number.isFinite(v))
  const visibleContingencies = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.contingency).filter((v) => Number.isFinite(v))
  const visibleSalesTaxes = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.salesTax).filter((v) => Number.isFinite(v))
  const visibleTotals = visibleDealers.map((dealer) => dealerTotalsById[dealer.invite_id]?.total).filter((v) => Number.isFinite(v))

  const avgDelivery = visibleDeliveries.length > 0 ? (visibleDeliveries.reduce((sum, v) => sum + v, 0) / visibleDeliveries.length) : 0
  const avgInstall = visibleInstalls.length > 0 ? (visibleInstalls.reduce((sum, v) => sum + v, 0) / visibleInstalls.length) : 0
  const avgEscalation = visibleEscalations.length > 0 ? (visibleEscalations.reduce((sum, v) => sum + v, 0) / visibleEscalations.length) : 0
  const avgContingency = visibleContingencies.length > 0 ? (visibleContingencies.reduce((sum, v) => sum + v, 0) / visibleContingencies.length) : 0
  const avgSalesTax = visibleSalesTaxes.length > 0 ? (visibleSalesTaxes.reduce((sum, v) => sum + v, 0) / visibleSalesTaxes.length) : 0
  const avgTotal = avgSubtotal +
    (activeGeneralFields.includes('delivery_amount') ? avgDelivery : 0) +
    (activeGeneralFields.includes('install_amount') ? avgInstall : 0) +
    (activeGeneralFields.includes('escalation_amount') ? avgEscalation : 0) +
    (activeGeneralFields.includes('contingency_amount') ? avgContingency : 0) +
    (activeGeneralFields.includes('sales_tax_amount') ? avgSalesTax : 0)

  const bestDealerSubtotal = visibleSubtotals.length > 0 ? Math.min(...visibleSubtotals) : null
  const bestDealerDelivery = visibleDeliveries.length > 0 ? Math.min(...visibleDeliveries) : null
  const bestDealerInstall = visibleInstalls.length > 0 ? Math.min(...visibleInstalls) : null
  const bestDealerEscalation = visibleEscalations.length > 0 ? Math.min(...visibleEscalations) : null
  const bestDealerContingency = visibleContingencies.length > 0 ? Math.min(...visibleContingencies) : null
  const bestDealerSalesTax = visibleSalesTaxes.length > 0 ? Math.min(...visibleSalesTaxes) : null
  const bestDealerTotal = visibleTotals.length > 0 ? Math.min(...visibleTotals) : null
  const awardedSubtotal = activeRows.reduce((sum, row) => {
    const value = numberOrNull(row.awarded_extended_price_snapshot)
    return value == null ? sum : sum + value
  }, 0)
  const awardedSummaryDealer = awardedBidId
    ? visibleDealers.find((dealer) => String(dealer.bid_id) === String(awardedBidId))
    : (visibleDealers.length === 1 ? visibleDealers[0] : null)
  const awardedSummaryTotals = awardedSummaryDealer ? dealerTotalsById[awardedSummaryDealer.invite_id] : null
  const showNextBestDeltaColumn = !isAwardedWorkspace && visibleDealers.length >= 2
  const showAverageColumns = !isAwardedWorkspace && comparisonMode === 'average'
  const showDealerDeltaColumn = !isAwardedWorkspace && (comparisonMode === 'average' || comparisonMode === 'competitive')
  const showDealerNextDeltaColumn = !isAwardedWorkspace && comparisonMode === 'competitive' && showNextBestDeltaColumn
  const comparisonLocked = historyModeActive
  const showDealerAwardColumn = !isAwardedWorkspace && !comparisonLocked
  const showUseColumn = !isAwardedWorkspace
  const showUnitPriceColumnEffective = showUnitPriceColumn
  const showLeadTimeColumnEffective = showLeadTimeColumn
  const showDealerNotesColumnEffective = showDealerNotesColumn
  const showProductColumnEffective = showProductColumn
  const showBrandColumnEffective = showBrandColumn
  const metricColumnsPerResponder = (showUnitPriceColumnEffective ? 1 : 0) + 1 + 1 + (showDealerDeltaColumn ? 1 : 0) + (showDealerNextDeltaColumn ? 1 : 0) + (showDealerAwardColumn ? 1 : 0)
  const optionalColumnsPerResponder = (showLeadTimeColumnEffective ? 1 : 0) + (showDealerNotesColumnEffective ? 1 : 0)
  const dealerColumnsPerResponder = metricColumnsPerResponder + optionalColumnsPerResponder

  const rowVisibleDealerPrices = (row) => (
    visibleDealers
      .map((dealer) => {
        const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
        return numberOrNull(effectiveUnitPrice(row, cell))
      })
      .filter((value) => value != null)
  )

  const rowBestPrice = (row) => {
    const prices = rowVisibleDealerPrices(row)
    if (prices.length === 0) return null
    return Math.min(...prices)
  }

  const sortedUnique = (values) => Array.from(new Set(values.filter((v) => numberOrNull(v) != null))).sort((a, b) => a - b)

  const nextWorseValue = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    if (current == null) return null
    const prices = sortedUnique(values)
    const idx = prices.findIndex((price) => price === current)
    if (idx === -1 || idx >= prices.length - 1) return null
    return prices[idx + 1]
  }

  const betterValue = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    if (current == null) return null
    const prices = sortedUnique(values)
    const idx = prices.findIndex((price) => price === current)
    if (idx <= 0) return null
    return prices[idx - 1]
  }

  const betterDeltaNumeric = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    const better = betterValue(values, currentValue)
    if (current == null || better == null || better === 0) return null
    return ((current - better) / better) * 100
  }

  const betterDeltaDisplay = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    if (current == null) return '—'
    const prices = sortedUnique(values)
    if (prices.length < 2) return '—'
    const idx = prices.findIndex((price) => price === current)
    if (idx === -1) return '—'
    if (idx === 0) return 'NA, Lowest Price'
    const n = betterDeltaNumeric(values, currentValue)
    return n == null ? '—' : percentDisplay(n)
  }

  const nextBestDeltaNumeric = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    const next = nextWorseValue(values, currentValue)
    if (current == null || next == null || current === 0) return null
    const prices = sortedUnique(values)
    const isBest = prices[0] === current
    return isBest ? ((current - next) / current) * 100 : ((next - current) / current) * 100
  }

  const nextBestDeltaDisplay = (values, currentValue) => {
    const current = numberOrNull(currentValue)
    if (current == null) return '—'
    const prices = sortedUnique(values)
    if (prices.length < 2) return '—'
    const idx = prices.findIndex((price) => price === current)
    if (idx === -1) return '—'
    if (idx === prices.length - 1) return 'NA, Highest Price'
    const n = nextBestDeltaNumeric(values, currentValue)
    return n == null ? '—' : percentDisplay(n)
  }

  const sortedRows = useMemo(() => {
    const sourceRows = isAwardedWorkspace ? activeRows : (data.rows || [])
    const rows = [...sourceRows]
    rows.sort((a, b) => {
      const av = String(a?.sku || '')
      const bv = String(b?.sku || '')
      return av.localeCompare(bv)
    })
    return rows
  }, [data.rows, activeRows, isAwardedWorkspace])
  const pendingSelectedRowCount = Object.keys(pendingRowSelections).length
  const dealerByInviteId = useMemo(
    () => new Map((data.dealers || []).map((dealer) => [String(dealer.invite_id), dealer])),
    [data.dealers]
  )

  const openUnapproveModal = (entry) => {
    setUnapproveModal(entry)
  }

  const closeUnapproveModal = () => {
    if (unapproveSaving) return
    setUnapproveModal(null)
  }

  const submitUnapprove = async () => {
    if (!unapproveModal) return

    setUnapproveSaving(true)
    setStatusMessage('Removing approval...')
    try {
      const { specItemId, requirementKey, componentId = null, needsFixDates = [], actionType = 'unapproved' } = unapproveModal

      if (onUnapproveRequirement) {
        await onUnapproveRequirement({ specItemId, requirementKey, componentId, actionType })
      } else if (effectiveBidPackageId) {
        await unapproveSpecItemRequirement({
          bidPackageId: effectiveBidPackageId,
          specItemId,
          requirementKey,
          componentId,
          actionType
        })
        updateFullscreenRequirement({
          specItemId,
          requirementKey,
          componentId,
          updates: {
            status: 'pending',
            approved: false,
            approved_at: null,
            approved_by: null,
            needs_fix_dates: needsFixDates,
            ownership: componentId == null ? 'parent' : 'component'
          }
        })
      }

      setStatusMessage(actionType === 'reset' ? 'Requirement reset to pending.' : 'Approval removed.')
      setUnapproveModal(null)
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setUnapproveSaving(false)
    }
  }

  useEffect(() => {
    const closePopover = () => {
      setActiveSubPopoverKey(null)
      setActiveNotePopoverKey(null)
      setShowActionsMenu(false)
      setShowViewSubmenu(false)
      setShowExportSubmenu(false)
    }
    document.addEventListener('click', closePopover)
    return () => document.removeEventListener('click', closePopover)
  }, [])

  useEffect(() => {
    const updateScrollMetrics = () => {
      const tableWrap = tableScrollRef.current
      const tableInner = tableInnerRef.current
      const tableEl = tableInner?.querySelector('table')
      if (!tableWrap) return
      const contentWidth = Math.max(
        tableInner ? tableInner.scrollWidth : 0,
        tableEl ? Math.ceil(tableEl.getBoundingClientRect().width) : 0,
        tableWrap.scrollWidth
      )
      const max = Math.max(contentWidth - tableWrap.clientWidth, 0)
      setScrollMax(max)
    }

    updateScrollMetrics()
    window.addEventListener('resize', updateScrollMetrics)

    let observer = null
    if (window.ResizeObserver && tableScrollRef.current) {
      observer = new ResizeObserver(updateScrollMetrics)
      observer.observe(tableScrollRef.current)
      if (tableInnerRef.current) observer.observe(tableInnerRef.current)
    }

    return () => {
      window.removeEventListener('resize', updateScrollMetrics)
      if (observer) observer.disconnect()
    }
  }, [sortedRows.length, visibleDealers.length, comparisonMode, showProductColumn, showBrandColumn, showLeadTimeColumn, showDealerNotesColumn])

  const syncFromTable = () => {
    const table = tableScrollRef.current
    if (!table) return
    setTableScrollLeft(table.scrollLeft || 0)
    setTableScrollTop(table.scrollTop || 0)
  }

  useEffect(() => {
    const table = tableScrollRef.current
    if (!table) return
    const sync = () => {
      setTableScrollLeft(table.scrollLeft || 0)
      setTableScrollTop(table.scrollTop || 0)
    }
    sync()
    const frame = window.requestAnimationFrame(sync)
    return () => window.cancelAnimationFrame(frame)
  }, [effectiveBidPackageId, sortedRows.length, visibleDealers.length, isAwardedWorkspace])

  const nudgeHorizontalScroll = (distance) => {
    const table = tableScrollRef.current
    if (!table) return
    const minJump = Math.round(table.clientWidth * 0.78)
    const jump = Math.sign(distance || 1) * Math.max(Math.abs(distance), minJump)
    table.scrollBy({ left: jump, behavior: 'smooth' })
  }

  const handleTableMouseDown = () => {}
  const handleTableMouseMove = () => {}
  const stopTableDragging = () => {}

  useEffect(() => {
    if (!isAwardedWorkspace) return
    const table = tableScrollRef.current
    if (!table) return
    table.scrollLeft = 0
    setTableScrollLeft(0)
  }, [isAwardedWorkspace, effectiveBidPackageId])

  const comparisonExportColumnOrder = useMemo(() => {
    const columns = ['code_tag']
    if (showProductColumnEffective) columns.push('product')
    if (showBrandColumnEffective) columns.push('brand')
    columns.push('designer_qty_uom')
    if (showAverageColumns) {
      columns.push('avg_unit_price')
      columns.push('avg_extended_price')
    }
    columns.push('dealer_qty_uom')
    if (showUnitPriceColumnEffective) columns.push('dealer_unit_price')
    if (showLeadTimeColumnEffective) columns.push('dealer_lead_time_days')
    if (showDealerNotesColumnEffective) columns.push('dealer_notes')
    columns.push('dealer_extended')
    if (showDealerDeltaColumn) columns.push('dealer_delta')
    if (showDealerNextDeltaColumn) columns.push('dealer_next_delta')
    return columns
  }, [
    showProductColumnEffective,
    showBrandColumnEffective,
    showAverageColumns,
    showUnitPriceColumnEffective,
    showLeadTimeColumnEffective,
    showDealerNotesColumnEffective,
    showDealerDeltaColumn,
    showDealerNextDeltaColumn
  ])

  const runBidResponseAnalysis = () => {
    const scopedRows = sortedRows.filter((row) => rowIncluded(row) && row.active !== false)
    const anomalies = []
    const spreadValues = []
    let comparableRowCount = 0
    let tightGroupCount = 0
    let wideGroupCount = 0
    let extremeSpreadCount = 0
    let quantityMismatchCount = 0
    let unitPriceOutlierCount = 0

    scopedRows.forEach((row) => {
      const bidderCells = visibleDealers
        .map((dealer) => {
          const cell = (row.dealers || []).find((entry) => entry.invite_id === dealer.invite_id)
          const unitPrice = numberOrNull(effectiveUnitPrice(row, cell))
          const quantity = numberOrNull(effectiveQuantity(row, cell))
          const extended = numberOrNull(effectiveExtendedAmount(row, cell, unitPrice))
          return {
            inviteId: dealer.invite_id,
            label: dealerDisplayLabel(dealer.dealer_name, dealer.dealer_email),
            unitPrice,
            quantity,
            extended
          }
        })
        .filter((entry) => entry.extended != null)

      if (bidderCells.length < 2) return
      comparableRowCount += 1

      const extendedValues = bidderCells.map((entry) => entry.extended)
      const minExtended = Math.min(...extendedValues)
      const maxExtended = Math.max(...extendedValues)
      const impact = maxExtended - minExtended
      const spreadPct = minExtended > 0 ? ((maxExtended - minExtended) / minExtended) * 100 : null
      if (spreadPct != null) spreadValues.push(spreadPct)

      if (spreadPct != null && spreadPct <= 10) tightGroupCount += 1
      if (spreadPct != null && spreadPct >= 20) wideGroupCount += 1
      if (spreadPct != null && spreadPct >= 35) extremeSpreadCount += 1

      const quantityValues = bidderCells.map((entry) => entry.quantity).filter((value) => value != null)
      const quantityUnique = Array.from(new Set(quantityValues.map((value) => value.toString())))
      const quantityMismatch = quantityUnique.length > 1
      if (quantityMismatch) quantityMismatchCount += 1

      const prices = bidderCells.map((entry) => entry.unitPrice).filter((value) => value != null)
      const medianPrice = median(prices)
      const unitPriceOutlier = prices.length >= 3 && medianPrice != null && medianPrice > 0
        ? prices.some((price) => Math.abs((price - medianPrice) / medianPrice) >= 0.35)
        : false
      if (unitPriceOutlier) unitPriceOutlierCount += 1

      anomalies.push({
        specItemId: row.spec_item_id,
        codeTag: row.sku || '—',
        product: row.product_name || '',
        bidderCount: bidderCells.length,
        spreadPct,
        spreadVsMedian: null,
        impact,
        quantityMismatch,
        unitPriceOutlier,
        minBid: bidderCells.reduce((min, entry) => (min == null || entry.extended < min.extended ? entry : min), null),
        maxBid: bidderCells.reduce((max, entry) => (max == null || entry.extended > max.extended ? entry : max), null),
        reason: ''
      })
    })

    const medianSpread = median(spreadValues)
    const p75Spread = percentile(spreadValues, 0.75)
    const p90Spread = percentile(spreadValues, 0.9)
    const spreadGate = Math.max(35, numberOrNull(p75Spread) || 0)

    anomalies.forEach((row) => {
      row.spreadVsMedian = (row.spreadPct != null && medianSpread != null && medianSpread > 0)
        ? (row.spreadPct / medianSpread)
        : null
    })
    const impactValues = anomalies.map((row) => numberOrNull(row.impact)).filter((value) => value != null)
    const p75Impact = percentile(impactValues, 0.75)
    anomalies.forEach((row) => {
      const lowRelativeSpread = row.spreadVsMedian != null && row.spreadVsMedian < 0.5
      const lowAbsoluteSpread = row.spreadPct != null && row.spreadPct < 35
      const highImpact = p75Impact != null && numberOrNull(row.impact) != null && row.impact >= p75Impact

      const strongRelativeSpread = row.spreadVsMedian != null && row.spreadVsMedian >= 0.75
      const strongAbsoluteSpread = row.spreadPct != null && row.spreadPct >= spreadGate
      row.isAnomaly = Boolean(strongRelativeSpread || strongAbsoluteSpread || row.quantityMismatch || row.unitPriceOutlier)

      if (row.quantityMismatch) {
        row.reason = 'quantity mismatch'
      } else if (row.unitPriceOutlier) {
        row.reason = 'unit price variation'
      } else if ((strongRelativeSpread || strongAbsoluteSpread) && highImpact) {
        row.reason = 'large spread + high impact'
      } else if (strongRelativeSpread || strongAbsoluteSpread) {
        row.reason = 'large spread'
      } else if (highImpact && lowRelativeSpread && lowAbsoluteSpread) {
        row.reason = 'high impact'
      } else {
        row.reason = 'high impact'
      }
    })

    const rankedAnomalies = anomalies
      .filter((row) => row.isAnomaly)
      .sort((a, b) => {
      if (b.impact !== a.impact) return b.impact - a.impact
      const aSpread = a.spreadPct == null ? -1 : a.spreadPct
      const bSpread = b.spreadPct == null ? -1 : b.spreadPct
      if (bSpread !== aSpread) return bSpread - aSpread
      return String(a.codeTag).localeCompare(String(b.codeTag))
    })

    const topAnomalies = rankedAnomalies.slice(0, 8)
    const totalImpact = anomalies.reduce((sum, row) => sum + (numberOrNull(row.impact) || 0), 0)
    const topFiveImpact = anomalies.slice(0, 5).reduce((sum, row) => sum + (numberOrNull(row.impact) || 0), 0)
    const concentrationRatio = totalImpact > 0 ? (topFiveImpact / totalImpact) : 0
    const concentrationLabel = concentrationRatio >= 0.6 ? 'concentrated' : 'diffuse'
    const tightRatio = comparableRowCount > 0 ? (tightGroupCount / comparableRowCount) : 0
    const wideRatio = comparableRowCount > 0 ? (wideGroupCount / comparableRowCount) : 0
    const bidderRanking = visibleDealers
      .map((dealer) => ({
        inviteId: dealer.invite_id,
        label: dealerDisplayLabel(dealer.dealer_name, dealer.dealer_email),
        total: numberOrNull(dealerTotalsById[dealer.invite_id]?.total) || 0
      }))
      .sort((a, b) => a.total - b.total)
    const leader = bidderRanking[0] || null
    const runnerUp = bidderRanking[1] || null
    const third = bidderRanking[2] || null
    const leaderGapDollar = leader && runnerUp ? (runnerUp.total - leader.total) : null
    const leaderGapPct = leader && runnerUp && runnerUp.total > 0
      ? ((runnerUp.total - leader.total) / runnerUp.total) * 100
      : null
    const clearWinner = leaderGapDollar != null && leaderGapPct != null && leaderGapDollar >= 25000 && leaderGapPct >= 3
    const closeTopTier = leaderGapDollar != null && leaderGapPct != null && (leaderGapDollar <= 25000 || leaderGapPct <= 2.5)
    const topThreeRangePct = leader && third && third.total > 0
      ? ((third.total - leader.total) / third.total) * 100
      : null

    const winnerAuditRows = []
    if (leader) {
      scopedRows.forEach((row) => {
        const winnerCell = (row.dealers || []).find((entry) => entry.invite_id === leader.inviteId)
        if (!winnerCell) return
        const winnerQty = numberOrNull(effectiveQuantity(row, winnerCell))
        const winnerUnitPrice = numberOrNull(effectiveUnitPrice(row, winnerCell))
        const winnerExtended = numberOrNull(effectiveExtendedAmount(row, winnerCell, winnerUnitPrice))
        if (winnerExtended == null) return

        const peerCells = visibleDealers
          .filter((dealer) => dealer.invite_id !== leader.inviteId)
          .map((dealer) => {
            const cell = (row.dealers || []).find((entry) => entry.invite_id === dealer.invite_id)
            return {
              qty: numberOrNull(effectiveQuantity(row, cell)),
              unitPrice: numberOrNull(effectiveUnitPrice(row, cell)),
              extended: numberOrNull(effectiveExtendedAmount(row, cell))
            }
          })
          .filter((entry) => entry.extended != null)
        if (peerCells.length === 0) return

        const peerQtys = peerCells.map((entry) => entry.qty).filter((value) => value != null)
        const peerPrices = peerCells.map((entry) => entry.unitPrice).filter((value) => value != null)
        const peerExtended = peerCells.map((entry) => entry.extended).filter((value) => value != null)
        const peerQtyMedian = median(peerQtys)
        const peerPriceMedian = median(peerPrices)
        const peerExtendedMedian = median(peerExtended)
        const qtyLowerFlag = winnerQty != null && peerQtyMedian != null && peerQtyMedian > 0 && winnerQty < (peerQtyMedian * 0.9)
        const priceMuchLowerFlag = winnerUnitPrice != null && peerPriceMedian != null && peerPriceMedian > 0 && winnerUnitPrice < (peerPriceMedian * 0.65)
        const extendedMuchLowerFlag = winnerExtended != null && peerExtendedMedian != null && peerExtendedMedian > 0 && winnerExtended < (peerExtendedMedian * 0.65)
        const rowSpread = topAnomalies.find((entry) => entry.specItemId === row.spec_item_id)
        const varianceFlag = Boolean(rowSpread && ((rowSpread.spreadPct || 0) >= spreadGate || (rowSpread.spreadVsMedian || 0) >= 0.75))
        const quantityMismatch = peerQtys.length > 0 && winnerQty != null
          ? new Set([...peerQtys.map((value) => value.toString()), winnerQty.toString()]).size > 1
          : false
        if (!(qtyLowerFlag || priceMuchLowerFlag || extendedMuchLowerFlag || quantityMismatch || varianceFlag)) return

        const triggers = []
        if (qtyLowerFlag || quantityMismatch) triggers.push('qty mismatch')
        if (priceMuchLowerFlag) triggers.push('winner unit price far below peers')
        if (extendedMuchLowerFlag) triggers.push('winner extended far below peers')
        if (varianceFlag) triggers.push('high row spread')
        const rowImpact = rowSpread ? rowSpread.impact : Math.max(...peerExtended, winnerExtended) - Math.min(...peerExtended, winnerExtended)
        const riskScore = (rowImpact || 0) + (varianceFlag ? 5000 : 0) + (priceMuchLowerFlag ? 3000 : 0) + (qtyLowerFlag ? 2500 : 0)
        winnerAuditRows.push({
          specItemId: row.spec_item_id,
          codeTag: row.sku || '—',
          spreadPct: rowSpread?.spreadPct ?? null,
          spreadVsMedian: rowSpread?.spreadVsMedian ?? null,
          impact: rowImpact,
          reason: triggers.join('; ')
        })
      })
    }
    winnerAuditRows.sort((a, b) => (b.impact || 0) - (a.impact || 0))
    const topWinnerAuditRows = winnerAuditRows.slice(0, 6)
    const topVolatilityRows = topAnomalies
      .filter((row) => (row.spreadPct || 0) >= spreadGate || (row.spreadVsMedian || 0) >= 0.9)
      .slice(0, 8)

    const flaggedRowCount = winnerAuditRows.length
    const priorityRows = topWinnerAuditRows.slice(0, 5).map((row) => row.codeTag)
    const priorityRowCount = priorityRows.length
    const leaderSection = (() => {
      if (leader && runnerUp && leaderGapDollar != null && leaderGapPct != null) {
        if (leaderGapPct <= 3 && third && topThreeRangePct != null && topThreeRangePct <= 3.5) {
          return [`${leader.label}, ${runnerUp.label}, and ${third.label} are within ~${topThreeRangePct.toFixed(1)}% of each other`]
        }
        return [`${leader.label} leads by ${money(leaderGapDollar)} (~${leaderGapPct.toFixed(1)}%) over ${runnerUp.label}`]
      }
      return ['No clear leader based on current comparable totals']
    })()

    const leaderReviewSection = (() => {
      if (priorityRowCount === 0) return ['No standout rows identified in the current leading bid']
      const priorityIsSmallSubset = flaggedRowCount >= Math.max(10, priorityRowCount * 3)
      return [
        priorityIsSmallSubset
          ? 'A small number of rows in the leading bid stand out'
          : `${priorityRowCount} rows in the leading bid stand out`,
        `Review: ${priorityRows.join(', ')}`
      ]
    })()

    const highVarianceRows = topVolatilityRows.map((row) => row.codeTag).filter(Boolean)
    const highVarianceItems = topVolatilityRows.map((row) => ({
      code_tag: row.codeTag,
      spread_pct: row.spreadPct,
      impact: row.impact,
      reason: row.reason,
      highest_bid: row.maxBid?.extended ?? null,
      lowest_bid: row.minBid?.extended ?? null
    }))

    const followUpSection = [
      'Confirm scope and components for flagged rows',
      quantityMismatchCount > 0
        ? 'Verify quantities and units align across bidders'
        : 'Verify pricing assumptions are aligned',
      'Recompute totals after clarification'
    ].slice(0, 3)

    const memoMetrics = []
    if (leader && runnerUp && leaderGapDollar != null) {
      memoMetrics.push({
        key: 'price_gap_amount',
        type: 'currency',
        value: leaderGapDollar,
        display: money(leaderGapDollar),
        label: 'Price gap amount',
        formula: 'runner_up_total - leader_total',
        inputs: {
          leader: `${leader.label}: ${money(leader.total)}`,
          runner_up: `${runnerUp.label}: ${money(runnerUp.total)}`
        },
        represents: 'This is the dollar difference between the top two package totals.',
        why_matters: 'A larger dollar gap usually means ranking is more stable after clarification.'
      })
    }
    if (leader && runnerUp && leaderGapPct != null) {
      memoMetrics.push({
        key: 'price_gap_percent',
        type: 'percent',
        value: leaderGapPct,
        display: `${leaderGapPct.toFixed(1)}%`,
        label: 'Price gap percent',
        formula: '((runner_up_total - leader_total) / runner_up_total) * 100',
        inputs: {
          leader_total: money(leader.total),
          runner_up_total: money(runnerUp.total)
        },
        represents: 'This shows how far apart the top two bidders are in relative terms.',
        why_matters: 'Relative gap helps judge whether small row changes could alter overall rank.'
      })
    }
    if (topThreeRangePct != null && leader && third) {
      memoMetrics.push({
        key: 'top_three_range_pct',
        type: 'percent',
        value: topThreeRangePct,
        display: `${topThreeRangePct.toFixed(1)}%`,
        label: 'Top-three range percent',
        formula: '((third_total - leader_total) / third_total) * 100',
        inputs: {
          leader_total: money(leader.total),
          third_total: money(third.total)
        },
        represents: 'This shows the total-price range from the lowest bidder to the third bidder.',
        why_matters: 'Wider range implies more room for rank shifts after scope and quantity alignment.'
      })
    }
    if (medianSpread != null) {
      memoMetrics.push({
        key: 'median_spread_pct',
        type: 'percent',
        value: medianSpread,
        display: `${medianSpread.toFixed(1)}%`,
        label: 'Median row spread',
        formula: 'median(row_spread_percent values)',
        inputs: {
          comparable_rows: comparableRowCount
        },
        represents: 'This is the typical row-level spread across bidders.',
        why_matters: 'It anchors what is normal so high-spread rows can be evaluated in context.'
      })
    }
    if (p90Spread != null) {
      memoMetrics.push({
        key: 'p90_spread_pct',
        type: 'percent',
        value: p90Spread,
        display: `${p90Spread.toFixed(1)}%`,
        label: '90th percentile row spread',
        formula: '90th percentile(row_spread_percent values)',
        inputs: {
          comparable_rows: comparableRowCount
        },
        represents: 'This is the high-end spread level for the most volatile rows.',
        why_matters: 'Rows near or above this level usually require targeted clarification.'
      })
    }
    memoMetrics.push({
      key: 'spread_threshold_pct',
      type: 'percent',
      value: spreadGate,
      display: `${spreadGate.toFixed(1)}%`,
      label: 'Volatility review threshold',
      formula: 'max(35%, 75th percentile row spread)',
      inputs: {
        '75th percentile spread': p75Spread == null ? '—' : `${p75Spread.toFixed(1)}%`,
        baseline_floor: '35.0%'
      },
      represents: 'This is the spread level used to prioritize rows for clarification.',
      why_matters: 'It balances a fixed floor with package-specific spread behavior.'
    })

    return {
      generatedAt: new Date().toISOString(),
      source: 'deterministic',
      title: '🧠 Bid Analysis',
      meta: {
        bidderCount: visibleDealers.length,
        analyzedRows: comparableRowCount,
        totalRowsInView: scopedRows.length
      },
      spreadContext: {
        median: medianSpread,
        p75: p75Spread,
        p90: p90Spread
      },
      winner: {
        inviteId: leader?.inviteId || null,
        label: leader?.label || null,
        total: leader?.total || null,
        runnerUpLabel: runnerUp?.label || null,
        runnerUpTotal: runnerUp?.total || null,
        gapDollar: leaderGapDollar,
        gapPct: leaderGapPct,
        clearWinner,
        closeTopTier
      },
      leader: leaderSection,
      leader_review: leaderReviewSection,
      high_variance_rows: highVarianceRows,
      high_variance_items: highVarianceItems,
      follow_up: followUpSection,
      flagged_row_count: flaggedRowCount,
      priority_row_count: priorityRowCount,
      priority_rows: priorityRows,
      memo_metrics: memoMetrics,
      topAnomalies: topVolatilityRows,
      winnerAuditRows: topWinnerAuditRows
    }
  }

  const openBidResponseAnalysis = async () => {
    if (analysisBusy || isAwardedWorkspace) return
    setAnalysisBusy(true)
    try {
      const deterministicReport = runBidResponseAnalysis()
      let nextReport = deterministicReport
      if (effectiveBidPackageId) {
        try {
          const aiPayload = await generateComparisonAnalysis({
            bidPackageId: effectiveBidPackageId,
            deterministic: deterministicReport
          })
          nextReport = {
            ...deterministicReport,
            source: aiPayload?.source || 'ai',
            model: aiPayload?.model || null,
            title: typeof aiPayload?.title === 'string' && aiPayload.title.trim()
              ? aiPayload.title.trim()
              : deterministicReport.title,
            leader: Array.isArray(aiPayload?.leader) && aiPayload.leader.length > 0
              ? aiPayload.leader
              : deterministicReport.leader,
            leader_review: Array.isArray(aiPayload?.leader_review) && aiPayload.leader_review.length > 0
              ? aiPayload.leader_review
              : deterministicReport.leader_review,
            high_variance_rows: deterministicReport.high_variance_rows,
            high_variance_items: deterministicReport.high_variance_items,
            follow_up: Array.isArray(aiPayload?.follow_up) && aiPayload.follow_up.length > 0
              ? aiPayload.follow_up
              : deterministicReport.follow_up
          }
        } catch (_error) {
          nextReport = { ...deterministicReport, source: 'deterministic-fallback' }
        }
      }
      setAnalysisModal(normalizeBidAnalysisReport(nextReport))
    } finally {
      setAnalysisBusy(false)
    }
  }

  const normalizeBidAnalysisReport = (report) => {
    const normalizeLines = (value, fallback, max) => {
      const lines = Array.isArray(value) ? value.map((line) => String(line || '').trim()).filter(Boolean).slice(0, max) : []
      return lines.length > 0 ? lines : fallback
    }

    return {
      ...report,
      title: '🧠 Bid Analysis',
      leader: normalizeLines(report?.leader, ['No clear leader based on current comparable totals'], 2),
      leader_review: (() => {
        const base = normalizeLines(report?.leader_review, ['No standout rows identified in the current leading bid'], 2)
        const hasFlaggedRows = Array.isArray(report?.high_variance_rows) && report.high_variance_rows.length > 0
        if (!hasFlaggedRows) return base
        const guidance = 'Look for: scope, quantity, or component differences'
        if (base.some((line) => String(line).toLowerCase() === guidance.toLowerCase())) return base
        return [...base.slice(0, 1), guidance]
      })(),
      high_variance_rows: (() => {
        const rows = Array.isArray(report?.high_variance_rows)
          ? report.high_variance_rows.map((line) => String(line || '').trim()).filter(Boolean)
          : []
        return rows
      })(),
      high_variance_items: Array.isArray(report?.high_variance_items)
        ? report.high_variance_items
            .map((item) => ({
              code_tag: String(item?.code_tag || '').trim(),
              spread_pct: numberOrNull(item?.spread_pct),
              impact: numberOrNull(item?.impact),
              reason: String(item?.reason || '').trim(),
              highest_bid: numberOrNull(item?.highest_bid),
              lowest_bid: numberOrNull(item?.lowest_bid)
            }))
            .filter((item) => item.code_tag)
        : [],
      follow_up: normalizeLines(report?.follow_up, ['Confirm scope alignment for any flagged rows'], 3)
    }
  }

  useEffect(() => {
    if (!analysisModal) setActiveAnalysisPanel(null)
  }, [analysisModal])

  const normalizeAnalysisReason = (value) => {
    const text = String(value || '').toLowerCase()
    if (text.includes('quantity')) return 'quantity mismatch'
    if (text.includes('unit') && text.includes('price')) return 'unit price variation'
    if (text.includes('spread') && text.includes('impact')) return 'large spread + high impact'
    if (text.includes('spread')) return 'large spread'
    return 'high impact'
  }

  const analysisRowDetailsByCode = useMemo(() => {
    if (!analysisModal) return {}
    const byCode = {}
    const addRow = (row = {}) => {
      const code = String(row.code_tag || row.codeTag || '').trim()
      if (!code) return
      byCode[code] = {
        code,
        spread_pct: numberOrNull(row.spread_pct ?? row.spreadPct),
        impact: numberOrNull(row.impact),
        highest_bid: numberOrNull(row.highest_bid ?? row.highestBid),
        lowest_bid: numberOrNull(row.lowest_bid ?? row.lowestBid),
        reason: normalizeAnalysisReason(row.reason)
      }
    }
    ;(analysisModal.high_variance_items || []).forEach(addRow)
    ;(analysisModal.topAnomalies || []).forEach((row) => {
      addRow({
        codeTag: row?.codeTag,
        spreadPct: row?.spreadPct,
        impact: row?.impact,
        highestBid: row?.maxBid?.extended,
        lowestBid: row?.minBid?.extended,
        reason: row?.reason
      })
    })
    ;(analysisModal.winnerAuditRows || []).forEach((row) => {
      addRow({
        codeTag: row?.codeTag,
        spreadPct: row?.spreadPct,
        impact: row?.impact,
        reason: row?.reason
      })
    })
    return byCode
  }, [analysisModal])

  const highVarianceCodes = useMemo(() => {
    const list = Array.isArray(analysisModal?.high_variance_rows) ? analysisModal.high_variance_rows : []
    return Array.from(new Set(list.map((item) => String(item || '').trim()).filter(Boolean)))
  }, [analysisModal])

  const leaderReviewCodes = useMemo(() => {
    const priority = Array.isArray(analysisModal?.priority_rows) ? analysisModal.priority_rows : []
    const priorityCodes = priority.map((item) => String(item || '').trim()).filter(Boolean)
    if (priorityCodes.length > 0) return Array.from(new Set(priorityCodes))
    const reviewLine = (analysisModal?.leader_review || []).find((line) => /^review\s*:/i.test(String(line || '').trim()))
    if (!reviewLine) return []
    return Array.from(new Set(
      String(reviewLine)
        .replace(/^review\s*:/i, '')
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
    ))
  }, [analysisModal])

  const leaderTopRows = useMemo(() => {
    const priority = Array.isArray(analysisModal?.priority_rows) ? analysisModal.priority_rows : []
    if (priority.length > 0) {
      return Array.from(new Set(priority.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 5)
    }
    const rows = Array.isArray(analysisModal?.winnerAuditRows) ? analysisModal.winnerAuditRows : []
    return Array.from(new Set(rows.map((row) => String(row?.codeTag || '').trim()).filter(Boolean))).slice(0, 5)
  }, [analysisModal])

  const leaderSummaryLine = useMemo(() => {
    const line = Array.isArray(analysisModal?.leader) ? analysisModal.leader[0] : ''
    return String(line || '').trim() || 'No clear leader based on current comparable totals'
  }, [analysisModal])

  const leaderReviewSummaryLine = useMemo(() => {
    const lines = Array.isArray(analysisModal?.leader_review) ? analysisModal.leader_review : []
    const firstLine = lines.find((line) => {
      const text = String(line || '').trim()
      if (!text) return false
      if (/^review\s*:/i.test(text)) return false
      if (/^look for\s*:/i.test(text)) return false
      return true
    })
    return firstLine || 'A small number of rows in the leading bid stand out'
  }, [analysisModal])

  const followUpLines = useMemo(() => {
    const lines = Array.isArray(analysisModal?.follow_up) ? analysisModal.follow_up : []
    return lines.map((line) => String(line || '').trim()).filter(Boolean).slice(0, 2)
  }, [analysisModal])

  const toggleLeaderPanel = () => {
    setActiveAnalysisPanel((prev) => (prev?.kind === 'leader' ? null : { kind: 'leader' }))
  }

  const toggleRowPanel = (code, section) => {
    const rowCode = String(code || '').trim()
    if (!rowCode) return
    setActiveAnalysisPanel((prev) => {
      if (prev?.kind === 'row' && prev.code === rowCode && prev.section === section) return null
      return { kind: 'row', code: rowCode, section }
    })
  }

  const handleExportChange = (format, exportType = 'comparison') => {
    if (!effectiveBidPackageId || !format) return
    const url = comparisonExportUrl(
      effectiveBidPackageId,
      dealerPriceMode,
      cellPriceMode,
      format,
      excludedRowIds,
      comparisonMode,
      {
        showProduct: showProductColumn,
        showBrand: showBrandColumn,
        showUnitPrice: showUnitPriceColumn,
        showLeadTime: showLeadTimeColumn,
        showNotes: showDealerNotesColumn
      },
      exportType,
      exportType === 'comparison'
        ? {
          visibleDealerInviteIds: visibleDealers.map((dealer) => dealer.invite_id),
          columnOrder: comparisonExportColumnOrder
        }
        : {}
    )
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const labelColumnsBeforeAverages = (showUseColumn ? 3 : 2) + (showProductColumnEffective ? 1 : 0) + (showBrandColumnEffective ? 1 : 0)
  const baseColumnsBeforeDealers = labelColumnsBeforeAverages + (showAverageColumns ? 2 : 0)
  const awardedSummaryColumnsCount = isAwardedWorkspace ? 2 : 0
  const baseTableMinWidth =
    (showUseColumn ? 70 : 0) + // Use
    150 + // Code/Tag
    (showProductColumnEffective ? 220 : 0) +
    (showBrandColumnEffective ? 180 : 0) +
    120 + // Qty/UOM
    (showAverageColumns ? (130 + 160) : 0) // Avg Unit + Avg Extended
  const perDealerMinWidth =
    (showUnitPriceColumnEffective ? 130 : 0) + // Unit
    (showLeadTimeColumnEffective ? 110 : 0) +
    (showDealerNotesColumnEffective ? 110 : 0) +
    110 + // Qty/UOM
    150 + // Extended
    (showDealerDeltaColumn ? 120 : 0) + // Delta
    (showDealerNextDeltaColumn ? 120 : 0) +
    (showDealerAwardColumn ? 90 : 0)
  const hasFilesColumn = isAwardedWorkspace
  const awardedColumnsCount = isAwardedWorkspace
    ? (awardedSummaryColumnsCount + effectiveRequiredApprovalColumns.length + (hasFilesColumn ? 1 : 0))
    : 0
  const renderAwardedSummaryFooterCells = (prefix, value) => (
    isAwardedWorkspace
      ? [
        <td key={`${prefix}-awarded`} className="comparison-awarded-summary-cell awarded-summary-col"></td>,
        <td key={`${prefix}-extended`} className="num comparison-awarded-summary-cell awarded-extended-col"><strong>{money(value)}</strong></td>
      ]
      : null
  )
  const renderDualGeneralValue = (awardedValue, proposedValue) => (
    <div className="comparison-general-dual-value">
      <div className="comparison-general-dual-line">
        <span className="comparison-general-dual-label">Awarded</span>
        <strong>{money(awardedValue)}</strong>
      </div>
      <div className="comparison-general-dual-line comparison-general-dual-line-muted">
        <span className="comparison-general-dual-label">Proposed</span>
        <span>{money(proposedValue)}</span>
      </div>
    </div>
  )
  const renderAwardedRequirementsFooterCells = (prefix) => (
    isAwardedWorkspace
      ? [
        ...(hasFilesColumn ? [
          <td key={`${prefix}-files`} className="approval-cell-na"></td>
        ] : []),
        ...effectiveRequiredApprovalColumns.map((column) => (
          <td key={`${prefix}-${column.key}`} className="approval-cell-na"></td>
        ))
      ]
      : null
  )
  const openLineItemFilesModal = ({ specItemId, codeTag, productName, brandName, uploads = [], isSubstitution = false }) => {
    if (typeof onOpenLineItemFiles === 'function') {
      onOpenLineItemFiles({ specItemId, codeTag, productName, brandName, uploads, isSubstitution })
      return
    }
    setActiveLineItemFilesModal({
      specItemId: specItemId || null,
      codeTag: codeTag || '—',
      productName: productName || '—',
      brandName: brandName || '',
      uploads: Array.isArray(uploads) ? uploads : [],
      isSubstitution: Boolean(isSubstitution)
    })
  }
  const closeLineItemFilesModal = () => {
    setActiveLineItemFilesModal(null)
  }
  const closeFilePreview = () => {
    setActiveFilePreview(null)
  }
  const activeLineItemUploads = activeLineItemFilesModal
    ? (Array.isArray(activeLineItemFilesModal.uploads)
        ? activeLineItemFilesModal.uploads
        : (Array.isArray(effectiveLineItemUploadsBySpecItem[String(activeLineItemFilesModal.specItemId)])
        ? effectiveLineItemUploadsBySpecItem[String(activeLineItemFilesModal.specItemId)]
        : []))
    : []
  const uploadLineItemFile = async (file) => {
    if (!file || !activeLineItemFilesModal?.specItemId || !effectiveBidPackageId) return
    setLineItemUploadBusy(true)
    setStatusMessage('Uploading file...')
    try {
      await createBidPackagePostAwardUpload(effectiveBidPackageId, {
        file,
        specItemId: activeLineItemFilesModal.specItemId,
        isSubstitution: activeLineItemFilesModal.isSubstitution
      })
      await reloadFullscreenDashboard()
      setStatusMessage('File uploaded.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLineItemUploadBusy(false)
    }
  }
  const requirementsColumnsMinWidth = (effectiveRequiredApprovalColumns.length * 120) + (hasFilesColumn ? 110 : 0)
  const tableMinWidth = baseTableMinWidth + (isAwardedWorkspace ? 385 : (visibleDealers.length * perDealerMinWidth)) + requirementsColumnsMinWidth + 40
  const shouldPinCodeColumn = historyModeActive || tableScrollLeft > 140
  const shouldHideAwardActions = isAwardedWorkspace || historyModeActive
  const showDealerGroupHeader = !isAwardedWorkspace && visibleDealers.length > 0
  const sparseNoBidderLayout = visibleDealers.length === 0 && !isAwardedWorkspace
  const tableColumnWidths = useMemo(() => {
    if (sparseNoBidderLayout) return []

    const widths = []
    if (showUseColumn) widths.push(60)
    widths.push(110) // Code/Tag
    if (showProductColumnEffective) widths.push(170)
    if (showBrandColumnEffective) widths.push(120)
    widths.push(110) // Base Qty/UOM
    if (showAverageColumns) {
      widths.push(120) // Avg Unit Price
      widths.push(120) // Avg Extended
    }

    if (isAwardedWorkspace) {
      widths.push(195) // Awarded bidder
      widths.push(120) // Awarded extended
      if (hasFilesColumn) widths.push(110)
      effectiveRequiredApprovalColumns.forEach(() => widths.push(120))
      return widths
    }

    visibleDealers.forEach(() => {
      widths.push(110) // Qty/UOM
      if (showUnitPriceColumnEffective) widths.push(120)
      if (showLeadTimeColumnEffective) widths.push(110)
      if (showDealerNotesColumnEffective) widths.push(110)
      widths.push(120) // Extended
      if (showDealerDeltaColumn) widths.push(120)
      if (showDealerNextDeltaColumn) widths.push(120)
      if (showDealerAwardColumn) widths.push(90)
    })
    return widths
  }, [
    sparseNoBidderLayout,
    showUseColumn,
    showProductColumnEffective,
    showBrandColumnEffective,
    showAverageColumns,
    isAwardedWorkspace,
    hasFilesColumn,
    effectiveRequiredApprovalColumns,
    visibleDealers,
    showUnitPriceColumnEffective,
    showLeadTimeColumnEffective,
    showDealerNotesColumnEffective,
    showDealerDeltaColumn,
    showDealerNextDeltaColumn,
    showDealerAwardColumn
  ])
  const sparseColumnPercents = useMemo(() => {
    if (!sparseNoBidderLayout) return []
    const columns = []
    if (showUseColumn) columns.push({ key: 'use', weight: 1.2 })
    columns.push({ key: 'code', weight: 1.5 })
    if (showProductColumnEffective) columns.push({ key: 'product', weight: 4.8 })
    if (showBrandColumnEffective) columns.push({ key: 'brand', weight: 2.8 })
    columns.push({ key: 'qty', weight: 1.3 })

    const totalWeight = columns.reduce((sum, col) => sum + col.weight, 0) || 1
    return columns.map((col) => ({
      key: col.key,
      widthPct: (col.weight / totalWeight) * 100
    }))
  }, [sparseNoBidderLayout, showUseColumn, showProductColumnEffective, showBrandColumnEffective])
  const qtyStartClass = isAwardedWorkspace ? '' : 'dealer-block-start'
  const unitPriceStartClass = ''
  const leadTimeStartClass = ''
  const notesStartClass = ''
  const extendedStartClass = ''
  const subRowLeadingColSpan = baseColumnsBeforeDealers + (isAwardedWorkspace ? awardedSummaryColumnsCount : (visibleDealers.length * dealerColumnsPerResponder))
  const subRowPersistentColSpan = Math.max(
    1,
    (showUseColumn ? 2 : 1) + (showProductColumnEffective ? 1 : 0)
  )
  const subRowScrollableColSpan = Math.max(0, subRowLeadingColSpan - subRowPersistentColSpan)

  const renderRequirementCell = ({ row, requirement, componentId = null }) => {
    const cellKey = componentId == null
      ? `${row.spec_item_id}-${requirement.key}`
      : `${row.spec_item_id}-${componentId}-${requirement.key}`
    const requirementStatus = requirement.status || (requirement.approved ? 'approved' : 'pending')
    const needsFixDates = Array.isArray(requirement.needs_fix_dates) ? requirement.needs_fix_dates : []
    const ownership = requirement.ownership || (componentId == null ? 'parent' : 'component')
    const isSubRowRequirement = componentId != null && ownership !== 'components'
    const deactivateKey = isSubRowRequirement ? `${row.spec_item_id}:${componentId}:${requirement.key}` : null
    const isDeactivatingSubRequirement = deactivateKey
      ? deactivatingComponentRequirementKeys.some((key) => key === deactivateKey)
      : false

    const renderSubRequirementDeactivateButton = () => {
      if (!isSubRowRequirement || !deactivateKey) return null
      return (
        <button
          type="button"
          className="btn approval-subrow-requirement-remove"
          onClick={async (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (isDeactivatingSubRequirement) return
            setDeactivatingComponentRequirementKeys((prev) => [...prev, deactivateKey])
            try {
              if (onDeactivateComponentRequirement) {
                await onDeactivateComponentRequirement({ specItemId: row.spec_item_id, componentId, requirementKey: requirement.key })
              } else {
                await deactivateFullscreenComponentRequirement({ specItemId: row.spec_item_id, componentId, requirementKey: requirement.key })
              }
            } catch (error) {
              setStatusMessage(error?.message || 'Unable to remove sub-row requirement')
            } finally {
              setDeactivatingComponentRequirementKeys((prev) => prev.filter((key) => key !== deactivateKey))
            }
          }}
          disabled={isDeactivatingSubRequirement || (!onDeactivateComponentRequirement && !effectiveBidPackageId)}
          title={`Remove ${requirement.label}`}
          aria-label={`Remove ${requirement.label}`}
        >
          <img src={DeleteIcon} className="approval-subrow-remove-icon" alt="" aria-hidden="true" />
        </button>
      )
    }

    if (!requirement.applies) {
      return (
        <td key={cellKey} className="approval-cell-na">
          N/A
        </td>
      )
    }

    if (ownership === 'inactive') {
      return (
        <td key={cellKey} className="approval-cell-subrow-add">
          <button
            type="button"
            className="btn approval-add-btn"
            onClick={async () => {
              if (onActivateComponentRequirement) {
                await onActivateComponentRequirement({ specItemId: row.spec_item_id, componentId, requirementKey: requirement.key })
              } else {
                await activateFullscreenComponentRequirement({ specItemId: row.spec_item_id, componentId, requirementKey: requirement.key })
              }
            }}
            disabled={loading || (!onActivateComponentRequirement && !effectiveBidPackageId)}
            aria-label={`Activate ${requirement.label} for sub-row`}
            title={`Track ${requirement.label} on this sub-row`}
          >
            <img src={AddTableSubrowIcon} className="approval-subrow-add-icon" alt="" aria-hidden="true" />
          </button>
        </td>
      )
    }

    if (ownership === 'components') {
      const componentList = Array.isArray(effectiveApprovalComponentsBySpecItem[String(row.spec_item_id)])
        ? effectiveApprovalComponentsBySpecItem[String(row.spec_item_id)]
        : []
      const activeComponentRequirements = componentList
        .map((component) => {
          const list = Array.isArray(component?.required_approvals) ? component.required_approvals : []
          return list.find((item) => item?.key === requirement.key)
        })
        .filter((item) => item && item.applies !== false && item.ownership !== 'inactive')
      const allActiveApproved = activeComponentRequirements.length > 0 && activeComponentRequirements.every((item) => {
        const status = item.status || (item.approved ? 'approved' : 'pending')
        return status === 'approved'
      })
      const componentStatusLabel = allActiveApproved ? 'Approved' : 'Incomplete'
      const componentStatusClass = allActiveApproved
        ? 'approval-derived-chip is-approved'
        : 'approval-derived-chip is-incomplete'
      return (
        <td key={cellKey} className="approval-cell-components">
          <div className="approval-derived-wrap">
            <span className={componentStatusClass}>{componentStatusLabel}</span>
          </div>
        </td>
      )
    }

    if (requirementStatus === 'approved') {
      return (
        <td key={cellKey} className={`approval-cell-approved ${isSubRowRequirement ? 'approval-cell-with-sub-remove' : ''}`.trim()}>
          <button
            type="button"
            className="approval-approved-btn"
            onClick={async () => {
              openUnapproveModal({
                specItemId: row.spec_item_id,
                requirementKey: requirement.key,
                requirementLabel: requirement.label,
                code: row.sku || row.spec_item_id,
                componentId,
                needsFixDates,
                actionType: 'unapproved'
              })
            }}
            disabled={loading || (!onUnapproveRequirement && !effectiveBidPackageId)}
          >
            <div>Approved</div>
            {requirement.approved_at ? (
              <div className="approval-approved-date">{new Date(requirement.approved_at).toLocaleDateString()}</div>
            ) : null}
            {needsFixDates.length > 0 ? (
              <ApprovalTimestampTooltip
                label={`(Fixed ${needsFixDates.length}x)`}
                timestamps={needsFixDates}
                showCount={false}
                labelClassName="approval-fixed-note"
              />
            ) : null}
          </button>
          {renderSubRequirementDeactivateButton()}
        </td>
      )
    }

    if (requirementStatus === 'needs_revision') {
      return (
        <td key={cellKey} className={`approval-cell-needs-revision ${isSubRowRequirement ? 'approval-cell-with-sub-remove' : ''}`.trim()}>
          <div className="approval-needs-fix-wrap">
            <div className="approval-cell-action-row">
              <button
                type="button"
                className="btn approval-icon-btn approval-pending-btn"
                title="Approve"
                aria-label="Approve"
                onClick={async () => {
                  if (onApproveRequirement) {
                    await onApproveRequirement({ specItemId: row.spec_item_id, requirementKey: requirement.key, componentId })
                    return
                  }
                  if (!effectiveBidPackageId) return
                  const response = await approveSpecItemRequirement({
                    bidPackageId: effectiveBidPackageId,
                    specItemId: row.spec_item_id,
                    requirementKey: requirement.key,
                    componentId
                  })
                  updateFullscreenRequirement({
                    specItemId: row.spec_item_id,
                    requirementKey: requirement.key,
                    componentId,
                    updates: {
                      status: response?.status || 'approved',
                      approved: true,
                      approved_at: response?.approved_at || new Date().toISOString(),
                      approved_by: response?.approved_by || 'Designer',
                      needs_fix_dates: Array.isArray(response?.needs_fix_dates) ? response.needs_fix_dates : needsFixDates,
                      ownership: componentId == null ? 'parent' : 'component'
                    }
                  })
                }}
                disabled={loading || (!onApproveRequirement && !effectiveBidPackageId)}
              >
                <IconCheck />
              </button>
              <button
                type="button"
                className="btn approval-icon-btn approval-needs-fix-btn"
                title="Needs Fix Again"
                aria-label="Needs Fix Again"
                onClick={async () => {
                  if (onNeedsFixRequirement) {
                    await onNeedsFixRequirement({ specItemId: row.spec_item_id, requirementKey: requirement.key, componentId })
                    return
                  }
                  if (!effectiveBidPackageId) return
                  const response = await markSpecItemRequirementNeedsFix({
                    bidPackageId: effectiveBidPackageId,
                    specItemId: row.spec_item_id,
                    requirementKey: requirement.key,
                    componentId
                  })
                  updateFullscreenRequirement({
                    specItemId: row.spec_item_id,
                    requirementKey: requirement.key,
                    componentId,
                    updates: {
                      status: response?.status || 'needs_revision',
                      approved: false,
                      approved_at: null,
                      approved_by: null,
                      needs_fix_dates: Array.isArray(response?.needs_fix_dates) ? response.needs_fix_dates : needsFixDates,
                      ownership: componentId == null ? 'parent' : 'component'
                    }
                  })
                }}
                disabled={loading || (!onNeedsFixRequirement && !effectiveBidPackageId)}
              >
                <IconRefresh />
              </button>
              <button
                type="button"
                className="btn approval-icon-btn approval-reset-btn"
                title="Reset to Pending"
                aria-label="Reset to Pending"
                onClick={() => {
                  openUnapproveModal({
                    specItemId: row.spec_item_id,
                    requirementKey: requirement.key,
                    requirementLabel: requirement.label,
                    code: row.sku || row.spec_item_id,
                    componentId,
                    needsFixDates,
                    actionType: 'reset'
                  })
                }}
                disabled={loading || (!onUnapproveRequirement && !effectiveBidPackageId)}
              >
                <IconX />
              </button>
            </div>
          </div>
          {renderSubRequirementDeactivateButton()}
        </td>
      )
    }

    return (
      <td key={cellKey} className={`approval-cell-pending ${isSubRowRequirement ? 'approval-cell-with-sub-remove' : ''}`.trim()}>
        <div className="approval-cell-action-row">
          <button
            type="button"
            className="btn approval-icon-btn approval-pending-btn"
            title="Approve"
            aria-label="Approve"
            onClick={async () => {
              if (onApproveRequirement) {
                await onApproveRequirement({ specItemId: row.spec_item_id, requirementKey: requirement.key, componentId })
                return
              }
              if (!effectiveBidPackageId) return
              const response = await approveSpecItemRequirement({
                bidPackageId: effectiveBidPackageId,
                specItemId: row.spec_item_id,
                requirementKey: requirement.key,
                componentId
              })
              updateFullscreenRequirement({
                specItemId: row.spec_item_id,
                requirementKey: requirement.key,
                componentId,
                updates: {
                  status: response?.status || 'approved',
                  approved: true,
                  approved_at: response?.approved_at || new Date().toISOString(),
                  approved_by: response?.approved_by || 'Designer',
                  needs_fix_dates: Array.isArray(response?.needs_fix_dates) ? response.needs_fix_dates : needsFixDates,
                  ownership: componentId == null ? 'parent' : 'component'
                }
              })
            }}
            disabled={loading || (!onApproveRequirement && !effectiveBidPackageId)}
          >
            <IconCheck />
          </button>
          <button
            type="button"
            className="btn approval-icon-btn approval-needs-fix-btn"
            title="Needs Fix"
            aria-label="Needs Fix"
            onClick={async () => {
              if (onNeedsFixRequirement) {
                await onNeedsFixRequirement({ specItemId: row.spec_item_id, requirementKey: requirement.key, componentId })
                return
              }
              if (!effectiveBidPackageId) return
              const response = await markSpecItemRequirementNeedsFix({
                bidPackageId: effectiveBidPackageId,
                specItemId: row.spec_item_id,
                requirementKey: requirement.key,
                componentId
              })
              updateFullscreenRequirement({
                specItemId: row.spec_item_id,
                requirementKey: requirement.key,
                componentId,
                updates: {
                  status: response?.status || 'needs_revision',
                  approved: false,
                  approved_at: null,
                  approved_by: null,
                  needs_fix_dates: Array.isArray(response?.needs_fix_dates) ? response.needs_fix_dates : [new Date().toISOString()],
                  ownership: componentId == null ? 'parent' : 'component'
                }
              })
            }}
            disabled={loading || (!onNeedsFixRequirement && !effectiveBidPackageId)}
          >
            <IconRefresh />
          </button>
        </div>
        {renderSubRequirementDeactivateButton()}
      </td>
    )
  }

  return (
    <div className="stack">
      {!launchedFromDashboard ? (
        <SectionCard title="Comparison Dashboard">
          <div className="form-grid">
            <label>
              Bid Package
              <select
                value={selectedBidPackageId}
                onChange={(event) => setSelectedBidPackageId(event.target.value)}
                disabled={loadingPackages}
              >
                {bidPackages.length === 0 ? <option value="">No bid packages yet</option> : null}
                {bidPackages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} in {pkg.project_name || 'Unknown Project'} (Bid Package ID: {pkg.id}, Project ID: {pkg.project_id ?? '—'})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="action-row">
            <button className="btn btn-primary" onClick={loadComparison} disabled={!selectedBidPackageId || loading || loadingPackages}>
              Load Bid Package
            </button>
          </div>

          {statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
        </SectionCard>
      ) : null}

      <SectionCard className="comparison-flat">
        {embedded ? (
          <div className="section-head comparison-subheader-wrap">
            <h2>Line Items ({data.rows?.length || 0})</h2>
            <div className="section-actions">
              {!isAwardedWorkspace ? (
                <button
                  type="button"
                  className="btn comparison-analyze-btn"
                  onClick={openBidResponseAnalysis}
                  disabled={loading || analysisBusy}
                >
                  {analysisBusy ? 'Analyzing…' : 'Ask LaTrobe to Analyze'}
                </button>
              ) : null}
              {lineItemsHeaderActionLabel && typeof onLineItemsHeaderAction === 'function' ? (
                <button
                  type="button"
                  className="btn comparison-header-action-btn"
                  onClick={onLineItemsHeaderAction}
                  disabled={lineItemsHeaderActionDisabled || loading}
                >
                  {lineItemsHeaderActionLabel}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {launchedFromDashboard && statusMessage ? <p className="text-muted">{statusMessage}</p> : null}
        <div className="table-scroll-top" aria-label="Horizontal scroll control">
          <div className="comparison-toolbar-left">
            <button
              type="button"
              className="btn comparison-scroll-btn comparison-scroll-btn-left"
              onClick={() => nudgeHorizontalScroll(-520)}
              aria-label="Scroll table left"
            >
              <img src={ArrowLeftIcon} alt="" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn comparison-scroll-btn comparison-scroll-btn-right"
              onClick={() => nudgeHorizontalScroll(520)}
              aria-label="Scroll table right"
            >
              <img src={ArrowRightIcon} alt="" aria-hidden="true" />
            </button>
            <span className="table-scroll-hint">Drag table left/right</span>
          </div>
          <div className="comparison-toolbar-right" onClick={(event) => event.stopPropagation()}>
            {pendingSelectedRowCount > 0 ? (
              <div className="comparison-selection-bar-actions comparison-selection-bar-actions-toolbar">
                <button
                  type="button"
                  className="btn comparison-selection-clear"
                  onClick={clearPendingSelections}
                  disabled={loading || awardSubmitting}
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  className="btn comparison-selection-commit"
                  onClick={openAwardConfirmation}
                  disabled={loading || awardSubmitting}
                >
                  Award Selected Rows
                </button>
              </div>
            ) : null}
            <div className="actions-menu-wrap">
              <button
                type="button"
                className="btn icon-btn-subtle comparison-options-btn"
                onClick={() => {
                  const nextOpen = !showActionsMenu
                  setShowActionsMenu(nextOpen)
                  if (!nextOpen) {
                    setShowViewSubmenu(false)
                    setShowExportSubmenu(false)
                  }
                }}
                disabled={loading}
                title="Actions"
                aria-label="Actions"
              >
                <img src={OptionsIcon} alt="" aria-hidden="true" />
              </button>
              {showActionsMenu ? (
                <div className="actions-menu-panel">
                  <button
                    type="button"
                    className="actions-menu-item"
                    onMouseEnter={() => {
                      setShowViewSubmenu(true)
                      setShowExportSubmenu(false)
                    }}
                  >
                    {!embedded ? '← View' : 'View →'}
                  </button>
                  <button
                    type="button"
                    className="actions-menu-item"
                    onMouseEnter={() => {
                      setShowExportSubmenu(true)
                      setShowViewSubmenu(false)
                    }}
                  >
                    {!embedded ? '← Export' : 'Export →'}
                  </button>
                  <button
                    type="button"
                    className="actions-menu-item"
                    onClick={() => {
                      resetComparisonView()
                      setShowActionsMenu(false)
                      setShowViewSubmenu(false)
                      setShowExportSubmenu(false)
                    }}
                    disabled={loading}
                  >
                    Reset View
                  </button>

                  {showViewSubmenu ? (
                    <div className={`actions-submenu-panel ${!embedded ? 'actions-submenu-panel-left' : ''}`.trim()}>
                      <p className="actions-submenu-head">Columns</p>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowProductColumn((prev) => !prev)}>
                        {showProductColumn ? '✓ ' : '○ '}Product
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowBrandColumn((prev) => !prev)}>
                        {showBrandColumn ? '✓ ' : '○ '}Brand
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowUnitPriceColumn((prev) => !prev)}>
                        {showUnitPriceColumn ? '✓ ' : '○ '}Unit Price
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowLeadTimeColumn((prev) => !prev)}>
                        {showLeadTimeColumn ? '✓ ' : '○ '}Lead Time
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setShowDealerNotesColumn((prev) => !prev)}>
                        {showDealerNotesColumn ? '✓ ' : '○ '}Notes
                      </button>
                      <p className="actions-submenu-head">Comparison</p>
                      <button type="button" className="actions-submenu-item" onClick={() => setComparisonMode('none')}>
                        {comparisonMode === 'none' ? '✓ ' : '○ '}None
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setComparisonMode('average')}>
                        {comparisonMode === 'average' ? '✓ ' : '○ '}Average
                      </button>
                      <button type="button" className="actions-submenu-item" onClick={() => setComparisonMode('competitive')}>
                        {comparisonMode === 'competitive' ? '✓ ' : '○ '}Competitive
                      </button>
                    </div>
                  ) : null}

                  {showExportSubmenu ? (
                    <div className={`actions-submenu-panel ${!embedded ? 'actions-submenu-panel-left' : ''}`.trim()}>
                      {isAwardedWorkspace ? <p className="actions-submenu-head">Matrix</p> : null}
                      {isAwardedWorkspace ? (
                        <button
                          type="button"
                          className="actions-submenu-item"
                          onClick={() => {
                            handleExportChange('csv', 'approval_matrix')
                            setShowActionsMenu(false)
                            setShowExportSubmenu(false)
                          }}
                        >
                          CSV
                        </button>
                      ) : null}
                      {isAwardedWorkspace ? (
                        <button
                          type="button"
                          className="actions-submenu-item"
                          onClick={() => {
                            handleExportChange('xlsx', 'approval_matrix')
                            setShowActionsMenu(false)
                            setShowExportSubmenu(false)
                          }}
                        >
                          Excel
                        </button>
                      ) : null}

                      {isAwardedWorkspace ? <p className="actions-submenu-head">Audit</p> : null}
                      {isAwardedWorkspace ? (
                        <button
                          type="button"
                          className="actions-submenu-item"
                          onClick={() => {
                            handleExportChange('csv', 'approval_audit')
                            setShowActionsMenu(false)
                            setShowExportSubmenu(false)
                          }}
                        >
                          CSV
                        </button>
                      ) : null}
                      {isAwardedWorkspace ? (
                        <button
                          type="button"
                          className="actions-submenu-item"
                          onClick={() => {
                            handleExportChange('xlsx', 'approval_audit')
                            setShowActionsMenu(false)
                            setShowExportSubmenu(false)
                          }}
                        >
                          Excel
                        </button>
                      ) : null}

                      <p className="actions-submenu-head">Bid Comparison</p>
                      <button
                        type="button"
                        className="actions-submenu-item"
                        onClick={() => {
                          handleExportChange('csv', 'comparison')
                          setShowActionsMenu(false)
                          setShowExportSubmenu(false)
                        }}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        className="actions-submenu-item"
                        onClick={() => {
                          handleExportChange('xlsx', 'comparison')
                          setShowActionsMenu(false)
                          setShowExportSubmenu(false)
                        }}
                      >
                        Excel
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {embedded && effectiveBidPackageId ? (
              <button
                className="btn btn-primary icon-btn-subtle comparison-fullscreen-btn"
                type="button"
                onClick={() => {
                  const params = new URLSearchParams()
                  params.set('bid_package_id', String(effectiveBidPackageId))
                  if (isAwardedWorkspace) params.set('approval_tracking', '1')
                  if (effectiveHistoryView) {
                    params.set('history_bidder_id', String(effectiveHistoryView.bidderId))
                    params.set('history_version', String(effectiveHistoryView.version))
                    params.set('history_dealer_name', effectiveHistoryView.dealerName)
                    params.set('history_date', effectiveHistoryView.date)
                    params.set('history_time', effectiveHistoryView.time)
                  }
                  const fullscreenState = {
                    visibleDealerIds: visibleDealerIdsRef.current
                  }
                  if (isAwardedWorkspace) {
                    fullscreenState.approvalTrackingSnapshot = {
                      requiredApprovalColumns: effectiveRequiredApprovalColumns,
                      requiredApprovalsBySpecItem: effectiveRequiredApprovalsBySpecItem,
                      approvalComponentsBySpecItem: effectiveApprovalComponentsBySpecItem,
                      lineItemUploadsBySpecItem: effectiveLineItemUploadsBySpecItem
                    }
                  }
                  navigate(`/comparison?${params.toString()}`, {
                    state: fullscreenState
                  })
                }}
                disabled={loading}
                title="Full screen"
                aria-label="Full screen"
              >
                <img src={ExpandIcon} alt="" aria-hidden="true" />
              </button>
            ) : null}
            {launchedFromDashboard && !embedded ? (
              <button
                className="btn icon-btn-subtle"
                type="button"
                onClick={() => {
                  const bidPackageId = loadedBidPackageId || selectedBidPackageId || forcedBidPackageId
                  if (bidPackageId) {
                    storeComparisonState(String(bidPackageId), {
                      dealerPriceMode: dealerPriceModeRef.current,
                      cellPriceMode: cellPriceModeRef.current,
                      excludedSpecItemIds: excludedRowIdsRef.current,
                      responderSort: responderSortRef.current,
                      comparisonMode: comparisonModeRef.current,
                      showUnitPriceColumn: showUnitPriceColumnRef.current,
                      showProductColumn: showProductColumnRef.current,
                      showBrandColumn: showBrandColumnRef.current,
                      showLeadTimeColumn: showLeadTimeColumnRef.current,
                      showDealerNotesColumn: showDealerNotesColumnRef.current
                    })
                  }
                  if (typeof onClose === 'function') onClose()
                  else if (bidPackageId) navigate(`/package/${bidPackageId}`)
                  else navigate('/package')
                }}
                disabled={loading}
                title="Close"
                aria-label="Close"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
        {launchedFromDashboard && !embedded && historyModeActive ? (
          <div className="comparison-history-banner comparison-history-banner-compact">
            <div className="comparison-history-banner-left">
              <span className="comparison-history-banner-icon" aria-hidden="true">📋</span>
              <div className="comparison-history-banner-content">
                <p className="comparison-history-banner-title">
                  {`Viewing History: ${effectiveHistoryView.dealerName} v${effectiveHistoryView.version}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn comparison-history-exit-btn comparison-history-exit-btn-compact"
              onClick={() => {
                if (typeof onExitHistoryView === 'function') onExitHistoryView()
                setFullscreenHistoryView(null)
                if (!embedded) {
                  const nextParams = new URLSearchParams(searchParams.toString())
                  nextParams.delete('history_bidder_id')
                  nextParams.delete('history_version')
                  nextParams.delete('history_dealer_name')
                  nextParams.delete('history_date')
                  nextParams.delete('history_time')
                  navigate(`/comparison?${nextParams.toString()}`, { replace: true })
                }
              }}
            >
              Exit
            </button>
          </div>
        ) : null}
        {!showDealerGroupHeader ? (
          <div className="comparison-award-toolbar">
            <div className="comparison-award-toolbar-summary">
              <span className="comparison-award-progress-label">{`Award progress: ${awardProgressLabel}`}</span>
            </div>
          </div>
        ) : null}
        <div
          className={`table-scroll ${tableScrollLeft > 0 ? 'is-x-scrolled' : ''}`.trim()}
          ref={tableScrollRef}
          style={launchedFromDashboard && !embedded ? { height: 'calc(100dvh - 128px)', maxHeight: 'calc(100dvh - 128px)' } : undefined}
          onScroll={syncFromTable}
        >
        <div className="comparison-table-inner" ref={tableInnerRef}>
        <table
          className={`table comparison-table sticky-code-column ${historyModeActive ? 'history-mode' : ''} ${showUseColumn ? 'has-use-column' : ''} ${shouldPinCodeColumn ? 'pin-code-column' : ''} ${shouldHideAwardActions ? 'hide-award-actions' : ''} ${!showDealerGroupHeader ? 'single-header' : ''} ${sparseNoBidderLayout ? 'comparison-table-sparse' : ''} ${isAwardedWorkspace ? 'approval-mode' : ''}`.trim()}
          style={{ width: '100%', minWidth: `${tableMinWidth}px` }}
        >
          {sparseNoBidderLayout ? (
            <colgroup>
              {sparseColumnPercents.map((col) => (
                <col key={`sparse-col-${col.key}`} style={{ width: `${col.widthPct}%` }} />
              ))}
            </colgroup>
          ) : (
            <colgroup>
              {tableColumnWidths.map((width, index) => (
                <col key={`col-${index}`} style={{ width: `${width}px` }} />
              ))}
            </colgroup>
          )}
          <thead>
            {showDealerGroupHeader ? (
              <tr className="header-top">
                <th colSpan={baseColumnsBeforeDealers} className="dealer-group-spacer-head">
                  <div className="comparison-header-top-left">
                    <span className="comparison-award-progress-label">{`Award progress: ${awardProgressLabel}`}</span>
                  </div>
                </th>
                  {visibleDealers.map((dealer) => (
                    (() => {
                      return (
                        <th
                          key={`group-${dealer.invite_id}`}
                          colSpan={dealerColumnsPerResponder}
                          className={`dealer-group-header dealer-block-start dealer-block-end ${awardedBidId && dealer.bid_id === awardedBidId ? 'dealer-group-awarded' : ''}`.trim()}
                        >
                          <div className="dealer-group-header-inner">
                            <div className="dealer-group-header-name">{dealerDisplayLabel(dealer.dealer_name, dealer.dealer_email)}</div>
                            <div className="dealer-group-header-actions">
                              {!historyModeActive && Boolean(dealer.bid_id) ? (
                                <button
                                  type="button"
                                  className="btn btn-award-change"
                                  onClick={() => selectDealerForAllRows(dealer)}
                                  disabled={loading || awardSubmitting}
                                >
                                  Select All
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </th>
                      )
                    })()
                  ))}
              </tr>
            ) : null}
            <tr className="header-bottom">
              {showUseColumn ? <th className="use-col-head"><span className="th-sort-label">In Totals</span></th> : null}
              <th className="code-col-head">
                <span className="th-sort-label">Code/Tag</span>
              </th>
              {showProductColumnEffective ? (
                <th className="comparison-col-product">
                  <span className="th-sort-label">Product</span>
                </th>
              ) : null}
              {showBrandColumnEffective ? <th className="comparison-col-brand"><span className="th-sort-label">Brand</span></th> : null}
              <th className="comparison-col-qty">
                <span className="th-sort-label">Qty/UOM</span>
              </th>
              {showAverageColumns ? (
                <th className="avg-col-head">
                  <span className="th-sort-label">Avg Unit Price</span>
                </th>
              ) : null}
              {showAverageColumns ? <th className="avg-col-head">Avg Extended</th> : null}
              {isAwardedWorkspace ? (
                <>
                  <th className="dealer-metric-header awarded-summary-col">Awarded</th>
                  <th className="dealer-metric-header awarded-extended-col">Extended</th>
                </>
              ) : null}
              {!isAwardedWorkspace ? visibleDealers.map((dealer) => (
                <Fragment key={dealer.invite_id}>
                  <th className={`${qtyStartClass} dealer-metric-header dealer-col-qty`.trim()}>Qty/UOM</th>
                  {showUnitPriceColumnEffective ? (
                    <th className={`${unitPriceStartClass} dealer-metric-header dealer-col-unit-price`.trim()}>
                      <span className="th-sort-label">Unit Price</span>
                    </th>
                  ) : null}
                  {showLeadTimeColumnEffective ? <th className={`${leadTimeStartClass} dealer-metric-header dealer-col-lead-time`.trim()}>Lead Time (Days)</th> : null}
                  {showDealerNotesColumnEffective ? <th className={`${notesStartClass} dealer-metric-header dealer-notes-header dealer-col-notes`.trim()}>Notes</th> : null}
                  <th className={`${extendedStartClass} dealer-metric-header dealer-col-extended`.trim()}>Extended</th>
                  {showDealerDeltaColumn ? (
                    <th className="dealer-metric-header dealer-col-delta">
                      <span className="th-sort-label">{comparisonMode === 'competitive' ? '% Next Lower' : '% Avg Delta'}</span>
                    </th>
                  ) : null}
                  {showDealerNextDeltaColumn ? (
                    <th className="dealer-metric-header dealer-col-next-delta">
                      <span className="th-sort-label">% Next Higher</span>
                    </th>
                  ) : null}
                  {showDealerAwardColumn ? <th className="dealer-block-end dealer-metric-header dealer-col-award">Award</th> : null}
                </Fragment>
              )) : null}
              {isAwardedWorkspace && hasFilesColumn ? (
                <th className="approval-col-head">Files</th>
              ) : null}
              {isAwardedWorkspace ? effectiveRequiredApprovalColumns.map((column) => (
                <th key={`approval-col-${column.key}`} className="approval-col-head">{column.label}</th>
              )) : null}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              (() => {
                const awardedDealer = isAwardedWorkspace
                  ? visibleDealers.find((dealer) => String(dealer.invite_id) === String(row.awarded_invite_id))
                  : null
                const awardedDealerSummary = row.awarded_invite_id != null
                  ? dealerByInviteId.get(String(row.awarded_invite_id))
                  : null
                const awardedDealerLabel = awardedDealerSummary
                  ? dealerDisplayLabel(awardedDealerSummary.dealer_name, awardedDealerSummary.dealer_email)
                  : '—'
                const awardedDealerCell = awardedDealer
                  ? (row.dealers || []).find((d) => d.invite_id === awardedDealer.invite_id)
                  : null
                const awardedChoice = awardedDealerCell ? effectiveChoice(row, awardedDealerCell) : null
                const winningSubProductName = awardedDealerCell?.selected_alt_product_name || awardedDealerCell?.alt_product_name
                const winningSubBrandName = awardedDealerCell?.selected_alt_brand_name || awardedDealerCell?.alt_brand_name
                const displayProductName = isAwardedWorkspace && awardedChoice === 'alt' && winningSubProductName
                  ? winningSubProductName
                  : row.product_name
                const displayBrandName = isAwardedWorkspace && awardedChoice === 'alt' && winningSubBrandName
                  ? winningSubBrandName
                  : row.manufacturer
                const rowDealerQuantityEntries = visibleDealers
                  .map((dealer) => {
                    const cell = (row.dealers || []).find((entry) => entry.invite_id === dealer.invite_id)
                    const qty = numberOrNull(effectiveQuantity(row, cell))
                    if (qty == null) return null
                    return {
                      label: dealerDisplayLabel(dealer.dealer_name, dealer.dealer_email),
                      quantity: qty
                    }
                  })
                  .filter(Boolean)
                const uniqueRowQuantities = Array.from(new Set(rowDealerQuantityEntries.map((entry) => entry.quantity.toString())))
                const rowHasQuantityMismatch = uniqueRowQuantities.length > 1
                const designerQuantity = numberOrNull(row.quantity)
                const showDesignerQuantity = designerQuantity != null && designerQuantity !== 0
                const designerQuantityText = showDesignerQuantity
                  ? `${designerQuantity}${row.uom ? ` ${row.uom}` : ''}`
                  : ''
                const quantityMismatchTitle = rowHasQuantityMismatch
                  ? `Qty/UOM mismatch between bidders on this line item. Bidders: ${rowDealerQuantityEntries.map((entry) => `${entry.label}=${entry.quantity}${row.uom ? ` ${row.uom}` : ''}`).join('; ')}.`
                  : ''

                const rowRequirements = effectiveRequiredApprovalsBySpecItem[String(row.spec_item_id)] || []
                const applicableRequirements = rowRequirements.filter((requirement) => requirement.applies)
                const rowFullyApproved = applicableRequirements.length > 0 && applicableRequirements.every((requirement) => requirement.approved)
                const codeStatusClass = rowFullyApproved ? 'code-tag-approved' : 'code-tag-pending'
                const rowComponents = Array.isArray(effectiveApprovalComponentsBySpecItem[String(row.spec_item_id)])
                  ? effectiveApprovalComponentsBySpecItem[String(row.spec_item_id)]
                  : []
                const rowHasSubRows = isAwardedWorkspace && rowComponents.length > 0
                const pendingBidId = rowPendingBidId(row)
                const committedBidId = rowCommittedBidId(row)
                const committedInviteId = rowCommittedInviteId(row)
                const committedPriceSource = rowCommittedPriceSource(row)
                const rowIsAwarded = committedBidId != null
                const rowIsPending = pendingBidId != null
                const rowVisibilityTooltip = row.active === false
                  ? 'Inactive (hidden from bidders) - click to show'
                  : 'Active (visible to bidders) - click to hide'

                return (
                  <Fragment key={row.spec_item_id}>
                    <tr
                      className={`${rowIncluded(row) ? '' : 'row-excluded'} ${row.active === false ? 'comparison-row-inactive' : ''} ${rowIsAwarded ? 'comparison-row-awarded' : ''} ${rowIsPending ? 'comparison-row-pending' : ''} ${rowHasSubRows ? 'comparison-row-has-sub-rows' : ''}`.trim()}
                    >
                      {showUseColumn ? (
                        <td className="use-col-cell">
                          <div className="comparison-use-cell">
                            {rowIsAwarded ? (
                              <span className="comparison-code-awarded-check comparison-use-awarded-check" title="Awarded" aria-label="Awarded">
                                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                  <path d="M4 8.2 6.6 10.8 12 5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className={`btn comparison-include-btn ${rowIncluded(row) ? '' : 'is-excluded'}`.trim()}
                              onClick={() => toggleRowIncluded(row.spec_item_id)}
                              disabled={historyModeActive || (rowIsAwarded && rowIncluded(row))}
                              aria-label={`${rowIncluded(row) ? 'Exclude' : 'Include'} ${row.sku || row.product_name || 'line item'}`}
                              aria-pressed={rowIncluded(row)}
                              title={rowIncluded(row) ? 'Included in totals' : 'Excluded from totals'}
                            >
                              <span className="comparison-include-thumb" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      ) : null}
                      <td className="code-col-cell">
                        <div className="comparison-code-cell">
                          {!isAwardedWorkspace ? (
                            <button
                              type="button"
                              className={`comparison-active-dot-btn ${row.active === false ? 'is-inactive' : 'is-active'}`.trim()}
                              onClick={() => {
                                if (row.active === false) reactivateComparisonItem(row)
                                else deactivateComparisonItem(row)
                              }}
                              disabled={loading || historyModeActive || (rowIsAwarded && row.active !== false)}
                              data-tooltip={rowVisibilityTooltip}
                              aria-label={rowVisibilityTooltip}
                            />
                          ) : (
                            <button
                              type="button"
                              className={`btn approval-parent-add-btn ${rowComponents.length > 0 ? 'has-sub-rows' : ''}`.trim()}
                              onClick={async () => {
                                const rowKey = String(row.spec_item_id)
                                if (addingComponentSpecItemIds.some((id) => String(id) === rowKey)) return
                                setAddingComponentSpecItemIds((prev) => [...prev, rowKey])
                                try {
                                  if (onCreateApprovalComponent) {
                                    await onCreateApprovalComponent({ specItemId: row.spec_item_id })
                                  } else {
                                    await createFullscreenApprovalComponent({ specItemId: row.spec_item_id })
                                  }
                                } finally {
                                  setAddingComponentSpecItemIds((prev) => prev.filter((id) => String(id) !== rowKey))
                                }
                              }}
                              disabled={
                                loading ||
                                addingComponentSpecItemIds.some((id) => String(id) === String(row.spec_item_id)) ||
                                (!onCreateApprovalComponent && !effectiveBidPackageId)
                              }
                              aria-label={`Add sub-row for ${row.sku || row.product_name || 'line item'}`}
                              title="Add sub-row"
                            >
                              <img src={AddNestedIcon} className="approval-parent-add-icon" alt="" aria-hidden="true" />
                            </button>
                          )}
                          <span
                            className={isAwardedWorkspace ? `code-tag-status ${codeStatusClass}` : ''}
                            title={isAwardedWorkspace ? (rowFullyApproved ? 'Approved' : 'Pending approvals') : undefined}
                          >
                            {row.sku || '—'}
                          </span>
                        </div>
                      </td>
                      {showProductColumnEffective ? (
                        <td className="comparison-col-product" title={displayProductName || ''}>
                          <span className="comparison-awarded-cell-value">
                            <span>{displayProductName || '—'}</span>
                            {isAwardedWorkspace && awardedChoice === 'alt' && displayProductName ? (
                              <span className="winner-sub-pill" title="Approved Substitute">Sub</span>
                            ) : null}
                          </span>
                        </td>
                      ) : null}
                      {showBrandColumnEffective ? (
                        <td className="comparison-col-brand" title={displayBrandName || ''}>
                          <span className="comparison-awarded-cell-value">
                            <span>{displayBrandName || '—'}</span>
                            {isAwardedWorkspace && awardedChoice === 'alt' && displayBrandName ? (
                              <span className="winner-sub-pill" title="Approved Substitute">Sub</span>
                            ) : null}
                          </span>
                        </td>
                      ) : null}
                      <td className="comparison-col-qty">
                        <div className="comparison-col-qty-inner">
                          <span>{designerQuantityText}</span>
                          {rowHasQuantityMismatch ? (
                            <span className="comparison-qty-mismatch-anchor" data-tooltip={quantityMismatchTitle}>
                              <img
                                src={AlertMismatchIcon}
                                className="comparison-qty-mismatch-icon"
                                alt="Quantity mismatch"
                                aria-label={quantityMismatchTitle}
                              />
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {showAverageColumns ? <td className="num">{money(dynamicRowAverage(row))}</td> : null}
                      {showAverageColumns ? <td className="num">{money(dynamicRowAverageExtended(row))}</td> : null}
                      {isAwardedWorkspace ? (
                        [
                          <td key={`${row.spec_item_id}-awarded-bidder`} className="comparison-awarded-summary-cell awarded-summary-col">
                            {awardedDealerLabel}
                          </td>,
                          <td key={`${row.spec_item_id}-awarded-extended`} className="num comparison-awarded-summary-cell awarded-extended-col">
                            {money(row.awarded_extended_price_snapshot)}
                          </td>
                        ]
                      ) : visibleDealers.flatMap((dealer) => {
                  const cell = (row.dealers || []).find((d) => d.invite_id === dealer.invite_id)
                  const liveEffectivePrice = effectiveUnitPrice(row, cell)
                  const liveEffectiveQuantity = effectiveQuantity(row, cell)
                  const effectivePrice = rowIsAwarded && dealer.bid_id === committedBidId && row.awarded_unit_price_snapshot != null
                    ? row.awarded_unit_price_snapshot
                    : liveEffectivePrice
                  const effectiveExtendedPrice = rowIsAwarded && dealer.bid_id === committedBidId && row.awarded_extended_price_snapshot != null
                    ? row.awarded_extended_price_snapshot
                    : effectiveExtendedAmount(row, cell, effectivePrice)
                  const bestUnitPrice = rowBestPrice(row)
                  const isBest = !rowIsAwarded && numberOrNull(effectivePrice) != null && numberOrNull(effectivePrice) === numberOrNull(bestUnitPrice)
                  const choice = rowIsAwarded && dealer.bid_id === committedBidId && committedPriceSource
                    ? committedPriceSource
                    : effectiveChoice(row, cell)
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(rowVisibleDealerPrices(row), liveEffectivePrice)
                    : delta(liveEffectivePrice, dynamicRowAverage(row))
                  const nextBestDelta = nextBestDeltaDisplay(rowVisibleDealerPrices(row), liveEffectivePrice)
                  const subPopoverKey = `${row.spec_item_id}-${dealer.invite_id}`
                  const notePopoverKey = `note-${row.spec_item_id}-${dealer.invite_id}`
                  const modeKey = cellModeKey(row.spec_item_id, dealer.invite_id)
                  const canSelectQuotePerCell = Boolean(cell?.has_bod_price && cell?.has_alt_price)
                  const dealerNote = String(cell?.dealer_notes || '').trim()
                  const isSubPopoverOpen = activeSubPopoverKey === subPopoverKey
                  const isNotePopoverOpen = activeNotePopoverKey === notePopoverKey
                  const selectable = selectableDealerForRow(row, dealer)
                  const groupPending = pendingBidId === dealer.bid_id
                  const groupAwarded = rowIsAwarded && committedBidId === dealer.bid_id
                  const groupDimmed = rowIsAwarded && !groupAwarded
                  const canEditQuoteChoice = !historyModeActive && !rowIsAwarded && canSelectQuotePerCell
                  const groupClassName = `comparison-bidder-group-cell ${groupPending ? 'is-pending' : ''} ${groupAwarded ? 'is-awarded' : ''} ${groupDimmed ? 'is-dimmed' : ''}`.trim()
                  const dealerUploads = Array.isArray(cell?.uploads) ? cell.uploads : []
                  const renderSubPopoverContent = () => (
                    <div className="sub-popover">
                      <div className="sub-popover-row">
                        <strong>Sub Product:</strong>
                        <span className="sub-popover-value">{cell?.alt_product_name || '—'}</span>
                      </div>
                      <div className="sub-popover-row">
                        <strong>Sub Brand:</strong>
                        <span className="sub-popover-value">{cell?.alt_brand_name || '—'}</span>
                      </div>
                      {dealerUploads.length > 0 ? (
                        <div className="sub-popover-row sub-popover-action-row">
                          <button
                            type="button"
                            className="sub-popover-action-btn"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              openLineItemFilesModal({
                                specItemId: row.spec_item_id,
                                codeTag: row.sku || row.spec_item_id,
                                productName: cell?.alt_product_name || row.product_name || '',
                                brandName: cell?.alt_brand_name || row.manufacturer || '',
                                uploads: dealerUploads,
                                isSubstitution: true
                              })
                            }}
                          >
                            View {dealerUploads.length} file{dealerUploads.length === 1 ? '' : 's'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                  const selectionControl = (
                    <div className="comparison-award-control">
                      {groupAwarded ? <span className="comparison-award-badge"><span className="comparison-award-badge-label">Awarded</span></span> : null}
                      {!groupAwarded && selectable ? (
                        <button
                          type="button"
                          className={`comparison-award-radio ${groupPending ? 'is-selected' : ''} ${groupAwarded ? 'is-awarded' : ''}`.trim()}
                          onClick={() => updatePendingSelection(row, dealer)}
                          disabled={loading || awardSubmitting || historyModeActive}
                          aria-label={`Select ${dealerDisplayLabel(dealer.dealer_name, dealer.dealer_email)} for ${row.sku || row.product_name || 'row'}`}
                        >
                          <span className="comparison-award-radio-dot" />
                        </button>
                      ) : !groupAwarded ? (
                        <span className="comparison-award-radio comparison-award-radio-disabled" aria-hidden="true" />
                      ) : null}
                    </div>
                  )
                  const priceSourceControls = (
                    <span className={`price-source-slot ${(!isAwardedWorkspace && (canSelectQuotePerCell || choice === 'alt')) ? '' : 'is-empty'}`.trim()}>
                      {canEditQuoteChoice ? (
                        <span className="quote-toggle cell-quote-toggle">
                          <button
                            type="button"
                            className={`quote-toggle-btn ${choice === 'bod' ? 'active' : ''}`}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setCellPriceMode((prev) => ({ ...prev, [modeKey]: 'bod' }))
                            }}
                          >
                            BoD
                          </button>
                          <span
                            className="sub-popover-wrap"
                            onMouseEnter={() => {
                              if (choice === 'alt') setActiveSubPopoverKey(subPopoverKey)
                            }}
                            onMouseLeave={() => setActiveSubPopoverKey((prev) => (prev === subPopoverKey ? null : prev))}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className={`quote-toggle-btn ${choice === 'alt' ? 'active' : ''}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                setCellPriceMode((prev) => ({ ...prev, [modeKey]: 'alt' }))
                                setActiveSubPopoverKey((prev) => (prev === subPopoverKey ? null : subPopoverKey))
                              }}
                            >
                              Sub
                            </button>
                            {choice === 'alt' && isSubPopoverOpen ? renderSubPopoverContent() : null}
                          </span>
                        </span>
                      ) : null}
                      {!rowIsAwarded && !canSelectQuotePerCell && choice === 'alt' ? (
                        <span
                          className="sub-popover-wrap"
                          onMouseEnter={() => setActiveSubPopoverKey(subPopoverKey)}
                          onMouseLeave={() => setActiveSubPopoverKey((prev) => (prev === subPopoverKey ? null : prev))}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="quote-chip alt"
                            onClick={() => setActiveSubPopoverKey((prev) => (prev === subPopoverKey ? null : subPopoverKey))}
                          >
                            Sub
                          </button>
                          {isSubPopoverOpen ? renderSubPopoverContent() : null}
                        </span>
                      ) : null}
                    </span>
                  )
                  const cells = [
                    <td key={`${row.spec_item_id}-${dealer.invite_id}-qty`} className={`${qtyStartClass} dealer-col-qty ${groupClassName}`.trim()} onClick={() => updatePendingSelection(row, dealer)}>
                      {liveEffectiveQuantity == null ? '—' : `${liveEffectiveQuantity}${row.uom ? ` ${row.uom}` : ''}`}
                    </td>,
                    showUnitPriceColumnEffective ? (
                      <td
                        key={`${row.spec_item_id}-${dealer.invite_id}-price`}
                        className={`${unitPriceStartClass} dealer-col-unit-price num ${groupClassName}`.trim()}
                        onClick={() => updatePendingSelection(row, dealer)}
                      >
                        <div className="comparison-bidder-cell-main">
                          <span>{money(effectivePrice)}</span>
                        </div>
                      </td>
                    ) : null,
                    showLeadTimeColumnEffective ? (
                      <td
                        key={`${row.spec_item_id}-${dealer.invite_id}-lead-time`}
                        className={`${leadTimeStartClass} dealer-col-lead-time num ${groupClassName}`.trim()}
                        onClick={() => updatePendingSelection(row, dealer)}
                      >
                        {cell?.lead_time_days ?? '—'}
                      </td>
                    ) : null,
                    showDealerNotesColumnEffective ? (
                      <td key={`${row.spec_item_id}-${dealer.invite_id}-dealer-notes`} className={`${notesStartClass} dealer-col-notes dealer-notes-cell ${groupClassName} ${isNotePopoverOpen ? 'popover-open' : ''}`.trim()}>
                        {dealerNote ? (
                          <span
                            className="sub-popover-wrap"
                            onMouseEnter={() => setActiveNotePopoverKey(notePopoverKey)}
                            onMouseLeave={() => setActiveNotePopoverKey((prev) => (prev === notePopoverKey ? null : prev))}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="note-chip"
                              onClick={() => setActiveNotePopoverKey((prev) => (prev === notePopoverKey ? null : notePopoverKey))}
                              aria-label="View dealer note"
                            >
                              i
                            </button>
                            {isNotePopoverOpen ? (
                              <div className="sub-popover dealer-note-popover">
                                {dealerNote}
                              </div>
                            ) : null}
                          </span>
                        ) : <span className="dealer-notes-empty">—</span>}
                      </td>
                    ) : null,
                    <td key={`${row.spec_item_id}-${dealer.invite_id}-extended`} className={`${extendedStartClass} dealer-col-extended num ${groupClassName} ${isBest ? 'best' : ''} ${isSubPopoverOpen ? 'popover-open' : ''}`.trim()} onClick={() => updatePendingSelection(row, dealer)}>
                      <div className="dealer-price-cell dealer-extended-price-cell">
                        {priceSourceControls}
                        <span>{money(effectiveExtendedPrice)}</span>
                      </div>
                    </td>,
                    ...(showDealerDeltaColumn
                      ? [(
                        <td
                          key={`${row.spec_item_id}-${dealer.invite_id}-delta`}
                          className={`dealer-col-delta num ${groupClassName} ${deltaToneClass(betterDelta)}`.trim()}
                        >
                          {betterDelta}
                        </td>
                      )]
                      : []),
                    ...(showDealerNextDeltaColumn
                      ? [(
                        <td
                          key={`${row.spec_item_id}-${dealer.invite_id}-next-delta`}
                          className={`dealer-col-next-delta num ${groupClassName} ${deltaToneClass(nextBestDelta)}`.trim()}
                        >
                          {nextBestDelta}
                        </td>
                      )]
                      : []),
                    ...(showDealerAwardColumn
                      ? [(
                        <td
                          key={`${row.spec_item_id}-${dealer.invite_id}-award`}
                          className={`dealer-block-end dealer-col-award comparison-award-cell ${groupClassName}`.trim()}
                        >
                          {selectionControl}
                        </td>
                      )]
                      : [])
                  ]
                  return cells.filter(Boolean)
                })}
                      {isAwardedWorkspace ? (
                        [
                          ...(hasFilesColumn ? [(
                            <td key={`${row.spec_item_id}-files`} className="approval-cell-files">
                              {(() => {
                                const uploads = Array.isArray(effectiveLineItemUploadsBySpecItem[String(row.spec_item_id)])
                                  ? effectiveLineItemUploadsBySpecItem[String(row.spec_item_id)]
                                  : []
                                const rowIsSubstitution = isAwardedWorkspace && awardedChoice === 'alt'
                                const rowUploads = uploads.filter((upload) => Boolean(upload?.is_substitution) === rowIsSubstitution)
                                const count = rowUploads.length
                                return (
                                  <button
                                    type="button"
                                    className={`btn approval-files-btn approval-files-inline ${count > 0 ? 'has-files' : 'no-files'}`.trim()}
                                    onClick={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()
                                      openLineItemFilesModal({
                                        specItemId: row.spec_item_id,
                                        codeTag: row.sku || row.spec_item_id,
                                        productName: displayProductName || row.product_name || '',
                                        brandName: displayBrandName || row.manufacturer || '',
                                        uploads: rowUploads,
                                        isSubstitution: rowIsSubstitution
                                      })
                                    }}
                                    disabled={loading || lineItemUploadBusy}
                                    title={count > 0 ? `View ${count} uploaded file${count === 1 ? '' : 's'}` : 'Upload or view files'}
                                  >
                                    <span className="approval-files-count">{count}</span>
                                  </button>
                                )
                              })()}
                            </td>
                          )] : []),
                          ...rowRequirements.map((requirement) => renderRequirementCell({ row, requirement }))
                        ]
                      ) : null}
                    </tr>
                    {isAwardedWorkspace && rowComponents.map((component, componentIndex) => (
                      <tr
                        key={`${row.spec_item_id}-component-${component.id}`}
                        className={`comparison-sub-row nested-row ${componentIndex === 0 ? 'comparison-sub-row-first' : ''} ${componentIndex === 1 ? 'comparison-sub-row-second' : ''} ${componentIndex === rowComponents.length - 1 ? 'comparison-sub-row-last' : ''}`.trim()}
                      >
                        <td colSpan={subRowPersistentColSpan} className="comparison-sub-row-main comparison-sub-row-main-persistent">
                          <div className="comparison-sub-row-inner">
                            <button
                              type="button"
                              className="btn comparison-sub-row-delete"
                              onClick={async () => {
                                const deleteKey = `${row.spec_item_id}:${component.id}`
                                if (deletingComponentKeys.some((key) => key === deleteKey)) return
                                setDeletingComponentKeys((prev) => [...prev, deleteKey])
                                try {
                                  if (onDeleteApprovalComponent) {
                                    await onDeleteApprovalComponent({ specItemId: row.spec_item_id, componentId: component.id })
                                  } else {
                                    await deleteFullscreenApprovalComponent({ specItemId: row.spec_item_id, componentId: component.id })
                                  }
                                } finally {
                                  setDeletingComponentKeys((prev) => prev.filter((key) => key !== deleteKey))
                                }
                              }}
                              disabled={
                                loading ||
                                deletingComponentKeys.some((key) => key === `${row.spec_item_id}:${component.id}`) ||
                                (!onDeleteApprovalComponent && !effectiveBidPackageId)
                              }
                              aria-label={`Delete ${component.label}`}
                              title="Delete sub-row"
                            >
                              <img src={RemoveNestedIcon} className="comparison-sub-row-delete-icon" alt="" aria-hidden="true" />
                            </button>
                            {editingComponentKey === `${row.spec_item_id}:${component.id}` ? (
                              <input
                                type="text"
                                className="comparison-sub-row-input"
                                value={editingComponentLabel}
                                placeholder="Nested name"
                                autoFocus
                                onChange={(event) => setEditingComponentLabel(event.target.value)}
                                onBlur={async () => {
                                  await saveComponentLabel({ row, component, nextLabel: editingComponentLabel })
                                }}
                                onKeyDown={async (event) => {
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    stopEditingComponent()
                                    return
                                  }
                                  if (event.key !== 'Enter') return
                                  event.preventDefault()
                                  await saveComponentLabel({ row, component, nextLabel: editingComponentLabel })
                                }}
                                disabled={loading || (!onRenameApprovalComponent && !effectiveBidPackageId)}
                              />
                            ) : (
                              <div className="comparison-sub-row-label-wrap">
                                <span className={`comparison-sub-row-label ${component.label ? '' : 'is-placeholder'}`.trim()}>
                                  {component.label || 'Nested Name'}
                                </span>
                                <button
                                  type="button"
                                  className="btn comparison-sub-row-edit"
                                  onClick={() => startEditingComponent(row, component)}
                                  disabled={loading || (!onRenameApprovalComponent && !effectiveBidPackageId)}
                                  aria-label={`Edit ${component.label || 'sub-row name'}`}
                                  title="Edit sub-row name"
                                >
                                  <img src={EditIcon} className="comparison-sub-row-edit-icon" alt="" aria-hidden="true" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        {subRowScrollableColSpan > 0 ? (
                          <td colSpan={subRowScrollableColSpan} className="comparison-sub-row-main comparison-sub-row-main-scroll" aria-hidden="true" />
                        ) : null}
                        {hasFilesColumn ? (
                          <td className="approval-cell-files approval-cell-files-subrow">
                            —
                          </td>
                        ) : null}
                        {(() => {
                          const componentRequirements = Array.isArray(component.required_approvals) ? component.required_approvals : []
                          const componentByKey = Object.fromEntries(
                            componentRequirements
                              .filter((requirement) => requirement?.key)
                              .map((requirement) => [String(requirement.key), requirement])
                          )
                          const parentByKey = Object.fromEntries(
                            (Array.isArray(rowRequirements) ? rowRequirements : [])
                              .filter((requirement) => requirement?.key)
                              .map((requirement) => [String(requirement.key), requirement])
                          )

                          return effectiveRequiredApprovalColumns.map((column, columnIndex) => {
                            const key = String(column?.key || '')
                            if (!key) {
                              return (
                                <td
                                  key={`${row.spec_item_id}-component-${component.id}-col-${columnIndex}`}
                                  className="approval-cell-na"
                                >
                                  N/A
                                </td>
                              )
                            }
                            const existing = componentByKey[key]
                            const parent = parentByKey[key]
                            const applies = Boolean(parent?.applies)
                            const fallback = {
                              key,
                              label: column?.label || parent?.label || key,
                              applies,
                              status: applies ? 'inactive' : 'pending',
                              approved: false,
                              approved_at: null,
                              approved_by: null,
                              needs_fix_dates: [],
                              ownership: 'inactive',
                              component_id: component.id
                            }
                            const requirement = existing
                              ? {
                                  ...existing,
                                  key,
                                  label: existing.label || column?.label || key,
                                  applies,
                                  ownership: existing.ownership || 'component',
                                  component_id: component.id
                                }
                              : fallback
                            return renderRequirementCell({ row, requirement, componentId: component.id })
                          })
                        })()}
                      </tr>
                    ))}
                  </Fragment>
                )
              })()
            ))}
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={baseColumnsBeforeDealers + (isAwardedWorkspace ? awardedSummaryColumnsCount : (visibleDealers.length * dealerColumnsPerResponder)) + (awardedColumnsCount - (isAwardedWorkspace ? awardedSummaryColumnsCount : 0))} className="text-muted">No comparison rows loaded yet.</td>
              </tr>
            ) : null}
          </tbody>
          {sortedRows.length > 0 && visibleDealers.length > 0 ? (
            <tfoot>
              <tr className="total-row summary-row summary-subtotal-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Subtotal</strong></td>
                {showAverageColumns ? <td className="num"></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgSubtotal)}</strong></td> : null}
                {isAwardedWorkspace ? renderAwardedSummaryFooterCells('subtotal', awardedSubtotal) : visibleDealers.map((dealer) => {
                  const summary = dealerTotalsById[dealer.invite_id]
                  const subtotal = summary?.subtotal || 0
                  const awardedSubtotalValue = summary?.awardedSubtotal || 0
                  const isBest = !isAwardedWorkspace && subtotal === bestDealerSubtotal
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleSubtotals, subtotal)
                    : delta(subtotal, avgSubtotal)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleSubtotals, subtotal)
                    : null
                  return (
                    <Fragment key={`subtotal-${dealer.invite_id}`}>
                      <td className={`${qtyStartClass} dealer-col-qty`.trim()}></td>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} dealer-col-unit-price num`.trim()}></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} dealer-col-lead-time num`.trim()}></td> : null}
                      {showDealerNotesColumnEffective ? <td className={`${notesStartClass} dealer-col-notes`.trim()}></td> : null}
                      <td className={`${extendedStartClass} dealer-col-extended num summary-dual-cell ${isBest ? 'best' : ''}`.trim()}>{renderDualGeneralValue(awardedSubtotalValue, subtotal)}</td>
                      {showDealerDeltaColumn ? <td className={`dealer-col-delta num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-col-next-delta num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                      {showDealerAwardColumn ? <td className="dealer-block-end dealer-col-award"></td> : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('subtotal')}
              </tr>
              {activeGeneralFields.includes('delivery_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Shipping</strong></td>
                {showAverageColumns ? <td className="num"></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgDelivery)}</strong></td> : null}
                {isAwardedWorkspace ? renderAwardedSummaryFooterCells('shipping', awardedSummaryTotals?.delivery || 0) : visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.delivery || 0
                  const awardedValue = dealerTotalsById[dealer.invite_id]?.awardedDelivery || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerDelivery
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleDeliveries, value)
                    : delta(value, avgDelivery)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleDeliveries, value)
                    : null
                  return (
                    <Fragment key={`delivery-${dealer.invite_id}`}>
                      <td className={`${qtyStartClass} dealer-col-qty`.trim()}></td>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} dealer-col-unit-price num`.trim()}></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} dealer-col-lead-time num`.trim()}></td> : null}
                      {showDealerNotesColumnEffective ? <td className={`${notesStartClass} dealer-col-notes`.trim()}></td> : null}
                      <td className={`${extendedStartClass} dealer-col-extended num summary-dual-cell ${isBest ? 'best' : ''}`.trim()}>{renderDualGeneralValue(awardedValue, value)}</td>
                      {showDealerDeltaColumn ? <td className={`dealer-col-delta num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-col-next-delta num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                      {showDealerAwardColumn ? <td className="dealer-block-end dealer-col-award"></td> : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('shipping')}
              </tr>
              ) : null}
              {activeGeneralFields.includes('install_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Install</strong></td>
                {showAverageColumns ? <td className="num"></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgInstall)}</strong></td> : null}
                {isAwardedWorkspace ? renderAwardedSummaryFooterCells('install', awardedSummaryTotals?.install || 0) : visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.install || 0
                  const awardedValue = dealerTotalsById[dealer.invite_id]?.awardedInstall || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerInstall
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleInstalls, value)
                    : delta(value, avgInstall)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleInstalls, value)
                    : null
                  return (
                    <Fragment key={`install-${dealer.invite_id}`}>
                      <td className={`${qtyStartClass} dealer-col-qty`.trim()}></td>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} dealer-col-unit-price num`.trim()}></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} dealer-col-lead-time num`.trim()}></td> : null}
                      {showDealerNotesColumnEffective ? <td className={`${notesStartClass} dealer-col-notes`.trim()}></td> : null}
                      <td className={`${extendedStartClass} dealer-col-extended num summary-dual-cell ${isBest ? 'best' : ''}`.trim()}>{renderDualGeneralValue(awardedValue, value)}</td>
                      {showDealerDeltaColumn ? <td className={`dealer-col-delta num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-col-next-delta num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                      {showDealerAwardColumn ? <td className="dealer-block-end dealer-col-award"></td> : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('install')}
              </tr>
              ) : null}
              {activeGeneralFields.includes('escalation_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Escalation</strong></td>
                {showAverageColumns ? <td className="num"></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgEscalation)}</strong></td> : null}
                {isAwardedWorkspace ? renderAwardedSummaryFooterCells('escalation', awardedSummaryTotals?.escalation || 0) : visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.escalation || 0
                  const awardedValue = dealerTotalsById[dealer.invite_id]?.awardedEscalation || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerEscalation
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleEscalations, value)
                    : delta(value, avgEscalation)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleEscalations, value)
                    : null
                  return (
                    <Fragment key={`escalation-${dealer.invite_id}`}>
                      <td className={`${qtyStartClass} dealer-col-qty`.trim()}></td>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} dealer-col-unit-price num`.trim()}></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} dealer-col-lead-time num`.trim()}></td> : null}
                      {showDealerNotesColumnEffective ? <td className={`${notesStartClass} dealer-col-notes`.trim()}></td> : null}
                      <td className={`${extendedStartClass} dealer-col-extended num summary-dual-cell ${isBest ? 'best' : ''}`.trim()}>{renderDualGeneralValue(awardedValue, value)}</td>
                      {showDealerDeltaColumn ? <td className={`dealer-col-delta num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-col-next-delta num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                      {showDealerAwardColumn ? <td className="dealer-block-end dealer-col-award"></td> : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('escalation')}
              </tr>
              ) : null}
              {activeGeneralFields.includes('contingency_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Contingency</strong></td>
                {showAverageColumns ? <td className="num"></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgContingency)}</strong></td> : null}
                {isAwardedWorkspace ? renderAwardedSummaryFooterCells('contingency', awardedSummaryTotals?.contingency || 0) : visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.contingency || 0
                  const awardedValue = dealerTotalsById[dealer.invite_id]?.awardedContingency || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerContingency
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleContingencies, value)
                    : delta(value, avgContingency)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleContingencies, value)
                    : null
                  return (
                    <Fragment key={`contingency-${dealer.invite_id}`}>
                      <td className={`${qtyStartClass} dealer-col-qty`.trim()}></td>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} dealer-col-unit-price num`.trim()}></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} dealer-col-lead-time num`.trim()}></td> : null}
                      {showDealerNotesColumnEffective ? <td className={`${notesStartClass} dealer-col-notes`.trim()}></td> : null}
                      <td className={`${extendedStartClass} dealer-col-extended num summary-dual-cell ${isBest ? 'best' : ''}`.trim()}>{renderDualGeneralValue(awardedValue, value)}</td>
                      {showDealerDeltaColumn ? <td className={`dealer-col-delta num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-col-next-delta num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                      {showDealerAwardColumn ? <td className="dealer-block-end dealer-col-award"></td> : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('contingency')}
              </tr>
              ) : null}
              {activeGeneralFields.includes('sales_tax_amount') ? (
              <tr className="summary-row summary-general-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Sales Tax</strong></td>
                {showAverageColumns ? <td className="num"></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgSalesTax)}</strong></td> : null}
                {isAwardedWorkspace ? renderAwardedSummaryFooterCells('sales-tax', awardedSummaryTotals?.salesTax || 0) : visibleDealers.map((dealer) => {
                  const value = dealerTotalsById[dealer.invite_id]?.salesTax || 0
                  const awardedValue = dealerTotalsById[dealer.invite_id]?.awardedSalesTax || 0
                  const isBest = !isAwardedWorkspace && value === bestDealerSalesTax
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleSalesTaxes, value)
                    : delta(value, avgSalesTax)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleSalesTaxes, value)
                    : null
                  return (
                    <Fragment key={`sales-tax-${dealer.invite_id}`}>
                      <td className={`${qtyStartClass} dealer-col-qty`.trim()}></td>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} dealer-col-unit-price num`.trim()}></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} dealer-col-lead-time num`.trim()}></td> : null}
                      {showDealerNotesColumnEffective ? <td className={`${notesStartClass} dealer-col-notes`.trim()}></td> : null}
                      <td className={`${extendedStartClass} dealer-col-extended num summary-dual-cell ${isBest ? 'best' : ''}`.trim()}>{renderDualGeneralValue(awardedValue, value)}</td>
                      {showDealerDeltaColumn ? <td className={`dealer-col-delta num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-col-next-delta num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                      {showDealerAwardColumn ? <td className="dealer-block-end dealer-col-award"></td> : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('sales-tax')}
              </tr>
              ) : null}
              <tr className="total-row summary-row summary-grand-total-row">
                <td colSpan={labelColumnsBeforeAverages}><strong>Grand Total</strong></td>
                {showAverageColumns ? <td className="num"></td> : null}
                {showAverageColumns ? <td className="num"><strong>{money(avgTotal)}</strong></td> : null}
                {isAwardedWorkspace ? renderAwardedSummaryFooterCells('grand-total', awardedSummaryTotals?.total || awardedSubtotal) : visibleDealers.map((dealer) => {
                  const total = dealerTotalsById[dealer.invite_id]?.total || 0
                  const awardedTotal = dealerTotalsById[dealer.invite_id]?.awardedTotal || 0
                  const isBest = !isAwardedWorkspace && total === bestDealerTotal
                  const betterDelta = comparisonMode === 'competitive'
                    ? betterDeltaDisplay(visibleTotals, total)
                    : delta(total, avgTotal)
                  const nextBestDelta = comparisonMode === 'competitive'
                    ? nextBestDeltaDisplay(visibleTotals, total)
                    : null
                  return (
                    <Fragment key={`total-${dealer.invite_id}`}>
                      <td className={`${qtyStartClass} dealer-col-qty`.trim()}></td>
                      {showUnitPriceColumnEffective ? <td className={`${unitPriceStartClass} dealer-col-unit-price num`.trim()}></td> : null}
                      {showLeadTimeColumnEffective ? <td className={`${leadTimeStartClass} dealer-col-lead-time num`.trim()}></td> : null}
                      {showDealerNotesColumnEffective ? <td className={`${notesStartClass} dealer-col-notes`.trim()}></td> : null}
                      <td className={`${extendedStartClass} dealer-col-extended num summary-dual-cell ${isBest ? 'best' : ''}`.trim()}>{renderDualGeneralValue(awardedTotal, total)}</td>
                      {showDealerDeltaColumn ? <td className={`dealer-col-delta num ${deltaToneClass(betterDelta)}`.trim()}><strong>{betterDelta}</strong></td> : null}
                      {showDealerNextDeltaColumn ? (
                        <td className={`dealer-col-next-delta num ${deltaToneClass(nextBestDelta)}`.trim()}><strong>{nextBestDelta}</strong></td>
                      ) : null}
                      {showDealerAwardColumn ? <td className="dealer-block-end dealer-col-award"></td> : null}
                    </Fragment>
                  )
                })}
                {renderAwardedRequirementsFooterCells('grand-total')}
              </tr>
            </tfoot>
          ) : null}
        </table>
        </div>
        </div>

      </SectionCard>

      {analysisModal ? (
        <div className="modal-backdrop" onClick={() => setAnalysisModal(null)}>
          <div className="modal-card bid-analysis-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head bid-analysis-modal-head">
              <h3>{analysisModal.title || '🧠 Bid Analysis'}</h3>
              <button type="button" className="btn designer-file-room-close-btn" onClick={() => setAnalysisModal(null)}>✕</button>
            </div>

            <section className="bid-analysis-section">
              <h4>Leader</h4>
              <div className="bid-analysis-leader-row">
                <p className="bid-analysis-compact-line">{leaderSummaryLine}</p>
                <button
                  type="button"
                  className="btn bid-analysis-why-btn"
                  onClick={toggleLeaderPanel}
                >
                  Why?
                </button>
              </div>
              {activeAnalysisPanel?.kind === 'leader' ? (
                <div className="bid-analysis-inline-panel">
                  <div className="bid-analysis-inline-grid">
                    <span>Leader: <strong>{analysisModal?.winner?.label || '—'}</strong></span>
                    <span>Total: <strong>{money(analysisModal?.winner?.total)}</strong></span>
                    <span>Next: <strong>{analysisModal?.winner?.runnerUpLabel || '—'}</strong></span>
                    <span>Total: <strong>{money(analysisModal?.winner?.runnerUpTotal)}</strong></span>
                    <span>Gap: <strong>{money(analysisModal?.winner?.gapDollar)}</strong></span>
                    <span>Gap %: <strong>{analysisModal?.winner?.gapPct == null ? '—' : `${Number(analysisModal?.winner?.gapPct).toFixed(1)}%`}</strong></span>
                  </div>
                  {leaderTopRows.length > 0 ? (
                    <>
                      <div className="bid-analysis-inline-label">Top contributing rows</div>
                      <div className="bid-analysis-pill-row">
                        {leaderTopRows.map((code) => (
                          <button
                            key={`leader-top-row-${code}`}
                            type="button"
                            className={`btn bid-analysis-pill ${activeAnalysisPanel?.kind === 'row' && activeAnalysisPanel?.code === code ? 'is-active' : ''}`.trim()}
                            onClick={() => toggleRowPanel(code, 'leader')}
                          >
                            {code}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
              {activeAnalysisPanel?.kind === 'row' && activeAnalysisPanel?.section === 'leader' ? (
                <div className="bid-analysis-inline-panel">
                  <strong>{activeAnalysisPanel.code}</strong>
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.spread_pct != null ? <span>Spread: +{analysisRowDetailsByCode[activeAnalysisPanel.code].spread_pct.toFixed(1)}%</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.impact != null ? <span>Impact: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].impact)}</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.highest_bid != null ? <span>Highest bid: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].highest_bid)}</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.lowest_bid != null ? <span>Lowest bid: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].lowest_bid)}</span> : null}
                  <span>Check: scope, quantity, components</span>
                </div>
              ) : null}

              <h4>Leader Review</h4>
              <p className="bid-analysis-compact-line">{leaderReviewSummaryLine}</p>
              {leaderReviewCodes.length > 0 ? (
                <div className="bid-analysis-pill-row">
                  {leaderReviewCodes.map((code) => (
                    <button
                      key={`analysis-leader-review-code-${code}`}
                      type="button"
                      className={`btn bid-analysis-pill ${activeAnalysisPanel?.kind === 'row' && activeAnalysisPanel?.code === code ? 'is-active' : ''}`.trim()}
                      onClick={() => toggleRowPanel(code, 'leader-review')}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              ) : null}
              {leaderReviewCodes.length > 0 ? (
                <p className="bid-analysis-helper-line">Look for: scope, quantity, or component differences</p>
              ) : null}
              {activeAnalysisPanel?.kind === 'row' && activeAnalysisPanel?.section === 'leader-review' ? (
                <div className="bid-analysis-inline-panel">
                  <strong>{activeAnalysisPanel.code}</strong>
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.spread_pct != null ? <span>Spread: +{analysisRowDetailsByCode[activeAnalysisPanel.code].spread_pct.toFixed(1)}%</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.impact != null ? <span>Impact: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].impact)}</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.highest_bid != null ? <span>Highest bid: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].highest_bid)}</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.lowest_bid != null ? <span>Lowest bid: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].lowest_bid)}</span> : null}
                  <span>Reason: {analysisRowDetailsByCode[activeAnalysisPanel.code]?.reason || 'high impact'}</span>
                  <span>Check: scope, quantity, components</span>
                </div>
              ) : null}

              <h4>High-Variance Rows</h4>
              {highVarianceCodes.length > 0 ? (
                <div className="bid-analysis-pill-row">
                  {highVarianceCodes.map((code) => (
                    <button
                      key={`analysis-high-variance-code-${code}`}
                      type="button"
                      className={`btn bid-analysis-pill ${activeAnalysisPanel?.kind === 'row' && activeAnalysisPanel?.code === code ? 'is-active' : ''}`.trim()}
                      onClick={() => toggleRowPanel(code, 'high-variance')}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="bid-analysis-compact-line">No material high-variance rows identified</p>
              )}
              {activeAnalysisPanel?.kind === 'row' && activeAnalysisPanel?.section === 'high-variance' ? (
                <div className="bid-analysis-inline-panel">
                  <strong>{activeAnalysisPanel.code}</strong>
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.spread_pct != null ? <span>Spread: +{analysisRowDetailsByCode[activeAnalysisPanel.code].spread_pct.toFixed(1)}%</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.impact != null ? <span>Impact: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].impact)}</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.highest_bid != null ? <span>Highest bid: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].highest_bid)}</span> : null}
                  {analysisRowDetailsByCode[activeAnalysisPanel.code]?.lowest_bid != null ? <span>Lowest bid: {money(analysisRowDetailsByCode[activeAnalysisPanel.code].lowest_bid)}</span> : null}
                  <span>Reason: {analysisRowDetailsByCode[activeAnalysisPanel.code]?.reason || 'high impact'}</span>
                  <span>Check: scope, quantity, components</span>
                </div>
              ) : null}

              <h4>Follow Up</h4>
              <ul className="bid-analysis-summary-list">
                {followUpLines.map((line, idx) => (
                  <li key={`analysis-follow-up-${idx}`}>{line}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      {unapproveModal ? (
        <div className="modal-backdrop" onClick={closeUnapproveModal}>
          <div className="modal-card award-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{unapproveModal.actionType === 'reset' ? 'Confirm Reset' : 'Confirm Unapprove'}</h3>
            <p className="award-modal-copy">
              {unapproveModal.actionType === 'reset'
                ? `Reset ${unapproveModal?.code || 'this item'}${unapproveModal?.requirementLabel ? ` \u2013 ${unapproveModal.requirementLabel}` : ''} to pending? This clears the current status. Past approvals and fixes will be preserved in the audit export only.`
                : `Unapprove ${unapproveModal?.code || 'this item'}${unapproveModal?.requirementLabel ? ` \u2013 ${unapproveModal.requirementLabel}` : ''}? This clears the current status. Past approvals and fixes will be preserved in the audit export only.`}
            </p>
            <div className="action-row">
              <button type="button" className="btn" onClick={closeUnapproveModal} disabled={unapproveSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submitUnapprove} disabled={unapproveSaving}>
                {unapproveSaving ? 'Saving...' : (unapproveModal.actionType === 'reset' ? 'Reset' : 'Unapprove')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {awardConfirmModal ? (
        <div className="modal-backdrop" onClick={closeAwardConfirmation}>
          <div className="modal-card award-modal-card award-confirm-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Confirm Award</h3>
            <p className="award-modal-copy">
              You are about to award <strong>{awardConfirmModal.selections.length}</strong> line item{awardConfirmModal.selections.length === 1 ? '' : 's'} across <strong>{awardConfirmModal.dealerSummaries.length}</strong> dealer{awardConfirmModal.dealerSummaries.length === 1 ? '' : 's'}.
            </p>
            <div className="award-confirm-summary">
              {awardConfirmModal.dealerSummaries.map((dealerSummary) => (
                <div key={`award-summary-${dealerSummary.bidId}`} className="award-confirm-summary-row">
                  <span>{dealerSummary.label}</span>
                  <strong>{dealerSummary.rowCount} line item{dealerSummary.rowCount === 1 ? '' : 's'}</strong>
                </div>
              ))}
            </div>
            <div className="action-row">
              <button type="button" className="btn" onClick={closeAwardConfirmation} disabled={awardSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn comparison-selection-commit"
                onClick={() => commitPendingSelections(awardConfirmModal.selections)}
                disabled={awardSubmitting}
              >
                {awardSubmitting ? 'Awarding...' : 'Confirm Award'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {activeLineItemFilesModal ? (
        <div className="modal-backdrop" onClick={closeLineItemFilesModal}>
          <div className={`modal-card file-room-modal-card ${activeLineItemUploads.length === 0 ? 'is-empty' : ''}`.trim()} onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <h2>{activeLineItemFilesModal.codeTag}</h2>
              <button className="btn designer-file-room-close-btn" onClick={closeLineItemFilesModal}>✕</button>
            </div>
            <p className="text-muted file-room-subtitle" style={{ marginTop: 0 }}>
              {activeLineItemFilesModal.brandName
                ? `${activeLineItemFilesModal.productName} by ${activeLineItemFilesModal.brandName}`
                : activeLineItemFilesModal.productName}
            </p>
            {isAwardedWorkspace ? (
              <div className={`designer-file-room-dropzone ${activeLineItemUploads.length === 0 ? 'is-empty' : ''}`.trim()}>
                <div className="designer-file-room-upload-icon">⇪</div>
                <div className={`designer-file-room-drop-copy ${activeLineItemUploads.length === 0 ? 'is-empty' : ''}`.trim()}>
                  Drag &amp; drop files here or click to{' '}
                  <label className="designer-file-room-browse-link">
                    browse
                    <input
                      type="file"
                      style={{ display: 'none' }}
                      disabled={lineItemUploadBusy || loading}
                      onChange={async (event) => {
                        const file = event.target.files?.[0] || null
                        if (file) await uploadLineItemFile(file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <p className="text-muted" style={{ marginTop: 0 }}>
                Bidder-uploaded files for this line item.
              </p>
            )}
            {activeLineItemUploads.length > 0 ? (
              <div className="designer-file-room-list">
                {activeLineItemUploads.map((upload) => (
                  <div key={upload.id} className="designer-file-room-item">
                    <div className="designer-file-room-item-main">
                      <div className="designer-file-room-item-name">{upload.file_name || 'File'}</div>
                      <div className="designer-file-room-item-meta">
                        {[upload.uploaded_by, formatFileSize(upload.byte_size), formatShortDate(upload.uploaded_at)].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <div className="designer-file-room-item-actions">
                      {isPdfUpload(upload) && upload.preview_url ? (
                        <button
                          type="button"
                          className="btn designer-file-room-icon-btn"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            try {
                              const absoluteUrl = upload.preview_url.startsWith('http')
                                ? upload.preview_url
                                : `${API_BASE_URL}${upload.preview_url}`
                              setActiveFilePreview({
                                url: pdfPreviewUrl(absoluteUrl),
                                fileName: upload.file_name || 'PDF Preview'
                              })
                            } catch (error) {
                              setStatusMessage(error.message)
                            }
                          }}
                          title="Preview PDF"
                        >
                          PDF
                        </button>
                      ) : null}
                      {upload.download_url ? (
                        <button
                          type="button"
                          className="btn designer-file-room-icon-btn"
                          onClick={async (event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            try {
                              const absoluteUrl = upload.download_url.startsWith('http')
                                ? upload.download_url
                                : `${API_BASE_URL}${upload.download_url}`
                              await downloadFile(absoluteUrl, upload.file_name)
                            } catch (error) {
                              setStatusMessage(error.message)
                            }
                          }}
                          title="Download"
                        >
                          <img src={DownloadIcon} alt="" aria-hidden="true" className="designer-file-room-action-icon" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="designer-file-room-empty is-empty">No files uploaded yet.</div>
            )}
          </div>
        </div>
      ) : null}
      {activeFilePreview ? (
        <div className="modal-backdrop modal-backdrop-strong" onClick={closeFilePreview}>
          <div className="modal-card file-preview-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <h2>{activeFilePreview.fileName}</h2>
              <button className="btn designer-file-room-close-btn" onClick={closeFilePreview}>✕</button>
            </div>
            <div className="file-preview-frame-wrap">
              <iframe
                src={activeFilePreview.url}
                title={activeFilePreview.fileName}
                className="file-preview-frame"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
