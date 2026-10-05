import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, logout as apiLogout, getMe } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Vérifier si un token existe au chargement
    const token = localStorage.getItem('authToken')
    if (token) {
      checkAuth(token)
    } else {
      setLoading(false)
    }
  }, [])

  const checkAuth = async (token) => {
    try {
      const userData = await getMe(token)
      // Mapper les champs pour correspondre au format attendu
      const mappedUser = {
        id: userData.id,
        username: userData.username,
        displayName: userData.display_name,
        role: userData.role,
        linkedCodeUnion: userData.linked_code_union,
        linkedGroupe: userData.linked_groupe,
        avatarUrl: userData.avatar_url,
        token: token
      }
      setUser(mappedUser)
      localStorage.setItem('authUser', JSON.stringify(mappedUser))
    } catch (err) {
      console.error('Auth check failed:', err)
      localStorage.removeItem('authToken')
      localStorage.removeItem('authUser')
    } finally {
      setLoading(false)
    }
  }

  const login = async (username, password) => {
    const response = await apiLogin(username, password)
    const userData = {
      id: response.user_id,
      username: response.username,
      displayName: response.display_name,
      role: response.role,
      linkedCodeUnion: response.linked_code_union,
      linkedGroupe: response.linked_groupe,
      avatarUrl: response.avatar_url,
      token: response.token
    }
    
    localStorage.setItem('authToken', response.token)
    localStorage.setItem('authUser', JSON.stringify(userData))
    setUser(userData)
    
    return userData
  }

  const logout = async () => {
    try {
      await apiLogout()
    } catch (err) {
      console.error('Logout error:', err)
    }
    localStorage.removeItem('authToken')
    localStorage.removeItem('authUser')
    setUser(null)
  }

  const isAdmin      = user?.role === 'ADMIN'
  const isCommercial = user?.role === 'COMMERCIAL'
  const isAdherent   = user?.role === 'ADHERENT'

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      isAdmin,
      isCommercial,
      isAdherent,
      isAuthenticated: !!user 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
