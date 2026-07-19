/* eslint-disable import/no-nodejs-modules, typescript/no-unsafe-call, typescript/no-unsafe-member-access */
const path = require('path')
const fs = require('fs')

const projectRoot = path.join(__dirname, '..')
const templateFile = path.join(
  projectRoot,
  'bskyweb',
  'templates',
  'scripts.html',
)

const {entrypoints} = require(
  path.join(projectRoot, 'web-build/asset-manifest.json'),
)

const webManifestFile = path.join(projectRoot, 'web-build', 'manifest.json')
const webManifest = JSON.parse(fs.readFileSync(webManifestFile, 'utf8'))
delete webManifest.related_applications
delete webManifest.prefer_related_applications
fs.writeFileSync(webManifestFile, `${JSON.stringify(webManifest, null, 2)}\n`)

const securitySource = path.join(
  projectRoot,
  'bskyweb',
  'static',
  '.well-known',
  'security.txt',
)
const securityTarget = path.join(
  projectRoot,
  'web-build',
  '.well-known',
  'security.txt',
)
fs.mkdirSync(path.dirname(securityTarget), {recursive: true})
fs.copyFileSync(securitySource, securityTarget)

console.log(`Found ${entrypoints.length} entrypoints`)
console.log(`Writing ${templateFile}`)
console.log(`Copied ${securitySource} to ${securityTarget}`)

const outputFile = entrypoints
  .map(name => {
    const file = path.basename(name)
    const ext = path.extname(file)

    if (ext === '.js') {
      return `<script defer="defer" src="{{ staticCDNHost }}/static/js/${file}"></script>`
    }
    if (ext === '.css') {
      return `<link rel="stylesheet" href="{{ staticCDNHost }}/static/css/${file}">`
    }

    return ''
  })
  .join('\n')
fs.writeFileSync(templateFile, outputFile)

function copyFiles(sourceDir, targetDir) {
  const files = fs.readdirSync(path.join(projectRoot, sourceDir))
  files.forEach(file => {
    const sourcePath = path.join(projectRoot, sourceDir, file)
    const targetPath = path.join(projectRoot, targetDir, file)
    fs.copyFileSync(sourcePath, targetPath)
    console.log(`Copied ${sourcePath} to ${targetPath}`)
  })
}

copyFiles('web-build/static/js', 'bskyweb/static/js')
copyFiles('web-build/static/css', 'bskyweb/static/css')
copyFiles('web-build/static/media', 'bskyweb/static/media')
