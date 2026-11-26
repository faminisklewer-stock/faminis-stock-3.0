import { expect, test } from '@playwright/test'

const hasSession = Boolean(process.env.E2E_STORAGE_STATE)
const isOperationalSession = process.env.E2E_ROLE === 'operational'

test.describe('operational PWA flows', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasSession || !isOperationalSession, 'Set E2E_STORAGE_STATE and E2E_ROLE=operational for staging tests.')
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Navigasi utama mobile' })).toBeVisible()
  })

  test('switches between the mobile navigation modules', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: 'Navigasi utama mobile' })
    await mobileNav.getByRole('button', { name: 'Kasir' }).click()
    await expect(page.getByRole('heading', { name: 'New sale' })).toBeVisible()
    await mobileNav.getByRole('button', { name: 'Transfer' }).click()
    await expect(page.getByRole('heading', { name: 'Transfer' })).toBeVisible()
    await mobileNav.getByRole('button', { name: 'Laporan' }).click()
    await expect(page.getByRole('heading', { name: 'Laporan operasional' })).toBeVisible()
  })

  test('switches report modes and shows the correct panel', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: 'Navigasi utama mobile' })
    await mobileNav.getByRole('button', { name: 'Laporan' }).click()
    await page.getByRole('button', { name: 'Transfer Masuk' }).click()
    await expect(page.getByRole('heading', { name: 'Transfer masuk' })).toBeVisible()
    await page.getByRole('button', { name: 'Transfer Keluar' }).click()
    await expect(page.getByRole('heading', { name: 'Transfer keluar' })).toBeVisible()
    await page.getByRole('button', { name: 'Stok' }).click()
    await expect(page.getByRole('heading', { name: 'Laporan stok' })).toBeVisible()
    const stockLocationFilter = page.getByRole('combobox', { name: 'Lokasi stok' })
    await expect(stockLocationFilter).toBeEnabled()
    await stockLocationFilter.selectOption('all')
    const stockRows = page.locator('.reports-page .table-panel tbody tr')
    await expect(stockRows.first()).toBeVisible()
    const visibleLocations = new Set((await stockRows.locator('td:nth-child(2)').allTextContents()).map((name) => name.trim()))
    expect(visibleLocations.size).toBeGreaterThan(1)
  })

  test('loads and downloads a previous month report', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: 'Navigasi utama mobile' })
    await mobileNav.getByRole('button', { name: 'Laporan' }).click()
    await page.getByLabel('Periode penjualan').selectOption('monthly')

    const previousMonth = new Date()
    previousMonth.setDate(1)
    previousMonth.setMonth(previousMonth.getMonth() - 1)
    const monthValue = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`
    await page.getByLabel('Bulan laporan').fill(monthValue)
    await expect(page.getByRole('button', { name: 'CSV' })).toBeEnabled()

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ])
    expect(csvDownload.suggestedFilename()).toMatch(/laporan-operasional-Bulanan-.*\.csv/)

    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PDF' }).click(),
    ])
    expect(pdfDownload.suggestedFilename()).toMatch(/laporan-operasional-Bulanan-.*\.pdf/)
  })

  test('opens the floating cart without navigating the page', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: 'Navigasi utama mobile' })
    await mobileNav.getByRole('button', { name: 'Kasir' }).click()
    const cartButton = page.getByRole('button', { name: /Buka cart/ })
    await expect(cartButton).toBeVisible()
    await cartButton.click()
    await expect(page.locator('.cart-panel-popup')).toBeVisible()
    await expect(page.locator('.floating-cart-backdrop')).toBeVisible()
    await cartButton.click()
    await expect(page.locator('.cart-panel-popup')).not.toBeVisible()
  })

  test('does not expose transaction editing to operational users', async ({ page }) => {
    const mobileNav = page.getByRole('navigation', { name: 'Navigasi utama mobile' })
    await mobileNav.getByRole('button', { name: 'Laporan' }).click()
    await expect(page.locator('.sale-history-panel').getByRole('button', { name: 'Edit transaksi' })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Edit transaksi' })).toHaveCount(0)
  })
})

test.describe('master desktop shell', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasSession || process.env.E2E_ROLE !== 'master' || test.info().project.name !== 'desktop', 'Set E2E_STORAGE_STATE and E2E_ROLE=master for desktop staging tests.')
    await page.goto('/')
    await expect(page.locator('.sidebar')).toBeVisible()
  })

  test('opens the main master modules', async ({ page }) => {
    await page.locator('.sidebar').getByRole('button', { name: 'Produk' }).click()
    await expect(page.getByRole('heading', { name: 'Produk' })).toBeVisible()
    await page.locator('.sidebar').getByRole('button', { name: 'Laporan' }).click()
    await expect(page.getByRole('heading', { name: 'Sales report' })).toBeVisible()
  })

  test('shows all sale types in the master cart', async ({ page }) => {
    await page.locator('.sidebar').getByRole('button', { name: 'Kasir' }).click()
    await expect(page.getByRole('heading', { name: 'New sale' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ecer', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Grosir', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'TikTok', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Shopee', exact: true })).toBeVisible()
  })
})
