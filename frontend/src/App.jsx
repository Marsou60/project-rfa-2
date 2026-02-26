import { useEffect, useState } from 'react'
import {
  Upload,
  Users,
  BarChart3,
  FileText,
  Settings,
  Megaphone,
  UserCog,
  Link2,
  LogOut,
  ChevronDown,
  FlaskConical,
  Briefcase,
  Calculator,
  TrendingUp,
  Sparkles,
  Home,
  MoreHorizontal,
} from 'lucide-react'
import UploadPage from './pages/UploadPage'
import ClientsPage from './pages/ClientsPage'
import ContractsPage from './pages/ContractsPage'
import AssignmentsPage from './pages/AssignmentsPage'
import RecapPage from './pages/RecapPage'
import ClientSpacePage from './pages/ClientSpacePage'
import UnionSpacePage from './pages/UnionSpacePage'
import AdsPage from './pages/AdsPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import TestRawImportPage from './pages/TestRawImportPage'
import MarginSimulatorPage from './pages/MarginSimulatorPage'
import GeniePage from './pages/GeniePage'
import PureDataPage from './pages/PureDataPage'
import LoginPage from './pages/LoginPage'
import HubPage from './pages/HubPage'
import NathaliePage from './pages/NathaliePage'
import PaulPage from './pages/PaulPage'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SupplierFilterProvider, useSupplierFilter } from './context/SupplierFilterContext'
import { SUPPLIER_KEYS, SUPPLIER_LABELS } from './constants/suppliers'
import { getSetting, getImageUrl, getRfaSheetsCurrent } from './api/client'

function AppContent() {
  const { user, loading, logout, isAdmin, isCommercial, isAdherent, isAuthenticated } = useAuth()
  const { supplierFilter, setSupplierFilter } = useSupplierFilter()
  const [currentImportId, setCurrentImportId] = useState(null)
  const [currentPage, setCurrentPage] = useState('hub')
  const [companyLogo, setCompanyLogo] = useState(null)
  const [openMenu, setOpenMenu] = useState(null)
  const [openSupplierFilter, setOpenSupplierFilter] = useState(false)

  useEffect(() => {
    const savedImportId = localStorage.getItem('currentImportId')
    const savedPage = localStorage.getItem('currentPage')
    if (savedImportId) {
      setCurrentImportId(savedImportId)
    } else {
      getRfaSheetsCurrent()
        .then((r) => {
          if (r && r.has_data) {
            setCurrentImportId('sheets_live')
            localStorage.setItem('currentImportId', 'sheets_live')
          }
        })
        .catch(() => {})
    }
    if (savedPage) {
      setCurrentPage(savedPage)
    }
  }, [])

  useEffect(() => {
    const loadLogo = async () => {
      try {
        const result = await getSetting('company_logo')
        if (result.value) {
          setCompanyLogo(result.value)
        }
      } catch (err) {
        console.log('Logo non configuré')
      }
    }
    if (isAuthenticated) {
      loadLogo()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAdherent && isAuthenticated) {
      setCurrentPage('client-space')
    } else if (isAuthenticated && !isAdherent) {
      // Admin : charger la dernière page sauvegardée ou le Hub
      const savedPage = localStorage.getItem('currentPage')
      if (!savedPage || savedPage === 'upload') {
        setCurrentPage('hub')
      }
    }
  }, [isAdherent, isAuthenticated])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenu && !event.target.closest('.dropdown-container')) {
        setOpenMenu(null)
      }
      if (openSupplierFilter && !event.target.closest('.dropdown-container')) {
        setOpenSupplierFilter(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenu, openSupplierFilter])

  useEffect(() => {
    if (currentImportId) {
      localStorage.setItem('currentImportId', currentImportId)
    } else {
      localStorage.removeItem('currentImportId')
    }
  }, [currentImportId])

  useEffect(() => {
    if (currentPage) {
      localStorage.setItem('currentPage', currentPage)
    }
  }, [currentPage])

  const handleUploadSuccess = (importId) => {
    if (!importId) return
    setCurrentImportId(importId)
    setCurrentPage('union-space')
    localStorage.setItem('lastImportId', importId)
  }

  if (loading) {
    return (
      <div className="glass-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="glass-card p-4 animate-float">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-glow-purple">
              <span className="text-white font-black text-2xl">GU</span>
            </div>
          </div>
          <p className="text-blue-300 animate-pulse">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  const needsImport = ['clients', 'client-space', 'recap', 'genie', 'union-space'].includes(currentPage)
  const effectivePage = needsImport && !currentImportId ? 'upload' : currentPage

  // Pages accessibles uniquement aux admins
  const adminOnlyPages = ['contracts', 'assignments', 'ads', 'users', 'settings', 'upload', 'clients', 'recap', 'margin-simulator', 'paul', 'union-space']
  // Pages accessibles aux commerciaux (Nicolas + Nathalie)
  const commercialPages = ['hub', 'client-space', 'genie', 'pure-data', 'nathalie']

  if (isAdherent && effectivePage !== 'client-space') {
    setCurrentPage('client-space')
    return null
  }
  if (isCommercial && adminOnlyPages.includes(effectivePage)) {
    setCurrentPage('hub')
    return null
  }

  return (
    <div className="glass-background">
      {/* Particules flottantes en arrière-plan */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl animate-float" />
      </div>

      {/* Header Glass */}
      <header className="glass-header sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Brand */}
            <div className="flex items-center gap-4">
              {companyLogo ? (
                <img
                  src={getImageUrl(companyLogo)}
                  alt="Logo"
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <div className="glass-card p-1.5">
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-black text-sm">GU</span>
                  </div>
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold text-white">
                  Groupement Union
                </h1>
                <p className="text-[10px] text-blue-300/70 uppercase tracking-wider">
                  Hub Interne
                </p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {/* Navigation COMMERCIAL : Nicolas + Nathalie uniquement */}
              {isCommercial && (
                <>
                  <NavButton
                    active={effectivePage === 'hub'}
                    onClick={() => { setCurrentPage('hub'); setOpenMenu(null) }}
                    icon={<Home className="w-4 h-4" />}
                    label="Accueil"
                  />
                  <div className="relative dropdown-container">
                    <button
                      onClick={() => setOpenMenu(openMenu === 'nicolas' ? null : 'nicolas')}
                      className={`glass-nav-item text-sm flex items-center gap-1.5 ${
                        ['client-space', 'genie', 'pure-data'].includes(effectivePage) ? 'active' : ''
                      }`}
                    >
                      <span className="text-base leading-none">📊</span>
                      <span className="hidden md:inline font-semibold">Nicolas</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>
                    {openMenu === 'nicolas' && (
                      <div className="glass-dropdown absolute top-full left-0 mt-2 w-56 z-50 dropdown-menu">
                        <button
                          onClick={() => { setCurrentPage(currentImportId ? 'client-space' : 'hub'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'client-space' ? 'active' : ''} ${!currentImportId ? 'opacity-40' : ''}`}
                        >
                          <Briefcase className="w-4 h-4 text-indigo-400" />
                          <div>
                            <div className="font-semibold">Espace client</div>
                            <div className="text-[10px] text-white/40">Fiche détaillée adhérent</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setCurrentPage(currentImportId ? 'genie' : 'hub'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'genie' ? 'active' : ''} ${!currentImportId ? 'opacity-40' : ''}`}
                        >
                          <Sparkles className="w-4 h-4 text-violet-400" />
                          <div>
                            <div className="font-semibold">Union Intelligence</div>
                            <div className="text-[10px] text-white/40">Analyse avancée IA</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setCurrentPage('pure-data'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'pure-data' ? 'active' : ''}`}
                        >
                          <TrendingUp className="w-4 h-4 text-teal-400" />
                          <div>
                            <div className="font-semibold">Pure Data</div>
                            <div className="text-[10px] text-white/40">Données brutes N-1</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                  <NavButton
                    active={effectivePage === 'nathalie'}
                    onClick={() => { setCurrentPage('nathalie'); setOpenMenu(null) }}
                    icon={<span className="text-base leading-none">🤝</span>}
                    label="Nathalie"
                  />
                </>
              )}

              {isAdmin && (
                <>
                  {/* ── Accueil ── */}
                  <NavButton
                    active={effectivePage === 'hub'}
                    onClick={() => { setCurrentPage('hub'); setOpenMenu(null) }}
                    icon={<Home className="w-4 h-4" />}
                    label="Accueil"
                  />

                  {/* ── Nicolas ── */}
                  <div className="relative dropdown-container">
                    <button
                      onClick={() => setOpenMenu(openMenu === 'nicolas' ? null : 'nicolas')}
                      className={`glass-nav-item text-sm flex items-center gap-1.5 ${
                        ['nicolas', 'client-space', 'genie', 'pure-data'].includes(effectivePage) ? 'active' : ''
                      }`}
                    >
                      <span className="text-base leading-none">📊</span>
                      <span className="hidden md:inline font-semibold">Nicolas</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>
                    {openMenu === 'nicolas' && (
                      <div className="glass-dropdown absolute top-full left-0 mt-2 w-56 z-50 dropdown-menu">
                        <button
                          onClick={() => { setCurrentPage(currentImportId ? 'client-space' : 'upload'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'client-space' ? 'active' : ''} ${!currentImportId ? 'opacity-40' : ''}`}
                        >
                          <Briefcase className="w-4 h-4 text-indigo-400" />
                          <div>
                            <div className="font-semibold">Espace client</div>
                            <div className="text-[10px] text-white/40">Fiche détaillée adhérent</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setCurrentPage(currentImportId ? 'genie' : 'upload'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'genie' ? 'active' : ''} ${!currentImportId ? 'opacity-40' : ''}`}
                        >
                          <Sparkles className="w-4 h-4 text-violet-400" />
                          <div>
                            <div className="font-semibold">Union Intelligence</div>
                            <div className="text-[10px] text-white/40">Analyse avancée IA</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setCurrentPage('pure-data'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'pure-data' ? 'active' : ''}`}
                        >
                          <TrendingUp className="w-4 h-4 text-teal-400" />
                          <div>
                            <div className="font-semibold">Pure Data</div>
                            <div className="text-[10px] text-white/40">Données brutes N-1</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Paul ── */}
                  <div className="relative dropdown-container">
                    <button
                      onClick={() => setOpenMenu(openMenu === 'paul' ? null : 'paul')}
                      className={`glass-nav-item text-sm flex items-center gap-1.5 ${
                        ['paul', 'union-space', 'recap', 'margin-simulator', 'clients'].includes(effectivePage) ? 'active' : ''
                      }`}
                    >
                      <span className="text-base leading-none">💼</span>
                      <span className="hidden md:inline font-semibold">Paul</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>
                    {openMenu === 'paul' && (
                      <div className="glass-dropdown absolute top-full left-0 mt-2 w-56 z-50 dropdown-menu">
                        <button
                          onClick={() => { setCurrentPage('paul'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'paul' ? 'active' : ''}`}
                        >
                          <span className="text-base">💼</span>
                          <div>
                            <div className="font-semibold">Accueil Paul</div>
                            <div className="text-[10px] text-white/40">Hub pilotage financier</div>
                          </div>
                        </button>
                        <div className="border-t border-white/10 my-1" />
                        <button
                          onClick={() => { setCurrentPage(currentImportId ? 'union-space' : 'upload'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'union-space' ? 'active' : ''} ${!currentImportId ? 'opacity-40' : ''}`}
                        >
                          <Briefcase className="w-4 h-4 text-amber-400" />
                          <div>
                            <div className="font-semibold">Tableau de bord DAF</div>
                            <div className="text-[10px] text-white/40">Vue consolidée plateformes</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setCurrentPage(currentImportId ? 'recap' : 'upload'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'recap' ? 'active' : ''} ${!currentImportId ? 'opacity-40' : ''}`}
                        >
                          <BarChart3 className="w-4 h-4 text-blue-400" />
                          <div>
                            <div className="font-semibold">Récap général</div>
                            <div className="text-[10px] text-white/40">RFA globales</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setCurrentPage(currentImportId ? 'clients' : 'upload'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'clients' ? 'active' : ''} ${!currentImportId ? 'opacity-40' : ''}`}
                        >
                          <Users className="w-4 h-4 text-orange-400" />
                          <div>
                            <div className="font-semibold">Liste adhérents</div>
                            <div className="text-[10px] text-white/40">Tous les comptes & RFA</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setCurrentPage('margin-simulator'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'margin-simulator' ? 'active' : ''}`}
                        >
                          <Calculator className="w-4 h-4 text-violet-400" />
                          <div>
                            <div className="font-semibold">Simulateur de marge</div>
                            <div className="text-[10px] text-white/40">Scénarios & projections</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Nathalie ── */}
                  <NavButton
                    active={effectivePage === 'nathalie'}
                    onClick={() => { setCurrentPage('nathalie'); setOpenMenu(null) }}
                    icon={<span className="text-base leading-none">🤝</span>}
                    label="Nathalie"
                  />

                  {/* ── Plus ── */}
                  <div className="relative dropdown-container">
                    <NavButton
                      active={['contracts','assignments','ads','users','settings','upload','test-raw-import'].includes(effectivePage)}
                      onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
                      icon={<MoreHorizontal className="w-4 h-4" />}
                      label="Plus"
                      hasDropdown={true}
                    />
                    {openMenu === 'more' && (
                      <div className="glass-dropdown absolute top-full right-0 mt-2 w-52 z-50 dropdown-menu">
                        <button onClick={() => { setCurrentPage('upload'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'upload' ? 'active' : ''}`}>
                          <Upload className="w-4 h-4" />
                          <span>Import & source RFA</span>
                        </button>
                        <div className="border-t border-white/10 my-1" />
                        <button onClick={() => { setCurrentPage('contracts'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'contracts' ? 'active' : ''}`}>
                          <FileText className="w-4 h-4" />
                          <span>Contrats</span>
                        </button>
                        <button onClick={() => { setCurrentPage('assignments'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'assignments' ? 'active' : ''}`}>
                          <Link2 className="w-4 h-4" />
                          <span>Affectations</span>
                        </button>
                        <div className="border-t border-white/10 my-1" />
                        <button onClick={() => { setCurrentPage('users'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'users' ? 'active' : ''}`}>
                          <UserCog className="w-4 h-4" />
                          <span>Utilisateurs</span>
                        </button>
                        <button onClick={() => { setCurrentPage('settings'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'settings' ? 'active' : ''}`}>
                          <Settings className="w-4 h-4" />
                          <span>Paramètres</span>
                        </button>
                        <button onClick={() => { setCurrentPage('ads'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${effectivePage === 'ads' ? 'active' : ''}`}>
                          <Megaphone className="w-4 h-4" />
                          <span>Publicités</span>
                        </button>
                        <div className="border-t border-white/10 my-1" />
                        <button onClick={() => { setCurrentPage('test-raw-import'); setOpenMenu(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm opacity-40 ${effectivePage === 'test-raw-import' ? 'active' : ''}`}>
                          <FlaskConical className="w-4 h-4" />
                          <span>Test Import Brut</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {isAdherent && currentImportId && (
                <NavButton
                  active={true}
                  onClick={() => {}}
                  icon={<Briefcase className="w-4 h-4" />}
                  label="Mon Espace"
                />
              )}

              {/* Filtre fournisseur (mode ACR, DCA, etc.) — visible avec un import ou sur Pure Data */}
              {(currentImportId || currentPage === 'pure-data') && (
                <div className="relative dropdown-container">
                  <button
                    onClick={() => setOpenSupplierFilter(openSupplierFilter ? null : 'open')}
                    className={`glass-nav-item text-sm flex items-center gap-1.5 ${supplierFilter ? 'ring-2 ring-amber-400/60 ring-offset-2 ring-offset-[#0f172a]' : ''}`}
                    title="Filtrer les vues par plateforme"
                  >
                    <span className="text-xs opacity-80">Plateforme:</span>
                    <span className="font-semibold">{supplierFilter ? SUPPLIER_LABELS[supplierFilter] || supplierFilter : 'Tous'}</span>
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>
                  {openSupplierFilter && (
                    <div className="glass-dropdown absolute top-full right-0 mt-2 w-40 z-50 dropdown-menu">
                      <button
                        onClick={() => { setSupplierFilter(null); setOpenSupplierFilter(null) }}
                        className={`glass-dropdown-item w-full text-left text-sm ${!supplierFilter ? 'active' : ''}`}
                      >
                        Tous
                      </button>
                      {SUPPLIER_KEYS.map((key) => (
                        <button
                          key={key}
                          onClick={() => { setSupplierFilter(key); setOpenSupplierFilter(null) }}
                          className={`glass-dropdown-item w-full text-left text-sm ${supplierFilter === key ? 'active' : ''}`}
                        >
                          {SUPPLIER_LABELS[key] || key}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Séparateur */}
              <div className="w-px h-8 bg-white/20 mx-3" />

              {/* User Profile */}
              <div className="flex items-center gap-3 pl-2">
                <AvatarDisplay
                  user={user}
                  isAdmin={isAdmin}
                  size="w-10 h-10"
                  textSize="text-sm"
                />
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-semibold text-white">
                    {user?.displayName || user?.username}
                  </div>
                  <div className={`text-xs font-medium ${
                    isAdmin ? 'text-purple-300' : isCommercial ? 'text-blue-300' : 'text-emerald-300'
                  }`}>
                    {isAdmin ? 'Admin' : isCommercial ? 'Commercial' : 'Adhérent'}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="glass-btn-icon"
                  title="Se déconnecter"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {effectivePage === 'hub' && (isAdmin || isCommercial) && (
          <HubPage
            user={user}
            currentImportId={currentImportId}
            isCommercial={isCommercial}
            onNavigate={(page) => {
              setCurrentPage(page)
              setOpenMenu(null)
            }}
          />
        )}
        {effectivePage === 'paul' && isAdmin && (
          <PaulPage
            importId={currentImportId}
            onNavigate={(page) => { setCurrentPage(page); setOpenMenu(null) }}
          />
        )}
        {effectivePage === 'nathalie' && (isAdmin || isCommercial) && (
          <NathaliePage />
        )}
        {effectivePage === 'upload' && isAdmin && (
          <UploadPage onUploadSuccess={handleUploadSuccess} />
        )}
        {effectivePage === 'clients' && currentImportId && isAdmin && (
          <ClientsPage importId={currentImportId} />
        )}
        {effectivePage === 'client-space' && currentImportId && (isAdmin || isCommercial || isAdherent) && (
          <ClientSpacePage
            importId={currentImportId}
            linkedCodeUnion={user?.linkedCodeUnion}
            linkedGroupe={user?.linkedGroupe}
            isAdherent={isAdherent}
            isAdmin={isAdmin}
          />
        )}
        {effectivePage === 'recap' && currentImportId && isAdmin && (
          <RecapPage importId={currentImportId} />
        )}
        {effectivePage === 'contracts' && isAdmin && (
          <ContractsPage />
        )}
        {effectivePage === 'assignments' && isAdmin && (
          <AssignmentsPage />
        )}
        {effectivePage === 'ads' && isAdmin && (
          <AdsPage />
        )}
        {effectivePage === 'users' && isAdmin && (
          <UsersPage />
        )}
        {effectivePage === 'settings' && isAdmin && (
          <SettingsPage />
        )}
        {effectivePage === 'margin-simulator' && isAdmin && (
          <MarginSimulatorPage />
        )}
        {effectivePage === 'pure-data' && (isAdmin || isCommercial) && (
          <PureDataPage />
        )}
        {effectivePage === 'union-space' && isAdmin && currentImportId && (
          <UnionSpacePage importId={currentImportId} />
        )}
        {effectivePage === 'genie' && (isAdmin || isCommercial) && currentImportId && (
          <GeniePage importId={currentImportId} />
        )}
        {effectivePage === 'test-raw-import' && isAdmin && (
          <TestRawImportPage />
        )}

        {/* Message si adhérent sans import */}
        {isAdherent && !currentImportId && (
          <div className="text-center py-20">
            <div className="glass-card inline-block p-6 mb-6">
              <BarChart3 className="w-16 h-16 text-blue-400 mx-auto" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Bienvenue dans votre espace
            </h2>
            <p className="text-glass-secondary">
              Les données ne sont pas encore disponibles. <br />
              Veuillez contacter votre administrateur.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function AvatarDisplay({ user, isAdmin, size = "w-9 h-9", textSize = "text-sm" }) {
  const [imgError, setImgError] = useState(false)
  const avatarUrl = user?.avatarUrl

  if (!avatarUrl || imgError) {
    return (
      <div
        className={`${size} aspect-square rounded-full flex items-center justify-center text-white font-bold ${textSize} ${
          isAdmin
            ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
            : 'bg-gradient-to-br from-emerald-500 to-teal-600'
        } ring-2 ring-white/20`}
      >
        {(user?.displayName || user?.username || 'U')[0].toUpperCase()}
      </div>
    )
  }

  return (
    <div className={`relative ${size} aspect-square`}>
      <img
        src={getImageUrl(avatarUrl)}
        alt={user.displayName || user.username}
        className={`w-full h-full rounded-full object-cover ring-2 ${
          isAdmin ? 'ring-purple-400/50' : 'ring-emerald-400/50'
        }`}
        onError={() => setImgError(true)}
      />
    </div>
  )
}

function NavButton({ active, onClick, icon, label, hasDropdown = false }) {
  return (
    <button
      onClick={onClick}
      className={`glass-nav-item text-sm ${active ? 'active' : ''}`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
      {hasDropdown && (
        <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
      )}
    </button>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SupplierFilterProvider>
          <AppContent />
        </SupplierFilterProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
