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
  User,
  Briefcase,
  Calculator,
  TrendingUp,
  Sparkles
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
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SupplierFilterProvider, useSupplierFilter } from './context/SupplierFilterContext'
import { SUPPLIER_KEYS, SUPPLIER_LABELS } from './constants/suppliers'
import { getSetting, getImageUrl } from './api/client'

function AppContent() {
  const { user, loading, logout, isAdmin, isAdherent, isAuthenticated } = useAuth()
  const { supplierFilter, setSupplierFilter } = useSupplierFilter()
  const [currentImportId, setCurrentImportId] = useState(null)
  const [currentPage, setCurrentPage] = useState('upload')
  const [companyLogo, setCompanyLogo] = useState(null)
  const [openMenu, setOpenMenu] = useState(null)
  const [openSupplierFilter, setOpenSupplierFilter] = useState(false)

  useEffect(() => {
    const savedImportId = localStorage.getItem('currentImportId')
    const savedPage = localStorage.getItem('currentPage')
    if (savedImportId) {
      setCurrentImportId(savedImportId)
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
    setCurrentPage('clients')
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

  const needsImport = ['clients', 'client-space', 'recap', 'genie'].includes(currentPage)
  const effectivePage = needsImport && !currentImportId ? 'upload' : currentPage

  const adminOnlyPages = ['contracts', 'assignments', 'ads', 'users', 'settings', 'upload', 'clients', 'recap', 'margin-simulator', 'pure-data']

  if (isAdherent && adminOnlyPages.includes(effectivePage)) {
    setCurrentPage('client-space')
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
                  Plateforme RFA
                </p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {isAdmin && (
                <>
                  <NavButton
                    active={currentPage === 'upload'}
                    onClick={() => {
                      setCurrentPage('upload')
                      setOpenMenu(null)
                    }}
                    icon={<Upload className="w-4 h-4" />}
                    label="Import"
                  />

                  {currentImportId && (
                    <>
                      <NavButton
                        active={effectivePage === 'recap'}
                        onClick={() => {
                          setCurrentPage('recap')
                          setOpenMenu(null)
                        }}
                        icon={<BarChart3 className="w-4 h-4" />}
                        label="Récap"
                      />

                      {/* Menu Clients */}
                      <div className="relative dropdown-container">
                        <NavButton
                          active={effectivePage === 'clients' || effectivePage === 'client-space'}
                          onClick={() => setOpenMenu(openMenu === 'clients' ? null : 'clients')}
                          icon={<Users className="w-4 h-4" />}
                          label="Clients"
                          hasDropdown={true}
                        />
                        {openMenu === 'clients' && (
                          <div className="glass-dropdown absolute top-full left-0 mt-2 w-48 z-50 dropdown-menu">
                            <button
                              onClick={() => {
                                setCurrentPage('clients')
                                setOpenMenu(null)
                              }}
                              className={`glass-dropdown-item w-full text-left text-sm ${
                                effectivePage === 'clients' ? 'active' : ''
                              }`}
                            >
                              <Users className="w-4 h-4" />
                              <span>Liste Clients</span>
                            </button>
                            <button
                              onClick={() => {
                                setCurrentPage('client-space')
                                setOpenMenu(null)
                              }}
                              className={`glass-dropdown-item w-full text-left text-sm ${
                                effectivePage === 'client-space' ? 'active' : ''
                              }`}
                            >
                              <Briefcase className="w-4 h-4" />
                              <span>Espace Client</span>
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setCurrentPage('pure-data')
                                  setOpenMenu(null)
                                }}
                                className={`glass-dropdown-item w-full text-left text-sm ${
                                  effectivePage === 'pure-data' ? 'active' : ''
                                }`}
                              >
                                <TrendingUp className="w-4 h-4" />
                                <span>Pure Data (N-1)</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bouton DAF doré */}
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setCurrentPage('union-space')
                            setOpenMenu(null)
                          }}
                          className={`group relative overflow-hidden px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                            effectivePage === 'union-space'
                              ? 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-500 text-gray-900 shadow-lg shadow-yellow-500/50'
                              : 'bg-gradient-to-r from-yellow-500/20 via-amber-500/20 to-yellow-600/20 text-yellow-200 hover:from-yellow-400 hover:via-yellow-500 hover:to-amber-500 hover:text-gray-900 hover:shadow-lg hover:shadow-yellow-500/50'
                          }`}
                        >
                          <div className="relative flex items-center gap-2">
                            <Briefcase className="w-4 h-4" />
                            <span className="hidden md:inline font-bold">DAF</span>
                            {effectivePage === 'union-space' && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                            )}
                          </div>
                          {effectivePage !== 'union-space' && (
                            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/0 via-yellow-300/30 to-yellow-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-shimmer" />
                          )}
                        </button>
                      )}
                    </>
                  )}

                      {/* Bouton Union Intelligence */}
                      {isAdmin && currentImportId && (
                        <button
                          onClick={() => {
                            setCurrentPage('genie')
                            setOpenMenu(null)
                          }}
                          className={`group relative overflow-hidden px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                            effectivePage === 'genie'
                              ? 'bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/50'
                              : 'bg-gradient-to-r from-violet-500/20 via-indigo-500/20 to-cyan-500/20 text-cyan-200 hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-500 hover:text-white hover:shadow-lg hover:shadow-indigo-500/50'
                          }`}
                        >
                          <div className="relative flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            <span className="hidden md:inline font-bold">U.I.</span>
                            {effectivePage === 'genie' && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                            )}
                          </div>
                          {effectivePage !== 'genie' && (
                            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-300/20 to-cyan-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-shimmer" />
                          )}
                        </button>
                      )}

                  {/* Menu Contrats */}
                  <div className="relative dropdown-container">
                    <NavButton
                      active={effectivePage === 'contracts' || effectivePage === 'assignments'}
                      onClick={() => setOpenMenu(openMenu === 'contracts' ? null : 'contracts')}
                      icon={<FileText className="w-4 h-4" />}
                      label="Contrats"
                      hasDropdown={true}
                    />
                    {openMenu === 'contracts' && (
                      <div className="glass-dropdown absolute top-full left-0 mt-2 w-48 z-50 dropdown-menu">
                        <button
                          onClick={() => {
                            setCurrentPage('contracts')
                            setOpenMenu(null)
                          }}
                          className={`glass-dropdown-item w-full text-left text-sm ${
                            effectivePage === 'contracts' ? 'active' : ''
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          <span>Gestion Contrats</span>
                        </button>
                        <button
                          onClick={() => {
                            setCurrentPage('assignments')
                            setOpenMenu(null)
                          }}
                          className={`glass-dropdown-item w-full text-left text-sm ${
                            effectivePage === 'assignments' ? 'active' : ''
                          }`}
                        >
                          <Link2 className="w-4 h-4" />
                          <span>Affectations</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <NavButton
                    active={effectivePage === 'ads'}
                    onClick={() => {
                      setCurrentPage('ads')
                      setOpenMenu(null)
                    }}
                    icon={<Megaphone className="w-4 h-4" />}
                    label="Publicités"
                  />

                  {/* Menu Administration */}
                  <div className="relative dropdown-container">
                    <NavButton
                      active={effectivePage === 'users' || effectivePage === 'settings' || effectivePage === 'margin-simulator' || effectivePage === 'pure-data' || effectivePage === 'test-raw-import'}
                      onClick={() => setOpenMenu(openMenu === 'admin' ? null : 'admin')}
                      icon={<Settings className="w-4 h-4" />}
                      label="Admin"
                      hasDropdown={true}
                    />
                    {openMenu === 'admin' && (
                      <div className="glass-dropdown absolute top-full right-0 mt-2 w-48 z-50 dropdown-menu">
                        <button
                          onClick={() => {
                            setCurrentPage('users')
                            setOpenMenu(null)
                          }}
                          className={`glass-dropdown-item w-full text-left text-sm ${
                            effectivePage === 'users' ? 'active' : ''
                          }`}
                        >
                          <UserCog className="w-4 h-4" />
                          <span>Utilisateurs</span>
                        </button>
                        <button
                          onClick={() => {
                            setCurrentPage('settings')
                            setOpenMenu(null)
                          }}
                          className={`glass-dropdown-item w-full text-left text-sm ${
                            effectivePage === 'settings' ? 'active' : ''
                          }`}
                        >
                          <Settings className="w-4 h-4" />
                          <span>Paramètres</span>
                        </button>
                        <button
                          onClick={() => {
                            setCurrentPage('margin-simulator')
                            setOpenMenu(null)
                          }}
                          className={`glass-dropdown-item w-full text-left text-sm ${
                            effectivePage === 'margin-simulator' ? 'active' : ''
                          }`}
                        >
                          <Calculator className="w-4 h-4" />
                          <span>Simulateur Marge</span>
                        </button>
                        <button
                          onClick={() => {
                            setCurrentPage('pure-data')
                            setOpenMenu(null)
                          }}
                          className={`glass-dropdown-item w-full text-left text-sm ${
                            effectivePage === 'pure-data' ? 'active' : ''
                          }`}
                        >
                          <TrendingUp className="w-4 h-4" />
                          <span>Pure Data (N-1)</span>
                        </button>
                        <div className="border-t border-white/10 my-1" />
                        <button
                          onClick={() => {
                            setCurrentPage('test-raw-import')
                            setOpenMenu(null)
                          }}
                          className={`glass-dropdown-item w-full text-left text-sm ${
                            effectivePage === 'test-raw-import' ? 'active' : ''
                          }`}
                        >
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
                    isAdmin ? 'text-purple-300' : 'text-emerald-300'
                  }`}>
                    {isAdmin ? 'Admin' : 'Adhérent'}
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
        {effectivePage === 'upload' && isAdmin && (
          <UploadPage onUploadSuccess={handleUploadSuccess} />
        )}
        {effectivePage === 'clients' && currentImportId && isAdmin && (
          <ClientsPage importId={currentImportId} />
        )}
        {effectivePage === 'client-space' && currentImportId && (
          <ClientSpacePage
            importId={currentImportId}
            linkedCodeUnion={user?.linkedCodeUnion}
            linkedGroupe={user?.linkedGroupe}
            isAdherent={isAdherent}
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
        {effectivePage === 'pure-data' && isAdmin && (
          <PureDataPage />
        )}
        {effectivePage === 'union-space' && isAdmin && currentImportId && (
          <UnionSpacePage importId={currentImportId} />
        )}
        {effectivePage === 'genie' && isAdmin && currentImportId && (
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
