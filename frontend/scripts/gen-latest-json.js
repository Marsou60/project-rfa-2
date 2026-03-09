/**
 * Génère latest.json pour la mise à jour Tauri (GitHub Releases).
 * Usage: node scripts/gen-latest-json.js <version> <url_base>
 * Exemple: node scripts/gen-latest-json.js 0.1.0 https://github.com/Marsou60/project-rfa-2/releases/download/v0.1.0
 *
 * Place ce script dans le même dossier que les .msi et .msi.sig (ex. après build, depuis src-tauri/target/release/bundle/msi/).
 * Ou depuis frontend/: node scripts/gen-latest-json.js 0.1.0 <url_base>
 * et lire les .sig depuis src-tauri/target/release/bundle/msi/
 */
const fs = require('fs')
const path = require('path')

const version = process.argv[2] || '0.1.0'
const urlBase = process.argv[3] || 'https://github.com/Marsou60/project-rfa-2/releases/download/v' + version

const bundleDir = path.join(__dirname, '../src-tauri/target/release/bundle')
const msiDir = path.join(bundleDir, 'msi')
const nsisDir = path.join(bundleDir, 'nsis')

function findSig(dir, ext) {
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  const installer = files.find(f => f.endsWith(ext) && !f.endsWith('.sig'))
  const sigFile = installer ? installer + '.sig' : files.find(f => f.endsWith('.sig'))
  if (!sigFile || !fs.existsSync(path.join(dir, sigFile))) return null
  const sigContent = fs.readFileSync(path.join(dir, sigFile), 'utf8')
  const installerName = sigFile.replace('.sig', '')
  return { url: `${urlBase}/${installerName}`, signature: sigContent }
}

const win = findSig(msiDir, '.msi') || findSig(nsisDir, '.exe')
if (!win) {
  console.error('Aucun .msi ou .exe + .sig trouvé dans', msiDir, 'ou', nsisDir)
  console.error('Lance un build signé (TAURI_SIGNING_PRIVATE_KEY) puis relance ce script.')
  process.exit(1)
}

const latest = {
  version,
  notes: '',
  pub_date: new Date().toISOString().slice(0, 19) + 'Z',
  platforms: {
    'windows-x86_64': { signature: win.signature, url: win.url },
  },
}

const outPath = path.join(bundleDir, 'latest.json')
fs.writeFileSync(outPath, JSON.stringify(latest, null, 2), 'utf8')
console.log('Écrit:', outPath)
console.log('Téléverse ce fichier + le .msi (ou .exe) et son .sig sur la release GitHub.')
