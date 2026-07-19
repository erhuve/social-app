import assert from 'node:assert/strict'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)
const configure = require('../app.config.js')

const previousPlatform = process.env.EAS_BUILD_PLATFORM

try {
  delete process.env.EAS_BUILD_PLATFORM
  const web = configure({}).expo
  assert.equal(web.name, 'Meadow')
  assert.equal(web.slug, 'meadow')
  assert.equal(web.owner, undefined)
  assert.equal(web.ios?.bundleIdentifier, undefined)
  assert.equal(web.android?.package, undefined)
  assert.equal(web.extra?.eas?.projectId, undefined)
  assert.equal(web.updates?.enabled, false)

  for (const platform of ['ios', 'android']) {
    process.env.EAS_BUILD_PLATFORM = platform
    assert.throws(() => configure({}), /Native Meadow releases are disabled/)
  }
} finally {
  if (previousPlatform === undefined) {
    delete process.env.EAS_BUILD_PLATFORM
  } else {
    process.env.EAS_BUILD_PLATFORM = previousPlatform
  }
}

console.log('Meadow release config check passed')
