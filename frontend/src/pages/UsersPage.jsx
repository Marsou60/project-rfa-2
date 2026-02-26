import { useState, useEffect, useRef } from 'react'
import { Users, Plus, Pencil, Trash2, X, Camera, Crown, Briefcase, Loader2 } from 'lucide-react'
import { getUsers, createUser, updateUser, deleteUser, getEntities, uploadAvatar, getImageUrl } from '../api/client'

function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [availableEntities, setAvailableEntities] = useState({ clients: [], groups: [] })

  useEffect(() => {
    loadUsers()
    loadEntities()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const data = await getUsers()
      setUsers(data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const loadEntities = async () => {
    const lastImportId = localStorage.getItem('lastImportId')
    if (lastImportId) {
      try {
        const [clients, groups] = await Promise.all([
          getEntities(lastImportId, 'client').catch(() => []),
          getEntities(lastImportId, 'group').catch(() => [])
        ])
        setAvailableEntities({ clients: clients || [], groups: groups || [] })
      } catch (e) {
        console.log('Pas d\'import disponible pour les suggestions')
      }
    }
  }

  const handleCreate = async (formData) => {
    try {
      await createUser(formData)
      setShowForm(false)
      loadUsers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la création')
      throw err
    }
  }

  const handleUpdate = async (formData) => {
    try {
      await updateUser(editingUser.id, formData)
      setEditingUser(null)
      loadUsers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la mise à jour')
      throw err
    }
  }

  const handleDelete = async (userId, username) => {
    if (!window.confirm(`Supprimer l'utilisateur "${username}" ?`)) return
    try {
      await deleteUser(userId)
      loadUsers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  const handleToggleActive = async (user) => {
    try {
      await updateUser(user.id, { is_active: !user.is_active })
      loadUsers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la mise à jour')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-glass-secondary">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-glow-purple">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
            <p className="text-sm text-glass-secondary">Gérez les comptes et les accès</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="glass-btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvel utilisateur</span>
        </button>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {(showForm || editingUser) && (
        <UserForm
          user={editingUser}
          availableEntities={availableEntities}
          onSubmit={editingUser ? handleUpdate : handleCreate}
          onCancel={() => { setShowForm(false); setEditingUser(null) }}
        />
      )}

      {/* Liste */}
      <div className="glass-card overflow-hidden">
        <table className="glass-table">
          <thead>
            <tr>
              <th className="text-left">Utilisateur</th>
              <th className="text-left">Rôle</th>
              <th className="text-left">Lien</th>
              <th className="text-center">Actif</th>
              <th className="text-left">Dernière connexion</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={!user.is_active ? 'opacity-50' : ''}>
                <td>
                  <div className="flex items-center gap-3">
                    {user.avatar_url ? (
                      <div className="w-10 h-10 aspect-square">
                        <img
                          src={getImageUrl(user.avatar_url)}
                          alt={user.username}
                          className={`w-full h-full rounded-full object-cover ring-2 ${
                            user.role === 'ADMIN' ? 'ring-purple-400/50' : 'ring-cyan-400/50'
                          }`}
                        />
                      </div>
                    ) : (
                      <div className={`w-10 h-10 aspect-square rounded-full flex items-center justify-center text-white font-bold ${
                        user.role === 'ADMIN' ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gradient-to-br from-blue-400 to-cyan-500'
                      }`}>
                        {user.username[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-white">{user.username}</div>
                      {user.display_name && (
                        <div className="text-sm text-glass-secondary">{user.display_name}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`glass-badge flex items-center gap-1 ${
                    user.role === 'ADMIN'      ? 'glass-badge-purple' :
                    user.role === 'COMMERCIAL' ? 'glass-badge-blue' :
                    'glass-badge-emerald'
                  }`}>
                    {user.role === 'ADMIN'      ? <Crown className="w-3 h-3" /> :
                     user.role === 'COMMERCIAL' ? <span className="text-xs">📊</span> :
                     <Briefcase className="w-3 h-3" />}
                    {user.role === 'ADMIN' ? 'Admin' : user.role === 'COMMERCIAL' ? 'Commercial' : 'Adhérent'}
                  </span>
                </td>
                <td className="text-glass-secondary">
                  {user.linked_code_union && (
                    <span className="glass-badge-gray text-xs">Client: {user.linked_code_union}</span>
                  )}
                  {user.linked_groupe && (
                    <span className="glass-badge-gray text-xs">Groupe: {user.linked_groupe}</span>
                  )}
                  {!user.linked_code_union && !user.linked_groupe && (
                    <span className="text-glass-muted">-</span>
                  )}
                </td>
                <td className="text-center">
                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`w-10 h-6 rounded-full transition-all ${
                      user.is_active ? 'bg-emerald-500' : 'bg-white/20'
                    }`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      user.is_active ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                </td>
                <td className="text-glass-secondary text-sm">
                  {user.last_login
                    ? new Date(user.last_login).toLocaleString('fr-FR')
                    : <span className="text-glass-muted">Jamais</span>
                  }
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="glass-btn-icon"
                      title="Modifier"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id, user.username)}
                      className="glass-btn-icon text-red-400 hover:text-red-300"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-glass-muted">
                  Aucun utilisateur
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UserForm({ user, availableEntities, onSubmit, onCancel }) {
  const fileRef = useRef(null)
  const [formData, setFormData] = useState({
    username: user?.username || '',
    password: '',
    display_name: user?.display_name || '',
    role: user?.role || 'ADHERENT',
    linked_code_union: user?.linked_code_union || '',
    linked_groupe: user?.linked_groupe || '',
    avatar_url: user?.avatar_url || ''
  })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await uploadAvatar(file)
      setFormData({ ...formData, avatar_url: result.url })
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'upload')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const dataToSend = { ...formData }
      if (user && !formData.password) {
        delete dataToSend.password
      }
      await onSubmit(dataToSend)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold text-white mb-4">
        {user ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
      </h2>

      {error && (
        <div className="mb-4 p-3 glass-card-dark border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Photo de profil */}
        <div className="flex items-center gap-4 p-4 glass-card-dark rounded-xl">
          <div className="relative">
            {formData.avatar_url ? (
              <div className="w-20 h-20 aspect-square">
                <img
                  src={getImageUrl(formData.avatar_url)}
                  alt="Avatar"
                  className="w-full h-full rounded-full object-cover ring-4 ring-white/20 shadow-lg"
                />
              </div>
            ) : (
              <div className="w-20 h-20 aspect-square rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-white/20 shadow-lg">
                {(formData.display_name || formData.username || '?')[0].toUpperCase()}
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-glass-secondary mb-2">Photo de profil</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
              id="avatar-upload"
            />
            <div className="flex gap-2">
              <label
                htmlFor="avatar-upload"
                className="glass-btn-secondary cursor-pointer text-sm flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {formData.avatar_url ? 'Changer' : 'Ajouter'}
              </label>
              {formData.avatar_url && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, avatar_url: '' })}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Nom d'utilisateur</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="glass-input"
              required
              disabled={!!user}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">
              Mot de passe {user && '(vide = inchangé)'}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="glass-input"
              required={!user}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Nom affiché</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              className="glass-input"
              placeholder="Ex: Jean Dupont"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-glass-secondary mb-2">Rôle & accès</label>
            <div className="space-y-2">
              {[
                { value: 'ADMIN',      emoji: '👑', label: 'Administrateur', desc: 'Accès complet à toute l\'application' },
                { value: 'COMMERCIAL', emoji: '📊', label: 'Commercial',      desc: 'Nicolas + Nathalie uniquement' },
                { value: 'ADHERENT',   emoji: '🏢', label: 'Adhérent',        desc: 'Espace client uniquement (bientôt)' },
              ].map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                    formData.role === r.value
                      ? 'border-blue-500/60 bg-blue-500/15'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={formData.role === r.value}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="hidden"
                  />
                  <span className="text-xl">{r.emoji}</span>
                  <div className="flex-1">
                    <div className="text-white font-semibold text-sm">{r.label}</div>
                    <div className="text-white/40 text-xs">{r.desc}</div>
                  </div>
                  {formData.role === r.value && (
                    <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        {formData.role === 'ADHERENT' && (
          <div className="grid grid-cols-2 gap-4 p-4 glass-card-dark rounded-xl">
            <div>
              <label className="block text-sm font-medium text-glass-secondary mb-2">
                Lié au client (code_union)
              </label>
              <input
                type="text"
                value={formData.linked_code_union}
                onChange={(e) => setFormData({ ...formData, linked_code_union: e.target.value, linked_groupe: '' })}
                className="glass-input"
                placeholder="Ex: M0022"
                list="clients-list"
              />
              <datalist id="clients-list">
                {availableEntities.clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-glass-secondary mb-2">
                Lié au groupe
              </label>
              <input
                type="text"
                value={formData.linked_groupe}
                onChange={(e) => setFormData({ ...formData, linked_groupe: e.target.value, linked_code_union: '' })}
                className="glass-input"
                placeholder="Ex: GROUPE ABC"
                list="groups-list"
              />
              <datalist id="groups-list">
                {availableEntities.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </datalist>
            </div>
            <p className="col-span-2 text-xs text-glass-muted">
              Un adhérent ne verra que les données de son client ou groupe lié.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onCancel}
            className="glass-btn-secondary"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="glass-btn-primary flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Enregistrement...' : (user ? 'Mettre à jour' : 'Créer')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default UsersPage
