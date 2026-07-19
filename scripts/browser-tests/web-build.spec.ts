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
  await expect(page).toHaveTitle(/(?:^Meadow$| — Meadow$)/)
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
  const publicBatches: Array<{
    body: {postUris: string[]; actorDids: string[]; viewerDid?: string}
    authorization?: string
  }> = []
  await page.route(
    'https://multiplicity-service-hatsunemiku.zocomputer.io/v1/multiplicity/public-batch',
    async route => {
      const body = route.request().postDataJSON() as {
        postUris: string[]
        actorDids: string[]
        viewerDid?: string
      }
      publicBatches.push({
        body,
        authorization: route.request().headers().authorization,
      })
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          posts: Object.fromEntries(
            body.postUris.map(uri => [
              uri,
              {
                like: {count: 0, extraCount: 0, viewerRecordUris: []},
                repost: {count: 0, extraCount: 0, viewerRecordUris: []},
              },
            ]),
          ),
          actors: Object.fromEntries(
            body.actorDids.map(did => [
              did,
              {follow: {count: 0, extraCount: 0, viewerRecordUris: []}},
            ]),
          ),
          capabilities: {
            generation: 1,
            writesEnabled: true,
            feedEnabled: true,
          },
        }),
      })
    },
  )
  await expectAppToHydrate(page, '/profile/agnoster.net/post/3mqubzdvkdc2a')
  await expect(page).toHaveTitle(/ — Meadow$/)
  expect(new URL(page.url()).pathname).toBe(
    '/profile/agnoster.net/post/3mqubzdvkdc2a',
  )
  await expect
    .poll(() =>
      publicBatches.some(batch =>
        batch.body.postUris.includes(
          'at://did:plc:r2bjwiwlhmo26hh2sz27fqf3/app.bsky.feed.post/3mqubzdvkdc2a',
        ),
      ),
    )
    .toBe(true)
  expect(publicBatches.every(batch => batch.body.viewerDid === undefined)).toBe(
    true,
  )
  expect(publicBatches.every(batch => batch.authorization === undefined)).toBe(
    true,
  )
})

test('missing static bundles remain 404 responses', async ({request}) => {
  const response = await request.get('/static/js/missing.js', {
    headers: {Accept: 'text/html'},
  })
  expect(response.status()).toBe(404)
})

test('main bundle includes Meadow policy copy', async ({request}) => {
  const manifestResponse = await request.get('/asset-manifest.json')
  expect(manifestResponse.status()).toBe(200)
  const manifest = (await manifestResponse.json()) as {
    files: Record<string, string>
  }
  const mainBundle = manifest.files['main.js']

  expect(mainBundle).toMatch(/^\/static\/js\/main\.[a-f0-9]+\.js$/)
  const bundleResponse = await request.get(mainBundle)
  expect(bundleResponse.status()).toBe(200)
  const bundle = await bundleResponse.text()

  expect(bundle).toContain('Meadow public beta')
  expect(bundle).toContain('Meadow is an independent AT Protocol client')
  expect(bundle).toContain(
    'label:"Meadow Public Beta Terms",children:"Public Beta Terms"',
  )
  expect(bundle).toContain(
    'label:"Meadow Privacy Notice",children:"Privacy Notice"',
  )
})
