import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import SectionCard from '../components/SectionCard'
import { API_BASE_URL, createDealerPostAwardUpload, deleteDealerPostAwardUpload, fetchDealerBid, saveDealerBid, submitDealerBid } from '../lib/api'
import bidClosedIcon from '../assets/vendor-bid/bid-closed.svg'
import downloadCsvIcon from '../assets/vendor-bid/download-csv.svg'
import downloadIcon from '../assets/vendor-bid/download-csv.svg'
import dpLogo from '../assets/vendor-bid/dp-logo.svg'
import draftIcon from '../assets/vendor-bid/draft.svg'
import grandTotalIcon from '../assets/vendor-bid/grand-total.svg'
import importCsvIcon from '../assets/vendor-bid/import-csv.svg'
import lastSavedIcon from '../assets/vendor-bid/last-saved.svg'
import saveButtonIcon from '../assets/vendor-bid/save-button-icon.svg'
import saveWhiteIcon from '../assets/vendor-bid/save-white.svg'
import submitWhiteIcon from '../assets/vendor-bid/submit-white.svg'
import submittedStatusIcon from '../assets/vendor-bid/submitted-status.svg'
import submittedIcon from '../assets/vendor-bid/submitted.svg'

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const GENERAL_PRICING_FIELDS = [
  { key: 'delivery_amount', label: 'Shipping', percentKey: 'delivery_percent' },
  { key: 'install_amount', label: 'Install', percentKey: 'install_percent' },
  { key: 'escalation_amount', label: 'Escalation', percentKey: 'escalation_percent' },
  { key: 'contingency_amount', label: 'Contingency', percentKey: 'contingency_percent' },
  { key: 'sales_tax_amount', label: 'Sales Tax', percentKey: 'sales_tax_percent' }
]

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

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

function escapeCsv(value) {
  const raw = value == null ? '' : String(value)
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`
  }
  return raw
}

function normalizeHeader(header) {
  return String(header || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function findHeaderIndex(headers, aliases) {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i]
    if (aliases.includes(header)) return i
    if (aliases.some((alias) => header.startsWith(alias) || alias.startsWith(header))) return i
  }
  return -1
}

function findAllHeaderIndexes(headers, aliases) {
  const matches = []
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i]
    if (aliases.includes(header) || aliases.some((alias) => header.startsWith(alias) || alias.startsWith(header))) {
      matches.push(i)
    }
  }
  return matches
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeNumericLike(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (Number.isInteger(n)) return String(n)
  return String(n)
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

function normalizeCustomQuestions(value) {
  return Array.isArray(value)
    ? value.filter((question) => String(question?.id || '').trim() && String(question?.label || '').trim())
    : []
}

function percentAmount(subtotal, percentValue) {
  const subtotalNumber = numberOrNull(subtotal)
  const percentNumber = numberOrNull(percentValue)
  if (subtotalNumber == null || percentNumber == null) return null
  return subtotalNumber * (percentNumber / 100)
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  )
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

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V5" />
      <path d="m7 10 5-5 5 5" />
      <path d="M20 16.5v2.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5" />
    </svg>
  )
}

function extendedAmount(unitPrice, quantity) {
  const p = numberOrNull(unitPrice)
  const q = numberOrNull(quantity)
  if (p == null || q == null) return null
  return p * q
}

function netUnitPrice(unitListPrice, discountPercent, tariffPercent) {
  const listPrice = numberOrNull(unitListPrice)
  if (listPrice == null) return null

  const discount = numberOrNull(discountPercent) ?? 0
  const tariff = numberOrNull(tariffPercent) ?? 0
  const discounted = listPrice * (1 - (discount / 100))
  return discounted * (1 + (tariff / 100))
}

function isValidLeadTimeValue(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return true
  if (/^\d+$/.test(raw)) return true

  const range = raw.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!range) return false
  return Number(range[1]) <= Number(range[2])
}

function isNonNegativeNumberOrBlank(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return true
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0
}

function isPercentOrBlank(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return true
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
}

function isPositiveNumber(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0
}

function rowFieldError(row, field) {
  if (field === 'quantity') {
    return isNonNegativeNumberOrBlank(row?.quantity) ? null : 'Quantity must be a non-negative number'
  }

  if (field === 'unit_price') {
    const raw = String(row?.unit_price ?? '').trim()
    if (row?.is_substitution && !raw) return 'Substitution requires Unit List Price'
    return isNonNegativeNumberOrBlank(raw) ? null : 'Unit List Price must be a non-negative number'
  }

  if (field === 'discount_percent') {
    return isPercentOrBlank(row?.discount_percent) ? null : '% Discount must be between 0 and 100'
  }

  if (field === 'tariff_percent') {
    return isPercentOrBlank(row?.tariff_percent) ? null : '% Tariff must be between 0 and 100'
  }

  if (field === 'lead_time_days') {
    return isValidLeadTimeValue(row?.lead_time_days) ? null : 'Lead time must be a whole number or range like 30-45'
  }

  return null
}

export default function DealerBidPage() {
  const { token } = useParams()

  const [rows, setRows] = useState([])
  const [projectName, setProjectName] = useState('')
  const [bidPackageName, setBidPackageName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [customQuestions, setCustomQuestions] = useState([])
  const [customQuestionResponses, setCustomQuestionResponses] = useState({})
  const [deliveryPercent, setDeliveryPercent] = useState('')
  const [installPercent, setInstallPercent] = useState('')
  const [escalationPercent, setEscalationPercent] = useState('')
  const [contingencyPercent, setContingencyPercent] = useState('')
  const [salesTaxPercent, setSalesTaxPercent] = useState('')
  const [activeGeneralFields, setActiveGeneralFields] = useState([
    'delivery_amount',
    'install_amount',
    'escalation_amount',
    'contingency_amount',
    'sales_tax_amount'
  ])
  const [bidState, setBidState] = useState('draft')
  const [submittedAt, setSubmittedAt] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [statusMessage, setStatusMessage] = useState('Loading bid...')
  const [loading, setLoading] = useState(false)
  const [postAwardEnabled, setPostAwardEnabled] = useState(false)
  const [approvalTrackingEnabled, setApprovalTrackingEnabled] = useState(false)
  const [awardedVendor, setAwardedVendor] = useState(false)
  const [wonRowCount, setWonRowCount] = useState(0)
  const [lostRowCount, setLostRowCount] = useState(0)
  const [postAwardUploads, setPostAwardUploads] = useState([])
  const [activeSpecUploadsModal, setActiveSpecUploadsModal] = useState(null)
  const [questionsExpanded, setQuestionsExpanded] = useState(true)

  const applyBidResult = (result) => {
    setRows(result.bid?.line_items || [])
    setProjectName(result.bid?.project_name || '')
    setBidPackageName(result.bid?.bid_package_name || '')
    setInstructions(result.bid?.instructions || '')
    setCustomQuestions(normalizeCustomQuestions(result.bid?.custom_questions))
    setCustomQuestionResponses(result.bid?.custom_question_responses || {})
    setDeliveryPercent(result.bid?.delivery_percent ?? '')
    setInstallPercent(result.bid?.install_percent ?? '')
    setEscalationPercent(result.bid?.escalation_percent ?? '')
    setContingencyPercent(result.bid?.contingency_percent ?? '')
    setSalesTaxPercent(result.bid?.sales_tax_percent ?? '')
    setActiveGeneralFields(result.bid?.active_general_fields || [
      'delivery_amount',
      'install_amount',
      'escalation_amount',
      'contingency_amount',
      'sales_tax_amount'
    ])
    setBidState(result.bid?.state || 'draft')
    setSubmittedAt(result.bid?.submitted_at || null)
    setPostAwardEnabled(Boolean(result.bid?.post_award_enabled))
    setApprovalTrackingEnabled(Boolean(result.bid?.approval_tracking_enabled))
    setAwardedVendor(Boolean(result.bid?.awarded_vendor))
    setWonRowCount(Number(result.bid?.won_row_count || 0))
    setLostRowCount(Number(result.bid?.lost_row_count || 0))
    setPostAwardUploads(result.bid?.post_award_uploads || [])
  }

  const mergeUnsavedSubstitutionRows = (serverRows, localRowsSnapshot) => {
    const nextRows = Array.isArray(serverRows) ? [...serverRows] : []
    const localRows = Array.isArray(localRowsSnapshot) ? localRowsSnapshot : []

    const unsavedSubstitutionRows = localRows.filter((row) => (
      row?.is_substitution &&
      !nextRows.some((serverRow) => serverRow?.spec_item_id === row.spec_item_id && serverRow?.is_substitution)
    ))

    unsavedSubstitutionRows.forEach((row) => {
      const basisIndex = nextRows.findIndex((serverRow) => serverRow?.spec_item_id === row.spec_item_id && !serverRow?.is_substitution)
      const mergedRow = {
        ...row,
        can_upload_post_award_files: true
      }
      if (basisIndex >= 0) {
        nextRows.splice(basisIndex + 1, 0, mergedRow)
      } else {
        nextRows.push(mergedRow)
      }
    })

    return nextRows
  }

  const applyBidResultPreservingUnsavedSubstitutions = (result, localRowsSnapshot) => {
    setRows(mergeUnsavedSubstitutionRows(result.bid?.line_items || [], localRowsSnapshot))
    setProjectName(result.bid?.project_name || '')
    setBidPackageName(result.bid?.bid_package_name || '')
    setInstructions(result.bid?.instructions || '')
    setCustomQuestions(normalizeCustomQuestions(result.bid?.custom_questions))
    setCustomQuestionResponses(result.bid?.custom_question_responses || {})
    setDeliveryPercent(result.bid?.delivery_percent ?? '')
    setInstallPercent(result.bid?.install_percent ?? '')
    setEscalationPercent(result.bid?.escalation_percent ?? '')
    setContingencyPercent(result.bid?.contingency_percent ?? '')
    setSalesTaxPercent(result.bid?.sales_tax_percent ?? '')
    setActiveGeneralFields(result.bid?.active_general_fields || [
      'delivery_amount',
      'install_amount',
      'escalation_amount',
      'contingency_amount',
      'sales_tax_amount'
    ])
    setBidState(result.bid?.state || 'draft')
    setSubmittedAt(result.bid?.submitted_at || null)
    setPostAwardEnabled(Boolean(result.bid?.post_award_enabled))
    setApprovalTrackingEnabled(Boolean(result.bid?.approval_tracking_enabled))
    setAwardedVendor(Boolean(result.bid?.awarded_vendor))
    setWonRowCount(Number(result.bid?.won_row_count || 0))
    setLostRowCount(Number(result.bid?.lost_row_count || 0))
    setPostAwardUploads(result.bid?.post_award_uploads || [])
  }

  const rowIdentity = (row, index) => `${row.spec_item_id}-${row.is_substitution ? 'sub' : 'base'}-${index}`

  const rowDisplayNumberBySpec = useMemo(() => {
    const map = new Map()
    let counter = 0
    rows.forEach((row) => {
      if (!map.has(row.spec_item_id)) {
        counter += 1
        map.set(row.spec_item_id, counter)
      }
    })
    return map
  }, [rows])

  const hasSubstitutionForSpec = (specItemId) => rows.some((row) => row.spec_item_id === specItemId && row.is_substitution)

  const pickSubtotalRow = (specRows) => {
    const basisPriced = specRows.find((row) => !row.is_substitution && numberOrNull(row.unit_price) != null)
    if (basisPriced) return basisPriced

    const substitutionPriced = specRows.find((row) => row.is_substitution && numberOrNull(row.unit_price) != null)
    if (substitutionPriced) return substitutionPriced

    return specRows.find((row) => !row.is_substitution) || specRows[0]
  }

  const subtotal = useMemo(() => (
    Array.from(rows.reduce((grouped, row) => {
      const list = grouped.get(row.spec_item_id) || []
      list.push(row)
      grouped.set(row.spec_item_id, list)
      return grouped
    }, new Map()).values()).reduce((sum, specRows) => {
      const activeRow = pickSubtotalRow(specRows)
      const value = approvalTrackingEnabled
        ? (numberOrNull(activeRow?.extended_price) ?? 0)
        : (extendedAmount(
          netUnitPrice(activeRow?.unit_price, activeRow?.discount_percent, activeRow?.tariff_percent),
          activeRow?.quantity
        ) ?? 0)
      return sum + value
    }, 0)
  ), [rows, approvalTrackingEnabled])

  const generalPricingPercents = useMemo(() => ({
    delivery_amount: deliveryPercent,
    install_amount: installPercent,
    escalation_amount: escalationPercent,
    contingency_amount: contingencyPercent,
    sales_tax_amount: salesTaxPercent
  }), [deliveryPercent, installPercent, escalationPercent, contingencyPercent, salesTaxPercent])

  const generalPricingAmounts = useMemo(() => (
    GENERAL_PRICING_FIELDS.reduce((memo, field) => {
      memo[field.key] = percentAmount(subtotal, generalPricingPercents[field.key])
      return memo
    }, {})
  ), [subtotal, generalPricingPercents])

  const grandTotal = useMemo(() => (
    subtotal +
    (activeGeneralFields.includes('delivery_amount') ? (generalPricingAmounts.delivery_amount ?? 0) : 0) +
    (activeGeneralFields.includes('install_amount') ? (generalPricingAmounts.install_amount ?? 0) : 0) +
    (activeGeneralFields.includes('escalation_amount') ? (generalPricingAmounts.escalation_amount ?? 0) : 0) +
    (activeGeneralFields.includes('contingency_amount') ? (generalPricingAmounts.contingency_amount ?? 0) : 0) +
    (activeGeneralFields.includes('sales_tax_amount') ? (generalPricingAmounts.sales_tax_amount ?? 0) : 0)
  ), [subtotal, generalPricingAmounts, activeGeneralFields])

  const progressSummary = useMemo(() => {
    const grouped = rows.reduce((memo, row) => {
      const list = memo.get(row.spec_item_id) || []
      list.push(row)
      memo.set(row.spec_item_id, list)
      return memo
    }, new Map())

    const totalLineItems = grouped.size
    const quotedLineItems = Array.from(grouped.values()).reduce((count, specRows) => {
      const hasQuotedPrice = specRows.some((row) => numberOrNull(row.unit_price) != null)
      return count + (hasQuotedPrice ? 1 : 0)
    }, 0)
    const percentComplete = totalLineItems > 0 ? (quotedLineItems / totalLineItems) * 100 : 0

    return {
      quotedLineItems,
      totalLineItems,
      percentComplete
    }
  }, [rows])

  const activityLabel = bidState === 'submitted' ? 'SUBMITTED' : 'LAST SAVED'
  const activityValue = bidState === 'submitted' ? formatTimestamp(submittedAt) : formatTimestamp(lastSavedAt)
  const activityIcon = bidState === 'submitted' ? submittedIcon : lastSavedIcon
  const statusIsError = /failed|error|must|cannot|invalid|not a number|greater than|less than|required|blank/i.test(statusMessage || '')
  const approvalTrackingView = approvalTrackingEnabled
  const winnerView = approvalTrackingView && awardedVendor
  const statusTone = winnerView ? 'winner' : bidState
  const statusLabel = winnerView
    ? (lostRowCount > 0 ? 'partial winner' : 'sole winner')
    : bidState
  const statusIcon = winnerView || bidState === 'submitted' ? submittedStatusIcon : draftIcon

  const downloadCsvTemplate = () => {
    const headers = [
      'row_index',
      'row_type',
      'spec_item_id',
      'code_tag',
      'product_name',
      'brand_name',
      'quantity',
      'uom',
      'unit_list_price',
      'discount_percent',
      'tariff_percent',
      'unit_net_price',
      'extended_price',
      'lead_time_days',
      'dealer_notes'
    ]
    const lines = [
      headers.join(','),
      ...rows.map((row, index) => ([
        index,
        row.is_substitution ? 'substitution' : 'basis_of_design',
        row.spec_item_id,
        row.sku || '',
        row.product_name || '',
        row.brand_name || '',
        row.quantity ?? '',
        row.uom || '',
        row.unit_price ?? '',
        row.discount_percent ?? '',
        row.tariff_percent ?? '',
        netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent) ?? '',
        extendedAmount(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent), row.quantity) ?? '',
        row.lead_time_days ?? '',
        row.dealer_notes ?? ''
      ].map(escapeCsv).join(',')))
    ]

    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `dealer_bid_${token}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  }

  const importCsvFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
      if (lines.length < 2) {
        setStatusMessage('CSV import failed: no data rows found.')
        return
      }

      const headers = parseCsvLine(lines[0]).map(normalizeHeader)
      const idxRow = findHeaderIndex(headers, ['rowindex', 'row', 'lineindex', 'rownumber'])
      const idxSpec = findHeaderIndex(headers, ['specitemid', 'productid', 'specid', 'itemid'])
      const idxCode = findHeaderIndex(headers, ['codetag', 'code', 'sku', 'itemcode'])
      const idxQuantity = findHeaderIndex(headers, ['quantity', 'qty', 'qtyuom', 'qtyea'])
      const idxUnit = findHeaderIndex(headers, ['unitlistprice', 'unitlistpric', 'unitprice', 'listprice', 'price', 'dealerunitprice'])
      const discountIndexes = findAllHeaderIndexes(headers, ['discountpercent', 'discountper', 'percentdiscount', 'discount'])
      const tariffIndexes = findAllHeaderIndexes(headers, ['tariffpercent', 'tariffper', 'percenttariff', 'tariff'])
      const idxDiscount = discountIndexes[0] ?? -1
      let idxTariff = tariffIndexes[0] ?? -1
      if (idxTariff < 0 && discountIndexes.length > 1) {
        idxTariff = discountIndexes[1]
      }
      const idxLead = findHeaderIndex(headers, ['leadtimedays', 'leadtimeda', 'leadtime', 'leadtimeindays'])
      const idxNotes = findHeaderIndex(headers, ['dealernotes', 'dealernote', 'notes', 'bidnotes'])

      // Fallback to the exported column order when Excel/header edits mangle labels.
      if (idxTariff < 0 && idxDiscount >= 0 && idxLead > idxDiscount + 1) {
        idxTariff = idxDiscount + 1
      }

      if ((idxRow < 0 && idxSpec < 0 && idxCode < 0) || idxUnit < 0 || idxDiscount < 0 || idxTariff < 0 || idxLead < 0 || idxNotes < 0) {
        setStatusMessage('CSV import failed: include row_index or spec_item_id or code/tag, plus unit list price, % discount, % tariff, lead time days, and dealer notes.')
        return
      }

      const byRowIndex = new Map(rows.map((_row, index) => [String(index), index]))
      rows.forEach((_row, index) => {
        byRowIndex.set(String(index + 1), index)
      })
      const bySpecId = new Map()
      const byCodeTag = new Map()
      rows.forEach((row, index) => {
        if (row.is_substitution) return

        const specRaw = String(row.spec_item_id || '')
        const specNorm = normalizeKey(specRaw)
        const specNum = normalizeNumericLike(specRaw)
        const codeRaw = String(row.sku || '')
        const codeNorm = normalizeKey(codeRaw)

        if (specRaw) bySpecId.set(specRaw, index)
        if (specNorm) bySpecId.set(specNorm, index)
        if (specNum) bySpecId.set(specNum, index)
        if (codeRaw) byCodeTag.set(codeRaw, index)
        if (codeNorm) byCodeTag.set(codeNorm, index)
      })
      let updatedCount = 0

      setRows((prev) => {
        const next = [...prev]
        for (let i = 1; i < lines.length; i += 1) {
          const cols = parseCsvLine(lines[i])
          const rowIndexRaw = idxRow >= 0 ? String(cols[idxRow] || '').trim() : ''
          const rowIndexNorm = normalizeNumericLike(rowIndexRaw)
          const specIdRaw = idxSpec >= 0 ? String(cols[idxSpec] || '') : ''
          const specIdNorm = normalizeKey(specIdRaw)
          const specIdNum = normalizeNumericLike(specIdRaw)
          const codeTagRaw = idxCode >= 0 ? String(cols[idxCode] || '') : ''
          const codeTagNorm = normalizeKey(codeTagRaw)

          const rowIndex =
            byRowIndex.get(rowIndexRaw) ??
            byRowIndex.get(rowIndexNorm) ??
            bySpecId.get(specIdRaw) ??
            bySpecId.get(specIdNorm) ??
            bySpecId.get(specIdNum) ??
            byCodeTag.get(codeTagRaw) ??
            byCodeTag.get(codeTagNorm) ??
            (i - 1 < next.length ? (i - 1) : null)

          if (rowIndex == null) continue

          next[rowIndex] = {
            ...next[rowIndex],
            quantity: idxQuantity >= 0 ? (cols[idxQuantity] ?? '') : next[rowIndex].quantity,
            unit_price: cols[idxUnit] ?? '',
            discount_percent: cols[idxDiscount] ?? '',
            tariff_percent: cols[idxTariff] ?? '',
            lead_time_days: cols[idxLead] ?? '',
            dealer_notes: cols[idxNotes] ?? ''
          }
          if (idxQuantity >= 0) {
            const quantityValue = cols[idxQuantity] ?? ''
            const specItemId = next[rowIndex]?.spec_item_id
            next.forEach((row, idx) => {
              if (row.spec_item_id === specItemId) {
                next[idx] = { ...row, quantity: quantityValue }
              }
            })
          }
          updatedCount += 1
        }
        return next
      })

      if (updatedCount === 0) {
        setStatusMessage('CSV imported, but 0 rows matched your current bid items. Check spec_item_id or code/tag values.')
      } else {
        setStatusMessage(`CSV imported. Updated ${updatedCount} rows. Click Save Draft to persist.`)
      }
    } catch (_error) {
      setStatusMessage('CSV import failed: unable to read file.')
    } finally {
      event.target.value = ''
    }
  }

  useEffect(() => {
    let active = true

    async function loadBid() {
      setLoading(true)
      try {
        const result = await fetchDealerBid(token)
        if (!active) return
        applyBidResult(result)
        setStatusMessage('Bid loaded.')
      } catch (error) {
        if (!active) return
        setStatusMessage(error.message)
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    loadBid()
    return () => {
      active = false
    }
  }, [token])

  const updateRow = (index, key, value) => {
    setRows((prev) => {
      const next = [...prev]
      const target = next[index]
      if (!target) return prev

      if (key === 'quantity') {
        next.forEach((row, rowIndex) => {
          if (row.spec_item_id === target.spec_item_id) {
            next[rowIndex] = { ...row, quantity: value }
          }
        })
      } else {
        next[index] = { ...target, [key]: value }
      }
      return next
    })
  }

  const addSubstitutionRow = (index) => {
    const sourceRow = rows[index]
    if (!sourceRow || sourceRow.is_substitution || hasSubstitutionForSpec(sourceRow.spec_item_id)) return

    const newRow = {
      spec_item_id: sourceRow.spec_item_id,
      sku: sourceRow.sku,
      quantity: sourceRow.quantity,
      uom: sourceRow.uom,
      is_substitution: true,
      can_upload_post_award_files: true,
      product_name: '',
      brand_name: '',
      substitution_product_name: '',
      substitution_brand_name: '',
      unit_price: '',
      discount_percent: '',
      tariff_percent: '',
      lead_time_days: '',
      dealer_notes: ''
    }

    setRows((prev) => {
      const next = [...prev]
      next.splice(index + 1, 0, newRow)
      return next
    })
  }

  const removeSubstitutionRow = (index) => {
    setRows((prev) => prev.filter((_row, rowIndex) => rowIndex !== index))
  }

  const buildLineItemPayload = () => {
    return rows.map((row) => ({
      spec_item_id: row.spec_item_id,
      is_substitution: row.is_substitution ? 'true' : 'false',
      substitution_product_name: row.is_substitution ? (row.product_name ?? '') : '',
      substitution_brand_name: row.is_substitution ? (row.brand_name ?? '') : '',
      quantity: row.quantity,
      unit_price: row.unit_price,
      discount_percent: row.discount_percent,
      tariff_percent: row.tariff_percent,
      lead_time_days: row.lead_time_days,
      dealer_notes: row.dealer_notes
    }))
  }

  const saveDraftRequest = async () => {
    const fieldOrder = ['quantity', 'unit_price', 'discount_percent', 'tariff_percent', 'lead_time_days']
    for (const row of rows) {
      for (const field of fieldOrder) {
        const error = rowFieldError(row, field)
        if (error) throw new Error(error)
      }
    }

    if (!isPercentOrBlank(deliveryPercent)) {
      throw new Error('Shipping must be a percentage between 0 and 100.')
    }
    if (!isPercentOrBlank(installPercent)) {
      throw new Error('Install must be a percentage between 0 and 100.')
    }
    if (!isPercentOrBlank(escalationPercent)) {
      throw new Error('Escalation must be a percentage between 0 and 100.')
    }
    if (!isPercentOrBlank(contingencyPercent)) {
      throw new Error('Contingency must be a percentage between 0 and 100.')
    }
    if (!isPercentOrBlank(salesTaxPercent)) {
      throw new Error('Sales Tax must be a percentage between 0 and 100.')
    }

    const result = await saveDealerBid(token, buildLineItemPayload(), {
      delivery_percent: deliveryPercent,
      install_percent: installPercent,
      escalation_percent: escalationPercent,
      contingency_percent: contingencyPercent,
      sales_tax_percent: salesTaxPercent,
      custom_question_responses: customQuestionResponses
    })
    setBidState(result.state || 'draft')
    setLastSavedAt(result.updated_at || null)
    return result
  }

  const handleSaveDraft = async () => {
    if (bidState === 'submitted') return

    setLoading(true)
    setStatusMessage('Saving draft...')

    try {
      await saveDraftRequest()
      setStatusMessage('Draft saved.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (bidState === 'submitted') return

    setLoading(true)
    setStatusMessage('Submitting bid...')

    try {
      const seenSpecItemIds = new Set()
      for (const row of rows) {
        if (seenSpecItemIds.has(row.spec_item_id)) continue
        seenSpecItemIds.add(row.spec_item_id)

        if (!isPositiveNumber(row.quantity)) {
          const displayNumber = rowDisplayNumberBySpec.get(row.spec_item_id)
          throw new Error(`Quantity must be greater than 0 for row ${displayNumber || row.sku || row.spec_item_id}`)
        }
      }
      await saveDraftRequest()
      const result = await submitDealerBid(token)
      setBidState('submitted')
      setSubmittedAt(result.submitted_at || null)
      setStatusMessage('Bid submitted. This bid is now locked.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const uploadPostAwardFile = async (event, specItemId = null, isSubstitution = false) => {
    const file = event.target.files?.[0]
    if (!file) return
    const localRowsSnapshot = rows

    if (!postAwardEnabled) {
      setStatusMessage('File uploads are not available for this bid package.')
      event.target.value = ''
      return
    }

    setLoading(true)
    setStatusMessage('Uploading file...')
    try {
      const result = await createDealerPostAwardUpload(token, {
        file,
        fileName: file.name,
        specItemId,
        isSubstitution
      })
      if (result?.upload) {
        setPostAwardUploads((prev) => {
          const next = [result.upload, ...prev.filter((item) => item.id !== result.upload.id)]
          return next
        })
      }
      const refreshed = await fetchDealerBid(token)
      applyBidResultPreservingUnsavedSubstitutions(refreshed, localRowsSnapshot)
      setStatusMessage('File uploaded.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  const uploadsForRow = (specItemId, isSubstitution = false) => (
    postAwardUploads.filter((upload) => (
      String(upload.spec_item_id || '') === String(specItemId) &&
      Boolean(upload.is_substitution) === Boolean(isSubstitution)
    ))
  )
  const generalUploads = postAwardUploads.filter((upload) => !upload.spec_item_id)
  const activeModalUploads = activeSpecUploadsModal
    ? uploadsForRow(activeSpecUploadsModal.specItemId, activeSpecUploadsModal.isSubstitution)
    : []
  const deletePostAwardFile = async (upload) => {
    if (!upload?.id || upload?.uploader_role !== 'vendor') return
    const confirmed = window.confirm('Delete this uploaded file?')
    if (!confirmed) return

    setLoading(true)
    setStatusMessage('Deleting file...')
    try {
      await deleteDealerPostAwardUpload(token, upload.id)
      setPostAwardUploads((prev) => prev.filter((item) => item.id !== upload.id))
      setActiveSpecUploadsModal((prev) => {
        if (!prev) return prev
        return {
          ...prev
        }
      })
      setStatusMessage('File deleted.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }
  const answeredQuestionCount = useMemo(() => (
    customQuestions.reduce((count, question) => {
      const value = customQuestionResponses?.[String(question.id)] ?? ''
      return count + (String(value).trim() ? 1 : 0)
    }, 0)
  ), [customQuestionResponses, customQuestions])

  const handleSaveResponses = async () => {
    if (bidState === 'submitted' || approvalTrackingView) return

    setLoading(true)
    setStatusMessage('Saving responses...')
    try {
      await saveDraftRequest()
      setStatusMessage('Responses saved.')
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stack vendor-bid-page">
      <div className="vendor-brandline">
        <img src={dpLogo} alt="Designer Pages PRO" className="vendor-brand-logo" />
        {approvalTrackingView ? (
          <div className="vendor-closed-banner">
            <img src={bidClosedIcon} alt="" className="vendor-closed-icon" />
            <span>
              <strong>Approval Tracking.</strong> Review the rows you won and lost below. Your uploaded files remain attached to the matching line items.
            </span>
          </div>
        ) : bidState === 'submitted' ? (
          <div className="vendor-closed-banner">
            <img src={bidClosedIcon} alt="" className="vendor-closed-icon" />
            <span>
              <strong>Bid Closed.</strong> Need to update something? Reach out to the designer who invited you to reopen it.
            </span>
          </div>
        ) : null}
      </div>

      <section className="vendor-head-card">
        <div className="vendor-head-strip">
          <h2>
            {projectName && bidPackageName
              ? `${projectName}: ${bidPackageName}`
              : (bidPackageName || 'Project Name')}
          </h2>
          {bidState === 'submitted' || approvalTrackingView ? null : (
            <div className="action-row">
              <button className="btn vendor-strip-btn" onClick={handleSaveDraft} disabled={loading}>
                <img src={saveWhiteIcon} alt="" className="vendor-btn-icon" />
                Save Draft
              </button>
              <button className="btn btn-primary vendor-strip-btn-primary" onClick={handleSubmit} disabled={loading}>
                <img src={submitWhiteIcon} alt="" className="vendor-btn-icon" />
                Submit Final
              </button>
            </div>
          )}
        </div>
        <div className="vendor-metric-grid">
          <div className="vendor-metric-card">
            <img src={statusIcon} alt="" className="vendor-metric-icon" />
            <div>
              <div className="vendor-metric-label">STATUS</div>
              <div className={`vendor-state-pill ${statusTone}`}>{statusLabel}</div>
            </div>
          </div>
          <div className="vendor-metric-card">
            <img src={submittedStatusIcon} alt="" className="vendor-metric-icon" />
            <div>
              <div className="vendor-metric-label">{approvalTrackingView ? 'RESULTS' : 'QUOTED ITEMS'}</div>
              <div className="vendor-metric-value">
                {approvalTrackingView
                  ? `${wonRowCount} won / ${lostRowCount} lost`
                  : `${progressSummary.quotedLineItems} / ${progressSummary.totalLineItems}`}
              </div>
              <div className="vendor-metric-subvalue">
                {approvalTrackingView
                  ? `${wonRowCount + lostRowCount} resolved row${wonRowCount + lostRowCount === 1 ? '' : 's'}`
                  : `${progressSummary.percentComplete.toFixed(0)}% complete`}
              </div>
            </div>
          </div>
          <div className="vendor-metric-card">
            <img src={activityIcon} alt="" className="vendor-metric-icon" />
            <div>
              <div className="vendor-metric-label">{activityLabel}</div>
              <div className="vendor-metric-value">{activityValue}</div>
            </div>
          </div>
          <div className="vendor-metric-card vendor-total-card">
            <img src={grandTotalIcon} alt="" className="vendor-metric-icon" />
            <div>
              <div className="vendor-metric-label">{approvalTrackingView ? 'WON TOTAL' : 'GRAND TOTAL'}</div>
              <div className="vendor-total-value">{money(grandTotal)}</div>
            </div>
          </div>
        </div>
      </section>

      {instructions || customQuestions.length > 0 ? (
        <SectionCard title="Instructions" className="vendor-section-card vendor-instructions-card">
          {instructions ? (
            <p className="text-muted vendor-instructions-copy" style={{ whiteSpace: 'pre-wrap' }}>{instructions}</p>
          ) : null}
          {customQuestions.length > 0 ? (
            <div className="vendor-questions-panel">
              <button
                type="button"
                className="vendor-questions-toggle"
                onClick={() => setQuestionsExpanded((prev) => !prev)}
                aria-expanded={questionsExpanded}
              >
                <span className={`vendor-questions-toggle-caret ${questionsExpanded ? 'is-open' : ''}`} aria-hidden="true">
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 4.5 3 3 3-3" />
                  </svg>
                </span>
                <span className="vendor-questions-toggle-label">
                  {approvalTrackingView ? 'Questions & Responses' : `Questions (${answeredQuestionCount}/${customQuestions.length})`}
                </span>
              </button>
              {questionsExpanded ? (
                <div className="vendor-questions-panel-body">
                  <div className="stack vendor-questions-list">
                    {customQuestions.map((question) => {
                      const questionId = String(question.id)
                      const responseValue = customQuestionResponses?.[questionId] ?? ''
                      return (
                        <label key={questionId} className="dealer-question-row">
                          <span className="dealer-question-label">{question.label}</span>
                          {approvalTrackingView || bidState === 'submitted' ? (
                            <div className="dealer-question-response-readonly">
                              {String(responseValue || '').trim() || '—'}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={responseValue}
                              placeholder=""
                              onChange={(event) => {
                                const nextValue = event.target.value
                                setCustomQuestionResponses((prev) => ({
                                  ...(prev || {}),
                                  [questionId]: nextValue
                                }))
                              }}
                            />
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {approvalTrackingView || bidState === 'submitted' ? null : (
                    <div className="vendor-questions-actions">
                      <button
                        type="button"
                        className="btn btn-primary vendor-questions-save-btn"
                        onClick={handleSaveResponses}
                        disabled={loading}
                      >
                        <img src={saveButtonIcon} alt="" aria-hidden="true" className="vendor-questions-save-icon" />
                        Save Responses
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {postAwardEnabled ? (
        <SectionCard title={approvalTrackingView ? 'Line Item Files' : 'Bid Files'} className="vendor-section-card">
          <div className="stack">
            <p className="text-muted" style={{ margin: 0 }}>
              {approvalTrackingView
                ? 'Uploads stay attached to the line items below while approvals are being tracked.'
                : 'Upload supporting files on substitution rows so the designer can review the proposed substitute before award.'}
            </p>
            {generalUploads.length > 0 ? (
              <div>
                <div className="text-muted" style={{ marginTop: '0.35rem' }}>
                  {generalUploads.length} general file(s) uploaded
                </div>
                <table className="table dense" style={{ marginTop: '0.45rem' }}>
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generalUploads.map((upload) => (
                      <tr key={`general-upload-${upload.id}`}>
                        <td>{upload.file_name || '—'}</td>
                        <td>{formatTimestamp(upload.uploaded_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        className="vendor-section-card vendor-line-items-section"
        title="Line Items"
        actions={
          <div className="action-row">
            {approvalTrackingView ? null : (
              <>
                <button className="btn vendor-ghost-btn" onClick={downloadCsvTemplate}>
                  <img src={downloadCsvIcon} alt="" className="vendor-table-action-icon" />
                  Download CSV
                </button>
                <label className={`btn vendor-ghost-btn ${bidState === 'submitted' ? 'btn-disabled' : ''}`}>
                  <img src={importCsvIcon} alt="" className="vendor-table-action-icon" />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={importCsvFile}
                    style={{ display: 'none' }}
                    disabled={bidState === 'submitted'}
                  />
                </label>
              </>
            )}
          </div>
        }
      >
        <p className={`vendor-status-inline ${statusIsError ? 'error' : 'text-muted'}`}>{statusMessage}</p>
        <div className="vendor-table-wrap">
        <table className="table dense vendor-line-table vendor-procurement-table">
          <thead>
            <tr>
              <th>Row #</th>
              <th>Code/Tag</th>
              <th>Product</th>
              <th>Brand</th>
              <th className="qty-col">Qty/UOM</th>
              {approvalTrackingView ? <th>Result</th> : null}
              {approvalTrackingView ? null : <th>Unit List Price</th>}
              {approvalTrackingView ? null : <th>% Discount</th>}
              {approvalTrackingView ? null : <th>% Tariff</th>}
              {approvalTrackingView ? null : <th>Unit Net Price</th>}
              {approvalTrackingView ? null : <th>Lead Time (days)</th>}
              {approvalTrackingView ? null : <th>Notes</th>}
              <th>Extended Price</th>
              <th>Files</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowUploads = uploadsForRow(row.spec_item_id, row.is_substitution)
              const showRowFilesButton = Boolean(row.can_upload_post_award_files)
              const canAddSubstitution = !row.is_substitution && bidState !== 'submitted' && !hasSubstitutionForSpec(row.spec_item_id)
              const hasLinkedSubstitution = !row.is_substitution && hasSubstitutionForSpec(row.spec_item_id)
              if (approvalTrackingView) {
                return (
                  <tr key={rowIdentity(row, index)} className={row.award_status === 'lost' ? 'vendor-award-row-lost' : 'vendor-award-row-won'}>
                    <td className="vendor-row-index">
                      {rowDisplayNumberBySpec.get(row.spec_item_id)}
                    </td>
                    <td>
                      {row.sku || '—'}
                      {row.approved_source === 'alt' || row.is_substitution ? <span className="substitution-chip">Sub</span> : null}
                    </td>
                    <td>{row.product_name || '—'}</td>
                    <td>{row.brand_name || '—'}</td>
                    <td className="qty-col">{row.quantity || '—'} {row.uom || ''}</td>
                    <td>
                      <span className={`vendor-row-result-pill ${row.award_status || 'lost'}`}>
                        {row.award_status === 'won' ? 'Won' : 'Lost'}
                      </span>
                    </td>
                    <td>{money(row.extended_price)}</td>
                    <td>
                      {showRowFilesButton ? (
                        <button
                          type="button"
                          className={`btn approval-files-btn ${rowUploads.length > 0 ? 'has-files' : 'no-files'}`.trim()}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setActiveSpecUploadsModal({
                              specItemId: row.spec_item_id,
                              codeTag: row.sku || '—',
                              productName: row.product_name || '—',
                              brandName: row.brand_name || '',
                              isSubstitution: row.is_substitution
                            })
                          }}
                          title={rowUploads.length > 0 ? `${rowUploads.length} uploaded file${rowUploads.length === 1 ? '' : 's'}` : 'No uploaded files yet'}
                        >
                          <span className="approval-files-count">{rowUploads.length}</span>
                        </button>
                      ) : (
                        <span aria-hidden="true"></span>
                      )}
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={rowIdentity(row, index)} className={row.is_substitution ? 'substitution-row' : ''}>
                  <td className="vendor-row-index">
                    {row.is_substitution ? '' : (
                      <span className="vendor-row-index-inner">
                        {canAddSubstitution ? (
                          <button
                            type="button"
                            className="row-index-plus row-index-plus-action"
                            onClick={() => addSubstitutionRow(index)}
                            aria-label="Add substitution"
                            title="Add substitution"
                          >
                            +
                          </button>
                        ) : hasLinkedSubstitution ? (
                          <span className="row-index-plus row-index-plus-disabled" aria-hidden="true">+</span>
                        ) : (
                          <span className="row-index-plus row-index-plus-placeholder" aria-hidden="true" />
                        )}
                        <span className="vendor-row-index-value">{rowDisplayNumberBySpec.get(row.spec_item_id)}</span>
                      </span>
                    )}
                  </td>
                  <td className="code-cell">
                    {row.is_substitution ? (
                      <div className="tree sub">
                        <div className="tree-branch" />
                        <div className="tree-child">
                          {bidState !== 'submitted' ? (
                            <button
                              type="button"
                              className="remove"
                              onClick={() => removeSubstitutionRow(index)}
                              title="Remove substitution"
                              aria-label="Remove substitution"
                            >
                              ×
                            </button>
                          ) : (
                            <span className="remove is-static" aria-hidden="true">×</span>
                          )}
                        </div>
                      </div>
                    ) : <span className="code">{row.sku || '—'}</span>}
                  </td>
                  <td>
                    {row.is_substitution ? (
                      <input
                        value={row.product_name ?? ''}
                        onChange={(event) => updateRow(index, 'product_name', event.target.value)}
                        placeholder="Substitution product"
                        disabled={bidState === 'submitted'}
                      />
                    ) : (
                      row.product_name || '—'
                    )}
                  </td>
                  <td>
                    {row.is_substitution ? (
                      <input
                        value={row.brand_name ?? ''}
                        onChange={(event) => updateRow(index, 'brand_name', event.target.value)}
                        placeholder="Substitution brand"
                        disabled={bidState === 'submitted'}
                      />
                    ) : (
                      row.brand_name || '—'
                    )}
                  </td>
                  <td className="qty-col">
                    {bidState === 'submitted' ? (
                      `${row.quantity || '—'} ${row.uom || ''}`
                    ) : (
                      <div className="vendor-qty-input-wrap">
                        <input
                          value={row.quantity ?? ''}
                          onChange={(event) => updateRow(index, 'quantity', event.target.value)}
                          className={rowFieldError(row, 'quantity') ? 'input-error' : ''}
                          placeholder="Qty"
                          disabled={bidState === 'submitted'}
                        />
                        <span className="vendor-qty-uom">{row.uom || ''}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      value={row.unit_price ?? ''}
                      onChange={(event) => updateRow(index, 'unit_price', event.target.value)}
                      className={rowFieldError(row, 'unit_price') ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  </td>
                  <td>
                    <input
                      value={row.discount_percent ?? ''}
                      onChange={(event) => updateRow(index, 'discount_percent', event.target.value)}
                      className={rowFieldError(row, 'discount_percent') ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  </td>
                  <td>
                    <input
                      value={row.tariff_percent ?? ''}
                      onChange={(event) => updateRow(index, 'tariff_percent', event.target.value)}
                      className={rowFieldError(row, 'tariff_percent') ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  </td>
                  <td>{money(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent))}</td>
                  <td>
                    <input
                      value={row.lead_time_days ?? ''}
                      onChange={(event) => updateRow(index, 'lead_time_days', event.target.value)}
                      placeholder="30 or 30-45"
                      className={rowFieldError(row, 'lead_time_days') ? 'input-error' : ''}
                      disabled={bidState === 'submitted'}
                    />
                  </td>
                  <td>
                    <input
                      value={row.dealer_notes ?? ''}
                      onChange={(event) => updateRow(index, 'dealer_notes', event.target.value)}
                      disabled={bidState === 'submitted'}
                    />
                  </td>
                  <td>{money(extendedAmount(netUnitPrice(row.unit_price, row.discount_percent, row.tariff_percent), row.quantity))}</td>
                  <td>
                    {showRowFilesButton ? (
                      <button
                        type="button"
                        className={`btn approval-files-btn ${rowUploads.length > 0 ? 'has-files' : 'no-files'}`.trim()}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setActiveSpecUploadsModal({
                            specItemId: row.spec_item_id,
                            codeTag: row.sku || '—',
                            productName: row.product_name || '—',
                            brandName: row.brand_name || '',
                            isSubstitution: row.is_substitution
                          })
                        }}
                        title={rowUploads.length > 0 ? `${rowUploads.length} uploaded file${rowUploads.length === 1 ? '' : 's'}` : 'Upload or view files'}
                      >
                        <span className="approval-files-count">{rowUploads.length}</span>
                      </button>
                    ) : (
                      <span aria-hidden="true"></span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={approvalTrackingView ? 9 : 13} className="text-muted">No line items loaded.</td>
              </tr>
            ) : null}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="total-row">
                <td colSpan={approvalTrackingView ? 6 : 11} style={{ textAlign: 'right' }}>{approvalTrackingView ? 'Won Sub-total' : 'Sub-total'}</td>
                <td>{money(subtotal)}</td>
                <td></td>
              </tr>
              {GENERAL_PRICING_FIELDS.filter((field) => activeGeneralFields.includes(field.key)).map((field) => {
                const percentValue = generalPricingPercents[field.key]
                const derivedAmount = generalPricingAmounts[field.key]
                const setPercentValue = {
                  delivery_amount: setDeliveryPercent,
                  install_amount: setInstallPercent,
                  escalation_amount: setEscalationPercent,
                  contingency_amount: setContingencyPercent,
                  sales_tax_amount: setSalesTaxPercent
                }[field.key]

                return (
                  <tr key={field.key}>
                    <td colSpan={approvalTrackingView ? 6 : 11} style={{ textAlign: 'right' }}>{field.label}</td>
                    <td>
                      {approvalTrackingView ? money(derivedAmount) : (
                        <div>
                          <input
                            value={percentValue}
                            onChange={(event) => setPercentValue(event.target.value)}
                            className={!isPercentOrBlank(percentValue) ? 'input-error' : ''}
                            disabled={bidState === 'submitted'}
                            placeholder="%"
                          />
                          <div className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.78rem' }}>
                            {percentValue === '' ? 'Enter %' : `${percentValue}% = ${money(derivedAmount)}`}
                          </div>
                        </div>
                      )}
                    </td>
                    <td></td>
                  </tr>
                )
              })}
              <tr className="total-row">
                <td colSpan={approvalTrackingView ? 6 : 11} style={{ textAlign: 'right' }}>{approvalTrackingView ? 'Won Total' : 'Grand Total'}</td>
                <td>{money(grandTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        </div>
      </SectionCard>

      {activeSpecUploadsModal ? (
        <div className="modal-backdrop" onClick={() => setActiveSpecUploadsModal(null)}>
          <div className={`modal-card file-room-modal-card ${activeModalUploads.length === 0 ? 'is-empty' : ''}`.trim()} onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <h2>{activeSpecUploadsModal.codeTag}</h2>
              <button className="btn designer-file-room-close-btn" onClick={() => setActiveSpecUploadsModal(null)}>✕</button>
            </div>
            <p className="text-muted file-room-subtitle" style={{ marginTop: 0 }}>
              {activeSpecUploadsModal.brandName
                ? `${activeSpecUploadsModal.productName} by ${activeSpecUploadsModal.brandName}`
                : activeSpecUploadsModal.productName}
            </p>
            <div className={`designer-file-room-dropzone ${activeModalUploads.length === 0 ? 'is-empty' : ''}`.trim()}>
              <div className="designer-file-room-upload-icon">⇪</div>
              <div className={`designer-file-room-drop-copy ${activeModalUploads.length === 0 ? 'is-empty' : ''}`.trim()}>
                Drag &amp; drop files here or click to{' '}
                <label className="designer-file-room-browse-link">
                  browse
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    disabled={loading}
                    onChange={(event) => uploadPostAwardFile(event, activeSpecUploadsModal.specItemId, activeSpecUploadsModal.isSubstitution)}
                  />
                </label>
              </div>
            </div>
            {activeModalUploads.length > 0 ? (
              <>
                <div className="designer-file-room-top-row">
                  <div className="designer-file-room-files-count">{`${activeModalUploads.length} File${activeModalUploads.length === 1 ? '' : 's'}`}</div>
                </div>
                <div className="designer-file-room-list">
                  {activeModalUploads.map((upload) => (
                    <div key={`modal-upload-${upload.id}`} className="designer-file-room-item">
                      <div className="designer-file-room-item-icon"><FileIcon /></div>
                      <div className="designer-file-room-item-main">
                        <div className="designer-file-room-item-name">{upload.file_name || '—'}</div>
                        <div className="designer-file-room-item-meta">
                          {[formatFileSize(upload.byte_size), formatShortDate(upload.uploaded_at)].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                      <div className="designer-file-room-item-actions">
                        {upload.download_url ? (
                          <button
                            type="button"
                            className="btn designer-file-room-icon-btn"
                            onClick={async (event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              try {
                                await downloadFile(`${API_BASE_URL}${upload.download_url}`, upload.file_name)
                              } catch (error) {
                                setStatusMessage(error.message)
                              }
                            }}
                            title="Download"
                          >
                            <img src={downloadIcon} alt="" aria-hidden="true" className="designer-file-room-action-icon" />
                          </button>
                        ) : null}
                        {upload.uploader_role === 'vendor' ? (
                          <button
                            type="button"
                            className="btn designer-file-room-icon-btn danger"
                            onClick={() => deletePostAwardFile(upload)}
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
              </>
            ) : (
              <div className="designer-file-room-empty is-empty">No files uploaded yet.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
