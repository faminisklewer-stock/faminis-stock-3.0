export type PosProduct = { id: string; sku: string; name: string; unit: string; stock: number; category_id?: string | null; category_name?: string | null }
export type CartItem = PosProduct & { quantity: number; unitPrice: number }
export type LocationOption = { id: string; name: string; kind: string }
export type CategoryRecord = { id: string; name: string; active: boolean }
export type ProductRecord = { id: string; sku: string; name: string; unit: string; variant: string | null; active: boolean; category_id: string | null; category_name?: string | null }
export type StockRecord = { product_id: string; location_id: string; quantity: number }
export type StockRow = StockRecord & { product?: ProductRecord }
export type TransferRecord = { id: string; source_location_id: string; destination_location_id: string; status: string; notes: string | null; created_at: string; requested_by: string | null }
export type TransferItemRecord = { id: string; transfer_id: string; product_id: string; shipped_quantity: number; received_quantity: number | null; discrepancy_reason: string | null }

const PRODUCT_CATEGORY_PREFIXES: Record<string, string> = {
  Mukena: 'MKN',
  Sarung: 'SRG',
  Sajadah: 'SJD',
  Daster: 'DST',
  'Busana Wanita': 'BSW',
  'Busana Pria': 'BSP',
}

const APPROVED_CATEGORY_NAMES = Object.keys(PRODUCT_CATEGORY_PREFIXES) as Array<keyof typeof PRODUCT_CATEGORY_PREFIXES>

export function normalizeCategoryName(name: string | null | undefined): string {
  const value = (name ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const aliasMap: Record<string, string> = {
    mukena: 'Mukena',
    sarung: 'Sarung',
    sajadah: 'Sajadah',
    daster: 'Daster',
    'busana wanita': 'Busana Wanita',
    'busanawanita': 'Busana Wanita',
    'busana pria': 'Busana Pria',
    'busanapria': 'Busana Pria',
  }
  return aliasMap[value] ?? APPROVED_CATEGORY_NAMES.find((approved) => normalizeCategoryName(approved).toLowerCase() === value) ?? ''
}

export function getCategoryPrefix(categoryName: string | null | undefined) {
  const canonical = normalizeCategoryName(categoryName)
  if (!canonical) return ''
  return PRODUCT_CATEGORY_PREFIXES[canonical] ?? ''
}

export function isApprovedSku(sku: string | null | undefined) {
  const normalizedSku = (sku ?? '').trim().toUpperCase()
  if (!normalizedSku) return false
  const prefix = normalizedSku.split('-')[0]
  return Object.values(PRODUCT_CATEGORY_PREFIXES).includes(prefix)
}

export function filterApprovedProducts<T extends { sku?: string | null }>(products: T[]) {
  return products.filter((product) => isApprovedSku(product.sku ?? null))
}

export function getProductCategoryId(product: { category_id?: string | null; sku?: string | null; name?: string | null }, categories: CategoryRecord[]) {
  const canonicalCategoryId = product.category_id && categories.some((category) => category.id === product.category_id)
    ? product.category_id
    : ''

  if (canonicalCategoryId) return canonicalCategoryId

  const skuPrefix = (product.sku ?? '').trim().toUpperCase().split('-')[0]
  if (skuPrefix) {
    const resolvedCategoryName = APPROVED_CATEGORY_NAMES.find((categoryName) => PRODUCT_CATEGORY_PREFIXES[categoryName] === skuPrefix)
    if (resolvedCategoryName) {
      return categories.find((category) => normalizeCategoryName(category.name) === resolvedCategoryName)?.id ?? ''
    }
  }

  const normalizedProductName = normalizeCategoryName(product.name)
  if (normalizedProductName) {
    return categories.find((category) => normalizeCategoryName(category.name) === normalizedProductName)?.id ?? ''
  }

  return ''
}

export function getApprovedCategoryList(categories: CategoryRecord[]) {
  const normalized = categories
    .map((category) => {
      const canonicalName = normalizeCategoryName(category.name)
      return canonicalName ? { ...category, name: canonicalName } : null
    })
    .filter((category): category is CategoryRecord => Boolean(category))

  return Array.from(new Map(normalized.map((category) => [category.id, category])).values())
}

export function isValidCategorySku(sku: string, categoryName: string | null | undefined) {
  const normalizedSku = sku.trim().toUpperCase()
  const prefix = getCategoryPrefix(categoryName)
  if (!normalizedSku || !prefix) return true
  return new RegExp(`^${prefix}-[A-Z0-9]+$`).test(normalizedSku)
}
