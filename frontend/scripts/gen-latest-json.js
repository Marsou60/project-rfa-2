/**
 * Génère latest.json pour la mise à jour Tauri (GitHub Releases).
 * Usage: node scripts/gen-latest-json.js <version> <url_base>
 * Exemple: node scripts/gen-latest-json.js 0.1.0 https://github.com/Marsou60/project-rfa-2/releases/download/v0.1.0
 *
 * Place ce script dans le même dossier que les .msi et .msi.sig (ex. après build, depuis src-tauri/target/release/bundle/msi/).
 * Ou depuis frontend/: node scripts/gen-latest-json.js 0.1.0 <url_base>
 * et lire les .sig depuis src-tauri/target/release/bundle/msi/
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const version = process.argv[2] || '0.1.0'
const urlBase = process.argv[3] || 'https://github.com/Marsou60/project-rfa-2/releases/download/v' + version

const bundleDir = path.join(__dirname, '../src-tauri/target/release/bundle')
const msiDir = path.join(bundleDir, 'msi')
const nsisDir = path.join(bundleDir, 'nsis')

function findSig(dir, ext, version) {
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  const installers = files.filter((f) => f.endsWith(ext) && !f.endsWith('.sig'))
  const needle = `_${version}_`
  const installer =
    installers.find((f) => f.includes(needle)) ||
    installers.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0]
  if (!installer) return null
  const sigFile = `${installer}.sig`
  if (!fs.existsSync(path.join(dir, sigFile))) return null
  const sigContent = fs.readFileSync(path.join(dir, sigFile), 'utf8')
  const url = `${urlBase}/${encodeURIComponent(installer)}`
  return { url, signature: sigContent }
}

const win = findSig(msiDir, '.msi', version) || findSig(nsisDir, '.exe', version)
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
    'windows-x86_64': { signature: win.signature.trim(), url: win.url },
  },
}

const outPath = path.join(bundleDir, 'latest.json')
fs.writeFileSync(outPath, JSON.stringify(latest, null, 2), 'utf8')
console.log('Écrit:', outPath)
console.log('Téléverse ce fichier + le .msi (ou .exe) et son .sig sur la release GitHub.')
