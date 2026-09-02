import { test, expect } from '@playwright/test'

// A unique email per run, since this hits trail_dev rather than a
// wiped test database.
const stamp = Date.now()
const EMAIL = `smoke-${stamp}@example.com`

test('full ticket lifecycle: sign up, project, create, move, edit, delete', async ({ page }) => {
  // Land where a real visitor lands, and click through. Navigating straight
  // to /signup by URL is what hid the missing link in the first place.
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page.getByRole('heading', { name: 'Create your Trail account' }))
    .toBeVisible()

  await page.getByLabel('Name').fill('Smoke Test')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Collaborations', exact: true })).toBeVisible()

  await page.getByLabel('Name').fill('Smoke Project')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await page.getByLabel('Title').fill('Prove the skeleton walks')
  await page.getByRole('button', { name: 'Add ticket' }).click()

  const key = await page.getByRole('heading', { name: / - Smoke Project$/ })
    .textContent()
    .then(text => text!.split(' - ')[0]!)

  const backlog = page.getByRole('region', { name: 'Backlog' })
  await expect(backlog.getByText(`${key}-1`, { exact: true })).toBeVisible()

  await page.getByLabel(`Status for ${key}-1`).selectOption('done')

  const done = page.getByRole('region', { name: 'Done', exact: true })
  await expect(done.getByText(`${key}-1`, { exact: true })).toBeVisible()

  // The requirement is persistence, not optimistic UI: reload and re-check.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Done', exact: true })
    .getByText(`${key}-1`, { exact: true })).toBeVisible()

  // INC 2: open the ticket, edit it in detail, and confirm it persists.
  await page.getByRole('link', { name: `${key}-1` }).click()
  await expect(page.getByRole('heading', { name: `${key}-1` })).toBeVisible()

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

  await page.getByRole('link', { name: `${key} - Smoke Project` }).click()
  await expect(page.getByText(`${key}-1`, { exact: true })).toHaveCount(0)
})
