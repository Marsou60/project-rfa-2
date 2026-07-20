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
  // GitHub Releases renomme souvent les espaces en « . » dans l’URL d’asset téléchargé
  const assetNameForUrl = installer.replace(/ /g, '.')
  const url = `${urlBase}/${encodeURIComponent(assetNameForUrl)}`
  return { url, signature: sigContent }
}

// IMPORTANT : préférer l'installeur NSIS (.exe) — l'app est distribuée en NSIS,
// donc l'updater doit servir le .exe pour une mise à jour EN PLACE (sinon install
// parallèle / doublon quand on sert un .msi par-dessus une base NSIS).
const win = findSig(nsisDir, '.exe', version) || findSig(msiDir, '.msi', version)
if (!win) {
  console.error('Aucun .exe NSIS ou .msi + .sig trouvé dans', nsisDir, 'ou', msiDir)
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
// Écriture UTF-8 SANS BOM (un BOM en tête casse le parsing JSON de l'updater Tauri).
fs.writeFileSync(outPath, JSON.stringify(latest, null, 2), { encoding: 'utf8' })
console.log('Écrit (sans BOM):', outPath)
console.log('Téléverse ce fichier + l\'installeur NSIS (.exe) et son .sig sur la release GitHub.')
