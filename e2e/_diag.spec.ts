import { test } from '@playwright/test'
const stamp = Date.now()
test('diagnose prod board', async ({ page }) => {
  const notes: string[] = []
  page.on('pageerror', e => notes.push(`PAGEERROR ${e.message}`))
  page.on('response', async r => {
    const u = r.url()
    if (u.includes('/api/')) {
      let b = ''; try { b = (await r.text()).slice(0, 180) } catch {}
      notes.push(`HTTP ${r.status()} ${u.replace(/https:\/\/[^/]+/, '')}\n   ${b}`)
    }
  })
  await page.goto('/')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Name').fill('Board Diag')
  await page.getByLabel('Email').fill(`board-${stamp}@example.com`)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { name: 'Mira', exact: true }).waitFor()

  const KEY = `BD${String(stamp).slice(-4)}`
  await page.getByLabel('Name').fill('Board Project')
  await page.getByLabel('Key').fill(KEY)
  await page.getByRole('button', { name: 'Create project' }).click()
  await page.getByRole('link', { name: `${KEY} - Board Project` }).click()
  await page.waitForTimeout(5000)

  notes.push(`URL: ${page.url()}`)
  notes.push(`ALERT: ${await page.getByRole('alert').textContent().catch(() => '(none)')}`)
  notes.push(`BODY TEXT: ${(await page.locator('body').innerText()).slice(0, 300)}`)
  console.log('\n===DIAG===\n' + notes.join('\n'))
})
