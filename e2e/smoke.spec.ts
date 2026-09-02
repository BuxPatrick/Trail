import { test, expect } from '@playwright/test'

// A unique email and key per run, since this hits mira_dev rather than a
// wiped test database.
const stamp = Date.now()
const EMAIL = `smoke-${stamp}@example.com`
const KEY = `SM${String(stamp).slice(-4)}`

test('sign up, create a project, create a ticket, move it to Done', async ({ page }) => {
  await page.goto('/signup')

  await page.getByLabel('Name').fill('Smoke Test')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Mira', exact: true })).toBeVisible()

  await page.getByLabel('Name').fill('Smoke Project')
  await page.getByLabel('Key').fill(KEY)
  await page.getByRole('button', { name: 'Create project' }).click()

  await page.getByRole('link', { name: `${KEY} - Smoke Project` }).click()

  await page.getByLabel('Title').fill('Prove the skeleton walks')
  await page.getByRole('button', { name: 'Add ticket' }).click()

  const backlog = page.getByRole('region', { name: 'Backlog' })
  await expect(backlog.getByText(`${KEY}-1`, { exact: true })).toBeVisible()

  await page.getByLabel(`Status for ${KEY}-1`).selectOption('done')

  const done = page.getByRole('region', { name: 'Done', exact: true })
  await expect(done.getByText(`${KEY}-1`, { exact: true })).toBeVisible()

  // The requirement is persistence, not optimistic UI: reload and re-check.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Done', exact: true })
    .getByText(`${KEY}-1`, { exact: true })).toBeVisible()
})
