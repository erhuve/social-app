import {expect, type Page, test} from '@playwright/test'

function trackLocalAssetFailures(page: Page) {
  const failures: string[] = []

  page.on('response', response => {
    const request = response.request()
    if (
      ['script', 'stylesheet'].includes(request.resourceType()) &&
      new URL(response.url()).origin === 'http://127.0.0.1:4173' &&
      response.status() >= 400
    ) {
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
    }
  })
  page.on('requestfailed', request => {
    if (
      ['script', 'stylesheet'].includes(request.resourceType()) &&
      new URL(request.url()).origin === 'http://127.0.0.1:4173'
    ) {
      failures.push(
        `${request.failure()?.errorText ?? 'request failed'} ${new URL(request.url()).pathname}`,
      )
    }
  })

  return failures
}

async function expectAppToHydrate(page: Page, path: string) {
  const assetFailures = trackLocalAssetFailures(page)
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  const response = await page.goto(path, {waitUntil: 'domcontentloaded'})
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Meadow')
  await expect
    .poll(() => page.locator('#root').evaluate(root => root.childElementCount))
    .toBeGreaterThan(0)
  expect(assetFailures).toEqual([])
  expect(pageErrors).toEqual([])
}

test('production home route hydrates', async ({page}) => {
  await expectAppToHydrate(page, '/')
  await expect(page.getByRole('tab', {name: 'Discover'})).toBeVisible()
})

test('direct post deep link hydrates with root-relative bundles', async ({
  page,
}) => {
  await expectAppToHydrate(page, '/profile/agnoster.net/post/3mqubzdvkdc2a')
  expect(new URL(page.url()).pathname).toBe(
    '/profile/agnoster.net/post/3mqubzdvkdc2a',
  )
})

test('missing static bundles remain 404 responses', async ({request}) => {
  const response = await request.get('/static/js/missing.js', {
    headers: {Accept: 'text/html'},
  })
  expect(response.status()).toBe(404)
})
