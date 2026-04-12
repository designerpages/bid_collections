/**
 * Build Designer Pages profile CSV for BidPackagePreviewService from DP specs/batch items.
 * @param {object[]} items
 * @returns {string}
 */
export function designerPagesCsvFromDpSpecItems(items) {
  if (!Array.isArray(items) || items.length === 0) return ''

  const headers = [
    'Product ID',
    'Product Name',
    'Brand',
    'DP Categories',
    'Code',
    'Description',
    'Quantity',
    'Unit of Measure'
  ]

  const esc = (v) => {
    const s = v == null ? '' : String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const pick = (obj, ...keys) => {
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i]
      if (obj[k] != null && obj[k] !== '') return obj[k]
    }
    return ''
  }

  const lines = [headers.join(',')]
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const specId =
      pick(item, 'spec_item_id', 'specItemId', 'spec_itemId') ||
      pick(item, 'project_product_id', 'projectProductId', 'id')
    const row = [
      specId,
      pick(item, 'product_name', 'productName'),
      pick(item, 'manufacturer', 'brand'),
      pick(item, 'category', 'dp_categories', 'dpCategories'),
      pick(item, 'sku', 'code'),
      pick(item, 'description'),
      pick(item, 'quantity', 'qty'),
      pick(item, 'uom', 'unit_of_measure', 'unitOfMeasure')
    ].map(esc)
    lines.push(row.join(','))
  }
  return lines.join('\n')
}
