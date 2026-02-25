import { useEffect, useMemo, useState } from 'react'
import { getAds, getSupplierLogos } from '../api/client'
import { useSupplierFilter } from '../context/SupplierFilterContext'

function getImageUrl(url) {
  if (!url) return null
  if (url.startsWith('/api')) {
    const isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined
    return isTauri ? `http://localhost:8001${url}` : url
  }
  return url
}

function AdsTicker() {
  const { supplierFilter } = useSupplierFilter()
  const [ads, setAds] = useState([])
  const [supplierLogos, setSupplierLogos] = useState({})
  const [error, setError] = useState(null)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    const loadAds = async () => {
      try {
        const data = await getAds({ activeOnly: true })
        setAds(data || [])
        setError(null)
      } catch (err) {
        setError(err.response?.data?.detail || 'Erreur lors du chargement des annonces')
      }
    }
    loadAds()
  }, [])

  useEffect(() => {
    getSupplierLogos().then(logos => {
      const map = {}
      for (const logo of logos || []) {
        map[logo.supplier_key] = logo
      }
      setSupplierLogos(map)
    }).catch(() => {})
  }, [])

  const activeAds = useMemo(() => ads.filter(ad => ad.is_active), [ads])
  
  const track = useMemo(() => {
    if (activeAds.length === 0) return []
    return [...activeAds, ...activeAds, ...activeAds, ...activeAds]
  }, [activeAds])

  if (!activeAds.length || error) {
    return null
  }

  return (
    <div className="relative overflow-hidden rounded-3xl shadow-2xl shadow-purple-500/30">
      {/* Background avec effet 3D */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-700 via-purple-600 to-fuchsia-700" />
      <div className="absolute inset-0 opacity-10 bg-grid-pattern" />
      
      {/* Reflet effet verre en haut */}
      <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
      
      {/* Ombre interne en bas pour effet 3D */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/30 to-transparent pointer-events-none rounded-b-3xl" />
      
      {/* Bordure brillante */}
      <div className="absolute inset-0 rounded-3xl border border-white/20 pointer-events-none" />
      <div className="absolute inset-[1px] rounded-3xl border border-white/10 pointer-events-none" />
      
      {/* Particules flottantes */}
      <div className="absolute top-3 left-[10%] w-2 h-2 bg-white/30 rounded-full animate-float-slow" />
      <div className="absolute top-5 left-[25%] w-1 h-1 bg-white/40 rounded-full animate-float-medium" />
      <div className="absolute top-4 left-[50%] w-1.5 h-1.5 bg-white/25 rounded-full animate-float-fast" />
      <div className="absolute top-3 left-[75%] w-1 h-1 bg-white/35 rounded-float-medium" />
      <div className="absolute top-6 left-[90%] w-1.5 h-1.5 bg-white/30 rounded-full animate-float-slow" />
      
      <div className="relative px-5 py-4">
        {/* Logo plateforme quand filtre fournisseur actif */}
        {supplierFilter && supplierLogos[supplierFilter]?.image_url && (
          <div className="flex justify-center mb-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20">
              <img
                src={getImageUrl(supplierLogos[supplierFilter].image_url)}
                alt={supplierLogos[supplierFilter].supplier_name}
                className="h-10 w-auto object-contain"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <span className="text-xs font-bold text-white/90">Vue {supplierFilter}</span>
            </div>
          </div>
        )}
        {/* Header avec effet 3D */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/50 animate-bounce-slow">
              <span className="text-sm">⭐</span>
            </div>
            <div>
              <span className="text-sm uppercase tracking-widest text-white font-black drop-shadow-lg">
                Nos Partenaires Premium
              </span>
              <div className="text-[10px] text-white/60 tracking-wide">Offres exclusives</div>
            </div>
          </div>
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white/90 hover:bg-white/30 hover:text-white transition-all hover:scale-110 shadow-lg"
            title={isPaused ? 'Reprendre' : 'Pause'}
          >
            {isPaused ? '▶' : '⏸'}
          </button>
        </div>
        
        {/* Carousel 3D */}
        <div 
          className="relative carousel-3d-container"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          style={{ perspective: '1000px' }}
        >
          {/* Ombres latérales 3D */}
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-violet-700 via-violet-700/90 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-fuchsia-700 via-fuchsia-700/90 to-transparent z-10 pointer-events-none" />
          
          {/* Reflet sol */}
          <div className="absolute -bottom-2 left-10 right-10 h-4 bg-gradient-to-t from-black/20 to-transparent blur-sm rounded-full" />
          
          <div className="overflow-hidden py-2">
            <div 
              className={`flex items-center gap-8 w-max ads-marquee ${isPaused ? 'paused' : ''}`}
              style={{
                animationDuration: `${Math.max(25, activeAds.length * 10)}s`,
                transformStyle: 'preserve-3d'
              }}
            >
              {track.map((ad, index) => (
                <AdItem key={`${ad.id}-${index}`} ad={ad} index={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdItem({ ad, index }) {
  const getImageUrl = (url) => {
    if (!url) return null
    if (url.startsWith('/api')) {
      const isTauri = window.__TAURI__ !== undefined
      return isTauri ? `http://localhost:8001${url}` : url
    }
    return url
  }

  const imageUrl = getImageUrl(ad.image_url)

  const content = ad.kind === 'promo' ? (
    <div 
      className="group relative flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 shadow-xl shadow-orange-500/40 transform transition-all duration-500 hover:scale-110 hover:-translate-y-1 hover:shadow-2xl hover:shadow-orange-500/50"
      style={{
        transform: 'rotateX(5deg)',
        transformStyle: 'preserve-3d'
      }}
    >
      {/* Effet verre 3D */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/40 via-transparent to-black/20 pointer-events-none" />
      
      {/* Shine effect */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 overflow-hidden" />
      
      {/* Bordure brillante */}
      <div className="absolute inset-0 rounded-2xl border-2 border-white/30 pointer-events-none" />
      
      {imageUrl && (
        <img 
          src={imageUrl} 
          alt={ad.title} 
          className="h-11 w-auto object-contain rounded-lg drop-shadow-lg relative z-10 transition-transform duration-300 group-hover:scale-110" 
        />
      )}
      <div className="leading-tight relative z-10">
        <div className="text-sm font-black text-white drop-shadow-lg tracking-wide">{ad.title}</div>
        {ad.subtitle && <div className="text-xs text-white/90 font-semibold">{ad.subtitle}</div>}
      </div>
      <span className="text-xl relative z-10 animate-bounce-slow">🔥</span>
    </div>
  ) : (
    <div 
      className="group relative flex items-center gap-4 px-5 py-3 rounded-2xl bg-white shadow-xl shadow-purple-500/25 transform transition-all duration-500 hover:scale-110 hover:-translate-y-1 hover:shadow-2xl hover:shadow-purple-500/40"
      style={{
        transform: 'rotateX(5deg)',
        transformStyle: 'preserve-3d'
      }}
    >
      {/* Effet verre 3D */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white via-gray-50 to-gray-100 pointer-events-none" />
      
      {/* Glow border animé */}
      <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm animate-gradient-x" />
      <div className="absolute inset-0 rounded-2xl bg-white" />
      
      {/* Reflet haut */}
      <div className="absolute top-0 left-2 right-2 h-1/2 bg-gradient-to-b from-white to-transparent rounded-t-2xl pointer-events-none" />
      
      {/* Bordure subtile */}
      <div className="absolute inset-0 rounded-2xl border border-gray-200/80 pointer-events-none" />
      
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt={ad.title} 
          className="h-12 w-auto object-contain relative z-10 transition-all duration-500 group-hover:scale-115 drop-shadow-md" 
        />
      ) : (
        <span className="text-sm font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent relative z-10 tracking-wide">
          {ad.title}
        </span>
      )}
    </div>
  )

  if (ad.link_url) {
    return (
      <a href={ad.link_url} target="_blank" rel="noreferrer" className="block transform-gpu">
        {content}
      </a>
    )
  }
  return <div className="transform-gpu">{content}</div>
}

export default AdsTicker
