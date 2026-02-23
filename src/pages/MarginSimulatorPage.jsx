import { useMemo, useState } from 'react'
import { Calculator } from 'lucide-react'

const SUPPLIER_DEFAULT_RATES = {
  ACR: 18,
  DCA: 16,
  CAL: 14,
  Exadis: 13,
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value || 0)

const formatPercent = (value) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)

function MarginSimulatorPage() {
  const [supplier, setSupplier] = useState('ACR')
  const [tauxUnion, setTauxUnion] = useState(SUPPLIER_DEFAULT_RATES.ACR)
  const [rfaActuel, setRfaActuel] = useState(10)
  const [rfaNouveau, setRfaNouveau] = useState(11)
  const [caActuel, setCaActuel] = useState(500000)
  const [targetMarginIncrease, setTargetMarginIncrease] = useState(10)
  const [impactRateClient, setImpactRateClient] = useState(0.1)
  const [impactRateSupplier, setImpactRateSupplier] = useState(0.1)

  const results = useMemo(() => {
    const ca = Number(caActuel) || 0
    const tauxUnionRate = (Number(tauxUnion) || 0) / 100
    const rfaOldRate = (Number(rfaActuel) || 0) / 100
    const rfaNewRate = (Number(rfaNouveau) || 0) / 100
    const targetIncrease = (Number(targetMarginIncrease) || 0) / 100
    const impactRateClientValue = (Number(impactRateClient) || 0) / 100
    const impactRateSupplierValue = (Number(impactRateSupplier) || 0) / 100

    const rfaOldAmount = ca * rfaOldRate
    const rfaNewAmount = ca * rfaNewRate
    const margeOld = ca * (tauxUnionRate - rfaOldRate)
    const margeNew = ca * (tauxUnionRate - rfaNewRate)
    const deltaRfa = rfaNewAmount - rfaOldAmount
    const deltaMarge = margeNew - margeOld
    const tauxClientMax = Math.max(tauxUnionRate * 100, 0)
    const impactClient = ca * impactRateClientValue
    const impactSupplier = ca * impactRateSupplierValue

    const denominator = tauxUnionRate - rfaNewRate
    const caMin = denominator > 0 ? (ca * (tauxUnionRate - rfaOldRate)) / denominator : null
    const caTarget = denominator > 0 ? (margeOld * (1 + targetIncrease)) / denominator : null
    const caMinDelta = caMin !== null ? Math.max(caMin - ca, 0) : null
    const caTargetDelta = caTarget !== null ? Math.max(caTarget - ca, 0) : null

    return {
      ca,
      tauxUnionRate,
      rfaOldRate,
      rfaNewRate,
      rfaOldAmount,
      rfaNewAmount,
      margeOld,
      margeNew,
      deltaRfa,
      deltaMarge,
      tauxClientMax,
      impactClient,
      impactSupplier,
      impactRateClientValue,
      impactRateSupplierValue,
      caMin,
      caTarget,
      caMinDelta,
      caTargetDelta,
      invalidRates: denominator <= 0,
    }
  }, [caActuel, tauxUnion, rfaActuel, rfaNouveau, targetMarginIncrease, impactRateClient, impactRateSupplier])

  const handleSupplierChange = (value) => {
    setSupplier(value)
    setTauxUnion(SUPPLIER_DEFAULT_RATES[value] ?? 0)
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center text-white">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-glass-primary text-xl font-bold">Simulateur de marge Union</h1>
            <p className="text-glass-secondary text-sm">
              Estime l’impact d’un nouveau taux RFA sur la marge.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-glass-secondary text-sm font-semibold">Fournisseur</label>
            <select
              value={supplier}
              onChange={(e) => handleSupplierChange(e.target.value)}
              className="glass-select w-full mt-2"
            >
              {Object.keys(SUPPLIER_DEFAULT_RATES).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-glass-secondary text-sm font-semibold">Taux fournisseur versé à Union (%)</label>
            <input
              type="number"
              value={tauxUnion}
              onChange={(e) => setTauxUnion(e.target.value)}
              step="0.01"
              className="glass-input w-full mt-2"
            />
          </div>

          <div>
            <label className="text-glass-secondary text-sm font-semibold">Taux RFA actuel du client (%)</label>
            <input
              type="number"
              value={rfaActuel}
              onChange={(e) => setRfaActuel(e.target.value)}
              step="0.01"
              className="glass-input w-full mt-2"
            />
          </div>

          <div>
            <label className="text-glass-secondary text-sm font-semibold">Taux RFA souhaité (%)</label>
            <input
              type="number"
              value={rfaNouveau}
              onChange={(e) => setRfaNouveau(e.target.value)}
              step="0.01"
              className="glass-input w-full mt-2"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-glass-secondary text-sm font-semibold">Chiffre d'affaires actuel (€)</label>
            <input
              type="number"
              value={caActuel}
              onChange={(e) => setCaActuel(e.target.value)}
              className="glass-input w-full mt-2"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-glass-secondary text-sm font-semibold">Objectif d'augmentation de marge (%)</label>
            <input
              type="number"
              value={targetMarginIncrease}
              onChange={(e) => setTargetMarginIncrease(e.target.value)}
              step="0.5"
              className="glass-input w-full mt-2"
            />
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="glass-card-dark p-4 mb-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-3">
              <div>
                <div className="text-glass-secondary text-xs">Impact d'une hausse du taux RFA client</div>
                <div className="text-2xl font-bold text-amber-300">
                  {formatCurrency(results.impactClient)}
                </div>
                <div className="text-xs text-glass-muted">
                  Basé sur {formatPercent(results.impactRateClientValue)}
                </div>
              </div>
              <div>
                <div className="text-glass-secondary text-xs">Impact d'une hausse du taux fournisseur</div>
                <div className="text-2xl font-bold text-emerald-300">
                  {formatCurrency(results.impactSupplier)}
                </div>
                <div className="text-xs text-glass-muted">
                  Basé sur {formatPercent(results.impactRateSupplierValue)}
                </div>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-glass-secondary">Variation du taux RFA client</label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={impactRateClient}
                  onChange={(e) => setImpactRateClient(e.target.value)}
                  className="w-full mt-2"
                />
                <div className="flex justify-between text-xs text-glass-muted mt-1">
                  <span>+0,1%</span>
                  <span>+1%</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-glass-secondary">Variation du taux fournisseur</label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={impactRateSupplier}
                  onChange={(e) => setImpactRateSupplier(e.target.value)}
                  className="w-full mt-2"
                />
                <div className="flex justify-between text-xs text-glass-muted mt-1">
                  <span>+0,1%</span>
                  <span>+1%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="glass-card-dark p-4">
            <div className="text-glass-secondary text-xs">Delta marge Union</div>
            <div className={`text-lg font-bold ${results.deltaMarge >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {formatCurrency(results.deltaMarge)}
            </div>
          </div>
          <div className="glass-card-dark p-4">
            <div className="text-glass-secondary text-xs">Delta RFA versée</div>
            <div className={`text-lg font-bold ${results.deltaRfa >= 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
              {formatCurrency(results.deltaRfa)}
            </div>
          </div>
          <div className="glass-card-dark p-4">
            <div className="text-glass-secondary text-xs">CA à ajouter (objectif marge)</div>
            <div className="text-lg font-bold text-glass-primary">
              {results.caTargetDelta ? formatCurrency(results.caTargetDelta) : '—'}
            </div>
          </div>
          <div className="glass-card-dark p-4">
            <div className="text-glass-secondary text-xs">Taux max client avant marge nulle</div>
            <div className="text-lg font-bold text-glass-primary">
              {formatPercent(results.tauxClientMax / 100)}
            </div>
          </div>
        </div>

        <h2 className="text-glass-primary font-semibold mb-4">Résumé de la simulation</h2>

        {results.invalidRates && (
          <div className="mb-4 rounded-lg bg-amber-100 text-amber-800 px-4 py-3 text-sm">
            Le taux RFA souhaité doit rester inférieur au taux fournisseur versé à Union.
          </div>
        )}

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-glass-secondary">Fournisseur</span>
            <span className="text-glass-primary font-semibold">{supplier}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">Chiffre d'affaires saisi</span>
            <span className="text-glass-primary font-semibold">{formatCurrency(results.ca)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">Commission Union</span>
            <span className="text-glass-primary font-semibold">{formatPercent(results.tauxUnionRate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">RFA actuel</span>
            <span className="text-glass-primary font-semibold">
              {formatPercent(results.rfaOldRate)} ({formatCurrency(results.rfaOldAmount)})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">RFA souhaité</span>
            <span className="text-glass-primary font-semibold">
              {formatPercent(results.rfaNewRate)} ({formatCurrency(results.rfaNewAmount)})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">Marge Union actuelle</span>
            <span className="text-emerald-300 font-semibold">{formatCurrency(results.margeOld)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">Marge Union avec nouveau taux</span>
            <span className="text-emerald-300 font-semibold">{formatCurrency(results.margeNew)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">CA minimum pour conserver la marge</span>
            <span className="text-glass-primary font-semibold">
              {results.caMin ? `${formatCurrency(results.caMin)} (+${formatCurrency(results.caMinDelta)})` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">CA pour +{Number(targetMarginIncrease) || 0}% de marge</span>
            <span className="text-glass-primary font-semibold">
              {results.caTarget ? `${formatCurrency(results.caTarget)} (+${formatCurrency(results.caTargetDelta)})` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-glass-secondary">Seuil de marge nulle (taux client)</span>
            <span className="text-glass-primary font-semibold">
              {formatPercent(results.tauxClientMax / 100)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MarginSimulatorPage
