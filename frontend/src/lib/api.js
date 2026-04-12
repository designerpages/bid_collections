const mode = import.meta.env.MODE

function defaultApiBaseUrlByMode() {
  switch (mode) {
    case 'production':
      return 'https://www.designerpages.com'
    case 'staging':
      return 'https://staging.designerpages.com'
    case 'development':
    default:
      return 'http://127.0.0.1:3000'
  }
}

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrlByMode()
const envApiPrefix = import.meta.env.VITE_API_PREFIX || '/api'

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function trimLeadingSlash(value) {
  return String(value || '').replace(/^\/+/, '')
}

function normalizePath(path) {
  const cleanPath = String(path || '')
  return cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`
}

export const API_BASE_URL = trimTrailingSlash(envApiBaseUrl)
export const API_PREFIX = `/${trimLeadingSlash(envApiPrefix || '/api')}`.replace(/\/+$/, '')
export const DP_INTEGRATION_ENABLED = String(import.meta.env.VITE_DP_INTEGRATION || '') === '1'

function buildApiUrl(path) {
  const normalizedPath = normalizePath(path)
  if (normalizedPath.startsWith(`${API_PREFIX}/`) || normalizedPath === API_PREFIX) {
    return `${API_BASE_URL}${normalizedPath}`
  }
  return `${API_BASE_URL}${API_PREFIX}${normalizedPath}`
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...options,
    headers: isFormData
      ? { ...(options.headers || {}) }
      : {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
  })

  let data = null
  try {
    data = await response.json()
  } catch (_error) {
    data = null
  }

  if (!response.ok) {
    const message = data?.error || data?.errors?.join(', ') || `Request failed (${response.status})`
    const error = new Error(message)
    error.details = data
    throw error
  }

  return data
}

export async function createProject(payload) {
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ project: payload })
  })
}

export async function fetchProjects() {
  return request('/api/projects')
}

// DP integration (browser -> BC proxy -> DP, HMAC signed server-to-server)
export async function dpResolveContext({ firmId, projectName, projectNumber }) {
  return request('/api/dp/context', {
    method: 'POST',
    body: JSON.stringify({ firm_id: firmId, project_name: projectName, project_number: projectNumber })
  })
}

/** DP lightbox embed: GET context by firm + DP project id (see BID_COLLECTIONS_DP_EMBED_CONTEXT.md). */
export async function dpResolveContextEmbed({ firmId, projectId }) {
  const q = new URLSearchParams({
    firm_id: String(firmId),
    project_id: String(projectId)
  })
  return request(`/api/dp/context?${q.toString()}`, { method: 'GET' })
}

export async function dpFetchProjectBidPackages({ projectId }) {
  return request(`/api/dp/projects/${projectId}/bid_packages`)
}

export async function dpResolvePackageSelection({ projectId, packageId, requestedBy }) {
  return request(`/api/dp/projects/${projectId}/bid_packages/${packageId}/selection`, {
    method: 'POST',
    body: JSON.stringify({ requested_by: requestedBy })
  })
}

export async function dpFetchSpecsBatch({ projectId, projectProductIds }) {
  return request(`/api/dp/projects/${projectId}/specs/batch`, {
    method: 'POST',
    body: JSON.stringify({ project_product_ids: projectProductIds || [] })
  })
}

export async function deleteProject(projectId) {
  return request(`/api/projects/${projectId}`, {
    method: 'DELETE'
  })
}

export async function previewBidPackage({ projectId, csvContent, sourceProfile }) {
  return request(`/api/projects/${projectId}/bid_packages/preview`, {
    method: 'POST',
    body: JSON.stringify({ csv_content: csvContent, source_profile: sourceProfile })
  })
}

export async function createBidPackage({
  projectId,
  name,
  sourceFilename,
  csvContent,
  sourceProfile,
  visibility = 'private',
  activeGeneralFields = [],
  instructions = '',
  customQuestions = []
}) {
  return request(`/api/projects/${projectId}/bid_packages`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      source_filename: sourceFilename,
      csv_content: csvContent,
      source_profile: sourceProfile,
      visibility,
      active_general_fields: activeGeneralFields,
      instructions,
      custom_questions: customQuestions
    })
  })
}

export async function importRowsToBidPackage({
  bidPackageId,
  sourceFilename,
  csvContent,
  sourceProfile
}) {
  return request(`/api/bid_packages/${bidPackageId}/import_rows`, {
    method: 'POST',
    body: JSON.stringify({
      source_filename: sourceFilename,
      csv_content: csvContent,
      source_profile: sourceProfile
    })
  })
}

export async function fetchBidPackageDashboard(bidPackageId) {
  return request(`/api/bid_packages/${bidPackageId}/dashboard`)
}

export async function fetchBidPackages() {
  return request('/api/bid_packages')
}

export async function deleteBidPackage(bidPackageId) {
  return request(`/api/bid_packages/${bidPackageId}`, {
    method: 'DELETE'
  })
}

export async function deactivateSpecItem({ bidPackageId, specItemId }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/deactivate`, {
    method: 'PATCH',
    body: JSON.stringify({})
  })
}

export async function reactivateSpecItem({ bidPackageId, specItemId }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/reactivate`, {
    method: 'PATCH',
    body: JSON.stringify({})
  })
}

export async function approveSpecItemRequirement({ bidPackageId, specItemId, requirementKey, componentId, approvedAt, approvedBy }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/requirements/${requirementKey}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({
      component_id: componentId,
      approved_at: approvedAt,
      approved_by: approvedBy
    })
  })
}

export async function markSpecItemRequirementNeedsFix({ bidPackageId, specItemId, requirementKey, componentId, needsFixAt }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/requirements/${requirementKey}/needs_fix`, {
    method: 'PATCH',
    body: JSON.stringify({
      component_id: componentId,
      needs_fix_at: needsFixAt
    })
  })
}

export async function unapproveSpecItemRequirement({ bidPackageId, specItemId, requirementKey, componentId, actionType }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/requirements/${requirementKey}/unapprove`, {
    method: 'PATCH',
    body: JSON.stringify({
      component_id: componentId,
      action_type: actionType
    })
  })
}

export async function createSpecItemApprovalComponent({ bidPackageId, specItemId, label }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/approval_components`, {
    method: 'POST',
    body: JSON.stringify({ label })
  })
}

export async function updateSpecItemApprovalComponent({ bidPackageId, specItemId, componentId, label }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/approval_components/${componentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ label })
  })
}

export async function deleteSpecItemApprovalComponent({ bidPackageId, specItemId, componentId }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/approval_components/${componentId}`, {
    method: 'DELETE'
  })
}

export async function activateSpecItemComponentRequirement({ bidPackageId, specItemId, componentId, requirementKey }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/approval_components/${componentId}/requirements/${requirementKey}/activate`, {
    method: 'PATCH',
    body: JSON.stringify({})
  })
}

export async function deactivateSpecItemComponentRequirement({ bidPackageId, specItemId, componentId, requirementKey }) {
  return request(`/api/bid_packages/${bidPackageId}/spec_items/${specItemId}/approval_components/${componentId}/requirements/${requirementKey}/deactivate`, {
    method: 'PATCH',
    body: JSON.stringify({})
  })
}

export async function clearCurrentAwardApprovals({ bidPackageId }) {
  return request(`/api/bid_packages/${bidPackageId}/clear_current_award_approvals`, {
    method: 'PATCH',
    body: JSON.stringify({})
  })
}

export async function updateBidPackage({ bidPackageId, name, visibility, activeGeneralFields, instructions = '', customQuestions = [] }) {
  return request(`/api/bid_packages/${bidPackageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name,
      visibility,
      active_general_fields: activeGeneralFields,
      instructions,
      custom_questions: customQuestions
    })
  })
}

export async function createInvite({ bidPackageId, dealerName, dealerEmail, password }) {
  return request(`/api/bid_packages/${bidPackageId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      invite: {
        dealer_name: dealerName,
        dealer_email: dealerEmail,
        password,
        password_confirmation: password
      }
    })
  })
}

export async function deleteInvite({ bidPackageId, inviteId }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}`, {
    method: 'DELETE'
  })
}

export async function disableInvite({ bidPackageId, inviteId }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/disable`, {
    method: 'PATCH',
    body: JSON.stringify({})
  })
}

export async function enableInvite({ bidPackageId, inviteId }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/enable`, {
    method: 'PATCH',
    body: JSON.stringify({})
  })
}

export async function bulkDisableInvites({ bidPackageId, inviteIds = [] }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/bulk_disable`, {
    method: 'POST',
    body: JSON.stringify({ invite_ids: inviteIds })
  })
}

export async function bulkEnableInvites({ bidPackageId, inviteIds = [] }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/bulk_enable`, {
    method: 'POST',
    body: JSON.stringify({ invite_ids: inviteIds })
  })
}

export async function bulkReopenInvites({ bidPackageId, inviteIds = [] }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/bulk_reopen`, {
    method: 'POST',
    body: JSON.stringify({ invite_ids: inviteIds })
  })
}

export async function bulkDeleteInvites({ bidPackageId, inviteIds = [] }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/bulk_destroy`, {
    method: 'POST',
    body: JSON.stringify({ invite_ids: inviteIds })
  })
}

export async function fetchInviteHistory({ bidPackageId, inviteId }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/history`)
}

export async function reopenInviteBid({ bidPackageId, inviteId, reason }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  })
}

export async function recloseInviteBid({ bidPackageId, inviteId }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/reclose`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export async function updateInvitePassword({ bidPackageId, inviteId, password }) {
  return request(`/api/bid_packages/${bidPackageId}/invites/${inviteId}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password })
  })
}

export async function fetchComparison(
  bidPackageId,
  {
    dealerPriceMode = {},
    cellPriceMode = {},
    excludedSpecItemIds = [],
    includeInactive = false
  } = {}
) {
  const params = new URLSearchParams()

  Object.entries(dealerPriceMode || {}).forEach(([inviteId, mode]) => {
    if (mode === 'alt' || mode === 'bod') {
      params.append(`price_mode[${inviteId}]`, mode)
    }
  })

  Object.entries(cellPriceMode || {}).forEach(([compositeKey, mode]) => {
    if (!(mode === 'alt' || mode === 'bod')) return
    const [specItemId, inviteId] = String(compositeKey).split(':')
    if (!specItemId || !inviteId) return
    params.append(`cell_price_mode[${specItemId}][${inviteId}]`, mode)
  })

  ;(excludedSpecItemIds || []).forEach((specItemId) => {
    if (specItemId != null && specItemId !== '') {
      params.append('excluded_spec_item_ids[]', String(specItemId))
    }
  })
  if (includeInactive) {
    params.append('include_inactive', 'true')
  }

  const query = params.toString()
  return request(`/api/bid_packages/${bidPackageId}/comparison${query ? `?${query}` : ''}`)
}

export async function generateComparisonAnalysis({
  bidPackageId,
  deterministic
}) {
  return request(`/api/bid_packages/${bidPackageId}/comparison_analysis`, {
    method: 'POST',
    body: JSON.stringify({
      deterministic
    })
  })
}

export async function awardBidPackage({
  bidPackageId,
  bidId,
  awardedBy,
  awardedAmountSnapshot,
  note,
  cellPriceMode = {},
  excludedSpecItemIds = []
}) {
  return request(`/api/bid_packages/${bidPackageId}/award`, {
    method: 'POST',
    body: JSON.stringify({
      bid_id: bidId,
      awarded_by: awardedBy,
      awarded_amount_snapshot: awardedAmountSnapshot,
      note,
      cell_price_mode: cellPriceMode,
      excluded_spec_item_ids: excludedSpecItemIds
    })
  })
}

export async function awardBidRows({
  bidPackageId,
  selections
}) {
  return request(`/api/bid_packages/${bidPackageId}/award_rows`, {
    method: 'PATCH',
    body: JSON.stringify({
      selections
    })
  })
}

export async function clearAwardRows({
  bidPackageId,
  specItemIds = []
}) {
  return request(`/api/bid_packages/${bidPackageId}/clear_award_rows`, {
    method: 'PATCH',
    body: JSON.stringify({
      spec_item_ids: specItemIds
    })
  })
}

export async function clearBidderAwards({
  bidPackageId,
  bidId
}) {
  return request(`/api/bid_packages/${bidPackageId}/clear_bidder_awards`, {
    method: 'PATCH',
    body: JSON.stringify({
      bid_id: bidId
    })
  })
}

export async function changeBidPackageAward({
  bidPackageId,
  bidId,
  awardedBy,
  awardedAmountSnapshot,
  note,
  cellPriceMode = {},
  excludedSpecItemIds = []
}) {
  return request(`/api/bid_packages/${bidPackageId}/change_award`, {
    method: 'PATCH',
    body: JSON.stringify({
      bid_id: bidId,
      awarded_by: awardedBy,
      awarded_amount_snapshot: awardedAmountSnapshot,
      note,
      cell_price_mode: cellPriceMode,
      excluded_spec_item_ids: excludedSpecItemIds
    })
  })
}

export async function clearBidPackageAward({
  bidPackageId,
  awardedBy,
  awardedAmountSnapshot,
  note,
  cellPriceMode = {},
  excludedSpecItemIds = []
}) {
  return request(`/api/bid_packages/${bidPackageId}/clear_award`, {
    method: 'PATCH',
    body: JSON.stringify({
      awarded_by: awardedBy,
      awarded_amount_snapshot: awardedAmountSnapshot,
      note,
      cell_price_mode: cellPriceMode,
      excluded_spec_item_ids: excludedSpecItemIds
    })
  })
}

export async function updateBidPackageAwardScope({
  bidPackageId,
  excludedSpecItemIds = []
}) {
  return request(`/api/bid_packages/${bidPackageId}/award_scope`, {
    method: 'PATCH',
    body: JSON.stringify({
      excluded_spec_item_ids: excludedSpecItemIds
    })
  })
}

export function comparisonExportUrl(
  bidPackageId,
  dealerPriceMode = {},
  cellPriceMode = {},
  format = 'csv',
  excludedSpecItemIds = [],
  comparisonMode = 'average',
  columnOptions = {},
  exportType = 'comparison',
  exportOptions = {}
) {
  const params = new URLSearchParams()
  Object.entries(dealerPriceMode || {}).forEach(([inviteId, mode]) => {
    if (mode === 'alt' || mode === 'bod') {
      params.append(`price_mode[${inviteId}]`, mode)
    }
  })
  Object.entries(cellPriceMode || {}).forEach(([compositeKey, mode]) => {
    if (!(mode === 'alt' || mode === 'bod')) return
    const [specItemId, inviteId] = String(compositeKey).split(':')
    if (!specItemId || !inviteId) return
    params.append(`cell_price_mode[${specItemId}][${inviteId}]`, mode)
  })
  ;(excludedSpecItemIds || []).forEach((specItemId) => {
    if (specItemId != null && specItemId !== '') {
      params.append('excluded_spec_item_ids[]', String(specItemId))
    }
  })
  if (comparisonMode) {
    params.append('comparison_mode', comparisonMode)
  }
  if (exportType) {
    params.append('export_type', exportType)
  }
  params.append('show_product', String(columnOptions.showProduct ?? true))
  params.append('show_brand', String(columnOptions.showBrand ?? true))
  params.append('show_unit_price', String(columnOptions.showUnitPrice ?? true))
  params.append('show_lead_time', String(columnOptions.showLeadTime ?? false))
  params.append('show_notes', String(columnOptions.showNotes ?? false))
  ;(exportOptions.visibleDealerInviteIds || []).forEach((inviteId) => {
    if (inviteId != null && inviteId !== '') {
      params.append('visible_dealer_invite_ids[]', String(inviteId))
    }
  })
  ;(exportOptions.columnOrder || []).forEach((columnKey) => {
    if (columnKey) params.append('column_order[]', String(columnKey))
  })
  const query = params.toString()
  return buildApiUrl(`/bid_packages/${bidPackageId}/export.${format}${query ? `?${query}` : ''}`)
}

export async function fetchInvite(token) {
  return request(`/api/invites/${token}`)
}

export async function fetchPublicBidPackage(token) {
  return request(`/api/public/bid_packages/${token}`)
}

export async function unlockInvite(token, password) {
  return request(`/api/invites/${token}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ password })
  })
}

export async function fetchDealerBid(token) {
  return request(`/api/invites/${token}/bid`)
}

export async function saveDealerBid(token, lineItems, pricing = {}) {
  return request(`/api/invites/${token}/bid`, {
    method: 'PUT',
    body: JSON.stringify({ line_items: lineItems, pricing })
  })
}

export async function submitDealerBid(token) {
  return request(`/api/invites/${token}/bid/submit`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export async function createDealerPostAwardUpload(token, { file, fileName, note, specItemId, isSubstitution }) {
  if (file) {
    const formData = new FormData()
    formData.append('file', file)
    if (fileName) formData.append('file_name', fileName)
    if (note) formData.append('note', note)
    if (specItemId != null && specItemId !== '') formData.append('spec_item_id', String(specItemId))
    if (isSubstitution != null) formData.append('is_substitution', isSubstitution ? 'true' : 'false')
    return request(`/api/invites/${token}/post_award_uploads`, {
      method: 'POST',
      body: formData
    })
  }

  return request(`/api/invites/${token}/post_award_uploads`, {
    method: 'POST',
    body: JSON.stringify({
      file_name: fileName,
      note,
      spec_item_id: specItemId,
      is_substitution: Boolean(isSubstitution)
    })
  })
}

export async function deleteDealerPostAwardUpload(token, uploadId) {
  return request(`/api/invites/${token}/post_award_uploads/${uploadId}`, {
    method: 'DELETE'
  })
}

export async function createBidPackagePostAwardUpload(bidPackageId, { file, fileName, note, specItemId, requirementKey, isSubstitution }) {
  const formData = new FormData()
  if (file) formData.append('file', file)
  if (fileName) formData.append('file_name', fileName)
  if (note) formData.append('note', note)
  if (specItemId != null && specItemId !== '') formData.append('spec_item_id', String(specItemId))
  if (requirementKey) formData.append('requirement_key', String(requirementKey))
  if (isSubstitution != null) formData.append('is_substitution', isSubstitution ? 'true' : 'false')

  return request(`/api/bid_packages/${bidPackageId}/post_award_uploads`, {
    method: 'POST',
    body: formData
  })
}

export async function deleteBidPackagePostAwardUpload(bidPackageId, uploadId) {
  return request(`/api/bid_packages/${bidPackageId}/post_award_uploads/${uploadId}`, {
    method: 'DELETE'
  })
}

export async function updateBidPackagePostAwardUpload(bidPackageId, uploadId, { requirementKey }) {
  return request(`/api/bid_packages/${bidPackageId}/post_award_uploads/${uploadId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      requirement_key: requirementKey || ''
    })
  })
}

export function bidPackagePostAwardUploadsBundleUrl(bidPackageId, { uploadIds = [], includeTag = false, includeCode = false } = {}) {
  const params = new URLSearchParams()
  if (Array.isArray(uploadIds) && uploadIds.length > 0) {
    params.set('upload_ids', uploadIds.join(','))
  }
  if (includeTag) params.set('include_tag', '1')
  if (includeCode) params.set('include_code', '1')
  const query = params.toString()
  return buildApiUrl(`/bid_packages/${bidPackageId}/post_award_uploads/download_all${query ? `?${query}` : ''}`)
}
