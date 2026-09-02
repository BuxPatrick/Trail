import { test, expect } from '@playwright/test'

// A unique email and key per run, since this hits mira_dev rather than a
// wiped test database.
const stamp = Date.now()
const EMAIL = `smoke-${stamp}@example.com`
const KEY = `SM${String(stamp).slice(-4)}`

test('full ticket lifecycle: sign up, project, create, move, edit, delete', async ({ page }) => {
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

  // INC 2: open the ticket, edit it in detail, and confirm it persists.
  await page.getByRole('link', { name: `${KEY}-1` }).click()
  await expect(page.getByRole('heading', { name: `${KEY}-1` })).toBeVisible()

  await page.getByLabel('Priority').selectOption('urgent')
  await page.getByLabel('Title').fill('Prove the skeleton still walks')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved.')

  await page.reload()
  await expect(page.getByLabel('Priority')).toHaveValue('urgent')
  await expect(page.getByLabel('Title'))
    .toHaveValue('Prove the skeleton still walks')

  // INC 2: delete it, and confirm the board no longer shows it.
  page.once('dialog', d => void d.accept())
  await page.getByRole('button', { name: 'Delete ticket' }).click()

  await page.getByRole('link', { name: `${KEY} - Smoke Project` }).click()
  await expect(page.getByText(`${KEY}-1`, { exact: true })).toHaveCount(0)
})
