import {readFileSync, readdirSync, statSync} from 'node:fs'
import {extname, join, relative, resolve} from 'node:path'

const root = resolve(import.meta.dirname, '..')
const banned = [
  'https://events.bsky.app',
  'sdk-7gkUkGy9wguUjyFe',
  'blueskyweb.zendesk.com',
  'https://ip.bsky.app',
  'https://live-events.workers.bsky.app',
  'https://app-config.workers.bsky.app',
  'https://updates.bsky.app',
  'support@bsky.app',
  'security@bsky.app',
  'https://bsky.social/about/join',
  "owner: 'blueskysocial'",
  "organization: 'blueskyweb'",
  '<title>Bluesky</title>',
  '<!-- Bluesky SVG -->',
]
const artifactBanned = ['https://go.bsky.app/redirect?u=']
const bannedPatterns = [/["']https:\/\/bsky\.social\/about\/blog["']/]
const templateBrandingBanned = [
  'Bluesky Social',
  ' on Bluesky',
  'content="Bluesky"',
  '>Bluesky<',
  '- Bluesky',
  '| Bluesky',
]

function collect(path) {
  const absolute = resolve(root, path)
  if (statSync(absolute).isFile()) return [absolute]
  const files = []
  for (const entry of readdirSync(absolute)) {
    if (entry === 'locale' || entry === 'node_modules') continue
    const child = join(absolute, entry)
    if (statSync(child).isDirectory()) {
      files.push(...collect(relative(root, child)))
    } else if (
      [
        '.go',
        '.html',
        '.js',
        '.json',
        '.md',
        '.mjs',
        '.ts',
        '.tsx',
        '.txt',
      ].includes(extname(child))
    ) {
      files.push(child)
    }
  }
  return files
}

const inputs = [
  'src',
  'README.md',
  'SECURITY.md',
  'app.config.js',
  'webpack.config.js',
  'scripts/bundleUpdate.sh',
  'web/index.html',
  'bskyweb/templates',
  'bskyweb/cmd',
  'bskyweb/static/.well-known',
  'bskyweb/embedr-static/.well-known',
  ...process.argv.slice(2),
]
const findings = []
for (const file of inputs.flatMap(collect)) {
  if (/\.test\.[jt]sx?$/.test(file)) continue
  const content = readFileSync(file, 'utf8')
  for (const value of banned) {
    if (content.includes(value)) {
      findings.push(`${relative(root, file)} contains ${JSON.stringify(value)}`)
    }
  }
  for (const pattern of bannedPatterns) {
    if (pattern.test(content)) {
      findings.push(`${relative(root, file)} matches ${pattern}`)
    }
  }
  if (file.startsWith(join(root, 'web-build'))) {
    for (const value of artifactBanned) {
      if (content.includes(value)) {
        findings.push(
          `${relative(root, file)} contains ${JSON.stringify(value)}`,
        )
      }
    }
    if (
      file === join(root, 'web-build', 'manifest.json') &&
      content.includes('xyz.blueskyweb.app')
    ) {
      findings.push(
        `${relative(root, file)} contains ${JSON.stringify('xyz.blueskyweb.app')}`,
      )
    }
  }
  if (file.startsWith(join(root, 'bskyweb', 'templates'))) {
    for (const value of templateBrandingBanned) {
      if (content.includes(value)) {
        findings.push(
          `${relative(root, file)} contains ${JSON.stringify(value)}`,
        )
      }
    }
  }
}

if (findings.length) {
  console.error(findings.join('\n'))
  process.exit(1)
}
console.log('Fork hygiene check passed')
