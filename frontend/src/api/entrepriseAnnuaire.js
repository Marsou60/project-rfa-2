/** Annuaire des entreprises, appelé depuis le navigateur.
 * Railway est souvent refusé par cet hôte (connexion refusée). */

const SEARCH_URL = 'https://recherche-entreprises.api.gouv.fr/search'

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function tvaFromSiren(siren) {
  if (!/^\d{9}$/.test(siren)) return null
  const key = (12 + 3 * (Number(siren) % 97)) % 97
  return `FR${String(key).padStart(2, '0')}${siren}`
}

function titleCase(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return text.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

function street(etab) {
  const parts = [etab.numero_voie, etab.indice_repetition, etab.type_voie, etab.libelle_voie]
  const joined = parts.map(p => String(p || '').trim()).filter(Boolean).join(' ')
  if (joined) return joined
  let cleaned = String(etab.adresse || '').trim()
  const cp = String(etab.code_postal || '').trim()
  const ville = String(etab.libelle_commune || '').trim()
  if (cp) cleaned = cleaned.replace(new RegExp(`\\s*${cp}\\s*`), ' ')
  if (ville) cleaned = cleaned.replace(new RegExp(`\\s*${ville}\\s*$`, 'i'), '')
  return cleaned.replace(/\s+/g, ' ').trim()
}

function enseigne(etab) {
  const list = etab.liste_enseignes
  if (Array.isArray(list) && list[0]) return String(list[0]).trim() || null
  return etab.nom_commercial ? String(etab.nom_commercial).trim() || null : null
}

function contact(dirigeants) {
  if (!Array.isArray(dirigeants)) return null
  for (const person of dirigeants) {
    if (!person || typeof person !== 'object') continue
    if (person.type_dirigeant && person.type_dirigeant !== 'personne physique') continue
    const name = [person.prenoms, person.nom].map(p => String(p || '').trim()).filter(Boolean).join(' ')
    if (name) return name
  }
  return null
}

function tvaFromResult(item, siren) {
  const raw = item.tva
  const first = Array.isArray(raw) ? raw[0] : raw
  if (typeof first === 'string' && first.replace(/\s/g, '').toUpperCase().startsWith('FR')) {
    return first.replace(/\s/g, '').toUpperCase()
  }
  return tvaFromSiren(siren)
}

function mapEtablissement(item, etab) {
  const place = etab || item.siege || {}
  const siren = String(item.siren || '').slice(0, 9)
  const shop = enseigne(place)
  const raison = String(item.nom_raison_sociale || item.nom_complet || '').trim()
  const nom = shop || raison
  const ville = String(place.libelle_commune || '').trim()
  const cp = String(place.code_postal || '').trim() || null
  const closed = String(place.etat_administratif || item.etat_administratif || 'A') !== 'A'
  const addr = street(place)
  const labelAddr = place.adresse || [addr, cp, ville].filter(Boolean).join(' ')
  return {
    nom_client: nom,
    raison_sociale: raison,
    enseigne: shop,
    siret: String(place.siret || ''),
    siren,
    tva: tvaFromResult(item, siren),
    adresse: addr,
    code_postal: cp,
    ville: titleCase(ville),
    contact_magasin: contact(item.dirigeants),
    est_siege: Boolean(place.est_siege),
    ferme: closed,
    label: [nom, labelAddr].filter(Boolean).join(' — '),
  }
}

function expandResults(payload, wantedSiret) {
  const out = []
  const seen = new Set()
  const wanted = onlyDigits(wantedSiret || '')
  for (const item of payload.results || []) {
    const siege = item.siege || {}
    let etabs = []
    if (wanted.length === 14) {
      if (String(siege.siret || '') === wanted) etabs = [siege]
      for (const extra of item.matching_etablissements || []) {
        if (String(extra.siret || '') === wanted) {
          etabs = [extra]
          break
        }
      }
      if (!etabs.length && siege) etabs = [siege]
    } else {
      const matches = (item.matching_etablissements || []).filter(
        e => String(e.etat_administratif || 'A') === 'A',
      )
      etabs = matches.length ? matches.slice(0, 6) : (siege ? [siege] : [])
    }
    for (const etab of etabs) {
      const mapped = mapEtablissement(item, etab)
      const key = mapped.siret || mapped.label
      if (seen.has(key)) continue
      seen.add(key)
      out.push(mapped)
      if (out.length >= 12) return out
    }
  }
  return out
}

export async function searchAnnuaire(query) {
  const raw = String(query || '').trim()
  const digits = onlyDigits(raw)
  let q = raw
  if (digits.length === 9 || digits.length === 14) q = digits
  else if (q.length < 3) return { results: [], total: 0, query: raw }

  const url = `${SEARCH_URL}?${new URLSearchParams({ q, per_page: '8', page: '1' })}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Annuaire des entreprises indisponible (${response.status})`)
  const payload = await response.json()
  const results = expandResults(payload, digits.length === 14 ? digits : null)
  return { results, total: results.length, query: q }
}
