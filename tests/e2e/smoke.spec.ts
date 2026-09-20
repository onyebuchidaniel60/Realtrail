import { expect, test } from '@playwright/test'

test('shows the Realtrail heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Realtrail' })).toBeVisible()
})
